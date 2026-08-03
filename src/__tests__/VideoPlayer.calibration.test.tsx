import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  gesturePointerDown: vi.fn(),
  updateProjectVideoCalibration: vi.fn(),
  calibration: {
    tl: [0.1, 0.1] as [number, number],
    tr: [0.9, 0.1] as [number, number],
    bl: [0.1, 0.9] as [number, number],
    br: [0.9, 0.9] as [number, number],
  } as { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] } | undefined,
}));

vi.mock('react-player', () => ({
  default: () => <div data-testid="react-player" />,
}));

vi.mock('../context/ScoutContext', () => ({
  useScoutContext: () => ({
    setVideoTime: vi.fn(),
    videoSourceType: 'youtube',
    setVideoSourceType: vi.fn(),
    youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    setYoutubeUrl: vi.fn(),
    youtubeVideoId: 'abcdefghijk',
    setYoutubeVideoId: vi.fn(),
    localFileName: null,
    setLocalFileName: vi.fn(),
    settings: {
      uiLanguage: 'en',
      enableVideoGestures: true,
      enableScoutHUDMode: false,
      autoPlayAfterSeek: true,
    },
    seekRequest: null,
    setSeekRequest: vi.fn(),
    showToast: vi.fn(),
    getCurrentTimeRef: { current: () => 0 },
  }),
}));

vi.mock('../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: 'project-1',
    projects: [{ id: 'project-1', videoMeta: { courtCalibration: testState.calibration } }],
    updateProjectLastVideoTime: vi.fn(),
    updateProjectVideoCalibration: testState.updateProjectVideoCalibration,
  }),
}));

vi.mock('../hooks/useVideoResize', () => ({
  useVideoResize: () => ({
    isHUDMode: false,
    isPortrait: false,
    videoHeight: 'auto',
    setVideoHeight: vi.fn(),
    isResizing: false,
    setIsResizing: vi.fn(),
    containerRef: { current: null },
    enterHUDMode: vi.fn(),
    closeHUDMode: vi.fn(),
  }),
}));

vi.mock('../hooks/useVideoGestures', () => ({
  useVideoGestures: () => ({
    gestureOverlayText: null,
    handleVideoPointerDown: testState.gesturePointerDown,
    handleVideoPointerMove: vi.fn(),
    handleVideoPointerUp: vi.fn(),
    handleVideoPointerCancel: vi.fn(),
  }),
}));

vi.mock('../hooks/useVideoPlayback', () => ({
  useVideoPlayback: () => ({
    playbackRate: 1,
    setPlaybackRate: vi.fn(),
    requestedPlaying: false,
    setRequestedPlaying: vi.fn(),
    actualPlaying: true,
    setActualPlaying: vi.fn(),
    isAutoplayBlocked: false,
    setIsAutoplayBlocked: vi.fn(),
    playerReady: false,
    setPlayerReady: vi.fn(),
    playerError: null,
    setPlayerError: vi.fn(),
    playerErrorType: null,
    setPlayerErrorType: vi.fn(),
    playerErrorCode: null,
    setPlayerErrorCode: vi.fn(),
    isLoadingVideo: false,
    setIsLoadingVideo: vi.fn(),
    useNativeIframe: false,
    setUseNativeIframe: vi.fn(),
    currentTimeDisplay: 0,
    setCurrentTimeDisplay: vi.fn(),
    duration: 0,
    setDuration: vi.fn(),
    isScrubbing: false,
    setIsScrubbing: vi.fn(),
    draftSeekTime: null,
    setDraftSeekTime: vi.fn(),
    draftSeekTimeRef: { current: null },
    volume: 1,
    setVolume: vi.fn(),
    brightness: 1,
    setBrightness: vi.fn(),
    isPlaying: false,
    setIsPlaying: vi.fn(),
    getPlayer: vi.fn(),
    getInternalPlayer: vi.fn(),
    getCurrentTimeSafe: () => 0,
    getDurationSafe: () => 0,
    seekToSafe: vi.fn(),
    seekBySafe: vi.fn(),
    playSafe: vi.fn(),
    pauseSafe: vi.fn(),
    setVolumeSafe: vi.fn(),
    setSpeedSafe: vi.fn(),
    togglePlay: vi.fn(),
    handleTimeUpdate: vi.fn(),
    handleDuration: vi.fn(),
    handleSeekPointerDown: vi.fn(),
    handleSeekInput: vi.fn(),
    handleSeekPointerUp: vi.fn(),
    handleSeekCancel: vi.fn(),
    handlePlayerError: vi.fn(),
    handlePlayerReady: vi.fn(),
  }),
}));

