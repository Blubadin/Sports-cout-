import type { TrackingTelemetryV1 } from '../../types';
import {
  MAX_TRACKING_PAGE_SIZE,
  type PlayerMovementMetrics,
  type PlayerTrackingQuality,
  type SinglePlayerMetricsResult,
  type TrackingMovementMetricsOptions,
  type TrackingMovementMetricsResult,
  type TrackingQuality,
  type TrackingSample,
} from './types';
import { getTrackingSampleChunks } from './driver';

// -------------------------------------------------------------
// Movement & Quality Metrics Calculation
// -------------------------------------------------------------

/**
 * Robust 95th Percentile calculation
 */
export function calculateP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  return Number(sorted[idx].toFixed(2));
}

/**
 * Calculates nominal video-domain analysis cadence (Hz) from source FPS and frame stride.
 * Formula: sourceFps / frameStride.
 * Returns null if sourceFps or frameStride is missing, <= 0, or not finite.
 */
export function calculateNominalAnalysisHz(
  sourceFps: number | null | undefined,
  frameStride: number | null | undefined
): number | null {
  if (
    sourceFps === null ||
    sourceFps === undefined ||
    !Number.isFinite(sourceFps) ||
    sourceFps <= 0
  ) {
    return null;
  }
  if (
    frameStride === null ||
    frameStride === undefined ||
    !Number.isFinite(frameStride) ||
    frameStride <= 0
  ) {
    return null;
  }
  const hz = sourceFps / frameStride;
  return Number.isFinite(hz) && hz > 0 ? Number(hz.toFixed(2)) : null;
}

/**
 * Calculates effective stored cadence (Hz) from sample count and video duration.
 * Formula: sampleCount / durationSec.
 * Returns null if durationSec is missing, <= 0, or sampleCount <= 0.
 */
export function calculateEffectiveStoredHz(
  sampleCount: number | null | undefined,
  durationSec: number | null | undefined
): number | null {
  if (
    sampleCount === null ||
    sampleCount === undefined ||
    !Number.isFinite(sampleCount) ||
    sampleCount <= 0
  ) {
    return null;
  }
  if (
    durationSec === null ||
    durationSec === undefined ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  ) {
    return null;
  }
  const hz = sampleCount / durationSec;
  return Number.isFinite(hz) && hz > 0 ? Number(hz.toFixed(1)) : null;
}

/**
 * Calculates movement metrics for a single player's samples.
 * Only connects consecutive tracked samples of the same player in chronological order.
 */
