import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { Action } from '../types';
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import { SPORT_TEMPLATES, OUT_ZONE_LABELS, DETAILED_ZONE_LABELS, OUT_ZONE_VISUALS_BY_SPORT } from '../sports';
import AreaBoundaryFrame from './area/AreaBoundaryFrame';
import CourtLayoutShell from './area/CourtLayoutShell';
import { getAreaDisplay } from '../utils/areaHelper';

export default function CourtAreaSelector() {
  const { matchInfo, currentAction, setCurrentAction, sportTemplate, currentInputHistory, setCurrentInputHistory, teams, settings, setSettings, selectArea } = useScoutContext();
  const areas = sportTemplate.areas;
  const selectedAreaCode = currentAction.areaCode;

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

  if (matchInfo.sportType === 'volleyball') {
    const teamA = teams[0]?.code || 'Team A';
    const teamB = teams[1]?.code || 'Team B';
    
    const leftTeam = settings.flipCourtSide ? teamB : teamA;
    const rightTeam = settings.flipCourtSide ? teamA : teamB;
    const leftCourtSide = settings.flipCourtSide ? 'teamB' : 'teamA';
    const rightCourtSide = settings.flipCourtSide ? 'teamA' : 'teamB';

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
    return (
      <CourtLayoutShell
        sport="football"
        titleEn="Full Pitch Area"
        titleTh="พื้นที่สนาม (Full Pitch)"
        flipLabelEn="Swap Sides"
        flipLabelTh="สลับฝั่ง"
        flipIcon="ArrowUpDown"
        maxWidthClass="max-w-xl"
      >
        <div className={`flex-1 rounded-xl border-2 border-green-300 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-3 relative overflow-hidden flex flex-col gap-1 transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
          
          {/* Team B Side (Top Half) */}
          <div className="relative z-10 grid grid-cols-3 gap-1 opacity-80 mb-1">
            <AreaButton code="DEF_R" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="DEF_C" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="DEF_L" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            
            <AreaButton code="MID_R" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="MID_C" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="MID_L" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />

            <AreaButton code="ATT_R" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="ATT_C" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="ATT_L" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
          </div>

          <div className="h-1 bg-green-400 dark:bg-green-600/50 my-1 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-green-400 dark:border-green-600/50 bg-transparent" />
          </div>

          {/* Team A Side (Bottom Half) */}
          <div className="relative z-10 grid grid-cols-3 gap-1 mt-1">
            <AreaButton code="ATT_L" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="ATT_C" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="ATT_R" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />

            <AreaButton code="MID_L" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="MID_C" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="MID_R" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />

            <AreaButton code="DEF_L" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="DEF_C" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="DEF_R" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
          </div>
        </div>
      </CourtLayoutShell>
    );
  }

  // Badminton Court
  if (matchInfo.sportType === 'badminton') {
    return (
      <CourtLayoutShell
        sport="badminton"
        titleEn="Area"
        titleTh="พื้นที่ (Area)"
        flipLabelEn="Swap Sides"
        flipLabelTh="สลับฝั่ง"
        flipIcon="ArrowUpDown"
        maxWidthClass="max-w-xl"
      >
        <div className={`flex-1 rounded-xl border-2 border-sky-300 dark:border-sky-700/50 bg-sky-50 dark:bg-sky-950/10 p-3 relative overflow-hidden flex flex-col gap-1 transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
          {/* Opponent Side */}
          <div className="relative z-10 grid grid-cols-3 gap-1 opacity-80 mb-1">
            <AreaButton code="BR" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="BC" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="BL" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            
            <AreaButton code="MR" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="MC" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="ML" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />

            <AreaButton code="FR" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="FC" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            <AreaButton code="FL" className="aspect-square" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
          </div>

          {/* NET */}
          <div className="w-full h-4 mb-1 rounded-lg flex items-center justify-center font-bold text-xs bg-sky-200 dark:bg-sky-800/50 text-sky-900 dark:text-sky-200 border-b-2 border-white/50 dark:border-gray-800/50 z-10">
            <div className={`${settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'}`}>NET</div>
          </div>

          {/* Our Side */}
          <div className="relative z-10 grid grid-cols-3 gap-1 mt-1">
            <AreaButton code="FL" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="FC" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="FR" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            
            <AreaButton code="ML" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="MC" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="MR" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />

            <AreaButton code="BL" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="BC" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            <AreaButton code="BR" className="aspect-square" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
          </div>
        </div>
      </CourtLayoutShell>
    );
  }

  // Basketball Half Court
  if (matchInfo.sportType === 'basketball') {
    return (
      <CourtLayoutShell
        sport="basketball"
        titleEn="Full Court Area"
        titleTh="พื้นที่สนามเต็ม (Full Court Area)"
        flipLabelEn="Swap Sides"
        flipLabelTh="สลับฝั่ง"
        flipIcon="ArrowUpDown"
        maxWidthClass="max-w-xl"
      >
        <div className={`flex-1 rounded-xl border-2 border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-3 relative overflow-hidden flex flex-col transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
          
          {/* Team B Side (Top Half) */}
          <div className="flex flex-col items-center w-full mb-1">
            {/* Hoop / Paint */}
            <div className="w-full flex justify-center mb-1">
              <div className="w-1/3 flex flex-col gap-1 relative">
                <div className="w-8 h-1 bg-amber-600 mx-auto rounded-full mb-0.5"></div>
                <AreaButton code="PAINT" className="h-10 text-xs bg-amber-200 dark:bg-amber-800" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
                
                {/* Corners inside the hoop row for compact UI */}
                <div className="absolute top-1 -left-[110%] w-[100%] h-full">
                   <AreaButton code="LEFT_CORNER" className="h-full text-[10px]" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
                </div>
                <div className="absolute top-1 -right-[110%] w-[100%] h-full">
                   <AreaButton code="RIGHT_CORNER" className="h-full text-[10px]" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
                </div>
              </div>
            </div>

            <div className="w-full relative z-10 grid grid-cols-3 gap-1 mb-1">
              <AreaButton code="LEFT_WING" className="text-xs" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
              <div className="flex flex-col gap-1">
                <AreaButton code="MID_RANGE" className="text-[10px] h-8" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
                <AreaButton code="TOP_KEY" className="text-xs h-8" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
              </div>
              <AreaButton code="RIGHT_WING" className="text-xs" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            </div>
            
            <div className="w-full">
              <AreaButton code="THREE_PT" className="w-full py-1.5 text-xs" courtSide={settings.flipCourtSide ? "teamA" : "teamB"} flipContent />
            </div>
          </div>

          <div className="h-1 bg-amber-400 dark:bg-amber-600/50 my-1 flex items-center justify-center w-full">
            <div className="w-6 h-6 rounded-full border-2 border-amber-400 dark:border-amber-600/50 bg-transparent" />
          </div>

          {/* Team A Side (Bottom Half) */}
          <div className="flex flex-col items-center w-full mt-1">
            <div className="w-full">
              <AreaButton code="THREE_PT" className="w-full py-1.5 text-xs" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            </div>

            <div className="w-full relative z-10 grid grid-cols-3 gap-1 mt-1">
              <AreaButton code="LEFT_WING" className="text-xs" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
              <div className="flex flex-col gap-1">
                <AreaButton code="TOP_KEY" className="text-xs h-8" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
                <AreaButton code="MID_RANGE" className="text-[10px] h-8" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
              </div>
              <AreaButton code="RIGHT_WING" className="text-xs" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
            </div>

            {/* Hoop / Paint */}
            <div className="w-full flex justify-center mt-1">
              <div className="w-1/3 flex flex-col gap-1 relative">
                
                {/* Corners inside the hoop row for compact UI */}
                <div className="absolute bottom-1 -left-[110%] w-[100%] h-[calc(100%-4px)]">
                   <AreaButton code="LEFT_CORNER" className="h-full text-[10px]" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
                </div>
                <div className="absolute bottom-1 -right-[110%] w-[100%] h-[calc(100%-4px)]">
                   <AreaButton code="RIGHT_CORNER" className="h-full text-[10px]" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
                </div>

                <AreaButton code="PAINT" className="h-10 text-xs bg-amber-200 dark:bg-amber-800" courtSide={settings.flipCourtSide ? "teamB" : "teamA"} flipContent />
                <div className="w-8 h-1 bg-amber-600 mx-auto rounded-full mt-0.5"></div>
              </div>
            </div>
          </div>

        </div>
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
