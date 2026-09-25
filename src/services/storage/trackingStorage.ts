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
import { isMetricCalibrationValid } from '../../types/calibration';
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
  sportType: 'badminton';
  gameType: 'singles' | 'doubles';
  trackedPlayerCount?: number;
  status: 'processing' | 'completed' | 'failed';
  videoFingerprint?: string;
  engineVersion: string;
  detectorModel: string;
  trackerModel: string;
  poseModel?: string;
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
  playerId: string;
  courtX: number; // meters (0..6.10)
  courtY: number; // meters (0..13.40)
  speed: number | null; // m/s
  confidence: number | null; // 0..1
  trackingState: 'tracked' | 'predicted' | 'lost';
  cameraSegmentId?: string;
  calibrationId?: string | null;
  /** Breaks metric movement across invalid calibration intervals. */
  metricRunId?: number;
  normalizedX?: number; // 0..1
  normalizedY?: number; // 0..1
}

export interface TrackingSampleChunk {
  id: string; // `${analysisId}:${chunkIndex}`
  analysisId: string;
  chunkIndex: number;
  startTime: number;
  endTime: number;
  samples: TrackingSample[];
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

export interface TrackingStorageDriver {
  getAnalysis: (id: string) => Promise<TrackingAnalysis | null>;
  saveAnalysis: (analysis: TrackingAnalysis) => Promise<void>;
  listAnalyses: (projectId?: string) => Promise<TrackingAnalysis[]>;
  deleteAnalysis: (id: string) => Promise<void>;

  saveChunks: (chunks: TrackingSampleChunk[]) => Promise<void>;
  getChunks: (analysisId: string) => Promise<TrackingSampleChunk[]>;
  deleteChunks: (analysisId: string) => Promise<void>;

  saveCandidate: (candidate: TrackingCandidate) => Promise<void>;
  getCandidates: (analysisId: string) => Promise<TrackingCandidate[]>;
  deleteCandidates: (analysisId: string) => Promise<void>;
}

// -------------------------------------------------------------
// IndexedDB driver with stores: trackingAnalyses, trackingSampleChunks, trackingCandidates
// -------------------------------------------------------------
const DB_NAME = 'sportscout-tracking-v1';
const DB_VERSION = 2;
export const TRACKING_STORE_NAMES = [
  'trackingAnalyses',
  'trackingSampleChunks',
  'trackingCandidates',
] as const;

export interface TrackingDatabaseSchemaTarget {
  objectStoreNames: { contains: (name: string) => boolean };
  createObjectStore: (name: string) => unknown;
}

/** Ensure the complete tracking schema is created in the same upgrade. */
export function ensureTrackingObjectStores(db: TrackingDatabaseSchemaTarget): void {
  for (const storeName of TRACKING_STORE_NAMES) {
    if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
  }
}

let trackingDbPromise: Promise<IDBDatabase | null> | null = null;

function openTrackingDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  if (trackingDbPromise) return trackingDbPromise;

  trackingDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => ensureTrackingObjectStores(request.result);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        trackingDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to open tracking storage'));
    request.onblocked = () => reject(new Error('Tracking storage upgrade is blocked by another tab. Close other SportsScout tabs and retry.'));
  }).catch(error => {
    trackingDbPromise = null;
    throw error;
  });

  return trackingDbPromise;
}

function transactionError(tx: IDBTransaction): Error {
  return tx.error ?? new Error('Tracking storage transaction failed');
}

