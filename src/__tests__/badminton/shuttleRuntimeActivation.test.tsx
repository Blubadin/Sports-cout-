import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BadmintonTrackingLab, { deriveShuttleEngineStatus } from '../../components/labs/BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';
import { getDefaultProcessingConfig } from '../../services/trackingSessionStore';
import type { ProcessingConfig, TrackingSessionStatus, ShuttleProvenance } from '../../types';

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    matchInfo: { sportType: 'badminton' },
    settings: { uiLanguage: 'en' },
    localFileName: 'test.mp4',
    setLocalFileName: vi.fn(),
    setVideoSourceType: vi.fn(),
  }),
}));

let testProjectId = 'shuttle_test_project_1';

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

describe('Phase 2.9A: Shuttle Runtime Activation & Frontend Config Plumbing', () => {
  beforeEach(() => {
    testProjectId = 'shuttle_test_' + Math.random().toString(36).substring(7);
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
    vi.mocked(aiTrackingService.createSession).mockResolvedValue({
      sessionId: 'sess_shuttle_test',
      status: 'READY',
      trackedPlayerCount: 2,
    });
    vi.mocked(aiTrackingService.uploadSessionVideo).mockResolvedValue({
      status: 'VIDEO_READY',
      videoPath: 'mock_path',
      durationSec: 5.0,
      frameCount: 150,
      fps: 30,
    });
  });

  const setupVideoAndCalibration = () => {
    const fileInput = screen.getByLabelText('Select video file');
    const mockFile = new File(['dummy video content'], 'match.mp4', { type: 'video/mp4' });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
    fireEvent.loadedMetadata(video);

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
  };

  // Test 1: default UI config -> shuttleEnabled false
  it('1. default UI config sets shuttleEnabled false in getDefaultProcessingConfig and TrackingLab', async () => {
    const defaultCfg = getDefaultProcessingConfig();
    expect(defaultCfg.shuttleEnabled).toBe(false);

    render(<BadmintonTrackingLab />);
    await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

    // Open advanced settings
    const advBtn = screen.getByRole('button', { name: /Advanced settings/i });
    fireEvent.click(advBtn);

    const shuttleCheckbox = screen.getByRole('checkbox', { name: 'Enable Shuttle Tracking' });
    expect(shuttleCheckbox).not.toBeChecked();

    const statusElem = screen.getByTestId('shuttle-tracking-status');
    expect(statusElem).toHaveAttribute('data-status', 'DISABLED');
    expect(statusElem).toHaveTextContent('Disabled');
  });

  // Test 2: Enable shuttle -> createSession receives shuttleEnabled true
  it('2. enabling shuttle sends shuttleEnabled true to createSession', async () => {
    render(<BadmintonTrackingLab />);
    await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

    // Open advanced settings and enable shuttle tracking
    const advBtn = screen.getByRole('button', { name: /Advanced settings/i });
    fireEvent.click(advBtn);

    const shuttleCheckbox = screen.getByRole('checkbox', { name: 'Enable Shuttle Tracking' });
    fireEvent.click(shuttleCheckbox);
    expect(shuttleCheckbox).toBeChecked();

    setupVideoAndCalibration();

    const runButton = screen.getByRole('button', { name: /Run Movement Analysis/i });
    expect(runButton).toBeEnabled();
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(aiTrackingService.createSession).toHaveBeenCalledWith(
        'singles',
        'upload',
        expect.objectContaining({
          processingConfig: expect.objectContaining({
            shuttleEnabled: true,
            shuttleProvider: 'opencv_onnx',
            shuttleWindowSize: 3,
            shuttleRecoveryEnabled: true,
          }),
        })
      );
    });
  });

  // Test 3: Disable shuttle -> createSession receives false
  it('3. disabling shuttle sends shuttleEnabled false to createSession', async () => {
    render(<BadmintonTrackingLab />);
    await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

    const advBtn = screen.getByRole('button', { name: /Advanced settings/i });
    fireEvent.click(advBtn);

    const shuttleCheckbox = screen.getByRole('checkbox', { name: 'Enable Shuttle Tracking' });
    // Toggle on then off
    fireEvent.click(shuttleCheckbox);
    expect(shuttleCheckbox).toBeChecked();
    fireEvent.click(shuttleCheckbox);
    expect(shuttleCheckbox).not.toBeChecked();

    setupVideoAndCalibration();

    const runButton = screen.getByRole('button', { name: /Run Movement Analysis/i });
    expect(runButton).toBeEnabled();
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(aiTrackingService.createSession).toHaveBeenCalledWith(
        'singles',
        'upload',
        expect.objectContaining({
          processingConfig: expect.objectContaining({
            shuttleEnabled: false,
          }),
        })
      );
    });
  });

  // Test 4: backend reports MODEL_UNAVAILABLE -> UI displays model unavailable
  it('4. backend reports MODEL_UNAVAILABLE -> UI displays model unavailable without claiming ready', async () => {
    render(<BadmintonTrackingLab />);
    await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

    const advBtn = screen.getByRole('button', { name: /Advanced settings/i });
    fireEvent.click(advBtn);

    const shuttleCheckbox = screen.getByRole('checkbox', { name: 'Enable Shuttle Tracking' });
    fireEvent.click(shuttleCheckbox);

    // Because backend capabilities probeStatus is MODEL_UNAVAILABLE, status must truthfully show Model unavailable
    const statusElem = screen.getByTestId('shuttle-tracking-status');
    expect(statusElem).toHaveAttribute('data-status', 'MODEL_UNAVAILABLE');
    expect(statusElem).toHaveTextContent('Model unavailable');
    expect(statusElem).not.toHaveTextContent('Ready');
  });

  // Test 5: overlay enabled while engine disabled -> does not claim inference active
  it('5. overlay enabled while engine disabled does not claim inference active', async () => {
    render(<BadmintonTrackingLab />);
    await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

    setupVideoAndCalibration();

    // Switch overlay to 'debug' mode
    const overlaySelect = screen.getByRole('combobox', { name: 'Shuttle overlay mode' });
    fireEvent.change(overlaySelect, { target: { value: 'debug' } });
    expect(overlaySelect).toHaveValue('debug');

    // Open advanced settings to check engine status
    const advBtn = screen.getByRole('button', { name: /Advanced settings/i });
    fireEvent.click(advBtn);

    const statusElem = screen.getByTestId('shuttle-tracking-status');
    // Engine is disabled, so status must remain DISABLED and never Active or Ready
    expect(statusElem).toHaveAttribute('data-status', 'DISABLED');
    expect(statusElem).toHaveTextContent('Disabled');
    expect(statusElem).not.toHaveTextContent('Active');
    expect(statusElem).not.toHaveTextContent('Ready');
  });

  // Test 6: old ProcessingConfig without shuttle fields -> loads successfully
  it('6. old ProcessingConfig without shuttle fields loads successfully and defaults shuttleEnabled to false', () => {
    const oldConfig: ProcessingConfig = {
      profile: 'reference',
      device: 'cpu',
      detectorInputSize: 640,
      useCourtRoi: false,
      courtRoiMarginPx: 60,
      frameStride: 2,
      poseStride: 1,
    };

    expect(oldConfig.shuttleEnabled).toBeUndefined();

    // Verify deriveShuttleEngineStatus defaults cleanly
    const status = deriveShuttleEngineStatus({
      enabled: oldConfig.shuttleEnabled ?? false,
    });
    expect(status.status).toBe('DISABLED');
    expect(status.displayText).toBe('Disabled');
  });

  // Test 7: player analysis config unchanged
  it('7. player analysis config unchanged when shuttle tracking is toggled', async () => {
    render(<BadmintonTrackingLab />);
    await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());

    // Set a custom player configuration
    const advBtn = screen.getByRole('button', { name: /Advanced settings/i });
    fireEvent.click(advBtn);

    const detectorSize = screen.getByLabelText('Detector Input Size');
    fireEvent.change(detectorSize, { target: { value: '416' } });
    const frameStride = screen.getByLabelText('Frame Stride');
    fireEvent.change(frameStride, { target: { value: '3' } });

    // Enable shuttle
    const shuttleCheckbox = screen.getByRole('checkbox', { name: 'Enable Shuttle Tracking' });
    fireEvent.click(shuttleCheckbox);

    setupVideoAndCalibration();

    const runButton = screen.getByRole('button', { name: /Run Movement Analysis/i });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(aiTrackingService.createSession).toHaveBeenCalledWith(
        'singles',
        'upload',
        expect.objectContaining({
          processingConfig: expect.objectContaining({
            detectorInputSize: 416,
            frameStride: 3,
            shuttleEnabled: true,
          }),
        })
      );
    });
  });

  // Additional status derivation helper unit tests for all required statuses
  describe('deriveShuttleEngineStatus comprehensive state machine', () => {
    it('distinguishes DISABLED, REQUESTED, MODEL_UNAVAILABLE, AVAILABLE, RUNTIME_UNAVAILABLE, INITIALIZATION_ERROR', () => {
      // DISABLED
      expect(deriveShuttleEngineStatus({ enabled: false }).status).toBe('DISABLED');

      // REQUESTED (enabled, no backend capability or session yet)
      expect(deriveShuttleEngineStatus({ enabled: true }).status).toBe('REQUESTED');

      // MODEL_UNAVAILABLE (from backend capability)
      expect(
        deriveShuttleEngineStatus({
          enabled: true,
          backendCapability: {
            probeStatus: 'MODEL_UNAVAILABLE',
            modelAvailable: false,
          } as any,
        }).status
      ).toBe('MODEL_UNAVAILABLE');

      // RUNTIME_UNAVAILABLE (from session provenance)
      const runtimeUnavailProv: ShuttleProvenance = {
        enabled: true,
        requested: true,
        active: false,
        status: 'RUNTIME_UNAVAILABLE',
        provider: 'opencv_onnx',
        model: 'tracknet.onnx',
        runtime: 'opencv_dnn',
        precision: 'fp32',
        device: 'cpu',
        windowSize: 3,
        confidenceThreshold: 0.5,
        recoveryEnabled: true,
        auxiliaryDetectorAvailable: false,
      };
      expect(
        deriveShuttleEngineStatus({
          enabled: true,
          sessionProvenance: runtimeUnavailProv,
        }).status
      ).toBe('RUNTIME_UNAVAILABLE');

      // INITIALIZATION_ERROR (from session provenance)
      const initErrorProv: ShuttleProvenance = {
        ...runtimeUnavailProv,
        status: 'INITIALIZATION_ERROR',
      };
      expect(
        deriveShuttleEngineStatus({
          enabled: true,
          sessionProvenance: initErrorProv,
        }).status
      ).toBe('INITIALIZATION_ERROR');

      // AVAILABLE (Ready before processing)
      const availableProv: ShuttleProvenance = {
        ...runtimeUnavailProv,
        status: 'AVAILABLE',
        active: false,
      };
      const readyResult = deriveShuttleEngineStatus({
        enabled: true,
        sessionProvenance: availableProv,
        isProcessing: false,
      });
      expect(readyResult.status).toBe('AVAILABLE');
      expect(readyResult.displayText).toBe('Ready');

      // AVAILABLE (Active during processing)
      const activeResult = deriveShuttleEngineStatus({
        enabled: true,
        sessionProvenance: availableProv,
        isProcessing: true,
      });
      expect(activeResult.status).toBe('AVAILABLE');
      expect(activeResult.displayText).toBe('Active');
    });
  });
});
