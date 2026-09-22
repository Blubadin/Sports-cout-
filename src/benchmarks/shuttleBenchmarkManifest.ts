/**
 * SportsScout Shuttlecock Benchmark Manifest (Phase 2.0)
 *
 * Defines the standardized reference manifest and validation logic for shuttlecock
 * tracking experiments.
 *
 * Geometry & Integrity Invariants:
 * 1. Image Space First: Shuttlecock ground-truth coordinates are recorded in native pixel space.
 *    Projecting airborne shuttle image coordinates directly through 2D court-floor homography
 *    is mathematically invalid and strictly prohibited.
 * 2. No Fake Zeroes: An invisible or unknown shuttle MUST NOT be encoded as (0, 0). Missing
 *    coordinates must remain null.
 * 3. Logical References Only: Video binaries are never stored in Git.
 * 4. Provenance & Review: Annotations capture source (manual, semi_automatic, model_assisted)
 *    and human verification state (reviewed: boolean).
 */

import type {
  ShuttleAnnotationSource,
  ShuttleBenchmarkClip,
  ShuttleBenchmarkManifest,
  ShuttleDatasetSplit,
  ShuttleDifficultSegment,
  ShuttleDifficultTag,
  ShuttleGroundTruthFrame,
  ShuttleVisibility,
} from '../types/shuttleBenchmark';
import manifestData from './shuttleBenchmarkManifest.json';

export const VALID_SHUTTLE_VISIBILITIES: readonly ShuttleVisibility[] = [
  'visible',
  'occluded',
  'not_visible',
  'unknown',
] as const;

export const VALID_SHUTTLE_ANNOTATION_SOURCES: readonly ShuttleAnnotationSource[] = [
  'manual',
  'semi_automatic',
  'model_assisted',
] as const;

export const VALID_SHUTTLE_SPLITS: readonly ShuttleDatasetSplit[] = [
  'development',
  'validation',
  'test',
] as const;

export const STANDARD_SHUTTLE_DIFFICULT_TAGS: readonly ShuttleDifficultTag[] = [
  'smash',
  'motion_blur',
  'shuttle_near_player',
  'body_occlusion',
  'net_occlusion',
  'camera_motion',
  'far_court',
  'white_background',
  'crowd_background',
  'lost_reacquisition',
] as const;

/**
 * Initial reference shuttle benchmark clips (S01 - S05).
 */
export const INITIAL_SHUTTLE_BENCHMARK_CLIPS: ShuttleBenchmarkClip[] =
  manifestData.clips as unknown as ShuttleBenchmarkClip[];

/**
 * Default standard shuttle benchmark manifest suite.
 */
export const DEFAULT_SHUTTLE_BENCHMARK_MANIFEST: ShuttleBenchmarkManifest = {
  schemaVersion: manifestData.schemaVersion,
  manifestId: manifestData.manifestId,
  updatedAt: manifestData.updatedAt,
  description: manifestData.description,
  clips: INITIAL_SHUTTLE_BENCHMARK_CLIPS,
};

export interface FrameValidationOptions {
  imageWidth?: number;
  imageHeight?: number;
}

/**
 * Validates a single shuttle ground truth frame annotation.
 * Enforces the strict rule that unseen or unknown coordinates must be null and never (0, 0).
 */