export class IndexedDbTrackingDriver implements TrackingStorageDriver {
  async getAnalysis(id: string): Promise<TrackingAnalysis | null> {
    const db = await openTrackingDatabase();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('trackingAnalyses', 'readonly');
      const request = tx.objectStore('trackingAnalyses').get(id);
      request.onsuccess = () => resolve((request.result as TrackingAnalysis | undefined) ?? null);
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.onerror = () => reject(transactionError(tx));
    });
  }

  async saveAnalysis(analysis: TrackingAnalysis): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingAnalyses', 'readwrite');
      tx.objectStore('trackingAnalyses').put(analysis, analysis.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }

  async listAnalyses(projectId?: string): Promise<TrackingAnalysis[]> {
    const db = await openTrackingDatabase();
    if (!db) return [];
    const items = await new Promise<TrackingAnalysis[]>((resolve, reject) => {
      const tx = db.transaction('trackingAnalyses', 'readonly');
      const request = tx.objectStore('trackingAnalyses').getAll();
      request.onsuccess = () => resolve(request.result as TrackingAnalysis[]);
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.onerror = () => reject(transactionError(tx));
    });
    if (projectId) {
      return items.filter((a) => a.projectId === projectId);
    }
    return items;
  }

  async deleteAnalysis(id: string): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingAnalyses', 'readwrite');
      tx.objectStore('trackingAnalyses').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
    await this.deleteChunks(id);
    await this.deleteCandidates(id);
  }

  async saveChunks(chunks: TrackingSampleChunk[]): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db || chunks.length === 0) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingSampleChunks', 'readwrite');
      const store = tx.objectStore('trackingSampleChunks');
      for (const chunk of chunks) store.put(chunk, chunk.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }

  async getChunks(analysisId: string): Promise<TrackingSampleChunk[]> {
    const db = await openTrackingDatabase();
    if (!db) return [];
    const all = await new Promise<TrackingSampleChunk[]>((resolve, reject) => {
      const tx = db.transaction('trackingSampleChunks', 'readonly');
      const request = tx.objectStore('trackingSampleChunks').getAll();
      request.onsuccess = () => resolve(request.result as TrackingSampleChunk[]);
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.onerror = () => reject(transactionError(tx));
    });
    return all
      .filter((c) => c.analysisId === analysisId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async deleteChunks(analysisId: string): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingSampleChunks', 'readwrite');
      const store = tx.objectStore('trackingSampleChunks');
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if ((cursor.value as TrackingSampleChunk).analysisId === analysisId) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }

  async saveCandidate(candidate: TrackingCandidate): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingCandidates', 'readwrite');
      tx.objectStore('trackingCandidates').put(candidate, candidate.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }

  async getCandidates(analysisId: string): Promise<TrackingCandidate[]> {
    const db = await openTrackingDatabase();
    if (!db) return [];
    const all = await new Promise<TrackingCandidate[]>((resolve, reject) => {
      const tx = db.transaction('trackingCandidates', 'readonly');
      const request = tx.objectStore('trackingCandidates').getAll();
      request.onsuccess = () => resolve(request.result as TrackingCandidate[]);
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.onerror = () => reject(transactionError(tx));
    });
    return all
      .filter((c) => c.analysisId === analysisId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async deleteCandidates(analysisId: string): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingCandidates', 'readwrite');
      const store = tx.objectStore('trackingCandidates');
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if ((cursor.value as TrackingCandidate).analysisId === analysisId) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }
}

/*
 * The previous implementation used idb-keyval.createStore three times against
 * one database name. Those handles could race during the first upgrade and
 * leave the database missing one of the requested stores. The native driver
 * above owns one versioned schema so every transaction has a guaranteed store.
 */

// -------------------------------------------------------------
// In-Memory Driver for Unit Testing / Environments without IndexedDB
// -------------------------------------------------------------
export class MemoryTrackingDriver implements TrackingStorageDriver {
  private analyses = new Map<string, TrackingAnalysis>();
  private chunks = new Map<string, TrackingSampleChunk>();
  private candidates = new Map<string, TrackingCandidate>();

  async getAnalysis(id: string): Promise<TrackingAnalysis | null> {
    return this.analyses.get(id) ?? null;
  }

  async saveAnalysis(analysis: TrackingAnalysis): Promise<void> {
    this.analyses.set(analysis.id, { ...analysis });
  }

  async listAnalyses(projectId?: string): Promise<TrackingAnalysis[]> {
    const list = Array.from(this.analyses.values());
    if (projectId) return list.filter((a) => a.projectId === projectId);
    return list;
  }

  async deleteAnalysis(id: string): Promise<void> {
    this.analyses.delete(id);
    await this.deleteChunks(id);
    await this.deleteCandidates(id);
  }

  async saveChunks(chunks: TrackingSampleChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, { ...chunk });
    }
  }

  async getChunks(analysisId: string): Promise<TrackingSampleChunk[]> {
    return Array.from(this.chunks.values())
      .filter((c) => c.analysisId === analysisId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async deleteChunks(analysisId: string): Promise<void> {
    for (const [key, val] of this.chunks.entries()) {
      if (val.analysisId === analysisId) {
        this.chunks.delete(key);
      }
    }
  }

  async saveCandidate(candidate: TrackingCandidate): Promise<void> {
    this.candidates.set(candidate.id, { ...candidate });
  }

  async getCandidates(analysisId: string): Promise<TrackingCandidate[]> {
    return Array.from(this.candidates.values())
      .filter((c) => c.analysisId === analysisId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async deleteCandidates(analysisId: string): Promise<void> {
    for (const [key, val] of this.candidates.entries()) {
      if (val.analysisId === analysisId) {
        this.candidates.delete(key);
      }
    }
  }
}

// Default driver
let activeDriver: TrackingStorageDriver = new IndexedDbTrackingDriver();

export function setTrackingStorageDriver(driver: TrackingStorageDriver): void {
  activeDriver = driver;
}

export function getTrackingStorageDriver(): TrackingStorageDriver {
  return activeDriver;
}

export function getLatestTrackingAnalysis(analyses: TrackingAnalysis[]): TrackingAnalysis | null {
  if (!analyses || analyses.length === 0) return null;
  const sorted = [...analyses].sort((a, b) => {
    const timeA = new Date(a.completedAt || a.createdAt).getTime();
    const timeB = new Date(b.completedAt || b.createdAt).getTime();
    return timeB - timeA;
  });
  return sorted[0] ?? null;
}

export async function loadBadmintonTrackingAnalysis(projectId: string): Promise<TrackingAnalysis | null> {
  const list = await listTrackingAnalyses(projectId);
  return getLatestTrackingAnalysis(list);
}

// -------------------------------------------------------------
// Movement & Quality Metrics Calculation
// -------------------------------------------------------------

/**
 * Robust 95th Percentile calculation
 */
export function calculateP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  return Number(sorted[idx].toFixed(2));
}

/**
 * Calculates nominal video-domain analysis cadence (Hz) from source FPS and frame stride.
 * Formula: sourceFps / frameStride.
 * Returns null if sourceFps or frameStride is missing, <= 0, or not finite.
 */
export function calculateNominalAnalysisHz(
  sourceFps: number | null | undefined,
  frameStride: number | null | undefined
): number | null {
  if (
    sourceFps === null ||
    sourceFps === undefined ||
    !Number.isFinite(sourceFps) ||
    sourceFps <= 0
  ) {
    return null;
  }
  if (
    frameStride === null ||
    frameStride === undefined ||
    !Number.isFinite(frameStride) ||
    frameStride <= 0
  ) {
    return null;
  }
  const hz = sourceFps / frameStride;
  return Number.isFinite(hz) && hz > 0 ? Number(hz.toFixed(2)) : null;
}

/**
 * Calculates effective stored cadence (Hz) from sample count and video duration.
 * Formula: sampleCount / durationSec.
 * Returns null if durationSec is missing, <= 0, or sampleCount <= 0.
 */
export function calculateEffectiveStoredHz(
  sampleCount: number | null | undefined,
  durationSec: number | null | undefined
): number | null {
  if (
    sampleCount === null ||
    sampleCount === undefined ||
    !Number.isFinite(sampleCount) ||
    sampleCount <= 0
  ) {
    return null;
  }
  if (
    durationSec === null ||
    durationSec === undefined ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  ) {
    return null;
  }
  const hz = sampleCount / durationSec;
  return Number.isFinite(hz) && hz > 0 ? Number(hz.toFixed(1)) : null;
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

/**
 * Calculates movement metrics for a single player's samples.
 * Only connects consecutive tracked samples of the same player in chronological order.
 */
export function computeSinglePlayerMovementMetrics(
  samples: TrackingSample[],
  canonicalTotalDist?: number
): SinglePlayerMetricsResult {
  if (samples.length === 0) {
    return {
      metrics: {
        totalDistanceMeters: canonicalTotalDist !== undefined ? Number(canonicalTotalDist.toFixed(2)) : 0,
        avgSpeedMps: 0,
        p95SpeedMps: 0,
        maxSpeedMps: 0,
        courtCoverage: {
          frontPercent: 0,
          midPercent: 0,
          rearPercent: 0,
          leftPercent: 0,
          rightPercent: 0,
        },
        basePosition: { avgCourtX: null, avgCourtY: null, dispersion: 0 },
        lateralMovementMeters: 0,
        frontBackMovementMeters: 0,
      },
      validSpeeds: [],
      trackedCount: 0,
      sumX: 0,
      sumY: 0,
      frontCount: 0,
      midCount: 0,
      rearCount: 0,
      leftCount: 0,
      rightCount: 0,
    };
  }

  // Ensure chronological order
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);

  let totalDist = 0;
  let lateralDist = 0;
  let frontBackDist = 0;
  const validSpeeds: number[] = [];
  let sumX = 0;
  let sumY = 0;
  let trackedCount = 0;

  let frontCount = 0;
  let midCount = 0;
  let rearCount = 0;
  let leftCount = 0;
  let rightCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.trackingState !== 'tracked') continue;

    trackedCount++;
    sumX += s.courtX;
    sumY += s.courtY;

    // Badminton court: length 13.40m, width 6.10m. Net is at Y = 6.70m.
    const distToNet = Math.abs(6.70 - s.courtY);
    if (distToNet <= 2.2) {
      frontCount++;
    } else if (distToNet <= 4.4) {
      midCount++;
    } else {
      rearCount++;
    }

    if (s.courtX < 3.05) {
      leftCount++;
    } else {
      rightCount++;
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.trackingState === 'tracked' &&
          (s.metricRunId === undefined || prev.metricRunId === undefined || s.metricRunId === prev.metricRunId) &&
          (s.calibrationId === undefined || prev.calibrationId === undefined || s.calibrationId === prev.calibrationId) &&
          (s.cameraSegmentId === undefined || prev.cameraSegmentId === undefined || s.cameraSegmentId === prev.cameraSegmentId)) {
        const dx = s.courtX - prev.courtX;
        const dy = s.courtY - prev.courtY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Teleport filter: badminton players can't move > 12 m/s
        const dt = Math.max(0.001, s.timestamp - prev.timestamp);
        const instantSpeed = dist / dt;
        if (instantSpeed <= 12.0) {
          totalDist += dist;
          lateralDist += Math.abs(dx);
          frontBackDist += Math.abs(dy);
          validSpeeds.push(instantSpeed);
        }
      }
    }
  }

  const avgSpeed = validSpeeds.length > 0 ? validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length : 0;
  const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 0;
  const p95Speed = calculateP95(validSpeeds);

  const avgX = trackedCount > 0 ? sumX / trackedCount : null;
  const avgY = trackedCount > 0 ? sumY / trackedCount : null;

  // Dispersion: average Euclidean distance from base position
  let totalDispersion = 0;
  if (trackedCount > 0 && avgX !== null && avgY !== null) {
    for (const s of sorted) {
      if (s.trackingState !== 'tracked') continue;
      const dx = s.courtX - avgX;
      const dy = s.courtY - avgY;
      totalDispersion += Math.sqrt(dx * dx + dy * dy);
    }
  }
  const dispersion = trackedCount > 0 ? totalDispersion / trackedCount : 0;

  const validCount = Math.max(1, trackedCount);
  const effectiveTotalDist = canonicalTotalDist !== undefined ? canonicalTotalDist : totalDist;

  const metrics: PlayerMovementMetrics = {
    totalDistanceMeters: Number(effectiveTotalDist.toFixed(2)),
    avgSpeedMps: Number(avgSpeed.toFixed(2)),
    p95SpeedMps: Number(p95Speed.toFixed(2)),
    maxSpeedMps: Number(maxSpeed.toFixed(2)),
    courtCoverage: {
      frontPercent: trackedCount > 0 ? Number(((frontCount / validCount) * 100).toFixed(1)) : 0,
      midPercent: trackedCount > 0 ? Number(((midCount / validCount) * 100).toFixed(1)) : 0,
      rearPercent: trackedCount > 0 ? Number(((rearCount / validCount) * 100).toFixed(1)) : 0,
      leftPercent: trackedCount > 0 ? Number(((leftCount / validCount) * 100).toFixed(1)) : 0,
      rightPercent: trackedCount > 0 ? Number(((rightCount / validCount) * 100).toFixed(1)) : 0,
    },
    basePosition: {
      avgCourtX: avgX !== null ? Number(avgX.toFixed(2)) : null,
      avgCourtY: avgY !== null ? Number(avgY.toFixed(2)) : null,
      dispersion: Number(dispersion.toFixed(2)),
    },
    lateralMovementMeters: Number(lateralDist.toFixed(2)),
    frontBackMovementMeters: Number(frontBackDist.toFixed(2)),
  };

  return {
    metrics,
    validSpeeds,
    trackedCount,
    sumX,
    sumY,
    frontCount,
    midCount,
    rearCount,
    leftCount,
    rightCount,
  };
}

