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

export function frameAtTime(frames: TrackingTelemetryV1[], time: number, isProcessing = false): TrackingTelemetryV1 | undefined {
  let lo = 0, hi = frames.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timestampSec <= time) lo = mid + 1;
    else hi = mid - 1;
  }
  const frame = frames[hi];
  if (!frame) return undefined;
  const tolerance = isProcessing ? 2 : 0.25;
  return time - frame.timestampSec <= tolerance ? frame : undefined;
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

  const frame = frameAtTime(frames, time, isProcessing);

  return (
    <svg
      aria-label="Detected players and body skeletons"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {frame?.players.filter(p => p.state !== 'lost').map(p => {
        const bodyCenter = effectiveMode === 'center' ? resolveBodyCenterProxy(p) : null;
        const feet = effectiveMode === 'feet' ? resolveFeetPosition(p) : null;

        return (
          <g key={p.playerId} data-testid={`player-overlay-${p.playerId}`}>
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
                  fill="none"
                />
                <text
                  x={p.bboxPct.x}
                  y={Math.max(2, p.bboxPct.y - 1)}
                  fill="white"
                  fontSize="2"
                  fontWeight="bold"
                >
                  {p.playerId}{p.state !== 'observed' ? ` (${p.state})` : ''}
                </text>
              </>
            )}

            {/* Skeleton Mode */}
            {effectiveMode === 'skeleton' && p.pose && (
              <g stroke="#4ade80" fill="#facc15" strokeWidth="0.25">
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
