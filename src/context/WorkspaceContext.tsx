import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { ScoutProject, EventRow, MatchInfo, Team, AppSettings, SportType, Action } from '../types';
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
  updateProjectLastVideoTime: (time: number) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const sanitizeEvents = (eventsList: any[]): EventRow[] => {
  if (!Array.isArray(eventsList)) return [];
  const seenIds = new Set<string>();
  return eventsList.map((row, index) => {
    let newRow = { ...row };
    
    // Fallback ID if missing
    if (!newRow.id) {
      newRow.id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`;
    }
    
    // If ID is purely numeric or already seen (duplicate), make it unique
    if (/^\d+$/.test(String(newRow.id)) || seenIds.has(String(newRow.id))) {
      newRow.id = `${newRow.id}-${index}-${Math.random().toString(36).slice(2, 11)}`;
    }
    seenIds.add(String(newRow.id));

    if (!newRow.sportType) {
      newRow.sportType = 'volleyball';
    }

    if (newRow.actions) {
      const seenActionIds = new Set<string>();
      newRow.actions = newRow.actions.map((act: any, i: number) => {
        let newAct = { ...act };
        if (!newAct.id) {
          newAct.id = `${Date.now()}-${index}-${i}-${Math.random().toString(36).slice(2, 11)}`;
        }
        if (/^\d+$/.test(String(newAct.id)) || seenActionIds.has(String(newAct.id))) {
          newAct.id = `${newAct.id}-${i}-${Math.random().toString(36).slice(2, 11)}`;
        }
        seenActionIds.add(String(newAct.id));
        return newAct;
      });
    } else {
      newRow.actions = [];
      if (newRow.eventText) {
        const parts = newRow.eventText.split(' / ').map((p: string) => p.trim()).filter(Boolean);
        const actions: Action[] = [];
        
        for (let i = 0; i + 3 < parts.length; i += 4) {
          let resultCode = parts[i + 3];
          
          if (!['Yes', 'Out', 'Pass', '0', '+1', '-1'].includes(resultCode)) {
            continue;
          }

          if (resultCode === '+1') resultCode = 'Yes';
          else if (resultCode === '-1') resultCode = 'Out';
          else if (resultCode === '0') resultCode = 'Pass';
          
          actions.push({
            id: `${Date.now()}-${index}-${i}-${Math.random().toString(36).slice(2, 11)}`,
            teamCode: parts[i],
            skillCode: parts[i + 1],
            areaCode: parts[i + 2],
            resultCode,
          });
        }
        newRow.actions = actions;
      }
    }
    return newRow;
  });
};

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useLocalStorage<ScoutProject[]>('scout_projects', []);
  const [activeProjectId, setActiveProjectId] = useLocalStorage<string | null>('active_scout_project_id', null);
  const isProjectLoading = React.useRef(false);
  
  const { 
    events, setEvents, 
    matchInfo, setMatchInfo, 
    teams, setTeams,
    clearCurrentEvent,
    settings,
    videoSourceType, setVideoSourceType,
    youtubeUrl, setYoutubeUrl,
    youtubeVideoId, setYoutubeVideoId,
    localFileName, setLocalFileName,
    showToast
  } = useScoutContext();

  // Initial migration & sanitization
  useEffect(() => {
    let projs = Array.isArray(projects) ? projects : [];
    
    // Sanitize corrupted projects
    const validProjs = projs.filter(p => typeof p === 'object' && p !== null && p.id && p.title);
    
    let changed = false;
    const sanitizedProjs = validProjs.map(p => {
      const sanitizedEvs = sanitizeEvents(p.events);
      if (JSON.stringify(sanitizedEvs) !== JSON.stringify(p.events)) {
        changed = true;
        return { ...p, events: sanitizedEvs };
      }
      return p;
    });

    if (changed || validProjs.length !== projs.length) {
      console.warn('WorkspaceContext: Sanitized duplicate or numeric event IDs.');
      setProjects(sanitizedProjs);
      projs = sanitizedProjs;
    }
    
    const evs = Array.isArray(events) ? events : [];
    if (projs.length === 0 && evs.length > 0) {
      // Migrate existing data to a Recovered Scout project
      const recoveredId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const newProj: ScoutProject = {
        id: recoveredId,
        title: 'Recovered Scout',
        sportType: matchInfo.sportType,
        matchInfo,
        teams,
        events: sanitizeEvents(events),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setProjects([newProj]);
      setActiveProjectId(recoveredId);
    }
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (isProjectLoading.current) return;
    
    if (activeProjectId) {
      const timeoutId = setTimeout(() => {
        if (isProjectLoading.current) return;
        setProjects(prev => {
          const prevArr = Array.isArray(prev) ? prev : [];
          return prevArr.map(p => {
            if (p.id === activeProjectId) {
              // Guard: Prevent overwriting populated events with an empty array
              // during project switching transitions to avoid data loss.
              if (p.events.length > 0 && events.length === 0) {
                console.warn('WorkspaceContext auto-save guard: Prevented overwriting existing events with an empty array.');
                return p;
              }
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
      }, 800);
      
      return () => clearTimeout(timeoutId);
    }
  }, [events, matchInfo, teams, activeProjectId, setProjects, videoSourceType, youtubeUrl, youtubeVideoId, localFileName]);

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

  const saveCurrentProject = () => {
    if (!activeProjectId) {
      createNewProject(`Match ${new Date().toLocaleDateString()}`, matchInfo.sportType);
    } else {
      setProjects(prev => {
        const prevArr = Array.isArray(prev) ? prev : [];
        return prevArr.map(p => {
          if (p.id === activeProjectId) {
            return {
              ...p,
              updatedAt: new Date().toISOString()
            };
          }
          return p;
        });
      });
      showToast(settings.uiLanguage === 'th' ? 'บันทึกโครงการแล้ว' : 'Project saved successfully');
    }
  };

  const createNewProject = (title: string, sportType: SportType) => {
    isProjectLoading.current = true;
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
    
    setTimeout(() => { isProjectLoading.current = false; }, 100);
  };

  const openProject = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      isProjectLoading.current = true;
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
      setTimeout(() => { isProjectLoading.current = false; }, 100);
    }
  };

  const deleteProject = (projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (activeProjectId === projectId) {
      isProjectLoading.current = true;
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
      setTimeout(() => { isProjectLoading.current = false; }, 100);
    }
  };

  const duplicateProject = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
