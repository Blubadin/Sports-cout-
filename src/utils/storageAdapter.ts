import { del, get, set } from "idb-keyval";

export type StorageAdapter<T = unknown> = {
  getItem: (key: string) => Promise<T | null>;
  setItem: (key: string, value: T) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const indexedDbStorageAdapter: StorageAdapter = {
  async getItem(key) {
    const value = await get(key);
    return value === undefined ? null : value;
  },
  async setItem(key, value) {
    await set(key, value);
  },
  async removeItem(key) {
    await del(key);
  },
};

export const localStorageAdapter: StorageAdapter = {
  async getItem(key) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },
  async setItem(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  },
  async removeItem(key) {
    window.localStorage.removeItem(key);
  },
};
