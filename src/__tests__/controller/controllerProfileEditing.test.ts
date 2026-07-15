import { describe, expect, it } from 'vitest';
import {
  createControllerProfileExport,
  getControllerButtonLabel,
  resolveControllerRemap,
  sanitizeImportedControllerProfile,
} from '../../controller/controllerProfileEditing';
import { createDefaultControllerProfile } from '../../controller/controllerProfiles';

describe('controller profile editing', () => {
  it('uses device-family button glyphs and shoulder labels', () => {
    expect(getControllerButtonLabel('button-south', 'ps5')).toBe('Cross');
    expect(getControllerButtonLabel('button-south', 'xbox')).toBe('A');
    expect(getControllerButtonLabel('left-shoulder', 'ps4')).toBe('L1');
    expect(getControllerButtonLabel('left-shoulder', 'xbox')).toBe('LB');
  });

  it('swaps a conflicting binding without losing either command', () => {
    const profile = createDefaultControllerProfile('xbox');
    const result = resolveControllerRemap(profile, 'saveEvent', 'button-west', 'swap');

    expect(result.bindings.saveEvent).toBe('button-west');
    expect(result.bindings.openSkill).toBe('right-shoulder');
  });

  it('replaces a conflicting binding by unbinding the previous command', () => {
    const profile = createDefaultControllerProfile('ps5');
    const result = resolveControllerRemap(profile, 'saveEvent', 'button-west', 'replace');

    expect(result.bindings.saveEvent).toBe('button-west');
    expect(result.bindings.openSkill).toBeUndefined();
  });

  it('returns the original mapping when a conflict is cancelled', () => {
    const profile = createDefaultControllerProfile('ps5');
    const result = resolveControllerRemap(profile, 'saveEvent', 'button-west', 'cancel');
    expect(result.bindings).toEqual(profile.bindings);
  });

  it('exports a versioned profile and strips unrelated device identity on import', () => {
    const profile = createDefaultControllerProfile('ps5');
    const exported = createControllerProfileExport(profile);
    const imported = sanitizeImportedControllerProfile({
      ...exported,
      rawDeviceId: 'DualSense serial 123',
    });

    expect(exported.schemaVersion).toBe('1.0');
    expect(imported?.deviceFamily).toBe('ps5');
    expect(JSON.stringify(imported)).not.toContain('serial 123');
  });

  it('rejects malformed or unsupported imported profiles', () => {
    expect(sanitizeImportedControllerProfile({ schemaVersion: '2.0' })).toBeNull();
    expect(sanitizeImportedControllerProfile({
      schemaVersion: '1.0',
      type: 'sportscout-controller-profile',
      profile: { deviceFamily: 'flight-stick' },
    })).toBeNull();
  });

  it('preserves intentionally unbound commands through export and import', () => {
    const profile = resolveControllerRemap(
      createDefaultControllerProfile('xbox'),
      'saveEvent',
      'button-west',
      'replace',
    );
    const imported = sanitizeImportedControllerProfile(createControllerProfileExport(profile));

    expect(imported?.bindings.saveEvent).toBe('button-west');
    expect(imported?.bindings.openSkill).toBeUndefined();
  });
});
