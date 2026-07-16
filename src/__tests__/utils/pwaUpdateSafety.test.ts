import { describe, expect, it } from 'vitest';
import { getPwaUpdateBlockers } from '../../utils/pwaUpdateSafety';

describe('PWA update safety', () => {
  it('allows reload only when no action or project save is pending', () => {
    expect(getPwaUpdateBlockers({ hasPendingAction: false, saveStatus: 'saved' })).toEqual([]);
    expect(getPwaUpdateBlockers({ hasPendingAction: true, saveStatus: 'saved' })).toContain('pending-action');
    expect(getPwaUpdateBlockers({ hasPendingAction: false, saveStatus: 'saving' })).toContain('project-save');
    expect(getPwaUpdateBlockers({ hasPendingAction: false, saveStatus: 'failed' })).toContain('save-failed');
  });
});
