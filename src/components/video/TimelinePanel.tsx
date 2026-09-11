import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { EventRow } from '../../types';
import { formatPreciseTime } from '../../utils';
import {
  Play,
  Pause,
  Filter,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Edit3,
  Trash2,
  Bookmark,
  ChevronRight,
  ChevronDown,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Repeat,
  Sliders,
  Palette,
  Eye,
  Settings2,
  Clock,
  Sparkles,
} from 'lucide-react';
import EditEventModal from '../EditEventModal';

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
  const activeProject = projects.find(project => project.id === activeProjectId);
  const projectAnnotations = activeProject?.videoMeta?.annotations || [];

  const events: EventRow[] = scoutCtx.events || [];
  const teams = scoutCtx.teams || [];
  const updateEventRow = scoutCtx.updateEventRow || (() => {});
  const deleteEvent = scoutCtx.deleteEvent || (() => {});
  const settings = scoutCtx.settings || {};
  const showToast = scoutCtx.showToast || (() => {});
  const isThai = settings?.uiLanguage === 'th';

  const [teamFilter, setTeamFilter] = useState<'all' | 't1' | 't2'>('all');
  const [resultFilter, setResultFilter] = useState<'all' | '+1' | '-1' | '0'>('all');
  const [isLooping, setIsLooping] = useState(false);

  // Track collapse states
  const [expandedTracks, setExpandedTracks] = useState<Record<string, boolean>>({
    teamA: true,
    teamB: true,
    keyMoments: true,
    annotations: true,
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
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1x to 4x zoom

  // Local video thumbnail cache
  const [thumbnails, setThumbnails] = useState<{ time: number; dataUrl: string }[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);

  const team1 = teams?.[0] || { id: 't1', code: 'T1', name: 'Team 1' };
  const team2 = teams?.[1] || { id: 't2', code: 'T2', name: 'Team 2' };

  const safeDuration = Math.max(duration || 0, 1);

  // Toggle Track Hierarchy Expand
  const toggleTrack = (trackKey: string) => {
    setExpandedTracks((prev) => ({ ...prev, [trackKey]: !prev[trackKey] }));
  };

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

  // Split into Team A, Team B, and Key Moments
  const teamAEvents = useMemo(() => {
    return filteredEvents.filter((ev) => {
      const tid = ev.actions?.[0]?.teamCode;
      return tid === 't1' || tid === team1.id || tid === team1.code || (!tid && ev.resultText === '+1');
    });
  }, [filteredEvents, team1.id, team1.code]);

  const teamBEvents = useMemo(() => {
    return filteredEvents.filter((ev) => {
      const tid = ev.actions?.[0]?.teamCode;
      return tid === 't2' || tid === team2.id || tid === team2.code || (!tid && ev.resultText === '-1');
    });
  }, [filteredEvents, team2.id, team2.code]);

  const keyMomentEvents = useMemo(() => {
    return filteredEvents.filter((ev) => ev.isBookmarked || ev.resultText === '+1' || ev.resultText === '-1');
  }, [filteredEvents]);

  // Drag handlers for Marker / Clip
  const handleMarkerMouseDown = (e: React.MouseEvent, ev: EventRow) => {
    e.stopPropagation();
    setDraggedEvent({
      id: ev.id,
      originalTime: ev.videoTime || 0,
      draftTime: ev.videoTime || 0,
    });
  };

  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!draggedEvent || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const newPercent = clickX / rect.width;
      const newTime = Math.max(0, Math.min(newPercent * safeDuration, safeDuration));

      setDraggedEvent((prev) => (prev ? { ...prev, draftTime: Number(newTime.toFixed(2)) } : null));
    },
    [draggedEvent, safeDuration]
  );

  const handleTrackMouseUp = useCallback(() => {
    if (!draggedEvent) return;
    const targetEventId = draggedEvent.id;
    const previousTime = draggedEvent.originalTime;
    const finalTime = draggedEvent.draftTime;

    if (Math.abs(previousTime - finalTime) > 0.05) {
      updateEventRow(targetEventId, { videoTime: finalTime });

      showToast(
        isThai
          ? `ปรับเวลา Event เป็น ${formatPreciseTime(finalTime)} แล้ว`
          : `Updated event time to ${formatPreciseTime(finalTime)}`
      );
    }

    setDraggedEvent(null);
  }, [draggedEvent, isThai, showToast, updateEventRow]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedEvent || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = clickX / rect.width;
    const targetTime = percent * safeDuration;
    onSeek(targetTime);
  };

  const getMarkerColor = (ev: EventRow, defaultFallback: string) => {
    if (customColors[ev.id]) {
      return customColors[ev.id];
    }
    if (ev.resultText === '+1') return 'bg-emerald-500 hover:bg-emerald-400 border-emerald-300 text-white';
    if (ev.resultText === '-1') return 'bg-rose-500 hover:bg-rose-400 border-rose-300 text-white';
    return defaultFallback;
  };

  // Generate ruler tick intervals (10 divisions across timeline)
  const rulerTicks = useMemo(() => {
    const ticks: { time: number; label: string; pct: number }[] = [];
    const count = 10;
    for (let i = 0; i <= count; i++) {
      const t = (i / count) * safeDuration;
      ticks.push({
        time: t,
        label: formatPreciseTime(t),
        pct: (i / count) * 100,
      });
    }
    return ticks;
  }, [safeDuration]);

  return (
    <div
      className="bg-[#0c1721] text-gray-100 rounded-2xl border border-[#263642] p-3 shadow-2xl select-none space-y-2.5 font-sans"
      onMouseMove={handleTrackMouseMove}
      onMouseUp={handleTrackMouseUp}
    >
      {/* 1. TOP TRANSPORT CONTROL BAR (Matching Image 3 & Image 1) */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[#263642] pb-2">
        {/* Left: Tab Title & Transport Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-600/20 text-sky-400 border border-sky-500/40 rounded-lg font-black text-xs">
            <Clock size={13} />
            <span>Timeline Track Editor</span>
          </div>

          <span className="w-px h-4 bg-[#263642]" />

          {/* Transport Buttons */}
          <div className="flex items-center gap-1 bg-[#111c26] border border-[#263642] rounded-xl p-1 shadow-inner">
            {/* Step -1 Frame */}
            <button
              type="button"
              onClick={() => onStepFrame?.(false)}
              className="p-1.5 hover:bg-[#1f3142] text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isThai ? 'ถอย 1 เฟรม (Step -1 Frame)' : 'Step Back 1 Frame'}
            >
              <StepBack size={14} />
            </button>

            {/* Skip -3s */}
            <button
              type="button"
              onClick={() => onSkipSeconds?.(-3)}
              className="p-1.5 hover:bg-[#1f3142] text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isThai ? 'ย้อน 3 วินาที (-3s)' : 'Skip Back 3s'}
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
              title={isThai ? 'ไปข้างหน้า 3 วินาที (+3s)' : 'Skip Forward 3s'}
            >
              <SkipForward size={14} />
            </button>

            {/* Step +1 Frame */}
            <button
              type="button"
              onClick={() => onStepFrame?.(true)}
              className="p-1.5 hover:bg-[#1f3142] text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isThai ? 'เดินหน้า 1 เฟรม (Step +1 Frame)' : 'Step Forward 1 Frame'}
            >
              <StepForward size={14} />
            </button>

            {/* Loop Toggle */}
            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLooping ? 'bg-sky-600 text-white' : 'text-gray-400 hover:bg-[#1f3142] hover:text-gray-200'
              }`}
              title="Loop Playback"
            >
              <Repeat size={14} />
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
        </div>

        {/* Right: Timecode Display & Filters */}
        <div className="flex items-center gap-2">
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

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-[#111c26] border border-[#263642] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.max(1, prev - 0.5))}
              disabled={zoomLevel <= 1}
              className="p-1 text-gray-400 hover:text-gray-100 disabled:opacity-30 cursor-pointer"
            >
              <ZoomOut size={12} />
            </button>
            <span className="text-[10px] font-mono font-bold px-1 text-gray-300">{zoomLevel}x</span>
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.min(3, prev + 0.5))}
              disabled={zoomLevel >= 3}
              className="p-1 text-gray-400 hover:text-gray-100 disabled:opacity-30 cursor-pointer"
            >
              <ZoomIn size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. MULTI-LANE TRACK SYSTEM WITH LEFT HIERARCHY TREE (Matching Image 3) */}
      <div className="grid grid-cols-12 gap-0 bg-[#070e14] rounded-xl border border-[#263642] overflow-hidden">
        {/* Left: Track Tree Sidebar (Image 3 Left Hierarchy) */}
        <div className="col-span-3 bg-[#0d1722] border-r border-[#263642] flex flex-col justify-between py-1 text-xs">
          {/* Header Track Item */}
          <div className="h-6 px-2.5 flex items-center justify-between border-b border-[#263642] text-[10px] font-black uppercase text-gray-400">
            <span>Track Name</span>
            <span>Count</span>
          </div>

          {/* Track 1 Tree Node */}
          <div
            className="h-10 px-2.5 flex items-center justify-between border-b border-[#263642]/60 hover:bg-[#132332] transition-colors cursor-pointer"
            onClick={() => toggleTrack('teamA')}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expandedTracks.teamA ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="w-2 h-2 rounded-full bg-sky-400 inline-block shrink-0" />
              <span className="font-bold text-[11px] text-sky-300 truncate">{team1.name || team1.code} (Team A)</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-gray-400">{teamAEvents.length}</span>
          </div>

          {/* Track 2 Tree Node */}
          <div
            className="h-10 px-2.5 flex items-center justify-between border-b border-[#263642]/60 hover:bg-[#132332] transition-colors cursor-pointer"
            onClick={() => toggleTrack('teamB')}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expandedTracks.teamB ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
              <span className="font-bold text-[11px] text-amber-300 truncate">{team2.name || team2.code} (Team B)</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-gray-400">{teamBEvents.length}</span>
          </div>

          {/* Track 3 Tree Node (Key Moments) */}
          <div
            className="h-10 px-2.5 flex items-center justify-between border-b border-[#263642]/60 hover:bg-[#132332] transition-colors cursor-pointer"
            onClick={() => toggleTrack('keyMoments')}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expandedTracks.keyMoments ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="w-2 h-2 rounded-full bg-purple-400 inline-block shrink-0" />
              <span className="font-bold text-[11px] text-purple-300 truncate">Key Moments & PTS</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-gray-400">{keyMomentEvents.length}</span>
          </div>

          {/* Track 4 Tree Node (Telestration & Tactical Annotations) */}
          <div
            className="h-10 px-2.5 flex items-center justify-between hover:bg-[#132332] transition-colors cursor-pointer"
            onClick={() => toggleTrack('annotations')}
          >
            <div className="flex items-center gap-1.5 truncate">
              {expandedTracks.annotations ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
              <span className="font-bold text-[11px] text-emerald-300 truncate">🎨 Telestration & Notes</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-gray-400">{projectAnnotations.length}</span>
          </div>
        </div>

        {/* Right: Time Ruler & Interactive Lanes Canvas (Image 3 Right Canvas) */}
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          className="col-span-9 relative bg-[#09121a] cursor-pointer overflow-hidden group flex flex-col justify-between"
        >
          {/* Time Ruler (Image 3 Scale with ticks 0, 50, 100, 150...) */}
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

          {/* Yellow Needle Playhead Line (Image 3 Signature Element) */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)] z-30 pointer-events-none"
            style={{
              left: `${safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0}%`,
            }}
          >
            {/* Playhead Flag Cursor */}
            <div className="w-3.5 h-3.5 bg-amber-400 rotate-45 -ml-1.5 -mt-1 shadow-lg border border-amber-200 flex items-center justify-center">
              <span className="w-1 h-1 rounded-full bg-gray-900" />
            </div>
          </div>

          {/* Dragging Tooltip */}
          {draggedEvent && (
            <div
              className="absolute top-1 transform -translate-x-1/2 z-40 bg-sky-500 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded shadow-xl pointer-events-none flex items-center gap-1"
              style={{
                left: `${(draggedEvent.draftTime / safeDuration) * 100}%`,
              }}
            >
              <span>{formatPreciseTime(draggedEvent.draftTime)}</span>
            </div>
          )}

          {/* Track 1 Lane (Team A) */}
          <div className="relative h-10 border-b border-[#263642]/60 flex items-center z-20 px-1">
            {teamAEvents.map((ev) => {
              const isDraggingThis = draggedEvent?.id === ev.id;
              const evTime = isDraggingThis ? draggedEvent.draftTime : ev.videoTime || 0;
              const leftPct = (evTime / safeDuration) * 100;
              const colorClass = getMarkerColor(ev, 'bg-sky-600 border-sky-400 text-white');

              return (
                <div
                  key={ev.id}
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
                  title={`Pt #${ev.point}: ${ev.actions?.[0]?.skillCode || 'Action'} (${formatPreciseTime(evTime)})`}
                  className={`absolute h-6 px-2 rounded-md border shadow-md cursor-grab active:cursor-grabbing transform -translate-x-1/2 transition-all hover:scale-105 hover:z-30 flex items-center gap-1 text-[9px] font-black ${colorClass}`}
                  style={{ left: `${leftPct}%` }}
                >
                  <span className="opacity-80">#{ev.point}</span>
                  <span className="truncate max-w-[50px]">{ev.actions?.[0]?.skillCode || 'Act'}</span>
                </div>
              );
            })}
          </div>

          {/* Track 2 Lane (Team B) */}
          <div className="relative h-10 border-b border-[#263642]/60 flex items-center z-20 px-1">
            {teamBEvents.map((ev) => {
              const isDraggingThis = draggedEvent?.id === ev.id;
              const evTime = isDraggingThis ? draggedEvent.draftTime : ev.videoTime || 0;
              const leftPct = (evTime / safeDuration) * 100;
              const colorClass = getMarkerColor(ev, 'bg-amber-600 border-amber-400 text-white');

              return (
                <div
                  key={ev.id}
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
                  title={`Pt #${ev.point}: ${ev.actions?.[0]?.skillCode || 'Action'} (${formatPreciseTime(evTime)})`}
                  className={`absolute h-6 px-2 rounded-md border shadow-md cursor-grab active:cursor-grabbing transform -translate-x-1/2 transition-all hover:scale-105 hover:z-30 flex items-center gap-1 text-[9px] font-black ${colorClass}`}
                  style={{ left: `${leftPct}%` }}
                >
                  <span className="opacity-80">#{ev.point}</span>
                  <span className="truncate max-w-[50px]">{ev.actions?.[0]?.skillCode || 'Act'}</span>
                </div>
              );
            })}
          </div>

          {/* Track 3 Lane (Key Moments & Points) */}
          <div className="relative h-10 border-b border-[#263642]/60 flex items-center z-20 px-1">
            {keyMomentEvents.map((ev) => {
              const isDraggingThis = draggedEvent?.id === ev.id;
              const evTime = isDraggingThis ? draggedEvent.draftTime : ev.videoTime || 0;
              const leftPct = (evTime / safeDuration) * 100;
              const colorClass = getMarkerColor(ev, 'bg-purple-600 border-purple-400 text-white');

              return (
                <div
                  key={ev.id}
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
                  className={`absolute h-6 px-2.5 rounded-md border shadow-md cursor-grab active:cursor-grabbing transform -translate-x-1/2 transition-all hover:scale-105 hover:z-30 flex items-center gap-1 text-[9px] font-black ${colorClass}`}
                  style={{ left: `${leftPct}%` }}
                >
                  <Bookmark size={10} className="fill-white" />
                  <span>Pt #{ev.point}</span>
                </div>
              );
            })}
          </div>

          {/* Track 4 Lane (Telestration & Tactical Annotations) */}
          <div className="relative h-10 flex items-center z-20 px-1">
            {projectAnnotations.map((shape) => {
              const shapeTime = shape.timestamp || 0;
              const leftPct = (shapeTime / safeDuration) * 100;

              return (
                <div
                  key={shape.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(shapeTime);
                    showToast(isThai ? `กระโดดไปที่วาดแท็กติก (${formatPreciseTime(shapeTime)})` : `Jumped to tactical note (${formatPreciseTime(shapeTime)})`);
                  }}
                  title={`${shape.label || shape.type} @ ${formatPreciseTime(shapeTime)}${shape.duration ? ` (${shape.duration}s)` : ''}`}
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
        </div>
      </div>

      {/* 3. CONTEXT MENU FOR OVERRIDE COLOR & QUICK ACTIONS (Image 3 Context Menu) */}
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
            <span className="font-mono text-sky-400 font-bold">{formatPreciseTime(hoveredEvent.videoTime || 0)}</span>
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
    </div>
  );
}

