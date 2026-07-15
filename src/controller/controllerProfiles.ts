import type {
  ControllerButtonName,
  ControllerCalibration,
  ControllerCommandId,
  ControllerDeviceFamily,
  ControllerProfile,
} from './types';

export const DEFAULT_CONTROLLER_CALIBRATION: ControllerCalibration = {
  deadzone: 0.18,
  sensitivity: 1,
  smoothing: 0.22,
  activationThreshold: 0.35,
  neutralCancelThreshold: 0.28,
  sectorHysteresis: 0.08,
};

export const DEFAULT_CONTROLLER_BINDINGS: Record<ControllerCommandId, ControllerButtonName> = {
  openSkill: 'button-west',
  openArea: 'button-north',
  openResult: 'button-east',
  openFoul: 'left-shoulder',
  previousTeam: 'dpad-left',
  nextTeam: 'dpad-right',
  undo: 'dpad-up',
  redo: 'dpad-down',
  saveEvent: 'right-shoulder',
  seekBackward: 'left-trigger',
  seekForward: 'right-trigger',
  togglePlayback: 'menu',
  toggleHistory: 'view',
  bookmark: 'right-stick',
  confirm: 'button-south',
  cancel: 'left-stick',
};

const FAMILY_LABELS: Record<ControllerDeviceFamily, string> = {
  ps4: 'PlayStation 4',
  ps5: 'PlayStation 5',
  xbox: 'Xbox',
  generic: 'Generic Controller',
};

export function createDefaultControllerProfile(
  deviceFamily: ControllerDeviceFamily,
): ControllerProfile {
  const timestamp = new Date(0).toISOString();
  return {
    id: `default-${deviceFamily}`,
    name: `${FAMILY_LABELS[deviceFamily]} Default`,
    version: 1,
    deviceFamily,
    bindings: { ...DEFAULT_CONTROLLER_BINDINGS },
    calibration: { ...DEFAULT_CONTROLLER_CALIBRATION },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDefaultControllerProfiles(): ControllerProfile[] {
  return (['ps4', 'ps5', 'xbox', 'generic'] as const).map(createDefaultControllerProfile);
}
