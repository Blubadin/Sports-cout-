import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { EventRow, AISuggestion } from '../../types';
import { formatPreciseTime } from '../../utils';
import {
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Edit3,
  Bookmark,
  ChevronRight,
  ChevronDown,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Repeat,
  Palette,
  Clock,
  Sparkles,
  Crosshair,
  Layers,
  Video,
  X,
  Compass,
  Check,
} from 'lucide-react';
import EditEventModal from '../EditEventModal';
import {
  calculateVisibleTimeRange,
  filterItemsInVisibleTimeRange,
  type ViewportTimeRange,
} from '../../utils/timelineOptimization';

interface TimelinePanelProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  videoSrc?: string | null;
  videoSourceType?: 'youtube' | 'local' | 'none';
  youtubeVideoId?: string | null;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onStepFrame?: (forward: boolean) => void;
  onSkipSeconds?: (seconds: number) => void;
  playbackRate?: number;
  onSetPlaybackRate?: (rate: number) => void;
}

const TRACK_COLORS = [
  { name: 'Purple (ม่วง)', value: 'bg-purple-600 border-purple-400 text-white' },
  { name: 'Cyan (ฟ้า)', value: 'bg-sky-500 border-sky-300 text-white' },
  { name: 'Pink (ชมพู)', value: 'bg-pink-600 border-pink-400 text-white' },
  { name: 'Amber (ส้มทอง)', value: 'bg-amber-500 border-amber-300 text-white' },
  { name: 'Emerald (เขียว)', value: 'bg-emerald-600 border-emerald-400 text-white' },
  { name: 'Rose (แดง)', value: 'bg-rose-600 border-rose-400 text-white' },
];

