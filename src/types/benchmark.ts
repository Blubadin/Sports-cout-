/**
 * SportsScout Tracking Benchmark Foundation Types
 *
 * Provides a vendor-neutral, reusable benchmark representation for tracking experiments
 * across different model architectures (YOLOv8, YOLO11, YOLO26), trackers (ByteTrack, Norfair, etc.),
 * resolutions, strides, and execution runtimes (CPU, CUDA, TensorRT).
 *
 * Rules:
 * - Tracker-independent: ByteTrack is a baseline configuration, not a hardcoded requirement.
 * - Missing / unmeasured values MUST remain undefined or null (never fabricate fake zeros).
 * - Measured zero (e.g. 0 id switches, 0.0 error) must be distinguishable from unknown.
 */

export interface TrackingBenchmarkRunIdentity {
  /** Unique run identifier (e.g. uuid or timestamp-prefixed id) */
  runId: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** Sport type (e.g. 'badminton', 'squash', 'tennis') */
  sport: string;
  /** Video fingerprint or stable video reference */
  videoFingerprint?: string | null;
  /** Stable file name or URI reference if available */
  videoReference?: string | null;
  /** Match mode (e.g. 'singles', 'doubles') */
  trackingMode: string | null;
  /** Processing profile applied (e.g. 'reference', 'fast', 'balanced', 'quality', 'custom', 'auto') */
  processingProfile: string | null;
}

export interface TrackingBenchmarkModelConfig {
  /** Name of detection model (e.g. 'yolov8n', 'yolo11n', 'yolo26', etc.) */
  detectorName: string | null;
  /** Detector version string if available (optional, e.g. '8.0.0', '11.0.1') */
  detectorVersion?: string | null;
  /** Name of pose estimation model (e.g. 'yolov8n-pose', 'alphapose') */
  poseModel: string | null;
  /** Tracker algorithm name (e.g. 'bytetrack', 'norfair', 'ocsort', 'botsort') */
  trackerName: string | null;
  /** Tracker version if available (optional) */
  trackerVersion?: string | null;
  /** Square input dimension fed to the detector (e.g. 416, 512, 640) */
  detectorInputSize: number | null;
  /** Minimum detection confidence threshold (e.g. 0.25, 0.50) */
  confidenceThreshold: number | null;
  /** Frame stride for object detection (1 = every frame, 2 = alternate frames) */
  frameStride: number | null;
  /** Frame stride for pose keypoint estimation */
  poseStride: number | null;
  /** Target player count for tracking (1, 2, 3, 4) */
  maxPlayers: number | null;
  /** Execution device used (e.g. 'cpu', 'cuda', 'mps', 'tensorrt') */
  device: string | null;
  /** Execution runtime environment (e.g. 'pytorch', 'onnxruntime', 'tensorrt', 'openvino') */
  runtime?: string | null;
  /** Numerical precision (e.g. 'fp32', 'fp16', 'int8', 'bf16') */
  precision?: string | null;
  /** Whether court ROI cropping was active during inference */
  courtRoiEnabled?: boolean | null;
}

export interface TrackingBenchmarkVideoMetadata {
  /** Native video pixel width */
  sourceWidth: number | null;
  /** Native video pixel height */
  sourceHeight: number | null;
  /** Video frame rate in frames per second */
  sourceFps: number | null;
  /** Video duration in seconds */
  durationSeconds: number | null;
  /** Total frames present in source video if known */
  totalSourceFrames?: number | null;
}

export interface TrackingBenchmarkPerformance {
  /** Total frames passed through analyzer */
  framesAnalyzed: number | null;
  /** Average inference/processing rate in frames per second */
  analysisFps: number | null;
  /** Total wall-clock elapsed processing time in seconds */
  elapsedSeconds: number | null;
  /** Effective rate of emitted telemetry points per second (Hz) */
  effectiveTelemetryHz: number | null;
  /**
   * Processing ratio = elapsedSeconds / durationSeconds.
   * Example: 60-minute video (3600s) processed in 30 real minutes (1800s)
   * processingRatio = 1800 / 3600 = 0.5 (< 1.0 is faster than real-time).
   * If durationSeconds <= 0, processingRatio is null.
   */
  processingRatio: number | null;
}

