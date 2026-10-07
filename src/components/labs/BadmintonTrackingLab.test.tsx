import { fireEvent, render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BadmintonTrackingLab from './BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';
import { trackingSessionApi } from '../../services/trackingSessionApi';
import { computeVideoFingerprint, createDefaultProjectTrackingState, trackingSessionStore } from '../../services/trackingSessionStore';
import { AIConnectionError } from '../../services/aiConnection';
import type { TrackingSessionStatus, TrackingTelemetryV1 } from '../../types';
import type { TrackingAnalysis, TrackingSampleChunk } from '../../services/storage/trackingStorage';
import { getTrackingAnalysis } from '../../services/storage/trackingStorage';

vi.mock('../../context/ScoutContext', () => ({ useScoutContext: () => ({ matchInfo: { sportType: 'badminton' }, settings: { uiLanguage: 'en' }, videoSourceType: 'local', localFileName: 'rally.mp4', setLocalFileName: vi.fn(), setVideoSourceType: vi.fn(), showToast: vi.fn() }) }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ activeProjectId: 'p1', projects: [], updateProjectVideoCalibration: vi.fn() }) }));
vi.mock('../../utils/videoFileStore', () => ({ loadProjectVideoFileHandle: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/storage/trackingStorage', () => ({ MAX_TRACKING_PAGE_SIZE: 250, listTrackingAnalyses: vi.fn().mockResolvedValue([]), listTrackingAnalysisPage: vi.fn().mockResolvedValue({ analyses: [], nextCursor: null, hasMore: false }), getLatestTrackingAnalysisForProject: vi.fn().mockResolvedValue(null), getTrackingAnalysis: vi.fn().mockResolvedValue(null), getTrackingSampleChunkPage: vi.fn().mockResolvedValue({ chunks: [], nextCursor: null, hasMore: false }), getTrackingSampleChunks: vi.fn(), saveTrackingAnalysis: vi.fn(), downsampleAndChunkTrackingSamples: vi.fn(), calculateNominalAnalysisHz: vi.fn().mockReturnValue(null), calculateEffectiveStoredHz: vi.fn().mockReturnValue(null), getTrackingMovementMetrics: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/aiTrackingService', () => ({ aiTrackingService: { checkConnection: vi.fn(), getCapabilities: vi.fn().mockResolvedValue({ selectedDevice: 'cpu', cudaAvailable: false, mpsAvailable: false }), listSessions: vi.fn().mockResolvedValue({ sessions: [], nextCursor: null, maximumPageSize: 250, recoveryIssues: [], recoveryIssueCount: 0, recoveryIssuesTruncated: false, pageIssues: [], pageIssueCount: 0, pageIssuesTruncated: false }), createSession: vi.fn(), uploadSessionVideo: vi.fn(), calibrateSession: vi.fn(), startSessionAnalysis: vi.fn(), getSessionStatus: vi.fn(), getSessionResults: vi.fn(), deleteSession: vi.fn().mockResolvedValue(undefined) } }));
beforeEach(() => { vi.clearAllMocks(); trackingSessionStore.updateProjectState('p1', createDefaultProjectTrackingState('p1')); vi.mocked(aiTrackingService.checkConnection).mockResolvedValue({ code: 'CONNECTED', connected: true, endpoint: 'http://127.0.0.1:8000' }); URL.createObjectURL = vi.fn(() => 'blob:video'); URL.revokeObjectURL = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); trackingSessionStore.updateProjectState('p1', createDefaultProjectTrackingState('p1')); });
it('requires actual video bytes before analysis', async () => {
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
it('relabels a stale network error after the Local AI health check succeeds', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  trackingSessionStore.updateProjectState('p1', {
    file,
    videoFingerprint: computeVideoFingerprint(file),
    error: 'AI service network connection failed.',
  });
  render(<BadmintonTrackingLab />);
  expect(await screen.findByText('Local AI is reachable, but the previous request failed. Retry the analysis.')).toBeInTheDocument();
  expect(screen.queryByText('AI service network connection failed.')).not.toBeInTheDocument();
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
it('creates a new CUDA session when GPU is selected for a cancelled CPU analysis', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  trackingSessionStore.updateProjectState('p1', {
    file, sessionId: 'old-cpu', status: 'CANCELLED', videoFingerprint: computeVideoFingerprint(file),
    processingConfig: { device: 'cpu', requestedDevice: 'cpu', autoCourtCalibrationEnabled: true,
      detectorInputSize: 640, useCourtRoi: false, courtRoiMarginPx: 60, frameStride: 2, poseStride: 1 },
  });
  vi.mocked(aiTrackingService.getCapabilities).mockResolvedValueOnce({ selectedDevice: 'cuda', cudaAvailable: true, mpsAvailable: false });
  vi.mocked(aiTrackingService.createSession).mockResolvedValue({ sessionId: 'new-cuda', status: 'READY', trackedPlayerCount: 2 });
  vi.mocked(aiTrackingService.uploadSessionVideo).mockResolvedValue({ width: 1280, height: 720 });
  render(<BadmintonTrackingLab />);
  await screen.findByText(/Inference device: cuda/i);
  fireEvent.click(screen.getByRole('button', { name: /Use GPU/i }));
  fireEvent.click(screen.getByRole('button', { name: /Run Movement Analysis/i }));
  await waitFor(() => expect(aiTrackingService.startSessionAnalysis).toHaveBeenCalledWith('new-cuda'));
  expect(aiTrackingService.createSession).toHaveBeenCalledWith('singles', 'upload', expect.objectContaining({
    device: 'cuda', processingConfig: expect.objectContaining({ device: 'cuda' }),
  }));
  expect(aiTrackingService.startSessionAnalysis).not.toHaveBeenCalledWith('old-cpu');
  expect(aiTrackingService.deleteSession).not.toHaveBeenCalledWith('old-cpu');
});
it('starts a clean session when a different video with the same filename replaces a cancelled analysis', async () => {
  const previousFile = new File(['old'], 'match.mp4', { type: 'video/mp4', lastModified: 1 });
  const nextFile = new File(['new'], 'match.mp4', { type: 'video/mp4', lastModified: 2 });
  const previousAnalysis: TrackingAnalysis = {
    id: 'old-analysis', projectId: 'p1', sportType: 'badminton', gameType: 'singles', status: 'completed',
    engineVersion: 'test', detectorModel: 'test-detector', trackerModel: 'test-tracker',
    sampleRateHz: null, createdAt: new Date().toISOString(), players: [],
    summary: { durationSeconds: 1, sampleCount: 0, players: {} },
  };
  const previousTelemetry: TrackingTelemetryV1 = {
    schemaVersion: 1, analysisId: 'old-analysis', timestampSec: 0.1, frameIndex: 1, players: [],
  };
  const previousChunk: TrackingSampleChunk = {
    id: 'old-analysis:0', analysisId: 'old-analysis', chunkIndex: 0, startTime: 0, endTime: 1, samples: [],
  };
  trackingSessionStore.updateProjectState('p1', {
    file: previousFile,
    sessionId: 'old-session',
    status: 'CANCELLED',
    videoFingerprint: computeVideoFingerprint(previousFile),
    corners: [[1, 2], [3, 4], [5, 6], [7, 8]],
    telemetry: [previousTelemetry],
    cursor: 1,
    analysis: previousAnalysis,
    chunks: [previousChunk],
    processingConfig: { ...createDefaultProjectTrackingState('p1').processingConfig, autoCourtCalibrationEnabled: true },
  });
  vi.mocked(aiTrackingService.createSession).mockResolvedValue({ sessionId: 'new-session', status: 'READY', trackedPlayerCount: 2 });
  vi.mocked(aiTrackingService.uploadSessionVideo).mockResolvedValue({ width: 1280, height: 720 });
  const makeStatus = (sessionId: string, status: TrackingSessionStatus['status']): TrackingSessionStatus => ({
    sessionId, status, progressPct: 0, currentFrame: 0, totalFrames: 0, analyzedFrames: 0,
    frameStride: 2, elapsedSec: null, videoDurationSec: null, lastTelemetryTimestampSec: null,
    sourceFps: null, samplingFps: null, analysisFps: null, trackedPlayerCount: 2, device: 'cpu',
    players: [], error: null,
  });
  vi.mocked(aiTrackingService.getSessionStatus)
    .mockResolvedValueOnce(makeStatus('old-session', 'CANCELLED'))
    .mockResolvedValue(makeStatus('new-session', 'PROCESSING'));
  vi.mocked(aiTrackingService.getSessionResults).mockResolvedValue({
    sessionId: 'new-session', status: 'PROCESSING', sampleCount: 0, totalSampleCount: 0, nextCursor: 0, telemetry: [],
  });

  render(<BadmintonTrackingLab />);
  await screen.findByText(/Inference device: cpu/i);
  fireEvent.change(screen.getByLabelText('Select video file'), { target: { files: [nextFile] } });

  await waitFor(() => expect(trackingSessionStore.getProjectState('p1')).toMatchObject({
    file: nextFile,
    sessionId: null,
    videoFingerprint: computeVideoFingerprint(nextFile),
    status: 'IDLE',
    corners: [],
    telemetry: [],
    cursor: 0,
    analysis: null,
    chunks: [],
    sessionStatus: null,
  }));
  expect(screen.getByRole('button', { name: /Run Movement Analysis/i })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: /Run Movement Analysis/i }));
  await waitFor(() => expect(aiTrackingService.startSessionAnalysis).toHaveBeenCalledWith('new-session'));
  expect(aiTrackingService.createSession).toHaveBeenCalledWith('singles', 'upload', expect.objectContaining({
    videoFingerprint: computeVideoFingerprint(nextFile),
  }));
  expect(aiTrackingService.uploadSessionVideo).toHaveBeenCalledWith('new-session', nextFile, expect.any(AbortSignal));
});
it('provides a clearly visible video file picker button', async () => {
  render(<BadmintonTrackingLab />);
  expect(await screen.findByRole('button', { name: /Choose video file/i })).toBeInTheDocument();
  expect(screen.getByLabelText('Select video file')).toBeInTheDocument();
});
it('starts automatic court analysis without inventing or submitting manual corners', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  trackingSessionStore.updateProjectState('p1', { file });
  vi.mocked(aiTrackingService.createSession).mockResolvedValue({ sessionId: 'auto-run', status: 'READY', trackedPlayerCount: 2 });
  vi.mocked(aiTrackingService.uploadSessionVideo).mockResolvedValue({ width: 1280, height: 720 });
  render(<BadmintonTrackingLab />);
  await screen.findByText(/Inference device: cpu/i);
  const run = screen.getByRole('button', { name: /Run Movement Analysis/i });
  expect(run).toBeDisabled(); // Manual mode still requires real corners.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Automatic court calibration' }));
  expect(run).toBeEnabled();
  fireEvent.click(run);
  await waitFor(() => expect(aiTrackingService.startSessionAnalysis).toHaveBeenCalledWith('auto-run'));
  expect(aiTrackingService.createSession).toHaveBeenCalledWith('singles', 'upload', expect.objectContaining({
    processingConfig: expect.objectContaining({ autoCourtCalibrationEnabled: true }),
  }));
  expect(aiTrackingService.calibrateSession).not.toHaveBeenCalled();
  expect(trackingSessionStore.getProjectState('p1')?.corners).toEqual([]);
});

