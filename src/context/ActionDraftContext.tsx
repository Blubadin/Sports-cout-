import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  type Action,
  type AreaSelectionPayload,
  type FoulOption,
  type MatchInfo,
  type SportTemplate,
  type Team,
} from '../types';
import { OUT_ZONE_LABELS, DETAILED_ZONE_LABELS } from '../sports';
import {
  captureVolleyballPathArea,
  getVolleyballSkillCapabilities,
  resetVolleyballActionForSkill,
  type VolleyballPathCaptureStage,
} from '../volleyball/volleyballActionContext';

export type InputHistoryItem =
  | {
      type: 'field';
      category: keyof Action;
      previousValue?: Action[keyof Action];
      value?: Action[keyof Action];
      previousCourtSide?: 'teamA' | 'teamB' | 'neutral';
      courtSide?: 'teamA' | 'teamB' | 'neutral';
      previousAreaPayload?: Partial<Action>;
      areaPayload?: Partial<Action>;
    }
  | { type: 'descriptor'; groupId: string; previousValue?: string; value?: string };

export interface ActionDraftContextType {
  currentActions: Action[];
  setCurrentActions: React.Dispatch<React.SetStateAction<Action[]>>;
  currentAction: Action;
  setCurrentAction: React.Dispatch<React.SetStateAction<Action>>;
  currentInputHistory: InputHistoryItem[];
  setCurrentInputHistory: React.Dispatch<React.SetStateAction<InputHistoryItem[]>>;
  volleyballPathStage: VolleyballPathCaptureStage;
  setVolleyballPathStage: (stage: VolleyballPathCaptureStage) => void;
  skipVolleyballTarget: () => void;
  setVolleyballSystemContext: (context?: 'in_system' | 'out_of_system') => void;
  hudLastSavedText: string | null;
  hudLastSavedAt: number;
  triggerHudSavedFlash: (text: string) => void;
  updateActionField: (field: keyof Action, value: unknown, descriptorGroupId?: string) => void;
  updateActionPatch: (patch: Partial<Action>) => void;
  selectFoul: (foul?: FoulOption) => void;
  clearFoul: () => void;
  commitSkillSelection: (payload: { skillCode: string; descriptorGroupId?: string; descriptorCode?: string }) => void;
  selectArea: (payload: AreaSelectionPayload) => void;
  addAction: (actionToAdd?: Action) => void;
  undoLastAction: () => void;
  clearCurrentEvent: () => void;
  resetCurrentAction: () => void;
  normalizeActionBeforeCommit: (action: Action) => Action;
  getMissingActionMessage: (action: Action) => string | null;
  isActionComplete: (action: Action) => boolean;
  getActionText: (action: Action) => string;
  getExtendedActionText: (action: Action) => string;
  getThaiMeaning: (action: Action) => string;
}

const ActionDraftContext = createContext<ActionDraftContextType | undefined>(undefined);

interface ActionDraftProviderProps {
  children: ReactNode;
  teams: Team[];
  matchInfo: MatchInfo;
  sportTemplate: SportTemplate;
  uiLanguage: 'th' | 'en';
  advancedDetailMode: boolean;
  areaCourtViewMode?: 'auto' | 'half' | 'full';
  getCurrentTimeRef: React.MutableRefObject<() => number>;
  showToast: (msg: string) => void;
}

/**
 * Manages the in-progress rally actions, single-action draft buffer, input undo stack,
 * volleyball path staging, and action validation/formatting helpers.
 */
