import type { TrackingTelemetryV1 } from '../../types';
import { isMetricCalibrationValid } from '../../types/calibration';
import {
  observationStateForSample,
  type PlayerMovementMetrics,
  type PlayerTrackingQuality,
  type TrackingCalibrationEvent,
  type TrackingQuality,
  type TrackingSample,
  type TrackingSampleChunk,
  type TrackingSummary,
} from './types';
import { computeTrackingQuality } from './analytics';

interface StreamingPlayerSummary {
  totalDistanceM: number;
  lastCanonicalDistanceM?: number;
  avgSpeedSum: number;
  speedCount: number;
  speedHistogram: number[];
  maxSpeedMps: number;
  trackedCount: number;
  sumX: number;
  sumY: number;
  dispersionSum: number;
  frontCount: number;
  midCount: number;
  rearCount: number;
  leftCount: number;
  rightCount: number;
  lateralMovementM: number;
  frontBackMovementM: number;
  previousSample?: TrackingSample;
}

interface StreamingQualityTally {
  observed: number;
  predicted: number;
  lost: number;
  confidenceSum: number;
  confidenceCount: number;
}

function streamingSample(
  frame: TrackingTelemetryV1,
  player: TrackingTelemetryV1['players'][number],
  metricRunId: number,
): TrackingSample | null {
  const position = player.courtPosition;
  if (
    !position || position.xM == null || position.yM == null ||
    !Number.isFinite(position.xM) || !Number.isFinite(position.yM) ||
    (position.xM === 0 && position.yM === 0)
  ) return null;
  return {
    timestamp: frame.timestampSec,
    playerId: player.playerId,
    courtX: Number(position.xM.toFixed(2)),
    courtY: Number(position.yM.toFixed(2)),
    speed: typeof player.speedMps === 'number' ? Number(player.speedMps.toFixed(2)) : null,
    confidence: typeof player.detectionConfidence === 'number' ? Number(player.detectionConfidence.toFixed(2)) : null,
    trackingState: player.state === 'lost' ? 'lost' : player.state === 'predicted' ? 'predicted' : 'tracked',
    observationState: observationStateForSample(player),
    groundPointProvenance: player.state === 'lost' ? null : (player.groundPointProvenance ?? null),
    cameraSegmentId: frame.cameraSegmentId,
    calibrationId: frame.calibrationId,
    metricRunId,
    normalizedX: Number((position.xPct / 100).toFixed(3)),
    normalizedY: Number((position.yPct / 100).toFixed(3)),
    canBuildHeatmap: frame.canBuildHeatmap !== false,
    canUseCourtMetric: true,
  };
}

/** Streaming equivalent of downsampleAndChunkTrackingSamples with fixed-size accumulators. */
export class TrackingAnalysisStreamBuilder {
  private readonly analysisId: string;
  private readonly targetHz: number;
  private readonly chunkDurationSec: number;
  private readonly playerIds: string[];
  private readonly playerSummaries = new Map<string, StreamingPlayerSummary>();
  private readonly qualityTallies = new Map<string, StreamingQualityTally>();
  private readonly calibrationTimeline: TrackingCalibrationEvent[] = [];
  private priorCalibrationKey: string | null = null;
  private metricRunId = 0;
  private dispersionPriorCalibrationKey: string | null = null;
  private dispersionMetricRunId = 0;
  private lastDownsampledTimestamp = -1;
  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;
  private frameCount = 0;
  private sampleCount = 0;
  private uniqueStoredTimestampCount = 0;
  private qualityFullyObserved = 0;
  private qualityPartiallyObserved = 0;
  private qualityFullyLost = 0;
  private qualityPoseCount = 0;
  private qualityPlayerSlots = 0;
  private qualityConfidenceSum = 0;
  private qualityConfidenceCount = 0;
  private currentChunkIndex = 0;
  private currentChunkStart: number | null = null;
  private currentChunkSamples: TrackingSample[] = [];

