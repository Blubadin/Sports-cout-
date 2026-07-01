import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { AreaSelectionPayload } from "../../types";
import { X, Map } from "lucide-react";
import HUDMiniCourtSelector from "./HUDMiniCourtSelector";
import { getAreaDisplay } from "../../utils/areaHelper";

interface PhoneAreaSheetProps {
  onClose: () => void;
}

export default function PhoneAreaSheet({ onClose }: PhoneAreaSheetProps) {
  const { sportTemplate, selectArea, currentAction, teams, settings } =
    useScoutContext();

  const handleSelectArea = (payload: AreaSelectionPayload) => {
    selectArea(payload);
    setTimeout(onClose, 150); // slight delay to show selection feedback
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end pointer-events-auto bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900/85 backdrop-blur-md rounded-t-3xl border-t border-white/20 p-4 pb-[env(safe-area-inset-bottom,16px)] animate-in slide-in-from-bottom-full duration-300 w-full flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between w-full mb-6">
          <div className="w-10 flex items-center justify-center text-gray-500">
            <Map size={24} />
          </div>
          <h2 className="text-white font-bold text-lg">Select Area</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full bg-white/5 active:bg-white/20"
          >
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <div
          className={`w-full bg-gray-850 rounded-xl relative overflow-hidden shadow-inner flex items-center justify-center p-2 border border-gray-700/50 ${
            sportTemplate.id === "football" || sportTemplate.id === "basketball"
              ? "max-w-[320px] aspect-[4/3] sm:h-[260px]"
              : "max-w-[280px] aspect-[1/2] sm:h-[300px]"
          }`}
        >
          <div className="transform scale-90 sm:scale-100 origin-center">
            {/* Reusing HUDMiniCourtSelector which renders the svg map */}
            <HUDMiniCourtSelector
              sportType={sportTemplate.id}
              areas={sportTemplate.areas}
              currentAction={currentAction}
              teams={teams}
              onSelectArea={handleSelectArea}
              active={true}
              compact={false}
              flipCourtSide={settings.flipCourtSide || false}
              enableOutOfBoundsZones={settings.enableOutOfBoundsZones}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full max-w-[320px] mt-4">
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
                  className={`flex-1 min-h-[44px] py-1.5 px-3 rounded-xl border flex flex-col items-center justify-center transition-transform active:scale-95 ${
                    area.code === "OUT"
                      ? "bg-red-950/45 border-red-500/50 text-red-200"
                      : "bg-gray-800 border-gray-750 text-gray-300"
                  }`}
                >
                  <span className="font-black text-[14px] sm:text-base">{displayInfo.main}</span>
                  {displayInfo.sub && <span className="text-[11.5px] sm:text-[13px] font-black text-gray-400 mt-0.5">{displayInfo.sub}</span>}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
