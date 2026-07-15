import { createDefaultControllerProfile } from './controllerProfiles';
import type {
  ControllerButtonName,
  ControllerCalibration,
  ControllerCommandId,
  ControllerDeviceFamily,
  ControllerProfile,
  ControllerProfileExport,
} from './types';

export type ControllerRemapResolution = 'swap' | 'replace' | 'cancel';

export const CONTROLLER_COMMANDS: readonly ControllerCommandId[] = [
  'openSkill',
  'openArea',
  'openResult',
  'openFoul',
  'previousTeam',
  'nextTeam',
  'undo',
  'redo',
  'saveEvent',
  'seekBackward',
  'seekForward',
  'togglePlayback',
  'toggleHistory',
  'bookmark',
  'confirm',
  'cancel',
] as const;

export const CONTROLLER_BUTTONS: readonly ControllerButtonName[] = [
  'button-south',
  'button-east',
  'button-west',
  'button-north',
  'left-shoulder',
  'right-shoulder',
  'left-trigger',
  'right-trigger',
  'view',
  'menu',
  'left-stick',
  'right-stick',
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
  'home',
] as const;

const DEVICE_FAMILIES: readonly ControllerDeviceFamily[] = ['ps4', 'ps5', 'xbox', 'generic'];

const PS_LABELS: Partial<Record<ControllerButtonName, string>> = {
  'button-south': 'Cross',
  'button-east': 'Circle',
  'button-west': 'Square',
  'button-north': 'Triangle',
  'left-shoulder': 'L1',
  'right-shoulder': 'R1',
  'left-trigger': 'L2',
  'right-trigger': 'R2',
  view: 'Create',
  menu: 'Options',
  'left-stick': 'L3',
  'right-stick': 'R3',
};

const XBOX_LABELS: Partial<Record<ControllerButtonName, string>> = {
  'button-south': 'A',
  'button-east': 'B',
  'button-west': 'X',
  'button-north': 'Y',
  'left-shoulder': 'LB',
  'right-shoulder': 'RB',
  'left-trigger': 'LT',
  'right-trigger': 'RT',
  view: 'View',
  menu: 'Menu',
  'left-stick': 'LS',
  'right-stick': 'RS',
};

const COMMON_LABELS: Partial<Record<ControllerButtonName, string>> = {
  'dpad-up': 'D-pad Up',
  'dpad-down': 'D-pad Down',
  'dpad-left': 'D-pad Left',
  'dpad-right': 'D-pad Right',
  home: 'Home',
};

export function getControllerButtonLabel(
  control: ControllerButtonName,
  family: ControllerDeviceFamily,
): string {
  return COMMON_LABELS[control] ??
    (family === 'xbox' || family === 'generic' ? XBOX_LABELS[control] : PS_LABELS[control]) ??
    control;
}

export function findBindingConflict(
  profile: ControllerProfile,
  command: ControllerCommandId,
  control: ControllerButtonName,
): ControllerCommandId | null {
  return CONTROLLER_COMMANDS.find(
    (candidate) => candidate !== command && profile.bindings[candidate] === control,
  ) ?? null;
}

export function resolveControllerRemap(
  profile: ControllerProfile,
  command: ControllerCommandId,
  control: ControllerButtonName,
  resolution: ControllerRemapResolution,
): ControllerProfile {
  const conflict = findBindingConflict(profile, command, control);
  if (resolution === 'cancel') return profile;

  const bindings = { ...profile.bindings };
  const previousControl = bindings[command];
  if (conflict && resolution === 'swap') {
    if (previousControl) bindings[conflict] = previousControl;
    else delete bindings[conflict];
  } else if (conflict && resolution === 'replace') {
    delete bindings[conflict];
  }
  bindings[command] = control;
  return { ...profile, bindings };
}

export function createControllerProfileExport(profile: ControllerProfile): ControllerProfileExport {
  return {
    schemaVersion: '1.0',
    type: 'sportscout-controller-profile',
    exportedAt: new Date().toISOString(),
    profile,
  };
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function sanitizeCalibration(
  value: unknown,
  fallback: ControllerCalibration,
): ControllerCalibration {
  const input = value && typeof value === 'object' ? value as Partial<ControllerCalibration> : {};
  return {
    deadzone: clamp(input.deadzone, fallback.deadzone, 0, 0.95),
    sensitivity: clamp(input.sensitivity, fallback.sensitivity, 0.1, 3),
    smoothing: clamp(input.smoothing, fallback.smoothing, 0, 0.95),
    activationThreshold: clamp(input.activationThreshold, fallback.activationThreshold, 0.05, 1),
    neutralCancelThreshold: clamp(input.neutralCancelThreshold, fallback.neutralCancelThreshold, 0.05, 0.95),
    sectorHysteresis: clamp(input.sectorHysteresis, fallback.sectorHysteresis, 0, 0.5),
  };
}

export function sanitizeImportedControllerProfile(value: unknown): ControllerProfile | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Partial<ControllerProfileExport>;
  if (
    envelope.schemaVersion !== '1.0' ||
    envelope.type !== 'sportscout-controller-profile' ||
    !envelope.profile ||
    !DEVICE_FAMILIES.includes(envelope.profile.deviceFamily)
  ) {
    return null;
  }

  const family = envelope.profile.deviceFamily;
  const defaults = createDefaultControllerProfile(family);
  const bindings: ControllerProfile['bindings'] = {};
  const importedBindings = envelope.profile.bindings && typeof envelope.profile.bindings === 'object'
    ? envelope.profile.bindings
    : {};
  for (const command of CONTROLLER_COMMANDS) {
    const control = importedBindings[command];
    if (control && CONTROLLER_BUTTONS.includes(control)) bindings[command] = control;
  }

  const now = new Date().toISOString();
  return {
    id: typeof envelope.profile.id === 'string' && envelope.profile.id.trim()
      ? envelope.profile.id.trim().slice(0, 80)
      : `imported-${Date.now()}`,
    name: typeof envelope.profile.name === 'string' && envelope.profile.name.trim()
      ? envelope.profile.name.trim().slice(0, 80)
      : `${defaults.name} Imported`,
    version: 1,
    deviceFamily: family,
    bindings,
    calibration: sanitizeCalibration(envelope.profile.calibration, defaults.calibration),
    createdAt: now,
    updatedAt: now,
  };
}
