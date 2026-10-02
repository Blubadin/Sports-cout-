import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TrackingLabInspector from '../../components/labs/TrackingLabInspector';
import type { TrackingSessionStatus } from '../../types';
import type { TrackingAnalysis } from '../../services/storage/trackingStorage';

describe('Phase 5 — TrackingLabInspector Tabs & Real Metadata Foundation', () => {
  afterEach(cleanup);

  const mockStatus: TrackingSessionStatus = {
    sessionId: 'session_phase5',
    status: 'COMPLETED',
    progressPct: 100.0,
    currentFrame: 300,
    totalFrames: 300,
    analyzedFrames: 150,
    frameStride: 2,
    elapsedSec: 10.0,
    videoDurationSec: 10.0,
    lastTelemetryTimestampSec: 10.0,
    sourceFps: 30.0,
    samplingFps: 15.0,
    analysisFps: 15.0,
    trackedPlayerCount: 2,
    device: 'cpu',
    requestedDevice: 'auto',
    effectiveDevice: 'cpu',
    processingConfig: {
      profile: 'fast',
      requestedProfile: 'fast',
      effectiveProfile: 'fast',
      device: 'cpu',
      requestedDevice: 'auto',
      effectiveDevice: 'cpu',
      detectorInputSize: 640,
      useCourtRoi: false,
      courtRoiMarginPx: 60,
      frameStride: 2,
      poseStride: 1,
    },
    runtimeProvenance: {
      detectorModel: 'yolov8n.pt',
      trackerModel: 'bytetrack',
      poseModel: 'yolov8n-pose.pt',
      device: 'cpu',
      requestedDevice: 'auto',
      effectiveDevice: 'cpu',
      requestedProfile: 'fast',
      effectiveProfile: 'fast',
      detectorInputSize: 640,
      frameStride: 2,
      poseStride: 1,
      useCourtRoi: false,
      courtRoiMarginPx: 60,
    },
    performance: {
      elapsedSec: 10.0,
      processedVideoTimeSec: 10.0,
      videoDurationSec: 10.0,
      rtf: 1.0,
      realtimeSpeed: 1.0,
      analysisFps: 15.0,
      samplingFps: 15.0,
      isFinal: true,
    },
    quality: {
      observedCoveragePct: 95.0,
      lostFramesPct: 5.0,
      poseCoveragePct: 100.0,
    },
    videoMetadata: {
      filename: 'rally_match.mp4',
      durationSec: 10.0,
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
      nominalFps: 30.0,
      reportedFrameCount: 300,
      frameCountProvenance: 'ffprobe_stream_count',
      frameIntervalMs: 33.33,
      codec: 'h264',
      bitrateKbps: 4500,
      pixelFormat: 'yuv420p',
      frameRateType: 'CFR',
    },
    researchMetadata: {
      cameraMake: 'Sony',
      cameraModel: 'FX3',
      exposureSec: 0.002, // 1/500s
      iso: 400,
      aperture: 2.8,
      focalLengthMm: 24.0,
      derivedShutterAngleDeg: 21.6, // 0.002 * 30 * 360
    },
    players: [
      {
        playerId: 'P1',
        trackId: 1,
        totalDistanceM: 54.2,
        currentSpeedMps: 3.1,
        trackingState: 'observed',
        detectionConfidence: 0.94,
      },
      {
        playerId: 'P2',
        trackId: 2,
        totalDistanceM: 48.0,
        currentSpeedMps: 2.4,
        trackingState: 'observed',
        detectionConfidence: 0.88,
      },
    ],
    error: null,
  };

  it('renders all 4 tabs and defaults to Analysis tab', () => {
    render(<TrackingLabInspector status={mockStatus} isProcessing={false} language="en" />);

    expect(screen.getByTestId('tab-analysis')).toBeInTheDocument();
    expect(screen.getByTestId('tab-video')).toBeInTheDocument();
    expect(screen.getByTestId('tab-performance')).toBeInTheDocument();
    expect(screen.getByTestId('tab-research')).toBeInTheDocument();

    // Analysis is active by default
    expect(screen.getByTestId('analysis-tab-content')).toBeInTheDocument();
    expect(screen.queryByTestId('video-tab-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('performance-tab-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('research-tab-content')).not.toBeInTheDocument();

    // Check analysis contents
    expect(screen.getByTestId('live-player-card-P1')).toBeInTheDocument();
    expect(screen.getByTestId('live-player-card-P2')).toBeInTheDocument();
    expect(screen.getByText('54.2 m')).toBeInTheDocument();
    expect(screen.getByText('3.1 m/s')).toBeInTheDocument();
  });

  it('switches to Video tab and renders real source metadata', () => {
    render(<TrackingLabInspector status={mockStatus} isProcessing={false} language="en" />);

    fireEvent.click(screen.getByTestId('tab-video'));

    expect(screen.getByTestId('video-tab-content')).toBeInTheDocument();
    expect(screen.queryByTestId('analysis-tab-content')).not.toBeInTheDocument();

    // Verify metadata items
    expect(screen.getByText('rally_match.mp4')).toBeInTheDocument();
    expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
    expect(screen.getByText('16:9')).toBeInTheDocument();
    expect(screen.getByText('30.00 FPS')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('ffprobe_stream_count')).toBeInTheDocument();
    expect(screen.getByText('33.33 ms')).toBeInTheDocument();
    expect(screen.getByText(/h264/i)).toBeInTheDocument();
    expect(screen.getByText('4500 kbps')).toBeInTheDocument();
    expect(screen.getByText('yuv420p')).toBeInTheDocument();
    expect(screen.getByText('CFR')).toBeInTheDocument();
  });

  it('warns when frame count is an OpenCV header estimate', () => {
    const opencvStatus: TrackingSessionStatus = {
      ...mockStatus,
      videoMetadata: {
        ...mockStatus.videoMetadata,
        frameCountProvenance: 'opencv_header_estimate',
        codec: null,
      },
    };

    render(<TrackingLabInspector status={opencvStatus} isProcessing={false} language="en" />);

    fireEvent.click(screen.getByTestId('tab-video'));

    expect(screen.getByTestId('opencv-estimate-warning')).toBeInTheDocument();
    expect(screen.getByText(/Container estimate — not exact stream decode/i)).toBeInTheDocument();
    expect(screen.getByText(/Do not call estimates exact/i)).toBeInTheDocument();
  });

  it('switches to Research tab and displays camera specs and derived shutter angle', () => {
    render(<TrackingLabInspector status={mockStatus} isProcessing={false} language="en" />);

    fireEvent.click(screen.getByTestId('tab-research'));

    expect(screen.getByTestId('research-tab-content')).toBeInTheDocument();
    expect(screen.getByText(/FPS does NOT equal shutter speed/i)).toBeInTheDocument();
    expect(screen.getByText('Sony')).toBeInTheDocument();
    expect(screen.getByText('FX3')).toBeInTheDocument();
    expect(screen.getByText('ISO 400')).toBeInTheDocument();
    expect(screen.getByText('f/2.8')).toBeInTheDocument();
    expect(screen.getByText('24 mm')).toBeInTheDocument();
    expect(screen.getByText('21.6°')).toBeInTheDocument();
    expect(screen.getByText('Derived')).toBeInTheDocument();
  });

  it('displays "Not available" for missing research metadata without assuming shutter', () => {
    const missingResearchStatus: TrackingSessionStatus = {
      ...mockStatus,
      researchMetadata: {
        cameraMake: null,
        cameraModel: null,
        exposureSec: null,
        iso: null,
        aperture: null,
        focalLengthMm: null,
        derivedShutterAngleDeg: null,
      },
    };

    render(<TrackingLabInspector status={missingResearchStatus} isProcessing={false} language="en" />);

    fireEvent.click(screen.getByTestId('tab-research'));

    // Verify fallback to "Not available"
    const notAvailableElements = screen.getAllByText('Not available');
    expect(notAvailableElements.length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/°/)).not.toBeInTheDocument();
  });

  it('renders unknown rate, duration, and quality telemetry as unavailable instead of zero', () => {
    const unknownTelemetryStatus: TrackingSessionStatus = {
      ...mockStatus,
      elapsedSec: null,
      videoDurationSec: null,
      lastTelemetryTimestampSec: null,
      sourceFps: null,
      samplingFps: null,
      analysisFps: null,
      videoMetadata: {
        ...mockStatus.videoMetadata,
        durationSec: null,
        nominalFps: null,
        frameIntervalMs: null,
      },
      performance: {
        elapsedSec: null,
        processedVideoTimeSec: null,
        videoDurationSec: null,
        rtf: null,
        realtimeSpeed: null,
        analysisFps: null,
        samplingFps: null,
        isFinal: true,
      },
      quality: {
        observedCoveragePct: null,
        lostFramesPct: null,
        poseCoveragePct: null,
      },
    };

    const { container } = render(
      <TrackingLabInspector status={unknownTelemetryStatus} isProcessing={false} language="en" />
    );

    expect(container.textContent).not.toContain('0.00s');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');

    fireEvent.click(screen.getByTestId('tab-performance'));
    expect(container.textContent).not.toContain('null%');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
  });

  it('shows requested and effective automatic calibration separately and keeps missing segment unavailable', () => {
    const status: TrackingSessionStatus = {
      ...mockStatus,
      cameraSegmentId: undefined,
      processingConfig: { ...mockStatus.processingConfig!, autoCourtCalibrationEnabled: true },
      effectiveProcessingConfig: { ...mockStatus.processingConfig!, autoCourtCalibrationEnabled: false },
      runtimeProvenance: { ...mockStatus.runtimeProvenance!, autoCourtCalibrationEnabled: false },
    };
    render(<TrackingLabInspector status={status} isProcessing={false} language="en" />);

    expect(screen.getByTestId('camera-segment-value')).toHaveTextContent('—');
    expect(screen.getByTestId('auto-calibration-mode')).toHaveTextContent('Requested: Enabled');
    expect(screen.getByTestId('auto-calibration-mode')).toHaveTextContent('Effective: Disabled');
    expect(screen.queryByText('segment-0')).not.toBeInTheDocument();
  });

  it('switches to Performance tab and compares matching benchmark runs', () => {
    const baselineRun: TrackingAnalysis = {
      id: 'session_baseline',
      projectId: 'proj1',
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      videoFingerprint: 'vfp_test_123',
      engineVersion: '1.0.0',
      detectorModel: 'yolov8n.pt',
      trackerModel: 'bytetrack',
      poseModel: 'yolov8n-pose.pt',
      sampleRateHz: 15,
      createdAt: '2026-09-18T00:00:00Z',
      completedAt: '2026-09-18T00:00:10Z',
      device: 'cpu',
      effectiveDevice: 'cpu',
      trackedPlayerCount: 2,
      processingConfig: {
        detectorInputSize: 640,
        frameStride: 2,
        poseStride: 1,
        useCourtRoi: false,
        courtRoiMarginPx: 60,
        device: 'cpu',
      },
      performance: {
        elapsedSec: 20.0,
        analysisFps: 7.5,
        rtf: 2.0,
        realtimeSpeed: 0.5,
        samplingFps: 15.0,
      },
      players: [],
      quality: {
        detectionCoverage: 0.95,
        lostTimePercent: 5.0,
        confidence: 0.9,
        manualCorrections: 0,
      },
      summary: {
        durationSeconds: 10.0,
        sampleCount: 150,
        players: {},
      },
    };

    render(
      <TrackingLabInspector
        status={{
          ...mockStatus,
          analysisFps: 15.0, // 2x faster than 7.5
          performance: { ...mockStatus.performance!, analysisFps: 15.0 },
        }}
        isProcessing={false}
        language="en"
        videoFingerprint="vfp_test_123"
        benchmarkHistory={[baselineRun]}
      />
    );

    fireEvent.click(screen.getByTestId('tab-performance'));

    expect(screen.getByTestId('performance-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('benchmark-history-section')).toBeInTheDocument();

    // Since key configs match, speedup should be reported
    expect(screen.getByTestId('benchmark-run-session_baseline')).toBeInTheDocument();
    expect(screen.getByText(/2\.00x faster/i)).toBeInTheDocument();
  });

  it('marks benchmark comparison as "Configuration differs" when key parameters differ', () => {
    const differingConfigRun: TrackingAnalysis = {
      id: 'session_differing',
      projectId: 'proj1',
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      videoFingerprint: 'vfp_test_123',
      engineVersion: '1.0.0',
      detectorModel: 'yolov8n.pt',
      trackerModel: 'bytetrack',
      poseModel: 'yolov8n-pose.pt',
      sampleRateHz: 15,
      createdAt: '2026-09-18T00:00:00Z',
      completedAt: '2026-09-18T00:00:10Z',
      device: 'cpu',
      effectiveDevice: 'cpu',
      trackedPlayerCount: 2,
      processingConfig: {
        detectorInputSize: 416, // Different input size!
        frameStride: 2,
        poseStride: 1,
        useCourtRoi: false,
        courtRoiMarginPx: 60,
        device: 'cpu',
      },
      performance: {
        elapsedSec: 10.0,
        analysisFps: 15.0,
        rtf: 1.0,
        realtimeSpeed: 1.0,
        samplingFps: 15.0,
      },
      players: [],
      quality: {
        detectionCoverage: 0.95,
        lostTimePercent: 5.0,
        confidence: 0.9,
        manualCorrections: 0,
      },
      summary: {
        durationSeconds: 10.0,
        sampleCount: 150,
        players: {},
      },
    };

    render(
      <TrackingLabInspector
        status={mockStatus}
        isProcessing={false}
        language="en"
        videoFingerprint="vfp_test_123"
        benchmarkHistory={[differingConfigRun]}
      />
    );

    fireEvent.click(screen.getByTestId('tab-performance'));

    expect(screen.getByTestId('benchmark-run-session_differing')).toBeInTheDocument();
    expect(screen.getByText('Configuration differs')).toBeInTheDocument();
  });
});
