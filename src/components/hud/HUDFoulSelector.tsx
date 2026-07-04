import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";
import ProFoulCommandWheel from "./ProFoulCommandWheel";

interface Props {
  isActive: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onClick?: () => void;
  hoveredFoul?: string | null;
  onHover?: (code: string | null) => void;
  pointerX?: number;
  pointerY?: number;
}

export default function HUDFoulSelector({
  isActive,
  onPointerDown,
  onPointerUp,
  onClick,
  hoveredFoul,
  onHover,
  pointerX = 0,
  pointerY = 0,
}: Props) {
  const { currentAction, selectFoul, clearFoul, sportTemplate, settings } = useScoutContext();
  const layout = useHUDDeviceLayout();

  if (!sportTemplate.fouls || sportTemplate.fouls.length === 0) return null;

  const handleHoverItem = (code: string | null) => {
    if (onHover) {
      onHover(code);
    }
  };

  const handleFoulSelect = (foul: any) => {
    if (currentAction.foulCode === foul.code) {
      clearFoul();
    } else {
      selectFoul(foul);
    }
  };

  const buttonSizeClass = isActive
    ? layout.device === "phone"
      ? "h-[52px] w-[22vw] max-w-[84px] text-base"
      : "h-[48px] w-[104px] text-lg"
    : layout.device === "phone"
      ? "h-[40px] w-[18vw] max-w-[74px] text-sm"
      : "h-[42px] w-[74px] text-sm";

  return (
    <div
      className={`scout-foul-menu transition-all duration-300 flex flex-col gap-2 transform origin-top-right ${isActive ? "scale-100 opacity-100 z-50" : "scale-[0.8] opacity-70 hover:opacity-100"}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={!isActive ? onClick : undefined}
      onPointerLeave={() => {
        if (isActive && onHover) onHover(null);
        (window as any).__hoveredFoul = null;
      }}
    >
      {isActive && !settings.hudInteractionStyle && (
        <div className="text-xs text-amber-500/80 font-bold uppercase tracking-wider text-right px-2">
          Foul (R/F)
        </div>
      )}

      {isActive ? (
        <div className="bg-black/60 backdrop-blur-xl rounded-full border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)] p-4 relative flex items-center justify-center min-w-[64px] min-h-[64px]">
          <ProFoulCommandWheel
            fouls={sportTemplate.fouls}
            selectedFoul={currentAction.foulCode}
            active={isActive}
            size={240}
            uiLanguage={settings.uiLanguage}
            pointerX={pointerX}
            pointerY={pointerY}
            onHoverItem={handleHoverItem}
            hoveredFoul={hoveredFoul || null}
            onSelectFoul={handleFoulSelect}
          />
        </div>
      ) : (
        <div
          className={`flex flex-col gap-2 ${isActive ? "bg-black/40 p-2 rounded-2xl border border-white/10 backdrop-blur-md" : ""}`}
        >
          {currentAction.foulCode ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFoul();
              }}
              className={`flex flex-col items-center justify-center rounded-lg font-bold transition-all border ${buttonSizeClass} bg-amber-600/20 border-amber-500 text-amber-300 hover:bg-amber-600/40`}
            >
              <span>{currentAction.foulCode}</span>
            </button>
          ) : (
            <button
              onClick={onClick}
              className={`flex flex-col items-center justify-center rounded-lg font-bold transition-all border ${buttonSizeClass} bg-black/60 border-white/10 text-white/90 hover:border-white/30 hover:bg-white/10`}
            >
              <span className="text-amber-500 text-xs">FOUL (R/F)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
