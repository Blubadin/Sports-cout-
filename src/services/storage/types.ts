import type {
  TrackingTelemetryV1,
  ProcessingConfig,
  TrackingPerformanceStats,
  TrackingQualityStats,
  TrackingRuntimeProvenance,
  SourceVideoMetadata,
  CameraResearchMetadata,
  TrackingPlayerV1,
} from '../../types';
import type { CalibrationProvenance, CalibrationState } from '../../types/calibration';

export interface TrackingCalibrationEvent {
  frameIndex: number;
  timestampSec: number;
  cameraSegmentId?: string;
  calibrationId?: string | null;
  state: CalibrationState;
  provenance: CalibrationProvenance | null;
}

export interface TrackingPlayerMetadata {
  playerId: string;
  name?: string;
  side: 'near' | 'far' | 'unknown';
  color?: string;
}

export interface PlayerTrackingQuality {
  playerId: string;
  observedFrameCount: number;
  predictedFrameCount: number;
  lostFrameCount: number;
  detectionCoverage: number; // 0..1 (e.g. 0.95)
  predictedPercent: number; // 0..100 (%)
  lostPercent: number; // 0..100 (%)
  meanObservedConfidence: number | null; // 0..1; null when no observation exists
  idSwitchCount?: number | null;
  manualCorrectionCount?: number | null;
}

export interface TrackingQuality {
  // Session-level multi-target metrics
  meanTargetCoverage?: number | null; // 0..1 (mean of individual player coverages)
  simultaneousTargetCoverage?: number | null; // 0..1 (frames where all expected targets observed / eligible frames)
  fullyObservedFrameCount?: number;
  partiallyObservedFrameCount?: number;
  fullyLostFrameCount?: number;

  // Aggregate stats across session
  predictedPercent?: number | null; // 0..100 (%)
  lostPercent?: number | null; // 0..100 (%)

  // Per-player quality breakdown
  playerCoverage?: Record<string, PlayerTrackingQuality>;

  // Future audit fields: null when not measured (do NOT invent fake 0)
  idSwitchCount?: number | null;
  manualCorrectionCount?: number | null;
  manualCorrections?: number | null;

  // Backward compatibility fields
  detectionCoverage: number | null; // 0..1 (legacy alias = meanTargetCoverage)
  lostTimePercent: number | null; // 0..100 (%) (legacy alias = (1 - meanTargetCoverage) * 100)
  confidence: number | null; // 0..1 (mean observed confidence across all players)
  lowConfidenceWarning?: boolean;
}

export interface PlayerMovementMetrics {
  totalDistanceMeters: number;
  avgSpeedMps: number;
  p95SpeedMps: number;
  maxSpeedMps: number;
  courtCoverage: {
    frontPercent: number;
    midPercent: number;
    rearPercent: number;
    leftPercent: number;
    rightPercent: number;
  };
  basePosition: {
    avgCourtX: number | null;
    avgCourtY: number | null;
    dispersion: number;
  };
  lateralMovementMeters: number;
  frontBackMovementMeters: number;
}

export interface TrackingSummary {
  durationSeconds: number;
  sampleCount: number;
  players: Record<string, PlayerMovementMetrics>;
}

