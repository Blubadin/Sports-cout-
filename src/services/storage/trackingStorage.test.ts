import { describe, expect, it } from 'vitest';
import {
  ensureTrackingObjectStores,
  TRACKING_STORE_NAMES,
  MemoryTrackingDriver,
  IndexedDbTrackingDriver,
  saveTrackingAnalysis,
  downsampleAndChunkTrackingSamples,
  TrackingAnalysisStreamBuilder,
  computePlayerMovementMetrics,
  computeMultiPlayerMovementMetrics,
  getTrackingAnalysis,
  getTrackingTelemetryPage,
  getTrackingSamples,
  getTrackingMovementMetrics,
  listTrackingAnalysisPage,
  getLatestTrackingAnalysisForProject,
  setTrackingStorageDriver,
  saveTrackingTelemetryPage,
  MAX_TRACKING_PAGE_SIZE,
  type TrackingTelemetryPage,
  type TrackingAnalysis,
  type TrackingSampleChunk,
} from './trackingStorage';
import type { TrackingTelemetryV1 } from '../../types';

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

describe('paged tracking analysis consumers', () => {
  const makeSample = (index: number) => ({
    timestamp: index,
    frameIndex: index,
    playerId: 'P1',
    courtX: 2 + (index % 20) * 0.05,
    courtY: 3 + (index % 7) * 0.1,
    speed: null,
    confidence: 0.9,
    trackingState: 'tracked' as const,
  });

  it('retrieves a bounded tail page after the 250 chunk cursor', async () => {
    const driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
    await driver.saveChunks(Array.from({ length: 251 }, (_, chunkIndex) => ({
      id: `analysis-pages:${chunkIndex}`,
      analysisId: 'analysis-pages',
      chunkIndex,
      startTime: chunkIndex,
      endTime: chunkIndex,
      samples: [makeSample(chunkIndex)],
    })));

    const tail = await getTrackingSamples('analysis-pages', {
      afterChunkIndex: 249,
      limit: 10,
      startTime: 250,
      endTime: 250,
    });

    expect(tail.samples.map((sample) => sample.frameIndex)).toEqual([250]);
    expect(tail.nextCursor).toBeNull();
    expect(tail.hasMore).toBe(false);
  });

  it('ends a time-window page before later chunks outside the requested interval', async () => {
    const driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
    await driver.saveChunks(Array.from({ length: 251 }, (_, chunkIndex) => ({
      id: `analysis-window:${chunkIndex}`,
      analysisId: 'analysis-window',
      chunkIndex,
      startTime: chunkIndex,
      endTime: chunkIndex,
      samples: [makeSample(chunkIndex)],
    })));

    const lastRequestedPage = await getTrackingSamples('analysis-window', {
      afterChunkIndex: 9,
      limit: 1,
      startTime: 10,
      endTime: 10,
    });

    expect(lastRequestedPage.samples.map((sample) => sample.frameIndex)).toEqual([10]);
    expect(lastRequestedPage.nextCursor).toBeNull();
    expect(lastRequestedPage.hasMore).toBe(false);
  });

  it('aggregates complete and filtered movement metrics across every chunk with bounded reads', async () => {
    class CountingDriver extends MemoryTrackingDriver {
      readCount = 0;
      largestRead = 0;
      async getChunks(analysisId: string, afterChunkIndex = -1, limit = MAX_TRACKING_PAGE_SIZE) {
        this.readCount += 1;
        this.largestRead = Math.max(this.largestRead, limit);
        return super.getChunks(analysisId, afterChunkIndex, limit);
      }
    }
    const driver = new CountingDriver();
    setTrackingStorageDriver(driver);
    const samples = Array.from({ length: 251 }, (_, index) => makeSample(index));
    const analysis: TrackingAnalysis = {
      id: 'analysis-metrics-pages', projectId: 'project-pages', sportType: 'badminton', gameType: 'singles',
      status: 'completed', engineVersion: 'tracking-v2', detectorModel: 'YOLO', trackerModel: 'ByteTrack',
      sampleRateHz: 1, createdAt: new Date(0).toISOString(), completedAt: new Date(1).toISOString(),
      players: [{ playerId: 'P1', side: 'near' }], quality: null,
      summary: { durationSeconds: 250, sampleCount: 251, players: {} },
    };
    const chunks = samples.map((sample, chunkIndex) => ({
      id: `${analysis.id}:${chunkIndex}`, analysisId: analysis.id, chunkIndex,
      startTime: sample.timestamp, endTime: sample.timestamp, samples: [sample],
    }));

    await saveTrackingAnalysis(analysis, chunks);
    const expectedAll = computePlayerMovementMetrics(samples);
    const expectedRange = computePlayerMovementMetrics(samples.filter((sample) => sample.timestamp >= 220 && sample.timestamp <= 250));
    const all = await getTrackingMovementMetrics(analysis.id);
    const filtered = await getTrackingMovementMetrics(analysis.id, { startTime: 220, endTime: 250, playerId: 'P1' });
    const reloaded = await getTrackingAnalysis(analysis.id);
    const afterReload = await getTrackingMovementMetrics(reloaded!.id);

    expect(all.metrics).toEqual(expectedAll);
    expect(filtered.metrics).toEqual(expectedRange);
    expect(afterReload.metrics).toEqual(expectedAll);
    expect(all.sampleCount).toBe(251);
    expect(driver.largestRead).toBeLessThanOrEqual(MAX_TRACKING_PAGE_SIZE);
    expect(driver.readCount).toBe(12);
  });

  it('matches pooled multi-player movement metrics without retaining the complete sample set', async () => {
    const driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
    const samples = Array.from({ length: 251 }, (_, index) => [
      {
        ...makeSample(index),
        timestamp: index / 10,
        playerId: 'P1',
        courtX: 1 + (index % 17) * 0.08,
        trackingState: index % 31 === 0 ? 'lost' as const : 'tracked' as const,
      },
      {
        ...makeSample(index),
        timestamp: index / 10,
        playerId: 'P2',
        courtX: 4 + (index % 13) * 0.06,
        courtY: 8 + (index % 11) * 0.1,
        cameraSegmentId: index < 125 ? 'segment-a' : 'segment-b',
        trackingState: index % 37 === 0 ? 'predicted' as const : 'tracked' as const,
      },
    ]).flat();
    const analysis: TrackingAnalysis = {
      id: 'analysis-multi-pages', projectId: 'project-pages', sportType: 'badminton', gameType: 'doubles',
      status: 'completed', engineVersion: 'tracking-v2', detectorModel: 'YOLO', trackerModel: 'ByteTrack',
      sampleRateHz: 10, createdAt: new Date(0).toISOString(), completedAt: new Date(1).toISOString(),
      players: [{ playerId: 'P1', side: 'near' }, { playerId: 'P2', side: 'far' }], quality: null,
      summary: { durationSeconds: 25, sampleCount: samples.length, players: {} },
    };
    await saveTrackingAnalysis(analysis, Array.from({ length: 251 }, (_, chunkIndex) => ({
      id: `${analysis.id}:${chunkIndex}`, analysisId: analysis.id, chunkIndex,
      startTime: samples[chunkIndex * 2].timestamp,
      endTime: samples[chunkIndex * 2 + 1].timestamp,
      samples: samples.slice(chunkIndex * 2, chunkIndex * 2 + 2),
    })));

    const result = await getTrackingMovementMetrics(analysis.id);

    expect(result.metrics).toEqual(computeMultiPlayerMovementMetrics(samples));
    expect(result.sampleCount).toBe(samples.length);
    expect(result.uniqueTimestampCount).toBe(251);
  });

  it('pages analyses by a stable cursor and finds the latest record beyond the first page', async () => {
    const driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
    const base: TrackingAnalysis = {
      id: 'analysis', projectId: 'page-project', sportType: 'badminton', gameType: 'singles',
      status: 'completed', engineVersion: 'tracking-v2', detectorModel: 'YOLO', trackerModel: 'ByteTrack',
      sampleRateHz: 1, createdAt: new Date(0).toISOString(), players: [], quality: null,
      summary: { durationSeconds: 0, sampleCount: 0, players: {} },
    };
    for (let index = 0; index < 251; index += 1) {
      await driver.saveAnalysis({ ...base, id: `analysis-${String(index).padStart(3, '0')}`, createdAt: new Date(index * 1000).toISOString() });
    }

    const firstPage = await listTrackingAnalysisPage({ projectId: 'page-project', limit: 250 });
    const latest = await getLatestTrackingAnalysisForProject('page-project');

    expect(firstPage.analyses).toHaveLength(250);
    expect(firstPage.analyses[0].id).toBe('analysis-000');
    expect(firstPage.nextCursor).not.toBeNull();
    expect(latest?.id).toBe('analysis-250');
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

  it('round-trips shuttle camera and run ownership through saved telemetry pages', async () => {
    const driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
    const frame: TrackingTelemetryV1 = {
      schemaVersion: 1,
      analysisId: 'shuttle-owners',
      pipelineRunId: 'run-42',
      timestampSec: 1,
      frameIndex: 30,
      players: [],
      shuttle: {
        timestampSec: 1,
        frameIndex: 30,
        positionPx: { x: 320, y: 180 },
        confidence: 0.9,
        state: 'observed',
        source: 'temporal_tracker',
        trajectoryId: null,
        cameraSegmentId: 'segment-2',
        pipelineRunId: 'run-42',
      },
    };

    await saveTrackingTelemetryPage({
      id: 'shuttle-owners:00000000000000000000',
      analysisId: 'shuttle-owners',
      startCursor: 0,
      endCursor: 1,
      frames: [frame],
    });

    const restored = await getTrackingTelemetryPage('shuttle-owners', 0);
    expect(restored?.frames[0].shuttle?.cameraSegmentId).toBe('segment-2');
    expect(restored?.frames[0].shuttle?.pipelineRunId).toBe('run-42');
  });

  it('normalizes legacy lost provenance on persistence, reload, and sample export', async () => {
    const driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
    const legacyFrame: TrackingTelemetryV1 = {
      schemaVersion: 1,
      analysisId: 'legacy-lost',
      timestampSec: 1,
      frameIndex: 30,
      players: [{
        playerId: 'P1',
        state: 'lost',
        observationState: 'observed',
        groundPointProvenance: 'pose_both_ankles',
        courtPosition: { xM: 2, yM: 3, xPct: 32.8, yPct: 22.4 },
      }],
    };

    await saveTrackingTelemetryPage({
      id: 'legacy-lost:00000000000000000000',
      analysisId: 'legacy-lost',
      startCursor: 0,
      endCursor: 1,
      frames: [legacyFrame],
    });
    const restored = await getTrackingTelemetryPage('legacy-lost', 0);
    expect(restored?.frames[0].players[0].observationState).toBeNull();

    const exported = downsampleAndChunkTrackingSamples('legacy-lost', [legacyFrame]);
    const sample = exported.chunks.flatMap((chunk) => chunk.samples)[0];
    expect(sample.observationState).toBeNull();
    expect(sample.groundPointProvenance).toBeNull();
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


describe('canonical ground quality in local metric summaries', () => {
  it('excludes bbox visual points and samples stabilized coordinates consistently', () => {
    const frames: TrackingTelemetryV1[] = [0, 1, 2].map((index) => ({
      schemaVersion: 1, analysisId: 'quality', frameIndex: index + 1, timestampSec: index,
      isMetricValid: true, calibrationState: 'CALIBRATED', calibrationId: 'c', cameraSegmentId: 's',
      calibration: { state: 'CALIBRATED', calibrationId: 'c', cameraSegmentId: 's', source: 'manual', createdAtFrame: 1, createdAtTimestampSec: 0, confidence: 1 },
      players: [{ playerId: 'P1', state: 'observed', totalDistanceM: 0,
        groundPointProvenance: index === 1 ? 'bbox_bottom_center' : 'pose_both_ankles',
        rawGroundPoint: { metricEligible: index !== 1 } as TrackingTelemetryV1['players'][number]['rawGroundPoint'],
        filteredGroundPoint: index === 1 ? null : { xM: 3, yM: 5 },
        courtPosition: { xM: 1 + index, yM: 8, xPct: 10, yPct: 20 },
      }],
    }));
    const batch = downsampleAndChunkTrackingSamples('quality', frames);
    const builder = new TrackingAnalysisStreamBuilder('quality', ['P1']);
    const stream = [...builder.addFrames(frames), ...builder.finishChunks()];
    const samples = batch.chunks.flatMap((chunk) => chunk.samples);
    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => [sample.courtX, sample.courtY, sample.normalizedX, sample.normalizedY]))
      .toEqual([[3, 5, 0.492, 0.373], [3, 5, 0.492, 0.373]]);
    expect(stream.flatMap((chunk) => chunk.samples)).toEqual(samples);
    expect(builder.finish().summary.players.P1.totalDistanceMeters).toBe(0);
  });
});


it('does not reintegrate stabilized jitter when canonical accepted travel is zero', () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({
    timestamp: i / 10, playerId: 'P1', courtX: 3 + (i % 2 ? 0.05 : -0.05), courtY: 5,
    cumulativeDistanceM: 0, speed: 0, confidence: 0.9, trackingState: 'tracked' as const,
    groundPointProvenance: 'pose_both_ankles' as const,
  }));
  const metrics = computePlayerMovementMetrics(samples);
  expect(metrics.totalDistanceMeters).toBe(0);
  expect(metrics.maxSpeedMps).toBe(0);
});
