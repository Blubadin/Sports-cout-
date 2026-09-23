import React from 'react';
import type { TrackingTelemetryV1 } from '../../types';
import type { ShuttleObservation } from '../../types/shuttleTelemetry';
import { deriveOverlayFreshnessToleranceSec } from './TrackingVideoOverlay';

export type ShuttleMode = 'off' | 'point' | 'trail' | 'debug';
export function resolveShuttle(frames: TrackingTelemetryV1[], time: number) {
  let lo = 0, hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid].timestampSec <= time) lo = mid + 1; else hi = mid;
  }
  const frame = frames[lo - 1];
  const sample = frame?.shuttle;
  const tolerance = deriveOverlayFreshnessToleranceSec(frames);
  return Number.isFinite(time) && sample && Number.isFinite(sample.timestampSec)
    && sample.timestampSec <= time && time - sample.timestampSec <= tolerance
    && frame.frameIndex === sample.frameIndex && Math.abs(frame.timestampSec - sample.timestampSec) < 0.001
    ? sample : null;
}

function positioned(s: ShuttleObservation | null | undefined): s is ShuttleObservation & { positionPx: { x: number; y: number } } {
  return !!s && ['observed', 'predicted', 'interpolated'].includes(s.state)
    && !!s.positionPx && Number.isFinite(s.positionPx.x) && Number.isFinite(s.positionPx.y);
}

export function ShuttleOverlay({ frames, time, mode, width, height, trailSeconds = 0.6 }: {
  frames: TrackingTelemetryV1[]; time: number; mode: ShuttleMode; width: number; height: number; trailSeconds?: number;
}) {
  const current = resolveShuttle(frames, time);
  if (mode === 'off' || width <= 0 || height <= 0) return null;
  const radius = width / 220;
  const valid = (s: ShuttleObservation | null | undefined) => positioned(s)
    && s.positionPx.x >= 0 && s.positionPx.x < width && s.positionPx.y >= 0 && s.positionPx.y < height;
  // Individual trail marks preserve gaps and provenance; never connect across loss.
  const trail = mode === 'trail' || mode === 'debug' ? frames.filter(f =>
    f.timestampSec < time && f.timestampSec >= time - Math.min(2, Math.max(0, trailSeconds))
    && f.shuttle?.frameIndex !== current?.frameIndex
    && f.shuttle?.frameIndex === f.frameIndex && Math.abs(f.shuttle.timestampSec - f.timestampSec) < 0.001
    && valid(f.shuttle)).slice(-60).map(f => f.shuttle!) : [];
  const dot = (s: ShuttleObservation, historical: boolean) => <circle key={s.frameIndex}
    data-testid={historical ? 'shuttle-trail' : 'shuttle-current'} data-state={s.state}
    cx={s.positionPx!.x} cy={s.positionPx!.y} r={historical ? radius * 0.5 : radius}
    fill={s.state === 'observed' ? '#e2e8f0' : 'none'}
    stroke={s.state === 'predicted' ? '#fbbf24' : s.state === 'interpolated' ? '#38bdf8' : '#e2e8f0'}
    strokeWidth={radius / 3} strokeDasharray={s.state === 'interpolated' ? `${radius / 2}` : undefined}
    opacity={historical ? 0.4 : 1}><title>{s.state} shuttle</title></circle>;
  return <svg aria-label="Shuttle overlay" viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 w-full h-full pointer-events-none">
    {trail.map(s => dot(s, true))}
    {valid(current) && dot(current!, false)}
    {mode === 'debug' && <text x={width * 0.02} y={height * 0.06} fontSize={width / 65} fill="#e2e8f0" stroke="#0b1219" strokeWidth={width / 1000} paintOrder="stroke">
      {current ? `${current.state} · ${current.source} · ${current.confidence === null ? '—' : current.confidence.toFixed(2)} · f${current.frameIndex} @ ${current.timestampSec.toFixed(3)}s` : 'Shuttle unavailable / stale'}
    </text>}
  </svg>;
}

export function ShuttleControls({ mode, onChange }: { mode: ShuttleMode; onChange: (mode: ShuttleMode) => void }) {
  return <label className="flex items-center gap-2 text-xs text-slate-300">Shuttle
    <select aria-label="Shuttle overlay mode" value={mode} onChange={e => onChange(e.target.value as ShuttleMode)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1">
      {(['off', 'point', 'trail', 'debug'] as const).map(m => <option key={m} value={m}>Shuttle {m[0].toUpperCase() + m.slice(1)}</option>)}
    </select>
    <span className="text-slate-500">Solid: observed · Ring: predicted · Dashed: interpolated</span>
  </label>;
}

export function ShuttleDiagnostics({ frames, time }: { frames: TrackingTelemetryV1[]; time: number }) {
  const current = resolveShuttle(frames, time);
  const raw = frames.filter(f => f.timestampSec <= time).flatMap(f => f.shuttle ? [f.shuttle] : []);
  const percent = (state: string) => raw.length ? `${(100 * raw.filter(s => s.state === state).length / raw.length).toFixed(1)}%` : '—';
  return <dl aria-label="Shuttle diagnostics" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 border border-slate-800 rounded p-2">
    {Object.entries({ State: current?.state ?? '—', Confidence: current?.confidence == null ? '—' : current.confidence.toFixed(2),
      Source: current?.source ?? '—', 'Observed % (samples)': percent('observed'), 'Lost % (samples)': percent('lost'),
      'Longest lost gap': '—', Reacquisitions: '—', 'Model/provider': '—' }).map(([label, value]) =>
      <div key={label}><dt className="inline">{label}: </dt><dd className="inline text-slate-200">{value}</dd></div>)}
  </dl>;
}
