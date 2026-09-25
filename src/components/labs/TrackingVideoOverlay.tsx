import React from 'react';
import type {
  TrackingTelemetryV1,
  TrackingPlayerV1,
  TrackingOverlayMode,
  BodyCenterProxy,
  FeetPositionProxy,
} from '../../types';

const BONES = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], [5, 11], [6, 12],
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [0, 1], [0, 2], [1, 3], [2, 4],
];

const CONFIDENCE_THRESHOLD = 0.4;
const DEFAULT_FRESHNESS_TOLERANCE_SEC = 0.15;
const MAX_FRESHNESS_TOLERANCE_SEC = 0.225;
const CADENCE_TOLERANCE_MULTIPLIER = 1.5;
const MAX_CADENCE_INTERVAL_SAMPLES = 31;
const TIME_EPSILON_SEC = 1e-6;

export type OverlayPlayerProvenance = TrackingPlayerV1['state'] | 'interpolated';

export interface ResolvedOverlayPlayer {
  player: TrackingPlayerV1;
  provenance: OverlayPlayerProvenance;
}

export interface OverlayTimeResolution {
  status: 'resolved' | 'stale' | 'unavailable';
  players: ResolvedOverlayPlayer[];
  freshnessToleranceSec: number;
  sourceTimestampSec?: number;
  nextTimestampSec?: number;
  ageSec?: number;
}

function isPointReliable(pt?: { x: number; y: number; score: number }): boolean {
  return !!pt && pt.score >= CONFIDENCE_THRESHOLD && Number.isFinite(pt.x) && Number.isFinite(pt.y);
}

/**
 * Pure resolver for Body Center Proxy (Phase 3.3).
 * Internal terminology: Body Center Proxy (never Center of Mass).
 * Hierarchy:
 * 1. Midpoint of reliable left/right hips
 * 2. Midpoint of reliable left/right shoulders
 * 3. Midpoint between hip center and shoulder center
 * Fallback: Bounding box center (provenance: 'bbox')
 */
export function resolveBodyCenterProxy(player: TrackingPlayerV1): BodyCenterProxy | null {
  const kps = player.pose?.keypoints;
  let hipCenter: { x: number; y: number } | null = null;
  let shoulderCenter: { x: number; y: number } | null = null;

  if (kps && kps.length >= 17) {
    const lh = kps[11];
    const rh = kps[12];
    if (isPointReliable(lh) && isPointReliable(rh)) {
      hipCenter = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    }

    const ls = kps[5];
    const rs = kps[6];
    if (isPointReliable(ls) && isPointReliable(rs)) {
      shoulderCenter = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    }

    if (hipCenter && shoulderCenter) {
      return {
        xPct: (hipCenter.x + shoulderCenter.x) / 2,
        yPct: (hipCenter.y + shoulderCenter.y) / 2,
        provenance: 'pose',
      };
    }

    if (hipCenter) {
      return {
        xPct: hipCenter.x,
        yPct: hipCenter.y,
        provenance: 'pose',
      };
    }

    if (shoulderCenter) {
      return {
        xPct: shoulderCenter.x,
        yPct: shoulderCenter.y,
        provenance: 'pose',
      };
    }
  }

  // Fallback to bounding-box center (do not invent confidence)
  if (player.bboxPct) {
    return {
      xPct: player.bboxPct.x + player.bboxPct.width / 2,
      yPct: player.bboxPct.y + player.bboxPct.height / 2,
      provenance: 'bbox',
    };
  }

  return null;
}

/**
 * Pure resolver for Feet Position (Phase 3.4).
 * For visualization only. Not Center of Pressure / force plate point.
 * Priority:
 * 1. Midpoint of two reliable ankles
 * 2. One reliable ankle
 * 3. Backend groundPointPct (or bbox bottom center)
 */
