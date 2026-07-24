import type {
  Action,
  AreaRequirement,
  ResultType,
  Skill,
  SportType,
} from '../types';

export type ScoutingStep =
  | 'IDLE'
  | 'TEAM_SELECTED'
  | 'PLAYER_SELECTED'
  | 'SKILL_SELECTED'
  | 'DETAILS_SELECTED'
  | 'RESULT_SELECTED'
  | 'AREA_SELECTED'
  | 'READY_TO_SAVE';

export type ProtocolSkillRule = {
  skillCode: string;
  requiredFields: Array<keyof Action>;
  optionalFields: Array<keyof Action>;
  allowedOutcomes: string[];
  areaRequirement: AreaRequirement;
  autoTriggers?: {
    onResult?: Record<string, Partial<Action>>;
  };
};

export type ProtocolDefinition = {
  sportType: SportType;
  version: string;
  stepSequence: ScoutingStep[];
  skillRules: Record<string, ProtocolSkillRule>;
  defaultSkillCode?: string;
  defaultResultCode?: string;
};

export type StateMachineEvaluation = {
  currentStep: ScoutingStep;
  missingFields: string[];
  isValid: boolean;
  canSave: boolean;
  completionPercentage: number;
};

export function evaluateActionState(
  action: Partial<Action>,
  protocol?: ProtocolDefinition,
): StateMachineEvaluation {
  const missingFields: string[] = [];

  if (!action.teamCode) {
    missingFields.push('teamCode');
  }

  if (!action.skillCode) {
    missingFields.push('skillCode');
  }

  const skillRule = action.skillCode && protocol?.skillRules[action.skillCode];
  if (skillRule) {
    for (const reqField of skillRule.requiredFields) {
      if (!action[reqField]) {
        missingFields.push(String(reqField));
      }
    }
  }

  if (!action.resultCode && !action.foulCode) {
    missingFields.push('resultCode');
  }

  const areaReq = skillRule?.areaRequirement || 'optional';
  if (areaReq === 'always' && !action.areaCode && !action.outZone && !action.pointX) {
    missingFields.push('areaCode');
  }

  let currentStep: ScoutingStep = 'IDLE';
  if (action.teamCode) currentStep = 'TEAM_SELECTED';
  if (action.playerName || action.playerNumber) currentStep = 'PLAYER_SELECTED';
  if (action.skillCode) currentStep = 'SKILL_SELECTED';
  if (action.descriptors && Object.keys(action.descriptors).length > 0) currentStep = 'DETAILS_SELECTED';
  if (action.resultCode || action.foulCode) currentStep = 'RESULT_SELECTED';
  if (action.areaCode || action.outZone || action.pointX) currentStep = 'AREA_SELECTED';

  const canSave = !action.teamCode ? false : missingFields.length === 0;
  if (canSave) {
    currentStep = 'READY_TO_SAVE';
  }

  const totalRequired = 3 + (areaReq === 'always' ? 1 : 0);
  const fulfilled = Math.max(0, totalRequired - missingFields.length);
  const completionPercentage = Math.max(0, Math.min(100, Math.round((fulfilled / totalRequired) * 100)));

  return {
    currentStep,
    missingFields,
    isValid: canSave,
    canSave,
    completionPercentage,
  };
}

export function normalizeActionFromAnyInput(
  input: {
    teamCode: string;
    skillCode: string;
    resultCode?: string;
    areaCode?: string;
    pointX?: number;
    pointY?: number;
    outZone?: any;
    playerNumber?: string;
    playerName?: string;
    descriptors?: Record<string, string>;
    foulCode?: string;
    videoTime?: number;
  },
  sportType: SportType = 'volleyball',
): Action {
  return {
    id: input.teamCode ? `normalized-${Date.now()}` : undefined,
    teamCode: input.teamCode,
    skillCode: input.skillCode,
    resultCode: input.resultCode || 'Yes',
    areaCode: input.areaCode,
    pointX: typeof input.pointX === 'number' ? Math.max(0, Math.min(1, input.pointX)) : undefined,
    pointY: typeof input.pointY === 'number' ? Math.max(0, Math.min(1, input.pointY)) : undefined,
    outZone: input.outZone,
    playerNumber: input.playerNumber,
    playerName: input.playerName,
    descriptors: input.descriptors ? { ...input.descriptors } : undefined,
    foulCode: input.foulCode,
    videoTime: typeof input.videoTime === 'number' ? Math.max(0, input.videoTime) : undefined,
    outcomeStatus: input.resultCode === 'Yes' ? 'success' : input.resultCode === 'Out' ? 'error' : 'neutral',
  };
}
