import type {
  ProcessingConfig,
  TrackingRuntimeProvenance,
  TrackingSessionStatus,
  TrackingBenchmarkRun,
  TrackingBenchmarkRunIdentity,
  TrackingBenchmarkModelConfig,
  TrackingBenchmarkVideoMetadata,
  TrackingBenchmarkPerformance,
  TrackingBenchmarkPlayerQuality,
  TrackingBenchmarkQuality,
  TrackingBenchmarkIdentityAudit,
  TrackingBenchmarkGroundTruth,
  VisionBenchmarkExperimentConfig,
} from '../types';
import type { TrackingAnalysis } from '../services/storage/trackingStorage';
import { get, set, del } from 'idb-keyval';

export interface BenchmarkComparableTarget {
  sessionId?: string;
  id?: string;
  device?: string;
  effectiveDevice?: string;
  trackedPlayerCount?: number;
  processingConfig?: ProcessingConfig;
  runtimeProvenance?: TrackingRuntimeProvenance;
  analysisFps?: number | null;
  elapsedSec?: number | null;
  rtf?: number | null;
  realtimeSpeed?: number | null;
  detectorModel?: string | null;
  trackerModel?: string | null;
  poseModel?: string | null;
}

/**
 * Validates whether two tracking runs share identical key configuration settings.
 * Only runs with identical algorithmic workload (input resolution, strides, ROI cropping, player count)
 * are valid for claiming hardware speedup.
 */
export function areBenchmarkConfigsMatching(
  a: BenchmarkComparableTarget,
  b: BenchmarkComparableTarget
): boolean {
  const cfgA = a.processingConfig;
  const cfgB = b.processingConfig;
  const provA = a.runtimeProvenance;
  const provB = b.runtimeProvenance;

  // 1. Detector input resolution
  const inputSizeA = cfgA?.detectorInputSize ?? provA?.detectorInputSize;
  const inputSizeB = cfgB?.detectorInputSize ?? provB?.detectorInputSize;

  // 2. Detection Frame Stride
  const frameStrideA = cfgA?.frameStride ?? provA?.frameStride;
  const frameStrideB = cfgB?.frameStride ?? provB?.frameStride;

  // 3. Pose Stride
  const poseStrideA = cfgA?.poseStride ?? provA?.poseStride;
  const poseStrideB = cfgB?.poseStride ?? provB?.poseStride;

  // 4. Court ROI Cropping
  const roiA = cfgA?.useCourtRoi ?? provA?.useCourtRoi;
  const roiB = cfgB?.useCourtRoi ?? provB?.useCourtRoi;

  // 5. Tracked Player Count
  const countA = a.trackedPlayerCount;
  const countB = b.trackedPlayerCount;

  const detectorA = a.detectorModel ?? provA?.detectorModel;
  const detectorB = b.detectorModel ?? provB?.detectorModel;
  const trackerA = a.trackerModel ?? provA?.trackerModel;
  const trackerB = b.trackerModel ?? provB?.trackerModel;
  const poseA = a.poseModel ?? provA?.poseModel;
  const poseB = b.poseModel ?? provB?.poseModel;

  const pairs: Array<[unknown, unknown]> = [
    [inputSizeA, inputSizeB],
    [frameStrideA, frameStrideB],
    [poseStrideA, poseStrideB],
    [roiA, roiB],
    [countA, countB],
    [detectorA, detectorB],
    [trackerA, trackerB],
    [poseA, poseB],
  ];
  if (pairs.some(([left, right]) => left === undefined || left === null || right === undefined || right === null)) {
    return false;
  }
  if (pairs.some(([left, right]) => left !== right)) return false;

  return true;
}

export interface BenchmarkComparisonResult {
  configsMatch: boolean;
  speedupMultiplier: number | null;
  speedupPercent: number | null;
  statusLabel: string;
}

/**
 * Computes comparative benchmark performance against a baseline run.
 * If key configs differ, strictly forbids claiming hardware speedup.
 */
