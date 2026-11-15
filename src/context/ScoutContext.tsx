import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  Action,
  AppSettings,
  Area,
  AreaSelectionPayload,
  EventRow,
  FoulOption,
  MatchInfo,
  ResultType,
  Skill,
  SportTemplate,
  SportType,
  Team,
  VideoSourceType,
} from '../types';
import { DEFAULT_TEAMS } from '../data';
import { SPORT_TEMPLATES } from '../sports';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { readLegacyLocalStorageJson } from '../utils/legacyStorage';
import type { VolleyballPathCaptureStage } from '../volleyball/volleyballActionContext';
import { resolveSportEvent } from '../sports/rules/registry';
import { useConfirmDialog } from './ConfirmContext';
import { VideoTimeProvider, useVideoTime, type VideoPreviewState } from './VideoTimeContext';
import { EventHistoryProvider, useEventHistory } from './EventHistoryContext';
import { ActionDraftProvider, useActionDraft, type InputHistoryItem } from './ActionDraftContext';

export { useVideoTime, useEventHistory, useActionDraft };
export type { InputHistoryItem, VideoPreviewState };

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
  previewState: VideoPreviewState;
  setPreviewState: React.Dispatch<React.SetStateAction<VideoPreviewState>>;

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
  changeSportType: (newSport: SportType, force?: boolean) => Promise<void>;
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
  selectFoul: (foul?: FoulOption) => void;
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

const DEFAULT_MATCH_INFO: MatchInfo = {
  scouterName: '',
  nickname: '',
  matchName: '',
  matchType: 'Team',
  setOrGame: '1',
  currentPoint: 1,
  sportType: 'volleyball',
};

const DEFAULT_APP_SETTINGS: AppSettings = {
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
  workspaceExperience: 'workstation',
  workbenchPreset: 'scout',

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
};

const ScoutContext = createContext<ScoutContextType | undefined>(undefined);

