import React, { useState, useEffect } from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { formatPreciseTime } from "../../utils";
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  MoreHorizontal,
  Settings2,
  X,
  XCircle,
  FileVideo,
  Users,
  Crosshair,
  Map,
} from "lucide-react";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";
import HUDTopStatsBar from "./HUDTopStatsBar";
import HUDActionStatus from "./HUDActionStatus";
import HUDSequenceHistoryDrawer from "./HUDSequenceHistoryDrawer";
import PhoneSkillSheet from "./PhoneSkillSheet";
import PhoneAreaSheet from "./PhoneAreaSheet";
import PhoneTeamSheet from "./PhoneTeamSheet";
import PhoneVideoControls from "./PhoneVideoControls";
import PhoneLandscapeGamepadMode from "./PhoneLandscapeGamepadMode";

interface PhoneScoutModeProps {
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  isPortrait: boolean;
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

export default function PhoneScoutMode({
  onClose,
  videoControls,
  containerRef,
  isPortrait,
}: PhoneScoutModeProps) {
  const {
    settings,
    currentAction,
    currentActions,
    events,
    commitResult,
    sportTemplate,
    undoLastAction,
    clearCurrentEvent,
    saveEvent,
  } = useScoutContext();

  const layout = useHUDDeviceLayout();
  const [activeSheet, setActiveSheet] = useState<
    "none" | "team" | "skill" | "area"
  >("none");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Auto-hide controls after 3 seconds of playing if no sheets are open
  useEffect(() => {
    if (!videoControls.isPlaying) {
      setControlsVisible(true);
      return;
    }

    const timer = setTimeout(() => {
      const hasPendingSelection = Object.keys(currentAction).some(
        (k) => k !== "videoTime",
      );
      if (activeSheet === "none" && !hasPendingSelection) {
        setControlsVisible(false);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [videoControls.isPlaying, activeSheet, currentAction]);

  // When sheet opens, force controls visible
  useEffect(() => {
    if (activeSheet !== "none") {
      setControlsVisible(true);
    }
  }, [activeSheet]);

  const handleGoToTime = (time: number) => {
    videoControls.seekTo(time);
    setIsHistoryOpen(false);
    setControlsVisible(true);
  };

  const handleReplayClip = (time: number) => {
    videoControls.seekTo(time - 3);
    videoControls.play();
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

  // If landscape on a mobile device or forced experience, use Gamepad Mode
  if (layout.orientation === "landscape") {
    return (
      <PhoneLandscapeGamepadMode
        onClose={onClose}
        videoControls={videoControls}
      />
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between font-sans overflow-hidden">
      {/* Invisible overlay to restore controls visibility upon tapping any blank space */}
      {!controlsVisible && (
        <div
          className="absolute inset-0 pointer-events-auto bg-transparent z-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setControlsVisible(true);
          }}
        />
      )}

      {/* --- TOP SECTION --- */}
      <div
        className={`flex flex-col gap-1 p-2 pb-0 transition-all duration-300 z-10 ${controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-10 pointer-events-none"}`}
      >
        {settings.hudShowTopStats !== false && (
          <HUDTopStatsBar
            videoControls={videoControls}
            isFullscreen={false}
            toggleFullscreen={() => {}}
            layoutMode="auto"
            onToggleLayoutMode={() => {}}
            onOpenHistoryDrawer={() => setIsHistoryOpen(true)}
            onClose={onClose}
          />
        )}

        {settings.hudShowActionStatus !== false && (
          <div className="pointer-events-none">
            <HUDActionStatus />
          </div>
        )}
      </div>

      {/* --- RIGHT RAIL (Results) --- */}
      <div
        className={`absolute right-2 top-[15%] sm:top-[20%] flex flex-col gap-2 pointer-events-auto z-20 transition-all duration-300 ${controlsVisible ? "opacity-100" : "opacity-15"}`}
      >
        {results.map((res, idx) => {
          const bgColors = ["#0ea5e9", "#22c55e", "#6b7280", "#ef4444"];
          const bgColor = bgColors[idx % bgColors.length];
          return (
            <button
              key={res.code}
              onClick={() => {
                setControlsVisible(true);
                commitResult(res.code);
              }}
              style={{ backgroundColor: bgColor }}
              className={`w-11 h-11 sm:w-14 sm:h-14 rounded-xl shadow-lg flex items-center justify-center text-white font-bold text-xs shadow-[0_4px_12px_rgba(0,0,0,0.5)] active:scale-95 transition-all border border-white/20 ${activeSheet !== "none" ? "scale-90 opacity-70" : "scale-100"}`}
            >
              {res.code}
            </button>
          );
        })}
      </div>

      {/* --- BOTTOM SECTION --- */}
      <div className="flex flex-col gap-2 p-2 pb-[env(safe-area-inset-bottom,8px)] mt-auto bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10">
        {/* Action Buttons */}
        <div
          className={`flex flex-row justify-center gap-4 mb-2 pointer-events-auto transition-all duration-300 ${controlsVisible ? "opacity-100" : "opacity-15"}`}
        >
          <button
            onClick={() => {
              setControlsVisible(true);
              setActiveSheet("team");
            }}
            className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform ${activeSheet === "team" ? "bg-sky-600 text-white" : "bg-gray-800/90 border border-gray-600 text-gray-200"}`}
          >
            <Users size={20} className="mb-0.5" />
            <span className="text-xs font-bold tracking-wider">TEAM</span>
          </button>

          <button
            onClick={() => {
              setControlsVisible(true);
              setActiveSheet("skill");
            }}
            className={`w-16 h-16 rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform ${activeSheet === "skill" ? "bg-green-600 text-white" : "bg-gray-800/90 border border-gray-600 text-gray-200"}`}
          >
            <Crosshair size={24} className="mb-0.5" />
            <span className="text-xs font-bold tracking-wider">SKILL</span>
          </button>

          <button
            onClick={() => {
              setControlsVisible(true);
              setActiveSheet("area");
            }}
            className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform ${activeSheet === "area" ? "bg-gray-600 text-white" : "bg-gray-800/90 border border-gray-600 text-gray-200"}`}
          >
            <Map size={20} className="mb-0.5" />
            <span className="text-xs font-bold tracking-wider">AREA</span>
          </button>
        </div>

        {/* Video Controls */}
        <div
          className={`pointer-events-auto w-full max-w-md mx-auto transition-all duration-300 ${activeSheet !== "none" ? "opacity-0 translate-y-full pointer-events-none" : controlsVisible ? "opacity-100 translate-y-0" : "opacity-15"}`}
        >
          <PhoneVideoControls videoControls={videoControls} />
        </div>
      </div>

      {/* --- SHEETS --- */}
      {activeSheet === "skill" && (
        <PhoneSkillSheet onClose={() => setActiveSheet("none")} />
      )}
      {activeSheet === "area" && (
        <PhoneAreaSheet onClose={() => setActiveSheet("none")} />
      )}
      {activeSheet === "team" && (
        <PhoneTeamSheet onClose={() => setActiveSheet("none")} />
      )}

      {/* --- DRAWER --- */}
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
        onReplayClip={handleReplayClip}
        onCopyEvent={handleCopyEvent}
      />
    </div>
  );
}
