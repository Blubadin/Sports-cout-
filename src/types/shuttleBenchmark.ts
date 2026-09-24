/**
 * SportsScout Shuttlecock Benchmark Foundation Types (Phase 2.0)
 *
 * Defines the standardized benchmark and ground-truth contract for badminton
 * shuttlecock tracking experiments.
 *
 * Fundamental Rules:
 * 1. IMAGE SPACE FIRST: Shuttlecock ground truth is defined in 2D image coordinates (pixel space).
 *    NEVER project airborne shuttle image coordinates through the 2D court homography matrix
 *    designed for player feet (Z = 0), as this produces massive parallax distortion.
 * 2. NO FAKE ZEROES: Invisible or unknown shuttle coordinates must remain null / unavailable.
 *    Representing unseen shuttle as (0, 0) is strictly forbidden.
 * 3. NO BINARIES IN GIT: Video files are never committed to repository. The manifest stores
 *    only logical reference paths.
 * 4. PROVENANCE & REVIEW: Labeled frames support manual, semi-automatic, and model-assisted
 *    sources, but ground truth must be verified with reviewed: true for official benchmark metrics.
 */

export type ShuttleVisibility = 'visible' | 'occluded' | 'not_visible' | 'unknown';

export type ShuttleAnnotationSource = 'manual' | 'semi_automatic' | 'model_assisted';

export type ShuttleDatasetSplit = 'development' | 'validation' | 'test';

export type ShuttleDifficultTag =
  | 'smash'
  | 'motion_blur'
  | 'shuttle_near_player'
  | 'body_occlusion'
  | 'net_occlusion'
  | 'camera_motion'
  | 'far_court'
  | 'white_background'
  | 'crowd_background'
  | 'lost_reacquisition'
  | string;

/**
 * Temporally bounded interval within a benchmark clip highlighting specific
 * visual or operational challenges for shuttlecock detection/tracking.
 */
export interface ShuttleDifficultSegment {
  /** Start time in seconds from clip beginning */
  startSec: number;
  /** End time in seconds from clip beginning */
  endSec: number;
  /** Recognized difficulty tags */
  tags: ShuttleDifficultTag[];
  /** Optional human-readable explanation of the challenge */
  description?: string | null;
}

/**
 * Single frame ground-truth annotation for shuttlecock tracking.
 *
 * Contract:
 * - When visibility === 'visible', xPx and yPx MUST be finite numbers.
 * - When visibility === 'not_visible' or 'unknown', xPx and yPx MUST be null.
 * - When visibility === 'occluded', xPx and yPx may be an estimated/known location or null.
 * - Under NO circumstance should missing shuttle position be recorded as (0, 0).
 */
export interface ShuttleGroundTruthFrame {
  /** Zero-indexed video frame number */
  frameIndex: number;
  /** Video timestamp in seconds */
  timestampSec: number;
  /** Visibility state of the shuttlecock */
  visibility: ShuttleVisibility;
  /** 2D image coordinate X in native pixels (null when unseen/unknown) */
  xPx: number | null;
  /** 2D image coordinate Y in native pixels (null when unseen/unknown) */
  yPx: number | null;
  /** Optional normalized X coordinate in range [0.0, 1.0] */
  xNormalized?: number | null;
  /** Optional normalized Y coordinate in range [0.0, 1.0] */
  yNormalized?: number | null;
  /** Origin method of the annotation */
  annotationSource?: ShuttleAnnotationSource | null;
  /** True if manually inspected and verified by human annotator/analyst */
  reviewed?: boolean | null;
  /** Optional analyst notes (e.g. "contact point with racket", "behind net tape") */
  notes?: string | null;
}

/**
 * Metadata entry representing a standardized shuttlecock benchmark video clip.
 * Video binaries are NOT stored in Git; only logical relative paths are kept.
 */
