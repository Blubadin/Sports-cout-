import { indexedDbStorageAdapter, type StorageAdapter } from '../utils/storageAdapter';
import { createDefaultControllerProfile, createDefaultControllerProfiles } from './controllerProfiles';
import type {
  ControllerDeviceFamily,
  ControllerProfile,
  ControllerProfileEnvelope,
} from './types';

export const CONTROLLER_PROFILES_STORAGE_KEY = 'sportscout_controller_profiles_v1';
export const CONTROLLER_PROFILE_SCHEMA_VERSION = '1.0' as const;

function createDefaultEnvelope(): ControllerProfileEnvelope {
  const profiles = createDefaultControllerProfiles();
  return {
    schemaVersion: CONTROLLER_PROFILE_SCHEMA_VERSION,
    profiles,
    activeProfileByFamily: Object.fromEntries(
      profiles.map((profile) => [profile.deviceFamily, profile.id]),
    ) as Record<ControllerDeviceFamily, string>,
  };
}

function isDeviceFamily(value: unknown): value is ControllerDeviceFamily {
  return value === 'ps4' || value === 'ps5' || value === 'xbox' || value === 'generic';
}

function sanitizeEnvelope(value: unknown): ControllerProfileEnvelope {
  const defaults = createDefaultEnvelope();
  if (!value || typeof value !== 'object') return defaults;
  const input = value as Partial<ControllerProfileEnvelope>;
  if (input.schemaVersion !== CONTROLLER_PROFILE_SCHEMA_VERSION || !Array.isArray(input.profiles)) {
    return defaults;
  }

  const validProfiles = input.profiles
    .filter((profile): profile is ControllerProfile =>
      Boolean(
        profile &&
        typeof profile.id === 'string' &&
        typeof profile.name === 'string' &&
        profile.version === 1 &&
        isDeviceFamily(profile.deviceFamily) &&
        profile.bindings &&
        profile.calibration,
      ),
    )
    .map((profile) => {
      const isLegacyDefaultCollision =
        profile.id === `default-${profile.deviceFamily}` &&
        profile.bindings.openResult === 'button-east' &&
        profile.bindings.cancel === 'button-east';
      return isLegacyDefaultCollision
        ? { ...profile, bindings: { ...profile.bindings, cancel: 'left-stick' as const } }
        : profile;
    });
  const profiles = [...validProfiles];
  for (const defaultProfile of defaults.profiles) {
    if (!profiles.some((profile) => profile.deviceFamily === defaultProfile.deviceFamily)) {
      profiles.push(defaultProfile);
    }
  }

  const activeProfileByFamily = { ...defaults.activeProfileByFamily };
  for (const family of Object.keys(activeProfileByFamily) as ControllerDeviceFamily[]) {
    const candidate = input.activeProfileByFamily?.[family];
    if (candidate && profiles.some((profile) => profile.id === candidate && profile.deviceFamily === family)) {
      activeProfileByFamily[family] = candidate;
    } else {
      activeProfileByFamily[family] = profiles.find((profile) => profile.deviceFamily === family)!.id;
    }
  }

  return {
    schemaVersion: CONTROLLER_PROFILE_SCHEMA_VERSION,
    profiles,
    activeProfileByFamily,
  };
}

export function createControllerProfileRepository(
  storage: StorageAdapter = indexedDbStorageAdapter,
) {
  async function load(): Promise<ControllerProfileEnvelope> {
    const stored = await storage.getItem(CONTROLLER_PROFILES_STORAGE_KEY);
    const state = sanitizeEnvelope(stored);
    if (stored === null || JSON.stringify(stored) !== JSON.stringify(state)) {
      await storage.setItem(CONTROLLER_PROFILES_STORAGE_KEY, state);
    }
    return state;
  }

  async function saveProfile(profile: ControllerProfile): Promise<ControllerProfileEnvelope> {
    if (!isDeviceFamily(profile.deviceFamily) || profile.version !== 1) {
      throw new Error('Unsupported controller profile');
    }
    const state = await load();
    const updatedProfile = { ...profile, updatedAt: new Date().toISOString() };
    const existingIndex = state.profiles.findIndex((item) => item.id === profile.id);
    const profiles = [...state.profiles];
    if (existingIndex >= 0) profiles[existingIndex] = updatedProfile;
    else profiles.push(updatedProfile);
    const next: ControllerProfileEnvelope = {
      ...state,
      profiles,
      activeProfileByFamily: {
        ...state.activeProfileByFamily,
        [profile.deviceFamily]: profile.id,
      },
    };
    await storage.setItem(CONTROLLER_PROFILES_STORAGE_KEY, next);
    return next;
  }

  async function getActiveProfile(family: ControllerDeviceFamily): Promise<ControllerProfile> {
    const state = await load();
    const activeId = state.activeProfileByFamily[family];
    return state.profiles.find((profile) => profile.id === activeId) ??
      state.profiles.find((profile) => profile.deviceFamily === family)!;
  }

  async function setActiveProfile(
    family: ControllerDeviceFamily,
    profileId: string,
  ): Promise<ControllerProfileEnvelope> {
    const state = await load();
    if (!state.profiles.some((profile) => profile.id === profileId && profile.deviceFamily === family)) {
      throw new Error('Controller profile not found');
    }
    const next = {
      ...state,
      activeProfileByFamily: { ...state.activeProfileByFamily, [family]: profileId },
    };
    await storage.setItem(CONTROLLER_PROFILES_STORAGE_KEY, next);
    return next;
  }

  async function duplicateProfile(
    profileId: string,
    name: string,
    requestedId?: string,
  ): Promise<ControllerProfile> {
    const state = await load();
    const source = state.profiles.find((profile) => profile.id === profileId);
    if (!source) throw new Error('Controller profile not found');
    const id = requestedId ?? globalThis.crypto?.randomUUID?.() ?? `controller-${Date.now()}`;
    const now = new Date().toISOString();
    const duplicate: ControllerProfile = {
      ...source,
      id,
      name: name.trim().slice(0, 80) || `${source.name} Copy`,
      bindings: { ...source.bindings },
      calibration: { ...source.calibration },
      createdAt: now,
      updatedAt: now,
    };
    await saveProfile(duplicate);
    return duplicate;
  }

  async function resetProfile(profileId: string): Promise<ControllerProfile> {
    const state = await load();
    const current = state.profiles.find((profile) => profile.id === profileId);
    if (!current) throw new Error('Controller profile not found');
    const defaults = createDefaultControllerProfile(current.deviceFamily);
    const reset: ControllerProfile = {
      ...current,
      bindings: { ...defaults.bindings },
      calibration: { ...defaults.calibration },
      updatedAt: new Date().toISOString(),
    };
    await saveProfile(reset);
    return reset;
  }

  return {
    load,
    saveProfile,
    getActiveProfile,
    setActiveProfile,
    duplicateProfile,
    resetProfile,
  };
}
