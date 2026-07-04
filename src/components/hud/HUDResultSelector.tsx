import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";
import ProDonutCommandWheel from "./ProDonutCommandWheel";

interface Props {
  isActive: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onClick?: () => void;
  hoveredResult?: string | null;
  onHover?: (code: string | null) => void;
  pointerX?: number;
  pointerY?: number;
}

export default function HUDResultSelector({
  isActive,
  onPointerDown,
  onPointerUp,
  onClick,
  hoveredResult,
  onHover,
  pointerX = 0,
  pointerY = 0,
}: Props) {
  const { currentAction, commitResult, settings, sportTemplate } = useScoutContext();
  const layout = useHUDDeviceLayout();

  const handleResultSelect = (value: string) => {
    commitResult(value, settings.fastMode);
  };

  const results = (sportTemplate?.results || []).map((r) => {
    let color = "bg-sky-600 border-sky-400";
    let shadow = "shadow-[0_0_15px_rgba(56,189,248,0.3)]";
    if (r.code === "Yes" || r.score === 1) {
      color = "bg-green-600 border-green-400";
      shadow = "shadow-[0_0_15px_rgba(34,197,94,0.3)]";
    } else if (r.code === "Out" || r.score === -1) {
      color = "bg-red-600 border-red-400";
      shadow = "shadow-[0_0_15px_rgba(239,68,68,0.3)]";
    }

    return {
      code: r.code,
      title: r.code.toUpperCase(),
      label: r.code,
      sub: settings.uiLanguage === "th" ? r.thaiName : r.code,
      color,
      shadow,
    };
  });

  const handleHoverItem = (payload: {
    type: "skill" | "descriptor" | "result";
    code: string | null;
    groupId?: string;
  }) => {
    if (payload.type === "result" && onHover) {
      onHover(payload.code);
    }
  };

  // Button sizes based on device
  const buttonSizeClass = isActive
    ? layout.device === "phone"
      ? "h-[52px] w-[22vw] max-w-[84px] text-base"
      : "h-[48px] w-[104px] text-lg"
    : layout.device === "phone"
      ? "h-[40px] w-[18vw] max-w-[74px] text-sm"
      : "h-[42px] w-[74px] text-sm";

  return (
    <div
      className={`scout-result-menu transition-all duration-300 flex flex-col gap-2 transform origin-bottom-right ${isActive ? "scale-100 opacity-100 z-50" : "scale-[0.8] opacity-70 hover:opacity-100"}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={!isActive ? onClick : undefined}
      onPointerLeave={() => {
        if (isActive && onHover) onHover(null);
        (window as any).__hoveredResult = null;
      }}
    >
      {isActive && !settings.hudInteractionStyle && (
        <div className="text-xs text-white/50 font-bold uppercase tracking-wider text-right px-2">
          Result (E)
        </div>
      )}

      {isActive ? (
        <div className="bg-black/60 backdrop-blur-xl rounded-full border border-sky-500/50 shadow-[0_0_20px_rgba(56,189,248,0.2)] p-4 relative flex items-center justify-center min-w-[64px] min-h-[64px]">
          <ProDonutCommandWheel
            menuType="result"
            results={results}
            active={isActive}
            size={280}
            uiLanguage={settings.uiLanguage}
            pointerX={pointerX}
            pointerY={pointerY}
            onHoverItem={handleHoverItem}
            hoveredSkill={null}
            hoveredDescriptor={null}
            hoveredResult={hoveredResult || null}
            onSelectResult={handleResultSelect}
          />
        </div>
      ) : (
        <div
          className={`flex flex-col gap-2 ${isActive ? "bg-black/40 p-2 rounded-2xl border border-white/10 backdrop-blur-md" : ""}`}
        >
          {results.map((r) => {
            const isSelected =
              currentAction.resultCode === r.code ||
              (isActive && hoveredResult === r.code);
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleResultSelect(r.code);
                }}
                className={`flex flex-col items-center justify-center rounded-lg font-bold transition-all border ${buttonSizeClass} ${
                  isSelected
                    ? `${r.color} text-white ${r.shadow} scale-105 active:scale-95`
                    : "bg-black/60 border-white/10 text-white/90 hover:border-white/30 hover:bg-white/10 active:scale-95 active:bg-white/20 backdrop-blur-md"
                }`}
              >
                <span>{r.title}</span>
                {isActive && (
                  <span className="text-xs font-normal opacity-80 mt-0.5 leading-none">
                    {r.sub}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
