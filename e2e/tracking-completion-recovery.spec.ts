import { expect, test, type Page } from '@playwright/test';

const storeModuleUrl = '/src/services/storage/trackingStorage.ts';
const sessionStoreModuleUrl = '/src/services/trackingSessionStore.ts';
const apiModuleUrl = '/src/services/aiTrackingService.ts';

function makeFrames(analysisId: string, count: number) {
  const calibration = {
    calibrationId: 'calibration-e2e',
    cameraSegmentId: 'segment-e2e',
    state: 'CALIBRATED',
    source: 'manual',
    createdAtFrame: 0,
    createdAtTimestampSec: 0,
    confidence: 1,
  };
  return Array.from({ length: count }, (_, index) => ({
    schemaVersion: 1,
    analysisId,
    pipelineRunId: analysisId,
    timestampSec: index / 30,
    frameIndex: index + 1,
    sceneState: 'COURT_PLAY',
    isMetricValid: true,
    cameraSegmentId: 'segment-e2e',
    calibrationId: 'calibration-e2e',
    calibrationState: 'CALIBRATED',
    calibration,
    source: 'real_tracking',
    isSynthetic: false,
    players: [{
      playerId: 'P1',
      state: 'observed',
      observationState: 'observed',
      detectionConfidence: 0.95,
      totalDistanceM: index / 100,
      speedMps: 0.3,
      courtPosition: {
        xM: 2 + index / 10000,
        yM: 3,
        xPct: 32.8 + index / 10000,
        yPct: 22.4,
      },
    }],
  }));
}

async function openTrackingApp(page: Page, localCursor?: { sessionId: string; projectId: string; cursor: number }) {
  if (localCursor) {
    await page.addInitScript(({ sessionId, projectId, cursor }) => {
      localStorage.setItem(`scout_tracking_session_${projectId}`, JSON.stringify({
        sessionId,
        cursor,
        status: 'PROCESSING',
        gameType: 'singles',
        trackedPlayerCount: 1,
      }));
    }, localCursor);
  }
  await page.goto('/');
}

async function installResultsApiFixture(page: Page, sessionId: string, frames: ReturnType<typeof makeFrames>) {
  const requests: Array<{ after: number; limit: number }> = [];
  await page.route(`http://127.0.0.1:8000/api/tracking/sessions/${sessionId}/results**`, async (route) => {
    const url = new URL(route.request().url());
    const after = Number(url.searchParams.get('after') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 250);
    requests.push({ after, limit });
    const telemetry = frames.slice(after, after + limit);
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId,
        status: 'COMPLETED',
        sampleCount: telemetry.length,
        totalSampleCount: frames.length,
        nextCursor: after + telemetry.length,
        maximumPageSize: 250,
        committedSequence: 2,
        telemetry,
      }),
    });
  });
  return requests;
}

async function seedRawPage(page: Page, sessionId: string, startCursor: number, frames: ReturnType<typeof makeFrames>) {
  await page.evaluate(async ({ sessionId, startCursor, frames, storeModuleUrl }) => {
    const { IndexedDbTrackingDriver } = await import(storeModuleUrl);
    const driver = new IndexedDbTrackingDriver();
    await driver.saveTelemetryPage({
      id: `${sessionId}:${String(startCursor).padStart(20, '0')}`,
      analysisId: sessionId,
      startCursor,
      endCursor: startCursor + frames.length,
      frames,
    });
  }, { sessionId, startCursor, frames, storeModuleUrl });
}

