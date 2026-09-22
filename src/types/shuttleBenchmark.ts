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
