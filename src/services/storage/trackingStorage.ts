import type {
  TrackingTelemetryV1,
  ProcessingConfig,
  TrackingPerformanceStats,
  TrackingQualityStats,
  TrackingRuntimeProvenance,
  SourceVideoMetadata,
  CameraResearchMetadata,
} from '../../types';

export interface TrackingPlayerMetadata {
  playerId: string;
  name?: string;
  side: 'near' | 'far' | 'unknown';
  color?: string;
}

export interface TrackingQuality {
  detectionCoverage: number; // 0..1 (e.g. 0.95)
  lostTimePercent: number; // 0..100 (%)
  confidence: number; // 0..1
  manualCorrections: number;
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
  sampleRateHz: number;
  createdAt: string;
  completedAt?: string;
  device?: string;
  effectiveDevice?: string;
  runtimeProvenance?: TrackingRuntimeProvenance;
  videoMetadata?: SourceVideoMetadata;
  researchMetadata?: CameraResearchMetadata;
  localFileName?: string;
  analyzedFrames?: number;
  totalFrames?: number;
  processingConfig?: ProcessingConfig;
  performance?: TrackingPerformanceStats;
  qualityStats?: TrackingQualityStats;
  players: TrackingPlayerMetadata[];
  quality: TrackingQuality;
  summary: TrackingSummary;
}

export interface TrackingSample {
  timestamp: number; // seconds
  playerId: string;
  courtX: number; // meters (0..6.10)
  courtY: number; // meters (0..13.40)
  speed: number; // m/s
  confidence: number; // 0..1
  trackingState: 'tracked' | 'predicted' | 'lost';
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
 * Calculates court distance and movement metrics for a set of samples
 */
export function computePlayerMovementMetrics(samples: TrackingSample[], canonicalTotalDist?: number): PlayerMovementMetrics {
  if (samples.length === 0) {
    return {
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
    };
  }

  let totalDist = 0;
  let lateralDist = 0;
  let frontBackDist = 0;
  const speeds: number[] = [];
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  let frontCount = 0;
  let midCount = 0;
  let rearCount = 0;
  let leftCount = 0;
  let rightCount = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.trackingState !== 'tracked') continue;

    count++;
    sumX += s.courtX;
    sumY += s.courtY;