async function persistCompleted(
  page: Page,
  options: {
    sessionId: string;
    projectId: string;
    cursor: number;
    liveFrames?: ReturnType<typeof makeFrames>;
    failAnalysisWrite?: boolean;
  },
) {
  return page.evaluate(async ({ sessionId, projectId, cursor, liveFrames, failAnalysisWrite, storeModuleUrl, sessionStoreModuleUrl, apiModuleUrl }) => {
    const [{ trackingSessionStore }, { aiTrackingService }, storage] = await Promise.all([
      import(sessionStoreModuleUrl), import(apiModuleUrl), import(storeModuleUrl),
    ]);
    aiTrackingService.setBaseUrl('http://127.0.0.1:8000');
    const state = trackingSessionStore.getProjectState(projectId)!;
    state.sessionId = sessionId;
    state.status = 'PROCESSING';
    state.cursor = cursor;
    state.telemetry = liveFrames ?? [];
    state.trackedPlayerCount = 1;
    state.sessionStatus = {
      sessionId,
      status: 'COMPLETED',
      progressPct: 100,
      currentFrame: 300,
      totalFrames: 300,
      analyzedFrames: 300,
      committedResultCursor: 300,
      sourceFps: 30,
      frameStride: 1,
      trackedPlayerCount: 1,
      players: [{ playerId: 'P1', totalDistanceM: 3 }],
      error: null,
    } as any;

    const driver = storage.getTrackingStorageDriver();
    let firstError: string | null = null;
    let statusAfterFailure: string | null = null;
    let chunksAfterFailure = 0;
    if (failAnalysisWrite) {
      const prototype = IDBObjectStore.prototype as unknown as {
        put: (this: IDBObjectStore, ...args: any[]) => IDBRequest<IDBValidKey>;
      };
      const originalPut = prototype.put;
      let failed = false;
      prototype.put = function (this: IDBObjectStore, ...args: any[]) {
        if (this.name === 'trackingAnalyses' && !failed) {
          failed = true;
          throw new DOMException('Injected IndexedDB quota write failure', 'QuotaExceededError');
        }
        return originalPut.apply(this, args as [any, IDBValidKey?]);
      };
      try {
        await trackingSessionStore.persistCompletedAnalysis(projectId, state);
      } catch (error) {
        firstError = String(error);
      } finally {
        prototype.put = originalPut;
      }
      statusAfterFailure = state.status;
      chunksAfterFailure = (await driver.getChunks(sessionId, -1, 250)).length;
    }

    await trackingSessionStore.persistCompletedAnalysis(projectId, state);
    if (failAnalysisWrite) await trackingSessionStore.persistCompletedAnalysis(projectId, state);
    const analysis = await driver.getAnalysis(sessionId);
    const chunks = await driver.getChunks(sessionId, -1, 250);
    const rawPage = await driver.getTelemetryPage(sessionId, 0);
    const samples = chunks.flatMap((chunk: any) => chunk.samples);
    return {
      firstError,
      statusAfterFailure,
      chunksAfterFailure,
      stateStatus: state.status,
      cursor: state.cursor,
      analysisStatus: analysis?.status ?? null,
      summarySampleCount: analysis?.summary.sampleCount ?? null,
      manualCorrections: analysis?.quality?.manualCorrections ?? null,
      sampleTimestamps: samples.map((sample: any) => sample.timestamp),
      firstRawPage: rawPage,
      driverName: driver.constructor.name,
    };
  }, {
    ...options,
    storeModuleUrl,
    sessionStoreModuleUrl,
    apiModuleUrl,
  });
}

test('repairs a missing backend page that spans the browser cursor without appending its prefix twice', async ({ page }) => {
  const sessionId = 'cursor-middle';
  const projectId = 'project-cursor-middle';
  const frames = makeFrames(sessionId, 300);
  await openTrackingApp(page, { sessionId, projectId, cursor: 100 });
  const requests = await installResultsApiFixture(page, sessionId, frames);

  const result = await persistCompleted(page, {
    sessionId,
    projectId,
    cursor: 100,
    liveFrames: frames.slice(0, 100),
  });

  expect(requests.map((request) => request.after)).toEqual([0, 250]);
  expect(result.driverName).toBe('IndexedDbTrackingDriver');
  expect(result.analysisStatus).toBe('completed');
  expect(result.stateStatus).toBe('COMPLETED');
  expect(result.cursor).toBe(300);
  expect(result.firstRawPage).toBeNull();
  expect(result.sampleTimestamps.length).toBe(result.summarySampleCount);
  expect(new Set(result.sampleTimestamps).size).toBe(result.sampleTimestamps.length);
});

