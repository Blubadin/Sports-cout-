import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clapperboard, FileUp, Pause, Play, Repeat, RotateCcw, X } from "lucide-react";
import { useScoutContext } from "../context/ScoutContext";
import { useWorkspace } from "../context/WorkspaceContext";
import type { EventRow } from "../types";
import { formatPreciseTime } from "../utils";
import {
  loadProjectVideoFileHandle,
  saveProjectVideoFileHandle,
  type PersistentVideoFileHandle,
} from "../utils/videoFileStore";
import { t } from "../i18n";

function getPreviewRange(event: EventRow) {
  const start = event.previewStartTime ?? event.clipStartTime ?? event.videoTime ?? 0;
  const end = Math.max(
    start + 1,
    event.previewEndTime ?? event.clipEndTime ?? event.sequenceEndTime ?? start + 5,
  );
  return { start, end };
}

type ClipStatus =
  | "checking"
  | "permission-required"
  | "loading"
  | "ready"
  | "missing"
  | "denied"
  | "error";

type BookmarkClipModalProps = {
  event: EventRow;
  onClose: () => void;
};

export default function BookmarkClipModal({ event, onClose }: BookmarkClipModalProps) {
  const { settings, localFileName, showToast } = useScoutContext();
  const { activeProjectId } = useWorkspace();
  const isThai = settings.uiLanguage === "th";
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<ClipStatus>("checking");
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const { start, end } = getPreviewRange(event);
  const sourceFileName = event.localFileName || localFileName;
  const isLocalSource = event.videoSourceType === "local" || (
    !event.videoSourceType && Boolean(sourceFileName)
  );

  const openFileFromHandle = useCallback(async (handle: PersistentVideoFileHandle) => {
    const file = await handle.getFile();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setVideoSrc(objectUrl);
    setStatus("ready");
  }, []);

  const openStoredClip = useCallback(async (requestAccess: boolean) => {
    if (!isLocalSource || !sourceFileName) {
      setStatus("missing");
      return;
    }

    setStatus(requestAccess ? "loading" : "checking");
    try {
      const handle = await loadProjectVideoFileHandle(activeProjectId, sourceFileName);
      if (!handle) {
        setStatus("missing");
        return;
      }

      const permission = handle.queryPermission
        ? await handle.queryPermission({ mode: "read" })
        : "granted";

      if (permission === "granted") {
        await openFileFromHandle(handle);
        return;
      }

      if (!requestAccess) {
        setStatus(permission === "denied" ? "denied" : "permission-required");
        return;
      }

      if (!handle.requestPermission) {
        setStatus("denied");
        return;
      }

      const requestedPermission = await handle.requestPermission({ mode: "read" });
      if (requestedPermission !== "granted") {
        setStatus(requestedPermission === "denied" ? "denied" : "permission-required");
        return;
      }
      await openFileFromHandle(handle);
    } catch (error) {
      console.warn("Failed to open Key Moment Replay:", error);
      setStatus("error");
    }
  }, [activeProjectId, isLocalSource, openFileFromHandle, sourceFileName]);

  const chooseVideoAgain = async () => {
    const picker = (window as typeof window & {
      showOpenFilePicker?: (options: unknown) => Promise<PersistentVideoFileHandle[]>;
    }).showOpenFilePicker;

    if (!picker) {
      showToast(isThai
        ? "กรุณาเลือกไฟล์เดิมอีกครั้งจากตัวเล่นวิดีโอหลัก"
        : "Please select the original file again in the main video player");
      return;
    }

    try {
      const [handle] = await picker({
        multiple: false,
        types: [{ description: "Video Files", accept: { "video/*": [] } }],
      });
      if (!handle) return;

      const file = await handle.getFile();
      if (sourceFileName && file.name !== sourceFileName) {
        showToast(isThai
          ? `ไฟล์ที่เลือกชื่อ ${file.name} ต่างจากไฟล์เดิม ${sourceFileName}`
          : `Selected ${file.name}; the original file was ${sourceFileName}`);
      }
      await saveProjectVideoFileHandle(activeProjectId, file.name, handle);
      await openFileFromHandle(handle);
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        console.warn("Failed to restore local video access:", error);
        setStatus("error");
      }
    }
  };

  useEffect(() => {
    void openStoredClip(false);
  }, [openStoredClip]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [onClose]);

  const seekToStart = () => {
    if (videoRef.current) videoRef.current.currentTime = start;
  };

  const playFromStart = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = start;
    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        showToast(isThai ? "เบราว์เซอร์บล็อกการเล่นอัตโนมัติ กรุณากดเล่นอีกครั้ง" : "Video autoplay was blocked");
      }
    } else {
      video.pause();
    }
  };

  const title = t('keyMoments.replayTitle', settings.uiLanguage);
  const statusMessage = status === "checking" || status === "loading"
    ? (isThai ? "กำลังตรวจสอบไฟล์วิดีโอ..." : "Checking the local video...")
    : status === "permission-required"
      ? (isThai ? "ต้องอนุญาตให้เข้าถึงไฟล์วิดีโอนี้อีกครั้ง" : "Permission is required to reopen this video")
      : status === "denied"
        ? (isThai ? "เบราว์เซอร์ไม่อนุญาตให้เข้าถึงไฟล์วิดีโอ" : "Access to this video was denied")
        : status === "missing"
          ? (isThai ? "ยังไม่พบไฟล์วิดีโอของโปรเจกต์นี้" : "The local video for this project was not found")
          : (isThai ? "ไม่สามารถเปิดรีเพลย์นี้ได้" : "This replay could not be opened");

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[calc(100dvh-24px)] w-full max-w-[960px] flex-col overflow-hidden rounded-lg border border-sky-400/30 bg-slate-950 text-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-slate-900 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase text-sky-300">
              <Clapperboard size={16} />
              {title}
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-white/70">
                {formatPreciseTime(start)} - {formatPreciseTime(end)}
              </span>
            </div>
            <h3 className="mt-1 line-clamp-2 text-sm font-black">{event.eventText}</h3>
            {event.thaiMeaningText && <p className="mt-0.5 line-clamp-1 text-xs text-sky-300">{event.thaiMeaningText}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={t('keyMoments.closeReplay', settings.uiLanguage)}
            title={t('keyMoments.closeReplay', settings.uiLanguage)}
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-black">
          {status === "ready" && videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="mx-auto max-h-[65dvh] w-full bg-black object-contain"
              controls
              playsInline
              onLoadedMetadata={() => void playFromStart()}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(changeEvent) => {
                const video = changeEvent.currentTarget;
                if (video.currentTime < start) video.currentTime = start;
                if (video.currentTime >= end) {
                  if (loop) {
                    video.currentTime = start;
                    void video.play();
                  } else {
                    video.pause();
                    video.currentTime = end;
                  }
                }
              }}
            />
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-5 py-8 text-center">
              <Clapperboard size={36} className="text-sky-300/70" />
              <div>
                <p className="text-sm font-black">{statusMessage}</p>
                <p className="mt-2 max-w-lg text-xs leading-relaxed text-white/50">
                  {isThai
                    ? "ระบบเก็บเพียงสิทธิ์อ้างอิงไฟล์ ไม่ได้คัดลอกวิดีโอเข้าโปรเจกต์ คุณสามารถอนุญาตไฟล์เดิมหรือเลือกไฟล์อีกครั้งได้"
                    : "The app stores a file reference, not a copy of the video. Grant access to the original file or select it again."}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {(status === "permission-required" || status === "denied") && (
                  <button
                    type="button"
                    onClick={() => void openStoredClip(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300"
                  >
                    <Clapperboard size={15} />
                    {isThai ? "อนุญาตไฟล์เดิม" : "Grant file access"}
                  </button>
                )}
                {(status === "missing" || status === "denied" || status === "error") && (
                  <button
                    type="button"
                    onClick={() => void chooseVideoAgain()}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white transition hover:bg-white/15"
                  >
                    <FileUp size={15} />
                    {isThai ? "เลือกไฟล์วิดีโออีกครั้ง" : "Choose video again"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-900 px-3 py-2.5 sm:px-4">
          <div className="min-w-0 truncate text-xs text-white/50">
            {sourceFileName || (isThai ? "ไม่พบชื่อไฟล์ local" : "No local file name")}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={seekToStart}
              disabled={status !== "ready"}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white/80 transition hover:bg-white/10 disabled:opacity-40"
            >
              <RotateCcw size={14} />
              {t('keyMoments.start', settings.uiLanguage)}
            </button>
            <button
              type="button"
              onClick={() => void togglePlayback()}
              disabled={status !== "ready"}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-black text-white transition hover:bg-sky-400 disabled:opacity-40"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? t('keyMoments.pause', settings.uiLanguage) : t('keyMoments.play', settings.uiLanguage)}
            </button>
            <button
              type="button"
              onClick={() => setLoop((value) => !value)}
              aria-pressed={loop}
              disabled={status !== "ready"}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition disabled:opacity-40 ${
                loop
                  ? "border-amber-300/40 bg-amber-300/15 text-amber-200"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              <Repeat size={14} />
              {loop ? t('keyMoments.loopOn', settings.uiLanguage) : t('keyMoments.loopOff', settings.uiLanguage)}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
