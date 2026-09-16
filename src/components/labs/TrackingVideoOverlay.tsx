import React from 'react';
import type { TrackingTelemetryV1 } from '../../types';

const BONES = [[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16],[0,1],[0,2],[1,3],[2,4]];
export function frameAtTime(frames: TrackingTelemetryV1[], time: number): TrackingTelemetryV1 | undefined {
  let lo = 0, hi = frames.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (frames[mid].timestampSec <= time) lo = mid + 1; else hi = mid - 1; }
  const frame = frames[hi];
  return frame && time - frame.timestampSec <= 0.25 ? frame : undefined;
}
export default function TrackingVideoOverlay({ frames, time, showSkeleton }: { frames: TrackingTelemetryV1[]; time: number; showSkeleton: boolean }) {
  const frame = frameAtTime(frames, time);
  return <svg aria-label="Detected players and body skeletons" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
    {frame?.players.filter(p => p.state === 'observed').map(p => <g key={p.playerId}>
      {p.bboxPct && <><rect x={p.bboxPct.x} y={p.bboxPct.y} width={p.bboxPct.width} height={p.bboxPct.height} stroke="#38bdf8" strokeWidth="0.2" fill="none" /><text x={p.bboxPct.x} y={Math.max(2, p.bboxPct.y - 1)} fill="white" fontSize="2">{p.playerId}</text></>}
      {showSkeleton && p.pose && <g stroke="#4ade80" fill="#facc15" strokeWidth="0.25">
        {BONES.map(([a,b]) => { const start = p.pose!.keypoints[a], end = p.pose!.keypoints[b]; return start?.score >= 0.4 && end?.score >= 0.4 ? <line key={`${a}-${b}`} data-testid="pose-bone" x1={start.x} y1={start.y} x2={end.x} y2={end.y} /> : null; })}
        {p.pose.keypoints.map((point,i) => point.score >= 0.4 && Number.isFinite(point.x) && Number.isFinite(point.y) ? <circle data-testid="pose-point" key={i} cx={point.x} cy={point.y} r="0.35" /> : null)}
      </g>}
    </g>)}
  </svg>;
}
