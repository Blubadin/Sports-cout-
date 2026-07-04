import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { Undo2 } from "lucide-react";
import { getAreaDisplay } from "../../utils/areaHelper";

export default function HUDActionStatus() {
  const {
    currentAction,
    currentActions,
    sportTemplate,
    getThaiMeaning,
    hudLastSavedText,
    undoLastAction,
    settings,
  } = useScoutContext();

  const isThai = settings?.uiLanguage === "th";

  const getTeamLabel = () => currentAction.teamCode || (isThai ? "ทีม (1/2)" : "Team (1/2)");
  const getAreaLabel = () => {
    if (!currentAction.areaCode) {
      return isThai ? "พื้นที่ (W)" : "Area (W)";
    }
    const code = currentAction.areaCode;
    const foundArea = sportTemplate.areas.find((a) => a.code === code);
    const displayInfo = getAreaDisplay(code, isThai, foundArea?.thaiName || "");
    return displayInfo.sub ? `${displayInfo.main} (${displayInfo.sub})` : displayInfo.main;
  };
  const getSkillLabel = () => currentAction.skillCode || (isThai ? "ทักษะ (Q)" : "Skill (Q)");
  const getResultLabel = () => currentAction.resultCode || (isThai ? "ผลลัพธ์ (E)" : "Result (E)");
  const getFoulLabel = () => currentAction.foulCode || "";

  const renderChip = (
    label: string,
    isSet: boolean,
    type: "team" | "skill" | "area" | "result" | "foul",
  ) => {
    let colorClass = "bg-black/50 text-white/50 border-white/20";
    if (isSet) {
      if (type === "result") {
        colorClass =
          label === "Yes"
            ? "bg-green-500/80 text-white border-green-400"
            : label === "Out"
              ? "bg-red-500/80 text-white border-red-400"
              : "bg-gray-600/80 text-white border-gray-400";
      } else {
        colorClass = "bg-sky-600/80 text-white border-sky-400";
      }
    }

    return (
      <div
        className={`px-2 py-1 md:px-4 md:py-1.5 rounded-lg border backdrop-blur-sm text-[10px] md:text-sm font-bold shadow-lg transition-colors ${colorClass} whitespace-nowrap`}
      >
        {label}
      </div>
    );
  };

  const subSkillText =
    currentAction.descriptors &&
    Object.keys(currentAction.descriptors).length > 0
      ? Object.values(currentAction.descriptors).join(", ")
      : null;

  const canUndo =
    currentActions.length > 0 || Object.keys(currentAction).length > 0;

  return (
    <div className="flex flex-col items-center gap-1.5 md:gap-2 drop-shadow-xl max-w-full">
      {/* Last Saved Event Flash Banner */}
      {hudLastSavedText && (
        <div className="flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-full backdrop-blur-md border border-green-500/40 text-green-300 font-mono text-xs md:text-xs font-bold uppercase tracking-wider animate-in fade-in zoom-in duration-300">
          <span className="opacity-80">Saved:</span>
          <span>{hudLastSavedText}</span>
        </div>
      )}

      {/* Current Actions Rally Chain */}
      {currentActions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 text-xs text-white/90 font-mono max-w-lg mb-0.5 px-4 overflow-hidden">
          {currentActions.map((act, i) => (
            <React.Fragment key={`${act.id || ""}-${i}`}>
              <span className="bg-black/40 px-2 py-0.5 rounded-lg border border-white/5 backdrop-blur whitespace-nowrap">
                {[act.teamCode, act.skillCode, ...(act.descriptors ? Object.values(act.descriptors) : []), act.areaCode, act.resultCode, act.foulCode]
                  .filter(Boolean)
                  .join("/")}
              </span>
              {i < currentActions.length - 1 && (
                <span className="text-white/40">→</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Current Action Editing Chips */}
      <div className="flex items-center gap-1.5 md:gap-2 bg-black/40 p-1.5 md:p-2 rounded-xl backdrop-blur-md border border-white/10 flex-nowrap w-full overflow-x-auto justify-center pointer-events-auto">
        {renderChip(getTeamLabel(), !!currentAction.teamCode, "team")}
        
        {(!currentAction.foulCode || currentAction.skillCode || currentAction.areaCode || currentAction.resultCode) && (
          <>
            {renderChip(getAreaLabel(), !!currentAction.areaCode, "area")}
            {renderChip(getSkillLabel(), !!currentAction.skillCode, "skill")}

            {/* Render sub-skill if present */}
            {subSkillText && (
              <div className="px-1.5 py-1 md:px-2.5 md:py-1 rounded-lg border border-amber-500/30 bg-amber-500/20 text-amber-300 text-[9px] md:text-xs font-bold whitespace-nowrap">
                {subSkillText}
              </div>
            )}

            {renderChip(getResultLabel(), !!currentAction.resultCode, "result")}
          </>
        )}
        
        {currentAction.foulCode && renderChip(getFoulLabel(), true, "foul")}

        {canUndo && (
          <button
            onClick={undoLastAction}
            className="ml-1 p-1.5 md:p-2 bg-red-500/20 hover:bg-red-500/40 active:scale-95 active:bg-red-500/50 text-red-300 rounded-lg border border-red-500/30 backdrop-blur-sm transition-colors flex items-center justify-center shadow-lg"
            title="Undo (Backspace / Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
        )}
      </div>

      {/* Descriptor / Translation text */}
      {currentAction.skillCode && (
        <div className="text-xs md:text-sm text-white/90 font-medium drop-shadow-md text-center max-w-sm px-4">
          {getThaiMeaning(currentAction)}
        </div>
      )}
    </div>
  );
}
