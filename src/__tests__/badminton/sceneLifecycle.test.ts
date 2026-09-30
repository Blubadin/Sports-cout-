import { describe, expect, it } from 'vitest';
import {
  SCENE_STATES,
  isSceneState,
  parseSceneEvidence,
  parseSceneTransition,
} from '../../types/scene';
import { isMetricCalibrationValid } from '../../types/calibration';
import { toTrackingTelemetryV1 } from '../../services/trackingSessionApi';

describe('Scene Lifecycle & State Contract', () => {
  it('contains the canonical 7 coarse scene states', () => {
    expect(SCENE_STATES).toEqual([
      'COURT_PLAY',
      'COURT_IDLE',
      'SIDE_PLAY',
      'CLOSE_UP',
      'REPLAY',
      'CAMERA_TRANSITION',
      'UNKNOWN',
    ]);
    expect(isSceneState('COURT_PLAY')).toBe(true);
    expect(isSceneState('REPLAY')).toBe(true);
    expect(isSceneState('INVALID_STATE')).toBe(false);
  });

  it('parses structured scene evidence correctly', () => {
    const raw = {
      camera_cut_detected: true,
      court_visible: false,
      court_edge_coverage: 0.015,
      calibration_state: 'CALIBRATION_LOST',
      calibration_confidence: null,
      player_count: 1,
      max_player_box_area_ratio: 0.35,
      global_motion_magnitude: 4.5,
      is_pan_tilt_zoom: true,
      is_replay_cue: false,
      manual_override: true,
      manual_override_by: 'reviewer_1',
      notes: 'manual test override',
    };
    const evidence = parseSceneEvidence(raw);
    expect(evidence).not.toBeNull();
    expect(evidence?.camera_cut_detected).toBe(true);
    expect(evidence?.max_player_box_area_ratio).toBe(0.35);
    expect(evidence?.manual_override_by).toBe('reviewer_1');
    expect(evidence?.notes).toBe('manual test override');
  });

  it('parses scene transition with metric validity and write permissions', () => {
    const raw = {
      transitionId: 'st-12345',
      cameraSegmentId: 'segment-1',
      frameIndex: 42,
      timestampSec: 1.4,
      fromState: 'COURT_PLAY',
      toState: 'CAMERA_TRANSITION',
      confidence: 0.95,
      reason: 'Hard camera cut detected: visual discontinuity across frame',
      evidence: {
        camera_cut_detected: true,
        court_visible: false,
        court_edge_coverage: 0.01,
        calibration_state: 'CALIBRATION_LOST',
        player_count: 0,
        max_player_box_area_ratio: 0.0,
        global_motion_magnitude: 0.0,
        is_pan_tilt_zoom: false,
        is_replay_cue: false,
        manual_override: false,
      },
      isMetricValid: false,
      allowCanonicalWrites: false,
    };
    const transition = parseSceneTransition(raw);
    expect(transition).not.toBeNull();
    expect(transition?.transitionId).toBe('st-12345');
    expect(transition?.fromState).toBe('COURT_PLAY');
    expect(transition?.toState).toBe('CAMERA_TRANSITION');
    expect(transition?.isMetricValid).toBe(false);
    expect(transition?.allowCanonicalWrites).toBe(false);
  });

  describe('isMetricCalibrationValid scene gates', () => {
    const validCal = {
      calibrationId: 'cal-1',
      cameraSegmentId: 'segment-0',
      state: 'CALIBRATED' as const,
      source: 'automatic' as const,
      createdAtFrame: 0,
      createdAtTimestampSec: 0.0,
    };

    it('allows metric calibration on COURT_PLAY and COURT_IDLE when calibrated', () => {
      expect(
        isMetricCalibrationValid({
          calibrationState: 'CALIBRATED',
          cameraSegmentId: 'segment-0',
          calibrationId: 'cal-1',
          calibration: validCal,
          sceneState: 'COURT_PLAY',
          isMetricValid: true,
        }),
      ).toBe(true);

      expect(
        isMetricCalibrationValid({
          calibrationState: 'CALIBRATED',
          cameraSegmentId: 'segment-0',
          calibrationId: 'cal-1',
          calibration: validCal,
          sceneState: 'COURT_IDLE',
          isMetricValid: true,
        }),
      ).toBe(true);
    });

    it('rejects metrics on CAMERA_TRANSITION, REPLAY, SIDE_PLAY, CLOSE_UP, and UNKNOWN', () => {
      for (const blockedState of ['CAMERA_TRANSITION', 'REPLAY', 'SIDE_PLAY', 'CLOSE_UP', 'UNKNOWN']) {
        expect(
          isMetricCalibrationValid({
            calibrationState: 'CALIBRATED',
            cameraSegmentId: 'segment-0',
            calibrationId: 'cal-1',
            calibration: validCal,
            sceneState: blockedState,
            isMetricValid: true,
          }),
        ).toBe(false);
      }
    });

    it('rejects metrics when isMetricValid is explicitly false regardless of state', () => {
      expect(
        isMetricCalibrationValid({
          calibrationState: 'CALIBRATED',
          cameraSegmentId: 'segment-0',
          calibrationId: 'cal-1',
          calibration: validCal,
          sceneState: 'COURT_PLAY',
          isMetricValid: false,
        }),
      ).toBe(false);
    });
  });

  describe('normalizeTelemetryFrame integration', () => {
    it('normalizes telemetry frame with scene transition contract', () => {
      const frame = {
        schemaVersion: 1,
        analysisId: 'session_test',
        timestampSec: 0.5,
        frameIndex: 15,
        sceneState: 'REPLAY',
        isMetricValid: false,
        allowCanonicalWrites: false,
        sceneTransition: {
          transitionId: 'st-rep',
          cameraSegmentId: 'segment-1',
          frameIndex: 15,
          timestampSec: 0.5,
          fromState: 'COURT_PLAY',
          toState: 'REPLAY',
          confidence: 0.9,
          reason: 'Manual replay override',
          evidence: {
            manual_override: true,
            manual_override_by: 'var_official',
            notes: 'reviewing line call',
          },
          isMetricValid: false,
          allowCanonicalWrites: false,
        },
        players: [],
      };
      const normalized = toTrackingTelemetryV1(frame);
      expect(normalized.sceneState).toBe('REPLAY');
      expect(normalized.isMetricValid).toBe(false);
      expect(normalized.allowCanonicalWrites).toBe(false);
      expect(normalized.sceneTransition?.toState).toBe('REPLAY');
      expect(normalized.sceneTransition?.reason).toBe('Manual replay override');
    });
  });
});
