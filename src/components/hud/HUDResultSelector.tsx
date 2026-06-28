import React from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { useHUDDeviceLayout } from '../../hooks/useHUDDeviceLayout';

interface Props {
  isActive: boolean;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onClick?: () => void;
  hoveredResult?: string | null;
  onHover?: (code: string | null) => void;
}

export default function HUDResultSelector({ isActive, onPointerDown, onPointerUp, onClick, hoveredResult, onHover }: Props) {
  const { currentAction, commitResult, settings } = useScoutContext();
  const layout = useHUDDeviceLayout();

  const handleResultSelect = (value: string) => {
    commitResult(value, settings.fastMode);
  };

  const results = [
    { code: 'Yes', title: 'YES', sub: 'ได้แต้ม', color: 'bg-emerald-600 border-emerald-400', shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]' },
    { code: 'Pass', title: 'PASS', sub: 'เล่นต่อ', color: 'bg-cyan-600 border-cyan-400', shadow: 'shadow-[0_0_15px_rgba(8,145,178,0.3)]' },
    { code: 'Out', title: 'OUT', sub: 'เสียแต้ม', color: 'bg-rose-600 border-rose-400', shadow: 'shadow-[0_0_15px_rgba(225,29,72,0.3)]' },
  ];

  // Button sizes based on device
  const buttonSizeClass = isActive
    ? (layout.device === 'mobile' ? 'h-[54px] w-[84px] text-base' : 'h-[48px] w-[104px] text-lg')
    : 'h-[42px] w-[74px] text-sm';

  return (
    <div 
      className={`scout-result-menu transition-all duration-300 flex flex-col gap-2 transform origin-bottom-right ${isActive ? 'scale-100 opacity-100 z-50' : 'scale-[0.8] opacity-70 hover:opacity-100'}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onPointerLeave={() => {
        if (isActive && onHover) onHover(null);
        (window as any).__hoveredResult = null;
      }}
    >
      {isActive && (
        <div className="text-[10px] text-white/50 font-bold uppercase tracking-wider text-right px-2">
          Result (E)
        </div>
      )}
      <div className={`flex flex-col gap-2 ${isActive ? 'bg-black/40 p-2 rounded-2xl border border-white/10 backdrop-blur-md' : ''}`}>
        {results.map(r => {
          const isSelected = currentAction.resultCode === r.code || (isActive && hoveredResult === r.code);
          return (
            <button
              key={r.code}
              data-scout-hover-result={r.code}
              onPointerEnter={() => {
                if (isActive && onHover) {
                  onHover(r.code);
                }
                (window as any).__hoveredResult = r.code;
              }}
              onClick={(e) => { e.stopPropagation(); handleResultSelect(r.code); }}
              className={`flex flex-col items-center justify-center rounded-xl font-bold transition-all border ${buttonSizeClass} ${
                isSelected 
                  ? `${r.color} text-white ${r.shadow} scale-105`
                  : 'bg-black/60 border-white/10 text-white/90 hover:border-white/30 hover:bg-white/10 backdrop-blur-md'
              }`}
            >
              <span>{r.title}</span>
              {isActive && <span className="text-[9px] font-normal opacity-80 mt-0.5 leading-none">{r.sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