export function ActionDraftProvider({
  children,
  teams,
  matchInfo,
  sportTemplate,
  uiLanguage,
  advancedDetailMode,
  areaCourtViewMode,
  getCurrentTimeRef,
  showToast,
}: ActionDraftProviderProps) {
  const { skills, areas, results } = sportTemplate;

  const [currentActions, setCurrentActions] = useState<Action[]>([]);
  const [currentAction, setCurrentActionState] = useState<Action>({});
  const currentActionRef = useRef<Action>(currentAction);

  useEffect(() => {
    currentActionRef.current = currentAction;
  }, [currentAction]);

  const setCurrentAction: React.Dispatch<React.SetStateAction<Action>> = useCallback((actionOrUpdater) => {
    if (typeof actionOrUpdater === 'function') {
      const next = actionOrUpdater(currentActionRef.current);
      currentActionRef.current = next;
      setCurrentActionState(next);
      return;
    }
    currentActionRef.current = actionOrUpdater;
    setCurrentActionState(actionOrUpdater);
  }, []);

  const [volleyballPathStage, setVolleyballPathStageState] = useState<VolleyballPathCaptureStage>('start');
  const volleyballPathStageRef = useRef<VolleyballPathCaptureStage>('start');
  const setVolleyballPathStage = useCallback((stage: VolleyballPathCaptureStage) => {
    volleyballPathStageRef.current = stage;
    setVolleyballPathStageState(stage);
  }, []);

  const [currentInputHistory, setCurrentInputHistory] = useState<InputHistoryItem[]>([]);
  const hudTimerRef = useRef<number | null>(null);
  const [hudLastSavedText, setHudLastSavedText] = useState<string | null>(null);
  const [hudLastSavedAt, setHudLastSavedAt] = useState<number>(0);

  const triggerHudSavedFlash = useCallback((eventText: string) => {
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
  }, []);

  const updateActionPatch = useCallback((patch: Partial<Action>) => {
    setCurrentAction(prev => ({ ...prev, ...patch }));
  }, [setCurrentAction]);

  const selectFoul = useCallback((foul?: FoulOption) => {
    const prev = currentActionRef.current;
    const isSame = prev.foulCode === foul?.code;
    const nextFoulCode = isSame ? undefined : foul?.code;
    const nextFoulRole = isSame ? undefined : foul?.role;
    const nextFoulSeverity = isSame ? undefined : foul?.severity;

    setCurrentAction({
      ...prev,
      foulCode: nextFoulCode,
      foulRole: nextFoulRole,
      foulSeverity: nextFoulSeverity,
    });
    setCurrentInputHistory(hist => [...hist, {
      type: 'field',
      category: 'foulCode',
      previousValue: prev.foulCode,
      value: nextFoulCode,
    } as InputHistoryItem]);
  }, [setCurrentAction]);

  const clearFoul = useCallback(() => {
    const prev = currentActionRef.current;
    setCurrentAction({
      ...prev,
      foulCode: undefined,
      foulRole: undefined,
      foulSeverity: undefined,
    });
    setCurrentInputHistory(hist => [...hist, {
      type: 'field',
      category: 'foulCode',
      previousValue: prev.foulCode,
      value: undefined,
    } as InputHistoryItem]);
  }, [setCurrentAction]);

  const commitSkillSelection = useCallback((payload: { skillCode: string; descriptorGroupId?: string; descriptorCode?: string }) => {
    const prev = currentActionRef.current;
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

    setCurrentAction(next);
    setCurrentInputHistory(hist => {
      const newHist = [...hist];
      if (isNewSkill) {
        newHist.push({
          type: 'field',
          category: 'skillCode',
          previousValue: prev.skillCode,
          value: payload.skillCode,
        } as InputHistoryItem);
      }
      if (payload.descriptorGroupId && payload.descriptorCode) {
        newHist.push({
          type: 'descriptor',
          groupId: payload.descriptorGroupId,
          previousValue: prev.descriptors?.[payload.descriptorGroupId],
          value: payload.descriptorCode,
        } as InputHistoryItem);
      }
      return newHist;
    });
  }, [matchInfo.sportType, setCurrentAction]);

  const updateActionField = useCallback((field: keyof Action, value: unknown, descriptorGroupId?: string) => {
    const prevAction = currentActionRef.current;
    const isSame = descriptorGroupId
      ? prevAction.descriptors?.[descriptorGroupId] === value
      : prevAction[field] === value;

    const nextValue = isSame ? undefined : value;
    const previousValue = descriptorGroupId ? prevAction.descriptors?.[descriptorGroupId] : prevAction[field];

    const next = field === 'skillCode' && nextValue && matchInfo.sportType === 'volleyball'
      ? resetVolleyballActionForSkill(prevAction, String(nextValue))
      : {
          ...prevAction,
          descriptors: prevAction.descriptors ? { ...prevAction.descriptors } : {},
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

    setCurrentAction(next);
    setCurrentInputHistory(hist => [...hist, {
      type: descriptorGroupId ? 'descriptor' : 'field',
      category: !descriptorGroupId ? field : undefined,
      groupId: descriptorGroupId,
      previousValue,
      value: nextValue,
    } as InputHistoryItem]);
  }, [matchInfo.sportType, setCurrentAction]);

  useEffect(() => {
    setVolleyballPathStage('start');
  }, [currentAction.skillCode, advancedDetailMode, matchInfo.sportType, setVolleyballPathStage]);

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
  }, [matchInfo.sportType, setCurrentAction]);

  const selectArea = useCallback((rawPayload: AreaSelectionPayload) => {
    const payload = { ...rawPayload };

    if (payload.areaCode && DETAILED_ZONE_LABELS[payload.areaCode]) {
      const detailed = DETAILED_ZONE_LABELS[payload.areaCode];
      payload.gridX = payload.gridX !== undefined ? payload.gridX : detailed.gridX;
      payload.gridY = payload.gridY !== undefined ? payload.gridY : detailed.gridY;
      payload.areaMode = payload.areaMode || 'detailed';
      payload.areaResolution = payload.areaResolution || 'legacy-3x3';
      payload.areaLabel = payload.areaLabel || detailed.label;
      payload.areaCode = detailed.baseAreaCode;
    }

    if (payload.outZone) {
      payload.areaResolution = payload.areaResolution || 'out-zone';
      payload.areaMode = payload.areaMode || 'normal';
      payload.courtSide = payload.courtSide || 'neutral';
      if (!payload.areaCode) payload.areaCode = 'OUT';
      if (!payload.areaLabel && OUT_ZONE_LABELS[payload.outZone]) {
        const isThai = uiLanguage === 'th';
        payload.areaLabel = isThai ? OUT_ZONE_LABELS[payload.outZone].thaiLabel : OUT_ZONE_LABELS[payload.outZone].label;
      }
    } else if (payload.areaCode && ['OUT', 'LONG_OUT', 'SIDE_OUT', 'NET_ERR'].includes(payload.areaCode)) {
      payload.areaResolution = payload.areaResolution || 'out-zone';
      payload.areaMode = payload.areaMode || 'normal';
      payload.courtSide = payload.courtSide || 'neutral';
      if (!payload.outZone) payload.outZone = payload.areaCode === 'NET_ERR' ? 'net_error' : 'unknown';
    }

    payload.areaMode = payload.areaMode || 'normal';
    payload.courtSide = payload.courtSide || 'neutral';
    payload.areaResolution = payload.areaResolution || 'normal';
    payload.courtViewMode = payload.courtViewMode || areaCourtViewMode || 'auto';

    if (payload.areaCode && !payload.areaLabel) {
      const areaObj = areas.find(a => a.code === payload.areaCode);
      const isThai = uiLanguage === 'th';
      payload.areaLabel = areaObj ? (isThai ? areaObj.thaiName : areaObj.code) : payload.areaCode;
    }

    const prevAction = currentActionRef.current;
    const capabilities = getVolleyballSkillCapabilities(prevAction.skillCode);
    const isVolleyballDetailPath = matchInfo.sportType === 'volleyball'
      && advancedDetailMode
      && Boolean(capabilities);

    if (isVolleyballDetailPath && volleyballPathStageRef.current !== 'complete') {
      const stage = volleyballPathStageRef.current === 'target' ? 'target' : 'start';
      const captured = captureVolleyballPathArea(prevAction, stage, payload);
      setCurrentInputHistory(hist => [...hist, {
        type: 'field',
        category: 'domainPayload',
        previousValue: prevAction.domainPayload,
        value: captured.action.domainPayload,
      }]);
      setCurrentAction(captured.action);
      setVolleyballPathStage(captured.nextStage);
      return;
    }
    if (isVolleyballDetailPath) return;

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

    setCurrentAction(next);
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
      },
    }]);
  }, [uiLanguage, areaCourtViewMode, advancedDetailMode, areas, matchInfo.sportType, setVolleyballPathStage, setCurrentAction]);

  const clearCurrentEvent = useCallback(() => {
    setCurrentActions([]);
    setCurrentAction({});
    setCurrentInputHistory([]);
  }, [setCurrentAction]);

  const resetCurrentAction = useCallback(() => {
    setCurrentAction({});
    setCurrentInputHistory([]);
  }, [setCurrentAction]);

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
    const isThai = uiLanguage === 'th';

    if (sportTemplate.teamsEnabled && !normalized.teamCode) {
      if (normalized.foulCode) {
        return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีมเพื่อบันทึกการฟาวล์' : 'Cannot save yet. Please select a team to record the foul.';
      }
      return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีม ทักษะ พื้นที่ และผลลัพธ์ให้ครบ' : 'Cannot save yet. Please select team, skill, area, and result.';
    }

    if (normalized.foulCode) {
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
  }, [normalizeActionBeforeCommit, uiLanguage, sportTemplate.teamsEnabled, sportTemplate.descriptors, getSkillByCode]);

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
      action.foulCode,
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
      return `${base} / ${details.join(' / ')}`;
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

    const descStrs: string[] = [];
    if (action.descriptors) {
      Object.entries(action.descriptors).forEach(([key, val]) => {
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
      return `${base} / ${details.join(' / ')}`;
    }
    return base;
  }, [teams, skills, areas, results, sportTemplate.fouls, sportTemplate.descriptors]);

  const addAction = useCallback((actionToAdd: Action = currentAction) => {
    if (Object.keys(actionToAdd).length > 0) {
      if (!isActionComplete(actionToAdd)) {
        showToast(uiLanguage === 'th' ? 'กรุณาเลือกข้อมูลให้ครบก่อนเพิ่ม Action' : 'Please select all required info before adding an action');
        return;
      }

      const normalized = normalizeActionBeforeCommit(actionToAdd);

      const finalVideoTime = getCurrentTimeRef.current();
      const completedAction: Action = {
        ...normalized,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        videoTime: normalized.videoTime !== undefined ? normalized.videoTime : finalVideoTime,
        realTime: Date.now(),
      };
      setCurrentActions(prev => [...prev, completedAction]);
      setCurrentAction({});
      setCurrentInputHistory([]);
    }
  }, [currentAction, isActionComplete, uiLanguage, normalizeActionBeforeCommit, getCurrentTimeRef, setCurrentAction, showToast]);

  const undoLastAction = useCallback(() => {
    if (currentInputHistory.length > 0) {
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
            } else if (last.previousCourtSide === undefined) {
              delete next.courtSide;
            } else {
              next.courtSide = last.previousCourtSide;
            }
          }

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
      setCurrentAction({});
      return;
    }

    if (currentActions.length > 0) {
      setCurrentActions(prev => prev.slice(0, -1));
    }
  }, [currentInputHistory, currentAction, currentActions, setCurrentAction]);

  return (
    <ActionDraftContext.Provider
      value={{
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
      }}
    >
      {children}
    </ActionDraftContext.Provider>
  );
}

export function useActionDraft(): ActionDraftContextType {
  const ctx = useContext(ActionDraftContext);
  if (!ctx) {
    throw new Error('useActionDraft must be used within ActionDraftProvider');
  }
  return ctx;
}
