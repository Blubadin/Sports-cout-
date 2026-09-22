import { describe, it, expect } from 'vitest';
import {
  alignShuttlePredictionsAndGroundTruth,
  evaluateShuttleTracking,
  formatShuttleBenchmarkReport,
} from '../../utils/shuttleBenchmark';
import type { ShuttleGroundTruthFrame } from '../../types/shuttleBenchmark';
import type { ShuttleObservation } from '../../types/shuttleTelemetry';

describe('Phase 2.6 — Shuttle Quality Benchmark Evaluation', () => {
  // 1. PERFECT PREDICTION
  it('1. perfect prediction: matches GT coordinates with 100% recall and 0 px error', () => {
    const gtFrames: ShuttleGroundTruthFrame[] = Array.from({ length: 10 }, (_, i) => ({
      frameIndex: i,
      timestampSec: i * 0.033,
      visibility: 'visible',
      xPx: 500.0 + i * 10.0,
      yPx: 300.0 + i * 5.0,
    }));

    const predictions: ShuttleObservation[] = Array.from({ length: 10 }, (_, i) => ({
      frameIndex: i,
      timestampSec: i * 0.033,
      state: 'observed',
      source: 'temporal_tracker',
      positionPx: { x: 500.0 + i * 10.0, y: 300.0 + i * 5.0 },
      confidence: 0.95,
      trajectoryId: null,
    }));

    const pairs = alignShuttlePredictionsAndGroundTruth(gtFrames, predictions);
    expect(pairs).toHaveLength(10);

    const metrics = evaluateShuttleTracking(pairs, {
      sourceWidth: 1920,
      sourceHeight: 1080,
      sourceFps: 30.0,
    });

    expect(metrics.datasetStatus).toBe('COMPLETE');
    expect(metrics.visibleFrameRecall).toBe(1.0);
    expect(metrics.precision).toBe(1.0);
    expect(metrics.truePositivesCount).toBe(10);
    expect(metrics.falsePositivesCount).toBe(0);
    expect(metrics.falseNegativesCount).toBe(0);
    expect(metrics.falsePositivesPerMinute).toBe(0.0);
    expect(metrics.meanPixelError).toBeCloseTo(0.0, 4);
    expect(metrics.medianPixelError).toBeCloseTo(0.0, 4);
    expect(metrics.p95PixelError).toBeCloseTo(0.0, 4);
    expect(metrics.meanNormalizedError).toBeCloseTo(0.0, 6);
    expect(metrics.trackContinuity).toBe(1.0);
    expect(metrics.longestContinuousTrackFrames).toBe(10);
    expect(metrics.trackFragmentationCount).toBe(0);
    expect(metrics.lostPercent).toBe(0.0);
    expect(metrics.observedPercent).toBe(100.0);
  });

  // 2. KNOWN PIXEL OFFSET
  it('2. known pixel offset: exactly measures dx=3.0, dy=4.0 -> distance=5.0 pixels', () => {
    const gtFrames: ShuttleGroundTruthFrame[] = Array.from({ length: 5 }, (_, i) => ({
      frameIndex: i,
      timestampSec: i * 0.033,
      visibility: 'visible',
      xPx: 100.0,
      yPx: 100.0,
    }));

    const predictions: ShuttleObservation[] = Array.from({ length: 5 }, (_, i) => ({
      frameIndex: i,
      timestampSec: i * 0.033,
      state: 'observed',
      source: 'temporal_tracker',
      positionPx: { x: 103.0, y: 104.0 },
      confidence: 0.9,
      trajectoryId: null,
    }));

    const pairs = alignShuttlePredictionsAndGroundTruth(gtFrames, predictions);
    const metrics = evaluateShuttleTracking(pairs, {
      sourceWidth: 1920,
      sourceHeight: 1080,
      sourceFps: 30.0,
    });

    expect(metrics.meanPixelError).toBeCloseTo(5.0, 4);
    expect(metrics.medianPixelError).toBeCloseTo(5.0, 4);
    expect(metrics.p95PixelError).toBeCloseTo(5.0, 4);

    const diag = Math.sqrt(1920 * 1920 + 1080 * 1080);
    expect(metrics.meanNormalizedError).toBeCloseTo(5.0 / diag, 6);
  });

  // 3. FALSE POSITIVE
  it('3. false positive: observed point on not_visible GT counts as FP', () => {
    const gtFrames: ShuttleGroundTruthFrame[] = [
      { frameIndex: 0, timestampSec: 0.0, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 1, timestampSec: 0.033, visibility: 'not_visible', xPx: null, yPx: null },
    ];

    const predictions: ShuttleObservation[] = [
      {
        frameIndex: 0,
        timestampSec: 0.0,
        state: 'observed',
        source: 'temporal_tracker',
        positionPx: { x: 100.0, y: 100.0 },
        confidence: 0.9,
        trajectoryId: null,
      },
      {
        frameIndex: 1,
        timestampSec: 0.033,
        state: 'observed',
        source: 'temporal_tracker',
        positionPx: { x: 200.0, y: 200.0 },
        confidence: 0.7,
        trajectoryId: null,
      },
    ];

    const pairs = alignShuttlePredictionsAndGroundTruth(gtFrames, predictions);
    const metrics = evaluateShuttleTracking(pairs, { sourceWidth: 1920, sourceHeight: 1080, sourceFps: 30.0 });

    expect(metrics.truePositivesCount).toBe(1);
    expect(metrics.falsePositivesCount).toBe(1);
    expect(metrics.precision).toBeCloseTo(0.5, 4);
    expect(metrics.falsePositivesPerMinute).toBeGreaterThan(0.0);
  });

  // 4. MISSED VISIBLE SHUTTLE
  it('4. missed visible shuttle: lost state on visible GT counts as false negative', () => {
    const gtFrames: ShuttleGroundTruthFrame[] = Array.from({ length: 4 }, (_, i) => ({
      frameIndex: i,
      timestampSec: i * 0.033,
      visibility: 'visible',
      xPx: 100.0,
      yPx: 100.0,
    }));

    const predictions: ShuttleObservation[] = [
      { frameIndex: 0, timestampSec: 0.0, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 1, timestampSec: 0.033, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 2, timestampSec: 0.066, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 3, timestampSec: 0.099, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
    ];

    const pairs = alignShuttlePredictionsAndGroundTruth(gtFrames, predictions);
    const metrics = evaluateShuttleTracking(pairs);

    expect(metrics.gtVisibleCount).toBe(4);
    expect(metrics.truePositivesCount).toBe(2);
    expect(metrics.falseNegativesCount).toBe(2);
    expect(metrics.visibleFrameRecall).toBeCloseTo(0.5, 4);
  });

  // 5. OCCLUDED GT
  it('5. occluded GT: does not become a false negative for Visible-Frame Recall', () => {
    const gtFrames: ShuttleGroundTruthFrame[] = [
      { frameIndex: 0, timestampSec: 0.0, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 1, timestampSec: 0.033, visibility: 'occluded', xPx: null, yPx: null },
    ];

    const predictions: ShuttleObservation[] = [
      { frameIndex: 0, timestampSec: 0.0, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 1, timestampSec: 0.033, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
    ];

    const pairs = alignShuttlePredictionsAndGroundTruth(gtFrames, predictions);
    const metrics = evaluateShuttleTracking(pairs);

    expect(metrics.gtVisibleCount).toBe(1);
    expect(metrics.gtOccludedCount).toBe(1);
    expect(metrics.truePositivesCount).toBe(1);
    expect(metrics.falseNegativesCount).toBe(0);
    expect(metrics.visibleFrameRecall).toBe(1.0);
  });

  // 6. LOST GAP
  it('6. lost gap: accurately counts consecutive lost frames and duration', () => {
    const predictions: ShuttleObservation[] = Array.from({ length: 10 }, (_, i) => {
      const isLost = i >= 2 && i <= 6;
      return {
        frameIndex: i,
        timestampSec: i * 0.033,
        state: isLost ? 'lost' : 'observed',
        source: 'temporal_tracker',
        positionPx: isLost ? null : { x: 100.0, y: 100.0 },
        confidence: isLost ? null : 0.9,
        trajectoryId: null,
      };
    });

    const gtFrames: ShuttleGroundTruthFrame[] = Array.from({ length: 10 }, (_, i) => ({
      frameIndex: i,
      timestampSec: i * 0.033,
      visibility: 'visible',
      xPx: 100.0,
      yPx: 100.0,
    }));

    const pairs = alignShuttlePredictionsAndGroundTruth(gtFrames, predictions);
    const metrics = evaluateShuttleTracking(pairs, { sourceFps: 30.0 });

    expect(metrics.lostFramesCount).toBe(5);
    expect(metrics.lostPercent).toBe(50.0);
    expect(metrics.longestLostGapFrames).toBe(5);
    expect(metrics.longestLostGapSec).toBeCloseTo(5 / 30.0, 3);
  });

  // 7. REACQUISITION TIME
  it('7. reacquisition time: measures latency in frames and seconds when visible period resumes', () => {
    const gtFrames: ShuttleGroundTruthFrame[] = [
      { frameIndex: 0, timestampSec: 0.0, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 1, timestampSec: 0.033, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 2, timestampSec: 0.066, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 3, timestampSec: 0.099, visibility: 'occluded', xPx: null, yPx: null },
      { frameIndex: 4, timestampSec: 0.132, visibility: 'occluded', xPx: null, yPx: null },
      { frameIndex: 5, timestampSec: 0.165, visibility: 'occluded', xPx: null, yPx: null },
      { frameIndex: 6, timestampSec: 0.198, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 7, timestampSec: 0.231, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 8, timestampSec: 0.264, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 9, timestampSec: 0.297, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
    ];

    const predictions: ShuttleObservation[] = [
      { frameIndex: 0, timestampSec: 0.0, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 1, timestampSec: 0.033, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 2, timestampSec: 0.066, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 3, timestampSec: 0.099, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 4, timestampSec: 0.132, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 5, timestampSec: 0.165, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 6, timestampSec: 0.198, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 7, timestampSec: 0.231, state: 'predicted', source: 'temporal_tracker', positionPx: { x: 99.0, y: 99.0 }, confidence: 0.5, trajectoryId: null },
      { frameIndex: 8, timestampSec: 0.264, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.85, trajectoryId: null },
      { frameIndex: 9, timestampSec: 0.297, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
    ];

    const pairs = alignShuttlePredictionsAndGroundTruth(gtFrames, predictions);
    const metrics = evaluateShuttleTracking(pairs, { sourceFps: 30.0 });

    expect(metrics.reacquisitionEventsCount).toBe(1);
    expect(metrics.meanReacquisitionFrames).toBe(2);
    expect(metrics.meanReacquisitionTimeSec).toBeCloseTo(0.066, 3);
    expect(metrics.p95ReacquisitionFrames).toBe(2);
  });

  // 8. RESOLUTION NORMALIZATION
  it('8. resolution normalization: normalizes distance error against diagonal for cross-clip comparability', () => {
    // 1920x1080 -> diagonal = 2202.907 px
    const gt1080: ShuttleGroundTruthFrame[] = [
      { frameIndex: 0, timestampSec: 0.0, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
    ];
    const pred1080: ShuttleObservation[] = [
      {
        frameIndex: 0,
        timestampSec: 0.0,
        state: 'observed',
        source: 'temporal_tracker',
        positionPx: { x: 122.02907, y: 100.0 },
        confidence: 0.9,
        trajectoryId: null,
      },
    ];

    const pairs1080 = alignShuttlePredictionsAndGroundTruth(gt1080, pred1080);
    const m1080 = evaluateShuttleTracking(pairs1080, { sourceWidth: 1920, sourceHeight: 1080 });

    expect(m1080.meanPixelError).toBeCloseTo(22.02907, 3);
    expect(m1080.meanNormalizedError).toBeCloseTo(0.01, 4);
    expect(m1080.normalizationFormula).toContain('sqrt(source_width^2 + source_height^2)');

    // 1280x720 -> diagonal = 1468.605 px
    const gt720: ShuttleGroundTruthFrame[] = [
      { frameIndex: 0, timestampSec: 0.0, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
    ];
    const pred720: ShuttleObservation[] = [
      {
        frameIndex: 0,
        timestampSec: 0.0,
        state: 'observed',
        source: 'temporal_tracker',
        positionPx: { x: 114.68605, y: 100.0 },
        confidence: 0.9,
        trajectoryId: null,
      },
    ];

    const pairs720 = alignShuttlePredictionsAndGroundTruth(gt720, pred720);
    const m720 = evaluateShuttleTracking(pairs720, { sourceWidth: 1280, sourceHeight: 720 });

    expect(m720.meanPixelError).toBeCloseTo(14.68605, 3);
    expect(m720.meanNormalizedError).toBeCloseTo(0.01, 4);
  });

  // 9. MISSING GT / INCOMPLETE DATASET
  it('9. missing GT: reports GROUND TRUTH DATASET INCOMPLETE without fabricating numbers', () => {
    const predictions: ShuttleObservation[] = [
      { frameIndex: 0, timestampSec: 0.0, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 1, timestampSec: 0.033, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
    ];

    const pairs = alignShuttlePredictionsAndGroundTruth([], predictions);
    const metrics = evaluateShuttleTracking(pairs, { isDatasetComplete: false });

    expect(metrics.datasetStatus).toBe('GROUND TRUTH DATASET INCOMPLETE');
    expect(metrics.visibleFrameRecall).toBeNull();
    expect(metrics.precision).toBeNull();
    expect(metrics.meanPixelError).toBeNull();

    const report = formatShuttleBenchmarkReport('S03_doubles_standard', 'Temporal Baseline', metrics);
    expect(report).toContain('GROUND TRUTH DATASET INCOMPLETE');
    expect(report).toContain('no synthetic accuracy metrics were fabricated');
  });

  // 10. UNKNOWN COORDINATES
  it('10. unknown coordinates: handles null coordinates safely without coercing to (0, 0)', () => {
    const gtFrames: ShuttleGroundTruthFrame[] = [
      { frameIndex: 0, timestampSec: 0.0, visibility: 'unknown', xPx: null, yPx: null },
      { frameIndex: 1, timestampSec: 0.033, visibility: 'visible', xPx: 500.0, yPx: 500.0 },
    ];

    const predictions: ShuttleObservation[] = [
      { frameIndex: 0, timestampSec: 0.0, state: 'unknown', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 1, timestampSec: 0.033, state: 'observed', source: 'temporal_tracker', positionPx: { x: 500.0, y: 500.0 }, confidence: 0.9, trajectoryId: null },
    ];

    const pairs = alignShuttlePredictionsAndGroundTruth(gtFrames, predictions);
    const metrics = evaluateShuttleTracking(pairs);

    expect(metrics.gtUnknownCount).toBe(1);
    expect(metrics.gtVisibleCount).toBe(1);
    expect(metrics.positionEvaluatedCount).toBe(1);
    expect(metrics.meanPixelError).toBeCloseTo(0.0, 4);
  });

  // 11. NO NAN OR INFINITY
  it('11. no NaN or Infinity: verifies all numbers are finite across empty and edge cases', () => {
    const emptyMetrics = evaluateShuttleTracking([]);
    for (const [key, value] of Object.entries(emptyMetrics)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `Key ${key} was not finite: ${value}`).toBe(true);
      }
    }

    const gtNotVis: ShuttleGroundTruthFrame[] = [
      { frameIndex: 0, timestampSec: 0.0, visibility: 'not_visible', xPx: null, yPx: null },
    ];
    const predLost: ShuttleObservation[] = [
      { frameIndex: 0, timestampSec: 0.0, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
    ];
    const pairs = alignShuttlePredictionsAndGroundTruth(gtNotVis, predLost);
    const m = evaluateShuttleTracking(pairs);

    for (const [key, value] of Object.entries(m)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `Key ${key} was not finite: ${value}`).toBe(true);
      }
    }
  });

  // 12. COMPARE CONFIGURATIONS
  it('12. configuration comparison: correctly contrasts Temporal only vs Temporal + Reacquisition', () => {
    const gtFrames: ShuttleGroundTruthFrame[] = [
      { frameIndex: 0, timestampSec: 0.0, visibility: 'visible', xPx: 100.0, yPx: 100.0 },
      { frameIndex: 1, timestampSec: 0.033, visibility: 'visible', xPx: 110.0, yPx: 100.0 },
      { frameIndex: 2, timestampSec: 0.066, visibility: 'occluded', xPx: null, yPx: null },
      { frameIndex: 3, timestampSec: 0.099, visibility: 'visible', xPx: 130.0, yPx: 100.0 },
      { frameIndex: 4, timestampSec: 0.132, visibility: 'visible', xPx: 140.0, yPx: 100.0 },
    ];

    // Config A: Temporal only (misses frame 3 after occlusion)
    const predTemporalOnly: ShuttleObservation[] = [
      { frameIndex: 0, timestampSec: 0.0, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 1, timestampSec: 0.033, state: 'observed', source: 'temporal_tracker', positionPx: { x: 110.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 2, timestampSec: 0.066, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 3, timestampSec: 0.099, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 4, timestampSec: 0.132, state: 'observed', source: 'temporal_tracker', positionPx: { x: 140.0, y: 100.0 }, confidence: 0.85, trajectoryId: null },
    ];

    // Config B: Temporal + Auxiliary Reacquisition (recovers frame 3)
    const predWithAux: ShuttleObservation[] = [
      { frameIndex: 0, timestampSec: 0.0, state: 'observed', source: 'temporal_tracker', positionPx: { x: 100.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 1, timestampSec: 0.033, state: 'observed', source: 'temporal_tracker', positionPx: { x: 110.0, y: 100.0 }, confidence: 0.9, trajectoryId: null },
      { frameIndex: 2, timestampSec: 0.066, state: 'lost', source: 'temporal_tracker', positionPx: null, confidence: null, trajectoryId: null },
      { frameIndex: 3, timestampSec: 0.099, state: 'observed', source: 'auxiliary_detector', positionPx: { x: 130.0, y: 100.0 }, confidence: 0.8, trajectoryId: null },
      { frameIndex: 4, timestampSec: 0.132, state: 'observed', source: 'temporal_tracker', positionPx: { x: 140.0, y: 100.0 }, confidence: 0.85, trajectoryId: null },
    ];

    const pairsA = alignShuttlePredictionsAndGroundTruth(gtFrames, predTemporalOnly);
    const mA = evaluateShuttleTracking(pairsA, { sourceWidth: 1920, sourceHeight: 1080 });

    const pairsB = alignShuttlePredictionsAndGroundTruth(gtFrames, predWithAux);
    const mB = evaluateShuttleTracking(pairsB, { sourceWidth: 1920, sourceHeight: 1080 });

    expect(mA.visibleFrameRecall).toBeCloseTo(0.75, 4);
    expect(mB.visibleFrameRecall).toBeCloseTo(1.0, 4);
    expect(mB.meanReacquisitionFrames!).toBeLessThan(mA.meanReacquisitionFrames!);
  });
});
