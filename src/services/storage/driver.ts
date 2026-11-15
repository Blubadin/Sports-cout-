import type { TrackingTelemetryV1 } from '../../types';
import {
  MAX_TRACKING_PAGE_SIZE,
  TRACKING_STORE_NAMES,
  boundedPageSize,
  compareAnalysesNewestFirst,
  type TrackingAnalysis,
  type TrackingAnalysisPage,
  type TrackingAnalysisPageOptions,
  type TrackingCandidate,
  type TrackingDatabaseSchemaTarget,
  type TrackingOrphanRepairResult,
  type TrackingSample,
  type TrackingSampleChunk,
  type TrackingSampleChunkPage,
  type TrackingSamplePage,
  type TrackingSamplePageOptions,
  type TrackingStorageDriver,
  type TrackingTelemetryPage,
} from './types';

// -------------------------------------------------------------
// IndexedDB driver with stores: trackingAnalyses, trackingSampleChunks, trackingCandidates, trackingTelemetryPages
// -------------------------------------------------------------
const DB_NAME = 'sportscout-tracking-v1';
const DB_VERSION = 3;

function cursorKey(analysisId: string, cursor: number): string {
  return `${analysisId}:${String(cursor).padStart(20, '0')}`;
}

function normalizeLostPlayerProvenance(frame: TrackingTelemetryV1): TrackingTelemetryV1 {
  return {
    ...frame,
    players: frame.players.map((player) => player.state === 'lost'
      ? { ...player, observationState: null }
      : player),
  };
}

function normalizeTelemetryPage(page: TrackingTelemetryPage): TrackingTelemetryPage {
  return { ...page, frames: page.frames.map(normalizeLostPlayerProvenance) };
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

interface AnalysisPageCursor {
  id: string;
}


function encodeAnalysisCursor(analysis: TrackingAnalysis): string {
  return encodeURIComponent(JSON.stringify({ id: analysis.id }));
}

function decodeAnalysisCursor(value: string | null | undefined): AnalysisPageCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<AnalysisPageCursor>;
    if (typeof parsed.id !== 'string') {
      throw new Error('Invalid cursor fields');
    }
    return { id: parsed.id };
  } catch {
    throw new Error('Tracking analysis cursor is invalid');
  }
}


function isAfterAnalysisCursor(analysis: TrackingAnalysis, cursor: AnalysisPageCursor | null): boolean {
  return cursor === null || analysis.id > cursor.id;
}


function insertAnalysisIdAscending(rows: TrackingAnalysis[], analysis: TrackingAnalysis, maximum: number): void {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].id <= analysis.id) low = middle + 1;
    else high = middle;
  }
  rows.splice(low, 0, analysis);
  if (rows.length > maximum) rows.pop();
}