export function computeSinglePlayerMovementMetrics(
  samples: TrackingSample[],
  canonicalTotalDist?: number
): SinglePlayerMetricsResult {
  if (samples.length === 0) {
    return {
      metrics: {
        totalDistanceMeters: canonicalTotalDist !== undefined ? Number(canonicalTotalDist.toFixed(2)) : 0,
        avgSpeedMps: 0,
        p95SpeedMps: 0,
        maxSpeedMps: 0,
        courtCoverage: {
          frontPercent: 0,
          midPercent: 0,
          rearPercent: 0,
          leftPercent: 0,
          rightPercent: 0,
        },
        basePosition: { avgCourtX: null, avgCourtY: null, dispersion: 0 },
        lateralMovementMeters: 0,
        frontBackMovementMeters: 0,
      },
      validSpeeds: [],
      trackedCount: 0,
      sumX: 0,
      sumY: 0,
      frontCount: 0,
      midCount: 0,
      rearCount: 0,
      leftCount: 0,
      rightCount: 0,
    };
  }

  // Ensure chronological order
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);

  let totalDist = 0;
  let lateralDist = 0;
  let frontBackDist = 0;
  const validSpeeds: number[] = [];
  let sumX = 0;
  let sumY = 0;
  let trackedCount = 0;

  let frontCount = 0;
  let midCount = 0;
  let rearCount = 0;
  let leftCount = 0;
  let rightCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.trackingState !== 'tracked') continue;

    trackedCount++;
    sumX += s.courtX;
    sumY += s.courtY;

    // Badminton court: length 13.40m, width 6.10m. Net is at Y = 6.70m.
    const distToNet = Math.abs(6.70 - s.courtY);
    if (distToNet <= 2.2) {
      frontCount++;
    } else if (distToNet <= 4.4) {
      midCount++;
    } else {
      rearCount++;
    }

    if (s.courtX < 3.05) {
      leftCount++;
    } else {
      rightCount++;
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.trackingState === 'tracked' &&
          (s.metricRunId === undefined || prev.metricRunId === undefined || s.metricRunId === prev.metricRunId) &&
          (s.calibrationId === undefined || prev.calibrationId === undefined || s.calibrationId === prev.calibrationId) &&
          (s.cameraSegmentId === undefined || prev.cameraSegmentId === undefined || s.cameraSegmentId === prev.cameraSegmentId)) {
        const dx = s.courtX - prev.courtX;
        const dy = s.courtY - prev.courtY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Teleport filter: badminton players can't move > 12 m/s
        const dt = Math.max(0.001, s.timestamp - prev.timestamp);
        const instantSpeed = dist / dt;
        if (instantSpeed <= 12.0) {
          totalDist += dist;
          lateralDist += Math.abs(dx);
          frontBackDist += Math.abs(dy);
          validSpeeds.push(instantSpeed);
        }
      }
    }
  }

  const avgSpeed = validSpeeds.length > 0 ? validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length : 0;
  const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 0;
  const p95Speed = calculateP95(validSpeeds);

  const avgX = trackedCount > 0 ? sumX / trackedCount : null;
  const avgY = trackedCount > 0 ? sumY / trackedCount : null;

  // Dispersion: average Euclidean distance from base position
  let totalDispersion = 0;
  if (trackedCount > 0 && avgX !== null && avgY !== null) {
    for (const s of sorted) {
      if (s.trackingState !== 'tracked') continue;
      const dx = s.courtX - avgX;
      const dy = s.courtY - avgY;
      totalDispersion += Math.sqrt(dx * dx + dy * dy);
    }
  }
  const dispersion = trackedCount > 0 ? totalDispersion / trackedCount : 0;

  const validCount = Math.max(1, trackedCount);
  const effectiveTotalDist = canonicalTotalDist !== undefined ? canonicalTotalDist : totalDist;

  const metrics: PlayerMovementMetrics = {
    totalDistanceMeters: Number(effectiveTotalDist.toFixed(2)),
    avgSpeedMps: Number(avgSpeed.toFixed(2)),
    p95SpeedMps: Number(p95Speed.toFixed(2)),
    maxSpeedMps: Number(maxSpeed.toFixed(2)),
    courtCoverage: {
      frontPercent: trackedCount > 0 ? Number(((frontCount / validCount) * 100).toFixed(1)) : 0,
      midPercent: trackedCount > 0 ? Number(((midCount / validCount) * 100).toFixed(1)) : 0,
      rearPercent: trackedCount > 0 ? Number(((rearCount / validCount) * 100).toFixed(1)) : 0,
      leftPercent: trackedCount > 0 ? Number(((leftCount / validCount) * 100).toFixed(1)) : 0,
      rightPercent: trackedCount > 0 ? Number(((rightCount / validCount) * 100).toFixed(1)) : 0,
    },
    basePosition: {
      avgCourtX: avgX !== null ? Number(avgX.toFixed(2)) : null,
      avgCourtY: avgY !== null ? Number(avgY.toFixed(2)) : null,
      dispersion: Number(dispersion.toFixed(2)),
    },
    lateralMovementMeters: Number(lateralDist.toFixed(2)),
    frontBackMovementMeters: Number(frontBackDist.toFixed(2)),
  };

  return {
    metrics,
    validSpeeds,
    trackedCount,
    sumX,
    sumY,
    frontCount,
    midCount,
    rearCount,
    leftCount,
    rightCount,
  };
}

/**
 * Calculates aggregated movement metrics for multiple players (ALL mode).
 * Guarantees that physical movement calculations only connect samples belonging
 * to the SAME playerId.
 */