export function compareBenchmarkRuns(
  candidate: { analysisFps?: number | null; elapsedSec?: number | null },
  baseline: { analysisFps?: number | null; elapsedSec?: number | null },
  configsMatch: boolean,
  language: 'en' | 'th' = 'en'
): BenchmarkComparisonResult {
  const th = language === 'th';
  if (!configsMatch) {
    return {
      configsMatch: false,
      speedupMultiplier: null,
      speedupPercent: null,
      statusLabel: th ? 'การตั้งค่าต่างกัน' : 'Configuration differs',
    };
  }

  const cFps = candidate.analysisFps;
  const bFps = baseline.analysisFps;

  if (typeof cFps === 'number' && Number.isFinite(cFps) && cFps > 0
    && typeof bFps === 'number' && Number.isFinite(bFps) && bFps > 0) {
    const multiplier = Number((cFps / bFps).toFixed(2));
    const percent = Number((((cFps - bFps) / bFps) * 100).toFixed(1));
    const label =
      multiplier >= 1.0
        ? `${multiplier.toFixed(2)}x ${th ? 'เร็วกว่า' : 'faster'}`
        : `${multiplier.toFixed(2)}x ${th ? 'ช้ากว่า' : 'slower'}`;

    return {
      configsMatch: true,
      speedupMultiplier: multiplier,
      speedupPercent: percent,
      statusLabel: label,
    };
  }

  // Fallback to elapsed time comparison if FPS is zero
  const cTime = candidate.elapsedSec;
  const bTime = baseline.elapsedSec;
  if (typeof cTime === 'number' && Number.isFinite(cTime) && cTime > 0
    && typeof bTime === 'number' && Number.isFinite(bTime) && bTime > 0) {
    const multiplier = Number((bTime / cTime).toFixed(2));
    const percent = Number((((bTime - cTime) / bTime) * 100).toFixed(1));
    const label =
      multiplier >= 1.0
        ? `${multiplier.toFixed(2)}x ${th ? 'เร็วกว่า' : 'faster'}`
        : `${multiplier.toFixed(2)}x ${th ? 'ช้ากว่า' : 'slower'}`;

    return {
      configsMatch: true,
      speedupMultiplier: multiplier,
      speedupPercent: percent,
      statusLabel: label,
    };
  }

  return {
    configsMatch: true,
    speedupMultiplier: null,
    speedupPercent: null,
    statusLabel: th ? 'ไม่มีข้อมูลประสิทธิภาพ' : 'Performance unavailable',
  };
}

/**
 * Normalizes a TrackingAnalysis record into a comparable benchmark object.
 */
export function normalizeAnalysisToBenchmark(analysis: TrackingAnalysis): BenchmarkComparableTarget {
  return {
    id: analysis.id,
    device: analysis.device,
    effectiveDevice: analysis.effectiveDevice || analysis.device,
    trackedPlayerCount: analysis.trackedPlayerCount,
    processingConfig: analysis.processingConfig,
    runtimeProvenance: analysis.runtimeProvenance,
    analysisFps: analysis.performance?.analysisFps,
    elapsedSec: analysis.performance?.elapsedSec,
    rtf: analysis.performance?.rtf,
    realtimeSpeed: analysis.performance?.realtimeSpeed,
    detectorModel: analysis.detectorModel,
    trackerModel: analysis.trackerModel,
    poseModel: analysis.poseModel,
  };
}

/**
 * Normalizes a TrackingSessionStatus into a comparable benchmark object.
 */
export function normalizeStatusToBenchmark(status: TrackingSessionStatus): BenchmarkComparableTarget {
  return {
    sessionId: status.sessionId,
    device: status.device,
    effectiveDevice: status.effectiveDevice || status.device,
    trackedPlayerCount: status.trackedPlayerCount,
    processingConfig: status.processingConfig,
    runtimeProvenance: status.runtimeProvenance,
    analysisFps: status.analysisFps || status.performance?.analysisFps,
    elapsedSec: status.elapsedSec || status.performance?.elapsedSec,
    rtf: status.performance?.rtf,
    realtimeSpeed: status.performance?.realtimeSpeed,
    detectorModel: status.runtimeProvenance?.detectorModel,
    trackerModel: status.runtimeProvenance?.trackerModel,
    poseModel: status.runtimeProvenance?.poseModel,
  };
}

// ============================================================================
// Phase 0.6A — Tracking Benchmark Foundation Implementation
// ============================================================================

/**
 * Calculates the processing ratio for tracking runs:
 * processingRatio = elapsedSeconds / durationSeconds
 *
 * Example:
 * - 60-minute video (3600 seconds) processed in 30 real minutes (1800 seconds)
 *   processingRatio = 1800 / 3600 = 0.5 (< 1.0 indicates faster than real-time).
 *
 * Returns null if durationSeconds <= 0, or if either value is invalid/unavailable.
 * Does not fabricate unavailable values.
 */
export function calculateProcessingRatio(
  elapsedSeconds: number | null | undefined,
  durationSeconds: number | null | undefined
): number | null {
  if (
    elapsedSeconds === null ||
    elapsedSeconds === undefined ||
    durationSeconds === null ||
    durationSeconds === undefined ||
    !Number.isFinite(elapsedSeconds) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    elapsedSeconds < 0
  ) {
    return null;
  }
  return Number((elapsedSeconds / durationSeconds).toFixed(6));
}

