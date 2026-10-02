import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrackingSessionStatus, TrackingTelemetryV1 } from '../../types';
import TrackingVideoOverlay, { resolveOverlayAtTime } from './TrackingVideoOverlay';
import { ShuttleDiagnostics, ShuttleOverlay } from './ShuttleOverlay';
import {
  framesForCameraSegmentAtTime,
  MAX_TRACKING_OVERLAY_WINDOW_FRAMES,
  TrackingOverlayWindowLoader,
  trackingOverlayStatusText,
} from './trackingOverlayWindow';

const status = (overrides: Partial<TrackingSessionStatus> = {}): TrackingSessionStatus => ({
  sessionId: 'run-1', status: 'COMPLETED', progressPct: 100, currentFrame: 1000,
  totalFrames: 1000, analyzedFrames: 1000, frameStride: 1, elapsedSec: 1,
  videoDurationSec: 100, lastTelemetryTimestampSec: 100, sourceFps: 10, samplingFps: 10,
  analysisFps: 10, trackedPlayerCount: 2, device: 'cpu', players: [], error: null,
  committedResultCursor: 1000, ...overrides,
});

const frame = (index: number, segment = 'segment-a'): TrackingTelemetryV1 => ({
  schemaVersion: 1,
  analysisId: 'run-1',
  pipelineRunId: 'run-1',
  timestampSec: index / 10,
  frameIndex: index,
  cameraSegmentId: segment,
  players: [],
  shuttle: {
    timestampSec: index / 10,
    frameIndex: index,
    positionPx: { x: index, y: 10 },
    confidence: 0.8,
    state: 'observed',
    source: 'temporal_tracker',
    trajectoryId: 'trajectory-a',
  },
});

const pageFor = (rows: TrackingTelemetryV1[]) => vi.fn(async (_id: string, cursor: number, limit: number) => {
  const items = rows.slice(cursor, cursor + limit);
  return { sessionId: _id, telemetry: items, nextCursor: cursor + items.length };
});

