import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { AreaSelectionPayload } from "../../types";
import HUDMiniCourtSelector from "./HUDMiniCourtSelector";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";
import { X } from "lucide-react";

interface Props {
  isActive: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onClick?: () => void;
  onClose?: () => void;
  hoveredArea?: {
    code: string;
    courtSide?: "teamA" | "teamB" | "neutral";
  } | null;
}

export default function HUDAreaSelector({
  isActive,
  onPointerDown,
  onPointerUp,
  onClick,
  onClose,
  hoveredArea,
}: Props) {
  const {
    currentAction,
    sportTemplate,
    matchInfo,
    settings,
    teams,
    selectArea,
  } = useScoutContext();
  const layout = useHUDDeviceLayout();

  const handleSelectArea = (payload: AreaSelectionPayload) => {
    selectArea(payload);

    // Auto collapse after a short delay
    if (onClose) {
      setTimeout(() => {
        onClose();
      }, 400);
    }
  };

  const isCompact = !isActive;

  // Responsive active panel max width/height
  const panelStyle = isActive
    ? {
        width:
          layout.device === "phone"
            ? layout.orientation === "portrait"
              ? "42vw"
              : "35vw"
            : "320px",
        maxHeight: layout.orientation === "portrait" ? "45vh" : "40vh",
      }
    : {
        width: layout.device === "phone" ? "24vw" : "110px",
      };

  return (
    <div
      className={`scout-area-menu transition-all duration-300 transform origin-bottom-left ${isActive ? "scale-100 opacity-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] z-50" : "scale-[0.85] opacity-80 hover:opacity-100"}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={!isActive ? onClick : undefined}
    >
      <div
        className={`bg-black/70 backdrop-blur-xl rounded-2xl border ${isActive ? "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.3)]" : "border-white/10 shadow-2xl"} flex flex-col items-center ${isActive ? "p-3" : "p-2"}`}
        style={panelStyle}
      >
        <div className={`w-full flex justify-between items-center mb-1`}>
          <div
            className={`text-white/50 font-bold uppercase tracking-wider ${isActive ? "text-[10px] sm:text-xs" : "text-[9px]"} pl-1`}
          >
            Area (Q)
          </div>
          {isActive && onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 bg-white/10 rounded-full hover:bg-white/20 active:scale-90 active:bg-white/30"
            >
              <X size={12} className="text-white/70" />
            </button>
          )}
        </div>

        <div
          className={`overflow-auto w-full ${isActive ? "scrollbar-none flex justify-center" : ""}`}
        >
          <HUDMiniCourtSelector
            sportType={matchInfo.sportType}
            areas={sportTemplate.areas}
            currentAction={currentAction}
            teams={teams}
            onSelectArea={handleSelectArea}
            active={isActive}
            compact={isCompact}
            interactive={isActive}
            flipCourtSide={settings.flipCourtSide || false}
            hoveredArea={hoveredArea}
            enableOutOfBoundsZones={settings.enableOutOfBoundsZones}
          />
        </div>
      </div>
    </div>
  );
}