export function resolveFeetPosition(player: TrackingPlayerV1): FeetPositionProxy | null {
  // Task 7: Prefer canonical backend feet/ground telemetry when available
  if (
    player.groundPointProvenance &&
    player.groundPointPct &&
    Number.isFinite(player.groundPointPct.x) &&
    Number.isFinite(player.groundPointPct.y)
  ) {
    return {
      xPct: player.groundPointPct.x,
      yPct: player.groundPointPct.y,
      provenance: player.groundPointProvenance,
    };
  }

  // Legacy fallback for stored/unannotated sessions
  const kps = player.pose?.keypoints;
  if (kps && kps.length >= 17) {
    const la = kps[15];
    const ra = kps[16];
    const laValid = isPointReliable(la);
    const raValid = isPointReliable(ra);

    if (laValid && raValid) {
      return {
        xPct: (la.x + ra.x) / 2,
        yPct: (la.y + ra.y) / 2,
        provenance: 'pose_ankles',
      };
    }
    if (laValid) {
      return {
        xPct: la.x,
        yPct: la.y,
        provenance: 'pose_single_ankle',
      };
    }
    if (raValid) {
      return {
        xPct: ra.x,
        yPct: ra.y,
        provenance: 'pose_single_ankle',
      };
    }
  }

  if (player.groundPointPct && Number.isFinite(player.groundPointPct.x) && Number.isFinite(player.groundPointPct.y)) {
    return {
      xPct: player.groundPointPct.x,
      yPct: player.groundPointPct.y,
      provenance: 'bbox_ground',
    };
  }

  if (player.bboxPct) {
    return {
      xPct: player.bboxPct.x + player.bboxPct.width / 2,
      yPct: player.bboxPct.y + player.bboxPct.height,
      provenance: 'bbox_ground',
    };
  }

  return null;
}

export function deriveOverlayFreshnessToleranceSec(frames: TrackingTelemetryV1[]): number {
  const intervals: number[] = [];
  const firstIntervalIndex = Math.max(1, frames.length - MAX_CADENCE_INTERVAL_SAMPLES);
  for (let i = firstIntervalIndex; i < frames.length; i += 1) {
    const interval = frames[i].timestampSec - frames[i - 1].timestampSec;
    if (Number.isFinite(interval) && interval > TIME_EPSILON_SEC) intervals.push(interval);
  }

  if (intervals.length === 0) return DEFAULT_FRESHNESS_TOLERANCE_SEC;

  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const median = intervals.length % 2 === 0
    ? (intervals[middle - 1] + intervals[middle]) / 2
    : intervals[middle];

  return Math.min(MAX_FRESHNESS_TOLERANCE_SEC, median * CADENCE_TOLERANCE_MULTIPLIER);
}

function interpolateNumber(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}

function interpolateDisplayPlayer(
  from: TrackingPlayerV1,
  to: TrackingPlayerV1,
  ratio: number,
): TrackingPlayerV1 | null {
  const canInterpolateBbox = !!from.bboxPct && !!to.bboxPct;
  const canInterpolateGroundPoint = !!from.groundPointPct && !!to.groundPointPct;
  const canInterpolatePose = !!from.pose
    && !!to.pose
    && from.pose.keypoints.length === to.pose.keypoints.length;
  if (!canInterpolateBbox && !canInterpolateGroundPoint && !canInterpolatePose) return null;

  const bboxPct = canInterpolateBbox
    ? {
        x: interpolateNumber(from.bboxPct!.x, to.bboxPct!.x, ratio),
        y: interpolateNumber(from.bboxPct!.y, to.bboxPct!.y, ratio),
        width: interpolateNumber(from.bboxPct!.width, to.bboxPct!.width, ratio),
        height: interpolateNumber(from.bboxPct!.height, to.bboxPct!.height, ratio),
      }
    : null;
  const groundPointPct = canInterpolateGroundPoint
    ? {
        x: interpolateNumber(from.groundPointPct!.x, to.groundPointPct!.x, ratio),
        y: interpolateNumber(from.groundPointPct!.y, to.groundPointPct!.y, ratio),
      }
    : null;
  const pose = canInterpolatePose
    ? {
        ...from.pose!,
        keypoints: from.pose!.keypoints.map((point, index) => ({
          ...point,
          x: interpolateNumber(point.x, to.pose!.keypoints[index].x, ratio),
          y: interpolateNumber(point.y, to.pose!.keypoints[index].y, ratio),
          score: Math.min(point.score, to.pose!.keypoints[index].score),
        })),
      }
    : null;

  // This clone is consumed only by the overlay. Canonical metrics and tracking state
  // deliberately remain those of the prior observed sample.
  return { ...from, bboxPct, groundPointPct, pose };
}