interface ScoutBridgeProps {
  children: ReactNode;
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  matchInfo: MatchInfo;
  setMatchInfo: React.Dispatch<React.SetStateAction<MatchInfo>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  sportTemplate: SportTemplate;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

function ScoutBridge({
  children,
  teams,
  setTeams,
  matchInfo,
  setMatchInfo,
  settings,
  setSettings,
  sportTemplate,
  toastMessage,
  showToast,
}: ScoutBridgeProps) {
  const {
    videoSourceType,
    setVideoSourceType,
    youtubeVideoId,
    setYoutubeVideoId,
    youtubeUrl,
    setYoutubeUrl,
    localFileName,
    setLocalFileName,
    videoTime,
    setVideoTime,
    getCurrentTimeRef,
    seekRequest,
    setSeekRequest,
    previewState,
    setPreviewState,
  } = useVideoTime();

  const {
    events,
    setEvents,
    eventsRef,
    saveEventsWithHistory,
    clearEventHistory,
    canUndoEventAction,
    canRedoEventAction,
    undoEventAction,
    redoEventAction,
    deleteEventRow,
    updateEventRow,
    toggleEventBookmark,
    updateEventBookmarkNote,
    editingEvent,
    setEditingEvent,
  } = useEventHistory();

  const {
    currentActions,
    setCurrentActions,
    currentAction,
    setCurrentAction,
    currentInputHistory,
    setCurrentInputHistory,
    volleyballPathStage,
    setVolleyballPathStage,
    skipVolleyballTarget,
    setVolleyballSystemContext,
    hudLastSavedText,
    hudLastSavedAt,
    triggerHudSavedFlash,
    updateActionField,
    updateActionPatch,
    selectFoul,
    clearFoul,
    commitSkillSelection,
    selectArea,
    addAction,
    undoLastAction,
    clearCurrentEvent,
    resetCurrentAction,
    normalizeActionBeforeCommit,
    getMissingActionMessage,
    isActionComplete,
    getActionText,
    getExtendedActionText,
    getThaiMeaning,
  } = useActionDraft();

  const { confirm, confirmDialog } = useConfirmDialog();
  const { skills, areas, results } = sportTemplate;

  const saveEvent = useCallback((actionToSave: Action = currentAction) => {
    const finalActions = [...currentActions];
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
        realTime: Date.now(),
      };
      finalActions.push(completedAction);
    }

    if (finalActions.length === 0) return;

    setCurrentInputHistory([]);

    const eventText = finalActions.map(a => getActionText(a)).join(' / ');
    const thaiMeaningText = finalActions.map(a => getThaiMeaning(a)).join(' / ');
    const extendedEventText = finalActions.map(a => getExtendedActionText(a)).join(' / ');

    const lastAction = finalActions[finalActions.length - 1];
    let resultText: '+1' | '-1' | '0' = '0';
    if (lastAction.resultCode === 'Yes') resultText = '+1';
    else if (lastAction.resultCode === 'Out') resultText = '-1';
    else if (lastAction.resultCode === 'Pass') resultText = '0';
    else if (lastAction.foulCode) resultText = '-1';

    const finalVideoTime = getCurrentTimeRef.current();
    const sequenceStartTime = finalActions[0].videoTime ?? finalVideoTime;
    let sequenceEndTime = lastAction.videoTimeEnd ?? lastAction.videoTime ?? finalVideoTime;
    if (sequenceEndTime < sequenceStartTime) sequenceEndTime = sequenceStartTime;

    const sequenceDuration = sequenceEndTime - sequenceStartTime;
    const previewStartTime = Math.max(0, sequenceStartTime - 2);
    const previewEndTime = sequenceEndTime + 3;

    const eventResolution = resolveSportEvent(finalActions, {
      sportType: matchInfo.sportType,
      teamCodes: [teams[0]?.code || 'A', teams[1]?.code || 'B'],
      activeTeamCode: finalActions[0]?.teamCode,
    });

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
      no: eventsRef.current.length + 1,
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
      duration: sequenceDuration,
      clipStartTime: previewStartTime,
      clipEndTime: previewEndTime,
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
      return nextEvents.map((row, index) => ({ ...row, no: index + 1 }));
    });

    triggerHudSavedFlash(eventText);
    clearCurrentEvent();

    if (settings.autoNextPoint && (resultText === '+1' || resultText === '-1')) {
      setMatchInfo(prev => ({ ...prev, currentPoint: prev.currentPoint + 1 }));
    }
  }, [
    currentActions,
    currentAction,
    isActionComplete,
    settings.uiLanguage,
    settings.autoNextPoint,
    normalizeActionBeforeCommit,
    getCurrentTimeRef,
    setCurrentInputHistory,
    getActionText,
    getThaiMeaning,
    getExtendedActionText,
    matchInfo.sportType,
    matchInfo.currentPoint,
    teams,
    eventsRef,
    videoSourceType,
    youtubeVideoId,
    youtubeUrl,
    localFileName,
    saveEventsWithHistory,
    triggerHudSavedFlash,
    clearCurrentEvent,
    setMatchInfo,
    showToast,
  ]);

  const commitResult = useCallback((resultCode: string, isFastMode: boolean = false, resultDetailCode?: string) => {
    const nextAction = { ...currentAction, resultCode, resultDetailCode };
    const missingMessage = getMissingActionMessage(nextAction);

    if (missingMessage && resultCode === 'Out' && !nextAction.areaCode) {
      const finalNextAction: Action = {
        ...nextAction,
        areaCode: 'OUT',
        courtSide: 'neutral',
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
  }, [currentAction, getMissingActionMessage, isActionComplete, saveEvent, addAction, showToast, setCurrentAction]);

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
        : (settings.uiLanguage === 'th' ? `นำออกจากเหตุการณ์สำคัญแล้ว (#${targetEvent.no})` : `Removed from Key Moments (#${targetEvent.no})`),
    );
  }, [events, saveEventsWithHistory, toggleEventBookmark, settings.uiLanguage, showToast, getCurrentTimeRef]);

  const editLastEvent = useCallback(() => {
    if (events.length === 0) {
      showToast(settings.uiLanguage === 'th' ? 'ยังไม่มีเหตุการณ์สำหรับแก้ไข' : 'No event available to edit');
      return;
    }
    const last = events[events.length - 1];
    setEditingEvent(last);
  }, [events, showToast, settings.uiLanguage, setEditingEvent]);

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

  const changeSportType = useCallback(async (newSport: SportType, force: boolean = false) => {
    const isThai = settings.uiLanguage === 'th';
    if (events.length > 0 && !force) {
      showToast(
        isThai
          ? 'ไม่สามารถเปลี่ยนชนิดกีฬาได้ เพราะมีข้อมูลที่บันทึกไว้แล้ว หากต้องการเปลี่ยนกีฬา กรุณาสร้างโปรเจคใหม่'
          : 'Sport type is locked because events have already been recorded. Create a new project to change sport.',
      );
      return;
    }
    const hasPending = currentActions.length > 0 || Object.keys(currentAction).some(k => k !== 'videoTime' && k !== 'teamCode');
    if (hasPending && !force) {
      const confirmed = await confirm({
        title: isThai ? 'เปลี่ยนชนิดกีฬา' : 'Change Sport',
        message: isThai
          ? 'การเปลี่ยนกีฬาอาจล้าง action ที่กำลังเลือก ต้องการเปลี่ยนหรือไม่'
          : 'Changing the sport may clear your current action. Do you want to proceed?',
        confirmLabel: isThai ? 'เปลี่ยนกีฬา' : 'Change Sport',
        cancelLabel: isThai ? 'ยกเลิก' : 'Cancel',
        tone: 'warning',
        language: isThai ? 'th' : 'en',
      });
      if (!confirmed) return;
    }
    setMatchInfo(prev => ({ ...prev, sportType: newSport }));
    clearCurrentEvent();
    showToast(
      isThai
        ? `เปลี่ยนเป็นโหมด ${SPORT_TEMPLATES[newSport].thaiName} แล้ว`
        : `Switched to ${SPORT_TEMPLATES[newSport].name} mode`,
    );
  }, [settings.uiLanguage, events.length, currentActions.length, currentAction, confirm, setMatchInfo, clearCurrentEvent, showToast]);

  return (
    <ScoutContext.Provider
      value={{
        teams,
        setTeams,
        skills,
        areas,
        results,
        matchInfo,
        setMatchInfo,
        settings,
        setSettings,
        events,
        setEvents,
        saveEventsWithHistory,
        clearEventHistory,
        currentActions,
        setCurrentActions,
        currentAction,
        setCurrentAction,
        videoTime,
        setVideoTime,
        getCurrentTimeRef,
        videoSourceType,
        setVideoSourceType,
        youtubeVideoId,
        setYoutubeVideoId,
        youtubeUrl,
        setYoutubeUrl,
        localFileName,
        setLocalFileName,
        seekRequest,
        setSeekRequest,
        previewState,
        setPreviewState,
        saveEvent,
        addAction,
        undoLastAction,
        clearCurrentEvent,
        deleteEventRow,
        updateEventRow,
        toggleEventBookmark,
        updateEventBookmarkNote,
        isActionComplete,
        getActionText,
        getExtendedActionText,
        getThaiMeaning,
        resetCurrentAction,
        sportTemplate,
        changeSportType,
        currentInputHistory,
        setCurrentInputHistory,
        getMissingActionMessage,
        toastMessage,
        showToast,
        hudLastSavedText,
        hudLastSavedAt,
        updateActionField,
        updateActionPatch,
        selectFoul,
        clearFoul,
        commitSkillSelection,
        selectArea,
        volleyballPathStage,
        setVolleyballPathStage,
        skipVolleyballTarget,
        setVolleyballSystemContext,
        commitResult,
        canUndoEventAction,
        canRedoEventAction,
        undoEventAction,
        redoEventAction,
        editingEvent,
        setEditingEvent,
        quickBookmarkCurrentMoment,
        editLastEvent,
        undoLastSavedEvent,
      }}
    >
      {children}
      {confirmDialog}
    </ScoutContext.Provider>
  );
}