vi.mock('../components/SegmentPreviewPanel', () => ({ default: () => null }));
vi.mock('../components/hud/ScoutHUDWrapper', () => ({ default: () => null }));
vi.mock('../components/video/CourtZoneOverlay', () => ({
  default: ({ isVisible, isCalibrating, onCalibrationComplete, onCalibrationCancel }: {
    isVisible: boolean;
    isCalibrating: boolean;
    onCalibrationComplete: (points: [number, number][]) => void;
    onCalibrationCancel: () => void;
  }) => (
    <div
      data-testid="court-zone-overlay"
      data-visible={String(isVisible)}
      data-calibrating={String(isCalibrating)}
    >
      {isCalibrating && (
        <>
          <button onClick={() => onCalibrationComplete([
            [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9],
          ])}>Save calibration</button>
          <button onClick={onCalibrationCancel}>Cancel calibration</button>
        </>
      )}
    </div>
  ),
}));

import VideoPlayer from '../components/VideoPlayer';

describe('VideoPlayer court calibration controls', () => {
  beforeEach(() => {
    testState.gesturePointerDown.mockReset();
    testState.updateProjectVideoCalibration.mockReset();
    testState.calibration = {
      tl: [0.1, 0.1], tr: [0.9, 0.1], bl: [0.1, 0.9], br: [0.9, 0.9],
    };
  });

  afterEach(() => cleanup());

  it('reopens saved calibration accessibly and gives its click layer precedence over gestures', () => {
    render(<VideoPlayer />);

    fireEvent.click(screen.getByRole('button', { name: 'Recalibrate court' }));

    expect(screen.getByTestId('court-zone-overlay')).toHaveAttribute('data-calibrating', 'true');
    expect(screen.getByTestId('court-zone-overlay')).toHaveAttribute('data-visible', 'true');

    const gestureCapture = document.querySelector('.touch-none');
    expect(gestureCapture).toHaveClass('pointer-events-none');
    fireEvent.pointerDown(gestureCapture!);
    expect(testState.gesturePointerDown).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel calibration' }));
    expect(testState.updateProjectVideoCalibration).not.toHaveBeenCalled();
    expect(screen.getByTestId('court-zone-overlay')).toHaveAttribute('data-calibrating', 'false');
    expect(screen.getByTestId('court-zone-overlay')).toHaveAttribute('data-visible', 'true');

    fireEvent.pointerDown(gestureCapture!);
    expect(testState.gesturePointerDown).toHaveBeenCalledTimes(1);
  });

  it('starts a new calibration through its accessible action', () => {
    testState.calibration = undefined;
    render(<VideoPlayer />);

    fireEvent.click(screen.getByRole('button', { name: 'Calibrate court' }));

    expect(screen.getByTestId('court-zone-overlay')).toHaveAttribute('data-calibrating', 'true');
    expect(screen.getByTestId('court-zone-overlay')).toHaveAttribute('data-visible', 'true');
  });

  it('persists a completed calibration once and restores gesture capture afterward', () => {
    render(<VideoPlayer />);

    fireEvent.click(screen.getByRole('button', { name: 'Recalibrate court' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save calibration' }));

    expect(testState.updateProjectVideoCalibration).toHaveBeenCalledTimes(1);
    expect(testState.updateProjectVideoCalibration).toHaveBeenCalledWith({
      tl: [0.1, 0.1], tr: [0.9, 0.1], bl: [0.1, 0.9], br: [0.9, 0.9],
    });
    expect(screen.getByTestId('court-zone-overlay')).toHaveAttribute('data-calibrating', 'false');
    expect(screen.getByTestId('court-zone-overlay')).toHaveAttribute('data-visible', 'true');

    fireEvent.pointerDown(document.querySelector('.touch-none')!);
    expect(testState.gesturePointerDown).toHaveBeenCalledTimes(1);
  });
});