it('keeps an uploaded video ready to retry when the backend analysis worker is busy', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  trackingSessionStore.updateProjectState('p1', {
    file,
    processingConfig: { ...createDefaultProjectTrackingState('p1').processingConfig, autoCourtCalibrationEnabled: true },
  });
  vi.mocked(aiTrackingService.createSession).mockResolvedValue({ sessionId: 'busy-run', status: 'READY', trackedPlayerCount: 2 });
  vi.mocked(aiTrackingService.uploadSessionVideo).mockResolvedValue({ width: 1280, height: 720 });
  vi.mocked(aiTrackingService.startSessionAnalysis).mockRejectedValue(new AIConnectionError('AI_BUSY'));

  render(<BadmintonTrackingLab />);
  await screen.findByText(/Inference device: cpu/i);
  fireEvent.click(screen.getByRole('button', { name: /Run Movement Analysis/i }));

  await waitFor(() => expect(trackingSessionStore.getProjectState('p1')).toMatchObject({
    sessionId: 'busy-run',
    status: 'VIDEO_READY',
    error: 'Another AI analysis is running. Wait for it to finish or cancel it before starting a new analysis.',
  }));
  expect(aiTrackingService.createSession).toHaveBeenCalledTimes(1);
  expect(aiTrackingService.uploadSessionVideo).toHaveBeenCalledTimes(1);
});

