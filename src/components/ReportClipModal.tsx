import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactPlayer from 'react-player';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, RotateCcw, Video, Trophy, Sparkles } from 'lucide-react';
import { useScoutContext } from '../context/ScoutContext';
import { EventRow } from '../types';
import { formatPreciseTime } from '../utils';

interface ReportClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoTime: number;
  title?: string;
  event?: EventRow | null;
}

export default function ReportClipModal({
  isOpen,
  onClose,
  videoTime,
  title,
  event,
}: ReportClipModalProps) {
  const { videoSourceType, youtubeUrl, localFileName, settings } = useScoutContext();
  const isThai = settings.uiLanguage === 'th';
  
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(videoTime);

  const startTime = Math.max(0, videoTime - 2);

  useEffect(() => {
    if (isOpen) {
      setCurrentTime(startTime);
      setIsPlaying(true);
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.seekTo(startTime, 'seconds');
        }
      }, 300);
    }
  }, [isOpen, startTime]);

  if (!isOpen) return null;

  const resolvedSource = videoSourceType === 'youtube' ? youtubeUrl : undefined;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Floating Modal Content */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative bg-gray-900 text-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-700 overflow-hidden z-10 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/80">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Video size={16} />
              </div>
              <div>
                <h3 className="text-xs font-black truncate max-w-[320px]">
                  {title || (isThai ? 'คลิปประกอบจังหวะสำคัญ' : 'Key Moment Clip')}
                </h3>
                <div className="text-[10px] text-gray-400 font-mono">
                  Timestamp: {formatPreciseTime(videoTime)} (± 2s replay)
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Video Player Box */}
          <div className="relative aspect-video bg-black flex items-center justify-center">
            {resolvedSource ? (
              (() => {
                const Player = ReactPlayer as any;
                return (
                  <Player
                    ref={playerRef}
                    url={resolvedSource}
                    playing={isPlaying}
                    controls={false}
                    width="100%"
                    height="100%"
                    onProgress={(p: any) => setCurrentTime(p.playedSeconds)}
                    config={{
                      youtube: {
                        playerVars: {
                          start: Math.floor(startTime),
                          autoplay: 1,
                        },
                      },
                    }}
                  />
                );
              })()
            ) : (
              <div className="text-center p-6 text-gray-400 space-y-2">
                <Video size={36} className="mx-auto text-gray-600" />
                <p className="text-xs">
                  {isThai
                    ? 'ไม่พบแหล่งวิดีโอออนไลน์สำหรับคลิปนี้ หรือเป็นไฟล์ในเครื่องที่ยังไม่ได้เชื่อมต่อ'
                    : 'No video stream available for this match clip.'}
                </p>
                <div className="font-mono text-sky-400 text-xs font-bold">
                  Target Time: {formatPreciseTime(videoTime)}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Bar Controls */}
          <div className="p-3 bg-gray-950 border-t border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={() => {
                  if (playerRef.current) playerRef.current.seekTo(startTime, 'seconds');
                  setIsPlaying(true);
                }}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
                <span className="text-[10px] font-bold">{isThai ? 'เล่นซ้ำ (Replay)' : 'Replay'}</span>
              </button>
            </div>

            {event && (
              <div className="text-right">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${event.resultText === '+1' ? 'bg-emerald-600 text-white' : event.resultText === '-1' ? 'bg-rose-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                  Pt #{event.point} ({event.resultText})
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
