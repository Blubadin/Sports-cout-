import { describe, it, expect } from 'vitest';
import {
  CANONICAL_BADMINTON_STROKES,
  calculateDetectionMetrics,
  calculateCourtPositionErrors,
  validateMovementLimits,
  calculateTrackingMetrics,
  calculateSkillClassificationMetrics,
  type CanonicalBadmintonStroke,
  type CourtPoint2D,
  type DetectionSample,
  type PositionSampleComparison,
} from '../../utils/aiQualityBenchmark';

describe('Phase 15: AI Quality Benchmark Suite (§100 - §102)', () => {
  describe('§100 Detection Precision / Recall / F1', () => {
    it('calculates precision, recall, and f1 score accurately for balanced samples', () => {
      const samples: DetectionSample[] = [
        { groundTruthPresent: true, predictionPresent: true, matched: true }, // TP
        { groundTruthPresent: true, predictionPresent: true, matched: true }, // TP
        { groundTruthPresent: false, predictionPresent: true, matched: false }, // FP
        { groundTruthPresent: true, predictionPresent: false, matched: false }, // FN
      ];

      const metrics = calculateDetectionMetrics(samples);
      expect(metrics.truePositives).toBe(2);
      expect(metrics.falsePositives).toBe(1);
      expect(metrics.falseNegatives).toBe(1);

      // Precision: 2 / (2 + 1) = 0.6667
      expect(metrics.precision).toBeCloseTo(2 / 3, 4);
      // Recall: 2 / (2 + 1) = 0.6667
      expect(metrics.recall).toBeCloseTo(2 / 3, 4);
      // F1: 2 * (2/3 * 2/3) / (2/3 + 2/3) = 0.6667
      expect(metrics.f1Score).toBeCloseTo(2 / 3, 4);
    });

    it('handles zero detections and zero ground truths without NaN or crash', () => {
      const emptyMetrics = calculateDetectionMetrics([]);
      expect(emptyMetrics.precision).toBe(0);
      expect(emptyMetrics.recall).toBe(0);
      expect(emptyMetrics.f1Score).toBe(0);

      const allFalseNegatives: DetectionSample[] = [
        { groundTruthPresent: true, predictionPresent: false, matched: false },
      ];
      const fnMetrics = calculateDetectionMetrics(allFalseNegatives);
      expect(fnMetrics.precision).toBe(0);
      expect(fnMetrics.recall).toBe(0);
      expect(fnMetrics.f1Score).toBe(0);
    });
  });

  describe('§100 & §101 Court Position MAE & Movement Validation', () => {
    it('calculates Court Position MAE, RMSE, and Max Error in meters correctly', () => {
      const comparisons: PositionSampleComparison[] = [
        // Error: sqrt(0.3^2 + 0.4^2) = 0.50m
        {
          timestamp: 0.0,
          groundTruth: { x: 3.0, y: 6.0 },
          predicted: { x: 3.3, y: 6.4 },
        },
        // Error: sqrt(0.0^2 + 0.2^2) = 0.20m
        {
          timestamp: 0.1,
          groundTruth: { x: 3.0, y: 6.0 },
          predicted: { x: 3.0, y: 6.2 },
        },
        // Lost frame (null prediction) -> ignored in spatial error calculation
        {
          timestamp: 0.2,
          groundTruth: { x: 3.0, y: 6.0 },
          predicted: null,
        },
      ];

      const errors = calculateCourtPositionErrors(comparisons);
      expect(errors.evaluatedCount).toBe(2);
      expect(errors.mae).toBeCloseTo((0.5 + 0.2) / 2, 4); // 0.35m
      expect(errors.rmse).toBeCloseTo(Math.sqrt((0.25 + 0.04) / 2), 4); // sqrt(0.145) = 0.3808m
      expect(errors.maxError).toBeCloseTo(0.5, 4);
    });

    it('validates realistic human movement limits and detects speed & teleportation anomalies', () => {
      // Normal realistic movement: moving 0.2m in 0.1s -> 2.0 m/s
      const normalMovement: Array<{ timestamp: number; position: CourtPoint2D }> = [
        { timestamp: 0.0, position: { x: 3.05, y: 4.0 } },
        { timestamp: 0.1, position: { x: 3.05, y: 4.2 } },
        { timestamp: 0.2, position: { x: 3.05, y: 4.4 } },
      ];

      const normalRes = validateMovementLimits(normalMovement);
      expect(normalRes.isValid).toBe(true);
      expect(normalRes.speedAnomalies).toBe(0);
      expect(normalRes.boundsAnomalies).toBe(0);

      // Unrealistic teleportation: moving 3.0m in 0.05s -> 60.0 m/s (exceeds 10 m/s limit)
      const teleportMovement: Array<{ timestamp: number; position: CourtPoint2D }> = [
        { timestamp: 0.0, position: { x: 3.05, y: 4.0 } },
        { timestamp: 0.05, position: { x: 3.05, y: 7.0 } }, // +3m in 50ms
      ];

      const teleportRes = validateMovementLimits(teleportMovement);
      expect(teleportRes.isValid).toBe(false);
      expect(teleportRes.speedAnomalies).toBe(1);

      // Out of bounds position (outside 6.10m x 13.40m court)
      const outOfBounds: Array<{ timestamp: number; position: CourtPoint2D }> = [
        { timestamp: 0.0, position: { x: 8.5, y: 15.0 } },
      ];

      const oobRes = validateMovementLimits(outOfBounds);
      expect(oobRes.isValid).toBe(false);
      expect(oobRes.boundsAnomalies).toBe(1);
    });
  });

  describe('§100 Tracking Metrics (Coverage, ID Switches, Track Fragmentation)', () => {
    it('computes coverage percentage, id switches, and fragmentation count across frames', () => {
      const gt = [
        { frameIndex: 0, timestamp: 0.0, truePlayerId: 1, courtPosition: { x: 3.0, y: 2.0 } },
        { frameIndex: 1, timestamp: 0.04, truePlayerId: 1, courtPosition: { x: 3.0, y: 2.05 } },
        { frameIndex: 2, timestamp: 0.08, truePlayerId: 1, courtPosition: { x: 3.0, y: 2.10 } },
        { frameIndex: 3, timestamp: 0.12, truePlayerId: 1, courtPosition: { x: 3.0, y: 2.15 } },
        { frameIndex: 4, timestamp: 0.16, truePlayerId: 1, courtPosition: { x: 3.0, y: 2.20 } },
      ];

      const predicted = [
        { frameIndex: 0, timestamp: 0.0, predictedPlayerId: 1, courtPosition: { x: 3.02, y: 2.01 } },
        // frameIndex 1 was lost (predictedPlayerId: null) -> causes fragmentation when frame 2 recovers
        { frameIndex: 1, timestamp: 0.04, predictedPlayerId: null, courtPosition: null },
        // frameIndex 2 recovers with ID switch (assigned ID 2 instead of 1)
        { frameIndex: 2, timestamp: 0.08, predictedPlayerId: 2, courtPosition: { x: 3.01, y: 2.09 } },
        { frameIndex: 3, timestamp: 0.12, predictedPlayerId: 2, courtPosition: { x: 3.00, y: 2.14 } },
        { frameIndex: 4, timestamp: 0.16, predictedPlayerId: 2, courtPosition: { x: 3.01, y: 2.21 } },
      ];

      const metrics = calculateTrackingMetrics(gt, predicted);
      expect(metrics.totalFrames).toBe(5);
      expect(metrics.trackedFrames).toBe(4);
      expect(metrics.coveragePercentage).toBe((4 / 5) * 100); // 80%
      expect(metrics.idSwitches).toBe(1); // Switched from 1 to 2 at frame 2
      expect(metrics.trackFragmentation).toBe(1); // Dropped at frame 1, recovered at frame 2
      expect(metrics.positionMAE).toBeGreaterThan(0);
      expect(metrics.positionMAE).toBeLessThan(0.05); // Very close tracking (<5cm error)
    });
  });

  describe('§101 Multi-Clip Ground Truth Benchmark Simulation', () => {
    it('evaluates multiple rally clips and computes aggregate MAE and tracking quality', () => {
      const clips = [
        {
          name: 'clip-1-baseline-clear',
          pairs: [
            { timestamp: 1.0, groundTruth: { x: 2.0, y: 3.0 }, predicted: { x: 2.05, y: 3.05 } },
            { timestamp: 1.5, groundTruth: { x: 2.5, y: 4.0 }, predicted: { x: 2.48, y: 4.02 } },
          ],
        },
        {
          name: 'clip-2-net-drop-recovery',
          pairs: [
            { timestamp: 5.0, groundTruth: { x: 1.5, y: 6.0 }, predicted: { x: 1.55, y: 6.08 } },
            { timestamp: 5.5, groundTruth: { x: 3.0, y: 5.0 }, predicted: { x: 3.02, y: 4.96 } },
          ],
        },
        {
          name: 'clip-3-smash-attack',
          pairs: [
            { timestamp: 10.0, groundTruth: { x: 4.5, y: 2.5 }, predicted: { x: 4.45, y: 2.52 } },
            { timestamp: 10.5, groundTruth: { x: 3.2, y: 4.8 }, predicted: { x: 3.22, y: 4.79 } },
          ],
        },
      ];

      const allPairs = clips.flatMap(c => c.pairs);
      const errors = calculateCourtPositionErrors(allPairs);

      expect(errors.evaluatedCount).toBe(6);
      expect(errors.mae).toBeLessThan(0.12); // Under 12cm MAE across all 3 clips
      expect(errors.maxError).toBeLessThan(0.15); // Under 15cm max deviation
    });
  });

  describe('§102 Skill Classification Benchmark (Precision, Recall, F1, Confusion Matrix)', () => {
    it('contains all 7 canonical badminton strokes in specification', () => {
      expect(CANONICAL_BADMINTON_STROKES).toEqual([
        'SMH',
        'CLR',
        'DRP',
        'DRV',
        'NET',
        'LFT',
        'SER',
      ]);
    });

    it('computes 7x7 confusion matrix, per-class metrics, and macro F1 accurately', () => {
      const predictions: Array<{ groundTruth: CanonicalBadmintonStroke; predicted: CanonicalBadmintonStroke }> = [
        // SMH (Smash): 3 TP, 1 confused with CLR
        { groundTruth: 'SMH', predicted: 'SMH' },
        { groundTruth: 'SMH', predicted: 'SMH' },
        { groundTruth: 'SMH', predicted: 'SMH' },
        { groundTruth: 'SMH', predicted: 'CLR' },

        // CLR (Clear): 2 TP
        { groundTruth: 'CLR', predicted: 'CLR' },
        { groundTruth: 'CLR', predicted: 'CLR' },

        // DRP (Drop): 2 TP, 1 confused with NET
        { groundTruth: 'DRP', predicted: 'DRP' },
        { groundTruth: 'DRP', predicted: 'DRP' },
        { groundTruth: 'DRP', predicted: 'NET' },

        // DRV (Drive): 1 TP
        { groundTruth: 'DRV', predicted: 'DRV' },

        // NET (Net shot): 2 TP
        { groundTruth: 'NET', predicted: 'NET' },
        { groundTruth: 'NET', predicted: 'NET' },

        // LFT (Lift): 1 TP
        { groundTruth: 'LFT', predicted: 'LFT' },

        // SER (Serve): 2 TP
        { groundTruth: 'SER', predicted: 'SER' },
        { groundTruth: 'SER', predicted: 'SER' },
      ];

      const result = calculateSkillClassificationMetrics(predictions);

      // Confusion Matrix Verification
      expect(result.confusionMatrix['SMH']['SMH']).toBe(3);
      expect(result.confusionMatrix['SMH']['CLR']).toBe(1);
      expect(result.confusionMatrix['DRP']['NET']).toBe(1);
      expect(result.confusionMatrix['NET']['NET']).toBe(2);

      // Overall accuracy: 13 correct out of 15 samples = 13 / 15
      expect(result.accuracy).toBeCloseTo(13 / 15, 4);

      // SMH per-class metrics
      // TP=3, FN=1 (predicted as CLR), FP=0
      const smh = result.classes['SMH'];
      expect(smh.truePositives).toBe(3);
      expect(smh.falseNegatives).toBe(1);
      expect(smh.falsePositives).toBe(0);
      expect(smh.precision).toBe(1.0);
      expect(smh.recall).toBe(0.75);
      expect(smh.f1Score).toBeCloseTo((2 * 1.0 * 0.75) / (1.0 + 0.75), 4); // 0.8571

      // CLR per-class metrics
      // TP=2, FN=0, FP=1 (from SMH misclassified as CLR)
      const clr = result.classes['CLR'];
      expect(clr.truePositives).toBe(2);
      expect(clr.falseNegatives).toBe(0);
      expect(clr.falsePositives).toBe(1);
      expect(clr.precision).toBeCloseTo(2 / 3, 4);
      expect(clr.recall).toBe(1.0);

      // All 7 strokes are present in result classes
      for (const stroke of CANONICAL_BADMINTON_STROKES) {
        expect(result.classes[stroke]).toBeDefined();
        expect(result.classes[stroke].support).toBeGreaterThan(0);
      }

      // Macro-averaged metrics are valid numbers between 0 and 1
      expect(result.macroPrecision).toBeGreaterThan(0.5);
      expect(result.macroRecall).toBeGreaterThan(0.5);
      expect(result.macroF1).toBeGreaterThan(0.5);
    });
  });
});
