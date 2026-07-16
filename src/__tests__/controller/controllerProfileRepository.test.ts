import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_PROFILES_STORAGE_KEY,
  createControllerProfileRepository,
} from '../../controller/controllerProfileRepository';
import type { StorageAdapter } from '../../utils/storageAdapter';

function createMemoryStorage(): StorageAdapter {
  const values = new Map<string, unknown>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

function createObservedMemoryStorage() {
  const values = new Map<string, unknown>();
  let writes = 0;
  const storage: StorageAdapter = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      writes += 1;
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
  return { storage, getWrites: () => writes };
}

describe('controller profile repository', () => {
  it('creates versioned profiles per device family without a raw device identifier', async () => {
    const repository = createControllerProfileRepository(createMemoryStorage());
    const state = await repository.load();

    expect(state.schemaVersion).toBe('1.0');
    expect(state.profiles.map((profile) => profile.deviceFamily)).toEqual(
      expect.arrayContaining(['ps4', 'ps5', 'xbox', 'generic']),
    );
    expect(JSON.stringify(state)).not.toMatch(/deviceId|rawId|DualSense Wireless Controller/i);
  });

  it('keeps an active mapping after unrelated project data changes', async () => {
    const storage = createMemoryStorage();
    const repository = createControllerProfileRepository(storage);
    const state = await repository.load();
    const xboxProfile = state.profiles.find((profile) => profile.deviceFamily === 'xbox')!;
    const changed = {
      ...xboxProfile,
      bindings: { ...xboxProfile.bindings, saveEvent: 'button-west' as const },
    };

    await repository.saveProfile(changed);
    await storage.setItem('scout_projects', [{ id: 'new-project' }]);

    const reloaded = await createControllerProfileRepository(storage).load();
    const active = reloaded.profiles.find((profile) => profile.id === changed.id);
    expect(active?.bindings.saveEvent).toBe('button-west');
  });

  it('does not rewrite unchanged profiles every time the HUD opens', async () => {
    const observed = createObservedMemoryStorage();
    const repository = createControllerProfileRepository(observed.storage);

    await repository.load();
    await repository.load();

    expect(observed.getWrites()).toBe(1);
  });

  it('migrates the old default Result/Cancel collision without changing custom profiles', async () => {
    const storage = createMemoryStorage();
    const repository = createControllerProfileRepository(storage);
    const state = await repository.load();
    const legacyDefault = state.profiles.find((profile) => profile.id === 'default-xbox')!;
    await storage.setItem(CONTROLLER_PROFILES_STORAGE_KEY, {
      ...state,
      profiles: [
        ...state.profiles.filter((profile) => profile.id !== legacyDefault.id),
        { ...legacyDefault, bindings: { ...legacyDefault.bindings, cancel: 'button-east' } },
        { ...legacyDefault, id: 'coach-custom', name: 'Coach Custom', bindings: { ...legacyDefault.bindings, cancel: 'button-east' } },
      ],
    });

    const migrated = await repository.load();
    expect(migrated.profiles.find((profile) => profile.id === 'default-xbox')?.bindings.cancel)
      .toBe('left-stick');
    expect(migrated.profiles.find((profile) => profile.id === 'coach-custom')?.bindings.cancel)
      .toBe('button-east');
  });

  it('duplicates, activates and resets a profile without project data', async () => {
    const storage = createMemoryStorage();
    const repository = createControllerProfileRepository(storage);
    const initial = await repository.getActiveProfile('ps5');
    const duplicate = await repository.duplicateProfile(initial.id, 'Coach Layout', 'coach-layout');

    expect(duplicate.id).toBe('coach-layout');
    expect((await repository.getActiveProfile('ps5')).id).toBe('coach-layout');

    await repository.saveProfile({
      ...duplicate,
      bindings: { ...duplicate.bindings, saveEvent: 'button-west' },
    });
    const reset = await repository.resetProfile('coach-layout');
    expect(reset.bindings.saveEvent).toBe('right-shoulder');
    expect(reset.name).toBe('Coach Layout');
  });

  it('caps stored profiles and removes unknown identity fields', async () => {
    const storage = createMemoryStorage();
    const repository = createControllerProfileRepository(storage);
    const defaults = await repository.load();
    const template = defaults.profiles[0];
    await storage.setItem(CONTROLLER_PROFILES_STORAGE_KEY, {
      ...defaults,
      profiles: Array.from({ length: 40 }, (_, index) => ({
        ...template,
        id: `custom-${index}`,
        name: `Profile ${index}`,
        rawDeviceId: `serial-${index}`,
      })),
    });

    const sanitized = await repository.load();
    expect(sanitized.profiles.length).toBeLessThanOrEqual(32);
    expect(JSON.stringify(sanitized)).not.toContain('serial-');
  });
});
