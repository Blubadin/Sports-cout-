import React from "react";
import { Action, Area, SportType, Team, AreaSelectionPayload } from "../../types";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";
import { SPORT_TEMPLATES, OUT_ZONE_LABELS, DETAILED_ZONE_LABELS } from "../../sports";
import { useScoutContext } from "../../context/ScoutContext";
import { getAreaDisplay } from "../../utils/areaHelper";

type HUDMiniCourtSelectorProps = {
  sportType: SportType;
  areas: Area[];
  currentAction: Action;
  teams: Team[];
  onSelectArea: (payload: AreaSelectionPayload) => void;
  active: boolean;
  compact: boolean;
  flipCourtSide: boolean;
  hoveredArea?: {
    code: string;
    courtSide?: "teamA" | "teamB" | "neutral";
  } | null;
  enableOutOfBoundsZones?: boolean;
  interactive?: boolean;
  isProPad?: boolean;
};

export default function HUDMiniCourtSelector({
  sportType,
  areas,
  currentAction,
  teams,
  onSelectArea,
  active,
  compact,
  flipCourtSide,
  hoveredArea,
  enableOutOfBoundsZones = false,
  interactive = false,
  isProPad = false,
}: HUDMiniCourtSelectorProps) {
  const { settings } = useScoutContext();
  const selectedAreaCode = currentAction.areaCode;
  const layout = useHUDDeviceLayout();
  const isMobile = layout.device === "phone";
  const touchTarget = layout.touchTarget;

  const AreaBtn = ({
    code,
    courtSide,
    className = "",
    label,
    flipContent = false,
    isOut = false,
    style,
    outZone,
    areaLabel
  }: {
    code: string;
    courtSide?: "teamA" | "teamB" | "neutral";
    className?: string;
    label?: string;
    flipContent?: boolean;
    isOut?: boolean;
    style?: React.CSSProperties;
    outZone?: import('../../types').OutZoneType;
    areaLabel?: string;
  }) => {
    let matchCode = code;
    if (selectedAreaCode && DETAILED_ZONE_LABELS[selectedAreaCode] && DETAILED_ZONE_LABELS[selectedAreaCode].baseAreaCode === code) {
      matchCode = selectedAreaCode; // Allow base area to match if a detailed area inside it is selected
    }

    const isSelected =
      (selectedAreaCode === code || selectedAreaCode === matchCode) &&
      (currentAction.courtSide === courtSide ||
        (!courtSide && !currentAction.courtSide)) &&
      (!isOut || currentAction.outZone === outZone);

    const isHovered =
      hoveredArea?.code === code &&
      (hoveredArea?.courtSide === courtSide ||
        (!courtSide && !hoveredArea?.courtSide));

    const area = areas.find((a) => a.code === code);
    const isThai = settings?.uiLanguage === 'th';
    const displayInfo = getAreaDisplay(code, isThai, label || area?.thaiName || code);

    // In compact mode, we might want to hide text entirely or just show smaller
    if (compact && !interactive) {
      return (
        <button
          style={style}
          className={`flex-1 ${!isOut ? 'min-w-[12px]' : 'min-w-0 min-h-0'} transition-all duration-75 border border-white/5 pointer-events-none ${
            isSelected
              ? (isOut ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] z-10" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] z-10")
              : (isOut ? "bg-red-500/20" : "bg-white/10")
          } ${className}`}
        />
      );
    }

    return (
      <button
        onPointerDown={(e) => {
          if (interactive) {
            e.stopPropagation();
            e.preventDefault();
            onSelectArea({
              areaCode: code,
              courtSide,
              areaLabel: displayInfo.main,
              outZone,
              areaResolution: isOut ? 'out-zone' : 'normal',
              areaMode: 'normal'
            });
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onPointerEnter={() => {
          if (active) {
            (window as any).__hoveredArea = code;
          }
        }}
        onPointerLeave={() => {
          if (active && (window as any).__hoveredArea === code) {
            (window as any).__hoveredArea = null;
          }
        }}
        data-scout-hover-area={code}
        data-scout-hover-court-side={courtSide || ""}
        style={{
          ...(isMobile && !isOut && !compact
            ? { minWidth: touchTarget, minHeight: Math.max(touchTarget, 48) }
            : {}),
          ...style
        }}
        className={`flex flex-col items-center justify-center p-0.5 rounded transition-all duration-75 border border-white/10 ${compact ? 'flex-1 min-w-[12px] min-h-[12px]' : (!isOut ? 'min-h-[48px]' : '')} ${
          isSelected
            ? (isOut ? "bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.8)] z-10 scale-105 active:scale-95 active:bg-red-600" : "bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.8)] z-10 scale-105 active:scale-95 active:bg-amber-600")
            : isHovered
              ? (isOut ? "bg-red-600/60 border-red-400 text-white shadow-[0_0_10px_rgba(239,68,68,0.4)] z-10 scale-105" : "bg-amber-600/60 border-amber-400 text-white shadow-[0_0_10px_rgba(245,158,11,0.4)] z-10 scale-105")
              : (isOut ? "bg-red-500/20 text-red-200 hover:bg-red-500/40 hover:text-white active:scale-95 active:bg-red-500/50" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white active:scale-95 active:bg-white/30")
        } ${className}`}
      >
        {!compact && (
          <div className={`flex flex-col items-center justify-center w-full h-full text-center ${flipContent && flipCourtSide ? "rotate-180" : ""}`}>
            <span className="font-black text-[15px] sm:text-[17px] leading-tight tracking-tight text-white">{displayInfo.main}</span>
            {displayInfo.sub && (
              <span className={`text-[11.5px] sm:text-[13px] mt-0.5 font-black leading-none ${isSelected ? "text-amber-100" : "text-white/80"}`}>
                {displayInfo.sub}
              </span>
            )}
          </div>
        )}
      </button>
    );
  };

  const errorAreas = areas.filter((a) =>
    ["OUT", "LONG_OUT", "SIDE_OUT", "NET_ERR", "UNKNOWN"].includes(a.code),
  );

  const renderOutZones = () => {
    if (!enableOutOfBoundsZones || compact) return null;
    const template = SPORT_TEMPLATES[sportType as keyof typeof SPORT_TEMPLATES];
    if (!template) return null;
    const outZones = template.areaLayouts?.outOfBounds?.outZones || [];
    if (outZones.length === 0) return null;

    return (
      <div className="w-full overflow-x-auto no-scrollbar py-1">
        <div className="flex gap-1 justify-center min-w-max px-2">
          {outZones.map(zone => {
             const labelInfo = OUT_ZONE_LABELS[zone] || { label: zone, thaiLabel: zone, code: 'OUT' };
             const isSelected = selectedAreaCode === labelInfo.code && currentAction.outZone === zone;
             return (
               <button
                  key={zone}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectArea({
                      areaCode: labelInfo.code,
                      courtSide: 'neutral',
                      outZone: zone,
                      areaResolution: 'out-zone',
                      areaMode: 'normal'
                    });
                  }}
                  className={`px-2 py-1 rounded text-[8px] sm:text-[10px] font-bold whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                      : 'bg-white/10 text-red-200 border border-red-500/20 hover:bg-white/20 hover:border-red-500/50'
                  }`}
               >
                 {settings.uiLanguage === 'th' ? labelInfo.thaiLabel : labelInfo.label}
               </button>
             );
          })}
        </div>
      </div>
    );
  };

  if (sportType === "volleyball") {
    const teamA = teams[0]?.code || "Team A";
    const teamB = teams[1]?.code || "Team B";

    const leftTeam = flipCourtSide ? teamB : teamA;
    const rightTeam = flipCourtSide ? teamA : teamB;
    const leftCourtSide = flipCourtSide ? "teamB" : "teamA";
    const rightCourtSide = flipCourtSide ? "teamA" : "teamB";

    const filteredErrorAreas = errorAreas.filter(
      (a) =>
        !(
          enableOutOfBoundsZones &&
          ["OUT", "LONG_OUT", "SIDE_OUT"].includes(a.code)
        ),
    );

    return (
      <div
        className={`flex flex-col gap-2 ${compact ? "w-[120px]" : (isProPad ? "w-[460px] sm:w-[540px]" : "w-[280px] sm:w-[320px]")} max-w-full transition-all`}
      >
        {!compact && (
          <div className="flex justify-between text-[10px] text-white/50 font-bold px-2">
            <span>{leftTeam}</span>
            <span>{rightTeam}</span>
          </div>
        )}

        <div className={`flex flex-col items-center w-full gap-0.5 ${compact ? "h-[60px]" : (isProPad ? "h-[220px] sm:h-[260px]" : "h-[140px] sm:h-[160px]")}`}>
          <div className="flex flex-row w-full items-stretch gap-0.5 min-h-0 flex-1">
            <div
              className={`flex-1 relative flex flex-row items-stretch bg-black/40 rounded-xl border border-white/20 overflow-hidden p-1 gap-0.5`}
            >
              {/* Left Court */}
              <div className="flex-1 grid grid-cols-2 grid-rows-3 gap-0.5">
                <AreaBtn code="LB" courtSide={leftCourtSide} />
                <AreaBtn code="LN" courtSide={leftCourtSide} />
                <AreaBtn code="CB" courtSide={leftCourtSide} />
                <AreaBtn code="CN" courtSide={leftCourtSide} />
                <AreaBtn code="RB" courtSide={leftCourtSide} />
                <AreaBtn code="RN" courtSide={leftCourtSide} />
              </div>

              {/* NET */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectArea({
                    areaCode: "NET",
                    courtSide: "neutral",
                    areaMode: "normal"
                  });
                }}
                data-scout-hover-area="NET"
                data-scout-hover-court-side="neutral"
                className={`w-4 sm:w-6 flex flex-col items-center justify-center rounded-sm transition-colors z-20 min-h-[48px] ${
                  selectedAreaCode === "NET"
                    ? "bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.8)]"
                    : "bg-white/20 text-white/50 hover:bg-white/40"
                }`}
              >
                {!compact && (
                  <span
                    className="text-[10px] font-bold rotate-180"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    NET
                  </span>
                )}
              </button>

              {/* Right Court */}
              <div className="flex-1 grid grid-cols-2 grid-rows-3 gap-0.5">
                <AreaBtn code="RN" courtSide={rightCourtSide} />
                <AreaBtn code="RB" courtSide={rightCourtSide} />
                <AreaBtn code="CN" courtSide={rightCourtSide} />
                <AreaBtn code="CB" courtSide={rightCourtSide} />
                <AreaBtn code="LN" courtSide={rightCourtSide} />
                <AreaBtn code="LB" courtSide={rightCourtSide} />
              </div>
            </div>
          </div>
          {renderOutZones()}
        </div>

        {!compact && filteredErrorAreas.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1">
            {filteredErrorAreas.map((area) => (
              <button
                key={area.code}
                onClick={() => onSelectArea({ areaCode: area.code, areaMode: 'normal' })}
                data-scout-hover-area={area.code}
                data-scout-hover-court-side=""
                className={`px-3 py-2 rounded text-[10px] font-bold transition-all min-h-[44px] min-w-[44px] ${
                  selectedAreaCode === area.code
                    ? "bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] scale-105"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {area.code}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Football
  if (sportType === "football") {
    const filteredErrorAreas = errorAreas.filter(
      (a) => !(enableOutOfBoundsZones && a.code === "OUT"),
    );

    // HUD shows Attack Direction = opponent's half
    // Match CourtAreaSelector: top half = teamB (normal), teamA (flipped)
    const attackCourtSide = flipCourtSide ? "teamA" : "teamB";

    return (
      <div
        className={`flex flex-col gap-2 ${compact ? "w-[80px]" : (isProPad ? "w-[320px] sm:w-[440px]" : "w-[200px] sm:w-[240px]")} max-w-full transition-all items-center`}
      >
        <div className={`flex flex-col items-center w-full gap-0.5 ${compact ? "h-[120px]" : (isProPad ? "h-[360px] sm:h-[440px]" : "h-[280px] sm:h-[320px] max-h-full")}`}>
          <div className="flex flex-row items-stretch w-full gap-0.5 min-h-0 flex-1">
            <div
              className={`flex-1 relative flex flex-col bg-green-900/40 rounded-xl border border-white/20 overflow-hidden p-1 gap-0.5 ${flipCourtSide ? "rotate-180" : ""}`}
            >
              {!compact && (
                <div className="text-[8px] text-center text-green-400 font-bold tracking-widest uppercase mb-0.5">
                  ▲ ATTACK DIRECTION
                </div>
              )}
              <div className="flex justify-center gap-1 mb-1">
                <AreaBtn
                  code="GOAL"
                  courtSide={attackCourtSide}
                  className="flex-1 h-6 bg-green-800/50"
                  flipContent
                />
                <AreaBtn
                  code="BOX"
                  courtSide={attackCourtSide}
                  className="flex-1 h-6 bg-green-800/50"
                  flipContent
                />
              </div>
              <div className="flex-1 grid grid-cols-3 gap-0.5">
                <AreaBtn code="ATT_L" courtSide={attackCourtSide} flipContent />
                <AreaBtn code="ATT_C" courtSide={attackCourtSide} flipContent />
                <AreaBtn code="ATT_R" courtSide={attackCourtSide} flipContent />
                <AreaBtn code="MID_L" courtSide={attackCourtSide} flipContent />
                <AreaBtn code="MID_C" courtSide={attackCourtSide} flipContent />
                <AreaBtn code="MID_R" courtSide={attackCourtSide} flipContent />
                <AreaBtn code="DEF_L" courtSide={attackCourtSide} flipContent />
                <AreaBtn code="DEF_C" courtSide={attackCourtSide} flipContent />
                <AreaBtn code="DEF_R" courtSide={attackCourtSide} flipContent />
              </div>
            </div>
          </div>
          {renderOutZones()}
        </div>
        {!compact && filteredErrorAreas.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1">
            {filteredErrorAreas.map((area) => (
              <button
                key={area.code}
                onClick={() => onSelectArea({ areaCode: area.code, areaMode: 'normal' })}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                  selectedAreaCode === area.code
                    ? "bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] scale-105"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {area.code}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Badminton
  if (sportType === "badminton") {
    const filteredErrorAreas = errorAreas.filter(
      (a) => !(enableOutOfBoundsZones && a.code === "OUT"),
    );

    const oppCourtSide = flipCourtSide ? "teamA" : "teamB";
    const ourCourtSide = flipCourtSide ? "teamB" : "teamA";

    return (
      <div
        className={`flex flex-col gap-2 ${compact ? "w-[120px]" : (isProPad ? "w-[360px] sm:w-[440px]" : "w-[240px] max-w-full")} transition-all items-center`}
      >
        <div className={`flex flex-col items-center w-full gap-0.5 ${compact ? "h-[160px]" : (isProPad ? "h-[380px] sm:h-[460px]" : "h-[340px]")}`}>
          <div className="flex flex-row items-stretch w-full gap-0.5 min-h-0 flex-1">
            <div
              className={`relative flex-1 flex flex-col bg-sky-950/40 rounded-xl border border-white/20 overflow-hidden p-1 gap-0.5 ${flipCourtSide ? "rotate-180" : ""}`}
            >
          {/* Opponent Side */}
          <div className="relative z-10 grid grid-cols-3 gap-0.5 opacity-80 mb-0.5">
            <AreaBtn
              code="BR"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "BR" : "Opp BR"}
              flipContent
            />
            <AreaBtn
              code="BC"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "BC" : "Opp BC"}
              flipContent
            />
            <AreaBtn
              code="BL"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "BL" : "Opp BL"}
              flipContent
            />
            
            <AreaBtn
              code="MR"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "MR" : "Opp MR"}
              flipContent
            />
            <AreaBtn
              code="MC"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "MC" : "Opp MC"}
              flipContent
            />
            <AreaBtn
              code="ML"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "ML" : "Opp ML"}
              flipContent
            />

            <AreaBtn
              code="FR"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "FR" : "Opp FR"}
              flipContent
            />
            <AreaBtn
              code="FC"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "FC" : "Opp FC"}
              flipContent
            />
            <AreaBtn
              code="FL"
              courtSide={oppCourtSide}
              className="aspect-square"
              label={compact ? "FL" : "Opp FL"}
              flipContent
            />
          </div>

          {/* NET */}
          <div className="w-full h-3 mb-0.5 rounded-sm flex items-center justify-center font-bold text-[8px] bg-sky-800/60 text-sky-200 border-b border-white/10 z-10">
            <div className={`${flipCourtSide ? "rotate-180" : ""}`}>NET</div>
          </div>

          {/* Our Side */}
          <div className="relative z-10 grid grid-cols-3 gap-0.5 mt-0.5">
            <AreaBtn
              code="FL"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "FL" : "Our FL"}
              flipContent
            />
            <AreaBtn
              code="FC"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "FC" : "Our FC"}
              flipContent
            />
            <AreaBtn
              code="FR"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "FR" : "Our FR"}
              flipContent
            />
            
            <AreaBtn
              code="ML"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "ML" : "Our ML"}
              flipContent
            />
            <AreaBtn
              code="MC"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "MC" : "Our MC"}
              flipContent
            />
            <AreaBtn
              code="MR"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "MR" : "Our MR"}
              flipContent
            />

            <AreaBtn
              code="BL"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "BL" : "Our BL"}
              flipContent
            />
            <AreaBtn
              code="BC"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "BC" : "Our BC"}
              flipContent
            />
            <AreaBtn
              code="BR"
              courtSide={ourCourtSide}
              className="aspect-square"
              label={compact ? "BR" : "Our BR"}
              flipContent
            />
          </div>
        </div>

          </div>
          {renderOutZones()}
        </div>

        {!compact && filteredErrorAreas.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1">
            {filteredErrorAreas.map((area) => (
              <button
                key={area.code}
                onClick={() => onSelectArea({ areaCode: area.code, areaMode: 'normal' })}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                  selectedAreaCode === area.code
                    ? "bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] scale-105"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {area.code}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Basketball
  if (sportType === "basketball") {
    const filteredErrorAreas = errorAreas.filter(
      (a) => !(enableOutOfBoundsZones && a.code === "OUT"),
    );

    // HUD shows Basket Direction = opponent's basket half
    // Match CourtAreaSelector: top half = teamB (normal), teamA (flipped)
    const attackCourtSide = flipCourtSide ? "teamA" : "teamB";

    return (
      <div
        className={`flex flex-col gap-2 ${compact ? "w-[120px]" : (isProPad ? "w-[360px] sm:w-[440px]" : "w-[240px] max-w-full")} transition-all items-center`}
      >
        <div className={`flex flex-col items-center w-full gap-0.5 ${compact ? "h-[160px]" : (isProPad ? "h-[380px] sm:h-[460px]" : "h-[320px]")}`}>
          <div className="flex flex-row items-stretch w-full gap-0.5 min-h-0 flex-1">
            <div
              className={`relative flex-1 flex flex-col bg-amber-950/40 rounded-xl border border-white/20 overflow-hidden p-2 gap-1 items-center ${flipCourtSide ? "rotate-180" : ""}`}
            >
              {!compact && (
                <div className="text-[8px] text-center text-amber-400 font-bold tracking-widest uppercase mb-0.5">
                  ▲ BASKET DIRECTION
                </div>
              )}
              {/* Hoop / Paint */}
              <div className="w-full flex justify-center mb-1">
                <div className="w-1/3 flex flex-col gap-0.5">
                  <div className="w-6 h-1 bg-amber-600 mx-auto rounded-full mb-0.5"></div>
                  <AreaBtn
                    code="PAINT"
                    courtSide={attackCourtSide}
                    className="h-10 sm:h-12 bg-amber-800/50"
                    flipContent
                  />
                </div>
              </div>
    
              <div className="w-full relative z-10 grid grid-cols-3 gap-0.5">
                <AreaBtn code="LEFT_WING" courtSide={attackCourtSide} className="aspect-video" flipContent />
                <AreaBtn code="TOP_KEY" courtSide={attackCourtSide} className="aspect-video" flipContent />
                <AreaBtn code="RIGHT_WING" courtSide={attackCourtSide} className="aspect-video" flipContent />
    
                <AreaBtn code="LEFT_CORNER" courtSide={attackCourtSide} className="aspect-video" flipContent />
                <AreaBtn code="MID_RANGE" courtSide={attackCourtSide} className="aspect-video" flipContent />
                <AreaBtn code="RIGHT_CORNER" courtSide={attackCourtSide} className="aspect-video" flipContent />
              </div>
    
              <div className="w-full mt-1">
                <AreaBtn
                  code="THREE_PT"
                  courtSide={attackCourtSide}
                  className="w-full py-1 min-h-[28px]"
                  flipContent
                />
              </div>
            </div>

          </div>
          {renderOutZones()}
        </div>
        {!compact && filteredErrorAreas.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1">
            {filteredErrorAreas.map((area) => (
              <button
                key={area.code}
                onClick={() => onSelectArea({ areaCode: area.code, areaMode: 'normal' })}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                  selectedAreaCode === area.code
                    ? "bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] scale-105"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {area.code}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Generic Grid fallback
  return (
    <div
      className={`flex flex-col gap-2 ${compact ? "w-[120px]" : "w-[240px] max-w-full"} transition-all`}
    >
      <div className="grid grid-cols-3 gap-1">
        {areas.map((area) => (
          <AreaBtn key={area.code} code={area.code} />
        ))}
      </div>
    </div>
  );
}
