import React, { useRef, useEffect, useState } from "react";
import { Skill, DescriptorGroup, AppSettings } from "../../types";

type ProDonutCommandWheelProps = {
  menuType: "skill" | "result" | "team";
  skills?: Skill[];
  results?: Array<{ code: string; label: string; sub: string; color: string }>;
  selectedSkill?: string | null;
  descriptors?: DescriptorGroup[];
  selectedDescriptors?: Record<string, string>;
  active: boolean;
  size?: number;
  uiLanguage: "th" | "en";
  pointerX: number;
  pointerY: number;
  onHoverItem: (payload: {
    type: "skill" | "descriptor" | "result";
    code: string | null;
    groupId?: string;
  }) => void;
  hoveredSkill: string | null;
  hoveredDescriptor: { groupId: string; optionCode: string } | null;
  hoveredResult: string | null;
  onSelectSkill?: (code: string) => void;
  onSelectDescriptor?: (groupId: string, optionCode: string) => void;
  onSelectResult?: (code: string) => void;
};

export default function ProDonutCommandWheel({
  menuType,
  skills = [],
  results = [],
  selectedSkill,
  descriptors = [],
  selectedDescriptors = {},
  active,
  size = 320,
  uiLanguage,
  pointerX,
  pointerY,
  onHoverItem,
  hoveredSkill,
  hoveredDescriptor,
  hoveredResult,
  onSelectSkill,
  onSelectDescriptor,
  onSelectResult,
}: ProDonutCommandWheelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState({ x: 0, y: 0 });

  // Update center position on render/resize
  useEffect(() => {
    if (active && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCenter({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  }, [active, size]);

  // Recalculate center when pointer changes just in case, but throttled/debounced isn't needed
  // if we just read client rect occasionally. To be safe, measure on pointer change too but don't do it in render.

  // Helper to generate donut sector path
  const getDonutPath = (
    cx: number,
    cy: number,
    rInner: number,
    rOuter: number,
    startAngle: number,
    endAngle: number
  ) => {
    // Add small visual gap between sectors
    const gap = 1.5;
    const sAngle = startAngle + gap;
    const eAngle = endAngle - gap;

    const startRad = ((sAngle - 90) * Math.PI) / 180;
    const endRad = ((eAngle - 90) * Math.PI) / 180;

    const x1_out = cx + rOuter * Math.cos(startRad);
    const y1_out = cy + rOuter * Math.sin(startRad);
    const x2_out = cx + rOuter * Math.cos(endRad);
    const y2_out = cy + rOuter * Math.sin(endRad);

    const x1_in = cx + rInner * Math.cos(startRad);
    const y1_in = cy + rInner * Math.sin(startRad);
    const x2_in = cx + rInner * Math.cos(endRad);
    const y2_in = cy + rInner * Math.sin(endRad);

    const largeArcFlag = eAngle - sAngle <= 180 ? 0 : 1;

    return `
      M ${x1_out} ${y1_out}
      A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2_out} ${y2_out}
      L ${x2_in} ${y2_in}
      A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x1_in} ${y1_in}
      Z
    `;
  };

  const cx = size / 2;
  const cy = size / 2;

  // Let's perform geometry-based selection calculation
  const dx = pointerX - center.x;
  const dy = pointerY - center.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  let pointerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let angleFromUp = pointerAngle + 90;
  if (angleFromUp < 0) angleFromUp += 360;
  if (angleFromUp >= 360) angleFromUp -= 360;

  const deadZone = 45;
  const innerRadiusMax = 110;

  // Render variables depending on menuType
  let items: Array<{ code: string; label: string; sub?: string }> = [];
  if (menuType === "skill") {
    items = skills.map((s) => ({
      code: s.code,
      label: s.code,
      sub: uiLanguage === "th" ? s.thaiName : s.name,
    }));
  } else if (menuType === "result") {
    items = results.map((r) => ({
      code: r.code,
      label: r.code,
      sub: r.sub,
    }));
  }

  const totalSectors = items.length;
  const sectorAngle = totalSectors > 0 ? 360 / totalSectors : 360;

  // Determine hovered inner sector index
  let hoveredInnerIndex = -1;
  let currentHoveredCode: string | null = null;

  if (distance >= deadZone) {
    if (distance < innerRadiusMax || (!hoveredSkill && !selectedSkill)) {
      hoveredInnerIndex = Math.floor(angleFromUp / sectorAngle) % totalSectors;
      if (hoveredInnerIndex >= 0 && hoveredInnerIndex < items.length) {
        currentHoveredCode = items[hoveredInnerIndex].code;
      }
    } else {
      currentHoveredCode = hoveredSkill || selectedSkill || null;
      hoveredInnerIndex = items.findIndex((i) => i.code === currentHoveredCode);
    }
  }

  // Handle nested descriptor options (sub-skills) for skill wheel
  // TODO: Add support for multiple descriptor groups by allowing user to toggle active group
  // or by rendering multiple outer concentric rings for each group in the DescriptorGroup array.
  const activeSkillCode = selectedSkill || currentHoveredCode;
  const activeDescriptors =
    menuType === "skill" && activeSkillCode && descriptors.length > 0
      ? descriptors[0].options // For simplicity of single-axis weapon wheel, map options of 1st descriptor group
      : [];

  const totalDescSectors = activeDescriptors.length;
  const descSectorAngle = totalDescSectors > 0 ? 360 / totalDescSectors : 360;

  let hoveredDescIndex = -1;
  let currentHoveredDescCode: string | null = null;

  if (menuType === "skill" && distance >= innerRadiusMax && totalDescSectors > 0) {
    hoveredDescIndex = Math.floor(angleFromUp / descSectorAngle) % totalDescSectors;
    if (hoveredDescIndex >= 0 && hoveredDescIndex < activeDescriptors.length) {
      currentHoveredDescCode = activeDescriptors[hoveredDescIndex].code;
    }
  }

  // Trigger hover updates to parent hook
  useEffect(() => {
    if (!active) return;

    if (menuType === "skill") {
      // If we are in the outer descriptor ring
      if (distance >= innerRadiusMax && currentHoveredDescCode && descriptors[0]) {
        // Keep parent skill hovered too!
        onHoverItem({
          type: "skill",
          code: activeSkillCode,
        });
        onHoverItem({
          type: "descriptor",
          code: currentHoveredDescCode,
          groupId: descriptors[0].id,
        });
      } else {
        // Inner ring or center
        onHoverItem({
          type: "skill",
          code: currentHoveredCode,
        });
        onHoverItem({
          type: "descriptor",
          code: null,
        });
      }
    } else if (menuType === "result") {
      onHoverItem({
        type: "result",
        code: currentHoveredCode,
      });
    }
  }, [
    active,
    menuType,
    distance,
    currentHoveredCode,
    currentHoveredDescCode,
    activeSkillCode,
  ]);

  // Center display content
  let centerTitle = "AIM";
  let centerSub = "Release to Select";
  let centerColor = "text-white/40";

  if (distance < deadZone) {
    centerTitle = menuType === "skill" ? "SKILL" : "RESULT";
    centerSub = uiLanguage === "th" ? "เลื่อนเมาส์เพื่อเลือก" : "Move pointer";
    centerColor = "text-white/40 animate-pulse";
  } else if (menuType === "skill") {
    if (distance >= innerRadiusMax && hoveredDescriptor && descriptors[0]) {
      const parentSkill = skills.find((s) => s.code === hoveredSkill);
      const pName = parentSkill ? (uiLanguage === "th" ? parentSkill.thaiName : parentSkill.name) : hoveredSkill;
      const descObj = descriptors[0].options.find(o => o.code === hoveredDescriptor.optionCode);
      const descName = descObj ? (uiLanguage === "th" ? descObj.thaiLabel : descObj.label) : hoveredDescriptor.optionCode;

      centerTitle = `${hoveredSkill} + ${hoveredDescriptor.optionCode}`;
      centerSub = `${pName} / ${descName}`;
      centerColor = "text-sky-400";
    } else if (hoveredSkill) {
      const s = skills.find((sk) => sk.code === hoveredSkill);
      centerTitle = hoveredSkill;
      centerSub = s ? (uiLanguage === "th" ? s.thaiName : s.name) : "";
      centerColor = "text-sky-400";
    }
  } else if (menuType === "result" && hoveredResult) {
    const res = results.find((r) => r.code === hoveredResult);
    centerTitle = hoveredResult.toUpperCase();
    centerSub = res ? res.sub : "";
    centerColor = hoveredResult === "Yes" ? "text-green-400" : hoveredResult === "Out" ? "text-red-400" : "text-sky-400";
  }

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      data-controller-wheel={menuType}
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 overflow-visible drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
      >
        {/* Background base circle */}
        <circle
          cx={cx}
          cy={cy}
          r={size / 2}
          className="fill-black/45 stroke-white/5"
          strokeWidth={1}
        />

        {/* Outer Ring boundary marker */}
        {menuType === "skill" && activeDescriptors.length > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={innerRadiusMax}
            className="fill-none stroke-white/10"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}

        {/* 1. RENDER MAIN INNER SECTORS */}
        {items.map((item, index) => {
          const startAngle = index * sectorAngle;
          const endAngle = (index + 1) * sectorAngle;

          const isSelected =
            menuType === "skill"
              ? selectedSkill === item.code || hoveredSkill === item.code
              : hoveredResult === item.code;

          const isHighlighted = hoveredInnerIndex === index && distance >= deadZone;

          // Sector fill colors
          let sectorColor = "fill-black/60 stroke-white/10 hover:fill-black/70";
          if (isHighlighted) {
            if (menuType === "result") {
              sectorColor =
                item.code === "Yes"
                  ? "fill-green-600/80 stroke-green-300"
                  : item.code === "Out"
                    ? "fill-red-600/80 stroke-red-300"
                    : "fill-sky-600/80 stroke-sky-300";
            } else {
              sectorColor = "fill-sky-600/85 stroke-sky-300";
            }
          } else if (isSelected) {
            sectorColor = "fill-sky-950/40 stroke-sky-500/50";
          }

          // Label coordinates
          const midAngle = (startAngle + endAngle) / 2;
          const labelRad = ((midAngle - 90) * Math.PI) / 180;
          const rLabel = (45 + 110) / 2;
          const lx = cx + rLabel * Math.cos(labelRad);
          const ly = cy + rLabel * Math.sin(labelRad);

          return (
            <g
              key={item.code}
              className="transition-all duration-150 cursor-pointer"
              onClick={() => {
                if (menuType === "skill" && onSelectSkill) {
                  onSelectSkill(item.code);
                } else if (menuType === "result" && onSelectResult) {
                  onSelectResult(item.code);
                }
              }}
            >
              <path
                d={getDonutPath(cx, cy, 45, 110, startAngle, endAngle)}
                className={`${sectorColor} transition-all duration-150`}
              />
              {/* Text Label */}
              <text
                x={lx}
                y={ly - 2}
                textAnchor="middle"
                className={`text-[12px] sm:text-[13px] font-black tracking-wider select-none pointer-events-none ${
                  isHighlighted ? "fill-white scale-105 font-black" : "fill-white/80"
                }`}
              >
                {item.code}
              </text>
              {item.sub && (
                <text
                  x={lx}
                  y={ly + 10}
                  textAnchor="middle"
                  className={`text-xs select-none pointer-events-none transition-opacity ${
                    isHighlighted ? "fill-white/90" : "fill-white/40"
                  }`}
                >
                  {item.sub}
                </text>
              )}
            </g>
          );
        })}

        {/* 2. RENDER OUTER DESCRIPTOR RING (Only for skill type when sub-skills exist) */}
        {menuType === "skill" && activeDescriptors.length > 0 && (
          <g className="transition-opacity duration-200">
            {activeDescriptors.map((desc, index) => {
              const startAngle = index * descSectorAngle;
              const endAngle = (index + 1) * descSectorAngle;

              const isHighlighted =
                hoveredDescIndex === index && distance >= innerRadiusMax;

              let sectorColor = "fill-black/75 stroke-sky-500/20";
              if (isHighlighted) {
                sectorColor = "fill-sky-600/90 stroke-sky-300";
              } else if (
                selectedDescriptors[descriptors[0].id] === desc.code ||
                hoveredDescriptor?.optionCode === desc.code
              ) {
                sectorColor = "fill-sky-950/40 stroke-sky-500/50";
              }

              // Outer Ring Label Coordinates
              const midAngle = (startAngle + endAngle) / 2;
              const labelRad = ((midAngle - 90) * Math.PI) / 180;
              const rLabel = (112 + 155) / 2;
              const lx = cx + rLabel * Math.cos(labelRad);
              const ly = cy + rLabel * Math.sin(labelRad);

              return (
                <g
                  key={desc.code}
                  className="cursor-pointer"
                  onClick={() => {
                    if (onSelectDescriptor && descriptors[0]) {
                      onSelectDescriptor(descriptors[0].id, desc.code);
                    }
                  }}
                >
                  <path
                    d={getDonutPath(cx, cy, 112, 155, startAngle, endAngle)}
                    className={`${sectorColor} transition-all duration-150`}
                  />
                  {/* Option Label */}
                  <text
                    x={lx}
                    y={ly - 1}
                    textAnchor="middle"
                    className={`text-xs font-bold select-none pointer-events-none ${
                      isHighlighted ? "fill-white font-extrabold" : "fill-white/70"
                    }`}
                  >
                    {desc.code}
                  </text>
                  <text
                    x={lx}
                    y={ly + 9}
                    textAnchor="middle"
                    className="text-xs select-none pointer-events-none"
                  >
                    {uiLanguage === "th" ? desc.thaiLabel : desc.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* 3. CENTER INNER DISPLAY AREA */}
        <g>
          {/* Inner center circle overlay */}
          <circle
            cx={cx}
            cy={cy}
            r={44}
            className="fill-zinc-950 stroke-white/10"
            strokeWidth={1}
          />
          {/* Circular progress pointer indicator */}
          {distance >= deadZone && (
            <line
              x1={cx}
              y1={cy}
              x2={cx + Math.min(distance, size / 2) * Math.cos(pointerRad(pointerAngle))}
              y2={cy + Math.min(distance, size / 2) * Math.sin(pointerRad(pointerAngle))}
              className="stroke-sky-500/50"
              strokeWidth={2}
              strokeDasharray="2 2"
            />
          )}

          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            className={`text-xs font-black uppercase tracking-widest ${centerColor}`}
          >
            {centerTitle}
          </text>
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            className="text-xs fill-white/40 tracking-normal font-medium"
          >
            {centerSub}
          </text>
        </g>
      </svg>
    </div>
  );
}

function pointerRad(deg: number) {
  return (deg * Math.PI) / 180;
}
