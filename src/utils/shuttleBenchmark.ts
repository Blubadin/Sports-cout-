/**
 * SportsScout Phase 2.6 Shuttlecock Quality Benchmark Evaluator
 *
 * Implements ground-truth alignment, primary accuracy and spatial error metrics,
 * continuity, lost gaps, and reacquisition measurements.
 */

import type {
  ShuttleBenchmarkConfig,
  ShuttleGroundTruthFrame,
  ShuttleQualityMetrics,
} from '../types/shuttleBenchmark';
import type { ShuttleObservation } from '../types/shuttleTelemetry';

export interface ShuttleAlignedPair {
  frameIndex: number;
  timestampSec: number;
  gt: ShuttleGroundTruthFrame | null;
  pred: ShuttleObservation | null;
}

const DEFAULT_MATCH_DISTANCE_THRESHOLD_PX = 30;

function assertUniqueFrameIndices<T extends { frameIndex: number }>(items: T[], label: string): void {
  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item.frameIndex)) {
      throw new Error(`duplicate ${label} frameIndex: ${item.frameIndex}`);
    }
    seen.add(item.frameIndex);
  }
}

function areSourceAdjacent(previous: ShuttleAlignedPair, current: ShuttleAlignedPair): boolean {
  return (
    current.frameIndex === previous.frameIndex + 1 &&
    Number.isFinite(previous.timestampSec) &&
    Number.isFinite(current.timestampSec) &&
    current.timestampSec >= previous.timestampSec
  );
}

function matchDistanceThresholdPx(
  config: ShuttleBenchmarkConfig | undefined,
  sourceWidth?: number | null,
  sourceHeight?: number | null
): number {
  if (config?.matchDistanceThresholdPx != null) return config.matchDistanceThresholdPx;
  if (
    config?.matchDistanceThresholdNormalized != null &&
    sourceWidth != null && sourceHeight != null && sourceWidth > 0 && sourceHeight > 0
  ) {
    return config.matchDistanceThresholdNormalized * Math.hypot(sourceWidth, sourceHeight);
  }
  return DEFAULT_MATCH_DISTANCE_THRESHOLD_PX;
}

function isSpatialMatch(
  pred: ShuttleObservation | null,
  gt: ShuttleGroundTruthFrame | null,
  config?: ShuttleBenchmarkConfig,
  sourceWidth?: number | null,
  sourceHeight?: number | null
): boolean {
  if (
    pred?.state !== 'observed' ||
    pred.positionPx === null ||
    gt === null ||
    gt.xPx === null ||
    gt.yPx === null
  ) return false;
  const distance = Math.hypot(pred.positionPx.x - gt.xPx, pred.positionPx.y - gt.yPx);
  return Number.isFinite(distance) && distance <= matchDistanceThresholdPx(config, sourceWidth, sourceHeight);
}

function hasFiniteObservedPosition(pred: ShuttleObservation | null): boolean {
  return Boolean(
    pred?.state === 'observed' &&
    pred.positionPx !== null &&
    Number.isFinite(pred.positionPx.x) &&
    Number.isFinite(pred.positionPx.y)
  );
}

function longestLostGap(pairs: ShuttleAlignedPair[], sourceFps?: number | null): { frames: number; seconds: number | null } {
  let longestFrames = 0;
  let longestSeconds: number | null = 0;
  let run: ShuttleAlignedPair[] = [];
  const finish = (boundary?: ShuttleAlignedPair) => {
    if (run.length > longestFrames) {
      longestFrames = run.length;
      const times = run.map((pair) => pair.timestampSec).filter(Number.isFinite);
      longestSeconds = times.length > 0 && boundary && areSourceAdjacent(run[run.length - 1], boundary)
        ? Math.max(0, boundary.timestampSec - Math.min(...times))
        : sourceFps != null && Number.isFinite(sourceFps) && sourceFps > 0
          ? run.length / sourceFps
          : times.length > 1 ? Math.max(...times) - Math.min(...times) : null;
    }
    run = [];
  };
  for (const pair of pairs) {
    if (pair.pred?.state === 'lost') {
      if (run.length > 0 && !areSourceAdjacent(run[run.length - 1], pair)) finish();
      run.push(pair);
    } else {
      finish(pair);
    }
  }
  finish();
  return { frames: longestFrames, seconds: longestSeconds };
}

