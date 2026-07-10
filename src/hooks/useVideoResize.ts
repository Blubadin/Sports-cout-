import { useState, useEffect, useRef, useCallback } from "react";

export function useVideoResize() {
  const [isHUDMode, setIsHUDMode] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [videoHeight, setVideoHeight] = useState<number | "auto">("auto");
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOrientation = () =>
      setIsPortrait(window.innerHeight > window.innerWidth);
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    return () => window.removeEventListener("resize", checkOrientation);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element, mozFullScreenElement?: Element, msFullscreenElement?: Element };
      const isFs = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
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

  const enterHUDMode = useCallback(() => {
    setIsHUDMode(true);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("hud-active");
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const closeHUDMode = useCallback(async (reason?: string) => {
    console.log(`Exiting HUD Mode${reason ? ": " + reason : ""}`);
    setIsHUDMode(false);

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn("Failed to exit fullscreen", e);
    }

    try {
      if (screen.orientation && "unlock" in screen.orientation) {
        (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
      }
    } catch (e) {}

    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.body.classList.remove("hud-active");

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }, []);

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

  return {
    isHUDMode,
    isPortrait,
    videoHeight,
    setVideoHeight,
    isResizing,
    setIsResizing,
    containerRef,
    enterHUDMode,
    closeHUDMode,
  };
}
