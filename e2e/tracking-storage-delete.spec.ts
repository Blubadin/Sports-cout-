import { expect, test, type Page } from '@playwright/test';

const storageModuleUrl = '/src/services/storage/trackingStorage.ts';

async function seedAnalysis(
  page: Page,
  analysisId: string,
  status: 'processing' | 'completed' = 'completed',
): Promise<void> {
  await page.evaluate(async ({ analysisId, status, storageModuleUrl }) => {
    const { IndexedDbTrackingDriver } = await import(storageModuleUrl);
    const driver = new IndexedDbTrackingDriver();
    const analysis = {
      id: analysisId,
      projectId: 'indexeddb-delete-test',
      sportType: 'badminton',
      gameType: 'singles',
      status,
      engineVersion: 'tracking-v2',
      detectorModel: 'YOLO',
      trackerModel: 'ByteTrack',
      sampleRateHz: 10,
      createdAt: new Date().toISOString(),
      players: [],
      quality: null,
      summary: { durationSeconds: 0, sampleCount: 0, players: {} },
    };
    await driver.saveAnalysis(analysis);
    await driver.saveChunks([{
      id: `${analysisId}:0`,
      analysisId,
      chunkIndex: 0,
      startTime: 0,
      endTime: 1,
      samples: [],
    }]);
    await driver.saveCandidate({
      id: `${analysisId}:candidate`,
      analysisId,
      timestamp: 0,
      type: 'stroke_candidate',
      confidence: 0.9,
    });
    await driver.saveTelemetryPage({
      id: `${analysisId}:${String(0).padStart(20, '0')}`,
      analysisId,
      startCursor: 0,
      endCursor: 1,
      frames: [{ schemaVersion: 1, analysisId, timestampSec: 0, frameIndex: 0, players: [] }],
    });
  }, { analysisId, status, storageModuleUrl });
}

async function readAnalysisRows(page: Page, analysisId: string) {
  return page.evaluate(async ({ analysisId, storageModuleUrl }) => {
    const { IndexedDbTrackingDriver } = await import(storageModuleUrl);
    const driver = new IndexedDbTrackingDriver();
    return {
      analysis: await driver.getAnalysis(analysisId),
      chunks: await driver.getChunks(analysisId),
      candidates: await driver.getCandidates(analysisId),
      telemetryPage: await driver.getTelemetryPage(analysisId, 0),
    };
  }, { analysisId, storageModuleUrl });
}

