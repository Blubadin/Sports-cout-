import { describe, expect, it, vi } from 'vitest';
import { trackingSessionStore, createDefaultProjectTrackingState } from './trackingSessionStore';
import { aiTrackingService } from './aiTrackingService';
import { MemoryTrackingDriver, setTrackingStorageDriver, type TrackingAnalysis } from './storage/trackingStorage';

describe('canonical completion replay', () => {
  it('reloads an already completed record without overwriting corrections or refetching raw history', async () => {
    const driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
    const record: TrackingAnalysis = {
      id: 'durable-session', projectId: 'durable-project', sportType: 'badminton', gameType: 'singles',
      status: 'completed', engineVersion: 'tracking-v2', detectorModel: 'YOLO', trackerModel: 'ByteTrack',
      sampleRateHz: 10, createdAt: new Date().toISOString(), players: [],
      quality: { detectionCoverage: 1, lostTimePercent: 0, confidence: 1, manualCorrections: 3 },
      summary: { durationSeconds: 5, sampleCount: 75, players: {} },
    };
    await driver.saveAnalysis(record);
    const state = createDefaultProjectTrackingState('durable-project');
    state.sessionId = record.id;
    trackingSessionStore.updateProjectState('durable-project', state);
    const results = vi.spyOn(aiTrackingService, 'getSessionResults');
    try {
      await trackingSessionStore.persistCompletedAnalysis('durable-project', state);
      await trackingSessionStore.persistCompletedAnalysis('durable-project', state);
      expect(await driver.getAnalysis(record.id)).toEqual(record);
      expect(state.analysis?.quality?.manualCorrections).toBe(3);
      expect(results).not.toHaveBeenCalled();
    } finally {
      results.mockRestore();
    }
  });
});
