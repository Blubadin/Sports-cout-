import { expect, test } from '@playwright/test';

test('shuttle owners and normalized legacy player state survive IndexedDB reload and JSON export', async ({ page }) => {
  await page.goto('/');
  const analysisId = await page.evaluate(async () => {
    const { toTrackingTelemetryV1 } = await import('/src/services/trackingSessionApi.ts');
    const storage = await import('/src/services/storage/trackingStorage.ts');
    storage.setTrackingStorageDriver(new storage.IndexedDbTrackingDriver());
    const id = `e2e-shuttle-owners-${Date.now()}`;
    const frame = toTrackingTelemetryV1({
      analysisId: id,
      pipelineRunId: 'run-42',
      timestampSec: 1,
      frameIndex: 30,
      players: [{
        playerId: 'P1',
        state: 'lost',
        observationState: 'observed',
        groundPointProvenance: 'pose_both_ankles',
      }],
      shuttle: {
        timestampSec: 1,
        frameIndex: 30,
        positionPx: { x: 320, y: 180 },
        confidence: 0.9,
        state: 'observed',
        source: 'temporal_tracker',
        trajectoryId: null,
        cameraSegmentId: 'segment-2',
        pipelineRunId: 'run-42',
      },
    });
    await storage.saveTrackingTelemetryPage({
      id: `${id}:00000000000000000000`,
      analysisId: id,
      startCursor: 0,
      endCursor: 1,
      frames: [frame],
    });
    return id;
  });

  await page.reload();
  const reloaded = await page.evaluate(async (id) => {
    const storage = await import('/src/services/storage/trackingStorage.ts');
    storage.setTrackingStorageDriver(new storage.IndexedDbTrackingDriver());
    const telemetryPage = await storage.getTrackingTelemetryPage(id, 0);
    const frame = telemetryPage?.frames[0] ?? null;
    return { frame, exportedJson: frame ? JSON.stringify(frame) : null };
  }, analysisId);

  expect(reloaded.frame?.shuttle?.cameraSegmentId).toBe('segment-2');
  expect(reloaded.frame?.shuttle?.pipelineRunId).toBe('run-42');
  expect(reloaded.frame?.players[0].observationState).toBeNull();
  expect(reloaded.exportedJson).toContain('"pipelineRunId":"run-42"');
  expect(reloaded.exportedJson).toContain('"cameraSegmentId":"segment-2"');
});
