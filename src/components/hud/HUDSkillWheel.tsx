import React from "react";
import { Skill, DescriptorGroup } from "../../types";

type HUDSkillWheelProps = {
  skills: Skill[];
  selectedSkill?: string;
  descriptors?: DescriptorGroup[];
  selectedDescriptors?: Record<string, string>;
  active: boolean;
  compact: boolean;
  size: number;
  onSelectSkill: (skillCode: string) => void;
  onSelectDescriptor: (groupId: string, optionCode: string) => void;
  onDone?: () => void;
  hoveredSkill?: string | null;
  hoveredDescriptor?: { groupId: string; optionCode: string } | null;
};

export default function HUDSkillWheel({
  skills,
  selectedSkill,
  descriptors = [],
  selectedDescriptors = {},
  active,
  compact,
  size,
  onSelectSkill,
  onSelectDescriptor,
  onDone,
  hoveredSkill,
  hoveredDescriptor,
}: HUDSkillWheelProps) {
  // Calculate dynamic size to fit descriptor rings
  const maxDescriptorGroups =
    selectedSkill && descriptors ? descriptors.length : 0;
  const paddingMultiplier =
    maxDescriptorGroups > 0 ? 1 + maxDescriptorGroups * 0.22 : 1;
  const actualSize = size * paddingMultiplier;
  const center = actualSize / 2;
  const radius = (size * 0.22) / paddingMultiplier; // Base radius for main skills scaled down proportionally when descriptors are present

  // Base SVG and styles
  if (!active || compact) {
    return (
      <div className="flex flex-col items-center justify-center">
        <span className="font-bold text-white/90 text-sm">
          {selectedSkill || "SKILL"}
        </span>
        <span className="text-xs text-white/50 font-bold">(Q)</span>
      </div>
    );
  }

  // Draw radial logic
  const renderItems = (
    items: { code: string; label: string }[],
    customRadius?: number,
    isDescriptor = false,
    groupId?: string,
  ) => {
    const total = items.length;
    const r = customRadius !== undefined ? customRadius : radius;

    return items.map((item, index) => {
      const angle = (index * (360 / total) - 90) * (Math.PI / 180);
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);

      const isSelected =
        isDescriptor && groupId
          ? selectedDescriptors[groupId] === item.code
          : selectedSkill === item.code;

      const isHovered =
        isDescriptor && groupId
          ? hoveredDescriptor?.groupId === groupId &&
            hoveredDescriptor?.optionCode === item.code
          : hoveredSkill === item.code;

      // Attributes for global hover tracking
      const hoverAttrs =
        isDescriptor && groupId
          ? {
              "data-scout-hover-skill": selectedSkill || "",
              "data-scout-hover-descriptor-group": groupId,
              "data-scout-hover-descriptor-option": item.code,
            }
          : {
              "data-scout-hover-skill": item.code,
            };

      return (
        <g
          key={item.code}
          transform={`translate(${x}, ${y})`}
          className="cursor-pointer group"
          {...hoverAttrs}
          onPointerEnter={() => {
            if (active) {
              if (isDescriptor && groupId) {
                (window as any).__hoveredSkill = selectedSkill || "";
                (window as any).__hoveredDescriptor = {
                  groupId,
                  optionCode: item.code,
                };
              } else {
                (window as any).__hoveredSkill = item.code;
                (window as any).__hoveredDescriptor = null;
              }
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (active) {
              if (isDescriptor && groupId) {
                onSelectDescriptor(groupId, item.code);
              } else {
                onSelectSkill(item.code);
              }
            }
          }}
        >
          {/* Invisible hit area for easier selection */}
          <circle
            r={isDescriptor ? size * 0.15 : size * 0.18}
            className="fill-transparent"
          />
          <circle
            r={isDescriptor ? size * 0.08 : size * 0.1}
            className={`transition-all duration-200 ${
              isSelected
                ? isDescriptor
                  ? "fill-sky-500 stroke-white"
                  : "fill-sky-500 stroke-white"
                : isHovered
                  ? isDescriptor
                    ? "fill-sky-600/90 stroke-white scale-105"
                    : "fill-sky-600/90 stroke-white scale-105"
                  : "fill-black/80 stroke-white/20 group-hover:fill-white/20"
            }`}
            strokeWidth={isSelected || isHovered ? 2 : 1}
          />
          <text
            textAnchor="middle"
            dy=".3em"
            className={`font-bold transition-all pointer-events-none select-none text-xs ${
              isSelected || isHovered
                ? "fill-white"
                : "fill-white/80 group-hover:fill-white"
            }`}
          >
            {item.label}
          </text>
        </g>
      );
    });
  };

  return (
    <div
      className="scout-skill-menu relative pointer-events-auto transition-all duration-300"
      style={{ width: actualSize, height: actualSize }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${actualSize} ${actualSize}`}
        className="absolute inset-0 overflow-visible"
      >
        {/* Center label (Interactive "Done" if selectedSkill is active) */}
        <g
          className="cursor-pointer group/center"
          onClick={(e) => {
            e.stopPropagation();
            if (onDone) onDone();
          }}
        >
          {/* Invisible hit area for center */}
          <circle
            cx={center}
            cy={center}
            r={size * 0.22}
            className="fill-transparent"
          />
          <circle
            cx={center}
            cy={center}
            r={size * 0.14}
            className={`transition-all duration-200 ${
              selectedSkill
                ? "fill-green-500/80 stroke-white/40 group-hover/center:fill-green-400"
                : "fill-black/40 stroke-white/10 group-hover/center:fill-white/10"
            }`}
          />
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dy=".3em"
            className={`font-bold uppercase tracking-wider text-xs select-none pointer-events-none ${
              selectedSkill ? "fill-white" : "fill-white/50"
            }`}
          >
            {selectedSkill ? "Done ✓" : "Skill (Q)"}
          </text>
        </g>

        {/* Outer connections */}
        {skills.map((skill, index) => {
          const angle = (index * (360 / skills.length) - 90) * (Math.PI / 180);
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          return (
            <line
              key={`line-${skill.code}`}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              className="stroke-white/10"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Skill Ring */}
        {renderItems(skills.map((s) => ({ code: s.code, label: s.code })))}

        {/* Descriptor Ring if selected skill has descriptors */}
        {selectedSkill && descriptors.length > 0 && (
          <g>
            {descriptors.map((group, groupIdx) => {
              // Offset slightly larger for sub-ring
              return renderItems(
                group.options.map((o) => ({ code: o.code, label: o.code })),
                size * 0.38 + groupIdx * size * 0.14,
                true,
                group.id,
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
