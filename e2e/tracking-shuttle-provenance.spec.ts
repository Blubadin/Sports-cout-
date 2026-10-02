import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

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

test('Python per-frame lifecycle survives API conversion, native IndexedDB reload and canonical JSON export', async ({ page }) => {
  // Isolated fixture provider, never real-data validation or production capture.
  const observations = JSON.parse(execFileSync('python', ['-c', `
import json, sys
sys.path.insert(0, 'ai_service')
import numpy as np
from ai_service.shuttle_pipeline import create_shuttle_pipeline
from ai_service.shuttle_tracker import ShuttleTrackerProvider, TemporalModelOutput
class Provider(ShuttleTrackerProvider):
    def infer(self, frames):
        heatmap = np.zeros((48, 64), dtype=np.float32)
        heatmap[20, 30] = .95
        return TemporalModelOutput(heatmap)
pipeline = create_shuttle_pipeline({'shuttle_enabled': True, 'shuttle_window_size': 3,
    'shuttle_recovery_enabled': False}, custom_provider=Provider())
image = np.zeros((48, 64, 3), dtype=np.uint8)
items = []
for index in range(6):
    segment = 'segment-0' if index < 3 else 'segment-1'
    obs = pipeline.process_frame(image, index / 30, index, camera_segment_id=segment,
        pipeline_run_id='python-fixture', scene_evidence={'is_pan_tilt_zoom': False})
    assert not obs.validate(), obs.validate()
    items.append(obs.to_dict())
print(json.dumps(items))
`], { encoding: 'utf8' }));
  await page.goto('/');
  const id = await page.evaluate(async (observations) => {
    const { toTrackingTelemetryV1 } = await import('/src/services/trackingSessionApi.ts');
    const storage = await import('/src/services/storage/trackingStorage.ts');
    storage.setTrackingStorageDriver(new storage.IndexedDbTrackingDriver());
    const id = `e2e-python-lifecycle-${Date.now()}`;
    const frames = observations.map((shuttle: any) => toTrackingTelemetryV1({
      analysisId: id, pipelineRunId: shuttle.pipelineRunId, cameraSegmentId: shuttle.cameraSegmentId,
      timestampSec: shuttle.timestampSec, frameIndex: shuttle.frameIndex, players: [], shuttle,
    }));
    await storage.saveTrackingTelemetryPage({ id: `${id}:00000000000000000000`, analysisId: id,
      startCursor: 0, endCursor: frames.length, frames });
    return id;
  }, observations);
  await page.reload();
  const exported = await page.evaluate(async (id) => {
    const storage = await import('/src/services/storage/trackingStorage.ts');
    const { validateShuttleObservation } = await import('/src/types/shuttleTelemetry.ts');
    storage.setTrackingStorageDriver(new storage.IndexedDbTrackingDriver());
    const result = await storage.getTrackingTelemetryPage(id, 0);
    const observations = result!.frames.map(frame => frame.shuttle);
    return { json: JSON.stringify(observations), valid: observations.every(obs => validateShuttleObservation(obs).valid) };
  }, id);
  expect(exported.valid).toBe(true);
  const restored = JSON.parse(exported.json);
  expect(restored).toEqual(observations);
  expect(restored.map((obs: any) => obs.trackingState)).toEqual([
    'WARMING_UP', 'WARMING_UP', 'TRACKING', 'WARMING_UP', 'WARMING_UP', 'TRACKING',
  ]);
  expect(restored.map((obs: any) => obs.warmupRemainingFrames)).toEqual([2, 1, 0, 2, 1, 0]);
  expect(restored[3].validity).toEqual({ positionValid: false, reason: 'warming_up' });
  expect(restored[3].positionPx).toBeNull();
  expect(restored[5].evidenceFusion.sceneContextConsumed).toBe(true);
});
