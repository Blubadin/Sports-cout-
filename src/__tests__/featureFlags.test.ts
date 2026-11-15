import { describe, expect, it } from 'vitest';
import { resolveFeatureFlags } from '../featureFlags';

describe('pilot feature flags', () => {
  it('enables Workstation by default when VITE_ENABLE_WORKSTATION is unconfigured', () => {
    expect(resolveFeatureFlags({}).workstation).toBe(true);
  });

  it('allows explicit disable only via VITE_ENABLE_WORKSTATION=false', () => {
    expect(resolveFeatureFlags({ VITE_ENABLE_WORKSTATION: 'true' }).workstation).toBe(true);
    expect(resolveFeatureFlags({ VITE_ENABLE_WORKSTATION: 'false' }).workstation).toBe(false);
    expect(resolveFeatureFlags({ VITE_ENABLE_WORKSTATION: 'false ' }).workstation).toBe(false);
  });

  it('handles whitespace resilience in environment flags', () => {
    expect(resolveFeatureFlags({ VITE_ENABLE_WORKSTATION: 'true ' }).workstation).toBe(true);
    expect(resolveFeatureFlags({ VITE_ENABLE_WORKSTATION: ' true\n' }).workstation).toBe(true);
    expect(resolveFeatureFlags({ VITE_ENABLE_FOOTBALL_PICCO: ' true ' }).footballPicco).toBe(true);
  });
});
