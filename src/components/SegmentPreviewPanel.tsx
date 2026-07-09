import React, { useEffect, useRef, useState } from "react";
import { useScoutContext } from "../context/ScoutContext";
import { Play, Pause, Repeat, X, ArrowLeftToLine, Copy, Minimize2, Maximize2 } from "lucide-react";
import { formatPreciseTime } from "../utils";

interface SegmentPreviewPanelProps {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  seekTo: (time: number) => void;
  currentTime: number;
}

export default function SegmentPreviewPanel({ isPlaying, setIsPlaying, seekTo, currentTime }: SegmentPreviewPanelProps) {
  const { previewState, setPreviewState, settings } = useScoutContext();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isThai = settings?.uiLanguage === "th";

  useEffect(() => {
    if (!previewState?.isActive || !previewState.eventRow) return;

    const { previewStartTime = 0, previewEndTime = 5 } = previewState.eventRow;
    const pStart = previewStartTime;
    const pEnd = Math.max(pStart + 1, previewEndTime);

    if (currentTime >= pEnd) {
      if (previewState.loop) {
        seekTo(pStart);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
    }
  }, [currentTime, previewState, seekTo, setIsPlaying]);

  useEffect(() => {
    if (previewState?.isActive && previewState.eventRow) {
      const pStart = previewState.eventRow.previewStartTime ?? 0;
      seekTo(pStart);
      setIsPlaying(true);
      // Auto-collapse in landscape mobile devices to stay out of the way by default
      if (window.innerWidth < 900 && window.innerHeight < 500) {
        setIsCollapsed(true);
      } else {
        setIsCollapsed(false);
      }
    }
  }, [previewState?.isActive, previewState?.eventRow?.id]);

  if (!previewState?.isActive || !previewState.eventRow) return null;

  const event = previewState.eventRow;
  const pStart = event.previewStartTime ?? 0;
  const pEnd = event.previewEndTime ?? (pStart + 5);
  const duration = pEnd - pStart;

  const handleClose = () => {
    setPreviewState(null);
  };

  const handleGoToStart = () => {
    seekTo(pStart);
    setIsPlaying(true);
  };

  const toggleLoop = () => {
    setPreviewState({ ...previewState, loop: !previewState.loop });
  };

  const copyTimeRange = () => {
    navigator.clipboard.writeText(`${formatPreciseTime(pStart)} - ${formatPreciseTime(pEnd)}`);
  };

  if (isCollapsed) {
    return (
      <div className="absolute bottom-[72px] sm:bottom-[80px] left-4 z-50 bg-black/90 backdrop-blur-md text-white rounded-full shadow-2xl border border-white/20 px-3 py-1.5 flex items-center gap-2 text-[11px] font-sans animate-in fade-in zoom-in-90 duration-200 pointer-events-auto">
        <span className="font-mono text-amber-400 font-bold whitespace-nowrap">
          {isThai ? `รีเพลย์ #${event.no}` : `Replay #${event.no}`}
        </span>
        <div className="w-[1px] h-3 bg-white/20" />
        
        <button 
          onClick={() => setIsPlaying(!isPlaying)} 
          className="hover:text-amber-300 transition-colors p-0.5 active:scale-90"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>

        <button 
          onClick={toggleLoop} 
          className={`transition-colors p-0.5 active:scale-90 ${previewState.loop ? "text-sky-400" : "text-white/50"}`}
          title="Toggle Loop"
        >
          <Repeat size={12} />
        </button>

        <div className="w-[1px] h-3 bg-white/20" />

        <button 
          onClick={() => setIsCollapsed(false)} 
          className="hover:text-sky-300 transition-colors p-0.5 active:scale-90" 
          title="Expand"
        >
          <Maximize2 size={12} />
        </button>

        <button 
          onClick={handleClose} 
          className="hover:text-red-400 transition-colors p-0.5 active:scale-90" 
          title="Close Replay"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md text-white rounded-xl shadow-2xl border border-white/20 p-4 w-[90%] max-w-sm flex flex-col gap-3 pointer-events-auto animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0 pr-2">
          <div className="text-xs text-white/70 font-mono">Event #{event.no}</div>
          <div className="font-bold text-sm line-clamp-2 leading-tight mt-0.5">{event.eventText}</div>
          {event.thaiMeaningText && <div className="text-xs text-blue-300 mt-0.5">{event.thaiMeaningText}</div>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            onClick={() => setIsCollapsed(true)} 
            className="p-1 hover:bg-white/20 rounded-full transition-colors text-gray-300 hover:text-white"
            title="Minimize Panel"
          >
            <Minimize2 size={15} />
          </button>
          <button 
            onClick={handleClose} 
            className="p-1 hover:bg-white/20 rounded-full transition-colors text-gray-300 hover:text-white"
            title="Close Replay"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center bg-black/40 rounded-lg p-2 text-xs font-mono">
        <div className="text-sky-300">{formatPreciseTime(pStart)}</div>
        <div className="text-white/50 text-[10px]">({duration.toFixed(1)}s)</div>
        <div className="text-sky-300">{formatPreciseTime(pEnd)}</div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-1">
        <button onClick={handleGoToStart} className="flex-1 py-1.5 flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors" title="Go to Start">
          <ArrowLeftToLine size={14} /> Start
        </button>
        <button onClick={() => setIsPlaying(!isPlaying)} className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 rounded text-xs transition-colors ${isPlaying ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" : "bg-green-500/20 text-green-300 hover:bg-green-500/30"}`}>
          {isPlaying ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
        </button>
        <button onClick={toggleLoop} className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 rounded text-xs transition-colors ${previewState.loop ? "bg-sky-500/30 text-sky-200" : "bg-white/10 hover:bg-white/20"}`}>
          <Repeat size={14} /> {previewState.loop ? "On" : "Off"}
        </button>
        <button onClick={copyTimeRange} className="px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded transition-colors" title="Copy Time Range">
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
}
