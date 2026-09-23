import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({
  settings: {
    uiLanguage: 'en' as const,
    enableScoutHUDMode: true,
    enableVideoGestures: false,
    enableScreenMarkingMode: false,
    fastMode: false,
    advancedDetailMode: false,
    skillInputLayout: 'grid' as const,
  },
}));

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    ...context,
    setVideoTime: vi.fn(),
    videoSourceType: 'youtube',
    setVideoSourceType: vi.fn(),
    youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    setYoutubeUrl: vi.fn(),
    youtubeVideoId: 'abcdefghijk',
    setYoutubeVideoId: vi.fn(),
    localFileName: null,
    setLocalFileName: vi.fn(),
    seekRequest: null,
    setSeekRequest: vi.fn(),
    showToast: vi.fn(),
    getCurrentTimeRef: { current: () => 0 },
    teams: [],
    skills: [],
    areas: [],
    results: [],
    currentAction: {},
    setCurrentAction: vi.fn(),
    currentActions: [],
    events: [],
    addAction: vi.fn(),
    saveEvent: vi.fn(),
    undoLastAction: vi.fn(),
    clearCurrentEvent: vi.fn(),
    setSettings: vi.fn(),
    isActionComplete: () => false,
    resetCurrentAction: vi.fn(),
    getThaiMeaning: () => '',
    getExtendedActionText: () => '',
    sportTemplate: {
      id: 'badminton',
      teamsEnabled: false,
      playersEnabled: false,
      descriptors: {},
      fouls: [],
    },
    changeSportType: vi.fn(),
    getMissingActionMessage: () => '',
    currentInputHistory: [],
    setCurrentInputHistory: vi.fn(),
    updateActionField: vi.fn(),
    commitResult: vi.fn(),
    selectArea: vi.fn(),
    selectFoul: vi.fn(),
    clearFoul: vi.fn(),
    redoEventAction: vi.fn(),
    matchInfo: {},
    videoTime: 0,
    volleyballPathStage: null,
    setVolleyballPathStage: vi.fn(),
    skipVolleyballTarget: vi.fn(),
    setVolleyballSystemContext: vi.fn(),
    editLastEvent: vi.fn(),
    undoLastSavedEvent: vi.fn(),
    quickBookmarkCurrentMoment: vi.fn(),
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: 'project-1',
    projects: [{ id: 'project-1', videoMeta: {} }],
    updateProjectLastVideoTime: vi.fn(),
    updateProjectVideoCalibration: vi.fn(),
    updateProjectAnnotations: vi.fn(),
  }),
}));

vi.mock('react-player', () => ({ default: () => <div data-testid="react-player" /> }));
vi.mock('../../hooks/useVideoResize', () => ({
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
vi.mock('../../hooks/useVideoGestures', () => ({
  useVideoGestures: () => ({
    gestureOverlayText: null,
    handleVideoPointerDown: vi.fn(),
    handleVideoPointerMove: vi.fn(),
    handleVideoPointerUp: vi.fn(),
    handleVideoPointerCancel: vi.fn(),
  }),
}));
vi.mock('../../hooks/useVideoPlayback', () => ({
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
vi.mock('../../components/SegmentPreviewPanel', () => ({ default: () => null }));
vi.mock('../../components/hud/ScoutHUDWrapper', () => ({ default: () => null }));
vi.mock('../../components/video/TimelinePanel', () => ({ default: () => null }));
vi.mock('../../hooks/useScreenMarkingMode', () => ({
  useScreenMarkingMode: () => ({ isActive: false }),
}));
vi.mock('../../components/CourtAreaSelector', () => ({ default: () => null }));

import InputPanel from '../../components/InputPanel';
import VideoPlayer from '../../components/VideoPlayer';

afterEach(() => cleanup());

describe('shared HUD entry-point visibility', () => {
  it('hides the standard VideoPlayer HUD control when requested', () => {
    const { rerender } = render(<VideoPlayer showHudToggle={false} />);
    expect(screen.queryByRole('button', { name: /HUD Mode/i })).not.toBeInTheDocument();

    rerender(<VideoPlayer showHudToggle />);
    expect(screen.getByRole('button', { name: /HUD Mode/i })).toBeInTheDocument();
  });

  it('hides the InputPanel HUD control when requested', () => {
    const { rerender } = render(<InputPanel showHudToggle={false} />);
    expect(screen.queryByRole('button', { name: 'HUD' })).not.toBeInTheDocument();

    rerender(<InputPanel showHudToggle />);
    expect(screen.getByRole('button', { name: 'HUD' })).toBeInTheDocument();
  });
});
