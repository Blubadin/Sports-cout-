import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  gesturePointerDown: vi.fn(),
  updateProjectVideoCalibration: vi.fn(),
  activeProjectId: 'project-1',
  projects: [] as Array<{
    id: string;
    videoMeta: {
      courtCalibration?: {
        tl: [number, number];
        tr: [number, number];
        bl: [number, number];
        br: [number, number];
      };
    };
  }>,
}));

const savedCalibration = {
  tl: [0.1, 0.1] as [number, number],
  tr: [0.9, 0.1] as [number, number],
  bl: [0.1, 0.9] as [number, number],
  br: [0.9, 0.9] as [number, number],
};

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
    sportTemplate: {
      areas: [
        { code: 'A', thaiName: 'เอ' },
        { code: 'B', thaiName: 'บี' },
        { code: 'C', thaiName: 'ซี' },
      ],
    },
    seekRequest: null,
    setSeekRequest: vi.fn(),
    showToast: vi.fn(),
    getCurrentTimeRef: { current: () => 0 },
  }),
}));

vi.mock('../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: testState.activeProjectId,
    projects: testState.projects,
    updateProjectLastVideoTime: vi.fn(),
    updateProjectVideoCalibration: (calibration: typeof savedCalibration) =>
      testState.updateProjectVideoCalibration(testState.activeProjectId, calibration),
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

import VideoPlayer from '../components/VideoPlayer';

describe('VideoPlayer court calibration controls', () => {
  const setCalibrationBounds = (surface: HTMLElement) => {
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  };

  const clickCalibrationPoints = (points: Array<[number, number]>) => {
    const surface = screen.getByTestId('court-calibration-surface');
    setCalibrationBounds(surface);
    points.forEach(([clientX, clientY]) => {
      fireEvent.click(surface, { clientX, clientY });
    });
  };

  beforeEach(() => {
    testState.gesturePointerDown.mockReset();
    testState.updateProjectVideoCalibration.mockReset();
    testState.activeProjectId = 'project-1';
    testState.projects = [{
      id: 'project-1',
      videoMeta: { courtCalibration: savedCalibration },
    }];
  });

  afterEach(() => cleanup());

  it('reopens saved calibration accessibly and gives its click layer precedence over gestures', () => {
    render(<VideoPlayer />);

    fireEvent.click(screen.getByRole('button', { name: 'Recalibrate court' }));

    expect(screen.getByTestId('court-calibration-surface')).toBeInTheDocument();

    const gestureCapture = document.querySelector('.touch-none');
    expect(gestureCapture).toHaveClass('pointer-events-none');
    fireEvent.pointerDown(gestureCapture!);
    expect(testState.gesturePointerDown).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel calibration' }));
    expect(testState.updateProjectVideoCalibration).not.toHaveBeenCalled();
    expect(screen.queryByTestId('court-calibration-surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('projected-court-layer')).toBeInTheDocument();

    fireEvent.pointerDown(gestureCapture!);
    expect(testState.gesturePointerDown).toHaveBeenCalledTimes(1);
  });

  it('starts a new calibration through its accessible action', () => {
    testState.projects = [{ id: 'project-1', videoMeta: {} }];
    render(<VideoPlayer />);

    fireEvent.click(screen.getByRole('button', { name: 'Calibrate court' }));

    expect(screen.getByTestId('court-calibration-surface')).toBeInTheDocument();
  });

  it('persists a completed calibration once and restores gesture capture afterward', () => {
    render(<VideoPlayer />);

    fireEvent.click(screen.getByRole('button', { name: 'Recalibrate court' }));
    clickCalibrationPoints([
      [100, 100], [900, 100], [100, 900], [900, 900],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(testState.updateProjectVideoCalibration).toHaveBeenCalledTimes(1);
    expect(testState.updateProjectVideoCalibration).toHaveBeenCalledWith(
      'project-1',
      savedCalibration,
    );
    expect(screen.queryByTestId('court-calibration-surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('projected-court-layer')).toBeInTheDocument();

    fireEvent.pointerDown(document.querySelector('.touch-none')!);
    expect(testState.gesturePointerDown).toHaveBeenCalledTimes(1);
  });

  it('drops project A draft and saves four fresh points against project B after switching', () => {
    testState.projects = [
      { id: 'project-a', videoMeta: {} },
      { id: 'project-b', videoMeta: { courtCalibration: savedCalibration } },
    ];
    testState.activeProjectId = 'project-a';
    const { rerender } = render(<VideoPlayer />);

    fireEvent.click(screen.getByRole('button', { name: 'Calibrate court' }));
    clickCalibrationPoints([[150, 150], [850, 150], [150, 850]]);
    expect(screen.getAllByTestId(/calibration-point-/)).toHaveLength(3);

    testState.activeProjectId = 'project-b';
    rerender(<VideoPlayer />);

    expect(screen.queryByTestId('court-calibration-surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('projected-court-layer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recalibrate court' }));
    expect(screen.queryByTestId('calibration-point-0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    clickCalibrationPoints([[200, 200], [800, 200], [200, 800]]);
    expect(screen.getAllByTestId(/calibration-point-/)).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    clickCalibrationPoints([[800, 800]]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(testState.updateProjectVideoCalibration).toHaveBeenCalledTimes(1);
    expect(testState.updateProjectVideoCalibration).toHaveBeenCalledWith(
      'project-b',
      {
        tl: [0.2, 0.2],
        tr: [0.8, 0.2],
        bl: [0.2, 0.8],
        br: [0.8, 0.8],
      },
    );
  });
});
