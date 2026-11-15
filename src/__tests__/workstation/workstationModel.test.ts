import { describe, expect, it } from 'vitest';
import {
  formatWorkstationTimecode,
  getAnalysisTabForPreset,
  getPresetForAnalysisTab,
  isReviewTab,
  REVIEW_TABS,
  resolveWorkspaceExperience,
} from '../../workstation/workstationModel';

describe('workstation model', () => {
  it('always resolves to workstation mode regardless of viewport width or legacy flag inputs', () => {
    expect(resolveWorkspaceExperience({
      featureEnabled: true,
      preferredExperience: undefined,
      viewportWidth: 1440,
    })).toBe('workstation');
    expect(resolveWorkspaceExperience({
      featureEnabled: false,
      preferredExperience: 'workstation',
      viewportWidth: 1440,
    })).toBe('workstation');
    expect(resolveWorkspaceExperience({
      featureEnabled: true,
      preferredExperience: 'workstation',
      viewportWidth: 900,
    })).toBe('workstation');
    expect(resolveWorkspaceExperience({
      viewportWidth: 390,
    })).toBe('workstation');
    expect(resolveWorkspaceExperience()).toBe('workstation');
  });

  it.each([
    ['scout', 'input'],
    ['review', 'table'],
    ['analysis', 'dashboard'],
    ['report', 'report'],
    ['lab', 'labs'],
  ] as const)('maps the %s preset to the %s analysis view', (preset, tab) => {
    expect(getAnalysisTabForPreset(preset)).toBe(tab);
    expect(getPresetForAnalysisTab(tab)).toBe(preset);
  });

  it('limits Review local navigation to its two dedicated views', () => {
    expect(REVIEW_TABS).toEqual(['table', 'bookmarks']);
    expect(isReviewTab('table')).toBe(true);
    expect(isReviewTab('bookmarks')).toBe(true);
    expect(isReviewTab('input')).toBe(false);
    expect(isReviewTab('dashboard')).toBe(false);
    expect(isReviewTab('report')).toBe(false);
    expect(isReviewTab('labs')).toBe(false);
  });

  it('formats finite video time and safely falls back for invalid player progress', () => {
    expect(formatWorkstationTimecode(125.9)).toBe('02:05');
    expect(formatWorkstationTimecode(Number.NaN)).toBe('00:00');
    expect(formatWorkstationTimecode(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});
