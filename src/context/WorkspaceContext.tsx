import React, { createContext, useContext, useEffect } from 'react';
import { ScoutProject, EventRow, MatchInfo, Team, AppSettings, SportType } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useScoutContext } from './ScoutContext';
import { DEFAULT_TEAMS } from '../data';

interface WorkspaceContextType {
  projects: ScoutProject[];
  activeProjectId: string | null;
  createNewProject: (title: string, sportType: SportType) => void;
  openProject: (projectId: string) => void;
  saveCurrentProject: () => void;
  deleteProject: (projectId: string) => void;
  duplicateProject: (projectId: string) => void;
  renameProject: (projectId: string, newTitle: string) => void;
  importProject: (project: ScoutProject) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useLocalStorage<ScoutProject[]>('scout_projects', []);
  const [activeProjectId, setActiveProjectId] = useLocalStorage<string | null>('active_scout_project_id', null);
  
  const { 
    events, setEvents, 
    matchInfo, setMatchInfo, 
    teams, setTeams,
    clearCurrentEvent,
    settings,
    videoSourceType, setVideoSourceType,
    youtubeUrl, setYoutubeUrl,
    youtubeVideoId, setYoutubeVideoId,
    localFileName, setLocalFileName
  } = useScoutContext();

  // Initial migration & sanitization
  useEffect(() => {
    let projs = Array.isArray(projects) ? projects : [];
    
    // Sanitize corrupted projects
    const validProjs = projs.filter(p => typeof p === 'object' && p !== null && p.id && p.title);
    
    if (validProjs.length !== projs.length) {
      console.warn('WorkspaceContext: Removed invalid project entries from local storage.');
      setProjects(validProjs);
      projs = validProjs;
    }
    
    const evs = Array.isArray(events) ? events : [];
    if (projs.length === 0 && evs.length > 0) {
      // Migrate existing data to a Recovered Scout project
      const recoveredId = Date.now().toString();
      const newProj: ScoutProject = {
        id: recoveredId,
        title: 'Recovered Scout',
        sportType: matchInfo.sportType,
        matchInfo,
        teams,
        events,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setProjects([newProj]);
      setActiveProjectId(recoveredId);
    }
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (activeProjectId) {
      setProjects(prev => {
        const prevArr = Array.isArray(prev) ? prev : [];
        return prevArr.map(p => {
          if (p.id === activeProjectId) {
            return {
              ...p,
              events,
              matchInfo,
              teams,
              videoMeta: {
                sourceType: videoSourceType,
                youtubeUrl,
                youtubeVideoId: youtubeVideoId || undefined,
                localFileName: localFileName || undefined
              },
              updatedAt: new Date().toISOString()
            };
          }
          return p;
        });
      });
    }
  }, [events, matchInfo, teams, activeProjectId, setProjects, videoSourceType, youtubeUrl, youtubeVideoId, localFileName]);

  const saveCurrentProject = () => {
    if (!activeProjectId) {
      // Create new one if we somehow have unsaved data but no active project
      createNewProject(`Match ${new Date().toLocaleDateString()}`, matchInfo.sportType);
    }
  };

  const createNewProject = (title: string, sportType: SportType) => {
    const newId = Date.now().toString();
    const initMatchInfo: MatchInfo = {
      scouterName: matchInfo.scouterName,
      nickname: matchInfo.nickname,
      matchName: '',
      matchType: 'Team',
      setOrGame: '1',
      currentPoint: 1,
      sportType: sportType
    };
    
    const newProj: ScoutProject = {
      id: newId,
      title,
      sportType,
      matchInfo: initMatchInfo,
      teams: DEFAULT_TEAMS,
      events: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setProjects(prev => [...prev, newProj]);
    setActiveProjectId(newId);
    
    // Reset workspace state
    setMatchInfo(initMatchInfo);
    setTeams(DEFAULT_TEAMS);
    setEvents([]);
    clearCurrentEvent();
    setVideoSourceType('local');
    setLocalFileName(null);
    setYoutubeUrl('');
  };

  const openProject = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      setActiveProjectId(proj.id);
      setMatchInfo(proj.matchInfo);
      setTeams(proj.teams);
      setEvents(proj.events);
      clearCurrentEvent();
      
      if (proj.videoMeta) {
        setVideoSourceType(proj.videoMeta.sourceType);
        if (proj.videoMeta.sourceType === 'youtube') {
          setYoutubeUrl(proj.videoMeta.youtubeUrl || '');
          setYoutubeVideoId(proj.videoMeta.youtubeVideoId || null);
        } else {
          setLocalFileName(proj.videoMeta.localFileName || null);
          // Note: we can't restore the actual local file object for security reasons,
          // user must re-select it if they want to play it.
        }
      } else {
        setVideoSourceType('local');
        setLocalFileName(null);
        setYoutubeUrl('');
      }
    }
  };

  const deleteProject = (projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (activeProjectId === projectId) {
      const remaining = projects.filter(p => p.id !== projectId);
      if (remaining.length > 0) {
        // Will be called with previous `projects` context, wait... actually calling it here uses closure projects which is fine.
        // Wait, openProject relies on `projects` from closure!
        const proj = remaining[0];
        setActiveProjectId(proj.id);
        setMatchInfo(proj.matchInfo);
        setTeams(proj.teams);
        setEvents(proj.events);
        clearCurrentEvent();
        if (proj.videoMeta) {
          setVideoSourceType(proj.videoMeta.sourceType);
          if (proj.videoMeta.sourceType === 'youtube') {
            setYoutubeUrl(proj.videoMeta.youtubeUrl || '');
            setYoutubeVideoId(proj.videoMeta.youtubeVideoId || null);
          } else {
            setLocalFileName(proj.videoMeta.localFileName || null);
          }
        } else {
          setVideoSourceType('local');
          setLocalFileName(null);
          setYoutubeUrl('');
        }
      } else {
        setActiveProjectId(null);
        setMatchInfo({
          scouterName: matchInfo.scouterName, nickname: matchInfo.nickname, matchName: '', matchType: 'Team', setOrGame: '1', currentPoint: 1, sportType: 'volleyball'
        });
        setTeams(DEFAULT_TEAMS);
        setEvents([]);
        clearCurrentEvent();
        setVideoSourceType('local');
        setLocalFileName(null);
        setYoutubeUrl('');
      }
    }
  };

  const duplicateProject = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      const newId = Date.now().toString();
      const copy: ScoutProject = {
        ...proj,
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

  const importProject = (project: ScoutProject) => {
    setProjects(prev => [...prev, project]);
  };

  return (
    <WorkspaceContext.Provider value={{
      projects,
      activeProjectId,
      createNewProject,
      openProject,
      saveCurrentProject,
      deleteProject,
      duplicateProject,
      renameProject,
      importProject
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