/**
 * Calculates aggregated movement metrics for multiple players (ALL mode).
 * Guarantees that physical movement calculations only connect samples belonging
 * to the SAME playerId.
 */
export function computeMultiPlayerMovementMetrics(samples: TrackingSample[]): PlayerMovementMetrics {
  if (samples.length === 0) {
    return {
      totalDistanceMeters: 0,
      avgSpeedMps: 0,
      p95SpeedMps: 0,
      maxSpeedMps: 0,
      courtCoverage: {
        frontPercent: 0,
        midPercent: 0,
        rearPercent: 0,
        leftPercent: 0,
        rightPercent: 0,
      },
      basePosition: { avgCourtX: null, avgCourtY: null, dispersion: 0 },
      lateralMovementMeters: 0,
      frontBackMovementMeters: 0,
    };
  }

  // 1. Group by playerId
  const playerMap = new Map<string, TrackingSample[]>();
  for (const s of samples) {
    let list = playerMap.get(s.playerId);
    if (!list) {
      list = [];
      playerMap.set(s.playerId, list);
    }
    list.push(s);
  }

  // 2. Calculate each player's movement metrics independently
  let aggregateTotalDist = 0;
  let aggregateLateralDist = 0;
  let aggregateFrontBackDist = 0;
  const pooledSpeeds: number[] = [];

  let totalTrackedCount = 0;
  let totalSumX = 0;
  let totalSumY = 0;
  let totalFrontCount = 0;
  let totalMidCount = 0;
  let totalRearCount = 0;
  let totalLeftCount = 0;
  let totalRightCount = 0;

  for (const [, pSamples] of playerMap.entries()) {
    const singleResult = computeSinglePlayerMovementMetrics(pSamples);
    aggregateTotalDist += singleResult.metrics.totalDistanceMeters;
    aggregateLateralDist += singleResult.metrics.lateralMovementMeters;
    aggregateFrontBackDist += singleResult.metrics.frontBackMovementMeters;
    pooledSpeeds.push(...singleResult.validSpeeds);

    totalTrackedCount += singleResult.trackedCount;
    totalSumX += singleResult.sumX;
    totalSumY += singleResult.sumY;
    totalFrontCount += singleResult.frontCount;
    totalMidCount += singleResult.midCount;
    totalRearCount += singleResult.rearCount;
    totalLeftCount += singleResult.leftCount;
    totalRightCount += singleResult.rightCount;
  }

  // 3. Aggregate speeds from pooled valid same-player speed observations
  const avgSpeed = pooledSpeeds.length > 0 ? pooledSpeeds.reduce((a, b) => a + b, 0) / pooledSpeeds.length : 0;
  const maxSpeed = pooledSpeeds.length > 0 ? Math.max(...pooledSpeeds) : 0;
  const p95Speed = calculateP95(pooledSpeeds);

  // 4. Combined occupancy centroid and dispersion
  const avgX = totalTrackedCount > 0 ? totalSumX / totalTrackedCount : null;
  const avgY = totalTrackedCount > 0 ? totalSumY / totalTrackedCount : null;

  let totalDispersion = 0;
  if (totalTrackedCount > 0 && avgX !== null && avgY !== null) {
    for (const s of samples) {
      if (s.trackingState !== 'tracked') continue;
      const dx = s.courtX - avgX;
      const dy = s.courtY - avgY;
      totalDispersion += Math.sqrt(dx * dx + dy * dy);
    }
  }
  const dispersion = totalTrackedCount > 0 ? totalDispersion / totalTrackedCount : 0;

  const validCount = Math.max(1, totalTrackedCount);

  return {
    totalDistanceMeters: Number(aggregateTotalDist.toFixed(2)),
    avgSpeedMps: Number(avgSpeed.toFixed(2)),
    p95SpeedMps: Number(p95Speed.toFixed(2)),
    maxSpeedMps: Number(maxSpeed.toFixed(2)),
    courtCoverage: {
      frontPercent: totalTrackedCount > 0 ? Number(((totalFrontCount / validCount) * 100).toFixed(1)) : 0,
      midPercent: totalTrackedCount > 0 ? Number(((totalMidCount / validCount) * 100).toFixed(1)) : 0,
      rearPercent: totalTrackedCount > 0 ? Number(((totalRearCount / validCount) * 100).toFixed(1)) : 0,
      leftPercent: totalTrackedCount > 0 ? Number(((totalLeftCount / validCount) * 100).toFixed(1)) : 0,
      rightPercent: totalTrackedCount > 0 ? Number(((totalRightCount / validCount) * 100).toFixed(1)) : 0,
    },
    basePosition: {
      avgCourtX: avgX !== null ? Number(avgX.toFixed(2)) : null,
      avgCourtY: avgY !== null ? Number(avgY.toFixed(2)) : null,
      dispersion: Number(dispersion.toFixed(2)),
    },
    lateralMovementMeters: Number(aggregateLateralDist.toFixed(2)),
    frontBackMovementMeters: Number(aggregateFrontBackDist.toFixed(2)),
  };
}

