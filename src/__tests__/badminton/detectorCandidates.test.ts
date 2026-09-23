import { describe, it, expect } from 'vitest';
import {
  PHASE_1_DETECTOR_CANDIDATES,
  getDetectorCandidate,
  getBaselineDetectorCandidate,
  listDetectorCandidates,
  createExperimentConfigFromCandidate,
  BENCHMARK_INPUT_SIZES,
  BASELINE_CONFIDENCE_THRESHOLD,
} from '../../benchmarks/detectorCandidates';

describe('Phase 1.2 — Benchmark Detector Candidates Registry', () => {
  it('registers strictly the initial 5 detector candidates', () => {
    const expectedIds = ['yolov8n', 'yolo11s', 'yolo11m', 'yolo26s', 'yolo26m'];
    const candidates = listDetectorCandidates();

    expect(candidates.map((c) => c.id).sort()).toEqual(expectedIds.sort());

    for (const id of expectedIds) {
      const cand = getDetectorCandidate(id);
      expect(cand.id).toBe(id);
      expect(cand.supportedInputSizes).toEqual([640, 960]);
      expect(cand.confidenceThreshold).toBe(BASELINE_CONFIDENCE_THRESHOLD);
    }

    // Verify alias matching (case-insensitive, .pt extension, hyphens)
    expect(getDetectorCandidate('YOLO11s').id).toBe('yolo11s');
    expect(getDetectorCandidate('yolo11s.pt').id).toBe('yolo11s');
    expect(getDetectorCandidate('yolo-26-s').id).toBe('yolo26s');
    expect(getDetectorCandidate('YOLO26M.PT').id).toBe('yolo26m');
  });

  it('keeps YOLOv8n strictly as the official baseline', () => {
    const baseline = getBaselineDetectorCandidate();
    expect(baseline.id).toBe('yolov8n');
    expect(baseline.displayName).toBe('YOLOv8n');
    expect(baseline.modelFile).toBe('yolov8n.pt');
    expect(baseline.baseline).toBe(true);

    const nonBaselines = listDetectorCandidates().filter((c) => c.id !== 'yolov8n');
    for (const cand of nonBaselines) {
      expect(cand.baseline).toBe(false);
    }
  });

  it('flows specific model names into benchmark experiment config without generic yolo labels', () => {
    const exp11 = createExperimentConfigFromCandidate('yolo11s', { inputSize: 960 });
    expect(exp11.detector).toBe('yolo11s.pt');
    expect(exp11.name).toContain('YOLO11s');
    expect(exp11.inputSize).toBe(960);
    expect(exp11.confidenceThreshold).toBe(0.35);
    expect(exp11.detector).not.toBe('yolo');

    const exp26 = createExperimentConfigFromCandidate('yolo26m', { inputSize: 640 });
    expect(exp26.detector).toBe('yolo26m.pt');
    expect(exp26.name).toContain('YOLO26m');
    expect(exp26.inputSize).toBe(640);
  });

  it('fails cleanly on unknown candidate or unsupported input size', () => {
    expect(() => getDetectorCandidate('unknown_vision_model')).toThrow(/Unknown detector candidate/);

    // 1280 is deferred to later phases
    expect(() => createExperimentConfigFromCandidate('yolov8n', { inputSize: 1280 })).toThrow(
      /Input size 1280 is not in supported candidate sizes/
    );
  });

  it('does not mutate baseline config when selecting or modifying candidate configs', () => {
    const baselineBefore = getBaselineDetectorCandidate();

    const candExp = createExperimentConfigFromCandidate('yolo26s', { inputSize: 960 });
    expect(candExp.detector).toBe('yolo26s.pt');

    const baselineAfter = getBaselineDetectorCandidate();
    expect(baselineBefore.modelFile).toBe(baselineAfter.modelFile);
    expect(baselineAfter.modelFile).toBe('yolov8n.pt');
    expect(baselineAfter.supportedInputSizes).toEqual([640, 960]);
  });

  it('accurately reports model availability status and exact reasons', () => {
    const baseline = getDetectorCandidate('yolov8n');
    expect(baseline.availability).toBe('AVAILABLE');

    const unavailIds = ['yolo11s', 'yolo11m', 'yolo26s', 'yolo26m'];
    for (const id of unavailIds) {
      const cand = getDetectorCandidate(id);
      expect(cand.availability).toBe('UNAVAILABLE / RUNTIME INCOMPATIBLE');
      expect(cand.availabilityReason).toContain('automated remote fetch is disabled');
    }
  });
});
