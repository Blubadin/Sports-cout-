import { useState, useRef, useCallback, useEffect } from "react";
import type { AppSettings } from '../types';
import { t } from '../i18n';

interface PlayerInstance {
  currentTime?: number;
  getCurrentTime?: () => number;
  duration?: number;
  getDuration?: () => number;
  getInternalPlayer?: () => any;
  seekTo?: (amount: number, type?: string) => void;
}

interface UseVideoPlaybackProps {
  playerRef: React.MutableRefObject<PlayerInstance | HTMLVideoElement | null>;
  videoSrc: string | null;
  youtubeUrl: string | null;
  videoSourceType: string;
  setVideoTime: (time: number) => void;
  settings: AppSettings;
  seekRequest: number | null;
  setSeekRequest: (req: number | null) => void;
  getCurrentTimeRef: React.MutableRefObject<(() => number) | null>;
  updateProjectLastVideoTime: (time: number) => void;
}

export function useVideoPlayback({
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
}: UseVideoPlaybackProps) {
  const [playbackRate, setPlaybackRate] = useState(1);
  const [requestedPlaying, setRequestedPlaying] = useState(false);
  const [actualPlaying, setActualPlaying] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerErrorType, setPlayerErrorType] = useState<string | null>(null);
  const [playerErrorCode, setPlayerErrorCode] = useState<number | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [useNativeIframe, setUseNativeIframe] = useState(false);

  const isPlaying = requestedPlaying;

  const setIsPlaying = useCallback((play: boolean) => {
    setRequestedPlaying(play);
    if (!play) {
      setActualPlaying(false);
    }
  }, []);

  const [currentTimeDisplay, setCurrentTimeDisplay] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draftSeekTime, setDraftSeekTime] = useState<number | null>(null);
  const draftSeekTimeRef = useRef<number | null>(null);
  const [volume, setVolume] = useState(1);
  const [brightness, setBrightness] = useState(1);

  // Helper functions
  const getPlayer = useCallback(() => playerRef.current as (PlayerInstance & HTMLVideoElement) | null, [playerRef]);
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

  const isTransitioningRef = useRef(false);

  const playSafe = useCallback(() => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

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
    } finally {
      setTimeout(() => { isTransitioningRef.current = false; }, 150);
    }
  }, [getPlayer, getInternalPlayer, setIsPlaying]);

  const pauseSafe = useCallback(() => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

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
    } finally {
      setTimeout(() => { isTransitioningRef.current = false; }, 150);
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

  const lastToggleTimeRef = useRef(0);

  const togglePlay = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 200) return;
    lastToggleTimeRef.current = now;

    if (isPlaying) pauseSafe();
    else playSafe();
  }, [isPlaying, pauseSafe, playSafe]);

  useEffect(() => {
    if (seekRequest !== null) {
      seekToSafe(seekRequest);
      if (settings.autoPlayAfterSeek !== false) {
        if (isTransitioningRef.current) {
          const pollTimer = setInterval(() => {
            if (!isTransitioningRef.current) {
              clearInterval(pollTimer);
              playSafe();
            }
          }, 50);
          setTimeout(() => clearInterval(pollTimer), 1000);
        } else {
          playSafe();
        }
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

  const handlePlayerError = useCallback((error: any) => {
    console.warn("ReactPlayer / YouTube Error:", error);
    let message = t('video.errorLoad', settings.uiLanguage);
    let type = "unknown";
    let code: number | null = null;

    if (error && typeof error === "number") {
      code = error;
      if (error === 2) {
        type = "invalid_parameter";
        message = t('video.errorInvalidParameter', settings.uiLanguage);
      } else if (error === 5) {
        type = "html5_error";
        message = t('video.errorHtml5', settings.uiLanguage);
      } else if (error === 100) {
        type = "private_or_removed";
        message = t('video.errorPrivateRemoved', settings.uiLanguage);
      } else if (error === 101 || error === 150) {
        type = "embed_disabled";
        message = t('video.errorEmbedDisabled', settings.uiLanguage);
      } else if (error === 153) {
        type = "preview_iframe_restricted";
        message = t('video.errorPreviewRestricted', settings.uiLanguage);
      } else {
        type = "unknown";
        message = `YouTube Error (Error Code: ${error})`;
      }
    } else if (videoSourceType === "youtube") {
      type = "browser_blocked";
      message = t('video.errorBrowserBlocked', settings.uiLanguage);
    }

    setPlayerError(message);
    setPlayerErrorType(type);
    setPlayerErrorCode(code);
    setIsLoadingVideo(false);
    setIsPlaying(false);
  }, [settings.uiLanguage, videoSourceType, setIsPlaying]);

  const handleTimeUpdate = useCallback((event: any) => {
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
  }, [isScrubbing, getCurrentTimeSafe, getDurationSafe, duration, setVideoTime]);

  const handleDuration = useCallback((nextDuration: number) => {
    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      setDuration(nextDuration);
    }
  }, []);

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

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const time = getCurrentTimeSafe();
      if (Number.isFinite(time) && time >= 0) updateProjectLastVideoTime(time);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [getCurrentTimeSafe, isPlaying, updateProjectLastVideoTime]);

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
        activeEl?.tagName === "SELECT" ||
        (activeEl as HTMLElement)?.isContentEditable ||
        Boolean(document.querySelector('[role="dialog"]')) ||
        Boolean(document.querySelector('.modal'))
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
      } else if (e.code === "KeyA" && (e.ctrlKey || e.metaKey)) {
        // Allow Ctrl+A for select all without seeking video
        return;
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
      } else if ((e.code === "KeyB" || e.code === "KeyK") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("scout-quick-bookmark", { detail: { time: getCurrentTimeRef.current() } }));
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
    togglePlay,
  ]);

  const handlePlayerReady = useCallback(() => {
    setPlayerReady(true);
    setIsLoadingVideo(false);
    setPlayerError(null);
    setPlayerErrorType(null);
    setPlayerErrorCode(null);
  }, []);

  return {
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
  };
}
