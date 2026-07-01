import React from "react";
import ScoutHUDMode from "./ScoutHUDMode";
import PhoneScoutMode from "./PhoneScoutMode";
import { useHUDDeviceLayout } from "../../hooks/useHUDDeviceLayout";

interface ScoutHUDWrapperProps {
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  isPortrait: boolean;
  videoControls: {
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seekBy: (seconds: number) => void;
    seekTo: (time: number) => void;
    setSpeed: (speed: number) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    isPlaying: boolean;
    playbackRate: number;
    videoError: string | null;
    retryVideo: () => void;
  };
}

export default function ScoutHUDWrapper(props: ScoutHUDWrapperProps) {
  const layout = useHUDDeviceLayout();

  if (layout.experienceMode === "phone") {
    return <PhoneScoutMode {...props} />;
  }

  return <ScoutHUDMode {...props} />;
}