it('keeps manual calibration before start when automatic court calibration is off', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  const corners = [[100, 100], [1100, 100], [1100, 600], [100, 600]];
  trackingSessionStore.updateProjectState('p1', { file, corners });
  vi.mocked(aiTrackingService.createSession).mockResolvedValue({ sessionId: 'manual-run', status: 'READY', trackedPlayerCount: 2 });
  vi.mocked(aiTrackingService.uploadSessionVideo).mockResolvedValue({ width: 1280, height: 720 });
  render(<BadmintonTrackingLab />);
  await screen.findByText(/Inference device: cpu/i);
  fireEvent.click(screen.getByRole('button', { name: /Run Movement Analysis/i }));
  await waitFor(() => expect(aiTrackingService.startSessionAnalysis).toHaveBeenCalledWith('manual-run'));
  expect(aiTrackingService.calibrateSession).toHaveBeenCalledWith('manual-run', corners, 'singles');
  expect(aiTrackingService.createSession).toHaveBeenCalledWith('singles', 'upload', expect.objectContaining({
    processingConfig: expect.objectContaining({ autoCourtCalibrationEnabled: false }),
  }));
});

it('displays accepted automatic court geometry and removes it immediately after a cut', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  const frame = {
    schemaVersion: 1 as const, analysisId: 'court-overlay-run', timestampSec: 0, frameIndex: 0, players: [],
    cameraSegmentId: 'segment-0', calibrationState: 'CALIBRATED' as const, calibrationId: 'court-1',
    calibration: { calibrationId: 'court-1', cameraSegmentId: 'segment-0', state: 'CALIBRATED' as const,
      source: 'automatic' as const, createdAtFrame: 0, createdAtTimestampSec: 0,
      corners: [[100, 100], [1100, 100], [1100, 600], [100, 600]],
      hInvMatrix: [[1000 / 6.1, 0, 100], [0, 500 / 13.4, 100], [0, 0, 1]] },
  };
  trackingSessionStore.updateProjectState('p1', { file, telemetry: [frame] });
  render(<BadmintonTrackingLab />);
  const video = document.querySelector('video')!;
  Object.defineProperty(video, 'videoWidth', { value: 1280 });
  Object.defineProperty(video, 'videoHeight', { value: 720 });
  fireEvent.loadedMetadata(video);
  expect(await screen.findByLabelText('Validated court calibration')).toBeInTheDocument();
  expect(screen.getByTestId('court-marking-singles-left')).toHaveAttribute('x1');
  expect(screen.getByTestId('court-marking-short-service-top')).toBeInTheDocument();
  act(() => trackingSessionStore.updateProjectState('p1', { telemetry: [{ ...frame,
    cameraSegmentId: 'segment-1', calibrationState: 'CALIBRATION_LOST', calibrationId: null,
  }] }));
  await waitFor(() => expect(screen.queryByLabelText('Validated court calibration')).not.toBeInTheDocument());
  expect(screen.queryByTestId('court-marking-singles-left')).not.toBeInTheDocument();
});

