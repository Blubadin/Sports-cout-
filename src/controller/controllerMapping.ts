import type {
  ControllerButtonName,
  ControllerCalibration,
  ControllerDeviceFamily,
} from './types';

export const STANDARD_GAMEPAD_BUTTONS: readonly ControllerButtonName[] = [
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

export function getStandardButtonName(index: number): ControllerButtonName | null {
  return STANDARD_GAMEPAD_BUTTONS[index] ?? null;
}

export function detectControllerFamily(id: string, _mapping: string): ControllerDeviceFamily {
  const normalized = id.toLowerCase();
  if (normalized.includes('dualsense') || normalized.includes('product: 0ce6')) return 'ps5';
  if (
    normalized.includes('xbox') ||
    normalized.includes('xinput') ||
    normalized.includes('vendor: 045e')
  ) {
    return 'xbox';
  }
  if (
    normalized.includes('dualshock') ||
    normalized.includes('product: 09cc') ||
    normalized.includes('vendor: 054c') ||
    normalized.includes('wireless controller')
  ) {
    return 'ps4';
  }
  return 'generic';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeStick(
  rawX: number,
  rawY: number,
  calibration: ControllerCalibration,
): { x: number; y: number; magnitude: number } {
  const x = clamp(Number.isFinite(rawX) ? rawX : 0, -1, 1);
  const y = clamp(Number.isFinite(rawY) ? rawY : 0, -1, 1);
  const rawMagnitude = Math.min(1, Math.hypot(x, y));
  const deadzone = clamp(calibration.deadzone, 0, 0.95);
  if (rawMagnitude <= deadzone || rawMagnitude === 0) {
    return { x: 0, y: 0, magnitude: 0 };
  }

  const magnitude = clamp(
    ((rawMagnitude - deadzone) / (1 - deadzone)) * clamp(calibration.sensitivity, 0.1, 3),
    0,
    1,
  );
  const directionX = x / Math.hypot(x, y);
  const directionY = y / Math.hypot(x, y);
  return {
    x: clamp(directionX * magnitude, -1, 1),
    y: clamp(directionY * magnitude, -1, 1),
    magnitude,
  };
}
