/**
 * SportsScout Vision Benchmark Manifest (Phase 1.0)
 *
 * Defines the standardized reference manifest for tracking and vision experiments.
 * Clips are referenced by logical identifiers; video binaries are never committed to git.
 *
 * Ground truth is strictly optional:
 * - groundTruthAvailable = false does not fabricate fake zero errors.
 * - Missing values remain null / unavailable.
 */

import type {
  BenchmarkClipEntry,
  BenchmarkDifficultSegment,
  BenchmarkManifest,
} from '../types/benchmark';
import manifestData from './visionBenchmarkManifest.json';

/**
 * Initial reference benchmark categories (B01 - B05).
 */
export const INITIAL_BENCHMARK_CLIPS: BenchmarkClipEntry[] = (manifestData.clips as unknown as BenchmarkClipEntry[]);

/**
 * Default standard benchmark manifest suite.
 */
export const DEFAULT_BENCHMARK_MANIFEST: BenchmarkManifest = {
  schemaVersion: manifestData.schemaVersion,
  manifestId: manifestData.manifestId,
  updatedAt: manifestData.updatedAt,
  description: manifestData.description,
  clips: INITIAL_BENCHMARK_CLIPS,
};

/**
 * Validates a difficult segment entry.
 */
export function validateDifficultSegment(segment: unknown): { valid: boolean; errors: string[] } {
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
  if (!Array.isArray(s.tags) || s.tags.some((t) => typeof t !== 'string')) {
    errors.push('tags must be an array of strings');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a single benchmark clip entry according to Phase 1.0 specifications.
 * Ensures that partial metadata is handled safely and missing fields remain null/undefined.
 */
export function validateBenchmarkClip(clip: unknown): { valid: boolean; errors: string[] } {
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
  if (typeof c.sport !== 'string' || c.sport.trim().length === 0) {
    errors.push('sport must be a non-empty string');
  }
  if (typeof c.gameType !== 'string' || c.gameType.trim().length === 0) {
    errors.push('gameType must be a non-empty string');
  }

  // Target player count
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

  // Ground truth flag
  if (typeof c.groundTruthAvailable !== 'boolean') {
    errors.push('groundTruthAvailable must be a boolean');
  }

  // Optional numerical fields if provided
  if (c.durationSec !== undefined && c.durationSec !== null) {
    if (typeof c.durationSec !== 'number' || !Number.isFinite(c.durationSec) || c.durationSec <= 0) {
      errors.push('durationSec, if provided, must be a positive finite number');
    }
  }
  if (c.sourceWidth !== undefined && c.sourceWidth !== null) {
    if (typeof c.sourceWidth !== 'number' || !Number.isInteger(c.sourceWidth) || c.sourceWidth <= 0) {
      errors.push('sourceWidth, if provided, must be a positive integer');
    }
  }
  if (c.sourceHeight !== undefined && c.sourceHeight !== null) {
    if (typeof c.sourceHeight !== 'number' || !Number.isInteger(c.sourceHeight) || c.sourceHeight <= 0) {
      errors.push('sourceHeight, if provided, must be a positive integer');
    }
  }
  if (c.sourceFps !== undefined && c.sourceFps !== null) {
    if (typeof c.sourceFps !== 'number' || !Number.isFinite(c.sourceFps) || c.sourceFps <= 0) {
      errors.push('sourceFps, if provided, must be a positive finite number');
    }
  }

  // Difficult segments validation
  if (c.knownDifficultSegments !== undefined && c.knownDifficultSegments !== null) {
    if (!Array.isArray(c.knownDifficultSegments)) {
      errors.push('knownDifficultSegments must be an array');
    } else {
      for (let i = 0; i < c.knownDifficultSegments.length; i++) {
        const segRes = validateDifficultSegment(c.knownDifficultSegments[i]);
        if (!segRes.valid) {
          errors.push(`knownDifficultSegments[${i}]: ${segRes.errors.join(', ')}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a benchmark manifest container.
 */
export function validateBenchmarkManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }
  const m = manifest as Record<string, unknown>;

  if (typeof m.schemaVersion !== 'number' || m.schemaVersion < 1) {
    errors.push('schemaVersion must be a positive number');
  }
  if (typeof m.manifestId !== 'string' || m.manifestId.trim().length === 0) {
    errors.push('manifestId must be a non-empty string');
  }
  if (typeof m.updatedAt !== 'string' || m.updatedAt.trim().length === 0) {
    errors.push('updatedAt must be a non-empty string');
  }
  if (!Array.isArray(m.clips)) {
    errors.push('clips must be an array');
  } else {
    const seenIds = new Set<string>();
    for (let i = 0; i < m.clips.length; i++) {
      const clip = m.clips[i];
      const clipRes = validateBenchmarkClip(clip);
      if (!clipRes.valid) {
        errors.push(`clips[${i}]: ${clipRes.errors.join(', ')}`);
      }
      if (clip && typeof clip === 'object' && typeof (clip as { id?: unknown }).id === 'string') {
        const id = (clip as { id: string }).id;
        if (seenIds.has(id)) {
          errors.push(`Duplicate clip id "${id}" found at index ${i}`);
        }
        seenIds.add(id);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Factory to create a validated BenchmarkClipEntry, safely defaulting missing fields to null.
 */
export function createBenchmarkClip(
  params: Partial<BenchmarkClipEntry> & { id: string; name: string }
): BenchmarkClipEntry {
  return {
    id: params.id,
    name: params.name,
    sport: params.sport ?? 'badminton',
    gameType: params.gameType ?? 'singles',
    playerCount: params.playerCount ?? (params.gameType === 'doubles' ? 4 : 2),
    videoReference: params.videoReference ?? null,
    durationSec: params.durationSec && params.durationSec > 0 ? params.durationSec : null,
    sourceWidth: params.sourceWidth && params.sourceWidth > 0 ? params.sourceWidth : null,
    sourceHeight: params.sourceHeight && params.sourceHeight > 0 ? params.sourceHeight : null,
    sourceFps: params.sourceFps && params.sourceFps > 0 ? params.sourceFps : null,
    cameraType: params.cameraType ?? 'static_rear',
    cameraMotion: params.cameraMotion ?? 'static',
    difficultyTags: Array.isArray(params.difficultyTags) ? [...params.difficultyTags] : [],
    courtCalibrationReference: params.courtCalibrationReference ?? null,
    groundTruthAvailable: params.groundTruthAvailable === true,
    notes: params.notes ?? null,
    knownDifficultSegments: Array.isArray(params.knownDifficultSegments)
      ? params.knownDifficultSegments.map((s) => ({
          startSec: s.startSec,
          endSec: s.endSec,
          tags: [...s.tags],
          description: s.description ?? null,
        }))
      : [],
  };
}

/**
 * Factory to construct a BenchmarkManifest suite.
 */
export function createBenchmarkManifest(
  params: Partial<BenchmarkManifest> & { manifestId: string; clips: BenchmarkClipEntry[] }
): BenchmarkManifest {
  return {
    schemaVersion: params.schemaVersion ?? 1,
    manifestId: params.manifestId,
    updatedAt: params.updatedAt ?? new Date().toISOString(),
    description: params.description ?? null,
    clips: [...params.clips],
  };
}

/**
 * Finds a benchmark clip by its unique logical identifier.
 */
export function getBenchmarkClipById(
  manifest: BenchmarkManifest,
  clipId: string
): BenchmarkClipEntry | undefined {
  return manifest.clips.find((c) => c.id === clipId);
}

/**
 * Filters benchmark clips by difficulty tag.
 */
export function filterClipsByDifficulty(
  manifest: BenchmarkManifest,
  tag: string
): BenchmarkClipEntry[] {
  const lowerTag = tag.toLowerCase();
  return manifest.clips.filter((c) =>
    c.difficultyTags.some((t) => t.toLowerCase() === lowerTag)
  );
}

/**
 * Filters benchmark clips by match game type ('singles' | 'doubles').
 */
export function filterClipsByGameType(
  manifest: BenchmarkManifest,
  gameType: string
): BenchmarkClipEntry[] {
  const lowerType = gameType.toLowerCase();
  return manifest.clips.filter((c) => c.gameType.toLowerCase() === lowerType);
}