export interface ShuttleBenchmarkClip {
  /** Unique logical identifier (e.g. 'S01_singles_clear_rally') */
  id: string;
  /** Human-readable descriptive clip title */
  name: string;
  /** Logical benchmark category (e.g. 'S01', 'S02', 'S03', 'S04', 'S05') */
  category: 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | string;
  /** Target sport (standard: 'badminton') */
  sport: string;
  /** Match format ('singles' | 'doubles') */
  gameType: 'singles' | 'doubles' | string;
  /** Dataset partition for evaluation discipline */
  split: ShuttleDatasetSplit;
  /** Expected target player count (2 for singles, 4 for doubles) */
  playerCount: number;
  /** Logical relative video path or URI (null if reference placeholder) */
  videoReference: string | null;
  /** Clip duration in seconds (recommended 10–30s) */
  durationSec: number | null;
  /** Native video pixel width if known */
  sourceWidth: number | null;
  /** Native video pixel height if known */
  sourceHeight: number | null;
  /** Native video frame rate in FPS if known */
  sourceFps: number | null;
  /** Camera placement classification (e.g. 'static_rear', 'broadcast_elevated', 'court_side') */
  cameraType: string;
  /** Camera motion profile (e.g. 'static', 'pan_tilt_zoom', 'handheld') */
  cameraMotion: string;
  /** Difficulty tags characterizing overall clip */
  difficultyTags: string[];
  /** Optional court calibration reference (for court context, NOT direct shuttle projection) */
  courtCalibrationReference?: string | null;
  /** Whether ground truth annotations exist for this clip */
  groundTruthAvailable: boolean;
  /** Optional engineering notes */
  notes?: string | null;
  /** Tagged challenging temporal intervals */
  knownDifficultSegments: ShuttleDifficultSegment[];
  /** Embedded ground-truth frames if bundled in manifest (optional) */
  groundTruthFrames?: ShuttleGroundTruthFrame[] | null;
  /** Logical reference path to external ground-truth dataset file (optional) */
  groundTruthPath?: string | null;
}

/**
 * Container manifest defining the shuttlecock benchmark evaluation suite.
 */
export interface ShuttleBenchmarkManifest {
  /** Schema version number for manifest compatibility (Phase 2.0 = 1) */
  schemaVersion: number;
  /** Unique manifest suite identifier */
  manifestId: string;
  /** ISO-8601 timestamp of last manifest update */
  updatedAt: string;
  /** General description of the benchmark suite purpose */
  description?: string | null;
  /** Collection of registered benchmark clip entries */
  clips: ShuttleBenchmarkClip[];
}

/**
 * Configuration options controlling ground-truth alignment and evaluation matching.
 */
export interface ShuttleBenchmarkConfig {
  /** Maximum timestamp difference in seconds to consider two frames aligned (default: 0.02) */
  timestampToleranceSec?: number;
  /** Spatial distance threshold in pixels for a detection to match visible GT (default: 30 px) */
  matchDistanceThresholdPx?: number | null;
  /** Optional normalized spatial threshold, used when the pixel threshold is null and dimensions exist. */
  matchDistanceThresholdNormalized?: number | null;
}

/**
 * Standardized Phase 2.6 Shuttlecock Quality Benchmark Metrics.
 *
 * Calculated by comparing predictions (ShuttleObservation) against reviewed
 * ground truth (ShuttleGroundTruthFrame).
 */
export interface ShuttleQualityMetrics {
  /** Dataset or clip evaluation status: 'COMPLETE' | 'GROUND TRUTH DATASET INCOMPLETE' */
  datasetStatus: 'COMPLETE' | 'GROUND TRUTH DATASET INCOMPLETE';
  /** Total number of frames in the evaluated sequence */
  totalFrames: number;
  /** Total duration in seconds evaluated */
  evaluatedDurationSec: number;
  /** Number of GT frames where shuttle was visible */
  gtVisibleCount: number;
  /** Number of GT frames where shuttle was occluded */
  gtOccludedCount: number;
  /** Number of GT frames where shuttle was not visible */
  gtNotVisibleCount: number;
  /** Number of GT frames where shuttle visibility was unknown */
  gtUnknownCount: number;

  // Primary Accuracy Metrics
  /** Visible-Frame Recall (TP / GT_visible), or null if no visible GT frames */
  visibleFrameRecall: number | null;
  /** Precision (TP / (TP + FP)), or null if no positive predictions */
  precision: number | null;
  /** Count of true positive detections */
  truePositivesCount: number | null;
  /** Count of false positive detections (hallucinations or distant matches) */
  falsePositivesCount: number | null;
  /** Count of false negative frames (missed visible shuttle) */
  falseNegativesCount: number | null;
  /** False Positives Per Minute of video duration */
  falsePositivesPerMinute: number | null;

