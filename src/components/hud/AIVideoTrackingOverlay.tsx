/**
 * AIVideoTrackingOverlay.tsx — Renders AI Tracking Bounding Boxes, Player Tags,
 * Speed/Distance HUD, and AlphaPose Skeletons directly over the athletes on the Video!
 * Supports:
 * 1. Video Clock Synchronization: Pauses when video pauses, syncs with playback speed and scrubbing.
 * 2. Draggable Athlete Anchors: Scouters can click and drag any player box to lock directly onto the athlete on screen!
 * 3. Real-Time Canvas Motion Tracking: For local video files, extracts pixel motion centroids frame-by-frame.
 * 4. Python Backend Detection: Shows connection state if YOLOv8 / AlphaPose server is running.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAITracking } from "../../hooks/useAITracking";
import { useScoutContext } from "../../context/ScoutContext";
import { aiTrackingService } from "../../services/aiTrackingService";
import { Move, RotateCcw, Zap, Sparkles, Crosshair, MapPin } from "lucide-react";

interface AIVideoTrackingOverlayProps {
  videoControls?: {
    getCurrentTime: () => number;
    isPlaying: boolean;
    playbackRate?: number;
  };
}

export default function AIVideoTrackingOverlay({ videoControls }: AIVideoTrackingOverlayProps) {
  const {
    isConnected,
    players,
    gameType,
    mode,
    setEngineMode,
    isBackendAvailable,
    isMarkingMode,
    markingStep,
    totalMarkingSteps,
    targetPlayerName,
    startMarkingMode,
    cancelMarkingMode,
    markPlayerAtScreen,
  } = useAITracking();
  const { settings, matchInfo } = useScoutContext();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [clickRipple, setClickRipple] = useState<{ x: number; y: number; id: number } | null>(null);

  // Optical Canvas Motion Reference
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);

  // 1. Sync AI Tracking with video playback clock
  useEffect(() => {
    if (!videoControls || !isConnected) return;

    const syncTick = () => {
      const curTime = videoControls.getCurrentTime ? videoControls.getCurrentTime() : 0;
      const isPlaying = videoControls.isPlaying ?? false;
      aiTrackingService.syncWithVideo(curTime, isPlaying);
    };

    // Run sync tick at 30fps
    const syncInterval = setInterval(syncTick, 33);
    return () => clearInterval(syncInterval);
  }, [videoControls, isConnected]);

  // 2. Real-Time Canvas Motion Detection for HTML5 Video
  useEffect(() => {
    if (!isConnected || !videoControls?.isPlaying) return;

    const detectMotion = () => {
      try {
        const videoEl = document.querySelector("#main-video-player video") as HTMLVideoElement | null;
        if (!videoEl || videoEl.paused || videoEl.videoWidth === 0) return;

        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
          canvasRef.current.width = 160;
          canvasRef.current.height = 90;
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(videoEl, 0, 0, 160, 90);
        const imgData = ctx.getImageData(0, 0, 160, 90);
        const data = imgData.data;

        if (prevPixelsRef.current) {
          const prev = prevPixelsRef.current;
          let topSumX = 0, topSumY = 0, topCount = 0;
          let botSumX = 0, botSumY = 0, botCount = 0;

          for (let y = 10; y < 80; y += 2) {
            for (let x = 15; x < 145; x += 2) {
              const idx = (y * 160 + x) * 4;
              const diff =
                Math.abs(data[idx] - prev[idx]) +
                Math.abs(data[idx + 1] - prev[idx + 1]) +
                Math.abs(data[idx + 2] - prev[idx + 2]);

              if (diff > 55) {
                if (y < 45) {
                  topSumX += x;
                  topSumY += y;
                  topCount++;
                } else {
                  botSumX += x;
                  botSumY += y;
                  botCount++;
                }
              }
            }
          }

          const optical: any = {};
          if (topCount > 15) {
            optical.team1 = {
              x: Math.round((topSumX / topCount / 160) * 100),
              y: Math.round(((topSumY / topCount) / 45) * 40 + 8),
            };
          }
          if (botCount > 15) {
            optical.team2 = {
              x: Math.round((botSumX / botCount / 160) * 100),
              y: Math.round((((botSumY / botCount) - 45) / 45) * 40 + 55),
            };
          }

          if (optical.team1 || optical.team2) {
            aiTrackingService.updateOpticalCentroids(optical);
          }
        }

        prevPixelsRef.current = new Uint8ClampedArray(data);
      } catch {
        // Cross-origin tainted canvas (YouTube iframe) — graceful fallback to video-synced trajectory
      }
    };

    const motionInterval = setInterval(detectMotion, 80);
    return () => clearInterval(motionInterval);
  }, [isConnected, videoControls?.isPlaying]);

  // 3. Interactive Dragging Handlers
  const handlePointerDown = useCallback((pid: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingId(pid);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (pid: number, e: React.PointerEvent) => {
      if (draggingId !== pid || !dragStartRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const deltaX = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
      const deltaY = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;

      aiTrackingService.setPlayerAnchorOffset(pid, { x: deltaX, y: deltaY });
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [draggingId]
  );

  const handlePointerUp = useCallback((pid: number, e: React.PointerEvent) => {
    if (draggingId === pid) {
      setDraggingId(null);
      dragStartRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  }, [draggingId]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isMarkingMode || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const screenX = ((e.clientX - rect.left) / rect.width) * 100;
      const screenY = ((e.clientY - rect.top) / rect.height) * 100;

      const roundedX = Math.round(screenX * 10) / 10;
      const roundedY = Math.round(screenY * 10) / 10;

      setClickRipple({ x: roundedX, y: roundedY, id: Date.now() });
      markPlayerAtScreen(roundedX, roundedY);
    },
    [isMarkingMode, markPlayerAtScreen]
  );

  // Only render if the sport is badminton
  if (matchInfo.sportType !== "badminton") {
    return null;
  }

  // If not connected and not in marking mode, do not render
  if (!isConnected && !isMarkingMode) {
    return null;
  }

  const showVideoOverlay = settings.aiShowVideoOverlay ?? true;
  if (!showVideoOverlay && !isMarkingMode) {
    return null;
  }

  const showSkeleton = settings.aiShowSkeleton ?? true;

  const bonePairs = [
    [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // Arms
    [5, 11], [6, 12], [11, 12],             // Torso
    [11, 13], [13, 15], [12, 14], [14, 16], // Legs
  ];

  return (
    <div
      ref={containerRef}
      onClick={handleOverlayClick}
      className={`absolute inset-0 z-20 overflow-hidden select-none transition-colors ${
        isMarkingMode
          ? "pointer-events-auto cursor-crosshair bg-black/25"
          : "pointer-events-none"
      }`}
    >
      {/* Marking Mode Floating Guidance Banner */}
      {isMarkingMode && (
        <div className="absolute top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-950/95 backdrop-blur-xl px-5 py-3 rounded-2xl border-2 border-amber-400 shadow-[0_10px_35px_rgba(245,158,11,0.4)] flex items-center gap-3.5 text-white animate-pulse">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-300 shrink-0">
              <Crosshair size={20} className="animate-spin" />
            </div>

            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-black text-xs sm:text-sm tracking-wide uppercase">
                  🎯 คลิกมาร์กจุด: {targetPlayerName}
                </span>
                <span className="bg-amber-500/30 text-amber-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-amber-400/40">
                  {markingStep + 1} / {totalMarkingSteps}
                </span>
              </div>
              <div className="text-[11px] text-white/80">
                {gameType === "singles"
                  ? markingStep === 0
                    ? "👉 คลิกที่ตัวนักกีฬาแดนบน (เช่น Naraoka ในเสื้อแดง)"
                    : "👉 คลิกที่ตัวนักกีฬาแดนล่าง (ผู้เล่นในเสื้อขาว)"
                  : `👉 คลิกที่ตัวนักกีฬาในสนามตำแหน่ง ${targetPlayerName}`}
              </div>
            </div>

            {/* Cancel Marking Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cancelMarkingMode();
              }}
              className="ml-3 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-red-600 text-white/90 hover:text-white text-xs font-bold transition-all active:scale-95 cursor-pointer border border-white/20"
            >
              ✕ ยกเลิก
            </button>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            {Array.from({ length: totalMarkingSteps }).map((_, i) => (
              <span
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i < markingStep
                    ? "bg-emerald-400 shadow-sm"
                    : i === markingStep
                    ? "bg-amber-400 ring-2 ring-amber-300 animate-ping"
                    : "bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Click Ripple Reticle */}
      {clickRipple && (
        <div
          key={clickRipple.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50 flex items-center justify-center animate-ping"
          style={{
            left: `${clickRipple.x}%`,
            top: `${clickRipple.y}%`,
          }}
        >
          <div className="w-16 h-16 rounded-full border-2 border-amber-400 bg-amber-400/20" />
        </div>
      )}

      {/* HUD Mode Badge & Control Bar in Top Left */}
      <div className="absolute top-14 sm:top-16 left-3 sm:left-6 flex flex-wrap items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white shadow-2xl text-[10px] font-mono tracking-wider pointer-events-auto">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-black text-emerald-300 flex items-center gap-1">
          {mode === "server" ? (
            <>
              <Sparkles size={11} className="text-emerald-400" />
              PYTHON AI (YOLO+AlphaPose)
            </>
          ) : (
            <>
              <Zap size={11} className="text-sky-400" />
              REAL-TIME SYNC
            </>
          )}
          : {gameType === "singles" ? "SINGLES (2P)" : "DOUBLES (4P)"}
        </span>

        <span className="text-white/20">|</span>

        <span className="text-white/70 hidden sm:inline flex items-center gap-1">
          <Move size={10} className="text-amber-300" />
          ลากกรอบเพื่อล็อกตำแหน่งนักกีฬา
        </span>

        {/* Mark Player Button */}
        <button
          type="button"
          onClick={() => (isMarkingMode ? cancelMarkingMode() : startMarkingMode())}
          className={`px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95 border ${
            isMarkingMode
              ? "bg-amber-500 text-slate-950 border-amber-300 font-black animate-pulse"
              : "bg-white/10 hover:bg-white/20 text-white/90 hover:text-white border-white/10"
          }`}
          title="คลิกเพื่อมาร์กตำแหน่งนักกีฬาบนคลิปวิดีโอ"
        >
          <Crosshair size={9} />
          <span>{isMarkingMode ? "กำลังมาร์ก..." : "มาร์กจุด"}</span>
        </button>

        {/* Reset Anchors Button */}
        <button
          type="button"
          onClick={() => aiTrackingService.resetAnchors()}
          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/90 hover:text-white text-[9px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95 border border-white/10"
          title="รีเซ็ตตำแหน่งนักกีฬากลับสู่พิกัดปกติ"
        >
          <RotateCcw size={9} />
          <span>รีเซ็ต</span>
        </button>

        {/* Python Backend Switch (if available or configured) */}
        {isBackendAvailable && (
          <button
            type="button"
            onClick={() => setEngineMode(mode === "server" ? "browser" : "server")}
            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all active:scale-95 border ${
              mode === "server"
                ? "bg-purple-600 border-purple-400 text-white shadow-sm"
                : "bg-emerald-700/80 hover:bg-emerald-600 border-emerald-400 text-white animate-pulse"
            }`}
            title="สลับระหว่าง Real-Time Browser Engine และ Python Backend (YOLOv8 + AlphaPose)"
          >
            <span>{mode === "server" ? "⚡ สลับสู่ Browser" : "🐍 ต่อ Python AI"}</span>
          </button>
        )}
      </div>

      {players.map((player) => {
        const bbox = player.video_bbox_pct;
        if (!bbox) return null;

        const isTeam1 = player.team === 1;
        const themeColor = isTeam1 ? "#38bdf8" : "#f59e0b"; // Sky for Team 1, Amber for Team 2
        const actionBg =
          player.pose_action === "SMASH"
            ? "bg-red-600 text-white"
            : player.pose_action === "NET_SHOT"
            ? "bg-emerald-600 text-white"
            : player.pose_action === "DRIVE"
            ? "bg-sky-600 text-white"
            : "bg-black/60 text-white/90";

        const kpts = player.video_keypoints_pct;
        const isDragging = draggingId === player.id;

        return (
          <div
            key={player.id}
            onPointerDown={(e) => handlePointerDown(player.id, e)}
            onPointerMove={(e) => handlePointerMove(player.id, e)}
            onPointerUp={(e) => handlePointerUp(player.id, e)}
            className={`absolute transition-all duration-75 ease-out pointer-events-auto cursor-grab active:cursor-grabbing ${
              isDragging ? "ring-2 ring-amber-400 ring-offset-2 z-40 scale-105" : ""
            }`}
            style={{
              left: `${bbox.x}%`,
              top: `${bbox.y}%`,
              width: `${bbox.width}%`,
              height: `${bbox.height}%`,
              touchAction: "none",
            }}
          >
            {/* Athlete Bounding Box (Corner Bracket Styling) */}
            <div
              className={`absolute inset-0 border-2 rounded-lg shadow-lg ${
                isDragging ? "bg-amber-500/10" : ""
              }`}
              style={{
                borderColor: isDragging ? "#f59e0b" : themeColor,
                boxShadow: isDragging
                  ? "0 0 18px rgba(245, 158, 11, 0.7)"
                  : `0 0 12px ${themeColor}40`,
              }}
            >
              {/* Corner Accents */}
              <div
                className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2"
                style={{ borderColor: "#ffffff" }}
              />
              <div
                className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2"
                style={{ borderColor: "#ffffff" }}
              />
              <div
                className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2"
                style={{ borderColor: "#ffffff" }}
              />
              <div
                className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2"
                style={{ borderColor: "#ffffff" }}
              />
            </div>

            {/* Top Tag: Player Name + AlphaPose Action */}
            <div className="absolute -top-7 left-0 flex items-center gap-1 whitespace-nowrap pointer-events-none">
              {/* Player Tag */}
              <div
                className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase text-slate-950 shadow-md backdrop-blur-md flex items-center gap-1"
                style={{ backgroundColor: themeColor }}
              >
                <span>P{player.id}</span>
                <span className="opacity-75 text-[8px] hidden xs:inline">
                  {isTeam1 ? "Team 1" : "Team 2"}
                </span>
              </div>

              {/* Stroke Action Tag */}
              {player.pose_action && (
                <div
                  className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase shadow-md backdrop-blur-md ${actionBg} ${
                    player.pose_action === "SMASH" ? "animate-pulse ring-1 ring-white" : ""
                  }`}
                >
                  {player.pose_action}
                </div>
              )}
            </div>

            {/* Bottom HUD Ticker: Speed, Distance, Zone */}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 bg-black/80 rounded border border-white/20 text-[8px] sm:text-[9px] font-mono text-white whitespace-nowrap shadow-md backdrop-blur-sm pointer-events-none">
              <span className="text-emerald-400 font-bold">{player.speed_ms} m/s</span>
              <span className="text-white/40">|</span>
              <span className="text-amber-300 font-bold">{player.zone}</span>
              <span className="text-white/40 hidden sm:inline">|</span>
              <span className="text-gray-300 hidden sm:inline">{player.total_dist_m}m</span>
            </div>

            {/* Feet Ground Contact Ring */}
            <div
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-3 rounded-full border border-white/80 opacity-70 pointer-events-none"
              style={{ backgroundColor: `${themeColor}30` }}
            />

            {/* AlphaPose Skeleton Stick-Figure (Overlaid on athlete body) */}
            {showSkeleton && kpts && kpts.length >= 17 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                viewBox={`0 0 ${bbox.width} ${bbox.height}`}
              >
                {/* Skeleton Bones */}
                {bonePairs.map(([i1, i2], idx) => {
                  const p1 = kpts[i1];
                  const p2 = kpts[i2];
                  if (!p1 || !p2) return null;
                  const x1 = ((p1.x - bbox.x) / bbox.width) * bbox.width;
                  const y1 = ((p1.y - bbox.y) / bbox.height) * bbox.height;
                  const x2 = ((p2.x - bbox.x) / bbox.width) * bbox.width;
                  const y2 = ((p2.y - bbox.y) / bbox.height) * bbox.height;

                  return (
                    <line
                      key={idx}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isDragging ? "#f59e0b" : themeColor}
                      strokeWidth="2.0"
                      strokeLinecap="round"
                      opacity="0.85"
                    />
                  );
                })}

                {/* Keypoint Joints */}
                {kpts.map((k, jIdx) => {
                  const jx = ((k.x - bbox.x) / bbox.width) * bbox.width;
                  const jy = ((k.y - bbox.y) / bbox.height) * bbox.height;
                  return (
                    <circle
                      key={jIdx}
                      cx={jx}
                      cy={jy}
                      r="2.2"
                      fill="#ffffff"
                      stroke={isDragging ? "#f59e0b" : themeColor}
                      strokeWidth="1.2"
                    />
                  );
                })}
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
