/**
 * SportsScout Phase 1.2 Benchmark Detector Candidate Registry
 *
 * Defines the initial detector candidate matrix for Phase 1 vision benchmarks:
 * - YOLOv8n (baseline)
 * - YOLO11s
 * - YOLO11m
 * - YOLO26s
 * - YOLO26m
 *
 * Rules:
 * - YOLOv8n is strictly the baseline.
 * - Standard input resolutions: [640, 960] (1280 is deferred).
 * - Consistent baseline confidence threshold: 0.35 across all candidates.
 * - No accuracy or superiority claims encoded in configuration.
 */

import type { DetectorCandidate, VisionBenchmarkExperimentConfig } from '../types/benchmark';

export const BENCHMARK_INPUT_SIZES: [number, number] = [640, 960];
export const BASELINE_CONFIDENCE_THRESHOLD = 0.35;

export const PHASE_1_DETECTOR_CANDIDATES: Record<string, DetectorCandidate> = {
  yolov8n: {
    id: 'yolov8n',
    displayName: 'YOLOv8n',
    family: 'yolov8',
    modelFile: 'yolov8n.pt',
    task: 'detect',
    supportedInputSizes: [640, 960],
    baseline: true,
    confidenceThreshold: BASELINE_CONFIDENCE_THRESHOLD,
    runtime: 'pytorch',
    precision: 'fp32',
    availability: 'AVAILABLE',
    availabilityReason: 'Weight file found locally at yolov8n.pt',
    description: 'Phase 1 Official Baseline Configuration',
  },
  yolo11s: {
    id: 'yolo11s',
    displayName: 'YOLO11s',
    family: 'yolo11',
    modelFile: 'yolo11s.pt',
    task: 'detect',
    supportedInputSizes: [640, 960],
    baseline: false,
    confidenceThreshold: BASELINE_CONFIDENCE_THRESHOLD,
    runtime: 'pytorch',
    precision: 'fp32',
    availability: 'UNAVAILABLE / RUNTIME INCOMPATIBLE',
    availabilityReason:
      "Weight file 'yolo11s.pt' not found in local workspace or cache; automated remote fetch is disabled",
    description: 'YOLO11 Small variant',
  },
  yolo11m: {
    id: 'yolo11m',
    displayName: 'YOLO11m',
    family: 'yolo11',
    modelFile: 'yolo11m.pt',
    task: 'detect',
    supportedInputSizes: [640, 960],
    baseline: false,
    confidenceThreshold: BASELINE_CONFIDENCE_THRESHOLD,
    runtime: 'pytorch',
    precision: 'fp32',
    availability: 'UNAVAILABLE / RUNTIME INCOMPATIBLE',
    availabilityReason:
      "Weight file 'yolo11m.pt' not found in local workspace or cache; automated remote fetch is disabled",
    description: 'YOLO11 Medium variant',
  },
  yolo26s: {
    id: 'yolo26s',
    displayName: 'YOLO26s',
    family: 'yolo26',
    modelFile: 'yolo26s.pt',
    task: 'detect',
    supportedInputSizes: [640, 960],
    baseline: false,
    confidenceThreshold: BASELINE_CONFIDENCE_THRESHOLD,
    runtime: 'pytorch',
    precision: 'fp32',
    availability: 'UNAVAILABLE / RUNTIME INCOMPATIBLE',
    availabilityReason:
      "Weight file 'yolo26s.pt' not found in local workspace or cache; automated remote fetch is disabled",
    description: 'YOLO26 Small variant',
  },
  yolo26m: {
    id: 'yolo26m',
    displayName: 'YOLO26m',
    family: 'yolo26',
    modelFile: 'yolo26m.pt',
    task: 'detect',
    supportedInputSizes: [640, 960],
    baseline: false,
    confidenceThreshold: BASELINE_CONFIDENCE_THRESHOLD,
    runtime: 'pytorch',
    precision: 'fp32',
    availability: 'UNAVAILABLE / RUNTIME INCOMPATIBLE',
    availabilityReason:
      "Weight file 'yolo26m.pt' not found in local workspace or cache; automated remote fetch is disabled",
    description: 'YOLO26 Medium variant',
  },
};

/**
 * Resolves a detector candidate by ID or model filename (case-insensitive).
 */
export function getDetectorCandidate(candidateId: string): DetectorCandidate {
  const norm = candidateId.trim().toLowerCase().replace(/[-_.]/g, '');
  for (const [cid, cand] of Object.entries(PHASE_1_DETECTOR_CANDIDATES)) {
    const cleanCid = cid.replace(/[-_.]/g, '');
    const cleanFile = cand.modelFile.toLowerCase().replace(/\.pt$/, '').replace(/[-_.]/g, '');
    if (norm === cleanCid || norm === cleanFile || candidateId.toLowerCase() === cand.modelFile.toLowerCase()) {
      return { ...cand };
    }
  }
  throw new Error(
    `Unknown detector candidate: '${candidateId}'. Registered candidates: ${Object.keys(
      PHASE_1_DETECTOR_CANDIDATES
    ).join(', ')}`
  );
}

/**
 * Returns the official Phase 1 baseline detector candidate (YOLOv8n).
 */
export function getBaselineDetectorCandidate(): DetectorCandidate {
  return { ...PHASE_1_DETECTOR_CANDIDATES.yolov8n };
}

/**
 * Returns all registered Phase 1 detector candidates.
 */
export function listDetectorCandidates(): DetectorCandidate[] {
  return Object.values(PHASE_1_DETECTOR_CANDIDATES).map((c) => ({ ...c }));
}

/**
 * Creates a VisionBenchmarkExperimentConfig from a candidate model.
 */
export function createExperimentConfigFromCandidate(
  candidateId: string,
  options?: {
    inputSize?: number;
    device?: string;
    frameStride?: number;
    poseStride?: number;
    poseModel?: string | null;
    tracker?: string;
    runtime?: string;
    precision?: string;
    courtRoiEnabled?: boolean;
    notes?: string;
  }
): VisionBenchmarkExperimentConfig {
  const candidate = getDetectorCandidate(candidateId);
  const inputSize = options?.inputSize ?? 640;

  if (!candidate.supportedInputSizes.includes(inputSize)) {
    throw new Error(
      `Input size ${inputSize} is not in supported candidate sizes: [${candidate.supportedInputSizes.join(', ')}]`
    );
  }

  const tracker = options?.tracker ?? 'bytetrack';
  const runtime = options?.runtime ?? candidate.runtime;
  const precision = options?.precision ?? candidate.precision;
  const device = options?.device ?? 'cpu';

  const expId = `EXP_${candidate.id.toUpperCase()}_${tracker.toUpperCase()}_${inputSize}_${runtime.toUpperCase()}_${precision.toUpperCase()}`;

  return {
    experimentId: expId,
    name: `${candidate.displayName} (${inputSize}px, ${tracker}, ${runtime} ${precision})`,
    detector: candidate.modelFile,
    detectorVersion: null,
    poseModel: options?.poseModel !== undefined ? options.poseModel : 'yolov8n-pose.pt',
    tracker,
    trackerVersion: null,
    runtime,
    inputSize,
    confidenceThreshold: candidate.confidenceThreshold,
    frameStride: options?.frameStride ?? 1,
    poseStride: options?.poseStride ?? 1,
    courtRoiEnabled: options?.courtRoiEnabled ?? false,
    device,
    precision,
    processingProfile: 'custom',
    notes: options?.notes ?? candidate.description,
  };
}
