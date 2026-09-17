import { describe, expect, it } from 'vitest';
import { SPORTSCOUT_CREATOR } from './appMetadata';

describe('app credits', () => {
  it('identifies the creator for the Settings credit line', () => {
    expect(SPORTSCOUT_CREATOR).toBe('Blubadin keawkham');
  });
});
