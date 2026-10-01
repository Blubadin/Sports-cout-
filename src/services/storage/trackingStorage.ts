import type {
  TrackingTelemetryV1,
  ProcessingConfig,
  TrackingPerformanceStats,
  TrackingQualityStats,
  TrackingRuntimeProvenance,
  SourceVideoMetadata,
  CameraResearchMetadata,
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

// -------------------------------------------------------------
// IndexedDB driver with stores: trackingAnalyses, trackingSampleChunks, trackingCandidates
// -------------------------------------------------------------
const DB_NAME = 'sportscout-tracking-v1';
const DB_VERSION = 3;
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

function cursorKey(analysisId: string, cursor: number): string {
  return `${analysisId}:${String(cursor).padStart(20, '0')}`;
}

function ensureTrackingIndexes(db: IDBDatabase, transaction: IDBTransaction | null): void {
  if (!transaction) return;
  const ensureIndex = (storeName: string, name: string, keyPath: string | string[]) => {
    const store = transaction.objectStore(storeName);
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
  };
  ensureIndex('trackingAnalyses', 'projectId', 'projectId');
  ensureIndex('trackingSampleChunks', 'analysisChunk', ['analysisId', 'chunkIndex']);
  ensureIndex('trackingCandidates', 'analysisTimestamp', ['analysisId', 'timestamp']);
}

/** Ensure the complete tracking schema is created in the same upgrade. */
export function ensureTrackingObjectStores(db: TrackingDatabaseSchemaTarget): void {
  for (const storeName of TRACKING_STORE_NAMES) {
    if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
  }
}

function validateTelemetryPage(page: TrackingTelemetryPage): void {
  if (
    !page.analysisId ||
    !Number.isInteger(page.startCursor) ||
    page.startCursor < 0 ||
    !Number.isInteger(page.endCursor) ||
    page.endCursor !== page.startCursor + page.frames.length ||
    page.frames.length > MAX_TRACKING_PAGE_SIZE ||
    page.id !== cursorKey(page.analysisId, page.startCursor)
  ) {
    throw new Error('Telemetry page cursor or maximum page size is invalid');
  }
}

let trackingDbPromise: Promise<IDBDatabase | null> | null = null;

function openTrackingDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  if (trackingDbPromise) return trackingDbPromise;

  trackingDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      ensureTrackingObjectStores(request.result);
      ensureTrackingIndexes(request.result, request.transaction);
    };
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

type TrackingAnalysisDependentStore = 'trackingSampleChunks' | 'trackingCandidates' | 'trackingTelemetryPages';

function deleteOwnedRows(
  source: IDBObjectStore | IDBIndex,
  range: IDBKeyRange,
  analysisId: string,
  onDelete: () => void,
  tx: IDBTransaction,
): void {
  const request = source.openCursor(range);
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if ((cursor.value as { analysisId?: string }).analysisId === analysisId) {
      cursor.delete();
      onDelete();
    }
    cursor.continue();
  };
  request.onerror = () => {
    try { tx.abort(); } catch { /* the transaction may already be aborting */ }
  };
}

function deleteAnalysisDependents(
  tx: IDBTransaction,
  analysisId: string,
  onDelete: (store: TrackingAnalysisDependentStore) => void = () => undefined,
): void {
  deleteOwnedRows(
    tx.objectStore('trackingSampleChunks').index('analysisChunk'),
    IDBKeyRange.bound([analysisId, Number.NEGATIVE_INFINITY], [analysisId, Number.POSITIVE_INFINITY]),
    analysisId,
    () => onDelete('trackingSampleChunks'),
    tx,
  );
  deleteOwnedRows(
    tx.objectStore('trackingCandidates').index('analysisTimestamp'),
    IDBKeyRange.bound([analysisId, Number.NEGATIVE_INFINITY], [analysisId, Number.POSITIVE_INFINITY]),
    analysisId,
    () => onDelete('trackingCandidates'),
    tx,
  );
  deleteOwnedRows(
    tx.objectStore('trackingTelemetryPages'),
    IDBKeyRange.bound(`${analysisId}:`, `${analysisId};`),
    analysisId,
    () => onDelete('trackingTelemetryPages'),
    tx,
  );
}

