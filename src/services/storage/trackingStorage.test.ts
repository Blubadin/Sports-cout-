import { describe, expect, it } from 'vitest';
import {
  ensureTrackingObjectStores,
  TRACKING_STORE_NAMES,
  MemoryTrackingDriver,
  IndexedDbTrackingDriver,
  saveTrackingAnalysis,
  downsampleAndChunkTrackingSamples,
  TrackingAnalysisStreamBuilder,
  getTrackingAnalysis,
  setTrackingStorageDriver,
  MAX_TRACKING_PAGE_SIZE,
  type TrackingTelemetryPage,
  type TrackingAnalysis,
  type TrackingSampleChunk,
} from './trackingStorage';

describe('tracking IndexedDB schema', () => {
  it('creates every required object store during one upgrade', () => {
    const created: string[] = [];
    const existing = new Set<string>(['trackingAnalyses']);
    const db = {
      objectStoreNames: { contains: (name: string) => existing.has(name) },
      createObjectStore: (name: string) => {
        created.push(name);
        existing.add(name);
      },
    };

    ensureTrackingObjectStores(db);

    expect(created).toEqual(['trackingSampleChunks', 'trackingCandidates', 'trackingTelemetryPages']);
    expect(TRACKING_STORE_NAMES.every((name) => existing.has(name))).toBe(true);
  });

  it('keeps a completed result retryable when chunk persistence fails', async () => {
    class FailingChunkDriver extends MemoryTrackingDriver {
      async saveChunks(): Promise<void> {
        throw new Error('chunk write failed');
      }
    }
    const driver = new FailingChunkDriver();
    setTrackingStorageDriver(driver);
    const analysis: TrackingAnalysis = {
      id: 'analysis-retry', projectId: 'p1', sportType: 'badminton', gameType: 'singles',
      status: 'completed', engineVersion: 'tracking-v2', detectorModel: 'YOLO', trackerModel: 'ByteTrack',
      sampleRateHz: 10, createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
      players: [], quality: { detectionCoverage: 1, lostTimePercent: 0, confidence: 1, manualCorrections: 0 },
      summary: { durationSeconds: 0, sampleCount: 0, players: {} },
    };
    const chunks: TrackingSampleChunk[] = [];

    await expect(saveTrackingAnalysis(analysis, chunks)).rejects.toThrow('chunk write failed');
    expect((await getTrackingAnalysis(analysis.id))?.status).toBe('processing');
  });
});

describe('bounded tracking telemetry persistence', () => {
  it('stores cursor pages idempotently and retrieves only the next bounded page', async () => {
    const driver = new MemoryTrackingDriver();
    const makePage = (startCursor: number, frameIndexes: number[]): TrackingTelemetryPage => ({
      id: `a:${String(startCursor).padStart(20, '0')}`,
      analysisId: 'a',
      startCursor,
      endCursor: startCursor + frameIndexes.length,
      frames: frameIndexes.map((frameIndex) => ({
        schemaVersion: 1,
        analysisId: 'a',
        timestampSec: frameIndex / 30,
        frameIndex,
        players: [],
      })),
    });
    const first = makePage(0, [1, 2]);
    const second = makePage(2, [3, 4]);

    await driver.saveTelemetryPage(first);
    await driver.saveTelemetryPage(first);
    await driver.saveTelemetryPage(second);

    const page = await driver.getTelemetryPage('a', 0);
    expect(page?.frames.map((frame) => frame.frameIndex)).toEqual([1, 2]);
    expect(page?.endCursor).toBe(2);
    expect(await driver.getTelemetryPage('a', page?.endCursor ?? 0)).toEqual(second);
    expect(MAX_TRACKING_PAGE_SIZE).toBe(250);
  });

  it('rejects conflicting retries and pages larger than the configured hard maximum', async () => {
    const driver = new MemoryTrackingDriver();
    const page: TrackingTelemetryPage = {
      id: `a:${String(0).padStart(20, '0')}`,
      analysisId: 'a',
      startCursor: 0,
      endCursor: 1,
      frames: [{ schemaVersion: 1, analysisId: 'a', timestampSec: 0, frameIndex: 1, players: [] }],
    };
    await driver.saveTelemetryPage(page);
    await expect(driver.saveTelemetryPage({ ...page, frames: [{ ...page.frames[0], frameIndex: 2 }] })).rejects.toThrow(/conflicts/);
    const oversized = Array.from({ length: MAX_TRACKING_PAGE_SIZE + 1 }, (_, index) => ({
      ...page.frames[0], frameIndex: index,
    }));
    await expect(driver.saveTelemetryPage({ ...page, endCursor: oversized.length, frames: oversized })).rejects.toThrow(/maximum page size/);
  });

  it('deletes analysis records, chunks, candidates, and raw cursor pages idempotently', async () => {
    const driver = new MemoryTrackingDriver();
    const analysis: TrackingAnalysis = {
      id: 'analysis-delete', projectId: 'p1', sportType: 'badminton', gameType: 'singles',
      status: 'completed', engineVersion: 'tracking-v2', detectorModel: 'YOLO', trackerModel: 'ByteTrack',
      sampleRateHz: 10, createdAt: new Date().toISOString(),
      players: [], quality: null, summary: { durationSeconds: 0, sampleCount: 0, players: {} },
    };
    const chunk: TrackingSampleChunk = {
      id: 'analysis-delete:0', analysisId: 'analysis-delete', chunkIndex: 0,
      startTime: 0, endTime: 0, samples: [],
    };
    const page: TrackingTelemetryPage = {
      id: `analysis-delete:${String(0).padStart(20, '0')}`,
      analysisId: 'analysis-delete', startCursor: 0, endCursor: 1,
      frames: [{ schemaVersion: 1, analysisId: 'analysis-delete', timestampSec: 0, frameIndex: 0, players: [] }],
    };
    await driver.saveAnalysis(analysis);
    await driver.saveChunks([chunk]);
    await driver.saveCandidate({ id: 'candidate-1', analysisId: analysis.id, timestamp: 0, type: 'stroke_candidate', confidence: 0.9 });
    await driver.saveTelemetryPage(page);

    await driver.deleteAnalysis(analysis.id);
    await driver.deleteAnalysis(analysis.id);

    expect(await driver.getAnalysis(analysis.id)).toBeNull();
    expect(await driver.getChunks(analysis.id)).toEqual([]);
    expect(await driver.getCandidates(analysis.id)).toEqual([]);
    expect(await driver.getTelemetryPage(analysis.id, 0)).toBeNull();
  });
});

