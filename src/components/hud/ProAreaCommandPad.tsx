import React, { useRef, useEffect, useState } from "react";
import { Action, Area, SportType, Team, AreaSelectionPayload, OutZoneType } from "../../types";
import { useScoutContext } from "../../context/ScoutContext";
import { getAreaDisplay } from "../../utils/areaHelper";
import { OUT_ZONE_LABELS, DETAILED_ZONE_LABELS, SPORT_TEMPLATES } from "../../sports";

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
  teams,
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

  // We run geometry hit testing on pointer coordinate changes
  const [localRx, setLocalRx] = useState(0.5);
  const [localRy, setLocalRy] = useState(0.5);
  const [hoveredPayload, setHoveredPayload] = useState<AreaSelectionPayload | null>(null);

  useEffect(() => {
    if (!active || !containerRect) return;

    // Relative mouse coordinate in [0, 1]
    let rx = (pointerX - containerRect.left) / containerRect.width;
    let ry = (pointerY - containerRect.top) / containerRect.height;
    
    setLocalRx(rx);
    setLocalRy(ry);


    // Handle rotation/flip court side
    if (flipCourtSide) {
      rx = 1.0 - rx;
      ry = 1.0 - ry;
    }

    // Clamp coordinates
    rx = Math.max(0, Math.min(1, rx));
    ry = Math.max(0, Math.min(1, ry));

    let payload: AreaSelectionPayload | null = null;

    // Outer boundary mapping (rx < 0.15, rx > 0.85, ry < 0.15, ry > 0.85)
    const isOutZone = rx < 0.15 || rx > 0.85 || ry < 0.15 || ry > 0.85;

    if (enableOutOfBoundsZones && isOutZone) {
      // Out-of-bounds mapping
      let outZone: OutZoneType = "unknown";
      let areaCode = "OUT";

      if (sportType === "volleyball") {
        if (rx < 0.15) {
          outZone = ry < 0.5 ? "side_left_far" : "side_left_near";
        } else if (rx > 0.85) {
          outZone = ry < 0.5 ? "side_right_far" : "side_right_near";
        } else if (ry < 0.15) {
          outZone = rx < 0.5 ? "back_left" : "back_right";
        } else if (ry > 0.85) {
          outZone = rx < 0.5 ? "back_left" : "back_right";
        }
        // Net error check (Volleyball net is around rx = 0.5)
        if (rx > 0.43 && rx < 0.57 && ry > 0.10 && ry < 0.90) {
          outZone = "net_error";
          areaCode = "NET_ERR";
        }
      } else if (sportType === "football") {
        if (rx < 0.15) {
          outZone = ry < 0.33 ? "left_touchline_att" : ry < 0.66 ? "left_touchline_mid" : "left_touchline_def";
        } else if (rx > 0.85) {
          outZone = ry < 0.33 ? "right_touchline_att" : ry < 0.66 ? "right_touchline_mid" : "right_touchline_def";
        } else if (ry < 0.15) {
          outZone = rx < 0.2 ? "corner_left" : rx > 0.8 ? "corner_right" : "opp_endline";
        } else if (ry > 0.85) {
          outZone = rx > 0.35 && rx < 0.65 ? "goal_kick" : "own_endline";
        }
      } else if (sportType === "badminton") {
        if (rx < 0.15) {
          outZone = "side_left";
        } else if (rx > 0.85) {
          outZone = "side_right";
        } else if (ry < 0.15) {
          outZone = rx < 0.5 ? "back_left" : "back_right";
        } else if (ry > 0.85) {
          outZone = rx < 0.5 ? "back_left" : "back_right";
        }
      } else if (sportType === "basketball") {
        if (rx < 0.15) {
          outZone = "left_sideline";
        } else if (rx > 0.85) {
          outZone = "right_sideline";
        } else if (ry < 0.15) {
          outZone = rx < 0.5 ? "baseline_left" : "baseline_right";
        } else if (ry > 0.85) {
          outZone = "endline";
        }
      }

      payload = {
        areaCode,
        courtSide: "neutral",
        outZone,
        areaResolution: "out-zone",
        areaMode: "normal",
        areaLabel: OUT_ZONE_LABELS[outZone]?.label || outZone,
      };
    } else {
      // Inner Court mapping - normalize coordinates to inside-court frame
      // Left/Right margin = 0.15, Top/Bottom margin = 0.15
      const cx = Math.max(0, Math.min(1, (rx - 0.15) / 0.70));
      const cy = Math.max(0, Math.min(1, (ry - 0.15) / 0.70));
      
      const isDetailed = settings?.areaPrecisionMode === 'detailed' || settings?.areaPrecisionMode === 'point'; // Point mode not fully supported yet, fallback to detailed

      if (sportType === "volleyball") {
        const teamA = "teamA";
        const teamB = "teamB";
        const leftCourtSide = flipCourtSide ? teamB : teamA;
        const rightCourtSide = flipCourtSide ? teamA : teamB;

        // Divided in Left court, NET, Right court
        if (cx < 0.46) {
          // Left side
          const colX = cx / 0.46;
          const rowCode = cy < 0.33 ? "L" : cy < 0.66 ? "C" : "R";
          let areaCode = "";
          if (isDetailed) {
             const colIdx = colX < 0.33 ? "1" : colX < 0.66 ? "2" : "1";
             const baseCol = colX < 0.66 ? "B" : "N";
             areaCode = rowCode + baseCol + "-" + colIdx;
          } else {
             const colCode = colX < 0.5 ? "B" : "N";
             areaCode = rowCode + colCode;
          }
          payload = { areaCode, courtSide: leftCourtSide, areaResolution: isDetailed ? "detailed" : "normal", areaMode: isDetailed ? "detailed" : "normal" };
        } else if (cx > 0.54) {
          // Right side
          const colX = (cx - 0.54) / 0.46;
          const rowCode = cy < 0.33 ? "R" : cy < 0.66 ? "C" : "L"; // Mirrored
          let areaCode = "";
          if (isDetailed) {
             const colIdx = colX < 0.33 ? "2" : colX < 0.66 ? "3" : "4";
             const baseCol = colX < 0.33 ? "N" : "B";
             areaCode = rowCode + baseCol + "-" + colIdx;
          } else {
             const colCode = colX < 0.5 ? "N" : "B";
             areaCode = rowCode + colCode;
          }
          payload = { areaCode, courtSide: rightCourtSide, areaResolution: isDetailed ? "detailed" : "normal", areaMode: isDetailed ? "detailed" : "normal" };
        } else {
          // NET
          payload = { areaCode: "NET", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        }
      } else if (sportType === "football") {
        if (isDetailed) {
           const r = Math.min(3, Math.floor(cy * 4));
           const c = Math.min(3, Math.floor(cx * 4));
           payload = { areaCode: `F-${r}-${c}`, courtSide: "neutral", areaResolution: "detailed", areaMode: "detailed" };
        } else {
          if (cy < 0.22) {
            const areaCode = cx > 0.33 && cx < 0.67 ? "GOAL" : "BOX";
            payload = { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
          } else {
            const gridY = (cy - 0.22) / 0.78;
            const rowLabel = gridY < 0.33 ? "ATT" : gridY < 0.66 ? "MID" : "DEF";
            const colLabel = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
            payload = { areaCode: `${rowLabel}_${colLabel}`, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
          }
        }
      } else if (sportType === "badminton") {
        if (cy < 0.46) {
          const gridY = cy / 0.46;
          const rowCode = gridY < 0.33 ? "B" : gridY < 0.66 ? "M" : "F";
          const colCode = cx < 0.33 ? "R" : cx < 0.66 ? "C" : "L";
          payload = { areaCode: rowCode + colCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        } else if (cy > 0.54) {
          const gridY = (cy - 0.54) / 0.46;
          const rowCode = gridY < 0.33 ? "F" : gridY < 0.66 ? "M" : "B";
          const colCode = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
          payload = { areaCode: rowCode + colCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        } else {
          payload = { areaCode: "NET_ERR", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        }
      } else if (sportType === "basketball") {
        if (cy < 0.25) {
          const areaCode = cx > 0.33 && cx < 0.67 ? "PAINT" : cx < 0.33 ? "LEFT_WING" : "RIGHT_WING";
          payload = { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        } else if (cy >= 0.75) {
          payload = { areaCode: "THREE_PT", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        } else {
          const gridY = (cy - 0.25) / 0.50;
          const isTopRow = gridY < 0.5;
          let areaCode = "MID_RANGE";
          if (isTopRow) {
            areaCode = cx < 0.33 ? "LEFT_WING" : cx < 0.66 ? "TOP_KEY" : "RIGHT_WING";
          } else {
            areaCode = cx < 0.33 ? "LEFT_CORNER" : cx < 0.66 ? "MID_RANGE" : "RIGHT_CORNER";
          }
          payload = { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
        }
      }
    }
    
    if (payload && payload.areaCode) {
      const areaObj = areas.find((a) => a.code === payload!.areaCode);
      const isThai = settings?.uiLanguage === "th";
      const mainLabel = payload.outZone 
        ? (isThai ? OUT_ZONE_LABELS[payload.outZone]?.thaiLabel : OUT_ZONE_LABELS[payload.outZone]?.label)
        : (areaObj ? (isThai ? areaObj.thaiName : areaObj.code) : payload.areaCode);
      
      payload.areaLabel = mainLabel || payload.areaCode;
    }

    // Geometry hit-testing is bypassed in favor of DOM tracking from the parent.
    setHoveredPayload(payload);
    onHoverArea(payload);
  }, [pointerX, pointerY, containerRect, active, sportType, flipCourtSide, enableOutOfBoundsZones]);

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
                {renderZoneBlock("GOAL", isThai ? "หน้าประตู" : "Goal Area", "neutral", "flex-1")}
                {renderZoneBlock("BOX", isThai ? "กรอบเขตโทษ" : "Penalty Box", "neutral", "flex-1")}
              </div>
              <div className="flex-1 grid grid-cols-3 grid-rows-3 gap-1.5">
                {renderZoneBlock("ATT_L", isThai ? "ซ้ายหน้า" : "Attack Left")}
                {renderZoneBlock("ATT_C", isThai ? "หน้ากลาง" : "Attack Center")}
                {renderZoneBlock("ATT_R", isThai ? "ขวาหน้า" : "Attack Right")}
                {renderZoneBlock("MID_L", isThai ? "ซ้ายกลาง" : "Mid Left")}
                {renderZoneBlock("MID_C", isThai ? "แดนกลาง" : "Mid Center")}
                {renderZoneBlock("MID_R", isThai ? "ขวากลาง" : "Mid Right")}
                {renderZoneBlock("DEF_L", isThai ? "ซ้ายหลัง" : "Defense Left")}
                {renderZoneBlock("DEF_C", isThai ? "หลังกลาง" : "Defense Center")}
                {renderZoneBlock("DEF_R", isThai ? "ขวาหลัง" : "Defense Right")}
              </div>
            </div>
          )}

          {sportType === "badminton" && (
            <div className="w-full h-full flex flex-col gap-1 relative">
              {/* Opponent Side */}
              <div className="flex-1 grid grid-cols-3 gap-1 opacity-90">
                {renderZoneBlock("BR", isThai ? "หลังขวา" : "Opp BR")}
                {renderZoneBlock("BC", isThai ? "หลังกลาง" : "Opp BC")}
                {renderZoneBlock("BL", isThai ? "หลังซ้าย" : "Opp BL")}
                {renderZoneBlock("MR", isThai ? "กลางขวา" : "Opp MR")}
                {renderZoneBlock("MC", isThai ? "กลาง" : "Opp MC")}
                {renderZoneBlock("ML", isThai ? "กลางซ้าย" : "Opp ML")}
                {renderZoneBlock("FR", isThai ? "หน้าขวา" : "Opp FR")}
                {renderZoneBlock("FC", isThai ? "หน้ากลาง" : "Opp FC")}
                {renderZoneBlock("FL", isThai ? "หน้าซ้าย" : "Opp FL")}
              </div>

              {/* Net divider line */}
              <div 
                data-scout-hover-area="NET_ERR"
                className={`h-4 flex items-center justify-center rounded-lg border transition-all ${isCodeSelected("NET_ERR") ? "bg-amber-500 border-amber-400 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]" : isCodeHovered("NET_ERR") ? "bg-amber-500/20 border-amber-500 text-amber-300" : "bg-sky-950/30 border-sky-500/20 text-sky-300/40"} text-xs font-black uppercase tracking-widest`}>
                NET
              </div>

              {/* Our Side */}
              <div className="flex-1 grid grid-cols-3 gap-1">
                {renderZoneBlock("FL", isThai ? "หน้าซ้าย" : "Our FL")}
                {renderZoneBlock("FC", isThai ? "หน้ากลาง" : "Our FC")}
                {renderZoneBlock("FR", isThai ? "หน้าขวา" : "Our FR")}
                {renderZoneBlock("ML", isThai ? "กลางซ้าย" : "Our ML")}
                {renderZoneBlock("MC", isThai ? "กลาง" : "Our MC")}
                {renderZoneBlock("MR", isThai ? "กลางขวา" : "Our MR")}
                {renderZoneBlock("BL", isThai ? "หลังซ้าย" : "Our BL")}
                {renderZoneBlock("BC", isThai ? "หลังกลาง" : "Our BC")}
                {renderZoneBlock("BR", isThai ? "หลังขวา" : "Our BR")}
              </div>
            </div>
          )}

          {sportType === "basketball" && (
            <div className="w-full h-full flex flex-col gap-1.5">
              <div className="flex gap-1.5 h-[24%]">
                {renderZoneBlock("PAINT", isThai ? "กรอบเขตโทษ" : "The Paint", "neutral", "flex-1")}
              </div>
              <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-1.5">
                {renderZoneBlock("LEFT_WING", isThai ? "ปีกซ้าย" : "Left Wing")}
                {renderZoneBlock("TOP_KEY", isThai ? "หัวกะโหลก" : "Top of Key")}
                {renderZoneBlock("RIGHT_WING", isThai ? "ปีกขวา" : "Right Wing")}
                {renderZoneBlock("LEFT_CORNER", isThai ? "มุมซ้าย" : "Left Corner")}
                {renderZoneBlock("MID_RANGE", isThai ? "ระยะกลาง" : "Mid Range")}
                {renderZoneBlock("RIGHT_CORNER", isThai ? "มุมขวา" : "Right Corner")}
              </div>
              <div className="h-[18%] flex">
                {renderZoneBlock("THREE_PT", isThai ? "นอกเส้น 3 คะแนน" : "3-Point Line", "neutral", "w-full")}
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
