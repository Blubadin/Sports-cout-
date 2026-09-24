import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SHUTTLE_BENCHMARK_MANIFEST,
  INITIAL_SHUTTLE_BENCHMARK_CLIPS,
  validateShuttleBenchmarkClip,
  validateShuttleBenchmarkManifest,
  validateShuttleDifficultSegment,
  validateShuttleGroundTruthFrame,
  createShuttleBenchmarkClip,
  createShuttleGroundTruthFrame,
  getShuttleClipById,
  filterShuttleClipsBySplit,
  filterShuttleClipsByCategory,
  filterShuttleClipsByDifficulty,
  assertImageSpaceShuttleCoordinate,
  rejectDirectCourtHomographyProjection,
} from '../../benchmarks/shuttleBenchmarkManifest';
import type {
  ShuttleBenchmarkClip,
  ShuttleDifficultSegment,
  ShuttleGroundTruthFrame,
} from '../../types/shuttleBenchmark';

describe('Phase 2.0 — Shuttlecock Benchmark & Ground-Truth Protocol', () => {
  // 1. COMPLETE MANIFEST
  describe('1. Complete manifest & standard categories S01–S05', () => {
    it('validates the default bundled manifest containing categories S01 to S05', () => {
      const manifestResult = validateShuttleBenchmarkManifest(DEFAULT_SHUTTLE_BENCHMARK_MANIFEST);
      expect(manifestResult.valid).toBe(true);
      expect(manifestResult.errors).toHaveLength(0);
      expect(DEFAULT_SHUTTLE_BENCHMARK_MANIFEST.clips.length).toBeGreaterThanOrEqual(5);

      const clipIds = DEFAULT_SHUTTLE_BENCHMARK_MANIFEST.clips.map((c) => c.id);
      expect(clipIds).toContain('S01_singles_clear_rally');
      expect(clipIds).toContain('S02_singles_fast_smash');
      expect(clipIds).toContain('S03_doubles_standard');
      expect(clipIds).toContain('S04_doubles_occlusion');
      expect(clipIds).toContain('S05_difficult_broadcast');
    });

    it('validates a complete clip entry with full metadata and ground-truth frames', () => {
      const clip = getShuttleClipById(DEFAULT_SHUTTLE_BENCHMARK_MANIFEST, 'S01_singles_clear_rally');
      expect(clip).toBeDefined();
      if (!clip) return;

      const clipResult = validateShuttleBenchmarkClip(clip);
      expect(clipResult.valid).toBe(true);
      expect(clipResult.errors).toHaveLength(0);
      expect(clip.category).toBe('S01');
      expect(clip.split).toBe('development');
      expect(clip.groundTruthAvailable).toBe(true);
      expect(clip.groundTruthFrames).toBeDefined();
      expect(clip.groundTruthFrames!.length).toBeGreaterThan(0);
    });
  });

  // 2. MISSING OPTIONAL METADATA
  describe('2. Missing optional metadata', () => {
    it('allows optional metadata fields to be null without fabricating defaults or failing validation', () => {
      const minimalClip: ShuttleBenchmarkClip = {
        id: 'S99_minimal_clip',
        name: 'Minimal Clip',
        category: 'S01',
        sport: 'badminton',
        gameType: 'singles',
        split: 'development',
        playerCount: 2,
        videoReference: null,
        durationSec: null,
        sourceWidth: null,
        sourceHeight: null,
        sourceFps: null,
        cameraType: 'static_rear',
        cameraMotion: 'static',
        difficultyTags: ['baseline'],
        groundTruthAvailable: false,
        knownDifficultSegments: [],
        groundTruthFrames: null,
      };

      const result = validateShuttleBenchmarkClip(minimalClip);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(minimalClip.durationSec).toBeNull();
      expect(minimalClip.sourceWidth).toBeNull();
      expect(minimalClip.videoReference).toBeNull();
    });

    it('rejects invalid or non-finite optional values when provided', () => {
      const invalidClip = createShuttleBenchmarkClip({
        id: 'S99_invalid_duration',
        name: 'Invalid Duration',
        category: 'S01',
        gameType: 'singles',
        split: 'development',
        durationSec: -5.0,
      });

      const result = validateShuttleBenchmarkClip(invalidClip);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('durationSec'))).toBe(true);
    });
  });

  // 3. VISIBLE SHUTTLE WITH COORDINATE
  describe('3. Visible shuttle with coordinate', () => {
    it('validates a visible shuttle frame with valid pixel coordinates', () => {
      const frame: ShuttleGroundTruthFrame = {
        frameIndex: 12,
        timestampSec: 0.4,
        visibility: 'visible',
        xPx: 960.5,
        yPx: 540.0,
        xNormalized: 0.50026,
        yNormalized: 0.5,
        annotationSource: 'manual',
        reviewed: true,
      };

      const result = validateShuttleGroundTruthFrame(frame, { imageWidth: 1920, imageHeight: 1080 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(() => assertImageSpaceShuttleCoordinate(frame)).not.toThrow();
    });

    it('rejects a visible shuttle frame when xPx or yPx is null', () => {
      const frameWithMissingX = createShuttleGroundTruthFrame({
        frameIndex: 10,
        timestampSec: 0.333,
        visibility: 'visible',
        xPx: null,
        yPx: 540.0,
      });

      const result = validateShuttleGroundTruthFrame(frameWithMissingX);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('xPx'))).toBe(true);
      expect(() => assertImageSpaceShuttleCoordinate(frameWithMissingX)).toThrow();
    });

    it('rejects a visible shuttle when coordinate exceeds source dimensions', () => {
      const frameOutOfBound = createShuttleGroundTruthFrame({
        frameIndex: 15,
        timestampSec: 0.5,
        visibility: 'visible',
        xPx: 2000.0,
        yPx: 540.0,
      });

      const result = validateShuttleGroundTruthFrame(frameOutOfBound, { imageWidth: 1920, imageHeight: 1080 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds source width'))).toBe(true);
    });
  });

  // 4. INVISIBLE SHUTTLE WITHOUT COORDINATE
  describe('4. Invisible shuttle without coordinate', () => {
    it('accepts not_visible shuttle when coordinates are null', () => {
      const invisibleFrame: ShuttleGroundTruthFrame = {
        frameIndex: 45,
        timestampSec: 1.5,
        visibility: 'not_visible',
        xPx: null,
        yPx: null,
        annotationSource: 'manual',
        reviewed: true,
      };

      const result = validateShuttleGroundTruthFrame(invisibleFrame);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // 5. NO FAKE ZERO COORDINATE RULE
  describe('5. No fake zero coordinate rule', () => {
    it('strictly rejects not_visible shuttle with fake zero coordinates (0, 0)', () => {
      const fakeZeroFrame: ShuttleGroundTruthFrame = {
        frameIndex: 46,
        timestampSec: 1.533,
        visibility: 'not_visible',
        xPx: 0,
        yPx: 0,
      };

      const result = validateShuttleGroundTruthFrame(fakeZeroFrame);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('fake zero (0, 0)'))).toBe(true);
    });

    it('strictly rejects unknown shuttle with fake zero coordinates (0, 0)', () => {
      const fakeZeroUnknown: ShuttleGroundTruthFrame = {
        frameIndex: 47,
        timestampSec: 1.566,
        visibility: 'unknown',
        xPx: 0,
        yPx: 0,
      };

      const result = validateShuttleGroundTruthFrame(fakeZeroUnknown);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('fake zero (0, 0)'))).toBe(true);
    });

    it('rejects not_visible shuttle with any arbitrary non-null coordinate', () => {
      const nonNullCoordFrame: ShuttleGroundTruthFrame = {
        frameIndex: 48,
        timestampSec: 1.6,
        visibility: 'not_visible',
        xPx: 100.0,
        yPx: 200.0,
      };

      const result = validateShuttleGroundTruthFrame(nonNullCoordFrame);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('null or undefined'))).toBe(true);
    });
  });

  // 6. UNKNOWN STATE
  describe('6. Unknown state handling', () => {
    it('accepts unknown visibility when coordinates remain null', () => {
      const unknownFrame: ShuttleGroundTruthFrame = {
        frameIndex: 70,
        timestampSec: 2.333,
        visibility: 'unknown',
        xPx: null,
        yPx: null,
        notes: 'Motion blur blend with line markings',
      };

      const result = validateShuttleGroundTruthFrame(unknownFrame);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects unknown visibility when coordinates are specified', () => {
      const unknownWithCoord: ShuttleGroundTruthFrame = {
        frameIndex: 71,
        timestampSec: 2.366,
        visibility: 'unknown',
        xPx: 500,
        yPx: 300,
      };

      const result = validateShuttleGroundTruthFrame(unknownWithCoord);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('null or undefined'))).toBe(true);
    });
  });

  // 7. OCCLUDED STATE
  describe('7. Occluded state handling', () => {
    it('allows occluded frame with estimated coordinates', () => {
      const occludedWithEstimate: ShuttleGroundTruthFrame = {
        frameIndex: 80,
        timestampSec: 2.666,
        visibility: 'occluded',
        xPx: 820.0,
        yPx: 410.0,
        annotationSource: 'semi_automatic',
        reviewed: true,
        notes: 'Interpolated behind receiver body',
      };

      const result = validateShuttleGroundTruthFrame(occludedWithEstimate);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('allows occluded frame with null coordinates when unestimated', () => {
      const occludedWithoutEstimate: ShuttleGroundTruthFrame = {
        frameIndex: 81,
        timestampSec: 2.7,
        visibility: 'occluded',
        xPx: null,
        yPx: null,
        annotationSource: 'manual',
        reviewed: true,
      };

      const result = validateShuttleGroundTruthFrame(occludedWithoutEstimate);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects occluded frame when only one coordinate is provided', () => {
      const occludedPartial: ShuttleGroundTruthFrame = {
        frameIndex: 82,
        timestampSec: 2.733,
        visibility: 'occluded',
        xPx: 820.0,
        yPx: null,
      };

      const result = validateShuttleGroundTruthFrame(occludedPartial);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('specify both xPx and yPx'))).toBe(true);
    });
  });

  // 8. DIFFICULT SEGMENTS
  describe('8. Difficult segments', () => {
    it('validates difficult segments with recognized tags', () => {
      const segment: ShuttleDifficultSegment = {
        startSec: 5.0,
        endSec: 7.2,
        tags: ['smash', 'motion_blur', 'lost_reacquisition'],
        description: 'Steep smash exchange',
      };

      const result = validateShuttleDifficultSegment(segment);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects difficult segments with endSec earlier than startSec', () => {
      const invalidSegment = {
        startSec: 8.0,
        endSec: 6.0,
        tags: ['net_occlusion'],
      };

      const result = validateShuttleDifficultSegment(invalidSegment);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('endSec must be greater than or equal to startSec'))).toBe(true);
    });

    it('filters clips by difficult tags accurately', () => {
      const smashClips = filterShuttleClipsByDifficulty(INITIAL_SHUTTLE_BENCHMARK_CLIPS, 'smash');
      expect(smashClips.length).toBeGreaterThan(0);
      expect(smashClips.some((c) => c.id === 'S02_singles_fast_smash')).toBe(true);

      const netOcclusionClips = filterShuttleClipsByDifficulty(INITIAL_SHUTTLE_BENCHMARK_CLIPS, 'net_occlusion');
      expect(netOcclusionClips.some((c) => c.id === 'S01_singles_clear_rally')).toBe(true);
      expect(netOcclusionClips.some((c) => c.id === 'S04_doubles_occlusion')).toBe(true);
    });
  });

  // 9. LOCAL VIDEO PATH DOES NOT REQUIRE GIT ASSET
  describe('9. Local video path does not require Git asset', () => {
    it('validates logical video reference without demanding physical file on disk', () => {
      const clip = createShuttleBenchmarkClip({
        id: 'S01_test_path',
        name: 'Test Path',
        category: 'S01',
        gameType: 'singles',
        split: 'development',
        videoReference: 'benchmarks/videos/shuttle/non_existent_local_clip.mp4',
      });

      const result = validateShuttleBenchmarkClip(clip);
      expect(result.valid).toBe(true);
      expect(clip.videoReference).toBe('benchmarks/videos/shuttle/non_existent_local_clip.mp4');
    });
  });

  // 10. DATASET SPLITS
  describe('10. Dataset splits', () => {
    it('correctly partitions clips across development, validation, and test sets', () => {
      const devClips = filterShuttleClipsBySplit(INITIAL_SHUTTLE_BENCHMARK_CLIPS, 'development');
      const valClips = filterShuttleClipsBySplit(INITIAL_SHUTTLE_BENCHMARK_CLIPS, 'validation');
      const testClips = filterShuttleClipsBySplit(INITIAL_SHUTTLE_BENCHMARK_CLIPS, 'test');

      expect(devClips.length).toBeGreaterThan(0);
      expect(valClips.length).toBeGreaterThan(0);
      expect(testClips.length).toBeGreaterThan(0);

      expect(devClips.map((c) => c.id)).toContain('S01_singles_clear_rally');
      expect(valClips.map((c) => c.id)).toContain('S03_doubles_standard');
      expect(testClips.map((c) => c.id)).toContain('S04_doubles_occlusion');
      expect(testClips.map((c) => c.id)).toContain('S05_difficult_broadcast');
    });

    it('rejects an invalid split name', () => {
      const invalidSplitClip = createShuttleBenchmarkClip({
        id: 'S99_invalid_split',
        name: 'Invalid Split Clip',
        category: 'S01',
        gameType: 'singles',
        split: 'unsupported_split' as any,
      });

      const result = validateShuttleBenchmarkClip(invalidSplitClip);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('split must be one of'))).toBe(true);
    });
  });

  // 11. ANNOTATION PROVENANCE & REVIEW VERIFICATION
  describe('11. Annotation provenance & review verification', () => {
    it('supports manual, semi_automatic, and model_assisted annotation sources', () => {
      for (const source of ['manual', 'semi_automatic', 'model_assisted'] as const) {
        const frame = createShuttleGroundTruthFrame({
          frameIndex: 1,
          timestampSec: 0.033,
          visibility: 'visible',
          xPx: 500,
          yPx: 200,
          annotationSource: source,
          reviewed: true,
        });
        const result = validateShuttleGroundTruthFrame(frame);
        expect(result.valid).toBe(true);
      }
    });

    it('rejects an unsupported annotation source', () => {
      const frame = createShuttleGroundTruthFrame({
        frameIndex: 1,
        timestampSec: 0.033,
        visibility: 'visible',
        xPx: 500,
        yPx: 200,
        annotationSource: 'crowdsourced_random' as any,
      });
      const result = validateShuttleGroundTruthFrame(frame);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('annotationSource'))).toBe(true);
    });
  });

  describe('11b. Duplicate ground-truth keys', () => {
    it('rejects duplicate frameIndex entries instead of collapsing them', () => {
      const clip = createShuttleBenchmarkClip({
        id: 'S99_duplicate_gt',
        name: 'Duplicate GT',
        category: 'S01',
        gameType: 'singles',
        split: 'development',
        groundTruthAvailable: true,
        groundTruthFrames: [
          { frameIndex: 4, timestampSec: 0.1, visibility: 'visible', xPx: 10, yPx: 10 },
          { frameIndex: 4, timestampSec: 0.2, visibility: 'visible', xPx: 11, yPx: 11 },
        ],
      });

      const result = validateShuttleBenchmarkClip(clip);

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.includes('duplicate groundTruthFrames frameIndex: 4'))).toBe(true);
    });
  });

  // 12. GEOMETRY INVARIANT: DIRECT COURT HOMOGRAPHY PROHIBITION
  describe('12. Geometry invariant: Direct court homography prohibition', () => {
    it('throws explicit error when direct court homography projection is attempted on airborne shuttle', () => {
      expect(() => {
        rejectDirectCourtHomographyProjection();
      }).toThrow(/Direct court homography projection forbidden for shuttlecock tracking/i);
    });
  });
});
