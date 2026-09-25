import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TrackingLabInspector from '../../components/labs/TrackingLabInspector';
import BadmintonTrackingLab from '../../components/labs/BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';
import type { TrackingSessionStatus } from '../../types';

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    matchInfo: { sportType: 'badminton' },
    settings: { uiLanguage: 'en' },
    localFileName: 'test.mp4',
    setLocalFileName: vi.fn(),
    setVideoSourceType: vi.fn(),
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: 'proj_123',
  }),
}));

vi.mock('../../services/aiTrackingService', () => ({
  aiTrackingService: {
    checkBackendHealth: vi.fn(),
    getCapabilities: vi.fn(),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    uploadSessionVideo: vi.fn(),
    calibrateSession: vi.fn(),
    startSessionAnalysis: vi.fn(),
    getSessionStatus: vi.fn(),
    getSessionResults: vi.fn(),
    deleteSession: vi.fn(),
  },
}));

describe('Phase 5: Performance Profiles & Inspector Tabs', () => {
  const mockStatus: TrackingSessionStatus = {
    sessionId: 'session_perf_1',
    status: 'PROCESSING',
    progressPct: 55.0,
    currentFrame: 110,
    totalFrames: 200,
    analyzedFrames: 55,
    frameStride: 2,
    elapsedSec: 4.2,
    videoDurationSec: 6.67,
    lastTelemetryTimestampSec: 3.66,
    sourceFps: 30.0,
    samplingFps: 15.0,
    analysisFps: 13.1,
    trackedPlayerCount: 2,
    device: 'cpu',
    processingConfig: {
      profile: 'fast',
      device: 'cpu',
      detectorInputSize: 416,
      useCourtRoi: true,
      courtRoiMarginPx: 60,
      frameStride: 2,
      poseStride: 2,
    },
    performance: {
      elapsedSec: 4.2,
      rtf: 0.63,
      realtimeSpeed: 1.59,
      analysisFps: 13.1,
      samplingFps: 15.0,
    },
    quality: {
      observedCoveragePct: 92.5,
      lostFramesPct: 7.5,
      poseCoveragePct: 50.0,
      playerCoverage: {
        P1: {
          playerId: 'P1',
          expectedFrames: 55,
          observedFrames: 51,
          predictedFrames: 2,
          lostFrames: 2,
          observedCoveragePct: 92.7,
          predictedFramesPct: 3.6,
          lostFramesPct: 3.6,
          lostTimeSec: 0.13,
        },
      },
    },
    requestedDevice: 'auto',
    effectiveDevice: 'cpu',
    runtimeProvenance: {
      detectorModel: 'yolov8n.pt',
      trackerModel: 'bytetrack',
      poseModel: 'yolov8n-pose.pt',
      device: 'cpu',
      requestedDevice: 'auto',
      effectiveDevice: 'cpu',
      requestedProfile: 'fast',
      effectiveProfile: 'fast',
      detectorInputSize: 416,
      frameStride: 2,
      poseStride: 2,
      useCourtRoi: true,
      courtRoiMarginPx: 60,
      courtRoiMarginM: 0.5,
    },
    players: [
      {
        playerId: 'P1',
        trackId: 10,
        totalDistanceM: 8.5,
        currentSpeedMps: 2.1,
        trackingState: 'observed',
        detectionConfidence: 0.93,
      },
    ],
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiTrackingService.checkBackendHealth).mockResolvedValue(true);
    vi.mocked(aiTrackingService.getCapabilities).mockResolvedValue({
      selectedDevice: 'cpu',
      cudaAvailable: false,
      mpsAvailable: false,
    });
    vi.mocked(aiTrackingService.listSessions).mockResolvedValue([]);
    vi.mocked(aiTrackingService.createSession).mockResolvedValue({
      sessionId: 'session_perf_1',
      status: 'READY',
      trackedPlayerCount: 2,
    });
    vi.mocked(aiTrackingService.uploadSessionVideo).mockResolvedValue({ width: 1280, height: 720 });
    vi.mocked(aiTrackingService.calibrateSession).mockResolvedValue({});
    vi.mocked(aiTrackingService.startSessionAnalysis).mockResolvedValue();
    vi.mocked(aiTrackingService.deleteSession).mockResolvedValue();
  });

  describe('TrackingLabInspector Tabs', () => {
    it('renders the Analysis tab by default with player cards', () => {
      render(<TrackingLabInspector status={mockStatus} isProcessing={true} language="en" />);

      expect(screen.getByTestId('tab-analysis')).toBeInTheDocument();
      expect(screen.getByTestId('tab-performance')).toBeInTheDocument();
      expect(screen.getByTestId('tab-config')).toBeInTheDocument();

      // Analysis content should be visible
      expect(screen.getByTestId('live-player-card-P1')).toBeInTheDocument();
      expect(screen.getByText(/13\.1 FPS/)).toBeInTheDocument();
    });

    it('switches to the Performance tab and renders throughput and quality metrics', () => {
      render(<TrackingLabInspector status={mockStatus} isProcessing={true} language="en" />);

      // Switch to performance tab
      fireEvent.click(screen.getByTestId('tab-performance'));

      expect(screen.getByTestId('performance-tab-content')).toBeInTheDocument();
      expect(screen.getByText('0.63x')).toBeInTheDocument(); // RTF
      expect(screen.getByText('1.59x')).toBeInTheDocument(); // Realtime multiplier
      expect(screen.getByText('92.5%')).toBeInTheDocument(); // Observed coverage
      expect(screen.getByText('7.5%')).toBeInTheDocument(); // Lost rate
      expect(screen.getByText(/50/)).toBeInTheDocument(); // Fresh pose ratio
    });

    it('switches to the Configuration tab and renders effective ProcessingConfig', () => {
      render(<TrackingLabInspector status={mockStatus} isProcessing={true} language="en" />);

      // Switch to config tab
      fireEvent.click(screen.getByTestId('tab-config'));

      expect(screen.getByTestId('config-tab-content')).toBeInTheDocument();
      expect(screen.getByText(/fast/i)).toBeInTheDocument(); // Profile
      expect(screen.getByText('416 px')).toBeInTheDocument(); // Detector input size
      expect(screen.getByText('Enabled (margin: 60px)')).toBeInTheDocument(); // Court ROI
    });

    it('renders per-player tracking coverage and live indicator badge', () => {
      render(<TrackingLabInspector status={mockStatus} isProcessing={true} language="en" />);

      fireEvent.click(screen.getByTestId('tab-performance'));
      expect(screen.getByText(/Live session/i)).toBeInTheDocument();
      expect(screen.getByTestId('coverage-card-P1')).toBeInTheDocument();
      expect(screen.getByText('51 f')).toBeInTheDocument();
      expect(screen.getByText('0.13s')).toBeInTheDocument();
    });

    it('renders runtime models and effective vs requested device in config tab', () => {
      render(<TrackingLabInspector status={mockStatus} isProcessing={true} language="en" />);

      fireEvent.click(screen.getByTestId('tab-config'));
      expect(screen.getByText(/yolov8n\.pt \+ yolov8n-pose\.pt \(bytetrack\)/i)).toBeInTheDocument();
      expect(screen.getByText(/requested: auto/i)).toBeInTheDocument();
    });
  });

  describe('BadmintonTrackingLab Performance Controls', () => {
    it('renders profile selector and toggles advanced settings drawer', async () => {
      render(<BadmintonTrackingLab />);

      await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

      const profileSelect = screen.getByLabelText('Performance profile');
      expect(profileSelect).toBeInTheDocument();
      expect(profileSelect).toHaveValue('auto');

      // Drawer is hidden initially
      expect(screen.queryByTestId('advanced-settings-drawer')).not.toBeInTheDocument();

      // Click to toggle advanced settings
      fireEvent.click(screen.getByText(/Advanced settings/i));

      expect(screen.getByTestId('advanced-settings-drawer')).toBeInTheDocument();
      expect(screen.getByLabelText('Detector Input Size')).toBeInTheDocument();
      expect(screen.getByLabelText('Frame Stride')).toBeInTheDocument();
      expect(screen.getByLabelText('Pose Stride')).toBeInTheDocument();
      expect(screen.getByLabelText('Court ROI Cropping')).toBeInTheDocument();
    });

    it('passes selected ProcessingConfig to aiTrackingService.createSession', async () => {
      render(<BadmintonTrackingLab />);

      await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

      // Select Reference preset
      const profileSelect = screen.getByLabelText('Performance profile');
      fireEvent.change(profileSelect, { target: { value: 'reference' } });
      expect(profileSelect).toHaveValue('reference');

      // Load a mock video file
      const fileInput = screen.getByLabelText('Select video file');
      const mockFile = new File(['mock video content'], 'match.mp4', { type: 'video/mp4' });
      fireEvent.change(fileInput, { target: { files: [mockFile] } });

      // Trigger video metadata to give width/height
      const video = document.querySelector('video') as HTMLVideoElement;
      expect(video).toBeInTheDocument();
      Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
      fireEvent.loadedMetadata(video);

      // Calibrate 4 corners
      const calibrateButton = screen.getByRole('button', { name: /Calibrate four court corners/i });
      fireEvent.click(calibrateButton);
      const svg = screen.getByLabelText('Court calibration');
      svg.getBoundingClientRect = () => ({
        width: 1280,
        height: 720,
        top: 0,
        left: 0,
        bottom: 720,
        right: 1280,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      for (let i = 0; i < 4; i++) {
        fireEvent.click(svg, { clientX: 100 + i * 50, clientY: 100 + i * 50 });
      }

      // Run movement analysis
      const runButton = screen.getByRole('button', { name: /Run Movement Analysis/i });
      expect(runButton).toBeEnabled();
      fireEvent.click(runButton);

      await waitFor(() => {
        expect(aiTrackingService.createSession).toHaveBeenCalledWith(
          'singles',
          'upload',
          expect.objectContaining({
            processingConfig: expect.objectContaining({
              profile: 'reference',
              requestedProfile: 'reference',
              device: 'auto',
              requestedDevice: 'auto',
              detectorInputSize: 640,
              useCourtRoi: false,
              courtRoiMarginPx: 60,
              courtRoiMarginM: 0.5,
              frameStride: 2,
              poseStride: 1,
            }),
          })
        );
      });
    });
  });
});