  // Spatial Error Metrics (Raw Image Pixels)
  /** Number of matched coordinate pairs evaluated for spatial error */
  positionEvaluatedCount: number | null;
  /** Mean Euclidean distance error in native image pixels, or null if 0 pairs */
  meanPixelError: number | null;
  /** Median (50th percentile) distance error in native image pixels, or null */
  medianPixelError: number | null;
  /** 95th percentile distance error in native image pixels, or null */
  p95PixelError: number | null;

  // Normalized Position Error Metrics
  /** Diagonal length of the video frame in pixels: sqrt(W^2 + H^2), or null */
  imageDiagonalPx: number | null;
  /** Exact mathematical formula used for spatial normalization */
  normalizationFormula: string;
  /** Mean normalized distance error (error / diagonal), or null */
  meanNormalizedError: number | null;
  /** Median normalized distance error (error / diagonal), or null */
  medianNormalizedError: number | null;
  /** 95th percentile normalized distance error (error / diagonal), or null */
  p95NormalizedError: number | null;

  // Track Continuity & Fragmentation
  /** Track Continuity ratio: continuous observed transitions / total visible transitions (0.0 to 1.0) */
  trackContinuity: number | null;
  /** Length of the longest uninterrupted sequence of observed frames */
  longestContinuousTrackFrames: number;
  /** Number of times tracking switched from observed to lost/unknown during visible GT */
  trackFragmentationCount: number;

  // Lost & Gap Metrics
  /** Percentage of frames where prediction state was 'lost' */
  lostPercent: number;
  /** Number of frames where prediction state was 'lost' */
  lostFramesCount: number;
  /** Maximum number of consecutive lost frames */
  longestLostGapFrames: number;
  /** Duration in seconds of the longest lost gap */
  longestLostGapSec: number | null;

  // Reacquisition Metrics
  /** Number of reacquisition opportunities evaluated */
  reacquisitionEventsCount: number | null;
  /** Mean time in seconds to reacquire after loss/occlusion, or null */
  meanReacquisitionTimeSec: number | null;
  /** 95th percentile reacquisition time in seconds, or null */
  p95ReacquisitionTimeSec: number | null;
  /** Mean number of frames to reacquire after loss/occlusion, or null */
  meanReacquisitionFrames: number | null;
  /** 95th percentile reacquisition frames, or null */
  p95ReacquisitionFrames: number | null;

  // State Distribution (Reported Separately)
  /** Percentage of frames in 'observed' state */
  observedPercent: number;
  /** Percentage of frames in 'predicted' state */
  predictedPercent: number;
  /** Percentage of frames in 'interpolated' state */
  interpolatedPercent: number;
  /** Percentage of frames in 'unknown' state */
  unknownPercent: number;
  /** Count of frames in 'observed' state */
  observedCount: number;
  /** Count of frames in 'predicted' state */
  predictedCount: number;
  /** Count of frames in 'interpolated' state */
  interpolatedCount: number;
  /** Count of frames in 'unknown' state */
  unknownCount: number;

  // Performance Telemetry (Optional / When Available)
  /** Stream processing speed in frames per second */
  analysisFps?: number | null;
  /** Ratio of processing speed to video source FPS (analysisFps / sourceFps) */
  processingRatio?: number | null;
  /** Mean model inference time in milliseconds */
  meanInferenceMs?: number | null;
  /** Execution hardware device (e.g. 'cpu', 'cuda') */
  device?: string | null;
  /** Execution runtime (e.g. 'opencv_dnn', 'onnxruntime') */
  runtime?: string | null;
  /** Numerical precision (e.g. 'fp32', 'fp16') */
  precisionMode?: string | null;
}


/**
 * Result of evaluating a specific tracker configuration against a benchmark clip.
 */
export interface ShuttleBenchmarkClipResult {
  clipId: string;
  configurationId: string;
  metrics: ShuttleQualityMetrics;
  limitations: string[];
}

/**
 * Comparison entry between multiple tracker configurations on the same clip/dataset.
 */
export interface ShuttleConfigurationComparison {
  clipId: string;
  configurations: {
    configurationId: string;
    description: string;
    metrics: ShuttleQualityMetrics;
  }[];
}

