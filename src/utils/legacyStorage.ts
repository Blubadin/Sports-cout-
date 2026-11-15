/**
 * One-time read helper for legacy localStorage keys during IndexedDB migration/recovery.
 * Match/project state must not be continuously written back to localStorage.
 */
export function readLegacyLocalStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch (error) {
    console.warn(`Error reading legacy localStorage key "${key}":`, error);
    return fallback;
  }
}
