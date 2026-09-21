import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  calculateNominalAnalysisHz,
  calculateEffectiveStoredHz,
  type TrackingAnalysis,
  type TrackingSample,
} from '../../services/storage/trackingStorage';
import BadmintonMovementDashboard from '../../components/analytics/BadmintonMovementDashboard';

describe('Telemetry Cadence & Rate Separation (Phase 0.3)', () => {
  describe('calculateNominalAnalysisHz', () => {
    it('calculates nominal analysis Hz from valid sourceFps and frameStride', () => {
      // 30 FPS with stride 4 => 7.5 Hz
      expect(calculateNominalAnalysisHz(30, 4)).toBe(7.5);
      // 30 FPS with stride 2 => 15 Hz
      expect(calculateNominalAnalysisHz(30, 2)).toBe(15);
      // 60 FPS with stride 4 => 15 Hz
      expect(calculateNominalAnalysisHz(60, 4)).toBe(15);
      // 29.97 FPS with stride 3 => 9.99 Hz
      expect(calculateNominalAnalysisHz(29.97, 3)).toBe(9.99);
      // 25 FPS with stride 1 => 25 Hz
      expect(calculateNominalAnalysisHz(25, 1)).toBe(25);
    });

    it('returns null (unavailable) for missing or undefined inputs', () => {
      expect(calculateNominalAnalysisHz(null, 4)).toBeNull();
      expect(calculateNominalAnalysisHz(undefined, 4)).toBeNull();
      expect(calculateNominalAnalysisHz(30, null)).toBeNull();
      expect(calculateNominalAnalysisHz(30, undefined)).toBeNull();
      expect(calculateNominalAnalysisHz(null, null)).toBeNull();
    });

    it('returns null (not Infinity or NaN) for stride <= 0 or invalid numbers', () => {
      expect(calculateNominalAnalysisHz(30, 0)).toBeNull();
      expect(calculateNominalAnalysisHz(30, -1)).toBeNull();
      expect(calculateNominalAnalysisHz(-30, 4)).toBeNull();
      expect(calculateNominalAnalysisHz(0, 4)).toBeNull();
      expect(calculateNominalAnalysisHz(NaN, 4)).toBeNull();
      expect(calculateNominalAnalysisHz(30, NaN)).toBeNull();
      expect(calculateNominalAnalysisHz(Infinity, 4)).toBeNull();
      expect(calculateNominalAnalysisHz(30, Infinity)).toBeNull();
    });
  });

  describe('calculateEffectiveStoredHz', () => {
    it('calculates effective stored Hz from sample count and duration seconds', () => {
      // 75 samples across 10 seconds => 7.5 Hz
      expect(calculateEffectiveStoredHz(75, 10)).toBe(7.5);
      // 100 samples across 10 seconds => 10.0 Hz
      expect(calculateEffectiveStoredHz(100, 10)).toBe(10);
      // 15 samples across 2 seconds => 7.5 Hz
      expect(calculateEffectiveStoredHz(15, 2)).toBe(7.5);
    });

    it('returns null (unavailable) for missing or undefined inputs', () => {
      expect(calculateEffectiveStoredHz(null, 10)).toBeNull();
      expect(calculateEffectiveStoredHz(undefined, 10)).toBeNull();
      expect(calculateEffectiveStoredHz(100, null)).toBeNull();
      expect(calculateEffectiveStoredHz(100, undefined)).toBeNull();
    });

    it('returns null (not NaN or Infinity) for duration <= 0 or sampleCount <= 0', () => {
      expect(calculateEffectiveStoredHz(10, 0)).toBeNull();
      expect(calculateEffectiveStoredHz(10, -1)).toBeNull();
      expect(calculateEffectiveStoredHz(0, 10)).toBeNull();
      expect(calculateEffectiveStoredHz(-5, 10)).toBeNull();
      expect(calculateEffectiveStoredHz(NaN, 10)).toBeNull();
      expect(calculateEffectiveStoredHz(10, NaN)).toBeNull();
      expect(calculateEffectiveStoredHz(Infinity, 10)).toBeNull();
      expect(calculateEffectiveStoredHz(10, Infinity)).toBeNull();
    });
  });

  describe('BadmintonMovementDashboard UI Cadence Display', () => {
    const mockAnalysis: TrackingAnalysis = {
      id: 'cadence_test_session',
      projectId: 'proj_1',
      sportType: 'badminton',
      gameType: 'singles',
      trackedPlayerCount: 1,
      status: 'completed',
      engineVersion: '2.0.0',
      detectorModel: 'yolo11n',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      nominalAnalysisHz: 7.5,
      effectiveStoredHz: 7.5,
      persistedTargetHz: 10,
      createdAt: new Date().toISOString(),
      videoMetadata: {
        nominalFps: 30,
        durationSec: 10,
      },
      processingConfig: {
        detectorInputSize: 640,
        useCourtRoi: false,
        courtRoiMarginPx: 0,
        frameStride: 4,
        poseStride: 4,
        device: 'cpu',
      },
      performance: {
        elapsedSec: 2.5,
        analysisFps: 48.2,
        samplingFps: 12.0,
        rtf: 0.25,
        realtimeSpeed: 4.0,
      },
      players: [{ playerId: 'P1', side: 'near' }],
      quality: {
        meanTargetCoverage: 0.95,
        simultaneousTargetCoverage: 0.95,
        detectionCoverage: 0.95,
        lostTimePercent: 5.0,
        confidence: 0.92,
      },
      summary: {
        durationSeconds: 10,
        sampleCount: 75,
        players: {},
      },
    };

    // 75 samples spread across 10 seconds (0.0s to 10.0s) -> 7.5 Hz
    const mockSamples: TrackingSample[] = Array.from({ length: 75 }, (_, i) => ({
      timestamp: Number((i * (10 / 74)).toFixed(3)),
      playerId: 'P1',
      courtX: 3.0,
      courtY: 4.0,
      speed: 1.2,
      confidence: 0.95,
      trackingState: 'tracked',
    }));

    it('renders accurate rate separation and NEVER displays hardcoded @ 10Hz', () => {
      render(
        <BadmintonMovementDashboard
          analysis={mockAnalysis}
          samples={mockSamples}
        />
      );

      // Verify no hardcoded "@ 10Hz" exists anywhere in the rendered output
      expect(screen.queryByText(/@ 10Hz/i)).toBeNull();
      expect(screen.queryByText(/samples @ 10Hz/i)).toBeNull();

      // Verify Cadence Card is present
      const cadenceCard = screen.getByTestId('telemetry-cadence-card');
      expect(cadenceCard).toBeDefined();

      // Verify accurate rate displays
      expect(cadenceCard.textContent).toContain('Source: 30 FPS');
      expect(cadenceCard.textContent).toContain('Analyzed: 7.5 Hz');
      expect(cadenceCard.textContent).toContain('Stored: 7.5 Hz');
      expect(cadenceCard.textContent).toContain('Inference: 48.2 FPS');
    });

    it('shows "—" when rates are unavailable and never produces NaN or Infinity', () => {
      const incompleteAnalysis: TrackingAnalysis = {
        ...mockAnalysis,
        videoMetadata: undefined,
        processingConfig: undefined,
        nominalAnalysisHz: null,
        effectiveStoredHz: null,
        performance: undefined,
      };

      render(
        <BadmintonMovementDashboard
          analysis={incompleteAnalysis}
          samples={[]}
        />
      );

      // Verify no NaN or Infinity is displayed in the cadence card
      const cadenceCard = screen.getByTestId('telemetry-cadence-card');
      expect(cadenceCard.textContent).not.toContain('NaN');
      expect(cadenceCard.textContent).not.toContain('Infinity');

      // Verify unavailable rates display "—"
      expect(cadenceCard.textContent).toContain('Source: —');
      expect(cadenceCard.textContent).toContain('Analyzed: —');
      expect(cadenceCard.textContent).toContain('Stored: —');
    });

    it('dynamically computes effectiveStoredHz for multi-player tracking without double counting frames', () => {
      const multiPlayerSamples: TrackingSample[] = [];
      // 10 distinct frames over 2 seconds (t = 0.0, 0.2, 0.4, ... 1.8) -> 10 frames / 2s = 5 Hz
      for (let i = 0; i < 10; i++) {
        const t = Number((i * 0.2).toFixed(2));
        multiPlayerSamples.push(
          { timestamp: t, playerId: 'P1', courtX: 3.0, courtY: 2.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' },
          { timestamp: t, playerId: 'P2', courtX: 3.0, courtY: 11.0, speed: 1.0, confidence: 0.9, trackingState: 'tracked' }
        );
      }

      const multiAnalysis: TrackingAnalysis = {
        ...mockAnalysis,
        gameType: 'doubles',
        trackedPlayerCount: 2,
        players: [{ playerId: 'P1', side: 'near' }, { playerId: 'P2', side: 'far' }],
      };

      render(
        <BadmintonMovementDashboard
          analysis={multiAnalysis}
          samples={multiPlayerSamples}
        />
      );

      // 20 total samples across 2 players at 10 distinct timestamps over 2s => 5.0 Hz stored cadence
      const cadenceCard = screen.getByTestId('telemetry-cadence-card');
      expect(cadenceCard.textContent).toContain('Stored: 5 Hz');
      expect(cadenceCard.textContent).not.toContain('@ 10Hz');
    });
  });
});