export interface TrackingAnalysis {
  id: string;
  projectId: string;
  pipelineRunId?: string;
  schemaVersion?: number;
  supersededBy?: string | null;
  sportType: 'badminton';
  gameType: 'singles' | 'doubles';
  trackedPlayerCount?: number;
  status: 'processing' | 'completed' | 'failed';
  videoFingerprint?: string;
  engineVersion: string;
  detectorModel: string;
  trackerModel: string;
  poseModel?: string;
  modelVersion?: string;
  modelArtifactHash?: string | null;
  runtime?: string | null;
  requestedDevice?: string | null;
  precision?: string | null;
  calibrationId?: string | null;
  calibrationVersion?: string | null;
  reviewState?: 'unreviewed' | 'reviewed' | 'corrected';
  /** @deprecated Legacy alias for measured effectiveStoredHz. Never use for configured targets. */
  sampleRateHz: number | null;
  nominalAnalysisHz?: number | null;
  effectiveStoredHz?: number | null;
  persistedTargetHz?: number | null;
  createdAt: string;
  completedAt?: string;
  device?: string;
  effectiveDevice?: string;
  runtimeProvenance?: TrackingRuntimeProvenance;
  calibrationTimeline?: TrackingCalibrationEvent[];
  /** Sparse image-space telemetry retained for faithful reload, including lost calibration intervals. */
  imageObservations?: TrackingImageObservation[];
  videoMetadata?: SourceVideoMetadata;
  researchMetadata?: CameraResearchMetadata;
  localFileName?: string;
  analyzedFrames?: number;
  totalFrames?: number;
  processingConfig?: ProcessingConfig;
  performance?: TrackingPerformanceStats;
  qualityStats?: TrackingQualityStats;
  players: TrackingPlayerMetadata[];
  quality?: TrackingQuality | null;
  summary: TrackingSummary;
}

export interface TrackingImageObservation {
  frameIndex: number;
  timestampSec: number;
  cameraSegmentId?: string;
  calibrationId?: string | null;
  calibrationState?: CalibrationState;
  players: TrackingImagePlayerObservation[];
}

export type TrackingImagePlayerObservation = Pick<TrackingPlayerV1,
  | 'playerId' | 'state' | 'bboxPct' | 'groundPointPct' | 'groundPointProvenance'
  | 'groundPositionM' | 'leftFootPx' | 'rightFootPx' | 'leftFootConfidence'
  | 'rightFootConfidence' | 'leftFootCourtM' | 'rightFootCourtM' | 'leftFoot' | 'rightFoot'
>;

export interface TrackingSample {
  timestamp: number; // seconds
  timestampSec?: number;
  timebase?: string | null;
  frameIndex?: number;
  playerId: string;
  athleteId?: string | null;
  courtX: number; // meters (0..6.10)
  courtY: number; // meters (0..13.40)
  speed: number | null; // m/s
  confidence: number | null; // 0..1
  trackingState: 'tracked' | 'predicted' | 'lost';
  observationState?: 'observed' | 'predicted' | 'interpolated' | 'manual' | null;
  groundPointProvenance?: import('../../types').GroundPointProvenance | null;
  reviewState?: 'unreviewed' | 'reviewed' | 'corrected' | null;
  sceneState?: string | null;
  pipelineRunId?: string;
  cameraSegmentId?: string;
  calibrationId?: string | null;
  calibrationVersion?: string | null;
  source?: string | null;
  supersededBy?: string | null;
  /** Breaks metric movement across invalid calibration intervals. */
  metricRunId?: number;
  normalizedX?: number; // 0..1
  normalizedY?: number; // 0..1
  canBuildHeatmap?: boolean;
  canUseCourtMetric?: boolean;
}

export interface TrackingSampleChunk {
  id: string; // `${analysisId}:${chunkIndex}`
  analysisId: string;
  chunkIndex: number;
  startTime: number;
  endTime: number;
  samples: TrackingSample[];
}

export interface TrackingTelemetryPage {
  id: string;
  analysisId: string;
  startCursor: number;
  endCursor: number;
  frames: TrackingTelemetryV1[];
}

export const MAX_TRACKING_PAGE_SIZE = 250;

export interface TrackingAnalysisPageOptions {
  projectId?: string;
  after?: string | null;
  limit?: number;
}

