/**
 * AI Quality Benchmark & Metrics Evaluation
 * Phase 15: Tracking Metrics (§100), Movement Validation (§101), Skill Classification (§102)
 */

export const CANONICAL_BADMINTON_STROKES = [
  'SMH', // Smash
  'CLR', // Clear
  'DRP', // Drop
  'DRV', // Drive
  'NET', // Net
  'LFT', // Lift
  'SER', // Serve
] as const;

export type CanonicalBadmintonStroke = (typeof CANONICAL_BADMINTON_STROKES)[number];

export interface CourtPoint2D {
  x: number; // in meters [0, 6.10]
  y: number; // in meters [0, 13.40]
}

export interface PositionSampleComparison {
  timestamp: number;
  groundTruth: CourtPoint2D;
  predicted: CourtPoint2D | null; // null if tracking lost in this frame
}

export interface PlayerTrackPoint {
  frameIndex: number;
  timestamp: number;
  playerId: number;
  courtPosition: CourtPoint2D | null;
}

export interface TrackingMetricsResult {
  totalFrames: number;
  trackedFrames: number;
  coveragePercentage: number;
  idSwitches: number;
  trackFragmentation: number;
  positionMAE: number;
  positionRMSE: number;
  positionMaxError: number;
  speedAnomalies: number;
}

export interface DetectionSample {
  groundTruthPresent: boolean;
  predictionPresent: boolean;
  matched: boolean;
}

