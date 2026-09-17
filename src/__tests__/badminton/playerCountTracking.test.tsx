import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BadmintonTrackingLab from '../../components/labs/BadmintonTrackingLab';
import { aiTrackingService, toTrackingTelemetryV1 } from '../../services/aiTrackingService';
import type { AITelemetryFrame, TrackingTelemetryV1 } from '../../types';

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    matchInfo: { sportType: 'badminton' },
    settings: { uiLanguage: 'en' },
    videoSourceType: 'local',
    localFileName: 'rally.mp4',
    setLocalFileName: vi.fn(),
    setVideoSourceType: vi.fn(),
    showToast: vi.fn(),
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: 'p1',
    projects: [],
    updateProjectVideoCalibration: vi.fn(),
  }),
}));

vi.mock('../../utils/videoFileStore', () => ({
  loadProjectVideoFileHandle: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../services/storage/trackingStorage', () => ({
  listTrackingAnalyses: vi.fn().mockResolvedValue([]),
  getTrackingSampleChunks: vi.fn().mockResolvedValue([]),
  saveTrackingAnalysis: vi.fn().mockResolvedValue(undefined),
  downsampleAndChunkTrackingSamples: vi.fn().mockReturnValue({ chunks: [], summary: { players: {} }, quality: {} }),
}));

describe('Dynamic 1-4 Player Tracking (Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(aiTrackingService, 'checkBackendHealth').mockResolvedValue(true);
    vi.spyOn(aiTrackingService, 'getCapabilities').mockResolvedValue({
      selectedDevice: 'cpu',
      cudaAvailable: false,
      mpsAvailable: false,
    });
    URL.createObjectURL = vi.fn(() => 'blob:video');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(cleanup);

  it('preserves trackedPlayerCount in canonical TrackingTelemetryV1', () => {
    const frameWithCount: AITelemetryFrame = {
      timestamp: 2.0,
      frame_idx: 60,
      source: 'real_tracking',
      tracked_player_count: 3,
      players: [
        {
          id: 1,
          team: 1,
          name: 'Player 1',
          court_pos_pct: { x: 50, y: 25 },
          zone: 'C',
          speed_ms: 1.5,
          total_dist_m: 5.0,
        },
      ],
    };

    const telemetry: TrackingTelemetryV1 = toTrackingTelemetryV1(frameWithCount);
    expect(telemetry.trackedPlayerCount).toBe(3);
    expect(telemetry.players).toHaveLength(1);
    expect(telemetry.players[0].playerId).toBe('P1');
  });

  it('renders player count selector in BadmintonTrackingLab with 1, 2, 3, 4 options', async () => {
    render(<BadmintonTrackingLab />);
    const playerCountSelect = await screen.findByLabelText('Players to track') as HTMLSelectElement;
    expect(playerCountSelect).toBeInTheDocument();

    const options = Array.from(playerCountSelect.options).map(opt => opt.value);
    expect(options).toEqual(['1', '2', '3', '4']);

    // Default for singles is 2 players
    expect(playerCountSelect.value).toBe('2');
  });

  it('automatically adjusts default tracked player count when toggling game type', async () => {
    render(<BadmintonTrackingLab />);
    const gameTypeSelect = await screen.findByLabelText('Game type') as HTMLSelectElement;
    const playerCountSelect = screen.getByLabelText('Players to track') as HTMLSelectElement;

    expect(playerCountSelect.value).toBe('2');

    fireEvent.change(gameTypeSelect, { target: { value: 'doubles' } });
    expect(playerCountSelect.value).toBe('4');

    fireEvent.change(gameTypeSelect, { target: { value: 'singles' } });
    expect(playerCountSelect.value).toBe('2');
  });

  it('allows user to explicitly choose irregular player counts (e.g. 1 or 3 players)', async () => {
    render(<BadmintonTrackingLab />);
    const playerCountSelect = await screen.findByLabelText('Players to track') as HTMLSelectElement;

    fireEvent.change(playerCountSelect, { target: { value: '1' } });
    expect(playerCountSelect.value).toBe('1');

    fireEvent.change(playerCountSelect, { target: { value: '3' } });
    expect(playerCountSelect.value).toBe('3');
  });

  it('sends tracked_player_count in createSession API request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'session_test_123',
        status: 'READY',
        trackedPlayerCount: 3,
      }),
    } as Response);

    const result = await aiTrackingService.createSession('singles', 'upload', {
      trackedPlayerCount: 3,
    });

    expect(result.sessionId).toBe('session_test_123');
    expect(fetchSpy).toHaveBeenCalled();
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.tracked_player_count).toBe(3);
    expect(callBody.game_type).toBe('singles');

    fetchSpy.mockRestore();
  });
});