function emptyOrphanRepairResult(status: TrackingOrphanRepairResult['status']): TrackingOrphanRepairResult {
  return { status, removed: { chunks: 0, candidates: 0, telemetryPages: 0 } };
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
    if (!db) throw new Error("Persistent tracking storage is unavailable");
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
    return new Promise<TrackingAnalysis[]>((resolve, reject) => {
      const tx = db.transaction('trackingAnalyses', 'readonly');
      const store = tx.objectStore('trackingAnalyses');
      const request = projectId
        ? store.index('projectId').getAll(IDBKeyRange.only(projectId), MAX_TRACKING_PAGE_SIZE)
        : store.getAll(undefined, MAX_TRACKING_PAGE_SIZE);
      request.onsuccess = () => resolve(request.result as TrackingAnalysis[]);
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.onerror = () => reject(transactionError(tx));
    });
  }

  async deleteAnalysis(id: string): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) throw new Error("Persistent tracking storage is unavailable");
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...TRACKING_STORE_NAMES], 'readwrite');
      tx.objectStore('trackingAnalyses').delete(id);
      deleteAnalysisDependents(tx, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }

  /** Repair leftovers from the legacy delete bug only when the parent is already absent. */
  async repairOrphanedAnalysisData(id: string): Promise<TrackingOrphanRepairResult> {
    const db = await openTrackingDatabase();
    if (!db) throw new Error('Persistent tracking storage is unavailable');
    return new Promise<TrackingOrphanRepairResult>((resolve, reject) => {
      const tx = db.transaction([...TRACKING_STORE_NAMES], 'readwrite');
      const removed = { chunks: 0, candidates: 0, telemetryPages: 0 };
      let status: TrackingOrphanRepairResult['status'] = 'no-orphans';
      const parentRequest = tx.objectStore('trackingAnalyses').get(id);
      parentRequest.onsuccess = () => {
        if (parentRequest.result) {
          status = 'analysis-present';
          return;
        }
        deleteAnalysisDependents(tx, id, store => {
          if (store === 'trackingSampleChunks') removed.chunks += 1;
          if (store === 'trackingCandidates') removed.candidates += 1;
          if (store === 'trackingTelemetryPages') removed.telemetryPages += 1;
        });
      };
      parentRequest.onerror = () => {
        try { tx.abort(); } catch { /* the transaction may already be aborting */ }
      };
      tx.oncomplete = () => {
        if (removed.chunks + removed.candidates + removed.telemetryPages > 0) status = 'repaired';
        resolve({ status, removed });
      };
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
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

  async getChunks(analysisId: string, afterChunkIndex = -1, limit = MAX_TRACKING_PAGE_SIZE): Promise<TrackingSampleChunk[]> {
    const db = await openTrackingDatabase();
    if (!db) return [];
    const boundedLimit = Math.max(1, Math.min(MAX_TRACKING_PAGE_SIZE, Math.floor(limit)));
    return new Promise<TrackingSampleChunk[]>((resolve, reject) => {
      const tx = db.transaction('trackingSampleChunks', 'readonly');
      const range = IDBKeyRange.bound(
        [analysisId, Math.max(0, afterChunkIndex + 1)],
        [analysisId, Number.MAX_SAFE_INTEGER],
      );
      const request = tx.objectStore('trackingSampleChunks').index('analysisChunk').openCursor(range);
      const page: TrackingSampleChunk[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || page.length >= boundedLimit) return;
        page.push(cursor.value as TrackingSampleChunk);
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.oncomplete = () => resolve(page);
      tx.onerror = () => reject(transactionError(tx));
    });
  }

  async saveTelemetryPage(page: TrackingTelemetryPage): Promise<void> {
    validateTelemetryPage(page);
    const db = await openTrackingDatabase();
    if (!db) throw new Error("Persistent tracking storage is unavailable");
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingTelemetryPages', 'readwrite');
      const store = tx.objectStore('trackingTelemetryPages');
      const request = store.get(page.id);
      request.onsuccess = () => {
        const existing = request.result as TrackingTelemetryPage | undefined;
        if (existing && JSON.stringify(existing) !== JSON.stringify(page)) {
          tx.abort();
          reject(new Error('Telemetry cursor page conflicts with an existing persisted page'));
          return;
        }
        if (!existing) store.put(page, page.id);
      };
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }

  async getTelemetryPage(analysisId: string, afterCursor: number): Promise<TrackingTelemetryPage | null> {
    const db = await openTrackingDatabase();
    if (!db) return null;
    return new Promise<TrackingTelemetryPage | null>((resolve, reject) => {
      const tx = db.transaction('trackingTelemetryPages', 'readonly');
      const store = tx.objectStore('trackingTelemetryPages');
      const startKey = cursorKey(analysisId, afterCursor);
      const endKey = `${analysisId};`;
      const request = store.openCursor(IDBKeyRange.bound(startKey, endKey));
      let page: TrackingTelemetryPage | null = null;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || cursor.value.analysisId !== analysisId) return;
        page = cursor.value as TrackingTelemetryPage;
      };
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.oncomplete = () => resolve(page);
      tx.onerror = () => reject(transactionError(tx));
    });
  }

  async deleteTelemetryPages(analysisId: string): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) throw new Error("Persistent tracking storage is unavailable");
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingTelemetryPages', 'readwrite');
      deleteOwnedRows(
        tx.objectStore('trackingTelemetryPages'),
        IDBKeyRange.bound(`${analysisId}:`, `${analysisId};`),
        analysisId,
        () => undefined,
        tx,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }

  async deleteChunks(analysisId: string): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) throw new Error("Persistent tracking storage is unavailable");
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingSampleChunks', 'readwrite');
      deleteOwnedRows(
        tx.objectStore('trackingSampleChunks').index('analysisChunk'),
        IDBKeyRange.bound([analysisId, Number.NEGATIVE_INFINITY], [analysisId, Number.POSITIVE_INFINITY]),
        analysisId,
        () => undefined,
        tx,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
    });
  }

  async saveCandidate(candidate: TrackingCandidate): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) throw new Error("Persistent tracking storage is unavailable");
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
      const request = tx.objectStore('trackingCandidates').index('analysisTimestamp').getAll(
        IDBKeyRange.bound([analysisId, 0], [analysisId, Number.MAX_SAFE_INTEGER]),
        MAX_TRACKING_PAGE_SIZE,
      );
      request.onsuccess = () => resolve(request.result as TrackingCandidate[]);
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.onerror = () => reject(transactionError(tx));
    });
    return all;
  }

  async deleteCandidates(analysisId: string): Promise<void> {
    const db = await openTrackingDatabase();
    if (!db) throw new Error("Persistent tracking storage is unavailable");
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingCandidates', 'readwrite');
      deleteOwnedRows(
        tx.objectStore('trackingCandidates').index('analysisTimestamp'),
        IDBKeyRange.bound([analysisId, Number.NEGATIVE_INFINITY], [analysisId, Number.POSITIVE_INFINITY]),
        analysisId,
        () => undefined,
        tx,
      );
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
  private telemetryPages = new Map<string, TrackingTelemetryPage>();

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
    await this.deleteTelemetryPages(id);
  }

  async repairOrphanedAnalysisData(id: string): Promise<TrackingOrphanRepairResult> {
    if (this.analyses.has(id)) return emptyOrphanRepairResult('analysis-present');
    const removed = {
      chunks: this.countForAnalysis(this.chunks, id),
      candidates: this.countForAnalysis(this.candidates, id),
      telemetryPages: this.countForAnalysis(this.telemetryPages, id),
    };
    await this.deleteChunks(id);
    await this.deleteCandidates(id);
    await this.deleteTelemetryPages(id);
    const hasOrphans = removed.chunks + removed.candidates + removed.telemetryPages > 0;
    return { status: hasOrphans ? 'repaired' : 'no-orphans', removed };
  }

  private countForAnalysis<T extends { analysisId: string }>(rows: Map<string, T>, id: string): number {
    let count = 0;
    for (const row of rows.values()) if (row.analysisId === id) count += 1;
    return count;
  }

  async saveChunks(chunks: TrackingSampleChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, { ...chunk });
    }
  }

  async getChunks(analysisId: string, afterChunkIndex = -1, limit = MAX_TRACKING_PAGE_SIZE): Promise<TrackingSampleChunk[]> {
    return Array.from(this.chunks.values())
      .filter((c) => c.analysisId === analysisId)
      .filter((c) => c.chunkIndex > afterChunkIndex)
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .slice(0, Math.max(1, Math.min(MAX_TRACKING_PAGE_SIZE, Math.floor(limit))));
  }

  async saveTelemetryPage(page: TrackingTelemetryPage): Promise<void> {
    validateTelemetryPage(page);
    const existing = this.telemetryPages.get(page.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(page)) {
      throw new Error('Telemetry cursor page conflicts with an existing persisted page');
    }
    this.telemetryPages.set(page.id, page);
  }

  async getTelemetryPage(analysisId: string, afterCursor: number): Promise<TrackingTelemetryPage | null> {
    return Array.from(this.telemetryPages.values())
      .filter((page) => page.analysisId === analysisId && page.endCursor > afterCursor)
      .sort((a, b) => a.startCursor - b.startCursor)[0] ?? null;
  }

  async deleteTelemetryPages(analysisId: string): Promise<void> {
    for (const [key, page] of this.telemetryPages.entries()) {
      if (page.analysisId === analysisId) this.telemetryPages.delete(key);
    }
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
} {
  if (frames.length === 0) {
    return {
      chunks: [],
      summary: { durationSeconds: 0, sampleCount: 0, players: {} },
      quality: computeTrackingQuality([], canonicalPlayerMetrics ? Object.keys(canonicalPlayerMetrics) : undefined),
      calibrationTimeline: [],
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

  for (const frame of frames) {
    if (!isMetricCalibrationValid(frame) || frame.canUseCourtMetric === false) continue;
    for (const p of frame.players) {
      if (typeof p.totalDistanceM === 'number') {
        lastTotalDistances.set(p.playerId, p.totalDistanceM);
      }
      if (
        !p.courtPosition ||
        p.courtPosition.xM == null ||
        p.courtPosition.yM == null ||
        !Number.isFinite(p.courtPosition.xM) ||
        !Number.isFinite(p.courtPosition.yM) ||
        (p.courtPosition.xM === 0 && p.courtPosition.yM === 0)
      ) {
        continue;
      }

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
        canBuildHeatmap: frame.canBuildHeatmap !== false,
        canUseCourtMetric: true,
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
    if (!isMetricCalibrationValid(frame) || frame.canUseCourtMetric === false) continue;
    if (lastTimestamp >= 0 && frame.timestampSec - lastTimestamp < sampleInterval * 0.95) {
      continue;
    }
    lastTimestamp = frame.timestampSec;

    for (const p of frame.players) {
      if (
        !p.courtPosition ||
        p.courtPosition.xM == null ||
        p.courtPosition.yM == null ||
        !Number.isFinite(p.courtPosition.xM) ||
        !Number.isFinite(p.courtPosition.yM) ||
        (p.courtPosition.xM === 0 && p.courtPosition.yM === 0)
      ) {
        continue;
      }
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
        canBuildHeatmap: frame.canBuildHeatmap !== false,
        canUseCourtMetric: true,
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

  return { chunks, summary, quality, calibrationTimeline };
}

interface StreamingPlayerSummary {
  totalDistanceM: number;
  lastCanonicalDistanceM?: number;
  avgSpeedSum: number;
  speedCount: number;
  speedHistogram: number[];
  maxSpeedMps: number;
  trackedCount: number;
  sumX: number;
  sumY: number;
  dispersionSum: number;
  frontCount: number;
  midCount: number;
  rearCount: number;
  leftCount: number;
  rightCount: number;
  lateralMovementM: number;
  frontBackMovementM: number;
  previousSample?: TrackingSample;
}

interface StreamingQualityTally {
  observed: number;
  predicted: number;
  lost: number;
  confidenceSum: number;
  confidenceCount: number;
}

function streamingSample(
  frame: TrackingTelemetryV1,
  player: TrackingTelemetryV1['players'][number],
  metricRunId: number,
): TrackingSample | null {
  const position = player.courtPosition;
  if (
    !position || position.xM == null || position.yM == null ||
    !Number.isFinite(position.xM) || !Number.isFinite(position.yM) ||
    (position.xM === 0 && position.yM === 0)
  ) return null;
  return {
    timestamp: frame.timestampSec,
    playerId: player.playerId,
    courtX: Number(position.xM.toFixed(2)),
    courtY: Number(position.yM.toFixed(2)),
    speed: typeof player.speedMps === 'number' ? Number(player.speedMps.toFixed(2)) : null,
    confidence: typeof player.detectionConfidence === 'number' ? Number(player.detectionConfidence.toFixed(2)) : null,
    trackingState: player.state === 'lost' ? 'lost' : player.state === 'predicted' ? 'predicted' : 'tracked',
    cameraSegmentId: frame.cameraSegmentId,
    calibrationId: frame.calibrationId,
    metricRunId,
    normalizedX: Number((position.xPct / 100).toFixed(3)),
    normalizedY: Number((position.yPct / 100).toFixed(3)),
    canBuildHeatmap: frame.canBuildHeatmap !== false,
    canUseCourtMetric: true,
  };
}

/** Streaming equivalent of downsampleAndChunkTrackingSamples with fixed-size accumulators. */
export class TrackingAnalysisStreamBuilder {
  private readonly analysisId: string;
  private readonly targetHz: number;
  private readonly chunkDurationSec: number;
  private readonly playerIds: string[];
  private readonly playerSummaries = new Map<string, StreamingPlayerSummary>();
  private readonly qualityTallies = new Map<string, StreamingQualityTally>();
  private readonly calibrationTimeline: TrackingCalibrationEvent[] = [];
  private priorCalibrationKey: string | null = null;
  private metricRunId = 0;
  private dispersionPriorCalibrationKey: string | null = null;
  private dispersionMetricRunId = 0;
  private lastDownsampledTimestamp = -1;
  private firstTimestamp: number | null = null;
  private lastTimestamp: number | null = null;
  private frameCount = 0;
  private sampleCount = 0;
  private uniqueStoredTimestampCount = 0;
  private qualityFullyObserved = 0;
  private qualityPartiallyObserved = 0;
  private qualityFullyLost = 0;
  private qualityPoseCount = 0;
  private qualityPlayerSlots = 0;
  private qualityConfidenceSum = 0;
  private qualityConfidenceCount = 0;
  private currentChunkIndex = 0;
  private currentChunkStart: number | null = null;
  private currentChunkSamples: TrackingSample[] = [];

  constructor(
    analysisId: string,
    playerIds: string[],
    targetHz = 10,
    chunkDurationSec = 15,
  ) {
    this.analysisId = analysisId;
    this.playerIds = [...new Set(playerIds)].sort();
    this.targetHz = Math.max(0.1, targetHz);
    this.chunkDurationSec = Math.max(1, chunkDurationSec);
    for (const playerId of this.playerIds) {
      this.qualityTallies.set(playerId, { observed: 0, predicted: 0, lost: 0, confidenceSum: 0, confidenceCount: 0 });
    }
  }

  setCanonicalPlayerMetrics(metrics: Record<string, { totalDistanceM?: number }>): void {
    for (const [playerId, value] of Object.entries(metrics)) {
      let aggregate = this.playerSummaries.get(playerId);
      const hasCanonicalDistance = typeof value.totalDistanceM === 'number' && Number.isFinite(value.totalDistanceM);
      if (!aggregate && hasCanonicalDistance) {
        aggregate = this.createPlayerSummary();
        this.playerSummaries.set(playerId, aggregate);
      }
      if (!this.qualityTallies.has(playerId)) {
        this.qualityTallies.set(playerId, { observed: 0, predicted: 0, lost: 0, confidenceSum: 0, confidenceCount: 0 });
        this.playerIds.push(playerId);
        this.playerIds.sort();
      }
      if (aggregate && hasCanonicalDistance) {
        aggregate.lastCanonicalDistanceM = value.totalDistanceM;
      }
    }
  }

  private createPlayerSummary(): StreamingPlayerSummary {
    return {
      totalDistanceM: 0,
      avgSpeedSum: 0,
      speedCount: 0,
      speedHistogram: new Array<number>(1201).fill(0),
      maxSpeedMps: 0,
      trackedCount: 0,
      sumX: 0,
      sumY: 0,
      dispersionSum: 0,
      frontCount: 0,
      midCount: 0,
      rearCount: 0,
      leftCount: 0,
      rightCount: 0,
      lateralMovementM: 0,
      frontBackMovementM: 0,
    };
  }

  private runIdFor(frame: TrackingTelemetryV1, dispersionPass = false): number {
    if (frame.calibrationState !== undefined) {
      const key = `${frame.cameraSegmentId ?? ''}:${frame.calibrationId ?? ''}:${frame.calibrationState}`;
      const prior = dispersionPass ? this.dispersionPriorCalibrationKey : this.priorCalibrationKey;
      let runId = dispersionPass ? this.dispersionMetricRunId : this.metricRunId;
      if (!isMetricCalibrationValid(frame) || (prior !== null && key !== prior)) runId++;
      if (dispersionPass) {
        this.dispersionPriorCalibrationKey = key;
        this.dispersionMetricRunId = runId;
      } else {
        if (key !== prior) {
          this.calibrationTimeline.push({
            frameIndex: frame.frameIndex,
            timestampSec: frame.timestampSec,
            cameraSegmentId: frame.cameraSegmentId,
            calibrationId: frame.calibrationId,
            state: frame.calibrationState,
            provenance: frame.calibration ?? null,
          });
        }
        this.priorCalibrationKey = key;
        this.metricRunId = runId;
      }
    }
    return dispersionPass ? this.dispersionMetricRunId : this.metricRunId;
  }

  private addQuality(frame: TrackingTelemetryV1): void {
    let observedInFrame = 0;
    const byId = new Map(frame.players.map((player) => [player.playerId, player]));
    for (const playerId of this.playerIds) {
      const player = byId.get(playerId);
      const tally = this.qualityTallies.get(playerId)!;
      if (!player || player.state === 'lost') {
        tally.lost++;
      } else if (player.state === 'predicted') {
        tally.predicted++;
      } else if (player.state === 'observed') {
        tally.observed++;
        observedInFrame++;
        if (typeof player.detectionConfidence === 'number') {
          tally.confidenceSum += player.detectionConfidence;
          tally.confidenceCount++;
          this.qualityConfidenceSum += player.detectionConfidence;
          this.qualityConfidenceCount++;
        }
      } else {
        tally.lost++;
      }
    }
    if (observedInFrame === this.playerIds.length) this.qualityFullyObserved++;
    else if (observedInFrame > 0) this.qualityPartiallyObserved++;
    else this.qualityFullyLost++;
    this.qualityPlayerSlots += this.playerIds.length;
    for (const player of frame.players) {
      if (player.pose && !player.pose.isReused) this.qualityPoseCount++;
    }
  }

  private appendDownsampled(sample: TrackingSample): TrackingSampleChunk[] {
    const ready: TrackingSampleChunk[] = [];
    if (this.currentChunkStart === null) this.currentChunkStart = sample.timestamp;
    if (sample.timestamp - this.currentChunkStart >= this.chunkDurationSec && this.currentChunkSamples.length > 0) {
      ready.push({
        id: `${this.analysisId}:${this.currentChunkIndex}`,
        analysisId: this.analysisId,
        chunkIndex: this.currentChunkIndex,
        startTime: Number(this.currentChunkStart.toFixed(2)),
        endTime: Number(sample.timestamp.toFixed(2)),
        samples: this.currentChunkSamples,
      });
      this.currentChunkIndex++;
      this.currentChunkStart = sample.timestamp;
      this.currentChunkSamples = [];
    }
    this.currentChunkSamples.push(sample);
    return ready;
  }

  addFrames(frames: TrackingTelemetryV1[]): TrackingSampleChunk[] {
    const ready: TrackingSampleChunk[] = [];
    const sampleInterval = 1 / this.targetHz;
    for (const frame of frames) {
      if (this.firstTimestamp === null) this.firstTimestamp = frame.timestampSec;
      this.lastTimestamp = frame.timestampSec;
      this.frameCount++;
      this.addQuality(frame);
      const runId = this.runIdFor(frame);
      const validMetricFrame = isMetricCalibrationValid(frame) && frame.canUseCourtMetric !== false;
      if (!validMetricFrame) continue;

      for (const player of frame.players) {
        let aggregate = this.playerSummaries.get(player.playerId);
        const sample = streamingSample(frame, player, runId);
        if (!sample) continue;
        if (!aggregate) {
          aggregate = this.createPlayerSummary();
          this.playerSummaries.set(player.playerId, aggregate);
        }
        if (aggregate && typeof player.totalDistanceM === 'number' && Number.isFinite(player.totalDistanceM)) {
          aggregate.lastCanonicalDistanceM = player.totalDistanceM;
        }
        const previous = aggregate.previousSample;
        if (sample.trackingState === 'tracked') {
          aggregate.trackedCount++;
          aggregate.sumX += sample.courtX;
          aggregate.sumY += sample.courtY;
          const distanceToNet = Math.abs(6.7 - sample.courtY);
          if (distanceToNet <= 2.2) aggregate.frontCount++;
          else if (distanceToNet <= 4.4) aggregate.midCount++;
          else aggregate.rearCount++;
          if (sample.courtX < 3.05) aggregate.leftCount++;
          else aggregate.rightCount++;
          if (
            previous?.trackingState === 'tracked' &&
            previous.metricRunId === sample.metricRunId &&
            previous.calibrationId === sample.calibrationId &&
            previous.cameraSegmentId === sample.cameraSegmentId
          ) {
            const dx = sample.courtX - previous.courtX;
            const dy = sample.courtY - previous.courtY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const deltaSec = Math.max(0.001, sample.timestamp - previous.timestamp);
            const speed = distance / deltaSec;
            if (speed <= 12.0) {
              aggregate.totalDistanceM += distance;
              aggregate.lateralMovementM += Math.abs(dx);
              aggregate.frontBackMovementM += Math.abs(dy);
              aggregate.avgSpeedSum += speed;
              aggregate.speedCount++;
              const bin = Math.max(0, Math.min(1200, Math.round(speed * 100)));
              aggregate.speedHistogram[bin]++;
              aggregate.maxSpeedMps = Math.max(aggregate.maxSpeedMps, speed);
            }
          }
        }
        aggregate.previousSample = sample;
      }

      if (frame.timestampSec - this.lastDownsampledTimestamp < sampleInterval * 0.95) continue;
      this.lastDownsampledTimestamp = frame.timestampSec;
      let emittedAtTimestamp = false;
      for (const player of frame.players) {
        const sample = streamingSample(frame, player, runId);
        if (!sample) continue;
        this.sampleCount++;
        emittedAtTimestamp = true;
        ready.push(...this.appendDownsampled(sample));
      }
      if (emittedAtTimestamp) this.uniqueStoredTimestampCount++;
    }
    return ready;
  }

  addDispersionFrames(frames: TrackingTelemetryV1[]): void {
    for (const frame of frames) {
      const runId = this.runIdFor(frame, true);
      if (!isMetricCalibrationValid(frame) || frame.canUseCourtMetric === false) continue;
      for (const player of frame.players) {
        const sample = streamingSample(frame, player, runId);
        const aggregate = sample ? this.playerSummaries.get(sample.playerId) : undefined;
        if (!sample || !aggregate || sample.trackingState !== 'tracked' || aggregate.trackedCount === 0) continue;
        const avgX = aggregate.sumX / aggregate.trackedCount;
        const avgY = aggregate.sumY / aggregate.trackedCount;
        const dx = sample.courtX - avgX;
        const dy = sample.courtY - avgY;
        aggregate.dispersionSum += Math.sqrt(dx * dx + dy * dy);
      }
    }
  }

  finishChunks(): TrackingSampleChunk[] {
    if (!this.currentChunkSamples.length || this.currentChunkStart === null) return [];
    const samples = this.currentChunkSamples;
    const first = this.currentChunkStart;
    const index = this.currentChunkIndex;
    this.currentChunkSamples = [];
    this.currentChunkStart = null;
    return [{
      id: `${this.analysisId}:${index}`,
      analysisId: this.analysisId,
      chunkIndex: index,
      startTime: Number(first.toFixed(2)),
      endTime: Number(samples[samples.length - 1].timestamp.toFixed(2)),
      samples,
    }];
  }

  finish(): {
    summary: TrackingSummary;
    quality: TrackingQuality;
    calibrationTimeline: TrackingCalibrationEvent[];
    uniqueStoredTimestampCount: number;
  } {
    const players: Record<string, PlayerMovementMetrics> = {};
    for (const playerId of this.playerIds) {
      const aggregate = this.playerSummaries.get(playerId);
      if (!aggregate) continue;
      let p95Speed = 0;
      if (aggregate.speedCount > 0) {
        const target = Math.floor(aggregate.speedCount * 0.95);
        let accumulated = 0;
        for (let bin = 0; bin < aggregate.speedHistogram.length; bin++) {
          accumulated += aggregate.speedHistogram[bin];
          if (accumulated > target) {
            p95Speed = Number((bin / 100).toFixed(2));
            break;
          }
        }
      }
      const count = aggregate.trackedCount;
      const denominator = Math.max(1, count);
      players[playerId] = {
        totalDistanceMeters: Number((aggregate.lastCanonicalDistanceM ?? aggregate.totalDistanceM).toFixed(2)),
        avgSpeedMps: Number((aggregate.speedCount ? aggregate.avgSpeedSum / aggregate.speedCount : 0).toFixed(2)),
        p95SpeedMps: p95Speed,
        maxSpeedMps: Number(aggregate.maxSpeedMps.toFixed(2)),
        courtCoverage: {
          frontPercent: Number(((aggregate.frontCount / denominator) * 100).toFixed(1)),
          midPercent: Number(((aggregate.midCount / denominator) * 100).toFixed(1)),
          rearPercent: Number(((aggregate.rearCount / denominator) * 100).toFixed(1)),
          leftPercent: Number(((aggregate.leftCount / denominator) * 100).toFixed(1)),
          rightPercent: Number(((aggregate.rightCount / denominator) * 100).toFixed(1)),
        },
        basePosition: {
          avgCourtX: count ? Number((aggregate.sumX / count).toFixed(2)) : null,
          avgCourtY: count ? Number((aggregate.sumY / count).toFixed(2)) : null,
          dispersion: count ? Number((aggregate.dispersionSum / count).toFixed(2)) : 0,
        },
        lateralMovementMeters: Number(aggregate.lateralMovementM.toFixed(2)),
        frontBackMovementMeters: Number(aggregate.frontBackMovementM.toFixed(2)),
      };
    }

    if (this.frameCount === 0) {
      return {
        summary: { durationSeconds: 0, sampleCount: 0, players: {} },
        quality: computeTrackingQuality([], this.playerIds),
        calibrationTimeline: [],
        uniqueStoredTimestampCount: 0,
      };
    }

    const playerCoverage: Record<string, PlayerTrackingQuality> = {};
    let totalCoverage = 0;
    let totalPredicted = 0;
    let totalLost = 0;
    for (const playerId of this.playerIds) {
      const tally = this.qualityTallies.get(playerId)!;
      const coverage = Number((tally.observed / this.frameCount).toFixed(2));
      const predictedPercent = Number(((tally.predicted / this.frameCount) * 100).toFixed(1));
      const lostPercent = Number(((tally.lost / this.frameCount) * 100).toFixed(1));
      playerCoverage[playerId] = {
        playerId,
        observedFrameCount: tally.observed,
        predictedFrameCount: tally.predicted,
        lostFrameCount: tally.lost,
        detectionCoverage: coverage,
        predictedPercent,
        lostPercent,
        meanObservedConfidence: tally.confidenceCount ? Number((tally.confidenceSum / tally.confidenceCount).toFixed(2)) : null,
        idSwitchCount: null,
        manualCorrectionCount: null,
      };
      totalCoverage += coverage;
      totalPredicted += tally.predicted;
      totalLost += tally.lost;
    }
    const targetCount = this.playerIds.length;
    const meanTargetCoverage = targetCount ? Number((totalCoverage / targetCount).toFixed(2)) : null;
    const quality: TrackingQuality = {
      meanTargetCoverage,
      simultaneousTargetCoverage: this.frameCount ? Number((this.qualityFullyObserved / this.frameCount).toFixed(2)) : null,
      fullyObservedFrameCount: this.qualityFullyObserved,
      partiallyObservedFrameCount: this.qualityPartiallyObserved,
      fullyLostFrameCount: this.qualityFullyLost,
      predictedPercent: this.qualityPlayerSlots ? Number(((totalPredicted / this.qualityPlayerSlots) * 100).toFixed(1)) : null,
      lostPercent: this.qualityPlayerSlots ? Number(((totalLost / this.qualityPlayerSlots) * 100).toFixed(1)) : null,
      playerCoverage,
      idSwitchCount: null,
      manualCorrectionCount: null,
      manualCorrections: null,
      detectionCoverage: meanTargetCoverage,
      lostTimePercent: meanTargetCoverage === null ? null : Number(Math.max(0, (1 - meanTargetCoverage) * 100).toFixed(1)),
      confidence: this.qualityConfidenceCount ? Number((this.qualityConfidenceSum / this.qualityConfidenceCount).toFixed(2)) : null,
      lowConfidenceWarning: meanTargetCoverage !== null && (meanTargetCoverage < 0.5 || (this.qualityConfidenceCount > 0 && this.qualityConfidenceSum / this.qualityConfidenceCount < 0.6)),
    };
    return {
      summary: {
        durationSeconds: Number(Math.max(0, (this.lastTimestamp ?? 0) - (this.firstTimestamp ?? 0)).toFixed(2)),
        sampleCount: this.sampleCount,
        players,
      },
      quality,
      calibrationTimeline: this.calibrationTimeline,
      uniqueStoredTimestampCount: this.uniqueStoredTimestampCount,
    };
  }
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

export async function getTrackingSampleChunks(
  analysisId: string,
  afterChunkIndex = -1,
  limit = MAX_TRACKING_PAGE_SIZE,
): Promise<TrackingSampleChunk[]> {
  const driver = getTrackingStorageDriver();
  return driver.getChunks(analysisId, afterChunkIndex, limit);
}

/** Marks a streamed result retryable before the final completion record is written. */
export async function saveTrackingAnalysisRecord(analysis: TrackingAnalysis): Promise<void> {
  const driver = getTrackingStorageDriver();
  await driver.saveAnalysis({ ...analysis, status: 'processing', completedAt: undefined });
  await driver.saveAnalysis(analysis);
}

export async function saveTrackingSampleChunks(chunks: TrackingSampleChunk[]): Promise<void> {
  await getTrackingStorageDriver().saveChunks(chunks);
}

export async function saveTrackingTelemetryPage(page: TrackingTelemetryPage): Promise<void> {
  await getTrackingStorageDriver().saveTelemetryPage(page);
}

export async function getTrackingTelemetryPage(
  analysisId: string,
  afterCursor: number,
): Promise<TrackingTelemetryPage | null> {
  return getTrackingStorageDriver().getTelemetryPage(analysisId, afterCursor);
}

export async function deleteTrackingTelemetryPages(analysisId: string): Promise<void> {
  await getTrackingStorageDriver().deleteTelemetryPages(analysisId);
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
