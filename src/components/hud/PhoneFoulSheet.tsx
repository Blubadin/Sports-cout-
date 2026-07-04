import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { X } from "lucide-react";

interface PhoneFoulSheetProps {
  onClose: () => void;
}

export default function PhoneFoulSheet({ onClose }: PhoneFoulSheetProps) {
  const { sportTemplate, selectFoul, clearFoul, currentAction, settings } = useScoutContext();
  const fouls = sportTemplate.fouls || [];
  const isCompact = settings?.phoneScoutDensity === "compact";

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end pointer-events-auto bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900/85 backdrop-blur-md rounded-t-3xl border-t border-white/20 p-4 pb-[env(safe-area-inset-bottom,16px)] animate-in slide-in-from-bottom-full duration-300 w-full max-h-[55vh] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <div className="w-10" />
          <h2 className="text-amber-500 font-bold text-lg">
            {settings.uiLanguage === 'th' ? 'ฟาวล์ (Foul)' : 'Select Foul'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full bg-white/5 active:bg-white/20"
          >
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          <div className={`grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${isCompact ? 'gap-1 sm:gap-2' : 'gap-2 sm:gap-3'}`}>
            {currentAction.foulCode && (
              <button
                onClick={() => {
                  clearFoul();
                  onClose();
                }}
                className={`${isCompact ? 'h-[46px] sm:h-[40px]' : 'h-[64px] sm:h-[52px]'} col-span-3 md:col-span-4 lg:col-span-5 rounded-lg flex flex-col items-center justify-center shadow-md active:scale-95 transition-transform p-1 border bg-red-900/40 text-red-400 hover:bg-red-800/60 border-red-900`}
              >
                <span className="text-xs sm:text-sm font-bold">CLEAR FOUL</span>
              </button>
            )}
            {fouls.map((f) => {
              const isSelected = currentAction.foulCode === f.code;
              const isCard = f.severity === 'card' || f.severity === 'technical';
              
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
                  className={`${isCompact ? 'h-[46px] sm:h-[40px]' : 'h-[64px] sm:h-[52px]'} rounded-lg flex flex-col items-center justify-center shadow-md active:scale-95 transition-transform p-1 border ${isSelected ? (isCard ? 'bg-red-500 border-red-400' : 'bg-amber-500 border-amber-400') : (isCard ? 'bg-black/50 border-red-900/50 hover:bg-red-900/40' : 'bg-black/50 border-amber-900/50 hover:bg-amber-900/40')}`}
                >
                  <span className={`${isCompact ? 'text-xs' : 'text-sm sm:text-base'} font-black drop-shadow-sm ${isSelected ? 'text-white' : (isCard ? 'text-red-200' : 'text-amber-200')}`}>
                    {f.code}
                  </span>
                  {!isCompact && (
                    <span className={`text-xs font-bold tracking-wider mt-0.5 truncate w-full text-center px-1 ${isSelected ? 'text-white/90' : (isCard ? 'text-red-200/80' : 'text-amber-200/80')}`}>
                      {settings.uiLanguage === 'th' ? (f.labelTh || f.label) : f.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
