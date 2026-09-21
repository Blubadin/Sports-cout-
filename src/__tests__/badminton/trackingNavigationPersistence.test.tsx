import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import BadmintonTrackingLab from '../../../src/components/labs/BadmintonTrackingLab';
import { trackingSessionStore, computeVideoFingerprint, createDefaultProjectTrackingState } from '../../../src/services/trackingSessionStore';
import { aiTrackingService } from '../../../src/services/aiTrackingService';
import * as videoFileStore from '../../../src/utils/videoFileStore';
import * as trackingStorage from '../../../src/services/storage/trackingStorage';
import type { TrackingSessionStatus } from '../../../src/types';

// Mock dependencies
vi.mock('../../../src/services/aiTrackingService', () => ({
  aiTrackingService: {
    listSessions: vi.fn().mockResolvedValue([]),
    getSessionStatus: vi.fn(),
    createSession: vi.fn(),
    uploadSessionVideo: vi.fn(),
    calibrateSession: vi.fn(),
    startSessionAnalysis: vi.fn(),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    getSessionResults: vi.fn().mockResolvedValue({ telemetry: [], nextCursor: 1 }),
    checkBackendHealth: vi.fn().mockResolvedValue(true),
  },
}));

// Provide a fake store for useProjectStore so it doesn't crash
vi.mock('../../store/projectStore', () => ({
  useProjectStore: vi.fn().mockReturnValue({
    activeProjectId: 'project-1',
    activeProject: { id: 'project-1', name: 'Test' }
  }),
}));

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: vi.fn().mockReturnValue({
    matchInfo: { sportType: 'badminton' },
    settings: {},
    localFileName: null,
    setLocalFileName: vi.fn(),
    setVideoSourceType: vi.fn(),
  }),
}));

import { useWorkspace } from '../../../src/context/WorkspaceContext';

vi.mock('../../../src/context/WorkspaceContext', () => ({
  useWorkspace: vi.fn().mockReturnValue({
    activeProjectId: 'project-1',
  }),
}));