export function validateShuttleGroundTruthFrame(
  frame: unknown,
  options?: FrameValidationOptions
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!frame || typeof frame !== 'object') {
    return { valid: false, errors: ['Ground truth frame must be an object'] };
  }

  const f = frame as Record<string, unknown>;

  // 1. frameIndex
  if (typeof f.frameIndex !== 'number' || !Number.isInteger(f.frameIndex) || f.frameIndex < 0) {
    errors.push('frameIndex must be a non-negative integer');
  }

  // 2. timestampSec
  if (typeof f.timestampSec !== 'number' || !Number.isFinite(f.timestampSec) || f.timestampSec < 0) {
    errors.push('timestampSec must be a non-negative finite number');
  }

  // 3. visibility
  if (
    typeof f.visibility !== 'string' ||
    !VALID_SHUTTLE_VISIBILITIES.includes(f.visibility as ShuttleVisibility)
  ) {
    errors.push(
      `visibility must be one of: ${VALID_SHUTTLE_VISIBILITIES.join(', ')} (got: ${String(f.visibility)})`
    );
  }

  const visibility = f.visibility as ShuttleVisibility;

  // 4. Coordinates semantics
  if (visibility === 'visible') {
    if (typeof f.xPx !== 'number' || !Number.isFinite(f.xPx) || f.xPx < 0) {
      errors.push('visible shuttle must have a non-negative finite xPx coordinate');
    }
    if (typeof f.yPx !== 'number' || !Number.isFinite(f.yPx) || f.yPx < 0) {
      errors.push('visible shuttle must have a non-negative finite yPx coordinate');
    }

    if (options?.imageWidth && typeof f.xPx === 'number' && f.xPx > options.imageWidth) {
      errors.push(`xPx (${f.xPx}) exceeds source width (${options.imageWidth})`);
    }
    if (options?.imageHeight && typeof f.yPx === 'number' && f.yPx > options.imageHeight) {
      errors.push(`yPx (${f.yPx}) exceeds source height (${options.imageHeight})`);
    }
  } else if (visibility === 'not_visible' || visibility === 'unknown') {
    // Coordinates MUST be null or undefined. Never fake (0, 0)!
    if (f.xPx !== null && f.xPx !== undefined) {
      if (f.xPx === 0 && f.yPx === 0) {
        errors.push(
          `${visibility} shuttle must not represent missing coordinate as fake zero (0, 0); coordinates must be null`
        );
      } else {
        errors.push(`${visibility} shuttle must have null or undefined xPx coordinate`);
      }
    }
    if (f.yPx !== null && f.yPx !== undefined) {
      if (!errors.some((e) => e.includes('fake zero (0, 0)'))) {
        errors.push(`${visibility} shuttle must have null or undefined yPx coordinate`);
      }
    }
  } else if (visibility === 'occluded') {
    // Occluded shuttle may have known/estimated position OR null.
    // However, if one coordinate is provided, both must be provided and finite.
    const hasX = f.xPx !== null && f.xPx !== undefined;
    const hasY = f.yPx !== null && f.yPx !== undefined;
    if (hasX !== hasY) {
      errors.push('occluded shuttle must specify both xPx and yPx or leave both null');
    }
    if (hasX && (typeof f.xPx !== 'number' || !Number.isFinite(f.xPx) || f.xPx < 0)) {
      errors.push('occluded xPx coordinate when provided must be a non-negative finite number');
    }
    if (hasY && (typeof f.yPx !== 'number' || !Number.isFinite(f.yPx) || f.yPx < 0)) {
      errors.push('occluded yPx coordinate when provided must be a non-negative finite number');
    }
  }

  // 5. Normalized coordinates (optional)
  if (f.xNormalized !== undefined && f.xNormalized !== null) {
    if (typeof f.xNormalized !== 'number' || !Number.isFinite(f.xNormalized) || f.xNormalized < 0 || f.xNormalized > 1) {
      errors.push('xNormalized must be a number between 0.0 and 1.0 (or null)');
    }
  }
  if (f.yNormalized !== undefined && f.yNormalized !== null) {
    if (typeof f.yNormalized !== 'number' || !Number.isFinite(f.yNormalized) || f.yNormalized < 0 || f.yNormalized > 1) {
      errors.push('yNormalized must be a number between 0.0 and 1.0 (or null)');
    }
  }

  // 6. Annotation source & review state
  if (f.annotationSource !== undefined && f.annotationSource !== null) {
    if (
      typeof f.annotationSource !== 'string' ||
      !VALID_SHUTTLE_ANNOTATION_SOURCES.includes(f.annotationSource as ShuttleAnnotationSource)
    ) {
      errors.push(
        `annotationSource must be one of: ${VALID_SHUTTLE_ANNOTATION_SOURCES.join(', ')} (got: ${String(f.annotationSource)})`
      );
    }
  }
  if (f.reviewed !== undefined && f.reviewed !== null && typeof f.reviewed !== 'boolean') {
    errors.push('reviewed must be a boolean or null/undefined');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a difficult segment entry in a shuttle benchmark clip.
 */
export function validateShuttleDifficultSegment(segment: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!segment || typeof segment !== 'object') {
    return { valid: false, errors: ['Segment must be an object'] };
  }
  const s = segment as Record<string, unknown>;

  if (typeof s.startSec !== 'number' || !Number.isFinite(s.startSec) || s.startSec < 0) {
    errors.push('startSec must be a non-negative finite number');
  }
  if (typeof s.endSec !== 'number' || !Number.isFinite(s.endSec) || s.endSec < 0) {
    errors.push('endSec must be a non-negative finite number');
  }
  if (typeof s.startSec === 'number' && typeof s.endSec === 'number' && s.endSec < s.startSec) {
    errors.push('endSec must be greater than or equal to startSec');
  }
  if (!Array.isArray(s.tags) || s.tags.length === 0 || s.tags.some((t) => typeof t !== 'string' || t.trim().length === 0)) {
    errors.push('tags must be a non-empty array of non-empty strings');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a single shuttle benchmark clip entry according to Phase 2.0 specifications.
 */
export function validateShuttleBenchmarkClip(clip: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!clip || typeof clip !== 'object') {
    return { valid: false, errors: ['Clip entry must be an object'] };
  }
  const c = clip as Record<string, unknown>;

  // Required string identifiers
  if (typeof c.id !== 'string' || c.id.trim().length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (typeof c.name !== 'string' || c.name.trim().length === 0) {
    errors.push('name must be a non-empty string');
  }
  if (typeof c.category !== 'string' || c.category.trim().length === 0) {
    errors.push('category must be a non-empty string');
  }
  if (typeof c.sport !== 'string' || c.sport.trim().length === 0) {
    errors.push('sport must be a non-empty string');
  }
  if (typeof c.gameType !== 'string' || c.gameType.trim().length === 0) {
    errors.push('gameType must be a non-empty string');
  }

  // Dataset split
  if (
    typeof c.split !== 'string' ||
    !VALID_SHUTTLE_SPLITS.includes(c.split as ShuttleDatasetSplit)
  ) {
    errors.push(`split must be one of: ${VALID_SHUTTLE_SPLITS.join(', ')} (got: ${String(c.split)})`);
  }

  // Player count
  if (typeof c.playerCount !== 'number' || !Number.isInteger(c.playerCount) || c.playerCount <= 0) {
    errors.push('playerCount must be a positive integer');
  }

  // Camera attributes
  if (typeof c.cameraType !== 'string') {
    errors.push('cameraType must be a string');
  }
  if (typeof c.cameraMotion !== 'string') {
    errors.push('cameraMotion must be a string');
  }

  // Difficulty tags
  if (!Array.isArray(c.difficultyTags) || c.difficultyTags.some((t) => typeof t !== 'string')) {
    errors.push('difficultyTags must be an array of strings');
  }

  // Optional video reference (string or null, never requires git binary asset!)
  if (c.videoReference !== null && c.videoReference !== undefined && typeof c.videoReference !== 'string') {
    errors.push('videoReference must be a string or null');
  }

  // Duration
  if (c.durationSec !== null && c.durationSec !== undefined) {
    if (typeof c.durationSec !== 'number' || !Number.isFinite(c.durationSec) || c.durationSec <= 0) {
      errors.push('durationSec must be a positive finite number or null');
    }
  }

  // Video resolution / FPS
  if (c.sourceWidth !== null && c.sourceWidth !== undefined) {
    if (typeof c.sourceWidth !== 'number' || !Number.isInteger(c.sourceWidth) || c.sourceWidth <= 0) {
      errors.push('sourceWidth must be a positive integer or null');
    }
  }
  if (c.sourceHeight !== null && c.sourceHeight !== undefined) {
    if (typeof c.sourceHeight !== 'number' || !Number.isInteger(c.sourceHeight) || c.sourceHeight <= 0) {
      errors.push('sourceHeight must be a positive integer or null');
    }
  }
  if (c.sourceFps !== null && c.sourceFps !== undefined) {
    if (typeof c.sourceFps !== 'number' || !Number.isFinite(c.sourceFps) || c.sourceFps <= 0) {
      errors.push('sourceFps must be a positive finite number or null');
    }
  }

  // Ground truth availability
  if (typeof c.groundTruthAvailable !== 'boolean') {
    errors.push('groundTruthAvailable must be a boolean');
  }

  // Difficult segments
  if (!Array.isArray(c.knownDifficultSegments)) {
    errors.push('knownDifficultSegments must be an array');
  } else {
    c.knownDifficultSegments.forEach((seg, idx) => {
      const segResult = validateShuttleDifficultSegment(seg);
      if (!segResult.valid) {
        errors.push(`knownDifficultSegments[${idx}]: ${segResult.errors.join('; ')}`);
      }
    });
  }

  // Ground truth frames if provided
  if (c.groundTruthFrames !== null && c.groundTruthFrames !== undefined) {
    if (!Array.isArray(c.groundTruthFrames)) {
      errors.push('groundTruthFrames must be an array or null');
    } else {
      const w = typeof c.sourceWidth === 'number' ? c.sourceWidth : undefined;
      const h = typeof c.sourceHeight === 'number' ? c.sourceHeight : undefined;
      c.groundTruthFrames.forEach((frame, idx) => {
        const frameResult = validateShuttleGroundTruthFrame(frame, { imageWidth: w, imageHeight: h });
        if (!frameResult.valid) {
          errors.push(`groundTruthFrames[${idx}]: ${frameResult.errors.join('; ')}`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an entire shuttle benchmark manifest suite.
 */
export function validateShuttleBenchmarkManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }
  const m = manifest as Record<string, unknown>;

  if (typeof m.schemaVersion !== 'number' || !Number.isInteger(m.schemaVersion) || m.schemaVersion <= 0) {
    errors.push('schemaVersion must be a positive integer');
  }
  if (typeof m.manifestId !== 'string' || m.manifestId.trim().length === 0) {
    errors.push('manifestId must be a non-empty string');
  }
  if (typeof m.updatedAt !== 'string' || isNaN(Date.parse(m.updatedAt))) {
    errors.push('updatedAt must be a valid ISO-8601 timestamp string');
  }
  if (!Array.isArray(m.clips)) {
    errors.push('clips must be an array of benchmark clip entries');
  } else {
    if (m.clips.length === 0) {
      errors.push('clips array must not be empty');
    }
    const ids = new Set<string>();
    m.clips.forEach((clip, idx) => {
      const clipResult = validateShuttleBenchmarkClip(clip);
      if (!clipResult.valid) {
        errors.push(`clips[${idx}]: ${clipResult.errors.join('; ')}`);
      }
      if (clip && typeof clip === 'object' && typeof (clip as Record<string, unknown>).id === 'string') {
        const id = (clip as Record<string, unknown>).id as string;
        if (ids.has(id)) {
          errors.push(`duplicate clip id found: ${id}`);
        }
        ids.add(id);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Mathematical & Architectural Guard:
 * Explains and enforces why airborne shuttle image coordinates CANNOT be directly projected
 * through 2D player-feet court homography.
 */
export function assertImageSpaceShuttleCoordinate(frame: ShuttleGroundTruthFrame): void {
  if (frame.visibility === 'visible' && (frame.xPx === null || frame.yPx === null)) {
    throw new Error('Visible shuttle frame must have valid 2D image coordinates');
  }
}

/**
 * Rejection helper preventing unauthorized projection of airborne shuttle onto court plane homography.
 */
export function rejectDirectCourtHomographyProjection(reason = 'Airborne 3D parallax distortion'): never {
  throw new Error(
    `Direct court homography projection forbidden for shuttlecock tracking: ${reason}. ` +
      'Player homography assumes Z=0 (court floor). The airborne shuttle requires image-space evaluation ' +
      'or specialized 3D / event-level modeling.'
  );
}

// ============================================================================
// Builder & Filter Helpers
// ============================================================================

export function createShuttleGroundTruthFrame(
  params: Partial<ShuttleGroundTruthFrame> & {
    frameIndex: number;
    timestampSec: number;
    visibility: ShuttleVisibility;
  }
): ShuttleGroundTruthFrame {
  return {
    frameIndex: params.frameIndex,
    timestampSec: params.timestampSec,
    visibility: params.visibility,
    xPx: params.xPx ?? null,
    yPx: params.yPx ?? null,
    xNormalized: params.xNormalized ?? null,
    yNormalized: params.yNormalized ?? null,
    annotationSource: params.annotationSource ?? 'manual',
    reviewed: params.reviewed ?? false,
    notes: params.notes ?? null,
  };
}

export function createShuttleBenchmarkClip(
  params: Partial<ShuttleBenchmarkClip> & {
    id: string;
    name: string;
    category: string;
    gameType: 'singles' | 'doubles' | string;
    split: ShuttleDatasetSplit;
  }
): ShuttleBenchmarkClip {
  return {
    id: params.id,
    name: params.name,
    category: params.category,
    sport: params.sport ?? 'badminton',
    gameType: params.gameType,
    split: params.split,
    playerCount: params.playerCount ?? (params.gameType === 'doubles' ? 4 : 2),
    videoReference: params.videoReference ?? null,
    durationSec: params.durationSec ?? null,
    sourceWidth: params.sourceWidth ?? null,
    sourceHeight: params.sourceHeight ?? null,
    sourceFps: params.sourceFps ?? null,
    cameraType: params.cameraType ?? 'static_rear',
    cameraMotion: params.cameraMotion ?? 'static',
    difficultyTags: params.difficultyTags ?? [],
    courtCalibrationReference: params.courtCalibrationReference ?? null,
    groundTruthAvailable: params.groundTruthAvailable ?? false,
    notes: params.notes ?? null,
    knownDifficultSegments: params.knownDifficultSegments ?? [],
    groundTruthFrames: params.groundTruthFrames ?? null,
    groundTruthPath: params.groundTruthPath ?? null,
  };
}

export function getShuttleClipById(
  manifest: ShuttleBenchmarkManifest,
  id: string
): ShuttleBenchmarkClip | undefined {
  return manifest.clips.find((c) => c.id === id);
}

export function filterShuttleClipsBySplit(
  clips: ShuttleBenchmarkClip[],
  split: ShuttleDatasetSplit
): ShuttleBenchmarkClip[] {
  return clips.filter((c) => c.split === split);
}

export function filterShuttleClipsByCategory(
  clips: ShuttleBenchmarkClip[],
  category: string
): ShuttleBenchmarkClip[] {
  return clips.filter((c) => c.category === category);
}

export function filterShuttleClipsByDifficulty(
  clips: ShuttleBenchmarkClip[],
  tag: ShuttleDifficultTag
): ShuttleBenchmarkClip[] {
  return clips.filter(
    (c) =>
      c.difficultyTags.includes(tag) ||
      c.knownDifficultSegments.some((seg) => seg.tags.includes(tag))
  );
}