test.describe('native IndexedDB tracking analysis deletion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('deletes all four stores for one analysis without touching a prefix-sharing analysis', async ({ page }) => {
    const targetId = 'delete-target';
    const otherId = `${targetId}:other`;
    await seedAnalysis(page, targetId);
    await seedAnalysis(page, otherId);

    await page.evaluate(async ({ targetId, storageModuleUrl }) => {
      const { IndexedDbTrackingDriver } = await import(storageModuleUrl);
      await new IndexedDbTrackingDriver().deleteAnalysis(targetId);
    }, { targetId, storageModuleUrl });

    const targetRows = await readAnalysisRows(page, targetId);
    expect(targetRows).toEqual({ analysis: null, chunks: [], candidates: [], telemetryPage: null });
    const otherRows = await readAnalysisRows(page, otherId);
    expect(otherRows.analysis?.id).toBe(otherId);
    expect(otherRows.chunks).toHaveLength(1);
    expect(otherRows.candidates).toHaveLength(1);
    expect(otherRows.telemetryPage?.analysisId).toBe(otherId);
  });

  test('repeated deletion remains successful and leaves no records', async ({ page }) => {
    const analysisId = 'delete-repeat';
    await seedAnalysis(page, analysisId);

    await page.evaluate(async ({ analysisId, storageModuleUrl }) => {
      const { IndexedDbTrackingDriver } = await import(storageModuleUrl);
      const driver = new IndexedDbTrackingDriver();
      await driver.deleteAnalysis(analysisId);
      await driver.deleteAnalysis(analysisId);
    }, { analysisId, storageModuleUrl });

    expect(await readAnalysisRows(page, analysisId)).toEqual({
      analysis: null,
      chunks: [],
      candidates: [],
      telemetryPage: null,
    });
  });

  test('standalone chunk and candidate deletes use their owner indexes', async ({ page }) => {
    const targetId = 'indexed-delete-target';
    const otherId = `${targetId}:other`;
    await seedAnalysis(page, targetId);
    await seedAnalysis(page, otherId);

    const openedIndexes = await page.evaluate(async ({ targetId, storageModuleUrl }) => {
      const { IndexedDbTrackingDriver } = await import(storageModuleUrl);
      const prototype = IDBIndex.prototype as unknown as {
        openCursor: (...args: any[]) => IDBCursorWithValueRequest;
      };
      const originalOpenCursor = prototype.openCursor;
      const names: string[] = [];
      prototype.openCursor = function (this: IDBIndex, ...args: any[]) {
        names.push(this.name);
        return originalOpenCursor.apply(this, args);
      };
      try {
        const driver = new IndexedDbTrackingDriver();
        await driver.deleteChunks(targetId);
        await driver.deleteCandidates(targetId);
        return names;
      } finally {
        prototype.openCursor = originalOpenCursor;
      }
    }, { targetId, storageModuleUrl });

    expect(openedIndexes).toContain('analysisChunk');
    expect(openedIndexes).toContain('analysisTimestamp');
    const targetRows = await readAnalysisRows(page, targetId);
    expect(targetRows.chunks).toEqual([]);
    expect(targetRows.candidates).toEqual([]);
    expect(targetRows.analysis?.id).toBe(targetId);
    const otherRows = await readAnalysisRows(page, otherId);
    expect(otherRows.chunks).toHaveLength(1);
    expect(otherRows.candidates).toHaveLength(1);
  });

  test('an aborted multi-store transaction rejects and rolls back every delete', async ({ page }) => {
    const analysisId = 'delete-abort';
    await seedAnalysis(page, analysisId);

    const error = await page.evaluate(async ({ analysisId, storageModuleUrl }) => {
      const { IndexedDbTrackingDriver } = await import(storageModuleUrl);
      const prototype = IDBDatabase.prototype as unknown as {
        transaction: (...args: any[]) => IDBTransaction;
      };
      const originalTransaction = prototype.transaction;
      prototype.transaction = function (this: IDBDatabase, ...args: any[]) {
        const tx = originalTransaction.apply(this, args);
        if (Array.isArray(args[0]) && args[1] === 'readwrite') {
          queueMicrotask(() => {
            try { tx.abort(); } catch { /* the transaction may already have completed */ }
          });
        }
        return tx;
      };
      try {
        await new IndexedDbTrackingDriver().deleteAnalysis(analysisId);
        return null;
      } catch (reason) {
        return String(reason);
      } finally {
        prototype.transaction = originalTransaction;
      }
    }, { analysisId, storageModuleUrl });

    expect(error).toMatch(/abort|transaction/i);
    const rows = await readAnalysisRows(page, analysisId);
    expect(rows.analysis?.id).toBe(analysisId);
    expect(rows.chunks).toHaveLength(1);
    expect(rows.candidates).toHaveLength(1);
    expect(rows.telemetryPage?.analysisId).toBe(analysisId);
  });

  test('detects and repairs legacy orphan rows while preserving data with an analysis record', async ({ page }) => {
    const orphanId = 'legacy-orphan';
    const resumableId = 'active-resumable';
    await seedAnalysis(page, orphanId);
    await seedAnalysis(page, resumableId, 'processing');

    await page.evaluate(async ({ orphanId, storageModuleUrl }) => {
      const { TRACKING_STORE_NAMES } = await import(storageModuleUrl);
      const request = indexedDB.open('sportscout-tracking-v1', 3);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction([...TRACKING_STORE_NAMES], 'readwrite');
      tx.objectStore('trackingAnalyses').delete(orphanId);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('legacy delete aborted'));
      });
    }, { orphanId, storageModuleUrl });

    const result = await page.evaluate(async ({ orphanId, storageModuleUrl }) => {
      const { IndexedDbTrackingDriver } = await import(storageModuleUrl);
      const driver = new IndexedDbTrackingDriver() as IndexedDbTrackingDriver & {
        repairOrphanedAnalysisData: (id: string) => Promise<{
          status: string;
          removed: { chunks: number; candidates: number; telemetryPages: number };
        }>;
      };
      return driver.repairOrphanedAnalysisData(orphanId);
    }, { orphanId, storageModuleUrl });

    expect(result).toEqual({
      status: 'repaired',
      removed: { chunks: 1, candidates: 1, telemetryPages: 1 },
    });
    expect(await readAnalysisRows(page, orphanId)).toEqual({
      analysis: null,
      chunks: [],
      candidates: [],
      telemetryPage: null,
    });
    const protectedRows = await readAnalysisRows(page, resumableId);
    expect(protectedRows.analysis?.id).toBe(resumableId);
    expect(protectedRows.chunks).toHaveLength(1);
    expect(protectedRows.candidates).toHaveLength(1);
    expect(protectedRows.telemetryPage?.analysisId).toBe(resumableId);

    const protectedRepair = await page.evaluate(async ({ resumableId, storageModuleUrl }) => {
      const { IndexedDbTrackingDriver } = await import(storageModuleUrl);
      const driver = new IndexedDbTrackingDriver() as IndexedDbTrackingDriver & {
        repairOrphanedAnalysisData: (id: string) => Promise<{
          status: string;
          removed: { chunks: number; candidates: number; telemetryPages: number };
        }>;
      };
      return driver.repairOrphanedAnalysisData(resumableId);
    }, { resumableId, storageModuleUrl });
    expect(protectedRepair).toEqual({
      status: 'analysis-present',
      removed: { chunks: 0, candidates: 0, telemetryPages: 0 },
    });
    expect((await readAnalysisRows(page, resumableId)).chunks).toHaveLength(1);
  });
});