it('explains the uncalibrated opening and seeks to the first observed court calibration', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  const calibration = {
    calibrationId: 'court-1', cameraSegmentId: 'segment-0', state: 'CALIBRATED' as const,
    source: 'automatic' as const, createdAtFrame: 69, createdAtTimestampSec: 4.6,
    corners: [[100, 100], [1100, 100], [1100, 600], [100, 600]],
    hInvMatrix: [[1000 / 6.1, 0, 100], [0, 500 / 13.4, 100], [0, 0, 1]],
  };
  const opening: TrackingTelemetryV1 = {
    schemaVersion: 1, analysisId: 'court-run', timestampSec: 0, frameIndex: 0, players: [],
    cameraSegmentId: 'segment-0', calibrationState: 'UNCALIBRATED', calibrationId: null,
  };
  const calibrated: TrackingTelemetryV1 = {
    ...opening, timestampSec: 4.6, frameIndex: 69, calibrationState: 'CALIBRATED',
    calibrationId: 'court-1', calibration,
  };
  trackingSessionStore.updateProjectState('p1', { file, telemetry: [opening, calibrated] });
  render(<BadmintonTrackingLab />);
  const video = document.querySelector('video')!;
  Object.defineProperty(video, 'videoWidth', { value: 1280 });
  Object.defineProperty(video, 'videoHeight', { value: 720 });
  fireEvent.loadedMetadata(video);
  expect(await screen.findByText(/Court line guides begin at 4.6 s/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Validated court calibration')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Jump to detected court' }));
  expect(video.currentTime).toBeCloseTo(4.6);
  expect(await screen.findByLabelText('Validated court calibration')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Jump to detected court' })).not.toBeInTheDocument();
});

