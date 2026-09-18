import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import BadmintonTrackingLab from '../../components/labs/BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';
import { trackingSessionStore } from '../../services/trackingSessionStore';

// Mock dependencies
vi.mock('../../services/aiTrackingService', () => ({
  aiTrackingService: {
    listSessions: vi.fn().mockResolvedValue([]),
    getSessionStatus: vi.fn(),
    createSession: vi.fn(),
    uploadSessionVideo: vi.fn(),
    calibrateSession: vi.fn(),
    startSessionAnalysis: vi.fn(),
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

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: vi.fn().mockReturnValue({
    activeProjectId: 'project-1',
  }),
}));

describe('Phase 0.1 — Tracking Navigation Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackingSessionStore.updateProjectState('project-1', {
      sessionId: null,
      status: 'IDLE',
      error: null,
    });
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

  // Note: Cases E and F (existing session -> no new creation) test the `handleStart` function 
  // which is triggered by user interaction. We can test this by importing the store and calling the logic directly, 
  // or testing that if we mock the user continuing, `createSession` is not called.
  // Because `handleStart` interacts with local video File objects, rendering the UI and uploading is complex in JSDOM.
  // But we can verify `createSession` is called only when needed by testing the function directly or mocking the DOM.
});
