import { del, get, set } from "idb-keyval";
import { scopedStorageKey } from '../pilot/releasePolicy';

export type StorageAdapter<T = unknown> = {
  getItem: (key: string) => Promise<T | null>;
  setItem: (key: string, value: T) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const indexedDbStorageAdapter: StorageAdapter = {
  async getItem(key) {
    const value = await get(scopedStorageKey(key));
    return value === undefined ? null : value;
  },
  async setItem(key, value) {
    await set(scopedStorageKey(key), value);
  },
  async removeItem(key) {
    await del(scopedStorageKey(key));
  },
};

export const localStorageAdapter: StorageAdapter = {
  async getItem(key) {
    const raw = window.localStorage.getItem(scopedStorageKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },
  async setItem(key, value) {
    window.localStorage.setItem(scopedStorageKey(key), JSON.stringify(value));
  },
  async removeItem(key) {
    window.localStorage.removeItem(scopedStorageKey(key));
  },
};