it('offers export for a completed real analysis session and opens its configuration', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  const sessionStatus: TrackingSessionStatus = {
    sessionId: 'completed-run', status: 'COMPLETED', progressPct: 100,
    currentFrame: 120, totalFrames: 120, analyzedFrames: 60, frameStride: 2,
    elapsedSec: 12, videoDurationSec: 4, lastTelemetryTimestampSec: 4,
    sourceFps: 30, samplingFps: 15, analysisFps: 5,
    trackedPlayerCount: 2, device: 'cpu', players: [], error: null,
  };
  trackingSessionStore.updateProjectState('p1', {
    file, videoFingerprint: computeVideoFingerprint(file), sessionId: 'completed-run',
    status: 'COMPLETED', sessionStatus,
  });
  vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(sessionStatus);
  vi.mocked(aiTrackingService.getSessionResults).mockResolvedValue({
    sessionId: 'completed-run', status: 'COMPLETED', sampleCount: 0,
    totalSampleCount: 0, nextCursor: 0, telemetry: [],
  });
  vi.mocked(getTrackingAnalysis).mockResolvedValueOnce({
    id: 'completed-run', projectId: 'p1', sportType: 'badminton', gameType: 'singles',
    status: 'completed', engineVersion: 'test', detectorModel: 'test-detector',
    trackerModel: 'test-tracker', sampleRateHz: null, createdAt: new Date().toISOString(),
    players: [], summary: { durationSeconds: 4, sampleCount: 0, players: {} },
  });
  render(<BadmintonTrackingLab />);
  const exportButton = await screen.findByRole('button', { name: /EXPORT/ });
  fireEvent.click(exportButton);
  expect(screen.getByText('Export Analysis Package')).toBeInTheDocument();
  expect(screen.getByText(/Start Export/i)).toBeInTheDocument();
});

it('exports the previous completed session while a newer analysis is processing', async () => {
  const file = new File(['video'], 'rally.mp4', { type: 'video/mp4' });
  const activeStatus: TrackingSessionStatus = {
    sessionId: 'session_12345678', status: 'PROCESSING', progressPct: 50,
    currentFrame: 60, totalFrames: 120, analyzedFrames: 30, frameStride: 2,
    elapsedSec: 6, videoDurationSec: 4, lastTelemetryTimestampSec: 2,
    sourceFps: 30, samplingFps: 15, analysisFps: 5,
    trackedPlayerCount: 2, device: 'cpu', players: [], error: null,
  };
  const previousAnalysis: TrackingAnalysis = {
    id: 'session_37b5ce38', projectId: 'p1', sportType: 'badminton', gameType: 'singles',
    status: 'completed', engineVersion: 'test', detectorModel: 'test-detector',
    trackerModel: 'test-tracker', sampleRateHz: null, createdAt: new Date().toISOString(),
    players: [], summary: { durationSeconds: 4, sampleCount: 0, players: {} },
  };
  trackingSessionStore.updateProjectState('p1', {
    file, videoFingerprint: computeVideoFingerprint(file), sessionId: activeStatus.sessionId,
    status: 'PROCESSING', sessionStatus: activeStatus, analysis: previousAnalysis,
  });
  vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(activeStatus);
  vi.mocked(aiTrackingService.getSessionResults).mockResolvedValue({
    sessionId: activeStatus.sessionId, status: 'PROCESSING', sampleCount: 0,
    totalSampleCount: 0, nextCursor: 0, telemetry: [],
  });
  const startExport = vi.spyOn(trackingSessionApi, 'startSessionExport').mockImplementation(() => new Promise(() => {}));

  render(<BadmintonTrackingLab />);
  fireEvent.click(await screen.findByRole('button', { name: /EXPORT PREVIOUS/ }));
  fireEvent.click(screen.getByRole('button', { name: /Start Export/i }));
  await waitFor(() => expect(startExport).toHaveBeenCalledWith('session_37b5ce38', expect.any(Object)));
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