export function computeMultiPlayerMovementMetrics(samples: TrackingSample[]): PlayerMovementMetrics {
  if (samples.length === 0) {
    return {
      totalDistanceMeters: 0,
      avgSpeedMps: 0,
      p95SpeedMps: 0,
      maxSpeedMps: 0,
      courtCoverage: {
        frontPercent: 0,
        midPercent: 0,
        rearPercent: 0,
        leftPercent: 0,
        rightPercent: 0,
      },
      basePosition: { avgCourtX: null, avgCourtY: null, dispersion: 0 },
      lateralMovementMeters: 0,
      frontBackMovementMeters: 0,
    };
  }

  // 1. Group by playerId
  const playerMap = new Map<string, TrackingSample[]>();
  for (const s of samples) {
    let list = playerMap.get(s.playerId);
    if (!list) {
      list = [];
      playerMap.set(s.playerId, list);
    }
    list.push(s);
  }

  // 2. Calculate each player's movement metrics independently
  let aggregateTotalDist = 0;
  let aggregateLateralDist = 0;
  let aggregateFrontBackDist = 0;
  const pooledSpeeds: number[] = [];

  let totalTrackedCount = 0;
  let totalSumX = 0;
  let totalSumY = 0;
  let totalFrontCount = 0;
  let totalMidCount = 0;
  let totalRearCount = 0;
  let totalLeftCount = 0;
  let totalRightCount = 0;

  for (const [, pSamples] of playerMap.entries()) {
    const singleResult = computeSinglePlayerMovementMetrics(pSamples);
    aggregateTotalDist += singleResult.metrics.totalDistanceMeters;
    aggregateLateralDist += singleResult.metrics.lateralMovementMeters;
    aggregateFrontBackDist += singleResult.metrics.frontBackMovementMeters;
    pooledSpeeds.push(...singleResult.validSpeeds);

    totalTrackedCount += singleResult.trackedCount;
    totalSumX += singleResult.sumX;
    totalSumY += singleResult.sumY;
    totalFrontCount += singleResult.frontCount;
    totalMidCount += singleResult.midCount;
    totalRearCount += singleResult.rearCount;
    totalLeftCount += singleResult.leftCount;
    totalRightCount += singleResult.rightCount;
  }

  // 3. Aggregate speeds from pooled valid same-player speed observations
  const avgSpeed = pooledSpeeds.length > 0 ? pooledSpeeds.reduce((a, b) => a + b, 0) / pooledSpeeds.length : 0;
  const maxSpeed = pooledSpeeds.length > 0 ? Math.max(...pooledSpeeds) : 0;
  const p95Speed = calculateP95(pooledSpeeds);

  // 4. Combined occupancy centroid and dispersion
  const avgX = totalTrackedCount > 0 ? totalSumX / totalTrackedCount : null;
  const avgY = totalTrackedCount > 0 ? totalSumY / totalTrackedCount : null;

  let totalDispersion = 0;
  if (totalTrackedCount > 0 && avgX !== null && avgY !== null) {
    for (const s of samples) {
      if (s.trackingState !== 'tracked') continue;
      const dx = s.courtX - avgX;
      const dy = s.courtY - avgY;
      totalDispersion += Math.sqrt(dx * dx + dy * dy);
    }
  }
  const dispersion = totalTrackedCount > 0 ? totalDispersion / totalTrackedCount : 0;

  const validCount = Math.max(1, totalTrackedCount);

  return {
    totalDistanceMeters: Number(aggregateTotalDist.toFixed(2)),
    avgSpeedMps: Number(avgSpeed.toFixed(2)),
    p95SpeedMps: Number(p95Speed.toFixed(2)),
    maxSpeedMps: Number(maxSpeed.toFixed(2)),
    courtCoverage: {
      frontPercent: totalTrackedCount > 0 ? Number(((totalFrontCount / validCount) * 100).toFixed(1)) : 0,
      midPercent: totalTrackedCount > 0 ? Number(((totalMidCount / validCount) * 100).toFixed(1)) : 0,
      rearPercent: totalTrackedCount > 0 ? Number(((totalRearCount / validCount) * 100).toFixed(1)) : 0,
      leftPercent: totalTrackedCount > 0 ? Number(((totalLeftCount / validCount) * 100).toFixed(1)) : 0,
      rightPercent: totalTrackedCount > 0 ? Number(((totalRightCount / validCount) * 100).toFixed(1)) : 0,
    },
    basePosition: {
      avgCourtX: avgX !== null ? Number(avgX.toFixed(2)) : null,
      avgCourtY: avgY !== null ? Number(avgY.toFixed(2)) : null,
      dispersion: Number(dispersion.toFixed(2)),
    },
    lateralMovementMeters: Number(aggregateLateralDist.toFixed(2)),
    frontBackMovementMeters: Number(aggregateFrontBackDist.toFixed(2)),
  };
}

