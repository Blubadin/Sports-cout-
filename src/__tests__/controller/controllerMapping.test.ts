import { describe, expect, it } from 'vitest';
import {
  STANDARD_GAMEPAD_BUTTONS,
  detectControllerFamily,
  getStandardButtonName,
  normalizeStick,
} from '../../controller/controllerMapping';

describe('controller mapping', () => {
  it.each([
    ['DualSense Wireless Controller', 'standard', 'ps5'],
    ['Sony Interactive Entertainment Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'standard', 'ps4'],
    ['Xbox Wireless Controller', 'standard', 'xbox'],
    ['USB Gamepad', '', 'generic'],
  ] as const)('classifies %s as %s without exposing the raw id', (id, mapping, expected) => {
    expect(detectControllerFamily(id, mapping)).toBe(expected);
  });

  it('uses the W3C standard button order', () => {
    expect(STANDARD_GAMEPAD_BUTTONS).toHaveLength(17);
    expect(getStandardButtonName(0)).toBe('button-south');
    expect(getStandardButtonName(9)).toBe('menu');
    expect(getStandardButtonName(14)).toBe('dpad-left');
    expect(getStandardButtonName(99)).toBeNull();
  });

  it('applies a radial deadzone and sensitivity without exceeding normalized bounds', () => {
    const calibration = {
      deadzone: 0.18,
      sensitivity: 1.2,
      smoothing: 0,
      activationThreshold: 0.35,
      neutralCancelThreshold: 0.28,
      sectorHysteresis: 0.08,
    };

    expect(normalizeStick(0.1, 0.1, calibration)).toEqual({ x: 0, y: 0, magnitude: 0 });
    const result = normalizeStick(0.8, -0.8, calibration);
    expect(result.x).toBeLessThanOrEqual(1);
    expect(result.y).toBeGreaterThanOrEqual(-1);
    expect(result.magnitude).toBe(1);
  });
});
