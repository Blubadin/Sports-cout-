import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import BadmintonTrackingLab from '../../components/labs/BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';
import { trackingSessionStore } from '../../services/trackingSessionStore';
import * as trackingStorage from '../../services/storage/trackingStorage';
import * as videoFileStore from '../../utils/videoFileStore';
import type { TrackingSessionStatus, TrackingTelemetryV1 } from '../../types';

let mockActiveProjectId = 'proj_alpha';

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    matchInfo: { sportType: 'badminton' },
    settings: { uiLanguage: 'en' },
    localFileName: 'match_game1.mp4',
    setLocalFileName: vi.fn(),
    setVideoSourceType: vi.fn(),
    showToast: vi.fn(),
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: mockActiveProjectId,
    projects: [
      { id: 'proj_alpha', name: 'Project Alpha' },
      { id: 'proj_beta', name: 'Project Beta' },
    ],
  }),
}));

describe('Phase 3 — Persist Tracking Session Across Navigation', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    mockActiveProjectId = 'proj_alpha';
    vi.clearAllMocks();
    localStorage.clear();

    URL.createObjectURL = vi.fn(() => 'blob:mock-video-url');
    URL.revokeObjectURL = vi.fn();

    vi.spyOn(aiTrackingService, 'checkBackendHealth').mockResolvedValue(true);
    vi.spyOn(aiTrackingService, 'getCapabilities').mockResolvedValue({
      selectedDevice: 'cpu',
      cudaAvailable: false,
      mpsAvailable: false,
    });
    vi.spyOn(aiTrackingService, 'deleteSession').mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('navigates away while PROCESSING: unmount does NOT cancel backend session or delete session', async () => {
    const mockFile = new File(['dummy-video-content'], 'match_game1.mp4', { type: 'video/mp4' });
    const deleteSessionSpy = vi.spyOn(aiTrackingService, 'deleteSession');

    // Setup backend mocks for session creation and run
    vi.spyOn(aiTrackingService, 'createSession').mockResolvedValue({
      sessionId: 'session_nav_1',
      status: 'created',
      trackedPlayerCount: 2,
    });
    vi.spyOn(aiTrackingService, 'uploadSessionVideo').mockResolvedValue({ width: 1280, height: 720 });
    vi.spyOn(aiTrackingService, 'calibrateSession').mockResolvedValue(undefined);
    vi.spyOn(aiTrackingService, 'startSessionAnalysis').mockResolvedValue(undefined);

    const mockStatus: TrackingSessionStatus = {
      sessionId: 'session_nav_1',
      status: 'PROCESSING',
      progressPct: 45,
      currentFrame: 90,
      totalFrames: 200,
      analyzedFrames: 45,
      frameStride: 2,
      elapsedSec: 3.5,
      videoDurationSec: 6.6,
      lastTelemetryTimestampSec: null,
      sourceFps: 30,
      samplingFps: 15,
      analysisFps: 15,
      trackedPlayerCount: 2,
      device: 'cpu',
      players: [],
      error: null,
    };
    vi.spyOn(aiTrackingService, 'getSessionStatus').mockResolvedValue(mockStatus);
    vi.spyOn(aiTrackingService, 'getSessionResults').mockResolvedValue({
      sessionId: 'session_nav_1',
      status: 'PROCESSING',
      sampleCount: 5,
      totalSampleCount: 5,
      nextCursor: 5,
      telemetry: [],
    });

    // Seed file and 4 corners in store to enable Run
    trackingSessionStore.setFile('proj_alpha', mockFile);
    trackingSessionStore.updateProjectState('proj_alpha', {
      corners: [[100, 100], [500, 100], [500, 400], [100, 400]],
    });

    // 1. Mount BadmintonTrackingLab
    const { unmount } = render(<BadmintonTrackingLab />);
    await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

    const runBtn = await screen.findByRole('button', { name: /Run Movement Analysis/i });
    expect(runBtn).not.toBeDisabled();
    fireEvent.click(runBtn);

    // Verify session started
    await waitFor(() => {
      expect(aiTrackingService.createSession).toHaveBeenCalled();
      expect(aiTrackingService.startSessionAnalysis).toHaveBeenCalled();
    });

    // Verify progress appears in UI
    expect(await screen.findByText(/Analyzing/i)).toBeInTheDocument();

    // 2. User navigates away: unmount BadmintonTrackingLab
    unmount();

    // Verify deleteSession was NOT called on unmount! (Navigation is NOT cancellation)
    expect(deleteSessionSpy).not.toHaveBeenCalled();

    // Verify session state remains in trackingSessionStore
    const savedState = trackingSessionStore.getProjectState('proj_alpha');
    expect(savedState?.sessionId).toBe('session_nav_1');
    expect(savedState?.status).toBe('PROCESSING');
  });

  it('remount and resume: reconnects to ongoing session, resumes incremental results with NO duplicate telemetry', async () => {
    const mockFile = new File(['dummy-video-content'], 'match_game1.mp4', { type: 'video/mp4' });

    const initialTelemetry: TrackingTelemetryV1[] = [
      {
        schemaVersion: 1,
        analysisId: 'session_resume_1',
        timestampSec: 0.1,
        frameIndex: 3,
        engineVersion: '1.0',
        modelVersion: 'yolo',
        isSynthetic: false,
        source: 'real_tracking',
        players: [],
      },
    ];

    // Seed trackingSessionStore with existing active session
    trackingSessionStore.updateProjectState('proj_alpha', {
      sessionId: 'session_resume_1',
      status: 'PROCESSING',
      progress: 50,
      cursor: 1,
      telemetry: [...initialTelemetry],
      file: mockFile,
    });

    const newTelemetry: TrackingTelemetryV1[] = [
      // Duplicate frame that shouldn't be duplicated:
      {
        schemaVersion: 1,
        analysisId: 'session_resume_1',
        timestampSec: 0.1,
        frameIndex: 3,
        engineVersion: '1.0',
        modelVersion: 'yolo',
        isSynthetic: false,
        source: 'real_tracking',
        players: [],
      },
      // New frame:
      {
        schemaVersion: 1,
        analysisId: 'session_resume_1',
        timestampSec: 0.2,
        frameIndex: 6,
        engineVersion: '1.0',
        modelVersion: 'yolo',
        isSynthetic: false,
        source: 'real_tracking',
        players: [],
      },
    ];

    const mockStatus: TrackingSessionStatus = {
      sessionId: 'session_resume_1',
      status: 'PROCESSING',
      progressPct: 65,
      currentFrame: 130,
      totalFrames: 200,
      analyzedFrames: 65,
      frameStride: 2,
      elapsedSec: 4.5,
      videoDurationSec: 6.6,
      lastTelemetryTimestampSec: null,
      sourceFps: 30,
      samplingFps: 15,
      analysisFps: 15,
      trackedPlayerCount: 2,
      device: 'cpu',
      players: [],
      error: null,
    };

    const getStatusSpy = vi.spyOn(aiTrackingService, 'getSessionStatus').mockResolvedValue(mockStatus);
    const getResultsSpy = vi.spyOn(aiTrackingService, 'getSessionResults').mockResolvedValue({
      sessionId: 'session_resume_1',
      status: 'PROCESSING',
      sampleCount: 2,
      totalSampleCount: 2,
      nextCursor: 3,
      telemetry: newTelemetry,
    });

    // Remount BadmintonTrackingLab
    render(<BadmintonTrackingLab />);

    // Verify session status is refreshed
    await waitFor(() => expect(getStatusSpy).toHaveBeenCalledWith('session_resume_1'));

    // Verify results were fetched using preserved cursor (cursor = 1)
    await waitFor(() => expect(getResultsSpy).toHaveBeenCalledWith('session_resume_1', 1));

    // Verify deduplication: initialTelemetry had 1 frame, newTelemetry added 1 unique frame (total 2)
    await waitFor(() => {
      const state = trackingSessionStore.getProjectState('proj_alpha');
      expect(state?.telemetry.length).toBe(2);
    });
  });

  it('completion while unmounted: recognizes COMPLETED on return, persists exactly once without restart', async () => {
    const mockFile = new File(['dummy-video-content'], 'match_game1.mp4', { type: 'video/mp4' });

    // Seed store at 40% processing
    trackingSessionStore.updateProjectState('proj_alpha', {
      sessionId: 'session_bg_complete',
      status: 'PROCESSING',
      progress: 40,
      cursor: 4,
      telemetry: [],
      file: mockFile,
    });

    const completedStatus: TrackingSessionStatus = {
      sessionId: 'session_bg_complete',
      status: 'COMPLETED',
      progressPct: 100,
      currentFrame: 200,
      totalFrames: 200,
      analyzedFrames: 100,
      frameStride: 2,
      elapsedSec: 8.0,
      videoDurationSec: 6.6,
      lastTelemetryTimestampSec: null,
      sourceFps: 30,
      samplingFps: 15,
      analysisFps: 15,
      trackedPlayerCount: 2,
      device: 'cpu',
      players: [
        { playerId: 'P1', totalDistanceM: 25.4 } as any,
        { playerId: 'P2', totalDistanceM: 30.1 } as any,
      ],
      error: null,
    };

    vi.spyOn(aiTrackingService, 'getSessionStatus').mockResolvedValue(completedStatus);
    vi.spyOn(aiTrackingService, 'getSessionResults').mockResolvedValue({
      sessionId: 'session_bg_complete',
      status: 'COMPLETED',
      sampleCount: 2,
      totalSampleCount: 2,
      nextCursor: 6,
      telemetry: [
        {
          schemaVersion: 1,
          analysisId: 'session_bg_complete',
          timestampSec: 1.0,
          frameIndex: 30,
          engineVersion: '1.0',
          modelVersion: 'yolo',
          isSynthetic: false,
          source: 'real_tracking',
          players: [
            {
              playerId: 'P1',
              courtPosition: { xM: 2, yM: 2, xPct: 30, yPct: 20 },
              totalDistanceM: 25.4,
              speedMps: 1.5,
              state: 'observed',
            },
          ],
        },
      ],
    });

    const persistSpy = vi.spyOn(trackingSessionStore, 'persistCompletedAnalysis');

    // Mount Lab (user returns from Scout)
    render(<BadmintonTrackingLab />);

    // Should recognize COMPLETED and persist
    await waitFor(() => {
      expect(persistSpy).toHaveBeenCalledTimes(1);
    });

    // Verification: completion message displayed, not "Analyzing"
    expect(await screen.findByText(/Analysis complete/i)).toBeInTheDocument();
  });

  it('video retained in SPA: preserves File object in memory across unmount/remount without reselecting', async () => {
    const mockFile = new File(['persistent-video-data'], 'court_rally.mp4', { type: 'video/mp4' });
    trackingSessionStore.setFile('proj_alpha', mockFile);

    const { unmount } = render(<BadmintonTrackingLab />);
    await waitFor(() => expect(screen.getByText(/Change video file/i)).toBeInTheDocument());

    // Unmount
    unmount();

    // Re-mount: file must still be present
    render(<BadmintonTrackingLab />);
    expect(await screen.findByText(/Change video file/i)).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledWith(mockFile);
  });

  it('unavailable source permission: recovers session when file is missing and displays Reconnect Source Video prompt', async () => {
    // Hard reload simulation: file is null, permission cannot be granted
    vi.spyOn(videoFileStore, 'loadProjectVideoFileHandle').mockResolvedValue(null);

    // Session exists on backend and in store metadata
    trackingSessionStore.updateProjectState('proj_alpha', {
      sessionId: 'session_missing_file',
      status: 'PROCESSING',
      progress: 75,
      localFileName: 'reloaded_match.mp4',
      file: null, // File is missing after full reload
    });

    render(<BadmintonTrackingLab />);

    // Should display reconnect banner
    const banner = await screen.findByTestId('reconnect-source-video-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getAllByText(/Reconnect source video/i).length).toBeGreaterThan(0);

    // Should NOT reset session progress or crash
    expect(screen.getByText(/Analyzing 75%/i)).toBeInTheDocument();
  });

  it('explicit cancel still cancels: calls deleteSession and resets project store state', async () => {
    const deleteSessionSpy = vi.spyOn(aiTrackingService, 'deleteSession');
    const mockFile = new File(['video'], 'match.mp4', { type: 'video/mp4' });

    trackingSessionStore.updateProjectState('proj_alpha', {
      sessionId: 'session_to_cancel',
      status: 'PROCESSING',
      progress: 30,
      file: mockFile,
    });

    render(<BadmintonTrackingLab />);
    const cancelBtn = await screen.findByRole('button', { name: /Cancel analysis/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(deleteSessionSpy).toHaveBeenCalledWith('session_to_cancel');
    });

    const state = trackingSessionStore.getProjectState('proj_alpha');
    expect(state?.sessionId).toBeNull();
    expect(state?.status).toBe('IDLE');
  });

  it('project isolation: Project A tracking state does NOT bleed into Project B, switching back restores Project A', async () => {
    const fileA = new File(['videoA'], 'matchA.mp4', { type: 'video/mp4' });
    const fileB = new File(['videoB'], 'matchB.mp4', { type: 'video/mp4' });

    // Project Alpha has active session
    trackingSessionStore.setFile('proj_alpha', fileA);
    trackingSessionStore.updateProjectState('proj_alpha', {
      sessionId: 'session_alpha',
      status: 'PROCESSING',
      progress: 60,
    });

    // 1. Mount in Project Alpha
    const { unmount } = render(<BadmintonTrackingLab />);
    expect(await screen.findByText(/Analyzing 60%/i)).toBeInTheDocument();
    unmount();

    // 2. Switch to Project Beta
    mockActiveProjectId = 'proj_beta';
    const { unmount: unmountBeta } = render(<BadmintonTrackingLab />);

    // Project Beta should be clean / IDLE
    expect(screen.queryByText(/Analyzing 60%/i)).not.toBeInTheDocument();
    const stateBeta = trackingSessionStore.getProjectState('proj_beta');
    expect(stateBeta?.sessionId).toBeNull();
    expect(stateBeta?.status).toBe('IDLE');
    unmountBeta();

    // 3. Switch back to Project Alpha
    mockActiveProjectId = 'proj_alpha';
    render(<BadmintonTrackingLab />);

    // Project Alpha session is completely restored!
    expect(await screen.findByText(/Analyzing 60%/i)).toBeInTheDocument();
    const stateAlpha = trackingSessionStore.getProjectState('proj_alpha');
    expect(stateAlpha?.sessionId).toBe('session_alpha');
  });

  it('completed analysis reload: loads persisted analysis from storage on mount', async () => {
    const mockRecord: trackingStorage.TrackingAnalysis = {
      id: 'analysis_persisted_1',
      projectId: 'proj_alpha',
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      engineVersion: '1.0.0',
      detectorModel: 'yolo',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      createdAt: '2026-09-18T10:00:00Z',
      completedAt: '2026-09-18T10:05:00Z',
      players: [],
      quality: { detectionCoverage: 0.9, lostTimePercent: 10, confidence: 0.85, manualCorrections: 0 },
      summary: { durationSeconds: 60, sampleCount: 600, players: {} },
    };

    vi.spyOn(trackingStorage, 'listTrackingAnalyses').mockResolvedValue([mockRecord]);
    vi.spyOn(trackingStorage, 'getTrackingSampleChunks').mockResolvedValue([]);

    render(<BadmintonTrackingLab />);

    // Should load analysis and display completed movement dashboard
    await waitFor(() => {
      expect(screen.getByText(/Player movement results/i)).toBeInTheDocument();
    });
  });
});
