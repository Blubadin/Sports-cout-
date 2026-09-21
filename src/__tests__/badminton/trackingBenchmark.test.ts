import { describe, it, expect } from 'vitest';
import {
  areBenchmarkConfigsMatching,
  compareBenchmarkRuns,
} from '../../utils/trackingBenchmark';

describe('Tracking Benchmark Comparability & Speedup Semantics', () => {
  const baseRun = {
    trackedPlayerCount: 2,
    detectorModel: 'yolov8n',
    trackerModel: 'bytetrack',
    poseModel: 'yolov8n-pose',
    processingConfig: {
      detectorInputSize: 640,
      frameStride: 2,
      poseStride: 1,
      useCourtRoi: false,
      courtRoiMarginPx: 60,
      device: 'cpu' as const,
    },
    analysisFps: 15.0,
    elapsedSec: 10.0,
  };

  it('matches runs when all key algorithmic configurations are identical', () => {
    const identicalRun = {
      ...baseRun,
      processingConfig: {
        ...baseRun.processingConfig,
        device: 'cuda' as const,
      },
      analysisFps: 45.0,
      elapsedSec: 3.33,
    };

    expect(areBenchmarkConfigsMatching(baseRun, identicalRun)).toBe(true);

    const comparison = compareBenchmarkRuns(identicalRun, baseRun, true, 'en');
    expect(comparison.configsMatch).toBe(true);
    expect(comparison.speedupMultiplier).toBe(3.0);
    expect(comparison.statusLabel).toContain('3.00x faster');
  });

  it('detects differences in detectorInputSize', () => {
    const differingRun = {
      ...baseRun,
      processingConfig: {
        ...baseRun.processingConfig,
        detectorInputSize: 416,
      },
    };
    expect(areBenchmarkConfigsMatching(baseRun, differingRun)).toBe(false);

    const comparison = compareBenchmarkRuns(differingRun, baseRun, false, 'en');
    expect(comparison.configsMatch).toBe(false);
    expect(comparison.speedupMultiplier).toBeNull();
    expect(comparison.statusLabel).toBe('Configuration differs');
  });

  it('detects differences in frameStride', () => {
    const differingRun = {
      ...baseRun,
      processingConfig: {
        ...baseRun.processingConfig,
        frameStride: 4,
      },
    };
    expect(areBenchmarkConfigsMatching(baseRun, differingRun)).toBe(false);
  });

  it('detects differences in poseStride', () => {
    const differingRun = {
      ...baseRun,
      processingConfig: {
        ...baseRun.processingConfig,
        poseStride: 2,
      },
    };
    expect(areBenchmarkConfigsMatching(baseRun, differingRun)).toBe(false);
  });

  it('detects differences in court ROI cropping', () => {
    const differingRun = {
      ...baseRun,
      processingConfig: {
        ...baseRun.processingConfig,
        useCourtRoi: true,
      },
    };
    expect(areBenchmarkConfigsMatching(baseRun, differingRun)).toBe(false);
  });

  it('detects differences in trackedPlayerCount', () => {
    const differingRun = {
      ...baseRun,
      trackedPlayerCount: 4,
    };
    expect(areBenchmarkConfigsMatching(baseRun, differingRun)).toBe(false);
  });

  it('detects differences in detector and tracker implementations', () => {
    expect(areBenchmarkConfigsMatching(baseRun, { ...baseRun, detectorModel: 'yolo11n' })).toBe(false);
    expect(areBenchmarkConfigsMatching(baseRun, { ...baseRun, trackerModel: 'norfair' })).toBe(false);
  });

  it('translates status label to Thai when language is th', () => {
    const comparison = compareBenchmarkRuns(baseRun, baseRun, false, 'th');
    expect(comparison.statusLabel).toBe('การตั้งค่าต่างกัน');
  });

  it('does not claim configurations match when required comparison metadata is missing', () => {
    expect(areBenchmarkConfigsMatching({}, {})).toBe(false);
  });

  it('does not report equal performance when both runs lack measurements', () => {
    const comparison = compareBenchmarkRuns({}, {}, true, 'en');

    expect(comparison.speedupMultiplier).toBeNull();
    expect(comparison.speedupPercent).toBeNull();
    expect(comparison.statusLabel).toBe('Performance unavailable');
  });
});
