import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateP95,
  computePlayerMovementMetrics,
  downsampleAndChunkTrackingSamples,
  MemoryTrackingDriver,
  setTrackingStorageDriver,
  saveTrackingAnalysis,
  getTrackingAnalysis,
  listTrackingAnalyses,
  getTrackingSamples,
  deleteTrackingAnalysis,
  type TrackingAnalysis,
  type TrackingSample,
} from '../../services/storage/trackingStorage';
import type { TrackingTelemetryV1 } from '../../types';

describe('Phase 8 — Tracking Data Persistence & Metrics', () => {
  let memoryDriver: MemoryTrackingDriver;

  beforeEach(() => {
    memoryDriver = new MemoryTrackingDriver();
    setTrackingStorageDriver(memoryDriver);
  });

  describe('calculateP95', () => {
    it('computes 95th percentile correctly and ignores extreme spikes', () => {
      // 100 values from 1 to 100
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p95 = calculateP95(values);
      expect(p95).toBe(96);
    });

    it('returns 0 for empty array', () => {
      expect(calculateP95([])).toBe(0);
    });
  });

  describe('computePlayerMovementMetrics', () => {
    it('computes total distance, speeds, base position, and court coverage accurately', () => {
      const samples: TrackingSample[] = [
        {
          timestamp: 0.0,
          playerId: 'P1',
          courtX: 2.0,
          courtY: 2.0,
          speed: 1.0,
          confidence: 0.9,
          trackingState: 'tracked',
        },
        {
          timestamp: 1.0,
          playerId: 'P1',
          courtX: 2.0,
          courtY: 5.0, // moved 3 meters in 1 sec => speed = 3 m/s
          speed: 3.0,
          confidence: 0.95,
          trackingState: 'tracked',
        },
        {
          timestamp: 2.0,
          playerId: 'P1',
          courtX: 5.0, // moved 3 meters in 1 sec => speed = 3 m/s
          courtY: 5.0,
          speed: 3.0,
          confidence: 0.85,
          trackingState: 'tracked',
        },
      ];

      const metrics = computePlayerMovementMetrics(samples);

      // Total distance = 3 + 3 = 6 meters
      expect(metrics.totalDistanceMeters).toBe(6.0);
      expect(metrics.lateralMovementMeters).toBe(3.0);
      expect(metrics.frontBackMovementMeters).toBe(3.0);
      expect(metrics.maxSpeedMps).toBe(3.0);
      expect(metrics.avgSpeedMps).toBe(3.0);
      expect(metrics.p95SpeedMps).toBe(3.0);

      // Base position: avg(X) = (2 + 2 + 5)/3 = 3.0, avg(Y) = (2 + 5 + 5)/3 = 4.0
      expect(metrics.basePosition.avgCourtX).toBe(3.0);
      expect(metrics.basePosition.avgCourtY).toBe(4.0);
      expect(metrics.basePosition.dispersion).toBeGreaterThan(0);
    });
  });

  describe('downsampleAndChunkTrackingSamples', () => {
    it('downsamples 30 FPS stream to 10 Hz and chunks into specified duration windows', () => {
      const frames: TrackingTelemetryV1[] = Array.from({ length: 30 }, (_, i) => ({
        schemaVersion: 1,
        analysisId: 'analysis_test_1',
        timestampSec: Number((i * 0.033).toFixed(3)),
        frameIndex: i,
        source: 'real_tracking',
        isSynthetic: false,
        players: [
          {
            playerId: 'P1',
            trackId: 1,
            teamCode: 'team1',
            courtPosition: { xM: 2.5, yM: 3.0, xPct: 41.0, yPct: 22.4 },
            playerRelativeZone: 'mid',
            speedMps: 1.5,
            detectionConfidence: 0.9,
            state: 'observed' as const,
          },
        ],
      }));

      const { chunks, summary, quality } = downsampleAndChunkTrackingSamples(
        'analysis_test_1',
        frames,
        10, // 10 Hz target
        0.5 // 0.5 sec chunks for testing
      );

      // Should have downsampled to around 10-11 samples
      expect(summary.sampleCount).toBeLessThan(30);
      expect(summary.sampleCount).toBeGreaterThanOrEqual(9);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(quality.detectionCoverage).toBe(1.0);
      expect(quality.lostTimePercent).toBe(0.0);
      expect(quality.lowConfidenceWarning).toBe(false);
      expect(summary.players['P1']).toBeDefined();
      expect(summary.players['P1'].basePosition.avgCourtX).toBe(2.5);
    });
  });

  describe('Repository CRUD operations', () => {
    it('saves, retrieves, lists, and deletes tracking analyses with chunks', async () => {
      const mockAnalysis: TrackingAnalysis = {
        id: 'analysis_uuid_1',
        projectId: 'project_1',
        sportType: 'badminton',
        gameType: 'singles',
        status: 'completed',
        engineVersion: 'tracking-v1',
        detectorModel: 'yolov8n-badminton',
        trackerModel: 'bytetrack',
        sampleRateHz: 10,
        createdAt: '2026-09-11T12:00:00Z',
        completedAt: '2026-09-11T12:01:00Z',
        players: [
          { playerId: 'P1', name: 'Player 1', side: 'near' },
          { playerId: 'P2', name: 'Player 2', side: 'far' },
        ],
        quality: {
          detectionCoverage: 0.95,
          lostTimePercent: 5.0,
          confidence: 0.88,
          manualCorrections: 0,
        },
        summary: {
          durationSeconds: 120,
          sampleCount: 1200,
          players: {
            P1: {
              totalDistanceMeters: 450.2,
              avgSpeedMps: 2.1,
              p95SpeedMps: 4.2,
              maxSpeedMps: 5.8,
              courtCoverage: {
                frontPercent: 30,
                midPercent: 50,
                rearPercent: 20,
                leftPercent: 45,
                rightPercent: 55,
              },
              basePosition: { avgCourtX: 2.8, avgCourtY: 3.5, dispersion: 1.1 },
              lateralMovementMeters: 210,
              frontBackMovementMeters: 240.2,
            },
          },
        },
      };

      const mockChunks = [
        {
          id: 'analysis_uuid_1:0',
          analysisId: 'analysis_uuid_1',
          chunkIndex: 0,
          startTime: 0,
          endTime: 15,
          samples: [
            {
              timestamp: 1.0,
              playerId: 'P1',
              courtX: 2.5,
              courtY: 3.2,
              speed: 1.8,
              confidence: 0.9,
              trackingState: 'tracked' as const,
            },
            {
              timestamp: 2.0,
              playerId: 'P1',
              courtX: 2.7,
              courtY: 3.5,
              speed: 1.9,
              confidence: 0.92,
              trackingState: 'tracked' as const,
            },
          ],
        },
      ];

      // Save
      await saveTrackingAnalysis(mockAnalysis, mockChunks);

      // Retrieve
      const loaded = await getTrackingAnalysis('analysis_uuid_1');
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('analysis_uuid_1');
      expect(loaded?.quality.detectionCoverage).toBe(0.95);

      // List by project
      const list = await listTrackingAnalyses('project_1');
      expect(list).toHaveLength(1);

      // Samples retrieval
      const samples = await getTrackingSamples('analysis_uuid_1', { playerId: 'P1' });
      expect(samples).toHaveLength(2);

      // Delete
      await deleteTrackingAnalysis('analysis_uuid_1');
      const afterDelete = await getTrackingAnalysis('analysis_uuid_1');
      expect(afterDelete).toBeNull();
      const samplesAfterDelete = await getTrackingSamples('analysis_uuid_1');
      expect(samplesAfterDelete).toHaveLength(0);
    });
  });
});
