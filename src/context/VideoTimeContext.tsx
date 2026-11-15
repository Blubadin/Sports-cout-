import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { EventRow, VideoSourceType } from '../types';

export type VideoPreviewState = {
  isActive: boolean;
  eventRow: EventRow | null;
  loop: boolean;
} | null;

export interface VideoTimeContextType {
  videoSourceType: VideoSourceType;
  setVideoSourceType: React.Dispatch<React.SetStateAction<VideoSourceType>>;
  youtubeVideoId: string | null;
  setYoutubeVideoId: React.Dispatch<React.SetStateAction<string | null>>;
  youtubeUrl: string;
  setYoutubeUrl: React.Dispatch<React.SetStateAction<string>>;
  localFileName: string | null;
  setLocalFileName: React.Dispatch<React.SetStateAction<string | null>>;
  videoTime: number;
  setVideoTime: React.Dispatch<React.SetStateAction<number>>;
  getCurrentTimeRef: React.MutableRefObject<() => number>;
  seekRequest: number | null;
  setSeekRequest: React.Dispatch<React.SetStateAction<number | null>>;
  previewState: VideoPreviewState;
  setPreviewState: React.Dispatch<React.SetStateAction<VideoPreviewState>>;
}

const VideoTimeContext = createContext<VideoTimeContextType | undefined>(undefined);

/**
 * Isolated video source & playback timing context so high-frequency time updates
 * do not unnecessarily couple to event history or action draft modules.
 */
export function VideoTimeProvider({ children }: { children: ReactNode }) {
  const [videoSourceType, setVideoSourceType] = useState<VideoSourceType>('local');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [videoTime, setVideoTime] = useState<number>(0);
  const videoTimeRef = useRef<number>(0);

  useEffect(() => {
    videoTimeRef.current = videoTime;
  }, [videoTime]);

  const getCurrentTimeRef = useRef<() => number>(() => videoTimeRef.current);
  const [seekRequest, setSeekRequest] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<VideoPreviewState>(null);

  return (
    <VideoTimeContext.Provider
      value={{
        videoSourceType,
        setVideoSourceType,
        youtubeVideoId,
        setYoutubeVideoId,
        youtubeUrl,
        setYoutubeUrl,
        localFileName,
        setLocalFileName,
        videoTime,
        setVideoTime,
        getCurrentTimeRef,
        seekRequest,
        setSeekRequest,
        previewState,
        setPreviewState,
      }}
    >
      {children}
    </VideoTimeContext.Provider>
  );
}

export function useVideoTime(): VideoTimeContextType {
  const ctx = useContext(VideoTimeContext);
  if (!ctx) {
    throw new Error('useVideoTime must be used within VideoTimeProvider');
  }
  return ctx;
}
