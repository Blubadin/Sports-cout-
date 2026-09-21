import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BENCHMARK_MANIFEST,
  INITIAL_BENCHMARK_CLIPS,
  validateBenchmarkClip,
  validateBenchmarkManifest,
  validateDifficultSegment,
  createBenchmarkClip,
  createBenchmarkManifest,
  getBenchmarkClipById,
  filterClipsByDifficulty,
  filterClipsByGameType,
} from '../../benchmarks/visionBenchmarkManifest';
import {
  generateBenchmarkRunId,
  validateExperimentConfig,
  createExperimentConfig,
  experimentConfigToModelConfig,
  modelConfigToExperimentConfig,
  createBenchmarkRun,
} from '../../utils/trackingBenchmark';
import type {
  BenchmarkClipEntry,
  BenchmarkManifest,
  VisionBenchmarkExperimentConfig,
} from '../../types/benchmark';

describe('Phase 1.0 — Vision Benchmark Protocol', () => {
  // TEST 1 — MANIFEST WITH COMPLETE METADATA
  describe('1. Manifest with complete metadata', () => {
    it('validates a complete benchmark clip with all optional and required fields populated', () => {
      const completeClip: BenchmarkClipEntry = {
        id: 'B01_singles_easy',
        name: 'Singles / Easy (Static Rear)',
        sport: 'badminton',
        gameType: 'singles',
        playerCount: 2,
        videoReference: 'benchmarks/videos/B01_singles_easy.mp4',
        durationSec: 45.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceFps: 30.0,
        cameraType: 'static_rear',
        cameraMotion: 'static',
        difficultyTags: ['singles', 'static_rear', 'clear_lighting', 'low_occlusion'],
        courtCalibrationReference: 'calibration_rear_perspective_standard',
        groundTruthAvailable: true,
        notes: 'Complete reference clip for baseline testing',
        knownDifficultSegments: [
          {
            startSec: 10.0,
            endSec: 15.0,
            tags: ['lighting_shift'],
            description: 'Slight glare near baseline',
          },
        ],
      };

      const result = validateBenchmarkClip(completeClip);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates the default bundled manifest containing categories B01 to B05', () => {
      const manifestResult = validateBenchmarkManifest(DEFAULT_BENCHMARK_MANIFEST);
      expect(manifestResult.valid).toBe(true);
      expect(manifestResult.errors).toHaveLength(0);
      expect(DEFAULT_BENCHMARK_MANIFEST.clips.length).toBeGreaterThanOrEqual(5);

      const clipIds = DEFAULT_BENCHMARK_MANIFEST.clips.map((c) => c.id);
      expect(clipIds).toContain('B01_singles_easy');
      expect(clipIds).toContain('B02_singles_fast_rally');
      expect(clipIds).toContain('B03_doubles_standard');
      expect(clipIds).toContain('B04_doubles_occlusion');
      expect(clipIds).toContain('B05_difficult_broadcast');
    });
  });

  // TEST 2 — MANIFEST WITH PARTIAL METADATA
  describe('2. Manifest with partial metadata', () => {
    it('allows optional metadata fields to be null without failing validation', () => {
      const partialClip: BenchmarkClipEntry = {
        id: 'B99_partial_clip',
        name: 'Partial Metadata Clip',
        sport: 'badminton',
        gameType: 'singles',
        playerCount: 2,
        videoReference: null,
        durationSec: null,
        sourceWidth: null,
        sourceHeight: null,
        sourceFps: null,
        cameraType: 'unknown',
        cameraMotion: 'static',
        difficultyTags: ['uncalibrated'],
        courtCalibrationReference: null,
        groundTruthAvailable: false,
        notes: null,
        knownDifficultSegments: [],
      };

      const result = validateBenchmarkClip(partialClip);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('creates clip using factory defaulting omitted fields to null', () => {
      const clip = createBenchmarkClip({
        id: 'B10_quick_clip',
        name: 'Quick Clip',
        sport: 'badminton',
        gameType: 'singles',
      });

      expect(clip.id).toBe('B10_quick_clip');
      expect(clip.videoReference).toBeNull();
      expect(clip.durationSec).toBeNull();
      expect(clip.sourceWidth).toBeNull();
      expect(clip.sourceHeight).toBeNull();
      expect(clip.sourceFps).toBeNull();
      expect(clip.courtCalibrationReference).toBeNull();
      expect(clip.notes).toBeNull();
      expect(clip.groundTruthAvailable).toBe(false);
      expect(clip.knownDifficultSegments).toEqual([]);
      expect(clip.playerCount).toBe(2);

      const validation = validateBenchmarkClip(clip);
      expect(validation.valid).toBe(true);
    });
  });

  // TEST 3 — GROUND TRUTH AVAILABLE = FALSE
  describe('3. groundTruthAvailable=false', () => {
    it('safely supports groundTruthAvailable = false without fabricating fake zeros', () => {
      const clipWithoutGt = createBenchmarkClip({
        id: 'B01_no_gt',
        name: 'No Ground Truth Clip',
        groundTruthAvailable: false,
      });

      expect(clipWithoutGt.groundTruthAvailable).toBe(false);

      // When converting into a TrackingBenchmarkRun, groundTruth remains null/undefined
      const run = createBenchmarkRun({
        identity: {
          runId: 'RUN__test__no_gt',
          createdAt: new Date().toISOString(),
          sport: 'badminton',
          trackingMode: 'singles',
          processingProfile: 'reference',
        },
        modelConfig: {
          detectorName: 'yolov8n',
          poseModel: 'yolov8n-pose',
          trackerName: 'bytetrack',
          detectorInputSize: 640,
          confidenceThreshold: 0.25,
          frameStride: 2,
          poseStride: 1,
          maxPlayers: 2,
          device: 'cpu',
        },
        videoMetadata: {
          sourceWidth: 1920,
          sourceHeight: 1080,
          sourceFps: 30,
          durationSeconds: 30,
        },
        performance: {
          framesAnalyzed: 450,
          analysisFps: 32.5,
          elapsedSeconds: 13.8,
          effectiveTelemetryHz: 15.0,
          processingRatio: 0.46,
        },
        quality: {
          meanTargetCoverage: 0.95,
          simultaneousTargetCoverage: 0.90,
          playerCoverage: {},
        },
        groundTruth: null, // explicitly unmeasured
      });

      expect(run.groundTruth).toBeNull();
    });
  });

  // TEST 4 — KNOWN DIFFICULT SEGMENTS
  describe('4. Known difficult segments', () => {
    it('validates difficult temporal intervals within clips', () => {
      const segResultValid = validateDifficultSegment({
        startSec: 12.5,
        endSec: 18.0,
        tags: ['player-crossing', 'occlusion'],
        description: 'Teammates cross at the center net line',
      });
      expect(segResultValid.valid).toBe(true);
      expect(segResultValid.errors).toHaveLength(0);

      // Invalid start > end
      const segResultInvalid = validateDifficultSegment({
        startSec: 20.0,
        endSec: 15.0,
        tags: ['invalid-time'],
      });
      expect(segResultInvalid.valid).toBe(false);
      expect(segResultInvalid.errors).toContain('endSec must be greater than or equal to startSec');

      // Negative time
      const segResultNegative = validateDifficultSegment({
        startSec: -5.0,
        endSec: 10.0,
        tags: ['negative'],
      });
      expect(segResultNegative.valid).toBe(false);
      expect(segResultNegative.errors).toContain('startSec must be a non-negative finite number');
    });

    it('attaches and retrieves difficult segments on categories B02, B04, and B05', () => {
      const b02 = getBenchmarkClipById(DEFAULT_BENCHMARK_MANIFEST, 'B02_singles_fast_rally');
      expect(b02).toBeDefined();
      expect(b02!.knownDifficultSegments.length).toBeGreaterThan(0);
      expect(b02!.knownDifficultSegments[0].tags).toContain('fast_transition');

      const b04 = getBenchmarkClipById(DEFAULT_BENCHMARK_MANIFEST, 'B04_doubles_occlusion');
      expect(b04).toBeDefined();
      expect(b04!.knownDifficultSegments.length).toBe(2);
      expect(b04!.knownDifficultSegments[0].tags).toContain('player-crossing');

      const b05 = getBenchmarkClipById(DEFAULT_BENCHMARK_MANIFEST, 'B05_difficult_broadcast');
      expect(b05).toBeDefined();
      expect(b05!.knownDifficultSegments.length).toBe(2);
      expect(b05!.knownDifficultSegments[0].tags).toContain('camera_pan');
    });
  });

  // TEST 5 — EXPERIMENT CONFIGURATIONS REMAIN MODEL-NEUTRAL
  describe('5. Experiment configurations remain model-neutral', () => {
    it('allows arbitrary detector candidates (YOLOv8, YOLO11, YOLO26, custom)', () => {
      const yolo8Config = createExperimentConfig({
        experimentId: 'EXP_YOLOV8N_BASELINE',
        detector: 'yolov8n',
        tracker: 'bytetrack',
      });
      expect(validateExperimentConfig(yolo8Config).valid).toBe(true);

      const yolo11Config = createExperimentConfig({
        experimentId: 'EXP_YOLO11N_CANDIDATE',
        detector: 'yolo11n',
        detectorVersion: '11.0.0',
        tracker: 'bytetrack',
        runtime: 'onnxruntime',
      });
      expect(validateExperimentConfig(yolo11Config).valid).toBe(true);

      const yolo26Config = createExperimentConfig({
        experimentId: 'EXP_YOLO26_CANDIDATE',
        detector: 'yolo26',
        tracker: 'norfair',
        runtime: 'tensorrt',
        precision: 'fp16',
      });
      expect(validateExperimentConfig(yolo26Config).valid).toBe(true);
      expect(yolo26Config.detector).toBe('yolo26');
      expect(yolo26Config.tracker).toBe('norfair');
      expect(yolo26Config.runtime).toBe('tensorrt');
      expect(yolo26Config.precision).toBe('fp16');
    });

    it('converts between VisionBenchmarkExperimentConfig and TrackingBenchmarkModelConfig cleanly', () => {
      const expConfig = createExperimentConfig({
        experimentId: 'EXP_TEST_CONVERT',
        detector: 'yolov8m',
        tracker: 'ocsort',
        runtime: 'openvino',
        inputSize: 512,
        precision: 'int8',
        courtRoiEnabled: true,
      });

      const modelConfig = experimentConfigToModelConfig(expConfig);
      expect(modelConfig.detectorName).toBe('yolov8m');
      expect(modelConfig.trackerName).toBe('ocsort');
      expect(modelConfig.runtime).toBe('openvino');
      expect(modelConfig.detectorInputSize).toBe(512);
      expect(modelConfig.precision).toBe('int8');
      expect(modelConfig.courtRoiEnabled).toBe(true);

      const roundTrip = modelConfigToExperimentConfig(modelConfig, { experimentId: expConfig.experimentId });
      expect(roundTrip.detector).toBe(expConfig.detector);
      expect(roundTrip.tracker).toBe(expConfig.tracker);
      expect(roundTrip.runtime).toBe(expConfig.runtime);
      expect(roundTrip.inputSize).toBe(expConfig.inputSize);
      expect(roundTrip.precision).toBe(expConfig.precision);
      expect(roundTrip.courtRoiEnabled).toBe(expConfig.courtRoiEnabled);
    });
  });

  // TEST 6 — MISSING VALUES REMAIN UNAVAILABLE
  describe('6. Missing values remain unavailable', () => {
    it('preserves null/undefined in benchmark run creation when telemetry is absent', () => {
      const runWithUnavailableData = createBenchmarkRun({
        identity: {
          runId: 'RUN__unavailable_fields',
          createdAt: new Date().toISOString(),
          sport: 'badminton',
          trackingMode: null,
          processingProfile: null,
          videoFingerprint: null,
          videoReference: null,
        },
        modelConfig: {
          detectorName: null,
          poseModel: null,
          trackerName: null,
          detectorInputSize: null,
          confidenceThreshold: null,
          frameStride: null,
          poseStride: null,
          maxPlayers: null,
          device: null,
          runtime: null,
          precision: null,
          courtRoiEnabled: null,
        },
        videoMetadata: {
          sourceWidth: null,
          sourceHeight: null,
          sourceFps: null,
          durationSeconds: null,
        },
        performance: {
          framesAnalyzed: null,
          analysisFps: null,
          elapsedSeconds: null,
          effectiveTelemetryHz: null,
          processingRatio: null,
        },
        quality: {
          meanTargetCoverage: null,
          simultaneousTargetCoverage: null,
          playerCoverage: {},
        },
        identityAudit: null,
        groundTruth: null,
      });

      expect(runWithUnavailableData.identity.videoFingerprint).toBeNull();
      expect(runWithUnavailableData.modelConfig.detectorName).toBeNull();
      expect(runWithUnavailableData.modelConfig.detectorInputSize).toBeNull();
      expect(runWithUnavailableData.videoMetadata.sourceFps).toBeNull();
      expect(runWithUnavailableData.performance.analysisFps).toBeNull();
      expect(runWithUnavailableData.performance.processingRatio).toBeNull();
      expect(runWithUnavailableData.quality.meanTargetCoverage).toBeNull();
      expect(runWithUnavailableData.identityAudit).toBeNull();
      expect(runWithUnavailableData.groundTruth).toBeNull();
    });
  });

  // TEST 7 — MEASURED ZERO REMAINS DIFFERENT FROM UNAVAILABLE
  describe('7. Measured zero remains different from unavailable', () => {
    it('distinguishes measured 0 (zero id switches, 0.0 distance error) from null (unmeasured)', () => {
      const runWithMeasuredZero = createBenchmarkRun({
        identity: {
          runId: 'RUN__measured_zero',
          createdAt: new Date().toISOString(),
          sport: 'badminton',
          trackingMode: 'singles',
          processingProfile: 'reference',
        },
        modelConfig: {
          detectorName: 'yolov8n',
          poseModel: 'yolov8n-pose',
          trackerName: 'bytetrack',
          detectorInputSize: 640,
          confidenceThreshold: 0.25,
          frameStride: 2,
          poseStride: 1,
          maxPlayers: 2,
          device: 'cpu',
        },
        videoMetadata: {
          sourceWidth: 1920,
          sourceHeight: 1080,
          sourceFps: 30,
          durationSeconds: 30,
        },
        performance: {
          framesAnalyzed: 450,
          analysisFps: 30.0,
          elapsedSeconds: 15.0,
          effectiveTelemetryHz: 15.0,
          processingRatio: 0.5,
        },
        quality: {
          meanTargetCoverage: 1.0,
          simultaneousTargetCoverage: 1.0,
          playerCoverage: {
            P1: {
              playerId: 'P1',
              observedCoverage: 1.0,
              predictedPercent: 0.0, // Measured 0%
              lostPercent: 0.0, // Measured 0%
              meanObservedConfidence: 0.95,
            },
          },
        },
        identityAudit: {
          idSwitchCount: 0, // Measured 0 id switches!
          manualCorrectionCount: 0, // Measured 0 corrections!
          identityContinuity: 1.0,
        },
        groundTruth: {
          distanceError: 0.0, // Measured 0.0 meters error!
          meanCourtPositionError: 0.05,
          identityAccuracy: 1.0,
        },
      });

      expect(runWithMeasuredZero.quality.playerCoverage['P1'].predictedPercent).toBe(0.0);
      expect(runWithMeasuredZero.quality.playerCoverage['P1'].lostPercent).toBe(0.0);
      expect(runWithMeasuredZero.identityAudit?.idSwitchCount).toBe(0);
      expect(runWithMeasuredZero.identityAudit?.manualCorrectionCount).toBe(0);
      expect(runWithMeasuredZero.groundTruth?.distanceError).toBe(0.0);

      // Verify they are NOT null or undefined
      expect(runWithMeasuredZero.identityAudit?.idSwitchCount).not.toBeNull();
      expect(runWithMeasuredZero.identityAudit?.idSwitchCount).not.toBeUndefined();
      expect(runWithMeasuredZero.groundTruth?.distanceError).not.toBeNull();
      expect(runWithMeasuredZero.groundTruth?.distanceError).not.toBeUndefined();
    });
  });

  // TEST 8 — STRUCTURED RUN ID GENERATION & TRACEABILITY
  describe('8. Structured Run ID Generation & Traceability', () => {
    it('generates deterministic structured run IDs incorporating clip, model, runtime, and timestamp', () => {
      const runId = generateBenchmarkRunId({
        clipId: 'B01_singles_easy',
        detector: 'yolov8n',
        tracker: 'bytetrack',
        inputSize: 640,
        device: 'cpu',
        runtime: 'pytorch',
        precision: 'fp32',
        timestamp: '2026-09-21T14:00:00Z',
      });

      expect(runId).toBe('RUN__b01_singles_easy__yolov8n_bytetrack_640px_cpu_pytorch_fp32__20260921T140000Z');
      expect(runId).not.toContain('test1');
      expect(runId).not.toContain('best');
    });

    it('generates structured run IDs using experiment profile ID when provided', () => {
      const runId = generateBenchmarkRunId({
        clipId: 'B04_doubles_occlusion',
        experimentId: 'EXP_YOLO11N_NORFAIR_TENSORRT_FP16',
        timestamp: '2026-09-21T14:05:00Z',
      });

      expect(runId).toBe('RUN__b04_doubles_occlusion__exp_yolo11n_norfair_tensorrt_fp16__20260921T140500Z');
    });
  });

  // TEST 9 — MANIFEST QUERY HELPERS
  describe('9. Manifest Query Helpers', () => {
    it('filters clips by difficulty tag', () => {
      const occlusionClips = filterClipsByDifficulty(DEFAULT_BENCHMARK_MANIFEST, 'severe_occlusion');
      expect(occlusionClips.length).toBeGreaterThanOrEqual(1);
      expect(occlusionClips[0].id).toBe('B04_doubles_occlusion');

      const nonExistent = filterClipsByDifficulty(DEFAULT_BENCHMARK_MANIFEST, 'non_existent_tag');
      expect(nonExistent).toHaveLength(0);
    });

    it('filters clips by game type (singles vs doubles)', () => {
      const singlesClips = filterClipsByGameType(DEFAULT_BENCHMARK_MANIFEST, 'singles');
      const doublesClips = filterClipsByGameType(DEFAULT_BENCHMARK_MANIFEST, 'doubles');

      expect(singlesClips.length).toBeGreaterThanOrEqual(3); // B01, B02, B05
      expect(doublesClips.length).toBeGreaterThanOrEqual(2); // B03, B04
      expect(singlesClips.every((c) => c.gameType === 'singles')).toBe(true);
      expect(doublesClips.every((c) => c.gameType === 'doubles')).toBe(true);
    });
  });
});
