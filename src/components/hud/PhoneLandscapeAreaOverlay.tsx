import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { AreaSelectionPayload } from "../../types";
import { X, Map } from "lucide-react";
import HUDMiniCourtSelector from "./HUDMiniCourtSelector";
import { getAreaDisplay } from "../../utils/areaHelper";

interface PhoneLandscapeAreaOverlayProps {
  onClose: () => void;
}

export default function PhoneLandscapeAreaOverlay({
  onClose,
}: PhoneLandscapeAreaOverlayProps) {
  const { sportTemplate, selectArea, currentAction, teams, settings } =
    useScoutContext();

  const handleSelectArea = (payload: AreaSelectionPayload) => {
    selectArea(payload);
    setTimeout(onClose, 250); // small delay to visualize selection state
  };

  const isWideGrid = ["football", "basketball"].includes(sportTemplate.id);

  return (
    <div
      className="absolute inset-0 z-55 flex items-center justify-center pointer-events-auto bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-gray-950/95 border border-white/10 p-3 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col items-center gap-2 max-w-[90vw] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full border-b border-white/5 pb-1">
          <div className="flex items-center gap-1.5 text-gray-400">
            <Map size={16} />
            <span className="text-white text-xs font-black uppercase tracking-wider">
              Select Area ({sportTemplate.name})
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scaled Mini Court for Thumb tapping */}
        <div
          className={`w-full bg-gray-900 border border-gray-800 rounded-xl relative overflow-hidden flex items-center justify-center p-2 shadow-inner ${
            isWideGrid
              ? "aspect-[4/3] h-[180px] sm:h-[220px]"
              : "aspect-[1/2] h-[220px] sm:h-[260px]"
          }`}
        >
          <div className="transform scale-95 sm:scale-100 origin-center flex items-center justify-center">
            <HUDMiniCourtSelector
              sportType={sportTemplate.id}
              areas={sportTemplate.areas}
              currentAction={currentAction}
              teams={teams}
              onSelectArea={handleSelectArea}
              active={true}
              compact={true}
              interactive={true}
              flipCourtSide={settings.flipCourtSide || false}
              enableOutOfBoundsZones={settings.enableOutOfBoundsZones}
            />
          </div>
        </div>

        {/* Quick Out/Error Buttons */}
        <div className="flex gap-1.5 w-full justify-center">
          {sportTemplate.areas
            .filter((a) =>
              ["OUT", "NET", "NET_ERR", "UNKNOWN"].includes(a.code),
            )
            .slice(0, 3)
            .map((area) => {
              const isThai = settings?.uiLanguage === 'th';
              const displayInfo = getAreaDisplay(area.code, isThai, area.thaiName);
              return (
                <button
                  key={area.code}
                  onClick={() => handleSelectArea({ areaCode: area.code, areaMode: 'normal' })}
                  className={`flex-1 min-h-[38px] px-3 rounded-lg border flex flex-col items-center justify-center transition-all active:scale-95 ${
                    area.code === "OUT"
                      ? "bg-red-950/40 border-red-500/40 text-red-200 hover:bg-red-950/60"
                      : "bg-gray-800/80 border-gray-750 text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <span className="font-black text-[12px] sm:text-[14px] tracking-wide">{displayInfo.main}</span>
                  {displayInfo.sub && <span className="text-[11px] sm:text-[12.5px] font-black text-gray-400 mt-0.5">{displayInfo.sub}</span>}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
