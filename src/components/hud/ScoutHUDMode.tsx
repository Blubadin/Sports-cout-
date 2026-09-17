import { OUT_ZONE_LABELS } from "../../sports";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useScoutContext } from "../../context/ScoutContext";
import { EventRow } from "../../types";
import { Maximize, Minimize, X, History, RotateCcw } from "lucide-react";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";
import { useProHUDMarkingController } from "../../hooks/useProHUDMarkingController";
import { useControllerHudRuntime } from "../../hooks/useControllerHudRuntime";
import {
  resolveControllerAimClientPoint,
  type ControllerHistoryCommand,
  type ControllerHudIntent,
} from "../../controller/controllerHudBridge";
import { pulseBrowserGamepad } from "../../controller/gamepadRuntime";
import type { ControllerButtonName, ControllerInputEvent, ControllerProfile } from "../../controller/types";
import {
  getHudCommandInstruction,
  getHudCommandKeyLabel,
  getHudCommandTitle,
} from "../../utils/hudCommandBindings";

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
import HUDControllerPrompts from "./HUDControllerPrompts";
import AIVideoTrackingOverlay from "./AIVideoTrackingOverlay";
import { getAreaDisplay } from "../../utils/areaHelper";
import {
  dispatchCoachCommand,
  resolveCoachInputContext,
  resolveKeyboardCoachCommand,
} from "../../utils/coachCommands";

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
    redoEventAction,
    previewState,
    getMissingActionMessage,
    toggleEventBookmark,
    showToast,
    volleyballPathStage,
    setVolleyballPathStage,
    editLastEvent,
    undoLastSavedEvent,
    quickBookmarkCurrentMoment,
  } = useScoutContext();

  const layout = useHUDDeviceLayout();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [layoutMode, setLayoutMode] = useState<
    "auto" | "portrait" | "landscape"
  >("auto");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeMenuControl, setActiveMenuControl] = useState<ControllerButtonName | undefined>();
  const [historyControllerCommand, setHistoryControllerCommand] = useState<{
    id: number;
    command: ControllerHistoryCommand;
  } | null>(null);
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
    hoveredResultDetail,
    setHoveredSkill,
    setHoveredDescriptor,
    setHoveredArea,
    setHoveredResult,
    setHoveredResultDetail,
    setHoveredFoul,
    hoveredTeam,
    hoveredFoul,
    previewSkill,
    handleKeyUp,
    handlePointerMove,
    commitActiveMarking,
    handleCoachCommand,
    cancelMarking,
    isHoldMode,
  } = useProHUDMarkingController({
    settings,
    teams,
    selectedSkill: currentAction.skillCode || null,
    updateActionField,
    commitSkillSelection,
    commitResult,
    onCloseHUD: () => {
      if (settings.advancedDetailMode && sportTemplate.id === 'volleyball' && volleyballPathStage === 'target') {
        setVolleyballPathStage('complete');
        return;
      }
      exitHUDModeSafely('escape_key');
    },
    layout,
    selectArea,
    selectFoul,
    sportTemplate,
  });

  const uiTimeoutRef = useRef<number | null>(null);
  const controllerProfileRef = useRef<ControllerProfile | null>(null);
  const historyControllerCommandIdRef = useRef(0);

  useEffect(() => {
    if (activeMenu === "none") setActiveMenuControl(undefined);
  }, [activeMenu]);

  const handleControllerSave = useCallback((controllerIndex: number) => {
    const hasCurrentAction = Object.keys(currentAction).length > 0;
    if (hasCurrentAction) {
      const missingMessage = getMissingActionMessage(currentAction);
      if (missingMessage) {
        showToast(missingMessage);
        if (settings.hudEnableHapticFeedback) void pulseBrowserGamepad(controllerIndex, 100);
        return;
      }
    }
    if (!hasCurrentAction && currentActions.length === 0) {
      showToast(settings.uiLanguage === "th" ? "ยังไม่มีเหตุการณ์ให้บันทึก" : "There is no event to save yet");
      if (settings.hudEnableHapticFeedback) void pulseBrowserGamepad(controllerIndex, 80);
      return;
    }
    saveEvent();
    if (settings.hudEnableHapticFeedback) void pulseBrowserGamepad(controllerIndex, 35);
  }, [currentAction, currentActions.length, getMissingActionMessage, saveEvent, settings.hudEnableHapticFeedback, settings.uiLanguage, showToast]);

  const handleControllerIntent = useCallback((intent: ControllerHudIntent, event: ControllerInputEvent) => {
    const controllerIndex = event.controllerIndex;
    switch (intent.type) {
      case "open-menu":
        setActiveMenuControl(intent.control);
        handleCoachCommand({ type: "openMenu", menu: intent.menu });
        if (intent.menu === "skill") setSkillMenuPhase("skill");
        return;
      case "release-menu":
        commitActiveMarking();
        setActiveMenuControl(undefined);
        if (settings.hudEnableHapticFeedback) void pulseBrowserGamepad(controllerIndex, 24);
        return;
      case "aim": {
        if (activeMenu === "none") return;
        const target = document.querySelector<HTMLElement>(`[data-controller-wheel="${activeMenu}"]`);
        if (!target) return;
        const point = resolveControllerAimClientPoint(
          target.getBoundingClientRect(),
          intent,
          controllerProfileRef.current?.calibration.neutralCancelThreshold ?? 0.28,
        );
        handlePointerMove(point.x, point.y);
        return;
      }
      case "cycle-team": {
        const teamCount = Math.min(teams.length, 2);
        if (teamCount === 0) return;
        const selectedIndex = teams.findIndex((team) => team.code === currentAction.teamCode);
        const nextIndex = intent.direction > 0
          ? (selectedIndex < 0 ? 0 : (selectedIndex + 1) % teamCount)
          : (selectedIndex < 0 ? teamCount - 1 : (selectedIndex - 1 + teamCount) % teamCount);
        if (nextIndex === 0 || nextIndex === 1) handleCoachCommand({ type: "selectTeam", teamIndex: nextIndex });
        return;
      }
      case "undo":
        undoLastAction();
        return;
      case "redo":
        redoEventAction();
        return;
      case "save-event":
        handleControllerSave(controllerIndex);
        return;
      case "toggle-history":
        cancelMarking();
        setIsHistoryOpen((value) => !value);
        return;
      case "toggle-playback":
        videoControls.togglePlay();
        return;
      case "seek-by":
        videoControls.seekBy(intent.seconds);
        return;
      case "bookmark-latest": {
        const latestEvent = events[events.length - 1];
        if (!latestEvent) {
          showToast(settings.uiLanguage === "th" ? "ยังไม่มีเหตุการณ์สำหรับบันทึกเป็น Key Moment" : "No event is available to bookmark");
          return;
        }
        toggleEventBookmark(latestEvent.id);
        if (settings.hudEnableHapticFeedback) void pulseBrowserGamepad(controllerIndex, 45);
        return;
      }
      case "exit-hud":
        void exitHUDModeSafely("controller_cancel");
        return;
      case "history-command":
        if (intent.command === "close") setIsHistoryOpen(false);
        else {
          historyControllerCommandIdRef.current += 1;
          setHistoryControllerCommand({ id: historyControllerCommandIdRef.current, command: intent.command });
        }
        return;
      case "replay-command":
        if (intent.command === "close") setPreviewState(null);
        else if (intent.command === "toggle-playback") videoControls.togglePlay();
        else if (intent.command === "toggle-loop") {
          setPreviewState((state) => state ? { ...state, loop: !state.loop } : state);
        } else if (intent.command === "seek-backward") videoControls.seekBy(-3);
        else if (intent.command === "seek-forward") videoControls.seekBy(3);
        else if (intent.command === "bookmark" && previewState?.eventRow) {
          toggleEventBookmark(previewState.eventRow.id);
        }
        return;
      case "cancel-input":
        cancelMarking();
        setActiveMenuControl(undefined);
        return;
    }
  }, [activeMenu, cancelMarking, commitActiveMarking, currentAction.teamCode, events, handleCoachCommand, handleControllerSave, handlePointerMove, previewState?.eventRow, redoEventAction, setPreviewState, settings.hudEnableHapticFeedback, settings.uiLanguage, showToast, teams, toggleEventBookmark, undoLastAction, videoControls]);

  const controllerRuntime = useControllerHudRuntime({
    enabled: settings.controllerV1Enabled === true,
    getContext: () => {
      const blockingModal = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
      if (blockingModal) return { mode: "blocking-modal", activeMenu, activeMenuControl };
      if (previewState?.isActive) return { mode: "replay", activeMenu, activeMenuControl };
      if (isHistoryOpen) return { mode: "history", activeMenu, activeMenuControl };
      if (activeMenu !== "none") return { mode: "active-wheel", activeMenu, activeMenuControl };
      return { mode: "hud-base", activeMenu, activeMenuControl };
    },
    onIntent: handleControllerIntent,
  });
  controllerProfileRef.current = controllerRuntime.profile;
  const controllerHudMode = previewState?.isActive
    ? "replay"
    : isHistoryOpen
      ? "history"
      : activeMenu !== "none"
        ? "active-wheel"
        : "hud-base";

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
  const handleKeyDownRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const handleKeyUpRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  const handleKeyDownGlobal = (e: KeyboardEvent) => {
    if (e.repeat || e.defaultPrevented) return;
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && (activeEl.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName))) return;

    const blockingModal = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
    const context = resolveCoachInputContext({
      blockingModal,
      historyReplay: isHistoryOpen,
      activeWheel: activeMenu !== "none",
      hudActive: true,
    });
    const command = resolveKeyboardCoachCommand(e, context);
    if (!command) return;

    const handled = dispatchCoachCommand(command, {
      selectTeam: (teamIndex) => handleCoachCommand({ type: 'selectTeam', teamIndex }),
      openMenu: (menu) => handleCoachCommand({ type: 'openMenu', menu }),
      saveEvent,
      undoAction: () => {
        if (currentActions.length > 0 || Object.keys(currentAction).length > 0) {
          undoLastAction();
        } else {
          undoLastSavedEvent();
        }
      },
      redoAction: redoEventAction,
      clearCurrent: clearCurrentEvent,
      cancelContext: () => {
        if (isHistoryOpen) setIsHistoryOpen(false);
        else handleCoachCommand({ type: 'cancelContext' });
      },
      toggleHistory: () => {
        cancelMarking();
        setIsHistoryOpen((prev) => !prev);
      },
      togglePlayback: videoControls.togglePlay,
      seekBy: videoControls.seekBy,
      quickBookmark: () => quickBookmarkCurrentMoment(videoControls.getCurrentTime()),
      editLastEvent,
    });
    if (handled) e.preventDefault();
  };

  handleKeyDownRef.current = handleKeyDownGlobal;
  handleKeyUpRef.current = (e: KeyboardEvent) => {
    const blockingModal = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
    if (blockingModal || isHistoryOpen) {
      cancelMarking();
      return;
    }
    handleKeyUp(e);
  };

  useEffect(() => {
    const keydownListener = (e: KeyboardEvent) => handleKeyDownRef.current?.(e);
    const keyupListener = (e: KeyboardEvent) => handleKeyUpRef.current?.(e);
    const cancelHeldCommand = () => cancelMarking();

    window.addEventListener("keydown", keydownListener);
    window.addEventListener("keyup", keyupListener);
    window.addEventListener("blur", cancelHeldCommand);
    return () => {
      window.removeEventListener("keydown", keydownListener);
      window.removeEventListener("keyup", keyupListener);
      window.removeEventListener("blur", cancelHeldCommand);
    };
  }, [cancelMarking]);

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
      handleCoachCommand({ type: 'openMenu', menu });
      if (menu === "skill") {
        setSkillMenuPhase("skill");
      }
    }
  };

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (!isTouchHoldActiveRef.current) return;
      isTouchHoldActiveRef.current = false;
      commitActiveMarking();
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("touchend", handleGlobalPointerUp);
    window.addEventListener("touchcancel", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("touchend", handleGlobalPointerUp);
      window.removeEventListener("touchcancel", handleGlobalPointerUp);
    };
  }, [commitActiveMarking]);

  const handlePointerInteraction = (
    menu: "skill" | "area" | "result" | "team" | "foul",
  ) => {
    if (isHoldMode) return;
    handleCoachCommand({ type: 'openMenu', menu });
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
      {/* AI Video Tracking Overlay (Athletes bounding boxes & AlphaPose skeletons directly over video) */}
      <AIVideoTrackingOverlay videoControls={videoControls} />

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
        {settings.advancedDetailMode && sportTemplate.id === 'volleyball' && currentAction.skillCode && (
          <div className="absolute left-3 top-3 z-[61] border border-amber-400/40 bg-slate-950/85 px-3 py-2 text-[11px] font-bold text-white shadow-lg backdrop-blur-md">
            <span className="mr-2 text-amber-300">WHERE</span>
            {volleyballPathStage === 'start'
              ? 'W: Start area'
              : volleyballPathStage === 'target'
                ? 'W: Target area · Esc: skip'
                : 'Path ready'}
          </div>
        )}
        {/* Backdrop for closing active menus by tapping outside */}
        {activeMenu !== "none" && (
          <div
            className="absolute inset-0 z-10 bg-black/35 backdrop-blur-[2px] pointer-events-auto cursor-pointer animate-fade-in"
            onClick={() => setActiveMenu("none")}
          />
        )}

        {isHoldMode && activeMenu !== "none" && (
          <div className="absolute top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
            <div className="flex items-center gap-2 rounded-full border border-sky-400/35 bg-slate-950/80 px-3 py-2 text-white shadow-[0_0_22px_rgba(14,165,233,0.22)] backdrop-blur-xl">
              <span className="rounded-full bg-sky-500/20 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-200">
                {getHudCommandTitle(activeMenu)}
              </span>
              <kbd className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs font-black text-white">
                {getHudCommandKeyLabel(activeMenu)}
              </kbd>
              <span className="hidden sm:inline text-xs font-semibold text-white/70">
                {getHudCommandInstruction(activeMenu)}
              </span>
              <span className="sm:hidden text-xs font-semibold text-white/70">
                Release to select
              </span>
            </div>
          </div>
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
                    {matchInfo.sportType === 'badminton'
                      ? (settings.uiLanguage === 'th' ? 'สนามแบดมินตัน (BADMINTON TOUCH COURT)' : 'BADMINTON TOUCH COURT')
                      : (settings.uiLanguage === 'th' ? 'พื้นที่สนาม (AREA WHEEL)' : 'AREA WHEEL')}
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs text-white/50 font-medium">
                  {matchInfo.sportType === 'badminton'
                    ? (settings.uiLanguage === 'th' ? 'กด W ค้าง เล็งเมาส์/จอย แล้วปล่อยเพื่อเลือกจุด หรือแตะบนสนาม - Esc เพื่อยกเลิก' : 'Hold W, aim with mouse/joy and release to select, or tap court - Esc to cancel')
                    : (settings.uiLanguage === 'th' ? 'กด W ค้าง เล็งจากจุดกลาง แล้วปล่อยเพื่อเลือก - Esc เพื่อยกเลิก' : 'Hold W, aim from center, release to select - Esc to cancel')}
                </div>
              </div>

              {/* Central Help indicator representing the "dead zone" start point (hidden for badminton) */}
              {matchInfo.sportType !== 'badminton' && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center backdrop-blur-sm animate-ping duration-[3s]"></div>
                  <div className="absolute w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/40 text-[9px] font-bold">
                    AIM
                  </div>
                </div>
              )}

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
                    let res = `${code} / ${label}`;
                    if (typeof payload.pointX === 'number' && typeof payload.pointY === 'number') {
                      res += ` • (${(payload.pointX * 100).toFixed(0)}%, ${(payload.pointY * 100).toFixed(0)}%)`;
                    }
                    return res;
                  })()}
                </span>
                {(hoveredArea as any)?.isIn !== undefined && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${(hoveredArea as any).isIn ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'}`}>
                    {(hoveredArea as any).isIn ? (settings?.uiLanguage === 'th' ? 'ลูกลง (IN)' : 'IN') : (settings?.uiLanguage === 'th' ? 'ลูกออก (OUT)' : 'OUT')}
                  </span>
                )}
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
              onSelectTeam={(teamCode) => {
                const teamIndex = teams.findIndex((team) => team.code === teamCode);
                if (teamIndex === 0 || teamIndex === 1) {
                  handleCoachCommand({ type: 'selectTeam', teamIndex });
                }
              }}
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
            hoveredResultDetail={hoveredResultDetail}
            onHoverDetail={setHoveredResultDetail}
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
      {settings.controllerV1Enabled && (
        <HUDControllerPrompts
          status={controllerRuntime.status}
          profile={controllerRuntime.profile}
          mode={controllerHudMode}
          language={settings.uiLanguage ?? "th"}
        />
      )}

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
        controllerCommand={historyControllerCommand}
      />
    </div>
  );
}
