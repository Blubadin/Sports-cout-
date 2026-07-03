import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import HUDSkillWheel from "./HUDSkillWheel";
import ProDonutCommandWheel from "./ProDonutCommandWheel";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";

interface Props {
  isActive: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onClick?: () => void;
  onDone?: () => void;
  phase?: "skill" | "descriptor";
  onPhaseChange?: (phase: "skill" | "descriptor") => void;
  hoveredSkill?: string | null;
  hoveredDescriptor?: { groupId: string; optionCode: string } | null;
  previewSkill?: string | null;
  pointerX?: number;
  pointerY?: number;
  onHoverSkill?: (code: string | null) => void;
  onHoverDescriptor?: (val: { groupId: string; optionCode: string } | null) => void;
}

export default function HUDSkillRadial({
  isActive,
  onPointerDown,
  onPointerUp,
  onClick,
  onDone,
  phase = "skill",
  onPhaseChange,
  hoveredSkill,
  hoveredDescriptor,
  previewSkill,
  pointerX = 0,
  pointerY = 0,
  onHoverSkill,
  onHoverDescriptor,
}: Props) {
  const { currentAction, updateActionField, sportTemplate, settings } = useScoutContext();
  const layout = useHUDDeviceLayout();

  const handleSelectSkill = (skillCode: string) => {
    updateActionField("skillCode", skillCode);
    const hasDesc =
      sportTemplate.descriptors &&
      (
        sportTemplate.descriptors[skillCode] ||
        sportTemplate.descriptors["ALL"] ||
        []
      ).length > 0;
    if (hasDesc && onPhaseChange) {
      onPhaseChange("descriptor");
    }
  };

  const handleDescriptorSelect = (groupId: string, value: string) => {
    updateActionField("descriptors" as any, value, groupId);
  };

  const handleHoverItem = (payload: {
    type: "skill" | "descriptor" | "result";
    code: string | null;
    groupId?: string;
  }) => {
    if (payload.type === "skill") {
      if (onHoverSkill) onHoverSkill(payload.code);
    } else if (payload.type === "descriptor") {
      if (onHoverDescriptor) {
        if (payload.code && payload.groupId) {
          onHoverDescriptor({ groupId: payload.groupId, optionCode: payload.code });
        } else {
          onHoverDescriptor(null);
        }
      }
    }
  };

  const activeSkillForDescriptors = previewSkill || currentAction.skillCode;
  const currentSkillGroups =
    activeSkillForDescriptors && sportTemplate.descriptors
      ? sportTemplate.descriptors[activeSkillForDescriptors] ||
        sportTemplate.descriptors["ALL"] ||
        []
      : [];

  let skillWheelSize = 310;
  if (layout.device === "phone") skillWheelSize = 230;
  else if (layout.device === "tablet") skillWheelSize = 280;

  return (
    <div
      className={`transition-all duration-300 transform origin-bottom-right ${isActive ? "scale-100 opacity-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" : "scale-[0.8] opacity-70 hover:opacity-100"}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={!isActive ? onClick : undefined}
    >
      <div
        className={`bg-black/60 backdrop-blur-xl rounded-full border ${isActive ? "border-sky-500/50 shadow-[0_0_20px_rgba(14,165,233,0.2)]" : "border-white/10 shadow-sm p-4"} relative flex items-center justify-center min-w-[64px] min-h-[64px]`}
      >
        {isActive ? (
          <ProDonutCommandWheel
            menuType="skill"
            skills={sportTemplate.skills}
            selectedSkill={activeSkillForDescriptors || undefined}
            descriptors={currentSkillGroups}
            selectedDescriptors={currentAction.descriptors}
            active={isActive}
            size={skillWheelSize}
            uiLanguage={settings.uiLanguage}
            pointerX={pointerX}
            pointerY={pointerY}
            onHoverItem={handleHoverItem}
            hoveredSkill={hoveredSkill || null}
            hoveredDescriptor={hoveredDescriptor || null}
            hoveredResult={null}
            onSelectSkill={handleSelectSkill}
            onSelectDescriptor={handleDescriptorSelect}
          />
        ) : (
          <HUDSkillWheel
            skills={sportTemplate.skills}
            selectedSkill={activeSkillForDescriptors || undefined}
            onSelectSkill={handleSelectSkill}
            descriptors={currentSkillGroups}
            selectedDescriptors={currentAction.descriptors}
            onSelectDescriptor={handleDescriptorSelect}
            active={isActive}
            compact={!isActive}
            size={skillWheelSize}
            onDone={onDone}
            hoveredSkill={hoveredSkill}
            hoveredDescriptor={hoveredDescriptor}
          />
        )}
      </div>
    </div>
  );
}
