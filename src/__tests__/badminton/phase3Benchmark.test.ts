import { describe, it, expect } from 'vitest';
import type { BenchmarkClipEntry, Phase3BenchmarkReport } from '../../types/benchmark';
import {
  evaluateCameraCuts,
  formatPhase3ReportSummary,
  partitionClipsByGroup,
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
});
