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
  trackingMode: string;
  /** Processing profile applied (e.g. 'reference', 'fast', 'balanced', 'quality', 'custom', 'auto') */
  processingProfile: string;
}

export interface TrackingBenchmarkModelConfig {
  /** Name of detection model (e.g. 'yolov8n', 'yolo11n', 'yolo26', etc.) */
  detectorName: string;
  /** Detector version string if available (optional, e.g. '8.0.0', '11.0.1') */
  detectorVersion?: string | null;
  /** Name of pose estimation model (e.g. 'yolov8n-pose', 'alphapose') */
  poseModel: string;
  /** Tracker algorithm name (e.g. 'bytetrack', 'norfair', 'ocsort', 'botsort') */
  trackerName: string;
  /** Tracker version if available (optional) */
  trackerVersion?: string | null;
  /** Square input dimension fed to the detector (e.g. 416, 512, 640) */
  detectorInputSize: number;
  /** Minimum detection confidence threshold (e.g. 0.25, 0.50) */
  confidenceThreshold: number;
  /** Frame stride for object detection (1 = every frame, 2 = alternate frames) */
  frameStride: number;
  /** Frame stride for pose keypoint estimation */
  poseStride: number;
  /** Target player count for tracking (1, 2, 3, 4) */
  maxPlayers: number;
  /** Execution device used (e.g. 'cpu', 'cuda', 'mps', 'tensorrt') */
  device: string;
}

export interface TrackingBenchmarkVideoMetadata {
  /** Native video pixel width */
  sourceWidth: number;
  /** Native video pixel height */
  sourceHeight: number;
  /** Video frame rate in frames per second */
  sourceFps: number;
  /** Video duration in seconds */
  durationSeconds: number;
  /** Total frames present in source video if known */
  totalSourceFrames?: number | null;
}

export interface TrackingBenchmarkPerformance {
  /** Total frames passed through analyzer */
  framesAnalyzed: number;
  /** Average inference/processing rate in frames per second */
  analysisFps: number;
  /** Total wall-clock elapsed processing time in seconds */
  elapsedSeconds: number;
  /** Effective rate of emitted telemetry points per second (Hz) */
  effectiveTelemetryHz: number;
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
  observedCoverage: number;
  /** Percentage of expected frames estimated via tracker prediction (0.0..100.0) */
  predictedPercent: number;
  /** Percentage of expected frames where target was lost/untracked (0.0..100.0) */
  lostPercent: number;
  /** Average detection confidence across observed frames (0.0..1.0) */
  meanObservedConfidence: number;
}

export interface TrackingBenchmarkQuality {
  /** Mean target coverage across all tracked players (0.0..1.0) */
  meanTargetCoverage: number;
  /** Fraction of frames where all expected players were observed simultaneously (0.0..1.0) */
  simultaneousTargetCoverage: number;
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
