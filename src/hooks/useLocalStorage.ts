import { useState, useCallback } from "react";

function safeMerge<T>(initial: T, parsed: unknown): T {
  if (initial === null || initial === undefined) return parsed as T;
  if (parsed === null || parsed === undefined) return initial;

  if (Array.isArray(initial)) {
    if (!Array.isArray(parsed)) return initial;
    const cleanParsed = parsed.filter(
      (item) => item !== null && item !== undefined,
    );
    if (initial.length > 0) {
      const template = initial[0];
      return cleanParsed.map((item) =>
        safeMerge(template, item),
      ) as unknown as T;
    }
    return cleanParsed as unknown as T;
  }

  if (typeof initial === "object") {
    if (typeof parsed !== "object" || Array.isArray(parsed)) return initial;

    const parsedRecord = parsed as Record<string, unknown>;
    const initialRecord = initial as Record<string, unknown>;
    const result: Record<string, unknown> = { ...initialRecord };
    for (const key of Object.keys(initialRecord)) {
      const val = parsedRecord[key];
      if (val === null || val === undefined) {
        // Keep initial default value for null/undefined properties
        continue;
      }

      const expectedType = typeof initialRecord[key];
      const actualType = typeof val;

      if (expectedType !== "undefined" && actualType !== expectedType) {
        // Keep initial default value on type mismatch
        continue;
      }

      if (expectedType === "object" && initialRecord[key] !== null) {
        result[key] = safeMerge(initialRecord[key], val);
      } else {
        result[key] = val;
      }
    }
    return result as unknown as T;
  }

  if (typeof initial !== typeof parsed) {
    return initial;
  }

  return parsed as T;
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        return initialValue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(item);
      } catch (parseErr) {
        console.warn(
          `Error parsing localStorage key "${key}", clearing:`,
          parseErr,
        );
        try {
          window.localStorage.removeItem(key);
        } catch {
          // Ignore storage removal errors
        }
        return initialValue;
      }

      return safeMerge(initialValue, parsed);
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      setStoredValue((currentStoredValue) => {
        const valueToStore =
          value instanceof Function ? value(currentStoredValue) : value;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          } catch (error) {
            console.warn(`Error setting localStorage key "${key}":`, error);
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
              window.dispatchEvent(new CustomEvent('localStorageQuotaExceeded', { detail: { key } }));
            }
            return currentStoredValue;
          }
        }
        return valueToStore;
      });
    },
    [key],
  );

  return [storedValue, setValue] as const;
}
