import React, { useEffect, useRef, useState } from 'react';
import { get } from 'idb-keyval';
import { Clapperboard, Play, Pause, Repeat, RotateCcw, X } from 'lucide-react';
import { useScoutContext } from '../context/ScoutContext';
import type { EventRow } from '../types';
import { formatPreciseTime } from '../utils';

function getPreviewRange(event: EventRow) {
  const start = event.previewStartTime ?? event.clipStartTime ?? event.videoTime ?? 0;
  const end = Math.max(start + 1, event.previewEndTime ?? event.clipEndTime ?? event.sequenceEndTime ?? start + 5);
  return { start, end };
}

type BookmarkClipModalProps = {
  event: EventRow;
  onClose: () => void;
};

export default function BookmarkClipModal({ event, onClose }: BookmarkClipModalProps) {
  const { settings, localFileName, showToast } = useScoutContext();
  const isThai = settings.uiLanguage === 'th';
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'denied' | 'error'>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const { start, end } = getPreviewRange(event);
  const sourceFileName = event.localFileName || localFileName;

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const openLocalClip = async () => {
    if (event.videoSourceType !== 'local' || !sourceFileName) {
      setStatus('missing');
      return;
    }

    setStatus('loading');
    try {
      const handle = await get(`videoFileHandle-${sourceFileName}`);
      if (!handle) {
        setStatus('missing');
        return;
      }

      const fileHandle = handle as unknown as { 
        queryPermission?: (opts: { mode: string }) => Promise<string>;
        requestPermission?: (opts: { mode: string }) => Promise<string>;
        getFile: () => Promise<File>;
      };
      const queryPermission = typeof fileHandle.queryPermission === 'function'
        ? await fileHandle.queryPermission({ mode: 'read' })
        : 'granted';
      const permission = queryPermission === 'granted' || typeof fileHandle.requestPermission !== 'function'
        ? queryPermission
        : await fileHandle.requestPermission({ mode: 'read' });

      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      const file = await fileHandle.getFile();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;
      setVideoSrc(objectUrl);
      setStatus('ready');
    } catch (error) {
      console.warn('Failed to open bookmark clip:', error);
      setStatus('error');
    }
  };

  const seekToStart = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = start;
  };

  const playFromStart = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = start;
    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      showToast(isThai ? 'กด Play อีกครั้งเพื่อเริ่มเล่นคลิป' : 'Press Play again to start the clip');
    }
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        showToast(isThai ? 'ไม่สามารถเล่นวิดีโออัตโนมัติได้' : 'Video autoplay was blocked');
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-sky-400/30 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-sky-300">
              <Clapperboard size={16} />
              {isThai ? 'VAR Bookmark Clip' : 'VAR Bookmark Clip'}
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-white/70">
                {formatPreciseTime(start)} - {formatPreciseTime(end)}
              </span>
            </div>
            <h3 className="mt-1 line-clamp-2 text-sm font-black">{event.eventText}</h3>
            {event.thaiMeaningText && <p className="mt-0.5 text-xs text-sky-300">{event.thaiMeaningText}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Close VAR clip"
            title="Close VAR clip"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-black">
          {status === 'ready' && videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="aspect-video w-full bg-black object-contain"
              controls
              playsInline
              onLoadedMetadata={playFromStart}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => {
                const video = e.currentTarget;
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
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center">
              <Clapperboard size={36} className="text-sky-300/70" />
              <div>
                <p className="text-sm font-black">
                  {status === 'loading'
                    ? (isThai ? 'กำลังเปิดคลิปจากไฟล์ local...' : 'Opening local clip...')
                    : status === 'denied'
                      ? (isThai ? 'ยังไม่ได้รับสิทธิ์อ่านไฟล์วิดีโอ' : 'Video file permission was denied')
                      : (isThai ? 'ยังเปิดไฟล์ local สำหรับคลิปนี้ไม่ได้' : 'Local video file is not available for this clip')}
                </p>
                <p className="mt-2 max-w-lg text-xs leading-relaxed text-white/50">
                  {isThai
                    ? 'ถ้าเป็นโปรเจคเก่า ให้โหลด local video เดิมอีกครั้งหรือกด Restore access ในตัวเล่นวิดีโอหลักก่อน แล้วลองเปิด VAR clip อีกครั้ง'
                    : 'For older projects, reload the original local video or restore access in the main video player, then open this VAR clip again.'}
                </p>
              </div>
              <button
                type="button"
                onClick={openLocalClip}
                disabled={status === 'loading'}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-70"
              >
                <Clapperboard size={15} />
                {status === 'loading'
                  ? (isThai ? 'กำลังเปิด...' : 'Opening...')
                  : (isThai ? 'เปิด VAR Clip / ขอสิทธิ์ไฟล์' : 'Open VAR Clip / Grant Access')}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-slate-900 px-4 py-3">
          <div className="text-xs text-white/50">
            {sourceFileName || (isThai ? 'ไม่พบชื่อไฟล์ local' : 'No local file name')}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={status === 'ready' ? seekToStart : openLocalClip}
              disabled={status !== 'ready'}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={14} />
              {isThai ? 'เริ่มช่วง' : 'Start'}
            </button>
            <button
              type="button"
              onClick={togglePlayback}
              disabled={status !== 'ready'}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-black text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? (isThai ? 'พัก' : 'Pause') : (isThai ? 'เล่น' : 'Play')}
            </button>
            <button
              type="button"
              onClick={() => setLoop(value => !value)}
              disabled={status !== 'ready'}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                loop
                  ? 'border-amber-300/40 bg-amber-300/15 text-amber-200'
                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <Repeat size={14} />
              {loop ? 'Loop On' : 'Loop Off'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
