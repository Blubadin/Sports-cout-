import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { ScoutProject, MatchInfo, Team, AppSettings, SportType, EventRow } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useScoutContext } from './ScoutContext';
import { DEFAULT_TEAMS } from '../data';
import { getValidSportType, sanitizeEvents } from '../utils/scoutData';
import { indexedDbStorageAdapter } from '../utils/storageAdapter';
import { createProjectRepository } from '../utils/projectRepository';

export type ProjectSaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error';

const projectRepository = createProjectRepository(indexedDbStorageAdapter);

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
    setSaveStatus('saving');
    try {
      await projectRepository.save(nextProjects);
      if (generation === saveGenerationRef.current) {
        setSaveStatus('saved');
        setLastSavedAt(new Date().toISOString());
      }
    } catch (error) {
      console.error('Failed to save projects to IndexedDB:', error);
      if (generation === saveGenerationRef.current) setSaveStatus('error');
      throw error;
    }
  }, []);

  // IndexedDB becomes the source of truth. The original localStorage value is kept as a recovery backup.
  useEffect(() => {
    let cancelled = false;
    const initializeRepository = async () => {
      try {
        let initializedProjects = await projectRepository.initialize(projectsRef.current);
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
          await projectRepository.save(initializedProjects);
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
        setSaveStatus('error');
      }
    };

    void initializeRepository();
    return () => {
      cancelled = true;
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
      setSaveStatus('idle');
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

    const nextProjects = projectsRef.current.map(project =>
      project.id === activeProjectId ? snapshotCurrentProject(project) : project,
    );
    projectsRef.current = nextProjects;
    explicitlyPersistedProjectsRef.current = nextProjects;
    setProjects(nextProjects);
    try {
      await persistProjects(nextProjects);
      showToast(settings.uiLanguage === 'th' ? 'บันทึกโปรเจกต์แล้ว' : 'Project saved');
    } catch {
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
        } catch {
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

  const deleteProject = (projectId: string) => {
    const remaining = projects.filter(p => p.id !== projectId);
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
    // Basic size limit checks to prevent crashing or filling localStorage
    if (Array.isArray(project) && project.length > 20000) {
      showToast('⚠️ Project data is too large to import (> 20,000 events).');
      return false;
    }
    if (project?.type === 'events' && Array.isArray(project.events) && project.events.length > 20000) {
      showToast('⚠️ Project data is too large to import (> 20,000 events).');
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
    } else if (project?.localStorage?.scout_projects) {
      try {
        const restoredProjects = JSON.parse(project.localStorage.scout_projects);
        if (Array.isArray(restoredProjects)) {
          return restoredProjects.map((p: any) => importProject(p)).some(Boolean);
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
        scouterName: typeof project.matchInfo.scouterName === 'string' ? project.matchInfo.scouterName : '',
        nickname: typeof project.matchInfo.nickname === 'string' ? project.matchInfo.nickname : '',
        matchName: typeof project.matchInfo.matchName === 'string' ? project.matchInfo.matchName : '',
        matchType: typeof project.matchInfo.matchType === 'string' ? project.matchInfo.matchType : 'Team',
        setOrGame: typeof project.matchInfo.setOrGame === 'string' ? project.matchInfo.setOrGame : '1',
        currentPoint: typeof project.matchInfo.currentPoint === 'number' ? project.matchInfo.currentPoint : 1,
        sportType: project.sportType,
        courtConfig: typeof project.matchInfo.courtConfig === 'string' ? project.matchInfo.courtConfig : 'standard',
        gameFormat: typeof project.matchInfo.gameFormat === 'string' ? project.matchInfo.gameFormat : 'standard'
      };
    }

    // Sanitize Teams
    if (!Array.isArray(project.teams) || project.teams.length < 2) {
      project.teams = DEFAULT_TEAMS;
    } else {
      project.teams = project.teams.map((t: any, index: number) => ({
        id: typeof t.id === 'string' ? t.id : `t${index + 1}`,
        code: typeof t.code === 'string' ? t.code.toUpperCase() : `T${index + 1}`,
        name: typeof t.name === 'string' ? t.name : `Team ${index + 1}`,
        thaiName: typeof t.thaiName === 'string' ? t.thaiName : '',
        icon: typeof t.icon === 'string' ? t.icon : '',
        teamType: t.teamType === 'country' || t.teamType === 'club' ? t.teamType : 'country'
      }));
    }

    // Sanitize Event rows
    project.events = sanitizeEvents(project.events, project.sportType);

    // Re-generate ID if missing or colliding
    if (!project.id || typeof project.id !== 'string') {
      project.id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    // Timestamp safety
    project.createdAt = typeof project.createdAt === 'string' ? project.createdAt : new Date().toISOString();
    project.updatedAt = new Date().toISOString();

    setProjects(prev => {
      const prevArr = Array.isArray(prev) ? prev : [];
      // Prevent duplicates
      const filtered = prevArr.filter(p => p.id !== project.id);
      return [...filtered, project];
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