function safePercentile(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0];

  const rank = (percentile / 100.0) * (clean.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return clean[low];
  const weight = rank - low;
  return clean[low] * (1.0 - weight) + clean[high] * weight;
}

/**
 * Aligns prediction observations to ground truth frames strictly.
 * Frame indices must agree and timestamps for a shared index must be within tolerance.
 */
export function alignShuttlePredictionsAndGroundTruth(
  gtFrames: ShuttleGroundTruthFrame[],
  predictions: ShuttleObservation[],
  config?: ShuttleBenchmarkConfig
): ShuttleAlignedPair[] {
  const tolerance = config?.timestampToleranceSec ?? 0.02;

  assertUniqueFrameIndices(gtFrames, 'ground truth');
  assertUniqueFrameIndices(predictions, 'prediction');
  const gtByFrame = new Map(gtFrames.map((frame) => [frame.frameIndex, frame]));
  const predByFrame = new Map(predictions.map((prediction) => [prediction.frameIndex, prediction]));
  const allIndices = Array.from(new Set([...gtByFrame.keys(), ...predByFrame.keys()])).sort((a, b) => a - b);
  const pairs: ShuttleAlignedPair[] = [];
  for (const frameIndex of allIndices) {
    const gtItem = gtByFrame.get(frameIndex) ?? null;
    const predItem = predByFrame.get(frameIndex) ?? null;
    if (
      gtItem && predItem &&
      (!Number.isFinite(gtItem.timestampSec) || !Number.isFinite(predItem.timestampSec) ||
        Math.abs(gtItem.timestampSec - predItem.timestampSec) > tolerance)
    ) {
      pairs.push({ frameIndex, timestampSec: gtItem.timestampSec, gt: gtItem, pred: null });
      pairs.push({ frameIndex, timestampSec: predItem.timestampSec, gt: null, pred: predItem });
    } else {
      pairs.push({
        frameIndex,
        timestampSec: gtItem?.timestampSec ?? predItem?.timestampSec ?? 0,
        gt: gtItem,
        pred: predItem,
      });
    }
  }

  pairs.sort((a, b) => a.frameIndex - b.frameIndex || a.timestampSec - b.timestampSec || (a.gt ? -1 : 1));
  return pairs;
}