describe('streaming tracking analysis aggregation', () => {
  it('keeps chunk, movement, calibration and quality summaries consistent across cursor pages', () => {
    const calibration = {
      calibrationId: 'cal-1', cameraSegmentId: 'segment-1', state: 'CALIBRATED' as const,
      source: 'manual' as const, createdAtFrame: 0, createdAtTimestampSec: 0,
    };
    const frames = Array.from({ length: 20 }, (_, index) => ({
      schemaVersion: 1 as const,
      analysisId: 'stream-analysis',
      timestampSec: index / 10,
      frameIndex: index + 1,
      isMetricValid: true,
      cameraSegmentId: 'segment-1',
      calibrationId: 'cal-1',
      calibrationState: 'CALIBRATED' as const,
      calibration,
      players: [{
        playerId: 'P1',
        state: 'observed' as const,
        detectionConfidence: 0.9,
        totalDistanceM: 5,
        speedMps: 1,
        courtPosition: {
          xM: 2 + index / 10, yM: 3, xPct: (2 + index / 10) / 6.1 * 100, yPct: 3 / 13.4 * 100,
        },
      }],
    }));
    const expected = downsampleAndChunkTrackingSamples('stream-analysis', frames, 10, 1, { P1: { totalDistanceM: 5 } });
    const builder = new TrackingAnalysisStreamBuilder('stream-analysis', ['P1'], 10, 1);
    const firstPage = frames.slice(0, 10);
    const secondPage = frames.slice(10);
    const emitted = [
      ...builder.addFrames(firstPage),
      ...builder.addFrames(secondPage),
      ...builder.finishChunks(),
    ];
    builder.addDispersionFrames(firstPage);
    builder.addDispersionFrames(secondPage);
    const actual = builder.finish();

    expect(emitted.flatMap((chunk) => chunk.samples)).toEqual(expected.chunks.flatMap((chunk) => chunk.samples));
    expect(actual.summary.durationSeconds).toBe(expected.summary.durationSeconds);
    expect(actual.summary.sampleCount).toBe(expected.summary.sampleCount);
    expect(actual.summary.players.P1).toEqual(expected.summary.players.P1);
    expect(actual.quality).toEqual(expected.quality);
    expect(actual.calibrationTimeline).toEqual(expected.calibrationTimeline);
  });
});


describe('persistent storage availability', () => {
  it('surfaces an unavailable browser store instead of acknowledging a durable write', async () => {
    const driver = new IndexedDbTrackingDriver();
    await expect(driver.saveTelemetryPage({
      id: 'unavailable:00000000000000000000', analysisId: 'unavailable',
      startCursor: 0, endCursor: 1,
      frames: [{ schemaVersion: 1, analysisId: 'unavailable', timestampSec: 0, frameIndex: 1, players: [] }],
    })).rejects.toThrow('Persistent tracking storage is unavailable');
  });
});