/**
 * Calculates court distance and movement metrics for a set of samples.
 * If samples belong to multiple players, groups by playerId and aggregates
 * to guarantee that physical movement calculations only connect samples of the same player.
 */
export function computePlayerMovementMetrics(samples: TrackingSample[], canonicalTotalDist?: number): PlayerMovementMetrics {
  if (samples.length === 0) {
    return computeSinglePlayerMovementMetrics([], canonicalTotalDist).metrics;
  }

  // Check if multiple playerIds are present
  const firstPlayerId = samples[0].playerId;
  let hasMultiplePlayers = false;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].playerId !== firstPlayerId) {
      hasMultiplePlayers = true;
      break;
    }
  }

  if (hasMultiplePlayers) {
    return computeMultiPlayerMovementMetrics(samples);
  }

  return computeSinglePlayerMovementMetrics(samples, canonicalTotalDist).metrics;
}

/**
 * Computes multi-target tracking quality metrics.
 * Separates per-athlete quality from session-level multi-target quality.
 * OBSERVED: fresh measurement exists.
 * PREDICTED: estimated without fresh observation (not observed).
 * LOST: no reliable state (not observed).
 */
export function computeTrackingQuality(
  frames: TrackingTelemetryV1[],
  canonicalPlayerIds?: string[]
): TrackingQuality {
  if (frames.length === 0) {
    return {
      meanTargetCoverage: null,
      simultaneousTargetCoverage: null,
      fullyObservedFrameCount: 0,
      partiallyObservedFrameCount: 0,
      fullyLostFrameCount: 0,
      predictedPercent: null,
      lostPercent: null,
      playerCoverage: {},
      idSwitchCount: null,
      manualCorrectionCount: null,
      manualCorrections: null,
      detectionCoverage: null,
      lostTimePercent: null,
      confidence: null,
    };
  }

  // 1. Identify all expected player targets
  const expectedSet = new Set<string>();
  if (canonicalPlayerIds) {
    for (const pId of canonicalPlayerIds) expectedSet.add(pId);
  }
  for (const f of frames) {
    for (const p of f.players) {
      if (p.playerId) expectedSet.add(p.playerId);
    }
  }
  const expectedPlayerIds = Array.from(expectedSet).sort();

  if (expectedPlayerIds.length === 0) {
    return {
      meanTargetCoverage: null,
      simultaneousTargetCoverage: null,
      fullyObservedFrameCount: 0,
      partiallyObservedFrameCount: 0,
      fullyLostFrameCount: 0,
      predictedPercent: null,
      lostPercent: null,
      playerCoverage: {},
      idSwitchCount: null,
      manualCorrectionCount: null,
      manualCorrections: null,
      detectionCoverage: null,
      lostTimePercent: null,
      confidence: null,
    };
  }

  // 2. Tally frame counts per player and frame-level simultaneous observation
  interface PlayerTally {
    observed: number;
    predicted: number;
    lost: number;
    confidenceSum: number;
    confidenceCount: number;
  }
  const tallies = new Map<string, PlayerTally>();
  for (const pId of expectedPlayerIds) {
    tallies.set(pId, { observed: 0, predicted: 0, lost: 0, confidenceSum: 0, confidenceCount: 0 });
  }

  let fullyObservedFrameCount = 0;
  let partiallyObservedFrameCount = 0;
  let fullyLostFrameCount = 0;

  for (const f of frames) {
    let observedInFrame = 0;

    for (const pId of expectedPlayerIds) {
      const tally = tallies.get(pId)!;
      const p = f.players.find((x) => x.playerId === pId);
      if (!p || p.state === 'lost') {
        tally.lost++;
      } else if (p.state === 'predicted') {
        tally.predicted++;
      } else if (p.state === 'observed') {
        tally.observed++;
        observedInFrame++;
        if (typeof p.detectionConfidence === 'number') {
          tally.confidenceSum += p.detectionConfidence;
          tally.confidenceCount++;
        }
      } else {
        tally.lost++;
      }
    }

    if (expectedPlayerIds.length > 0) {
      if (observedInFrame === expectedPlayerIds.length) {
        fullyObservedFrameCount++;
      } else if (observedInFrame > 0) {
        partiallyObservedFrameCount++;
      } else {
        fullyLostFrameCount++;
      }
    }
  }

  // 3. Compute per-player metrics
  const playerCoverage: Record<string, PlayerTrackingQuality> = {};
  let totalObservedConfidenceSum = 0;
  let totalObservedConfidenceCount = 0;
  let totalCoverageSum = 0;
  let totalPredictedCount = 0;
  let totalLostCount = 0;

  const totalEligibleSessionFrames = frames.length;

  for (const pId of expectedPlayerIds) {
    const tally = tallies.get(pId)!;
    const eligibleFrames = totalEligibleSessionFrames;
    const detectionCoverage = eligibleFrames > 0 ? Number((tally.observed / eligibleFrames).toFixed(2)) : 0;
    const predictedPercent = eligibleFrames > 0 ? Number(((tally.predicted / eligibleFrames) * 100).toFixed(1)) : 0;
    const lostPercent = eligibleFrames > 0 ? Number(((tally.lost / eligibleFrames) * 100).toFixed(1)) : 0;
    const meanObservedConfidence = tally.confidenceCount > 0
      ? Number((tally.confidenceSum / tally.confidenceCount).toFixed(2))
      : null;

    playerCoverage[pId] = {
      playerId: pId,
      observedFrameCount: tally.observed,
      predictedFrameCount: tally.predicted,
      lostFrameCount: tally.lost,
      detectionCoverage,
      predictedPercent,
      lostPercent,
      meanObservedConfidence,
      idSwitchCount: null,
      manualCorrectionCount: null,
    };

    totalCoverageSum += detectionCoverage;
    totalObservedConfidenceSum += tally.confidenceSum;
    totalObservedConfidenceCount += tally.confidenceCount;
    totalPredictedCount += tally.predicted;
    totalLostCount += tally.lost;
  }

  // 4. Session Multi-Target Aggregates
  const targetCount = expectedPlayerIds.length;
  const meanTargetCoverage = Number((totalCoverageSum / targetCount).toFixed(2));
  const simultaneousTargetCoverage = totalEligibleSessionFrames > 0
    ? Number((fullyObservedFrameCount / totalEligibleSessionFrames).toFixed(2))
    : null;

  const totalPlayerTargetSlots = targetCount * totalEligibleSessionFrames;
  const sessionPredictedPercent = totalPlayerTargetSlots > 0 ? Number(((totalPredictedCount / totalPlayerTargetSlots) * 100).toFixed(1)) : 0;
  const sessionLostPercent = totalPlayerTargetSlots > 0 ? Number(((totalLostCount / totalPlayerTargetSlots) * 100).toFixed(1)) : 0;

  const meanConfidence = totalObservedConfidenceCount > 0
    ? Number((totalObservedConfidenceSum / totalObservedConfidenceCount).toFixed(2))
    : null;
  const lowConfidenceWarning = meanTargetCoverage < 0.5 || (meanConfidence !== null && meanConfidence < 0.6);

  return {
    meanTargetCoverage,
    simultaneousTargetCoverage,
    fullyObservedFrameCount,
    partiallyObservedFrameCount,
    fullyLostFrameCount,
    predictedPercent: sessionPredictedPercent,
    lostPercent: sessionLostPercent,
    playerCoverage,
    idSwitchCount: null,
    manualCorrectionCount: null,
    manualCorrections: null,
    detectionCoverage: meanTargetCoverage,
    lostTimePercent: Number(Math.max(0, (1 - meanTargetCoverage) * 100).toFixed(1)),
    confidence: meanConfidence,
    lowConfidenceWarning,
  };
}