  constructor(
    analysisId: string,
    playerIds: string[],
    targetHz = 10,
    chunkDurationSec = 15,
  ) {
    this.analysisId = analysisId;
    this.playerIds = [...new Set(playerIds)].sort();
    this.targetHz = Math.max(0.1, targetHz);
    this.chunkDurationSec = Math.max(1, chunkDurationSec);
    for (const playerId of this.playerIds) {
      this.qualityTallies.set(playerId, { observed: 0, predicted: 0, lost: 0, confidenceSum: 0, confidenceCount: 0 });
    }
  }

  setCanonicalPlayerMetrics(metrics: Record<string, { totalDistanceM?: number }>): void {
    for (const [playerId, value] of Object.entries(metrics)) {
      let aggregate = this.playerSummaries.get(playerId);
      const hasCanonicalDistance = typeof value.totalDistanceM === 'number' && Number.isFinite(value.totalDistanceM);
      if (!aggregate && hasCanonicalDistance) {
        aggregate = this.createPlayerSummary();
        this.playerSummaries.set(playerId, aggregate);
      }
      if (!this.qualityTallies.has(playerId)) {
        this.qualityTallies.set(playerId, { observed: 0, predicted: 0, lost: 0, confidenceSum: 0, confidenceCount: 0 });
        this.playerIds.push(playerId);
        this.playerIds.sort();
      }
      if (aggregate && hasCanonicalDistance) {
        aggregate.lastCanonicalDistanceM = value.totalDistanceM;
      }
    }
  }

  private createPlayerSummary(): StreamingPlayerSummary {
    return {
      totalDistanceM: 0,
      avgSpeedSum: 0,
      speedCount: 0,
      speedHistogram: new Array<number>(1201).fill(0),
      maxSpeedMps: 0,
      trackedCount: 0,
      sumX: 0,
      sumY: 0,
      dispersionSum: 0,
      frontCount: 0,
      midCount: 0,
      rearCount: 0,
      leftCount: 0,
      rightCount: 0,
      lateralMovementM: 0,
      frontBackMovementM: 0,
    };
  }

  private runIdFor(frame: TrackingTelemetryV1, dispersionPass = false): number {
    if (frame.calibrationState !== undefined) {
      const key = `${frame.cameraSegmentId ?? ''}:${frame.calibrationId ?? ''}:${frame.calibrationState}`;
      const prior = dispersionPass ? this.dispersionPriorCalibrationKey : this.priorCalibrationKey;
      let runId = dispersionPass ? this.dispersionMetricRunId : this.metricRunId;
      if (!isMetricCalibrationValid(frame) || (prior !== null && key !== prior)) runId++;
      if (dispersionPass) {
        this.dispersionPriorCalibrationKey = key;
        this.dispersionMetricRunId = runId;
      } else {
        if (key !== prior) {
          this.calibrationTimeline.push({
            frameIndex: frame.frameIndex,
            timestampSec: frame.timestampSec,
            cameraSegmentId: frame.cameraSegmentId,
            calibrationId: frame.calibrationId,
            state: frame.calibrationState,
            provenance: frame.calibration ?? null,
          });
        }
        this.priorCalibrationKey = key;
        this.metricRunId = runId;
      }
    }
    return dispersionPass ? this.dispersionMetricRunId : this.metricRunId;
  }

  private addQuality(frame: TrackingTelemetryV1): void {
    let observedInFrame = 0;
    const byId = new Map(frame.players.map((player) => [player.playerId, player]));
    for (const playerId of this.playerIds) {
      const player = byId.get(playerId);
      const tally = this.qualityTallies.get(playerId)!;
      if (!player || player.state === 'lost') {
        tally.lost++;
      } else if (player.state === 'predicted') {
        tally.predicted++;
      } else if (player.state === 'observed') {
        tally.observed++;
        observedInFrame++;
        if (typeof player.detectionConfidence === 'number') {
          tally.confidenceSum += player.detectionConfidence;
          tally.confidenceCount++;
          this.qualityConfidenceSum += player.detectionConfidence;
          this.qualityConfidenceCount++;
        }
      } else {
        tally.lost++;
      }
    }
    if (observedInFrame === this.playerIds.length) this.qualityFullyObserved++;
    else if (observedInFrame > 0) this.qualityPartiallyObserved++;
    else this.qualityFullyLost++;
    this.qualityPlayerSlots += this.playerIds.length;
    for (const player of frame.players) {
      if (player.pose && !player.pose.isReused) this.qualityPoseCount++;
    }
  }

