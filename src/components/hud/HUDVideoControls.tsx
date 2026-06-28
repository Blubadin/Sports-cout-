import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Rewind, FastForward, SkipBack, SkipForward, ChevronUp, ChevronDown, Sliders } from 'lucide-react';
import { formatPreciseTime } from '../../utils';
import { useHUDDeviceLayout } from '../../hooks/useHUDDeviceLayout';

interface Props {
  isPortrait: boolean;
  videoControls: {
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seekBy: (delta: number) => void;
    seekTo: (time: number) => void;
    setSpeed: (rate: number) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    isPlaying: boolean;
    playbackRate: number;
  };
}

export default function HUDVideoControls({ isPortrait, videoControls }: Props) {
  const { isPlaying, togglePlay, seekBy, getCurrentTime, getDuration, seekTo, playbackRate, setSpeed } = videoControls;
  const currentTime = getCurrentTime();
  const duration = getDuration();
  
  const layout = useHUDDeviceLayout();
  const [showMore, setShowMore] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const calculateSeekTime = (clientX: number) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * duration;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsScrubbing(true);
    seekTo(calculateSeekTime(e.clientX));
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isScrubbing) {
      seekTo(calculateSeekTime(e.clientX));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsScrubbing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

  const isMobile = layout.device === 'mobile';

  return (
    <div className="flex flex-col gap-1 w-full max-w-4xl mx-auto px-4 bg-black/50 backdrop-blur-md rounded-2xl p-2 border border-white/5 pb-[env(safe-area-inset-bottom)]">
      {/* Timeline with 32px hit area */}
      <div 
        ref={timelineRef}
        className="w-full flex items-center cursor-pointer relative group touch-none select-none py-2"
        style={{ minHeight: '32px' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden relative">
          <div 
            className="absolute top-0 left-0 h-full bg-sky-500 shadow-[0_0_10px_rgba(56,189,248,0.8)]"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        {/* Hover/active thumb */}
        <div 
          className="absolute w-3 h-3 bg-white rounded-full shadow border border-sky-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none -translate-x-1/2"
          style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>
      
      {/* Controls Container */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between relative">
          
          {/* Time Display */}
          <div className="text-[11px] sm:text-xs font-mono text-white/70 min-w-[70px]">
            {formatPreciseTime(currentTime)} / {formatPreciseTime(duration)}
          </div>

          {/* Controls Selection */}
          {isMobile && !showMore ? (
            /* A) Compact Mode on Mobile */
            <div className="flex items-center justify-center gap-4 flex-1">
              <button 
                onClick={() => seekBy(-3)} 
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
                title="-3s (A)"
              >
                <span className="text-[11px] font-bold px-1">-3s</span>
              </button>
              
              <button 
                onClick={togglePlay} 
                className="p-3 rounded-full bg-sky-600 hover:bg-sky-500 text-white shadow-[0_0_10px_rgba(56,189,248,0.4)] transition-all transform active:scale-95"
                title="Play/Pause (Space)"
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              
              <button 
                onClick={() => seekBy(3)} 
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
                title="+3s (D)"
              >
                <span className="text-[11px] font-bold px-1">+3s</span>
              </button>
            </div>
          ) : (
            /* B) Expanded Mode on Mobile, or Default Desktop Mode */
            <div className="flex items-center justify-center gap-1.5 sm:gap-3 flex-1 flex-wrap">
              {/* Fine back seek (-0.1s and -1s) */}
              <button 
                onClick={() => seekBy(-0.1)} 
                className="p-1 px-2 rounded-md bg-white/5 hover:bg-white/10 text-[10px] text-white/80 font-mono transition-colors"
                title="-0.1s"
              >
                -0.1s
              </button>
              <button 
                onClick={() => seekBy(-1)} 
                className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors"
                title="-1s (S)"
              >
                <SkipBack size={14} />
              </button>

              {/* Standard Seek (-3s) */}
              <button 
                onClick={() => seekBy(-3)} 
                className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="-3s (A)"
              >
                <Rewind size={16} />
              </button>
              
              {/* Main Play/Pause */}
              <button 
                onClick={togglePlay} 
                className="p-3 sm:p-3.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.4)] transition-all transform active:scale-95"
                title="Play/Pause (Space)"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              
              {/* Standard Seek (+3s) */}
              <button 
                onClick={() => seekBy(3)} 
                className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="+3s (D)"
              >
                <FastForward size={16} />
              </button>

              {/* Fine forward seek (+1s and +0.1s) */}
              <button 
                onClick={() => seekBy(1)} 
                className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors"
                title="+1s (F)"
              >
                <SkipForward size={14} />
              </button>
              <button 
                onClick={() => seekBy(0.1)} 
                className="p-1 px-2 rounded-md bg-white/5 hover:bg-white/10 text-[10px] text-white/80 font-mono transition-colors"
                title="+0.1s"
              >
                +0.1s
              </button>
            </div>
          )}

          {/* Right side controls: speed and more buttons */}
          <div className="flex items-center justify-end gap-1.5 min-w-[70px] relative">
            
            {/* Speed Toggle */}
            <button 
              onClick={() => setShowSpeed(!showSpeed)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] sm:text-xs font-mono font-bold text-white/80 transition-colors"
            >
              {playbackRate}x
            </button>

            {/* Speed Menu Popover */}
            {showSpeed && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-md border border-white/15 rounded-lg p-1 flex flex-col shadow-xl z-50 min-w-[70px]">
                {speeds.map(s => (
                  <button
                    key={s}
                    onClick={() => { setSpeed(s); setShowSpeed(false); }}
                    className={`px-3 py-1.5 text-left text-[10px] font-mono rounded transition-colors ${playbackRate === s ? 'bg-sky-600 text-white' : 'text-white/70 hover:bg-white/10'}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}

            {/* Mobile More Toggle */}
            {isMobile && (
              <button 
                onClick={() => setShowMore(!showMore)}
                className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all"
              >
                {showMore ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