export interface CreateBenchmarkRunOptions {
  runId?: string;
  createdAt?: string;
  sport?: string;
  videoFingerprint?: string | null;
  videoReference?: string | null;
  trackingMode?: string;
  processingProfile?: string;
  detectorName?: string;
  detectorVersion?: string | null;
  poseModel?: string;
  trackerName?: string;
  trackerVersion?: string | null;
  detectorInputSize?: number;
  confidenceThreshold?: number;
  frameStride?: number;
  poseStride?: number;
  maxPlayers?: number;
  device?: string;
  runtime?: string | null;
  precision?: string | null;
  courtRoiEnabled?: boolean | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  sourceFps?: number | null;
  durationSeconds?: number | null;
  totalSourceFrames?: number | null;
  framesAnalyzed?: number | null;
  analysisFps?: number | null;
  elapsedSeconds?: number | null;
  effectiveTelemetryHz?: number | null;
  meanTargetCoverage?: number | null;
  simultaneousTargetCoverage?: number | null;
  playerCoverage?: Record<string, TrackingBenchmarkPlayerQuality>;
  identityAudit?: TrackingBenchmarkIdentityAudit | null;
  groundTruth?: TrackingBenchmarkGroundTruth | null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveOrNull(value: number | null | undefined): number | null {
  const finite = finiteOrNull(value);
  return finite !== null && finite > 0 ? finite : null;
}

function nonNegativeOrNull(value: number | null | undefined): number | null {
  const finite = finiteOrNull(value);
  return finite !== null && finite >= 0 ? finite : null;
}

/**
 * Constructs a validated TrackingBenchmarkRun data structure.
 * Preserves unavailable fields as undefined/null without fabricating fake zeros.
 */
export function createBenchmarkRun(params: {
  identity: TrackingBenchmarkRunIdentity;
  modelConfig: TrackingBenchmarkModelConfig;
  videoMetadata: TrackingBenchmarkVideoMetadata;
  performance: TrackingBenchmarkPerformance;
  quality: TrackingBenchmarkQuality;
  identityAudit?: TrackingBenchmarkIdentityAudit | null;
  groundTruth?: TrackingBenchmarkGroundTruth | null;
}): TrackingBenchmarkRun {
  const processingRatio =
    params.performance.processingRatio !== undefined
      ? nonNegativeOrNull(params.performance.processingRatio)
      : calculateProcessingRatio(
          params.performance.elapsedSeconds,
          params.videoMetadata.durationSeconds
        );

  const run: TrackingBenchmarkRun = {
    identity: {
      runId: params.identity.runId,
      createdAt: params.identity.createdAt,
      sport: params.identity.sport,
      videoFingerprint: params.identity.videoFingerprint ?? null,
      videoReference: params.identity.videoReference ?? null,
      trackingMode: params.identity.trackingMode,
      processingProfile: params.identity.processingProfile,
    },
    modelConfig: {
      detectorName: params.modelConfig.detectorName,
      detectorVersion: params.modelConfig.detectorVersion ?? null,
      poseModel: params.modelConfig.poseModel,
      trackerName: params.modelConfig.trackerName,
      trackerVersion: params.modelConfig.trackerVersion ?? null,
      detectorInputSize: positiveOrNull(params.modelConfig.detectorInputSize),
      confidenceThreshold: nonNegativeOrNull(params.modelConfig.confidenceThreshold),
      frameStride: positiveOrNull(params.modelConfig.frameStride),
      poseStride: positiveOrNull(params.modelConfig.poseStride),
      maxPlayers: positiveOrNull(params.modelConfig.maxPlayers),
      device: params.modelConfig.device,
      runtime: params.modelConfig.runtime ?? null,
      precision: params.modelConfig.precision ?? null,
      courtRoiEnabled:
        params.modelConfig.courtRoiEnabled !== undefined ? params.modelConfig.courtRoiEnabled : null,
    },
    videoMetadata: {
      sourceWidth: positiveOrNull(params.videoMetadata.sourceWidth),
      sourceHeight: positiveOrNull(params.videoMetadata.sourceHeight),
      sourceFps: positiveOrNull(params.videoMetadata.sourceFps),
      durationSeconds: positiveOrNull(params.videoMetadata.durationSeconds),
      totalSourceFrames: params.videoMetadata.totalSourceFrames ?? null,
    },
    performance: {
      framesAnalyzed: nonNegativeOrNull(params.performance.framesAnalyzed),
      analysisFps: nonNegativeOrNull(params.performance.analysisFps),
      elapsedSeconds: nonNegativeOrNull(params.performance.elapsedSeconds),
      effectiveTelemetryHz: positiveOrNull(params.performance.effectiveTelemetryHz),
      processingRatio,
    },
    quality: {
      meanTargetCoverage: nonNegativeOrNull(params.quality.meanTargetCoverage),
      simultaneousTargetCoverage: nonNegativeOrNull(params.quality.simultaneousTargetCoverage),
      playerCoverage: { ...params.quality.playerCoverage },
    },
  };

  if (params.identityAudit !== undefined) {
    run.identityAudit = params.identityAudit;
  }

  if (params.groundTruth !== undefined) {
    run.groundTruth = params.groundTruth;
  }

  return run;
}

/**
 * Adapter: Converts a current or older ByteTrack TrackingAnalysis record into
 * the standardized TrackingBenchmarkRun contract.
 * ByteTrack is treated as a baseline configuration, not a hardcoded requirement.
 * Ground-truth and unmeasured identity fields remain undefined (no fake zeros).
 */
export function createBenchmarkRunFromAnalysis(
  analysis: TrackingAnalysis,
  overrides?: Partial<CreateBenchmarkRunOptions>
): TrackingBenchmarkRun {
  const durationSec =
    overrides?.durationSeconds ??
    analysis.summary?.durationSeconds ??
    analysis.videoMetadata?.durationSec ??
    analysis.performance?.videoDurationSec ??
    null;

  const elapsedSec =
    overrides?.elapsedSeconds ??
    analysis.performance?.elapsedSec ??
    null;

  const framesAnalyzed =
    overrides?.framesAnalyzed ??
    analysis.analyzedFrames ??
    null;

  const analysisFps =
    overrides?.analysisFps ??
    analysis.performance?.analysisFps ??
    null;

  const effectiveTelemetryHz =
    overrides?.effectiveTelemetryHz ??
    analysis.effectiveStoredHz ??
    null;

  // Extract per-player quality breakdown
  const playerCoverage: Record<string, TrackingBenchmarkPlayerQuality> = {};
  if (analysis.quality?.playerCoverage) {
    for (const [pId, pq] of Object.entries(analysis.quality.playerCoverage)) {
      playerCoverage[pId] = {
        playerId: pId,
        observedCoverage: pq.detectionCoverage ?? null,
        predictedPercent: pq.predictedPercent ?? null,
        lostPercent: pq.lostPercent ?? null,
        meanObservedConfidence: pq.meanObservedConfidence ?? null,
      };
    }
  }

  const meanTargetCoverage =
    overrides?.meanTargetCoverage ??
    analysis.quality?.meanTargetCoverage ??
    analysis.quality?.detectionCoverage ??
    null;

  const simultaneousTargetCoverage =
    overrides?.simultaneousTargetCoverage ??
    analysis.quality?.simultaneousTargetCoverage ??
    null;

  // Optional Identity Audit: populate only if values were actually observed
  let identityAudit: TrackingBenchmarkIdentityAudit | undefined = undefined;
  if (
    overrides?.identityAudit !== undefined
  ) {
    identityAudit = overrides.identityAudit ?? undefined;
  } else if (
    (analysis.quality?.idSwitchCount !== undefined && analysis.quality.idSwitchCount !== null) ||
    (analysis.quality?.manualCorrectionCount !== undefined && analysis.quality.manualCorrectionCount !== null)
  ) {
    identityAudit = {
      idSwitchCount: analysis.quality?.idSwitchCount ?? null,
      manualCorrectionCount: analysis.quality?.manualCorrectionCount ?? null,
      identityContinuity: null,
    };
  }

  return createBenchmarkRun({
    identity: {
      runId: overrides?.runId ?? `benchmark_${analysis.id || Date.now()}`,
      createdAt: overrides?.createdAt ?? analysis.createdAt ?? new Date().toISOString(),
      sport: overrides?.sport ?? analysis.sportType ?? 'badminton',
      videoFingerprint: overrides?.videoFingerprint ?? analysis.videoFingerprint ?? null,
      videoReference: overrides?.videoReference ?? analysis.localFileName ?? null,
      trackingMode: overrides?.trackingMode ?? analysis.gameType ?? 'singles',
      processingProfile:
        overrides?.processingProfile ??
        analysis.runtimeProvenance?.effectiveProfile ??
        analysis.processingConfig?.profile ??
        null,
    },
    modelConfig: {
      detectorName:
        overrides?.detectorName ??
        analysis.detectorModel ??
        analysis.runtimeProvenance?.detectorModel ??
        null,
      detectorVersion: overrides?.detectorVersion ?? null,
      poseModel:
        overrides?.poseModel ??
        analysis.poseModel ??
        analysis.runtimeProvenance?.poseModel ??
        null,
      trackerName:
        overrides?.trackerName ??
        analysis.trackerModel ??
        analysis.runtimeProvenance?.trackerModel ??
        null,
      trackerVersion: overrides?.trackerVersion ?? null,
      detectorInputSize:
        overrides?.detectorInputSize ??
        analysis.runtimeProvenance?.detectorInputSize ??
        analysis.processingConfig?.detectorInputSize ??
        null,
      confidenceThreshold: overrides?.confidenceThreshold ?? null,
      frameStride:
        overrides?.frameStride ??
        analysis.runtimeProvenance?.frameStride ??
        analysis.processingConfig?.frameStride ??
        null,
      poseStride:
        overrides?.poseStride ??
        analysis.runtimeProvenance?.poseStride ??
        analysis.processingConfig?.poseStride ??
        null,
      maxPlayers:
        overrides?.maxPlayers ??
        analysis.trackedPlayerCount ??
        null,
      device:
        overrides?.device ??
        analysis.effectiveDevice ??
        analysis.device ??
        null,
      runtime:
        overrides?.runtime ??
        analysis.runtimeProvenance?.runtime ??
        analysis.processingConfig?.runtime ??
        null,
      precision:
        overrides?.precision ??
        analysis.runtimeProvenance?.precision ??
        analysis.processingConfig?.precision ??
        null,
      courtRoiEnabled:
        overrides?.courtRoiEnabled ??
        analysis.runtimeProvenance?.useCourtRoi ??
        analysis.processingConfig?.useCourtRoi ??
        null,
    },
    videoMetadata: {
      sourceWidth: overrides?.sourceWidth ?? analysis.videoMetadata?.width ?? null,
      sourceHeight: overrides?.sourceHeight ?? analysis.videoMetadata?.height ?? null,
      sourceFps: overrides?.sourceFps ?? analysis.videoMetadata?.nominalFps ?? null,
      durationSeconds: durationSec,
      totalSourceFrames: overrides?.totalSourceFrames ?? analysis.videoMetadata?.reportedFrameCount ?? null,
    },
    performance: {
      framesAnalyzed,
      analysisFps,
      elapsedSeconds: elapsedSec,
      effectiveTelemetryHz,
      processingRatio: calculateProcessingRatio(elapsedSec, durationSec),
    },
    quality: {
      meanTargetCoverage,
      simultaneousTargetCoverage,
      playerCoverage: overrides?.playerCoverage ?? playerCoverage,
    },
    identityAudit,
    groundTruth: overrides?.groundTruth ?? undefined,
  });
}

/**
 * Adapter: Converts a TrackingSessionStatus object into a TrackingBenchmarkRun.
 */
export function createBenchmarkRunFromSessionStatus(
  status: TrackingSessionStatus,
  overrides?: Partial<CreateBenchmarkRunOptions>
): TrackingBenchmarkRun {
  const durationSec =
    overrides?.durationSeconds ??
    status.performance?.videoDurationSec ??
    status.videoMetadata?.durationSec ??
    null;

  const elapsedSec =
    overrides?.elapsedSeconds ??
    status.elapsedSec ??
    status.performance?.elapsedSec ??
    null;

  const framesAnalyzed =
    overrides?.framesAnalyzed ??
    status.analyzedFrames ??
    null;

  const analysisFps =
    overrides?.analysisFps ??
    status.analysisFps ??
    status.performance?.analysisFps ??
    null;

  const effectiveTelemetryHz = overrides?.effectiveTelemetryHz ?? null;

  const playerCoverage: Record<string, TrackingBenchmarkPlayerQuality> = {};
  if (status.quality?.playerCoverage) {
    for (const [pId, cov] of Object.entries(status.quality.playerCoverage)) {
      playerCoverage[pId] = {
        playerId: pId,
        observedCoverage: cov.observedCoveragePct !== null && cov.observedCoveragePct !== undefined
          ? cov.observedCoveragePct / 100
          : null,
        predictedPercent: cov.predictedFramesPct ?? null,
        lostPercent: cov.lostFramesPct ?? null,
        meanObservedConfidence: null,
      };
    }
  }

  const meanTargetCoverage = overrides?.meanTargetCoverage
    ?? (status.quality?.meanTargetCoveragePct !== undefined && status.quality.meanTargetCoveragePct !== null
      ? status.quality.meanTargetCoveragePct / 100
      : status.quality?.observedCoveragePct !== undefined && status.quality.observedCoveragePct !== null
      ? status.quality.observedCoveragePct / 100
      : null);

  const simultaneousTargetCoverage =
    overrides?.simultaneousTargetCoverage ??
    (status.quality?.simultaneousCoveragePct !== undefined && status.quality.simultaneousCoveragePct !== null
      ? status.quality.simultaneousCoveragePct / 100
      : null);

  return createBenchmarkRun({
    identity: {
      runId: overrides?.runId ?? `benchmark_${status.sessionId || Date.now()}`,
      createdAt: overrides?.createdAt ?? new Date().toISOString(),
      sport: overrides?.sport ?? 'badminton',
      videoFingerprint: overrides?.videoFingerprint ?? null,
      videoReference: overrides?.videoReference ?? status.videoMetadata?.filename ?? null,
      trackingMode: overrides?.trackingMode
        ?? (status.trackedPlayerCount === 4
          ? 'doubles'
          : status.trackedPlayerCount === 1 || status.trackedPlayerCount === 2
          ? 'singles'
          : null),
      processingProfile:
        overrides?.processingProfile ??
        status.runtimeProvenance?.effectiveProfile ??
        status.processingConfig?.profile ??
        null,
    },
    modelConfig: {
      detectorName:
        overrides?.detectorName ??
        status.runtimeProvenance?.detectorModel ??
        null,
      detectorVersion: overrides?.detectorVersion ?? null,
      poseModel:
        overrides?.poseModel ??
        status.runtimeProvenance?.poseModel ??
        null,
      trackerName:
        overrides?.trackerName ??
        status.runtimeProvenance?.trackerModel ??
        null,
      trackerVersion: overrides?.trackerVersion ?? null,
      detectorInputSize:
        overrides?.detectorInputSize ??
        status.runtimeProvenance?.detectorInputSize ??
        status.processingConfig?.detectorInputSize ??
        null,
      confidenceThreshold: overrides?.confidenceThreshold ?? null,
      frameStride:
        overrides?.frameStride ??
        status.runtimeProvenance?.frameStride ??
        status.processingConfig?.frameStride ??
        null,
      poseStride:
        overrides?.poseStride ??
        status.runtimeProvenance?.poseStride ??
        status.processingConfig?.poseStride ??
        null,
      maxPlayers: overrides?.maxPlayers ?? status.trackedPlayerCount ?? null,
      device:
        overrides?.device ??
        status.effectiveDevice ??
        status.device ??
        null,
      runtime:
        overrides?.runtime ??
        status.runtimeProvenance?.runtime ??
        status.processingConfig?.runtime ??
        null,
      precision:
        overrides?.precision ??
        status.runtimeProvenance?.precision ??
        status.processingConfig?.precision ??
        null,
      courtRoiEnabled:
        overrides?.courtRoiEnabled ??
        status.runtimeProvenance?.useCourtRoi ??
        status.processingConfig?.useCourtRoi ??
        null,
    },
    videoMetadata: {
      sourceWidth: overrides?.sourceWidth ?? status.videoMetadata?.width ?? null,
      sourceHeight: overrides?.sourceHeight ?? status.videoMetadata?.height ?? null,
      sourceFps: overrides?.sourceFps ?? status.videoMetadata?.nominalFps ?? status.sourceFps ?? null,
      durationSeconds: durationSec,
      totalSourceFrames: overrides?.totalSourceFrames ?? status.totalFrames ?? null,
    },
    performance: {
      framesAnalyzed,
      analysisFps,
      elapsedSeconds: elapsedSec,
      effectiveTelemetryHz,
      processingRatio: calculateProcessingRatio(elapsedSec, durationSec),
    },
    quality: {
      meanTargetCoverage,
      simultaneousTargetCoverage,
      playerCoverage: overrides?.playerCoverage ?? playerCoverage,
    },
    identityAudit: overrides?.identityAudit ?? undefined,
    groundTruth: overrides?.groundTruth ?? undefined,
  });
}

/**
 * Serializes a TrackingBenchmarkRun into a JSON string.
 */
export function serializeBenchmarkRun(run: TrackingBenchmarkRun): string {
  return JSON.stringify(run, null, 2);
}

/**
 * Deserializes a JSON string into a validated TrackingBenchmarkRun.
 */
export function deserializeBenchmarkRun(jsonStr: string): TrackingBenchmarkRun {
  const parsed = JSON.parse(jsonStr) as TrackingBenchmarkRun;
  if (!parsed || !parsed.identity || !parsed.modelConfig || !parsed.performance || !parsed.quality) {
    throw new Error('Invalid TrackingBenchmarkRun JSON payload');
  }
  return parsed;
}

// -------------------------------------------------------------
// Persistence Helpers (idb-keyval with Memory Fallback)
// -------------------------------------------------------------

const BENCHMARK_STORE_PREFIX = 'scout_tracking_benchmark_';
const BENCHMARK_INDEX_KEY = 'scout_tracking_benchmark_index';
const inMemoryBenchmarkStore = new Map<string, TrackingBenchmarkRun>();

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * Saves a benchmark run to storage.
 */
export async function saveBenchmarkRun(run: TrackingBenchmarkRun): Promise<void> {
  const id = run.identity.runId;
  inMemoryBenchmarkStore.set(id, run);

  if (isIndexedDbAvailable()) {
    try {
      const key = `${BENCHMARK_STORE_PREFIX}${id}`;
      await set(key, run);
      const index = (await get<string[]>(BENCHMARK_INDEX_KEY)) || [];
      if (!index.includes(id)) {
        index.push(id);
        await set(BENCHMARK_INDEX_KEY, index);
      }
    } catch {
      // In-memory fallback
    }
  }
}

/**
 * Retrieves a benchmark run by its runId.
 */
export async function getBenchmarkRun(runId: string): Promise<TrackingBenchmarkRun | null> {
  if (inMemoryBenchmarkStore.has(runId)) {
    return inMemoryBenchmarkStore.get(runId)!;
  }

  if (isIndexedDbAvailable()) {
    try {
      const key = `${BENCHMARK_STORE_PREFIX}${runId}`;
      const record = await get<TrackingBenchmarkRun>(key);
      if (record) {
        inMemoryBenchmarkStore.set(runId, record);
        return record;
      }
    } catch {
      // Fallback
    }
  }

  return null;
}

/**
 * Lists all persisted benchmark runs.
 */
export async function listBenchmarkRuns(): Promise<TrackingBenchmarkRun[]> {
  const result = new Map<string, TrackingBenchmarkRun>();

  for (const [id, run] of inMemoryBenchmarkStore.entries()) {
    result.set(id, run);
  }

  if (isIndexedDbAvailable()) {
    try {
      const index = (await get<string[]>(BENCHMARK_INDEX_KEY)) || [];
      for (const id of index) {
        if (!result.has(id)) {
          const run = await get<TrackingBenchmarkRun>(`${BENCHMARK_STORE_PREFIX}${id}`);
          if (run) result.set(id, run);
        }
      }
    } catch {
      // Fallback
    }
  }

  return Array.from(result.values()).sort(
    (a, b) => new Date(b.identity.createdAt).getTime() - new Date(a.identity.createdAt).getTime()
  );
}

/**
 * Deletes a benchmark run from storage.
 */
export async function deleteBenchmarkRun(runId: string): Promise<void> {
  inMemoryBenchmarkStore.delete(runId);

  if (isIndexedDbAvailable()) {
    try {
      const key = `${BENCHMARK_STORE_PREFIX}${runId}`;
      await del(key);
      const index = (await get<string[]>(BENCHMARK_INDEX_KEY)) || [];
      const updated = index.filter((id) => id !== runId);
      await set(BENCHMARK_INDEX_KEY, updated);
    } catch {
      // Fallback
    }
  }
}

/**
 * Clears in-memory benchmark store (used for test isolation).
 */
export function clearInMemoryBenchmarkStore(): void {
  inMemoryBenchmarkStore.clear();
}

// ============================================================================
// Phase 1.0 — Vision Benchmark Protocol Helpers
// ============================================================================

export interface GenerateBenchmarkRunIdParams {
  /** Target clip logical ID (e.g. 'B01_singles_easy') */
  clipId: string;
  /** Experiment identifier if using a registered experiment profile */
  experimentId?: string;
  /** Detection model name (e.g. 'yolov8n', 'yolo11n', 'yolo26') */
  detector?: string | null;
  /** Tracker name (e.g. 'bytetrack', 'norfair', 'ocsort') */
  tracker?: string | null;
  /** Square input dimension (e.g. 640) */
  inputSize?: number | null;
  /** Execution device (e.g. 'cpu', 'cuda') */
  device?: string | null;
  /** Execution runtime environment (e.g. 'pytorch', 'tensorrt', 'onnxruntime') */
  runtime?: string | null;
  /** Precision ('fp32', 'fp16', 'int8') */
  precision?: string | null;
  /** Optional ISO or UTC timestamp string; defaults to current UTC formatted timestamp */
  timestamp?: string;
}

/**
 * Sanitizes an arbitrary string into a safe identifier slug.
 */
function sanitizeIdentifier(val: string): string {
  return val.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

/**
 * Generates a deterministic, structured benchmark run identifier.
 * Ensures every result is uniquely and unambiguously traceable to:
 * video ID + experiment configuration + model configuration + runtime/device.
 *
 * Forbids unstructured names like 'test1', 'test2', 'best', 'final2'.
 */
export function generateBenchmarkRunId(params: GenerateBenchmarkRunIdParams): string {
  const clip = sanitizeIdentifier(params.clipId || 'unknown_clip');

  let configSlug: string;
  if (params.experimentId && params.experimentId.trim().length > 0) {
    configSlug = sanitizeIdentifier(params.experimentId.trim());
  } else {
    const parts: string[] = [
      params.detector ? sanitizeIdentifier(params.detector) : 'det',
      params.tracker ? sanitizeIdentifier(params.tracker) : 'trk',
      params.inputSize ? `${params.inputSize}px` : 'defsize',
      params.device ? sanitizeIdentifier(params.device) : 'cpu',
    ];
    if (params.runtime) parts.push(sanitizeIdentifier(params.runtime));
    if (params.precision) parts.push(sanitizeIdentifier(params.precision));
    configSlug = parts.join('_');
  }

  const rawTime = params.timestamp ? new Date(params.timestamp) : new Date();
  const timeStr = Number.isNaN(rawTime.getTime())
    ? new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')
    : rawTime.toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');

  return `RUN__${clip}__${configSlug}__${timeStr}`;
}

/**
 * Validates a VisionBenchmarkExperimentConfig.
 * Ensures model neutrality: any model, tracker, or runtime is accepted as long as types are sound.
 */
export function validateExperimentConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Experiment config must be an object'] };
  }
  const c = config as Record<string, unknown>;