export function resolveOverlayAtTime(
  frames: TrackingTelemetryV1[],
  time: number,
  _isProcessing = false,
): OverlayTimeResolution {
  const freshnessToleranceSec = deriveOverlayFreshnessToleranceSec(frames);
  if (frames.length === 0 || !Number.isFinite(time)) {
    return { status: 'unavailable', players: [], freshnessToleranceSec };
  }

  let lo = 0, hi = frames.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timestampSec <= time) lo = mid + 1;
    else hi = mid - 1;
  }

  const previous = frames[hi];
  if (!previous) {
    return {
      status: 'unavailable',
      players: [],
      freshnessToleranceSec,
      nextTimestampSec: frames[lo]?.timestampSec,
    };
  }

  const ageSec = Math.max(0, time - previous.timestampSec);
  if (ageSec - freshnessToleranceSec > TIME_EPSILON_SEC) {
    return {
      status: 'stale',
      players: [],
      freshnessToleranceSec,
      sourceTimestampSec: previous.timestampSec,
      ageSec,
    };
  }

  const next = frames[lo];
  const canInterpolate = !!next
    && ageSec > TIME_EPSILON_SEC
    && next.timestampSec - time <= freshnessToleranceSec + TIME_EPSILON_SEC;
  const nextPlayers = canInterpolate
    ? new Map(next.players.map((candidate) => [candidate.playerId, candidate]))
    : null;
  const ratio = canInterpolate
    ? ageSec / (next.timestampSec - previous.timestampSec)
    : 0;

  const players = previous.players.map((current): ResolvedOverlayPlayer => {
    if (current.state !== 'observed') {
      return { player: current, provenance: current.state };
    }

    const following = nextPlayers?.get(current.playerId);
    if (following?.state === 'observed') {
      const interpolated = interpolateDisplayPlayer(current, following, ratio);
      if (interpolated) return { player: interpolated, provenance: 'interpolated' };
    }

    return { player: current, provenance: 'observed' };
  });

  return {
    status: 'resolved',
    players,
    freshnessToleranceSec,
    sourceTimestampSec: previous.timestampSec,
    nextTimestampSec: canInterpolate ? next.timestampSec : undefined,
    ageSec,
  };
}

/** @deprecated Use resolveOverlayAtTime to retain explicit display provenance. */
export function frameAtTime(
  frames: TrackingTelemetryV1[],
  time: number,
  isProcessing = false,
): TrackingTelemetryV1 | undefined {
  const resolution = resolveOverlayAtTime(frames, time, isProcessing);
  if (resolution.status !== 'resolved') return undefined;
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (frames[index].timestampSec === resolution.sourceTimestampSec) return frames[index];
  }
  return undefined;
}

export interface TrackingVideoOverlayProps {
  frames: TrackingTelemetryV1[];
  time: number;
  mode?: TrackingOverlayMode;
  showSkeleton?: boolean; // legacy compatibility
  isProcessing?: boolean;
}

