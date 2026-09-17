import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { Team, Skill, Area, ResultType, Action, EventRow, MatchInfo, AppSettings, VideoSourceType, SportType, SportTemplate, AreaSelectionPayload } from '../types';
import { DEFAULT_TEAMS, DEFAULT_SKILLS, DEFAULT_AREAS, DEFAULT_RESULTS } from '../data';
import { SPORT_TEMPLATES, OUT_ZONE_LABELS, DETAILED_ZONE_LABELS } from '../sports';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
  captureVolleyballPathArea,
  getVolleyballSkillCapabilities,
  resetVolleyballActionForSkill,
  type VolleyballPathCaptureStage,
} from '../volleyball/volleyballActionContext';
import { resolveSportEvent } from '../sports/rules/registry';

export type InputHistoryItem = 
  | { 
      type: 'field'; 
      category: keyof Action; 
      previousValue?: Action[keyof Action]; 
      value?: Action[keyof Action]; 
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
  previewState: { isActive: boolean; eventRow: EventRow | null; loop: boolean } | null;
  setPreviewState: React.Dispatch<React.SetStateAction<{ isActive: boolean; eventRow: EventRow | null; loop: boolean } | null>>;

  saveEvent: (actionToSave?: Action) => void;
  addAction: (actionToAdd?: Action) => void;
  undoLastAction: () => void;
  clearCurrentEvent: () => void;
  deleteEventRow: (id: string) => void;
  updateEventRow: (id: string, updatedRow: EventRow) => void;
  toggleEventBookmark: (id: string) => void;
  updateEventBookmarkNote: (id: string, note: string) => void;
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
  volleyballPathStage: VolleyballPathCaptureStage;
  setVolleyballPathStage: (stage: VolleyballPathCaptureStage) => void;
  skipVolleyballTarget: () => void;
  setVolleyballSystemContext: (context?: 'in_system' | 'out_of_system') => void;
  hudLastSavedAt: number;
  updateActionField: (field: keyof Action, value: unknown, descriptorGroupId?: string) => void;
  updateActionPatch: (patch: Partial<Action>) => void;
  selectFoul: (foul?: import('../types').FoulOption) => void;
  clearFoul: () => void;
  commitSkillSelection: (payload: { skillCode: string; descriptorGroupId?: string; descriptorCode?: string }) => void;
  commitResult: (resultCode: string, isFastMode?: boolean, resultDetailCode?: string) => void;
  canUndoEventAction: boolean;
  clearEventHistory: () => void;
  saveEventsWithHistory: (updater: React.SetStateAction<EventRow[]>) => void;
  canRedoEventAction: boolean;
  undoEventAction: () => void;
  redoEventAction: () => void;
  editingEvent: EventRow | null;
  setEditingEvent: React.Dispatch<React.SetStateAction<EventRow | null>>;
  quickBookmarkCurrentMoment: (targetVideoTime?: number) => void;
  editLastEvent: () => void;
  undoLastSavedEvent: () => void;
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
    theme: 'light',
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
    workspaceExperience: 'classic',
    workbenchPreset: 'scout',
    
    // HUD Mode settings defaults
    enableScoutHUDMode: true,
    hudDefaultMode: 'classic',
    hudOverlayOpacity: 0.85,
    hudShowTopStats: true,
    hudShowVideoTime: true,
    hudShowActionStatus: true,
    hudShowVideoControls: true,
    hudAutoHideControls: false,
    hudMobileLargeButtons: true,
    hudEnableGameFeedback: true,
    hudEnableSoundFeedback: false,
    hudEnableHapticFeedback: true,
    hudInteractionStyle: 'click',
    hudExperienceMode: 'auto',
    phoneScoutDensity: 'comfortable',
    controllerV1Enabled: false,
    aiTrackingEnabled: false,
    aiTrackingMode: 'browser',
    aiTrackingServerUrl: 'ws://localhost:8000/ws/telemetry'
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
  const [volleyballPathStage, setVolleyballPathStageState] = useState<VolleyballPathCaptureStage>('start');
  const volleyballPathStageRef = useRef<VolleyballPathCaptureStage>('start');
  const setVolleyballPathStage = useCallback((stage: VolleyballPathCaptureStage) => {
    volleyballPathStageRef.current = stage;
    setVolleyballPathStageState(stage);
  }, []);
  
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
  const [previewState, setPreviewState] = useState<{ isActive: boolean; eventRow: EventRow | null; loop: boolean } | null>(null);

  const [currentInputHistory, setCurrentInputHistory] = useState<InputHistoryItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  
  const [pastEvents, setPastEvents] = useState<EventRow[][]>([]);
  const [futureEvents, setFutureEvents] = useState<EventRow[][]>([]);

  const canUndoEventAction = pastEvents.length > 0;
  const canRedoEventAction = futureEvents.length > 0;

  const undoEventAction = useCallback(() => {
    if (pastEvents.length === 0) return;
    const previous = pastEvents[pastEvents.length - 1];
    setPastEvents(prev => prev.slice(0, -1));
    setFutureEvents(prev => [events, ...prev]);
    setEvents(previous);
  }, [pastEvents, events]);

  const redoEventAction = useCallback(() => {
    if (futureEvents.length === 0) return;
    const next = futureEvents[0];
    setFutureEvents(prev => prev.slice(1));
    setPastEvents(prev => [...prev, events]);
    setEvents(next);
  }, [futureEvents, events]);

  const clearEventHistory = useCallback(() => {
    setPastEvents([]);
    setFutureEvents([]);
  }, []);

  const saveEventsWithHistory = useCallback((newEventsUpdater: React.SetStateAction<EventRow[]>) => {
    setEvents(prev => {
      const next = typeof newEventsUpdater === 'function' ? newEventsUpdater(prev) : newEventsUpdater;
      const renumbered = next.map((e: EventRow, index: number) => ({ ...e, no: index + 1 }));
      setPastEvents(p => [...p, prev].slice(-20));
      setFutureEvents([]);
      return renumbered;
    });
  }, []);

  const [hudLastSavedText, setHudLastSavedText] = useState<string | null>(null);
  const [hudLastSavedAt, setHudLastSavedAt] = useState<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
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

  const updateActionPatch = useCallback((patch: Partial<Action>) => {
    setCurrentAction(prev => ({ ...prev, ...patch }));
  }, []);

  const selectFoul = useCallback((foul?: import('../types').FoulOption) => {
    setCurrentAction(prev => {
      const isSame = prev.foulCode === foul?.code;
      const nextFoulCode = isSame ? undefined : foul?.code;
      const nextFoulRole = isSame ? undefined : foul?.role;
      const nextFoulSeverity = isSame ? undefined : foul?.severity;

      setCurrentInputHistory(hist => [...hist, {
        type: 'field',
        category: 'foulCode',
        previousValue: prev.foulCode,
        value: nextFoulCode
      } as InputHistoryItem]);

      return {
        ...prev,
        foulCode: nextFoulCode,
        foulRole: nextFoulRole,
        foulSeverity: nextFoulSeverity
      };
    });
  }, []);

  const clearFoul = useCallback(() => {
    setCurrentAction(prev => {
      setCurrentInputHistory(hist => [...hist, {
        type: 'field',
        category: 'foulCode',
        previousValue: prev.foulCode,
        value: undefined
      } as InputHistoryItem]);

      return {
        ...prev,
        foulCode: undefined,
        foulRole: undefined,
        foulSeverity: undefined
      };
    });
  }, []);

  const commitSkillSelection = useCallback((payload: { skillCode: string; descriptorGroupId?: string; descriptorCode?: string }) => {
    setCurrentAction(prev => {
      const isNewSkill = prev.skillCode !== payload.skillCode;
      const next: Action = matchInfo.sportType === 'volleyball'
        ? resetVolleyballActionForSkill(prev, payload.skillCode)
        : { ...prev, skillCode: payload.skillCode };

      if (isNewSkill) {
        next.descriptors = {};
        next.resultDetailCode = undefined;
      } else {
        next.descriptors = prev.descriptors ? { ...prev.descriptors } : {};
      }

      if (payload.descriptorGroupId && payload.descriptorCode) {
        next.descriptors[payload.descriptorGroupId] = payload.descriptorCode;
      }

      setCurrentInputHistory(hist => {
        const newHist = [...hist];
        if (isNewSkill) {
          newHist.push({
            type: 'field',
            category: 'skillCode',
            previousValue: prev.skillCode,
            value: payload.skillCode
          } as InputHistoryItem);
        }
        if (payload.descriptorGroupId && payload.descriptorCode) {
          newHist.push({
            type: 'descriptor',
            groupId: payload.descriptorGroupId,
            previousValue: prev.descriptors?.[payload.descriptorGroupId],
            value: payload.descriptorCode
          } as InputHistoryItem);
        }
        return newHist;
      });

      return next;
    });
  }, [matchInfo.sportType]);

  const updateActionField = useCallback((field: keyof Action, value: unknown, descriptorGroupId?: string) => {
    setCurrentAction(prevAction => {
      const isSame = descriptorGroupId 
        ? prevAction.descriptors?.[descriptorGroupId] === value 
        : prevAction[field] === value;
        
      const nextValue = isSame ? undefined : value;
      const previousValue = descriptorGroupId ? prevAction.descriptors?.[descriptorGroupId] : prevAction[field];
      
      const next = field === 'skillCode' && nextValue && matchInfo.sportType === 'volleyball'
        ? resetVolleyballActionForSkill(prevAction, String(nextValue))
        : {
            ...prevAction,
            descriptors: prevAction.descriptors ? { ...prevAction.descriptors } : {}
          };
      
      if (descriptorGroupId) {
        if (isSame) {
          delete next.descriptors[descriptorGroupId];
        } else {
          next.descriptors[descriptorGroupId] = String(value);
        }
      } else {
        (next as Record<string, unknown>)[field] = nextValue;
        if (field === 'skillCode') {
          next.descriptors = {};
          next.resultDetailCode = undefined;
        }
      }

      setCurrentInputHistory(hist => [...hist, {
        type: descriptorGroupId ? 'descriptor' : 'field',
        category: !descriptorGroupId ? field : undefined,
        groupId: descriptorGroupId,
        previousValue,
        value: nextValue
      } as InputHistoryItem]);

      return next;
    });
  }, [matchInfo.sportType]);

  useEffect(() => {
    setVolleyballPathStage('start');
  }, [currentAction.skillCode, settings.advancedDetailMode, matchInfo.sportType, setVolleyballPathStage]);

  const skipVolleyballTarget = useCallback(() => {
    setVolleyballPathStage('complete');
  }, [setVolleyballPathStage]);

  const setVolleyballSystemContext = useCallback((context?: 'in_system' | 'out_of_system') => {
    setCurrentAction(prev => {
      const capabilities = getVolleyballSkillCapabilities(prev.skillCode);
      if (matchInfo.sportType !== 'volleyball' || !capabilities?.supportsSystem) return prev;
      const previousPayload = prev.domainPayload?.type === 'volleyball'
        ? prev.domainPayload
        : { type: 'volleyball' as const, rallyPhase: capabilities.phase };
      const nextPayload = { ...previousPayload, rallyPhase: capabilities.phase };
      if (context === undefined || previousPayload.systemContext === context) delete nextPayload.systemContext;
      else nextPayload.systemContext = context;
      return { ...prev, domainPayload: nextPayload };
    });
  }, [matchInfo.sportType]);

  const selectArea = useCallback((rawPayload: AreaSelectionPayload) => {
    // Keep normalization and the path transition outside the React state updater.
    // React StrictMode may invoke updater functions more than once in development;
    // advancing the path stage inside the updater could otherwise skip Target.
    const payload = { ...rawPayload };

    // 1. Auto-enrich detailed zones if the areaCode matches a DETAILED_ZONE_LABEL
    if (payload.areaCode && DETAILED_ZONE_LABELS[payload.areaCode]) {
      const detailed = DETAILED_ZONE_LABELS[payload.areaCode];
      payload.gridX = payload.gridX !== undefined ? payload.gridX : detailed.gridX;
      payload.gridY = payload.gridY !== undefined ? payload.gridY : detailed.gridY;
      payload.areaMode = payload.areaMode || 'detailed';
      payload.areaResolution = payload.areaResolution || 'legacy-3x3';
      payload.areaLabel = payload.areaLabel || detailed.label;
      payload.areaCode = detailed.baseAreaCode;
    }

    // 2. Auto-enrich out-of-bounds zones.
    if (payload.outZone) {
      payload.areaResolution = payload.areaResolution || 'out-zone';
      payload.areaMode = payload.areaMode || 'normal';
      payload.courtSide = payload.courtSide || 'neutral';
      if (!payload.areaCode) payload.areaCode = 'OUT';
      if (!payload.areaLabel && OUT_ZONE_LABELS[payload.outZone]) {
        const isThai = settings.uiLanguage === 'th';
        payload.areaLabel = isThai ? OUT_ZONE_LABELS[payload.outZone].thaiLabel : OUT_ZONE_LABELS[payload.outZone].label;
      }
    } else if (payload.areaCode && ['OUT', 'LONG_OUT', 'SIDE_OUT', 'NET_ERR'].includes(payload.areaCode)) {
      payload.areaResolution = payload.areaResolution || 'out-zone';
      payload.areaMode = payload.areaMode || 'normal';
      payload.courtSide = payload.courtSide || 'neutral';
      if (!payload.outZone) payload.outZone = payload.areaCode === 'NET_ERR' ? 'net_error' : 'unknown';
    }

    // 3. Fill the remaining stable defaults.
    payload.areaMode = payload.areaMode || 'normal';
    payload.courtSide = payload.courtSide || 'neutral';
    payload.areaResolution = payload.areaResolution || 'normal';
    payload.courtViewMode = payload.courtViewMode || settings.areaCourtViewMode || 'auto';

    if (payload.areaCode && !payload.areaLabel) {
      const areaObj = areas.find(a => a.code === payload.areaCode);
      const isThai = settings.uiLanguage === 'th';
      payload.areaLabel = areaObj ? (isThai ? areaObj.thaiName : areaObj.code) : payload.areaCode;
    }

    const capabilities = getVolleyballSkillCapabilities(currentAction.skillCode);
    const isVolleyballDetailPath = matchInfo.sportType === 'volleyball'
      && settings.advancedDetailMode
      && Boolean(capabilities);
    if (isVolleyballDetailPath && volleyballPathStageRef.current !== 'complete') {
      const stage = volleyballPathStageRef.current === 'target' ? 'target' : 'start';
      const captured = captureVolleyballPathArea(currentAction, stage, payload);
      setCurrentInputHistory(hist => [...hist, {
        type: 'field',
        category: 'domainPayload',
        previousValue: currentAction.domainPayload,
        value: captured.action.domainPayload,
      }]);
      setCurrentAction(captured.action);
      setVolleyballPathStage(captured.nextStage);
      return;
    }
    if (isVolleyballDetailPath) return;

    setCurrentAction(prevAction => {
      const isSame = prevAction.areaCode === payload.areaCode && 
                     prevAction.outZone === payload.outZone && 
                     prevAction.courtSide === payload.courtSide &&
                     prevAction.gridX === payload.gridX &&
                     prevAction.gridY === payload.gridY &&
                     prevAction.courtViewMode === payload.courtViewMode;
      
      const nextValueCode = isSame ? undefined : payload.areaCode;
      
      const next: Action = {
        ...prevAction,
        areaCode: nextValueCode,
        areaLabel: isSame ? undefined : payload.areaLabel,
        areaMode: isSame ? undefined : payload.areaMode,
        courtSide: isSame ? undefined : payload.courtSide,
        gridX: isSame ? undefined : payload.gridX,
        gridY: isSame ? undefined : payload.gridY,
        pointX: isSame ? undefined : payload.pointX,
        pointY: isSame ? undefined : payload.pointY,
        outZone: isSame ? undefined : payload.outZone,
        areaResolution: isSame ? undefined : payload.areaResolution,
        courtViewMode: isSame ? undefined : payload.courtViewMode,
      };
      
      setCurrentInputHistory(hist => [...hist, {
        type: 'field',
        category: 'areaCode',
        previousValue: prevAction.areaCode,
        value: nextValueCode,
        previousCourtSide: prevAction.courtSide,
        courtSide: next.courtSide,
        previousAreaPayload: {
          areaCode: prevAction.areaCode,
          areaLabel: prevAction.areaLabel,
          areaMode: prevAction.areaMode,
          courtSide: prevAction.courtSide,
          gridX: prevAction.gridX,
          gridY: prevAction.gridY,
          pointX: prevAction.pointX,
          pointY: prevAction.pointY,
          outZone: prevAction.outZone,
          areaResolution: prevAction.areaResolution,
          courtViewMode: prevAction.courtViewMode,
        }
      }]);

      return next;
    });
  }, [settings.uiLanguage, settings.areaCourtViewMode, settings.advancedDetailMode, areas, matchInfo.sportType, currentAction, setVolleyballPathStage]);

  const clearCurrentEvent = useCallback(() => {
    setCurrentActions([]);
    setCurrentAction({});
    setCurrentInputHistory([]);
  }, []);

  const resetCurrentAction = useCallback(() => {
    setCurrentAction({});
    setCurrentInputHistory([]);
  }, []);

  const getSkillByCode = useCallback((skillCode?: string) => {
    return skills.find(s => s.code === skillCode);
  }, [skills]);

  const normalizeActionBeforeCommit = useCallback((action: Action): Action => {
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
  }, [getSkillByCode]);

  const getMissingActionMessage = useCallback((action: Action): string | null => {
    const normalized = normalizeActionBeforeCommit(action);
    const isThai = settings.uiLanguage === 'th';

    if (sportTemplate.teamsEnabled && !normalized.teamCode) {
      if (normalized.foulCode) {
        return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีมเพื่อบันทึกการฟาวล์' : 'Cannot save yet. Please select a team to record the foul.';
      }
      return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีม ทักษะ พื้นที่ และผลลัพธ์ให้ครบ' : 'Cannot save yet. Please select team, skill, area, and result.';
    }

    if (normalized.foulCode) {
      // If a foul is selected, it's a complete standalone action. No skill, result, or area is required.
      return null;
    }

    if (!normalized.skillCode) return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีม ทักษะ พื้นที่ และผลลัพธ์ให้ครบ' : 'Cannot save yet. Please select team, skill, area, and result.';
    if (!normalized.resultCode) return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีม ทักษะ พื้นที่ และผลลัพธ์ให้ครบ' : 'Cannot save yet. Please select team, skill, area, and result.';

    const skill = getSkillByCode(normalized.skillCode);
    const req = skill?.areaRequirement || 'optionalWhenOut';

    const descGroup = sportTemplate.descriptors?.[normalized.skillCode];
    if (descGroup) {
      for (const group of descGroup) {
        if (group.required && (!normalized.descriptors || !normalized.descriptors[group.id])) {
          return isThai ? `ยังบันทึกไม่ได้ กรุณาเลือก ${group.thaiLabel}` : `Cannot save yet. Please select ${group.label}`;
        }
      }
    }

    if (req !== 'never' && req !== 'optional') {
      const hasArea = normalized.areaCode || normalized.areaLabel || (normalized.gridX !== undefined && normalized.gridY !== undefined) || (normalized.pointX !== undefined && normalized.pointY !== undefined) || normalized.outZone;
      if (!hasArea && (req === 'always' || (req === 'optionalWhenOut' && normalized.resultCode !== 'Out'))) {
        return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกพื้นที่ในสนาม' : 'Cannot save yet. Please select a court area.';
      }
    }

    return null;
  }, [normalizeActionBeforeCommit, settings.uiLanguage, sportTemplate.teamsEnabled, sportTemplate.descriptors, getSkillByCode]);

  const isActionComplete = useCallback((action: Action) => {
    return getMissingActionMessage(action) === null;
  }, [getMissingActionMessage]);

  const getActionText = useCallback((action: Action) => {
    let area = action.areaLabel || action.areaCode || (action.resultCode === 'Out' ? 'OUT' : undefined);
    if (action.outZone && OUT_ZONE_LABELS[action.outZone]) {
      area = OUT_ZONE_LABELS[action.outZone].label;
    } else if (action.areaCode && DETAILED_ZONE_LABELS[action.areaCode]) {
      area = DETAILED_ZONE_LABELS[action.areaCode].label;
    }
    const parts = [
      action.teamCode, 
      action.skillCode, 
      ...(action.descriptors ? Object.values(action.descriptors) : []),
      area, 
      action.resultCode, 
      action.foulCode
    ];
    return parts.filter(Boolean).join(' / ');
  }, []);

  const getExtendedActionText = useCallback((action: Action) => {
    const base = getActionText(action);
    const details = [];
    if (action.playerNumber || action.playerName) {
      const playerStr = [action.playerNumber ? `#${action.playerNumber}` : '', action.playerName].filter(Boolean).join(' ');
      details.push(playerStr);
    }
    if (action.resultDetailCode) details.push(action.resultDetailCode);
    if (action.domainPayload?.type === 'volleyball') {
      const start = action.domainPayload.startArea?.outZone || action.domainPayload.startArea?.areaCode || action.outZone || action.areaCode;
      const target = action.domainPayload.targetArea?.outZone || action.domainPayload.targetArea?.areaCode;
      if (start && target) details.push(`${start}→${target}`);
      else if (start && action.domainPayload.startArea) details.push(`START:${start}`);
      if (action.domainPayload.systemContext) details.push(action.domainPayload.systemContext.toUpperCase().replace('_', '-'));
    }
    if (details.length > 0) {
      return base + ' / ' + details.join(' / ');
    }
    return base;
  }, [getActionText]);

  const getThaiMeaning = useCallback((action: Action) => {
    const team = teams.find(t => t.code === action.teamCode);
    const skill = skills.find(s => s.code === action.skillCode);
    const areaCode = action.areaCode || (action.resultCode === 'Out' ? 'OUT' : action.areaCode);
    const area = areas.find(a => a.code === areaCode);
    const result = results.find(r => r.code === action.resultCode);
    const foul = (sportTemplate.fouls || []).find(f => f.code === action.foulCode);
    const foulStr = foul ? (foul.labelTh || foul.label) : action.foulCode;

    let areaStr = action.areaLabel || area?.thaiName || areaCode;
    if (action.outZone && OUT_ZONE_LABELS[action.outZone]) {
      areaStr = OUT_ZONE_LABELS[action.outZone].thaiLabel;
    } else if (action.areaCode && DETAILED_ZONE_LABELS[action.areaCode]) {
      areaStr = DETAILED_ZONE_LABELS[action.areaCode].thaiLabel;
    }

    let descStrs: string[] = [];
    if (action.descriptors) {
      Object.entries(action.descriptors).forEach(([key, val]) => {
        // Find thaiLabel of the descriptor option
        for (const grp of Object.values(sportTemplate.descriptors || {})) {
          for (const g of grp) {
            if (g.id === key) {
              const opt = g.options.find(o => o.code === val);
              if (opt) descStrs.push(opt.thaiLabel);
            }
          }
        }
      });
    }

    const parts = [
      team?.thaiName || team?.name || action.teamCode,
      skill?.thaiName || action.skillCode,
      ...descStrs,
      areaStr,
      result?.thaiName || action.resultCode,
      foulStr,
    ];

    const base = parts.filter(Boolean).join(' / ');

    const details = [];
    if (action.playerNumber || action.playerName) {
      const playerStr = [action.playerNumber ? `เบอร์ ${action.playerNumber}` : '', action.playerName].filter(Boolean).join(' ');
      details.push(playerStr);
    }
    if (details.length > 0) {
      return base + ' / ' + details.join(' / ');
    }
    return base;
  }, [teams, skills, areas, results, sportTemplate.fouls, sportTemplate.descriptors]);

  const addAction = useCallback((actionToAdd: Action = currentAction) => {
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
  }, [currentAction, isActionComplete, settings.uiLanguage, normalizeActionBeforeCommit, getCurrentTimeRef]);

  const undoLastAction = useCallback(() => {
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
            (next as Record<string, unknown>)[last.category] = last.previousValue;
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
               if (p.courtViewMode === undefined) delete next.courtViewMode; else next.courtViewMode = p.courtViewMode;
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
  }, [currentInputHistory, currentAction, currentActions]);

  const saveEvent = useCallback((actionToSave: Action = currentAction) => {
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
    else if (lastAction.foulCode) resultText = '-1'; // Standalone fouls represent lost points/errors

    const finalVideoTime = getCurrentTimeRef.current();
    
    let sequenceStartTime = finalVideoTime;
    let sequenceEndTime = finalVideoTime;
    if (finalActions.length > 0) {
      sequenceStartTime = finalActions[0].videoTime ?? finalVideoTime;
      sequenceEndTime = lastAction.videoTimeEnd ?? lastAction.videoTime ?? finalVideoTime;
    }
    if (sequenceEndTime < sequenceStartTime) sequenceEndTime = sequenceStartTime;
    const sequenceDuration = sequenceEndTime - sequenceStartTime;
    const previewStartTime = Math.max(0, sequenceStartTime - 2);
    const previewEndTime = sequenceEndTime + 3;
    
    // Legacy fields for backward compatibility
    const duration = sequenceDuration;
    const clipStartTime = previewStartTime;
    const clipEndTime = previewEndTime;

    // Resolve sport-specific scoring and semantics
    const eventResolution = resolveSportEvent(
      finalActions,
      {
        sportType: matchInfo.sportType,
        teamCodes: [teams[0]?.code || 'A', teams[1]?.code || 'B'],
        activeTeamCode: finalActions[0]?.teamCode,
      }
    );

    const populatedActions = finalActions.map((action, idx) => {
      const actRes = eventResolution.actionResolutions[idx];
      return {
        ...action,
        outcomeStatus: actRes?.outcomeStatus ?? action.outcomeStatus,
        scoreDelta: actRes?.scoreDelta ?? action.scoreDelta,
      };
    });

    const newRow: EventRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      no: events.length + 1,
      point: matchInfo.currentPoint,
      actions: populatedActions,
      eventText,
      thaiMeaningText,
      extendedEventText,
      resultText,
      scoreDelta: eventResolution.scoreDelta,
      outcomeStatus: eventResolution.outcomeStatus,
      rallyId: `rally-${matchInfo.currentPoint}`,
      videoTime: sequenceStartTime,
      sequenceStartTime,
      sequenceEndTime,
      sequenceDuration,
      previewStartTime,
      previewEndTime,
      duration,
      clipStartTime,
      clipEndTime,
      videoSourceType,
      youtubeVideoId: videoSourceType === 'youtube' && youtubeVideoId ? youtubeVideoId : undefined,
      videoId: videoSourceType === 'youtube' && youtubeVideoId ? youtubeVideoId : undefined,
      videoUrl: videoSourceType === 'youtube' ? youtubeUrl : undefined,
      localFileName: videoSourceType === 'local' && localFileName ? localFileName : undefined,
      sportType: matchInfo.sportType,
      createdAt: new Date().toISOString(),
    };

    saveEventsWithHistory(prev => {
      const nextEvents = [...prev, newRow];
      return nextEvents.map((e, index) => ({ ...e, no: index + 1 }));
    });
    
    // HUD visual flash
    setHudLastSavedText(eventText);
    setHudLastSavedAt(Date.now());
    if (hudTimerRef.current !== null) {
      window.clearTimeout(hudTimerRef.current);
    }
    hudTimerRef.current = window.setTimeout(() => {
      setHudLastSavedAt(prev => {
        if (Date.now() - prev > 1900) setHudLastSavedText(null);
        return prev;
      });
      hudTimerRef.current = null;
    }, 2000);

    clearCurrentEvent();

    if (settings.autoNextPoint && (resultText === '+1' || resultText === '-1')) {
      setMatchInfo(prev => ({ ...prev, currentPoint: prev.currentPoint + 1 }));
    }
  }, [currentActions, currentAction, isActionComplete, settings.uiLanguage, settings.autoNextPoint, normalizeActionBeforeCommit, getCurrentTimeRef, getActionText, getThaiMeaning, getExtendedActionText, matchInfo, saveEventsWithHistory, setMatchInfo, showToast]);

  const commitResult = useCallback((resultCode: string, isFastMode: boolean = false, resultDetailCode?: string) => {
    const nextAction = { ...currentAction, resultCode, resultDetailCode };
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

  const deleteEventRow = useCallback((id: string) => {
    saveEventsWithHistory(prev => prev.filter(e => e.id !== id));
  }, [saveEventsWithHistory]);

  const updateEventRow = useCallback((id: string, updatedRow: EventRow) => {
    saveEventsWithHistory(prev => prev.map(e => (e.id === id ? updatedRow : e)));
  }, [saveEventsWithHistory]);

  const toggleEventBookmark = useCallback((id: string) => {
    saveEventsWithHistory(prev =>
      prev.map(e => {
        if (e.id !== id) return e;
        if (e.isBookmarked) {
          const { isBookmarked, bookmarkNote, bookmarkedAt, ...rest } = e;
          void isBookmarked;
          void bookmarkNote;
          void bookmarkedAt;
          return rest;
        }
        return {
          ...e,
          isBookmarked: true,
          bookmarkedAt: new Date().toISOString(),
        };
      })
    );
  }, [saveEventsWithHistory]);

  const updateEventBookmarkNote = useCallback((id: string, note: string) => {
    saveEventsWithHistory(prev =>
      prev.map(e =>
        e.id === id
          ? {
              ...e,
              isBookmarked: true,
              bookmarkNote: note,
              bookmarkedAt: e.bookmarkedAt || new Date().toISOString(),
            }
          : e
      )
    );
  }, [saveEventsWithHistory]);

  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const quickBookmarkCurrentMoment = useCallback((targetVideoTime?: number) => {
    const time = typeof targetVideoTime === 'number' ? targetVideoTime : getCurrentTimeRef.current();
    if (events.length === 0) {
      const newEvent: EventRow = {
        id: `km-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        no: 1,
        point: 0,
        resultText: '0',
        videoTime: time,
        isBookmarked: true,
        eventText: 'Key Moment',
        thaiMeaningText: 'เหตุการณ์สำคัญ',
        actions: [],
        createdAt: new Date().toISOString(),
      };
      saveEventsWithHistory([newEvent]);
      showToast(settings.uiLanguage === 'th' ? 'บันทึกเป็นเหตุการณ์สำคัญแล้ว' : 'Saved to Key Moments');
      return;
    }

    let targetEvent: EventRow | null = null;
    let minDiff = 3.0;
    for (const ev of events) {
      if (typeof ev.videoTime === 'number') {
        const diff = Math.abs(ev.videoTime - time);
        if (diff < minDiff) {
          minDiff = diff;
          targetEvent = ev;
        }
      }
    }
    if (!targetEvent) {
      targetEvent = events[events.length - 1];
    }

    toggleEventBookmark(targetEvent.id);
    const willBeBookmarked = !targetEvent.isBookmarked;
    showToast(
      willBeBookmarked
        ? (settings.uiLanguage === 'th' ? `บันทึกเป็นเหตุการณ์สำคัญแล้ว (#${targetEvent.no})` : `Saved to Key Moments (#${targetEvent.no})`)
        : (settings.uiLanguage === 'th' ? `นำออกจากเหตุการณ์สำคัญแล้ว (#${targetEvent.no})` : `Removed from Key Moments (#${targetEvent.no})`)
    );
  }, [events, saveEventsWithHistory, toggleEventBookmark, settings.uiLanguage, showToast, getCurrentTimeRef]);

  const editLastEvent = useCallback(() => {
    if (events.length === 0) {
      showToast(settings.uiLanguage === 'th' ? 'ยังไม่มีเหตุการณ์สำหรับแก้ไข' : 'No event available to edit');
      return;
    }
    const last = events[events.length - 1];
    setEditingEvent(last);
  }, [events, showToast, settings.uiLanguage]);

  const undoLastSavedEvent = useCallback(() => {
    if (currentActions.length > 0 || Object.keys(currentAction).length > 0) {
      undoLastAction();
      return;
    }
    if (canUndoEventAction) {
      undoEventAction();
      showToast(settings.uiLanguage === 'th' ? 'ยกเลิกเหตุการณ์ล่าสุดแล้ว' : 'Undid last event');
      return;
    }
    if (events.length > 0) {
      const removed = events[events.length - 1];
      saveEventsWithHistory(prev => prev.slice(0, -1));
      showToast(settings.uiLanguage === 'th' ? `ยกเลิกเหตุการณ์ล่าสุดแล้ว (#${removed.no})` : `Undid last event (#${removed.no})`);
    }
  }, [currentActions.length, currentAction, undoLastAction, canUndoEventAction, undoEventAction, events, saveEventsWithHistory, showToast, settings.uiLanguage]);

  useEffect(() => {
    const handleQuickBookmarkEvent = (e: Event) => {
      const custom = e as CustomEvent<{ time?: number }>;
      quickBookmarkCurrentMoment(custom.detail?.time);
    };
    window.addEventListener('scout-quick-bookmark', handleQuickBookmarkEvent);
    return () => window.removeEventListener('scout-quick-bookmark', handleQuickBookmarkEvent);
  }, [quickBookmarkCurrentMoment]);

  const changeSportType = useCallback((newSport: SportType, force: boolean = false) => {
    const isThai = settings.uiLanguage === 'th';
    if (events.length > 0 && !force) {
      showToast(
        isThai
          ? 'ไม่สามารถเปลี่ยนชนิดกีฬาได้ เพราะมีข้อมูลที่บันทึกไว้แล้ว หากต้องการเปลี่ยนกีฬา กรุณาสร้างโปรเจคใหม่'
          : 'Sport type is locked because events have already been recorded. Create a new project to change sport.'
      );
      return;
    }
    const hasPending = currentActions.length > 0 || Object.keys(currentAction).some(k => k !== 'videoTime' && k !== 'teamCode');
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
  }, [settings.uiLanguage, events.length, currentActions.length, currentAction, setMatchInfo, clearCurrentEvent, showToast]);

  useEffect(() => {
    // Migration from old darkMode
    if (settings.theme === undefined) {
      setSettings(prev => ({ ...prev, theme: prev.darkMode ? 'dark' : 'light' }));
    }

    document.documentElement.classList.remove('dark', 'theme-monochrome');
    
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (settings.theme === 'monochrome') {
      document.documentElement.classList.add('theme-monochrome');
    } else if (settings.theme === undefined && settings.darkMode) {
      document.documentElement.classList.add('dark');
    }
  }, [settings.theme, settings.darkMode]);

  return (
    <ScoutContext.Provider value={{
      teams, setTeams, skills, areas, results,
      matchInfo, setMatchInfo,
      settings, setSettings,
      events, setEvents, saveEventsWithHistory, clearEventHistory,
      currentActions, setCurrentActions,
      currentAction, setCurrentAction,
      videoTime, setVideoTime, getCurrentTimeRef,
      videoSourceType, setVideoSourceType,
      youtubeVideoId, setYoutubeVideoId,
      youtubeUrl, setYoutubeUrl,
      localFileName, setLocalFileName,
      seekRequest, setSeekRequest,
      previewState, setPreviewState,
      saveEvent, addAction, undoLastAction, clearCurrentEvent,
      deleteEventRow, updateEventRow, toggleEventBookmark, updateEventBookmarkNote,
      isActionComplete, getActionText, getExtendedActionText, getThaiMeaning, resetCurrentAction,
      sportTemplate, changeSportType,
      currentInputHistory, setCurrentInputHistory, getMissingActionMessage,
      toastMessage, showToast,
      hudLastSavedText, hudLastSavedAt, updateActionField, updateActionPatch, selectFoul, clearFoul, commitSkillSelection, selectArea,
      volleyballPathStage, setVolleyballPathStage, skipVolleyballTarget, setVolleyballSystemContext, commitResult,
      canUndoEventAction, canRedoEventAction, undoEventAction, redoEventAction,
      editingEvent, setEditingEvent, quickBookmarkCurrentMoment, editLastEvent, undoLastSavedEvent
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