/**
 * Downsamples frames to targetHz (e.g. 10 Hz) and partitions them into chunks (e.g. 15 seconds each)
 */
export function downsampleAndChunkTrackingSamples(
  analysisId: string,
  frames: TrackingTelemetryV1[],
  targetHz = 10,
  chunkDurationSec = 15,
  canonicalPlayerMetrics?: Record<string, { totalDistanceM?: number }>
): {
  chunks: TrackingSampleChunk[];
  summary: TrackingSummary;
  quality: TrackingQuality;
  calibrationTimeline: TrackingCalibrationEvent[];
  imageObservations: TrackingImageObservation[];
} {
  if (frames.length === 0) {
    return {
      chunks: [],
      summary: { durationSeconds: 0, sampleCount: 0, players: {} },
      quality: computeTrackingQuality([], canonicalPlayerMetrics ? Object.keys(canonicalPlayerMetrics) : undefined),
      calibrationTimeline: [],
      imageObservations: [],
    };
  }

  const calibrationTimeline: TrackingCalibrationEvent[] = [];
  let priorCalibrationKey: string | null = null;
  let metricRunId = 0;
  const runIds = new Map<TrackingTelemetryV1, number>();
  for (const frame of frames) {
    if (frame.calibrationState !== undefined) {
      const key = `${frame.cameraSegmentId ?? ''}:${frame.calibrationId ?? ''}:${frame.calibrationState}`;
      if (key !== priorCalibrationKey) {
        calibrationTimeline.push({
          frameIndex: frame.frameIndex,
          timestampSec: frame.timestampSec,
          cameraSegmentId: frame.cameraSegmentId,
          calibrationId: frame.calibrationId,
          state: frame.calibrationState,
          provenance: frame.calibration ?? null,
        });
      }
      if (!isMetricCalibrationValid(frame) || (priorCalibrationKey !== null && key !== priorCalibrationKey)) {
        metricRunId++;
      }
      priorCalibrationKey = key;
    }
    runIds.set(frame, metricRunId);
  }

  // 1. Full-Rate Processing for Canonical Movement Metrics
  const fullRatePlayerSamples = new Map<string, TrackingSample[]>();
  const lastTotalDistances = new Map<string, number>();
  const imageObservations: TrackingImageObservation[] = [];
  let lastImageObservationTimestamp = -1;
  const imageObservationInterval = 1 / targetHz;

  for (const frame of frames) {
    if (lastImageObservationTimestamp < 0 ||
        frame.timestampSec - lastImageObservationTimestamp >= imageObservationInterval * 0.95) {
      const metricValid = isMetricCalibrationValid(frame);
      imageObservations.push({
        frameIndex: frame.frameIndex,
        timestampSec: frame.timestampSec,
        cameraSegmentId: frame.cameraSegmentId,
        calibrationId: frame.calibrationId,
        calibrationState: frame.calibrationState,
        players: frame.players.map(player => {
          const observation: TrackingImagePlayerObservation = {
            playerId: player.playerId,
            state: player.state,
            bboxPct: player.bboxPct,
            groundPointPct: player.groundPointPct,
            groundPointProvenance: player.groundPointProvenance,
            groundPositionM: player.groundPositionM,
            leftFootPx: player.leftFootPx,
            rightFootPx: player.rightFootPx,
            leftFootConfidence: player.leftFootConfidence,
            rightFootConfidence: player.rightFootConfidence,
            leftFootCourtM: player.leftFootCourtM,
            rightFootCourtM: player.rightFootCourtM,
            leftFoot: player.leftFoot,
            rightFoot: player.rightFoot,
          };
          return metricValid ? observation : {
            ...observation,
            groundPositionM: null,
            leftFootCourtM: null,
            rightFootCourtM: null,
            leftFoot: observation.leftFoot ? { ...observation.leftFoot, courtPositionM: null } : observation.leftFoot,
            rightFoot: observation.rightFoot ? { ...observation.rightFoot, courtPositionM: null } : observation.rightFoot,
          };
        }),
      });
      lastImageObservationTimestamp = frame.timestampSec;
    }

    if (!isMetricCalibrationValid(frame)) continue;
    for (const p of frame.players) {
      if (typeof p.totalDistanceM === 'number') {
        lastTotalDistances.set(p.playerId, p.totalDistanceM);
      }
      if (!p.courtPosition) continue;

      const sample: TrackingSample = {
        timestamp: frame.timestampSec,
        playerId: p.playerId,
        courtX: Number(p.courtPosition.xM.toFixed(2)),
        courtY: Number(p.courtPosition.yM.toFixed(2)),
        speed: typeof p.speedMps === 'number' ? Number(p.speedMps.toFixed(2)) : null,
        confidence: typeof p.detectionConfidence === 'number' ? Number(p.detectionConfidence.toFixed(2)) : null,
        trackingState: p.state === 'lost' ? 'lost' : p.state === 'predicted' ? 'predicted' : 'tracked',
        cameraSegmentId: frame.cameraSegmentId,
        calibrationId: frame.calibrationId,
        metricRunId: runIds.get(frame),
        normalizedX: Number((p.courtPosition.xPct / 100).toFixed(3)),
        normalizedY: Number((p.courtPosition.yPct / 100).toFixed(3)),
      };

      if (!fullRatePlayerSamples.has(p.playerId)) {
        fullRatePlayerSamples.set(p.playerId, []);
      }
      fullRatePlayerSamples.get(p.playerId)!.push(sample);
    }
  }

  // 2. Downsample to targetHz for Chunks & Storage Persistence
  const sampleInterval = 1 / targetHz;
  const downsampledSamples: TrackingSample[] = [];
  let lastTimestamp = -1;

  for (const frame of frames) {
    if (!isMetricCalibrationValid(frame)) continue;
    if (lastTimestamp >= 0 && frame.timestampSec - lastTimestamp < sampleInterval * 0.95) {
      continue;
    }
    lastTimestamp = frame.timestampSec;

    for (const p of frame.players) {
      if (!p.courtPosition) continue;
      const sample: TrackingSample = {
        timestamp: frame.timestampSec,
        playerId: p.playerId,
        courtX: Number(p.courtPosition.xM.toFixed(2)),
        courtY: Number(p.courtPosition.yM.toFixed(2)),
        speed: typeof p.speedMps === 'number' ? Number(p.speedMps.toFixed(2)) : null,
        confidence: typeof p.detectionConfidence === 'number' ? Number(p.detectionConfidence.toFixed(2)) : null,
        trackingState: p.state === 'lost' ? 'lost' : p.state === 'predicted' ? 'predicted' : 'tracked',
        cameraSegmentId: frame.cameraSegmentId,
        calibrationId: frame.calibrationId,
        metricRunId: runIds.get(frame),
        normalizedX: Number((p.courtPosition.xPct / 100).toFixed(3)),
        normalizedY: Number((p.courtPosition.yPct / 100).toFixed(3)),
      };
      downsampledSamples.push(sample);
    }
  }

  // 3. Compute Quality (Separates per-athlete quality from session-level multi-target quality)
  const durationSec = frames.length > 1 ? frames[frames.length - 1].timestampSec - frames[0].timestampSec : 0;
  const canonicalPlayerIds = canonicalPlayerMetrics ? Object.keys(canonicalPlayerMetrics) : undefined;
  const quality = computeTrackingQuality(frames, canonicalPlayerIds);

  // 4. Compute Player Summaries from Full-Rate Telemetry (preserving all high-frequency motion)
  const playerSummaries: Record<string, PlayerMovementMetrics> = {};
  for (const [pId, pSamples] of fullRatePlayerSamples.entries()) {
    const canonicalDist = canonicalPlayerMetrics?.[pId]?.totalDistanceM ?? lastTotalDistances.get(pId);
    playerSummaries[pId] = computePlayerMovementMetrics(pSamples, canonicalDist);
  }

  if (canonicalPlayerMetrics) {
    for (const [pId, m] of Object.entries(canonicalPlayerMetrics)) {
      if (!playerSummaries[pId] && m.totalDistanceM !== undefined) {
        playerSummaries[pId] = computePlayerMovementMetrics([], m.totalDistanceM);
      }
    }
  }

  const summary: TrackingSummary = {
    durationSeconds: Number(Math.max(0, durationSec).toFixed(2)),
    sampleCount: downsampledSamples.length,
    players: playerSummaries,
  };

  // 4. Partition into Chunks
  const chunks: TrackingSampleChunk[] = [];
  if (downsampledSamples.length > 0) {
    let chunkIndex = 0;
    let chunkStart = downsampledSamples[0].timestamp;
    let currentChunkSamples: TrackingSample[] = [];

    for (const sample of downsampledSamples) {
      if (sample.timestamp - chunkStart >= chunkDurationSec && currentChunkSamples.length > 0) {
        chunks.push({
          id: `${analysisId}:${chunkIndex}`,
          analysisId,
          chunkIndex,
          startTime: Number(chunkStart.toFixed(2)),
          endTime: Number(sample.timestamp.toFixed(2)),
          samples: currentChunkSamples,
        });
        chunkIndex++;
        chunkStart = sample.timestamp;
        currentChunkSamples = [];
      }
      currentChunkSamples.push(sample);
    }

    if (currentChunkSamples.length > 0) {
      const lastSample = currentChunkSamples[currentChunkSamples.length - 1];
      chunks.push({
        id: `${analysisId}:${chunkIndex}`,
        analysisId,
        chunkIndex,
        startTime: Number(chunkStart.toFixed(2)),
        endTime: Number(lastSample.timestamp.toFixed(2)),
        samples: currentChunkSamples,
      });
    }
  }

  return { chunks, summary, quality, calibrationTimeline, imageObservations };
}