export default function TrackingVideoOverlay({
  frames,
  time,
  mode,
  showSkeleton,
  isProcessing = false,
}: TrackingVideoOverlayProps) {
  // Determine effective overlay mode (default: 'skeleton')
  const effectiveMode: TrackingOverlayMode = mode ?? (showSkeleton === false ? 'box' : 'skeleton');

  if (effectiveMode === 'off') {
    return (
      <svg
        aria-label="Detected players and body skeletons"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    );
  }

  const resolution = resolveOverlayAtTime(frames, time, isProcessing);

  return (
    <svg
      aria-label="Detected players and body skeletons"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {resolution.players.filter(({ provenance }) => provenance !== 'lost').map(({ player: p, provenance }) => {
        const bodyCenter = effectiveMode === 'center' ? resolveBodyCenterProxy(p) : null;
        const feet = effectiveMode === 'feet' ? resolveFeetPosition(p) : null;
        const opacity = provenance === 'predicted' ? 0.65 : provenance === 'interpolated' ? 0.85 : 1;

        return (
          <g
            key={p.playerId}
            data-testid={`player-overlay-${p.playerId}`}
            data-overlay-state={provenance}
            opacity={opacity}
          >
            {/* Real Bounding Box */}
            {p.bboxPct && (
              <>
                <rect
                  data-testid="player-bbox"
                  x={p.bboxPct.x}
                  y={p.bboxPct.y}
                  width={p.bboxPct.width}
                  height={p.bboxPct.height}
                  stroke="#38bdf8"
                  strokeWidth="0.2"
                  strokeDasharray={provenance === 'predicted' ? '1 0.6' : undefined}
                  fill="none"
                />
                <text
                  x={p.bboxPct.x}
                  y={Math.max(2, p.bboxPct.y - 1)}
                  fill="white"
                  fontSize="2"
                  fontWeight="bold"
                >
                  {p.playerId}{provenance !== 'observed' ? ` (${provenance})` : ''}
                </text>
              </>
            )}

            {/* Skeleton Mode */}
            {effectiveMode === 'skeleton' && p.pose && (
              <g
                data-testid={p.pose.isReused ? 'pose-reused' : 'pose-fresh'}
                stroke={p.pose.isReused ? '#fbbf24' : '#4ade80'}
                fill={p.pose.isReused ? '#f59e0b' : '#facc15'}
                strokeWidth="0.25"
                strokeDasharray={p.pose.isReused ? '0.6 0.3' : undefined}
                opacity={p.pose.isReused ? Math.max(0.4, 1 - (p.pose.ageFrames ?? 1) * 0.15) : 1}
              >
                {BONES.map(([a, b]) => {
                  const start = p.pose!.keypoints[a];
                  const end = p.pose!.keypoints[b];
                  return isPointReliable(start) && isPointReliable(end) ? (
                    <line
                      key={`${a}-${b}`}
                      data-testid="pose-bone"
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                    />
                  ) : null;
                })}
                {p.pose.keypoints.map((point, i) =>
                  isPointReliable(point) ? (
                    <circle
                      data-testid="pose-point"
                      key={i}
                      cx={point.x}
                      cy={point.y}
                      r="0.35"
                    />
                  ) : null
                )}
                {p.pose.isReused && (
                  <text
                    x={p.bboxPct ? p.bboxPct.x : 0}
                    y={p.bboxPct ? p.bboxPct.y + p.bboxPct.height + 2 : 10}
                    fill="#fbbf24"
                    fontSize="1.5"
                    fontFamily="monospace"
                  >
                    pose reused (+{p.pose.ageFrames ?? 1})
                  </text>
                )}
              </g>
            )}

            {/* Body Center Proxy Mode (3.3) */}
            {effectiveMode === 'center' && bodyCenter && (
              <g data-testid="body-center-marker">
                <circle
                  cx={bodyCenter.xPct}
                  cy={bodyCenter.yPct}
                  r="1.2"
                  stroke="#f59e0b"
                  strokeWidth="0.25"
                  fill="rgba(245, 158, 11, 0.15)"
                />
                <circle
                  cx={bodyCenter.xPct}
                  cy={bodyCenter.yPct}
                  r="0.35"
                  fill="#f59e0b"
                />
                <line
                  x1={bodyCenter.xPct - 1.6}
                  y1={bodyCenter.yPct}
                  x2={bodyCenter.xPct + 1.6}
                  y2={bodyCenter.yPct}
                  stroke="#f59e0b"
                  strokeWidth="0.15"
                />
                <line
                  x1={bodyCenter.xPct}
                  y1={bodyCenter.yPct - 1.6}
                  x2={bodyCenter.xPct}
                  y2={bodyCenter.yPct + 1.6}
                  stroke="#f59e0b"
                  strokeWidth="0.15"
                />
              </g>
            )}

            {/* Feet Mode (3.4) */}
            {effectiveMode === 'feet' && feet && (
              <g data-testid="feet-marker">
                <ellipse
                  cx={feet.xPct}
                  cy={feet.yPct}
                  rx="1.5"
                  ry="0.6"
                  stroke="#34d399"
                  strokeWidth="0.25"
                  fill="rgba(52, 211, 153, 0.25)"
                />
                <circle
                  cx={feet.xPct}
                  cy={feet.yPct}
                  r="0.3"
                  fill="#34d399"
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