export interface TrackingBenchmarkPlayerQuality {
  /** Target player identifier (e.g. 'P1', 'P2') */
  playerId: string;
  /** Fraction of expected frames where target was observed (0.0..1.0) */
  observedCoverage: number | null;
  /** Percentage of expected frames estimated via tracker prediction (0.0..100.0) */
  predictedPercent: number | null;
  /** Percentage of expected frames where target was lost/untracked (0.0..100.0) */
  lostPercent: number | null;
  /** Average detection confidence across observed frames (0.0..1.0) */
  meanObservedConfidence: number | null;
}

export interface TrackingBenchmarkQuality {
  /** Mean target coverage across all tracked players (0.0..1.0) */
  meanTargetCoverage: number | null;
  /** Fraction of frames where all expected players were observed simultaneously (0.0..1.0) */
  simultaneousTargetCoverage: number | null;
  /** Per-player tracking quality breakdown */
  playerCoverage: Record<string, TrackingBenchmarkPlayerQuality>;
}

/**
 * Future identity stability and manual audit metrics.
 * Optional: unavailable values must remain undefined or null (never default to zero).
 */
export interface TrackingBenchmarkIdentityAudit {
  /** Number of identity swap occurrences during tracking session */
  idSwitchCount?: number | null;
  /** Number of manual analyst keypoint/box corrections applied */
  manualCorrectionCount?: number | null;
  /** Metric representing identity continuity over time (0.0..1.0) */
  identityContinuity?: number | null;
}

/**
 * Ground truth comparison metrics when labeled reference data is available.
 * Optional: no ground truth means unavailable. Never default to zero!
 */
export interface TrackingBenchmarkGroundTruth {
  /** Mean court position error in meters */
  meanCourtPositionError?: number | null;
  /** Median court position error in meters */
  medianCourtPositionError?: number | null;
  /** 95th percentile court position error in meters */
  p95CourtPositionError?: number | null;
  /** Overall distance estimation error in meters */
  distanceError?: number | null;
  /** Identity classification accuracy (0.0..1.0) */
  identityAccuracy?: number | null;
  /** Identity continuity against ground truth tracks (0.0..1.0) */
  identityContinuity?: number | null;
}

/**
 * Complete benchmark run record representing an experimental tracking evaluation.
 */
export interface TrackingBenchmarkRun {
  /** Run identity and environment context */
  identity: TrackingBenchmarkRunIdentity;
  /** Model and tracker configuration */
  modelConfig: TrackingBenchmarkModelConfig;
  /** Source video metadata */
  videoMetadata: TrackingBenchmarkVideoMetadata;
  /** Runtime execution performance metrics */
  performance: TrackingBenchmarkPerformance;
  /** Multi-target tracking quality metrics */
  quality: TrackingBenchmarkQuality;
  /** Future identity audit fields (optional - undefined/null if unmeasured) */
  identityAudit?: TrackingBenchmarkIdentityAudit | null;
  /** Ground truth benchmark metrics (optional - undefined/null if unmeasured) */
  groundTruth?: TrackingBenchmarkGroundTruth | null;
}

// ============================================================================
// Phase 1.0 — Vision Benchmark Protocol Interfaces
// ============================================================================

/**
 * A temporally bounded segment in a benchmark clip posing specific visual difficulty
 * (e.g. crossing athletes, rapid occlusion, lighting transitions).
 */
export interface BenchmarkDifficultSegment {
  /** Start offset in seconds from video start */
  startSec: number;
  /** End offset in seconds from video start */
  endSec: number;
  /** Descriptive tags identifying difficulty types */
  tags: string[];
  /** Optional human-readable description */
  description?: string | null;
}

/**
 * Metadata entry representing a standardized benchmark video clip.
 * Clips are referenced by stable logical identifiers; physical videos are NOT committed to Git.
 */
