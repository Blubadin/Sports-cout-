import { describe, expect, it } from 'vitest';
import { resolveLocalVideoState } from '../../utils/videoState';

describe('resolveLocalVideoState', () => {
  it('distinguishes an empty local source from a missing stored file', () => {
    expect(resolveLocalVideoState({ hasSource: false, hasStoredHandle: false })).toBe('idle');
    expect(resolveLocalVideoState({ hasSource: true, hasStoredHandle: false })).toBe('missing');
  });

  it('reports permission states without treating them as missing files', () => {
    expect(resolveLocalVideoState({ hasSource: true, hasStoredHandle: true, permission: 'prompt' })).toBe('permission-required');
    expect(resolveLocalVideoState({ hasSource: true, hasStoredHandle: true, permission: 'denied' })).toBe('denied');
    expect(resolveLocalVideoState({ hasSource: true, hasStoredHandle: true, permission: 'granted' })).toBe('ready');
  });

  it('rejects non-video files explicitly', () => {
    expect(resolveLocalVideoState({ hasSource: true, hasStoredHandle: true, isVideoFile: false })).toBe('unsupported');
  });
});
