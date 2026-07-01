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

export default function VideoPlayer() {
  const playerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");

  const [requestedPlaying, setRequestedPlaying] = useState(false);
  const [actualPlaying, setActualPlaying] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerErrorType, setPlayerErrorType] = useState<string | null>(null);
  const [playerErrorCode, setPlayerErrorCode] = useState<number | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [useNativeIframe, setUseNativeIframe] = useState(false);

  // Use requestedPlaying for the Player component.
  const isPlaying = requestedPlaying;

  const setIsPlaying = useCallback((play: boolean) => {
    setRequestedPlaying(play);
    if (!play) {
      setActualPlaying(false);
    }
  }, []);

  const [isHUDMode, setIsHUDMode] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () =>
      setIsPortrait(window.innerHeight > window.innerWidth);
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    return () => window.removeEventListener("resize", checkOrientation);
  }, []);

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

  const { updateProjectLastVideoTime } = useWorkspace();

  // Timeline State
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draftSeekTime, setDraftSeekTime] = useState<number | null>(null);
  const draftSeekTimeRef = useRef<number | null>(null);
  const [volume, setVolume] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [gestureOverlayText, setGestureOverlayText] = useState<string | null>(
    null,
  );
  const [showFineControls, setShowFineControls] = useState(false);

  const [videoHeight, setVideoHeight] = useState<number | "auto">("auto");
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper functions
  const getPlayer = useCallback(() => playerRef.current as any, []);
  const getInternalPlayer = useCallback(
    () => getPlayer()?.getInternalPlayer?.(),
    [getPlayer],
  );

  const getCurrentTimeSafe = useCallback((): number => {
    const player = getPlayer();
    const internal = getInternalPlayer();

    if (typeof player?.currentTime === "number") return player.currentTime;
    if (typeof player?.getCurrentTime === "function")
      return player.getCurrentTime();
    if (typeof internal?.getCurrentTime === "function")
      return internal.getCurrentTime();

    return currentTimeDisplay || 0;
  }, [getPlayer, getInternalPlayer, currentTimeDisplay]);

  useEffect(() => {
    getCurrentTimeRef.current = getCurrentTimeSafe;
    return () => {
      const lastTime = currentTimeDisplay;
      getCurrentTimeRef.current = () => lastTime;
    };
  }, [getCurrentTimeSafe, getCurrentTimeRef, currentTimeDisplay]);

  const getDurationSafe = useCallback((): number => {
    const player = getPlayer();
    const internal = getInternalPlayer();

    if (
      typeof player?.duration === "number" &&
      Number.isFinite(player.duration)
    )
      return player.duration;
    if (typeof player?.getDuration === "function") return player.getDuration();
    if (typeof internal?.getDuration === "function")
      return internal.getDuration();

    return duration || 0;
  }, [getPlayer, getInternalPlayer, duration]);

  const seekToSafe = useCallback(
    (seconds: number) => {
      const player = getPlayer();
      const internal = getInternalPlayer();

      const maxDuration = getDurationSafe();
      const safeTarget = Math.max(
        0,
        maxDuration ? Math.min(seconds, maxDuration) : seconds,
      );

      try {
        if (player && "currentTime" in player) {
          player.currentTime = safeTarget;
        } else if (typeof player?.seekTo === "function") {
          player.seekTo(safeTarget, "seconds");
        } else if (typeof internal?.seekTo === "function") {
          internal.seekTo(safeTarget, true);
        }

        setCurrentTimeDisplay(safeTarget);
        setVideoTime(safeTarget);
      } catch (error) {
        console.warn("Seek failed:", error);
      }
    },
    [getPlayer, getInternalPlayer, getDurationSafe, setVideoTime],
  );

  const seekBySafe = useCallback(
    (delta: number) => {
      seekToSafe(getCurrentTimeSafe() + delta);
    },
    [getCurrentTimeSafe, seekToSafe],
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      if (!isFs && isHUDMode) {
        closeHUDMode("fullscreen_exit");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [isHUDMode]);

  const enterHUDMode = () => {
    setIsHUDMode(true);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("hud-active");
    containerRef.current?.requestFullscreen?.().catch(() => {});
  };

  const closeHUDMode = async (reason?: string) => {
    console.log(`Exiting HUD Mode${reason ? ": " + reason : ""}`);
    setIsHUDMode(false);

    // Clear any potential HUD-specific overlay styles

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn("Failed to exit fullscreen", e);
    }

    try {
      if (screen.orientation && "unlock" in screen.orientation) {
        (screen.orientation as any).unlock?.();
      }
    } catch (e) {}

    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.body.classList.remove("hud-active");

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  };

  const playSafe = useCallback(() => {
    const player = getPlayer();
    const internal = getInternalPlayer();
    try {
      if (typeof player?.play === "function") {
        const p = player.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else if (typeof internal?.playVideo === "function") {
        const p = internal.playVideo();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else if (typeof internal?.play === "function") {
        const p = internal.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
      setIsPlaying(true);
    } catch (error) {
      console.warn("Play failed:", error);
      setIsPlaying(true); // optimistically
    }
  }, [getPlayer, getInternalPlayer, setIsPlaying]);

  const pauseSafe = useCallback(() => {
    const player = getPlayer();
    const internal = getInternalPlayer();
    try {
      if (typeof player?.pause === "function") player.pause();
      else if (typeof internal?.pauseVideo === "function")
        internal.pauseVideo();
      setIsPlaying(false);
      
      const currentTime = getCurrentTimeSafe();
      updateProjectLastVideoTime(currentTime);
    } catch (error) {
      console.warn("Pause failed:", error);
      setIsPlaying(false);
    }
  }, [getPlayer, getInternalPlayer, setIsPlaying, getCurrentTimeSafe, updateProjectLastVideoTime]);

  const setVolumeSafe = useCallback(
    (nextVolume: number) => {
      const clamped = Math.max(0, Math.min(1, nextVolume));
      const player = getPlayer();
      const internal = getInternalPlayer();

      try {
        if (player && "volume" in player) {
          player.volume = clamped;
        }
        if (typeof internal?.setVolume === "function") {
          internal.setVolume(Math.round(clamped * 100));
        }
        setVolume(clamped);
      } catch (error) {
        console.warn("Volume failed:", error);
        setVolume(clamped);
      }
    },
    [getPlayer, getInternalPlayer],
  );

  const setSpeedSafe = useCallback(
    (rate: number) => {
      const player = getPlayer();
      const internal = getInternalPlayer();
      try {
        if (player && "playbackRate" in player) {
          player.playbackRate = rate;
        }
        if (typeof internal?.setPlaybackRate === "function") {
          internal.setPlaybackRate(rate);
        }
        setPlaybackRate(rate);
      } catch (error) {
        console.warn("Playback rate failed:", error);
        setPlaybackRate(rate);
      }
    },
    [getPlayer, getInternalPlayer],
  );

  const togglePlay = () => {
    if (isPlaying) pauseSafe();
    else playSafe();
  };

  useEffect(() => {
    if (seekRequest !== null) {
      seekToSafe(seekRequest);
      if (settings.autoPlayAfterSeek !== false) {
        playSafe();
      }
      setSeekRequest(null);
    }
  }, [
    seekRequest,
    setSeekRequest,
    seekToSafe,
    playSafe,
    settings.autoPlayAfterSeek,
  ]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isResizing) return;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newHeight = clientY - rect.top;
        if (newHeight >= 100 && newHeight <= window.innerHeight * 0.8) {
          setVideoHeight(newHeight);
        }
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("touchmove", handleMouseMove, {
        passive: false,
      });
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchend", handleMouseUp);
      document.body.style.userSelect = "none";
    } else {
      document.body.style.userSelect = "";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchmove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchend", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (videoSrc && videoSourceType === "local") {
        URL.revokeObjectURL(videoSrc);
      }
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setLocalFileName(file.name);
      setVideoSourceType("local");
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
  }, [isLoadingVideo, playerReady]);

  const handlePlayerReady = () => {
    setPlayerReady(true);
    setIsLoadingVideo(false);
    setPlayerError(null);
    setPlayerErrorType(null);
    setPlayerErrorCode(null);
  };

  const handlePlayerError = (error: any) => {
    console.warn("ReactPlayer / YouTube Error:", error);
    let message = "ไม่สามารถโหลดวิดีโอได้";
    let type = "unknown";
    let code: number | null = null;

    if (error && typeof error === "number") {
      code = error;
      if (error === 2) {
        type = "invalid_parameter";
        message = "พารามิเตอร์ที่ส่งไปยัง YouTube player ไม่ถูกต้อง";
      } else if (error === 5) {
        type = "html5_error";
        message = "เกิดข้อผิดพลาดกับ HTML5 player";
      } else if (error === 100) {
        type = "private_or_removed";
        message = "วิดีโอนี้เป็นวิดีโอส่วนตัว หรือถูกลบออกไปแล้ว";
      } else if (error === 101 || error === 150) {
        type = "embed_disabled";
        message =
          "เจ้าของวิดีโอไม่อนุญาตให้ฝังเล่นบนเว็บไซต์อื่นภายนอก YouTube";
      } else if (error === 153) {
        type = "preview_iframe_restricted";
        message =
          "ไม่พบสิทธิ์ Referer หรือ client identity ใน Preview iframe นี้";
      } else {
        type = "unknown";
        message = `YouTube Error (Error Code: ${error})`;
      }
    } else if (videoSourceType === "youtube") {
      type = "browser_blocked";
      message =
        "ไม่สามารถเล่น YouTube นี้ได้ อาจเกิดจากคลิปไม่อนุญาตให้ฝัง, คลิปเป็น private/removed, browser block third-party embed, หรือเปิดผ่าน preview iframe ที่จำกัดสิทธิ์";
    }

    setPlayerError(message);
    setPlayerErrorType(type);
    setPlayerErrorCode(code);
    setIsLoadingVideo(false);
    setIsPlaying(false);
  };

  function handleTimeUpdate(event: any) {
    if (isScrubbing) return;
    const time = event?.currentTarget?.currentTime ?? getCurrentTimeSafe();
    if (Number.isFinite(time)) {
      setCurrentTimeDisplay(time);
      setVideoTime(time);
    }
    const safeDuration = getDurationSafe();
    if (safeDuration && safeDuration !== duration) {
      setDuration(safeDuration);
    }
  }

  function handleDuration(nextDuration: number) {
    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      setDuration(nextDuration);
    }
  }

  useEffect(() => {
    if (requestedPlaying && !actualPlaying && videoSourceType === "youtube") {
      const timer = window.setTimeout(() => {
        setIsAutoplayBlocked(true);
      }, 4000);
      return () => window.clearTimeout(timer);
    }
  }, [requestedPlaying, actualPlaying, videoSourceType]);

  // Polling fallback
  useEffect(() => {
    if (!isPlaying || isScrubbing) return;
    const timer = window.setInterval(() => {
      const time = getCurrentTimeSafe();
      const dur = getDurationSafe();
      if (Number.isFinite(time)) {
        setCurrentTimeDisplay(time);
        setVideoTime(time);
      }
      if (dur && Number.isFinite(dur)) {
        setDuration(dur);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [
    isPlaying,
    isScrubbing,
    videoSourceType,
    youtubeUrl,
    videoSrc,
    getCurrentTimeSafe,
    getDurationSafe,
    setVideoTime,
  ]);

  const handleSeekPointerDown = () => setIsScrubbing(true);

  const handleSeekInput = (e: React.FormEvent<HTMLInputElement>) => {
    const nextTime = Number((e.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(nextTime)) return;
    draftSeekTimeRef.current = nextTime;
    setDraftSeekTime(nextTime);
    setCurrentTimeDisplay(nextTime);
  };

  const handleSeekPointerUp = () => {
    const finalTime = draftSeekTimeRef.current;
    if (finalTime !== null) {
      seekToSafe(finalTime);
    }
    setIsScrubbing(false);
    draftSeekTimeRef.current = null;
    setDraftSeekTime(null);
  };

  const handleSeekCancel = () => {
    setIsScrubbing(false);
    draftSeekTimeRef.current = null;
    setDraftSeekTime(null);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.tagName === "SELECT"
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekBySafe(e.shiftKey ? -1 : -3);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekBySafe(e.shiftKey ? 1 : 3);
      } else if (e.key === "[") {
        e.preventDefault();
        seekBySafe(-1);
      } else if (e.key === "]") {
        e.preventDefault();
        seekBySafe(1);
      } else if (e.key === ",") {
        setSpeedSafe(Math.max(0.25, playbackRate - 0.25));
      } else if (e.key === ".") {
        setSpeedSafe(Math.min(2, playbackRate + 0.25));
      } else if (e.key === "0") {
        setSpeedSafe(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isPlaying,
    videoSrc,
    youtubeUrl,
    videoSourceType,
    playbackRate,
    seekBySafe,
    setSpeedSafe,
  ]);

  // Gestures
  const [gestureStart, setGestureStart] = useState<{
    x: number;
    y: number;
    time: number;
    vol: number;
    bright: number;
  } | null>(null);
  const [lastTapTime, setLastTapTime] = useState(0);

  const handleVideoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (settings.enableVideoGestures === false) return;

    // Check Double Tap
    const now = Date.now();
    if (now - lastTapTime < 300) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isLeft = e.clientX < rect.left + rect.width / 2;
      const step = settings.doubleTapSeekStep || 3;
      seekBySafe(isLeft ? -step : step);
      showGestureOverlayText(isLeft ? `-${step}s` : `+${step}s`);
      setLastTapTime(0);
      return;
    }
    setLastTapTime(now);

    e.currentTarget.setPointerCapture(e.pointerId);
    setGestureStart({
      x: e.clientX,
      y: e.clientY,
      time: getCurrentTimeSafe(),
      vol: volume,
      bright: brightness,
    });
  };

  const handleVideoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!gestureStart || settings.enableVideoGestures === false) return;

    const dx = e.clientX - gestureStart.x;
    const dy = e.clientY - gestureStart.y;

    // Determine gesture type based on primary movement axis
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      // Horizontal swipe = scrub
      const sensitivity = settings.swipeSensitivity || 0.03;
      const deltaSec = dx * sensitivity;
      const targetTime = gestureStart.time + deltaSec;
      const maxDur = getDurationSafe();
      const safeTime = Math.max(0, Math.min(targetTime, maxDur || targetTime));

      showGestureOverlayText(
        `${deltaSec > 0 ? "+" : ""}${deltaSec.toFixed(1)}s`,
      );

      if (settings.liveScrub) {
        seekToSafe(safeTime);
      } else {
        draftSeekTimeRef.current = safeTime;
        setDraftSeekTime(safeTime);
        setCurrentTimeDisplay(safeTime);
      }
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      // Vertical swipe
      const rect = e.currentTarget.getBoundingClientRect();
      const isRightSide = gestureStart.x > rect.left + rect.width / 2;

      // dy negative means swipe UP (increase)
      const delta = -(dy / rect.height) * 1.5;

      if (isRightSide) {
        const newVol = Math.max(0, Math.min(1, gestureStart.vol + delta));
        setVolumeSafe(newVol);
        showGestureOverlayText(`Volume ${Math.round(newVol * 100)}%`);
      } else {
        const newBright = Math.max(
          0.5,
          Math.min(2, gestureStart.bright + delta),
        );
        setBrightness(newBright);
        showGestureOverlayText(`Brightness ${Math.round(newBright * 100)}%`);
      }
    }
  };

  const handleVideoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const finalTime = draftSeekTimeRef.current;
    if (finalTime !== null && !settings.liveScrub) {
      seekToSafe(finalTime);
    }
    draftSeekTimeRef.current = null;
    setDraftSeekTime(null);
    setGestureStart(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
    hideGestureOverlayText();
  };

  const handleVideoPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    draftSeekTimeRef.current = null;
    setDraftSeekTime(null);
    setGestureStart(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
    hideGestureOverlayText();
  };

  const overlayTimerRef = useRef<number | null>(null);
  const showGestureOverlayText = (text: string) => {
    if (settings.showGestureOverlay === false) return;
    setGestureOverlayText(text);
    if (overlayTimerRef.current !== null)
      window.clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = window.setTimeout(
      () => setGestureOverlayText(null),
      800,
    );
  };
  const hideGestureOverlayText = () => {
    if (overlayTimerRef.current !== null)
      window.clearTimeout(overlayTimerRef.current);
    setGestureOverlayText(null);
  };

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
            <label className="cursor-pointer flex items-center justify-center gap-1 text-xs bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 px-3 py-2 rounded-lg hover:bg-sky-100 transition-colors border border-sky-100 dark:border-sky-800/50">
              <Upload size={14} />
              <span>เลือกไฟล์วิดีโอจากเครื่อง</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            {localFileName && !videoSrc && (
              <div className="text-xs text-orange-500 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-2 rounded-lg text-center">
                Project นี้มีการบันทึกไฟล์ <b>{localFileName}</b>
                <br />
                กรุณาเลือกไฟล์วิดีโอเดิมเพื่อเล่นต่อ
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
              YouTube อาจ seek ไม่ได้ละเอียดเท่า local video
              หากต้องการความแม่นยำสูงแนะนำให้ใช้ Local Video
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
          <div className="flex flex-col relative w-full h-full">
            {isHUDMode && (
              <ScoutHUDWrapper
                onClose={closeHUDMode}
                containerRef={containerRef}
                isPortrait={isPortrait}
                videoControls={{
                  play: playSafe,
                  pause: pauseSafe,
                  togglePlay,
                  seekBy: seekBySafe,
                  seekTo: seekToSafe,
                  setSpeed: setSpeedSafe,
                  getCurrentTime: getCurrentTimeSafe,
                  getDuration: getDurationSafe,
                  isPlaying,
                  playbackRate,
                  videoError: playerError,
                  retryVideo: () => {
                    if (videoSourceType === "youtube") {
                      handleYoutubeLoad();
                    } else {
                      setPlayerError(null);
                      setPlayerErrorType(null);
                      setPlayerErrorCode(null);
                    }
                  },
                }}
              />
            )}
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

              {isLoadingVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10 pointer-events-none">
                  <p className="text-white">กำลังโหลดวิดีโอ...</p>
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
                    Tap to Start YouTube
                  </button>
                  <p className="text-white/80 text-sm mt-4 text-center px-4 max-w-sm">
                    เบราว์เซอร์บล็อกการเล่นอัตโนมัติ กรุณาแตะปุ่มเพื่อเริ่มเล่น
                    หรือแตะที่ตัววิดีโอโดยตรง
                  </p>
                </div>
              )}

              {playerError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/95 border border-red-500/30 z-30 p-6 text-center overflow-y-auto backdrop-blur-md">
                  <div className="max-w-md w-full space-y-4">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-red-500 text-3xl">⚠️</span>
                      <h3 className="text-red-400 font-bold text-base md:text-lg">
                        โหลดหรือเล่นวิดีโอไม่สำเร็จ (Load / Playback Failed)
                      </h3>
                    </div>

                    <p className="text-white/90 text-xs md:text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-center">
                      {playerError}
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
                              window.open(embedUrl, "_blank");
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
                            Try Reload
                          </button>
                          <a
                            href={youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 font-bold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5"
                          >
                            Open YouTube
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
                              showToast("คัดลอก URL แล้ว");
                            }}
                            className="px-3.5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-xs transition-all active:scale-95 border border-white/10 flex items-center justify-center gap-1.5"
                          >
                            Copy URL
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
                        className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5"
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
                        Continue Scouting Without Video
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
                  const Player = ReactPlayer as any;
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
                      onProgress={({ playedSeconds }) => {
                        if (isScrubbing) return;
                        setCurrentTimeDisplay(playedSeconds);
                        setVideoTime(playedSeconds);
                        
                        // Auto-save time periodically
                        if (Math.floor(playedSeconds) % 15 === 0) {
                           updateProjectLastVideoTime(playedSeconds);
                        }
                      }}
                      onDuration={(d: number) => {
                        if (Number.isFinite(d) && d > 0) setDuration(d);
                      }}
                      onTimeUpdate={handleTimeUpdate}
                      onDurationChange={(event: any) => {
                        const d =
                          event?.currentTarget?.duration ?? getDurationSafe();
                        if (Number.isFinite(d) && d > 0) setDuration(d);
                      }}
                      onReady={handlePlayerReady}
                      onPlaying={() => {
                        setIsLoadingVideo(false);
                        setPlayerReady(true);
                        setPlayerError(null);
                        setActualPlaying(true);
                        setIsAutoplayBlocked(false);
                      }}
                      onWaiting={() => {
                        // optional buffering state
                      }}
                      onError={handlePlayerError}
                      config={
                        {
                          youtube: {
                            playerVars: {
                              rel: 0,
                              playsinline: 1,
                              modestbranding: 1,
                              enablejsapi: 1,
                              origin: window.location.origin,
                            },
                          },
                        } as any
                      }
                    />
                  );
                })()}
              </Suspense>
            </div>

            {!isHUDMode && (
              <>
                <div className="flex flex-col w-full z-30 bg-gray-900 border-t border-gray-800 p-3 relative">
                  {/* Draft time absolute tooltip above thumb */}
                  {isScrubbing && safeDuration > 0 && (
                    <div
                      className="absolute top-0 -mt-6 bg-sky-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow z-40 transform -translate-x-1/2 pointer-events-none"
                      style={{
                        left: `calc(4rem + 0.75rem + ${(Math.min(visibleTime, safeDuration) / safeDuration) * 100}% * calc(100% - 8rem - 1.5rem))`,
                      }}
                    >
                      {formatPreciseTime(visibleTime)}
                    </div>
                  )}
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-[10px] font-mono text-gray-400 w-16 text-right shrink-0">
                      {formatPreciseTime(visibleTime)}
                    </span>
                    <div className="relative flex-1 h-8 flex items-center group">
                      {/* Custom Track */}
                      <div className="absolute left-0 right-0 h-2 bg-gray-700 rounded-full overflow-hidden pointer-events-none">
                        <div
                          className="h-full bg-sky-500 transition-none"
                          style={{
                            width: `${safeDuration > 0 ? (visibleTime / safeDuration) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      {/* Custom Thumb */}
                      <div
                        className="absolute h-3 w-3 bg-white rounded-full pointer-events-none shadow-sm -ml-1.5 transition-transform group-hover:scale-125"
                        style={{
                          left: `${safeDuration > 0 ? (Math.min(visibleTime, safeDuration) / safeDuration) * 100 : 0}%`,
                        }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={safeDuration}
                        step={0.01}
                        value={Math.min(visibleTime, safeDuration || visibleTime)}
                        onPointerDown={handleSeekPointerDown}
                        onInput={handleSeekInput}
                        onPointerUp={handleSeekPointerUp}
                        onPointerCancel={handleSeekCancel}
                        aria-label="Video timeline"
                        aria-valuemin={0}
                        aria-valuemax={safeDuration}
                        aria-valuenow={visibleTime}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      />
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 w-16 shrink-0">
                      {formatPreciseTime(safeDuration)}
                    </span>
                  </div>
                </div>

                <div
                  className="h-3 bg-gray-800 cursor-row-resize flex items-center justify-center hover:bg-gray-700 transition-colors z-30 border-t border-gray-900"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                  }}
                  onTouchStart={() => setIsResizing(true)}
                  onDoubleClick={() => setVideoHeight("auto")}
                  title="ลากเพื่อปรับขนาด (ดับเบิลคลิกเพื่อรีเซ็ต)"
                >
                  <div className="w-12 h-1 bg-gray-600 rounded-full" />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 dark:bg-gray-900 aspect-video rounded-lg flex items-center justify-center border border-dashed border-gray-300 dark:border-gray-700">
          <p className="text-gray-400 dark:text-gray-500 text-sm text-center px-4">
            {videoSourceType === "local"
              ? "ยังไม่ได้เลือกไฟล์วิดีโอ"
              : "ยังไม่ได้ใส่ URL YouTube"}
            <br />
            (สามารถบันทึกข้อมูลได้โดยไม่ต้องมีวิดีโอ)
          </p>
        </div>
      )}

      {hasVideo && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-mono text-gray-500 px-1">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setVideoTime(getCurrentTimeSafe());
                  showToast("Mark time แล้ว");
                }}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              >
                Mark Time
              </button>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap gap-1 justify-end">
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setSpeedSafe(speed)}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${playbackRate === speed ? "bg-sky-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2 sm:gap-4 relative">
              <button
                onClick={() => seekBySafe(-3)}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                title="-3s (Left)"
              >
                <Rewind size={18} />
                <span className="text-[10px] block -mt-1">-3s</span>
              </button>
              <button
                onClick={() => seekBySafe(-1)}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                title="-1s (Alt+Left)"
              >
                <span className="text-xs font-bold block">-1s</span>
              </button>

              <button
                onClick={togglePlay}
                className="p-4 rounded-full bg-sky-600 text-white hover:bg-sky-700 shadow-md mx-2"
                title="Play/Pause (Space)"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <button
                onClick={() => seekBySafe(1)}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                title="+1s (Alt+Right)"
              >
                <span className="text-xs font-bold block">+1s</span>
              </button>
              <button
                onClick={() => seekBySafe(3)}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                title="+3s (Right)"
              >
                <FastForward size={18} />
                <span className="text-[10px] block -mt-1">+3s</span>
              </button>

              <div className="absolute right-0 flex items-center gap-1">
                {settings.enableScoutHUDMode !== false && (
                  <button
                    onClick={enterHUDMode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-400 hover:bg-sky-200 dark:hover:bg-sky-800"
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
