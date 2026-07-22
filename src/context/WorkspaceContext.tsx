import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { ScoutProject, MatchInfo, Team, AppSettings, SportType, EventRow } from '../types';
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
import { getImportPayloadCounts, MAX_IMPORT_EVENTS, MAX_IMPORT_PROJECTS } from '../utils/importSafety';
import { sanitizeIdentifier, sanitizeUserText } from '../utils/security';

export type ProjectSaveStatus = 'loading' | 'pending' | 'saving' | 'saved' | 'failed';

const projectRepository = createProjectRepository(indexedDbStorageAdapter);

const PROJECT_CONFLICT_MESSAGE = {
  th: 'แท็บอื่นมีข้อมูลที่ใหม่กว่า โปรดสำรองข้อมูลในแท็บนี้ แล้วโหลดหน้าใหม่เพื่อดำเนินการต่อ',
  en: 'Another tab has newer data. Back up this tab, then reload to continue.',
} as const;

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
    settingsSnapshot?: AppSettings,
    videoMeta?: any
  ) => void;
  openProject: (projectId: string) => void;
  saveCurrentProject: () => Promise<void>;
  flushPendingSaves: () => Promise<void>;
  deleteProject: (projectId: string) => void;
  duplicateProject: (projectId: string) => void;
  renameProject: (projectId: string, newTitle: string) => void;
  importProject: (project: any) => boolean;
  updateProjectLastVideoTime: (time: number) => void;
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
  const saveGenerationRef = React.useRef(0);
  const explicitlyPersistedProjectsRef = React.useRef<ScoutProject[] | null>(null);
  const persistenceSessionRef = React.useRef<ProjectPersistenceSession | null>(null);
  
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
    if (proj.id) setActiveProjectId(proj.id);
    
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

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const persistProjects = useCallback(async (nextProjects: ScoutProject[]) => {
    const generation = ++saveGenerationRef.current;
    const session = persistenceSessionRef.current;
    setSaveStatus('saving');
    try {
      if (!session) throw new Error('Project persistence session is not ready');
      await session.save(nextProjects);
      if (generation === saveGenerationRef.current) {
        setSaveStatus('saved');
        setLastSavedAt(new Date().toISOString());
      }
    } catch (error) {
      console.error('Failed to save projects to IndexedDB:', error);
      if (generation === saveGenerationRef.current) setSaveStatus('failed');
      throw error;
    }
  }, []);

  // IndexedDB becomes the source of truth. The original localStorage value is kept as a recovery backup.
  useEffect(() => {
    let cancelled = false;
    const session = createProjectPersistenceSession({
      repository: projectRepository,
      onConflict: () => {
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
          .map(project => ({
            ...project,
            sportType: getValidSportType(project.sportType),
            events: sanitizeEvents(project.events, getValidSportType(project.sportType)),
          }));

        if (initializedProjects.length === 0 && Array.isArray(events) && events.length > 0) {
          const recoveredId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
          const recoveredProject: ScoutProject = {
            id: recoveredId,
            title: 'Recovered Scout',
            sportType: matchInfo.sportType,
            matchInfo,
            teams,
            events: sanitizeEvents(events, matchInfo.sportType),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          initializedProjects = [recoveredProject];
          await session.save(initializedProjects);
          if (!activeProjectId) setActiveProjectId(recoveredId);
        }

        if (cancelled) return;
        projectsRef.current = initializedProjects;
        setProjects(initializedProjects);
        const projectToOpen = initializedProjects.find(project => project.id === activeProjectId)
          || initializedProjects[0];
        if (projectToOpen) loadProjectState(projectToOpen);
        setRepositoryReady(true);
        setSaveStatus('saved');
        setLastSavedAt(new Date().toISOString());
      } catch (error) {
        console.error('Failed to initialize project repository:', error);
        if (cancelled) return;
        setRepositoryReady(true);
        setSaveStatus('failed');
      }
    };

    void initializeRepository();
    return () => {
      cancelled = true;
      if (persistenceSessionRef.current === session) {
        persistenceSessionRef.current = null;
      }
      session.close();
    };
  }, []);

  useEffect(() => {
    if (!repositoryReady) return;
    if (explicitlyPersistedProjectsRef.current === projects) {
      explicitlyPersistedProjectsRef.current = null;
      return;
    }
    explicitlyPersistedProjectsRef.current = null;
    const timeoutId = window.setTimeout(() => {
      void persistProjects(projects).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [persistProjects, projects, repositoryReady]);

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

  // Debounced project snapshot; repository persistence is handled separately above.
  useEffect(() => {
    if (isProjectLoading.current || !repositoryReady) return;
    
    if (activeProjectId) {
      setSaveStatus('pending');
      const timeoutId = setTimeout(() => {
        if (isProjectLoading.current) return;
        setProjects(prev => {
          const prevArr = Array.isArray(prev) ? prev : [];
          return prevArr.map(p => p.id === activeProjectId ? snapshotCurrentProject(p) : p);
        });
      }, 800);
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeProjectId, repositoryReady, snapshotCurrentProject]);

  const flushPendingSaves = useCallback(async () => {
    if (!repositoryReady || !activeProjectId || isProjectLoading.current) return;
    const nextProjects = projectsRef.current.map(project =>
      project.id === activeProjectId ? snapshotCurrentProject(project) : project,
    );
    projectsRef.current = nextProjects;
    explicitlyPersistedProjectsRef.current = nextProjects;
    setProjects(nextProjects);
    await persistProjects(nextProjects);
  }, [activeProjectId, persistProjects, repositoryReady, snapshotCurrentProject]);

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

  const updateProjectLastVideoTime = useCallback((time: number) => {
    if (activeProjectId) {
      setProjects(prev => {
        const prevArr = Array.isArray(prev) ? prev : [];
        return prevArr.map(p => {
          if (p.id === activeProjectId) {
            return {
              ...p,
              videoMeta: {
                ...(p.videoMeta || {}),
                sourceType: p.videoMeta?.sourceType || videoSourceType,
                lastVideoTime: time
              }
            };
          }
          return p;
        });
      });
    }
  }, [activeProjectId, setProjects, videoSourceType]);



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
    settingsSnapshot?: AppSettings,
    videoMeta?: any
  ) => {
    const createAfterFlush = async () => {
      if (activeProjectId) {
        try {
          await flushPendingSaves();
        } catch (error) {
          if (!(error instanceof ProjectRepositoryConflictError)) {
            showToast(settings.uiLanguage === 'th'
              ? 'บันทึกโปรเจกต์ปัจจุบันไม่สำเร็จ จึงยกเลิกการสร้างโปรเจกต์ใหม่'
              : 'Could not save the current project, so new project creation was cancelled.');
          }
          return;
        }
      }
    isProjectLoading.current = true;
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const initMatchInfo: MatchInfo = {
      scouterName: customMatchInfo?.scouterName ?? matchInfo.scouterName,
      nickname: customMatchInfo?.nickname ?? matchInfo.nickname,
      matchName: customMatchInfo?.matchName ?? '',
      matchType: customMatchInfo?.matchType ?? 'Team',
      setOrGame: customMatchInfo?.setOrGame ?? '1',
      currentPoint: customMatchInfo?.currentPoint ?? 1,
      sportType: sportType,
      courtConfig: customMatchInfo?.courtConfig || 'standard',
      gameFormat: customMatchInfo?.gameFormat || 'standard'
    };
    
    const initialTeams = customTeams || DEFAULT_TEAMS;
    const finalSettings = settingsSnapshot ? { ...settings, ...settingsSnapshot } : settings;
    
    const newProj: ScoutProject = {
      id: newId,
      title,
      sportType,
      matchInfo: initMatchInfo,
      teams: initialTeams,
      events: [],
      settingsSnapshot: finalSettings,
      videoMeta: videoMeta || {
        sourceType: 'none',
        youtubeUrl: '',
        youtubeVideoId: undefined,
        localFileName: undefined
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setProjects(prev => [...prev, newProj]);
    loadProjectState(newProj);
    };
    void createAfterFlush();
  };

  const openProject = (projectId: string) => {
    const switchProject = async () => {
      let nextProjects = projectsRef.current;
      if (activeProjectId) {
        nextProjects = nextProjects.map(project =>
          project.id === activeProjectId ? snapshotCurrentProject(project) : project,
        );
        projectsRef.current = nextProjects;
        explicitlyPersistedProjectsRef.current = nextProjects;
        setProjects(nextProjects);
        try {
          await persistProjects(nextProjects);
        } catch (error) {
          if (error instanceof ProjectRepositoryConflictError) return;
          showToast(settings.uiLanguage === 'th'
            ? 'บันทึกโปรเจกต์ปัจจุบันไม่สำเร็จ จึงยังไม่สลับโปรเจกต์'
            : 'Could not save the current project, so the project switch was cancelled.');
          return;
        }
      }

      const project = nextProjects.find(candidate => candidate.id === projectId);
      if (project) loadProjectState(project);
    };

    void switchProject();
  };

  const deleteProject = async (projectId: string) => {
    let currentProjects = projectsRef.current;
    if (activeProjectId) {
      currentProjects = currentProjects.map(project =>
        project.id === activeProjectId ? snapshotCurrentProject(project) : project,
      );
    }
    const remaining = currentProjects.filter(p => p.id !== projectId);
    try {
      await persistProjects(remaining);
    } catch (error) {
      if (error instanceof ProjectRepositoryConflictError) return;
      showToast(settings.uiLanguage === 'th' ? 'ลบโปรเจกต์ไม่สำเร็จ ข้อมูลเดิมยังอยู่' : 'Delete failed. Your data was kept.');
      return;
    }
    projectsRef.current = remaining;
    explicitlyPersistedProjectsRef.current = remaining;
    setProjects(remaining);
    
    if (activeProjectId === projectId) {
      isProjectLoading.current = true;
      if (remaining.length > 0) {
        loadProjectState(remaining[0]);
      } else {
        loadProjectState({
          id: undefined,
          matchInfo: {
            scouterName: matchInfo.scouterName, nickname: matchInfo.nickname, matchName: '', matchType: 'Team', setOrGame: '1', currentPoint: 1, sportType: 'volleyball'
          },
          teams: DEFAULT_TEAMS,
          events: [],
          videoMeta: {
            sourceType: 'local',
            localFileName: null,
            youtubeUrl: '',
            youtubeVideoId: undefined
          }
        });
        setActiveProjectId(null);
      }
    }
  };

  const duplicateProject = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const copy: ScoutProject = {
        ...structuredClone(proj),
        id: newId,
        title: `${proj.title} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setProjects(prev => [...prev, copy]);
    }
  };

  const renameProject = (projectId: string, newTitle: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, title: newTitle, updatedAt: new Date().toISOString() } : p
    ));
  };

  const importProject = (project: any): boolean => {
    const importCounts = getImportPayloadCounts(project);
    if (importCounts.projects > MAX_IMPORT_PROJECTS || importCounts.events > MAX_IMPORT_EVENTS) {
      showToast(settings.uiLanguage === 'th'
        ? `ข้อมูลนำเข้าใหญ่เกินขีดจำกัด (${MAX_IMPORT_PROJECTS} โปรเจกต์ / ${MAX_IMPORT_EVENTS.toLocaleString()} เหตุการณ์)`
        : `Import exceeds the limit of ${MAX_IMPORT_PROJECTS} projects or ${MAX_IMPORT_EVENTS.toLocaleString()} events`);
      return false;
    }
    
    if (Array.isArray(project)) {
      project = {
        title: 'Imported Events',
        sportType: project[0]?.sportType || matchInfo.sportType || 'volleyball',
        matchInfo: { ...matchInfo, sportType: project[0]?.sportType || matchInfo.sportType || 'volleyball' },
        teams,
        events: project
      };
    } else if (project?.type === 'events' && Array.isArray(project.events)) {
      project = {
        title: project.title || `Imported Events ${new Date().toLocaleDateString()}`,
        sportType: project.events[0]?.sportType || matchInfo.sportType || 'volleyball',
        matchInfo: { ...matchInfo, sportType: project.events[0]?.sportType || matchInfo.sportType || 'volleyball' },
        teams,
        events: project.events
      };
    } else if (project?.type === 'projects' && Array.isArray(project.projects)) {
      return project.projects.map((p: any) => importProject(p)).some(Boolean);
    } else if (Array.isArray(project?.indexedDbProjects?.projects)) {
      return project.indexedDbProjects.projects.map((p: any) => importProject(p)).some(Boolean);
    } else if (project?.localStorage?.scout_projects) {
      try {
        const restoredProjects = JSON.parse(project.localStorage.scout_projects);
        if (Array.isArray(restoredProjects)) {
          return importProject({ type: 'projects', projects: restoredProjects });
        }
      } catch (err) {
        console.warn('Failed to parse scout_projects from recovery backup:', err);
        return false;
      }
    }

    if (!project || typeof project !== 'object') return false;
    if (!project.title || typeof project.title !== 'string') return false;
    if (!project.sportType || typeof project.sportType !== 'string') return false;
    if (!Array.isArray(project.events)) return false;

    project.sportType = getValidSportType(project.sportType);
    project.title = sanitizeUserText(project.title, 160) || 'Imported Project';

    // Sanitize MatchInfo
    if (!project.matchInfo || typeof project.matchInfo !== 'object') {
      project.matchInfo = {
        scouterName: '',
        nickname: '',
        matchName: '',
        matchType: 'Team',
        setOrGame: '1',
        currentPoint: 1,
        sportType: project.sportType
      };
    } else {
      project.matchInfo = {
        scouterName: sanitizeUserText(project.matchInfo.scouterName, 120),
        nickname: sanitizeUserText(project.matchInfo.nickname, 80),
        matchName: sanitizeUserText(project.matchInfo.matchName, 160),
        matchType: project.matchInfo.matchType === 'Single' ? 'Single' : 'Team',
        setOrGame: sanitizeUserText(project.matchInfo.setOrGame, 20) || '1',
        currentPoint: typeof project.matchInfo.currentPoint === 'number' && Number.isFinite(project.matchInfo.currentPoint)
          ? Math.max(0, Math.min(100_000, Math.round(project.matchInfo.currentPoint)))
          : 1,
        sportType: project.sportType,
        courtConfig: sanitizeUserText(project.matchInfo.courtConfig, 80) || 'standard',
        gameFormat: sanitizeUserText(project.matchInfo.gameFormat, 80) || 'standard'
      };
    }

    // Sanitize Teams
    if (!Array.isArray(project.teams) || project.teams.length < 2) {
      project.teams = DEFAULT_TEAMS;
    } else {
      project.teams = project.teams.map((t: any, index: number) => ({
        id: sanitizeIdentifier(t.id) || `t${index + 1}`,
        code: sanitizeIdentifier(t.code, 12).toUpperCase() || `T${index + 1}`,
        name: sanitizeUserText(t.name, 120) || `Team ${index + 1}`,
        thaiName: sanitizeUserText(t.thaiName, 120),
        icon: sanitizeUserText(t.icon, 8),
        teamType: t.teamType === 'country' || t.teamType === 'club' ? t.teamType : 'country'
      }));
    }

    // Sanitize Event rows
    project.events = sanitizeEvents(project.events, project.sportType);

    // Imports are copies: always assign a fresh ID so existing work cannot be overwritten.
    project.id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Timestamp safety
    project.createdAt = typeof project.createdAt === 'string' ? project.createdAt : new Date().toISOString();
    project.updatedAt = new Date().toISOString();

    setProjects(prev => {
      const prevArr = Array.isArray(prev) ? prev : [];
      return [...prevArr, project];
    });

    return true;
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
      updateProjectLastVideoTime
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
