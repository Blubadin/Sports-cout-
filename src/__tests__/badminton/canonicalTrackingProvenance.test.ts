import { describe, it, expect } from 'vitest';
import {
  computePlayerMovementMetrics,
  downsampleAndChunkTrackingSamples,
  getLatestTrackingAnalysis,
  type TrackingAnalysis,
  type TrackingSample,
} from '../../services/storage/trackingStorage';
import { toTrackingTelemetryV1 } from '../../services/aiTrackingService';
import type { TrackingTelemetryV1 } from '../../types';

describe('Phase 1: Canonical Tracking Data Provenance & Integrity', () => {
  it('preserves authoritative backend totalDistanceM in downsampling and summary metrics', () => {
    // Backend computed total distance = 42.75m
    const rawFrames: TrackingTelemetryV1[] = [
      {
        schemaVersion: 1,
        analysisId: 'test_session_1',
        timestampSec: 0.0,
        frameIndex: 0,
        players: [
          {
            playerId: 'P1',
            trackId: 10,
            state: 'observed',
            detectionConfidence: 0.92,
            courtPosition: { xM: 2.0, yM: 3.0, xPct: 32.8, yPct: 22.4 },
            totalDistanceM: 10.5,
          },
        ],
      },
      {
        schemaVersion: 1,
        analysisId: 'test_session_1',
        timestampSec: 1.0,
        frameIndex: 30,
        players: [
          {
            playerId: 'P1',
            trackId: 10,
            state: 'observed',
            detectionConfidence: 0.94,
            courtPosition: { xM: 2.5, yM: 4.0, xPct: 41.0, yPct: 29.8 },
            totalDistanceM: 42.75, // Canonical final distance from backend
          },
        ],
      },
    ];

    const result = downsampleAndChunkTrackingSamples('test_session_1', rawFrames, 10, 15);
    // Summary must preserve authoritative 42.75m, NOT recomputed Euclidean distance (which is ~1.12m)
    expect(result.summary.players['P1'].totalDistanceMeters).toBe(42.75);
  });

  it('honors canonicalPlayerMetrics when passed directly to downsampleAndChunkTrackingSamples', () => {
    const rawFrames: TrackingTelemetryV1[] = [
      {
        schemaVersion: 1,
        analysisId: 'test_session_2',
        timestampSec: 0.0,
        frameIndex: 0,
        players: [
          {
            playerId: 'P1',
            trackId: 5,
            state: 'observed',
            courtPosition: { xM: 3.0, yM: 6.0, xPct: 50.0, yPct: 45.0 },
          },
          {
            playerId: 'P2',
            trackId: null,
            state: 'lost',
            courtPosition: null,
          },
        ],
      },
    ];

    const canonicalMetrics = {
      P1: { totalDistanceM: 88.5 },
      P2: { totalDistanceM: 0.0 },
    };

    const result = downsampleAndChunkTrackingSamples('test_session_2', rawFrames, 10, 15, canonicalMetrics);
    expect(result.summary.players['P1'].totalDistanceMeters).toBe(88.5);
    expect(result.summary.players['P2'].totalDistanceMeters).toBe(0.0);
    // Unobserved player P2 must have null base positions
    expect(result.summary.players['P2'].basePosition.avgCourtX).toBeNull();
    expect(result.summary.players['P2'].basePosition.avgCourtY).toBeNull();
  });

  it('returns null for basePosition (avgCourtX, avgCourtY) when no tracked samples exist', () => {
    const metricsEmpty = computePlayerMovementMetrics([]);
    expect(metricsEmpty.basePosition.avgCourtX).toBeNull();
    expect(metricsEmpty.basePosition.avgCourtY).toBeNull();
    expect(metricsEmpty.totalDistanceMeters).toBe(0);

    const lostSamples: TrackingSample[] = [
      {
        timestamp: 1.0,
        playerId: 'P1',
        courtX: 0,
        courtY: 0,
        speed: 0,
        confidence: 0,
        trackingState: 'lost',
      },
    ];
    const metricsLost = computePlayerMovementMetrics(lostSamples);
    expect(metricsLost.basePosition.avgCourtX).toBeNull();
    expect(metricsLost.basePosition.avgCourtY).toBeNull();
  });

  it('does not encode missing sample speed or confidence as measured zero', () => {
    const rawFrames: TrackingTelemetryV1[] = [
      {
        schemaVersion: 1,
        analysisId: 'unknown_measurements',
        timestampSec: 1,
        frameIndex: 30,
        players: [
          {
            playerId: 'P1',
            trackId: 9,
            state: 'predicted',
            courtPosition: { xM: 2, yM: 3, xPct: 32.8, yPct: 22.4 },
          },
        ],
      },
    ];

    const result = downsampleAndChunkTrackingSamples('unknown_measurements', rawFrames, 10, 15);
    expect(result.chunks[0].samples[0].speed).toBeNull();
    expect(result.chunks[0].samples[0].confidence).toBeNull();
  });

  it('preserves pose provenance flags (isReused, ageFrames)', () => {
    const rawFrames: TrackingTelemetryV1[] = [
      {
        schemaVersion: 1,
        analysisId: 'test_pose_session',
        timestampSec: 0.5,
        frameIndex: 15,
        players: [
          {
            playerId: 'P1',
            trackId: 102,
            state: 'observed',
            courtPosition: { xM: 2.0, yM: 2.0, xPct: 30, yPct: 20 },
            pose: {
              keypoints: [
                { x: 50, y: 50, score: 0.85, isReused: true, ageFrames: 2 },
              ],
              action: 'READY',
              confidence: 0.85,
              isReused: true,
              ageFrames: 2,
            },
          },
        ],
      },
    ];

    const frame = rawFrames[0];
    const player = frame.players[0];
    expect(player.pose?.isReused).toBe(true);
    expect(player.pose?.ageFrames).toBe(2);
    expect(player.pose?.keypoints[0].isReused).toBe(true);
    expect(player.pose?.keypoints[0].ageFrames).toBe(2);
  });

  it('never synthesizes trackId from playerId when converting frames', () => {
    const legacyFrame = {
      timestamp: 1.0,
      frame_idx: 30,
      source: 'real_tracking',
      players: [
        {
          id: 4,
          name: 'Player 4',
          court_pos_pct: { x: 50.0, y: 50.0 },
          speed_ms: 1.5,
          total_dist_m: 12.0,
          is_active: false,
        },
      ],
    };

    const v1 = toTrackingTelemetryV1(legacyFrame);
    expect(v1.players[0].playerId).toBe('P4');
    expect(v1.players[0].trackId).toBeUndefined();
  });

  it('deterministically selects the latest analysis regardless of retrieval order', () => {
    const analysisA: TrackingAnalysis = {
      id: 'analysis_old',
      projectId: 'proj_1',
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      engineVersion: '1.0.0',
      detectorModel: 'yolo',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      createdAt: '2026-09-17T10:00:00Z',
      completedAt: '2026-09-17T10:05:00Z',
      players: [],
      quality: { detectionCoverage: 0.9, lostTimePercent: 10, confidence: 0.8, manualCorrections: 0 },
      summary: { durationSeconds: 60, sampleCount: 600, players: {} },
    };

    const analysisB: TrackingAnalysis = {
      id: 'analysis_new',
      projectId: 'proj_1',
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      engineVersion: '1.0.0',
      detectorModel: 'yolo',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      createdAt: '2026-09-17T12:00:00Z',
      completedAt: '2026-09-17T12:05:00Z',
      players: [],
      quality: { detectionCoverage: 0.95, lostTimePercent: 5, confidence: 0.88, manualCorrections: 0 },
      summary: { durationSeconds: 60, sampleCount: 600, players: {} },
    };

    expect(getLatestTrackingAnalysis([analysisA, analysisB])?.id).toBe('analysis_new');
    expect(getLatestTrackingAnalysis([analysisB, analysisA])?.id).toBe('analysis_new');
    expect(getLatestTrackingAnalysis([])).toBeNull();
  });

  it('preserves full canonical provenance fields and athleteId in toTrackingTelemetryV1', () => {
    const rawFrame = {
      analysisId: 'analysis_01',
      pipelineRunId: 'pipe_run_99',
      timestamp: 3.5,
      frame_idx: 105,
      timebase: 'pts',
      sceneState: 'active_court',
      modelVersion: 'badminton-v2.1',
      modelArtifactHash: 'sha256:fedcba9876543210',
      runtime: 'tensorrt',
      requestedDevice: 'cuda:0',
      effectiveDevice: 'cuda:0',
      precision: 'fp16',
      supersededBy: 'pipe_run_100',
      observationState: 'observed',
      reviewState: 'reviewed',
      players: [
        {
          id: 1,
          athleteId: 'ath_kunlavut_01',
          trackId: 7,
          observationState: 'observed',
          reviewState: 'reviewed',
          detectionConfidence: 0.95,
          court_pos_m: { x: 2.5, y: 11.2 },
          court_pos_pct: { x: 41.0, y: 83.5 },
        },
      ],
    };

    const telemetry = toTrackingTelemetryV1(rawFrame);
    expect(telemetry.pipelineRunId).toBe('pipe_run_99');
    expect(telemetry.timebase).toBe('pts');
    expect(telemetry.sceneState).toBe('active_court');
    expect(telemetry.modelVersion).toBe('badminton-v2.1');
    expect(telemetry.modelArtifactHash).toBe('sha256:fedcba9876543210');
    expect(telemetry.runtime).toBe('tensorrt');
    expect(telemetry.requestedDevice).toBe('cuda:0');
    expect(telemetry.effectiveDevice).toBe('cuda:0');
    expect(telemetry.precision).toBe('fp16');
    expect(telemetry.supersededBy).toBe('pipe_run_100');
    expect(telemetry.reviewState).toBe('reviewed');

    expect(telemetry.players[0].athleteId).toBe('ath_kunlavut_01');
    expect(telemetry.players[0].trackId).toBe(7);
    expect(telemetry.players[0].reviewState).toBe('reviewed');
    expect(telemetry.players[0].observationState).toBe('observed');
  });

  it('marks prior run as supersededBy when reprocess creates new pipelineRunId', () => {
    const originalRun: TrackingAnalysis = {
      id: 'analysis_01',
      projectId: 'project_01',
      pipelineRunId: 'pipe_run_v1',
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      engineVersion: '1.0.0',
      detectorModel: 'yolov8n',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      createdAt: '2026-09-30T10:00:00Z',
      players: [],
      summary: { durationSeconds: 60, sampleCount: 600, players: {} },
    };

    // When reprocessed:
    const newPipelineRunId = 'pipe_run_v2';
    const supersededRun: TrackingAnalysis = {
      ...originalRun,
      supersededBy: newPipelineRunId,
    };

    const newRun: TrackingAnalysis = {
      id: 'analysis_02',
      projectId: 'project_01',
      pipelineRunId: newPipelineRunId,
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      engineVersion: '1.0.0',
      detectorModel: 'yolo11n',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      createdAt: '2026-09-30T11:00:00Z',
      players: [],
      summary: { durationSeconds: 60, sampleCount: 600, players: {} },
    };

    expect(supersededRun.supersededBy).toBe('pipe_run_v2');
    expect(newRun.pipelineRunId).toBe('pipe_run_v2');
    expect(newRun.supersededBy).toBeUndefined();
  });

  it('R04: player in lost state has null observationState and null groundPointProvenance across toTrackingTelemetryV1 and downsampling', () => {
    const rawFrame = {
      analysisId: 'analysis_lost_test',
      pipelineRunId: 'pipe_run_lost',
      timestamp: 4.0,
      frame_idx: 120,
      players: [
        {
          id: 1,
          trackId: 10,
          state: 'lost',
          is_active: false,
          observationState: null,
          groundPointProvenance: null,
          bboxPct: null,
          groundPointPct: null,
          courtPosition: null,
        },
        {
          id: 2,
          trackId: 11,
          state: 'observed',
          is_active: true,
          observationState: 'observed',
          groundPointProvenance: 'pose_both_ankles',
          courtPosition: { xM: 2.0, yM: 4.0, xPct: 30, yPct: 40 },
          totalDistanceM: 5.0,
        },
      ],
    };

    const telemetry = toTrackingTelemetryV1(rawFrame);
    const lostPlayer = telemetry.players.find((p) => p.playerId === 'P1')!;
    const observedPlayer = telemetry.players.find((p) => p.playerId === 'P2')!;

    expect(lostPlayer.state).toBe('lost');
    expect(lostPlayer.observationState).toBeNull();
    expect(lostPlayer.groundPointProvenance).toBeNull();
    expect(lostPlayer.bboxPct).toBeNull();
    expect(lostPlayer.groundPointPct).toBeNull();

    expect(observedPlayer.state).toBe('observed');
    expect(observedPlayer.observationState).toBe('observed');
    expect(observedPlayer.groundPointProvenance).toBe('pose_both_ankles');
  });

  it('R04: predicted and manual observationState and groundPointProvenance are preserved through downsampling', () => {
    const rawFrames: TrackingTelemetryV1[] = [
      {
        schemaVersion: 1,
        analysisId: 'analysis_provenance_states',
        pipelineRunId: 'run_provenance',
        timestampSec: 1.0,
        frameIndex: 30,
        canUseCourtMetric: true,
        isMetricValid: true,
        calibrationState: 'CALIBRATED',
        cameraSegmentId: 'seg_1',
        calibrationId: 'cal_1',
        calibration: {
          state: 'CALIBRATED',
          cameraSegmentId: 'seg_1',
          calibrationId: 'cal_1',
          source: 'automatic',
          createdAtFrame: 0,
          createdAtTimestampSec: 0.0,
          confidence: 0.95,
        },
        players: [
          {
            playerId: 'P1',
            trackId: 1,
            state: 'predicted',
            observationState: 'predicted',
            groundPointProvenance: 'bbox_bottom_center',
            courtPosition: { xM: 2.0, yM: 3.0, xPct: 32.8, yPct: 22.4 },
          },
          {
            playerId: 'P2',
            trackId: 2,
            state: 'observed',
            observationState: 'manual',
            groundPointProvenance: 'pose_both_ankles',
            courtPosition: { xM: 4.0, yM: 10.0, xPct: 65.0, yPct: 75.0 },
          },
        ],
      },
    ];

    const result = downsampleAndChunkTrackingSamples('analysis_provenance_states', rawFrames, 10, 15);
    const p1Sample = result.chunks[0].samples.find((s) => s.playerId === 'P1')!;
    const p2Sample = result.chunks[0].samples.find((s) => s.playerId === 'P2')!;

    expect(p1Sample.trackingState).toBe('predicted');
    expect(p1Sample.observationState).toBe('predicted');
    expect(p1Sample.groundPointProvenance).toBe('bbox_bottom_center');

    expect(p2Sample.trackingState).toBe('tracked');
    expect(p2Sample.observationState).toBe('manual');
    expect(p2Sample.groundPointProvenance).toBe('pose_both_ankles');
  });
});

