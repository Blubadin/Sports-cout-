import { describe, expect, it, vi } from 'vitest';
import type { TrackingSessionStatus, TrackingTelemetryV1 } from '../../types';
import { MemoryTrackingDriver, getTrackingTelemetryTimeRange, setTrackingStorageDriver } from '../../services/storage/trackingStorage';
import { estimateCursor, framesForCameraSegmentAtTime, TrackingOverlayWindowLoader } from './trackingOverlayWindow';

const frame = (i: number, session = 'run'): TrackingTelemetryV1 => ({
  schemaVersion: 1, analysisId: session, pipelineRunId: session, timestampSec: i / 30,
  frameIndex: i + 1, cameraSegmentId: i < 4500 ? 'one' : 'two', players: [], shuttle: null,
});
const status = { committedResultCursor: 9000, videoDurationSec: 300, frameStride: 1, sourceFps: 30 } as TrackingSessionStatus;

describe('production indexed local telemetry retrieval', () => {
  it('uses the committed time span for a partially analyzed long video', () => {
    const partial = { ...status, committedResultCursor: 4500, lastTelemetryTimestampSec: 149.967 };
    expect(estimateCursor(100, 4500, partial)).toBe(3000);
    expect(estimateCursor(100, 4500, { ...partial, lastTelemetryTimestampSec: undefined })).toBe(3000);
  });

  it('seeks to start, middle, end and backward with bounded indexed reads and no backend', async () => {
    const driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
    for (let cursor = 0; cursor < 9000; cursor += 250) {
      await driver.saveTelemetryPage({ id: `analysis:${String(cursor).padStart(20, '0')}`, analysisId: 'analysis', startCursor: cursor,
        endCursor: cursor + 250, frames: Array.from({ length: 250 }, (_, offset) => frame(cursor + offset)) });
    }
    const read = vi.spyOn(driver, 'getTelemetryPage');
    const backend = vi.fn();
    const loader = new TrackingOverlayWindowLoader();
    const local = (_id: string, start: number, end: number, signal: AbortSignal) =>
      getTrackingTelemetryTimeRange('analysis', start, end, Math.max(0, estimateCursor(start, 9000, status) - 1), signal);
    for (const timeSec of [0, 150, 299, 70, 250, 149]) {
      loader.clearCache();
      read.mockClear();
      const result = await loader.load({ projectId: 'project', sessionId: 'run', timeSec, status }, vi.fn(), backend, local);
      expect(result.status).toBe('ready');
      expect(read.mock.calls.length).toBeLessThanOrEqual(4);
      if (timeSec >= 70) expect(read.mock.calls[0][1]).toBeGreaterThan(1000);
      if (result.status === 'ready') {
        expect(result.window.frames.some((f) => Math.abs(f.timestampSec - timeSec) < .04)).toBe(true);
        const segment = timeSec < 150 ? 'one' : 'two';
        expect(framesForCameraSegmentAtTime(result.window.frames, timeSec).every((f) => f.cameraSegmentId === segment)).toBe(true);
      }
    }
    expect(backend).not.toHaveBeenCalled();
  });

  it('rejects delayed local results after a newer seek or session takes ownership', async () => {
    const loader = new TrackingOverlayWindowLoader();
    let release!: (frames: TrackingTelemetryV1[]) => void;
    const slow = loader.load({ projectId: 'project', sessionId: 'run', timeSec: 10, status }, vi.fn(), vi.fn(),
      () => new Promise((resolve) => { release = resolve; }));
    const next = await loader.load({ projectId: 'project2', sessionId: 'run2', timeSec: 250, status }, vi.fn(), vi.fn(),
      async () => [frame(7499, 'run2'), frame(7500, 'run2'), frame(7501, 'run2')]);
    release([frame(300)]);
    expect(await slow).toEqual({ status: 'stale' });
    expect(next.status).toBe('ready');
    expect(loader.getCachedFrames('run', 10)).toBeNull();
  });

  it('does not mistake a cache hole or page zero for a middle-video result', async () => {
    const loader = new TrackingOverlayWindowLoader();
    loader.addFramesToCache('run', [frame(1200), frame(1800)]);
    expect(loader.getCachedFrames('run', 50)).toBeNull();
    const backend = vi.fn(async (_id: string, cursor: number) => ({ sessionId: 'run', nextCursor: cursor + 1, telemetry: [frame(4500)] }));
    const result = await loader.load({ projectId: 'project', sessionId: 'run', timeSec: 150, status }, vi.fn(), backend,
      async () => [frame(0), frame(1)]);
    expect(result.status).toBe('ready');
    // One recovery read and one preserved background prefetch.
    expect(backend).toHaveBeenCalledTimes(2);
  });
});