export interface TrackingAnalysisPage {
  analyses: TrackingAnalysis[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TrackingSamplePageOptions {
  afterChunkIndex?: number;
  limit?: number;
  startTime?: number;
  endTime?: number;
  playerId?: string;
}

export interface TrackingSamplePage {
  samples: TrackingSample[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface TrackingSampleChunkPage {
  chunks: TrackingSampleChunk[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface TrackingMovementMetricsResult {
  metrics: PlayerMovementMetrics;
  sampleCount: number;
  trackedSampleCount: number;
  predictedSampleCount: number;
  uniqueTimestampCount: number;
}

export interface TrackingCandidate {
  id: string;
  analysisId: string;
  timestamp: number;
  type: 'stroke_candidate' | 'rally_boundary' | 'id_switch_candidate';
  playerId?: string;
  confidence: number;
  details?: Record<string, unknown>;
}

export interface TrackingOrphanRepairResult {
  status: 'repaired' | 'no-orphans' | 'analysis-present';
  removed: { chunks: number; candidates: number; telemetryPages: number };
}

export interface TrackingStorageDriver {
  getAnalysis: (id: string) => Promise<TrackingAnalysis | null>;
  saveAnalysis: (analysis: TrackingAnalysis) => Promise<void>;
  listAnalyses: (projectId?: string) => Promise<TrackingAnalysis[]>;
  listAnalysisPage: (options: TrackingAnalysisPageOptions) => Promise<TrackingAnalysisPage>;
  getLatestAnalysis: (projectId?: string) => Promise<TrackingAnalysis | null>;
  deleteAnalysis: (id: string) => Promise<void>;
  repairOrphanedAnalysisData: (id: string) => Promise<TrackingOrphanRepairResult>;

  saveChunks: (chunks: TrackingSampleChunk[]) => Promise<void>;
  getChunks: (analysisId: string, afterChunkIndex?: number, limit?: number) => Promise<TrackingSampleChunk[]>;
  deleteChunks: (analysisId: string) => Promise<void>;
  saveTelemetryPage: (page: TrackingTelemetryPage) => Promise<void>;
  getTelemetryPage: (analysisId: string, afterCursor: number) => Promise<TrackingTelemetryPage | null>;
  deleteTelemetryPages: (analysisId: string) => Promise<void>;

  saveCandidate: (candidate: TrackingCandidate) => Promise<void>;
  getCandidates: (analysisId: string) => Promise<TrackingCandidate[]>;
  deleteCandidates: (analysisId: string) => Promise<void>;
}


export const TRACKING_STORE_NAMES = [
  'trackingAnalyses',
  'trackingSampleChunks',
  'trackingCandidates',
  'trackingTelemetryPages',
] as const;

export interface TrackingDatabaseSchemaTarget {
  objectStoreNames: { contains: (name: string) => boolean };
  createObjectStore: (name: string) => unknown;
}

export function observationStateForSample(player: TrackingTelemetryV1['players'][number]) {
  return player.state === 'lost'
    ? null
    : player.observationState ?? (player.state === 'predicted' ? 'predicted' : 'observed');
}

export function trackingAnalysisTime(analysis: TrackingAnalysis): number {
  const value = Date.parse(analysis.completedAt || analysis.createdAt);
  return Number.isFinite(value) ? value : 0;
}

export function compareAnalysesNewestFirst(left: TrackingAnalysis, right: TrackingAnalysis): number {
  const timeDifference = trackingAnalysisTime(right) - trackingAnalysisTime(left);
  if (timeDifference !== 0) return timeDifference;
  return left.id === right.id ? 0 : left.id < right.id ? 1 : -1;
}

export function boundedPageSize(value: number | undefined): number {
  return Math.max(1, Math.min(MAX_TRACKING_PAGE_SIZE, Math.floor(value ?? MAX_TRACKING_PAGE_SIZE)));
}

export interface SinglePlayerMetricsResult {
  metrics: PlayerMovementMetrics;
  validSpeeds: number[];
  trackedCount: number;
  sumX: number;
  sumY: number;
  frontCount: number;
  midCount: number;
  rearCount: number;
  leftCount: number;
  rightCount: number;
}

export interface TrackingMovementMetricsOptions {
  startTime?: number;
  endTime?: number;
  playerId?: string;
  signal?: AbortSignal;
}