/**
 * Calculates court distance and movement metrics for a set of samples.
 * If samples belong to multiple players, groups by playerId and aggregates
 * to guarantee that physical movement calculations only connect samples of the same player.
 */
export function computePlayerMovementMetrics(samples: TrackingSample[], canonicalTotalDist?: number): PlayerMovementMetrics {
  if (samples.length === 0) {
    return computeSinglePlayerMovementMetrics([], canonicalTotalDist).metrics;
  }

  // Check if multiple playerIds are present
  const firstPlayerId = samples[0].playerId;
  let hasMultiplePlayers = false;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].playerId !== firstPlayerId) {
      hasMultiplePlayers = true;
      break;
    }
  }

  if (hasMultiplePlayers) {
    return computeMultiPlayerMovementMetrics(samples);
  }

  return computeSinglePlayerMovementMetrics(samples, canonicalTotalDist).metrics;
}

/**
 * Computes multi-target tracking quality metrics.
 * Separates per-athlete quality from session-level multi-target quality.
 * OBSERVED: fresh measurement exists.
 * PREDICTED: estimated without fresh observation (not observed).
 * LOST: no reliable state (not observed).
 */
export function computeTrackingQuality(
  frames: TrackingTelemetryV1[],
  canonicalPlayerIds?: string[]
): TrackingQuality {
  if (frames.length === 0) {
    return {
      meanTargetCoverage: null,
      simultaneousTargetCoverage: null,
      fullyObservedFrameCount: 0,
      partiallyObservedFrameCount: 0,
      fullyLostFrameCount: 0,
      predictedPercent: null,
      lostPercent: null,
      playerCoverage: {},
      idSwitchCount: null,
      manualCorrectionCount: null,
      manualCorrections: null,
      detectionCoverage: null,
      lostTimePercent: null,
      confidence: null,
    };
  }

  // 1. Identify all expected player targets
  const expectedSet = new Set<string>();
  if (canonicalPlayerIds) {
    for (const pId of canonicalPlayerIds) expectedSet.add(pId);
  }
  for (const f of frames) {
    for (const p of f.players) {
      if (p.playerId) expectedSet.add(p.playerId);
    }
  }
  const expectedPlayerIds = Array.from(expectedSet).sort();

  if (expectedPlayerIds.length === 0) {
    return {
      meanTargetCoverage: null,
      simultaneousTargetCoverage: null,
      fullyObservedFrameCount: 0,
      partiallyObservedFrameCount: 0,
      fullyLostFrameCount: 0,
      predictedPercent: null,
      lostPercent: null,
      playerCoverage: {},
      idSwitchCount: null,
      manualCorrectionCount: null,
      manualCorrections: null,
      detectionCoverage: null,
      lostTimePercent: null,
      confidence: null,
    };
  }

  // 2. Tally frame counts per player and frame-level simultaneous observation
  interface PlayerTally {
    observed: number;
    predicted: number;
    lost: number;
    confidenceSum: number;
    confidenceCount: number;
  }
  const tallies = new Map<string, PlayerTally>();
  for (const pId of expectedPlayerIds) {
    tallies.set(pId, { observed: 0, predicted: 0, lost: 0, confidenceSum: 0, confidenceCount: 0 });
  }

  let fullyObservedFrameCount = 0;
  let partiallyObservedFrameCount = 0;
  let fullyLostFrameCount = 0;

  for (const f of frames) {
    let observedInFrame = 0;

    for (const pId of expectedPlayerIds) {
      const tally = tallies.get(pId)!;
      const p = f.players.find((x) => x.playerId === pId);
      if (!p || p.state === 'lost') {
        tally.lost++;
      } else if (p.state === 'predicted') {
        tally.predicted++;
      } else if (p.state === 'observed') {
        tally.observed++;
        observedInFrame++;
        if (typeof p.detectionConfidence === 'number') {
          tally.confidenceSum += p.detectionConfidence;
          tally.confidenceCount++;
        }
      } else {
        tally.lost++;
      }
    }

    if (expectedPlayerIds.length > 0) {
      if (observedInFrame === expectedPlayerIds.length) {
        fullyObservedFrameCount++;
      } else if (observedInFrame > 0) {
        partiallyObservedFrameCount++;
      } else {
        fullyLostFrameCount++;
      }
    }
  }

  // 3. Compute per-player metrics
  const playerCoverage: Record<string, PlayerTrackingQuality> = {};
  let totalObservedConfidenceSum = 0;
  let totalObservedConfidenceCount = 0;
  let totalCoverageSum = 0;
  let totalPredictedCount = 0;
  let totalLostCount = 0;

  const totalEligibleSessionFrames = frames.length;

  for (const pId of expectedPlayerIds) {
    const tally = tallies.get(pId)!;
    const eligibleFrames = totalEligibleSessionFrames;
    const detectionCoverage = eligibleFrames > 0 ? Number((tally.observed / eligibleFrames).toFixed(2)) : 0;
    const predictedPercent = eligibleFrames > 0 ? Number(((tally.predicted / eligibleFrames) * 100).toFixed(1)) : 0;
    const lostPercent = eligibleFrames > 0 ? Number(((tally.lost / eligibleFrames) * 100).toFixed(1)) : 0;
    const meanObservedConfidence = tally.confidenceCount > 0
      ? Number((tally.confidenceSum / tally.confidenceCount).toFixed(2))
      : null;

    playerCoverage[pId] = {
      playerId: pId,
      observedFrameCount: tally.observed,
      predictedFrameCount: tally.predicted,
      lostFrameCount: tally.lost,
      detectionCoverage,
      predictedPercent,
      lostPercent,
      meanObservedConfidence,
      idSwitchCount: null,
      manualCorrectionCount: null,
    };

    totalCoverageSum += detectionCoverage;
    totalObservedConfidenceSum += tally.confidenceSum;
    totalObservedConfidenceCount += tally.confidenceCount;
    totalPredictedCount += tally.predicted;
    totalLostCount += tally.lost;
  }

  // 4. Session Multi-Target Aggregates
  const targetCount = expectedPlayerIds.length;
  const meanTargetCoverage = Number((totalCoverageSum / targetCount).toFixed(2));
  const simultaneousTargetCoverage = totalEligibleSessionFrames > 0
    ? Number((fullyObservedFrameCount / totalEligibleSessionFrames).toFixed(2))
    : null;

  const totalPlayerTargetSlots = targetCount * totalEligibleSessionFrames;
  const sessionPredictedPercent = totalPlayerTargetSlots > 0 ? Number(((totalPredictedCount / totalPlayerTargetSlots) * 100).toFixed(1)) : 0;
  const sessionLostPercent = totalPlayerTargetSlots > 0 ? Number(((totalLostCount / totalPlayerTargetSlots) * 100).toFixed(1)) : 0;

  const meanConfidence = totalObservedConfidenceCount > 0
    ? Number((totalObservedConfidenceSum / totalObservedConfidenceCount).toFixed(2))
    : null;
  const lowConfidenceWarning = meanTargetCoverage < 0.5 || (meanConfidence !== null && meanConfidence < 0.6);

  return {
    meanTargetCoverage,
    simultaneousTargetCoverage,
    fullyObservedFrameCount,
    partiallyObservedFrameCount,
    fullyLostFrameCount,
    predictedPercent: sessionPredictedPercent,
    lostPercent: sessionLostPercent,
    playerCoverage,
    idSwitchCount: null,
    manualCorrectionCount: null,
    manualCorrections: null,
    detectionCoverage: meanTargetCoverage,
    lostTimePercent: Number(Math.max(0, (1 - meanTargetCoverage) * 100).toFixed(1)),
    confidence: meanConfidence,
    lowConfidenceWarning,
  };
}

