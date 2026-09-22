import { describe, it, expect } from 'vitest';
import { ProcessingConfig, TrackingRuntimeProvenance } from '../../types';
import {
  createBenchmarkRun,
  serializeBenchmarkRun,
  deserializeBenchmarkRun,
} from '../../utils/trackingBenchmark';

describe('Phase 1.1 — Vision Engine Seams', () => {
  it('supports configurable detector, pose model, tracker, runtime, and precision in ProcessingConfig', () => {
    const config: ProcessingConfig = {
      profile: 'custom',
      device: 'cuda',
      detectorInputSize: 512,
      useCourtRoi: true,
      courtRoiMarginPx: 40,
      frameStride: 2,
      poseStride: 1,
      detectorModel: 'yolo11n.pt',
      detectorFamily: 'yolo11',
      poseModel: 'yolo11n-pose.pt',
      poseFamily: 'yolo11',
      trackerName: 'botsort',
      runtime: 'pytorch',
      precision: 'fp16',
      confidenceThreshold: 0.4,
    };

    expect(config.detectorModel).toBe('yolo11n.pt');
    expect(config.detectorFamily).toBe('yolo11');
    expect(config.poseModel).toBe('yolo11n-pose.pt');
    expect(config.trackerName).toBe('botsort');
    expect(config.runtime).toBe('pytorch');
    expect(config.precision).toBe('fp16');
  });

  it('supports runtime provenance with extended vision engine fields', () => {
    const prov: TrackingRuntimeProvenance = {
      detectorModel: 'yolo11n.pt',
      detectorFamily: 'yolo11',
      trackerModel: 'botsort',
      trackerName: 'botsort',
      poseModel: 'yolo11n-pose.pt',
      poseFamily: 'yolo11',
      device: 'cuda',
      requestedDevice: 'auto',
      effectiveDevice: 'cuda',
      requestedProfile: 'custom',
      effectiveProfile: 'custom',
      detectorInputSize: 512,
      frameStride: 2,
      poseStride: 1,
      useCourtRoi: true,
      courtRoiMarginPx: 40,
      runtime: 'pytorch',
      precision: 'fp16',
      confidenceThreshold: 0.4,
    };

    expect(prov.detectorModel).toBe('yolo11n.pt');
    expect(prov.trackerName).toBe('botsort');
    expect(prov.runtime).toBe('pytorch');
    expect(prov.precision).toBe('fp16');
  });

  it('preserves benchmark model config serialization with custom vision engine parameters', () => {
    const run = createBenchmarkRun({
      identity: {
        runId: 'bench_run_vision_seams_001',
        createdAt: '2026-09-21T10:00:00Z',
        sport: 'badminton',
        trackingMode: 'doubles',
        processingProfile: 'custom',
      },
      modelConfig: {
        detectorName: 'yolo11n.pt',
        detectorVersion: '11.0.0',
        poseModel: 'yolo11n-pose.pt',
        trackerName: 'botsort',
        detectorInputSize: 512,
        confidenceThreshold: 0.4,
        frameStride: 2,
        poseStride: 1,
        maxPlayers: 4,
        device: 'cuda',
        runtime: 'pytorch',
        precision: 'fp16',
        courtRoiEnabled: true,
      },
      videoMetadata: {
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceFps: 30.0,
        durationSeconds: 60.0,
      },
      performance: {
        framesAnalyzed: 900,
        analysisFps: 45.0,
        elapsedSeconds: 20.0,
        effectiveTelemetryHz: 15.0,
        processingRatio: 20.0 / 60.0,
      },
      quality: {
        meanTargetCoverage: 0.95,
        simultaneousTargetCoverage: 0.90,
        playerCoverage: {},
      },
    });

    const json = serializeBenchmarkRun(run);
    const roundtrip = deserializeBenchmarkRun(json);

    expect(roundtrip.modelConfig.detectorName).toBe('yolo11n.pt');
    expect(roundtrip.modelConfig.trackerName).toBe('botsort');
    expect(roundtrip.modelConfig.runtime).toBe('pytorch');
    expect(roundtrip.modelConfig.precision).toBe('fp16');
    expect(roundtrip.modelConfig.courtRoiEnabled).toBe(true);
  });
});
