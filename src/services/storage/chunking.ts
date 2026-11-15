import type { TrackingTelemetryV1 } from '../../types';
import { isMetricCalibrationValid } from '../../types/calibration';
import {
  observationStateForSample,
  type PlayerMovementMetrics,
  type TrackingCalibrationEvent,
  type TrackingImageObservation,
  type TrackingImagePlayerObservation,
  type TrackingQuality,
  type TrackingSample,
  type TrackingSampleChunk,
  type TrackingSummary,
} from './types';
import { computePlayerMovementMetrics, computeTrackingQuality } from './analytics';

/**
 * Downsamples frames to targetHz (e.g. 10 Hz) and partitions them into chunks (e.g. 15 seconds each)
 */
export function downsampleAndChunkTrackingSamples(
  analysisId: string,
  frames: TrackingTelemetryV1[],
  targetHz = 10,
  chunkDurationSec = 15,
  canonicalPlayerMetrics?: Record<string, { totalDistanceM?: number }>
): {
  chunks: TrackingSampleChunk[];
  summary: TrackingSummary;
  quality: TrackingQuality;
  calibrationTimeline: TrackingCalibrationEvent[];
  imageObservations: TrackingImageObservation[];
} {
  if (frames.length === 0) {
    return {
      chunks: [],
      summary: { durationSeconds: 0, sampleCount: 0, players: {} },
      quality: computeTrackingQuality([], canonicalPlayerMetrics ? Object.keys(canonicalPlayerMetrics) : undefined),
      calibrationTimeline: [],
      imageObservations: [],
    };
  }

  const calibrationTimeline: TrackingCalibrationEvent[] = [];
  let priorCalibrationKey: string | null = null;
  let metricRunId = 0;
  const runIds = new Map<TrackingTelemetryV1, number>();
  for (const frame of frames) {
    if (frame.calibrationState !== undefined) {
      const key = `${frame.cameraSegmentId ?? ''}:${frame.calibrationId ?? ''}:${frame.calibrationState}`;
      if (key !== priorCalibrationKey) {
        calibrationTimeline.push({
          frameIndex: frame.frameIndex,
          timestampSec: frame.timestampSec,
          cameraSegmentId: frame.cameraSegmentId,
          calibrationId: frame.calibrationId,
          state: frame.calibrationState,
          provenance: frame.calibration ?? null,
        });
      }
      if (!isMetricCalibrationValid(frame) || (priorCalibrationKey !== null && key !== priorCalibrationKey)) {
        metricRunId++;
      }
      priorCalibrationKey = key;
    }
    runIds.set(frame, metricRunId);
  }

  // 1. Full-Rate Processing for Canonical Movement Metrics
  const fullRatePlayerSamples = new Map<string, TrackingSample[]>();
  const lastTotalDistances = new Map<string, number>();
  const imageObservations: TrackingImageObservation[] = [];
  let lastImageObservationTimestamp = -1;
  const imageObservationInterval = 1 / targetHz;

  for (const frame of frames) {
    if (lastImageObservationTimestamp < 0 ||
        frame.timestampSec - lastImageObservationTimestamp >= imageObservationInterval * 0.95) {
      const metricValid = isMetricCalibrationValid(frame) && frame.canUseCourtMetric !== false;
      imageObservations.push({
        frameIndex: frame.frameIndex,
        timestampSec: frame.timestampSec,
        cameraSegmentId: frame.cameraSegmentId,
        calibrationId: frame.calibrationId,
        calibrationState: frame.calibrationState,
        players: frame.players.map(player => {
          const observation: TrackingImagePlayerObservation = {
            playerId: player.playerId,
            state: player.state,
            bboxPct: player.bboxPct,
            groundPointPct: player.groundPointPct,
            groundPointProvenance: player.groundPointProvenance,
            groundPositionM: player.groundPositionM,
            leftFootPx: player.leftFootPx,
            rightFootPx: player.rightFootPx,
            leftFootConfidence: player.leftFootConfidence,
            rightFootConfidence: player.rightFootConfidence,
            leftFootCourtM: player.leftFootCourtM,
            rightFootCourtM: player.rightFootCourtM,
            leftFoot: player.leftFoot,
            rightFoot: player.rightFoot,
          };
          return metricValid ? observation : {
            ...observation,
            groundPositionM: null,
            leftFootCourtM: null,
            rightFootCourtM: null,
            leftFoot: observation.leftFoot ? { ...observation.leftFoot, courtPositionM: null } : observation.leftFoot,
            rightFoot: observation.rightFoot ? { ...observation.rightFoot, courtPositionM: null } : observation.rightFoot,
          };
        }),
      });
      lastImageObservationTimestamp = frame.timestampSec;
    }

    if (!isMetricCalibrationValid(frame) || frame.canUseCourtMetric === false) continue;
    for (const p of frame.players) {
      if (typeof p.totalDistanceM === 'number') {
        lastTotalDistances.set(p.playerId, p.totalDistanceM);
      }
      if (
        !p.courtPosition ||
        p.courtPosition.xM == null ||
        p.courtPosition.yM == null ||
        !Number.isFinite(p.courtPosition.xM) ||
        !Number.isFinite(p.courtPosition.yM) ||
        (p.courtPosition.xM === 0 && p.courtPosition.yM === 0)
      ) {
        continue;
      }

      const sample: TrackingSample = {
        timestamp: frame.timestampSec,
        playerId: p.playerId,
        courtX: Number(p.courtPosition.xM.toFixed(2)),
        courtY: Number(p.courtPosition.yM.toFixed(2)),
        speed: typeof p.speedMps === 'number' ? Number(p.speedMps.toFixed(2)) : null,
        confidence: typeof p.detectionConfidence === 'number' ? Number(p.detectionConfidence.toFixed(2)) : null,
        trackingState: p.state === 'lost' ? 'lost' : p.state === 'predicted' ? 'predicted' : 'tracked',
        observationState: observationStateForSample(p),
        groundPointProvenance: p.state === 'lost' ? null : (p.groundPointProvenance ?? null),
        cameraSegmentId: frame.cameraSegmentId,
        calibrationId: frame.calibrationId,
        metricRunId: runIds.get(frame),
        normalizedX: Number((p.courtPosition.xPct / 100).toFixed(3)),
        normalizedY: Number((p.courtPosition.yPct / 100).toFixed(3)),
        canBuildHeatmap: frame.canBuildHeatmap !== false,
        canUseCourtMetric: true,
      };

      if (!fullRatePlayerSamples.has(p.playerId)) {
        fullRatePlayerSamples.set(p.playerId, []);
      }
      fullRatePlayerSamples.get(p.playerId)!.push(sample);
    }
  }

  // 2. Downsample to targetHz for Chunks & Storage Persistence
  const sampleInterval = 1 / targetHz;
  const downsampledSamples: TrackingSample[] = [];
  let lastTimestamp = -1;

  for (const frame of frames) {
    if (!isMetricCalibrationValid(frame) || frame.canUseCourtMetric === false) continue;
    if (lastTimestamp >= 0 && frame.timestampSec - lastTimestamp < sampleInterval * 0.95) {
      continue;
    }
    lastTimestamp = frame.timestampSec;

    for (const p of frame.players) {
      if (
        !p.courtPosition ||
        p.courtPosition.xM == null ||
        p.courtPosition.yM == null ||
        !Number.isFinite(p.courtPosition.xM) ||
        !Number.isFinite(p.courtPosition.yM) ||
        (p.courtPosition.xM === 0 && p.courtPosition.yM === 0)
      ) {
        continue;
      }
      const sample: TrackingSample = {
        timestamp: frame.timestampSec,
        playerId: p.playerId,
        courtX: Number(p.courtPosition.xM.toFixed(2)),
        courtY: Number(p.courtPosition.yM.toFixed(2)),
        speed: typeof p.speedMps === 'number' ? Number(p.speedMps.toFixed(2)) : null,
        confidence: typeof p.detectionConfidence === 'number' ? Number(p.detectionConfidence.toFixed(2)) : null,
        trackingState: p.state === 'lost' ? 'lost' : p.state === 'predicted' ? 'predicted' : 'tracked',
        observationState: observationStateForSample(p),
        groundPointProvenance: p.state === 'lost' ? null : (p.groundPointProvenance ?? null),
        cameraSegmentId: frame.cameraSegmentId,
        calibrationId: frame.calibrationId,
        metricRunId: runIds.get(frame),
        normalizedX: Number((p.courtPosition.xPct / 100).toFixed(3)),
        normalizedY: Number((p.courtPosition.yPct / 100).toFixed(3)),
        canBuildHeatmap: frame.canBuildHeatmap !== false,
        canUseCourtMetric: true,
      };
      downsampledSamples.push(sample);
    }
  }

  // 3. Compute Quality (Separates per-athlete quality from session-level multi-target quality)
  const durationSec = frames.length > 1 ? frames[frames.length - 1].timestampSec - frames[0].timestampSec : 0;
  const canonicalPlayerIds = canonicalPlayerMetrics ? Object.keys(canonicalPlayerMetrics) : undefined;
  const quality = computeTrackingQuality(frames, canonicalPlayerIds);

  // 4. Compute Player Summaries from Full-Rate Telemetry (preserving all high-frequency motion)
  const playerSummaries: Record<string, PlayerMovementMetrics> = {};
  for (const [pId, pSamples] of fullRatePlayerSamples.entries()) {
    const canonicalDist = canonicalPlayerMetrics?.[pId]?.totalDistanceM ?? lastTotalDistances.get(pId);
    playerSummaries[pId] = computePlayerMovementMetrics(pSamples, canonicalDist);
  }

  if (canonicalPlayerMetrics) {
    for (const [pId, m] of Object.entries(canonicalPlayerMetrics)) {
      if (!playerSummaries[pId] && m.totalDistanceM !== undefined) {
        playerSummaries[pId] = computePlayerMovementMetrics([], m.totalDistanceM);
      }
    }
  }

  const summary: TrackingSummary = {
    durationSeconds: Number(Math.max(0, durationSec).toFixed(2)),
    sampleCount: downsampledSamples.length,
    players: playerSummaries,
  };

  // 4. Partition into Chunks
  const chunks: TrackingSampleChunk[] = [];
  if (downsampledSamples.length > 0) {
    let chunkIndex = 0;
    let chunkStart = downsampledSamples[0].timestamp;
    let currentChunkSamples: TrackingSample[] = [];

    for (const sample of downsampledSamples) {
      if (sample.timestamp - chunkStart >= chunkDurationSec && currentChunkSamples.length > 0) {
        chunks.push({
          id: `${analysisId}:${chunkIndex}`,
          analysisId,
          chunkIndex,
          startTime: Number(chunkStart.toFixed(2)),
          endTime: Number(sample.timestamp.toFixed(2)),
          samples: currentChunkSamples,
        });
        chunkIndex++;
        chunkStart = sample.timestamp;
        currentChunkSamples = [];
      }
      currentChunkSamples.push(sample);
    }

    if (currentChunkSamples.length > 0) {
      const lastSample = currentChunkSamples[currentChunkSamples.length - 1];
      chunks.push({
        id: `${analysisId}:${chunkIndex}`,
        analysisId,
        chunkIndex,
        startTime: Number(chunkStart.toFixed(2)),
        endTime: Number(lastSample.timestamp.toFixed(2)),
        samples: currentChunkSamples,
      });
    }
  }

  return { chunks, summary, quality, calibrationTimeline, imageObservations };
}
