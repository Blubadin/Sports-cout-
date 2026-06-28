import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { Team, Skill, Area, ResultType, Action, EventRow, MatchInfo, AppSettings, VideoSourceType, SportType, SportTemplate } from '../types';
import { DEFAULT_TEAMS, DEFAULT_SKILLS, DEFAULT_AREAS, DEFAULT_RESULTS } from '../data';
import { SPORT_TEMPLATES } from '../sports';
import { useLocalStorage } from '../hooks/useLocalStorage';

export type InputHistoryItem = 
  | { type: 'field'; category: keyof Action; previousValue?: string; value?: string; previousCourtSide?: 'teamA'|'teamB'|'neutral'; courtSide?: 'teamA'|'teamB'|'neutral' }
  | { type: 'descriptor'; groupId: string; previousValue?: string; value?: string };

interface ScoutContextType {
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  skills: Skill[];
  areas: Area[];
  results: ResultType[];
  matchInfo: MatchInfo;
  setMatchInfo: React.Dispatch<React.SetStateAction<MatchInfo>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  events: EventRow[];
  setEvents: React.Dispatch<React.SetStateAction<EventRow[]>>;
  currentActions: Action[];
  setCurrentActions: React.Dispatch<React.SetStateAction<Action[]>>;
  currentAction: Action;
  setCurrentAction: React.Dispatch<React.SetStateAction<Action>>;
  currentInputHistory: InputHistoryItem[];
  setCurrentInputHistory: React.Dispatch<React.SetStateAction<InputHistoryItem[]>>;
  
  videoSourceType: VideoSourceType;
  setVideoSourceType: React.Dispatch<React.SetStateAction<VideoSourceType>>;
  youtubeVideoId: string | null;
  setYoutubeVideoId: React.Dispatch<React.SetStateAction<string | null>>;
  youtubeUrl: string;
  setYoutubeUrl: React.Dispatch<React.SetStateAction<string>>;
  localFileName: string | null;
  setLocalFileName: React.Dispatch<React.SetStateAction<string | null>>;
  videoTime: number;
  setVideoTime: React.Dispatch<React.SetStateAction<number>>;
  getCurrentTimeRef: React.MutableRefObject<() => number>;
  seekRequest: number | null;
  setSeekRequest: React.Dispatch<React.SetStateAction<number | null>>;

  saveEvent: (actionToSave?: Action) => void;
  addAction: (actionToAdd?: Action) => void;
  undoLastAction: () => void;
  clearCurrentEvent: () => void;
  deleteEventRow: (id: string) => void;
  updateEventRow: (id: string, updatedRow: EventRow) => void;
  isActionComplete: (action: Action) => boolean;
  getActionText: (action: Action) => string;
  getExtendedActionText: (action: Action) => string;
  getThaiMeaning: (action: Action) => string;
  resetCurrentAction: () => void;
  sportTemplate: SportTemplate;
  changeSportType: (newSport: SportType) => void;
  getMissingActionMessage: (action: Action) => string | null;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  hudLastSavedText: string | null;
  hudLastSavedAt: number;
  updateActionField: (field: keyof Action, value: any, descriptorGroupId?: string) => void;
  commitResult: (resultCode: string, isFastMode?: boolean) => void;
}

const ScoutContext = createContext<ScoutContextType | undefined>(undefined);

