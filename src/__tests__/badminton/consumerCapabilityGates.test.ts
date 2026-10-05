import { describe, expect, it } from 'vitest';
import {
  parseCapabilityGate,
  parseSegmentCapabilities,
  type SegmentCapabilities,
} from '../../types/capabilities';
import { parseSceneTransition } from '../../types/scene';
import { toTrackingTelemetryV1 } from '../../services/trackingSessionApi';
import { isMetricCalibrationValid } from '../../types/calibration';

describe('Consumer Capability Gates & Lifecycle Truth', () => {
  const validCapsPayload = {
    canTrackPlayer: { enabled: true, reason: '2D athlete tracking active', confidence: 0.95 },
    canTrackShuttle: { enabled: true, reason: 'Shuttle visible in field', confidence: 0.90 },
    canUseCourtMetric: { enabled: true, reason: 'Court calibrated', confidence: 0.95 },
    canBuildHeatmap: { enabled: true, reason: 'Court metrics locked', confidence: 0.95 },
    canEstimateHit: { enabled: true, reason: 'Contract ready', confidence: 0.90 },
    canWriteCanonicalMatchData: { enabled: true, reason: 'Live court play', confidence: 0.95 },
  };

  describe('parseCapabilityGate & parseSegmentCapabilities', () => {
    it('parses valid capability gate correctly', () => {
      const gate = parseCapabilityGate({
        enabled: true,
        reason: '2D tracking active',
        confidence: 0.92,
      });
      expect(gate).not.toBeNull();
      expect(gate?.enabled).toBe(true);
      expect(gate?.reason).toBe('2D tracking active');
      expect(gate?.confidence).toBe(0.92);
    });

    it('rejects malformed capability gate', () => {
      expect(parseCapabilityGate(null)).toBeNull();
      expect(parseCapabilityGate({ reason: 'missing enabled' })).toBeNull();
      expect(parseCapabilityGate('not an object')).toBeNull();
    });

    it('parses complete 6-gate SegmentCapabilities', () => {
      const caps = parseSegmentCapabilities(validCapsPayload);
      expect(caps).not.toBeNull();
      expect(caps?.canTrackPlayer.enabled).toBe(true);
      expect(caps?.canTrackShuttle.enabled).toBe(true);
      expect(caps?.canUseCourtMetric.enabled).toBe(true);
      expect(caps?.canBuildHeatmap.enabled).toBe(true);
      expect(caps?.canEstimateHit.enabled).toBe(true);
      expect(caps?.canWriteCanonicalMatchData.enabled).toBe(true);
    });

    it('rejects partial capabilities missing gates', () => {
      const partial = {
        canTrackPlayer: { enabled: true, reason: 'ok', confidence: 1.0 },
      };
      expect(parseSegmentCapabilities(partial)).toBeNull();
    });
  });

  describe('parseSceneTransition with capabilities', () => {
    it('extracts capabilities and boolean shortcuts from transition payload', () => {
      const rawTransition = {
        transitionId: 'st-test123456',
        cameraSegmentId: 'segment-1',
        frameIndex: 120,
        timestampSec: 4.0,
        fromState: 'COURT_IDLE',
        toState: 'COURT_PLAY',
        confidence: 0.95,
        reason: 'Players active on court',
        evidence: {
          camera_cut_detected: false,
          court_visible: true,
          calibration_state: 'CALIBRATED',
        },
        isMetricValid: true,
        allowCanonicalWrites: true,
        capabilities: validCapsPayload,
        canTrackPlayer: true,
        canTrackShuttle: true,
        canUseCourtMetric: true,
        canBuildHeatmap: true,
        canEstimateHit: true,
        canWriteCanonicalMatchData: true,
      };

      const parsed = parseSceneTransition(rawTransition);
      expect(parsed).not.toBeNull();
      expect(parsed?.capabilities?.canUseCourtMetric.enabled).toBe(true);
      expect(parsed?.canTrackPlayer).toBe(true);
      expect(parsed?.canUseCourtMetric).toBe(true);
      expect(parsed?.canWriteCanonicalMatchData).toBe(true);
    });
  });

  describe('toTrackingTelemetryV1 normalization', () => {
    it('normalizes telemetry frame and propagates capabilities and unavailable reasons', () => {
      const rawFrame = {
        frameIndex: 45,
        timestampSec: 1.5,
        sceneState: 'COURT_PLAY',
        cameraSegmentId: 'segment-2',
        calibrationState: 'RECALIBRATING',
        calibrationUnavailableReason: 'Camera cut detected: searching for court lines',
        capabilities: {
          ...validCapsPayload,
          canUseCourtMetric: {
            enabled: false,
            reason: 'Court recalibration in progress: metric coordinates suspended',
            confidence: 0.0,
          },
          canBuildHeatmap: {
            enabled: false,
            reason: 'Heatmap accumulation requires locked court metric calibration',
            confidence: 0.0,
          },
          canEstimateHit: {
            enabled: false,
            reason: 'Hit estimation contract unavailable: requires court metric calibration',
            confidence: 0.0,
          },
          canWriteCanonicalMatchData: {
            enabled: false,
            reason: 'Canonical match writes suspended: court recalibrating',
            confidence: 0.0,
          },
        },
        players: [],
      };

      const norm = toTrackingTelemetryV1(rawFrame);
      expect(norm.frameIndex).toBe(45);
      expect(norm.canTrackPlayer).toBe(true);
      expect(norm.canTrackShuttle).toBe(true);
      expect(norm.canUseCourtMetric).toBe(false);
      expect(norm.canBuildHeatmap).toBe(false);
      expect(norm.canEstimateHit).toBe(false);
      expect(norm.canWriteCanonicalMatchData).toBe(false);
      expect(norm.isMetricValid).toBe(false);
      expect(norm.calibrationUnavailableReason).toBe('Camera cut detected: searching for court lines');
    });
  });

  describe('Heatmap & Metric Integrity Rule', () => {
    it('strictly forbids accumulating (0, 0) or uncalibrated points in heatmaps', () => {
      const samples = [
        { trackingState: 'tracked', courtX: 2.5, courtY: 5.0, canBuildHeatmap: true },
        { trackingState: 'tracked', courtX: 0.0, courtY: 0.0, canBuildHeatmap: true }, // Zero artifact -> MUST SKIP
        { trackingState: 'tracked', courtX: 3.0, courtY: 8.0, canBuildHeatmap: false }, // Metric invalid -> MUST SKIP
        { trackingState: 'lost', courtX: 2.5, courtY: 5.0, canBuildHeatmap: true }, // Lost -> MUST SKIP
        { trackingState: 'tracked', courtX: 4.1, courtY: 6.2, canBuildHeatmap: true }, // Valid
      ];

      // Simulate heatmap binning rule
      const validForHeatmap = samples.filter((s) => {
        if (s.trackingState !== 'tracked') return false;
        if (
          s.courtX == null ||
          s.courtY == null ||
          !Number.isFinite(s.courtX) ||
          !Number.isFinite(s.courtY) ||
          (s.courtX === 0 && s.courtY === 0) ||
          s.canBuildHeatmap === false
        ) {
          return false;
        }
        return true;
      });

      expect(validForHeatmap).toHaveLength(2);
      expect(validForHeatmap[0]).toEqual({ trackingState: 'tracked', courtX: 2.5, courtY: 5.0, canBuildHeatmap: true });
      expect(validForHeatmap[1]).toEqual({ trackingState: 'tracked', courtX: 4.1, courtY: 6.2, canBuildHeatmap: true });
    });
  });
});
