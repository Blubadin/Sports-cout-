import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { ScoutProject, EventRow, MatchInfo, Team, AppSettings, SportType, Action } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useScoutContext } from './ScoutContext';
import { DEFAULT_TEAMS } from '../data';

interface WorkspaceContextType {
  projects: ScoutProject[];
  activeProjectId: string | null;
  createNewProject: (
    title: string, 
    sportType: SportType, 
    initMatchInfo?: Partial<MatchInfo>, 
    initTeams?: Team[],
    settingsSnapshot?: AppSettings,
    videoMeta?: any
  ) => void;
  openProject: (projectId: string) => void;
  saveCurrentProject: () => void;
  deleteProject: (projectId: string) => void;
  duplicateProject: (projectId: string) => void;
  renameProject: (projectId: string, newTitle: string) => void;
  importProject: (project: any) => boolean;
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
              return {
                ...p,
                events,
                matchInfo,
                teams,
                settingsSnapshot: settings,
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
  }, [events, matchInfo, teams, activeProjectId, setProjects, videoSourceType, youtubeUrl, youtubeVideoId, localFileName, settings]);

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

  // Quota exceeded global alert listener
  useEffect(() => {
    const handleQuotaExceeded = (e: any) => {
      console.error('LocalStorage quota exceeded!', e);
      const isTh = settings.uiLanguage === 'th';
      showToast(
        isTh 
          ? '⚠️ หน่วยความจำเครื่องเต็ม! กรุณาลบโครงการเก่าบางโครงการเพื่อเพิ่มพื้นที่' 
          : '⚠️ Storage Quota Exceeded! Please delete some old projects to free up space.'
      );
    };
    // ScoutContext owns the single user-facing quota warning to avoid duplicate toasts.
    void handleQuotaExceeded;
    return undefined;
  }, [settings.uiLanguage, showToast]);

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
    setActiveProjectId(newId);
    
    // Reset workspace state
    setMatchInfo(initMatchInfo);
    setTeams(initialTeams);
    setEvents([]); 
    clearEventHistory();
    clearCurrentEvent();
    
    if (settingsSnapshot) {
      setSettings(finalSettings);
    }

    if (videoMeta) {
      setVideoSourceType(videoMeta.sourceType);
      if (videoMeta.sourceType === 'youtube') {
        setYoutubeUrl(videoMeta.youtubeUrl || '');
        setYoutubeVideoId(videoMeta.youtubeVideoId || null);
      } else {
        setLocalFileName(videoMeta.localFileName || null);
        setYoutubeUrl('');
        setYoutubeVideoId(null);
      }
    } else {
      setVideoSourceType('none');
      setLocalFileName(null);
      setYoutubeUrl('');
      setYoutubeVideoId(null);
    }
    
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
        setEvents(proj.events); clearEventHistory();
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
        setEvents([]); clearEventHistory();
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

  const importProject = (project: any): boolean => {
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

    // Validate and assign correct sport template type
    const validSportTypes = ['volleyball', 'football', 'badminton', 'basketball'];
    if (!validSportTypes.includes(project.sportType)) {
      project.sportType = 'volleyball';
    }

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
    project.events = sanitizeEvents(project.events);

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