// -------------------------------------------------------------
// High-Level Repository Operations
// -------------------------------------------------------------

export async function saveTrackingAnalysis(
  analysis: TrackingAnalysis,
  chunks: TrackingSampleChunk[]
): Promise<void> {
  const driver = getTrackingStorageDriver();
  const pending: TrackingAnalysis = analysis.status === 'completed'
    ? { ...analysis, status: 'processing', completedAt: undefined }
    : analysis;
  await driver.saveAnalysis(pending);
  await driver.saveChunks(chunks);
  if (analysis.status === 'completed') await driver.saveAnalysis(analysis);
}

export async function getTrackingAnalysis(analysisId: string): Promise<TrackingAnalysis | null> {
  const driver = getTrackingStorageDriver();
  return driver.getAnalysis(analysisId);
}

export async function listTrackingAnalyses(projectId?: string): Promise<TrackingAnalysis[]> {
  const driver = getTrackingStorageDriver();
  const list = await driver.listAnalyses(projectId);
  return list.sort((a, b) => {
    const timeA = new Date(a.completedAt || a.createdAt).getTime();
    const timeB = new Date(b.completedAt || b.createdAt).getTime();
    return timeA - timeB;
  });
}

export async function getTrackingSampleChunks(analysisId: string): Promise<TrackingSampleChunk[]> {
  const driver = getTrackingStorageDriver();
  return driver.getChunks(analysisId);
}

export async function getTrackingSamples(
  analysisId: string,
  options?: { startTime?: number; endTime?: number; playerId?: string }
): Promise<TrackingSample[]> {
  const chunks = await getTrackingSampleChunks(analysisId);
  const result: TrackingSample[] = [];

  for (const chunk of chunks) {
    if (options?.startTime !== undefined && chunk.endTime < options.startTime) continue;
    if (options?.endTime !== undefined && chunk.startTime > options.endTime) continue;

    for (const sample of chunk.samples) {
      if (options?.startTime !== undefined && sample.timestamp < options.startTime) continue;
      if (options?.endTime !== undefined && sample.timestamp > options.endTime) continue;
      if (options?.playerId !== undefined && sample.playerId !== options.playerId) continue;
      result.push(sample);
    }
  }

  return result;
}

export async function deleteTrackingAnalysis(analysisId: string): Promise<void> {
  const driver = getTrackingStorageDriver();
  await driver.deleteAnalysis(analysisId);
}