describe('bounded seek-time overlay windows', () => {
  it('loads backend results for a seek before the live ring, including after reload', async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => frame(index));
    const fetchPage = pageFor(rows);
    const loader = new TrackingOverlayWindowLoader();
    const result = await loader.load(
      { projectId: 'project-a', sessionId: 'run-1', timeSec: 10, status: status() },
      vi.fn(), fetchPage,
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.window.projectId).toBe('project-a');
    expect(result.window.frames.some((sample) => sample.timestampSec === 10)).toBe(true);
    expect(result.window.frames.length).toBeLessThanOrEqual(MAX_TRACKING_OVERLAY_WINDOW_FRAMES);
    expect(fetchPage).toHaveBeenCalledWith('run-1', expect.any(Number), expect.any(Number), expect.any(AbortSignal));

    // A fresh loader has no live state/cache and can retrieve the same saved window.
    const reloaded = await new TrackingOverlayWindowLoader().load(
      { projectId: 'project-a', sessionId: 'run-1', timeSec: 10, status: status() },
      vi.fn(), pageFor(rows),
    );
    expect(reloaded.status).toBe('ready');
  });

  it('rejects a delayed result after a newer rapid seek takes ownership', async () => {
    const loader = new TrackingOverlayWindowLoader();
    let releaseFirst!: (value: { sessionId: string; telemetry: TrackingTelemetryV1[]; nextCursor: number }) => void;
    const delayedPage = vi.fn((id: string, cursor: number) => new Promise<{ sessionId: string; telemetry: TrackingTelemetryV1[]; nextCursor: number }>((resolve) => {
      if (cursor < 100) releaseFirst = resolve;
      else resolve({ sessionId: id, telemetry: [frame(500)], nextCursor: cursor + 1 });
    }));
    const first = loader.load(
      { projectId: 'project-a', sessionId: 'run-1', timeSec: 2, status: status() }, vi.fn(), delayedPage,
    );
    const second = await loader.load(
      { projectId: 'project-a', sessionId: 'run-1', timeSec: 50, status: status() }, vi.fn(), delayedPage,
    );
    releaseFirst({ sessionId: 'run-1', telemetry: [frame(20)], nextCursor: 21 });
    expect(second.status).toBe('ready');
    expect(await first).toEqual({ status: 'stale' });
  });

  it('returns unavailable for a missing backend page and does not treat progress as a commit cursor', async () => {
    const loader = new TrackingOverlayWindowLoader();
    const result = await loader.load(
      { projectId: 'project-a', sessionId: 'run-1', timeSec: 50, status: status({ committedResultCursor: undefined }) },
      vi.fn().mockResolvedValue(status({ committedResultCursor: undefined })),
      vi.fn().mockResolvedValue({ sessionId: 'run-1', telemetry: [], nextCursor: 0 }),
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('rejects a backend page whose run owner differs from the requested session', async () => {
    const loader = new TrackingOverlayWindowLoader();
    await expect(loader.load(
      { projectId: 'project-a', sessionId: 'run-1', timeSec: 10, status: status() },
      vi.fn(),
      vi.fn().mockResolvedValue({ sessionId: 'run-2', telemetry: [frame(100)], nextCursor: 1 }),
    )).rejects.toThrow(/different run/);
  });

  it('keeps the seek window bounded and reports bilingual loading/error/unavailable states', async () => {
    const fetchPage = pageFor(Array.from({ length: 1000 }, (_, index) => frame(index)));
    const result = await new TrackingOverlayWindowLoader().load(
      { projectId: 'project-a', sessionId: 'run-1', timeSec: 50, status: status() }, vi.fn(), fetchPage,
    );
    expect(result.status).toBe('ready');
    expect(fetchPage.mock.calls.every(([, , limit]) => limit <= MAX_TRACKING_OVERLAY_WINDOW_FRAMES)).toBe(true);
    expect(trackingOverlayStatusText('loading', false)).toMatch(/Loading/);
    expect(trackingOverlayStatusText('error', true)).toMatch(/ไม่สำเร็จ/);
    expect(trackingOverlayStatusText('unavailable', true)).toMatch(/ไม่มีข้อมูล/);
  });

  it('keeps player interpolation and shuttle trails inside the active camera segment', () => {
    const before = frame(100, 'segment-before');
    const atCut = frame(101, 'segment-after');
    const later = frame(102, 'segment-after');
    before.shuttle = { ...before.shuttle!, state: 'lost', positionPx: null, confidence: null };
    before.players = [{ playerId: 'P1', state: 'observed', detectionConfidence: 0.9, bboxPct: { x: 10, y: 10, width: 10, height: 20 } }];
    atCut.players = [{ playerId: 'P1', state: 'observed', detectionConfidence: 0.9, bboxPct: { x: 70, y: 10, width: 10, height: 20 } }];
    const resolution = resolveOverlayAtTime([before, atCut], 10);
    expect(resolution.status).toBe('resolved');
    if (resolution.status === 'resolved') expect(resolution.players[0].provenance).toBe('observed');
    // main's cut guard also prevents holding the old box between segment samples.
    const betweenSegments = resolveOverlayAtTime([before, atCut], 10.05);
    expect(betweenSegments.status).toBe('unavailable');
    expect(betweenSegments.players).toEqual([]);
    expect(framesForCameraSegmentAtTime([before, atCut, later], 10.15).map((sample) => sample.cameraSegmentId))
      .toEqual(['segment-after', 'segment-after']);

    render(<ShuttleOverlay frames={[before, atCut, later]} time={10.2} mode="trail" width={640} height={360} />);
    expect(screen.getAllByTestId('shuttle-trail')).toHaveLength(1);
    expect(screen.getByTestId('shuttle-trail')).toHaveAttribute('cx', '101');
    render(<ShuttleDiagnostics frames={[before, atCut, later]} time={10.2} />);
    expect(screen.getByLabelText('Shuttle diagnostics')).toHaveTextContent('Observed % (samples): 100.0%');
  });
});