function ScoutDomainCoordinator({ children }: { children: ReactNode }) {
  // Teams and match info are owned by IndexedDB projectRepository via WorkspaceContext;
  // legacy localStorage keys are only read once on startup as recovery fallback.
  const [teams, setTeams] = useState<Team[]>(() => {
    const legacy = readLegacyLocalStorageJson<unknown>('scout_teams', DEFAULT_TEAMS);
    return Array.isArray(legacy) && legacy.length > 0 ? (legacy as Team[]) : DEFAULT_TEAMS;
  });
  const [matchInfo, setMatchInfo] = useState<MatchInfo>(() => {
    const legacy = readLegacyLocalStorageJson<unknown>('scout_match_info', {});
    return legacy && typeof legacy === 'object' && !Array.isArray(legacy)
      ? { ...DEFAULT_MATCH_INFO, ...(legacy as Partial<MatchInfo>) }
      : DEFAULT_MATCH_INFO;
  });
  const [settings, setSettings] = useLocalStorage<AppSettings>('scout_settings', DEFAULT_APP_SETTINGS);

  const sportTemplate = SPORT_TEMPLATES[matchInfo.sportType || 'volleyball'] || SPORT_TEMPLATES.volleyball;
  const { getCurrentTimeRef } = useVideoTime();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

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
      showToast(
        settings.uiLanguage === 'th'
          ? 'พื้นที่เก็บข้อมูลเต็ม! ไม่สามารถบันทึกข้อมูลได้ กรุณาลบโครงการที่ไม่ได้ใช้งาน'
          : 'Storage quota exceeded! Cannot save data. Please delete unused projects.',
      );
    };

    window.addEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
    return () => window.removeEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
  }, [showToast, settings.uiLanguage]);

  useEffect(() => {
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
  }, [settings.theme, settings.darkMode, setSettings]);

  return (
    <ActionDraftProvider
      teams={teams}
      matchInfo={matchInfo}
      sportTemplate={sportTemplate}
      uiLanguage={settings.uiLanguage}
      advancedDetailMode={settings.advancedDetailMode}
      areaCourtViewMode={settings.areaCourtViewMode}
      getCurrentTimeRef={getCurrentTimeRef}
      showToast={showToast}
    >
      <ScoutBridge
        teams={teams}
        setTeams={setTeams}
        matchInfo={matchInfo}
        setMatchInfo={setMatchInfo}
        settings={settings}
        setSettings={setSettings}
        sportTemplate={sportTemplate}
        toastMessage={toastMessage}
        showToast={showToast}
      >
        {children}
      </ScoutBridge>
    </ActionDraftProvider>
  );
}

/**
 * Backward-compatible facade provider composing VideoTime, EventHistory, and ActionDraft contexts.
 */
export function ScoutProvider({ children }: { children: ReactNode }) {
  return (
    <VideoTimeProvider>
      <EventHistoryProvider>
        <ScoutDomainCoordinator>{children}</ScoutDomainCoordinator>
      </EventHistoryProvider>
    </VideoTimeProvider>
  );
}

export const useScoutContext = () => {
  const ctx = useContext(ScoutContext);
  if (!ctx) throw new Error('useScoutContext must be used within ScoutProvider');
  return ctx;
};
