import { describe, it, expect } from 'vitest';
import type { BenchmarkClipEntry, Phase3BenchmarkReport } from '../../types/benchmark';
import {
  evaluateCameraCuts,
  formatPhase3ReportSummary,
  partitionClipsByGroup,
  sanitizePathReference,
  validateSplitLeakage,
} from '../../utils/phase3Benchmark';


describe('Phase 3.4 Court, Position & Identity Benchmark Quality Gates', () => {
  const makeClip = (id: string, overrides: Partial<BenchmarkClipEntry> = {}): BenchmarkClipEntry => ({
    id,
    name: `Clip ${id}`,
    sport: 'badminton',
    gameType: 'singles',
    playerCount: 2,
    videoReference: `videos/${id}.mp4`,
    durationSec: 10.0,
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceFps: 30.0,
    cameraType: 'static_rear',
    cameraMotion: 'static',
    difficultyTags: ['baseline'],
    groundTruthAvailable: true,
    knownDifficultSegments: [],
    ...overrides,
  });

  describe('Split Safety & Leakage Guard', () => {
    it('detects adjacent-frame and session leakage when same recordingGroup is in train and test', () => {
      const c1 = makeClip('c1', { recordingGroup: 'session_tournament_01' });
      const c2 = makeClip('c2', { recordingGroup: 'session_tournament_01' });

      const splits = { train: [c1], test: [c2] };
      const { valid, errors } = validateSplitLeakage(splits);
      expect(valid).toBe(false);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Data leakage detected');
    });

    it('passes validation when splits are strictly partitioned by venue and recording group', () => {
      const c1 = makeClip('c1', { venueId: 'venue_A', recordingGroup: 'session_A' });
      const c2 = makeClip('c2', { venueId: 'venue_B', recordingGroup: 'session_B' });

      const splits = { train: [c1], test: [c2] };
      const { valid, errors } = validateSplitLeakage(splits);
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('partitions clips safely by group key', () => {
      const clips = [
        makeClip('c1', { venueId: 'hall_1' }),
        makeClip('c2', { venueId: 'hall_1' }),
        makeClip('c3', { venueId: 'hall_2' }),
      ];
      const grouped = partitionClipsByGroup(clips, 'venueId');
      expect(grouped['hall_1']).toHaveLength(2);
      expect(grouped['hall_2']).toHaveLength(1);
    });
  });

  describe('Camera Cut Evaluation', () => {
    it('calculates precision, recall, and F1 accurately for exact cut matches', () => {
      const gt = [2.0, 5.0, 9.0];
      const preds = [2.02, 4.98, 9.01];
      const res = evaluateCameraCuts(gt, preds, 0.2);
      expect(res.status).toBe('MEASURED');
      expect(res.tpCuts).toBe(3);
      expect(res.fpCuts).toBe(0);
      expect(res.fnCuts).toBe(0);
      expect(res.duplicateCutCount).toBe(0);
      expect(res.precision).toBe(1.0);
      expect(res.recall).toBe(1.0);
      expect(res.f1).toBe(1.0);
      expect(res.meanDetectionLatencySec).toBeLessThan(0.05);
    });

    it('suppresses duplicate detections from inflating TP', () => {
      const gt = [4.0];
      // Two detections in the same 4.0s cut window, plus one outside
      const preds = [4.05, 4.15, 11.0];
      const res = evaluateCameraCuts(gt, preds, 0.3);
      expect(res.status).toBe('MEASURED');
      expect(res.tpCuts).toBe(1); // Not 2!
      expect(res.duplicateCutCount).toBe(1);
      expect(res.fpCuts).toBe(1);
      expect(res.fnCuts).toBe(0);
      expect(res.precision).toBe(0.5);
    });

    it('handles measured zero false cuts when GT is empty and predictions are empty', () => {
      const res = evaluateCameraCuts([], []);
      expect(res.status).toBe('MEASURED');
      expect(res.tpCuts).toBe(0);
      expect(res.fpCuts).toBe(0);
      expect(res.fnCuts).toBe(0);
      expect(res.precision).toBe(1.0);
      expect(res.recall).toBe(1.0);
      expect(res.f1).toBe(1.0);
    });

    it('returns UNAVAILABLE when GT is missing (never fake zeros)', () => {
      const res = evaluateCameraCuts(null, [2.0]);
      expect(res.status).toBe('UNAVAILABLE');
      expect(res.statusReason).toContain('not available');
      expect(res.precision).toBeUndefined();
      expect(res.recall).toBeUndefined();
      expect(res.f1).toBeUndefined();
    });
  });

  describe('Report Formatting', () => {
    it('clearly separates MEASURED, UNAVAILABLE, and FAILED_VALIDATION sections', () => {
      const report: Phase3BenchmarkReport = {
        provenance: {
          manifestVersion: 1,
          datasetId: 'badminton_finals',
          clipId: 'B01_singles',
          engineVersion: '1.0.0',
          detectorModel: 'yolov8n.pt',
          trackerModel: 'bytetrack',
        },
        cameraCuts: {
          status: 'MEASURED',
          tpCuts: 2,
          fpCuts: 0,
          fnCuts: 0,
          duplicateCutCount: 0,
          precision: 1.0,
          recall: 1.0,
          f1: 1.0,
        },
        calibration: {
          status: 'UNAVAILABLE',
          statusReason: 'Court calibration ground truth not available',
        },
        groundPosition: {
          status: 'UNAVAILABLE',
          statusReason: 'Ground position ground truth not available',
        },
        identity: {
          status: 'MEASURED',
          idSwitchCount: 0,
          idSwitchesPer10Min: 0.0,
          idf1: 0.98,
          hotaStatus: 'UNAVAILABLE',
          hotaReason: 'insufficient implementation/GT',
          hota: null,
        },
      };

      const summary = formatPhase3ReportSummary(report);
      expect(summary).toContain('=== PHASE 3.4 BENCHMARK REPORT ===');
      expect(summary).toContain('--- MEASURED METRICS ---');
      expect(summary).toContain('[Camera Cuts] Precision: 1.000 | Recall: 1.000');
      expect(summary).toContain('--- UNAVAILABLE METRICS ---');
      expect(summary).toContain('[Calibration] UNAVAILABLE');
      expect(summary).toContain('[HOTA] UNAVAILABLE: insufficient implementation/GT');
      expect(summary).toContain('--- FAILED VALIDATION ---');
      expect(summary).toContain('(None)');
      // Verify unavailable is not printed as 0 or 0%
      expect(summary).not.toContain('[Calibration] Reprojection Err Mean: 0');
    });
  });

  describe('Path Reference Sanitization', () => {
    it('sanitizes Windows drive paths, UNC paths, Unix paths, and parent traversals', () => {
      expect(sanitizePathReference('C:\\Users\\SecretUser\\models\\custom_yolo.engine')).toBe('custom_yolo.engine');
      expect(sanitizePathReference('D:/datasets/badminton/videos/B01.mp4')).toBe('B01.mp4');
      expect(sanitizePathReference('\\\\server\\share\\videos\\match.mp4')).toBe('match.mp4');
      expect(sanitizePathReference('//nas.local/datasets/clip.mp4')).toBe('clip.mp4');
      expect(sanitizePathReference('/home/runner/work/SportsScout/models/weights.pt')).toBe('weights.pt');
      expect(sanitizePathReference('C:\\Users/admin\\test/foo.pt')).toBe('foo.pt');
      expect(sanitizePathReference('../../secret/passwords.txt')).toBe('passwords.txt');
      expect(sanitizePathReference('..\\..\\model.pt')).toBe('model.pt');
      expect(sanitizePathReference('videos/B01_singles_center.mp4')).toBe('videos/B01_singles_center.mp4');
      expect(sanitizePathReference('C:\\Users\\ผู้ฝึกสอน\\Videos\\แบดมินตัน.mp4')).toBe('แบดมินตัน.mp4');
      expect(sanitizePathReference(null)).toBeNull();
      expect(sanitizePathReference('')).toBeNull();
      expect(sanitizePathReference('   ')).toBeNull();
      expect(sanitizePathReference(123)).toBeNull();
    });

    it('sanitizes detector and tracker model references in report summary', () => {
      const report: Phase3BenchmarkReport = {
        provenance: {
          clipId: 'test_clip',
          datasetId: 'badminton_dvc',
          manifestVersion: 1,
          engineVersion: '1.0.0',
          detectorModel: 'C:\\Users\\PrivateDev\\weights\\custom_yolo.pt',
          trackerModel: '/opt/models/bytetrack.yaml',
        },
        cameraCuts: { status: 'UNAVAILABLE' },
        calibration: { status: 'UNAVAILABLE' },
        groundPosition: { status: 'UNAVAILABLE' },
        identity: {
          status: 'UNAVAILABLE',
          hotaStatus: 'UNAVAILABLE',
          hotaReason: 'No ground truth',
          hota: null,
        },
      };

      const summary = formatPhase3ReportSummary(report);
      expect(summary).toContain('Detector: custom_yolo.pt');
      expect(summary).toContain('Tracker: bytetrack.yaml');
      expect(summary).not.toContain('PrivateDev');
      expect(summary).not.toContain('/opt/models');
    });

    it('detects matchId leakage across splits', () => {
      const c1 = makeClip('c1', { matchId: 'olympics_match_01' });
      const c2 = makeClip('c2', { matchId: 'olympics_match_01' });

      const splits = { train: [c1], val: [c2] };
      const { valid, errors } = validateSplitLeakage(splits);
      expect(valid).toBe(false);
      expect(errors[0]).toContain("matchId='olympics_match_01'");
    });

    it('formats scenario breakdown and annotation blockers in report summary', () => {
      const report: Phase3BenchmarkReport = {
        provenance: {
          clipId: 'test_clip',
          datasetId: 'badminton_dvc',
          manifestVersion: 1,
          engineVersion: '1.0.0',
        },
        cameraCuts: { status: 'UNAVAILABLE' },
        calibration: { status: 'UNAVAILABLE' },
        groundPosition: { status: 'UNAVAILABLE' },
        identity: {
          status: 'UNAVAILABLE',
          hotaStatus: 'UNAVAILABLE',
          hotaReason: 'No ground truth',
          hota: null,
        },
        byScenario: {
          rear_court: {
            bucket: 'rear_court',
            sampleCount: 10,
            passedThresholds: true,
            failureReasons: [],
            humanGtAvailable: true,
            annotationBlocker: false,
          },
          doubles_crossing: {
            bucket: 'doubles_crossing',
            sampleCount: 3,
            passedThresholds: false,
            failureReasons: ['ID switches / 10m 4.5 > threshold 2.0'],
            humanGtAvailable: true,
            annotationBlocker: false,
          },
        },
        annotationManifestBlockers: [
          "Clip 'test_clip' missing human ground truth annotations",
        ],
        overallPassed: false,
      };

      const summary = formatPhase3ReportSummary(report);
      expect(summary).toContain('Overall Status: FAILED / BLOCKED');
      expect(summary).toContain('--- SCENARIO BREAKDOWN ---');
      expect(summary).toContain('[rear_court] Status: PASSED');
      expect(summary).toContain('[doubles_crossing] Status: FAILED');
      expect(summary).toContain('ID switches / 10m 4.5 > threshold 2.0');
      expect(summary).toContain('--- ANNOTATION MANIFEST BLOCKERS ---');
      expect(summary).toContain("[BLOCKER] Clip 'test_clip' missing human ground truth annotations");
    });
  });
});


