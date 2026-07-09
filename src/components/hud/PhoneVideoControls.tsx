import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  MoreHorizontal,
  X,
  Settings2,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { formatPreciseTime } from "../../utils";

interface PhoneVideoControlsProps {
  videoControls: {
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seekBy: (seconds: number) => void;
    seekTo: (time: number) => void;
    setSpeed: (speed: number) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    isPlaying: boolean;
    playbackRate: number;
    videoError: string | null;
    retryVideo: () => void;
  };
}

export default function PhoneVideoControls({
  videoControls,
}: PhoneVideoControlsProps) {
  const [showMore, setShowMore] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1);
  const [currentTimeStr, setCurrentTimeStr] = useState("00:00.00");

  useEffect(() => {
    let animationFrameId: number;
    const updateProgress = () => {
      const current = videoControls.getCurrentTime();
      const dur = videoControls.getDuration();
      const safeCurrent = isNaN(current) || typeof current !== 'number' ? 0 : current;
      const safeDur = isNaN(dur) || typeof dur !== 'number' || dur <= 0 ? 1 : dur;
      setProgress(safeCurrent);
      setDuration(safeDur);
      setCurrentTimeStr(formatPreciseTime(safeCurrent));
      animationFrameId = requestAnimationFrame(updateProgress);
    };
    updateProgress();
    return () => cancelAnimationFrame(animationFrameId);
  }, [videoControls]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    videoControls.seekTo(time);
  };

  return (
    <div className="flex flex-col w-full bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 p-2 sm:p-3 overflow-hidden shadow-2xl relative">
      {/* Timeline */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs text-gray-300 font-mono w-12 text-right">
          {currentTimeStr}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={progress}
          onChange={handleSeek}
          className="flex-1 h-1 sm:h-1.5 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
        <span className="text-xs text-gray-500 font-mono w-12">
          {formatPreciseTime(duration)}
        </span>
      </div>

      {/* Main Controls */}
      <div className="flex items-center justify-between px-2">
        <button
          onClick={() => videoControls.seekBy(-3)}
          className="p-2 sm:p-3 text-white/80 hover:text-white active:scale-90 transition-all rounded-full bg-white/5"
        >
          <Rewind size={20} className="fill-current" />
          <span className="absolute text-[8px] font-bold bottom-0.5 right-1">
            -3
          </span>
        </button>

        <button
          onClick={videoControls.togglePlay}
          className="p-3 sm:p-4 bg-white text-black hover:bg-gray-200 active:scale-90 transition-all rounded-full shadow-[0_0_15px_rgba(255,255,255,0.3)]"
        >
          {videoControls.isPlaying ? (
            <Pause size={24} className="fill-current" />
          ) : (
            <Play size={24} className="fill-current ml-1" />
          )}
        </button>

        <button
          onClick={() => videoControls.seekBy(3)}
          className="p-2 sm:p-3 text-white/80 hover:text-white active:scale-90 transition-all rounded-full bg-white/5 relative"
        >
          <FastForward size={20} className="fill-current" />
          <span className="absolute text-[8px] font-bold bottom-0.5 right-1">
            +3
          </span>
        </button>

        <button
          onClick={() => setShowMore(!showMore)}
          className={`p-2 sm:p-3 rounded-full transition-all active:scale-90 ${showMore ? "bg-sky-600 text-white" : "text-gray-400 bg-white/5 hover:text-white"}`}
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* More Controls Drawer */}
      {showMore && (
        <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs text-gray-400 font-semibold tracking-wider">
              FINE SEEK
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => videoControls.seekBy(-0.1)}
                className="px-3 py-1 bg-white/10 rounded-lg text-xs font-mono active:scale-95"
              >
                -0.1s
              </button>
              <button
                onClick={() => videoControls.seekBy(-1)}
                className="px-3 py-1 bg-white/10 rounded-lg text-xs font-mono active:scale-95"
              >
                -1s
              </button>
              <button
                onClick={() => videoControls.seekBy(1)}
                className="px-3 py-1 bg-white/10 rounded-lg text-xs font-mono active:scale-95"
              >
                +1s
              </button>
              <button
                onClick={() => videoControls.seekBy(0.1)}
                className="px-3 py-1 bg-white/10 rounded-lg text-xs font-mono active:scale-95"
              >
                +0.1s
              </button>
            </div>
          </div>
          <div className="flex justify-between items-center px-1">
            <span className="text-xs text-gray-400 font-semibold tracking-wider">
              SPEED
            </span>
            <div className="flex gap-2">
              {[0.5, 1, 1.5, 2].map((speed) => (
                <button
                  key={speed}
                  onClick={() => videoControls.setSpeed(speed)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono active:scale-95 ${videoControls.playbackRate === speed ? "bg-sky-600 text-white font-bold" : "bg-white/10 text-gray-300"}`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