test('repairs missing raw pages when the browser cursor is exactly on a backend page boundary', async ({ page }) => {
  const sessionId = 'cursor-boundary';
  const projectId = 'project-cursor-boundary';
  const frames = makeFrames(sessionId, 300);
  await openTrackingApp(page, { sessionId, projectId, cursor: 250 });
  const requests = await installResultsApiFixture(page, sessionId, frames);

  const result = await persistCompleted(page, { sessionId, projectId, cursor: 250 });

  expect(requests).toEqual([{ after: 0, limit: 250 }, { after: 250, limit: 250 }]);
  expect(result.analysisStatus).toBe('completed');
  expect(result.cursor).toBe(300);
  expect(result.sampleTimestamps.length).toBe(result.summarySampleCount);
});

test('reads a persisted native IndexedDB page that covers a cursor in its middle', async ({ page }) => {
  const sessionId = 'covering-page';
  const frames = makeFrames(sessionId, 250);
  await openTrackingApp(page);
  await seedRawPage(page, sessionId, 0, frames);

  const storedPage = await page.evaluate(async ({ sessionId, storeModuleUrl }) => {
    const { IndexedDbTrackingDriver } = await import(storeModuleUrl);
    return new IndexedDbTrackingDriver().getTelemetryPage(sessionId, 100);
  }, { sessionId, storeModuleUrl });

  expect(storedPage?.startCursor).toBe(0);
  expect(storedPage?.endCursor).toBe(250);
});

test('fills only a missing gap between persisted raw pages without creating overlapping pages', async ({ page }) => {
  const sessionId = 'partial-raw-pages';
  const projectId = 'project-partial-raw-pages';
  const frames = makeFrames(sessionId, 300);
  await openTrackingApp(page, { sessionId, projectId, cursor: 300 });
  await seedRawPage(page, sessionId, 0, frames.slice(0, 50));
  await seedRawPage(page, sessionId, 200, frames.slice(200, 300));
  const requests = await installResultsApiFixture(page, sessionId, frames);

  const result = await persistCompleted(page, { sessionId, projectId, cursor: 300 });

  expect(requests).toEqual([{ after: 50, limit: 150 }]);
  expect(result.analysisStatus).toBe('completed');
  expect(result.sampleTimestamps.length).toBe(result.summarySampleCount);
  expect(new Set(result.sampleTimestamps).size).toBe(result.sampleTimestamps.length);
});

test('reconciles a stale old localStorage cursor with the committed result cursor', async ({ page }) => {
  const sessionId = 'cursor-old';
  const projectId = 'project-cursor-old';
  const frames = makeFrames(sessionId, 300);
  await openTrackingApp(page, { sessionId, projectId, cursor: 25 });
  const requests = await installResultsApiFixture(page, sessionId, frames);

  const result = await persistCompleted(page, { sessionId, projectId, cursor: 25 });

  expect(requests[0]).toEqual({ after: 0, limit: 250 });
  expect(result.analysisStatus).toBe('completed');
  expect(result.cursor).toBe(300);
});

test('rewinds a stale ahead localStorage cursor to committed data during completion recovery', async ({ page }) => {
  const sessionId = 'cursor-ahead';
  const projectId = 'project-cursor-ahead';
  const frames = makeFrames(sessionId, 300);
  await openTrackingApp(page, { sessionId, projectId, cursor: 450 });
  const requests = await installResultsApiFixture(page, sessionId, frames);

  const result = await persistCompleted(page, { sessionId, projectId, cursor: 450 });

  expect(requests[0]).toEqual({ after: 0, limit: 250 });
  expect(result.analysisStatus).toBe('completed');
  expect(result.cursor).toBe(300);
});

test('does not include raw page frames beyond the backend committed cursor in saved analysis', async ({ page }) => {
  const sessionId = 'raw-page-ahead';
  const projectId = 'project-raw-page-ahead';
  const frames = makeFrames(sessionId, 350);
  await openTrackingApp(page, { sessionId, projectId, cursor: 450 });
  await seedRawPage(page, sessionId, 0, frames.slice(0, 250));
  await seedRawPage(page, sessionId, 250, frames.slice(250, 350));
  const requests = await installResultsApiFixture(page, sessionId, frames);

  const result = await persistCompleted(page, { sessionId, projectId, cursor: 450 });

  expect(requests).toEqual([]);
  expect(result.cursor).toBe(300);
  expect(result.analysisStatus).toBe('completed');
  expect(result.summarySampleCount).toBe(100);
  expect(Math.max(...result.sampleTimestamps)).toBeLessThan(10);
});

