/**
 * SportsScout Canonical Shuttlecock Telemetry Contract (Phase 2.1)
 *
 * Defines the standard telemetry structures, state semantics, and source provenance
 * for badminton shuttlecock tracking across:
 * - Temporal trackers (e.g. TrackNet, WASB)
 * - Auxiliary object detectors (e.g. YOLO patch detectors)
 * - UI overlays and telemetry streams
 * - Benchmarks and Scout fusion
 *
 * Invariants:
 * 1. State distinctness: observed ≠ predicted ≠ interpolated ≠ lost ≠ unknown.
 * 2. Coordinate honesty: Unknown or missing coordinates must remain null.
 *    No coordinate may silently become (0, 0) when missing.
 * 3. Measured zeroes: Measured coordinate (0, 0) at the frame's top-left IS VALID
 *    when actually measured under observed/predicted/interpolated states.
 * 4. Separate stream: Shuttle telemetry is tracked in a dedicated `shuttle` field
 *    on TrackingFrame / TrackingTelemetryV1, never mixed inside player arrays.
 */

/**
 * Explicit operational state of the shuttlecock for a given frame.
 *
 * Definitions:
 * - 'observed': Fresh visual measurement from model or manual annotation.
 * - 'predicted': Tracker extrapolation/estimate without a fresh visual measurement.
 * - 'interpolated': Derived/smoothed point between verified observations.
 * - 'lost': Tracker cannot reliably determine current shuttle presence/location.
 * - 'unknown': Insufficient or uninitialized information.
 */
export type ShuttleState = 'observed' | 'predicted' | 'interpolated' | 'lost' | 'unknown';

/**
 * Origin source producing the shuttle observation.
 */
export type ShuttleObservationSource =
  | 'temporal_tracker'
  | 'auxiliary_detector'
  | 'manual'
  | 'model_assisted'
  | 'unknown';

export const VALID_SHUTTLE_STATES: readonly ShuttleState[] = [
  'observed',
  'predicted',
  'interpolated',
  'lost',
  'unknown',
] as const;

export const VALID_SHUTTLE_SOURCES: readonly ShuttleObservationSource[] = [
  'temporal_tracker',
  'auxiliary_detector',
  'manual',
  'model_assisted',
  'unknown',
] as const;

/**
 * 2D pixel coordinates in native video frame space.
 */
export interface ShuttlePositionPx {
  x: number;
  y: number;
}

/**
 * 2D pixel velocity in pixels per second.
 */
export interface ShuttleVelocityPx {
  vx: number;
  vy: number;
}

/**
 * Canonical shuttlecock observation for a single frame.
 */
export interface ShuttleObservation {
  /** Frame presentation timestamp in seconds */
  timestampSec: number;
  /** Zero-indexed video frame number */
  frameIndex: number;
  /** 2D image coordinate in native pixels, or null if lost/unknown/missing */
  positionPx: ShuttlePositionPx | null;
  /** Model confidence score in range [0.0, 1.0], or null if unmeasured */
  confidence: number | null;
  /** Explicit operational tracking state */
  state: ShuttleState;
  /** Provenance source that generated this observation */
  source: ShuttleObservationSource;
  /** Active trajectory or rally identifier (null if lost or unassigned) */
  trajectoryId: string | number | null;
  /** Optional velocity in pixels per second (only if genuinely measured/derived) */
  velocityPxPerSec?: ShuttleVelocityPx | null;
  /** Optional scalar speed in pixels per second (only if genuinely measured/derived) */
  speedPxPerSec?: number | null;
}

/**
 * Execution and benchmark provenance configuration for a shuttle tracking run.
 */
export interface ShuttleRunConfig {
  /** Identifier of the primary tracker model (e.g. 'tracknet_v2', 'wasb_v2', 'baseline_kalman') */
  trackerModel: string;
  /** Tracker model version string if available */
  trackerVersion?: string | null;
  /** Temporal frame window size (e.g. 3, 5, 8 frames) */
  windowSize?: number | null;
  /** Input image width fed to tracker */
  inputWidth?: number | null;
  /** Input image height fed to tracker */
  inputHeight?: number | null;
  /** Minimum detection/tracking confidence threshold (0.0..1.0) */
  confidenceThreshold?: number | null;
  /** Execution hardware device ('cpu', 'cuda', 'mps', 'tensorrt') */
  device?: string | null;
  /** Execution runtime environment ('pytorch', 'onnxruntime', 'tensorrt', 'openvino') */
  runtime?: string | null;
  /** Numerical precision ('fp32', 'fp16', 'int8', 'bf16') */
  precision?: string | null;
  /** Auxiliary object detector name if used (e.g. 'yolov8x-shuttle') */
  auxiliaryDetector?: string | null;
  /** Auxiliary detector version if available */
  auxiliaryDetectorVersion?: string | null;
}

/**
 * Canonical unified tracking frame housing both athlete tracking and the separate shuttle stream.
 */
export interface TrackingFrame<TPlayer = unknown> {
  timestampSec: number;
  frameIndex: number;
  players: TPlayer[];
  shuttle: ShuttleObservation | null;
  [key: string]: unknown;
}

// ============================================================================
// State Checkers
// ============================================================================

export function isShuttleObserved(obs: ShuttleObservation | null | undefined): boolean {
  return obs?.state === 'observed';
}

export function isShuttlePredicted(obs: ShuttleObservation | null | undefined): boolean {
  return obs?.state === 'predicted';
}

export function isShuttleInterpolated(obs: ShuttleObservation | null | undefined): boolean {
  return obs?.state === 'interpolated';
}

export function isShuttleLost(obs: ShuttleObservation | null | undefined): boolean {
  return obs?.state === 'lost';
}

