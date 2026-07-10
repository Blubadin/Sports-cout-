import { describe, expect, it } from 'vitest';
import {
  readMediaCurrentTime,
  readMediaDuration,
} from '../utils/videoPlayerEvents';

describe('videoPlayerEvents', () => {
  it('reads current time from a media event', () => {
    expect(
      readMediaCurrentTime({ currentTarget: { currentTime: 12.5 } }, 0),
    ).toBe(12.5);
  });

  it('falls back when current time is not finite', () => {
    expect(
      readMediaCurrentTime({ currentTarget: { currentTime: Number.NaN } }, 7),
    ).toBe(7);
  });

  it('reads duration from ReactPlayer v3 duration callback values', () => {
    expect(readMediaDuration(98.25, 0)).toBe(98.25);
  });

  it('reads duration from native media events', () => {
    expect(
      readMediaDuration({ currentTarget: { duration: 123.4 } }, 0),
    ).toBe(123.4);
  });

  it('falls back when duration is not positive and finite', () => {
    expect(readMediaDuration({ currentTarget: { duration: Infinity } }, 10)).toBe(10);
    expect(readMediaDuration(0, 10)).toBe(10);
  });
});