  private appendDownsampled(sample: TrackingSample): TrackingSampleChunk[] {
    const ready: TrackingSampleChunk[] = [];
    if (this.currentChunkStart === null) this.currentChunkStart = sample.timestamp;
    if (sample.timestamp - this.currentChunkStart >= this.chunkDurationSec && this.currentChunkSamples.length > 0) {
      ready.push({
        id: `${this.analysisId}:${this.currentChunkIndex}`,
        analysisId: this.analysisId,
        chunkIndex: this.currentChunkIndex,
        startTime: Number(this.currentChunkStart.toFixed(2)),
        endTime: Number(sample.timestamp.toFixed(2)),
        samples: this.currentChunkSamples,
      });
      this.currentChunkIndex++;
      this.currentChunkStart = sample.timestamp;
      this.currentChunkSamples = [];
    }
    this.currentChunkSamples.push(sample);
    return ready;
  }

  addFrames(frames: TrackingTelemetryV1[]): TrackingSampleChunk[] {
    const ready: TrackingSampleChunk[] = [];
    const sampleInterval = 1 / this.targetHz;
    for (const frame of frames) {
      if (this.firstTimestamp === null) this.firstTimestamp = frame.timestampSec;
      this.lastTimestamp = frame.timestampSec;
      this.frameCount++;
      this.addQuality(frame);
      const runId = this.runIdFor(frame);
      const validMetricFrame = isMetricCalibrationValid(frame) && frame.canUseCourtMetric !== false;
      if (!validMetricFrame) continue;

      for (const player of frame.players) {
        let aggregate = this.playerSummaries.get(player.playerId);
        const sample = streamingSample(frame, player, runId);
        if (!sample) continue;
        if (!aggregate) {
          aggregate = this.createPlayerSummary();
          this.playerSummaries.set(player.playerId, aggregate);
        }
        if (aggregate && typeof player.totalDistanceM === 'number' && Number.isFinite(player.totalDistanceM)) {
          aggregate.lastCanonicalDistanceM = player.totalDistanceM;
        }
        const previous = aggregate.previousSample;
        if (sample.trackingState === 'tracked') {
          aggregate.trackedCount++;
          aggregate.sumX += sample.courtX;
          aggregate.sumY += sample.courtY;
          const distanceToNet = Math.abs(6.7 - sample.courtY);
          if (distanceToNet <= 2.2) aggregate.frontCount++;
          else if (distanceToNet <= 4.4) aggregate.midCount++;
          else aggregate.rearCount++;
          if (sample.courtX < 3.05) aggregate.leftCount++;
          else aggregate.rightCount++;
          if (
            previous?.trackingState === 'tracked' &&
            previous.metricRunId === sample.metricRunId &&
            previous.calibrationId === sample.calibrationId &&
            previous.cameraSegmentId === sample.cameraSegmentId
          ) {
            const dx = sample.courtX - previous.courtX;
            const dy = sample.courtY - previous.courtY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const deltaSec = Math.max(0.001, sample.timestamp - previous.timestamp);
            const speed = distance / deltaSec;
            if (speed <= 12.0) {
              aggregate.totalDistanceM += distance;
              aggregate.lateralMovementM += Math.abs(dx);
              aggregate.frontBackMovementM += Math.abs(dy);
              aggregate.avgSpeedSum += speed;
              aggregate.speedCount++;
              const bin = Math.max(0, Math.min(1200, Math.round(speed * 100)));
              aggregate.speedHistogram[bin]++;
              aggregate.maxSpeedMps = Math.max(aggregate.maxSpeedMps, speed);
            }
          }
        }
        aggregate.previousSample = sample;
      }

      if (frame.timestampSec - this.lastDownsampledTimestamp < sampleInterval * 0.95) continue;
      this.lastDownsampledTimestamp = frame.timestampSec;
      let emittedAtTimestamp = false;
      for (const player of frame.players) {
        const sample = streamingSample(frame, player, runId);
        if (!sample) continue;
        this.sampleCount++;
        emittedAtTimestamp = true;
        ready.push(...this.appendDownsampled(sample));
      }
      if (emittedAtTimestamp) this.uniqueStoredTimestampCount++;
    }
    return ready;
  }

