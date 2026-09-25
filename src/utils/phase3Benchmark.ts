/**
 * src/utils/phase3Benchmark.ts — Phase 3.4 Court, Position & Identity Benchmark Quality Gates
 */

import type {
  BenchmarkClipEntry,
  CameraCutBenchmarkMetrics,
  Phase3BenchmarkReport,
} from '../types/benchmark';

export function validateSplitLeakage(
  splits: Record<string, BenchmarkClipEntry[]>,
  groupBy: Array<keyof BenchmarkClipEntry> = [
    'venueId',
    'cameraId',
    'recordingGroup',
    'sessionDate',
    'videoReference',
  ]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen: Record<string, Record<string, string>> = {};

  for (const key of groupBy) {
    seen[String(key)] = {};
  }

  for (const [splitName, clips] of Object.entries(splits)) {
    for (const clip of clips) {
      for (const key of groupBy) {
        const val = clip[key];
        if (val !== undefined && val !== null && val !== '') {
          const strVal = String(val).trim();
          if (!strVal) continue;
          const kStr = String(key);
          const priorSplit = seen[kStr][strVal];
          if (priorSplit && priorSplit !== splitName) {
            errors.push(
              `Data leakage detected: ${kStr}='${strVal}' in clip '${clip.id}' present in both '${priorSplit}' and '${splitName}'`
            );
          } else {
            seen[kStr][strVal] = splitName;
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function partitionClipsByGroup(
  clips: BenchmarkClipEntry[],
  groupKey: keyof BenchmarkClipEntry = 'recordingGroup'
): Record<string, BenchmarkClipEntry[]> {
  const grouped: Record<string, BenchmarkClipEntry[]> = {};
  for (const clip of clips) {
    const val = clip[groupKey];
    const keyStr = val !== undefined && val !== null && String(val).trim()
      ? String(val).trim()
      : `ungrouped_${clip.id}`;
    if (!grouped[keyStr]) {
      grouped[keyStr] = [];
    }
    grouped[keyStr].push(clip);
  }
  return grouped;
}

export function evaluateCameraCuts(
  groundTruthCuts: number[] | null | undefined,
  predictedCuts: number[] | null | undefined,
  toleranceSec = 0.5
): CameraCutBenchmarkMetrics {
  if (!groundTruthCuts) {
    return {
      status: 'UNAVAILABLE',
      statusReason: 'Camera cut ground truth not available',
    };
  }

  const gtList = [...groundTruthCuts].filter(Number.isFinite).sort((a, b) => a - b);
  const predList = [...(predictedCuts || [])].filter(Number.isFinite).sort((a, b) => a - b);

  if (gtList.length === 0 && predList.length === 0) {
    return {
      status: 'MEASURED',
      tpCuts: 0,
      fpCuts: 0,
      fnCuts: 0,
      duplicateCutCount: 0,
      precision: 1.0,
      recall: 1.0,
      f1: 1.0,
      meanDetectionLatencySec: null,
    };
  }

  const matchedGt = new Set<number>();
  const matchedPreds = new Set<number>();
  const latencies: number[] = [];
  let duplicateCount = 0;

  for (let pIdx = 0; pIdx < predList.length; pIdx++) {
    const pTime = predList[pIdx];
    let bestGtIdx: number | null = null;
    let bestDiff = Infinity;
    let isDuplicate = false;

    for (let gIdx = 0; gIdx < gtList.length; gIdx++) {
      const gTime = gtList[gIdx];
      const diff = Math.abs(pTime - gTime);
      if (diff <= toleranceSec) {
        if (matchedGt.has(gIdx)) {
          isDuplicate = true;
        } else if (diff < bestDiff) {
          bestDiff = diff;
          bestGtIdx = gIdx;
        }
      }
    }

    if (bestGtIdx !== null) {
      matchedGt.add(bestGtIdx);
      matchedPreds.add(pIdx);
      latencies.push(bestDiff);
    } else if (isDuplicate) {
      duplicateCount++;
      matchedPreds.add(pIdx);
    }
  }

  const tp = matchedGt.size;
  const fp = predList.length - matchedPreds.size;
  const fn = gtList.length - tp;

  const precision = (tp + fp) > 0 ? Number((tp / (tp + fp)).toFixed(4)) : (gtList.length === 0 ? 1.0 : 0.0);
  const recall = (tp + fn) > 0 ? Number((tp / (tp + fn)).toFixed(4)) : 1.0;
  const f1 = (precision + recall) > 0 ? Number(((2 * precision * recall) / (precision + recall)).toFixed(4)) : 0.0;
  const meanLatency = latencies.length > 0
    ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(4))
    : null;

  return {
    status: 'MEASURED',
    tpCuts: tp,
    fpCuts: fp,
    fnCuts: fn,
    duplicateCutCount: duplicateCount,
    precision,
    recall,
    f1,
    meanDetectionLatencySec: meanLatency,
  };
}

export function formatPhase3ReportSummary(report: Phase3BenchmarkReport): string {
  const lines: string[] = [
    '=== PHASE 3.4 BENCHMARK REPORT ===',
    `Clip ID: ${report.provenance.clipId} (Dataset: ${report.provenance.datasetId})`,
    `Engine: ${report.provenance.engineVersion} | Detector: ${report.provenance.detectorModel ?? 'none'} | Tracker: ${report.provenance.trackerModel ?? 'none'}`,
    '',
    '--- MEASURED METRICS ---',
  ];

  let measuredFound = false;
  if (report.cameraCuts.status === 'MEASURED') {
    measuredFound = true;
    lines.push(
      `[Camera Cuts] Precision: ${report.cameraCuts.precision?.toFixed(3)} | Recall: ${report.cameraCuts.recall?.toFixed(3)} | F1: ${report.cameraCuts.f1?.toFixed(3)} | TP: ${report.cameraCuts.tpCuts} | FP: ${report.cameraCuts.fpCuts} | FN: ${report.cameraCuts.fnCuts}`
    );
  }
  if (report.calibration.status === 'MEASURED') {
    measuredFound = true;
    lines.push(
      `[Calibration] Reprojection Err Mean: ${report.calibration.reprojectionErrorPxMean}px | Availability: ${report.calibration.calibrationAvailabilityPct}%`
    );
  }
  if (report.groundPosition.status === 'MEASURED') {
    measuredFound = true;
    lines.push(
      `[Ground Position] Px Err Mean: ${report.groundPosition.pixelErrorMean}px | Meter Err Mean: ${report.groundPosition.courtPositionErrorMMean}m`
    );
  }
  if (report.identity.status === 'MEASURED') {
    measuredFound = true;
    lines.push(
      `[Tracking Identity] IDF1: ${report.identity.idf1?.toFixed(3)} | ID Switches: ${report.identity.idSwitchCount}`
    );
  }
  if (!measuredFound) {
    lines.push('(None measured)');
  }

  lines.push('');
  lines.push('--- UNAVAILABLE METRICS ---');
  let unavailableFound = false;
  if (report.cameraCuts.status === 'UNAVAILABLE') {
    unavailableFound = true;
    lines.push(`[Camera Cuts] UNAVAILABLE: ${report.cameraCuts.statusReason || 'No ground truth'}`);
  }
  if (report.calibration.status === 'UNAVAILABLE') {
    unavailableFound = true;
    lines.push(`[Calibration] UNAVAILABLE: ${report.calibration.statusReason || 'No ground truth'}`);
  }
  if (report.groundPosition.status === 'UNAVAILABLE') {
    unavailableFound = true;
    lines.push(`[Ground Position] UNAVAILABLE: ${report.groundPosition.statusReason || 'No ground truth'}`);
  }
  if (report.identity.status === 'UNAVAILABLE') {
    unavailableFound = true;
    lines.push(`[Tracking Identity] UNAVAILABLE: ${report.identity.statusReason || 'No ground truth'}`);
  }
  if (report.identity.hotaStatus === 'UNAVAILABLE') {
    unavailableFound = true;
    lines.push(`[HOTA] UNAVAILABLE: ${report.identity.hotaReason}`);
  }
  if (!unavailableFound) {
    lines.push('(None)');
  }

  lines.push('');
  lines.push('--- FAILED VALIDATION ---');
  const failed: string[] = [];
  if (report.cameraCuts.status === 'FAILED_VALIDATION') failed.push('Camera Cuts');
  if (report.calibration.status === 'FAILED_VALIDATION') failed.push('Calibration');
  if (report.groundPosition.status === 'FAILED_VALIDATION') failed.push('Ground Position');
  if (report.identity.status === 'FAILED_VALIDATION') failed.push('Tracking Identity');

  if (failed.length > 0) {
    for (const f of failed) {
      lines.push(`[${f}] FAILED VALIDATION`);
    }
  } else {
    lines.push('(None)');
  }

  return lines.join('\n');
}