interface StreamingPlayerMovement {
  previous: TrackingSample | null;
  trackedCount: number;
  sumX: number;
  sumY: number;
  frontCount: number;
  midCount: number;
  rearCount: number;
  leftCount: number;
  rightCount: number;
  totalDistance: number;
  lateralDistance: number;
  frontBackDistance: number;
  speedCount: number;
  speedSum: number;
  maxSpeed: number;
  speedHistogram: number[];
  dispersionSum: number;
}

function createStreamingPlayerMovement(): StreamingPlayerMovement {
  return {
    previous: null,
    trackedCount: 0,
    sumX: 0,
    sumY: 0,
    frontCount: 0,
    midCount: 0,
    rearCount: 0,
    leftCount: 0,
    rightCount: 0,
    totalDistance: 0,
    lateralDistance: 0,
    frontBackDistance: 0,
    speedCount: 0,
    speedSum: 0,
    maxSpeed: 0,
    speedHistogram: new Array<number>(1201).fill(0),
    dispersionSum: 0,
  };
}

function sampleIsInRequestedWindow(sample: TrackingSample, options: TrackingMovementMetricsOptions): boolean {
  return (options.startTime === undefined || sample.timestamp >= options.startTime) &&
    (options.endTime === undefined || sample.timestamp <= options.endTime) &&
    (options.playerId === undefined || sample.playerId === options.playerId);
}

