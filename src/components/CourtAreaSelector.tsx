import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { Action } from '../types';
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import { SPORT_TEMPLATES, OUT_ZONE_LABELS, DETAILED_ZONE_LABELS, OUT_ZONE_VISUALS_BY_SPORT } from '../sports';
import AreaBoundaryFrame from './area/AreaBoundaryFrame';
import CourtLayoutShell from './area/CourtLayoutShell';
import { getAreaDisplay } from '../utils/areaHelper';
import { buildAreaPreviewGrid, mapAreaViewPointToFullCourt, mapFullCourtPointToAreaView, resolveAreaSelectionFromPoint, resolveVisibleCourtSide } from '../utils/areaGeometry';

export default function CourtAreaSelector() {
  const { matchInfo, currentAction, setCurrentAction, sportTemplate, currentInputHistory, setCurrentInputHistory, teams, settings, setSettings, selectArea } = useScoutContext();
  const areas = sportTemplate.areas;
  const selectedAreaCode = currentAction.areaCode;
  const primaryCourtSide = resolveVisibleCourtSide('primary', settings.flipCourtSide);
  const opponentCourtSide = resolveVisibleCourtSide('opponent', settings.flipCourtSide);

  const getAreaName = (code: string) => {
    return code; // Areas don't have English names, just codes
  };

  const getAreaThaiName = (code: string) => {
    return areas.find(a => a.code === code)?.thaiName || '';
  };

  const handleSelectArea = (code: string, courtSide?: 'teamA' | 'teamB' | 'neutral', outZone?: import('../types').OutZoneType, isOut: boolean = false) => {
    selectArea({
      areaCode: code,
      courtSide,
      outZone,
      areaLabel: getAreaName(code),
      areaResolution: isOut ? 'out-zone' : 'normal',
      areaMode: 'normal'
    });
  };

  const hasArea = (code: string) => {
    return areas.some(a => a.code === code);
  };

  const AreaButton = ({ code, className = '', label, subLabel, courtSide, flipContent = false, isOut = false, style, outZone }: { code: string, className?: string, label?: string, subLabel?: string, courtSide?: 'teamA' | 'teamB' | 'neutral', flipContent?: boolean, isOut?: boolean, style?: React.CSSProperties, outZone?: import('../types').OutZoneType }) => {
    const isThai = settings.uiLanguage === 'th';
    const displayInfo = getAreaDisplay(code, isThai, label || getAreaThaiName(code));
    let name = displayInfo.main;
    let thaiName = displayInfo.sub;
    let areaMode = 'normal' as 'normal' | 'detailed' | 'point';
    let areaResolution = isOut ? 'out-zone' : 'normal';
    let gridX = undefined;
    let gridY = undefined;
    let baseAreaCode = code;

    if (matchInfo.sportType === 'badminton' && courtSide && !isOut) {
      name = (courtSide === 'teamA' ? 'Our ' : 'Opp ') + name;
    }

    if (settings.areaPrecisionMode === 'detailed' && DETAILED_ZONE_LABELS[code]) {
      const detailed = DETAILED_ZONE_LABELS[code];
      const detailedDisplay = getAreaDisplay(code, isThai, detailed.thaiLabel);
      name = detailedDisplay.main;
      thaiName = detailedDisplay.sub;
      baseAreaCode = detailed.baseAreaCode;
      gridX = detailed.gridX;
      gridY = detailed.gridY;
      areaMode = 'detailed';
      areaResolution = 'legacy-3x3';
    }

    const isSelected = areaMode === 'detailed' && settings.areaPrecisionMode === 'detailed'
      ? (currentAction.areaCode === baseAreaCode 
         && currentAction.gridX === gridX 
         && currentAction.gridY === gridY
         && (currentAction.courtSide === courtSide || (!courtSide && !currentAction.courtSide)))
      : (selectedAreaCode === code || selectedAreaCode === baseAreaCode) 
         && (currentAction.courtSide === courtSide || (!courtSide && !currentAction.courtSide)) 
         && (!isOut || currentAction.outZone === outZone);

    if (!hasArea(code) && !hasArea(baseAreaCode) && !label && settings.areaPrecisionMode !== 'detailed') return null;

    return (
      <button
        onClick={() => selectArea({
          areaCode: baseAreaCode,
          courtSide,
          areaLabel: name,
          outZone,
          areaResolution,
          areaMode,
          gridX,
          gridY
        })}
        data-scout-selectable="true"
        data-scout-group="area"
        data-scout-value={code}
        data-court-side={courtSide || 'neutral'}
        style={style}
        className={`flex flex-col items-center justify-center p-1 rounded-lg transition-all duration-75 ${
          isSelected 
            ? (isOut ? 'bg-red-500 text-white shadow-md border-2 border-red-600 scale-[1.01]' : 'bg-sky-600 text-white shadow-md border-2 border-sky-700 scale-[1.01]')
            : (isOut 
                ? 'bg-red-50/80 dark:bg-red-900/20 text-red-700 dark:text-red-200 border-2 border-transparent hover:bg-red-100 dark:hover:bg-red-900/40 hover:border-red-300' 
                : 'bg-white/85 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border-2 border-transparent hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:border-sky-300')
        } ${className}`}
      >
        <div className={`flex flex-col items-center justify-center w-full h-full p-1 overflow-hidden ${flipContent && settings.flipCourtSide ? 'rotate-180 transition-transform duration-300' : 'transition-transform duration-300'}`}>
          <span className="font-extrabold text-[15px] sm:text-[18px] text-center leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full font-mono tracking-wide">{name}</span>
          {thaiName && (
            <span className={`text-xs sm:text-sm mt-1 font-bold text-center leading-none max-w-full truncate px-0.5 ${
              isSelected ? 'text-sky-100' : 'text-gray-500 dark:text-gray-400'
            }`}>
              {thaiName}
            </span>
          )}
        </div>
      </button>
    );
  };

  // Error/Out areas outside the main court
  const errorAreas = areas.filter(a => ['OUT', 'LONG_OUT', 'SIDE_OUT', 'NET_ERR', 'UNKNOWN'].includes(a.code))
    .filter(a => !(settings.enableOutOfBoundsZones && ['OUT', 'LONG_OUT', 'SIDE_OUT'].includes(a.code)));

  const GeometrySelectionGrid = ({ sport }: { sport: 'volleyball' | 'football' | 'badminton' | 'basketball' }) => {
    const precisionMode = settings.areaPrecisionMode || 'normal';
    const preview = buildAreaPreviewGrid(
      sport,
      precisionMode,
      settings.flipCourtSide,
      settings.areaCourtViewMode || 'auto',
      settings.uiLanguage,
    );
    const sportSurface = 'border-white/40 bg-transparent';
    if (precisionMode === 'point') {
      const selectedViewPoint = typeof currentAction.pointX === 'number' && typeof currentAction.pointY === 'number'
        ? mapFullCourtPointToAreaView(
          sport,
          { rx: 0.05 + currentAction.pointX * 0.9, ry: 0.05 + currentAction.pointY * 0.9 },
          settings.areaCourtViewMode || 'auto',
        )
        : null;
      return (
        <button
          type="button"
          aria-label={settings.uiLanguage === 'th' ? 'เลือกตำแหน่งแบบจุดบนสนาม' : 'Select an exact point on the court'}
          onPointerUp={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const localX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
            const localY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
            const viewPoint = { rx: 0.05 + localX * 0.9, ry: 0.05 + localY * 0.9 };
            const payload = resolveAreaSelectionFromPoint({
              sportType: sport,
              areas,
              point: mapAreaViewPointToFullCourt(
                sport,
                viewPoint,
                settings.areaCourtViewMode || 'auto',
              ),
              flipCourtSide: settings.flipCourtSide,
              enableOutOfBoundsZones: false,
              areaPrecisionMode: 'point',
              uiLanguage: settings.uiLanguage,
            });
            if (payload) selectArea({ ...payload, courtViewMode: settings.areaCourtViewMode || 'auto' });
          }}
          className={`relative h-full min-h-[360px] w-full overflow-hidden border-2 ${sportSurface} cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2`}
        >
          <span className="absolute inset-0 grid grid-cols-6 grid-rows-8 opacity-35" aria-hidden="true">
            {Array.from({ length: 48 }, (_, index) => <span key={index} className="border border-current/20" />)}
          </span>
          <span className="absolute inset-x-0 top-1/2 h-px bg-current/45" aria-hidden="true" />
          {selectedViewPoint && (
            <span
              className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow-lg"
              style={{
                left: `${((selectedViewPoint.rx - 0.05) / 0.9) * 100}%`,
                top: `${((selectedViewPoint.ry - 0.05) / 0.9) * 100}%`,
              }}
              aria-hidden="true"
            />
          )}
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-slate-950/80 px-3 py-2 text-sm font-semibold text-white">
            {settings.uiLanguage === 'th' ? 'แตะตำแหน่งที่เหตุการณ์เกิดขึ้น' : 'Tap where the event happened'}
          </span>
        </button>
      );
    }

    return (
      <div
        className={`grid h-full min-h-[360px] w-full gap-1 border-2 p-2 ${sportSurface}`}
        style={{
          gridTemplateColumns: `repeat(${preview.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${preview.rows}, minmax(0, 1fr))`,
        }}
      >
        {preview.cells.map(({ row, col, payload }) => {
          if (!payload?.areaCode) return <span key={`${row}-${col}`} />;
          const display = getAreaDisplay(payload.areaCode, settings.uiLanguage === 'th', payload.areaLabel || payload.areaCode);
          const selected = currentAction.areaCode === payload.areaCode
            && currentAction.courtSide === payload.courtSide
            && (payload.gridX === undefined || currentAction.gridX === payload.gridX)
            && (payload.gridY === undefined || currentAction.gridY === payload.gridY);
          return (
            <button
              type="button"
              key={`${row}-${col}-${payload.areaCode}-${payload.courtSide}`}
              onClick={() => selectArea({ ...payload, courtViewMode: settings.areaCourtViewMode || 'auto' })}
              data-scout-selectable="true"
              data-scout-group="area"
              data-scout-value={payload.areaCode}
              data-court-side={payload.courtSide || 'neutral'}
              title={`${display.main}${display.sub ? ` - ${display.sub}` : ''}`}
              className={`flex min-h-11 min-w-0 flex-col items-center justify-center overflow-hidden rounded-md border px-1 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                selected
                  ? 'border-sky-700 bg-sky-600 text-white shadow-md'
                  : 'border-white/60 bg-white/80 text-slate-900 hover:border-sky-300 hover:bg-sky-50/90 dark:border-white/15 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-sky-950/75'
              }`}
            >
              <span className="max-w-full truncate font-mono text-sm font-extrabold">{display.main}</span>
              {display.sub && <span className="max-w-full truncate text-xs opacity-75">{display.sub}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  if (matchInfo.sportType === 'volleyball') {
    const teamA = teams[0]?.code || 'Team A';
    const teamB = teams[1]?.code || 'Team B';
    
    const leftTeam = settings.flipCourtSide ? teamB : teamA;
    const rightTeam = settings.flipCourtSide ? teamA : teamB;
    const leftCourtSide = primaryCourtSide;
    const rightCourtSide = opponentCourtSide;

    if (settings.areaCourtViewMode === 'half') {
      return (
        <CourtLayoutShell
          sport="volleyball"
          titleEn="Focused Half Court"
          titleTh="ครึ่งสนามที่กำลังวิเคราะห์"
          flipLabelEn="Swap Sides"
          flipLabelTh="สลับฝั่ง"
          flipIcon="ArrowLeftRight"
          maxWidthClass="max-w-3xl"
        >
          <GeometrySelectionGrid sport="volleyball" />
        </CourtLayoutShell>
      );
    }

    return (
      <CourtLayoutShell
        sport="volleyball"
        titleEn="Area"
        titleTh="พื้นที่ (Area)"
        flipLabelEn="Swap Sides"
        flipLabelTh="สลับฝั่ง"
        flipIcon="ArrowLeftRight"
        maxWidthClass="max-w-4xl"
      >
        <div className="rounded-xl border-2 border-sky-300 dark:border-sky-700/50 bg-sky-50 dark:bg-sky-950/10 p-2 relative overflow-hidden flex flex-row gap-1 items-stretch min-h-[200px] flex-1">
          {/* Left Court */}
          <div className="flex-1 flex flex-col relative z-10 p-1">
            <div className="text-center font-bold text-gray-500 mb-1 text-xs">{leftTeam}</div>
            <div className={`grid ${settings.areaPrecisionMode === 'detailed' ? 'grid-cols-3 grid-rows-3' : 'grid-cols-2 grid-rows-3'} gap-1 flex-1`}>
              {settings.areaPrecisionMode === 'detailed' ? (
                <>
                  <AreaButton code="LB-1" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="LB-2" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="LN-1" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="CB-1" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="CB-2" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="CN-1" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="RB-1" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="RB-2" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="RN-1" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                </>
              ) : (
                <>
                  <AreaButton code="LB" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="LN" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  
                  <AreaButton code="CB" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="CN" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  
                  <AreaButton code="RB" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                  <AreaButton code="RN" className="w-full h-full text-xs" courtSide={leftCourtSide} />
                </>
              )}
            </div>
            {/* 3m Line Left */}
            <div className={`absolute top-6 bottom-1 ${settings.areaPrecisionMode === 'detailed' ? 'right-[33%]' : 'right-1/2'} w-0.5 bg-sky-300 dark:bg-sky-800/50 -z-10`}></div>
          </div>

          {/* NET */}
          <button 
            onClick={() => handleSelectArea('NET', 'neutral')}
            className={`w-6 flex flex-col items-center justify-center rounded-lg font-bold text-xs transition-colors border border-gray-400 z-20 ${
              selectedAreaCode === 'NET' 
                ? 'bg-sky-600 text-white shadow-md border-sky-700' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-750'
            }`}
          >
            <span style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>NET</span>
          </button>

          {/* Right Court */}
          <div className="flex-1 flex flex-col relative z-10 p-1">
            <div className="text-center font-bold text-gray-500 mb-1 text-xs">{rightTeam}</div>
            <div className={`grid ${settings.areaPrecisionMode === 'detailed' ? 'grid-cols-3 grid-rows-3' : 'grid-cols-2 grid-rows-3'} gap-1 flex-1`}>
              {settings.areaPrecisionMode === 'detailed' ? (
                <>
                  <AreaButton code="RN-2" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="RB-3" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="RB-4" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="CN-2" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="CB-3" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="CB-4" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="LN-2" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="LB-3" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="LB-4" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                </>
              ) : (
                <>
                  <AreaButton code="RN" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="RB" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  
                  <AreaButton code="CN" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="CB" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  
                  <AreaButton code="LN" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                  <AreaButton code="LB" className="w-full h-full text-xs" courtSide={rightCourtSide} />
                </>
              )}
            </div>
            {/* 3m Line Right */}
            <div className={`absolute top-6 bottom-1 ${settings.areaPrecisionMode === 'detailed' ? 'left-[33%]' : 'left-1/2'} w-0.5 bg-sky-300 dark:bg-sky-800/50 -z-10`}></div>
          </div>

          {/* Horizontal Grid lines */}
          <div className="absolute top-[33%] left-0 right-0 h-0.5 bg-sky-200/50 dark:bg-sky-800/30 z-0 opacity-50"></div>
          <div className="absolute top-[66%] left-0 right-0 h-0.5 bg-sky-200/50 dark:bg-sky-800/30 z-0 opacity-50"></div>
        </div>
      </CourtLayoutShell>
    );
  }

  // Football Pitch
  if (matchInfo.sportType === 'football') {
    const isHalfCourt = settings.areaCourtViewMode === 'half';
    return (
      <CourtLayoutShell
        sport="football"
        titleEn={isHalfCourt ? 'Focused Half Pitch' : 'Full Pitch Area'}
        titleTh={isHalfCourt ? 'ครึ่งสนามที่กำลังวิเคราะห์' : 'พื้นที่สนาม (Full Pitch)'}
        flipLabelEn="Swap Sides"
        flipLabelTh="สลับฝั่ง"
        flipIcon="ArrowUpDown"
        maxWidthClass="max-w-xl"
      >
        <GeometrySelectionGrid sport="football" />
      </CourtLayoutShell>
    );
  }

  // Badminton Court
  if (matchInfo.sportType === 'badminton') {
    const isHalfCourt = settings.areaCourtViewMode === 'half';
    return (
      <CourtLayoutShell
        sport="badminton"
        titleEn={isHalfCourt ? 'Focused Half Court' : 'Court Area'}
        titleTh={isHalfCourt ? 'ครึ่งสนามที่กำลังวิเคราะห์' : 'พื้นที่สนามแบดมินตัน'}
        flipLabelEn="Swap Sides"
        flipLabelTh="สลับฝั่ง"
        flipIcon="ArrowUpDown"
        maxWidthClass="max-w-xl"
      >
        <GeometrySelectionGrid sport="badminton" />
      </CourtLayoutShell>
    );
  }

  // Basketball Half Court
  if (matchInfo.sportType === 'basketball') {
    const isHalfCourt = settings.areaCourtViewMode === 'half';
    return (
      <CourtLayoutShell
        sport="basketball"
        titleEn={isHalfCourt ? 'Focused Half Court' : 'Full Court Area'}
        titleTh={isHalfCourt ? 'ครึ่งสนามที่กำลังวิเคราะห์' : 'พื้นที่สนามเต็ม'}
        flipLabelEn="Swap Sides"
        flipLabelTh="สลับฝั่ง"
        flipIcon="ArrowUpDown"
        maxWidthClass="max-w-xl"
      >
        <GeometrySelectionGrid sport="basketball" />
      </CourtLayoutShell>
    );
  }

  // Generic Grid Layout for other sports
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">พื้นที่ (Area)</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {areas.map(area => (
          <button
            key={area.code}
            onClick={() => handleSelectArea(area.code)}
            className={`flex flex-col items-center justify-center p-2 min-h-[60px] rounded-lg transition-colors border overflow-hidden ${
              selectedAreaCode === area.code 
                ? 'bg-sky-600 text-white border-sky-700 shadow-sm' 
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-sky-50 dark:hover:bg-sky-900/30'
            }`}
          >
            <span className="font-extrabold text-[15px] sm:text-[18px] font-mono tracking-wide truncate max-w-full leading-none">{area.code}</span>
            <span className={`text-xs sm:text-sm font-semibold mt-1.5 leading-none truncate max-w-full px-1 ${selectedAreaCode === area.code ? 'text-sky-200' : 'text-gray-500 dark:text-gray-400'}`}>
              {settings.uiLanguage === 'th' ? (area.thaiName || area.code) : area.code}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
