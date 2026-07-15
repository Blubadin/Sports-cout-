type ControllerStickMonitorProps = {
  label: string;
  x: number;
  y: number;
  magnitude: number;
};

export default function ControllerStickMonitor({
  label,
  x,
  y,
  magnitude,
}: ControllerStickMonitorProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-950/70 p-3">
      <div className="relative h-20 w-20 shrink-0 rounded-full border border-slate-600 bg-slate-900">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-slate-700" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-slate-700" />
        <div
          className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200 bg-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.7)] transition-[left,top] duration-75"
          style={{ left: `${50 + x * 38}%`, top: `${50 + y * 38}%` }}
        />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-black uppercase text-slate-200">{label}</div>
        <div className="mt-1 font-mono text-[11px] text-slate-400">
          X {x.toFixed(2)} / Y {y.toFixed(2)}
        </div>
        <div className="mt-2 h-1.5 w-full min-w-24 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, magnitude * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
