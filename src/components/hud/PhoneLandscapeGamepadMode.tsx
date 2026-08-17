import React, { useState, useEffect } from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { formatPreciseTime } from "../../utils";
import { EventRow } from "../../types";
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  MoreHorizontal,
  Settings2,
  X,
  XCircle,
  RotateCcw,
  Users,
  Crosshair,
  Map,
  RotateCcw as UndoIcon,
  AlertTriangle,
} from "lucide-react";
import HUDTopStatsBar from "./HUDTopStatsBar";
import HUDActionStatus from "./HUDActionStatus";
import HUDSequenceHistoryDrawer from "./HUDSequenceHistoryDrawer";
import PhoneLandscapeTeamPicker from "./PhoneLandscapeTeamPicker";
import PhoneLandscapeSkillStrip from "./PhoneLandscapeSkillStrip";
import PhoneLandscapeAreaOverlay from "./PhoneLandscapeAreaOverlay";
import PhoneLandscapeFoulStrip from "./PhoneLandscapeFoulStrip";
import { getVolleyballGradeOptions } from "../../volleyball/volleyballSkillGrades";

interface PhoneLandscapeGamepadModeProps {
  onClose: () => void;
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

export default function PhoneLandscapeGamepadMode({
  onClose,
  videoControls,
}: PhoneLandscapeGamepadModeProps) {
  const {
    settings,
    currentAction,
    currentActions,
    events,
    commitResult,
    updateActionField,
    sportTemplate,
    undoLastAction,
    clearCurrentEvent,
    saveEvent,
    selectFoul,
    clearFoul,
    setPreviewState,
  } = useScoutContext();

  const [activeOverlay, setActiveOverlay] = useState<
    "none" | "team" | "skill" | "area" | "foul"
  >("none");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showMoreVideo, setShowMoreVideo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1);
  const [timeStr, setTimeStr] = useState("00:00.00");

  // Track progress of the video
  useEffect(() => {
    let animationFrameId: number;
    const updateProgress = () => {
      const current = videoControls.getCurrentTime();
      const dur = videoControls.getDuration();
      const safeCurrent = isNaN(current) || typeof current !== 'number' ? 0 : current;
      const safeDur = isNaN(dur) || typeof dur !== 'number' || dur <= 0 ? 1 : dur;
      setProgress(safeCurrent);
      setDuration(safeDur);
      setTimeStr(formatPreciseTime(safeCurrent));
      animationFrameId = requestAnimationFrame(updateProgress);
    };
    updateProgress();
    return () => cancelAnimationFrame(animationFrameId);
  }, [videoControls]);