async function forEachTrackingSample(
  analysisId: string,
  options: TrackingMovementMetricsOptions,
  visit: (sample: TrackingSample) => void,
): Promise<void> {
  let afterChunkIndex = -1;
  while (true) {
    if (options.signal?.aborted) throw new Error('Movement metric aggregation was cancelled');
    const chunks = await getTrackingSampleChunks(analysisId, afterChunkIndex, MAX_TRACKING_PAGE_SIZE);
    if (chunks.length === 0) return;
    let pastEndTime = false;
    for (const chunk of chunks) {
      if (options.endTime !== undefined && chunk.startTime > options.endTime) {
        pastEndTime = true;
        break;
      }
      if (options.startTime !== undefined && chunk.endTime < options.startTime) continue;
      for (const sample of chunk.samples) {
        if (sampleIsInRequestedWindow(sample, options)) visit(sample);
      }
    }
    if (pastEndTime) return;
    afterChunkIndex = chunks[chunks.length - 1].chunkIndex;
    if (chunks.length < MAX_TRACKING_PAGE_SIZE) return;
  }
}

function percentile95FromHistogram(histogram: number[], count: number): number {
  if (count === 0) return 0;
  const target = Math.floor(count * 0.95);
  let accumulated = 0;
  for (let bin = 0; bin < histogram.length; bin += 1) {
    accumulated += histogram[bin];
    if (accumulated > target) return Number((bin / 100).toFixed(2));
  }
  return 0;
}

function roundedPercent(count: number, denominator: number, digits: number): number {
  return denominator > 0 ? Number(((count / denominator) * 100).toFixed(digits)) : 0;
}

/**
 * Computes complete movement metrics from bounded chunk pages. Two cursor passes keep
 * percentile/dispersion semantics while retaining only per-player aggregates.
 */