export function ScoutProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useLocalStorage<Team[]>('scout_teams', DEFAULT_TEAMS);
  
  const [matchInfo, setMatchInfo] = useLocalStorage<MatchInfo>('scout_match_info', {
    scouterName: '',
    nickname: '',
    matchName: '',
    matchType: 'Team',
    setOrGame: '1',
    currentPoint: 1,
    sportType: 'volleyball'
  });

  const sportTemplate = SPORT_TEMPLATES[matchInfo.sportType || 'volleyball'] || SPORT_TEMPLATES.volleyball;
  const skills = sportTemplate.skills;
  const areas = sportTemplate.areas;
  const results = sportTemplate.results;

  const [settings, setSettings] = useLocalStorage<AppSettings>('scout_settings', {
    autoNextPoint: true,
    darkMode: false,
    maxPoints: 25,
    fastMode: true,
    advancedDetailMode: true,
    videoSkipStep: 3,
    defaultPlaybackSpeed: 1,
    enableRadialMenu: true,
    enableVideoGestures: true,
    swipeSensitivity: 0.03,
    doubleTapSeekStep: 3,
    liveScrub: false,
    showGestureOverlay: true,
    autoPlayAfterSeek: true,
    
    enableScreenMarkingMode: true,
    screenMarkingKey: 'Alt',
    skillInputLayout: 'wheel',
    uiLanguage: 'th',
    
    // HUD Mode settings defaults
    enableScoutHUDMode: true,
    hudDefaultMode: 'classic',
    hudOverlayOpacity: 0.85,
    hudShowTopStats: true,
    hudShowActionStatus: true,
    hudShowVideoControls: true,
    hudAutoHideControls: false,
    hudMobileLargeButtons: true,
    hudEnableGameFeedback: true,
    hudEnableSoundFeedback: false,
    hudEnableHapticFeedback: true
  });

  const [events, setEvents] = useLocalStorage<EventRow[]>('scout_events', []);

  useEffect(() => {
    setEvents(prevEvents => {
      if (!Array.isArray(prevEvents)) {
        return [];
      }
      let needsMigration = false;
      const migrated = prevEvents.map(row => {
        let changed = false;
        let newRow = { ...row };

        if (!newRow.sportType) {
          newRow.sportType = 'volleyball';
          changed = true;
        }
        if (!newRow.actions) {
          newRow.actions = [];
          if (newRow.eventText) {
            const parts = newRow.eventText.split(' / ').map(p => p.trim()).filter(Boolean);
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
                id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
                teamCode: parts[i],
                skillCode: parts[i + 1],
                areaCode: parts[i + 2],
                resultCode,
              });
            }
            newRow.actions = actions;
          }
          changed = true;
        }
        if (changed) needsMigration = true;
        return newRow;
      });
      return needsMigration ? migrated : prevEvents;
    });
  }, [setEvents]);

  const [currentActions, setCurrentActions] = useState<Action[]>([]);
  const [currentAction, setCurrentAction] = useState<Action>({});
  
  const [videoSourceType, setVideoSourceType] = useState<VideoSourceType>('local');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [videoTime, setVideoTime] = useState<number>(0);
  const getCurrentTimeRef = useRef<() => number>(() => videoTime);
  const [seekRequest, setSeekRequest] = useState<number | null>(null);

  const [currentInputHistory, setCurrentInputHistory] = useState<InputHistoryItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [hudLastSavedText, setHudLastSavedText] = useState<string | null>(null);
  const [hudLastSavedAt, setHudLastSavedAt] = useState<number>(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const updateActionField = useCallback((field: keyof Action, value: any, descriptorGroupId?: string) => {
    let previousValue: any;
    let nextValue: any;
    
    setCurrentAction(prev => {
      const isSame = descriptorGroupId 
        ? prev.descriptors?.[descriptorGroupId] === value 
        : prev[field] === value;
        
      nextValue = isSame ? undefined : value;
      previousValue = descriptorGroupId ? prev.descriptors?.[descriptorGroupId] : prev[field];
      
      const next = { ...prev };
      
      if (descriptorGroupId) {
        if (!next.descriptors) next.descriptors = {};
        if (isSame) {
          delete next.descriptors[descriptorGroupId];
        } else {
          next.descriptors[descriptorGroupId] = value;
        }
      } else {
        (next as any)[field] = nextValue;
        if (field === 'skillCode' && !isSame) {
          next.descriptors = {};
          next.resultDetailCode = undefined;
        }
      }

      // Safe to dispatch other state setter here? React 18 batches this.
      // But StrictMode might run this twice. We'll do it safely outside if possible, 
      // but to keep it simple we'll just queue it in a microtask.
      setTimeout(() => {
        setCurrentInputHistory(hist => [...hist, {
          type: descriptorGroupId ? 'descriptor' : 'field',
          category: !descriptorGroupId ? field : undefined,
          groupId: descriptorGroupId,
          previousValue,
          value: nextValue
        } as any]);
      }, 0);

      return next;
    });
  }, []);

  const clearCurrentEvent = () => {
    setCurrentActions([]);
    setCurrentAction({});
    setCurrentInputHistory([]);
  };

  const resetCurrentAction = () => {
    setCurrentAction({});
    setCurrentInputHistory([]);
  };

  const getSkillByCode = (skillCode?: string) => {
    return skills.find(s => s.code === skillCode);
  };

  const normalizeActionBeforeCommit = (action: Action): Action => {
    const skill = getSkillByCode(action.skillCode);
    const req = skill?.areaRequirement || 'optionalWhenOut';
    const next = { ...action };

    if (next.resultCode === 'Out' && !next.areaCode) {
      next.areaCode = 'OUT';
    } else if (!next.areaCode && req === 'optional') {
      next.areaCode = 'UNKNOWN';
    } else if (!next.areaCode && req === 'never') {
      next.areaCode = undefined;
    }

    return next;
  };

  const getMissingActionMessage = (action: Action): string | null => {
    const normalized = normalizeActionBeforeCommit(action);

    if (!normalized.teamCode) return 'กรุณาเลือกทีมก่อน (Select Team)';
    if (!normalized.skillCode) return 'กรุณาเลือกทักษะก่อน (Select Skill)';
    if (!normalized.resultCode) return 'กรุณาเลือกผลลัพธ์ก่อน (Select Result)';

    const skill = getSkillByCode(normalized.skillCode);
    const req = skill?.areaRequirement || 'optionalWhenOut';

    if (req === 'never' || req === 'optional') return null;

    if (normalized.resultCode !== 'Out' && !normalized.areaCode) {
      return 'กรุณาเลือกพื้นที่ในสนามก่อน (Select Area)';
    }

    return null;
  };

  const isActionComplete = (action: Action) => {
    return getMissingActionMessage(action) === null;
  };

  const getActionText = (action: Action) => {
    const area = action.areaCode || (action.resultCode === 'Out' ? 'OUT' : undefined);
    const parts = [action.teamCode, action.skillCode, area, action.resultCode];
    return parts.filter(Boolean).join(' / ');
  };

  const getExtendedActionText = (action: Action) => {
    const base = getActionText(action);
    const details = [];
    if (action.playerNumber || action.playerName) {
      const playerStr = [action.playerNumber ? `#${action.playerNumber}` : '', action.playerName].filter(Boolean).join(' ');
      details.push(playerStr);
    }
    if (action.resultDetailCode) details.push(action.resultDetailCode);
    if (action.descriptors) {
      Object.values(action.descriptors).forEach(val => {
        if (val) details.push(val);
      });
    }
    if (details.length > 0) {
      return base + ' / ' + details.join(' / ');
    }
    return base;
  };

  const getThaiMeaning = (action: Action) => {
    const team = teams.find(t => t.code === action.teamCode);
    const skill = skills.find(s => s.code === action.skillCode);
    const areaCode = action.areaCode || (action.resultCode === 'Out' ? 'OUT' : action.areaCode);
    const area = areas.find(a => a.code === areaCode);
    const result = results.find(r => r.code === action.resultCode);

    const parts = [
      team?.thaiName || team?.name || action.teamCode,
      skill?.thaiName || action.skillCode,
      area?.thaiName || areaCode,
      result?.thaiName || action.resultCode,
    ];

    const base = parts.filter(Boolean).join(' / ');

    const details = [];
    if (action.playerNumber || action.playerName) {
      const playerStr = [action.playerNumber ? `เบอร์ ${action.playerNumber}` : '', action.playerName].filter(Boolean).join(' ');
      details.push(playerStr);
    }
    if (action.descriptors) {
      Object.entries(action.descriptors).forEach(([key, val]) => {
        // Find thaiLabel of the descriptor option
        for (const grp of Object.values(sportTemplate.descriptors || {})) {
          for (const g of grp) {
            if (g.id === key) {
              const opt = g.options.find(o => o.code === val);
              if (opt) details.push(opt.thaiLabel);
            }
          }
        }
      });
    }
    if (details.length > 0) {
      return base + ' / ' + details.join(' / ');
    }
    return base;
  };

  const addAction = (actionToAdd: Action = currentAction) => {
    if (Object.keys(actionToAdd).length > 0) {
      if (!isActionComplete(actionToAdd)) {
        showToast('กรุณาเลือกข้อมูลให้ครบก่อนเพิ่ม Action');
        return;
      }
      
      const normalized = normalizeActionBeforeCommit(actionToAdd);
      
      const finalVideoTime = getCurrentTimeRef.current();
      const completedAction: Action = {
        ...normalized,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        videoTime: finalVideoTime,
        realTime: Date.now()
      };
      setCurrentActions(prev => [...prev, completedAction]);
      setCurrentAction({});
      setCurrentInputHistory([]);
    }
  };

  const undoLastAction = () => {
    if (currentInputHistory.length > 0) {
      // Revert last current input
      const history = [...currentInputHistory];
      const last = history.pop()!;
      setCurrentInputHistory(history);

      setCurrentAction(prev => {
        const next = { ...prev };
        
        if (last.type === 'descriptor') {
          if (!next.descriptors) next.descriptors = {};
          if (last.previousValue === undefined) {
            delete next.descriptors[last.groupId];
          } else {
            next.descriptors[last.groupId] = last.previousValue;
          }
          if (Object.keys(next.descriptors).length === 0) {
            delete next.descriptors;
          }
          return next;
        }

        if (last.type === 'field') {
          if (last.previousValue === undefined) {
            delete next[last.category];
          } else {
            // @ts-ignore
            next[last.category] = last.previousValue;
          }
          
          if (last.category === 'areaCode') {
            if (last.previousCourtSide === undefined) {
              delete next.courtSide;
            } else {
              next.courtSide = last.previousCourtSide;
            }
          }
          
          // Handle dependencies
          if (last.category === 'skillCode' && last.previousValue === undefined) {
            delete next.descriptors;
            delete next.resultDetailCode;
          }
        }
        
        return next;
      });
      return;
    }

    if (Object.keys(currentAction).length > 0) {
      // Fallback
      setCurrentAction({});
      return;
    } 

    if (currentActions.length > 0) {
      setCurrentActions(prev => prev.slice(0, -1));
    }
  };

  const saveEvent = (actionToSave: Action = currentAction) => {
    let finalActions = [...currentActions];
    if (Object.keys(actionToSave).length > 0) {
      if (!isActionComplete(actionToSave)) {
        showToast('กรุณาเลือกข้อมูลให้ครบก่อนบันทึก');
        return;
      }
      
      const normalized = normalizeActionBeforeCommit(actionToSave);

      const finalVideoTime = getCurrentTimeRef.current();
      const completedAction: Action = {
        ...normalized,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        videoTime: finalVideoTime,
        realTime: Date.now()
      };
      finalActions.push(completedAction);
    }

    if (finalActions.length === 0) return;

    setCurrentInputHistory([]);

    // Build event text
    const eventText = finalActions.map(a => getActionText(a)).join(' / ');
    const thaiMeaningText = finalActions.map(a => getThaiMeaning(a)).join(' / ');
    const extendedEventText = finalActions.map(a => getExtendedActionText(a)).join(' / ');

    // Determine final result from the last action
    const lastAction = finalActions[finalActions.length - 1];
    let resultText: '+1' | '-1' | '0' = '0';
    if (lastAction.resultCode === 'Yes') resultText = '+1';
    else if (lastAction.resultCode === 'Out') resultText = '-1';
    else if (lastAction.resultCode === 'Pass') resultText = '0';

    const finalVideoTime = getCurrentTimeRef.current();

    const newRow: EventRow = {
      id: Date.now().toString(),
      no: events.length + 1,
      point: matchInfo.currentPoint,
      actions: finalActions,
      eventText,
      thaiMeaningText,
      extendedEventText,
      resultText,
      videoTime: finalVideoTime,
      videoSourceType,
      youtubeVideoId: videoSourceType === 'youtube' && youtubeVideoId ? youtubeVideoId : undefined,
      videoUrl: videoSourceType === 'youtube' ? youtubeUrl : undefined,
      sportType: matchInfo.sportType,
      createdAt: new Date().toISOString(),
    };

    setEvents(prev => {
      const nextEvents = [...prev, newRow];
      return nextEvents.map((e, index) => ({ ...e, no: index + 1 }));
    });
    
    // HUD visual flash
    setHudLastSavedText(eventText);
    setHudLastSavedAt(Date.now());
    setTimeout(() => {
      setHudLastSavedAt(prev => {
        if (Date.now() - prev > 1900) setHudLastSavedText(null);
        return prev;
      });
    }, 2000);

    clearCurrentEvent();

    if (settings.autoNextPoint && (resultText === '+1' || resultText === '-1')) {
      setMatchInfo(prev => ({ ...prev, currentPoint: prev.currentPoint + 1 }));
    }
  };

  const commitResult = useCallback((resultCode: string, isFastMode: boolean = false) => {
    setCurrentAction(prev => {
      let nextAction = { ...prev, resultCode };
      
      const missingMessage = getMissingActionMessage(nextAction);
      
      // Auto OUT logic
      if (missingMessage && resultCode === 'Out' && !nextAction.areaCode) {
        nextAction.areaCode = 'OUT';
        nextAction.courtSide = 'neutral';
        
        if (isFastMode || isActionComplete(nextAction)) {
           setTimeout(() => saveEvent(nextAction), 0);
           return nextAction;
        }
      }

      if (missingMessage && isFastMode) {
        showToast(missingMessage);
        return nextAction;
      }

      if (!isFastMode && missingMessage) {
        return nextAction; 
      }
      
      if (resultCode === 'Pass') {
        setTimeout(() => addAction(nextAction), 0);
      } else {
        setTimeout(() => saveEvent(nextAction), 0);
      }
      
      return nextAction;
    });
  }, [getMissingActionMessage, isActionComplete]);

  const deleteEventRow = (id: string) => {
    setEvents(prev => 
      prev
        .filter(e => e.id !== id)
        .map((e, index) => ({ ...e, no: index + 1 }))
    );
  };

  const updateEventRow = (id: string, updatedRow: EventRow) => {
    setEvents(prev => prev.map(e => (e.id === id ? updatedRow : e)));
  };

  const changeSportType = (newSport: SportType) => {
    if (currentActions.length > 0 || Object.keys(currentAction).length > 0) {
      showToast('กรุณาบันทึกหรือล้าง Action ปัจจุบันก่อนเปลี่ยนกีฬา');
      return;
    }
    setMatchInfo(prev => ({ ...prev, sportType: newSport }));
    clearCurrentEvent();
    showToast(`เปลี่ยนเป็นโหมด ${SPORT_TEMPLATES[newSport].thaiName} แล้ว`);
  };

  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  return (
    <ScoutContext.Provider value={{
      teams, setTeams, skills, areas, results,
      matchInfo, setMatchInfo,
      settings, setSettings,
      events, setEvents,
      currentActions, setCurrentActions,
      currentAction, setCurrentAction,
      videoTime, setVideoTime, getCurrentTimeRef,
      videoSourceType, setVideoSourceType,
      youtubeVideoId, setYoutubeVideoId,
      youtubeUrl, setYoutubeUrl,
      localFileName, setLocalFileName,
      seekRequest, setSeekRequest,
      saveEvent, addAction, undoLastAction, clearCurrentEvent,
      deleteEventRow, updateEventRow,
      isActionComplete, getActionText, getExtendedActionText, getThaiMeaning, resetCurrentAction,
      sportTemplate, changeSportType,
      currentInputHistory, setCurrentInputHistory, getMissingActionMessage,
      toastMessage, showToast,
      hudLastSavedText, hudLastSavedAt, updateActionField, commitResult
    }}>
      {children}
    </ScoutContext.Provider>
  );
}

export const useScoutContext = () => {
  const ctx = useContext(ScoutContext);
  if (!ctx) throw new Error('useScoutContext must be used within ScoutProvider');
  return ctx;
};