  addDispersionFrames(frames: TrackingTelemetryV1[]): void {
    for (const frame of frames) {
      const runId = this.runIdFor(frame, true);
      if (!isMetricCalibrationValid(frame) || frame.canUseCourtMetric === false) continue;
      for (const player of frame.players) {
        const sample = streamingSample(frame, player, runId);
        const aggregate = sample ? this.playerSummaries.get(sample.playerId) : undefined;
        if (!sample || !aggregate || sample.trackingState !== 'tracked' || aggregate.trackedCount === 0) continue;
        const avgX = aggregate.sumX / aggregate.trackedCount;
        const avgY = aggregate.sumY / aggregate.trackedCount;
        const dx = sample.courtX - avgX;
        const dy = sample.courtY - avgY;
        aggregate.dispersionSum += Math.sqrt(dx * dx + dy * dy);
      }
    }
  }

  finishChunks(): TrackingSampleChunk[] {
    if (!this.currentChunkSamples.length || this.currentChunkStart === null) return [];
    const samples = this.currentChunkSamples;
    const first = this.currentChunkStart;
    const index = this.currentChunkIndex;
    this.currentChunkSamples = [];
    this.currentChunkStart = null;
    return [{
      id: `${this.analysisId}:${index}`,
      analysisId: this.analysisId,
      chunkIndex: index,
      startTime: Number(first.toFixed(2)),
      endTime: Number(samples[samples.length - 1].timestamp.toFixed(2)),
      samples,
    }];
  }

