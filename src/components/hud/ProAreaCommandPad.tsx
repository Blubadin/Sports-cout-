import React, { useRef, useEffect, useMemo, useState } from "react";
import { Action, Area, SportType, Team, AreaSelectionPayload, OutZoneType } from "../../types";
import { useScoutContext } from "../../context/ScoutContext";
import { getAreaDisplay } from "../../utils/areaHelper";
import { buildAreaPreviewGrid, mapAreaViewPointToFullCourt, resolveAreaSelectionFromPoint } from "../../utils/areaGeometry";
import { OUT_ZONE_LABELS } from "../../sports";
import SportCourtSurface from "../area/SportCourtSurface";
import { resolveCourtTeamPresentation } from "../../utils/courtPresentation";
import {
  getProAreaLayoutMetrics,
  getProAreaOutLaneSize,
  getProAreaOutZoneLayout,
  type ProAreaOutZoneItem,
} from "../../utils/proAreaLayout";
import BadmintonTouchCourt, { resolveBadmintonPointSelection } from "../badminton/BadmintonTouchCourt";
import { useAITracking } from "../../hooks/useAITracking";

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
  const { players: aiPlayers, isConnected: isAIConnected } = useAITracking();
  const containerRef = useRef<HTMLDivElement>(null);
  const badmintonCourtRef = useRef<HTMLDivElement>(null);
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

    const activeRect = containerRef.current?.getBoundingClientRect() ?? containerRect;
    const centerX = activeRect.left + activeRect.width / 2;
    const centerY = activeRect.top + activeRect.height / 2;
    const dx = pointerX - centerX;
    const dy = pointerY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const deadZone = Math.max(28, Math.min(activeRect.width, activeRect.height) * 0.07);

    // High precision badminton direct aim mapping (from mouse drag or joystick stick)
    if (sportType === "badminton") {
      const courtRect = badmintonCourtRef.current?.getBoundingClientRect() ?? activeRect;
      const courtCenterX = courtRect.left + courtRect.width / 2;
      const courtCenterY = courtRect.top + courtRect.height / 2;
      const distFromCenter = Math.sqrt((pointerX - courtCenterX) ** 2 + (pointerY - courtCenterY) ** 2);
      const badmintonDeadZone = Math.max(12, Math.min(courtRect.width, courtRect.height) * 0.035);

      if (!pointerX || !pointerY || distFromCenter < badmintonDeadZone) {
        return;
      }

      const rx = Math.max(0, Math.min(1, (pointerX - courtRect.left) / courtRect.width));
      const ry = Math.max(0, Math.min(1, (pointerY - courtRect.top) / courtRect.height));

      const payload = resolveBadmintonPointSelection({
        normX: rx,
        normY: ry,
        flipCourtSide,
        isDoubles: true,
        uiLanguage: settings?.uiLanguage,
      });

      setLocalRx(rx);
      setLocalRy(ry);
      setHoveredPayload(payload);
      onHoverArea(payload);
      return;
    }

    if (!pointerX || !pointerY || distance < deadZone) {
      setLocalRx(0.5);
      setLocalRy(0.5);
      setHoveredPayload(null);
      onHoverArea(null);
      return;
    }

    const rangeX = Math.max(120, activeRect.width * 0.5);
    const rangeY = Math.max(120, activeRect.height * 0.5);
    const nextPoint = {
      rx: Math.max(0, Math.min(1, 0.5 + dx / rangeX / 2)),
      ry: Math.max(0, Math.min(1, 0.5 + dy / rangeY / 2)),
    };

    const canonicalPoint = mapAreaViewPointToFullCourt(
      sportType,
      nextPoint,
      settings?.areaCourtViewMode || "auto",
    );
    const resolvedPayload = resolveAreaSelectionFromPoint({
      sportType,
      areas,
      point: canonicalPoint,
      flipCourtSide,
      enableOutOfBoundsZones,
      areaPrecisionMode: settings?.areaPrecisionMode,
      uiLanguage: settings?.uiLanguage,
      source: "absolute-pointer",
    });
    const payload = resolvedPayload
      ? { ...resolvedPayload, courtViewMode: settings?.areaCourtViewMode || "auto" }
      : null;

    setLocalRx(nextPoint.rx);
    setLocalRy(nextPoint.ry);
    setHoveredPayload(payload);
    onHoverArea(payload);
  }, [pointerX, pointerY, active, containerRect, sportType, areas, flipCourtSide, enableOutOfBoundsZones, settings?.areaPrecisionMode, settings?.areaCourtViewMode, settings?.uiLanguage, onHoverArea]);

  useEffect(() => {
    if (active) return;
    setLocalRx(0.5);
    setLocalRy(0.5);
    setHoveredPayload(null);
  }, [active]);

  if (!active) return null;

  if (sportType === "badminton") {
    const team1 = teams?.[0]?.name || teams?.[0]?.code || "Team A";
    const team2 = teams?.[1]?.name || teams?.[1]?.code || "Team B";
    const activePayload = hoveredArea !== undefined ? hoveredArea : hoveredPayload;
    const activePointX = activePayload?.pointX ?? currentAction.pointX;
    const activePointY = activePayload?.pointY ?? currentAction.pointY;

    return (
      <div
        ref={containerRef}
        data-controller-wheel="area"
        className="relative w-full max-w-lg aspect-square sm:aspect-[4/3] flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-900/60 border border-white/10 select-none overflow-hidden"
      >
        <div ref={badmintonCourtRef} className="w-full flex justify-center items-center">
          <BadmintonTouchCourt
            pointX={activePointX}
            pointY={activePointY}
            hoverPoint={
              activePayload?.pointX !== undefined && activePayload?.pointY !== undefined
                ? { x: activePayload.pointX, y: activePayload.pointY }
                : null
            }
            areaCode={activePayload?.areaCode ?? currentAction.areaCode}
            courtSide={activePayload?.courtSide ?? currentAction.courtSide}
            outZone={activePayload?.outZone ?? currentAction.outZone}
            onSelectArea={(payload) => {
              onSelectArea(payload);
            }}
            onHoverPoint={(payload) => {
              if (payload) {
                setHoveredPayload(payload);
                onHoverArea(payload);
              }
            }}
            isDoubles={true}
            flipCourtSide={flipCourtSide}
            uiLanguage={settings?.uiLanguage}
            showControls={true}
            teamAName={team1}
            teamBName={team2}
            aiPlayers={isAIConnected ? aiPlayers : undefined}
          />
        </div>
      </div>
    );
  }

  // Visual Helper: Get standard label for out zone
  const getOutZoneLabel = (zone: OutZoneType) => {
    const isThai = settings?.uiLanguage === "th";
    const labelObj = OUT_ZONE_LABELS[zone];
    return labelObj ? (isThai ? labelObj.thaiLabel : labelObj.label) : zone;
  };

  const isThai = settings?.uiLanguage === "th";
  const teamPresentation = resolveCourtTeamPresentation({
    teams,
    sportType,
    flipCourtSide,
    courtViewMode: settings?.areaCourtViewMode || "auto",
  });
  const layoutMetrics = getProAreaLayoutMetrics(sportType);
  const outLaneSize = getProAreaOutLaneSize(sportType);
  const outZoneLayout = getProAreaOutZoneLayout(sportType);

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

  const renderOutZoneStrip = (
    zones: ProAreaOutZoneItem[],
    edge: "top" | "bottom" | "left" | "right",
  ) => {
    const horizontal = edge === "top" || edge === "bottom";

    return zones.map((zone, index) => {
      const isLast = index === zones.length - 1;
      const selected = isCodeSelected("OUT", "neutral", zone.outZone);
      const hovered = isCodeHovered("OUT", "neutral", zone.outZone);
      const label = zone.shortLabel
        ? (isThai ? zone.shortLabel.th : zone.shortLabel.en)
        : getOutZoneLabel(zone.outZone);
      const divider = horizontal
        ? `${edge === "top" ? "border-b" : "border-t"}${isLast ? "" : " border-r"}`
        : `${edge === "left" ? "border-r" : "border-l"}${isLast ? "" : " border-b"}`;

      return (
        <div
          key={zone.id}
          data-pro-area-layout-id={zone.id}
          data-pro-area-edge={edge}
          data-scout-hover-area="OUT"
          data-scout-hover-court-side="neutral"
          data-scout-hover-out-zone={zone.outZone}
          style={{
            flex: zone.weight ?? 1,
            minWidth: horizontal ? layoutMetrics.minimumTapTargetPx : undefined,
            minHeight: horizontal ? undefined : layoutMetrics.minimumTapTargetPx,
          }}
          className={`min-w-0 flex items-center justify-center ${divider} border-dashed border-white/5 p-1 text-center text-[9px] font-bold uppercase transition-all ${
            hovered
              ? "bg-red-500/20 text-red-400"
              : selected
                ? "bg-red-500 text-white font-extrabold"
                : "text-white/20"
          }`}
        >
          {label}
        </div>
      );
    });
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

  const previewGrid = useMemo(
    () => buildAreaPreviewGrid(
      sportType,
      settings?.areaPrecisionMode || "normal",
      flipCourtSide,
      settings?.areaCourtViewMode || "auto",
      settings?.uiLanguage,
    ),
    [flipCourtSide, settings?.areaCourtViewMode, settings?.areaPrecisionMode, settings?.uiLanguage, sportType],
  );

  return (
    <div
      ref={containerRef}
      data-controller-wheel="area"
      data-out-lane-min-target={layoutMetrics.minimumTapTargetPx}
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
      <div className="absolute top-0 left-0 right-0 flex" style={{ height: outLaneSize }}>
        {enableOutOfBoundsZones ? renderOutZoneStrip(outZoneLayout.top, "top") : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-950/20 text-white/5 font-extrabold text-[10px] tracking-widest uppercase">
            {isThai ? "ขอบสนามนอก (OOB)" : "OUT OF BOUNDS"}
          </div>
        )}
      </div>

      {/* 2. INNER COURT ROW (Contains LEFT EDGE | COURT CONTAINER | RIGHT EDGE) */}
      <div
        className="absolute left-0 right-0 flex"
        style={{ top: outLaneSize, bottom: outLaneSize }}
      >
        {/* LEFT EDGE */}
        <div className="h-full flex flex-col overflow-hidden" style={{ width: outLaneSize }}>
          {enableOutOfBoundsZones ? (
            <>
              {renderOutZoneStrip(outZoneLayout.left, "left")}
</>
          ) : (
            <div className="w-full h-full border-r border-white/5"></div>
          )}
        </div>

        {/* CENTER ACTIVE COURT GRID */}
        <div className="flex-1 h-full relative bg-black/40 border border-white/10 rounded-xl overflow-hidden">
          <SportCourtSurface sport={sportType}>
            <div className="relative h-full p-2">
              {teamPresentation.orientation === "vertical" ? (
                <>
                  <div className="absolute left-1/2 top-1 z-30 -translate-x-1/2 border border-sky-400/40 bg-slate-950/80 px-2 py-0.5 font-mono text-xs font-black text-sky-200">
                    {teamPresentation.farTeam.code}
                  </div>
                  <div className="absolute bottom-1 left-1/2 z-30 -translate-x-1/2 border border-emerald-400/40 bg-slate-950/80 px-2 py-0.5 font-mono text-xs font-black text-emerald-200">
                    {teamPresentation.nearTeam.code}
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute left-1 top-1/2 z-30 -translate-y-1/2 border border-emerald-400/40 bg-slate-950/80 px-2 py-0.5 font-mono text-xs font-black text-emerald-200">
                    {teamPresentation.nearTeam.code}
                  </div>
                  <div className="absolute right-1 top-1/2 z-30 -translate-y-1/2 border border-sky-400/40 bg-slate-950/80 px-2 py-0.5 font-mono text-xs font-black text-sky-200">
                    {teamPresentation.farTeam.code}
                  </div>
                </>
              )}
          {sportType === "volleyball" && settings?.areaCourtViewMode !== "half" && (
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

          {(sportType !== "volleyball" || settings?.areaCourtViewMode === "half") && (
            <div
              className="grid h-full w-full gap-1"
              style={{
                gridTemplateColumns: `repeat(${previewGrid.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${previewGrid.rows}, minmax(0, 1fr))`,
              }}
            >
              {previewGrid.cells.map(({ row, col, payload }) => {
                if (!payload?.areaCode) return <div key={`${row}-${col}`} />;
                const display = getAreaDisplay(payload.areaCode, isThai, payload.areaLabel || payload.areaCode);
                return (
                  <React.Fragment key={`${row}-${col}-${payload.areaCode}-${payload.courtSide}`}>
                    {renderZoneBlock(
                      payload.areaCode,
                      display.sub || display.main,
                      payload.courtSide,
                      "min-h-0 p-1 rounded-md",
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
            </div>
          </SportCourtSurface>
        </div>

        {/* RIGHT EDGE */}
        <div className="h-full flex flex-col overflow-hidden" style={{ width: outLaneSize }}>
          {enableOutOfBoundsZones ? (
            <>
              {renderOutZoneStrip(outZoneLayout.right, "right")}
</>
          ) : (
            <div className="w-full h-full border-l border-white/5"></div>
          )}
        </div>
      </div>

      {/* 3. OUT OF BOUNDS - BOTTOM EDGE */}
      <div className="absolute bottom-0 left-0 right-0 flex" style={{ height: outLaneSize }}>
        {enableOutOfBoundsZones ? (
          <>
            {renderOutZoneStrip(outZoneLayout.bottom, "bottom")}
</>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-950/20 text-white/5 font-extrabold text-[10px] tracking-widest uppercase">
            {isThai ? "ขอบสนามนอก (OOB)" : "OUT OF BOUNDS"}
          </div>
        )}
      </div>
    </div>
  );
}

