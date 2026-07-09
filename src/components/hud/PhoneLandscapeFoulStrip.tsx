import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { X } from "lucide-react";

interface PhoneLandscapeFoulStripProps {
  onClose: () => void;
}

export default function PhoneLandscapeFoulStrip({
  onClose,
}: PhoneLandscapeFoulStripProps) {
  const { sportTemplate, selectFoul, clearFoul, currentAction, settings } = useScoutContext();
  const fouls = sportTemplate.fouls || [];
  const isThai = settings?.uiLanguage === "th";

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end pointer-events-auto"
      onClick={onClose}
    >
      {/* Invisible upper backdrop */}
      <div
        className="fixed inset-0 -z-10 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        className="bg-gray-950/95 border-t border-white/10 p-2 pb-[env(safe-area-inset-bottom,4px)] shadow-2xl animate-in slide-in-from-bottom duration-200 flex flex-col gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-2">
          <span className="text-amber-500 font-black text-xs tracking-wider uppercase">
            {isThai ? "ฟาวล์ (Foul)" : "Select Foul"}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400"
          >
            <X size={14} />
          </button>
        </div>

        {/* Horizontal scroll container for items */}
        <div className="w-full overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-gray-800">
          <div className="flex gap-2 px-2 min-w-max">
            {currentAction.foulCode && (
              <button
                onClick={() => {
                  clearFoul();
                  onClose();
                }}
                className="h-[48px] px-4 rounded-lg flex items-center justify-center border border-red-900 bg-red-900/40 text-red-400 font-bold text-xs active:scale-95 transition-all"
              >
                CLEAR FOUL
              </button>
            )}

            {fouls.map((f) => {
              const isSelected = currentAction.foulCode === f.code;
              const isCard = f.severity === "card" || f.severity === "technical";
              return (
                <button
                  key={f.code}
                  onClick={() => {
                    if (isSelected) {
                      clearFoul();
                    } else {
                      selectFoul(f);
                    }
                    onClose();
                  }}
                  className={`h-[48px] px-4 rounded-lg flex flex-col items-center justify-center border transition-all active:scale-95 ${
                    isSelected
                      ? "bg-amber-600 border-amber-400 text-white font-black shadow-lg shadow-amber-600/20"
                      : "bg-gray-900 border-gray-800 text-gray-200 hover:border-gray-700"
                  }`}
                >
                  <span className={`font-black text-xs uppercase tracking-wider ${isSelected ? "text-white" : isCard ? "text-red-200" : "text-amber-200"}`}>
                    {f.code}
                  </span>
                  <span className="text-[10px] opacity-75 truncate max-w-[120px] uppercase font-bold">
                    {isThai ? f.labelTh || f.label : f.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
