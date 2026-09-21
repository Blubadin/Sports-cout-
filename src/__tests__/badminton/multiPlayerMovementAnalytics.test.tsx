import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  computeSinglePlayerMovementMetrics,
  computeMultiPlayerMovementMetrics,
  computePlayerMovementMetrics,
  type TrackingAnalysis,
  type TrackingSample,
} from '../../services/storage/trackingStorage';
import BadmintonMovementDashboard from '../../components/analytics/BadmintonMovementDashboard';

describe('Multi-Player Movement Analytics (Phase 0.1)', () => {
  // TEST 1 — INTERLEAVED PLAYERS
  describe('TEST 1 — INTERLEAVED PLAYERS', () => {
    it('guarantees that physical movement calculations only connect samples belonging to the SAME playerId', () => {
      const interleavedSamples: TrackingSample[] = [
        { timestamp: 0.0, playerId: 'P1', courtX: 0.0, courtY: 0.0, speed: 0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 0.0, playerId: 'P2', courtX: 10.0, courtY: 10.0, speed: 0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 1.0, playerId: 'P1', courtX: 1.0, courtY: 0.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 1.0, playerId: 'P2', courtX: 11.0, courtY: 10.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 2.0, playerId: 'P1', courtX: 2.0, courtY: 0.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 2.0, playerId: 'P2', courtX: 12.0, courtY: 10.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
      ];

      const p1Samples = interleavedSamples.filter((s) => s.playerId === 'P1');
      const p2Samples = interleavedSamples.filter((s) => s.playerId === 'P2');

      const p1Result = computeSinglePlayerMovementMetrics(p1Samples);
      const p2Result = computeSinglePlayerMovementMetrics(p2Samples);
      const allMetrics = computeMultiPlayerMovementMetrics(interleavedSamples);

      // P1 path only uses P1 samples: (0,0) -> (1,0) -> (2,0) = 2.0m lateral
      expect(p1Result.metrics.totalDistanceMeters).toBe(2.0);
      expect(p1Result.metrics.lateralMovementMeters).toBe(2.0);
      expect(p1Result.metrics.frontBackMovementMeters).toBe(0.0);
      expect(p1Result.validSpeeds).toEqual([1.0, 1.0]);

      // P2 path only uses P2 samples: (10,10) -> (11,10) -> (12,10) = 2.0m lateral
      expect(p2Result.metrics.totalDistanceMeters).toBe(2.0);
      expect(p2Result.metrics.lateralMovementMeters).toBe(2.0);
      expect(p2Result.metrics.frontBackMovementMeters).toBe(0.0);
      expect(p2Result.validSpeeds).toEqual([1.0, 1.0]);

      // All distance = P1 distance + P2 distance (2.0 + 2.0 = 4.0m)
      expect(allMetrics.totalDistanceMeters).toBe(4.0);
      expect(allMetrics.lateralMovementMeters).toBe(4.0);
      expect(allMetrics.frontBackMovementMeters).toBe(0.0);

      // No cross-player movement segment (P1 -> P2) exists:
      // Speeds are pooled only from valid same-player segments
      expect(allMetrics.maxSpeedMps).toBe(1.0);
      expect(allMetrics.avgSpeedMps).toBe(1.0);
      expect(allMetrics.p95SpeedMps).toBe(1.0);

      // computePlayerMovementMetrics must also delegate safely when given interleaved multi-player samples
      const generalMetrics = computePlayerMovementMetrics(interleavedSamples);
      expect(generalMetrics.totalDistanceMeters).toBe(4.0);
      expect(generalMetrics.maxSpeedMps).toBe(1.0);
    });
  });

  // TEST 2 — SIMPLE TOTAL
  describe('TEST 2 — SIMPLE TOTAL', () => {
    it('accurately sums independent player workloads: P1(100m) + P2(80m) ≈ 180m', () => {
      // P1 moves 100 meters (100 steps of 1m at 1 m/s)
      const p1Samples: TrackingSample[] = Array.from({ length: 101 }, (_, i) => ({
        timestamp: i * 1.0,
        playerId: 'P1',
        courtX: 1.0,
        courtY: i * 1.0, // 0 to 100 meters
        speed: 1.0,
        confidence: 0.95,
        trackingState: 'tracked',
      }));

      // P2 moves 80 meters (80 steps of 1m at 1 m/s)
      const p2Samples: TrackingSample[] = Array.from({ length: 81 }, (_, i) => ({
        timestamp: i * 1.0,
        playerId: 'P2',
        courtX: 4.0,
        courtY: i * 1.0, // 0 to 80 meters
        speed: 1.0,
        confidence: 0.95,
        trackingState: 'tracked',
      }));

      // Interleave P1 and P2 samples chronologically
      const interleaved = [...p1Samples, ...p2Samples].sort((a, b) => a.timestamp - b.timestamp);

      const p1Metrics = computePlayerMovementMetrics(p1Samples);
      const p2Metrics = computePlayerMovementMetrics(p2Samples);
      const allMetrics = computeMultiPlayerMovementMetrics(interleaved);

      expect(p1Metrics.totalDistanceMeters).toBe(100.0);
      expect(p2Metrics.totalDistanceMeters).toBe(80.0);

      // All Players Total Distance must equal sum of individual workloads
      expect(allMetrics.totalDistanceMeters).toBe(180.0);
      expect(allMetrics.frontBackMovementMeters).toBe(180.0);
      expect(allMetrics.lateralMovementMeters).toBe(0.0);
    });
  });

  // TEST 3 — SPEED
  describe('TEST 3 — SPEED', () => {
    it('prevents large spatial separation between players from creating fake speed or speed rejection', () => {
      // P1 is on near court (y=1.5m) moving laterally at 2.0 m/s
      // P2 is on far court (y=11.5m) moving laterally at 3.0 m/s
      // The distance between P1 and P2 is 10.0m!
      // In interleaved stream at 10 Hz (dt = 0.1s), cross-player jump would be 10m / 0.1s = 100 m/s.
      const samples: TrackingSample[] = [];
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const t = Number((i * 0.1).toFixed(2));
        // P1 moves 0.2m per 0.1s => 2.0 m/s
        samples.push({
          timestamp: t,
          playerId: 'P1',
          courtX: Number((1.0 + i * 0.2).toFixed(2)),
          courtY: 1.5,
          speed: 2.0,
          confidence: 0.9,
          trackingState: 'tracked',
        });
        // P2 moves 0.3m per 0.1s => 3.0 m/s
        samples.push({
          timestamp: t,
          playerId: 'P2',
          courtX: Number((1.0 + i * 0.3).toFixed(2)),
          courtY: 11.5,
          speed: 3.0,
          confidence: 0.9,
          trackingState: 'tracked',
        });
      }

      const allMetrics = computeMultiPlayerMovementMetrics(samples);

      // Must not create fake speed (>12 m/s teleport) or reject valid speeds
      expect(allMetrics.maxSpeedMps).toBe(3.0);
      expect(allMetrics.avgSpeedMps).toBe(2.5);
      expect(allMetrics.p95SpeedMps).toBe(3.0);

      // Total distance must not be rejected (P1: 9 * 0.2 = 1.8m, P2: 9 * 0.3 = 2.7m => Total = 4.5m)
      expect(allMetrics.totalDistanceMeters).toBe(4.5);
      expect(allMetrics.lateralMovementMeters).toBe(4.5);
      expect(allMetrics.frontBackMovementMeters).toBe(0.0);
    });
  });

  // TEST 4 — SINGLE PLAYER
  describe('TEST 4 — SINGLE PLAYER', () => {
    it('preserves identical behavior for single player datasets', () => {
      const p1Samples: TrackingSample[] = [
        { timestamp: 0.0, playerId: 'P1', courtX: 2.0, courtY: 2.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 1.0, playerId: 'P1', courtX: 2.0, courtY: 5.0, speed: 3.0, confidence: 0.95, trackingState: 'tracked' },
        { timestamp: 2.0, playerId: 'P1', courtX: 5.0, courtY: 5.0, speed: 3.0, confidence: 0.85, trackingState: 'tracked' },
      ];

      const singleResult = computeSinglePlayerMovementMetrics(p1Samples).metrics;
      const genericResult = computePlayerMovementMetrics(p1Samples);

      expect(genericResult.totalDistanceMeters).toBe(singleResult.totalDistanceMeters);
      expect(genericResult.lateralMovementMeters).toBe(singleResult.lateralMovementMeters);
      expect(genericResult.frontBackMovementMeters).toBe(singleResult.frontBackMovementMeters);
      expect(genericResult.avgSpeedMps).toBe(singleResult.avgSpeedMps);
      expect(genericResult.maxSpeedMps).toBe(singleResult.maxSpeedMps);
      expect(genericResult.p95SpeedMps).toBe(singleResult.p95SpeedMps);
      expect(genericResult.basePosition.avgCourtX).toBe(singleResult.basePosition.avgCourtX);
      expect(genericResult.basePosition.avgCourtY).toBe(singleResult.basePosition.avgCourtY);
      expect(genericResult.basePosition.dispersion).toBe(singleResult.basePosition.dispersion);
      expect(genericResult.courtCoverage).toEqual(singleResult.courtCoverage);
    });
  });

  // TEST 5 — EMPTY PLAYER DATA
  describe('TEST 5 — EMPTY PLAYER DATA', () => {
    it('does not produce NaN, Infinity, or throw errors on empty or lost samples', () => {
      const emptyMetrics = computeMultiPlayerMovementMetrics([]);
      expect(emptyMetrics.totalDistanceMeters).toBe(0);
      expect(emptyMetrics.avgSpeedMps).toBe(0);
      expect(emptyMetrics.p95SpeedMps).toBe(0);
      expect(emptyMetrics.maxSpeedMps).toBe(0);
      expect(emptyMetrics.basePosition.avgCourtX).toBeNull();
      expect(emptyMetrics.basePosition.avgCourtY).toBeNull();
      expect(emptyMetrics.basePosition.dispersion).toBe(0);
      expect(emptyMetrics.lateralMovementMeters).toBe(0);
      expect(emptyMetrics.frontBackMovementMeters).toBe(0);
      expect(emptyMetrics.courtCoverage.frontPercent).toBe(0);
      expect(emptyMetrics.courtCoverage.midPercent).toBe(0);
      expect(emptyMetrics.courtCoverage.rearPercent).toBe(0);
      expect(emptyMetrics.courtCoverage.leftPercent).toBe(0);
      expect(emptyMetrics.courtCoverage.rightPercent).toBe(0);

      const lostSamples: TrackingSample[] = [
        { timestamp: 0.0, playerId: 'P1', courtX: 0, courtY: 0, speed: 0, confidence: 0, trackingState: 'lost' },
        { timestamp: 1.0, playerId: 'P2', courtX: 0, courtY: 0, speed: 0, confidence: 0, trackingState: 'lost' },
      ];

      const lostMetrics = computeMultiPlayerMovementMetrics(lostSamples);
      expect(lostMetrics.totalDistanceMeters).toBe(0);
      expect(lostMetrics.avgSpeedMps).toBe(0);
      expect(lostMetrics.basePosition.avgCourtX).toBeNull();
      expect(lostMetrics.basePosition.avgCourtY).toBeNull();
      expect(lostMetrics.basePosition.dispersion).toBe(0);
      expect(Number.isNaN(lostMetrics.totalDistanceMeters)).toBe(false);
      expect(Number.isFinite(lostMetrics.avgSpeedMps)).toBe(true);
    });
  });

  // UI / DASHBOARD PRESENTATION TESTS
  describe('BadmintonMovementDashboard UI semantics', () => {
    it('displays "Combined / Team Occupancy Centroid" in ALL mode and "Base Position" in single player mode', () => {
      const samples: TrackingSample[] = [
        { timestamp: 0.0, playerId: 'P1', courtX: 2.0, courtY: 3.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 0.0, playerId: 'P2', courtX: 4.0, courtY: 10.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 1.0, playerId: 'P1', courtX: 2.0, courtY: 4.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
        { timestamp: 1.0, playerId: 'P2', courtX: 4.0, courtY: 11.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
      ];

      const analysis: TrackingAnalysis = {
        id: 'movement-ui',
        projectId: 'project-ui',
        sportType: 'badminton',
        gameType: 'singles',
        status: 'completed',
        engineVersion: 'tracking-v1',
        detectorModel: 'yolo',
        trackerModel: 'bytetrack',
        sampleRateHz: null,
        createdAt: '2026-09-21T00:00:00.000Z',
        players: [
          { playerId: 'P1', side: 'near' },
          { playerId: 'P2', side: 'far' },
        ],
        quality: {
          detectionCoverage: 1,
          lostTimePercent: 0,
          confidence: 0.9,
        },
        summary: { durationSeconds: 1, sampleCount: samples.length, players: {} },
      };

      render(<BadmintonMovementDashboard analysis={analysis} samples={samples} />);

      // Default is ALL players
      expect(screen.getByText('Combined / Team Occupancy Centroid')).toBeInTheDocument();
      expect(screen.queryByText('Player Base Position')).not.toBeInTheDocument();

      // Switch to P1
      const p1Btn = screen.getByRole('button', { name: 'P1' });
      fireEvent.click(p1Btn);

      expect(screen.getByText('Base Position')).toBeInTheDocument();
      expect(screen.queryByText('Combined / Team Occupancy Centroid')).not.toBeInTheDocument();
    });
  });
});