export function evaluateShuttleTracking(
  alignedPairs: ShuttleAlignedPair[],
  options?: {
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    sourceFps?: number | null;
    isDatasetComplete?: boolean;
    config?: ShuttleBenchmarkConfig;
    performanceMetrics?: {
      analysisFps?: number | null;
      processingRatio?: number | null;
      meanInferenceMs?: number | null;
      device?: string | null;
      runtime?: string | null;
      precision?: string | null;
    };
  }
): ShuttleQualityMetrics {
  const totalFrames = alignedPairs.length;
  const isComplete = options?.isDatasetComplete ?? true;
  const cfg = options?.config;
  const perf = options?.performanceMetrics;

  const validTimestamps = alignedPairs
    .map((p) => p.timestampSec)
    .filter((t) => Number.isFinite(t));
  let durationSec =
    validTimestamps.length > 1
      ? Math.max(...validTimestamps) - Math.min(...validTimestamps)
      : 0.0;
  if (durationSec <= 0 && options?.sourceFps && options.sourceFps > 0) {
    durationSec = totalFrames / options.sourceFps;
  }

  const gtFrames = alignedPairs.map((p) => p.gt).filter((g): g is ShuttleGroundTruthFrame => g !== null);
  const gtVisible = gtFrames.filter((f) => f.visibility === 'visible');
  const gtOccluded = gtFrames.filter((f) => f.visibility === 'occluded');
  const gtNotVisible = gtFrames.filter((f) => f.visibility === 'not_visible');
  const gtUnknown = gtFrames.filter((f) => f.visibility === 'unknown');

  const sourceW = options?.sourceWidth ?? null;
  const sourceH = options?.sourceHeight ?? null;
  const diagonal =
    sourceW && sourceH && sourceW > 0 && sourceH > 0
      ? Math.sqrt(sourceW * sourceW + sourceH * sourceH)
      : null;
  const formulaStr =
    'normalized_error = raw_pixel_error / sqrt(source_width^2 + source_height^2)';

  const predObs = alignedPairs.filter((p) => p.pred?.state === 'observed').length;
  const predExtrap = alignedPairs.filter((p) => p.pred?.state === 'predicted').length;
  const predInterp = alignedPairs.filter((p) => p.pred?.state === 'interpolated').length;
  const predLost = alignedPairs.filter((p) => p.pred?.state === 'lost').length;
  const predUnk = alignedPairs.filter((p) => !p.pred || p.pred.state === 'unknown').length;
  const lostGap = longestLostGap(alignedPairs, options?.sourceFps);

  if (!isComplete || gtFrames.length === 0) {
    return {
      datasetStatus: 'GROUND TRUTH DATASET INCOMPLETE',
      totalFrames,
      evaluatedDurationSec: durationSec,
      gtVisibleCount: gtVisible.length,
      gtOccludedCount: gtOccluded.length,
      gtNotVisibleCount: gtNotVisible.length,
      gtUnknownCount: gtUnknown.length,
      visibleFrameRecall: null,
      precision: null,
      truePositivesCount: null,
      falsePositivesCount: null,
      falseNegativesCount: null,
      falsePositivesPerMinute: null,
      positionEvaluatedCount: null,
      meanPixelError: null,
      medianPixelError: null,
      p95PixelError: null,
      imageDiagonalPx: diagonal,
      normalizationFormula: formulaStr,
      meanNormalizedError: null,
      medianNormalizedError: null,
      p95NormalizedError: null,
      trackContinuity: null,
      longestContinuousTrackFrames: 0,
      trackFragmentationCount: 0,
      lostPercent: totalFrames > 0 ? (predLost / totalFrames) * 100.0 : 0.0,
      lostFramesCount: predLost,
      longestLostGapFrames: lostGap.frames,
      longestLostGapSec: lostGap.seconds,
      reacquisitionEventsCount: null,
      meanReacquisitionTimeSec: null,
      p95ReacquisitionTimeSec: null,
      meanReacquisitionFrames: null,
      p95ReacquisitionFrames: null,
      observedPercent: totalFrames > 0 ? (predObs / totalFrames) * 100.0 : 0.0,
      predictedPercent: totalFrames > 0 ? (predExtrap / totalFrames) * 100.0 : 0.0,
      interpolatedPercent: totalFrames > 0 ? (predInterp / totalFrames) * 100.0 : 0.0,
      unknownPercent: totalFrames > 0 ? (predUnk / totalFrames) * 100.0 : 0.0,
      observedCount: predObs,
      predictedCount: predExtrap,
      interpolatedCount: predInterp,
      unknownCount: predUnk,
      analysisFps: perf?.analysisFps ?? null,
      processingRatio: perf?.processingRatio ?? null,
      meanInferenceMs: perf?.meanInferenceMs ?? null,
      device: perf?.device ?? null,
      runtime: perf?.runtime ?? null,
      precisionMode: perf?.precision ?? null,
    };

  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  const pixelErrors: number[] = [];

  for (const pair of alignedPairs) {
    const gt = pair.gt;
    const pred = pair.pred;

    if (gt && gt.visibility === 'visible') {
      if (hasFiniteObservedPosition(pred) && gt.xPx !== null && gt.yPx !== null) {
        const dx = pred.positionPx.x - gt.xPx;
        const dy = pred.positionPx.y - gt.yPx;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (Number.isFinite(dist)) pixelErrors.push(dist);

        if (isSpatialMatch(pred, gt, cfg, options?.sourceWidth, options?.sourceHeight)) {
          tp++;
        } else {
          fn++;
          fp++;
        }
      } else {
        fn++;
      }
    } else if (gt && gt.visibility === 'not_visible') {
      if (hasFiniteObservedPosition(pred)) {
        fp++;
      }
    } else if (gt && gt.visibility === 'occluded') {
      if (
        pred &&
        pred.state === 'observed' &&
        pred.positionPx !== null &&
        gt.xPx !== null &&
        gt.yPx !== null
      ) {
        const dx = pred.positionPx.x - gt.xPx;
        const dy = pred.positionPx.y - gt.yPx;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (Number.isFinite(dist)) pixelErrors.push(dist);
      }
    }
  }

  const recall = gtVisible.length > 0 ? tp / gtVisible.length : null;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const durationMin = durationSec / 60.0;
  const fpPerMin = durationMin > 0 ? fp / durationMin : null;

  const meanPix = pixelErrors.length > 0 ? pixelErrors.reduce((a, b) => a + b, 0) / pixelErrors.length : null;
  const medPix = safePercentile(pixelErrors, 50.0);
  const p95Pix = safePercentile(pixelErrors, 95.0);

  let meanNorm: number | null = null;
  let medNorm: number | null = null;
  let p95Norm: number | null = null;

  if (diagonal && diagonal > 0 && pixelErrors.length > 0) {
    const normErrors = pixelErrors.map((e) => e / diagonal);
    meanNorm = normErrors.reduce((a, b) => a + b, 0) / normErrors.length;
    medNorm = safePercentile(normErrors, 50.0);
    p95Norm = safePercentile(normErrors, 95.0);
  }

  // Continuity
  let visibleTransitions = 0;
  let observedTransitions = 0;
  let longestContinuousTrack = 0;
  let currentTrack = 0;
  let trackFragments = 0;
  let wasObserved = false;

  for (let idx = 0; idx < alignedPairs.length; idx++) {
    const pair = alignedPairs[idx];
    const isGtVis = pair.gt !== null && pair.gt.visibility === 'visible';
    const isPredObs = isSpatialMatch(pair.pred, pair.gt, cfg, options?.sourceWidth, options?.sourceHeight);

    if (isGtVis) {
      const adjacentVisible = idx > 0 &&
        alignedPairs[idx - 1].gt?.visibility === 'visible' &&
        areSourceAdjacent(alignedPairs[idx - 1], pair);
      if (!adjacentVisible) {
        currentTrack = 0;
        wasObserved = false;
      }
      if (isPredObs) {
        currentTrack++;
        if (currentTrack > longestContinuousTrack) longestContinuousTrack = currentTrack;
        wasObserved = true;
      } else {
        if (wasObserved) trackFragments++;
        currentTrack = 0;
        wasObserved = false;
      }

      if (adjacentVisible) {
        const prev = alignedPairs[idx - 1];
        visibleTransitions++;
        if (isSpatialMatch(prev.pred, prev.gt, cfg, options?.sourceWidth, options?.sourceHeight) && isPredObs) {
          observedTransitions++;
        }
      }
    } else {
      currentTrack = 0;
      wasObserved = false;
    }
  }

  let trackContinuity: number | null = null;
  if (visibleTransitions > 0) {
    trackContinuity = observedTransitions / visibleTransitions;
  }

  // Reacquisition
  const reacqTimesSec: number[] = [];
  const reacqFramesList: number[] = [];
  let hadPriorLossOrOcclusion = false;

  for (let idx = 0; idx < alignedPairs.length; idx++) {
    const pair = alignedPairs[idx];
    const gt = pair.gt;

    const isLossGt = gt !== null && (gt.visibility === 'not_visible' || gt.visibility === 'occluded');

    if (isLossGt) {
      hadPriorLossOrOcclusion = true;
    } else if (hadPriorLossOrOcclusion && gt !== null && gt.visibility === 'visible') {
      const resumeIdx = idx;
      const resumeTime = pair.timestampSec;
      let reacquiredIdx: number | null = null;
      let reacquiredTime: number | null = null;

      for (let s = resumeIdx; s < alignedPairs.length; s++) {
        const sPair = alignedPairs[s];
        if (sPair.gt !== null && sPair.gt.visibility !== 'visible') break;
        if (isSpatialMatch(sPair.pred, sPair.gt, cfg, options?.sourceWidth, options?.sourceHeight)) {
          reacquiredIdx = s;
          reacquiredTime = sPair.timestampSec;
          break;
        }
      }

      if (reacquiredIdx !== null && reacquiredTime !== null) {
        reacqFramesList.push(alignedPairs[reacquiredIdx].frameIndex - pair.frameIndex);
        reacqTimesSec.push(Math.max(0, reacquiredTime - resumeTime));
      }
      hadPriorLossOrOcclusion = false;
    }
  }


  const reacqCount = reacqTimesSec.length;
  const meanReacqSec =
    reacqCount > 0 ? reacqTimesSec.reduce((a, b) => a + b, 0) / reacqCount : null;
  const p95ReacqSec = safePercentile(reacqTimesSec, 95.0);
  const meanReacqFrames =
    reacqCount > 0 ? reacqFramesList.reduce((a, b) => a + b, 0) / reacqCount : null;
  const p95ReacqFrames = safePercentile(reacqFramesList, 95.0);

  return {
    datasetStatus: 'COMPLETE',
    totalFrames,
    evaluatedDurationSec: durationSec,
    gtVisibleCount: gtVisible.length,
    gtOccludedCount: gtOccluded.length,
    gtNotVisibleCount: gtNotVisible.length,
    gtUnknownCount: gtUnknown.length,
    visibleFrameRecall: recall,
    precision,
    truePositivesCount: tp,
    falsePositivesCount: fp,
    falseNegativesCount: fn,
    falsePositivesPerMinute: fpPerMin,
    positionEvaluatedCount: pixelErrors.length,
    meanPixelError: meanPix,
    medianPixelError: medPix,
    p95PixelError: p95Pix,
    imageDiagonalPx: diagonal,
    normalizationFormula: formulaStr,
    meanNormalizedError: meanNorm,
    medianNormalizedError: medNorm,
    p95NormalizedError: p95Norm,
    trackContinuity,
    longestContinuousTrackFrames: longestContinuousTrack,
    trackFragmentationCount: trackFragments,
    lostPercent: totalFrames > 0 ? (predLost / totalFrames) * 100.0 : 0.0,
    lostFramesCount: predLost,
    longestLostGapFrames: lostGap.frames,
    longestLostGapSec: lostGap.seconds,
    reacquisitionEventsCount: reacqCount,
    meanReacquisitionTimeSec: meanReacqSec,
    p95ReacquisitionTimeSec: p95ReacqSec,
    meanReacquisitionFrames: meanReacqFrames,
    p95ReacquisitionFrames: p95ReacqFrames,
    observedPercent: totalFrames > 0 ? (predObs / totalFrames) * 100.0 : 0.0,
    predictedPercent: totalFrames > 0 ? (predExtrap / totalFrames) * 100.0 : 0.0,
    interpolatedPercent: totalFrames > 0 ? (predInterp / totalFrames) * 100.0 : 0.0,
    unknownPercent: totalFrames > 0 ? (predUnk / totalFrames) * 100.0 : 0.0,
    observedCount: predObs,
    predictedCount: predExtrap,
    interpolatedCount: predInterp,
    unknownCount: predUnk,
    analysisFps: perf?.analysisFps ?? null,
    processingRatio: perf?.processingRatio ?? null,
    meanInferenceMs: perf?.meanInferenceMs ?? null,
    device: perf?.device ?? null,
    runtime: perf?.runtime ?? null,
    precisionMode: perf?.precision ?? null,
  };

}

export function formatShuttleBenchmarkReport(
  clipId: string,
  configurationName: string,
  metrics: ShuttleQualityMetrics,
  limitations: string[] = []
): string {
  const lines: string[] = [
    'PHASE 2.6 BENCHMARK REPORT',
    '',
    `DATASET: ${clipId}`,
  ];

  if (metrics.datasetStatus === 'GROUND TRUTH DATASET INCOMPLETE') {
    lines.push(
      'STATUS: GROUND TRUTH DATASET INCOMPLETE',
      '',
      'NOTICE: Benchmark clips have not actually been fully annotated in the repository manifest.',
      'In accordance with Phase 2.6 protocol, no synthetic accuracy metrics were fabricated.',
      '',
      `CONFIGURATIONS: ${configurationName}`,
      `TOTAL FRAMES: ${metrics.totalFrames}`,
      `OBSERVED: ${metrics.observedPercent.toFixed(1)}% (${metrics.observedCount})`,
      `PREDICTED: ${metrics.predictedPercent.toFixed(1)}% (${metrics.predictedCount})`,
      `INTERPOLATED: ${metrics.interpolatedPercent.toFixed(1)}% (${metrics.interpolatedCount})`,
      `LOST: ${metrics.lostPercent.toFixed(1)}% (${metrics.lostFramesCount})`,
      `UNKNOWN: ${metrics.unknownPercent.toFixed(1)}% (${metrics.unknownCount})`,
      '',
      'LIMITATIONS:',
      '- Ground truth dataset is incomplete for official accuracy benchmarking'
    );
    for (const lim of limitations) {
      lines.push(`- ${lim}`);
    }
    return lines.join('\n');
  }

  const recallStr =
    metrics.visibleFrameRecall !== null
      ? `${(metrics.visibleFrameRecall * 100.0).toFixed(1)}%`
      : 'N/A';
  const precStr =
    metrics.precision !== null ? `${(metrics.precision * 100.0).toFixed(1)}%` : 'N/A';
  const fpMinStr = metrics.falsePositivesPerMinute !== null
    ? metrics.falsePositivesPerMinute.toFixed(2)
    : 'N/A';

  let meanErrStr =
    metrics.meanPixelError !== null ? `${metrics.meanPixelError.toFixed(2)} px` : 'N/A';
  if (metrics.meanNormalizedError !== null) {
    meanErrStr += ` (${(metrics.meanNormalizedError * 100.0).toFixed(2)}% diag)`;
  }

  let medErrStr =
    metrics.medianPixelError !== null ? `${metrics.medianPixelError.toFixed(2)} px` : 'N/A';
  if (metrics.medianNormalizedError !== null) {
    medErrStr += ` (${(metrics.medianNormalizedError * 100.0).toFixed(2)}% diag)`;
  }

  let p95ErrStr =
    metrics.p95PixelError !== null ? `${metrics.p95PixelError.toFixed(2)} px` : 'N/A';
  if (metrics.p95NormalizedError !== null) {
    p95ErrStr += ` (${(metrics.p95NormalizedError * 100.0).toFixed(2)}% diag)`;
  }

  const continuityStr =
    metrics.trackContinuity !== null
      ? `${(metrics.trackContinuity * 100.0).toFixed(1)}% (longest: ${metrics.longestContinuousTrackFrames} frames, fragments: ${metrics.trackFragmentationCount})`
      : `N/A (longest: ${metrics.longestContinuousTrackFrames} frames)`;

  const longestGapSecStr = metrics.longestLostGapSec !== null
    ? `${metrics.longestLostGapSec.toFixed(2)}s`
    : 'N/A';
  const lostStr = `${metrics.lostPercent.toFixed(1)}% (${metrics.lostFramesCount} frames, longest gap: ${metrics.longestLostGapFrames} frames / ${longestGapSecStr})`;

  let reacqStr = 'No reacquisition events during clip';
  if (metrics.reacquisitionEventsCount !== null && metrics.reacquisitionEventsCount > 0) {
    reacqStr = `Mean: ${metrics.meanReacquisitionTimeSec?.toFixed(3)}s (${metrics.meanReacquisitionFrames?.toFixed(1)} frames) | P95: ${metrics.p95ReacquisitionTimeSec?.toFixed(3)}s (${metrics.p95ReacquisitionFrames?.toFixed(1)} frames) | Events: ${metrics.reacquisitionEventsCount}`;
  }

  const fpsStr = metrics.analysisFps !== null && metrics.analysisFps !== undefined ? metrics.analysisFps.toFixed(1) : 'N/A';
  const ratioStr = metrics.processingRatio !== null && metrics.processingRatio !== undefined ? `${metrics.processingRatio.toFixed(2)}x` : 'N/A';
  const infStr = metrics.meanInferenceMs !== null && metrics.meanInferenceMs !== undefined ? `${metrics.meanInferenceMs.toFixed(2)} ms` : 'N/A';
  const devStr = metrics.device || 'CPU';
  const runStr = metrics.runtime || 'N/A';
  const precModeStr = metrics.precisionMode || 'fp32';


  const perfStr = `FPS: ${fpsStr} | Ratio: ${ratioStr} | Inference: ${infStr} | Device: ${devStr} | Runtime: ${runStr} (${precModeStr})`;

  lines.push(
    `CONFIGURATIONS: ${configurationName}`,
    '',
    `VISIBLE-FRAME RECALL: ${recallStr} (TP: ${metrics.truePositivesCount} / Visible: ${metrics.gtVisibleCount})`,
    `PRECISION: ${precStr}`,
    `FALSE POSITIVES/MIN: ${fpMinStr} (${metrics.falsePositivesCount} FP across ${metrics.evaluatedDurationSec.toFixed(1)}s)`,
    '',
    `MEAN ERROR: ${meanErrStr}`,
    `MEDIAN ERROR: ${medErrStr}`,
    `P95 ERROR: ${p95ErrStr}`,
    `NORMALIZATION FORMULA: ${metrics.normalizationFormula}`,
    '',
    `TRACK CONTINUITY: ${continuityStr}`,
    `LOST: ${lostStr}`,
    `REACQUISITION: ${reacqStr}`,
    '',
    'STATE DISTRIBUTION:',
    `- Observed:     ${metrics.observedPercent.toFixed(1)}% (${metrics.observedCount})`,
    `- Predicted:    ${metrics.predictedPercent.toFixed(1)}% (${metrics.predictedCount})`,
    `- Interpolated: ${metrics.interpolatedPercent.toFixed(1)}% (${metrics.interpolatedCount})`,
    `- Lost:         ${metrics.lostPercent.toFixed(1)}% (${metrics.lostFramesCount})`,
    `- Unknown:      ${metrics.unknownPercent.toFixed(1)}% (${metrics.unknownCount})`,
    '',
    `PERFORMANCE: ${perfStr}`,
    '',
    'LIMITATIONS:'
  );

  if (limitations.length === 0) {
    lines.push(
      '- Monocular 2D pixel estimates only; no 3D trajectory claims',
      '- Benchmarked on development test sequences; real match blur may vary'
    );
  } else {
    for (const lim of limitations) {
      lines.push(`- ${lim}`);
    }
  }

  return lines.join('\n');
}