test('retries an analysis metadata write failure idempotently and repeated completion preserves one result', async ({ page }) => {
  const sessionId = 'retry-completion';
  const projectId = 'project-retry-completion';
  const frames = makeFrames(sessionId, 300);
  await openTrackingApp(page, { sessionId, projectId, cursor: 100 });
  const requests = await installResultsApiFixture(page, sessionId, frames);

  const result = await persistCompleted(page, {
    sessionId,
    projectId,
    cursor: 100,
    failAnalysisWrite: true,
  });

  expect(result.firstError).toMatch(/quota/i);
  expect(result.statusAfterFailure).not.toBe('COMPLETED');
  expect(result.chunksAfterFailure).toBeGreaterThan(0);
  expect(result.analysisStatus).toBe('completed');
  expect(result.stateStatus).toBe('COMPLETED');
  expect(result.cursor).toBe(300);
  expect(requests.map((request) => request.after)).toEqual([0, 250]);
  expect(result.sampleTimestamps.length).toBe(result.summarySampleCount);
  expect(new Set(result.sampleTimestamps).size).toBe(result.sampleTimestamps.length);
});

test('completion replay retains IndexedDB corrections and does not fetch raw pages again', async ({ page }) => {
  const sessionId = 'completion-correction';
  const projectId = 'project-completion-correction';
  await openTrackingApp(page, { sessionId, projectId, cursor: 450 });
  const requests = await installResultsApiFixture(page, sessionId, makeFrames(sessionId, 300));

  const result = await page.evaluate(async ({ sessionId, projectId, storeModuleUrl, sessionStoreModuleUrl }) => {
    const [{ trackingSessionStore }, storage] = await Promise.all([
      import(sessionStoreModuleUrl), import(storeModuleUrl),
    ]);
    const driver = storage.getTrackingStorageDriver();
    await driver.saveAnalysis({
      id: sessionId,
      projectId,
      sportType: 'badminton',
      gameType: 'singles',
      status: 'completed',
      engineVersion: 'tracking-v2',
      detectorModel: 'YOLO',
      trackerModel: 'ByteTrack',
      sampleRateHz: 10,
      createdAt: new Date().toISOString(),
      players: [],
      quality: { detectionCoverage: 1, lostTimePercent: 0, confidence: 1, manualCorrections: 4 },
      summary: { durationSeconds: 2, sampleCount: 1, players: {} },
    });
    await driver.saveChunks([{
      id: `${sessionId}:0`, analysisId: sessionId, chunkIndex: 0, startTime: 0, endTime: 0.1,
      samples: [{
        timestamp: 0.1, frameIndex: 3, playerId: 'P1', courtX: 2, courtY: 3, speed: null,
        confidence: 1, trackingState: 'tracked', observationState: 'manual', reviewState: 'corrected',
      }],
    }]);
    const state = trackingSessionStore.getProjectState(projectId)!;
    state.sessionId = sessionId;
    state.cursor = 450;
    state.status = 'PROCESSING';
    state.sessionStatus = { sessionId, status: 'COMPLETED', committedResultCursor: 300 } as any;
    await trackingSessionStore.persistCompletedAnalysis(projectId, state);
    const saved = await driver.getAnalysis(sessionId);
    const chunks = await driver.getChunks(sessionId, -1, 250);
    return {
      cursor: state.cursor,
      status: state.status,
      correctionCount: saved?.quality?.manualCorrections,
      correctionState: chunks[0]?.samples[0]?.observationState,
      correctionReviewState: chunks[0]?.samples[0]?.reviewState,
    };
  }, { sessionId, projectId, storeModuleUrl, sessionStoreModuleUrl });

  expect(requests).toEqual([]);
  expect(result).toEqual({
    cursor: 300,
    status: 'COMPLETED',
    correctionCount: 4,
    correctionState: 'manual',
    correctionReviewState: 'corrected',
  });
});
