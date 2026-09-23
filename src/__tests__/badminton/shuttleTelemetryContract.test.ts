import { describe, it, expect } from 'vitest';
import {
  createShuttleObservation,
  validateShuttleObservation,
  isShuttleObserved,
  isShuttlePredicted,
  isShuttleInterpolated,
  isShuttleLost,
  isShuttleUnknown,
  hasShuttlePosition,
  type ShuttleObservation,
  type ShuttleRunConfig,
  type TrackingFrame,
} from '../../types/shuttleTelemetry';
import { toTrackingTelemetryV1 } from '../../services/trackingSessionApi';

describe('Phase 2.1 — Canonical Shuttle Telemetry Contract', () => {
  // 1. OBSERVED POSITION
  describe('1. Observed position semantics', () => {
    it('creates and validates a fresh observed visual measurement', () => {
      const obs: ShuttleObservation = {
        timestampSec: 1.45,
        frameIndex: 43,
        state: 'observed',
        source: 'temporal_tracker',
        positionPx: { x: 960.5, y: 340.2 },
        confidence: 0.94,
        trajectoryId: 'traj_01',
        velocityPxPerSec: { vx: -120.5, vy: 450.0 },
        speedPxPerSec: 465.8,
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(isShuttleObserved(obs)).toBe(true);
      expect(isShuttlePredicted(obs)).toBe(false);
      expect(hasShuttlePosition(obs)).toBe(true);
      if (hasShuttlePosition(obs)) {
        expect(obs.positionPx.x).toBe(960.5);
        expect(obs.positionPx.y).toBe(340.2);
      }
    });

    it('rejects an observed shuttle when positionPx is missing or null', () => {
      const obs = createShuttleObservation({
        timestampSec: 1.45,
        frameIndex: 43,
        state: 'observed',
        source: 'temporal_tracker',
        positionPx: null,
      });

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('observed state requires a valid positionPx'))).toBe(true);
    });
  });

  // 2. PREDICTED POSITION
  describe('2. Predicted position semantics', () => {
    it('creates and validates a predicted tracker estimate without fresh visual measurement', () => {
      const obs: ShuttleObservation = {
        timestampSec: 1.483,
        frameIndex: 44,
        state: 'predicted',
        source: 'temporal_tracker',
        positionPx: { x: 955.0, y: 360.0 },
        confidence: 0.72,
        trajectoryId: 'traj_01',
        velocityPxPerSec: { vx: -120.0, vy: 445.0 },
        speedPxPerSec: 460.9,
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(isShuttlePredicted(obs)).toBe(true);
      expect(isShuttleObserved(obs)).toBe(false);
    });
  });

  // 3. INTERPOLATED POSITION
  describe('3. Interpolated position semantics', () => {
    it('creates and validates an interpolated point derived between verified observations', () => {
      const obs: ShuttleObservation = {
        timestampSec: 1.516,
        frameIndex: 45,
        state: 'interpolated',
        source: 'model_assisted',
        positionPx: { x: 950.0, y: 380.0 },
        confidence: 0.85,
        trajectoryId: 'traj_01',
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(isShuttleInterpolated(obs)).toBe(true);
      expect(isShuttleObserved(obs)).toBe(false);
      expect(isShuttlePredicted(obs)).toBe(false);
    });
  });

  // 4. LOST POSITION
  describe('4. Lost position semantics', () => {
    it('validates lost state with null positionPx', () => {
      const obs: ShuttleObservation = {
        timestampSec: 2.1,
        frameIndex: 63,
        state: 'lost',
        source: 'temporal_tracker',
        positionPx: null,
        confidence: null,
        trajectoryId: null,
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(isShuttleLost(obs)).toBe(true);
      expect(hasShuttlePosition(obs)).toBe(false);
    });
  });

  // 5. UNKNOWN STATE
  describe('5. Unknown state semantics', () => {
    it('validates unknown state with null positionPx', () => {
      const obs: ShuttleObservation = {
        timestampSec: 0.0,
        frameIndex: 0,
        state: 'unknown',
        source: 'unknown',
        positionPx: null,
        confidence: null,
        trajectoryId: null,
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(isShuttleUnknown(obs)).toBe(true);
    });
  });

  // 6. MISSING COORDINATES
  describe('6. Missing coordinates handling', () => {
    it('ensures unobserved shuttle leaves coordinates strictly null', () => {
      const obs = createShuttleObservation({
        timestampSec: 0.1,
        frameIndex: 3,
        state: 'lost',
      });

      expect(obs.positionPx).toBeNull();
      expect(obs.confidence).toBeNull();
      expect(validateShuttleObservation(obs).valid).toBe(true);
    });
  });

  // 7. MEASURED COORDINATE (0, 0) IS VALID WHEN ACTUALLY MEASURED
  describe('7. Measured coordinate (0, 0) is valid when actually measured', () => {
    it('allows positionPx = { x: 0, y: 0 } when shuttle is genuinely observed at top-left corner', () => {
      const obs: ShuttleObservation = {
        timestampSec: 3.2,
        frameIndex: 96,
        state: 'observed',
        source: 'manual',
        positionPx: { x: 0, y: 0 },
        confidence: 1.0,
        trajectoryId: 'traj_02',
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(obs.positionPx?.x).toBe(0);
      expect(obs.positionPx?.y).toBe(0);
    });

    it('allows positionPx = { x: 0, y: 0 } for predicted state when extrapolation lands at (0, 0)', () => {
      const obs: ShuttleObservation = {
        timestampSec: 3.233,
        frameIndex: 97,
        state: 'predicted',
        source: 'temporal_tracker',
        positionPx: { x: 0, y: 0 },
        confidence: 0.5,
        trajectoryId: 'traj_02',
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // 8. UNKNOWN ≠ MEASURED ZERO: NO SILENT FAKE (0, 0)
  describe('8. Unknown ≠ measured zero: No silent fake (0, 0)', () => {
    it('strictly rejects lost state with fake zero coordinates (0, 0)', () => {
      const obs: ShuttleObservation = {
        timestampSec: 4.0,
        frameIndex: 120,
        state: 'lost',
        source: 'temporal_tracker',
        positionPx: { x: 0, y: 0 },
        confidence: null,
        trajectoryId: null,
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('fake zero (0, 0)'))).toBe(true);
    });

    it('strictly rejects unknown state with fake zero coordinates (0, 0)', () => {
      const obs: ShuttleObservation = {
        timestampSec: 4.033,
        frameIndex: 121,
        state: 'unknown',
        source: 'unknown',
        positionPx: { x: 0, y: 0 },
        confidence: null,
        trajectoryId: null,
      };

      const result = validateShuttleObservation(obs);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('fake zero (0, 0)'))).toBe(true);
    });
  });

  // 9. BACKWARD COMPATIBILITY: OLD SESSIONS WITHOUT SHUTTLE
  describe('9. Backward compatibility: Old sessions without shuttle', () => {
    it('deserializes legacy telemetry frame without shuttle field safely with shuttle: null', () => {
      const legacyPayload = {
        schemaVersion: 1,
        analysisId: 'legacy_session_123',
        timestampSec: 10.5,
        frameIndex: 315,
        trackedPlayerCount: 2,
        players: [
          {
            playerId: 'P1',
            trackId: 1,
            court_pos_pct: { x: 0.5, y: 0.8 },
            court_pos_m: { x: 3.05, y: 11.0 },
            zone: 'REAR_RIGHT',
            speed_ms: 2.1,
            total_dist_m: 140.0,
            is_active: true,
          },
        ],
      };

      const v1Telemetry = toTrackingTelemetryV1(legacyPayload);
      expect(v1Telemetry).toBeDefined();
      expect(v1Telemetry.analysisId).toBe('legacy_session_123');
      expect(v1Telemetry.players).toHaveLength(1);
      // Shuttle must be null without error
      expect(v1Telemetry.shuttle).toBeNull();
    });

    it('deserializes new telemetry frame with shuttle field properly', () => {
      const modernPayload = {
        schemaVersion: 1,
        analysisId: 'modern_session_456',
        timestampSec: 12.0,
        frameIndex: 360,
        trackedPlayerCount: 2,
        players: [],
        shuttle: {
          timestampSec: 12.0,
          frameIndex: 360,
          state: 'observed',
          source: 'temporal_tracker',
          positionPx: { x: 800.0, y: 400.0 },
          confidence: 0.98,
          trajectoryId: 'traj_10',
          speedPxPerSec: 350.0,
        },
      };

      const v1Telemetry = toTrackingTelemetryV1(modernPayload);
      expect(v1Telemetry.shuttle).toBeDefined();
      expect(v1Telemetry.shuttle).not.toBeNull();
      expect(v1Telemetry.shuttle?.state).toBe('observed');
      expect(v1Telemetry.shuttle?.positionPx?.x).toBe(800.0);
      expect(v1Telemetry.shuttle?.positionPx?.y).toBe(400.0);
      expect(v1Telemetry.shuttle?.speedPxPerSec).toBe(350.0);
    });
  });

  // 10. SERIALIZATION / DESERIALIZATION ROUNDTRIP
  describe('10. Serialization / deserialization roundtrip', () => {
    it('roundtrips a TrackingFrame containing both players and shuttle through JSON', () => {
      const originalFrame: TrackingFrame = {
        timestampSec: 5.0,
        frameIndex: 150,
        players: [
          { playerId: 'P1', state: 'observed' },
          { playerId: 'P2', state: 'observed' },
        ],
        shuttle: {
          timestampSec: 5.0,
          frameIndex: 150,
          state: 'observed',
          source: 'temporal_tracker',
          positionPx: { x: 1024.0, y: 512.0 },
          confidence: 0.91,
          trajectoryId: 'rally_03',
          velocityPxPerSec: { vx: 50.0, vy: -200.0 },
          speedPxPerSec: 206.15,
        },
      };

      const jsonStr = JSON.stringify(originalFrame);
      const restored = JSON.parse(jsonStr) as TrackingFrame;

      expect(restored.timestampSec).toBe(5.0);
      expect(restored.frameIndex).toBe(150);
      expect(restored.players).toHaveLength(2);
      expect(restored.shuttle).not.toBeNull();
      expect(restored.shuttle?.positionPx?.x).toBe(1024.0);
      expect(restored.shuttle?.positionPx?.y).toBe(512.0);
      expect(restored.shuttle?.velocityPxPerSec?.vy).toBe(-200.0);
      expect(validateShuttleObservation(restored.shuttle).valid).toBe(true);
    });
  });

  // 11. BENCHMARK PROVENANCE: ShuttleRunConfig
  describe('11. Benchmark provenance: ShuttleRunConfig', () => {
    it('encapsulates complete tracker run and auxiliary detector configuration', () => {
      const config: ShuttleRunConfig = {
        trackerModel: 'tracknet_v2',
        trackerVersion: '2.1.0',
        windowSize: 3,
        inputWidth: 512,
        inputHeight: 288,
        confidenceThreshold: 0.5,
        device: 'cuda',
        runtime: 'tensorrt',
        precision: 'fp16',
        auxiliaryDetector: 'yolov8x-shuttle',
        auxiliaryDetectorVersion: '8.1.0',
      };

      expect(config.trackerModel).toBe('tracknet_v2');
      expect(config.windowSize).toBe(3);
      expect(config.precision).toBe('fp16');
      expect(config.auxiliaryDetector).toBe('yolov8x-shuttle');
    });
  });
});
