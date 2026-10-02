import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BadmintonTrackingLab from './BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';
import { computeVideoFingerprint, createDefaultProjectTrackingState, trackingSessionStore } from '../../services/trackingSessionStore';

vi.mock('../../context/ScoutContext', () => ({ useScoutContext: () => ({ matchInfo: { sportType: 'badminton' }, settings: { uiLanguage: 'en' }, videoSourceType: 'local', localFileName: 'rally.mp4', setLocalFileName: vi.fn(), setVideoSourceType: vi.fn(), showToast: vi.fn() }) }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ activeProjectId: 'p1', projects: [], updateProjectVideoCalibration: vi.fn() }) }));
vi.mock('../../utils/videoFileStore', () => ({ loadProjectVideoFileHandle: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/storage/trackingStorage', () => ({ MAX_TRACKING_PAGE_SIZE: 250, listTrackingAnalyses: vi.fn().mockResolvedValue([]), listTrackingAnalysisPage: vi.fn().mockResolvedValue({ analyses: [], nextCursor: null, hasMore: false }), getLatestTrackingAnalysisForProject: vi.fn().mockResolvedValue(null), getTrackingSampleChunkPage: vi.fn().mockResolvedValue({ chunks: [], nextCursor: null, hasMore: false }), getTrackingSampleChunks: vi.fn(), saveTrackingAnalysis: vi.fn(), downsampleAndChunkTrackingSamples: vi.fn() }));
vi.mock('../../services/aiTrackingService', () => ({ aiTrackingService: { checkConnection: vi.fn(), getCapabilities: vi.fn().mockResolvedValue({ selectedDevice: 'cpu', cudaAvailable: false, mpsAvailable: false }), listSessions: vi.fn().mockResolvedValue({ sessions: [], nextCursor: null, maximumPageSize: 250, recoveryIssues: [], recoveryIssueCount: 0, recoveryIssuesTruncated: false, pageIssues: [], pageIssueCount: 0, pageIssuesTruncated: false }), createSession: vi.fn(), uploadSessionVideo: vi.fn(), calibrateSession: vi.fn(), startSessionAnalysis: vi.fn(), getSessionStatus: vi.fn(), getSessionResults: vi.fn(), deleteSession: vi.fn().mockResolvedValue(undefined) } }));
beforeEach(() => { vi.clearAllMocks(); trackingSessionStore.updateProjectState('p1', createDefaultProjectTrackingState('p1')); vi.mocked(aiTrackingService.checkConnection).mockResolvedValue({ code: 'CONNECTED', connected: true, endpoint: 'http://127.0.0.1:8000' }); URL.createObjectURL = vi.fn(() => 'blob:video'); URL.revokeObjectURL = vi.fn(); });
afterEach(() => { cleanup(); trackingSessionStore.updateProjectState('p1', createDefaultProjectTrackingState('p1')); });
it('requires actual video bytes and four real court corners before analysis', async () => {
  render(<BadmintonTrackingLab />);
  await waitFor(() => expect(aiTrackingService.checkConnection).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: /Run Movement Analysis/i })).toBeDisabled();
  expect(screen.getByLabelText('Select video file')).toBeInTheDocument();
  expect(aiTrackingService.createSession).not.toHaveBeenCalled();
});
it('does not offer or launch synthetic tracking when the backend is offline', async () => {
  vi.mocked(aiTrackingService.checkConnection).mockResolvedValue({ code: 'AI_OFFLINE', connected: false, endpoint: 'http://127.0.0.1:8000' });
  render(<BadmintonTrackingLab />);
  await screen.findByText('Local AI service offline');
  expect(screen.queryByText(/Use Simulation|In-Browser Engine/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Run Movement Analysis/i })).toBeDisabled();
});
it('shows authentication required without exposing credential details', async () => {
  vi.mocked(aiTrackingService.checkConnection).mockResolvedValue({ code: 'AUTH_REQUIRED', connected: false, endpoint: 'https://ai.example.com' });
  render(<BadmintonTrackingLab />);
  expect(await screen.findByRole('status')).toHaveTextContent('Authentication required');
  expect(screen.getByRole('status')).not.toHaveTextContent('secret-value');
});
it('shows browser-security blocking distinctly from offline', async () => {
  vi.mocked(aiTrackingService.checkConnection).mockResolvedValue({ code: 'MIXED_CONTENT', connected: false, endpoint: 'http://ai.example.com' });
  render(<BadmintonTrackingLab />);
  expect(await screen.findByRole('status')).toHaveTextContent('Blocked by browser security');
});
it('shows the actual inference device reported by the backend', async () => {
  render(<BadmintonTrackingLab />);
  expect(await screen.findByText(/Inference device: cpu/i)).toBeInTheDocument();
});
it('provides a GPU mode button and disables it when CUDA is unavailable', async () => {
  render(<BadmintonTrackingLab />);
  const button = await screen.findByRole('button', { name: /Use GPU/i });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('title', expect.stringMatching(/CUDA/i));
});
it('provides a clearly visible video file picker button', async () => {
  render(<BadmintonTrackingLab />);
  expect(await screen.findByRole('button', { name: /Choose video file/i })).toBeInTheDocument();
  expect(screen.getByLabelText('Select video file')).toBeInTheDocument();
});

