import { describe, expect, it } from 'vitest';
import {
  formatWorkstationTimecode,
  getAnalysisTabForPreset,
  getPresetForAnalysisTab,
  resolveWorkspaceExperience,
} from '../../workstation/workstationModel';

describe('workstation model', () => {
  it('keeps Classic as the default even when Workstation is available', () => {
    expect(resolveWorkspaceExperience({
      featureEnabled: true,
      preferredExperience: undefined,
      viewportWidth: 1440,
    })).toBe('classic');
  });

  it('opens Workstation only when the feature and desktop viewport allow it', () => {
    expect(resolveWorkspaceExperience({
      featureEnabled: true,
      preferredExperience: 'workstation',
      viewportWidth: 1440,
    })).toBe('workstation');
    expect(resolveWorkspaceExperience({
      featureEnabled: false,
      preferredExperience: 'workstation',
      viewportWidth: 1440,
    })).toBe('classic');
  });

  it('preserves the phone workflow below the Workstation breakpoint', () => {
    expect(resolveWorkspaceExperience({
      featureEnabled: true,
      preferredExperience: 'workstation',
      viewportWidth: 900,
    })).toBe('classic');
  });

  it.each([
    ['scout', 'input'],
    ['review', 'table'],
    ['analysis', 'dashboard'],
  ] as const)('maps the %s preset to the %s analysis view', (preset, tab) => {
    expect(getAnalysisTabForPreset(preset)).toBe(tab);
    expect(getPresetForAnalysisTab(tab)).toBe(preset);
  });

  it('formats finite video time and safely falls back for invalid player progress', () => {
    expect(formatWorkstationTimecode(125.9)).toBe('02:05');
    expect(formatWorkstationTimecode(Number.NaN)).toBe('00:00');
    expect(formatWorkstationTimecode(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});
