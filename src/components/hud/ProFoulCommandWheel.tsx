import React, { useRef, useEffect, useState } from "react";
import { FoulOption, AppSettings } from "../../types";

type ProFoulCommandWheelProps = {
  fouls: FoulOption[];
  selectedFoul?: string | null;
  active: boolean;
  size?: number;
  uiLanguage: "th" | "en";
  pointerX: number;
  pointerY: number;
  onHoverItem: (code: string | null) => void;
  hoveredFoul: string | null;
  onSelectFoul?: (foul: FoulOption) => void;
};

export default function ProFoulCommandWheel({
  fouls = [],
  selectedFoul,
  active,
  size = 280,
  uiLanguage,
  pointerX,
  pointerY,
  onHoverItem,
  hoveredFoul,
  onSelectFoul,
}: ProFoulCommandWheelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (active && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCenter({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  }, [active, size]);

  const getDonutPath = (
    cx: number,
    cy: number,
    rInner: number,
    rOuter: number,
    startAngle: number,
    endAngle: number
  ) => {
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

  const dx = pointerX - center.x;
  const dy = pointerY - center.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  let pointerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let angleFromUp = pointerAngle + 90;
  if (angleFromUp < 0) angleFromUp += 360;
  if (angleFromUp >= 360) angleFromUp -= 360;

  const deadZone = 40;
  const rInner = 45;
  const rOuter = size / 2 - 5;

  const totalSectors = fouls.length;
  const sectorAngle = totalSectors > 0 ? 360 / totalSectors : 360;

  let hoveredIndex = -1;
  let currentHoveredCode: string | null = null;

  if (distance >= deadZone) {
    hoveredIndex = Math.floor(angleFromUp / sectorAngle) % totalSectors;
    if (hoveredIndex >= 0 && hoveredIndex < fouls.length) {
      currentHoveredCode = fouls[hoveredIndex].code;
    }
  }

  useEffect(() => {
    if (!active) return;
    onHoverItem(currentHoveredCode);
  }, [active, currentHoveredCode, onHoverItem]);

  let centerTitle = "AIM";
  let centerSub = "Release to Select";
  let centerColor = "text-white/40";

  if (distance < deadZone) {
    centerTitle = "FOUL";
    centerSub = uiLanguage === "th" ? "เลื่อนเมาส์เพื่อเลือก" : "Move pointer";
    centerColor = "text-white/40 animate-pulse";
  } else if (hoveredFoul) {
    const f = fouls.find((sk) => sk.code === hoveredFoul);
    centerTitle = hoveredFoul;
    centerSub = f ? (uiLanguage === "th" ? (f.labelTh || f.label) : f.label) : "";
    const isCard = f?.severity === 'card' || f?.severity === 'technical';
    centerColor = isCard ? "text-red-400" : "text-amber-400";
  }

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 overflow-visible drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
      >
        <circle cx={cx} cy={cy} r={size / 2} className="fill-black/45 stroke-white/5" strokeWidth={1} />
        
        {fouls.map((foul, index) => {
          const startAngle = index * sectorAngle;
          const endAngle = (index + 1) * sectorAngle;

          const isSelected = selectedFoul === foul.code || hoveredFoul === foul.code;
          const isHighlighted = hoveredIndex === index && distance >= deadZone;
          
          const isCard = foul.severity === 'card' || foul.severity === 'technical';

          let sectorColor = "fill-black/60 stroke-white/10 hover:fill-black/70";
          if (isHighlighted) {
            sectorColor = isCard ? "fill-red-600/80 stroke-red-300" : "fill-amber-600/85 stroke-amber-300";
          } else if (isSelected) {
            sectorColor = isCard ? "fill-red-950/40 stroke-red-500/50" : "fill-amber-950/40 stroke-amber-500/50";
          }

          const midAngle = (startAngle + endAngle) / 2;
          const labelRad = ((midAngle - 90) * Math.PI) / 180;
          const rLabel = (rInner + rOuter) / 2;
          const lx = cx + rLabel * Math.cos(labelRad);
          const ly = cy + rLabel * Math.sin(labelRad);

          return (
            <g
              key={foul.code}
              className="transition-all duration-150 cursor-pointer"
              onClick={() => {
                if (onSelectFoul) {
                  onSelectFoul(foul);
                }
              }}
            >
              <path
                d={getDonutPath(cx, cy, rInner, rOuter, startAngle, endAngle)}
                className={`${sectorColor} transition-all duration-150`}
              />
              <text
                x={lx}
                y={ly - 2}
                textAnchor="middle"
                className={`text-[11px] sm:text-[12px] font-black tracking-wider select-none pointer-events-none ${
                  isHighlighted ? "fill-white scale-105" : "fill-white/80"
                }`}
              >
                {foul.code}
              </text>
              <text
                x={lx}
                y={ly + 10}
                textAnchor="middle"
                className={`text-[10px] select-none pointer-events-none transition-opacity ${
                  isHighlighted ? "fill-white/90" : "fill-white/40"
                }`}
              >
                {uiLanguage === 'th' ? (foul.labelTh || foul.label) : foul.label}
              </text>
            </g>
          );
        })}

        <g>
          <circle cx={cx} cy={cy} r={44} className="fill-zinc-950 stroke-white/10" strokeWidth={1} />
          {distance >= deadZone && (
            <line
              x1={cx}
              y1={cy}
              x2={cx + Math.min(distance, size / 2) * Math.cos((pointerAngle * Math.PI) / 180)}
              y2={cy + Math.min(distance, size / 2) * Math.sin((pointerAngle * Math.PI) / 180)}
              className="stroke-amber-500/50"
              strokeWidth={2}
              strokeDasharray="2 2"
            />
          )}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            className={`text-[10px] font-black uppercase tracking-widest ${centerColor}`}
          >
            {centerTitle}
          </text>
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            className="text-[10px] fill-white/40 tracking-normal font-medium"
          >
            {centerSub}
          </text>
        </g>
      </svg>
    </div>
  );
}
