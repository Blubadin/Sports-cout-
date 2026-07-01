import React, { useState } from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { X, ChevronLeft, Check } from "lucide-react";

interface PhoneSkillSheetProps {
  onClose: () => void;
}

export default function PhoneSkillSheet({ onClose }: PhoneSkillSheetProps) {
  const { sportTemplate, updateActionField, currentAction, settings } = useScoutContext();
  const [phase, setPhase] = useState<"skill" | "descriptor">("skill");
  const isCompact = settings?.phoneScoutDensity === "compact";

  const handleSelectSkill = (skillCode: string) => {
    updateActionField("skillCode", skillCode);
    const hasDesc =
      sportTemplate.descriptors &&
      (
        sportTemplate.descriptors[skillCode] ||
        sportTemplate.descriptors["ALL"] ||
        []
      ).length > 0;
    if (hasDesc) {
      setPhase("descriptor");
    } else {
      onClose();
    }
  };

  const handleSelectDesc = (groupId: string, code: string | null) => {
    if (code) {
      updateActionField("descriptors" as any, code, groupId);
    }
    onClose();
  };

  const skills = sportTemplate.skills || [];

  let descriptorGroups =
    currentAction.skillCode && sportTemplate.descriptors
      ? sportTemplate.descriptors[currentAction.skillCode] ||
        sportTemplate.descriptors["ALL"] ||
        []
      : [];

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
          {phase === "descriptor" ? (
            <button
              onClick={() => setPhase("skill")}
              className="p-2 -ml-2 rounded-full bg-white/5 active:bg-white/20"
            >
              <ChevronLeft size={24} className="text-white" />
            </button>
          ) : (
            <div className="w-10" />
          )}

          <h2 className="text-white font-bold text-lg">
            {phase === "skill"
              ? "Select Skill"
              : `Select ${currentAction.skillCode} Sub-Skill`}
          </h2>

          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full bg-white/5 active:bg-white/20"
          >
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {phase === "skill" && (
            <div className={`grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${isCompact ? 'gap-1 sm:gap-2' : 'gap-2 sm:gap-3'}`}>
              {skills.map((s) => (
                <button
                  key={s.code}
                  onClick={() => handleSelectSkill(s.code)}
                  className={`${isCompact ? 'h-[46px] sm:h-[40px] rounded-lg' : 'h-[64px] sm:h-[52px] rounded-xl'} flex flex-col items-center justify-center shadow-md active:scale-95 transition-transform p-1 border border-white/10 bg-indigo-600 hover:bg-indigo-500`}
                >
                  <span className={`${isCompact ? 'text-xs' : 'text-sm sm:text-base'} text-white font-black drop-shadow-sm`}>
                    {s.code}
                  </span>
                  {!isCompact && (
                    <span className="text-white/80 text-[9px] sm:text-[10px] uppercase font-bold tracking-wider mt-0.5 truncate w-full text-center px-1">
                      {s.name}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {phase === "descriptor" && (
            <div className={`flex flex-col ${isCompact ? 'gap-2' : 'gap-4'}`}>
              {descriptorGroups.map((group) => (
                <div key={group.id} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    {group.label}
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {group.options.map((opt) => (
                      <button
                        key={opt.code}
                        onClick={() => handleSelectDesc(group.id, opt.code)}
                        className={`${isCompact ? 'h-[40px] rounded-lg' : 'h-[52px] sm:h-[46px] rounded-xl'} flex flex-col items-center justify-center shadow-md active:scale-95 transition-transform border border-white/10 bg-gray-700 hover:bg-gray-600`}
                      >
                        <span className="text-white font-bold text-sm sm:text-base drop-shadow-md">
                          {opt.code}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => onClose()}
                className={`w-full ${isCompact ? 'py-1.5 text-xs' : 'py-3'} mt-2 bg-gray-800 rounded-xl text-gray-300 font-bold active:bg-gray-700 active:scale-[0.98] transition-all border border-gray-700 flex items-center justify-center gap-2`}
              >
                <Check size={18} />
                <span>Skip Detail (Done)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
