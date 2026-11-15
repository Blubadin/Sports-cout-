import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { ScoutProject, MatchInfo, Team, AppSettings, SportType, EventRow, TelestrationShape } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useScoutContext } from './ScoutContext';
import { DEFAULT_TEAMS } from '../data';
import { getValidSportType, sanitizeEvents } from '../utils/scoutData';
import { indexedDbStorageAdapter } from '../utils/storageAdapter';
import { createProjectRepository, ProjectRepositoryConflictError } from '../utils/projectRepository';
import {
  createProjectPersistenceSession,
  type ProjectPersistenceSession,
} from '../utils/projectPersistenceSession';
import { createProjectSaveQueue } from '../utils/projectSaveQueue';
import { getImportPayloadCounts, MAX_IMPORT_EVENTS, MAX_IMPORT_PROJECTS } from '../utils/importSafety';
import { sanitizeIdentifier, sanitizeUserText } from '../utils/security';
import { validateCourtCalibration, type CourtCalibration } from '../utils/areaGeometry';

export type ProjectSaveStatus = 'loading' | 'pending' | 'saving' | 'saved' | 'failed';

type LiveSnapshotToken = {
  projectId: string;
  generation: number;
};

const projectRepository = createProjectRepository(indexedDbStorageAdapter);

const PROJECT_CONFLICT_MESSAGE = {
  th: 'แท็บอื่นมีข้อมูลที่ใหม่กว่า โปรดสำรองข้อมูลในแท็บนี้ แล้วโหลดหน้าใหม่เพื่อดำเนินการต่อ',
  en: 'Another tab has newer data. Back up this tab, then reload to continue.',
} as const;