    // Badminton court: length 13.40m, width 6.10m. Net is at Y = 6.70m.
    // Distance to net = |6.70 - Y|
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
      const prev = samples[i - 1];
      if (prev.trackingState === 'tracked') {
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
          speeds.push(instantSpeed);
        }
      }
    }
  }

  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
  const p95Speed = calculateP95(speeds);

  const avgX = count > 0 ? sumX / count : null;
  const avgY = count > 0 ? sumY / count : null;

  // Dispersion: average Euclidean distance from base position
  let totalDispersion = 0;
  if (count > 0 && avgX !== null && avgY !== null) {
    for (const s of samples) {
      if (s.trackingState !== 'tracked') continue;
      const dx = s.courtX - avgX;
      const dy = s.courtY - avgY;
      totalDispersion += Math.sqrt(dx * dx + dy * dy);
    }
  }
  const dispersion = count > 0 ? totalDispersion / count : 0;

  const validCount = Math.max(1, count);
  const effectiveTotalDist = canonicalTotalDist !== undefined ? canonicalTotalDist : totalDist;
  return {
    totalDistanceMeters: Number(effectiveTotalDist.toFixed(2)),
    avgSpeedMps: Number(avgSpeed.toFixed(2)),
    p95SpeedMps: Number(p95Speed.toFixed(2)),
    maxSpeedMps: Number(maxSpeed.toFixed(2)),
    courtCoverage: {
      frontPercent: Number(((frontCount / validCount) * 100).toFixed(1)),
      midPercent: Number(((midCount / validCount) * 100).toFixed(1)),
      rearPercent: Number(((rearCount / validCount) * 100).toFixed(1)),
      leftPercent: Number(((leftCount / validCount) * 100).toFixed(1)),
      rightPercent: Number(((rightCount / validCount) * 100).toFixed(1)),
    },
    basePosition: {
      avgCourtX: avgX !== null ? Number(avgX.toFixed(2)) : null,
      avgCourtY: avgY !== null ? Number(avgY.toFixed(2)) : null,
      dispersion: Number(dispersion.toFixed(2)),
    },
    lateralMovementMeters: Number(lateralDist.toFixed(2)),
    frontBackMovementMeters: Number(frontBackDist.toFixed(2)),
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
} {
  if (frames.length === 0) {
    const emptyPlayerSummaries: Record<string, PlayerMovementMetrics> = {};
    if (canonicalPlayerMetrics) {
      for (const [pId, m] of Object.entries(canonicalPlayerMetrics)) {
        emptyPlayerSummaries[pId] = computePlayerMovementMetrics([], m.totalDistanceM);
      }
    }
    return {
      chunks: [],
      summary: { durationSeconds: 0, sampleCount: 0, players: emptyPlayerSummaries },
      quality: {
        detectionCoverage: 0,
        lostTimePercent: 100,
        confidence: 0,
        manualCorrections: 0,
        lowConfidenceWarning: true,
      },
    };
  }

  // 1. Full-Rate Processing for Canonical Movement Metrics and Quality
  const fullRatePlayerSamples = new Map<string, TrackingSample[]>();
  const lastTotalDistances = new Map<string, number>();
  let totalConfidence = 0;
  let confidenceCount = 0;
  let inputObservedFrameCount = 0;

  for (const frame of frames) {
    // Quality honesty: ONLY count fresh observed detections, NEVER stale predicted/lost states
    const hasObserved = frame.players.some((p) => p.state === 'observed');
    if (hasObserved) inputObservedFrameCount++;

    for (const p of frame.players) {
      if (typeof p.totalDistanceM === 'number') {
        lastTotalDistances.set(p.playerId, p.totalDistanceM);
      }
      if (!p.courtPosition) continue;
      if (p.state === 'observed' && typeof p.detectionConfidence === 'number') {
        totalConfidence += p.detectionConfidence;
        confidenceCount++;
      }

      const sample: TrackingSample = {
        timestamp: frame.timestampSec,
        playerId: p.playerId,
        courtX: Number(p.courtPosition.xM.toFixed(2)),
        courtY: Number(p.courtPosition.yM.toFixed(2)),
        speed: Number((p.speedMps ?? 0).toFixed(2)),
        confidence: Number((p.detectionConfidence ?? 0).toFixed(2)),
        trackingState: p.state === 'lost' ? 'lost' : p.state === 'predicted' ? 'predicted' : 'tracked',
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
        speed: Number((p.speedMps ?? 0).toFixed(2)),
        confidence: Number((p.detectionConfidence ?? 0).toFixed(2)),
        trackingState: p.state === 'lost' ? 'lost' : p.state === 'predicted' ? 'predicted' : 'tracked',
        normalizedX: Number((p.courtPosition.xPct / 100).toFixed(3)),
        normalizedY: Number((p.courtPosition.yPct / 100).toFixed(3)),
      };
      downsampledSamples.push(sample);
    }
  }

  // 3. Compute Quality (Honest metrics: only fresh observed frames count towards coverage)
  const durationSec = frames.length > 1 ? frames[frames.length - 1].timestampSec - frames[0].timestampSec : 0;
  const detectionCoverage = frames.length > 0 ? inputObservedFrameCount / frames.length : 0;
  const lostTimePercent = Math.max(0, (1 - detectionCoverage) * 100);
  const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
  const lowConfidenceWarning = avgConfidence < 0.6 || detectionCoverage < 0.5;

  const quality: TrackingQuality = {
    detectionCoverage: Number(detectionCoverage.toFixed(2)),
    lostTimePercent: Number(lostTimePercent.toFixed(1)),
    confidence: Number(avgConfidence.toFixed(2)),
    manualCorrections: 0,
    lowConfidenceWarning,
  };

  // 4. Compute Player Summaries from Full-Rate Telemetry (preserving all high-frequency motion)
  const playerSummaries: Record<string, PlayerMovementMetrics> = {};
  for (const [pId, pSamples] of fullRatePlayerSamples.entries()) {
    const canonicalDist = canonicalPlayerMetrics?.[pId]?.totalDistanceM ?? lastTotalDistances.get(pId);
    playerSummaries[pId] = computePlayerMovementMetrics(pSamples, canonicalDist);
  }

  if (canonicalPlayerMetrics) {
    for (const [pId, m] of Object.entries(canonicalPlayerMetrics)) {
      if (!playerSummaries[pId]) {
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

  return { chunks, summary, quality };
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
