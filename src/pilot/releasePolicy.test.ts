import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('restricted release policy', () => {
  it('fails closed for production even without pilot configuration', async () => {
    vi.stubEnv('PROD', true); vi.resetModules();
    const policy = await import('./releasePolicy');
    expect(policy.exportsAllowed()).toBe(false);
    expect(() => policy.requireExportPermission()).toThrow('EXPORT_DISABLED_IN_PILOT');
    expect(policy.scopedStorageKey('scout_projects')).toContain('locked');
  });
  it('keeps development data separate from both pilot accounts', async () => {
    vi.stubEnv('VITE_SPORTSCOUT_RELEASE_CHANNEL', 'pilot'); vi.resetModules();
    const policy = await import('./releasePolicy');
    policy.setPilotStorageUser('user-one');
    const first = policy.scopedStorageKey('scout_projects');
    policy.setPilotStorageUser('user-two');
    const second = policy.scopedStorageKey('scout_projects');
    expect(first).not.toBe(second);
    expect(first).not.toBe('scout_projects');
    expect(second).not.toBe('scout_projects');
  });
  it('blocks direct export client calls before making any network request', async () => {
    vi.stubEnv('VITE_SPORTSCOUT_RELEASE_CHANNEL', 'pilot'); vi.resetModules();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    try {
      const { trackingSessionApi } = await import('../services/trackingSessionApi');
      await expect(trackingSessionApi.startSessionExport('saved-session')).rejects.toThrow('EXPORT_DISABLED_IN_PILOT');
      expect(() => trackingSessionApi.getExportDownloadUrl('saved-export')).toThrow('EXPORT_DISABLED_IN_PILOT');
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('retains export and legacy keys for disconnected development', async () => {
    vi.stubEnv('PROD', false); vi.stubEnv('VITE_SPORTSCOUT_RELEASE_CHANNEL', 'development'); vi.resetModules();
    const policy = await import('./releasePolicy');
    expect(policy.exportsAllowed()).toBe(true);
    expect(policy.scopedStorageKey('scout_projects')).toBe('scout_projects');
  });
});
