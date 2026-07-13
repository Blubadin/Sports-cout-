import React, { useState } from 'react';
import { Clapperboard, Copy, FileVideo, Play, Repeat, Star, Trash2, Youtube } from 'lucide-react';
import { useScoutContext } from '../context/ScoutContext';
import type { EventRow } from '../types';
import { formatPreciseTime } from '../utils';
import BookmarkClipModal from './BookmarkClipModal';

function getPreviewRange(event: EventRow) {
  const start = event.previewStartTime ?? event.clipStartTime ?? event.videoTime ?? 0;
  const end = Math.max(start + 1, event.previewEndTime ?? event.clipEndTime ?? event.sequenceEndTime ?? start + 5);
  return { start, end };
}

export default function BookmarksPanel() {
  const {
    events,
    settings,
    setPreviewState,
    toggleEventBookmark,
    updateEventBookmarkNote,
    showToast,
  } = useScoutContext();
  const isThai = settings.uiLanguage === 'th';
  const bookmarkedEvents = events.filter(event => event.isBookmarked);
  const [replayClipEvent, setReplayClipEvent] = useState<EventRow | null>(null);

  const playSegment = (event: EventRow, loop: boolean) => {
    setPreviewState({ isActive: true, eventRow: event, loop });
    showToast(isThai ? 'เปิด replay เหตุการณ์สำคัญแล้ว' : 'Bookmark replay opened');
  };

  const copyTimeRange = async (event: EventRow) => {
    const { start, end } = getPreviewRange(event);
    const text = `${formatPreciseTime(start)} - ${formatPreciseTime(end)}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast(isThai ? 'คัดลอกช่วงเวลาแล้ว' : 'Time range copied');
    } catch {
      showToast(text);
    }
  };

  if (bookmarkedEvents.length === 0) {
    return (
      <div className="coach-panel p-6 text-center border border-dashed border-sky-400/30 bg-sky-950/10 dark:bg-sky-950/20">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-300">
          <Star size={22} />
        </div>
        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">
          {isThai ? 'ยังไม่มีเหตุการณ์สำคัญ' : 'No bookmarked sequences yet'}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {isThai
            ? 'เปิด replay จากเหตุการณ์ แล้วกดปุ่มดาวเพื่อเก็บช่วงสำคัญไว้ดูซ้ำภายหลัง'
            : 'Open an event replay and press the star button to save key sequences for later review.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-sky-500">
            {isThai ? 'เหตุการณ์ที่ Bookmark ไว้' : 'Bookmarked Sequences'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isThai
              ? 'ใช้เป็น virtual clip replay สำหรับ local video และเก็บช่วงเวลาสำคัญสำหรับ YouTube'
              : 'Virtual clip replay for local video, timestamp metadata for YouTube.'}
          </p>
        </div>
        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-500">
          {bookmarkedEvents.length} {isThai ? 'รายการ' : 'saved'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {bookmarkedEvents.map(event => {
          const { start, end } = getPreviewRange(event);
          const isYoutube = event.videoSourceType === 'youtube';

          return (
            <article
              key={event.id}
              className="rounded-xl border border-gray-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <span>Event #{event.no}</span>
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-500">
                      {formatPreciseTime(start)} - {formatPreciseTime(end)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                      {isYoutube ? <Youtube size={12} /> : <FileVideo size={12} />}
                      {isYoutube ? 'YouTube' : 'Local'}
                    </span>
                  </div>
                  <h3 className="mt-1 line-clamp-2 text-sm font-black text-gray-900 dark:text-gray-100">
                    {event.eventText}
                  </h3>
                  {event.thaiMeaningText && (
                    <p className="mt-1 line-clamp-2 text-xs text-sky-600 dark:text-sky-300">
                      {event.thaiMeaningText}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleEventBookmark(event.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-400/20 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
                  title={isThai ? 'ลบ Bookmark' : 'Remove bookmark'}
                  aria-label={isThai ? 'ลบ Bookmark' : 'Remove bookmark'}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <textarea
                value={event.bookmarkNote || ''}
                onChange={(e) => updateEventBookmarkNote(event.id, e.target.value)}
                placeholder={isThai ? 'โน้ตสำหรับโค้ช เช่น จุดเปลี่ยนเกม, แผนรับ, จังหวะสำคัญ...' : 'Coach note: key rally, defensive setup, turning point...'}
                className="mt-3 min-h-[66px] w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => playSegment(event, false)}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-black text-white transition hover:bg-sky-400 active:scale-95"
                >
                  <Play size={14} />
                  {isThai ? 'เล่นช่วงนี้' : 'Play'}
                </button>
                {event.videoSourceType === 'local' && (
                  <button
                    type="button"
                    onClick={() => setReplayClipEvent(event)}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300 active:scale-95"
                    title={isThai ? "เปิดรีเพลย์ลำดับเหตุการณ์" : "Open Sequence Replay"}
                  >
                    <Clapperboard size={14} />
                    {isThai ? "รีเพลย์ช่วงนี้" : "Sequence Replay"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => playSegment(event, true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-500 transition hover:bg-sky-500/20 active:scale-95"
                >
                  <Repeat size={14} />
                  {isThai ? 'เล่นวน' : 'Loop'}
                </button>
                <button
                  type="button"
                  onClick={() => copyTimeRange(event)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-700 transition hover:bg-gray-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
                >
                  <Copy size={14} />
                  {isThai ? 'คัดลอกเวลา' : 'Copy range'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {replayClipEvent && (
        <BookmarkClipModal
          event={replayClipEvent}
          onClose={() => setReplayClipEvent(null)}
        />
      )}
    </div>
  );
}
