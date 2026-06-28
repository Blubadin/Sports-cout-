import React from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { Action } from '../types';
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react';

export default function CourtAreaSelector() {
  const { matchInfo, currentAction, setCurrentAction, sportTemplate, currentInputHistory, setCurrentInputHistory, teams, settings, setSettings } = useScoutContext();
  const areas = sportTemplate.areas;
  const selectedAreaCode = currentAction.areaCode;

  const pushHistory = (category: keyof Action, value?: string, previousValue?: string, previousCourtSide?: 'teamA'|'teamB'|'neutral', courtSide?: 'teamA'|'teamB'|'neutral') => {
    setCurrentInputHistory(prev => [...prev, { type: 'field', category, value, previousValue, previousCourtSide, courtSide }]);
  };

  const handleSelectArea = (code: string, courtSide?: 'teamA' | 'teamB' | 'neutral') => {
    const isSame = currentAction.areaCode === code && currentAction.courtSide === courtSide;
    
    pushHistory('areaCode', isSame ? undefined : code, currentAction.areaCode, currentAction.courtSide, isSame ? undefined : courtSide);
    
    setCurrentAction(prev => {
      const next = { ...prev };
      if (isSame) {
        delete next.areaCode;
        delete next.courtSide;
      } else {
        next.areaCode = code;
        if (courtSide) {
          next.courtSide = courtSide;
        } else {
          delete next.courtSide;
        }
      }
      return next;
    });
  };

  const getAreaName = (code: string) => {
    return code; // Areas don't have English names, just codes
  };

  const getAreaThaiName = (code: string) => {
    return areas.find(a => a.code === code)?.thaiName || '';
  };

  const hasArea = (code: string) => {
    return areas.some(a => a.code === code);
  };

  const AreaButton = ({ code, className = '', label, subLabel, courtSide, flipContent = false }: { code: string, className?: string, label?: string, subLabel?: string, courtSide?: 'teamA' | 'teamB' | 'neutral', flipContent?: boolean }) => {
    const isSelected = selectedAreaCode === code && (currentAction.courtSide === courtSide || (!courtSide && !currentAction.courtSide));
    const name = label || getAreaName(code);
    const thaiName = subLabel || getAreaThaiName(code);
    
    if (!hasArea(code) && !label) return null;

    return (
      <button
        onClick={() => handleSelectArea(code, courtSide)}
        data-scout-selectable="true"
        data-scout-group="area"
        data-scout-value={code}
        data-court-side={courtSide || 'neutral'}
        className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-75 ${
          isSelected 
            ? 'bg-orange-500 text-white shadow-md border-2 border-orange-600 scale-[1.02]' 
            : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border-2 border-transparent hover:bg-orange-100 dark:hover:bg-gray-700 hover:border-orange-300'
        } ${className}`}
      >
        <div className={`flex flex-col items-center justify-center w-full h-full ${flipContent && settings.flipCourtSide ? 'rotate-180 transition-transform duration-300' : 'transition-transform duration-300'}`}>
          <span className="font-bold text-sm text-center leading-tight">{name}</span>
          {thaiName && <span className={`text-[10px] mt-0.5 text-center leading-tight ${isSelected ? 'text-orange-100' : 'text-gray-500 dark:text-gray-400'}`}>{thaiName}</span>}
        </div>
      </button>
    );
  };

  // Error/Out areas outside the main court
  const errorAreas = areas.filter(a => ['OUT', 'LONG_OUT', 'SIDE_OUT', 'NET_ERR', 'UNKNOWN'].includes(a.code));

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
        
        <div className="rounded-xl border-2 border-orange-300 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-900/10 p-2 mx-auto w-full max-w-2xl relative overflow-hidden flex flex-row gap-1 items-stretch min-h-[160px]">
          
          {/* Left Court */}
          <div className="flex-1 flex flex-col relative z-10 p-1">
            <div className="text-center font-bold text-gray-500 mb-1 text-xs">{leftTeam}</div>
            <div className="grid grid-cols-2 grid-rows-3 gap-1 flex-1">
              <AreaButton code="LB" className="w-full h-full text-xs" courtSide={leftCourtSide} />
              <AreaButton code="LN" className="w-full h-full text-xs" courtSide={leftCourtSide} />
              
              <AreaButton code="CB" className="w-full h-full text-xs" courtSide={leftCourtSide} />
              <AreaButton code="CN" className="w-full h-full text-xs" courtSide={leftCourtSide} />
              
              <AreaButton code="RB" className="w-full h-full text-xs" courtSide={leftCourtSide} />
              <AreaButton code="RN" className="w-full h-full text-xs" courtSide={leftCourtSide} />
            </div>
            {/* 3m Line Left */}
            <div className="absolute top-6 bottom-1 right-1/2 w-0.5 bg-orange-300 dark:bg-orange-700/50 -z-10"></div>
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
            <div className="grid grid-cols-2 grid-rows-3 gap-1 flex-1">
              <AreaButton code="RN" className="w-full h-full text-xs" courtSide={rightCourtSide} />
              <AreaButton code="RB" className="w-full h-full text-xs" courtSide={rightCourtSide} />
              
              <AreaButton code="CN" className="w-full h-full text-xs" courtSide={rightCourtSide} />
              <AreaButton code="CB" className="w-full h-full text-xs" courtSide={rightCourtSide} />
              
              <AreaButton code="LN" className="w-full h-full text-xs" courtSide={rightCourtSide} />
              <AreaButton code="LB" className="w-full h-full text-xs" courtSide={rightCourtSide} />
            </div>
            {/* 3m Line Right */}
            <div className="absolute top-6 bottom-1 left-1/2 w-0.5 bg-orange-300 dark:bg-orange-700/50 -z-10"></div>
          </div>

          {/* Horizontal Grid lines */}
          <div className="absolute top-[33%] left-0 right-0 h-0.5 bg-orange-300 dark:bg-orange-700/50 z-0 opacity-50"></div>
          <div className="absolute top-[66%] left-0 right-0 h-0.5 bg-orange-300 dark:bg-orange-700/50 z-0 opacity-50"></div>
        </div>

        {/* Error Areas */}
        {errorAreas.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {errorAreas.map(area => (
              <button
                key={area.code}
                onClick={() => handleSelectArea(area.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedAreaCode === area.code
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400'
                }`}
              >
                {area.code} {area.thaiName && <span className="opacity-70 text-[10px] ml-1">({area.thaiName})</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Football Pitch
  if (matchInfo.sportType === 'football') {
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
        
        <div className={`rounded-xl border-2 border-green-300 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-3 max-w-sm mx-auto w-full relative overflow-hidden flex flex-col gap-1 transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
          {/* Top Goal/Box areas */}
          <div className="flex gap-2 justify-center mb-2">
            <AreaButton code="GOAL" className="w-1/3 bg-green-200 dark:bg-green-800" flipContent />
            <AreaButton code="BOX" className="w-1/3 bg-green-200 dark:bg-green-800" flipContent />
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-2">
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
          </div>
        </div>

        {/* Error Areas */}
        {errorAreas.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {errorAreas.map(area => (
              <button
                key={area.code}
                onClick={() => handleSelectArea(area.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedAreaCode === area.code
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400'
                }`}
              >
                {area.code} {area.thaiName && <span className="opacity-70 text-[10px] ml-1">({area.thaiName})</span>}
              </button>
            ))}
          </div>
        )}
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
        
        <div className={`rounded-xl border-2 border-teal-300 dark:border-teal-700/50 bg-teal-50 dark:bg-teal-900/10 p-3 max-w-sm mx-auto w-full relative overflow-hidden flex flex-col gap-1 transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
          
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

        {/* Error Areas */}
        {errorAreas.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {errorAreas.map(area => (
              <button
                key={area.code}
                onClick={() => handleSelectArea(area.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedAreaCode === area.code
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400'
                }`}
              >
                {area.code} {area.thaiName && <span className="opacity-70 text-[10px] ml-1">({area.thaiName})</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Basketball Half Court
  if (matchInfo.sportType === 'basketball') {
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
        
        <div className={`rounded-xl border-2 border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-3 max-w-sm mx-auto w-full relative overflow-hidden flex flex-col items-center transition-transform duration-300 ${settings.flipCourtSide ? 'rotate-180' : ''}`}>
          
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

        {/* Error Areas */}
        {errorAreas.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {errorAreas.map(area => (
              <button
                key={area.code}
                onClick={() => handleSelectArea(area.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedAreaCode === area.code
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400'
                }`}
              >
                {area.code} {area.thaiName && <span className="opacity-70 text-[10px] ml-1">({area.thaiName})</span>}
              </button>
            ))}
          </div>
        )}
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
