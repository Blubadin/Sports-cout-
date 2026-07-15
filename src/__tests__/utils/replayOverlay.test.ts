import { describe, expect, it } from 'vitest';
import { clampReplayOverlayPosition } from '../../utils/replayOverlay';

describe('clampReplayOverlayPosition', () => {
  it('keeps a replay panel within its container', () => {
    expect(clampReplayOverlayPosition(
      { x: 900, y: -20 },
      { width: 1000, height: 600 },
      { width: 360, height: 240 },
    )).toEqual({ x: 632, y: 8 });
  });

  it('pins an oversized panel to the safe padding instead of returning negative coordinates', () => {
    expect(clampReplayOverlayPosition(
      { x: 100, y: 100 },
      { width: 320, height: 180 },
      { width: 360, height: 240 },
    )).toEqual({ x: 8, y: 8 });
  });

  it('supports safe-area padding', () => {
    expect(clampReplayOverlayPosition(
      { x: 0, y: 0 },
      { width: 800, height: 500 },
      { width: 300, height: 200 },
      { top: 16, right: 12, bottom: 20, left: 24 },
    )).toEqual({ x: 24, y: 16 });
  });
});
