import React, { useRef, useEffect, useState } from "react";
import { Action, Area, SportType, Team, AreaSelectionPayload, OutZoneType } from "../../types";
import { useScoutContext } from "../../context/ScoutContext";
import { getAreaDisplay } from "../../utils/areaHelper";
import { resolveAreaSelectionFromPoint } from "../../utils/areaGeometry";
import { OUT_ZONE_LABELS } from "../../sports";

type ProAreaCommandPadProps = {
  sportType: SportType;
  areas: Area[];
  currentAction: Action;
  teams: Team[];
  onSelectArea: (payload: AreaSelectionPayload) => void;
  active: boolean;
  pointerX: number;
  pointerY: number;
  flipCourtSide: boolean;
  onHoverArea: (payload: AreaSelectionPayload | null) => void;
  enableOutOfBoundsZones: boolean;
  hoveredArea?: AreaSelectionPayload | null;
};

export default function ProAreaCommandPad({
  sportType,
  areas,
  currentAction,
  onSelectArea,
  active,
  pointerX,
  pointerY,
  flipCourtSide,
  onHoverArea,
  enableOutOfBoundsZones,
  hoveredArea,
}: ProAreaCommandPadProps) {
  const { settings } = useScoutContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  // Keep measuring container size when active to be completely accurate
  useEffect(() => {
    if (active && containerRef.current) {
      setContainerRect(containerRef.current.getBoundingClientRect());
    }
  }, [active, sportType]);

  // Handle resizing / scroll to keep rect up to date
  useEffect(() => {
    if (!active) return;
    const handleResize = () => {
      if (containerRef.current) {
        setContainerRect(containerRef.current.getBoundingClientRect());
      }
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize);
    };
  }, [active]);

  // Radial aim: derive the virtual court point from pointer direction around the pad center.
  const [localRx, setLocalRx] = useState(0.5);
  const [localRy, setLocalRy] = useState(0.5);
  const [hoveredPayload, setHoveredPayload] = useState<AreaSelectionPayload | null>(null);

  useEffect(() => {
    if (!active || !containerRect) return;

    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    const dx = pointerX - centerX;
    const dy = pointerY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const deadZone = Math.max(28, Math.min(containerRect.width, containerRect.height) * 0.07);

    if (!pointerX || !pointerY || distance < deadZone) {
      setLocalRx(0.5);
      setLocalRy(0.5);
      setHoveredPayload(null);
      onHoverArea(null);
      return;
    }

    const rangeX = Math.max(120, containerRect.width * 0.5);
    const rangeY = Math.max(120, containerRect.height * 0.5);
    const nextPoint = {
      rx: Math.max(0, Math.min(1, 0.5 + dx / rangeX / 2)),
      ry: Math.max(0, Math.min(1, 0.5 + dy / rangeY / 2)),
    };

    const payload = resolveAreaSelectionFromPoint({
      sportType,
      areas,
      point: nextPoint,
      flipCourtSide,
      enableOutOfBoundsZones,
      areaPrecisionMode: settings?.areaPrecisionMode,
      uiLanguage: settings?.uiLanguage,
      source: "absolute-pointer",
    });

    setLocalRx(nextPoint.rx);
    setLocalRy(nextPoint.ry);
    setHoveredPayload(payload);
    onHoverArea(payload);
  }, [pointerX, pointerY, active, containerRect, sportType, areas, flipCourtSide, enableOutOfBoundsZones, settings?.areaPrecisionMode, settings?.uiLanguage, onHoverArea]);

  useEffect(() => {
    if (active) return;
    setLocalRx(0.5);
    setLocalRy(0.5);
    setHoveredPayload(null);
  }, [active]);

  if (!active) return null;

  // Visual Helper: Get standard label for out zone
  const getOutZoneLabel = (zone: OutZoneType) => {
    const isThai = settings?.uiLanguage === "th";
    const labelObj = OUT_ZONE_LABELS[zone];
    return labelObj ? (isThai ? labelObj.thaiLabel : labelObj.label) : zone;
  };

  const isThai = settings?.uiLanguage === "th";

  // Helper to determine if an area/zone in our pad is selected
  const isCodeSelected = (code: string, courtSide?: string, outZone?: string) => {
    return (
      currentAction.areaCode === code &&
      (!courtSide || currentAction.courtSide === courtSide) &&
      (!outZone || currentAction.outZone === outZone)
    );
  };

  // Helper to determine if an area/zone in our pad is hovered currently
  const isCodeHovered = (code: string, courtSide?: string, outZone?: string) => {
    const payload = hoveredArea !== undefined ? hoveredArea : hoveredPayload;
    return (
      payload?.areaCode === code &&
      (!courtSide || payload?.courtSide === courtSide) &&
      (!outZone || payload?.outZone === outZone)
    );
  };

  // Render individual zone block
  const renderZoneBlock = (code: string, label: string, courtSide?: "teamA" | "teamB" | "neutral", className = "") => {
    const isSelected = isCodeSelected(code, courtSide);
    const isHovered = isCodeHovered(code, courtSide);

    return (
      <div
        data-scout-hover-area={code}
        data-scout-hover-court-side={courtSide || "neutral"}
        className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-150 select-none ${
          isSelected
            ? "bg-amber-500 border-amber-400 text-white shadow-[0_0_12px_rgba(245,158,11,0.6)] z-10 scale-[1.02]"
            : isHovered
              ? "bg-amber-500/25 border-amber-500 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)] z-10"
              : "bg-black/30 border-white/10 text-white/75"
        } ${className}`}
      >
        <span className="font-extrabold text-[15px] sm:text-[16px] tracking-wide font-mono leading-none">{code}</span>
        <span className="text-[10px] sm:text-[11px] text-white/40 mt-1 font-medium">{label}</span>
      </div>
    );
  };

  // Match CourtAreaSelector: top half = teamB (normal), teamA (flipped)
  const attackCourtSide = flipCourtSide ? "teamA" : "teamB";

  // Badminton: oppCourtSide = top (opponent), ourCourtSide = bottom (our team)
  const oppCourtSide = flipCourtSide ? "teamA" : "teamB";
  const ourCourtSide = flipCourtSide ? "teamB" : "teamA";

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-[4/3] sm:aspect-[1.4/1] bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between overflow-hidden select-none`}
    >
      {/* Pointer Highlight */}
      <div 
        className="absolute w-8 h-8 rounded-full bg-amber-500/20 border-2 border-amber-400/60 pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.5)] backdrop-blur-[2px]"
        style={{ left: `${localRx * 100}%`, top: `${localRy * 100}%` }}
      >
        <div className="w-1 h-1 bg-amber-300 rounded-full" />
      </div>
      {/* 1. OUT OF BOUNDS - TOP EDGE */}
      <div className="absolute top-0 left-0 right-0 h-[14%] flex">
        {enableOutOfBoundsZones ? (
          sportType === "volleyball" ? (
            <>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_left" className={`flex-1 flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("back_left")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_right" className={`flex-1 flex items-center justify-center border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("back_right")}
              </div>
            </>
          ) : sportType === "football" ? (
            <>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="corner_left" className={`w-[20%] flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "corner_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "corner_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("corner_left")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="opp_endline" className={`flex-1 flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "opp_endline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "opp_endline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("opp_endline")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="corner_right" className={`w-[20%] flex items-center justify-center border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "corner_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "corner_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("corner_right")}
              </div>
            </>
          ) : sportType === "badminton" ? (
            <>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_left" className={`flex-1 flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("back_left")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_right" className={`flex-1 flex items-center justify-center border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("back_right")}
              </div>
            </>
          ) : (
            <>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="baseline_left" className={`flex-1 flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "baseline_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "baseline_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("baseline_left")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="baseline_right" className={`flex-1 flex items-center justify-center border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "baseline_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "baseline_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("baseline_right")}
              </div>
            </>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-950/20 text-white/5 font-extrabold text-[10px] tracking-widest uppercase">
            {isThai ? "ขอบสนามนอก (OOB)" : "OUT OF BOUNDS"}
          </div>
        )}
      </div>

      {/* 2. INNER COURT ROW (Contains LEFT EDGE | COURT CONTAINER | RIGHT EDGE) */}
      <div className="flex-1 w-full flex my-[14%]">
        {/* LEFT EDGE */}
        <div className="w-[15%] h-full flex flex-col">
          {enableOutOfBoundsZones ? (
            sportType === "volleyball" ? (
              <>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_left_far" className={`flex-1 flex items-center justify-center border-r border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_left_far") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_left_far") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ซ้ายไกล" : "L Far"}
                </div>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_left_near" className={`flex-1 flex items-center justify-center border-r border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_left_near") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_left_near") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ซ้ายใกล้" : "L Near"}
                </div>
              </>
            ) : sportType === "football" ? (
              <>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="left_touchline_att" className={`flex-1 flex items-center justify-center border-r border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "left_touchline_att") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "left_touchline_att") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ซ้ายรุก" : "L Att"}
                </div>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="left_touchline_mid" className={`flex-1 flex items-center justify-center border-r border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "left_touchline_mid") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "left_touchline_mid") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ซ้ายกลาง" : "L Mid"}
                </div>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="left_touchline_def" className={`flex-1 flex items-center justify-center border-r border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "left_touchline_def") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "left_touchline_def") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ซ้ายรับ" : "L Def"}
                </div>
              </>
            ) : sportType === "badminton" ? (
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_left" className={`flex-1 flex items-center justify-center border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("side_left")}
              </div>
            ) : (
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="left_sideline" className={`flex-1 flex items-center justify-center border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "left_sideline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "left_sideline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("left_sideline")}
              </div>
            )
          ) : (
            <div className="w-full h-full border-r border-white/5"></div>
          )}
        </div>

        {/* CENTER ACTIVE COURT GRID */}
        <div className="flex-1 h-full p-2 relative bg-black/40 border border-white/10 rounded-xl overflow-hidden">
          {sportType === "volleyball" && (
            <div className="w-full h-full flex gap-1.5 items-stretch relative">
              {/* Left Side */}
              <div className="flex-1 grid grid-cols-2 grid-rows-3 gap-1.5">
                {renderZoneBlock("LB", isThai ? "หลังซ้าย" : "Left Back", flipCourtSide ? "teamB" : "teamA")}
                {renderZoneBlock("LN", isThai ? "หน้าซ้าย" : "Left Net", flipCourtSide ? "teamB" : "teamA")}
                {renderZoneBlock("CB", isThai ? "หลังกลาง" : "Center Back", flipCourtSide ? "teamB" : "teamA")}
                {renderZoneBlock("CN", isThai ? "หน้ากลาง" : "Center Net", flipCourtSide ? "teamB" : "teamA")}
                {renderZoneBlock("RB", isThai ? "หลังขวา" : "Right Back", flipCourtSide ? "teamB" : "teamA")}
                {renderZoneBlock("RN", isThai ? "หน้าขวา" : "Right Net", flipCourtSide ? "teamB" : "teamA")}
              </div>

              {/* NET Line */}
              <div 
                data-scout-hover-area="NET"
                className={`w-6 flex items-center justify-center rounded border transition-all ${isCodeSelected("NET") ? "bg-amber-500 border-amber-400 text-white shadow-[0_0_12px_rgba(245,158,11,0.6)]" : isCodeHovered("NET") ? "bg-amber-500/20 border-amber-500 text-amber-300" : "bg-white/10 border-white/10 text-white/40"}`}>
                <span className="text-[10px] font-black rotate-90 sm:tracking-widest">NET</span>
              </div>

              {/* Right Side */}
              <div className="flex-1 grid grid-cols-2 grid-rows-3 gap-1.5">
                {renderZoneBlock("RN", isThai ? "หน้าขวา" : "Right Net", flipCourtSide ? "teamA" : "teamB")}
                {renderZoneBlock("RB", isThai ? "หลังขวา" : "Right Back", flipCourtSide ? "teamA" : "teamB")}
                {renderZoneBlock("CN", isThai ? "หน้ากลาง" : "Center Net", flipCourtSide ? "teamA" : "teamB")}
                {renderZoneBlock("CB", isThai ? "หลังกลาง" : "Center Back", flipCourtSide ? "teamA" : "teamB")}
                {renderZoneBlock("LN", isThai ? "หน้าซ้าย" : "Left Net", flipCourtSide ? "teamA" : "teamB")}
                {renderZoneBlock("LB", isThai ? "หลังซ้าย" : "Left Back", flipCourtSide ? "teamA" : "teamB")}
              </div>
            </div>
          )}

          {sportType === "football" && (
            <div className="w-full h-full flex flex-col gap-1.5">
              <div className="flex gap-1.5 h-[22%]">
                {renderZoneBlock("GOAL", isThai ? "หน้าประตู" : "Goal Area", attackCourtSide, "flex-1")}
                {renderZoneBlock("BOX", isThai ? "กรอบเขตโทษ" : "Penalty Box", attackCourtSide, "flex-1")}
              </div>
              <div className="flex-1 grid grid-cols-3 grid-rows-3 gap-1.5">
                {renderZoneBlock("ATT_L", isThai ? "ซ้ายหน้า" : "Attack Left", attackCourtSide)}
                {renderZoneBlock("ATT_C", isThai ? "หน้ากลาง" : "Attack Center", attackCourtSide)}
                {renderZoneBlock("ATT_R", isThai ? "ขวาหน้า" : "Attack Right", attackCourtSide)}
                {renderZoneBlock("MID_L", isThai ? "ซ้ายกลาง" : "Mid Left", attackCourtSide)}
                {renderZoneBlock("MID_C", isThai ? "แดนกลาง" : "Mid Center", attackCourtSide)}
                {renderZoneBlock("MID_R", isThai ? "ขวากลาง" : "Mid Right", attackCourtSide)}
                {renderZoneBlock("DEF_L", isThai ? "ซ้ายหลัง" : "Defense Left", attackCourtSide)}
                {renderZoneBlock("DEF_C", isThai ? "หลังกลาง" : "Defense Center", attackCourtSide)}
                {renderZoneBlock("DEF_R", isThai ? "ขวาหลัง" : "Defense Right", attackCourtSide)}
              </div>
            </div>
          )}

          {sportType === "badminton" && (
            <div className="w-full h-full flex flex-col gap-1 relative">
              {/* Opponent Side */}
              <div className="flex-1 grid grid-cols-3 gap-1 opacity-90">
                {renderZoneBlock("BR", isThai ? "หลังขวา" : "Opp BR", oppCourtSide)}
                {renderZoneBlock("BC", isThai ? "หลังกลาง" : "Opp BC", oppCourtSide)}
                {renderZoneBlock("BL", isThai ? "หลังซ้าย" : "Opp BL", oppCourtSide)}
                {renderZoneBlock("MR", isThai ? "กลางขวา" : "Opp MR", oppCourtSide)}
                {renderZoneBlock("MC", isThai ? "กลาง" : "Opp MC", oppCourtSide)}
                {renderZoneBlock("ML", isThai ? "กลางซ้าย" : "Opp ML", oppCourtSide)}
                {renderZoneBlock("FR", isThai ? "หน้าขวา" : "Opp FR", oppCourtSide)}
                {renderZoneBlock("FC", isThai ? "หน้ากลาง" : "Opp FC", oppCourtSide)}
                {renderZoneBlock("FL", isThai ? "หน้าซ้าย" : "Opp FL", oppCourtSide)}
              </div>

              {/* Net divider line */}
              <div 
                data-scout-hover-area="NET_ERR"
                className={`h-4 flex items-center justify-center rounded-lg border transition-all ${isCodeSelected("NET_ERR") ? "bg-amber-500 border-amber-400 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]" : isCodeHovered("NET_ERR") ? "bg-amber-500/20 border-amber-500 text-amber-300" : "bg-sky-950/30 border-sky-500/20 text-sky-300/40"} text-xs font-black uppercase tracking-widest`}>
                NET
              </div>

              {/* Our Side */}
              <div className="flex-1 grid grid-cols-3 gap-1">
                {renderZoneBlock("FL", isThai ? "หน้าซ้าย" : "Our FL", ourCourtSide)}
                {renderZoneBlock("FC", isThai ? "หน้ากลาง" : "Our FC", ourCourtSide)}
                {renderZoneBlock("FR", isThai ? "หน้าขวา" : "Our FR", ourCourtSide)}
                {renderZoneBlock("ML", isThai ? "กลางซ้าย" : "Our ML", ourCourtSide)}
                {renderZoneBlock("MC", isThai ? "กลาง" : "Our MC", ourCourtSide)}
                {renderZoneBlock("MR", isThai ? "กลางขวา" : "Our MR", ourCourtSide)}
                {renderZoneBlock("BL", isThai ? "หลังซ้าย" : "Our BL", ourCourtSide)}
                {renderZoneBlock("BC", isThai ? "หลังกลาง" : "Our BC", ourCourtSide)}
                {renderZoneBlock("BR", isThai ? "หลังขวา" : "Our BR", ourCourtSide)}
              </div>
            </div>
          )}

          {sportType === "basketball" && (
            <div className="w-full h-full flex flex-col gap-1.5">
              <div className="flex gap-1.5 h-[24%]">
                {renderZoneBlock("PAINT", isThai ? "กรอบเขตโทษ" : "The Paint", attackCourtSide, "flex-1")}
              </div>
              <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-1.5">
                {renderZoneBlock("LEFT_WING", isThai ? "ปีกซ้าย" : "Left Wing", attackCourtSide)}
                {renderZoneBlock("TOP_KEY", isThai ? "หัวกะโหลก" : "Top of Key", attackCourtSide)}
                {renderZoneBlock("RIGHT_WING", isThai ? "ปีกขวา" : "Right Wing", attackCourtSide)}
                {renderZoneBlock("LEFT_CORNER", isThai ? "มุมซ้าย" : "Left Corner", attackCourtSide)}
                {renderZoneBlock("MID_RANGE", isThai ? "ระยะกลาง" : "Mid Range", attackCourtSide)}
                {renderZoneBlock("RIGHT_CORNER", isThai ? "มุมขวา" : "Right Corner", attackCourtSide)}
              </div>
              <div className="h-[18%] flex">
                {renderZoneBlock("THREE_PT", isThai ? "นอกเส้น 3 คะแนน" : "3-Point Line", attackCourtSide, "w-full")}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT EDGE */}
        <div className="w-[15%] h-full flex flex-col">
          {enableOutOfBoundsZones ? (
            sportType === "volleyball" ? (
              <>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_right_far" className={`flex-1 flex items-center justify-center border-l border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_right_far") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_right_far") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ขวาไกล" : "R Far"}
                </div>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_right_near" className={`flex-1 flex items-center justify-center border-l border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_right_near") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_right_near") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ขวาใกล้" : "R Near"}
                </div>
              </>
            ) : sportType === "football" ? (
              <>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="right_touchline_att" className={`flex-1 flex items-center justify-center border-l border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "right_touchline_att") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "right_touchline_att") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ขวารุก" : "R Att"}
                </div>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="right_touchline_mid" className={`flex-1 flex items-center justify-center border-l border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "right_touchline_mid") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "right_touchline_mid") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ขวากลาง" : "R Mid"}
                </div>
                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="right_touchline_def" className={`flex-1 flex items-center justify-center border-l border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "right_touchline_def") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "right_touchline_def") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                  {isThai ? "ขวารับ" : "R Def"}
                </div>
              </>
            ) : sportType === "badminton" ? (
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_right" className={`flex-1 flex items-center justify-center border-l border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("side_right")}
              </div>
            ) : (
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="right_sideline" className={`flex-1 flex items-center justify-center border-l border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "right_sideline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "right_sideline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("right_sideline")}
              </div>
            )
          ) : (
            <div className="w-full h-full border-l border-white/5"></div>
          )}
        </div>
      </div>

      {/* 3. OUT OF BOUNDS - BOTTOM EDGE */}
      <div className="absolute bottom-0 left-0 right-0 h-[14%] flex">
        {enableOutOfBoundsZones ? (
          sportType === "volleyball" ? (
            <>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_left" className={`flex-1 flex items-center justify-center border-t border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("back_left")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_right" className={`flex-1 flex items-center justify-center border-t border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("back_right")}
              </div>
            </>
          ) : sportType === "football" ? (
            <>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="own_endline" className={`flex-1 flex items-center justify-center border-t border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "own_endline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "own_endline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("own_endline")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="goal_kick" className={`flex-[1.2] flex items-center justify-center border-t border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "goal_kick") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "goal_kick") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("goal_kick")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="own_endline" className={`flex-1 flex items-center justify-center border-t border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "own_endline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "own_endline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("own_endline")}
              </div>
            </>
          ) : sportType === "badminton" ? (
            <>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_left" className={`flex-1 flex items-center justify-center border-t border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("back_left")}
              </div>
              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_right" className={`flex-1 flex items-center justify-center border-t border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
                {getOutZoneLabel("back_right")}
              </div>
            </>
          ) : (
            <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="endline" className={`flex-1 flex items-center justify-center border-t border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "endline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "endline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
              {getOutZoneLabel("endline")}
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-950/20 text-white/5 font-extrabold text-[10px] tracking-widest uppercase">
            {isThai ? "ขอบสนามนอก (OOB)" : "OUT OF BOUNDS"}
          </div>
        )}
      </div>
    </div>
  );
}

