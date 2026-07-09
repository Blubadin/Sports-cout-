import { OUT_ZONE_LABELS } from "../../sports";
import React, { useState, useEffect, useRef } from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { EventRow } from "../../types";
import { Maximize, Minimize, X, History, RotateCcw } from "lucide-react";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";
import { useProHUDMarkingController } from "../../hooks/useProHUDMarkingController";

import HUDTopStatsBar from "./HUDTopStatsBar";
import HUDActionStatus from "./HUDActionStatus";
import HUDTeamSelector from "./HUDTeamSelector";
import HUDSkillRadial from "./HUDSkillRadial";
import HUDAreaSelector from "./HUDAreaSelector";
import HUDResultSelector from "./HUDResultSelector";
import HUDFoulSelector from "./HUDFoulSelector";
import HUDVideoControls from "./HUDVideoControls";
import HUDSequenceHistoryDrawer from "./HUDSequenceHistoryDrawer";
import HUDMiniCourtSelector from "./HUDMiniCourtSelector";
import ProAreaCommandPad from "./ProAreaCommandPad";
import { getAreaDisplay } from "../../utils/areaHelper";

interface ScoutHUDModeProps {
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
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
    videoError: string | null;
    retryVideo: () => void;
  };
}

export default function ScoutHUDMode({
  onClose,
  containerRef,
  isPortrait,
  videoControls,
}: ScoutHUDModeProps) {
  const {
    settings,
    currentAction,
    setCurrentAction,
    currentActions,
    setCurrentActions,
    addAction,
    saveEvent,
    undoLastAction,
    events,
    clearCurrentEvent,
    updateActionField,
    commitSkillSelection,
    teams,
    commitResult,
    sportTemplate,
    matchInfo,
    selectArea,
    selectFoul,
    setPreviewState,
  } = useScoutContext();

  const layout = useHUDDeviceLayout();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [layoutMode, setLayoutMode] = useState<
    "auto" | "portrait" | "landscape"
  >("auto");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [skillMenuPhase, setSkillMenuPhase] = useState<"skill" | "descriptor">(
    "skill",
  );

  const {
    activeMenu,
    setActiveMenu,
    pointerPosition,
    hoveredSkill,
    hoveredDescriptor,
    hoveredArea,
    hoveredResult,
    setHoveredSkill,
    setHoveredDescriptor,
    setHoveredArea,
    setHoveredResult,
    setHoveredTeam,
    setHoveredFoul,
    hoveredTeam,
    hoveredFoul,
    previewSkill,
    handleKeyDown,
    handleKeyUp,
    handlePointerMove,
    commitMarking,
    isHoldMode,
  } = useProHUDMarkingController({
    settings,
    teams,
    selectedSkill: currentAction.skillCode || null,
    updateActionField,
    commitSkillSelection,
    commitResult,
    onCloseHUD: () => exitHUDModeSafely('escape_key'),
    layout,
    selectArea,
    selectFoul,
    sportTemplate,
  });

  const uiTimeoutRef = useRef<number | null>(null);

  // Reset skill menu phase when active menu is closed/changed
  useEffect(() => {
    if (activeMenu !== "skill") {
      setSkillMenuPhase("skill");
    }
  }, [activeMenu]);

  // Calculate layout mode
  const isEffectiveLandscape =
    layoutMode === "landscape"
      ? true
      : layoutMode === "portrait"
        ? false
        : !isPortrait;

  const exitHUDModeSafely = async (reason?: string) => {
    console.log("HUD Exit safely:", reason);
    setActiveMenu("none");
    setIsHistoryOpen(false);
    setShowUI(true);
    if (uiTimeoutRef.current) {
      window.clearTimeout(uiTimeoutRef.current);
    }
    // Call onClose which will handle fullscreen and isHUDMode
    onClose();
  };

  // Handle Fullscreen & Orientation
  useEffect(() => {
    const handleFullscreenChange = async () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);

      if (isFs) {
        try {
          if (screen.orientation && "lock" in screen.orientation) {
            await (screen.orientation as any).lock("landscape");
          }
        } catch (err) {
          console.warn("Could not lock orientation:", err);
        }
      } else {
        try {
          if (screen.orientation && "unlock" in screen.orientation) {
            screen.orientation.unlock();
          }
        } catch (err) {
          console.warn("Could not unlock orientation:", err);
        }
        // Exited fullscreen by gesture or esc
        exitHUDModeSafely("fullscreen_exit");
      }
    };

    if (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    ) {
      handleFullscreenChange();
    } else {
      try {
        if (screen.orientation && "lock" in screen.orientation) {
          (screen.orientation as any).lock("landscape").catch(() => {});
        }
      } catch (e) {}
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      try {
        if (screen.orientation && "unlock" in screen.orientation) {
          screen.orientation.unlock();
        }
      } catch (e) {}
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {
        // Fallback to pseudo fullscreen is already handled by parent styling or state
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen?.().catch(() => {
        setIsFullscreen(false);
      });
    }
  };

  const handleToggleLayoutMode = () => {
    setLayoutMode((prev) => {
      if (prev === "auto") return "landscape";
      if (prev === "landscape") return "portrait";
      return "auto";
    });
  };

  // Auto Hide UI
  useEffect(() => {
    if (!settings.hudAutoHideControls) return;

    const resetTimer = () => {
      setShowUI(true);
      if (uiTimeoutRef.current !== null)
        window.clearTimeout(uiTimeoutRef.current);
      uiTimeoutRef.current = window.setTimeout(() => {
        if (
          activeMenu === "none" &&
          videoControls.isPlaying &&
          !isHistoryOpen
        ) {
          setShowUI(false);
        }
      }, 3000);
    };

    resetTimer();
    const el = containerRef.current;
    if (el) {
      el.addEventListener("mousemove", resetTimer);
      el.addEventListener("touchstart", resetTimer);
      return () => {
        el.removeEventListener("mousemove", resetTimer);
        el.removeEventListener("touchstart", resetTimer);
        if (uiTimeoutRef.current !== null)
          window.clearTimeout(uiTimeoutRef.current);
      };
    }
  }, [
    settings.hudAutoHideControls,
    activeMenu,
    videoControls.isPlaying,
    isHistoryOpen,
    containerRef,
  ]);

  // Pointer/Touch Drag Selection Tracking
  useEffect(() => {
    const handlePointerMoveEvent = (e: PointerEvent) => {
      handlePointerMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      handlePointerMove(touch.clientX, touch.clientY);
    };

    window.addEventListener("pointermove", handlePointerMoveEvent);
    window.addEventListener("touchmove", handleTouchMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMoveEvent);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [handlePointerMove]);

  // Keyboard Shortcuts
  const handleKeyDownRef = useRef<any>(null);
  const handleKeyUpRef = useRef<any>(null);

  const handleKeyDownGlobal = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const activeEl = document.activeElement;
    if (
      activeEl?.tagName === "INPUT" ||
      activeEl?.tagName === "TEXTAREA" ||
      activeEl?.tagName === "SELECT"
    )
      return;

    if (e.code === "Escape") {
      if (isHistoryOpen) {
        e.preventDefault();
        setIsHistoryOpen(false);
        return;
      }
      // Esc closes menus or HUD handled by hook
    }

    // Toggle History Drawer with 'KeyH'
    if (e.code === "KeyH") {
      e.preventDefault();
      setIsHistoryOpen((prev) => !prev);
      return;
    }

    // Handled by Pro Marking Controller hook
    handleKeyDown(e);

    // Video Controls
    if (e.code === "Space") {
      e.preventDefault();
      videoControls.togglePlay();
    }
    if (e.code === "KeyA") {
      e.preventDefault();
      videoControls.seekBy(-3);
    }
    if (e.code === "KeyD") {
      e.preventDefault();
      videoControls.seekBy(3);
    }

    // Save / Undo
    if (e.code === "Enter") {
      e.preventDefault();
      saveEvent();
    }
    if (
      e.code === "Backspace" ||
      (e.code === "KeyZ" && (e.ctrlKey || e.metaKey))
    ) {
      e.preventDefault();
      undoLastAction();
    }
  };

  handleKeyDownRef.current = handleKeyDownGlobal;
  handleKeyUpRef.current = handleKeyUp;

  useEffect(() => {
    const keydownListener = (e: KeyboardEvent) => handleKeyDownRef.current?.(e);
    const keyupListener = (e: KeyboardEvent) => handleKeyUpRef.current?.(e);

    window.addEventListener("keydown", keydownListener);
    window.addEventListener("keyup", keyupListener);
    return () => {
      window.removeEventListener("keydown", keydownListener);
      window.removeEventListener("keyup", keyupListener);
    };
  }, []);

  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchHoldActiveRef = useRef<boolean>(false);

  const handleMenuPointerDown = (
    menu: "skill" | "area" | "result" | "team" | "foul",
    e: React.PointerEvent,
  ) => {
    if (activeMenu !== "none") return;

    if (isHoldMode) {
      isTouchHoldActiveRef.current = true;
      touchStartPosRef.current = { x: e.clientX, y: e.clientY };
      setActiveMenu(menu);
      if (menu === "skill") {
        setSkillMenuPhase("skill");
      }
    }
  };

  useEffect(() => {
    const handleGlobalPointerUp = (e: any) => {
      if (!isTouchHoldActiveRef.current) return;
      isTouchHoldActiveRef.current = false;
      commitMarking(activeMenu);
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("touchend", handleGlobalPointerUp);
    window.addEventListener("touchcancel", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("touchend", handleGlobalPointerUp);
      window.removeEventListener("touchcancel", handleGlobalPointerUp);
    };
  }, [commitMarking, activeMenu]);

  const handlePointerInteraction = (
    menu: "skill" | "area" | "result" | "team" | "foul",
  ) => {
    if (isHoldMode) return;
    setActiveMenu(activeMenu === menu ? "none" : menu);
  };

  const handleCopyEvent = (event: any) => {
    const text = `[${event.videoTime ? parseFloat(event.videoTime).toFixed(2) : "0.00"}] ${event.teamCode || ""} ${event.skillCode || ""} ${event.areaCode || ""} ${event.resultText || ""}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
      } catch (e) {}
      document.body.removeChild(textArea);
    }
  };

  const handleReplaySegment = (event: EventRow) => {
    setPreviewState({ isActive: true, eventRow: event, loop: true });
    // Also pause the current video if it was playing normally, the SegmentPreviewPanel will handle playback
    videoControls.pause();
  };

  const handleGoToTime = (videoTime: number) => {
    videoControls.seekTo(videoTime);
  };

  const handleSkillDone = () => {
    setActiveMenu("none");
  };

  return (
    <div
      id="scout-hud-container"
      className={`absolute inset-0 z-50 transition-opacity duration-300 pointer-events-none flex flex-col ${showUI ? "opacity-100" : "opacity-0"} pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]`}
    >
      {/* Top Warning for Portrait screen layout */}
      {isPortrait && layoutMode === "auto" && (
        <div className="absolute top-[60px] left-1/2 -translate-x-1/2 bg-amber-500/90 text-white font-bold text-[9px] md:text-xs px-3 py-1 rounded-full pointer-events-none z-50 shadow-md backdrop-blur-sm flex items-center gap-1.5 animate-pulse">
          <span>
            แนะนำให้หมุนเครื่องเป็นแนวนอน (Rotate device for landscape)
          </span>
        </div>
      )}

      {/* Top Bar */}
      {settings.hudShowTopStats && (
        <div className="w-full pointer-events-auto p-2 sm:p-4 bg-gradient-to-b from-black/95 to-transparent">
          <HUDTopStatsBar
            videoControls={videoControls}
            onClose={() => exitHUDModeSafely('top_bar_close')}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
            layoutMode={layoutMode}
            onToggleLayoutMode={handleToggleLayoutMode}
            onOpenHistoryDrawer={() => setIsHistoryOpen(true)}
          />
        </div>
      )}

      {/* Main Grid Area */}
      <div className="flex-1 w-full flex flex-col pointer-events-none px-2 sm:px-4 md:px-8 pb-4 relative overflow-hidden justify-between">
        {/* Backdrop for closing active menus by tapping outside */}
        {activeMenu !== "none" && (
          <div
            className="absolute inset-0 z-10 bg-black/35 backdrop-blur-[2px] pointer-events-auto cursor-pointer animate-fade-in"
            onClick={() => setActiveMenu("none")}
          />
        )}

        {/* Center Action Status (Top) */}
        {settings.hudShowActionStatus && (
          <div className="w-full flex justify-center pt-2 pointer-events-none z-10">
            <HUDActionStatus />
          </div>
        )}

        {/* Pro HUD Area Command Pad Overlay (Desktop/Tablet Left-aligned Overlay) */}
        {activeMenu === "area" && layout.device !== "phone" && (
          <div className="absolute inset-0 z-50 pointer-events-none">
            <div 
              className="absolute bg-slate-950/85 backdrop-blur-xl rounded-3xl border border-amber-500/35 shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-6 flex flex-col items-center justify-center pointer-events-auto animate-scale-in overflow-y-auto"
              style={{
                left: "clamp(16px, 3vw, 48px)",
                top: "50%",
                transform: "translateY(-50%)",
                width: "clamp(360px, 32vw, 560px)",
                maxHeight: "72vh"
              }}
            >
              {/* Header */}
              <div className="w-full flex justify-between items-center mb-3 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                  <span className="text-white font-extrabold text-sm sm:text-base uppercase tracking-wider">
                    {settings.uiLanguage === 'th' ? 'พื้นที่สนาม (AREA COMMAND PAD)' : 'AREA COMMAND PAD'}
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs text-white/50 font-medium">
                  {settings.uiLanguage === 'th' ? 'ลากเมาส์ / ปล่อย Q เพื่อเลือก • Esc เพื่อยกเลิก' : 'Drag / Release Q to Select • Esc to Cancel'}
                </div>
              </div>

              {/* Central Help indicator representing the "dead zone" start point */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center backdrop-blur-sm animate-ping duration-[3s]"></div>
                <div className="absolute w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/40 text-[9px] font-bold">
                  📍
                </div>
              </div>

              {/* Interactive Mini Court Layout scaled-up for Pro Pad */}
              <div className="relative w-full flex justify-center items-center py-2">
                <ProAreaCommandPad
                  sportType={matchInfo.sportType}
                  areas={sportTemplate.areas}
                  currentAction={currentAction}
                  teams={teams}
                  onSelectArea={(payload) => {
                    selectArea(payload);
                    setActiveMenu("none");
                  }}
                  active={true}
                  pointerX={pointerPosition.x}
                  pointerY={pointerPosition.y}
                  flipCourtSide={settings.flipCourtSide || false}
                  onHoverArea={(payload) => {
                    setHoveredArea(payload);
                  }}
                  enableOutOfBoundsZones={settings.enableOutOfBoundsZones}
                  hoveredArea={hoveredArea}
                />
              </div>

              {/* Status footer displaying currently highlighted area code */}
              <div className="mt-4 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-2 text-xs">
                <span className="text-white/40">AREA:</span>
                <span className="text-amber-400 font-extrabold font-mono text-sm tracking-wider">
                  {(() => {
                    const payload = hoveredArea || null;
                    if (!payload || !payload.areaCode) return 'NONE';
                    const code = payload.areaCode;
                    const isThai = settings?.uiLanguage === 'th';
                    let label = "";
                    if (payload.outZone && OUT_ZONE_LABELS[payload.outZone]) {
                        label = isThai ? OUT_ZONE_LABELS[payload.outZone].thaiLabel : OUT_ZONE_LABELS[payload.outZone].label;
                    } else {
                        const foundArea = sportTemplate.areas.find(a => a.code === code);
                        const displayInfo = getAreaDisplay(code, isThai, foundArea?.thaiName || '');
                        label = displayInfo.sub ? `${displayInfo.main} (${displayInfo.sub})` : displayInfo.main;
                    }
                    return `${code} / ${label}`;
                  })()}
                </span>
                {hoveredArea?.courtSide && hoveredArea.courtSide !== 'neutral' && (
                  <span className="text-white/60 text-[10px] uppercase font-bold">
                    ({hoveredArea.courtSide === 'teamA' ? teams[0]?.code : teams[1]?.code})
                  </span>
                )}</div>
            </div>
          </div>
        )}

        {/* Middle / Bottom dynamic layout */}
        <div
          className={`flex-1 flex ${isEffectiveLandscape ? "flex-row items-end justify-between" : "flex-col items-center justify-end gap-4"} w-full pointer-events-none z-20 pb-4`}
        >
          {/* Left / Top Selector Area */}
          <div className="flex flex-col justify-end items-center sm:items-start pointer-events-auto">
            <HUDAreaSelector
              isActive={activeMenu === "area" && layout.device === "phone"}
              onPointerDown={(e) => handleMenuPointerDown("area", e)}
              onClick={() => handlePointerInteraction("area")}
              onClose={() => setActiveMenu("none")}
              hoveredArea={hoveredArea}
            />
          </div>

          {/* Right / Bottom Selector Area */}
          <div
            className={`flex flex-col justify-end ${isEffectiveLandscape ? "items-end" : "items-center"} gap-2 md:gap-4 pointer-events-auto`}
          >
            <div className="flex gap-2 md:gap-4 items-end">
              <HUDSkillRadial
                isActive={activeMenu === "skill"}
                onPointerDown={(e) => handleMenuPointerDown("skill", e)}
                onClick={() => handlePointerInteraction("skill")}
                onDone={handleSkillDone}
                phase={skillMenuPhase}
                onPhaseChange={setSkillMenuPhase}
                hoveredSkill={hoveredSkill}
                hoveredDescriptor={hoveredDescriptor}
                previewSkill={previewSkill}
                pointerX={pointerPosition.x}
                pointerY={pointerPosition.y}
                onHoverSkill={setHoveredSkill}
                onHoverDescriptor={setHoveredDescriptor}
              />
            </div>

            <HUDTeamSelector
              isActive={activeMenu === "team"}
              onPointerDown={(e) => handleMenuPointerDown("team", e)}
              onClick={() => handlePointerInteraction("team")}
              hoveredTeam={hoveredTeam}
            />
          </div>
        </div>

        {/* Top-Right for Foul Menu */}
        <div className="absolute right-2 sm:right-4 md:right-8 top-16 pointer-events-auto z-40">
          <HUDFoulSelector
            isActive={activeMenu === "foul"}
            onPointerDown={(e) => handleMenuPointerDown("foul", e)}
            onClick={() => handlePointerInteraction("foul")}
            hoveredFoul={hoveredFoul}
            onHover={setHoveredFoul}
            pointerX={pointerPosition.x}
            pointerY={pointerPosition.y}
          />
        </div>

        {/* Right-Center for Result Rail */}
        <div className="absolute right-2 sm:right-4 md:right-8 top-1/2 -translate-y-1/2 pointer-events-auto z-40">
          <HUDResultSelector
            isActive={activeMenu === "result"}
            onPointerDown={(e) => handleMenuPointerDown("result", e)}
            onClick={() => handlePointerInteraction("result")}
            hoveredResult={hoveredResult}
            onHover={setHoveredResult}
            pointerX={pointerPosition.x}
            pointerY={pointerPosition.y}
          />
        </div>

        {/* Video Error Overlay */}
        {videoControls.videoError && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
            <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-xl max-w-sm text-center shadow-2xl flex flex-col items-center gap-4">
              <div className="text-amber-500 bg-amber-500/10 p-3 rounded-full">
                <RotateCcw size={24} />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">
                  Video Error
                </h3>
                <p className="text-neutral-400 text-sm mb-4">
                  {videoControls.videoError}
                </p>
                <div className="flex flex-col gap-2 w-full">
                  <button
                    onClick={videoControls.retryVideo}
                    className="bg-amber-500 hover:bg-amber-600 text-white py-2 px-4 rounded-lg font-medium transition-colors w-full"
                  >
                    Try Reload
                  </button>
                  <button
                    onClick={() => {
                      // Hack to clear error from parent state to continue scouting
                      videoControls.retryVideo();
                    }}
                    className="bg-neutral-800 hover:bg-neutral-700 text-white py-2 px-4 rounded-lg font-medium transition-colors w-full border border-neutral-700"
                  >
                    Continue Scouting Without Video
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Warning if running Pro HUD on mobile */}
        {layout.device === "phone" && settings.hudExperienceMode === "pro" && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-amber-500/90 text-white px-4 py-2 rounded-xl text-xs font-bold text-center z-50 shadow-lg pointer-events-none w-[90%] max-w-sm">
            {settings.uiLanguage === "th"
              ? "Pro HUD เหมาะกับจอใหญ่ แนะนำใช้ Phone Scout Mode บนมือถือ"
              : "Pro HUD is optimized for larger screens. Consider using Phone Scout Mode."}
          </div>
        )}

        {/* Video Controls */}
        {settings.hudShowVideoControls && (
          <div className="w-full mt-auto pt-2 pointer-events-auto bg-gradient-to-t from-black/95 via-black/60 to-transparent rounded-b-xl z-30">
            <HUDVideoControls
              isPortrait={isPortrait}
              videoControls={videoControls}
            />
          </div>
        )}
      </div>

      {/* Sequence History Drawer Component */}
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
