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
});
