import { afterEach, describe, expect, it, vi } from 'vitest';
import { readExistingIndexedDbItem } from '../../utils/storageAdapter';

const originalIndexedDb = globalThis.indexedDB;

afterEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: originalIndexedDb,
  });
});

describe('readExistingIndexedDbItem', () => {
  it('aborts an upgrade instead of creating a missing database', async () => {
    const abort = vi.fn();
    const request = {
      transaction: { abort },
      onupgradeneeded: null as null | (() => void),
      onerror: null as null | (() => void),
      onblocked: null as null | (() => void),
      onsuccess: null as null | (() => void),
    };
    const open = vi.fn(() => {
      queueMicrotask(() => request.onupgradeneeded?.());
      return request;
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open },
    });

    const result = await readExistingIndexedDbItem('keyval-store', 'keyval', 'scout-projects:v1.1');

    expect(open).toHaveBeenCalledWith('keyval-store');
    expect(abort).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: null, failed: false });
  });
});