export default function TimelinePanel({
  currentTime,
  duration,
  onSeek,
  videoSrc,
  videoSourceType,
  youtubeVideoId,
  isPlaying = false,
  onTogglePlay,
  onStepFrame,
  onSkipSeconds,
  playbackRate = 1.0,
  onSetPlaybackRate,
}: TimelinePanelProps) {
  const scoutCtx = (useScoutContext() || {}) as any;
  const { activeProjectId, projects } = useWorkspace();
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const projectAnnotations = activeProject?.videoMeta?.annotations || [];
  const aiSuggestions: AISuggestion[] = (activeProject?.videoMeta as any)?.aiSuggestions || [];
  const hasAISuggestions = aiSuggestions.length > 0;

  const events: EventRow[] = scoutCtx.events || [];
  const teams = scoutCtx.teams || [];
  const updateEventRow = scoutCtx.updateEventRow || (() => {});
  const settings = scoutCtx.settings || {};
  const showToast = scoutCtx.showToast || (() => {});
  const isThai = settings?.uiLanguage === 'th';

  const [teamFilter, setTeamFilter] = useState<'all' | 't1' | 't2'>('all');
  const [resultFilter, setResultFilter] = useState<'all' | '+1' | '-1' | '0'>('all');
  const [isLooping, setIsLooping] = useState(false);

  // Zoom & Viewport Follow State
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1x, 1.5x, 2x, 3x, 4x
  const [followPlayhead, setFollowPlayhead] = useState(false);

  // Time Selection (Shift+Drag to select range, and loop selection)
  const [timeSelection, setTimeSelection] = useState<{ start: number; end: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Track collapse states for 5 standard lanes
  const [expandedTracks, setExpandedTracks] = useState<Record<string, boolean>>({
    video: true,
    sequence: true,
    events: true,
    keyMoments: true,
    aiSuggestions: true,
  });

  // Custom Color Overrides by eventId
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<{
    event: EventRow;
    x: number;
    y: number;
  } | null>(null);

  // Drag & Drop State for safe timestamp editing
  const [draggedEvent, setDraggedEvent] = useState<{
    id: string;
    originalTime: number;
    draftTime: number;
  } | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<EventRow | null>(null);
  const [editingModalEvent, setEditingModalEvent] = useState<EventRow | null>(null);

  // AI Suggestion Lane Human-in-the-Loop review (PDF §92-94)
  const [selectedAISuggestion, setSelectedAISuggestion] = useState<AISuggestion | null>(null);
  const [suggestionSkillCode, setSuggestionSkillCode] = useState<string>('SMH');

  const handleAcceptAISuggestion = (sug: AISuggestion, overrideSkill?: string) => {
    const skill = overrideSkill || suggestionSkillCode || sug.skillCode || 'SMH';
    const newEvent: EventRow = {
      id: `ai_event_${Date.now()}`,
      no: events.length > 0 ? Math.max(...events.map((e) => e.no)) + 1 : 1,
      point: events.length > 0 ? Math.max(...events.map((e) => e.point)) + 1 : 1,
      videoTime: sug.time,
      sportType: 'badminton',
      eventText: `${skill} (AI Suggestion)`,
      actions: [
        {
          id: `act_${Date.now()}`,
          teamCode: sug.teamCode || team1.code || 'teamA',
          skillCode: skill,
          resultCode: 'Yes',
          playerName: sug.playerId || 'P1',
          videoTime: sug.time,
        },
      ],
      resultText: '+1',
      createdAt: new Date().toISOString(),
    };

    if (scoutCtx.addEvent) {
      scoutCtx.addEvent(newEvent);
    } else if (updateEventRow) {
      updateEventRow(newEvent);
    }

    showToast(isThai ? `ยอมรับข้อเสนอ AI: ${skill}` : `Accepted AI Suggestion: ${skill}`);
    setSelectedAISuggestion(null);
  };

  const handleRejectAISuggestion = (sug: AISuggestion) => {
    // Record feedback for future model evaluation (PDF §93)
    console.log('[AI Feedback] Rejected suggestion:', sug);
    showToast(isThai ? 'ปฏิเสธข้อเสนอ AI' : 'Rejected AI Suggestion');
    setSelectedAISuggestion(null);
  };

  // Local video thumbnail cache
  const [thumbnails, setThumbnails] = useState<{ time: number; dataUrl: string }[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const trackCanvasRef = useRef<HTMLDivElement>(null);

  const team1 = teams?.[0] || { id: 't1', code: 'T1', name: 'Team 1' };
  const team2 = teams?.[1] || { id: 't2', code: 'T2', name: 'Team 2' };

  const safeDuration = Math.max(duration || 0, 1);

  // Toggle Track Hierarchy Expand
  const toggleTrack = (trackKey: string) => {
    setExpandedTracks((prev) => ({ ...prev, [trackKey]: !prev[trackKey] }));
  };

  // Loop Selection or End of Video Check
  useEffect(() => {
    if (!isLooping || !isPlaying) return;

    if (timeSelection) {
      const minT = Math.min(timeSelection.start, timeSelection.end);
      const maxT = Math.max(timeSelection.start, timeSelection.end);
      if (currentTime >= maxT || currentTime < minT - 0.5) {
        onSeek(minT);
      }
    } else if (safeDuration > 0 && currentTime >= safeDuration - 0.1) {
      onSeek(0);
    }
  }, [isLooping, isPlaying, currentTime, timeSelection, safeDuration, onSeek]);

  // Viewport Follow Playhead
  useEffect(() => {
    if (!followPlayhead || zoomLevel <= 1 || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const playheadRatio = safeDuration > 0 ? currentTime / safeDuration : 0;
    const playheadPx = playheadRatio * container.scrollWidth;
    const targetScrollLeft = playheadPx - container.clientWidth / 2;
    container.scrollLeft = Math.max(0, targetScrollLeft);
  }, [currentTime, followPlayhead, safeDuration, zoomLevel]);

  // Generate async thumbnails for local video
  useEffect(() => {
    if (videoSourceType !== 'local' || !videoSrc || duration <= 0) {
      setThumbnails([]);
      return;
    }

    let isMounted = true;
    const generateLocalThumbnails = async () => {
      try {
        const offscreenVideo = document.createElement('video');
        offscreenVideo.src = videoSrc;
        offscreenVideo.crossOrigin = 'anonymous';
        offscreenVideo.muted = true;
        offscreenVideo.playsInline = true;

        await new Promise((resolve) => {
          offscreenVideo.onloadedmetadata = () => resolve(true);
          offscreenVideo.onerror = () => resolve(false);
        });

        const sampleCount = 12;
        const interval = duration / (sampleCount + 1);
        const generated: { time: number; dataUrl: string }[] = [];
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 68;
        const ctx = canvas.getContext('2d');

        for (let i = 1; i <= sampleCount; i++) {
          if (!isMounted) break;
          const targetTime = i * interval;
          offscreenVideo.currentTime = targetTime;
          await new Promise((res) => {
            offscreenVideo.onseeked = () => res(true);
            setTimeout(() => res(true), 250);
          });
          if (ctx && isMounted) {
            ctx.drawImage(offscreenVideo, 0, 0, canvas.width, canvas.height);
            generated.push({ time: targetTime, dataUrl: canvas.toDataURL('image/jpeg', 0.5) });
          }
        }

        if (isMounted) {
          setThumbnails(generated);
        }
      } catch (err) {
        console.warn('Could not generate video thumbnails', err);
      }
    };

    generateLocalThumbnails();
    return () => {
      isMounted = false;
    };
  }, [videoSourceType, videoSrc, duration]);

  // Close context menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (typeof ev.videoTime !== 'number' || ev.videoTime < 0) return false;

      const teamId = ev.actions?.[0]?.teamCode || (ev.point % 2 === 1 ? 't1' : 't2');
      if (teamFilter !== 'all' && teamId !== teamFilter) return false;
      if (resultFilter !== 'all' && ev.resultText !== resultFilter) return false;

      return true;
    });
  }, [events, teamFilter, resultFilter]);

  // Key moments
  const keyMomentEvents = useMemo(() => {
    return filteredEvents.filter((ev) => ev.isBookmarked || ev.resultText === '+1' || ev.resultText === '-1');
  }, [filteredEvents]);

  // Viewport visible time range (Phase 14: Visible Viewport Range Windowing)
  const [viewportRange, setViewportRange] = useState<ViewportTimeRange | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || zoomLevel <= 1) {
      setViewportRange(null);
      return;
    }

    const updateRange = () => {
      if (!container) return;
      const range = calculateVisibleTimeRange(
        container.scrollLeft,
        container.clientWidth,
        container.scrollWidth,
        safeDuration,
        0.25,
      );
      setViewportRange(range);
    };

    updateRange();
    container.addEventListener('scroll', updateRange, { passive: true });
    window.addEventListener('resize', updateRange, { passive: true });
    return () => {
      container.removeEventListener('scroll', updateRange);
      window.removeEventListener('resize', updateRange);
    };
  }, [zoomLevel, safeDuration]);

  // Visible events for rendering performance (Phase 14)
  const eventsInVisibleRange = useMemo(() => {
    return filterItemsInVisibleTimeRange(
      filteredEvents,
      (ev) => {
        const start = ev.sequenceStartTime ?? ev.videoTime ?? 0;
        const end = ev.sequenceEndTime && ev.sequenceEndTime > start
          ? ev.sequenceEndTime
          : ev.duration && ev.duration > 0
          ? start + ev.duration
          : start + 3;
        return { start, end };
      },
      viewportRange,
      (ev) => draggedEvent?.id === ev.id,
    );
  }, [filteredEvents, viewportRange, draggedEvent]);

  const markersInVisibleRange = useMemo(() => {
    return filterItemsInVisibleTimeRange(
      filteredEvents,
      (ev) => {
        const t = ev.videoTime || 0;
        return { start: t, end: t };
      },
      viewportRange,
      (ev) => draggedEvent?.id === ev.id,
    );
  }, [filteredEvents, viewportRange, draggedEvent]);

  const keyMomentsInVisibleRange = useMemo(() => {
    return filterItemsInVisibleTimeRange(
      keyMomentEvents,
      (ev) => {
        const t = ev.videoTime || 0;
        return { start: t, end: t };
      },
      viewportRange,
      (ev) => draggedEvent?.id === ev.id,
    );
  }, [keyMomentEvents, viewportRange, draggedEvent]);

  const annotationsInVisibleRange = useMemo(() => {
    return filterItemsInVisibleTimeRange(
      projectAnnotations,
      (shape) => {
        const t = shape.timestamp || 0;
        return { start: t, end: t };
      },
      viewportRange,
    );
  }, [projectAnnotations, viewportRange]);

  const aiSuggestionsInVisibleRange = useMemo(() => {
    return filterItemsInVisibleTimeRange(
      aiSuggestions,
      (sug) => {
        const t = sug.time || 0;
        const d = sug.duration || 0;
        return { start: t, end: t + d };
      },
      viewportRange,
    );
  }, [aiSuggestions, viewportRange]);

  // Drag handlers for Marker / Clip
  const handleMarkerMouseDown = (e: React.MouseEvent, ev: EventRow) => {
    e.stopPropagation();
    setDraggedEvent({
      id: ev.id,
      originalTime: ev.videoTime || 0,
      draftTime: ev.videoTime || 0,
    });
  };

  // Track Mouse Down (Click to seek OR Shift+Drag to select time)
  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackCanvasRef.current) return;
    const rect = trackCanvasRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = clickX / rect.width;
    const targetTime = Math.max(0, Math.min(percent * safeDuration, safeDuration));

    if (e.shiftKey) {
      setIsSelecting(true);
      setTimeSelection({ start: targetTime, end: targetTime });
    } else {
      onSeek(targetTime);
    }
  };

  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackCanvasRef.current) return;
      const rect = trackCanvasRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percent = clickX / rect.width;
      const hoverTime = Math.max(0, Math.min(percent * safeDuration, safeDuration));

      if (isSelecting && timeSelection) {
        setTimeSelection((prev) => (prev ? { ...prev, end: hoverTime } : null));
      } else if (draggedEvent) {
        setDraggedEvent((prev) => (prev ? { ...prev, draftTime: Number(hoverTime.toFixed(2)) } : null));
      }
    },
    [isSelecting, timeSelection, draggedEvent, safeDuration]
  );

  const handleTrackMouseUp = useCallback(() => {
    if (isSelecting) {
      setIsSelecting(false);
      if (timeSelection && Math.abs(timeSelection.start - timeSelection.end) < 0.2) {
        setTimeSelection(null);
      }
    }

    if (draggedEvent) {
      const targetEventId = draggedEvent.id;
      const previousTime = draggedEvent.originalTime;
      const finalTime = draggedEvent.draftTime;

      if (Math.abs(previousTime - finalTime) > 0.05) {
        updateEventRow(targetEventId, { videoTime: finalTime, sequenceStartTime: finalTime });
        showToast(
          isThai
            ? `ปรับเวลา Event เป็น ${formatPreciseTime(finalTime)} แล้ว`
            : `Updated event time to ${formatPreciseTime(finalTime)}`
        );
      }
      setDraggedEvent(null);
    }
  }, [isSelecting, timeSelection, draggedEvent, isThai, showToast, updateEventRow]);

  const getMarkerColor = (ev: EventRow, defaultFallback: string) => {
    if (customColors[ev.id]) {
      return customColors[ev.id];
    }
    if (ev.resultText === '+1') return 'bg-emerald-500 hover:bg-emerald-400 border-emerald-300 text-white';
    if (ev.resultText === '-1') return 'bg-rose-500 hover:bg-rose-400 border-rose-300 text-white';
    return defaultFallback;
  };

  // Generate ruler tick intervals dynamically based on zoomLevel
  const rulerTicks = useMemo(() => {
    const ticks: { time: number; label: string; pct: number }[] = [];
    const count = Math.round(10 * zoomLevel);
    for (let i = 0; i <= count; i++) {
      const t = (i / count) * safeDuration;
      ticks.push({
        time: t,
        label: formatPreciseTime(t),
        pct: (i / count) * 100,
      });
    }
    return ticks;
  }, [safeDuration, zoomLevel]);

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomLevel((prev) => {
      if (prev < 1.5) return 1.5;
      if (prev < 2) return 2;
      if (prev < 3) return 3;
      return 4;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      if (prev > 3) return 3;
      if (prev > 2) return 2;
      if (prev > 1.5) return 1.5;
      return 1;
    });
  };

  const handleFit = () => {
    setZoomLevel(1);
    setFollowPlayhead(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
    }
  };

  // Selection boundaries for overlay
  const selectionBounds = useMemo(() => {
    if (!timeSelection) return null;
    const minT = Math.min(timeSelection.start, timeSelection.end);
    const maxT = Math.max(timeSelection.start, timeSelection.end);
    const leftPct = (minT / safeDuration) * 100;
    const widthPct = Math.max(0.2, ((maxT - minT) / safeDuration) * 100);
    return { minT, maxT, leftPct, widthPct };
  }, [timeSelection, safeDuration]);

  return (
    <div
      className="bg-[#0c1721] text-gray-100 rounded-2xl border border-[#263642] p-3 shadow-2xl select-none space-y-2.5 font-sans"
      onMouseMove={handleTrackMouseMove}
      onMouseUp={handleTrackMouseUp}
    >
      {/* 1. TOP TRANSPORT CONTROL & TIMELINE TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[#263642] pb-2">
        {/* Left: Transport Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-600/20 text-sky-400 border border-sky-500/40 rounded-lg font-black text-xs shrink-0">
            <Clock size={13} />
            <span>Timeline 2.0</span>
          </div>

          <span className="w-px h-4 bg-[#263642]" />

          {/* Transport Controls */}
          <div className="flex items-center gap-1 bg-[#111c26] border border-[#263642] rounded-xl p-1 shadow-inner shrink-0">
            {/* Step -1 Frame */}
            <button
              type="button"
              onClick={() => onStepFrame?.(false)}
              className="p-1.5 hover:bg-[#1f3142] text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isThai ? 'ถอย 1 เฟรม' : 'Step Back 1 Frame'}
            >
              <StepBack size={14} />
            </button>

            {/* Skip -3s */}
            <button
              type="button"
              onClick={() => onSkipSeconds?.(-3)}
              className="p-1.5 hover:bg-[#1f3142] text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isThai ? 'ย้อน 3 วินาที' : 'Skip Back 3s'}
            >
              <SkipBack size={14} />
            </button>

            {/* Master Play / Pause */}
            <button
              type="button"
              onClick={onTogglePlay}
              className={`px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-gray-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} className="fill-white" />}
              <span className="text-[11px] uppercase tracking-wider font-extrabold">{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            {/* Skip +3s */}
            <button
              type="button"
              onClick={() => onSkipSeconds?.(3)}
              className="p-1.5 hover:bg-[#1f3142] text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isThai ? 'ไปข้างหน้า 3 วินาที' : 'Skip Forward 3s'}
            >
              <SkipForward size={14} />
            </button>

            {/* Step +1 Frame */}
            <button
              type="button"
              onClick={() => onStepFrame?.(true)}
              className="p-1.5 hover:bg-[#1f3142] text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isThai ? 'เดินหน้า 1 เฟรม' : 'Step Forward 1 Frame'}
            >
              <StepForward size={14} />
            </button>

            {/* Loop Toggle */}
            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold ${
                isLooping
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-gray-400 hover:bg-[#1f3142] hover:text-gray-200'
              }`}
              title={timeSelection ? 'Loop Selected Range' : 'Loop Entire Video'}
            >
              <Repeat size={13} />
              <span>{isLooping ? (timeSelection ? 'Loop Selection' : 'Loop') : 'Loop'}</span>
            </button>

            {/* Speed Multiplier Dropdown */}
            {onSetPlaybackRate && (
              <select
                value={playbackRate}
                onChange={(e) => onSetPlaybackRate(Number(e.target.value))}
                className="bg-[#182635] text-sky-400 font-mono text-[11px] font-bold px-2 py-1 rounded-lg border border-[#263642] focus:outline-none cursor-pointer"
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={1.0}>1.0x</option>
                <option value={1.5}>1.5x</option>
                <option value={2.0}>2.0x</option>
              </select>
            )}
          </div>

          {/* Time Selection Indicator */}
          {selectionBounds && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-sky-950/60 border border-sky-500/40 rounded-lg text-sky-300 font-mono text-[10px]">
              <span>
                Selection: {formatPreciseTime(selectionBounds.minT)} - {formatPreciseTime(selectionBounds.maxT)} (
                {(selectionBounds.maxT - selectionBounds.minT).toFixed(2)}s)
              </span>
              <button
                type="button"
                onClick={() => setTimeSelection(null)}
                className="hover:text-white p-0.5"
                title="Clear selection"
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Right: Quick Filter, Timecode, and Real Scaling Zoom Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Filters */}
          <div className="flex bg-[#111c26] border border-[#263642] rounded-lg p-0.5 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => setTeamFilter('all')}
              className={`px-2 py-0.5 rounded ${teamFilter === 'all' ? 'bg-sky-600 text-white' : 'text-gray-400'}`}
            >
              {isThai ? 'ทุกทีม' : 'All'}
            </button>
            <button
              type="button"
              onClick={() => setTeamFilter('t1')}
              className={`px-2 py-0.5 rounded ${teamFilter === 't1' ? 'bg-sky-600 text-white' : 'text-gray-400'}`}
            >
              {team1.code}
            </button>
            <button
              type="button"
              onClick={() => setTeamFilter('t2')}
              className={`px-2 py-0.5 rounded ${teamFilter === 't2' ? 'bg-amber-600 text-white' : 'text-gray-400'}`}
            >
              {team2.code}
            </button>
          </div>

          {/* Timecode Box */}
          <div className="font-mono text-xs text-sky-400 font-black bg-[#111c26] border border-[#263642] px-2.5 py-1 rounded-lg">
            {formatPreciseTime(currentTime)} <span className="text-gray-600">/</span>{' '}
            <span className="text-gray-400">{formatPreciseTime(safeDuration)}</span>
          </div>

          {/* Zoom & Viewport Controls (Fit, Follow, In, Out) */}
          <div className="flex items-center gap-1 bg-[#111c26] border border-[#263642] rounded-lg p-0.5 text-[10px] font-bold">
            {/* Fit Viewport Button */}
            <button
              type="button"
              onClick={handleFit}
              className={`px-1.5 py-1 rounded transition-colors cursor-pointer ${
                zoomLevel === 1 ? 'bg-[#1f3142] text-sky-400' : 'text-gray-400 hover:text-white'
              }`}
              title="Fit to entire video (1x)"
            >
              Fit
            </button>

            {/* Follow Playhead Toggle */}
            <button
              type="button"
              onClick={() => setFollowPlayhead(!followPlayhead)}
              className={`px-1.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
                followPlayhead
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
              title={followPlayhead ? 'Follow playhead enabled' : 'Toggle follow playhead'}
            >
              <Compass size={11} className={followPlayhead ? 'animate-spin' : ''} />
              <span>Follow</span>
            </button>

            <span className="w-px h-3 bg-[#263642]" />

            {/* Zoom Out */}
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              className="p-1 text-gray-400 hover:text-gray-100 disabled:opacity-30 cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut size={12} />
            </button>

            {/* Zoom Badge */}
            <span className="font-mono px-1 text-sky-300 font-bold">{zoomLevel}x</span>

            {/* Zoom In */}
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 4}
              className="p-1 text-gray-400 hover:text-gray-100 disabled:opacity-30 cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. MULTI-LANE TRACK SYSTEM (5 Standard Lanes: VIDEO, RALLY / SEQUENCE, EVENTS, KEY MOMENTS, AI SUGGESTIONS) */}
      <div className="grid grid-cols-12 gap-0 bg-[#070e14] rounded-xl border border-[#263642] overflow-hidden">
        {/* Left: Track Sidebar (Lane Titles & Expand Toggles) */}
        <div className="col-span-3 sm:col-span-2 bg-[#0d1722] border-r border-[#263642] flex flex-col justify-between py-1 text-xs">
          {/* Header Track Item */}
          <div className="h-6 px-2.5 flex items-center justify-between border-b border-[#263642] text-[10px] font-black uppercase text-gray-400">
            <span>Lane / Track</span>
            <span>Items</span>
          </div>

          {/* Lane 1: VIDEO Track Node */}
          <div
            className="h-10 px-2.5 flex items-center justify-between border-b border-[#263642]/60 hover:bg-[#132332] transition-colors cursor-pointer"
            onClick={() => toggleTrack('video')}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expandedTracks.video ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Video size={13} className="text-sky-400 shrink-0" />
              <span className="font-bold text-[11px] text-gray-200 truncate">VIDEO</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-gray-400">{thumbnails.length || '1'}</span>
          </div>

          {/* Lane 2: RALLY / SEQUENCE Node */}
          <div
            className="h-10 px-2.5 flex items-center justify-between border-b border-[#263642]/60 hover:bg-[#132332] transition-colors cursor-pointer"
            onClick={() => toggleTrack('sequence')}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expandedTracks.sequence ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Layers size={13} className="text-amber-400 shrink-0" />
              <span className="font-bold text-[11px] text-amber-300 truncate">RALLY / SEQ</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-gray-400">{filteredEvents.length}</span>
          </div>

          {/* Lane 3: EVENTS Node */}
          <div
            className="h-10 px-2.5 flex items-center justify-between border-b border-[#263642]/60 hover:bg-[#132332] transition-colors cursor-pointer"
            onClick={() => toggleTrack('events')}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expandedTracks.events ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Crosshair size={13} className="text-sky-400 shrink-0" />
              <span className="font-bold text-[11px] text-sky-300 truncate">EVENTS</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-gray-400">{filteredEvents.length}</span>
          </div>

          {/* Lane 4: KEY MOMENTS & NOTES Node */}
          <div
            className="h-10 px-2.5 flex items-center justify-between border-b border-[#263642]/60 hover:bg-[#132332] transition-colors cursor-pointer"
            onClick={() => toggleTrack('keyMoments')}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expandedTracks.keyMoments ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Bookmark size={13} className="text-purple-400 shrink-0" />
              <span className="font-bold text-[11px] text-purple-300 truncate">KEY MOMENTS</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-gray-400">
              {keyMomentEvents.length + projectAnnotations.length}
            </span>
          </div>

          {/* Lane 5: AI SUGGESTIONS (Rendered ONLY when AI suggestions exist!) */}
          {hasAISuggestions && (
            <div
              className="h-10 px-2.5 flex items-center justify-between hover:bg-[#132332] transition-colors cursor-pointer"
              onClick={() => toggleTrack('aiSuggestions')}
            >
              <div className="flex items-center gap-1.5 truncate">
                {expandedTracks.aiSuggestions ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Sparkles size={13} className="text-violet-400 shrink-0" />
                <span className="font-bold text-[11px] text-violet-300 truncate">AI SUGGESTIONS</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-violet-400">{aiSuggestions.length}</span>
            </div>
          )}
        </div>

        {/* Right: Scrollable Timeline Canvas with Scaling */}
        <div
          ref={scrollContainerRef}
          className="col-span-9 sm:col-span-10 relative bg-[#09121a] overflow-x-auto custom-scrollbar group"
        >
          {/* Inner Zoomed Canvas Container */}
          <div
            ref={trackCanvasRef}
            onMouseDown={handleTrackMouseDown}
            style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}
            className="relative cursor-pointer select-none flex flex-col justify-between"
          >
            {/* Time Ruler with Dynamic Zoom Ticks */}
            <div className="h-6 border-b border-[#263642] bg-[#0c1721] relative flex items-center text-[9px] font-mono text-gray-400 select-none">
              {rulerTicks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 flex flex-col justify-between border-l border-[#263642]/80 pl-1 pointer-events-none"
                  style={{ left: `${tick.pct}%` }}
                >
                  <span>{tick.label}</span>
                  <span className="w-px h-1.5 bg-[#263642]" />
                </div>
              ))}
            </div>

            {/* Shift+Drag Time Selection Range Overlay (Across All Lanes) */}
            {selectionBounds && (
              <div
                className="absolute top-0 bottom-0 bg-sky-500/20 border-x-2 border-sky-400 z-25 pointer-events-none transition-all shadow-[0_0_15px_rgba(56,189,248,0.2)]"
                style={{
                  left: `${selectionBounds.leftPct}%`,
                  width: `${selectionBounds.widthPct}%`,
                }}
              >
                <div className="absolute top-1 left-1 bg-sky-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                  {(selectionBounds.maxT - selectionBounds.minT).toFixed(2)}s
                </div>
              </div>
            )}

            {/* Playhead Needle (Yellow signature vertical bar) */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)] z-40 pointer-events-none transition-[left] duration-75 ease-out"
              style={{
                left: `${safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0}%`,
              }}
            >
              {/* Playhead Flag Cursor */}
              <div className="w-3.5 h-3.5 bg-amber-400 rotate-45 -ml-1.5 -mt-1 shadow-lg border border-amber-200 flex items-center justify-center">
                <span className="w-1 h-1 rounded-full bg-gray-900" />
              </div>
            </div>

            {/* Dragging Tooltip Indicator */}
            {draggedEvent && (
              <div
                className="absolute top-1 transform -translate-x-1/2 z-50 bg-sky-500 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded shadow-xl pointer-events-none flex items-center gap-1"
                style={{
                  left: `${(draggedEvent.draftTime / safeDuration) * 100}%`,
                }}
              >
                <span>{formatPreciseTime(draggedEvent.draftTime)}</span>
              </div>
            )}

            {/* LANE 1: VIDEO (Thumbnails or Progress Strip) */}
            <div className="relative h-10 border-b border-[#263642]/60 flex items-center z-20 px-1 bg-[#09141e]/50">
              {thumbnails.length > 0 ? (
                thumbnails.map((th, idx) => (
                  <div
                    key={idx}
                    className="absolute top-1 bottom-1 rounded border border-[#263642] overflow-hidden opacity-80 hover:opacity-100 transition-opacity"
                    style={{
                      left: `${(th.time / safeDuration) * 100}%`,
                      width: '60px',
                    }}
                  >
                    <img src={th.dataUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                ))
              ) : (
                <div className="w-full h-2 bg-[#122232] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-600 to-amber-500 opacity-60"
                    style={{ width: `${(currentTime / safeDuration) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* LANE 2: RALLY / SEQUENCE (Range blocks based on sequenceStartTime / sequenceEndTime) */}
            <div className="relative h-10 border-b border-[#263642]/60 flex items-center z-20 px-1 bg-[#071018]">
              {eventsInVisibleRange.map((ev) => {
                const isDraggingThis = draggedEvent?.id === ev.id;
                const seqStart = isDraggingThis ? draggedEvent.draftTime : ev.sequenceStartTime ?? ev.videoTime ?? 0;
                const seqEnd =
                  ev.sequenceEndTime && ev.sequenceEndTime > seqStart
                    ? ev.sequenceEndTime
                    : ev.duration && ev.duration > 0
                    ? seqStart + ev.duration
                    : seqStart + 3;

                const leftPct = (seqStart / safeDuration) * 100;
                const widthPct = Math.max(0.4, ((seqEnd - seqStart) / safeDuration) * 100);
                const seqDurationSec = Math.max(0, seqEnd - seqStart);

                const outcomeBg =
                  ev.resultText === '+1'
                    ? 'bg-emerald-700/80 border-emerald-500 text-white'
                    : ev.resultText === '-1'
                    ? 'bg-rose-700/80 border-rose-500 text-white'
                    : 'bg-slate-700/80 border-slate-500 text-gray-200';

                return (
                  <div
                    key={`seq-${ev.id}`}
                    onMouseDown={(e) => handleMarkerMouseDown(e, ev)}
                    onMouseEnter={() => setHoveredEvent(ev)}
                    onMouseLeave={() => setHoveredEvent(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(seqStart);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingModalEvent(ev);
                    }}
                    title={`Rally Pt #${ev.point}: ${formatPreciseTime(seqStart)} - ${formatPreciseTime(seqEnd)} (${seqDurationSec.toFixed(1)}s)`}
                    className={`absolute h-6 px-1.5 rounded-md border shadow-sm cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] hover:z-30 flex items-center gap-1 text-[9px] font-black truncate ${outcomeBg}`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      minWidth: '24px',
                    }}
                  >
                    <span className="opacity-90 shrink-0">Pt #{ev.point}</span>
                    {widthPct > 2 && (
                      <span className="opacity-75 text-[8px] font-mono truncate">
                        {seqDurationSec.toFixed(1)}s
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* LANE 3: EVENTS (Individual scout markers & touches, colored by team/result) */}
            <div className="relative h-10 border-b border-[#263642]/60 flex items-center z-20 px-1">
              {markersInVisibleRange.map((ev) => {
                const isDraggingThis = draggedEvent?.id === ev.id;
                const evTime = isDraggingThis ? draggedEvent.draftTime : ev.videoTime || 0;
                const leftPct = (evTime / safeDuration) * 100;
                const defaultFallback =
                  ev.actions?.[0]?.teamCode === 't2' || ev.actions?.[0]?.teamCode === team2.code
                    ? 'bg-amber-600 border-amber-400 text-white'
                    : 'bg-sky-600 border-sky-400 text-white';
                const colorClass = getMarkerColor(ev, defaultFallback);

                return (
                  <div
                    key={`ev-${ev.id}`}
                    onMouseDown={(e) => handleMarkerMouseDown(e, ev)}
                    onMouseEnter={() => setHoveredEvent(ev)}
                    onMouseLeave={() => setHoveredEvent(null)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ event: ev, x: e.clientX, y: e.clientY });
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(ev.videoTime || 0);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingModalEvent(ev);
                    }}
                    title={`Pt #${ev.point}: ${ev.actions?.[0]?.skillCode || 'Event'} (${formatPreciseTime(evTime)})`}
                    className={`absolute h-6 px-2 rounded-md border shadow-md cursor-grab active:cursor-grabbing transform -translate-x-1/2 transition-all hover:scale-105 hover:z-30 flex items-center gap-1 text-[9px] font-black ${colorClass}`}
                    style={{ left: `${leftPct}%` }}
                  >
                    <span className="opacity-80">#{ev.point}</span>
                    <span className="truncate max-w-[50px]">{ev.actions?.[0]?.skillCode || 'Act'}</span>
                  </div>
                );
              })}
            </div>

            {/* LANE 4: KEY MOMENTS & NOTES (Bookmarks and Telestration annotations) */}
            <div className="relative h-10 border-b border-[#263642]/60 flex items-center z-20 px-1 bg-[#09141d]/40">
              {/* Bookmarked Events */}
              {keyMomentsInVisibleRange.map((ev) => {
                const evTime = ev.videoTime || 0;
                const leftPct = (evTime / safeDuration) * 100;

                return (
                  <div
                    key={`km-${ev.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(evTime);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingModalEvent(ev);
                    }}
                    title={`Bookmark Pt #${ev.point} (${formatPreciseTime(evTime)})`}
                    className="absolute h-6 px-2 rounded-md border bg-purple-600 border-purple-400 text-white shadow-md cursor-pointer transform -translate-x-1/2 transition-all hover:scale-105 hover:z-30 flex items-center gap-1 text-[9px] font-black"
                    style={{ left: `${leftPct}%` }}
                  >
                    <Bookmark size={10} className="fill-white" />
                    <span>Pt #{ev.point}</span>
                  </div>
                );
              })}

              {/* Telestration Shapes */}
              {annotationsInVisibleRange.map((shape) => {
                const shapeTime = shape.timestamp || 0;
                const leftPct = (shapeTime / safeDuration) * 100;

                return (
                  <div
                    key={`anno-${shape.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(shapeTime);
                    }}
                    title={`${shape.label || shape.type} @ ${formatPreciseTime(shapeTime)}`}
                    className="absolute h-6 px-2 rounded-md border shadow-md cursor-pointer transform -translate-x-1/2 transition-all hover:scale-110 hover:z-30 flex items-center gap-1 text-[9px] font-black text-white"
                    style={{
                      left: `${leftPct}%`,
                      backgroundColor: `${shape.color}cc`,
                      borderColor: shape.color,
                      maxWidth: '130px',
                    }}
                  >
                    <span className="truncate">{shape.text ? `📝 ${shape.text}` : `🎨 ${shape.type.toUpperCase()}`}</span>
                  </div>
                );
              })}
            </div>

            {/* LANE 5: AI SUGGESTIONS (Rendered ONLY when AI suggestions exist!) */}
            {hasAISuggestions && (
              <div className="relative h-10 flex items-center z-20 px-1 bg-[#150e24]/40">
                {aiSuggestionsInVisibleRange.map((sug) => {
                  const sugTime = sug.time || 0;
                  const leftPct = (sugTime / safeDuration) * 100;
                  const widthPct = sug.duration ? Math.max(0.4, (sug.duration / safeDuration) * 100) : 1;

                  return (
                    <div
                      key={`ai-${sug.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(sugTime);
                        setSelectedAISuggestion(sug);
                        setSuggestionSkillCode(sug.skillCode || 'SMH');
                      }}
                      title={`AI: ${sug.label} (${(sug.confidence ? (sug.confidence * 100).toFixed(0) : '90')}% conf) - Click to review`}
                      className="absolute h-6 px-2 rounded-md border bg-violet-700/80 border-violet-400 text-violet-100 shadow-md cursor-pointer transform -translate-x-1/2 transition-all hover:scale-105 hover:z-30 flex items-center gap-1 text-[9px] font-black"
                      style={{
                        left: `${leftPct}%`,
                        width: sug.duration ? `${widthPct}%` : undefined,
                      }}
                    >
                      <Sparkles size={10} className="text-violet-300 shrink-0" />
                      <span className="truncate">{sug.label}</span>
                      {sug.confidence && (
                        <span className="opacity-75 font-mono text-[8px]">
                          {(sug.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. CONTEXT MENU FOR OVERRIDE COLOR & QUICK ACTIONS */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#111c26] border border-[#263642] rounded-xl shadow-2xl p-1.5 w-48 text-xs font-sans animate-in fade-in zoom-in-95 duration-100"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] font-black uppercase text-gray-400 border-b border-[#263642] mb-1 flex items-center justify-between">
            <span>Pt #{contextMenu.event.point} Clip</span>
            <Palette size={12} className="text-sky-400" />
          </div>

          {/* Color Presets */}
          <div className="space-y-0.5 mb-1.5">
            {TRACK_COLORS.map((col, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setCustomColors((prev) => ({ ...prev, [contextMenu.event.id]: col.value }));
                  setContextMenu(null);
                  showToast(isThai ? 'เปลี่ยนสีคลิปบน Timeline แล้ว' : 'Clip color updated');
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-[#1f3142] flex items-center gap-2 text-[11px] cursor-pointer text-gray-200"
              >
                <span className={`w-3 h-3 rounded-full ${col.value.split(' ')[0]}`} />
                <span>{col.name}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-[#263642] pt-1 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setCustomColors((prev) => {
                  const updated = { ...prev };
                  delete updated[contextMenu.event.id];
                  return updated;
                });
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1 rounded hover:bg-[#1f3142] text-[11px] text-gray-400 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>{isThai ? 'รีเซ็ตสีเดิม (Reset Color)' : 'Reset Color'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingModalEvent(contextMenu.event);
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-1 rounded hover:bg-[#1f3142] text-[11px] text-sky-400 flex items-center gap-1.5 cursor-pointer font-bold"
            >
              <Edit3 size={12} />
              <span>{isThai ? 'แก้ไขเหตุการณ์ (Edit Event)' : 'Edit Event'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. HOVER DETAIL CARD */}
      {hoveredEvent && (
        <div className="bg-[#111c26]/95 border border-[#263642] rounded-xl p-2.5 flex items-center justify-between text-xs shadow-lg animate-in fade-in duration-100">
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-0.5 rounded font-black text-[10px] ${
                hoveredEvent.resultText === '+1'
                  ? 'bg-emerald-600 text-white'
                  : hoveredEvent.resultText === '-1'
                  ? 'bg-rose-600 text-white'
                  : 'bg-gray-700 text-gray-200'
              }`}
            >
              Pt #{hoveredEvent.point} ({hoveredEvent.resultText})
            </span>
            <span className="font-mono text-sky-400 font-bold">
              {formatPreciseTime(hoveredEvent.videoTime || 0)}
            </span>
            <span className="text-gray-300 font-medium">
              {hoveredEvent.thaiMeaningText ||
                hoveredEvent.eventText ||
                hoveredEvent.actions?.map((a) => `${a.skillCode || ''} ${a.resultDetailCode || ''}`).join(' → ') ||
                (isThai ? 'บันทึกจังหวะการเล่น' : 'Rally moment')}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setEditingModalEvent(hoveredEvent)}
            className="px-2.5 py-1 bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Edit3 size={12} />
            <span>{isThai ? 'แก้ไข' : 'Edit'}</span>
          </button>
        </div>
      )}

      {/* 5. EDIT EVENT MODAL */}
      {editingModalEvent && (
        <EditEventModal
          isOpen={Boolean(editingModalEvent)}
          onClose={() => setEditingModalEvent(null)}
          event={editingModalEvent}
        />
      )}

      {/* 6. AI SUGGESTION CARD (PDF §92-94: Human-in-the-loop: Accept | Edit | Reject) */}
      {selectedAISuggestion && (
        <div
          className="fixed z-50 bottom-24 left-1/2 transform -translate-x-1/2 bg-[#0c1721] border border-violet-500/80 rounded-xl shadow-2xl p-4 w-96 text-white animate-in fade-in zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#263642]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-violet-200">
                {isThai ? 'ตรวจสอบข้อเสนอ AI (Human-in-the-loop)' : 'AI Suggestion Review'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAISuggestion(null)}
              className="text-gray-400 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between my-3 text-xs">
            <div>
              <div className="text-sm font-black text-white">{selectedAISuggestion.label}</div>
              <div className="text-[11px] text-gray-400">
                Time: <span className="font-mono text-sky-400">{formatPreciseTime(selectedAISuggestion.time)}</span> | Player:{' '}
                <span className="text-purple-300 font-bold">{selectedAISuggestion.playerId || 'P1'}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-emerald-400">
                {((selectedAISuggestion.confidence || 0.85) * 100).toFixed(0)}%
              </div>
              <div className="text-[9px] text-gray-500 uppercase">Confidence</div>
            </div>
          </div>

          {/* Quick Skill Selector (PDF §91, §93) */}
          <div className="mb-3">
            <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">
              {isThai ? 'เปลี่ยนทักษะ (Change Skill):' : 'Change Skill:'}
            </span>
            <div className="flex flex-wrap gap-1 font-mono">
              {['SMH', 'CLR', 'DRP', 'DRV', 'NET', 'LFT', 'SER'].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSuggestionSkillCode(code)}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${
                    suggestionSkillCode === code
                      ? 'bg-violet-600 text-white'
                      : 'bg-[#152433] text-gray-300 hover:bg-[#1f354a]'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[#263642]">
            <button
              type="button"
              onClick={() => handleAcceptAISuggestion(selectedAISuggestion)}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
            >
              <Check size={14} /> {isThai ? 'ยอมรับ (Accept)' : 'Accept'}
            </button>
            <button
              type="button"
              onClick={() => handleRejectAISuggestion(selectedAISuggestion)}
              className="py-2 px-3 bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-600/50 text-xs font-bold rounded-lg transition-colors"
            >
              {isThai ? 'ปฏิเสธ (Reject)' : 'Reject'}
            </button>
          </div>

          <div className="text-[9px] text-gray-400 mt-2 text-center">
            {isThai
              ? 'ระบบ AI ไม่แก้ไขคะแนนบนสกอร์บอร์ดโดยอัตโนมัติ (PDF §94)'
              : 'Notice: AI suggestions never alter scoreboard directly (PDF §94)'}
          </div>
        </div>
      )}
    </div>
  );
}
