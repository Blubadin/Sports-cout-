import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TrackingVideoOverlay, {
  deriveOverlayFreshnessToleranceSec,
  frameAtTime,
  resolveOverlayAtTime,
} from '../../components/labs/TrackingVideoOverlay';
import type { TrackingPlayerV1, TrackingTelemetryV1 } from '../../types';

const player = (
  state: TrackingPlayerV1['state'] = 'observed',
  x = 0,
  playerId = 'P1',
): TrackingPlayerV1 => ({
  playerId,
  trackId: 17,
  detectionConfidence: 0.9,
  state,
  bboxPct: { x, y: 20, width: 10, height: 20 },
  groundPointPct: { x: x + 5, y: 40 },
  courtPosition: { xM: 1, yM: 2, xPct: x + 5, yPct: 40 },
});

const frame = (
  timestampSec: number,
  players: TrackingPlayerV1[] = [player()],
  frameIndex = Math.round(timestampSec * 1000),
): TrackingTelemetryV1 => ({
  schemaVersion: 1,
  analysisId: 'timing-test',
  timestampSec,
  frameIndex,
  players,
});

describe('Phase 0.4 overlay time resolver', () => {
  afterEach(cleanup);

  it('resolves an exact timestamp as an observed measurement', () => {
    const result = resolveOverlayAtTime([frame(1), frame(1.1)], 1.1);

    expect(result.status).toBe('resolved');
    expect(result.players[0].provenance).toBe('observed');
    expect(result.sourceTimestampSec).toBe(1.1);
  });

  it('uses the nearest prior observation inside the cadence-derived tolerance', () => {
    const result = resolveOverlayAtTime([frame(1), frame(1.1)], 1.22);

    expect(result.status).toBe('resolved');
    expect(result.players[0].provenance).toBe('observed');
    expect(result.sourceTimestampSec).toBe(1.1);
  });

  it('marks a prior observation outside tolerance as stale', () => {
    const result = resolveOverlayAtTime([frame(1), frame(1.1)], 1.26);

    expect(result.status).toBe('stale');
    expect(result.players).toEqual([]);
  });

  it('does not resolve future-only telemetry', () => {
    const result = resolveOverlayAtTime([frame(1), frame(1.1)], 0.9);

    expect(result.status).toBe('unavailable');
    expect(result.players).toEqual([]);
  });

  it('interpolates display geometry between adjacent observed measurements only', () => {
    const before = frame(1, [player('observed', 10)]);
    const after = frame(1.1, [player('observed', 20)]);
    before.players[0].detectionConfidence = 0.7;
    before.players[0].totalDistanceM = 4;
    after.players[0].detectionConfidence = 0.95;
    after.players[0].totalDistanceM = 9;
    const result = resolveOverlayAtTime([before, after], 1.05);

    expect(result.status).toBe('resolved');
    expect(result.players[0].provenance).toBe('interpolated');
    expect(result.players[0].player.bboxPct?.x).toBeCloseTo(15);
    expect(result.players[0].player.detectionConfidence).toBe(0.7);
    expect(result.players[0].player.totalDistanceM).toBe(4);
    expect(before.players[0].bboxPct?.x).toBe(10);
    expect(after.players[0].bboxPct?.x).toBe(20);
  });

  it('does not label a player interpolated when no display geometry is compatible', () => {
    const beforePlayer = player('observed', 10);
    const afterPlayer = { ...player('observed', 20), bboxPct: null, groundPointPct: null };
    const result = resolveOverlayAtTime([
      frame(1, [beforePlayer]),
      frame(1.1, [afterPlayer]),
    ], 1.05);

    expect(result.players[0].provenance).toBe('observed');
    expect(result.players[0].player).toBe(beforePlayer);
  });

  it('does not reuse an incompatible pose on an otherwise interpolated player', () => {
    const beforePlayer = {
      ...player('observed', 10),
      pose: { keypoints: [{ x: 10, y: 20, score: 0.8 }] },
    };
    const afterPlayer = player('observed', 20);
    const result = resolveOverlayAtTime([
      frame(1, [beforePlayer]),
      frame(1.1, [afterPlayer]),
    ], 1.05);

    expect(result.players[0].provenance).toBe('interpolated');
    expect(result.players[0].player.bboxPct?.x).toBeCloseTo(15);
    expect(result.players[0].player.pose).toBeNull();
  });

  it('keeps the legacy frame API on source telemetry without leaking interpolation', () => {
    const frames = [frame(1, [player('observed', 10)]), frame(1.1, [player('observed', 20)])];

    const legacyFrame = frameAtTime(frames, 1.05);

    expect(legacyFrame).toBe(frames[0]);
    expect(legacyFrame?.timestampSec).toBe(1);
    expect(legacyFrame?.players[0].bboxPct?.x).toBe(10);
  });

  it('keeps the legacy frame API aligned with the last duplicate timestamp selected by binary search', () => {
    const first = frame(1, [player('observed', 10)], 10);
    const last = frame(1, [player('observed', 20)], 11);

    expect(frameAtTime([first, last], 1)).toBe(last);
  });

  it('preserves backend predicted provenance instead of presenting it as observed', () => {
    const result = resolveOverlayAtTime([frame(1, [player('predicted')])], 1);

    expect(result.status).toBe('resolved');
    expect(result.players[0].provenance).toBe('predicted');
    expect(result.players[0].player.state).toBe('predicted');
  });

  it('does not interpolate a predicted state into a later observation', () => {
    const result = resolveOverlayAtTime([
      frame(1, [player('predicted', 10)]),
      frame(1.1, [player('observed', 20)]),
    ], 1.05);

    expect(result.players[0].provenance).toBe('predicted');
    expect(result.players[0].player.bboxPct?.x).toBe(10);
  });

  it('preserves lost provenance and does not render stale geometry', () => {
    const frames = [frame(1, [player('lost')])];
    const result = resolveOverlayAtTime(frames, 1);

    expect(result.status).toBe('resolved');
    expect(result.players[0].provenance).toBe('lost');

    render(<TrackingVideoOverlay frames={frames} time={1} mode="box" />);
    expect(screen.queryByTestId('player-overlay-P1')).not.toBeInTheDocument();
  });

  it('does not make multi-second-old telemetry fresh while processing', () => {
    const frames = [frame(1), frame(1.1)];
    const result = resolveOverlayAtTime(frames, 3.1, true);

    expect(result.status).toBe('stale');
    render(<TrackingVideoOverlay frames={frames} time={3.1} mode="box" isProcessing />);
    expect(screen.queryByTestId('player-bbox')).not.toBeInTheDocument();
  });

  it.each([
    { hz: 7.5, expectedInterval: 1 / 7.5 },
    { hz: 10, expectedInterval: 0.1 },
    { hz: 15, expectedInterval: 1 / 15 },
  ])('derives a small freshness tolerance from $hz Hz telemetry', ({ expectedInterval }) => {
    const frames = [frame(0), frame(expectedInterval), frame(expectedInterval * 2)];
    const tolerance = deriveOverlayFreshnessToleranceSec(frames);

    expect(tolerance).toBeCloseTo(expectedInterval * 1.5, 5);
    expect(tolerance).toBeLessThan(0.25);
  });

  it('uses a bounded recent cadence window for long telemetry streams', () => {
    const olderSlowFrames = Array.from({ length: 80 }, (_, index) => frame(index));
    const recentFastFrames = Array.from(
      { length: 32 },
      (_, index) => frame(80 + index * 0.1, [player()], 80_000 + index),
    );

    expect(deriveOverlayFreshnessToleranceSec([...olderSlowFrames, ...recentFastFrames])).toBeCloseTo(0.15);
  });

  it.each([
    { fps: 30, tick: 2, expectedStatus: 'resolved', expectedProvenance: 'interpolated' },
    { fps: 60, tick: 3, expectedStatus: 'resolved', expectedProvenance: 'interpolated' },
    { fps: 30, tick: 3, expectedStatus: 'resolved', expectedProvenance: 'observed' },
    { fps: 60, tick: 6, expectedStatus: 'resolved', expectedProvenance: 'observed' },
    { fps: 30, tick: 8, expectedStatus: 'stale', expectedProvenance: undefined },
    { fps: 60, tick: 16, expectedStatus: 'stale', expectedProvenance: undefined },
  ])('keeps timestamp provenance at the $fps FPS playback tick boundary', ({
    fps,
    tick,
    expectedStatus,
    expectedProvenance,
  }) => {
    const frames = [frame(0, [player('observed', 0)]), frame(0.1, [player('observed', 10)])];
    const result = resolveOverlayAtTime(frames, tick / fps);

    expect(result.status).toBe(expectedStatus);
    expect(result.players[0]?.provenance).toBe(expectedProvenance);
  });

  it('styles predicted and interpolated overlays without changing their provenance', () => {
    const { rerender } = render(
      <TrackingVideoOverlay frames={[frame(1, [player('predicted')])]} time={1} mode="box" />,
    );
    expect(screen.getByTestId('player-overlay-P1')).toHaveAttribute('data-overlay-state', 'predicted');
    expect(screen.getByTestId('player-bbox')).toHaveAttribute('stroke-dasharray');

    rerender(
      <TrackingVideoOverlay
        frames={[frame(1, [player('observed', 10)]), frame(1.1, [player('observed', 20)])]}
        time={1.05}
        mode="box"
      />,
    );
    expect(screen.getByTestId('player-overlay-P1')).toHaveAttribute('data-overlay-state', 'interpolated');
    expect(screen.getByTestId('player-overlay-P1')).toHaveAttribute('opacity', '0.85');
  });
});
