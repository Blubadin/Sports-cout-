import React from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { Maximize, Minimize, X, Activity, RotateCcw, History } from 'lucide-react';
import { formatPreciseTime } from '../../utils';

interface Props {
  videoControls: any;
  onClose: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  layoutMode: 'auto' | 'portrait' | 'landscape';
  onToggleLayoutMode: () => void;
  onOpenHistoryDrawer: () => void;
}

export default function HUDTopStatsBar({ 
  videoControls, 
  onClose, 
  isFullscreen, 
  toggleFullscreen,
  layoutMode,
  onToggleLayoutMode,
  onOpenHistoryDrawer
}: Props) {
  const { events, currentActions, matchInfo, changeSportType } = useScoutContext();

  const totalEvents = events.length;
  const currentRallyLength = currentActions.length;
  
  // Calculate Success Rate
  let successCount = 0;
  let errorCount = 0;
  events.forEach(e => {
    if (e.resultText === '+1') successCount++;
    if (e.resultText === '-1') errorCount++;
  });
  const totalWithResult = successCount + errorCount;
  const successRate = totalWithResult > 0 ? Math.round((successCount / totalWithResult) * 100) : 0;
  
  const lastEvent = events[0];
  const lastResult = lastEvent ? (lastEvent.resultText === '+1' ? 'Yes' : lastEvent.resultText === '-1' ? 'Out' : 'Pass') : '-';

  const handleSportSwitch = () => {
    const sports: any[] = ['volleyball', 'football', 'badminton', 'basketball'];
    const idx = sports.indexOf(matchInfo.sportType);
    const nextSport = sports[(idx + 1) % sports.length];
    changeSportType(nextSport);
  };

  return (
    <div className="flex items-center justify-between text-white drop-shadow-md w-full gap-2">
      {/* Left: Stats */}
      <div className="flex items-center gap-2 text-[10px] sm:text-xs font-medium flex-1 overflow-hidden">
        <button 
          onClick={handleSportSwitch}
          className="flex items-center gap-1 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur px-2 sm:px-3 py-1.5 rounded-full border border-indigo-400 shadow-md transition-colors"
          title="Change Sport"
        >
          <span className="font-bold tracking-wider uppercase text-[9px] sm:text-[10px]">{matchInfo.sportType.substring(0, 4)}</span>
        </button>

        <div className="flex items-center gap-1 sm:gap-2 bg-black/40 backdrop-blur px-2 sm:px-3 py-1.5 rounded-full border border-white/10 whitespace-nowrap">
          <Activity size={12} className="text-sky-400 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">Events: {totalEvents}</span>
          <span className="sm:hidden">{totalEvents} Evt</span>
          <span className="text-white/30">|</span>
          <span className="hidden sm:inline">Rally: {currentRallyLength}</span>
          <span className="sm:hidden">R: {currentRallyLength}</span>
        </div>
        
        <div className="hidden md:flex items-center gap-2 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 whitespace-nowrap">
          <span className="text-green-400 font-bold">SR: {successRate}%</span>
          <span className="text-white/30">|</span>
          <span className="text-gray-300">Last: {lastResult}</span>
        </div>
      </div>

      {/* Center: Time & Speed */}
      <div className="flex flex-col items-center justify-center flex-1 pointer-events-none">
        <div className="font-mono text-sm sm:text-xl font-bold tracking-wider drop-shadow-lg text-center">
          {formatPreciseTime(videoControls.getCurrentTime())}
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 flex-1 pointer-events-auto">
        {/* Sequence History Drawer Button */}
        <button 
          onClick={onOpenHistoryDrawer}
          className="px-2.5 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 backdrop-blur transition-colors text-[10px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1 shadow-md"
          title="Open Sequence History Drawer"
        >
          <History size={12} />
          <span>SEQ</span>
        </button>

        {/* Rotate Layout Button */}
        <button 
          onClick={onToggleLayoutMode}
          className={`p-1.5 sm:p-2 rounded-full backdrop-blur transition-all flex items-center gap-1.5 text-xs font-bold ${
            layoutMode !== 'auto' 
              ? 'bg-amber-500 text-black font-extrabold hover:bg-amber-400' 
              : 'bg-black/40 text-white hover:bg-white/20'
          }`}
          title={`Layout Mode: ${layoutMode} (Click to toggle)`}
        >
          <RotateCcw size={14} className="animate-spin-slow" />
          <span className="hidden sm:inline text-[9px] uppercase">{layoutMode}</span>
        </button>

        <button 
          onClick={toggleFullscreen}
          className="p-1.5 sm:p-2 rounded-full bg-black/40 hover:bg-white/20 backdrop-blur transition-colors"
          title="Fullscreen"
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        <button 
          onClick={onClose}
          className="p-1.5 sm:p-2 rounded-full bg-red-500/80 hover:bg-red-500 backdrop-blur transition-colors shadow-lg"
          title="Exit HUD Mode (Esc)"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
