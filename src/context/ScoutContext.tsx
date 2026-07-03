import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { Team, Skill, Area, ResultType, Action, EventRow, MatchInfo, AppSettings, VideoSourceType, SportType, SportTemplate, AreaSelectionPayload } from '../types';
import { DEFAULT_TEAMS, DEFAULT_SKILLS, DEFAULT_AREAS, DEFAULT_RESULTS } from '../data';
import { SPORT_TEMPLATES, OUT_ZONE_LABELS, DETAILED_ZONE_LABELS } from '../sports';
import { useLocalStorage } from '../hooks/useLocalStorage';

export type InputHistoryItem = 
  | { 
      type: 'field'; 
      category: keyof Action; 
      previousValue?: string; 
      value?: string; 
      previousCourtSide?: 'teamA'|'teamB'|'neutral'; 
      courtSide?: 'teamA'|'teamB'|'neutral';
      previousAreaPayload?: Partial<Action>;
      areaPayload?: Partial<Action>;
    }
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
  selectArea: (payload: AreaSelectionPayload) => void;
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
    enableRadialMenu: false,
    enableVideoGestures: true,
    swipeSensitivity: 0.03,
    doubleTapSeekStep: 3,
    liveScrub: false,
    showGestureOverlay: true,
    autoPlayAfterSeek: true,
    enableOutOfBoundsZones: true,
    areaPrecisionMode: 'normal',
    enableArrowAreaNavigation: true,
    areaAutoSelectOnArrow: true,
    
    enableScreenMarkingMode: true,
    screenMarkingKey: 'Alt',
    skillInputLayout: 'grid',
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
    hudEnableHapticFeedback: true,
    hudInteractionStyle: 'click',
    hudExperienceMode: 'auto',
    phoneScoutDensity: 'comfortable'
  });

  const [events, setEvents] = useLocalStorage<EventRow[]>('scout_events', []);

  useEffect(() => {
    setEvents(prevEvents => {
      if (!Array.isArray(prevEvents)) {
        return [];
      }
      const seenIds = new Set<string>();
      let changedAny = false;
      const migrated = prevEvents.map((row, index) => {
        let changed = false;
        let newRow = { ...row };

        // Fix legacy purely numeric IDs or duplicates
        if (!newRow.id) {
          newRow.id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`;
          changed = true;
        } else if (/^\d+$/.test(String(newRow.id)) || seenIds.has(String(newRow.id))) {
          newRow.id = `${newRow.id}-${index}-${Math.random().toString(36).slice(2, 11)}`;
          changed = true;
        }
        seenIds.add(String(newRow.id));

        if (!newRow.sportType) {
          newRow.sportType = 'volleyball';
          changed = true;
        }
        if (newRow.actions) {
          const seenActionIds = new Set<string>();
          newRow.actions = newRow.actions.map((act, i) => {
            let newAct = { ...act };
            if (!newAct.id) {
              newAct.id = `${Date.now()}-${index}-${i}-${Math.random().toString(36).slice(2, 11)}`;
              changed = true;
            } else if (/^\d+$/.test(String(newAct.id)) || seenActionIds.has(String(newAct.id))) {
              newAct.id = `${newAct.id}-${i}-${Math.random().toString(36).slice(2, 11)}`;
              changed = true;
            }
            seenActionIds.add(String(newAct.id));
            return newAct;
          });
        } else {
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
                id: `${Date.now()}-${index}-${i}-${Math.random().toString(36).slice(2, 11)}`,
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
        if (changed) changedAny = true;
        return newRow;
      });
      return changedAny ? migrated : prevEvents;
    });
  }, [setEvents]);

  const [currentActions, setCurrentActions] = useState<Action[]>([]);
  const [currentAction, setCurrentAction] = useState<Action>({});
  
  const [videoSourceType, setVideoSourceType] = useState<VideoSourceType>('local');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [videoTime, setVideoTime] = useState<number>(0);
  const videoTimeRef = useRef<number>(0);
  useEffect(() => {
    videoTimeRef.current = videoTime;
  }, [videoTime]);

  const getCurrentTimeRef = useRef<() => number>(() => videoTimeRef.current);
  const [seekRequest, setSeekRequest] = useState<number | null>(null);

  const [currentInputHistory, setCurrentInputHistory] = useState<InputHistoryItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [hudLastSavedText, setHudLastSavedText] = useState<string | null>(null);
  const [hudLastSavedAt, setHudLastSavedAt] = useState<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  useEffect(() => {
    const handleQuotaExceeded = (e: Event) => {
      const customEvent = e as CustomEvent;
      console.error(`localStorage quota exceeded for key: ${customEvent.detail?.key}`);
      showToast(settings.uiLanguage === 'th' 
        ? 'พื้นที่เก็บข้อมูลเต็ม! ไม่สามารถบันทึกข้อมูลได้ กรุณาลบโครงการที่ไม่ได้ใช้งาน' 
        : 'Storage quota exceeded! Cannot save data. Please delete unused projects.');
    };
    
    window.addEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
    return () => window.removeEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
  }, [showToast, settings.uiLanguage]);

  const updateActionField = useCallback((field: keyof Action, value: any, descriptorGroupId?: string) => {
    const isSame = descriptorGroupId 
      ? currentAction.descriptors?.[descriptorGroupId] === value 
      : currentAction[field] === value;
      
    const nextValue = isSame ? undefined : value;
    const previousValue = descriptorGroupId ? currentAction.descriptors?.[descriptorGroupId] : currentAction[field];
    
    const next = { 
      ...currentAction,
      descriptors: currentAction.descriptors ? { ...currentAction.descriptors } : {}
    };
    
    if (descriptorGroupId) {
      if (isSame) {
        delete next.descriptors[descriptorGroupId];
      } else {
        next.descriptors[descriptorGroupId] = value;
      }
    } else {
      (next as any)[field] = nextValue;
      if (field === 'skillCode') {
        next.descriptors = {};
        next.resultDetailCode = undefined;
      }
    }

    setCurrentAction(next);

    setCurrentInputHistory(hist => [...hist, {
      type: descriptorGroupId ? 'descriptor' : 'field',
      category: !descriptorGroupId ? field : undefined,
      groupId: descriptorGroupId,
      previousValue,
      value: nextValue
    } as any]);
  }, [currentAction]);

  const selectArea = useCallback((payload: AreaSelectionPayload) => {
    const isSame = currentAction.areaCode === payload.areaCode && currentAction.outZone === payload.outZone && currentAction.courtSide === payload.courtSide;
    
    const nextValueCode = isSame ? undefined : payload.areaCode;
    
    const next: Action = {
      ...currentAction,
      areaCode: nextValueCode,
      areaLabel: isSame ? undefined : payload.areaLabel,
      areaMode: isSame ? undefined : (payload.areaMode || 'normal'),
      courtSide: isSame ? undefined : payload.courtSide,
      gridX: isSame ? undefined : payload.gridX,
      gridY: isSame ? undefined : payload.gridY,
      pointX: isSame ? undefined : payload.pointX,
      pointY: isSame ? undefined : payload.pointY,
      outZone: isSame ? undefined : payload.outZone,
      areaResolution: isSame ? undefined : payload.areaResolution,
    };
    
    setCurrentAction(next);

    setCurrentInputHistory(hist => [...hist, {
      type: 'field',
      category: 'areaCode',
      previousValue: currentAction.areaCode,
      value: nextValueCode,
      previousCourtSide: currentAction.courtSide,
      courtSide: next.courtSide,
      previousAreaPayload: {
        areaCode: currentAction.areaCode,
        areaLabel: currentAction.areaLabel,
        areaMode: currentAction.areaMode,
        courtSide: currentAction.courtSide,
        gridX: currentAction.gridX,
        gridY: currentAction.gridY,
        pointX: currentAction.pointX,
        pointY: currentAction.pointY,
        outZone: currentAction.outZone,
        areaResolution: currentAction.areaResolution
      }
    }]);
  }, [currentAction]);

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
    const isThai = settings.uiLanguage === 'th';

    if (sportTemplate.teamsEnabled && !normalized.teamCode) return isThai ? 'กรุณาเลือกทีมก่อน' : 'Please select a team first';
    if (!normalized.skillCode) return isThai ? 'กรุณาเลือกทักษะก่อน' : 'Please select a skill first';
    if (!normalized.resultCode) return isThai ? 'กรุณาเลือกผลลัพธ์ก่อน' : 'Please select a result first';

    const skill = getSkillByCode(normalized.skillCode);
    const req = skill?.areaRequirement || 'optionalWhenOut';

    const descGroup = sportTemplate.descriptors?.[normalized.skillCode];
    if (descGroup) {
      for (const group of descGroup) {
        if (group.required && (!normalized.descriptors || !normalized.descriptors[group.id])) {
          return isThai ? `กรุณาเลือก ${group.thaiLabel}` : `Please select ${group.label}`;
        }
      }
    }

    if (req === 'never' || req === 'optional') return null;

    if (normalized.resultCode !== 'Out') {
      const hasArea = normalized.areaCode || normalized.areaLabel || (normalized.gridX !== undefined && normalized.gridY !== undefined) || (normalized.pointX !== undefined && normalized.pointY !== undefined) || normalized.outZone;
      if (!hasArea) {
        return isThai ? 'กรุณาเลือกพื้นที่ในสนามก่อน' : 'Please select a court area first';
      }
    }

    return null;
  };

  const isActionComplete = (action: Action) => {
    return getMissingActionMessage(action) === null;
  };

  const getActionText = (action: Action) => {
    let area = action.areaLabel || action.areaCode || (action.resultCode === 'Out' ? 'OUT' : undefined);
    if (action.outZone && OUT_ZONE_LABELS[action.outZone]) {
      area = OUT_ZONE_LABELS[action.outZone].label;
    } else if (action.areaCode && DETAILED_ZONE_LABELS[action.areaCode]) {
      area = DETAILED_ZONE_LABELS[action.areaCode].label;
    }
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

    let areaStr = action.areaLabel || area?.thaiName || areaCode;
    if (action.outZone && OUT_ZONE_LABELS[action.outZone]) {
      areaStr = OUT_ZONE_LABELS[action.outZone].thaiLabel;
    } else if (action.areaCode && DETAILED_ZONE_LABELS[action.areaCode]) {
      areaStr = DETAILED_ZONE_LABELS[action.areaCode].thaiLabel;
    }

    const parts = [
      team?.thaiName || team?.name || action.teamCode,
      skill?.thaiName || action.skillCode,
      areaStr,
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
        showToast(settings.uiLanguage === 'th' ? 'กรุณาเลือกข้อมูลให้ครบก่อนเพิ่ม Action' : 'Please select all required info before adding an action');
        return;
      }
      
      const normalized = normalizeActionBeforeCommit(actionToAdd);
      
      const finalVideoTime = getCurrentTimeRef.current();
      const completedAction: Action = {
        ...normalized,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        videoTime: normalized.videoTime !== undefined ? normalized.videoTime : finalVideoTime,
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
            if (last.previousAreaPayload) {
              const p = last.previousAreaPayload;
              if (p.areaCode === undefined) delete next.areaCode; else next.areaCode = p.areaCode;
              if (p.areaLabel === undefined) delete next.areaLabel; else next.areaLabel = p.areaLabel;
              if (p.areaMode === undefined) delete next.areaMode; else next.areaMode = p.areaMode;
              if (p.courtSide === undefined) delete next.courtSide; else next.courtSide = p.courtSide;
              if (p.gridX === undefined) delete next.gridX; else next.gridX = p.gridX;
              if (p.gridY === undefined) delete next.gridY; else next.gridY = p.gridY;
              if (p.pointX === undefined) delete next.pointX; else next.pointX = p.pointX;
              if (p.pointY === undefined) delete next.pointY; else next.pointY = p.pointY;
              if (p.outZone === undefined) delete next.outZone; else next.outZone = p.outZone;
              if (p.areaResolution === undefined) delete next.areaResolution; else next.areaResolution = p.areaResolution;
            } else {
              if (last.previousCourtSide === undefined) {
                delete next.courtSide;
              } else {
                next.courtSide = last.previousCourtSide;
              }
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
        showToast(settings.uiLanguage === 'th' ? 'กรุณาเลือกข้อมูลให้ครบก่อนบันทึก' : 'Please select all required info before saving');
        return;
      }
      
      const normalized = normalizeActionBeforeCommit(actionToSave);

      const finalVideoTime = getCurrentTimeRef.current();
      const completedAction: Action = {
        ...normalized,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        videoTime: normalized.videoTime !== undefined ? normalized.videoTime : finalVideoTime,
        videoTimeEnd: finalVideoTime,
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
    
    let sequenceStartTime = 0;
    let sequenceEndTime = 0;
    if (finalActions.length > 0) {
      sequenceStartTime = finalActions[0].videoTime ?? finalVideoTime;
      sequenceEndTime = lastAction.videoTimeEnd ?? lastAction.videoTime ?? finalVideoTime;
    }
    if (sequenceEndTime < sequenceStartTime) sequenceEndTime = sequenceStartTime;
    const duration = sequenceEndTime - sequenceStartTime;
    const clipStartTime = Math.max(0, sequenceStartTime - 3);
    const clipEndTime = sequenceEndTime + 3;

    const newRow: EventRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      no: events.length + 1,
      point: matchInfo.currentPoint,
      actions: finalActions,
      eventText,
      thaiMeaningText,
      extendedEventText,
      resultText,
      videoTime: sequenceStartTime,
      sequenceStartTime,
      sequenceEndTime,
      duration,
      clipStartTime,
      clipEndTime,
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
    const nextAction = { ...currentAction, resultCode };
    const missingMessage = getMissingActionMessage(nextAction);
    
    // Auto OUT logic
    if (missingMessage && resultCode === 'Out' && !nextAction.areaCode) {
      const finalNextAction: Action = {
        ...nextAction,
        areaCode: 'OUT',
        courtSide: 'neutral'
      };
      
      setCurrentAction(finalNextAction);
      
      if (isFastMode || isActionComplete(finalNextAction)) {
        saveEvent(finalNextAction);
      }
      return;
    }

    if (missingMessage && isFastMode) {
      setCurrentAction(nextAction);
      showToast(missingMessage);
      return;
    }

    if (!isFastMode && missingMessage) {
      setCurrentAction(nextAction);
      return; 
    }
    
    setCurrentAction(nextAction);
    if (resultCode === 'Pass') {
      addAction(nextAction);
    } else {
      saveEvent(nextAction);
    }
  }, [currentAction, getMissingActionMessage, isActionComplete, saveEvent, addAction, showToast]);

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

  const changeSportType = (newSport: SportType, force: boolean = false) => {
    const hasPending = currentActions.length > 0 || Object.keys(currentAction).some(k => k !== 'videoTime' && k !== 'teamCode');
    const isThai = settings.uiLanguage === 'th';
    if (hasPending && !force) {
      const confirmChange = window.confirm(
        isThai 
          ? 'การเปลี่ยนกีฬาอาจล้าง action ที่กำลังเลือก ต้องการเปลี่ยนหรือไม่' 
          : 'Changing the sport may clear your current action. Do you want to proceed?'
      );
      if (!confirmChange) return;
    }
    setMatchInfo(prev => ({ ...prev, sportType: newSport }));
    clearCurrentEvent();
    showToast(
      isThai 
        ? `เปลี่ยนเป็นโหมด ${SPORT_TEMPLATES[newSport].thaiName} แล้ว` 
        : `Switched to ${SPORT_TEMPLATES[newSport].name} mode`
    );
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
      hudLastSavedText, hudLastSavedAt, updateActionField, selectArea, commitResult
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