  if (typeof c.experimentId !== 'string' || c.experimentId.trim().length === 0) {
    errors.push('experimentId must be a non-empty string');
  }
  if (typeof c.name !== 'string' || c.name.trim().length === 0) {
    errors.push('name must be a non-empty string');
  }
  if (typeof c.detector !== 'string' || c.detector.trim().length === 0) {
    errors.push('detector must be a non-empty string');
  }
  if (typeof c.tracker !== 'string' || c.tracker.trim().length === 0) {
    errors.push('tracker must be a non-empty string');
  }
  if (typeof c.runtime !== 'string' || c.runtime.trim().length === 0) {
    errors.push('runtime must be a non-empty string');
  }
  if (typeof c.device !== 'string' || c.device.trim().length === 0) {
    errors.push('device must be a non-empty string');
  }
  if (typeof c.precision !== 'string' || c.precision.trim().length === 0) {
    errors.push('precision must be a non-empty string');
  }

  if (typeof c.inputSize !== 'number' || !Number.isInteger(c.inputSize) || c.inputSize <= 0) {
    errors.push('inputSize must be a positive integer');
  }
  if (
    typeof c.confidenceThreshold !== 'number' ||
    !Number.isFinite(c.confidenceThreshold) ||
    c.confidenceThreshold < 0 ||
    c.confidenceThreshold > 1
  ) {
    errors.push('confidenceThreshold must be a finite number between 0.0 and 1.0');
  }
  if (typeof c.frameStride !== 'number' || !Number.isInteger(c.frameStride) || c.frameStride <= 0) {
    errors.push('frameStride must be a positive integer');
  }
  if (typeof c.poseStride !== 'number' || !Number.isInteger(c.poseStride) || c.poseStride <= 0) {
    errors.push('poseStride must be a positive integer');
  }
  if (typeof c.courtRoiEnabled !== 'boolean') {
    errors.push('courtRoiEnabled must be a boolean');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Constructs a VisionBenchmarkExperimentConfig with sensible defaults, preserving model neutrality.
 */
export function createExperimentConfig(
  params: Partial<VisionBenchmarkExperimentConfig> & {
    experimentId: string;
    detector: string;
    tracker: string;
  }
): VisionBenchmarkExperimentConfig {
  return {
    experimentId: params.experimentId,
    name: params.name ?? params.experimentId,
    detector: params.detector,
    detectorVersion: params.detectorVersion ?? null,
    poseModel: params.poseModel !== undefined ? params.poseModel : 'yolov8n-pose',
    tracker: params.tracker,
    trackerVersion: params.trackerVersion ?? null,
    runtime: params.runtime ?? 'pytorch',
    inputSize: params.inputSize && params.inputSize > 0 ? params.inputSize : 640,
    confidenceThreshold:
      typeof params.confidenceThreshold === 'number' && Number.isFinite(params.confidenceThreshold)
        ? params.confidenceThreshold
        : 0.25,
    frameStride: params.frameStride && params.frameStride > 0 ? params.frameStride : 2,
    poseStride: params.poseStride && params.poseStride > 0 ? params.poseStride : 1,
    courtRoiEnabled: params.courtRoiEnabled === true,
    device: params.device ?? 'cpu',
    precision: params.precision ?? 'fp32',
    processingProfile: params.processingProfile ?? null,
    notes: params.notes ?? null,
  };
}

/**
 * Converts a VisionBenchmarkExperimentConfig into a TrackingBenchmarkModelConfig
 * for seamless integration into TrackingBenchmarkRun.
 */
export function experimentConfigToModelConfig(
  exp: VisionBenchmarkExperimentConfig
): TrackingBenchmarkModelConfig {
  return {
    detectorName: exp.detector,
    detectorVersion: exp.detectorVersion ?? null,
    poseModel: exp.poseModel,
    trackerName: exp.tracker,
    trackerVersion: exp.trackerVersion ?? null,
    detectorInputSize: exp.inputSize,
    confidenceThreshold: exp.confidenceThreshold,
    frameStride: exp.frameStride,
    poseStride: exp.poseStride,
    maxPlayers: null, // Clip-dependent, not model-dependent
    device: exp.device,
    runtime: exp.runtime,
    precision: exp.precision,
    courtRoiEnabled: exp.courtRoiEnabled,
  };
}

/**
 * Converts a TrackingBenchmarkModelConfig into a VisionBenchmarkExperimentConfig.
 */
export function modelConfigToExperimentConfig(
  modelConfig: TrackingBenchmarkModelConfig,
  options?: { experimentId?: string; name?: string; notes?: string }
): VisionBenchmarkExperimentConfig {
  const detector = modelConfig.detectorName || 'unknown_detector';
  const tracker = modelConfig.trackerName || 'unknown_tracker';
  const experimentId =
    options?.experimentId ||
    `EXP_${detector.toUpperCase()}_${tracker.toUpperCase()}_${modelConfig.detectorInputSize || 640}_${(modelConfig.device || 'cpu').toUpperCase()}`;

  return {
    experimentId,
    name: options?.name || experimentId,
    detector,
    detectorVersion: modelConfig.detectorVersion ?? null,
    poseModel: modelConfig.poseModel ?? null,
    tracker,
    trackerVersion: modelConfig.trackerVersion ?? null,
    runtime: modelConfig.runtime || 'pytorch',
    inputSize: modelConfig.detectorInputSize || 640,
    confidenceThreshold:
      typeof modelConfig.confidenceThreshold === 'number' ? modelConfig.confidenceThreshold : 0.25,
    frameStride: modelConfig.frameStride || 2,
    poseStride: modelConfig.poseStride || 1,
    courtRoiEnabled: modelConfig.courtRoiEnabled === true,
    device: modelConfig.device || 'cpu',
    precision: modelConfig.precision || 'fp32',
    processingProfile: null,
    notes: options?.notes ?? null,
  };
}
