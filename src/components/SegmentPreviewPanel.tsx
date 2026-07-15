import React, { useCallback, useEffect, useRef, useState } from "react";
import { useScoutContext } from "../context/ScoutContext";
import { Play, Pause, Repeat, X, ArrowLeftToLine, Copy, Maximize2, Star, Move } from "lucide-react";
import { formatPreciseTime } from "../utils";
import { t } from "../i18n";
import { clampReplayOverlayPosition } from "../utils/replayOverlay";

interface SegmentPreviewPanelProps {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  seekTo: (time: number) => void;
  currentTime: number;
}

export default function SegmentPreviewPanel({ isPlaying, setIsPlaying, seekTo, currentTime }: SegmentPreviewPanelProps) {
  const { events, previewState, setPreviewState, settings, toggleEventBookmark, showToast } = useScoutContext();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const clampPanelPosition = useCallback((x: number, y: number) => {
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return { x, y };

    const containerRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return clampReplayOverlayPosition(
      { x, y },
      { width: containerRect.width, height: containerRect.height },
      { width: panelRect.width, height: panelRect.height },
    );
  }, []);

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return;

    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const initial = panelPosition || {
      x: panelRect.left - containerRect.left,
      y: panelRect.top - containerRect.top,
    };

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: initial.x,
      initialY: initial.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const next = clampPanelPosition(
      drag.initialX + e.clientX - drag.startX,
      drag.initialY + e.clientY - drag.startY,
    );
    setPanelPosition(next);
    e.preventDefault();
    e.stopPropagation();
  };

  const stopDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    e.preventDefault();
    e.stopPropagation();
  };

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

  useEffect(() => {
    if (!previewState?.isActive) return;
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return;

    const keepInsideViewport = () => {
      setPanelPosition(current => {
        if (!current) return current;
        const next = clampPanelPosition(current.x, current.y);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };
    const observer = new ResizeObserver(keepInsideViewport);
    observer.observe(container);
    observer.observe(panel);
    window.addEventListener('resize', keepInsideViewport);
    window.addEventListener('orientationchange', keepInsideViewport);
    keepInsideViewport();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', keepInsideViewport);
      window.removeEventListener('orientationchange', keepInsideViewport);
    };
  }, [clampPanelPosition, isCollapsed, previewState?.isActive]);

  if (!previewState?.isActive || !previewState.eventRow) return null;

  const event = events.find(e => e.id === previewState.eventRow?.id) || previewState.eventRow;
  const pStart = event.previewStartTime ?? 0;
  const pEnd = event.previewEndTime ?? (pStart + 5);
  const duration = pEnd - pStart;
  const isBookmarked = Boolean(event.isBookmarked);

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

  const handleToggleBookmark = () => {
    toggleEventBookmark(event.id);
    showToast(
      isBookmarked
        ? t('keyMoments.removedToast', settings.uiLanguage)
        : t('keyMoments.savedToast', settings.uiLanguage)
    );
  };

  if (isCollapsed) {
    return (
      <div
        ref={panelRef}
        className="absolute bottom-[72px] sm:bottom-[80px] left-4 z-[90] bg-black/90 backdrop-blur-md text-white rounded-full shadow-2xl border border-white/20 px-2.5 py-1.5 flex items-center gap-2 text-[11px] font-sans animate-in fade-in zoom-in-90 duration-200 pointer-events-auto max-w-[calc(100%-16px)]"
        style={panelPosition ? { left: panelPosition.x, top: panelPosition.y, bottom: 'auto' } : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={handleDragMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="font-mono text-amber-400 font-bold whitespace-nowrap">
          {t('keyMoments.replay', settings.uiLanguage)} #{event.no}
        </span>
        <div className="w-[1px] h-3 bg-white/20" />

        <button
          type="button"
          onPointerDown={startDrag}
          className="p-0.5 text-white/50 hover:text-sky-300 cursor-grab active:cursor-grabbing touch-none"
          title={t('keyMoments.dragReplay', settings.uiLanguage)}
          aria-label={t('keyMoments.dragReplay', settings.uiLanguage)}
        >
          <Move size={12} />
        </button>

        <button
          type="button"
          onClick={handleToggleBookmark}
          className={`transition-colors p-0.5 active:scale-90 ${isBookmarked ? "text-amber-300" : "text-white/50 hover:text-amber-300"}`}
          title={isBookmarked ? t('keyMoments.remove', settings.uiLanguage) : t('keyMoments.add', settings.uiLanguage)}
          aria-label={isBookmarked ? t('keyMoments.remove', settings.uiLanguage) : t('keyMoments.add', settings.uiLanguage)}
        >
          <Star size={12} fill={isBookmarked ? "currentColor" : "none"} />
        </button>
        
        <button 
          type="button"
          onClick={() => setIsPlaying(!isPlaying)} 
          className="hover:text-amber-300 transition-colors p-0.5 active:scale-90"
          title={isPlaying ? t('keyMoments.pause', settings.uiLanguage) : t('keyMoments.play', settings.uiLanguage)}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>

        <button 
          type="button"
          onClick={toggleLoop} 
          aria-pressed={previewState.loop}
          className={`transition-colors p-0.5 active:scale-90 ${previewState.loop ? "text-sky-400" : "text-white/50"}`}
          title={t('keyMoments.toggleLoop', settings.uiLanguage)}
        >
          <Repeat size={12} />
        </button>

        <div className="w-[1px] h-3 bg-white/20" />

        <button 
          type="button"
          onClick={() => setIsCollapsed(false)} 
          className="hover:text-sky-300 transition-colors p-0.5 active:scale-90" 
          title={t('keyMoments.expand', settings.uiLanguage)}
        >
          <Maximize2 size={12} />
        </button>

        <button 
          type="button"
          onClick={handleClose} 
          className="hover:text-red-400 transition-colors p-0.5 active:scale-90" 
          title={t('keyMoments.closeReplay', settings.uiLanguage)}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-12 left-3 sm:top-14 sm:left-4 z-[90] bg-black/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-white/20 p-3 w-[min(360px,calc(100%-24px))] max-w-sm max-h-[calc(100%-16px)] overflow-y-auto flex flex-col gap-2.5 pointer-events-auto animate-in fade-in zoom-in-95 duration-200"
      style={panelPosition ? { left: panelPosition.x, top: panelPosition.y } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={handleDragMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0 pr-2">
          <div className="text-xs text-white/70 font-mono">{t('keyMoments.replay', settings.uiLanguage)} #{event.no}</div>
          <div className="font-bold text-sm line-clamp-2 leading-tight mt-0.5">{event.eventText}</div>
          {event.thaiMeaningText && <div className="text-xs text-blue-300 mt-0.5">{event.thaiMeaningText}</div>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onPointerDown={startDrag}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors border border-white/10 text-gray-200 hover:text-sky-300 hover:bg-white/20 cursor-grab active:cursor-grabbing touch-none"
            title={t('keyMoments.dragReplay', settings.uiLanguage)}
            aria-label={t('keyMoments.dragReplay', settings.uiLanguage)}
          >
            <Move size={15} />
          </button>
          <button
            type="button"
            onClick={handleToggleBookmark}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors border border-white/10 ${
              isBookmarked
                ? "bg-amber-400/20 text-amber-300 hover:bg-amber-400/30"
                : "text-gray-200 hover:text-amber-300 hover:bg-white/20"
            }`}
            title={isBookmarked ? t('keyMoments.remove', settings.uiLanguage) : t('keyMoments.add', settings.uiLanguage)}
            aria-label={isBookmarked ? t('keyMoments.remove', settings.uiLanguage) : t('keyMoments.add', settings.uiLanguage)}
          >
            <Star size={15} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
          <button 
            type="button"
            onClick={() => setIsCollapsed(true)} 
            className="w-7 h-7 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors text-gray-200 hover:text-white border border-white/10"
            title={t('keyMoments.collapse', settings.uiLanguage)}
            aria-label={t('keyMoments.collapse', settings.uiLanguage)}
          >
            <span className="text-lg leading-none font-black">-</span>
          </button>
          <button 
            type="button"
            onClick={handleClose} 
            className="w-7 h-7 flex items-center justify-center hover:bg-red-500/25 rounded-lg transition-colors text-gray-200 hover:text-white border border-white/10"
            title={t('keyMoments.closeReplay', settings.uiLanguage)}
            aria-label={t('keyMoments.closeReplay', settings.uiLanguage)}
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
        <button type="button" onClick={handleGoToStart} className="flex-1 py-1.5 flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors" title={t('keyMoments.goToStart', settings.uiLanguage)}>
          <ArrowLeftToLine size={14} /> {t('keyMoments.start', settings.uiLanguage)}
        </button>
        <button type="button" onClick={() => setIsPlaying(!isPlaying)} className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 rounded text-xs transition-colors ${isPlaying ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" : "bg-green-500/20 text-green-300 hover:bg-green-500/30"}`}>
          {isPlaying ? <><Pause size={14} /> {t('keyMoments.pause', settings.uiLanguage)}</> : <><Play size={14} /> {t('keyMoments.play', settings.uiLanguage)}</>}
        </button>
        <button type="button" onClick={toggleLoop} aria-pressed={previewState.loop} className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 rounded text-xs transition-colors ${previewState.loop ? "bg-sky-500/30 text-sky-200" : "bg-white/10 hover:bg-white/20"}`}>
          <Repeat size={14} /> {previewState.loop ? t('keyMoments.loopOn', settings.uiLanguage) : t('keyMoments.loopOff', settings.uiLanguage)}
        </button>
        <button type="button" onClick={copyTimeRange} className="px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded transition-colors" title={t('keyMoments.copyRange', settings.uiLanguage)}>
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
}