function completeAnalysisPage(rows: TrackingAnalysis[], requestedLimit: number): TrackingAnalysisPage {
  const hasMore = rows.length > requestedLimit;
  const analyses = rows.slice(0, requestedLimit);
  return {
    analyses,
    hasMore,
    nextCursor: hasMore && analyses.length > 0 ? encodeAnalysisCursor(analyses[analyses.length - 1]) : null,
  };
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
    return (await this.listAnalysisPage({ projectId })).analyses;
  }

  async getLatestAnalysis(projectId?: string): Promise<TrackingAnalysis | null> {
    const db = await openTrackingDatabase();
    if (!db) return null;
    return new Promise<TrackingAnalysis | null>((resolve, reject) => {
      const tx = db.transaction('trackingAnalyses', 'readonly');
      const store = tx.objectStore('trackingAnalyses');
      const source = projectId ? store.index('projectId') : store;
      const range = projectId ? IDBKeyRange.only(projectId) : undefined;
      const request = source.openCursor(range);
      let latest: TrackingAnalysis | null = null;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const analysis = cursor.value as TrackingAnalysis;
        if (!latest || compareAnalysesNewestFirst(analysis, latest) < 0) latest = analysis;
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.oncomplete = () => resolve(latest);
      tx.onerror = () => reject(transactionError(tx));
    });
  }

  async listAnalysisPage(options: TrackingAnalysisPageOptions): Promise<TrackingAnalysisPage> {
    const db = await openTrackingDatabase();
    if (!db) return { analyses: [], nextCursor: null, hasMore: false };
    const limit = boundedPageSize(options.limit);
    const cursor = decodeAnalysisCursor(options.after);
    return new Promise<TrackingAnalysisPage>((resolve, reject) => {
      const tx = db.transaction('trackingAnalyses', 'readonly');
      const store = tx.objectStore('trackingAnalyses');
      const source = options.projectId ? store.index('projectId') : store;
      const range = options.projectId
        ? IDBKeyRange.only(options.projectId)
        : cursor ? IDBKeyRange.lowerBound(cursor.id, true) : undefined;
      const request = source.openCursor(range);
      const rows: TrackingAnalysis[] = [];
      let soughtAfterCursor = !options.projectId || !cursor;
      request.onsuccess = () => {
        const rowCursor = request.result;
        if (!rowCursor) return;
        const analysis = rowCursor.value as TrackingAnalysis;
        if (!soughtAfterCursor && options.projectId && cursor) {
          soughtAfterCursor = true;
          if (analysis.id <= cursor.id) {
            try {
              rowCursor.continuePrimaryKey(options.projectId, cursor.id);
            } catch {
              rowCursor.continue();
            }
            return;
          }
        }
        if (isAfterAnalysisCursor(analysis, cursor)) rows.push(analysis);
        if (rows.length >= limit + 1) return;
        rowCursor.continue();
      };
      request.onerror = () => reject(request.error ?? transactionError(tx));
      tx.oncomplete = () => resolve(completeAnalysisPage(rows, limit));
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
    const normalizedPage = normalizeTelemetryPage(page);
    validateTelemetryPage(normalizedPage);
    const db = await openTrackingDatabase();
    if (!db) throw new Error("Persistent tracking storage is unavailable");
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trackingTelemetryPages', 'readwrite');
      const store = tx.objectStore('trackingTelemetryPages');
      const request = store.get(normalizedPage.id);
      request.onsuccess = () => {
        const existing = request.result as TrackingTelemetryPage | undefined;
        if (existing && JSON.stringify(normalizeTelemetryPage(existing)) !== JSON.stringify(normalizedPage)) {
          tx.abort();
          reject(new Error('Telemetry cursor page conflicts with an existing persisted page'));
          return;
        }
        if (!existing) store.put(normalizedPage, normalizedPage.id);
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
      const cursorKeyAtPosition = cursorKey(analysisId, afterCursor);
      const endKey = `${analysisId};`;
      const coveringRequest = store.openCursor(
        IDBKeyRange.bound(`${analysisId}:`, cursorKeyAtPosition),
        'prev',
      );
      let page: TrackingTelemetryPage | null = null;
      coveringRequest.onsuccess = () => {
        const cursor = coveringRequest.result;
        if (cursor && cursor.value.analysisId === analysisId) {
          const candidate = cursor.value as TrackingTelemetryPage;
          if (candidate.startCursor <= afterCursor && candidate.endCursor > afterCursor) {
            page = candidate;
            return;
          }
        }

        // The preceding page does not cover the requested cursor. Return the next page
        // so callers can identify and repair only the gap before it.
        const nextRequest = store.openCursor(
          IDBKeyRange.bound(cursorKeyAtPosition, endKey, true, false),
        );
        nextRequest.onsuccess = () => {
          const nextCursor = nextRequest.result;
          if (nextCursor && nextCursor.value.analysisId === analysisId) {
            page = nextCursor.value as TrackingTelemetryPage;
          }
        };
        nextRequest.onerror = () => reject(nextRequest.error ?? transactionError(tx));
      };
      coveringRequest.onerror = () => reject(coveringRequest.error ?? transactionError(tx));
      tx.oncomplete = () => resolve(page ? normalizeTelemetryPage(page) : null);
      tx.onerror = () => reject(transactionError(tx));
      tx.onabort = () => reject(transactionError(tx));
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
    return (await this.listAnalysisPage({ projectId })).analyses;
  }

  async getLatestAnalysis(projectId?: string): Promise<TrackingAnalysis | null> {
    let latest: TrackingAnalysis | null = null;
    for (const analysis of this.analyses.values()) {
      if (projectId && analysis.projectId !== projectId) continue;
      if (!latest || compareAnalysesNewestFirst(analysis, latest) < 0) latest = analysis;
    }
    return latest;
  }

  async listAnalysisPage(options: TrackingAnalysisPageOptions): Promise<TrackingAnalysisPage> {
    const limit = boundedPageSize(options.limit);
    const cursor = decodeAnalysisCursor(options.after);
    const rows: TrackingAnalysis[] = [];
    for (const analysis of this.analyses.values()) {
      if (options.projectId && analysis.projectId !== options.projectId) continue;
      if (isAfterAnalysisCursor(analysis, cursor)) insertAnalysisIdAscending(rows, analysis, limit + 1);
    }
    return completeAnalysisPage(rows, limit);
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
    const normalizedPage = normalizeTelemetryPage(page);
    validateTelemetryPage(normalizedPage);
    const existing = this.telemetryPages.get(normalizedPage.id);
    if (existing && JSON.stringify(normalizeTelemetryPage(existing)) !== JSON.stringify(normalizedPage)) {
      throw new Error('Telemetry cursor page conflicts with an existing persisted page');
    }
    this.telemetryPages.set(normalizedPage.id, normalizedPage);
  }

  async getTelemetryPage(analysisId: string, afterCursor: number): Promise<TrackingTelemetryPage | null> {
    const page = Array.from(this.telemetryPages.values())
      .filter((page) => page.analysisId === analysisId && page.endCursor > afterCursor)
      .sort((a, b) => a.startCursor - b.startCursor)[0] ?? null;
    return page ? normalizeTelemetryPage(page) : null;
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
  return [...analyses].sort(compareAnalysesNewestFirst)[0] ?? null;
}

export async function loadBadmintonTrackingAnalysis(projectId: string): Promise<TrackingAnalysis | null> {
  return getLatestTrackingAnalysisForProject(projectId);
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
  return (await listTrackingAnalysisPage({ projectId })).analyses;
}

export async function listTrackingAnalysisPage(options: TrackingAnalysisPageOptions = {}): Promise<TrackingAnalysisPage> {
  return getTrackingStorageDriver().listAnalysisPage(options);
}

export async function getLatestTrackingAnalysisForProject(projectId?: string): Promise<TrackingAnalysis | null> {
  return getTrackingStorageDriver().getLatestAnalysis(projectId);
}

export async function getTrackingSampleChunks(
  analysisId: string,
  afterChunkIndex = -1,
  limit = MAX_TRACKING_PAGE_SIZE,
): Promise<TrackingSampleChunk[]> {
  const driver = getTrackingStorageDriver();
  return driver.getChunks(analysisId, afterChunkIndex, limit);
}

export async function getTrackingSampleChunkPage(
  analysisId: string,
  afterChunkIndex = -1,
  limit = MAX_TRACKING_PAGE_SIZE,
): Promise<TrackingSampleChunkPage> {
  const pageSize = boundedPageSize(limit);
  const chunks = await getTrackingSampleChunks(analysisId, afterChunkIndex, pageSize);
  const lastChunk = chunks[chunks.length - 1];
  const hasMore = Boolean(lastChunk && chunks.length === pageSize &&
    (await getTrackingSampleChunks(analysisId, lastChunk.chunkIndex, 1)).length > 0);
  return { chunks, nextCursor: hasMore ? lastChunk!.chunkIndex : null, hasMore };
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
  options: TrackingSamplePageOptions = {},
): Promise<TrackingSamplePage> {
  if (options.startTime !== undefined && options.endTime !== undefined && options.startTime > options.endTime) {
    return { samples: [], nextCursor: null, hasMore: false };
  }
  const limit = boundedPageSize(options.limit);
  const afterChunkIndex = options.afterChunkIndex ?? -1;
  const chunks = await getTrackingSampleChunks(analysisId, afterChunkIndex, limit);
  const samples: TrackingSample[] = [];

  for (const chunk of chunks) {
    if (options?.startTime !== undefined && chunk.endTime < options.startTime) continue;
    if (options?.endTime !== undefined && chunk.startTime > options.endTime) continue;

    for (const sample of chunk.samples) {
      if (options?.startTime !== undefined && sample.timestamp < options.startTime) continue;
      if (options?.endTime !== undefined && sample.timestamp > options.endTime) continue;
      if (options?.playerId !== undefined && sample.playerId !== options.playerId) continue;
      samples.push(sample);
    }
  }

  const lastChunk = chunks[chunks.length - 1];
  if (!lastChunk || chunks.length < limit) return { samples, nextCursor: null, hasMore: false };
  if (options.endTime !== undefined && chunks.some((chunk) => chunk.startTime > options.endTime!)) {
    return { samples, nextCursor: null, hasMore: false };
  }
  const nextChunk = await getTrackingSampleChunks(analysisId, lastChunk.chunkIndex, 1);
  const hasMore = nextChunk.length > 0 &&
    (options.endTime === undefined || nextChunk[0].startTime <= options.endTime);
  return { samples, nextCursor: hasMore ? lastChunk.chunkIndex : null, hasMore };
}

export async function deleteTrackingAnalysis(analysisId: string): Promise<void> {
  const driver = getTrackingStorageDriver();
  await driver.deleteAnalysis(analysisId);
}
