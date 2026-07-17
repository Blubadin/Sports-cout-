import { describe, expect, it } from 'vitest';
import { DEFAULT_INTERFACE_MODE, FEATURE_FLAGS, resolveFeatureFlags } from '../featureFlags';

describe('pilot feature flags', () => {
  it('keeps Classic as the safe default while Workstation is in development', () => {
    expect(DEFAULT_INTERFACE_MODE).toBe('classic');
    expect(FEATURE_FLAGS.workstation).toBe(false);
  });

  it('can opt into Workstation explicitly without changing the default', () => {
    expect(resolveFeatureFlags({ VITE_ENABLE_WORKSTATION: 'true' }).workstation).toBe(true);
    expect(resolveFeatureFlags({ VITE_ENABLE_WORKSTATION: 'false' }).workstation).toBe(false);
  });
});
