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

export type ExistingIndexedDbReadResult<T> = {
  value: T | null;
  failed: boolean;
};

export function readExistingIndexedDbItem<T = unknown>(
  databaseName: string,
  storeName: string,
  key: IDBValidKey,
): Promise<ExistingIndexedDbReadResult<T>> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve({ value: null, failed: true });
      return;
    }

    let settled = false;
    const finish = (value: T | null, failed: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ value, failed });
    };

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(databaseName);
    } catch {
      finish(null, true);
      return;
    }

    request.onupgradeneeded = () => {
      // Opening a missing database triggers an upgrade. Abort so recovery never creates storage.
      request.transaction?.abort();
      finish(null, false);
    };
    request.onerror = () => finish(null, true);
    request.onblocked = () => finish(null, true);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.close();
        finish(null, false);
        return;
      }

      try {
        const getRequest = database
          .transaction(storeName, 'readonly')
          .objectStore(storeName)
          .get(key);
        getRequest.onsuccess = () => {
          database.close();
          finish((getRequest.result as T | undefined) ?? null, false);
        };
        getRequest.onerror = () => {
          database.close();
          finish(null, true);
        };
      } catch {
        database.close();
        finish(null, true);
      }
    };
  });
}

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
