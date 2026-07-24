import React, {
  useRef,
  useState,
  useEffect,
  Suspense,
  lazy,
  useCallback,
} from "react";
import ReactPlayer from "react-player";
import { useScoutContext } from "../context/ScoutContext";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  Play,
  Pause,
  Rewind,
  FastForward,
import React, {
  useRef,
  useState,
  useEffect,
  Suspense,
  lazy,
  useCallback,
} from "react";
import ReactPlayer from "react-player";
import { useScoutContext } from "../context/ScoutContext";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  Upload,
  Youtube,
  Settings2,
  MonitorPlay,
} from "lucide-react";
import { formatPreciseTime } from "../utils";
import ScoutHUDWrapper from "./hud/ScoutHUDWrapper";
import SegmentPreviewPanel from "./SegmentPreviewPanel";
import CourtZoneOverlay from "./video/CourtZoneOverlay";
import { useVideoResize } from "../hooks/useVideoResize";
import { useVideoGestures } from "../hooks/useVideoGestures";
import { useVideoPlayback } from "../hooks/useVideoPlayback";
import {
  loadProjectVideoFileHandle,
  saveProjectVideoFileHandle,
  type PersistentVideoFileHandle,
} from "../utils/videoFileStore";
import { resolveLocalVideoState, type LocalVideoState } from "../utils/videoState";
import { getLocalizedVideoError } from "../utils/videoError";
import { t } from "../i18n";

