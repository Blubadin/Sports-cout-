import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { Action } from '../types';
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import { SPORT_TEMPLATES, OUT_ZONE_LABELS, DETAILED_ZONE_LABELS, OUT_ZONE_VISUALS_BY_SPORT } from '../sports';
import AreaBoundaryFrame from './area/AreaBoundaryFrame';
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

  const handleSelectArea = (code: string, courtSide?: 'teamA' | 'teamB' | 'neutral', outZone?: string, isOut: boolean = false) => {
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

  const AreaButton = ({ code, className = '', label, subLabel, courtSide, flipContent = false, isOut = false, style, outZone }: { code: string, className?: string, label?: string, subLabel?: string, courtSide?: 'teamA' | 'teamB' | 'neutral', flipContent?: boolean, isOut?: boolean, style?: React.CSSProperties, outZone?: string }) => {
    const isThai = settings.uiLanguage === 'th';
    const displayInfo = getAreaDisplay(code, isThai, label || getAreaThaiName(code));
    let name = displayInfo.main;
    let thaiName = displayInfo.sub;
    let areaMode = 'normal' as 'normal' | 'detailed' | 'point';
    let areaResolution = isOut ? 'out-zone' : 'normal';
    let gridX = undefined;
    let gridY = undefined;
    let baseAreaCode = code;

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

    const isSelected = (selectedAreaCode === code || selectedAreaCode === baseAreaCode) && (currentAction.courtSide === courtSide || (!courtSide && !currentAction.courtSide)) && (!isOut || currentAction.outZone === outZone);

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
            ? (isOut ? 'bg-red-500 text-white shadow-md border-2 border-red-600 scale-[1.01]' : 'bg-orange-500 text-white shadow-md border-2 border-orange-600 scale-[1.01]')
            : (isOut 
                ? 'bg-red-50/80 dark:bg-red-900/20 text-red-700 dark:text-red-200 border-2 border-transparent hover:bg-red-100 dark:hover:bg-red-900/40 hover:border-red-300' 
                : 'bg-white/85 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border-2 border-transparent hover:bg-orange-100 dark:hover:bg-gray-700 hover:border-orange-300')
        } ${className}`}
      >
        <div className={`flex flex-col items-center justify-center w-full h-full ${flipContent && settings.flipCourtSide ? 'rotate-180 transition-transform duration-300' : 'transition-transform duration-300'}`}>
          <span className="font-black text-[15px] sm:text-[17.5px] text-center leading-tight whitespace-nowrap">{name}</span>
          {thaiName && <span className={`text-[11px] sm:text-[13.5px] mt-0.5 font-black text-center leading-none ${isSelected ? 'text-orange-100/95' : 'text-gray-600 dark:text-gray-300'}`}>{thaiName}</span>}
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
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {settings.uiLanguage === 'th' ? 'พื้นที่ (Area)' : 'Area'}
          </h3>
          <button 
            onClick={() => setSettings(s => ({ ...s, flipCourtSide: !s.flipCourtSide }))}
            className="text-[10px] flex items-center gap-1 text-gray-500 hover:text-sky-600 bg-gray-100 hover:bg-sky-50 dark:bg-gray-800 dark:hover:bg-sky-900/30 px-2 py-1 rounded transition-colors"
          >
            <ArrowLeftRight size={12} className={settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {settings.uiLanguage === 'th' ? 'สลับฝั่ง' : 'Swap Sides'}
          </button>
        </div>
        
        <div className="flex flex-col items-center gap-1 mx-auto w-full max-w-4xl overflow-visible">
          {settings.enableOutOfBoundsZones ? (
            <AreaBoundaryFrame
              sport="volleyball"
              selectedAreaCode={selectedAreaCode}
              currentOutZone={currentAction.outZone || null}
              uiLanguage={settings.uiLanguage}
              onSelectOutZone={(payload) => {
                selectArea({
                  areaCode: payload.areaCode,
                  areaLabel: payload.areaLabel,
                  areaMode: 'normal',
                  courtSide: payload.courtSide,
                  outZone: payload.outZone,
                  areaResolution: 'out-zone'
                });
              }}
            >
              <div className="rounded-xl border-2 border-orange-300 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-900/10 p-2 relative overflow-hidden flex flex-row gap-1 items-stretch min-h-[200px] flex-1">
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
                  <div className={`absolute top-6 bottom-1 ${settings.areaPrecisionMode === 'detailed' ? 'right-[33%]' : 'right-1/2'} w-0.5 bg-orange-300 dark:bg-orange-700/50 -z-10`}></div>
                </div>

                {/* NET */}
                <button 
                  onClick={() => handleSelectArea('NET', 'neutral')}
                  className={`w-6 flex flex-col items-center justify-center rounded font-bold text-[10px] transition-colors border border-orange-400 z-20 ${
                    selectedAreaCode === 'NET' 
                      ? 'bg-orange-500 text-white shadow-md' 
                      : 'bg-orange-300/50 dark:bg-orange-800/50 text-orange-900 dark:text-orange-200 hover:bg-orange-400'
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
                  <div className={`absolute top-6 bottom-1 ${settings.areaPrecisionMode === 'detailed' ? 'left-[33%]' : 'left-1/2'} w-0.5 bg-orange-300 dark:bg-orange-700/50 -z-10`}></div>
                </div>

                {/* Horizontal Grid lines */}
                <div className="absolute top-[33%] left-0 right-0 h-0.5 bg-orange-300 dark:bg-orange-700/50 z-0 opacity-50"></div>
                <div className="absolute top-[66%] left-0 right-0 h-0.5 bg-orange-300 dark:bg-orange-700/50 z-0 opacity-50"></div>
              </div>
            </AreaBoundaryFrame>
          ) : (
            <div className="flex flex-row w-full items-stretch gap-1">
              <div className="rounded-xl border-2 border-orange-300 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-900/10 p-2 relative overflow-hidden flex flex-row gap-1 items-stretch min-h-[200px] flex-1">
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
                  <div className={`absolute top-6 bottom-1 ${settings.areaPrecisionMode === 'detailed' ? 'right-[33%]' : 'right-1/2'} w-0.5 bg-orange-300 dark:bg-orange-700/50 -z-10`}></div>
                </div>

                {/* NET */}
                <button 
                  onClick={() => handleSelectArea('NET', 'neutral')}
                  className={`w-6 flex flex-col items-center justify-center rounded font-bold text-[10px] transition-colors border border-orange-400 z-20 ${
                    selectedAreaCode === 'NET' 
                      ? 'bg-orange-500 text-white shadow-md' 
                      : 'bg-orange-300/50 dark:bg-orange-800/50 text-orange-900 dark:text-orange-200 hover:bg-orange-400'
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
                  <div className={`absolute top-6 bottom-1 ${settings.areaPrecisionMode === 'detailed' ? 'left-[33%]' : 'left-1/2'} w-0.5 bg-orange-300 dark:bg-orange-700/50 -z-10`}></div>
                </div>

                {/* Horizontal Grid lines */}
                <div className="absolute top-[33%] left-0 right-0 h-0.5 bg-orange-300 dark:bg-orange-700/50 z-0 opacity-50"></div>
                <div className="absolute top-[66%] left-0 right-0 h-0.5 bg-orange-300 dark:bg-orange-700/50 z-0 opacity-50"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Football Pitch
  if (matchInfo.sportType === 'football') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {settings.uiLanguage === 'th' ? 'พื้นที่ตามทิศทางการบุก (Attacking Direction Area)' : 'Attacking Direction Area'}
          </h3>
          <button 
            onClick={() => setSettings(s => ({ ...s, flipCourtSide: !s.flipCourtSide }))}
            className="text-[10px] flex items-center gap-1 text-gray-500 hover:text-sky-600 bg-gray-100 hover:bg-sky-50 dark:bg-gray-800 dark:hover:bg-sky-900/30 px-2 py-1 rounded transition-colors"
          >
            <ArrowUpDown size={12} className={settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {settings.uiLanguage === 'th' ? 'สลับฝั่งมุมมอง' : 'Flip Perspective'}
          </button>
        </div>
        
        <div className="flex flex-col items-center gap-1 mx-auto w-full max-w-xl overflow-visible">
          {settings.enableOutOfBoundsZones ? (
            <AreaBoundaryFrame
              sport="football"
              selectedAreaCode={selectedAreaCode}
              currentOutZone={currentAction.outZone || null}
              uiLanguage={settings.uiLanguage}
              onSelectOutZone={(payload) => {
                selectArea({
                  areaCode: payload.areaCode,
                  areaLabel: payload.areaLabel,
                  areaMode: 'normal',
                  courtSide: payload.courtSide,
                  outZone: payload.outZone,
                  areaResolution: 'out-zone'
                });
              }}
            >
              <div className={`flex-1 rounded-xl border-2 border-green-300 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-3 relative overflow-hidden flex flex-col gap-1 transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
                <div className="text-[10px] text-center text-green-600 dark:text-green-400 font-bold tracking-widest uppercase mb-1">
                  {settings.uiLanguage === 'th' ? '▲ ทิศทางการบุก (ATTACKING DIRECTION)' : '▲ ATTACKING DIRECTION'}
                </div>
                {/* Top Goal/Box areas */}
                <div className="flex gap-2 justify-center mb-2">
                  <AreaButton code="GOAL" className="w-1/3 bg-green-200 dark:bg-green-800" flipContent />
                  <AreaButton code="BOX" className="w-1/3 bg-green-200 dark:bg-green-800" flipContent />
                </div>

                <div className={`relative z-10 grid ${settings.areaPrecisionMode === 'detailed' ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                  {settings.areaPrecisionMode === 'detailed' ? (
                    Array.from({ length: 16 }).map((_, i) => {
                      const r = Math.floor(i / 4);
                      const c = i % 4;
                      return <AreaButton key={`F${r}${c}`} code={`F-${r}-${c}`} className="aspect-square text-[10px]" flipContent />;
                    })
                  ) : (
                    <>
                      {/* Attack */}
                      <AreaButton code="ATT_L" flipContent />
                      <AreaButton code="ATT_C" flipContent />
                      <AreaButton code="ATT_R" flipContent />
                      
                      {/* Midfield */}
                      <AreaButton code="MID_L" flipContent />
                      <AreaButton code="MID_C" flipContent />
                      <AreaButton code="MID_R" flipContent />

                      {/* Defense */}
                      <AreaButton code="DEF_L" flipContent />
                      <AreaButton code="DEF_C" flipContent />
                      <AreaButton code="DEF_R" flipContent />
                    </>
                  )}
                </div>
              </div>
            </AreaBoundaryFrame>
          ) : (
            <div className="flex flex-row w-full items-stretch gap-1">
              <div className={`flex-1 rounded-xl border-2 border-green-300 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-3 relative overflow-hidden flex flex-col gap-1 transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
                {/* Top Goal/Box areas */}
                <div className="flex gap-2 justify-center mb-2">
                  <AreaButton code="GOAL" className="w-1/3 bg-green-200 dark:bg-green-800" flipContent />
                  <AreaButton code="BOX" className="w-1/3 bg-green-200 dark:bg-green-800" flipContent />
                </div>

                <div className={`relative z-10 grid ${settings.areaPrecisionMode === 'detailed' ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                  {settings.areaPrecisionMode === 'detailed' ? (
                    Array.from({ length: 16 }).map((_, i) => {
                      const r = Math.floor(i / 4);
                      const c = i % 4;
                      return <AreaButton key={`F${r}${c}`} code={`F-${r}-${c}`} className="aspect-square text-[10px]" flipContent />;
                    })
                  ) : (
                    <>
                      {/* Attack */}
                      <AreaButton code="ATT_L" flipContent />
                      <AreaButton code="ATT_C" flipContent />
                      <AreaButton code="ATT_R" flipContent />
                      
                      {/* Midfield */}
                      <AreaButton code="MID_L" flipContent />
                      <AreaButton code="MID_C" flipContent />
                      <AreaButton code="MID_R" flipContent />

                      {/* Defense */}
                      <AreaButton code="DEF_L" flipContent />
                      <AreaButton code="DEF_C" flipContent />
                      <AreaButton code="DEF_R" flipContent />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Badminton Court
  if (matchInfo.sportType === 'badminton') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {settings.uiLanguage === 'th' ? 'พื้นที่ (Area)' : 'Area'}
          </h3>
          <button 
            onClick={() => setSettings(s => ({ ...s, flipCourtSide: !s.flipCourtSide }))}
            className="text-[10px] flex items-center gap-1 text-gray-500 hover:text-sky-600 bg-gray-100 hover:bg-sky-50 dark:bg-gray-800 dark:hover:bg-sky-900/30 px-2 py-1 rounded transition-colors"
          >
            <ArrowUpDown size={12} className={settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {settings.uiLanguage === 'th' ? 'สลับฝั่ง' : 'Swap Sides'}
          </button>
        </div>
        
        <div className="flex flex-col items-center gap-1 mx-auto w-full max-w-xl overflow-visible">
          {settings.enableOutOfBoundsZones ? (
            <AreaBoundaryFrame
              sport="badminton"
              selectedAreaCode={selectedAreaCode}
              currentOutZone={currentAction.outZone || null}
              uiLanguage={settings.uiLanguage}
              onSelectOutZone={(payload) => {
                selectArea({
                  areaCode: payload.areaCode,
                  areaLabel: payload.areaLabel,
                  areaMode: 'normal',
                  courtSide: payload.courtSide,
                  outZone: payload.outZone,
                  areaResolution: 'out-zone'
                });
              }}
            >
              <div className={`flex-1 rounded-xl border-2 border-teal-300 dark:border-teal-700/50 bg-teal-50 dark:bg-teal-900/10 p-3 relative overflow-hidden flex flex-col gap-1 transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
                {/* Opponent Side */}
                <div className="relative z-10 grid grid-cols-3 gap-1 opacity-80 mb-1">
                  <AreaButton code="BR" className="aspect-square" label={settings.flipCourtSide ? "Our BR" : "Opp BR"} flipContent />
                  <AreaButton code="BC" className="aspect-square" label={settings.flipCourtSide ? "Our BC" : "Opp BC"} flipContent />
                  <AreaButton code="BL" className="aspect-square" label={settings.flipCourtSide ? "Our BL" : "Opp BL"} flipContent />
                  
                  <AreaButton code="MR" className="aspect-square" label={settings.flipCourtSide ? "Our MR" : "Opp MR"} flipContent />
                  <AreaButton code="MC" className="aspect-square" label={settings.flipCourtSide ? "Our MC" : "Opp MC"} flipContent />
                  <AreaButton code="ML" className="aspect-square" label={settings.flipCourtSide ? "Our ML" : "Opp ML"} flipContent />

                  <AreaButton code="FR" className="aspect-square" label={settings.flipCourtSide ? "Our FR" : "Opp FR"} flipContent />
                  <AreaButton code="FC" className="aspect-square" label={settings.flipCourtSide ? "Our FC" : "Opp FC"} flipContent />
                  <AreaButton code="FL" className="aspect-square" label={settings.flipCourtSide ? "Our FL" : "Opp FL"} flipContent />
                </div>

                {/* NET */}
                <div className="w-full h-4 mb-1 rounded flex items-center justify-center font-bold text-[10px] bg-teal-200 dark:bg-teal-800/50 text-teal-900 dark:text-teal-200 border-b-2 border-white/50 dark:border-gray-800/50 z-10">
                  <div className={`${settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'}`}>NET</div>
                </div>

                {/* Our Side */}
                <div className="relative z-10 grid grid-cols-3 gap-1 mt-1">
                  <AreaButton code="FL" className="aspect-square" label={settings.flipCourtSide ? "Opp FL" : "Our FL"} flipContent />
                  <AreaButton code="FC" className="aspect-square" label={settings.flipCourtSide ? "Opp FC" : "Our FC"} flipContent />
                  <AreaButton code="FR" className="aspect-square" label={settings.flipCourtSide ? "Opp FR" : "Our FR"} flipContent />
                  
                  <AreaButton code="ML" className="aspect-square" label={settings.flipCourtSide ? "Opp ML" : "Our ML"} flipContent />
                  <AreaButton code="MC" className="aspect-square" label={settings.flipCourtSide ? "Opp MC" : "Our MC"} flipContent />
                  <AreaButton code="MR" className="aspect-square" label={settings.flipCourtSide ? "Opp MR" : "Our MR"} flipContent />

                  <AreaButton code="BL" className="aspect-square" label={settings.flipCourtSide ? "Opp BL" : "Our BL"} flipContent />
                  <AreaButton code="BC" className="aspect-square" label={settings.flipCourtSide ? "Opp BC" : "Our BC"} flipContent />
                  <AreaButton code="BR" className="aspect-square" label={settings.flipCourtSide ? "Opp BR" : "Our BR"} flipContent />
                </div>
              </div>
            </AreaBoundaryFrame>
          ) : (
            <div className="flex flex-row w-full items-stretch gap-1">
              <div className={`flex-1 rounded-xl border-2 border-teal-300 dark:border-teal-700/50 bg-teal-50 dark:bg-teal-900/10 p-3 relative overflow-hidden flex flex-col gap-1 transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
                {/* Opponent Side */}
                <div className="relative z-10 grid grid-cols-3 gap-1 opacity-80 mb-1">
                  <AreaButton code="BR" className="aspect-square" label={settings.flipCourtSide ? "Our BR" : "Opp BR"} flipContent />
                  <AreaButton code="BC" className="aspect-square" label={settings.flipCourtSide ? "Our BC" : "Opp BC"} flipContent />
                  <AreaButton code="BL" className="aspect-square" label={settings.flipCourtSide ? "Our BL" : "Opp BL"} flipContent />
                  
                  <AreaButton code="MR" className="aspect-square" label={settings.flipCourtSide ? "Our MR" : "Opp MR"} flipContent />
                  <AreaButton code="MC" className="aspect-square" label={settings.flipCourtSide ? "Our MC" : "Opp MC"} flipContent />
                  <AreaButton code="ML" className="aspect-square" label={settings.flipCourtSide ? "Our ML" : "Opp ML"} flipContent />

                  <AreaButton code="FR" className="aspect-square" label={settings.flipCourtSide ? "Our FR" : "Opp FR"} flipContent />
                  <AreaButton code="FC" className="aspect-square" label={settings.flipCourtSide ? "Our FC" : "Opp FC"} flipContent />
                  <AreaButton code="FL" className="aspect-square" label={settings.flipCourtSide ? "Our FL" : "Opp FL"} flipContent />
                </div>

                {/* NET */}
                <div className="w-full h-4 mb-1 rounded flex items-center justify-center font-bold text-[10px] bg-teal-200 dark:bg-teal-800/50 text-teal-900 dark:text-teal-200 border-b-2 border-white/50 dark:border-gray-800/50 z-10">
                  <div className={`${settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'}`}>NET</div>
                </div>

                {/* Our Side */}
                <div className="relative z-10 grid grid-cols-3 gap-1 mt-1">
                  <AreaButton code="FL" className="aspect-square" label={settings.flipCourtSide ? "Opp FL" : "Our FL"} flipContent />
                  <AreaButton code="FC" className="aspect-square" label={settings.flipCourtSide ? "Opp FC" : "Our FC"} flipContent />
                  <AreaButton code="FR" className="aspect-square" label={settings.flipCourtSide ? "Opp FR" : "Our FR"} flipContent />
                  
                  <AreaButton code="ML" className="aspect-square" label={settings.flipCourtSide ? "Opp ML" : "Our ML"} flipContent />
                  <AreaButton code="MC" className="aspect-square" label={settings.flipCourtSide ? "Opp MC" : "Our MC"} flipContent />
                  <AreaButton code="MR" className="aspect-square" label={settings.flipCourtSide ? "Opp MR" : "Our MR"} flipContent />

                  <AreaButton code="BL" className="aspect-square" label={settings.flipCourtSide ? "Opp BL" : "Our BL"} flipContent />
                  <AreaButton code="BC" className="aspect-square" label={settings.flipCourtSide ? "Opp BC" : "Our BC"} flipContent />
                  <AreaButton code="BR" className="aspect-square" label={settings.flipCourtSide ? "Opp BR" : "Our BR"} flipContent />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Basketball Half Court
  if (matchInfo.sportType === 'basketball') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {settings.uiLanguage === 'th' ? 'พื้นที่ตามทิศทางแป้นบาส (Basket/Attacking Direction Area)' : 'Basket/Attacking Direction Area'}
          </h3>
          <button 
            onClick={() => setSettings(s => ({ ...s, flipCourtSide: !s.flipCourtSide }))}
            className="text-[10px] flex items-center gap-1 text-gray-500 hover:text-sky-600 bg-gray-100 hover:bg-sky-50 dark:bg-gray-800 dark:hover:bg-sky-900/30 px-2 py-1 rounded transition-colors"
          >
            <ArrowUpDown size={12} className={settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {settings.uiLanguage === 'th' ? 'สลับทิศทางแป้นบาส' : 'Flip Basket Direction'}
          </button>
        </div>
        
        <div className="flex flex-col items-center gap-1 mx-auto w-full max-w-xl overflow-visible">
          {settings.enableOutOfBoundsZones ? (
            <AreaBoundaryFrame
              sport="basketball"
              selectedAreaCode={selectedAreaCode}
              currentOutZone={currentAction.outZone || null}
              uiLanguage={settings.uiLanguage}
              onSelectOutZone={(payload) => {
                selectArea({
                  areaCode: payload.areaCode,
                  areaLabel: payload.areaLabel,
                  areaMode: 'normal',
                  courtSide: payload.courtSide,
                  outZone: payload.outZone,
                  areaResolution: 'out-zone'
                });
              }}
            >
              <div className={`flex-1 rounded-xl border-2 border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-3 relative overflow-hidden flex flex-col items-center transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
                <div className="text-[10px] text-center text-amber-600 dark:text-amber-400 font-bold tracking-widest uppercase mb-1">
                  {settings.uiLanguage === 'th' ? '▲ ทิศทางแป้นบาส (BASKET DIRECTION)' : '▲ BASKET DIRECTION'}
                </div>
                {/* Hoop / Paint */}
                <div className="w-full flex justify-center mb-2">
                  <div className="w-1/3 flex flex-col gap-1">
                    <div className="w-8 h-2 bg-amber-600 mx-auto rounded-full mb-1"></div>
                    <AreaButton code="PAINT" className="h-16 bg-amber-200 dark:bg-amber-800" flipContent />
                  </div>
                </div>

                <div className="w-full relative z-10 grid grid-cols-3 gap-2">
                  <AreaButton code="LEFT_WING" flipContent />
                  <AreaButton code="TOP_KEY" flipContent />
                  <AreaButton code="RIGHT_WING" flipContent />

                  <AreaButton code="LEFT_CORNER" flipContent />
                  <AreaButton code="MID_RANGE" flipContent />
                  <AreaButton code="RIGHT_CORNER" flipContent />
                </div>
                
                <div className="w-full mt-2">
                  <AreaButton code="THREE_PT" className="w-full py-3" flipContent />
                </div>
              </div>
            </AreaBoundaryFrame>
          ) : (
            <div className="flex flex-row w-full items-stretch gap-1">
              <div className={`flex-1 rounded-xl border-2 border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-3 relative overflow-hidden flex flex-col items-center transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
                {/* Hoop / Paint */}
                <div className="w-full flex justify-center mb-2">
                  <div className="w-1/3 flex flex-col gap-1">
                    <div className="w-8 h-2 bg-amber-600 mx-auto rounded-full mb-1"></div>
                    <AreaButton code="PAINT" className="h-16 bg-amber-200 dark:bg-amber-800" flipContent />
                  </div>
                </div>

                <div className="w-full relative z-10 grid grid-cols-3 gap-2">
                  <AreaButton code="LEFT_WING" flipContent />
                  <AreaButton code="TOP_KEY" flipContent />
                  <AreaButton code="RIGHT_WING" flipContent />

                  <AreaButton code="LEFT_CORNER" flipContent />
                  <AreaButton code="MID_RANGE" flipContent />
                  <AreaButton code="RIGHT_CORNER" flipContent />
                </div>
                
                <div className="w-full mt-2">
                  <AreaButton code="THREE_PT" className="w-full py-3" flipContent />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
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
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors border ${
              selectedAreaCode === area.code 
                ? 'bg-sky-600 text-white border-sky-700 shadow-sm' 
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-sky-50 dark:hover:bg-sky-900/30'
            }`}
          >
            <span className="font-semibold text-sm">{area.code}</span>
            <span className={`text-[10px] ${selectedAreaCode === area.code ? 'text-sky-200' : 'text-gray-500 dark:text-gray-400'}`}>
              {area.thaiName || area.code}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
