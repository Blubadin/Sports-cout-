import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { X } from "lucide-react";

interface PhoneLandscapeTeamPickerProps {
  onClose: () => void;
}

export default function PhoneLandscapeTeamPicker({
  onClose,
}: PhoneLandscapeTeamPickerProps) {
  const { teams, updateActionField, currentAction } = useScoutContext();

  const handleSelectTeam = (code: string) => {
    updateActionField("teamCode", code);
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-55 flex items-center justify-center pointer-events-auto bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900/90 border border-white/10 rounded-2xl p-4 w-[240px] shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-white text-xs font-black uppercase tracking-wider">
            Select Team
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2.5">
          {teams.map((t) => {
            const isSelected = currentAction.teamCode === t.code;
            return (
              <button
                key={t.code}
                onClick={() => handleSelectTeam(t.code)}
                className={`flex-1 py-3 px-2 rounded-xl border text-center font-black transition-all active:scale-95 ${
                  isSelected
                    ? "bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30"
                    : "bg-gray-800 border-gray-700 hover:border-gray-600 text-gray-300"
                }`}
              >
                <div className="text-sm tracking-wider uppercase">{t.code}</div>
                <div className="text-[9px] font-bold text-gray-400 truncate uppercase mt-0.5">
                  {t.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
