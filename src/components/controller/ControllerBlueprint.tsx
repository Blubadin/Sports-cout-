import type { ControllerButtonName, ControllerDeviceFamily } from '../../controller/types';
import { getControllerButtonLabel } from '../../controller/controllerProfileEditing';

type ControllerBlueprintProps = {
  family: ControllerDeviceFamily;
  activeControls?: ReadonlySet<ControllerButtonName>;
  selectedControl?: ControllerButtonName | null;
  onControlClick?: (control: ControllerButtonName) => void;
};

type ControlPosition = {
  control: ControllerButtonName;
  left: string;
  top: string;
  size?: 'small' | 'regular' | 'stick' | 'shoulder';
};

const CONTROL_POSITIONS: ControlPosition[] = [
  { control: 'left-trigger', left: '22%', top: '2%', size: 'shoulder' },
  { control: 'right-trigger', left: '66%', top: '2%', size: 'shoulder' },
  { control: 'left-shoulder', left: '22%', top: '13%', size: 'shoulder' },
  { control: 'right-shoulder', left: '66%', top: '13%', size: 'shoulder' },
  { control: 'view', left: '43%', top: '31%', size: 'small' },
  { control: 'menu', left: '53%', top: '31%', size: 'small' },
  { control: 'dpad-up', left: '24%', top: '37%', size: 'small' },
  { control: 'dpad-left', left: '18%', top: '47%', size: 'small' },
  { control: 'dpad-right', left: '30%', top: '47%', size: 'small' },
  { control: 'dpad-down', left: '24%', top: '57%', size: 'small' },
  { control: 'button-north', left: '72%', top: '36%' },
  { control: 'button-west', left: '66%', top: '47%' },
  { control: 'button-east', left: '78%', top: '47%' },
  { control: 'button-south', left: '72%', top: '58%' },
  { control: 'left-stick', left: '36%', top: '64%', size: 'stick' },
  { control: 'right-stick', left: '57%', top: '64%', size: 'stick' },
];

const SIZE_CLASS: Record<NonNullable<ControlPosition['size']>, string> = {
  small: 'h-7 w-7 text-[9px]',
  regular: 'h-9 w-9 text-xs',
  stick: 'h-11 w-11 text-[10px]',
  shoulder: 'h-7 w-[12%] min-w-12 rounded-md text-[10px]',
};

function getBlueprintButtonLabel(control: ControllerButtonName, family: ControllerDeviceFamily) {
  const directional: Partial<Record<ControllerButtonName, string>> = {
    'dpad-up': '↑',
    'dpad-down': '↓',
    'dpad-left': '←',
    'dpad-right': '→',
    'left-stick': 'L3',
    'right-stick': 'R3',
    view: family === 'xbox' || family === 'generic' ? 'V' : 'C',
    menu: family === 'xbox' || family === 'generic' ? 'M' : 'O',
  };
  if (directional[control]) return directional[control];
  if (family === 'ps4' || family === 'ps5') {
    const playstationFaces: Partial<Record<ControllerButtonName, string>> = {
      'button-south': '×',
      'button-east': '○',
      'button-west': '□',
      'button-north': '△',
    };
    if (playstationFaces[control]) return playstationFaces[control];
  }
  return getControllerButtonLabel(control, family);
}

export default function ControllerBlueprint({
  family,
  activeControls = new Set(),
  selectedControl,
  onControlClick,
}: ControllerBlueprintProps) {
  const isPlayStation = family === 'ps4' || family === 'ps5';

  return (
    <div className="relative mx-auto aspect-[1.55/1] w-full max-w-[540px] select-none" aria-label="Controller blueprint">
      <svg viewBox="0 0 620 400" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="controller-shell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0b1220" />
          </linearGradient>
        </defs>
        <path
          d={isPlayStation
            ? 'M184 76 C235 44 385 44 436 76 C484 104 512 172 535 252 C554 320 521 359 477 346 L399 302 C350 326 270 326 221 302 L143 346 C99 359 66 320 85 252 C108 172 136 104 184 76 Z'
            : 'M162 86 C218 49 402 49 458 86 C505 117 524 184 545 267 C560 326 526 359 482 340 L402 298 C351 321 269 321 218 298 L138 340 C94 359 60 326 75 267 C96 184 115 117 162 86 Z'}
          fill="url(#controller-shell)"
          stroke="#475569"
          strokeWidth="4"
        />
        <path d="M205 78 Q310 44 415 78" fill="none" stroke="#64748b" strokeWidth="3" />
        <rect x="245" y="82" width="130" height="72" rx="18" fill="#111827" stroke="#334155" strokeWidth="3" />
        <circle cx="255" cy="270" r="38" fill="#0f172a" stroke="#475569" strokeWidth="4" />
        <circle cx="365" cy="270" r="38" fill="#0f172a" stroke="#475569" strokeWidth="4" />
        <circle cx="310" cy="190" r="15" fill="#0f172a" stroke="#334155" strokeWidth="2" />
      </svg>

      {CONTROL_POSITIONS.map(({ control, left, top, size = 'regular' }) => {
        const active = activeControls.has(control);
        const selected = selectedControl === control;
        return (
          <button
            key={control}
            type="button"
            onClick={() => onControlClick?.(control)}
            className={`absolute -translate-x-1/2 -translate-y-1/2 border font-black transition-all ${SIZE_CLASS[size]} ${
              active
                ? 'border-cyan-300 bg-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.9)] scale-110'
                : selected
                  ? 'border-amber-300 bg-amber-400/25 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.45)]'
                  : 'border-slate-500 bg-slate-900/95 text-slate-200 hover:border-cyan-400 hover:text-white'
            } rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300`}
            style={{ left, top }}
            title={getControllerButtonLabel(control, family)}
            aria-label={getControllerButtonLabel(control, family)}
          >
            {getBlueprintButtonLabel(control, family)}
          </button>
        );
      })}

      <div className="absolute bottom-[9%] left-1/2 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-950/90 px-3 py-1 font-mono text-[10px] font-bold uppercase text-slate-400">
        {family === 'generic' ? 'Standard Mapping' : family}
      </div>
    </div>
  );
}
