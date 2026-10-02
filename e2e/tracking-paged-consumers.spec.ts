import { expect, test } from '@playwright/test';

const moduleUrl = '/src/services/storage/trackingStorage.ts';

function analysis(id: string, createdAt: string, projectId = 'paged-project') {
  return {
    id,
    projectId,
    sportType: 'badminton',
    gameType: 'singles',
    status: 'completed',
    engineVersion: 'tracking-v2',
    detectorModel: 'YOLO',
    trackerModel: 'ByteTrack',
    sampleRateHz: 1,
    createdAt,
    completedAt: createdAt,
    players: [{ playerId: 'P1', side: 'near' }],
    quality: null,
    summary: { durationSeconds: 0, sampleCount: 0, players: {} },
  };
}

test('native IndexedDB returns complete paged tail samples and all-history metrics', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async (moduleUrl) => {
    const storage = await import(moduleUrl);
    const driver = new storage.IndexedDbTrackingDriver();
    const analysisId = 'native-paged-tail';
    let chunkReadCount = 0;
    let maximumChunkRead = 0;
    const originalGetChunks = storage.IndexedDbTrackingDriver.prototype.getChunks;
    storage.IndexedDbTrackingDriver.prototype.getChunks = async function (id: string, after = -1, limit = 250) {
      chunkReadCount += 1;
      maximumChunkRead = Math.max(maximumChunkRead, limit);
      return originalGetChunks.call(this, id, after, limit);
    };
    const samples = Array.from({ length: 251 }, (_, index) => ({
      timestamp: index,
      frameIndex: index,
      playerId: 'P1',
      courtX: 2 + (index % 20) * 0.05,
      courtY: 3 + (index % 7) * 0.1,
      speed: null,
      confidence: 0.9,
      trackingState: 'tracked' as const,
    }));
    await driver.saveAnalysis({
      id: analysisId, projectId: 'paged-project', sportType: 'badminton', gameType: 'singles',
      status: 'completed', engineVersion: 'tracking-v2', detectorModel: 'YOLO', trackerModel: 'ByteTrack',
      sampleRateHz: 1, createdAt: new Date(0).toISOString(), players: [{ playerId: 'P1', side: 'near' }],
      quality: null, summary: { durationSeconds: 250, sampleCount: 251, players: {} },
    });
    await driver.saveChunks(samples.map((sample, chunkIndex) => ({
      id: `${analysisId}:${chunkIndex}`, analysisId, chunkIndex,
      startTime: sample.timestamp, endTime: sample.timestamp, samples: [sample],
    })));
    let tail;
    let aggregate;
    try {
      tail = await storage.getTrackingSamples(analysisId, {
        afterChunkIndex: 249, limit: 10, startTime: 250, endTime: 250,
      });
      aggregate = await storage.getTrackingMovementMetrics(analysisId);
    } finally {
      storage.IndexedDbTrackingDriver.prototype.getChunks = originalGetChunks;
    }
    const expected = storage.computePlayerMovementMetrics(samples);
    return {
      tailFrames: tail.samples.map((sample: any) => sample.frameIndex),
      tailCursor: tail.nextCursor,
      aggregate: aggregate.metrics,
      expected,
      sampleCount: aggregate.sampleCount,
      chunkReadCount,
      maximumChunkRead,
    };
  }, moduleUrl);

  expect(result.tailFrames).toEqual([250]);
  expect(result.tailCursor).toBeNull();
  expect(result.sampleCount).toBe(251);
  expect(result.chunkReadCount).toBe(5);
  expect(result.maximumChunkRead).toBeLessThanOrEqual(250);
  expect(result.aggregate).toEqual(result.expected);
});

test('native IndexedDB latest analysis is deterministic beyond the first 250 rows', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ moduleUrl, rows }) => {
    const storage = await import(moduleUrl);
    const driver = new storage.IndexedDbTrackingDriver();
    for (const row of rows) await driver.saveAnalysis(row);
    await driver.saveAnalysis({ ...rows[0], id: 'unrelated-latest', projectId: 'other-project', createdAt: new Date(999_999).toISOString() });
    let cursorSteps = 0;
    const cursorPrototype = IDBCursor.prototype;
    const originalContinue = cursorPrototype.continue;
    cursorPrototype.continue = function (...args: []) {
      cursorSteps += 1;
      return originalContinue.apply(this, args);
    };
    let page;
    let nextPage;
    let firstPageCursorSteps = 0;
    try {
      page = await storage.listTrackingAnalysisPage({ projectId: 'paged-project', limit: 250 });
      firstPageCursorSteps = cursorSteps;
      nextPage = await storage.listTrackingAnalysisPage({ projectId: 'paged-project', limit: 250, after: page.nextCursor });
    } finally {
      cursorPrototype.continue = originalContinue;
    }
    const latest = await storage.getLatestTrackingAnalysisForProject('paged-project');
    return {
      pageSize: page.analyses.length,
      firstId: page.analyses[0]?.id,
      hasNext: Boolean(page.nextCursor),
      nextPageSize: nextPage.analyses.length,
      nextPageLastId: nextPage.analyses[0]?.id,
      firstPageCursorSteps,
      latestId: latest?.id,
      otherProjectId: latest?.projectId,
    };
  }, {
    moduleUrl,
    rows: Array.from({ length: 251 }, (_, index) => analysis(
      `native-analysis-${String(index).padStart(3, '0')}`,
      new Date(index * 1000).toISOString(),
    )),
  });

  expect(result).toEqual({
    pageSize: 250,
    firstId: 'native-analysis-000',
    hasNext: true,
    nextPageSize: 1,
    nextPageLastId: 'native-analysis-250',
    firstPageCursorSteps: 250,
    latestId: 'native-analysis-250',
    otherProjectId: 'paged-project',
  });
});
