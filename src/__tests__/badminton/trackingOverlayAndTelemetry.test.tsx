import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TrackingVideoOverlay, {
  resolveBodyCenterProxy,
  resolveFeetPosition,
} from '../../components/labs/TrackingVideoOverlay';
import TrackingLabInspector from '../../components/labs/TrackingLabInspector';
import BadmintonTrackingLab from '../../components/labs/BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';
import type { TrackingPlayerV1, TrackingTelemetryV1, TrackingSessionStatus } from '../../types';

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

describe('Phase 3 — Tracking Overlays & Pure Resolvers', () => {
  afterEach(cleanup);

  const mockKeypoints = (overrides: Record<number, { x: number; y: number; score: number }>) => {
    const kps = Array.from({ length: 17 }, () => ({ x: 0, y: 0, score: 0.1 }));
    for (const [idx, val] of Object.entries(overrides)) {
      kps[Number(idx)] = val;
    }
    return kps;
  };

  const createMockPlayer = (overrides: Partial<TrackingPlayerV1>): TrackingPlayerV1 => ({
    playerId: 'P1',
    detectionConfidence: 0.9,
    state: 'observed',
    courtPosition: { xM: 3.05, yM: 6.70, xPct: 50, yPct: 50 },
    ...overrides,
  });

  describe('3.3 Body Center Proxy Resolver', () => {
    it('calculates midpoint between hip center and shoulder center when both are reliable', () => {
      const player = createMockPlayer({
        bboxPct: { x: 40, y: 30, width: 20, height: 40 },
        pose: {
          keypoints: mockKeypoints({
            5: { x: 45, y: 35, score: 0.8 }, // left shoulder
            6: { x: 55, y: 35, score: 0.8 }, // right shoulder -> shoulderCenter = (50, 35)
            11: { x: 47, y: 55, score: 0.8 }, // left hip
            12: { x: 53, y: 55, score: 0.8 }, // right hip -> hipCenter = (50, 55)
          }),
        },
      });

      const result = resolveBodyCenterProxy(player);
      expect(result).not.toBeNull();
      expect(result?.provenance).toBe('pose');
      expect(result?.xPct).toBe(50);
      expect(result?.yPct).toBe(45); // (35 + 55) / 2 = 45
    });

    it('uses hip center when shoulders are low-confidence', () => {
      const player = createMockPlayer({
        bboxPct: { x: 40, y: 30, width: 20, height: 40 },
        pose: {
          keypoints: mockKeypoints({
            5: { x: 45, y: 35, score: 0.1 }, // low conf
            6: { x: 55, y: 35, score: 0.1 },
            11: { x: 46, y: 50, score: 0.9 },
            12: { x: 54, y: 50, score: 0.9 }, // hipCenter = (50, 50)
          }),
        },
      });

      const result = resolveBodyCenterProxy(player);
      expect(result?.provenance).toBe('pose');
      expect(result?.xPct).toBe(50);
      expect(result?.yPct).toBe(50);
    });

    it('falls back to bounding-box center when pose is unavailable', () => {
      const player = createMockPlayer({
        bboxPct: { x: 20, y: 10, width: 30, height: 40 },
      });

      const result = resolveBodyCenterProxy(player);
      expect(result?.provenance).toBe('bbox');
      expect(result?.xPct).toBe(35); // 20 + 30/2
      expect(result?.yPct).toBe(30); // 10 + 40/2
    });

    it('returns null when neither pose nor bbox exists', () => {
      const player = createMockPlayer({
        detectionConfidence: 0.0,
        state: 'lost',
        bboxPct: undefined,
      });
      expect(resolveBodyCenterProxy(player)).toBeNull();
    });
  });

  describe('3.4 Feet Position Resolver', () => {
    it('calculates midpoint of two reliable ankles with pose_ankles provenance', () => {
      const player = createMockPlayer({
        pose: {
          keypoints: mockKeypoints({
            15: { x: 48, y: 80, score: 0.8 }, // left ankle
            16: { x: 52, y: 82, score: 0.8 }, // right ankle
          }),
        },
      });

      const result = resolveFeetPosition(player);
      expect(result?.provenance).toBe('pose_ankles');
      expect(result?.xPct).toBe(50);
      expect(result?.yPct).toBe(81);
    });

    it('uses single reliable ankle with pose_single_ankle provenance', () => {
      const player = createMockPlayer({
        pose: {
          keypoints: mockKeypoints({
            15: { x: 45, y: 78, score: 0.85 }, // left ankle reliable
            16: { x: 55, y: 78, score: 0.2 }, // right ankle occluded/low conf
          }),
        },
      });

      const result = resolveFeetPosition(player);
      expect(result?.provenance).toBe('pose_single_ankle');
      expect(result?.xPct).toBe(45);
      expect(result?.yPct).toBe(78);
    });

    it('falls back to groundPointPct / bbox ground with bbox_ground provenance', () => {
      const player = createMockPlayer({
        groundPointPct: { x: 42, y: 85 },
      });

      const result = resolveFeetPosition(player);
      expect(result?.provenance).toBe('bbox_ground');
      expect(result?.xPct).toBe(42);
      expect(result?.yPct).toBe(85);
    });

    it('prefers canonical backend feet/ground telemetry over local recomputation', () => {
      const player = createMockPlayer({
        groundPointProvenance: 'pose_both_ankles',
        groundPointPct: { x: 49.5, y: 80.2 },
        pose: {
          keypoints: mockKeypoints({
            15: { x: 30, y: 70, score: 0.9 },
            16: { x: 32, y: 70, score: 0.9 },
          }),
        },
      });

      const result = resolveFeetPosition(player);
      expect(result?.provenance).toBe('pose_both_ankles');
      expect(result?.xPct).toBe(49.5);
      expect(result?.yPct).toBe(80.2);
    });

    it('prefers canonical bbox_bottom_center backend provenance when present', () => {
      const player = createMockPlayer({
        groundPointProvenance: 'bbox_bottom_center',
        groundPointPct: { x: 40.0, y: 88.0 },
      });

      const result = resolveFeetPosition(player);
      expect(result?.provenance).toBe('bbox_bottom_center');
      expect(result?.xPct).toBe(40.0);
      expect(result?.yPct).toBe(88.0);
    });
  });

  describe('TrackingVideoOverlay Rendering Modes', () => {
    const makeFrame = (players: TrackingPlayerV1[]): TrackingTelemetryV1[] => [{
      schemaVersion: 1,
      analysisId: 'test_session',
      timestampSec: 1.0,
      frameIndex: 30,
      players,
    }];

    const p1: TrackingPlayerV1 = createMockPlayer({
      playerId: 'P1',
      detectionConfidence: 0.95,
      state: 'observed',
      bboxPct: { x: 20, y: 20, width: 10, height: 20 },
      pose: {
        keypoints: mockKeypoints({
          5: { x: 23, y: 24, score: 0.9 },
          6: { x: 27, y: 24, score: 0.9 },
          11: { x: 24, y: 30, score: 0.9 },
          12: { x: 26, y: 30, score: 0.9 },
          15: { x: 24, y: 38, score: 0.9 },
          16: { x: 26, y: 38, score: 0.9 },
        }),
      },
    });

    it('renders skeleton bones and points in skeleton mode', () => {
      render(<TrackingVideoOverlay frames={makeFrame([p1])} time={1.0} mode="skeleton" />);
      expect(screen.getByTestId('player-bbox')).toBeInTheDocument();
      expect(screen.getAllByTestId('pose-bone').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('pose-point').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('body-center-marker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('feet-marker')).not.toBeInTheDocument();
    });

    it('renders body center marker and bbox without skeleton in center mode', () => {
      render(<TrackingVideoOverlay frames={makeFrame([p1])} time={1.0} mode="center" />);
      expect(screen.getByTestId('player-bbox')).toBeInTheDocument();
      expect(screen.getByTestId('body-center-marker')).toBeInTheDocument();
      expect(screen.queryByTestId('pose-bone')).not.toBeInTheDocument();
      expect(screen.queryByTestId('feet-marker')).not.toBeInTheDocument();
    });

    it('renders feet marker and bbox without skeleton in feet mode', () => {
      render(<TrackingVideoOverlay frames={makeFrame([p1])} time={1.0} mode="feet" />);
      expect(screen.getByTestId('player-bbox')).toBeInTheDocument();
      expect(screen.getByTestId('feet-marker')).toBeInTheDocument();
      expect(screen.queryByTestId('pose-bone')).not.toBeInTheDocument();
      expect(screen.queryByTestId('body-center-marker')).not.toBeInTheDocument();
    });

    it('renders only bounding box and id in box mode', () => {
      render(<TrackingVideoOverlay frames={makeFrame([p1])} time={1.0} mode="box" />);
      expect(screen.getByTestId('player-bbox')).toBeInTheDocument();
      expect(screen.queryByTestId('pose-bone')).not.toBeInTheDocument();
      expect(screen.queryByTestId('body-center-marker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('feet-marker')).not.toBeInTheDocument();
    });

    it('renders nothing in off mode', () => {
      render(<TrackingVideoOverlay frames={makeFrame([p1])} time={1.0} mode="off" />);
      expect(screen.queryByTestId('player-bbox')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pose-bone')).not.toBeInTheDocument();
    });

    it('filters out lost players so stale geometry is never rendered', () => {
      const lostPlayer: TrackingPlayerV1 = {
        ...p1,
        playerId: 'P2',
        state: 'lost',
      };
      render(<TrackingVideoOverlay frames={makeFrame([lostPlayer])} time={1.0} mode="skeleton" />);
      expect(screen.queryByTestId('player-overlay-P2')).not.toBeInTheDocument();
    });

    it('renders 1 to 4 players dynamically', () => {
      const players = ['P1', 'P2', 'P3'].map(id => ({
        ...p1,
        playerId: id,
        bboxPct: { x: 10, y: 10, width: 10, height: 20 },
      }));
      render(<TrackingVideoOverlay frames={makeFrame(players)} time={1.0} mode="box" />);
      expect(screen.getAllByTestId('player-bbox')).toHaveLength(3);
    });
  });
});

describe('Phase 3.12 — Internal Lab Inspector & Live Telemetry UI', () => {
  afterEach(cleanup);

  it('renders Analysis tab, progress, metrics, and dynamic player cards', () => {
    const mockStatus: TrackingSessionStatus = {
      sessionId: 'sess_123',
      status: 'PROCESSING',
      progressPct: 45.0,
      currentFrame: 150,
      totalFrames: 300,
      analyzedFrames: 75,
      frameStride: 2,
      elapsedSec: 6.2,
      videoDurationSec: 10.0,
      lastTelemetryTimestampSec: 4.8,
      sourceFps: 30.0,
      samplingFps: 15.0,
      analysisFps: 12.1,
      trackedPlayerCount: 2,
      device: 'CPU',
      players: [
        {
          playerId: 'P1',
          trackId: 10,
          totalDistanceM: 124.8,
          currentSpeedMps: 2.7,
          trackingState: 'observed',
          detectionConfidence: 0.92,
        },
        {
          playerId: 'P2',
          trackId: 11,
          totalDistanceM: 98.4,
          currentSpeedMps: 1.8,
          trackingState: 'predicted',
          detectionConfidence: 0.74,
        },
      ],
      error: null,
    };

    render(<TrackingLabInspector status={mockStatus} isProcessing={true} language="en" />);

    expect(screen.getByTestId('tracking-lab-inspector')).toBeInTheDocument();
    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(screen.getByText(/45% \(PROCESSING\)/)).toBeInTheDocument();
    expect(screen.getByText('150 / 300')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText(/6.2s/)).toBeInTheDocument();

    // Check dynamic player cards
    expect(screen.getByTestId('live-player-card-P1')).toBeInTheDocument();
    expect(screen.getByTestId('live-player-card-P2')).toBeInTheDocument();
    expect(screen.getByText('124.8 m')).toBeInTheDocument();
    expect(screen.getByText('2.7 m/s')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('Observed')).toBeInTheDocument();
    expect(screen.getByText('Predicted')).toBeInTheDocument();
  });

  it('allows switching overlay modes without rerunning analysis', async () => {
    vi.spyOn(aiTrackingService, 'checkBackendHealth').mockResolvedValue(true);
    vi.spyOn(aiTrackingService, 'getCapabilities').mockResolvedValue({
      selectedDevice: 'cpu',
      cudaAvailable: false,
      mpsAvailable: false,
    });
    const createSessionSpy = vi.spyOn(aiTrackingService, 'createSession');

    render(<BadmintonTrackingLab />);

    // Select a video file so video viewer & overlay controls appear
    const file = new File(['dummy'], 'test.mp4', { type: 'video/mp4' });
    const input = screen.getByLabelText('Select video file');
    fireEvent.change(input, { target: { files: [file] } });

    // Switch overlay mode buttons
    const centerBtn = await screen.findByRole('button', { name: 'Body Center' });
    const feetBtn = screen.getByRole('button', { name: 'Feet' });
    const boxBtn = screen.getByRole('button', { name: 'Bounding Box' });

    fireEvent.click(centerBtn);
    fireEvent.click(feetBtn);
    fireEvent.click(boxBtn);

    // Switching overlay mode must never trigger session creation / analysis
    expect(createSessionSpy).not.toHaveBeenCalled();
  });
});
