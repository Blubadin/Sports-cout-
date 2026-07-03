import { useState, useRef, useCallback } from "react";

interface UseVideoGesturesProps {
  settings: any;
  volume: number;
  brightness: number;
  getCurrentTimeSafe: () => number;
  getDurationSafe: () => number;
  seekBySafe: (delta: number) => void;
  seekToSafe: (time: number) => void;
  setVolumeSafe: (vol: number) => void;
  setBrightness: (bright: number) => void;
  draftSeekTimeRef: React.MutableRefObject<number | null>;
  setDraftSeekTime: (time: number | null) => void;
  setCurrentTimeDisplay: (time: number) => void;
  playSafe?: () => void;
  pauseSafe?: () => void;
}

export function useVideoGestures({
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
}: UseVideoGesturesProps) {
  const [gestureStart, setGestureStart] = useState<{
    x: number;
    y: number;
    time: number;
    vol: number;
    bright: number;
  } | null>(null);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [gestureOverlayText, setGestureOverlayText] = useState<string | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  const showGestureOverlayText = useCallback((text: string) => {
    if (settings.showGestureOverlay === false) return;
    setGestureOverlayText(text);
    if (overlayTimerRef.current !== null)
      window.clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = window.setTimeout(
      () => setGestureOverlayText(null),
      800,
    );
  }, [settings.showGestureOverlay]);

  const hideGestureOverlayText = useCallback(() => {
    if (overlayTimerRef.current !== null)
      window.clearTimeout(overlayTimerRef.current);
    setGestureOverlayText(null);
  }, []);

  const handleVideoPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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
  }, [settings, lastTapTime, seekBySafe, showGestureOverlayText, getCurrentTimeSafe, volume, brightness]);

  const handleVideoPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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
  }, [gestureStart, settings, getDurationSafe, showGestureOverlayText, seekToSafe, draftSeekTimeRef, setDraftSeekTime, setCurrentTimeDisplay, setVolumeSafe, setBrightness]);

  const handleVideoPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const finalTime = draftSeekTimeRef.current;
    if (finalTime !== null && !settings.liveScrub) {
      seekToSafe(finalTime);
    }
    draftSeekTimeRef.current = null;
    setDraftSeekTime(null);
    setGestureStart(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
    hideGestureOverlayText();
  }, [draftSeekTimeRef, settings.liveScrub, seekToSafe, setDraftSeekTime, hideGestureOverlayText]);

  const handleVideoPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draftSeekTimeRef.current = null;
    setDraftSeekTime(null);
    setGestureStart(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
    hideGestureOverlayText();
  }, [draftSeekTimeRef, setDraftSeekTime, hideGestureOverlayText]);

  return {
    gestureStart,
    lastTapTime,
    gestureOverlayText,
    overlayTimerRef,
    handleVideoPointerDown,
    handleVideoPointerMove,
    handleVideoPointerUp,
    handleVideoPointerCancel,
  };
}
