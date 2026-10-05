/**
 * Scene lifecycle and state transition definitions for SportsScout tracking workstation.
 */

export const SCENE_STATES = [
  'COURT_PLAY',
  'COURT_IDLE',
  'SIDE_PLAY',
  'CLOSE_UP',
  'REPLAY',
  'CAMERA_TRANSITION',
  'UNKNOWN',
] as const;

export type SceneState = (typeof SCENE_STATES)[number];

export interface SceneEvidence {
  camera_cut_detected: boolean;
  court_visible: boolean;
  court_edge_coverage: number;
  calibration_state: string;
  calibration_confidence?: number | null;
  player_count: number;
  max_player_box_area_ratio: number;
  global_motion_magnitude: number;
  is_pan_tilt_zoom: boolean;
  is_replay_cue: boolean;
  manual_override: boolean;
  manual_override_by?: string | null;
  notes?: string | null;
}

import { SegmentCapabilities, parseSegmentCapabilities } from './capabilities';

export interface SceneStateTransition {
  transitionId: string;
  cameraSegmentId: string;
  frameIndex: number;
  timestampSec: number;
  fromState: SceneState;
  toState: SceneState;
  confidence: number;
  reason: string;
  evidence: SceneEvidence;
  isMetricValid: boolean;
  allowCanonicalWrites: boolean;
  capabilities?: SegmentCapabilities | null;
  canTrackPlayer?: boolean;
  canTrackShuttle?: boolean;
  canUseCourtMetric?: boolean;
  canBuildHeatmap?: boolean;
  canEstimateHit?: boolean;
  canWriteCanonicalMatchData?: boolean;
}

export function isSceneState(value: unknown): value is SceneState {
  return typeof value === 'string' && (SCENE_STATES as readonly string[]).includes(value);
}

export function parseSceneEvidence(value: unknown): SceneEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const ev = value as Record<string, unknown>;
  return {
    camera_cut_detected: Boolean(ev.camera_cut_detected ?? ev.cameraCutDetected),
    court_visible: Boolean(ev.court_visible ?? ev.courtVisible),
    court_edge_coverage: Number(ev.court_edge_coverage ?? ev.courtEdgeCoverage ?? 0),
    calibration_state: String(ev.calibration_state ?? ev.calibrationState ?? 'UNCALIBRATED'),
    calibration_confidence:
      typeof ev.calibration_confidence === 'number'
        ? ev.calibration_confidence
        : typeof ev.calibrationConfidence === 'number'
          ? ev.calibrationConfidence
          : null,
    player_count: Number(ev.player_count ?? ev.playerCount ?? 0),
    max_player_box_area_ratio: Number(ev.max_player_box_area_ratio ?? ev.maxPlayerBoxAreaRatio ?? 0),
    global_motion_magnitude: Number(ev.global_motion_magnitude ?? ev.globalMotionMagnitude ?? 0),
    is_pan_tilt_zoom: Boolean(ev.is_pan_tilt_zoom ?? ev.isPanTiltZoom),
    is_replay_cue: Boolean(ev.is_replay_cue ?? ev.isReplayCue),
    manual_override: Boolean(ev.manual_override ?? ev.manualOverride),
    manual_override_by:
      typeof ev.manual_override_by === 'string'
        ? ev.manual_override_by
        : typeof ev.manualOverrideBy === 'string'
          ? ev.manualOverrideBy
          : null,
    notes: typeof ev.notes === 'string' ? ev.notes : null,
  };
}

export function parseSceneTransition(value: unknown): SceneStateTransition | null {
  if (!value || typeof value !== 'object') return null;
  const tr = value as Record<string, unknown>;
  const toState = String(tr.toState || tr.to_state || '');
  if (!isSceneState(toState)) return null;

  const fromStateStr = String(tr.fromState || tr.from_state || 'UNKNOWN');
  const fromState = isSceneState(fromStateStr) ? fromStateStr : 'UNKNOWN';

  return {
    transitionId: String(tr.transitionId || tr.transition_id || ''),
    cameraSegmentId: String(tr.cameraSegmentId || tr.camera_segment_id || ''),
    frameIndex: Number(tr.frameIndex ?? tr.frame_index ?? 0),
    timestampSec: Number(tr.timestampSec ?? tr.timestamp_sec ?? 0),
    fromState,
    toState,
    confidence: Number(tr.confidence ?? 0),
    reason: String(tr.reason ?? ''),
    evidence: parseSceneEvidence(tr.evidence) || {
      camera_cut_detected: false,
      court_visible: false,
      court_edge_coverage: 0,
      calibration_state: 'UNCALIBRATED',
      player_count: 0,
      max_player_box_area_ratio: 0,
      global_motion_magnitude: 0,
      is_pan_tilt_zoom: false,
      is_replay_cue: false,
      manual_override: false,
    },
    isMetricValid: Boolean(tr.isMetricValid ?? tr.is_metric_valid),
    allowCanonicalWrites: Boolean(tr.allowCanonicalWrites ?? tr.allow_canonical_writes),
    capabilities: parseSegmentCapabilities(tr.capabilities),
    canTrackPlayer: typeof tr.canTrackPlayer === 'boolean' ? tr.canTrackPlayer : undefined,
    canTrackShuttle: typeof tr.canTrackShuttle === 'boolean' ? tr.canTrackShuttle : undefined,
    canUseCourtMetric: typeof tr.canUseCourtMetric === 'boolean' ? tr.canUseCourtMetric : undefined,
    canBuildHeatmap: typeof tr.canBuildHeatmap === 'boolean' ? tr.canBuildHeatmap : undefined,
    canEstimateHit: typeof tr.canEstimateHit === 'boolean' ? tr.canEstimateHit : undefined,
    canWriteCanonicalMatchData: typeof tr.canWriteCanonicalMatchData === 'boolean' ? tr.canWriteCanonicalMatchData : undefined,
  };
}