export interface BenchmarkClipEntry {
  /** Stable unique logical identifier (e.g. 'B01_singles_easy', 'B02_singles_fast_rally') */
  id: string;
  /** Human-readable descriptive name */
  name: string;
  /** Target sport (e.g. 'badminton', 'squash', 'tennis') */
  sport: string;
  /** Match configuration (e.g. 'singles', 'doubles') */
  gameType: 'singles' | 'doubles' | string;
  /** Expected target player count */
  playerCount: number;
  /** Logical relative video path or URI (null if clip placeholder) */
  videoReference: string | null;
  /** Video duration in seconds if known (null if unknown) */
  durationSec: number | null;
  /** Native video pixel width if known */
  sourceWidth: number | null;
  /** Native video pixel height if known */
  sourceHeight: number | null;
  /** Native video frame rate in FPS if known */
  sourceFps: number | null;
  /** Camera placement classification (e.g. 'static_rear', 'court_side', 'broadcast', 'mobile') */
  cameraType: string;
  /** Camera motion profile (e.g. 'static', 'pan_tilt_zoom', 'handheld', 'dynamic') */
  cameraMotion: string;
  /** Difficulty category tags */
  difficultyTags: string[];
  /** Optional court calibration file reference or preset key */
  courtCalibrationReference?: string | null;
  /**
   * Whether reference ground truth data is available for this clip.
   * Ground truth is strictly optional; when false, ground truth metrics remain null/unavailable.
   */
  groundTruthAvailable: boolean;
  /** Optional engineering notes or test purpose description */
  notes?: string | null;
  /** Specific challenging temporal intervals inside the clip */
  knownDifficultSegments: BenchmarkDifficultSegment[];
}

/**
 * Container manifest defining a reproducible benchmark evaluation suite.
 */
export interface BenchmarkManifest {
  /** Schema version number for manifest compatibility */
  schemaVersion: number;
  /** Unique manifest suite identifier */
  manifestId: string;
  /** ISO-8601 timestamp of last manifest update */
  updatedAt: string;
  /** General description of the benchmark suite purpose */
  description?: string | null;
  /** Registered benchmark clip entries */
  clips: BenchmarkClipEntry[];
}

/**
 * Structured, model-neutral experiment configuration for benchmark runs.
 * Captures all parameters necessary to reproduce an inference and tracking trial.
 */
export interface VisionBenchmarkExperimentConfig {
  /** Unique experiment configuration ID (e.g. 'EXP_YOLOV8N_BYTETRACK_640_CPU') */
  experimentId: string;
  /** Descriptive name of experiment candidate */
  name: string;
  /** Object detection model identifier (e.g. 'yolov8n', 'yolo11n', 'yolo26') */
  detector: string;
  /** Optional detector package / model weight version */
  detectorVersion?: string | null;
  /** Pose estimation model identifier (e.g. 'yolov8n-pose', null if disabled) */
  poseModel: string | null;
  /** Tracking algorithm identifier (e.g. 'bytetrack', 'norfair', 'ocsort') */
  tracker: string;
  /** Optional tracker version */
  trackerVersion?: string | null;
  /** Execution runtime environment (e.g. 'pytorch', 'onnxruntime', 'tensorrt', 'openvino') */
  runtime: string;
  /** Square input dimension fed to the detector (e.g. 416, 512, 640) */
  inputSize: number;
  /** Minimum detection confidence threshold (0.0..1.0) */
  confidenceThreshold: number;
  /** Frame stride for object detection (1 = every frame, 2 = alternate frames) */
  frameStride: number;
  /** Frame stride for pose keypoint estimation */
  poseStride: number;
  /** Whether court ROI cropping is enabled */
  courtRoiEnabled: boolean;
  /** Target execution device ('cpu', 'cuda', 'mps', 'tensorrt') */
  device: string;
  /** Numerical precision ('fp32', 'fp16', 'int8', 'bf16') */
  precision: string;
  /** Optional predefined processing profile */
  processingProfile?: string | null;
  /** Optional experiment rationale or notes */
  notes?: string | null;
}

export type ModelAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE / RUNTIME INCOMPATIBLE';

/**
 * Metadata representation of a candidate object detector in the benchmark suite (Phase 1.2).
 */
export interface DetectorCandidate {
  id: string;
  displayName: string;
  family: string;
  modelFile: string;
  task: string;
  supportedInputSizes: number[];
  baseline: boolean;
  confidenceThreshold: number;
  runtime: string;
  precision: string;
  availability?: ModelAvailabilityStatus;
  availabilityReason?: string;
  description?: string;
}