export interface DetectionMetricsResult {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface ClassMetric {
  stroke: CanonicalBadmintonStroke;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  support: number;
}

export interface SkillClassificationBenchmarkResult {
  classes: Record<CanonicalBadmintonStroke, ClassMetric>;
  confusionMatrix: Record<CanonicalBadmintonStroke, Record<CanonicalBadmintonStroke, number>>;
  accuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  totalSamples: number;
}

// ---------------------------------------------------------------------------
// 100. Detection Metrics (Precision / Recall / F1)
// ---------------------------------------------------------------------------
export function calculateDetectionMetrics(samples: DetectionSample[]): DetectionMetricsResult {
  let tp = 0;
  let fp = 0;
  let fn = 0;

  for (const sample of samples) {
    if (sample.groundTruthPresent && sample.predictionPresent && sample.matched) {
      tp++;
    } else if (sample.predictionPresent && (!sample.groundTruthPresent || !sample.matched)) {
      fp++;
    } else if (sample.groundTruthPresent && (!sample.predictionPresent || !sample.matched)) {
      fn++;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1Score,
  };
}

// ---------------------------------------------------------------------------
// 100 & 101. Court Position MAE & Movement Validation
// ---------------------------------------------------------------------------
export function calculateCourtPositionErrors(
  comparisons: PositionSampleComparison[],
): {
  mae: number;
  rmse: number;
  maxError: number;
  evaluatedCount: number;
} {
  const errors: number[] = [];

  for (const comp of comparisons) {
    if (comp.predicted === null) continue;
    const dx = comp.predicted.x - comp.groundTruth.x;
    const dy = comp.predicted.y - comp.groundTruth.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    errors.push(dist);
  }

  if (errors.length === 0) {
    return { mae: 0, rmse: 0, maxError: 0, evaluatedCount: 0 };
  }

  const sumError = errors.reduce((acc, val) => acc + val, 0);
  const sumSquared = errors.reduce((acc, val) => acc + val * val, 0);
  const maxError = Math.max(...errors);

  return {
    mae: sumError / errors.length,
    rmse: Math.sqrt(sumSquared / errors.length),
    maxError,
    evaluatedCount: errors.length,
  };
}

// Maximum human sprint speed in badminton singles (m/s)
export const MAX_REALISTIC_BADMINTON_SPEED_MPS = 10.0;
export const BADMINTON_COURT_WIDTH = 6.10;
export const BADMINTON_COURT_LENGTH = 13.40;
export const BADMINTON_SINGLES_X_MIN = 0.46;
export const BADMINTON_SINGLES_X_MAX = 5.64;

export function validateMovementLimits(
  samples: Array<{ timestamp: number; position: CourtPoint2D | null }>,
): {
  isValid: boolean;
  speedAnomalies: number;
  boundsAnomalies: number;
  messages: string[];
} {
  let speedAnomalies = 0;
  let boundsAnomalies = 0;
  const messages: string[] = [];

  for (let i = 0; i < samples.length; i++) {
    const curr = samples[i];
    if (!curr.position) continue;

    // Check physical outer bounds
    if (
      curr.position.x < -0.5 ||
      curr.position.x > BADMINTON_COURT_WIDTH + 0.5 ||
      curr.position.y < -0.5 ||
      curr.position.y > BADMINTON_COURT_LENGTH + 0.5
    ) {
      boundsAnomalies++;
      messages.push(`Out of court bounds at t=${curr.timestamp.toFixed(2)}s: (${curr.position.x.toFixed(2)}, ${curr.position.y.toFixed(2)})`);
    }

    // Check speed between consecutive tracked points
    if (i > 0) {
      const prev = samples[i - 1];
      if (prev.position) {
        const dt = curr.timestamp - prev.timestamp;
        if (dt > 0.001) {
          const dist = Math.sqrt(
            Math.pow(curr.position.x - prev.position.x, 2) +
            Math.pow(curr.position.y - prev.position.y, 2),
          );
          const speed = dist / dt;
          if (speed > MAX_REALISTIC_BADMINTON_SPEED_MPS) {
            speedAnomalies++;
            messages.push(`Unrealistic speed ${speed.toFixed(1)} m/s at t=${curr.timestamp.toFixed(2)}s (teleport detected)`);
          }
        }
      }
    }
  }

  return {
    isValid: speedAnomalies === 0 && boundsAnomalies === 0,
    speedAnomalies,
    boundsAnomalies,
    messages,
  };
}

// ---------------------------------------------------------------------------
// 100. Tracking Benchmark (Coverage, ID Switches, Track Fragmentation, MAE)
// ---------------------------------------------------------------------------
export function calculateTrackingMetrics(
  groundTruthTrack: Array<{ frameIndex: number; timestamp: number; truePlayerId: number; courtPosition: CourtPoint2D }>,
  predictedTrack: Array<{ frameIndex: number; timestamp: number; predictedPlayerId: number | null; courtPosition: CourtPoint2D | null }>,
): TrackingMetricsResult {
  const totalFrames = groundTruthTrack.length;
  if (totalFrames === 0) {
    return {
      totalFrames: 0,
      trackedFrames: 0,
      coveragePercentage: 0,
      idSwitches: 0,
      trackFragmentation: 0,
      positionMAE: 0,
      positionRMSE: 0,
      positionMaxError: 0,
      speedAnomalies: 0,
    };
  }

  let trackedFrames = 0;
  let idSwitches = 0;
  let trackFragmentation = 0;
  let lastAssignedId: number | null = null;
  let wasTracking = false;

  const comparisons: PositionSampleComparison[] = [];
  const movementSamples: Array<{ timestamp: number; position: CourtPoint2D | null }> = [];

  const predMap = new Map<number, { predictedPlayerId: number | null; courtPosition: CourtPoint2D | null }>();
  for (const p of predictedTrack) {
    predMap.set(p.frameIndex, { predictedPlayerId: p.predictedPlayerId, courtPosition: p.courtPosition });
  }

  for (const gt of groundTruthTrack) {
    const pred = predMap.get(gt.frameIndex);
    const isTracked = pred !== undefined && pred.predictedPlayerId !== null && pred.courtPosition !== null;

    if (isTracked && pred) {
      trackedFrames++;
      comparisons.push({
        timestamp: gt.timestamp,
        groundTruth: gt.courtPosition,
        predicted: pred.courtPosition,
      });
      movementSamples.push({
        timestamp: gt.timestamp,
        position: pred.courtPosition,
      });

      // Check ID Switches
      if (lastAssignedId !== null && pred.predictedPlayerId !== lastAssignedId) {
        idSwitches++;
      }
      lastAssignedId = pred.predictedPlayerId;

      // Check Fragmentation recovery
      if (!wasTracking && trackedFrames > 1) {
        trackFragmentation++;
      }
      wasTracking = true;
    } else {
      wasTracking = false;
      movementSamples.push({
        timestamp: gt.timestamp,
        position: null,
      });
    }
  }

  const coveragePercentage = totalFrames > 0 ? (trackedFrames / totalFrames) * 100 : 0;
  const posErrors = calculateCourtPositionErrors(comparisons);
  const movementValidation = validateMovementLimits(movementSamples);

  return {
    totalFrames,
    trackedFrames,
    coveragePercentage,
    idSwitches,
    trackFragmentation,
    positionMAE: posErrors.mae,
    positionRMSE: posErrors.rmse,
    positionMaxError: posErrors.maxError,
    speedAnomalies: movementValidation.speedAnomalies,
  };
}

// ---------------------------------------------------------------------------
// 102. Skill Classification Benchmark (Precision, Recall, F1, Confusion Matrix)
// ---------------------------------------------------------------------------
function createEmptyConfusionMatrix(): Record<CanonicalBadmintonStroke, Record<CanonicalBadmintonStroke, number>> {
  const matrix: Partial<Record<CanonicalBadmintonStroke, Record<CanonicalBadmintonStroke, number>>> = {};
  for (const gt of CANONICAL_BADMINTON_STROKES) {
    const row: Partial<Record<CanonicalBadmintonStroke, number>> = {};
    for (const pred of CANONICAL_BADMINTON_STROKES) {
      row[pred] = 0;
    }
    matrix[gt] = row as Record<CanonicalBadmintonStroke, number>;
  }
  return matrix as Record<CanonicalBadmintonStroke, Record<CanonicalBadmintonStroke, number>>;
}

export function calculateSkillClassificationMetrics(
  pairs: Array<{ groundTruth: CanonicalBadmintonStroke; predicted: CanonicalBadmintonStroke }>,
): SkillClassificationBenchmarkResult {
  const confusionMatrix = createEmptyConfusionMatrix();

  // Populate confusion matrix
  let totalCorrect = 0;
  for (const pair of pairs) {
    if (confusionMatrix[pair.groundTruth]?.[pair.predicted] !== undefined) {
      confusionMatrix[pair.groundTruth][pair.predicted]++;
      if (pair.groundTruth === pair.predicted) {
        totalCorrect++;
      }
    }
  }

  // Compute per-class Precision, Recall, F1
  const classes: Partial<Record<CanonicalBadmintonStroke, ClassMetric>> = {};
  let sumPrecision = 0;
  let sumRecall = 0;
  let sumF1 = 0;

  for (const stroke of CANONICAL_BADMINTON_STROKES) {
    const tp = confusionMatrix[stroke][stroke];
    
    // FP: predicted as this stroke, but was actually another stroke
    let fp = 0;
    for (const otherGt of CANONICAL_BADMINTON_STROKES) {
      if (otherGt !== stroke) {
        fp += confusionMatrix[otherGt][stroke];
      }
    }

    // FN: was actually this stroke, but predicted as another stroke
    let fn = 0;
    for (const otherPred of CANONICAL_BADMINTON_STROKES) {
      if (otherPred !== stroke) {
        fn += confusionMatrix[stroke][otherPred];
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const support = tp + fn;

    classes[stroke] = {
      stroke,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision,
      recall,
      f1Score,
      support,
    };

    sumPrecision += precision;
    sumRecall += recall;
    sumF1 += f1Score;
  }

  const numClasses = CANONICAL_BADMINTON_STROKES.length;
  const accuracy = pairs.length > 0 ? totalCorrect / pairs.length : 0;
  const macroPrecision = sumPrecision / numClasses;
  const macroRecall = sumRecall / numClasses;
  const macroF1 = sumF1 / numClasses;

  return {
    classes: classes as Record<CanonicalBadmintonStroke, ClassMetric>,
    confusionMatrix,
    accuracy,
    macroPrecision,
    macroRecall,
    macroF1,
    totalSamples: pairs.length,
  };
}
