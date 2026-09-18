import type {
  ProcessingConfig,
  TrackingRuntimeProvenance,
  TrackingSessionStatus,
} from '../types';
import type { TrackingAnalysis } from '../services/storage/trackingStorage';

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
