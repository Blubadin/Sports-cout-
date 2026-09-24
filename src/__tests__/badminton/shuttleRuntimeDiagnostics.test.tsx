import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BadmintonTrackingLab, { deriveShuttleEngineStatus } from '../../components/labs/BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';
import type { ShuttleProvenance } from '../../types';

let testProjectId = 'shuttle_diag_project_1';

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
    get activeProjectId() {
      return testProjectId;
    },
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

describe('Phase 2.9C: Shuttle Runtime Diagnostics', () => {
  beforeEach(() => {
    testProjectId = 'shuttle_diag_' + Math.random().toString(36).substring(7);
    vi.clearAllMocks();
    vi.mocked(aiTrackingService.checkBackendHealth).mockResolvedValue(true);
    vi.mocked(aiTrackingService.getCapabilities).mockResolvedValue({
      selectedDevice: 'cpu',
      cudaAvailable: false,
      mpsAvailable: false,
      detectorModel: 'yolov8n.pt',
      poseModel: 'yolov8n-pose.pt',
      shuttle: {
        enabled: false,
        requested: false,
        active: false,
        status: 'DISABLED',
        provider: 'opencv_onnx',
        model: null,
        runtime: 'opencv_dnn',
        precision: 'fp32',
        device: 'cpu',
        windowSize: 3,
        confidenceThreshold: 0.5,
        recoveryEnabled: true,
        auxiliaryDetectorAvailable: false,
        modelAvailable: false,
        configuredModel: null,
        probeStatus: 'MODEL_UNAVAILABLE',
        probeFailureReason: 'No local ONNX model artifact path configured',
      },
    });
    vi.mocked(aiTrackingService.listSessions).mockResolvedValue({ sessions: [] });
  });

  describe('deriveShuttleEngineStatus status mapper', () => {
    it('maps disabled state to "Tracking disabled"', () => {
      const res = deriveShuttleEngineStatus({ enabled: false });
      expect(res.status).toBe('DISABLED');
      expect(res.displayText).toBe('Disabled');
      expect(res.detailText).toBe('Tracking disabled');
    });

    it('maps missing model path to "No model configured"', () => {
      const res = deriveShuttleEngineStatus({
        enabled: true,
        backendCapability: {
          probeStatus: 'MODEL_UNAVAILABLE',
          modelAvailable: false,
          configuredModel: null,
          model: null,
        } as any,
      });
      expect(res.status).toBe('MODEL_UNAVAILABLE');
      expect(res.displayText).toBe('Model unavailable');
      expect(res.detailText).toBe('No model configured');
    });

    it('maps configured model load failure to "Model failed to load"', () => {
      const res = deriveShuttleEngineStatus({
        enabled: true,
        sessionProvenance: {
          status: 'INITIALIZATION_ERROR',
          model: 'tracknet.pth',
        } as any,
      });
      expect(res.status).toBe('INITIALIZATION_ERROR');
      expect(res.displayText).toBe('Initialization error');
      expect(res.detailText).toBe('Model failed to load');
    });

    it('maps runtime unavailable to "Runtime unavailable"', () => {
      const res = deriveShuttleEngineStatus({
        enabled: true,
        sessionProvenance: {
          status: 'RUNTIME_UNAVAILABLE',
          model: 'tracknet.pth',
        } as any,
      });
      expect(res.status).toBe('RUNTIME_UNAVAILABLE');
      expect(res.displayText).toBe('Runtime unavailable');
      expect(res.detailText).toBe('Runtime unavailable');
    });

    it('maps active model before inference to "Model active" or "Model ready"', () => {
      const resReady = deriveShuttleEngineStatus({
        enabled: true,
        sessionProvenance: {
          status: 'AVAILABLE',
          active: false,
          inferenceCalls: 0,
          observedCount: 0,
        } as any,
      });
      expect(resReady.status).toBe('AVAILABLE');
      expect(resReady.displayText).toBe('Ready');
      expect(resReady.detailText).toBe('Model ready');

      const resActive = deriveShuttleEngineStatus({
        enabled: true,
        sessionProvenance: {
          status: 'AVAILABLE',
          active: true,
          inferenceCalls: 0,
          observedCount: 0,
        } as any,
      });
      expect(resActive.status).toBe('AVAILABLE');
      expect(resActive.displayText).toBe('Active');
      expect(resActive.detailText).toBe('Model active');
    });

    it('maps active model with inference calls > 0 but observed === 0 to "Model active but no shuttle candidates"', () => {
      const res = deriveShuttleEngineStatus({
        enabled: true,
        sessionProvenance: {
          status: 'AVAILABLE',
          active: true,
          inferenceCalls: 120,
          observedCount: 0,
        } as any,
      });
      expect(res.status).toBe('AVAILABLE');
      expect(res.displayText).toBe('Active');
      expect(res.detailText).toBe('Model active but no shuttle candidates');
    });

    it('maps active model with observed > 0 to "Model active and shuttle observed"', () => {
      const res = deriveShuttleEngineStatus({
        enabled: true,
        sessionProvenance: {
          status: 'AVAILABLE',
          active: true,
          inferenceCalls: 120,
          observedCount: 45,
        } as any,
      });
      expect(res.status).toBe('AVAILABLE');
      expect(res.displayText).toBe('Active');
      expect(res.detailText).toBe('Model active and shuttle observed');
    });
  });

  describe('Advanced section diagnostics rendering', () => {
    it('renders measured zero as 0 and null/undefined as em dash —', async () => {
      const mockSessionStatus = {
        sessionId: 'session_diag_test',
        status: 'PROCESSING' as const,
        progressPct: 50,
        currentFrame: 100,
        totalFrames: 200,
        analyzedFrames: 100,
        frameStride: 1,
        elapsedSec: 2.0,
        videoDurationSec: 6.0,
        lastTelemetryTimestampSec: 2.0,
        sourceFps: 30,
        samplingFps: 30,
        analysisFps: 25,
        trackedPlayerCount: 2,
        device: 'cpu',
        players: [],
        error: null,
        processingConfig: {
          shuttleEnabled: true,
          device: 'cpu' as const,
          detectorInputSize: 512,
          useCourtRoi: false,
          courtRoiMarginPx: 60,
          frameStride: 1,
          poseStride: 1,
        },
        shuttle: {
          enabled: true,
          requested: true,
          active: true,
          status: 'AVAILABLE',
          provider: 'rallylens_tracknet',
          model: 'rallylens-shuttle-tracknet.pth',
          runtime: 'pytorch',
          precision: 'fp32',
          device: 'cpu',
          windowSize: 9,
          confidenceThreshold: 0.5,
          recoveryEnabled: true,
          auxiliaryDetectorAvailable: false,
          framesReceived: 10,
          validFrames: 10,
          inferenceCalls: 2,
          meanInferenceMs: 14.5,
          observedCount: 0, // measured zero
          predictedCount: 0, // measured zero
          lostCount: 0, // measured zero
          unknownCount: 2,
          lastFailure: null, // unavailable / none -> em dash
        } as ShuttleProvenance,
      };

      vi.mocked(aiTrackingService.listSessions).mockResolvedValue({
        sessions: [mockSessionStatus as any],
      });
      vi.mocked(aiTrackingService.getSessionStatus).mockResolvedValue(mockSessionStatus as any);

      render(<BadmintonTrackingLab />);
      await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

      // Open Advanced settings
      const advBtn = screen.getByRole('button', { name: /Advanced settings/i });
      fireEvent.click(advBtn);

      // Verify explanation text is rendered
      const explanation = screen.getByTestId('shuttle-tracking-explanation');
      expect(explanation).toBeInTheDocument();

      // Verify diagnostics grid is rendered
      const diagGrid = screen.getByTestId('shuttle-runtime-diagnostics');
      expect(diagGrid).toBeInTheDocument();

      // Measured zero counts must render as '0'
      const obsPred = screen.getByTestId('diag-obs-pred');
      expect(obsPred).toHaveTextContent('0 / 0');

      // Null lastFailure must render as '—'
      const lastFail = screen.getByTestId('diag-last-failure');
      expect(lastFail).toHaveTextContent('—');
    });
  });
});
