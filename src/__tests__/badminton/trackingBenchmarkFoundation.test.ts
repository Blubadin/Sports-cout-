import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateProcessingRatio,
  createBenchmarkRun,
  createBenchmarkRunFromAnalysis,
  createBenchmarkRunFromSessionStatus,
  serializeBenchmarkRun,
  deserializeBenchmarkRun,
  saveBenchmarkRun,
  getBenchmarkRun,
  listBenchmarkRuns,
  deleteBenchmarkRun,
  clearInMemoryBenchmarkStore,
} from '../../utils/trackingBenchmark';
import type {
  TrackingBenchmarkRun,
  TrackingBenchmarkQuality,
  TrackingBenchmarkPlayerQuality,
} from '../../types/benchmark';
import type { TrackingAnalysis } from '../../services/storage/trackingStorage';
import type { TrackingSessionStatus } from '../../types';

describe('Phase 0.6A — Tracking Benchmark Foundation', () => {
  beforeEach(() => {
    clearInMemoryBenchmarkStore();
  });

  // Helper to create a standard complete benchmark run
  const createStandardRun = (overrides?: Partial<TrackingBenchmarkRun>): TrackingBenchmarkRun => {
    return createBenchmarkRun({
      identity: {
        runId: 'bench_run_001',
        createdAt: '2026-09-21T10:00:00.000Z',
        sport: 'badminton',
        videoFingerprint: 'match_court_1_hash',
        videoReference: 'court_match_rally.mp4',
        trackingMode: 'singles',
        processingProfile: 'balanced',
      },
      modelConfig: {
        detectorName: 'yolov8n',
        detectorVersion: '8.2.0',
        poseModel: 'yolov8n-pose',
        trackerName: 'bytetrack',
        trackerVersion: '0.3.2',
        detectorInputSize: 512,
        confidenceThreshold: 0.25,
        frameStride: 2,
        poseStride: 1,
        maxPlayers: 2,
        device: 'cuda',
      },
      videoMetadata: {
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceFps: 60,
        durationSeconds: 3600, // 60 minutes
        totalSourceFrames: 216000,
      },
      performance: {
        framesAnalyzed: 108000,
        analysisFps: 60.0,
        elapsedSeconds: 1800, // 30 real minutes
        effectiveTelemetryHz: 30.0,
        processingRatio: 0.5,
      },
      quality: {
        meanTargetCoverage: 0.95,
        simultaneousTargetCoverage: 0.92,
        playerCoverage: {
          P1: {
            playerId: 'P1',
            observedCoverage: 0.96,
            predictedPercent: 3.5,
            lostPercent: 0.5,
            meanObservedConfidence: 0.88,
          },
          P2: {
            playerId: 'P2',
            observedCoverage: 0.94,
            predictedPercent: 4.5,
            lostPercent: 1.5,
            meanObservedConfidence: 0.85,
          },
        },
      },
      identityAudit: {
        idSwitchCount: 1,
        manualCorrectionCount: 0,
        identityContinuity: 0.98,
      },
      groundTruth: {
        meanCourtPositionError: 0.12,
        medianCourtPositionError: 0.09,
        p95CourtPositionError: 0.24,
        distanceError: 1.4,
        identityAccuracy: 0.99,
        identityContinuity: 0.98,
      },
      ...overrides,
    });
  };

  it('1. complete benchmark run serializes and deserializes correctly', () => {
    const original = createStandardRun();
    const serialized = serializeBenchmarkRun(original);
    expect(typeof serialized).toBe('string');

    const deserialized = deserializeBenchmarkRun(serialized);
    expect(deserialized).toEqual(original);
    expect(deserialized.identity.runId).toBe('bench_run_001');
    expect(deserialized.modelConfig.detectorName).toBe('yolov8n');
    expect(deserialized.performance.processingRatio).toBe(0.5);
    expect(deserialized.quality.meanTargetCoverage).toBe(0.95);
  });

  it('2. unavailable values remain unavailable (undefined/null, not fabricated)', () => {
    const minimalRun = createBenchmarkRun({
      identity: {
        runId: 'bench_minimal_002',
        createdAt: '2026-09-21T10:00:00.000Z',
        sport: 'badminton',
        trackingMode: 'singles',
        processingProfile: 'reference',
      },
      modelConfig: {
        detectorName: 'yolov8n',
        poseModel: 'yolov8n-pose',
        trackerName: 'bytetrack',
        detectorInputSize: 640,
        confidenceThreshold: 0.25,
        frameStride: 2,
        poseStride: 1,
        maxPlayers: 2,
        device: 'cpu',
      },
      videoMetadata: {
        sourceWidth: 1280,
        sourceHeight: 720,
        sourceFps: 30,
        durationSeconds: 120,
      },
      performance: {
        framesAnalyzed: 1800,
        analysisFps: 15.0,
        elapsedSeconds: 120,
        effectiveTelemetryHz: 15.0,
        processingRatio: 1.0,
      },
      quality: {
        meanTargetCoverage: 0.90,
        simultaneousTargetCoverage: 0.85,
        playerCoverage: {},
      },
      // identityAudit and groundTruth are omitted
    });

    expect(minimalRun.modelConfig.detectorVersion).toBeNull();
    expect(minimalRun.modelConfig.trackerVersion).toBeNull();
    expect(minimalRun.videoMetadata.totalSourceFrames).toBeNull();
    expect(minimalRun.identityAudit).toBeUndefined();
    expect(minimalRun.groundTruth).toBeUndefined();

    // Verify after JSON roundtrip that omitted fields remain absent
    const serialized = serializeBenchmarkRun(minimalRun);
    const parsed = JSON.parse(serialized);
    expect(parsed.identityAudit).toBeUndefined();
    expect(parsed.groundTruth).toBeUndefined();
  });

  it('3. measured zero remains strictly different from unknown/unavailable', () => {
    // Case A: Measured 0 id switches and 0.0 court position error
    const runWithZeroes = createStandardRun({
      identityAudit: {
        idSwitchCount: 0, // Measured exactly 0
        manualCorrectionCount: 0,
        identityContinuity: 1.0,
      },
      groundTruth: {
        meanCourtPositionError: 0.0, // Measured perfect 0.0 error
        medianCourtPositionError: 0.0,
        p95CourtPositionError: 0.0,
        distanceError: 0.0,
        identityAccuracy: 1.0,
        identityContinuity: 1.0,
      },
    });

    // Case B: Unknown / unmeasured (null or undefined)
    const runWithUnknown = createStandardRun({
      identityAudit: {
        idSwitchCount: null, // Unknown
        manualCorrectionCount: null,
        identityContinuity: null,
      },
      groundTruth: undefined, // No reference data exists
    });

    // Measured zero must be 0, not null/undefined
    expect(runWithZeroes.identityAudit?.idSwitchCount).toBe(0);
    expect(runWithZeroes.groundTruth?.meanCourtPositionError).toBe(0.0);
    expect(runWithZeroes.identityAudit?.idSwitchCount).not.toBeNull();
    expect(runWithZeroes.groundTruth?.meanCourtPositionError).not.toBeNull();

    // Unknown must remain null/undefined
    expect(runWithUnknown.identityAudit?.idSwitchCount).toBeNull();
    expect(runWithUnknown.groundTruth).toBeUndefined();

    // Zero must not equal null or undefined
    expect(runWithZeroes.identityAudit?.idSwitchCount === runWithUnknown.identityAudit?.idSwitchCount).toBe(false);
  });

  it('normalizes NaN, Infinity, and invalid rate metadata to null', () => {
    const run = createStandardRun({
      videoMetadata: {
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceFps: Number.NaN,
        durationSeconds: Number.POSITIVE_INFINITY,
        totalSourceFrames: null,
      },
      performance: {
        framesAnalyzed: 0,
        analysisFps: Number.POSITIVE_INFINITY,
        elapsedSeconds: Number.NaN,
        effectiveTelemetryHz: Number.NaN,
        processingRatio: null,
      },
    });

    expect(run.videoMetadata.sourceFps).toBeNull();
    expect(run.videoMetadata.durationSeconds).toBeNull();
    expect(run.performance.analysisFps).toBeNull();
    expect(run.performance.elapsedSeconds).toBeNull();
    expect(run.performance.effectiveTelemetryHz).toBeNull();
    expect(run.performance.framesAnalyzed).toBe(0);
  });

  it('4. per-player quality stays separated', () => {
    const run = createStandardRun();
    const p1 = run.quality.playerCoverage['P1'];
    const p2 = run.quality.playerCoverage['P2'];

    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    // Distinct metrics for each player
    expect(p1.playerId).toBe('P1');
    expect(p2.playerId).toBe('P2');
    expect(p1.observedCoverage).toBe(0.96);
    expect(p2.observedCoverage).toBe(0.94);
    expect(p1.lostPercent).toBe(0.5);
    expect(p2.lostPercent).toBe(1.5);
    expect(p1.meanObservedConfidence).toBe(0.88);
    expect(p2.meanObservedConfidence).toBe(0.85);

    // Modifying P1 copy must not mutate P2
    p1.observedCoverage = 0.99;
    expect(p2.observedCoverage).toBe(0.94);
  });

  it('5. detector/tracker names are configurable (supports future YOLO11, YOLO26, Norfair, etc.)', () => {
    const futureRun = createBenchmarkRun({
      identity: {
        runId: 'future_eval_001',
        createdAt: '2026-09-21T11:00:00.000Z',
        sport: 'badminton',
        trackingMode: 'doubles',
        processingProfile: 'quality',
      },
      modelConfig: {
        detectorName: 'yolo11x', // Future detector
        detectorVersion: '11.0.1',
        poseModel: 'yolo11x-pose',
        trackerName: 'norfair', // Non-ByteTrack future tracker
        trackerVersion: '2.2.0',
        detectorInputSize: 640,
        confidenceThreshold: 0.30,
        frameStride: 1,
        poseStride: 1,
        maxPlayers: 4,
        device: 'tensorrt', // Future runtime
      },
      videoMetadata: {
        sourceWidth: 3840,
        sourceHeight: 2160,
        sourceFps: 60,
        durationSeconds: 600,
      },
      performance: {
        framesAnalyzed: 36000,
        analysisFps: 120.0,
        elapsedSeconds: 300,
        effectiveTelemetryHz: 60.0,
        processingRatio: 0.5,
      },
      quality: {
        meanTargetCoverage: 0.98,
        simultaneousTargetCoverage: 0.95,
        playerCoverage: {},
      },
    });

    expect(futureRun.modelConfig.detectorName).toBe('yolo11x');
    expect(futureRun.modelConfig.trackerName).toBe('norfair');
    expect(futureRun.modelConfig.device).toBe('tensorrt');
    expect(futureRun.modelConfig.maxPlayers).toBe(4);
  });

  it('6. ground-truth fields do not become fake zeros when reference data is missing', () => {
    const analysisWithoutGt = {
      id: 'analysis_legacy_001',
      projectId: 'proj-1',
      sportType: 'badminton',
      gameType: 'singles',
      trackedPlayerCount: 2,
      status: 'completed',
      engineVersion: '1.0.0',
      detectorModel: 'yolov8n',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      createdAt: '2026-09-21T08:00:00.000Z',
      players: [],
    } as unknown as TrackingAnalysis;

    const benchmark = createBenchmarkRunFromAnalysis(analysisWithoutGt);

    // groundTruth must NOT exist or be populated with fake zeros (e.g. 0.0 error)
    expect(benchmark.groundTruth).toBeUndefined();

    // Explicit check: no 0.0 error injected
    const serialized = JSON.parse(serializeBenchmarkRun(benchmark));
    expect(serialized.groundTruth).toBeUndefined();
  });

  it('keeps missing detector, tracker, rate, video, and quality measurements null', () => {
    const unknownAnalysis = {
      id: 'analysis_unknown',
      projectId: 'project_unknown',
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      createdAt: '2026-09-21T08:00:00.000Z',
      players: [],
      summary: { sampleCount: 0, durationSeconds: 0, players: {} },
    } as unknown as TrackingAnalysis;

    const benchmark = createBenchmarkRunFromAnalysis(unknownAnalysis);

    expect(benchmark.modelConfig.detectorName).toBeNull();
    expect(benchmark.modelConfig.trackerName).toBeNull();
    expect(benchmark.modelConfig.confidenceThreshold).toBeNull();
    expect(benchmark.videoMetadata.sourceFps).toBeNull();
    expect(benchmark.videoMetadata.durationSeconds).toBeNull();
    expect(benchmark.performance.analysisFps).toBeNull();
    expect(benchmark.performance.effectiveTelemetryHz).toBeNull();
    expect(benchmark.quality.meanTargetCoverage).toBeNull();
    expect(benchmark.quality.simultaneousTargetCoverage).toBeNull();
  });

  it('does not infer simultaneous coverage or confidence from unrelated live metrics', () => {
    const status = {
      sessionId: 'status_partial',
      trackedPlayerCount: 2,
      quality: {
        observedCoveragePct: 50,
        playerCoverage: {
          P1: {
            playerId: 'P1',
            expectedFrames: 2,
            observedFrames: 1,
            predictedFrames: 0,
            lostFrames: 1,
            observedCoveragePct: 50,
            predictedFramesPct: 0,
            lostFramesPct: 50,
            lostTimeSec: 1,
          },
        },
      },
    } as unknown as TrackingSessionStatus;

    const benchmark = createBenchmarkRunFromSessionStatus(status);

    expect(benchmark.quality.meanTargetCoverage).toBe(0.5);
    expect(benchmark.quality.simultaneousTargetCoverage).toBeNull();
    expect(benchmark.quality.playerCoverage.P1.meanObservedConfidence).toBeNull();
    expect(benchmark.performance.effectiveTelemetryHz).toBeNull();
  });

  it('7. older current ByteTrack run can still populate the schema', () => {
    const olderAnalysis = {
      id: 'analysis_bytetrack_phase02',
      projectId: 'project-legacy',
      sportType: 'badminton',
      gameType: 'singles',
      trackedPlayerCount: 2,
      status: 'completed',
      videoFingerprint: 'legacy_vid_hash',
      localFileName: 'singles_game1.mp4',
      engineVersion: '1.0.0',
      detectorModel: 'yolov8n',
      trackerModel: 'bytetrack',
      poseModel: 'yolov8n-pose',
      sampleRateHz: 10,
      nominalAnalysisHz: 15,
      effectiveStoredHz: 10,
      createdAt: '2026-09-21T07:30:00.000Z',
      device: 'cpu',
      effectiveDevice: 'cpu',
      analyzedFrames: 300,
      videoMetadata: {
        width: 1920,
        height: 1080,
        nominalFps: 30,
        durationSec: 20,
        reportedFrameCount: 600,
      },
      performance: {
        elapsedSec: 10,
        videoDurationSec: 20,
        analysisFps: 30,
        samplingFps: 10,
        rtf: 0.5,
        realtimeSpeed: 2.0,
      },
      quality: {
        detectionCoverage: 0.92,
        meanTargetCoverage: 0.92,
        simultaneousTargetCoverage: 0.88,
        lostTimePercent: 8,
        confidence: 0.87,
        playerCoverage: {
          P1: {
            playerId: 'P1',
            observedFrameCount: 280,
            predictedFrameCount: 15,
            lostFrameCount: 5,
            detectionCoverage: 0.933,
            predictedPercent: 5.0,
            lostPercent: 1.7,
            meanObservedConfidence: 0.88,
          },
          P2: {
            playerId: 'P2',
            observedFrameCount: 270,
            predictedFrameCount: 20,
            lostFrameCount: 10,
            detectionCoverage: 0.90,
            predictedPercent: 6.7,
            lostPercent: 3.3,
            meanObservedConfidence: 0.86,
          },
        },
      },
      players: [
        { playerId: 'P1', name: 'Player 1', side: 'far' },
        { playerId: 'P2', name: 'Player 2', side: 'near' },
      ],
    } as unknown as TrackingAnalysis;

    const benchmark = createBenchmarkRunFromAnalysis(olderAnalysis);

    expect(benchmark.identity.runId).toBe('benchmark_analysis_bytetrack_phase02');
    expect(benchmark.identity.sport).toBe('badminton');
    expect(benchmark.identity.videoFingerprint).toBe('legacy_vid_hash');
    expect(benchmark.identity.videoReference).toBe('singles_game1.mp4');
    expect(benchmark.modelConfig.detectorName).toBe('yolov8n');
    expect(benchmark.modelConfig.trackerName).toBe('bytetrack');
    expect(benchmark.videoMetadata.sourceWidth).toBe(1920);
    expect(benchmark.videoMetadata.durationSeconds).toBe(20);
    expect(benchmark.performance.elapsedSeconds).toBe(10);
    expect(benchmark.performance.processingRatio).toBe(0.5); // 10s elapsed / 20s duration
    expect(benchmark.quality.meanTargetCoverage).toBe(0.92);
    expect(benchmark.quality.simultaneousTargetCoverage).toBe(0.88);
    expect(benchmark.quality.playerCoverage['P1'].observedCoverage).toBe(0.933);
    expect(benchmark.quality.playerCoverage['P2'].observedCoverage).toBe(0.90);
  });

  it('8. processingRatio calculation matches the exact specification', () => {
    // 60-minute video processed in 30 real minutes -> processingRatio = 0.5
    expect(calculateProcessingRatio(1800, 3600)).toBe(0.5);

    // Real-time: 60s elapsed for 60s video -> 1.0
    expect(calculateProcessingRatio(60, 60)).toBe(1.0);

    // Slower than real-time: 120s elapsed for 60s video -> 2.0
    expect(calculateProcessingRatio(120, 60)).toBe(2.0);

    // Invalid / unavailable inputs must return null (do not fabricate)
    expect(calculateProcessingRatio(null, 3600)).toBeNull();
    expect(calculateProcessingRatio(1800, null)).toBeNull();
    expect(calculateProcessingRatio(undefined, 3600)).toBeNull();
    expect(calculateProcessingRatio(1800, 0)).toBeNull();
    expect(calculateProcessingRatio(1800, -10)).toBeNull();
    expect(calculateProcessingRatio(-5, 60)).toBeNull();
  });

  it('9. supports persistence and listing of benchmark runs', async () => {
    const run1 = createStandardRun({
      identity: {
        runId: 'run_alpha',
        createdAt: '2026-09-21T09:00:00.000Z',
        sport: 'badminton',
        trackingMode: 'singles',
        processingProfile: 'balanced',
      },
    });

    const run2 = createStandardRun({
      identity: {
        runId: 'run_beta',
        createdAt: '2026-09-21T10:00:00.000Z',
        sport: 'badminton',
        trackingMode: 'singles',
        processingProfile: 'fast',
      },
    });

    await saveBenchmarkRun(run1);
    await saveBenchmarkRun(run2);

    const retrieved = await getBenchmarkRun('run_alpha');
    expect(retrieved?.identity.runId).toBe('run_alpha');

    const all = await listBenchmarkRuns();
    expect(all.length).toBe(2);
    // Ordered descending by createdAt: run_beta first
    expect(all[0].identity.runId).toBe('run_beta');
    expect(all[1].identity.runId).toBe('run_alpha');

    await deleteBenchmarkRun('run_alpha');
    const remaining = await listBenchmarkRuns();
    expect(remaining.length).toBe(1);
    expect(remaining[0].identity.runId).toBe('run_beta');
  });

  it('10. creates benchmark run from live TrackingSessionStatus', () => {
    const liveStatus = {
      sessionId: 'sess_live_123',
      status: 'COMPLETED',
      progressPct: 100,
      currentFrame: 300,
      totalFrames: 300,
      analyzedFrames: 150,
      lastTelemetryTimestampSec: 10.0,
      elapsedSec: 5.0,
      analysisFps: 30.0,
      sourceFps: 30,
      samplingFps: 10,
      device: 'cuda',
      effectiveDevice: 'cuda',
      trackedPlayerCount: 2,
      performance: {
        elapsedSec: 5.0,
        videoDurationSec: 10.0,
        rtf: 0.5,
        realtimeSpeed: 2.0,
        analysisFps: 30.0,
        samplingFps: 10.0,
      },
      quality: {
        observedCoveragePct: 94.0,
        simultaneousCoveragePct: 90.0,
        lostFramesPct: 6.0,
        poseCoveragePct: 92.0,
        playerCoverage: {
          P1: {
            playerId: 'P1',
            expectedFrames: 150,
            observedFrames: 144,
            predictedFrames: 4,
            lostFrames: 2,
            observedCoveragePct: 96.0,
            predictedFramesPct: 2.7,
            lostFramesPct: 1.3,
            lostTimeSec: 0.13,
          },
        },
      },
      runtimeProvenance: {
        detectorModel: 'yolov8n',
        trackerModel: 'bytetrack',
        poseModel: 'yolov8n-pose',
        device: 'cuda',
        requestedDevice: 'cuda',
        effectiveDevice: 'cuda',
        requestedProfile: 'balanced',
        effectiveProfile: 'balanced',
        detectorInputSize: 512,
        frameStride: 2,
        poseStride: 1,
        useCourtRoi: false,
        courtRoiMarginPx: 60,
      },
      players: [],
      error: null,
    } as unknown as TrackingSessionStatus;

    const benchmark = createBenchmarkRunFromSessionStatus(liveStatus);
    expect(benchmark.identity.runId).toBe('benchmark_sess_live_123');
    expect(benchmark.modelConfig.detectorName).toBe('yolov8n');
    expect(benchmark.modelConfig.detectorInputSize).toBe(512);
    expect(benchmark.performance.processingRatio).toBe(0.5);
    expect(benchmark.quality.meanTargetCoverage).toBe(0.94);
    expect(benchmark.quality.playerCoverage['P1'].observedCoverage).toBe(0.96);
    expect(benchmark.groundTruth).toBeUndefined();
  });
});
