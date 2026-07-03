import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { X, Users } from "lucide-react";

interface PhoneTeamSheetProps {
  onClose: () => void;
}

export default function PhoneTeamSheet({ onClose }: PhoneTeamSheetProps) {
  const { teams, updateActionField } = useScoutContext();

  const handleSelectTeam = (code: string) => {
    updateActionField("teamCode", code);
    setTimeout(onClose, 100);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end pointer-events-auto bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900/85 backdrop-blur-md rounded-t-3xl border-t border-white/20 p-4 pb-[env(safe-area-inset-bottom,24px)] animate-in slide-in-from-bottom-full duration-300 w-full flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between w-full mb-6">
          <div className="w-10 flex items-center justify-center text-gray-500">
            <Users size={24} />
          </div>
          <h2 className="text-white font-bold text-lg">Select Team</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full bg-white/5 active:bg-white/20"
          >
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {teams.map((team, idx) => (
            <button
              key={`${team.id || ""}-${idx}`}
              onClick={() => handleSelectTeam(team.code)}
              className={`w-full py-5 rounded-lg shadow-lg flex items-center justify-center active:scale-[0.98] transition-transform border border-white/20 ${idx === 0 ? "bg-sky-600" : "bg-green-600"}`}
            >
              <span className="text-white font-black text-xl tracking-wider drop-shadow-md">
                {team.code}
              </span>
              <span className="text-white/80 ml-2 font-medium">
                ({team.name})
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