  finish(): {
    summary: TrackingSummary;
    quality: TrackingQuality;
    calibrationTimeline: TrackingCalibrationEvent[];
    uniqueStoredTimestampCount: number;
  } {
    const players: Record<string, PlayerMovementMetrics> = {};
    for (const playerId of this.playerIds) {
      const aggregate = this.playerSummaries.get(playerId);
      if (!aggregate) continue;
      let p95Speed = 0;
      if (aggregate.speedCount > 0) {
        const target = Math.floor(aggregate.speedCount * 0.95);
        let accumulated = 0;
        for (let bin = 0; bin < aggregate.speedHistogram.length; bin++) {
          accumulated += aggregate.speedHistogram[bin];
          if (accumulated > target) {
            p95Speed = Number((bin / 100).toFixed(2));
            break;
          }
        }
      }
      const count = aggregate.trackedCount;
      const denominator = Math.max(1, count);
      players[playerId] = {
        totalDistanceMeters: Number((aggregate.lastCanonicalDistanceM ?? aggregate.totalDistanceM).toFixed(2)),
        avgSpeedMps: Number((aggregate.speedCount ? aggregate.avgSpeedSum / aggregate.speedCount : 0).toFixed(2)),
        p95SpeedMps: p95Speed,
        maxSpeedMps: Number(aggregate.maxSpeedMps.toFixed(2)),
        courtCoverage: {
          frontPercent: Number(((aggregate.frontCount / denominator) * 100).toFixed(1)),
          midPercent: Number(((aggregate.midCount / denominator) * 100).toFixed(1)),
          rearPercent: Number(((aggregate.rearCount / denominator) * 100).toFixed(1)),
          leftPercent: Number(((aggregate.leftCount / denominator) * 100).toFixed(1)),
          rightPercent: Number(((aggregate.rightCount / denominator) * 100).toFixed(1)),
        },
        basePosition: {
          avgCourtX: count ? Number((aggregate.sumX / count).toFixed(2)) : null,
          avgCourtY: count ? Number((aggregate.sumY / count).toFixed(2)) : null,
          dispersion: count ? Number((aggregate.dispersionSum / count).toFixed(2)) : 0,
        },
        lateralMovementMeters: Number(aggregate.lateralMovementM.toFixed(2)),
        frontBackMovementMeters: Number(aggregate.frontBackMovementM.toFixed(2)),
      };
    }

    if (this.frameCount === 0) {
      return {
        summary: { durationSeconds: 0, sampleCount: 0, players: {} },
        quality: computeTrackingQuality([], this.playerIds),
        calibrationTimeline: [],
        uniqueStoredTimestampCount: 0,
      };
    }

    const playerCoverage: Record<string, PlayerTrackingQuality> = {};
    let totalCoverage = 0;
    let totalPredicted = 0;
    let totalLost = 0;
    for (const playerId of this.playerIds) {
      const tally = this.qualityTallies.get(playerId)!;
      const coverage = Number((tally.observed / this.frameCount).toFixed(2));
      const predictedPercent = Number(((tally.predicted / this.frameCount) * 100).toFixed(1));
      const lostPercent = Number(((tally.lost / this.frameCount) * 100).toFixed(1));
      playerCoverage[playerId] = {
        playerId,
        observedFrameCount: tally.observed,
        predictedFrameCount: tally.predicted,
        lostFrameCount: tally.lost,
        detectionCoverage: coverage,
        predictedPercent,
        lostPercent,
        meanObservedConfidence: tally.confidenceCount ? Number((tally.confidenceSum / tally.confidenceCount).toFixed(2)) : null,
        idSwitchCount: null,
        manualCorrectionCount: null,
      };
      totalCoverage += coverage;
      totalPredicted += tally.predicted;
      totalLost += tally.lost;
    }
    const targetCount = this.playerIds.length;
    const meanTargetCoverage = targetCount ? Number((totalCoverage / targetCount).toFixed(2)) : null;
    const quality: TrackingQuality = {
      meanTargetCoverage,
      simultaneousTargetCoverage: this.frameCount ? Number((this.qualityFullyObserved / this.frameCount).toFixed(2)) : null,
      fullyObservedFrameCount: this.qualityFullyObserved,
      partiallyObservedFrameCount: this.qualityPartiallyObserved,
      fullyLostFrameCount: this.qualityFullyLost,
      predictedPercent: this.qualityPlayerSlots ? Number(((totalPredicted / this.qualityPlayerSlots) * 100).toFixed(1)) : null,
      lostPercent: this.qualityPlayerSlots ? Number(((totalLost / this.qualityPlayerSlots) * 100).toFixed(1)) : null,
      playerCoverage,
      idSwitchCount: null,
      manualCorrectionCount: null,
      manualCorrections: null,
      detectionCoverage: meanTargetCoverage,
      lostTimePercent: meanTargetCoverage === null ? null : Number(Math.max(0, (1 - meanTargetCoverage) * 100).toFixed(1)),
      confidence: this.qualityConfidenceCount ? Number((this.qualityConfidenceSum / this.qualityConfidenceCount).toFixed(2)) : null,
      lowConfidenceWarning: meanTargetCoverage !== null && (meanTargetCoverage < 0.5 || (this.qualityConfidenceCount > 0 && this.qualityConfidenceSum / this.qualityConfidenceCount < 0.6)),
    };
    return {
      summary: {
        durationSeconds: Number(Math.max(0, (this.lastTimestamp ?? 0) - (this.firstTimestamp ?? 0)).toFixed(2)),
        sampleCount: this.sampleCount,
        players,
      },
      quality,
      calibrationTimeline: this.calibrationTimeline,
      uniqueStoredTimestampCount: this.uniqueStoredTimestampCount,
    };
  }
}
