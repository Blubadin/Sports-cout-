import type { Action, AreaSelectionPayload, VolleyballDomainPayload } from '../types';

export type VolleyballRallyPhase = NonNullable<VolleyballDomainPayload['rallyPhase']>;

export type VolleyballSkillCapabilities = {
  phase: VolleyballRallyPhase;
  supportsTarget: boolean;
  supportsSystem: boolean;
};

export type VolleyballPathCaptureStage = 'start' | 'target' | 'complete';

const CAPABILITIES: Record<string, VolleyballSkillCapabilities> = {
  SV: { phase: 'serve', supportsTarget: true, supportsSystem: false },
  REC: { phase: 'reception', supportsTarget: true, supportsSystem: false },
  SET: { phase: 'set', supportsTarget: true, supportsSystem: true },
  SPK: { phase: 'attack', supportsTarget: true, supportsSystem: true },
  BLK: { phase: 'block', supportsTarget: false, supportsSystem: false },
  DIG: { phase: 'dig', supportsTarget: true, supportsSystem: false },
  UND: { phase: 'dig', supportsTarget: true, supportsSystem: false },
};

export function getVolleyballSkillCapabilities(skillCode?: string): VolleyballSkillCapabilities | undefined {
  return skillCode ? CAPABILITIES[skillCode] : undefined;
}

export function getVolleyballPrimaryArea(action: Action): AreaSelectionPayload | undefined {
  if (action.domainPayload?.type === 'volleyball' && action.domainPayload.startArea) {
    return action.domainPayload.startArea;
  }

  const legacy: AreaSelectionPayload = {
    areaCode: action.areaCode,
    areaLabel: action.areaLabel,
    areaMode: action.areaMode,
    courtSide: action.courtSide,
    gridX: action.gridX,
    gridY: action.gridY,
    pointX: action.pointX,
    pointY: action.pointY,
    outZone: action.outZone,
    areaResolution: action.areaResolution,
    courtViewMode: action.courtViewMode,
  };
  const compact = Object.fromEntries(Object.entries(legacy).filter(([, value]) => value !== undefined)) as AreaSelectionPayload;
  return Object.keys(compact).length > 0 ? compact : undefined;
}

export function resetVolleyballActionForSkill(action: Action, skillCode: string): Action {
  if (action.skillCode === skillCode) return action;

  const capabilities = getVolleyballSkillCapabilities(skillCode);
  const next: Action = {
    ...action,
    skillCode,
    descriptors: {},
  };
  delete next.resultDetailCode;
  next.domainPayload = {
    type: 'volleyball',
    ...(capabilities ? { rallyPhase: capabilities.phase } : {}),
  };
  return next;
}

export function captureVolleyballPathArea(
  action: Action,
  stage: Exclude<VolleyballPathCaptureStage, 'complete'>,
  area: AreaSelectionPayload,
): { action: Action; nextStage: VolleyballPathCaptureStage } {
  const capabilities = getVolleyballSkillCapabilities(action.skillCode);
  const previousPayload = action.domainPayload?.type === 'volleyball'
    ? action.domainPayload
    : { type: 'volleyball' as const };
  const domainPayload: VolleyballDomainPayload = {
    ...previousPayload,
    ...(capabilities ? { rallyPhase: capabilities.phase } : {}),
  };

  if (stage === 'target') {
    domainPayload.targetArea = { ...area };
    return { action: { ...action, domainPayload }, nextStage: 'complete' };
  }

  domainPayload.startArea = { ...area };
  delete domainPayload.targetArea;
  const nextAction: Action = {
    ...action,
    areaCode: area.areaCode,
    areaLabel: area.areaLabel,
    areaMode: area.areaMode,
    courtSide: area.courtSide,
    gridX: area.gridX,
    gridY: area.gridY,
    pointX: area.pointX,
    pointY: area.pointY,
    outZone: area.outZone,
    areaResolution: area.areaResolution,
    courtViewMode: area.courtViewMode,
    domainPayload,
  };
  return {
    action: nextAction,
    nextStage: capabilities?.supportsTarget ? 'target' : 'complete',
  };
}