it('restores a saved seek after reload from the bounded backend telemetry page', async () => {
  const status = {
    sessionId: 'seek-run', status: 'INTERRUPTED' as const, progressPct: 60, currentFrame: 100,
    totalFrames: 100, analyzedFrames: 1, committedResultCursor: 1, frameStride: 1,
    elapsedSec: 1, videoDurationSec: 10, lastTelemetryTimestampSec: 5, sourceFps: 10,
    samplingFps: 0.1, analysisFps: 10, trackedPlayerCount: 2, device: 'cpu', players: [], error: null,
  };
  const telemetry = {
    schemaVersion: 1 as const, analysisId: 'seek-run', pipelineRunId: 'seek-run', timestampSec: 5,
    frameIndex: 50, cameraSegmentId: 'segment-7', players: [],
    shuttle: { timestampSec: 5, frameIndex: 50, positionPx: { x: 30, y: 40 }, confidence: 0.9,
      state: 'observed' as const, source: 'temporal_tracker' as const, trajectoryId: 't1' },
  };
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  trackingSessionStore.updateProjectState('p1', {
    file,
    videoFingerprint: computeVideoFingerprint(file),
    sessionId: 'seek-run', status: 'INTERRUPTED', sessionStatus: status,
    uiPreferences: { overlayMode: 'skeleton', videoCurrentTime: 5, selectedInspectorTab: 'analysis' },
  });
  vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(status);
  vi.mocked(aiTrackingService.getSessionResults).mockResolvedValue({
    sessionId: 'seek-run', status: 'INTERRUPTED', sampleCount: 1, totalSampleCount: 1,
    nextCursor: 1, telemetry: [telemetry],
  });

  render(<BadmintonTrackingLab />);
  const video = await waitFor(() => {
    const element = document.querySelector('video');
    expect(element).not.toBeNull();
    return element as HTMLVideoElement;
  });
  fireEvent.loadedMetadata(video);

  await waitFor(() => expect(aiTrackingService.getSessionResults).toHaveBeenCalledWith(
    'seek-run', 0, 1, expect.any(AbortSignal),
  ));
  await waitFor(() => expect(screen.getByLabelText('Shuttle diagnostics')).toHaveTextContent('State: observed'));
});

it('shows unavailable when a seek-time backend page is missing', async () => {
  const status = {
    sessionId: 'seek-run', status: 'INTERRUPTED' as const, progressPct: 60, currentFrame: 100,
    totalFrames: 100, analyzedFrames: 1, committedResultCursor: 1, frameStride: 1,
    elapsedSec: 1, videoDurationSec: 10, lastTelemetryTimestampSec: 5, sourceFps: 10,
    samplingFps: 0.1, analysisFps: 10, trackedPlayerCount: 2, device: 'cpu', players: [], error: null,
  };
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  trackingSessionStore.updateProjectState('p1', {
    file,
    videoFingerprint: computeVideoFingerprint(file),
    sessionId: 'seek-run', status: 'INTERRUPTED', sessionStatus: status,
    uiPreferences: { overlayMode: 'skeleton', videoCurrentTime: 5, selectedInspectorTab: 'analysis' },
  });
  vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(status);
  type ResultPage = Awaited<ReturnType<typeof aiTrackingService.getSessionResults>>;
  let resolvePage: ((value: ResultPage) => void) | null = null;
  vi.mocked(aiTrackingService.getSessionResults).mockImplementation(() => new Promise((resolve) => { resolvePage = resolve; }));

  render(<BadmintonTrackingLab />);
  const video = await waitFor(() => {
    const element = document.querySelector('video');
    expect(element).not.toBeNull();
    return element as HTMLVideoElement;
  });
  fireEvent.loadedMetadata(video);
  expect(await screen.findByText('Loading tracking data for this time…')).toBeInTheDocument();
  resolvePage?.({
    sessionId: 'seek-run', status: 'INTERRUPTED', sampleCount: 0, totalSampleCount: 1,
    nextCursor: 0, telemetry: [],
  });
  expect(await screen.findByText('No tracking data is available for this time')).toBeInTheDocument();
});

it('surfaces a backend failure as an accessible seek-time error', async () => {
  const status = {
    sessionId: 'seek-run', status: 'INTERRUPTED' as const, progressPct: 60, currentFrame: 100,
    totalFrames: 100, analyzedFrames: 1, committedResultCursor: 1, frameStride: 1,
    elapsedSec: 1, videoDurationSec: 10, lastTelemetryTimestampSec: 5, sourceFps: 10,
    samplingFps: 0.1, analysisFps: 10, trackedPlayerCount: 2, device: 'cpu', players: [], error: null,
  };
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  trackingSessionStore.updateProjectState('p1', {
    file,
    videoFingerprint: computeVideoFingerprint(file),
    sessionId: 'seek-run', status: 'INTERRUPTED', sessionStatus: status,
    uiPreferences: { overlayMode: 'skeleton', videoCurrentTime: 5, selectedInspectorTab: 'analysis' },
  });
  vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(status);
  vi.mocked(aiTrackingService.getSessionResults).mockRejectedValue(new Error('service unavailable'));

  render(<BadmintonTrackingLab />);
  const video = await waitFor(() => {
    const element = document.querySelector('video');
    expect(element).not.toBeNull();
    return element as HTMLVideoElement;
  });
  fireEvent.loadedMetadata(video);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tracking data');
});