export async function getTrackingMovementMetrics(
  analysisId: string,
  options: TrackingMovementMetricsOptions = {},
): Promise<TrackingMovementMetricsResult> {
  const byPlayer = new Map<string, StreamingPlayerMovement>();
  let sampleCount = 0;
  let trackedSampleCount = 0;
  let predictedSampleCount = 0;
  let uniqueTimestampCount = 0;
  let previousTimestamp: number | null = null;

  await forEachTrackingSample(analysisId, options, (sample) => {
    sampleCount += 1;
    if (sample.trackingState === 'predicted') predictedSampleCount += 1;
    if (sample.timestamp !== previousTimestamp) uniqueTimestampCount += 1;
    previousTimestamp = sample.timestamp;

    let movement = byPlayer.get(sample.playerId);
    if (!movement) {
      movement = createStreamingPlayerMovement();
      byPlayer.set(sample.playerId, movement);
    }
    const previous = movement.previous;
    if (sample.trackingState === 'tracked') {
      trackedSampleCount += 1;
      movement.trackedCount += 1;
      movement.sumX += sample.courtX;
      movement.sumY += sample.courtY;
      const distanceToNet = Math.abs(6.7 - sample.courtY);
      if (distanceToNet <= 2.2) movement.frontCount += 1;
      else if (distanceToNet <= 4.4) movement.midCount += 1;
      else movement.rearCount += 1;
      if (sample.courtX < 3.05) movement.leftCount += 1;
      else movement.rightCount += 1;

      if (previous?.trackingState === 'tracked' &&
        (sample.metricRunId === undefined || previous.metricRunId === undefined || sample.metricRunId === previous.metricRunId) &&
        (sample.calibrationId === undefined || previous.calibrationId === undefined || sample.calibrationId === previous.calibrationId) &&
        (sample.cameraSegmentId === undefined || previous.cameraSegmentId === undefined || sample.cameraSegmentId === previous.cameraSegmentId)) {
        const dx = sample.courtX - previous.courtX;
        const dy = sample.courtY - previous.courtY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const speed = distance / Math.max(0.001, sample.timestamp - previous.timestamp);
        if (speed <= 12.0) {
          movement.totalDistance += distance;
          movement.lateralDistance += Math.abs(dx);
          movement.frontBackDistance += Math.abs(dy);
          movement.speedCount += 1;
          movement.speedSum += speed;
          movement.maxSpeed = Math.max(movement.maxSpeed, speed);
          movement.speedHistogram[Math.max(0, Math.min(1200, Math.round(speed * 100)))] += 1;
        }
      }
    }
    movement.previous = sample;
  });

  const selected = options.playerId ? [byPlayer.get(options.playerId)].filter(
    (movement): movement is StreamingPlayerMovement => movement !== undefined,
  ) : Array.from(byPlayer.values());
  const trackedCount = selected.reduce((sum, movement) => sum + movement.trackedCount, 0);
  const sumX = selected.reduce((sum, movement) => sum + movement.sumX, 0);
  const sumY = selected.reduce((sum, movement) => sum + movement.sumY, 0);
  const avgX = trackedCount > 0 ? sumX / trackedCount : null;
  const avgY = trackedCount > 0 ? sumY / trackedCount : null;

  if (trackedCount > 0 && avgX !== null && avgY !== null) {
    await forEachTrackingSample(analysisId, options, (sample) => {
      if (sample.trackingState !== 'tracked') return;
      const movement = byPlayer.get(sample.playerId);
      if (!movement) return;
      const targetX = options.playerId ? avgX : avgX;
      const targetY = options.playerId ? avgY : avgY;
      const dx = sample.courtX - targetX;
      const dy = sample.courtY - targetY;
      movement.dispersionSum += Math.sqrt(dx * dx + dy * dy);
    });
  }

  const speedCount = selected.reduce((sum, movement) => sum + movement.speedCount, 0);
  const speedSum = selected.reduce((sum, movement) => sum + movement.speedSum, 0);
  const maxSpeed = selected.reduce((max, movement) => Math.max(max, movement.maxSpeed), 0);
  const speedHistogram = new Array<number>(1201).fill(0);
  for (const movement of selected) {
    for (let bin = 0; bin < speedHistogram.length; bin += 1) speedHistogram[bin] += movement.speedHistogram[bin];
  }
  const sumCount = Math.max(1, trackedCount);
  const totalDistance = options.playerId
    ? (selected[0]?.totalDistance ?? 0)
    : selected.reduce((sum, movement) => sum + Number(movement.totalDistance.toFixed(2)), 0);
  const dispersion = selected.reduce((sum, movement) => sum + movement.dispersionSum, 0);

  return {
    sampleCount,
    trackedSampleCount,
    predictedSampleCount,
    uniqueTimestampCount,
    metrics: {
      totalDistanceMeters: Number(totalDistance.toFixed(2)),
      avgSpeedMps: Number((speedCount ? speedSum / speedCount : 0).toFixed(2)),
      p95SpeedMps: percentile95FromHistogram(speedHistogram, speedCount),
      maxSpeedMps: Number(maxSpeed.toFixed(2)),
      courtCoverage: {
        frontPercent: roundedPercent(selected.reduce((sum, movement) => sum + movement.frontCount, 0), sumCount, 1),
        midPercent: roundedPercent(selected.reduce((sum, movement) => sum + movement.midCount, 0), sumCount, 1),
        rearPercent: roundedPercent(selected.reduce((sum, movement) => sum + movement.rearCount, 0), sumCount, 1),
        leftPercent: roundedPercent(selected.reduce((sum, movement) => sum + movement.leftCount, 0), sumCount, 1),
        rightPercent: roundedPercent(selected.reduce((sum, movement) => sum + movement.rightCount, 0), sumCount, 1),
      },
      basePosition: {
        avgCourtX: avgX !== null ? Number(avgX.toFixed(2)) : null,
        avgCourtY: avgY !== null ? Number(avgY.toFixed(2)) : null,
        dispersion: trackedCount ? Number((dispersion / trackedCount).toFixed(2)) : 0,
      },
      lateralMovementMeters: Number(selected.reduce((sum, movement) => sum + movement.lateralDistance, 0).toFixed(2)),
      frontBackMovementMeters: Number(selected.reduce((sum, movement) => sum + movement.frontBackDistance, 0).toFixed(2)),
    },
  };
}