describe('Phase 0.1 — Tracking Navigation Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWorkspace).mockReturnValue({ activeProjectId: 'project-1' } as any);
    trackingSessionStore.updateProjectState('project-1', createDefaultProjectTrackingState('project-1'));
    trackingSessionStore.updateProjectState('project-2', createDefaultProjectTrackingState('project-2'));
  });

  const setupStoreWithSession = (status: any, sessionId: string = 'session-123') => {
    trackingSessionStore.updateProjectState('project-1', {
      sessionId,
      status,
      error: null,
    });
  };

  const mockStatus = (status: any, overrides: any = {}) => ({
    sessionId: 'session-123',
    status,
    progressPct: 0,
    currentFrame: 0,
    totalFrames: 0,
    analyzedFrames: 0,
    lastTelemetryTimestampSec: 0,
    elapsedSec: 0,
    analysisFps: 0,
    processedVideoTimeSec: 0,
    realtimeSpeed: 0,
    sourceFps: 30,
    samplingFps: 30,
    effectiveDevice: 'cpu',
    players: [],
    ...overrides
  });

  it('A. local state UPLOADING but backend is VIDEO_READY -> recovers to VIDEO_READY', async () => {
    setupStoreWithSession('UPLOADING');
    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValueOnce(mockStatus('VIDEO_READY') as any);

    render(<BadmintonTrackingLab />);

    await waitFor(() => {
      const state = trackingSessionStore.getProjectState('project-1');
      expect(state?.status).toBe('VIDEO_READY');
    });
  });

  it('B. local state READY_TO_ANALYZE and backend is READY_TO_ANALYZE -> restores READY_TO_ANALYZE', async () => {
    setupStoreWithSession('READY_TO_ANALYZE');
    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValueOnce(mockStatus('READY_TO_ANALYZE') as any);

    render(<BadmintonTrackingLab />);

    await waitFor(() => {
      const state = trackingSessionStore.getProjectState('project-1');
      expect(state?.status).toBe('READY_TO_ANALYZE');
    });
  });

  it('C. local state PROCESSING and backend PROCESSING -> resumes polling', async () => {
    setupStoreWithSession('PROCESSING');
    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(
      mockStatus('PROCESSING', { progressPct: 50, currentFrame: 50, totalFrames: 100, analyzedFrames: 50 }) as any
    );

    render(<BadmintonTrackingLab />);

    await waitFor(() => {
      const state = trackingSessionStore.getProjectState('project-1');
      expect(state?.status).toBe('PROCESSING');
      expect(state?.progress).toBe(50);
    });
    
    // Check that getSessionStatus was called, proving polling started
    expect(aiTrackingService.getSessionStatus).toHaveBeenCalled();
  });

  it('D. local state PROCESSING but backend is ERROR -> displays ERROR', async () => {
    setupStoreWithSession('PROCESSING');
    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValueOnce(
      mockStatus('ERROR', { error: 'Backend crashed' }) as any
    );

    render(<BadmintonTrackingLab />);

    await waitFor(() => {
      const state = trackingSessionStore.getProjectState('project-1');
      expect(state?.status).toBe('ERROR');
      expect(state?.error).toBe('Backend crashed');
    });
  });

  it('E. existing VIDEO_READY session + matching video -> continue without createSession()', async () => {
    const mockFile = new File(['dummy'], 'video.mp4', { type: 'video/mp4' });
    setupStoreWithSession('VIDEO_READY');
    trackingSessionStore.setFile('project-1', mockFile);
    // Since videoFingerprint is generated from size+name+lastModified, mock it in store
    trackingSessionStore.updateProjectState('project-1', {
      videoFingerprint: computeVideoFingerprint(mockFile),
      corners: [[0, 0], [100, 0], [100, 100], [0, 100]] // Valid corners
    });
    
    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValueOnce(mockStatus('VIDEO_READY') as any);
    const createSpy = vi.spyOn(aiTrackingService, 'createSession');
    const uploadSpy = vi.spyOn(aiTrackingService, 'uploadSessionVideo').mockResolvedValueOnce(undefined as any);
    const startSpy = vi.spyOn(aiTrackingService, 'startSessionAnalysis').mockResolvedValueOnce({} as any);

    render(<BadmintonTrackingLab />);
    
    // Simulate clicking Start Tracking
    const startBtn = await screen.findByRole('button', { name: /Run Movement Analysis/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      // Should NOT create or upload
      expect(createSpy).not.toHaveBeenCalled();
      expect(uploadSpy).not.toHaveBeenCalled();
      // Should proceed to calibration or start (depending on UI state, here it skips to upload/start since VIDEO_READY)
    });
  });

  it('F. existing READY_TO_ANALYZE session + matching video -> no re-upload -> no createSession() -> start existing session', async () => {
    const mockFile = new File(['dummy'], 'video.mp4', { type: 'video/mp4' });
    setupStoreWithSession('READY_TO_ANALYZE');
    trackingSessionStore.setFile('project-1', mockFile);
    trackingSessionStore.updateProjectState('project-1', {
      videoFingerprint: computeVideoFingerprint(mockFile),
      corners: [[0, 0], [100, 0], [100, 100], [0, 100]]
    });

    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValueOnce(mockStatus('READY_TO_ANALYZE') as any);
    const createSpy = vi.spyOn(aiTrackingService, 'createSession');
    const uploadSpy = vi.spyOn(aiTrackingService, 'uploadSessionVideo');
    const startSpy = vi.spyOn(aiTrackingService, 'startSessionAnalysis').mockResolvedValueOnce({} as any);

    render(<BadmintonTrackingLab />);
    
    const startBtn = await screen.findByRole('button', { name: /Run Movement Analysis/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(createSpy).not.toHaveBeenCalled();
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalledWith('session-123');
    });
  });

  it('completion while unmounted: recognizes COMPLETED on return, persists exactly once without restart', async () => {
    const mockFile = new File(['dummy-video-content'], 'match_game1.mp4', { type: 'video/mp4' });

    // Seed store at 40% processing
    trackingSessionStore.updateProjectState('project-1', {
      sessionId: 'session_bg_complete',
      status: 'PROCESSING',
      progress: 40,
      cursor: 4,
      telemetry: [],
      file: mockFile,
      videoFingerprint: computeVideoFingerprint(mockFile),
    });

    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(mockStatus('COMPLETED', { progressPct: 100 }) as any);
    vi.mocked(aiTrackingService.getSessionResults).mockResolvedValue({
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
    } as any);

    const persistSpy = vi.spyOn(trackingSessionStore, 'persistCompletedAnalysis');

    // Mount Lab (user returns from Scout)
    render(<BadmintonTrackingLab />);

    // Should recognize COMPLETED and persist
    await waitFor(() => {
      expect(persistSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('video retained in SPA: preserves File object in memory across unmount/remount without reselecting', async () => {
    const mockFile = new File(['persistent-video-data'], 'court_rally.mp4', { type: 'video/mp4' });
    trackingSessionStore.setFile('project-1', mockFile);

    const { unmount } = render(<BadmintonTrackingLab />);
    await waitFor(() => expect(screen.getByText(/Change video file/i)).toBeInTheDocument());

    // Unmount
    unmount();

    // Re-mount: file must still be present
    render(<BadmintonTrackingLab />);
    expect(await screen.findByText(/Change video file/i)).toBeInTheDocument();
  });

  it('unavailable source permission: recovers session when file is missing and displays Reconnect Source Video prompt', async () => {
    // Hard reload simulation: file is null, permission cannot be granted
    vi.spyOn(videoFileStore, 'loadProjectVideoFileHandle').mockResolvedValue(null);

    trackingSessionStore.updateProjectState('project-1', {
      sessionId: 'session_missing_file',
      status: 'PROCESSING',
      progress: 75,
      localFileName: 'reloaded_match.mp4',
      file: null, // File is missing after full reload
    });
    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(mockStatus('PROCESSING', { progressPct: 75 }) as any);

    render(<BadmintonTrackingLab />);

    // Should display reconnect banner
    const banner = await screen.findByTestId('reconnect-source-video-banner');
    expect(banner).toBeInTheDocument();
    
    // Should NOT reset session progress or crash
    expect(screen.getByText(/Analyzing 75%/i)).toBeInTheDocument();
  });

  it('explicit cancel still cancels: calls deleteSession and resets project store state', async () => {
    const deleteSessionSpy = vi.spyOn(aiTrackingService, 'deleteSession').mockResolvedValue();
    const mockFile = new File(['video'], 'match.mp4', { type: 'video/mp4' });

    trackingSessionStore.updateProjectState('project-1', {
      sessionId: 'session_to_cancel',
      status: 'PROCESSING',
      progress: 30,
      file: mockFile,
      videoFingerprint: computeVideoFingerprint(mockFile),
    });
    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(mockStatus('PROCESSING', { progressPct: 30 }) as any);

    render(<BadmintonTrackingLab />);
    const cancelBtn = await screen.findByRole('button', { name: /Cancel analysis/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(deleteSessionSpy).toHaveBeenCalledWith('session_to_cancel');
    });

    const state = trackingSessionStore.getProjectState('project-1');
    expect(state?.sessionId).toBeNull();
    expect(state?.status).toBe('IDLE');
  });

  it('project isolation: Project A tracking state does NOT bleed into Project B, switching back restores Project A', async () => {
    const fileA = new File(['videoA'], 'matchA.mp4', { type: 'video/mp4' });

    // Project Alpha has active session
    trackingSessionStore.setFile('project-1', fileA);
    trackingSessionStore.updateProjectState('project-1', {
      sessionId: 'session_alpha',
      status: 'PROCESSING',
      progress: 60,
      videoFingerprint: computeVideoFingerprint(fileA),
    });
    vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(mockStatus('PROCESSING', { progressPct: 60 }) as any);

    // 1. Mount in Project Alpha
    const { unmount } = render(<BadmintonTrackingLab />);
    expect(await screen.findByText(/Analyzing 60%/i)).toBeInTheDocument();
    unmount();

    // 2. Switch to Project Beta
    vi.mocked(useWorkspace).mockReturnValue({ activeProjectId: 'project-2' } as any);
    const { unmount: unmountBeta } = render(<BadmintonTrackingLab />);

    // Project Beta should be clean / IDLE
    expect(screen.queryByText(/Analyzing 60%/i)).not.toBeInTheDocument();
    const stateBeta = trackingSessionStore.getProjectState('project-2');
    expect(stateBeta?.sessionId).toBeNull();
    expect(stateBeta?.status).toBe('IDLE');
    unmountBeta();

    // 3. Switch back to Project Alpha
    vi.mocked(useWorkspace).mockReturnValue({ activeProjectId: 'project-1' } as any);
    render(<BadmintonTrackingLab />);

    // Project Alpha session is completely restored!
    expect(await screen.findByText(/Analyzing 60%/i)).toBeInTheDocument();
    const stateAlpha = trackingSessionStore.getProjectState('project-1');
    expect(stateAlpha?.sessionId).toBe('session_alpha');
  });

  it('completed analysis reload: loads persisted analysis from storage on mount', async () => {
    const mockRecord: any = {
      id: 'analysis_persisted_1',
      projectId: 'project-1',
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      players: [],
    };

    vi.spyOn(trackingStorage, 'listTrackingAnalyses').mockResolvedValue([mockRecord]);
    vi.spyOn(trackingStorage, 'getTrackingSampleChunks').mockResolvedValue([]);

    render(<BadmintonTrackingLab />);

    await waitFor(() => {
      expect(screen.getByText(/Player movement results/i)).toBeInTheDocument();
    });
  });
});