function sanitizeProjectCourtCalibration<T extends { videoMeta?: ScoutProject['videoMeta'] }>(project: T): T {
  const videoMeta = project.videoMeta;
  if (!videoMeta || !Object.prototype.hasOwnProperty.call(videoMeta, 'courtCalibration')) {
    return project;
  }
  if (validateCourtCalibration(videoMeta.courtCalibration).valid) return project;

  const safeVideoMeta = { ...videoMeta };
  delete safeVideoMeta.courtCalibration;
  return { ...project, videoMeta: safeVideoMeta };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * One-time read of legacy `scout_projects` from localStorage for initial IndexedDB migration only.
 * IndexedDB (`projectRepository`) is the single source of truth for match/project state.
 */
function readLegacyProjects(): ScoutProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem('scout_projects') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface WorkspaceContextType {
  projects: ScoutProject[];
  activeProjectId: string | null;
  saveStatus: ProjectSaveStatus;
  lastSavedAt: string | null;
  repositoryReady: boolean;
  createNewProject: (
    title: string, 
    sportType: SportType, 
    initMatchInfo?: Partial<MatchInfo>, 
    initTeams?: Team[],
    settingsSnapshot?: Partial<AppSettings>,
    videoMeta?: ScoutProject['videoMeta']
  ) => void;
  openProject: (projectId: string) => void;
  saveCurrentProject: () => Promise<void>;
  flushPendingSaves: () => Promise<void>;
  deleteProject: (projectId: string) => void;
  duplicateProject: (projectId: string) => void;
  renameProject: (projectId: string, newTitle: string) => void;
  importProject: (project: unknown) => Promise<boolean>;
  updateProjectLastVideoTime: (time: number) => void;
  updateProjectVideoCalibration: (calibration: CourtCalibration) => void;
  updateProjectAnnotations: (annotations: TelestrationShape[]) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = React.useState<ScoutProject[]>(readLegacyProjects);
  const [activeProjectId, setActiveProjectId] = useLocalStorage<string | null>('active_scout_project_id', null);
  const [saveStatus, setSaveStatus] = React.useState<ProjectSaveStatus>('loading');
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [repositoryReady, setRepositoryReady] = React.useState(false);
  const isProjectLoading = React.useRef(false);
  const projectsRef = React.useRef(projects);
  const activeProjectIdRef = React.useRef(activeProjectId);
  const repositoryReadyRef = React.useRef(repositoryReady);
  const saveGenerationRef = React.useRef(0);
  const explicitlyPersistedProjectsRef = React.useRef<ScoutProject[] | null>(null);
  const persistenceSessionRef = React.useRef<ProjectPersistenceSession | null>(null);
  const projectOperationQueueRef = React.useRef(createProjectSaveQueue());
  const projectAutosaveTimeoutRef = React.useRef<number | null>(null);
  const projectSnapshotTimeoutRef = React.useRef<number | null>(null);
  const acceptingProjectOperationsRef = React.useRef(true);
  const liveSnapshotGenerationRef = React.useRef(0);
  const pendingLiveSnapshotRef = React.useRef<LiveSnapshotToken | null>(null);
  const durableLiveSnapshotGenerationRef = React.useRef(0);
  const liveSnapshotCandidateTokensRef = React.useRef(new WeakMap<ScoutProject[], LiveSnapshotToken>());

  activeProjectIdRef.current = activeProjectId;
  repositoryReadyRef.current = repositoryReady;

  const clearPendingProjectAutosave = useCallback(() => {
    if (projectAutosaveTimeoutRef.current === null) return;
    window.clearTimeout(projectAutosaveTimeoutRef.current);
    projectAutosaveTimeoutRef.current = null;
  }, []);

  const clearPendingProjectSnapshot = useCallback(() => {
    if (projectSnapshotTimeoutRef.current === null) return;
    window.clearTimeout(projectSnapshotTimeoutRef.current);
    projectSnapshotTimeoutRef.current = null;
  }, []);

  const clearPendingProjectTimers = useCallback(() => {
    clearPendingProjectAutosave();
    clearPendingProjectSnapshot();
  }, [clearPendingProjectAutosave, clearPendingProjectSnapshot]);
  
  const { 
    events, setEvents, clearEventHistory, 
    matchInfo, setMatchInfo, 
    teams, setTeams,
    clearCurrentEvent,
    settings, setSettings,
    videoSourceType, setVideoSourceType,
    youtubeUrl, setYoutubeUrl,
    youtubeVideoId, setYoutubeVideoId,
    localFileName, setLocalFileName,
    showToast
  } = useScoutContext();

  const conflictUiRef = React.useRef({ language: settings.uiLanguage, showToast });
  conflictUiRef.current = { language: settings.uiLanguage, showToast };

  const loadProjectState = useCallback((proj: Partial<ScoutProject> & { matchInfo: MatchInfo, teams: Team[], events: EventRow[], id?: string }) => {
    isProjectLoading.current = true;
    if (proj.id) {
      activeProjectIdRef.current = proj.id;
      setActiveProjectId(proj.id);
    }
    
    setMatchInfo(proj.matchInfo);
    setTeams(proj.teams);
    setEvents(proj.events || []); 
    clearEventHistory();
    clearCurrentEvent();
    
    if (proj.settingsSnapshot) {
      setSettings(prev => ({ ...prev, ...proj.settingsSnapshot }));
    }

    if (proj.videoMeta) {
      setVideoSourceType(proj.videoMeta.sourceType);
      if (proj.videoMeta.sourceType === 'youtube') {
        setYoutubeUrl(proj.videoMeta.youtubeUrl || '');
        setYoutubeVideoId(proj.videoMeta.youtubeVideoId || null);
      } else {
        setLocalFileName(proj.videoMeta.localFileName || null);
        setYoutubeUrl('');
        setYoutubeVideoId(null);
      }
    } else {
      setVideoSourceType('none');
      setLocalFileName(null);
      setYoutubeUrl('');
      setYoutubeVideoId(null);
    }
  }, [
    setActiveProjectId, setMatchInfo, setTeams, setEvents, 
    clearEventHistory, clearCurrentEvent, setSettings, 
    setVideoSourceType, setYoutubeUrl, setYoutubeVideoId, setLocalFileName
  ]);
  const loadProjectStateRef = React.useRef(loadProjectState);
  loadProjectStateRef.current = loadProjectState;
  const latestScoutStateRef = React.useRef({ matchInfo, settings, teams });
  latestScoutStateRef.current = { matchInfo, settings, teams };
  const mountRecoveryRef = React.useRef({ events, matchInfo, teams, activeProjectId, setActiveProjectId });
  mountRecoveryRef.current = { events, matchInfo, teams, activeProjectId, setActiveProjectId };

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const associateLiveSnapshotCandidate = useCallback((
    candidate: ScoutProject[],
    token: LiveSnapshotToken | null | undefined,
  ) => {
    if (token) liveSnapshotCandidateTokensRef.current.set(candidate, token);
    return candidate;
  }, []);

  const markLiveSnapshotCandidateDurable = useCallback((candidate: ScoutProject[]) => {
    const token = liveSnapshotCandidateTokensRef.current.get(candidate);
    if (!token) return;
    durableLiveSnapshotGenerationRef.current = Math.max(
      durableLiveSnapshotGenerationRef.current,
      token.generation,
    );
    const pending = pendingLiveSnapshotRef.current;
    if (
      pending
      && pending.projectId === token.projectId
      && pending.generation <= token.generation
    ) {
      pendingLiveSnapshotRef.current = null;
    }
  }, []);

  const persistProjects = useCallback(async (nextProjects: ScoutProject[]) => {
    const generation = ++saveGenerationRef.current;
    const session = persistenceSessionRef.current;
    if (acceptingProjectOperationsRef.current) setSaveStatus('saving');
    try {
      if (!session) throw new Error('Project persistence session is not ready');
      await session.save(nextProjects);
      markLiveSnapshotCandidateDurable(nextProjects);
      if (generation === saveGenerationRef.current && acceptingProjectOperationsRef.current) {
        setSaveStatus('saved');
        setLastSavedAt(new Date().toISOString());
      }
    } catch (error) {
      console.error('Failed to save projects to IndexedDB:', error);
      if (generation === saveGenerationRef.current && acceptingProjectOperationsRef.current) {
        setSaveStatus('failed');
      }
      throw error;
    }
  }, [markLiveSnapshotCandidateDurable]);

  // IndexedDB is the single source of truth for match/project state; legacy localStorage is only read once at init.
  useEffect(() => {
    let cancelled = false;
    acceptingProjectOperationsRef.current = true;
    const operationQueue = projectOperationQueueRef.current;
    const session = createProjectPersistenceSession({
      repository: projectRepository,
      onConflict: () => {
        if (!acceptingProjectOperationsRef.current) return;
        setSaveStatus('failed');
        const { language, showToast: showConflictToast } = conflictUiRef.current;
        showConflictToast(PROJECT_CONFLICT_MESSAGE[language === 'th' ? 'th' : 'en']);
      },
    });
    persistenceSessionRef.current = session;
    const initializeRepository = async () => {
      try {
        let { projects: initializedProjects } = await session.initializeWithRevision(projectsRef.current);
        initializedProjects = initializedProjects
          .filter(project => project && project.id && project.title)
          .map(project => sanitizeProjectCourtCalibration({
            ...project,
            sportType: getValidSportType(project.sportType),
            events: sanitizeEvents(project.events, getValidSportType(project.sportType)),
          }));

        const recovery = mountRecoveryRef.current;
        if (initializedProjects.length === 0 && Array.isArray(recovery.events) && recovery.events.length > 0) {
          const recoveredId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
          const recoveredProject: ScoutProject = {
            id: recoveredId,
            title: 'Recovered Scout',
            sportType: recovery.matchInfo.sportType,
            matchInfo: recovery.matchInfo,
            teams: recovery.teams,
            events: sanitizeEvents(recovery.events, recovery.matchInfo.sportType),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          initializedProjects = [recoveredProject];
          await session.save(initializedProjects);
          if (!recovery.activeProjectId) recovery.setActiveProjectId(recoveredId);
        }

        if (cancelled) return;
        projectsRef.current = initializedProjects;
        setProjects(initializedProjects);
        const projectToOpen = initializedProjects.find(project => project.id === (activeProjectIdRef.current || recovery.activeProjectId))
          || initializedProjects[0];
        if (projectToOpen) loadProjectStateRef.current(projectToOpen);
        repositoryReadyRef.current = true;
        setRepositoryReady(true);
        setSaveStatus('saved');
        setLastSavedAt(new Date().toISOString());
      } catch (error) {
        console.error('Failed to initialize project repository:', error);
        if (cancelled) return;
        repositoryReadyRef.current = true;
        setRepositoryReady(true);
        setSaveStatus('failed');
      }
    };

    void initializeRepository();
    return () => {
      cancelled = true;
      acceptingProjectOperationsRef.current = false;
      const cleanupActiveProjectId = activeProjectIdRef.current;
      const cleanupPendingLiveSnapshot = pendingLiveSnapshotRef.current;
      const cleanupSnapshotCurrentProject = snapshotCurrentProjectRef.current;
      clearPendingProjectTimers();
      void (async () => {
        try {
          await operationQueue.drain().catch(error => {
            console.error('Failed to drain project operation queue during cleanup:', error);
          });
          const canApplyCleanupSnapshot = cleanupPendingLiveSnapshot
            && cleanupPendingLiveSnapshot.generation > durableLiveSnapshotGenerationRef.current
            && cleanupPendingLiveSnapshot.projectId === cleanupActiveProjectId
            && activeProjectIdRef.current === cleanupActiveProjectId
            && !isProjectLoading.current;
          const finalProjects = canApplyCleanupSnapshot
            ? associateLiveSnapshotCandidate(
              projectsRef.current.map(project =>
                project.id === cleanupActiveProjectId
                  ? cleanupSnapshotCurrentProject(project)
                  : project,
              ),
              cleanupPendingLiveSnapshot,
            )
            : projectsRef.current;
          if (canApplyCleanupSnapshot && repositoryReadyRef.current && session) {
            await persistProjects(finalProjects);
          }
        } catch (error) {
          console.error('Failed to save final projects during cleanup:', error);
        } finally {
          await session.drain().catch(error => {
            console.error('Failed to drain project persistence during cleanup:', error);
          });
          session.close();
          repositoryReadyRef.current = false;
          if (persistenceSessionRef.current === session) {
            persistenceSessionRef.current = null;
          }
        }
      })();
    };
  }, [associateLiveSnapshotCandidate, clearPendingProjectTimers, persistProjects]);

  useEffect(() => {
    if (!repositoryReady) return;
    if (explicitlyPersistedProjectsRef.current === projects) {
      explicitlyPersistedProjectsRef.current = null;
      return;
    }
    explicitlyPersistedProjectsRef.current = null;
    clearPendingProjectAutosave();
    const timeoutId = window.setTimeout(() => {
      if (projectAutosaveTimeoutRef.current !== timeoutId) return;
      projectAutosaveTimeoutRef.current = null;
      if (!acceptingProjectOperationsRef.current) return;
      void projectOperationQueueRef.current
        .enqueue(() => persistProjects(projectsRef.current))
        .catch(() => undefined);
    }, 250);
    projectAutosaveTimeoutRef.current = timeoutId;
    return () => {
      if (projectAutosaveTimeoutRef.current === timeoutId) {
        clearPendingProjectAutosave();
      }
    };
  }, [clearPendingProjectAutosave, persistProjects, projects, repositoryReady]);

  const snapshotCurrentProject = useCallback((project: ScoutProject): ScoutProject => ({
    ...project,
    sportType: matchInfo.sportType,
    events,
    matchInfo,
    teams,
    settingsSnapshot: settings,
    videoMeta: {
      ...(project.videoMeta || {}),
      sourceType: videoSourceType,
      youtubeUrl,
      youtubeVideoId: youtubeVideoId || undefined,
      localFileName: localFileName || undefined,
    },
    updatedAt: new Date().toISOString(),
  }), [events, localFileName, matchInfo, settings, teams, videoSourceType, youtubeUrl, youtubeVideoId]);

  const snapshotCurrentProjectRef = React.useRef(snapshotCurrentProject);
  snapshotCurrentProjectRef.current = snapshotCurrentProject;

  const prepareProjectsForPersistence = useCallback((current: ScoutProject[]) => {
    const snapshotProjectId = activeProjectIdRef.current;
    if (!snapshotProjectId || isProjectLoading.current) return current;
    const pendingLiveSnapshot = pendingLiveSnapshotRef.current?.projectId === snapshotProjectId
      ? pendingLiveSnapshotRef.current
      : null;
    return associateLiveSnapshotCandidate(current.map(project =>
      project.id === snapshotProjectId
        ? snapshotCurrentProjectRef.current(project)
        : project,
    ), pendingLiveSnapshot);
  }, [associateLiveSnapshotCandidate]);

  const scheduleCurrentProjectSnapshot = useCallback((markPending = true) => {
    if (
      isProjectLoading.current
      || !acceptingProjectOperationsRef.current
      || !repositoryReadyRef.current
      || !activeProjectIdRef.current
    ) {
      return;
    }
    clearPendingProjectSnapshot();
    if (markPending) {
      liveSnapshotGenerationRef.current += 1;
      pendingLiveSnapshotRef.current = {
        projectId: activeProjectIdRef.current,
        generation: liveSnapshotGenerationRef.current,
      };
      setSaveStatus('pending');
    }
    const timeoutId = window.setTimeout(() => {
      if (projectSnapshotTimeoutRef.current !== timeoutId) return;
      projectSnapshotTimeoutRef.current = null;
      if (isProjectLoading.current || !activeProjectIdRef.current) return;
      setProjects(prev => {
        const prevArr = Array.isArray(prev) ? prev : [];
        return prepareProjectsForPersistence(prevArr);
      });
    }, 800);
    projectSnapshotTimeoutRef.current = timeoutId;
  }, [clearPendingProjectSnapshot, prepareProjectsForPersistence]);

  const persistTransitionCandidate = useCallback(async (
    initialCandidate: ScoutProject[],
    ownerProjectId: string | null,
    onFailure?: (durableCandidate: ScoutProject[] | null) => void,
  ) => {
    let candidate = initialCandidate;
    let durableCandidate: ScoutProject[] | null = null;
    try {
      await persistProjects(candidate);
      durableCandidate = candidate;

      while (
        ownerProjectId
        && acceptingProjectOperationsRef.current
        && activeProjectIdRef.current === ownerProjectId
        && !isProjectLoading.current
      ) {
        const pending = pendingLiveSnapshotRef.current;
        if (
          !pending
          || pending.projectId !== ownerProjectId
          || pending.generation <= durableLiveSnapshotGenerationRef.current
        ) {
          break;
        }

        // Claim this generation from the debounce timer. A live edit accepted
        // during the awaited save schedules a newer generation, which the next
        // loop iteration will materialize before the transition can commit.
        clearPendingProjectSnapshot();
        candidate = associateLiveSnapshotCandidate(candidate.map(project =>
          project.id === ownerProjectId
            ? snapshotCurrentProjectRef.current(project)
            : project,
        ), pending);
        await persistProjects(candidate);
        durableCandidate = candidate;
      }

      return candidate;
    } catch (error) {
      const pending = pendingLiveSnapshotRef.current;
      if (
        acceptingProjectOperationsRef.current
        && ownerProjectId
        && activeProjectIdRef.current === ownerProjectId
        && pending?.projectId === ownerProjectId
        && pending.generation > durableLiveSnapshotGenerationRef.current
      ) {
        scheduleCurrentProjectSnapshot(false);
      }
      onFailure?.(durableCandidate);
      throw error;
    }
  }, [
    associateLiveSnapshotCandidate,
    clearPendingProjectSnapshot,
    persistProjects,
    scheduleCurrentProjectSnapshot,
  ]);

  // Debounced project snapshot; repository persistence is handled separately above.
  useEffect(() => {
    if (isProjectLoading.current || !repositoryReady || !activeProjectId) return;
    scheduleCurrentProjectSnapshot();
    return clearPendingProjectSnapshot;
  }, [
    activeProjectId,
    clearPendingProjectSnapshot,
    repositoryReady,
    scheduleCurrentProjectSnapshot,
    snapshotCurrentProject,
  ]);

  const flushPendingSavesInQueue = useCallback(async () => {
    if (!repositoryReadyRef.current) return;
    clearPendingProjectTimers();
    const nextProjects = prepareProjectsForPersistence(projectsRef.current);
    await persistProjects(nextProjects);
    explicitlyPersistedProjectsRef.current = nextProjects;
    projectsRef.current = nextProjects;
    if (!acceptingProjectOperationsRef.current) return;
    setProjects(nextProjects);
  }, [clearPendingProjectTimers, persistProjects, prepareProjectsForPersistence]);

  const enqueueProjectMutation = useCallback((
    mutate: (current: ScoutProject[]) => ScoutProject[],
    options: {
      afterCommit?: (next: ScoutProject[]) => void;
    } = {},
  ) => projectOperationQueueRef.current.enqueue(async () => {
    if (!repositoryReadyRef.current) return;
    const preparedProjects = prepareProjectsForPersistence(projectsRef.current);
    const nextProjects = mutate(preparedProjects);
    associateLiveSnapshotCandidate(
      nextProjects,
      liveSnapshotCandidateTokensRef.current.get(preparedProjects),
    );
    await persistProjects(nextProjects);
    explicitlyPersistedProjectsRef.current = nextProjects;
    projectsRef.current = nextProjects;
    if (!acceptingProjectOperationsRef.current) return nextProjects;
    setProjects(nextProjects);
    options.afterCommit?.(nextProjects);
    return nextProjects;
  }), [
    associateLiveSnapshotCandidate,
    persistProjects,
    prepareProjectsForPersistence,
  ]);

  const flushPendingSaves = useCallback(async () => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
    return projectOperationQueueRef.current.enqueue(flushPendingSavesInQueue);
  }, [flushPendingSavesInQueue]);

  useEffect(() => {
    const flush = () => {
      // pagehide/visibilitychange cannot always await IndexedDB, but starting the
      // write here closes the debounce window and preserves the latest snapshot.
      void flushPendingSaves().catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushPendingSaves]);

  const saveCurrentProject = async () => {
    if (!activeProjectId) {
      createNewProject(`Match ${new Date().toLocaleDateString()}`, matchInfo.sportType);
      return;
    }

    try {
      await flushPendingSaves();
      showToast(settings.uiLanguage === 'th' ? 'บันทึกโปรเจกต์แล้ว' : 'Project saved');
    } catch (error) {
      if (error instanceof ProjectRepositoryConflictError) return;
      showToast(settings.uiLanguage === 'th' ? 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง' : 'Save failed. Please try again.');
    }
  };

  const createNewProject = (
    title: string, 
    sportType: SportType, 
    customMatchInfo?: Partial<MatchInfo>, 
    customTeams?: Team[],
    settingsSnapshot?: Partial<AppSettings>,
    videoMeta?: ScoutProject['videoMeta']
  ) => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) {
      return false;
    }
    clearPendingProjectTimers();
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const newProject: ScoutProject = {
      id: newId,
      title,
      sportType,
      matchInfo: {
        scouterName: customMatchInfo?.scouterName ?? matchInfo.scouterName ?? '',
        nickname: customMatchInfo?.nickname ?? matchInfo.nickname ?? '',
        matchName: customMatchInfo?.matchName ?? '',
        matchType: customMatchInfo?.matchType ?? 'Team',
        setOrGame: customMatchInfo?.setOrGame ?? '1',
        currentPoint: customMatchInfo?.currentPoint ?? 1,
        sportType,
        courtConfig: customMatchInfo?.courtConfig || 'standard',
        gameFormat: customMatchInfo?.gameFormat || 'standard',
      },
      teams: customTeams || DEFAULT_TEAMS,
      events: [],
      settingsSnapshot: settingsSnapshot ? { ...settings, ...settingsSnapshot } : settings,
      videoMeta: videoMeta || {
        sourceType: 'none',
        youtubeUrl: '',
        youtubeVideoId: undefined,
        localFileName: undefined,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    void projectOperationQueueRef.current.enqueue(async () => {
      if (!repositoryReadyRef.current) return;
      const transitionOwnerProjectId = activeProjectIdRef.current;
      let durableOwnerProjects = projectsRef.current;

      if (transitionOwnerProjectId) {
        durableOwnerProjects = prepareProjectsForPersistence(durableOwnerProjects);
        durableOwnerProjects = await persistTransitionCandidate(
          durableOwnerProjects,
          transitionOwnerProjectId,
        );
        if (!acceptingProjectOperationsRef.current) return durableOwnerProjects;
      }

      const nextProjects = [...durableOwnerProjects, newProject];
      const committedProjects = await persistTransitionCandidate(
        nextProjects,
        transitionOwnerProjectId,
        durableCandidate => {
          if (
            !acceptingProjectOperationsRef.current
            || !durableCandidate?.some(project => project.id === newProject.id)
          ) {
            return;
          }
          explicitlyPersistedProjectsRef.current = durableCandidate;
          projectsRef.current = durableCandidate;
          setProjects(durableCandidate);
        },
      );
      explicitlyPersistedProjectsRef.current = committedProjects;
      projectsRef.current = committedProjects;
      if (!acceptingProjectOperationsRef.current) return committedProjects;
      setProjects(committedProjects);
      isProjectLoading.current = true;
      loadProjectStateRef.current(newProject);
      return committedProjects;
    }).catch(error => {
      if (error instanceof ProjectRepositoryConflictError) return;
      console.error('Failed to create new project:', error);
    });
  };

  const openProject = (projectId: string) => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
    clearPendingProjectTimers();
    void projectOperationQueueRef.current.enqueue(async () => {
      if (!repositoryReadyRef.current) return;
      const transitionOwnerProjectId = activeProjectIdRef.current;
      let nextProjects = projectsRef.current;
      if (transitionOwnerProjectId) {
        nextProjects = prepareProjectsForPersistence(nextProjects);
        try {
          nextProjects = await persistTransitionCandidate(
            nextProjects,
            transitionOwnerProjectId,
          );
        } catch (error) {
          if (!acceptingProjectOperationsRef.current) return;
          if (error instanceof ProjectRepositoryConflictError) return;
          showToast(settings.uiLanguage === 'th'
            ? 'บันทึกโปรเจกต์ปัจจุบันไม่สำเร็จ จึงยังไม่สลับโปรเจกต์'
            : 'Could not save the current project, so the project switch was cancelled.');
          return;
        }
        explicitlyPersistedProjectsRef.current = nextProjects;
        projectsRef.current = nextProjects;
        if (!acceptingProjectOperationsRef.current) return;
        setProjects(nextProjects);
      }

      const project = nextProjects.find(candidate => candidate.id === projectId);
      if (project) loadProjectStateRef.current(project);
    }).catch(error => {
      console.error('Failed to open project:', error);
    });
  };

  const deleteProject = async (projectId: string) => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
    clearPendingProjectTimers();
    return enqueueProjectMutation(current => current.filter(project => project.id !== projectId), {
      afterCommit: (remaining) => {
        if (activeProjectIdRef.current !== projectId) return;
        isProjectLoading.current = true;
        if (remaining.length > 0) {
          loadProjectStateRef.current(remaining[0]);
          return;
        }
        loadProjectStateRef.current({
          id: undefined,
          matchInfo: {
            scouterName: matchInfo.scouterName, nickname: matchInfo.nickname, matchName: '', matchType: 'Team', setOrGame: '1', currentPoint: 1, sportType: 'volleyball',
          },
          teams: DEFAULT_TEAMS,
          events: [],
          videoMeta: {
            sourceType: 'local',
            localFileName: null,
            youtubeUrl: '',
            youtubeVideoId: undefined,
          },
        });
        setActiveProjectId(null);
      },
    }).catch(error => {
      if (error instanceof ProjectRepositoryConflictError) return;
      showToast(settings.uiLanguage === 'th' ? 'ลบโปรเจกต์ไม่สำเร็จ ข้อมูลเดิมยังอยู่' : 'Delete failed. Your data was kept.');
    });
  };

  const duplicateProject = (projectId: string) => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
    clearPendingProjectTimers();
    void enqueueProjectMutation(current => {
      const project = current.find(candidate => candidate.id === projectId);
      if (!project) return current;
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const copy: ScoutProject = {
        ...structuredClone(project),
        id: newId,
        title: `${project.title} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return [...current, copy];
    }).catch(error => {
      if (error instanceof ProjectRepositoryConflictError) return;
      console.error('Failed to duplicate project:', error);
    });
  };

  const renameProject = (projectId: string, newTitle: string) => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
    clearPendingProjectTimers();
    void enqueueProjectMutation(current => current.map(project =>
      project.id === projectId
        ? { ...project, title: newTitle, updatedAt: new Date().toISOString() }
        : project,
    )).catch(error => {
      if (error instanceof ProjectRepositoryConflictError) return;
      console.error('Failed to rename project:', error);
    });
  };

  const updateProjectLastVideoTime = (videoTime: number) => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
    clearPendingProjectTimers();
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    void enqueueProjectMutation(current => current.map(project =>
      project.id === projectId
        ? { ...project, videoMeta: { ...(project.videoMeta || { sourceType: videoSourceType }), lastVideoTime: videoTime }, updatedAt: new Date().toISOString() }
        : project,
    )).catch(error => {
      if (error instanceof ProjectRepositoryConflictError) return;
      console.error('Failed to update project video time:', error);
    });
  };

  const updateProjectVideoCalibration = (calibration: CourtCalibration) => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    if (!validateCourtCalibration(calibration).valid) {
      showToast(settings.uiLanguage === 'th'
        ? 'จุดปรับมุมสนามไม่ถูกต้อง โปรดเลือกมุมทั้งสี่ใหม่'
        : 'Court calibration is invalid. Select the four corners again.');
      return;
    }
    clearPendingProjectTimers();
    void enqueueProjectMutation(current => current.map(project =>
      project.id === projectId
        ? { ...project, videoMeta: { ...(project.videoMeta || { sourceType: videoSourceType }), courtCalibration: calibration }, updatedAt: new Date().toISOString() }
        : project,
    )).catch(error => {
      if (error instanceof ProjectRepositoryConflictError) return;
      console.error('Failed to update project calibration:', error);
    });
  };

  const updateProjectAnnotations = (annotations: TelestrationShape[]) => {
    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    clearPendingProjectTimers();
    void enqueueProjectMutation(current => current.map(project =>
      project.id === projectId
        ? { ...project, videoMeta: { ...(project.videoMeta || { sourceType: videoSourceType }), annotations }, updatedAt: new Date().toISOString() }
        : project,
    )).catch(error => {
      if (error instanceof ProjectRepositoryConflictError) return;
      console.error('Failed to update project annotations:', error);
    });
  };

  const importProject = async (rawProject: unknown): Promise<boolean> => {
    const reportImportFailure = () => {
      showToast(settings.uiLanguage === 'th'
        ? 'นำเข้าโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง'
        : 'Import failed. Please try again.');
    };

    if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) {
      reportImportFailure();
      return false;
    }
    clearPendingProjectTimers();
    const importCounts = getImportPayloadCounts(rawProject);
    if (importCounts.projects > MAX_IMPORT_PROJECTS || importCounts.events > MAX_IMPORT_EVENTS) {
      showToast(settings.uiLanguage === 'th'
        ? `ข้อมูลนำเข้าใหญ่เกินขีดจำกัด (${MAX_IMPORT_PROJECTS} โปรเจกต์ / ${MAX_IMPORT_EVENTS.toLocaleString()} เหตุการณ์)`
        : `Import exceeds the limit of ${MAX_IMPORT_PROJECTS} projects or ${MAX_IMPORT_EVENTS.toLocaleString()} events`);
      return false;
    }

    let projectCandidate: Record<string, unknown> | null = null;
    if (Array.isArray(rawProject)) {
      const firstEvent = isRecord(rawProject[0]) ? rawProject[0] : undefined;
      const inferredSport = typeof firstEvent?.sportType === 'string'
        ? firstEvent.sportType
        : (matchInfo.sportType || 'volleyball');
      projectCandidate = {
        title: 'Imported Events',
        sportType: inferredSport,
        matchInfo: { ...matchInfo, sportType: getValidSportType(inferredSport) },
        teams,
        events: rawProject,
      };
    } else if (isRecord(rawProject)) {
      if (rawProject.type === 'events' && Array.isArray(rawProject.events)) {
        const firstEvent = isRecord(rawProject.events[0]) ? rawProject.events[0] : undefined;
        const inferredSport = typeof firstEvent?.sportType === 'string'
          ? firstEvent.sportType
          : (matchInfo.sportType || 'volleyball');
        projectCandidate = {
          title: typeof rawProject.title === 'string' ? rawProject.title : `Imported Events ${new Date().toLocaleDateString()}`,
          sportType: inferredSport,
          matchInfo: { ...matchInfo, sportType: getValidSportType(inferredSport) },
          teams,
          events: rawProject.events,
        };
      } else if (rawProject.type === 'projects' && Array.isArray(rawProject.projects)) {
        const results = await Promise.all(rawProject.projects.map((p: unknown) => importProject(p)));
        return results.some(Boolean);
      } else if (isRecord(rawProject.indexedDbProjects) && Array.isArray(rawProject.indexedDbProjects.projects)) {
        const results = await Promise.all(rawProject.indexedDbProjects.projects.map((p: unknown) => importProject(p)));
        return results.some(Boolean);
      } else if (isRecord(rawProject.localStorage) && typeof rawProject.localStorage.scout_projects === 'string') {
        try {
          const restoredProjects = JSON.parse(rawProject.localStorage.scout_projects) as unknown;
          if (Array.isArray(restoredProjects)) {
            return await importProject({ type: 'projects', projects: restoredProjects });
          }
        } catch {
          reportImportFailure();
          return false;
        }
      } else {
        projectCandidate = { ...rawProject };
      }
    }

    if (!projectCandidate || !Array.isArray(projectCandidate.events)) {
      reportImportFailure();
      return false;
    }

    const sportType = getValidSportType(projectCandidate.sportType);
    const title = sanitizeUserText(projectCandidate.title, 160) || 'Imported Project';

    // Sanitize MatchInfo
    const rawMatchInfo = isRecord(projectCandidate.matchInfo) ? projectCandidate.matchInfo : null;
    const normalizedMatchInfo: MatchInfo = rawMatchInfo
      ? {
          scouterName: sanitizeUserText(rawMatchInfo.scouterName, 120),
          nickname: sanitizeUserText(rawMatchInfo.nickname, 80),
          matchName: sanitizeUserText(rawMatchInfo.matchName, 160),
          matchType: rawMatchInfo.matchType === 'Single' ? 'Single' : 'Team',
          setOrGame: sanitizeUserText(rawMatchInfo.setOrGame, 20) || '1',
          currentPoint: typeof rawMatchInfo.currentPoint === 'number' && Number.isFinite(rawMatchInfo.currentPoint)
            ? Math.max(0, Math.min(100_000, Math.round(rawMatchInfo.currentPoint)))
            : 1,
          sportType,
          courtConfig: sanitizeUserText(rawMatchInfo.courtConfig, 80) || 'standard',
          gameFormat: sanitizeUserText(rawMatchInfo.gameFormat, 80) || 'standard',
        }
      : {
          scouterName: '',
          nickname: '',
          matchName: '',
          matchType: 'Team',
          setOrGame: '1',
          currentPoint: 1,
          sportType,
        };

    // Sanitize Teams
    const normalizedTeams: Team[] = !Array.isArray(projectCandidate.teams) || projectCandidate.teams.length < 2
      ? DEFAULT_TEAMS
      : projectCandidate.teams.map((rawTeam: unknown, index: number): Team => {
          const t = isRecord(rawTeam) ? rawTeam : {};
          return {
            id: sanitizeIdentifier(t.id) || `t${index + 1}`,
            code: sanitizeIdentifier(t.code, 12).toUpperCase() || `T${index + 1}`,
            name: sanitizeUserText(t.name, 120) || `Team ${index + 1}`,
            thaiName: sanitizeUserText(t.thaiName, 120),
            icon: sanitizeUserText(t.icon, 8),
            teamType: t.teamType === 'country' || t.teamType === 'club' ? t.teamType : 'country',
          };
        });

    const sanitizedEvents = sanitizeEvents(projectCandidate.events, sportType);
    const normalizedProject = sanitizeProjectCourtCalibration({
      ...projectCandidate,
      sportType,
      title,
      matchInfo: normalizedMatchInfo,
      teams: normalizedTeams,
      events: sanitizedEvents,
      videoMeta: isRecord(projectCandidate.videoMeta)
        ? (projectCandidate.videoMeta as ScoutProject['videoMeta'])
        : undefined,
      settingsSnapshot: isRecord(projectCandidate.settingsSnapshot)
        ? (projectCandidate.settingsSnapshot as AppSettings)
        : undefined,
      createdAt: typeof projectCandidate.createdAt === 'string' ? projectCandidate.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      const committed = await enqueueProjectMutation(current => {
        const existingIds = new Set(current.map(candidate => candidate.id));
        const baseId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        let collisionIndex = 0;
        let importedId = baseId;
        while (existingIds.has(importedId)) {
          collisionIndex += 1;
          importedId = `${baseId}-${collisionIndex}`;
        }
        return [...current, { ...normalizedProject, id: importedId } as ScoutProject];
      });
      if (committed) return true;
    } catch (error) {
      if (error instanceof ProjectRepositoryConflictError) return false;
      console.error('Failed to import project:', error);
    }

    reportImportFailure();
    return false;
  };

  // Clear loading flag after state updates have committed
  useEffect(() => {
    if (isProjectLoading.current) {
      isProjectLoading.current = false;
    }
  }, [activeProjectId, events, matchInfo, teams]);

  return (
    <WorkspaceContext.Provider value={{
      projects,
      activeProjectId,
      saveStatus,
      lastSavedAt,
      repositoryReady,
      createNewProject,
      openProject,
      saveCurrentProject,
      flushPendingSaves,
      deleteProject,
      duplicateProject,
      renameProject,
      importProject,
      updateProjectLastVideoTime,
      updateProjectVideoCalibration,
      updateProjectAnnotations
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
