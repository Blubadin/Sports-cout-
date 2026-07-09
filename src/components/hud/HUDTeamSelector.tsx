import React from "react";
import { useScoutContext } from "../../context/ScoutContext";

interface Props {
  isActive?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onClick?: () => void;
  onSelectTeam?: (teamCode: string) => void;
  hoveredTeam?: string | null;
}

export default function HUDTeamSelector({
  isActive,
  onPointerDown,
  onPointerUp,
  onClick,
  onSelectTeam,
  hoveredTeam,
}: Props) {
  const { teams, currentAction, updateActionField, settings } =
    useScoutContext();

  const handleTeamClick = (teamCode: string) => {
    if (onSelectTeam) {
      onSelectTeam(teamCode);
    } else {
      updateActionField("teamCode", teamCode);
    }

    if (settings.hudEnableGameFeedback) {
      // Small haptic or visual flash could be added here
    }
  };

  return (
    <div
      className={`flex flex-col items-end gap-1 sm:gap-2 transition-all duration-300 transform origin-bottom-right ${isActive ? "scale-100 opacity-100" : "scale-90 opacity-80 hover:opacity-100"}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={!isActive ? onClick : undefined}
    >
      <div className="text-[10px] text-white/50 font-mono tracking-widest uppercase drop-shadow-md pr-1">
        Team
      </div>
      <div
        className={`flex flex-row gap-2 ${isActive ? "bg-black/40 p-2 rounded-2xl border border-white/10 backdrop-blur-md" : ""}`}
      >
        {teams.map((t, i) => {
          const isSelected = currentAction.teamCode === t.code;
          const isHovered = isActive && hoveredTeam === t.code;
          return (
            <button
              key={t.code}
              data-scout-hover-team={t.code}
              onPointerEnter={() => {
                if (isActive) {
                  (window as any).__hoveredTeam = t.code;
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                handleTeamClick(t.code);
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleTeamClick(t.code);
              }}
              className={`relative flex items-center justify-center rounded-xl font-bold transition-all border ${
                isActive
                  ? "px-6 py-3 min-w-[80px] text-lg"
                  : "px-4 py-2 min-w-[60px] text-sm"
              } ${
                isSelected
                  ? "bg-sky-600 border-sky-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.5)] scale-105 active:scale-95 active:bg-sky-700"
                  : isHovered
                    ? "bg-sky-700/60 border-sky-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.3)] scale-105"
                    : "bg-black/60 border-white/20 text-white/90 hover:bg-white/10 hover:border-white/40 active:scale-95 active:bg-white/25"
              }`}
            >
              {t.code}
              {isActive && (
                <div className="absolute -top-2 -right-2 w-5 h-5 bg-black rounded border border-white/20 text-[10px] flex items-center justify-center text-white/70 font-mono shadow-md">
                  {i + 1}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