  // Auto-hide controls after 3 seconds of playing if no overlays are open
  useEffect(() => {
    if (!videoControls.isPlaying) {
      setControlsVisible(true);
      return;
    }

    const timer = setTimeout(() => {
      const hasPendingSelection = Object.keys(currentAction).some(
        (k) => k !== "videoTime",
      );
      if (activeOverlay === "none" && !hasPendingSelection) {
        setControlsVisible(false);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [videoControls.isPlaying, activeOverlay, currentAction]);

  // When overlay opens, force controls visible
  useEffect(() => {
    if (activeOverlay !== "none") {
      setControlsVisible(true);
    }
  }, [activeOverlay]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    videoControls.seekTo(Number(e.target.value));
    setControlsVisible(true);
  };

  const handleGoToTime = (time: number) => {
    videoControls.seekTo(time);
    setIsHistoryOpen(false);
    setControlsVisible(true);
  };

  const handleReplaySegment = (event: EventRow) => {
    setPreviewState({ isActive: true, eventRow: event, loop: true });
    videoControls.pause();
    setIsHistoryOpen(false);
    setControlsVisible(true);
  };

  const handleCopyEvent = (event: any) => {
    const text = event.eventText || "";
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  };

  const results = sportTemplate.results || [];

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between font-sans overflow-hidden bg-transparent select-none">
      {/* Tap overlay to wake up controls */}
      {!controlsVisible && (
        <div
          className="absolute inset-0 pointer-events-auto bg-transparent z-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setControlsVisible(true);
          }}
        />
      )}

      {/* --- TOP HUD BAR --- */}
      <div
        className={`flex flex-col gap-1 p-2 pb-0 transition-all duration-300 z-20 ${controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-10 pointer-events-none"}`}
      >
        <HUDTopStatsBar
          videoControls={videoControls}
          isFullscreen={false}
          toggleFullscreen={() => {}}
          layoutMode="auto"
          onToggleLayoutMode={() => {}}
          onOpenHistoryDrawer={() => setIsHistoryOpen(true)}
          onClose={onClose}
        />

        {/* Compact action chips instead of big status bar */}
        <div className="flex justify-center mt-1">
          <HUDActionStatus />
        </div>
      </div>

      {/* --- GAMEPAD SIDE CONTROLS --- */}
      {/* Left Controller Area */}
      <div
        className={`absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-3.5 pointer-events-auto z-30 transition-all duration-300 ${controlsVisible ? "opacity-100 translate-x-0" : "opacity-15 -translate-x-2"}`}
      >
        <button
          onClick={() => setActiveOverlay("team")}
          className={`w-[58px] h-[58px] rounded-lg flex flex-col items-center justify-center border transition-all active:scale-90 ${
            activeOverlay === "team"
              ? "bg-sky-600 border-sky-400 text-white shadow-lg"
              : currentAction.teamCode
                ? "bg-sky-950/80 border-sky-500 text-sky-200"
                : "bg-gray-900/85 border-gray-700 text-gray-300"
          }`}
        >
          <Users size={20} />
          <span className="text-xs font-black tracking-widest uppercase mt-0.5">
            {currentAction.teamCode || "TEAM"}
          </span>
        </button>

        <button
          onClick={() => setActiveOverlay("area")}
          className={`w-[58px] h-[58px] rounded-lg flex flex-col items-center justify-center border transition-all active:scale-90 ${
            activeOverlay === "area"
              ? "bg-amber-600 border-amber-400 text-white shadow-lg"
              : currentAction.areaCode
                ? "bg-amber-950/80 border-amber-500 text-amber-200"
                : "bg-gray-900/85 border-gray-700 text-gray-300"
          }`}
        >
          <Map size={20} />
          <span className="text-xs font-black tracking-widest uppercase mt-0.5">
            {currentAction.areaCode || "AREA"}
          </span>
        </button>

        <button
          onClick={() => {
            undoLastAction();
            setControlsVisible(true);
          }}
          className="w-[58px] h-[38px] rounded-lg bg-gray-950/80 border border-gray-800 hover:border-gray-700 active:scale-90 text-gray-400 hover:text-white flex items-center justify-center gap-1 transition-all"
          title="Undo Last"
        >
          <UndoIcon size={14} />
          <span className="text-xs font-black">UNDO</span>
        </button>
      </div>

      {/* Right Controller Area */}
      <div
        className={`absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 pointer-events-auto z-30 transition-all duration-300 ${controlsVisible ? "opacity-100 translate-x-0" : "opacity-15 translate-x-2"}`}
      >
        {/* SKILL triggering button */}
        <button
          onClick={() => setActiveOverlay(activeOverlay === "skill" ? "none" : "skill")}
          className={`w-[58px] h-[58px] rounded-lg flex flex-col items-center justify-center border transition-all active:scale-90 ${
            activeOverlay === "skill"
              ? "bg-green-600 border-green-400 text-white shadow-lg"
              : currentAction.skillCode
                ? "bg-green-950/80 border-green-500 text-green-200"
                : "bg-gray-900/85 border-gray-700 text-gray-300"
          }`}
        >
          <Crosshair size={22} />
          <span className="text-[10px] font-black tracking-widest uppercase mt-0.5 truncate max-w-full">
            {currentAction.skillCode || "SKILL"}
          </span>
        </button>

        {/* FOUL Triggering button */}
        {sportTemplate.fouls && sportTemplate.fouls.length > 0 && (
          <button
            onClick={() => setActiveOverlay(activeOverlay === "foul" ? "none" : "foul")}
            className={`w-[58px] h-[48px] rounded-lg flex flex-col items-center justify-center border transition-all active:scale-90 ${
              activeOverlay === "foul"
                ? "bg-amber-600 border-amber-400 text-white shadow-lg"
                : currentAction.foulCode
                  ? "bg-amber-950/80 border-amber-500 text-amber-200"
                  : "bg-gray-900/85 border-gray-700 text-gray-300"
            }`}
          >
            <AlertTriangle size={18} />
            <span className="text-[10px] font-black tracking-wider uppercase mt-0.5 truncate max-w-full">
              {currentAction.foulCode || "FOUL"}
            </span>
          </button>
        )}

        {/* Dynamic Results column from current sport template */}
        <div className="flex flex-col gap-1.5 border-t border-white/5 pt-1.5">
          {results.slice(0, 3).map((res, idx) => {
            const bgColors = [
              "bg-sky-600 border-sky-500 hover:bg-sky-500",
              "bg-green-600 border-green-500 hover:bg-green-500",
              "bg-amber-600 border-amber-500 hover:bg-amber-500",
            ];
            const bgColor = bgColors[idx % bgColors.length];
            return (
              <button
                key={res.code}
                onClick={() => {
                  setControlsVisible(true);
                  commitResult(res.code);
                }}
                className={`w-[58px] h-[38px] rounded-lg text-white font-black text-xs uppercase shadow-lg active:scale-90 transition-all border ${bgColor}`}
              >
                {res.code}
              </button>
            );
          })}
          {settings.advancedDetailMode && sportTemplate.id === 'volleyball' && getVolleyballGradeOptions(currentAction.skillCode).map(option => (
            <button key={option.code} onClick={() => commitResult(option.resultCode, false, option.code)} className="min-h-[30px] w-[58px] rounded-lg border border-amber-400/40 bg-amber-950/80 px-1 text-[8px] font-black text-amber-100 active:scale-90">
              {option.code} · {option.grade}
            </button>
          ))}
        </div>
      </div>

      {/* --- BOTTOM CONTROLS DOCK --- */}
      <div
        className={`w-full mt-auto p-2 pb-[env(safe-area-inset-bottom,4px)] bg-gradient-to-t from-black/95 to-transparent transition-all duration-300 z-30 pointer-events-auto ${activeOverlay !== "none" ? "opacity-0 translate-y-full pointer-events-none" : controlsVisible ? "opacity-100 translate-y-0" : "opacity-15"}`}
      >
        <div className="max-w-[550px] mx-auto bg-gray-950/80 border border-white/10 rounded-xl px-2.5 py-1.5 shadow-2xl flex flex-col gap-1 backdrop-blur-md">
          {/* Timeline slider (extremely thin/PSP dock layout) */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-300 font-mono w-10 text-right">
              {timeStr}
            </span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={progress}
              onChange={handleSeek}
              className="flex-1 h-1 bg-white/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
            <span className="text-[9px] text-gray-400 font-mono w-10">
              {formatPreciseTime(duration)}
            </span>
          </div>

          {/* Buttons: Replay -3s, Play/Pause, Fast Forward +3s, More */}
          <div className="flex items-center justify-between px-6">
            <button
              onClick={() => {
                videoControls.seekBy(-3);
                setControlsVisible(true);
              }}
              className="p-1 text-white/70 hover:text-white active:scale-90 transition-all"
            >
              <Rewind size={16} />
            </button>

            <button
              onClick={() => {
                videoControls.togglePlay();
                setControlsVisible(true);
              }}
              className="p-1.5 bg-white text-black hover:bg-gray-200 active:scale-90 transition-all rounded-full"
            >
              {videoControls.isPlaying ? (
                <Pause size={16} />
              ) : (
                <Play size={16} className="ml-0.5" />
              )}
            </button>

            <button
              onClick={() => {
                videoControls.seekBy(3);
                setControlsVisible(true);
              }}
              className="p-1 text-white/70 hover:text-white active:scale-90 transition-all"
            >
              <FastForward size={16} />
            </button>

            <button
              onClick={() => {
                setShowMoreVideo(!showMoreVideo);
                setControlsVisible(true);
              }}
              className={`p-1 rounded-lg transition-all active:scale-90 ${showMoreVideo ? "text-sky-400" : "text-gray-400"}`}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>

          {/* More Controls Drawer (Compact format) */}
          {showMoreVideo && (
            <div className="pt-1.5 mt-1 border-t border-white/5 flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom duration-150">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 font-bold tracking-wider">
                  FINE SEEK
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => videoControls.seekBy(-0.1)}
                    className="px-1.5 py-0.5 bg-white/5 rounded-lg text-xs font-mono hover:bg-white/10"
                  >
                    -0.1s
                  </button>
                  <button
                    onClick={() => videoControls.seekBy(-1)}
                    className="px-1.5 py-0.5 bg-white/5 rounded-lg text-xs font-mono hover:bg-white/10"
                  >
                    -1s
                  </button>
                  <button
                    onClick={() => videoControls.seekBy(1)}
                    className="px-1.5 py-0.5 bg-white/5 rounded-lg text-xs font-mono hover:bg-white/10"
                  >
                    +1s
                  </button>
                  <button
                    onClick={() => videoControls.seekBy(0.1)}
                    className="px-1.5 py-0.5 bg-white/5 rounded-lg text-xs font-mono hover:bg-white/10"
                  >
                    +0.1s
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 font-bold tracking-wider">
                  SPEED
                </span>
                <div className="flex gap-1">
                  {[0.5, 1, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => videoControls.setSpeed(speed)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono ${videoControls.playbackRate === speed ? "bg-sky-600 text-white font-bold" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- FLOATING OVERLAY DIALOGS --- */}
      {activeOverlay === "team" && (
        <PhoneLandscapeTeamPicker onClose={() => setActiveOverlay("none")} />
      )}
      {activeOverlay === "skill" && (
        <PhoneLandscapeSkillStrip onClose={() => setActiveOverlay("none")} />
      )}
      {activeOverlay === "area" && (
        <PhoneLandscapeAreaOverlay onClose={() => setActiveOverlay("none")} />
      )}
      {activeOverlay === "foul" && (
        <PhoneLandscapeFoulStrip onClose={() => setActiveOverlay("none")} />
      )}

      {/* --- HISTORY DRAWER --- */}
      <HUDSequenceHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        events={events}
        currentActions={currentActions}
        currentAction={currentAction}
        onUndo={undoLastAction}
        onClearCurrent={clearCurrentEvent}
        onSaveCurrent={saveEvent}
        onGoToTime={handleGoToTime}
        onReplaySegment={handleReplaySegment}
        onCopyEvent={handleCopyEvent}
      />
    </div>
  );
}
