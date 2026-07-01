import React, { useState } from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { X, ChevronLeft, Check } from "lucide-react";

interface PhoneLandscapeSkillStripProps {
  onClose: () => void;
}

export default function PhoneLandscapeSkillStrip({
  onClose,
}: PhoneLandscapeSkillStripProps) {
  const { sportTemplate, updateActionField, currentAction } = useScoutContext();
  const [phase, setPhase] = useState<"skill" | "descriptor">("skill");

  const skills = sportTemplate.skills || [];

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

  let descriptorGroups =
    currentAction.skillCode && sportTemplate.descriptors
      ? sportTemplate.descriptors[currentAction.skillCode] ||
        sportTemplate.descriptors["ALL"] ||
        []
      : [];

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
          <div className="flex items-center gap-2">
            {phase === "descriptor" && (
              <button
                onClick={() => setPhase("skill")}
                className="flex items-center gap-1 text-xs text-indigo-400 font-bold bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-0.5 rounded"
              >
                <ChevronLeft size={14} />
                <span>Back</span>
              </button>
            )}
            <span className="text-white font-black text-[10px] tracking-wider uppercase">
              {phase === "skill"
                ? "Select Skill"
                : `${currentAction.skillCode} options`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400"
          >
            <X size={14} />
          </button>
        </div>

        {/* Horizontal scroll container for items */}
        <div className="w-full overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-gray-800">
          {phase === "skill" ? (
            <div className="flex gap-2 px-2 min-w-max">
              {skills.map((s) => {
                const isSelected = currentAction.skillCode === s.code;
                return (
                  <button
                    key={s.code}
                    onClick={() => handleSelectSkill(s.code)}
                    className={`h-[48px] px-4 rounded-xl flex flex-col items-center justify-center border transition-all active:scale-95 ${
                      isSelected
                        ? "bg-indigo-600 border-indigo-400 text-white font-black shadow-lg shadow-indigo-600/20"
                        : "bg-gray-900 border-gray-800 text-gray-200 hover:border-gray-700"
                    }`}
                  >
                    <span className="font-black text-xs uppercase tracking-wider">
                      {s.code}
                    </span>
                    <span className="text-[8px] opacity-75 truncate max-w-[80px] uppercase font-bold">
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-4 px-2 items-center min-w-max">
              {descriptorGroups.map((group) => (
                <div key={group.id} className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest bg-gray-900 px-1.5 py-2.5 rounded border border-gray-800">
                    {group.label}:
                  </span>
                  {group.options.map((opt) => (
                    <button
                      key={opt.code}
                      onClick={() => handleSelectDesc(group.id, opt.code)}
                      className="h-[42px] px-3 bg-gray-800 border border-gray-700 hover:border-gray-600 text-white rounded-lg flex items-center justify-center font-black text-xs active:scale-95 transition-all"
                    >
                      {opt.code}
                    </button>
                  ))}
                </div>
              ))}
              <button
                onClick={onClose}
                className="h-[42px] px-3 bg-emerald-700/80 border border-emerald-500 text-white rounded-lg flex items-center justify-center gap-1 text-xs font-black active:scale-95 transition-all"
              >
                <Check size={14} />
                <span>Skip (Done)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