export function isShuttleUnknown(obs: ShuttleObservation | null | undefined): boolean {
  return obs?.state === 'unknown';
}

export function hasShuttlePosition(
  obs: ShuttleObservation | null | undefined
): obs is ShuttleObservation & { positionPx: ShuttlePositionPx } {
  return (
    obs !== null &&
    obs !== undefined &&
    obs.positionPx !== null &&
    typeof obs.positionPx.x === 'number' &&
    Number.isFinite(obs.positionPx.x) &&
    typeof obs.positionPx.y === 'number' &&
    Number.isFinite(obs.positionPx.y)
  );
}

// ============================================================================
// Builder & Validation
// ============================================================================

export function createShuttleObservation(
  params: Partial<ShuttleObservation> & {
    timestampSec: number;
    frameIndex: number;
    state: ShuttleState;
  }
): ShuttleObservation {
  return {
    timestampSec: params.timestampSec,
    frameIndex: params.frameIndex,
    positionPx: params.positionPx ?? null,
    confidence: params.confidence ?? null,
    state: params.state,
    source: params.source ?? 'unknown',
    trajectoryId: params.trajectoryId ?? null,
    velocityPxPerSec: params.velocityPxPerSec ?? null,
    speedPxPerSec: params.speedPxPerSec ?? null,
  };
}

export function validateShuttleObservation(obs: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!obs || typeof obs !== 'object') {
    return { valid: false, errors: ['ShuttleObservation must be an object'] };
  }

  const o = obs as Record<string, unknown>;

  // timestampSec
  if (typeof o.timestampSec !== 'number' || !Number.isFinite(o.timestampSec) || o.timestampSec < 0) {
    errors.push('timestampSec must be a non-negative finite number');
  }

  // frameIndex
  if (typeof o.frameIndex !== 'number' || !Number.isInteger(o.frameIndex) || o.frameIndex < 0) {
    errors.push('frameIndex must be a non-negative integer');
  }

  // state
  if (typeof o.state !== 'string' || !VALID_SHUTTLE_STATES.includes(o.state as ShuttleState)) {
    errors.push(
      `state must be one of: ${VALID_SHUTTLE_STATES.join(', ')} (got: ${String(o.state)})`
    );
  }

  // source
  if (typeof o.source !== 'string' || !VALID_SHUTTLE_SOURCES.includes(o.source as ShuttleObservationSource)) {
    errors.push(
      `source must be one of: ${VALID_SHUTTLE_SOURCES.join(', ')} (got: ${String(o.source)})`
    );
  }

  // confidence
  if (o.confidence !== null && o.confidence !== undefined) {
    if (typeof o.confidence !== 'number' || !Number.isFinite(o.confidence) || o.confidence < 0 || o.confidence > 1) {
      errors.push('confidence must be a number between 0.0 and 1.0 or null');
    }
  }

  const state = o.state as ShuttleState;

  // Position semantics
  if (state === 'observed') {
    if (o.positionPx === null || o.positionPx === undefined) {
      errors.push('observed state requires a valid positionPx {x, y}');
    } else if (typeof o.positionPx !== 'object') {
      errors.push('positionPx must be an object {x, y} or null');
    } else {
      const pos = o.positionPx as Record<string, unknown>;
      if (typeof pos.x !== 'number' || !Number.isFinite(pos.x)) {
        errors.push('positionPx.x must be a finite number');
      }
      if (typeof pos.y !== 'number' || !Number.isFinite(pos.y)) {
        errors.push('positionPx.y must be a finite number');
      }
    }
  } else if (state === 'lost' || state === 'unknown') {
    if (o.positionPx !== null && o.positionPx !== undefined) {
      if (typeof o.positionPx === 'object') {
        const pos = o.positionPx as Record<string, unknown>;
        if (pos.x === 0 && pos.y === 0) {
          errors.push(
            `${state} shuttle must not represent missing coordinates as fake zero (0, 0); positionPx must be null`
          );
        } else {
          errors.push(`${state} shuttle must have null positionPx`);
        }
      } else {
        errors.push(`${state} shuttle must have null positionPx`);
      }
    }
  } else if (state === 'predicted' || state === 'interpolated') {
    if (o.positionPx !== null && o.positionPx !== undefined) {
      if (typeof o.positionPx !== 'object') {
        errors.push('positionPx must be an object {x, y} or null');
      } else {
        const pos = o.positionPx as Record<string, unknown>;
        if (typeof pos.x !== 'number' || !Number.isFinite(pos.x)) {
          errors.push('positionPx.x must be a finite number');
        }
        if (typeof pos.y !== 'number' || !Number.isFinite(pos.y)) {
          errors.push('positionPx.y must be a finite number');
        }
      }
    }
  }

  // Velocity (optional)
  if (o.velocityPxPerSec !== null && o.velocityPxPerSec !== undefined) {
    if (typeof o.velocityPxPerSec !== 'object') {
      errors.push('velocityPxPerSec must be an object {vx, vy} or null');
    } else {
      const vel = o.velocityPxPerSec as Record<string, unknown>;
      if (typeof vel.vx !== 'number' || !Number.isFinite(vel.vx)) {
        errors.push('velocityPxPerSec.vx must be a finite number');
      }
      if (typeof vel.vy !== 'number' || !Number.isFinite(vel.vy)) {
        errors.push('velocityPxPerSec.vy must be a finite number');
      }
    }
  }

  // Speed (optional)
  if (o.speedPxPerSec !== null && o.speedPxPerSec !== undefined) {
    if (typeof o.speedPxPerSec !== 'number' || !Number.isFinite(o.speedPxPerSec) || o.speedPxPerSec < 0) {
      errors.push('speedPxPerSec must be a non-negative finite number or null');
    }
  }

  return { valid: errors.length === 0, errors };
}