export default function VideoPlayer() {
  const playerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousProjectIdRef = useRef<string | null>(null);
  const restoredPlaybackKeyRef = useRef<string | null>(null);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [localVideoState, setLocalVideoState] = useState<LocalVideoState>('idle');
  const [showCourtOverlay, setShowCourtOverlay] = useState(false);
  const [isCalibratingCourt, setIsCalibratingCourt] = useState(false);

  const {
    isHUDMode,
    isPortrait,
    videoHeight,
    setVideoHeight,
    isResizing,
    setIsResizing,
    containerRef,
    enterHUDMode,
    closeHUDMode,
  } = useVideoResize();

  const {
    setVideoTime,
    videoSourceType,
    setVideoSourceType,
    youtubeUrl,
    setYoutubeUrl,
    youtubeVideoId,
    setYoutubeVideoId,
    localFileName,
    setLocalFileName,
    settings,
    seekRequest,
    setSeekRequest,
    showToast,
    getCurrentTimeRef,
  } = useScoutContext();

  const { activeProjectId, projects, updateProjectLastVideoTime, updateProjectVideoCalibration } = useWorkspace();
  const activeProject = projects.find(project => project.id === activeProjectId);

  const {
    playbackRate,
    setPlaybackRate,
    requestedPlaying,
    setRequestedPlaying,
    actualPlaying,
    setActualPlaying,
    isAutoplayBlocked,
    setIsAutoplayBlocked,
    playerReady,
    setPlayerReady,
    playerError,
    setPlayerError,
    playerErrorType,
    setPlayerErrorType,
    playerErrorCode,
    setPlayerErrorCode,
    isLoadingVideo,
    setIsLoadingVideo,
    useNativeIframe,
    setUseNativeIframe,
    currentTimeDisplay,
    setCurrentTimeDisplay,
    duration,
    setDuration,
    isScrubbing,
    setIsScrubbing,
    draftSeekTime,
    setDraftSeekTime,
    draftSeekTimeRef,
    volume,
    setVolume,
    brightness,
    setBrightness,
    isPlaying,
    setIsPlaying,
    getPlayer,
    getInternalPlayer,
    getCurrentTimeSafe,
    getDurationSafe,
    seekToSafe,
    seekBySafe,
    playSafe,
    pauseSafe,
    setVolumeSafe,
    setSpeedSafe,
    togglePlay,
    handleTimeUpdate,
    handleDuration,
    handleSeekPointerDown,
    handleSeekInput,
    handleSeekPointerUp,
    handleSeekCancel,
    handlePlayerError,
    handlePlayerReady,
  } = useVideoPlayback({
    playerRef,
    videoSrc,
    youtubeUrl,
    videoSourceType,
    setVideoTime,
    settings,
    seekRequest,
    setSeekRequest,
    getCurrentTimeRef,
    updateProjectLastVideoTime,
  });

  const localizedPlayerError = playerError
    ? getLocalizedVideoError(
        playerErrorType,
        playerErrorCode,
        settings.uiLanguage,
      )
    : null;

  // Timeline State
  const [showFineControls, setShowFineControls] = useState(false);

  useEffect(() => {
    if (videoSourceType === "youtube") setUrlInput(youtubeUrl || "");
  }, [videoSourceType, youtubeUrl]);

  useEffect(() => {
    const previousProjectId = previousProjectIdRef.current;
    previousProjectIdRef.current = activeProjectId;
    if (!previousProjectId || previousProjectId === activeProjectId) return;

    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoSrc(null);
    setRequestedPlaying(false);
    setPlayerReady(false);
    setCurrentTimeDisplay(0);
    restoredPlaybackKeyRef.current = null;
  }, [activeProjectId, videoSrc]);

  useEffect(() => {
    const resumeTime = activeProject?.videoMeta?.lastVideoTime;
    if (!playerReady || !activeProjectId || !resumeTime || resumeTime <= 0) return;

    const sourceIdentity = videoSourceType === "youtube" ? youtubeUrl : localFileName;
    const playbackKey = `${activeProjectId}:${videoSourceType}:${sourceIdentity || "none"}`;
    if (restoredPlaybackKeyRef.current === playbackKey) return;

    setIsPlaying(false);
    seekToSafe(resumeTime);
    setCurrentTimeDisplay(resumeTime);
    setVideoTime(resumeTime);
    restoredPlaybackKeyRef.current = playbackKey;
  }, [
    activeProject?.videoMeta?.lastVideoTime,
    activeProjectId,
    localFileName,
    playerReady,
    seekToSafe,
    setCurrentTimeDisplay,
    setIsPlaying,
    setVideoTime,
    videoSourceType,
    youtubeUrl,
  ]);

  const handlePlayerReadyWithoutCaptions = useCallback(() => {
    handlePlayerReady();

    if (videoSourceType !== "youtube") return;

    try {
      const internalPlayer = getInternalPlayer?.();
      // Best effort only: YouTube may still restore captions from user/browser preferences.
      internalPlayer?.unloadModule?.("captions");
      internalPlayer?.unloadModule?.("cc");
    } catch {
      // Caption modules are not available in every YouTube iframe environment.
    }
  }, [getInternalPlayer, handlePlayerReady, videoSourceType]);

  const extractYouTubeId = (input: string): string | null => {
    const value = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
    try {
      const url = new URL(value);
      if (url.hostname.includes("youtu.be")) {
        const id = url.pathname.split("/").filter(Boolean)[0];
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      if (url.hostname.includes("youtube.com")) {
        const watchId = url.searchParams.get("v");
        if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;
        const parts = url.pathname.split("/").filter(Boolean);
        const embedIndex = parts.indexOf("embed");
        const shortsIndex = parts.indexOf("shorts");
        const liveIndex = parts.indexOf("live");
        const id =
          embedIndex !== -1
            ? parts[embedIndex + 1]
            : shortsIndex !== -1
              ? parts[shortsIndex + 1]
              : liveIndex !== -1
                ? parts[liveIndex + 1]
                : null;
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
    } catch {
      return null;
    }
    return null;
  };

  const [canRestoreAccess, setCanRestoreAccess] = useState(false);

  useEffect(() => {
    if (videoSourceType === 'local' && localFileName && !videoSrc) {
       setLocalVideoState('loading');
       loadProjectVideoFileHandle(activeProjectId, localFileName).then(handle => {
          if (!handle) {
             setCanRestoreAccess(false);
             setLocalVideoState(resolveLocalVideoState({ hasSource: true, hasStoredHandle: false }));
             return;
          }
          setCanRestoreAccess(true);
          const permissionPromise = handle.queryPermission
            ? handle.queryPermission({ mode: 'read' })
            : Promise.resolve('granted' as const);
          void permissionPromise.then(permission => {
            setLocalVideoState(resolveLocalVideoState({ hasSource: true, hasStoredHandle: true, permission }));
          }).catch(() => setLocalVideoState('error'));
       }).catch(() => {
          setCanRestoreAccess(false);
          setLocalVideoState('error');
       });
    } else {
       setCanRestoreAccess(false);
       setLocalVideoState(videoSrc ? 'ready' : 'idle');
    }
  }, [activeProjectId, videoSourceType, localFileName, videoSrc]);

  const handleRestoreAccess = async () => {
    try {
      const handle = await loadProjectVideoFileHandle(activeProjectId, localFileName);
      if (handle) {
         const currentPermission = handle.queryPermission
           ? await handle.queryPermission({ mode: 'read' })
           : 'granted';
         const perm = currentPermission === 'granted' || !handle.requestPermission
           ? currentPermission
           : await handle.requestPermission({ mode: 'read' });
          if (perm === 'granted') {
            const file = await handle.getFile();
            if (videoSrc && videoSourceType === "local") URL.revokeObjectURL(videoSrc);
             const url = URL.createObjectURL(file);
             setVideoSrc(url);
             setLocalVideoState('ready');
          }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePickLocalVideo = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [fileHandle] = await (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<PersistentVideoFileHandle[]> }).showOpenFilePicker({
          types: [{ description: 'Video Files', accept: { 'video/*': [] } }]
        });
        const file = await fileHandle.getFile();
        
        if (videoSrc && videoSourceType === "local") {
          URL.revokeObjectURL(videoSrc);
        }
        const url = URL.createObjectURL(file);
         setVideoSrc(url);
         setLocalFileName(file.name);
         setVideoSourceType("local");
         setLocalVideoState('ready');
         setIsPlaying(false);
        
        await saveProjectVideoFileHandle(activeProjectId, file.name, fileHandle);
      } catch (err) {
        console.log("User cancelled or file access failed");
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        setLocalVideoState('unsupported');
        showToast(settings.uiLanguage === 'th' ? 'ไฟล์นี้ไม่ใช่วิดีโอที่รองรับ' : 'This file is not a supported video.');
        e.target.value = '';
        return;
      }
      if (videoSrc && videoSourceType === "local") {
        URL.revokeObjectURL(videoSrc);
      }
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setLocalFileName(file.name);
      setVideoSourceType("local");
      setLocalVideoState('ready');
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    return () => {
      if (videoSrc && videoSourceType === "local") {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [videoSrc, videoSourceType]);

  const handleYoutubeLoad = () => {
    const id = extractYouTubeId(urlInput);
    if (id) {
      setPlayerError(null);
      setPlayerErrorType(null);
      setPlayerErrorCode(null);
      setIsLoadingVideo(true);
      setPlayerReady(false);
      setYoutubeVideoId(id);
      const canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
      setYoutubeUrl(canonicalUrl);
      setUrlInput(canonicalUrl);
      setVideoSourceType("youtube");
      setIsPlaying(false);
      setCurrentTimeDisplay(0);
      setVideoTime(0);
    } else {
      setPlayerError("YouTube URL หรือ Video ID ไม่ถูกต้อง");
      setPlayerErrorType("invalid_url");
    }
  };

  useEffect(() => {
    if (!isLoadingVideo) return;
    const timer = window.setTimeout(() => {
      if (!playerReady) {
        setIsLoadingVideo(false);
        setPlayerErrorType("timeout");
        setPlayerError(
          "โหลดวิดีโอไม่สำเร็จ (Timeout 15 วินาที) อาจเกิดจากความเร็วอินเทอร์เน็ตต่ำ หรือ browser block YouTube embed",
        );
      }
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [isLoadingVideo, playerReady, setIsLoadingVideo, setPlayerErrorType, setPlayerError]);

  const {
    gestureOverlayText,
    handleVideoPointerDown,
    handleVideoPointerMove,
    handleVideoPointerUp,
    handleVideoPointerCancel,
  } = useVideoGestures({
    settings,
    volume,
    brightness,
    getCurrentTimeSafe,
    getDurationSafe,
    seekBySafe,
    seekToSafe,
    setVolumeSafe,
    setBrightness,
    draftSeekTimeRef,
    setDraftSeekTime,
    setCurrentTimeDisplay,
    playSafe,
    pauseSafe,
  });

  const hasVideo =
    (videoSourceType === "local" && videoSrc) ||
    (videoSourceType === "youtube" && youtubeUrl);
  const rawVisibleTime = draftSeekTime ?? currentTimeDisplay;
  const visibleTime = isNaN(rawVisibleTime) || typeof rawVisibleTime !== 'number' ? 0 : rawVisibleTime;
  const safeDuration = isNaN(duration) || typeof duration !== 'number' || duration <= 0 ? 0 : duration;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setVideoSourceType("local")}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${videoSourceType === "local" ? "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/40 dark:border-sky-700/50 dark:text-sky-300" : "bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
          >
            Local Video
          </button>
          <button
            onClick={() => setVideoSourceType("youtube")}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${videoSourceType === "youtube" ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/40 dark:border-red-700/50 dark:text-red-300" : "bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
          >
            YouTube
          </button>
        </div>

        {videoSourceType === "local" && (
          <div className="flex flex-col gap-1">
            <button 
              onClick={handlePickLocalVideo}
              className="cursor-pointer flex items-center justify-center gap-1 text-xs bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 px-3 py-2 rounded-lg hover:bg-sky-100 transition-colors border border-sky-100 dark:border-sky-800/50"
            >
              <Upload size={14} />
              <span>{settings.uiLanguage === 'th' ? 'เลือกไฟล์วิดีโอจากเครื่อง' : 'Select Local Video'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {localFileName && !videoSrc && localVideoState !== 'idle' && (
              <div className="text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 p-3 rounded-lg text-center flex flex-col gap-2">
                <div>
                  {settings.uiLanguage === 'th' ? 'Project นี้มีการบันทึกไฟล์' : 'Project recorded video file'} <b>{localFileName}</b>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                  {localVideoState === 'loading' ? 'Checking file access' : localVideoState === 'permission-required' ? 'Permission required' : localVideoState === 'missing' ? 'File not found' : localVideoState === 'unsupported' ? 'Unsupported file' : localVideoState === 'denied' ? 'Access denied' : 'Unable to open'}
                </div>
                {canRestoreAccess ? (
                   <button 
                     onClick={handleRestoreAccess}
                     className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors"
                   >
                     {settings.uiLanguage === 'th' ? 'อนุญาตให้เข้าถึงไฟล์นี้อีกครั้ง (Restore Access)' : 'Restore Access'}
                   </button>
                ) : (
                   <div className="opacity-80">
                     {settings.uiLanguage === 'th' ? 'กรุณาเลือกไฟล์วิดีโอเดิมเพื่อเล่นต่อ' : 'Please re-select this file to continue playing.'}
                   </div>
                )}
              </div>
            )}
          </div>
        )}

        {videoSourceType === "youtube" && (
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <div className="relative flex-1 flex items-center">
                <Youtube
                  size={14}
                  className="absolute left-3 text-gray-400 pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="YouTube URL..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleYoutubeLoad()}
                  className="w-full pl-8 pr-14 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) {
                        setUrlInput(text);
                        showToast("วาง URL สำเร็จ");
                      } else {
                        showToast("ไม่มีข้อมูลในคลิปบอร์ด");
                      }
                    } catch (err) {
                      console.warn("Failed to read clipboard:", err);
                      showToast(
                        "ไม่สามารถวางได้อัตโนมัติ กรุณาใช้วิธีแตะค้างเพื่อวาง",
                      );
                    }
                  }}
                  className="absolute right-2 px-1.5 py-0.5 text-[9px] font-bold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded transition-colors"
                  title="วางจากคลิปบอร์ด"
                >
                  Paste
                </button>
              </div>
              <button
                onClick={handleYoutubeLoad}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Load
              </button>
            </div>
            <p className="text-[10px] text-gray-500 italic">
              {t('video.youtubeSeekNotice', settings.uiLanguage)}
            </p>
          </div>
        )}
      </div>

      {hasVideo ? (
        <div
          id="main-video-player"
          className={`flex flex-col relative rounded-lg overflow-hidden bg-black ${isHUDMode ? "fixed inset-0 w-[100vw] h-[100vh] z-[9999] rounded-none" : ""}`}
          ref={containerRef}
        >
          <SegmentPreviewPanel 
            isPlaying={isPlaying} 
            setIsPlaying={setIsPlaying} 
            seekTo={seekToSafe} 
            currentTime={currentTimeDisplay} 
          />
          <div className="flex flex-col relative w-full h-full">
            <div
              className="relative w-full flex items-center justify-center transition-all overflow-hidden"
              style={{
                height: isHUDMode
                  ? "100%"
                  : videoHeight === "auto"
                    ? "auto"
                    : `${videoHeight}px`,
                aspectRatio: isHUDMode
                  ? "auto"
                  : videoHeight === "auto"
                    ? "16/9"
                    : "auto",
                minHeight: "150px",
                filter: `brightness(${brightness})`,
                flex: isHUDMode ? 1 : undefined,
              }}
            >
              {/* Gesture Overlay */}
              {settings.enableVideoGestures !== false ? (
                <div
                  className={`absolute inset-0 z-20 touch-none ${videoSourceType === "youtube" && !actualPlaying ? "pointer-events-none" : ""}`}
                  onPointerDown={handleVideoPointerDown}
                  onPointerMove={handleVideoPointerMove}
                  onPointerUp={handleVideoPointerUp}
                  onPointerCancel={handleVideoPointerCancel}
                >
                  {gestureOverlayText && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 text-white px-4 py-2 rounded-xl text-lg font-bold pointer-events-none backdrop-blur-sm">
                      {gestureOverlayText}
                    </div>
                  )}
                </div>
              ) : (
                gestureOverlayText && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 text-white px-4 py-2 rounded-xl text-lg font-bold pointer-events-none backdrop-blur-sm z-20">
                    {gestureOverlayText}
                  </div>
                )
              )}

              <CourtZoneOverlay
                isVisible={showCourtOverlay || isCalibratingCourt}
                isCalibrating={isCalibratingCourt}
                onCalibrationComplete={(pts) => {
                  if (pts.length === 4) {
                    updateProjectVideoCalibration({ tl: pts[0], tr: pts[1], bl: pts[2], br: pts[3] });
                  }
                  setIsCalibratingCourt(false);
                  setShowCourtOverlay(true);
                }}
                onCalibrationCancel={() => {
                  setIsCalibratingCourt(false);
                  setShowCourtOverlay(!!activeProject?.videoMeta?.courtCalibration);
                }}
                calibrationPoints={activeProject?.videoMeta?.courtCalibration}
              />

              {isLoadingVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10 pointer-events-none">
                  <p className="text-white">
                    {t("video.loading", settings.uiLanguage)}
                  </p>
                </div>
              )}

              {isAutoplayBlocked && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
                  <button
                    onClick={() => {
                      setIsAutoplayBlocked(false);
                      playSafe();
                    }}
                    className="bg-sky-600 hover:bg-sky-500 text-white rounded-full px-6 py-3 font-bold flex items-center gap-2 shadow-lg"
                  >
                    <Play size={24} />
                    {t("video.tapToStart", settings.uiLanguage)}
                  </button>
                  <p className="text-white/80 text-sm mt-4 text-center px-4 max-w-sm">
                    {t("video.autoplayBlockedHelp", settings.uiLanguage)}
                  </p>
                </div>
              )}

              {playerError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/95 border border-red-500/30 z-30 p-6 text-center overflow-y-auto backdrop-blur-md">
                  <div className="max-w-md w-full space-y-4">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-red-500 text-3xl">⚠️</span>
                      <h3 className="text-red-400 font-bold text-base md:text-lg">
                        {t('video.playbackFailed', settings.uiLanguage)}
                      </h3>
                    </div>

                    <p className="text-white/90 text-xs md:text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-center">
                      {localizedPlayerError}
                    </p>

                    {/* Diagnostics Box */}
                    <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 text-left font-mono text-[10px] sm:text-xs text-white/80 space-y-1.5 shadow-inner">
                      <div className="text-[11px] font-bold text-sky-400 border-b border-white/5 pb-1 mb-1.5 uppercase tracking-wider flex justify-between items-center">
                        <span>Diagnostics Information</span>
                        {videoSourceType === "youtube" && youtubeVideoId && (
                          <button
                            onClick={() => {
                              const origin = window.location.origin;
                              const embedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?enablejsapi=1&origin=${origin}`;
                              const externalWindow = window.open(embedUrl, "_blank", "noopener,noreferrer");
                              if (externalWindow) externalWindow.opener = null;
                            }}
                            className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded text-[9px] transition-colors"
                          >
                            Test YouTube Embed
                          </button>
                        )}
                      </div>
                      <div>
                        <span className="text-white/40">ReactPlayer:</span>{" "}
                        <span className="text-white/60">
                          v3.4.0 (using prop: src)
                        </span>
                      </div>
                      <div>
                        <span className="text-white/40">Video ID:</span>{" "}
                        <span className="text-sky-300 font-bold">
                          {youtubeVideoId || "Unknown"}
                        </span>
                      </div>
                      <div className="truncate">
                        <span className="text-white/40">URL:</span>{" "}
                        <span className="text-white/60 text-[9px]">
                          {youtubeUrl || "Unknown"}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/40">State:</span>{" "}
                        <span className="text-white/60">
                          req: {requestedPlaying ? "Y" : "N"}, act:{" "}
                          {actualPlaying ? "Y" : "N"}, ready:{" "}
                          {playerReady ? "Y" : "N"}, blocked:{" "}
                          {isAutoplayBlocked ? "Y" : "N"}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/40">Error Type:</span>{" "}
                        <span className="text-amber-400 font-semibold">
                          {playerErrorType || "unknown"}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/40">Error Code:</span>{" "}
                        <span className="text-white font-semibold">
                          {playerErrorCode !== null ? playerErrorCode : "None"}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/40">Browser Mode:</span>{" "}
                        <span className="text-white/60">
                          {window.isSecureContext
                            ? "Secure (HTTPS/Localhost)"
                            : "Insecure"}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/40">Iframe Context:</span>{" "}
                        <span className="text-white/60">
                          {window.self !== window.top
                            ? "Yes (Google AI Studio Preview อาจจำกัด YouTube embed)"
                            : "No (Direct Tab)"}
                        </span>
                      </div>
                      <div className="truncate">
                        <span className="text-white/40">Origin:</span>{" "}
                        <span className="text-white/60 text-[9px]">
                          {window.location.origin}
                        </span>
                      </div>
                      <div className="truncate">
                        <span className="text-white/40">User Agent:</span>{" "}
                        <span className="text-white/60 text-[9px]">
                          {navigator.userAgent.substring(0, 50)}...
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons Row */}
                    <div className="grid grid-cols-2 gap-2 justify-center pointer-events-auto w-full">
                      {videoSourceType === "youtube" && (
                        <>
                          <button
                            onClick={() => handleYoutubeLoad()}
                            className="px-3.5 py-2.5 bg-sky-600 text-white rounded-xl hover:bg-sky-500 font-bold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5"
                          >
                            {t("video.tryReload", settings.uiLanguage)}
                          </button>
                          <a
                            href={youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 font-bold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5"
                          >
                            {t("video.openYoutube", settings.uiLanguage)}
                          </a>
                          <button
                            onClick={() => {
                              if (
                                navigator.clipboard &&
                                window.isSecureContext
                              ) {
                                navigator.clipboard
                                  .writeText(youtubeUrl)
                                  .catch(() => {});
                              } else {
                                const textArea =
                                  document.createElement("textarea");
                                textArea.value = youtubeUrl;
                                document.body.appendChild(textArea);
                                textArea.select();
                                try {
                                  document.execCommand("copy");
                                } catch (e) {}
                                document.body.removeChild(textArea);
                              }
                              showToast(t("video.urlCopied", settings.uiLanguage));
                            }}
                            className="px-3.5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-xs transition-all active:scale-95 border border-white/10 flex items-center justify-center gap-1.5"
                          >
                            {t("video.copyUrl", settings.uiLanguage)}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setVideoSourceType("local");
                          setPlayerError(null);
                          setPlayerErrorType(null);
                          setPlayerErrorCode(null);
                          setTimeout(() => {
                            fileInputRef.current?.click();
                          }, 100);
                        }}
                        className="px-3.5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-xs transition-all active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                      >
                        Local Video
                      </button>
                      <button
                        onClick={() => {
                          setVideoSourceType("local");
                          setVideoSrc(null);
                          setPlayerError(null);
                          setPlayerErrorType(null);
                          setPlayerErrorCode(null);
                        }}
                        className="px-3.5 py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 col-span-2 mt-1"
                      >
                        {t("video.continueWithoutVideo", settings.uiLanguage)}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    Loading player...
                  </div>
                }
              >
                {(() => {
                  const currentVideoSrc =
                    videoSourceType === "local"
                      ? (videoSrc ?? undefined)
                      : youtubeUrl || undefined;
                  const Player = ReactPlayer as React.ElementType;
                  return (
                    <Player
                      key={`${videoSourceType}-${currentVideoSrc}`}
                      ref={playerRef}
                      src={currentVideoSrc}
                      playing={isPlaying}
                      playbackRate={playbackRate}
                      volume={volume}
                      controls={false}
                      width="100%"
                      height="100%"
                      playsInline
                      progressInterval={100}
                      onProgress={({ playedSeconds }) => {
                        if (isScrubbing) return;
                        if (!Number.isFinite(playedSeconds) || playedSeconds < 0) return;
                        setCurrentTimeDisplay(playedSeconds);
                        setVideoTime(playedSeconds);
                    title="เปิดโหมด HUD เต็มจอสำหรับ Scouting"
                  >
                    <MonitorPlay size={16} />
                    <span className="text-[10px] font-bold hidden sm:inline">
                      HUD Mode
                    </span>
                  </button>
                )}
                <button
                  onClick={() => setShowFineControls(!showFineControls)}
                  className={`p-2 rounded-full ${showFineControls ? "bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-400" : "bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}
                  title="Fine Controls"
                >
                  <Settings2 size={16} />
                </button>
              </div>
            </div>

            {showFineControls && (
              <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => seekBySafe(-5)}
                  className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs hover:bg-gray-200"
                >
                  -5s
                </button>
                <button
                  onClick={() => seekBySafe(-0.1)}
                  className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs hover:bg-gray-200"
                >
                  -0.1s
                </button>
                <button
                  onClick={() => seekBySafe(0.1)}
                  className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs hover:bg-gray-200"
                >
                  +0.1s
                </button>
                <button
                  onClick={() => seekBySafe(5)}
                  className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs hover:bg-gray-200"
                >
                  +5s
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
