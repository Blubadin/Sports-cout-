import React from "react";
import { Skill, DescriptorGroup } from "../types";
import { classNames } from "../utils";

type InlineSkillRadialWheelProps = {
  skills: Skill[];
  selectedSkill?: string;
  onSelect: (skillCode: string) => void;
  descriptors?: DescriptorGroup[];
  selectedDescriptors?: Record<string, string>;
  onDescriptorSelect?: (groupId: string, optionCode: string) => void;
};

export default function InlineSkillRadialWheel({
  skills,
  selectedSkill,
  onSelect,
  descriptors = [],
  selectedDescriptors = {},
  onDescriptorSelect,
}: InlineSkillRadialWheelProps) {
  const radius = 90;
  const cx = 200;
  const cy = 190;

  return (
    <div className="relative w-full flex justify-center py-4">
      <div className="relative" style={{ width: "400px", height: "380px" }}>
        {/* Center */}
        <div
          className="absolute rounded-full border-4 border-gray-100 dark:border-gray-800 flex items-center justify-center bg-white dark:bg-gray-900 shadow-inner"
          style={{ width: "60px", height: "60px", left: cx - 30, top: cy - 30 }}
        >
          <span className="text-xs font-bold text-gray-400">SKILL</span>
        </div>

        {/* Skill Nodes */}
        {skills.map((skill, index) => {
          const keys = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
          const slice = 360 / skills.length;
          const angle = index * slice - 90;
          const rad = angle * (Math.PI / 180);
          const x = cx + Math.cos(rad) * radius;
          const y = cy + Math.sin(rad) * radius;
          const isSelected = selectedSkill === skill.code;

          return (
            <button
              key={skill.code}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return;
                onSelect(skill.code);
              }}
              onClick={() => onSelect(skill.code)}
              data-scout-selectable="true"
              data-scout-group="skill"
              data-scout-value={skill.code}
              className={classNames(
                "absolute flex flex-col items-center justify-center rounded-full transition-all duration-200 shadow-md border-2 focus:outline-none focus:ring-4 focus:ring-sky-500/50",
                isSelected
                  ? "bg-sky-600 border-sky-400 text-white scale-110 z-20"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-sky-300 hover:scale-105 z-10",
              )}
              style={{
                width: "64px",
                height: "64px",
                left: x - 32,
                top: y - 32,
              }}
            >
              <span className="font-bold text-sm">{skill.code}</span>
              {skill.thaiName && (
                <span className="text-[9px] opacity-80 leading-tight">
                  {skill.thaiName} {keys[index] ? `[${keys[index]}]` : ""}
                </span>
              )}
            </button>
          );
        })}

        {/* Descriptors Sub-rings */}
        {selectedSkill &&
          descriptors.length > 0 &&
          onDescriptorSelect &&
          skills.map((skill, index) => {
            if (selectedSkill !== skill.code) return null;

            const slice = 360 / skills.length;
            const angle = index * slice - 90;
            const rad = angle * (Math.PI / 180);
            const x = cx + Math.cos(rad) * radius;
            const y = cy + Math.sin(rad) * radius;

            return (
              <div
                key={`desc-${skill.code}`}
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: 30 }}
              >
                {descriptors.map((group, gIdx) =>
                  group.options.map((opt, oIdx) => {
                    // Distribute descriptors around the selected skill
                    const totalOptions = descriptors.reduce(
                      (acc, g) => acc + g.options.length,
                      0,
                    );
                    const optIndex =
                      descriptors
                        .slice(0, gIdx)
                        .reduce((acc, g) => acc + g.options.length, 0) + oIdx;

                    const spacing = 45;
                    // Center the sub-ring around the outward direction of the skill
                    const subAngle =
                      angle -
                      ((totalOptions - 1) * spacing) / 2 +
                      optIndex * spacing;
                    const subRad = subAngle * (Math.PI / 180);
                    const subRadius = 75; // Increased subRadius slightly

                    const subX = x + Math.cos(subRad) * subRadius;
                    const subY = y + Math.sin(subRad) * subRadius;
                    const isOptSelected =
                      selectedDescriptors?.[group.id] === opt.code;

                    return (
                      <button
                        key={`${group.id}-${opt.code}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onDescriptorSelect(group.id, opt.code);
                        }}
                        onPointerEnter={(e) => {
                          if (e.pointerType !== 'mouse') return;
                          onDescriptorSelect(group.id, opt.code);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDescriptorSelect(group.id, opt.code);
                        }}
                        data-scout-selectable="true"
                        data-scout-group="descriptor"
                        data-scout-value={opt.code}
                        data-descriptor-group={group.id}
                        className={classNames(
                          "absolute pointer-events-auto rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm transition-all border",
                          isOptSelected
                            ? "bg-purple-600 border-purple-400 text-white scale-110 z-40"
                            : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 z-30",
                        )}
                        style={{
                          width: "44px",
                          height: "44px",
                          left: subX - 22,
                          top: subY - 22,
                        }}
                        title={opt.label}
                      >
                        {opt.code}
                      </button>
                    );
                  }),
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
