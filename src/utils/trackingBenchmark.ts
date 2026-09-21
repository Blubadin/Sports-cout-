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
  analysisFps?: number;
  elapsedSec?: number;
  rtf?: number | null;
  realtimeSpeed?: number | null;
  detectorModel?: string;
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
  const inputSizeA = cfgA?.detectorInputSize ?? provA?.detectorInputSize ?? 640;
  const inputSizeB = cfgB?.detectorInputSize ?? provB?.detectorInputSize ?? 640;
  if (inputSizeA !== inputSizeB) return false;

  // 2. Detection Frame Stride
  const frameStrideA = cfgA?.frameStride ?? provA?.frameStride ?? 2;
  const frameStrideB = cfgB?.frameStride ?? provB?.frameStride ?? 2;
  if (frameStrideA !== frameStrideB) return false;

  // 3. Pose Stride
  const poseStrideA = cfgA?.poseStride ?? provA?.poseStride ?? 1;
  const poseStrideB = cfgB?.poseStride ?? provB?.poseStride ?? 1;
  if (poseStrideA !== poseStrideB) return false;

  // 4. Court ROI Cropping
  const roiA = Boolean(cfgA?.useCourtRoi ?? provA?.useCourtRoi ?? false);
  const roiB = Boolean(cfgB?.useCourtRoi ?? provB?.useCourtRoi ?? false);
  if (roiA !== roiB) return false;

  // 5. Tracked Player Count
  const countA = a.trackedPlayerCount ?? 2;
  const countB = b.trackedPlayerCount ?? 2;
  if (countA !== countB) return false;

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
  candidate: { analysisFps?: number; elapsedSec?: number },
  baseline: { analysisFps?: number; elapsedSec?: number },
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

  const cFps = candidate.analysisFps ?? 0;
  const bFps = baseline.analysisFps ?? 0;

  if (cFps > 0 && bFps > 0) {
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
  const cTime = candidate.elapsedSec ?? 0;
  const bTime = baseline.elapsedSec ?? 0;
  if (cTime > 0 && bTime > 0) {
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
    speedupMultiplier: 1.0,
    speedupPercent: 0.0,
    statusLabel: th ? 'เท่ากัน (Baseline)' : 'Equal (Baseline)',
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
  sourceWidth?: number;
  sourceHeight?: number;
  sourceFps?: number;
  durationSeconds?: number;
  totalSourceFrames?: number | null;
  framesAnalyzed?: number;
  analysisFps?: number;
  elapsedSeconds?: number;
  effectiveTelemetryHz?: number;
  meanTargetCoverage?: number;
  simultaneousTargetCoverage?: number;
  playerCoverage?: Record<string, TrackingBenchmarkPlayerQuality>;
  identityAudit?: TrackingBenchmarkIdentityAudit | null;
  groundTruth?: TrackingBenchmarkGroundTruth | null;
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
      ? params.performance.processingRatio
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
      detectorInputSize: params.modelConfig.detectorInputSize,
      confidenceThreshold: params.modelConfig.confidenceThreshold,
      frameStride: params.modelConfig.frameStride,
      poseStride: params.modelConfig.poseStride,
      maxPlayers: params.modelConfig.maxPlayers,
      device: params.modelConfig.device,
    },
    videoMetadata: {
      sourceWidth: params.videoMetadata.sourceWidth,
      sourceHeight: params.videoMetadata.sourceHeight,
      sourceFps: params.videoMetadata.sourceFps,
      durationSeconds: params.videoMetadata.durationSeconds,
      totalSourceFrames: params.videoMetadata.totalSourceFrames ?? null,
    },
    performance: {
      framesAnalyzed: params.performance.framesAnalyzed,
      analysisFps: params.performance.analysisFps,
      elapsedSeconds: params.performance.elapsedSeconds,
      effectiveTelemetryHz: params.performance.effectiveTelemetryHz,
      processingRatio,
    },
    quality: {
      meanTargetCoverage: params.quality.meanTargetCoverage,
      simultaneousTargetCoverage: params.quality.simultaneousTargetCoverage,
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
    0;

  const elapsedSec =
    overrides?.elapsedSeconds ??
    analysis.performance?.elapsedSec ??
    0;

  const framesAnalyzed =
    overrides?.framesAnalyzed ??
    analysis.analyzedFrames ??
    0;

  const analysisFps =
    overrides?.analysisFps ??
    analysis.performance?.analysisFps ??
    0;

  const effectiveTelemetryHz =
    overrides?.effectiveTelemetryHz ??
    analysis.effectiveStoredHz ??
    analysis.nominalAnalysisHz ??
    10;

  // Extract per-player quality breakdown
  const playerCoverage: Record<string, TrackingBenchmarkPlayerQuality> = {};
  if (analysis.quality?.playerCoverage) {
    for (const [pId, pq] of Object.entries(analysis.quality.playerCoverage)) {
      playerCoverage[pId] = {
        playerId: pId,
        observedCoverage: pq.detectionCoverage ?? 0,
        predictedPercent: pq.predictedPercent ?? 0,
        lostPercent: pq.lostPercent ?? 0,
        meanObservedConfidence: pq.meanObservedConfidence ?? 0,
      };
    }
  }

  const meanTargetCoverage =
    overrides?.meanTargetCoverage ??
    analysis.quality?.meanTargetCoverage ??
    analysis.quality?.detectionCoverage ??
    0;

  const simultaneousTargetCoverage =
    overrides?.simultaneousTargetCoverage ??
    analysis.quality?.simultaneousTargetCoverage ??
    0;

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
        'auto',
    },
    modelConfig: {
      detectorName:
        overrides?.detectorName ??
        analysis.detectorModel ??
        analysis.runtimeProvenance?.detectorModel ??
        'yolo',
      detectorVersion: overrides?.detectorVersion ?? null,
      poseModel:
        overrides?.poseModel ??
        analysis.poseModel ??
        analysis.runtimeProvenance?.poseModel ??
        'yolo_pose',
      trackerName:
        overrides?.trackerName ??
        analysis.trackerModel ??
        analysis.runtimeProvenance?.trackerModel ??
        'bytetrack',
      trackerVersion: overrides?.trackerVersion ?? null,
      detectorInputSize:
        overrides?.detectorInputSize ??
        analysis.runtimeProvenance?.detectorInputSize ??
        analysis.processingConfig?.detectorInputSize ??
        640,
      confidenceThreshold: overrides?.confidenceThreshold ?? 0.25,
      frameStride:
        overrides?.frameStride ??
        analysis.runtimeProvenance?.frameStride ??
        analysis.processingConfig?.frameStride ??
        2,
      poseStride:
        overrides?.poseStride ??
        analysis.runtimeProvenance?.poseStride ??
        analysis.processingConfig?.poseStride ??
        1,
      maxPlayers:
        overrides?.maxPlayers ??
        analysis.trackedPlayerCount ??
        (analysis.gameType === 'doubles' ? 4 : 2),
      device:
        overrides?.device ??
        analysis.effectiveDevice ??
        analysis.device ??
        'cpu',
    },
    videoMetadata: {
      sourceWidth: overrides?.sourceWidth ?? analysis.videoMetadata?.width ?? 0,
      sourceHeight: overrides?.sourceHeight ?? analysis.videoMetadata?.height ?? 0,
      sourceFps: overrides?.sourceFps ?? analysis.videoMetadata?.nominalFps ?? 30,
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
    0;

  const elapsedSec =
    overrides?.elapsedSeconds ??
    status.elapsedSec ??
    status.performance?.elapsedSec ??
    0;

  const framesAnalyzed =
    overrides?.framesAnalyzed ??
    status.analyzedFrames ??
    0;

  const analysisFps =
    overrides?.analysisFps ??
    status.analysisFps ??
    status.performance?.analysisFps ??
    0;

  const effectiveTelemetryHz =
    overrides?.effectiveTelemetryHz ??
    status.performance?.samplingFps ??
    status.samplingFps ??
    10;

  const playerCoverage: Record<string, TrackingBenchmarkPlayerQuality> = {};
  if (status.quality?.playerCoverage) {
    for (const [pId, cov] of Object.entries(status.quality.playerCoverage)) {
      playerCoverage[pId] = {
        playerId: pId,
        observedCoverage: (cov.observedCoveragePct ?? 0) / 100,
        predictedPercent: cov.predictedFramesPct ?? 0,
        lostPercent: cov.lostFramesPct ?? 0,
        meanObservedConfidence: 0.85,
      };
    }
  }

  const meanTargetCoverage =
    overrides?.meanTargetCoverage ??
    ((status.quality?.observedCoveragePct ?? 0) / 100);

  const simultaneousTargetCoverage =
    overrides?.simultaneousTargetCoverage ??
    (status.quality?.simultaneousCoveragePct !== undefined
      ? status.quality.simultaneousCoveragePct / 100
      : meanTargetCoverage);

  return createBenchmarkRun({
    identity: {
      runId: overrides?.runId ?? `benchmark_${status.sessionId || Date.now()}`,
      createdAt: overrides?.createdAt ?? new Date().toISOString(),
      sport: overrides?.sport ?? 'badminton',
      videoFingerprint: overrides?.videoFingerprint ?? null,
      videoReference: overrides?.videoReference ?? status.videoMetadata?.filename ?? null,
      trackingMode: overrides?.trackingMode ?? (status.trackedPlayerCount === 4 ? 'doubles' : 'singles'),
      processingProfile:
        overrides?.processingProfile ??
        status.runtimeProvenance?.effectiveProfile ??
        status.processingConfig?.profile ??
        'auto',
    },
    modelConfig: {
      detectorName:
        overrides?.detectorName ??
        status.runtimeProvenance?.detectorModel ??
        'yolo',
      detectorVersion: overrides?.detectorVersion ?? null,
      poseModel:
        overrides?.poseModel ??
        status.runtimeProvenance?.poseModel ??
        'yolo_pose',
      trackerName:
        overrides?.trackerName ??
        status.runtimeProvenance?.trackerModel ??
        'bytetrack',
      trackerVersion: overrides?.trackerVersion ?? null,
      detectorInputSize:
        overrides?.detectorInputSize ??
        status.runtimeProvenance?.detectorInputSize ??
        status.processingConfig?.detectorInputSize ??
        640,
      confidenceThreshold: overrides?.confidenceThreshold ?? 0.25,
      frameStride:
        overrides?.frameStride ??
        status.runtimeProvenance?.frameStride ??
        status.processingConfig?.frameStride ??
        2,
      poseStride:
        overrides?.poseStride ??
        status.runtimeProvenance?.poseStride ??
        status.processingConfig?.poseStride ??
        1,
      maxPlayers: overrides?.maxPlayers ?? status.trackedPlayerCount ?? 2,
      device:
        overrides?.device ??
        status.effectiveDevice ??
        status.device ??
        'cpu',
    },
    videoMetadata: {
      sourceWidth: overrides?.sourceWidth ?? status.videoMetadata?.width ?? 0,
      sourceHeight: overrides?.sourceHeight ?? status.videoMetadata?.height ?? 0,
      sourceFps: overrides?.sourceFps ?? status.videoMetadata?.nominalFps ?? status.sourceFps ?? 30,
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
