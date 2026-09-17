import { describe, expect, it } from 'vitest';
import {
  ensureTrackingObjectStores,
  TRACKING_STORE_NAMES,
  MemoryTrackingDriver,
  saveTrackingAnalysis,
  getTrackingAnalysis,
  setTrackingStorageDriver,
  type TrackingAnalysis,
  type TrackingSampleChunk,
} from './trackingStorage';

describe('tracking IndexedDB schema', () => {
  it('creates every required object store during one upgrade', () => {
    const created: string[] = [];
    const existing = new Set<string>(['trackingAnalyses']);
    const db = {
      objectStoreNames: { contains: (name: string) => existing.has(name) },
      createObjectStore: (name: string) => {
        created.push(name);
        existing.add(name);
      },
    };

    ensureTrackingObjectStores(db);

    expect(created).toEqual(['trackingSampleChunks', 'trackingCandidates']);
    expect(TRACKING_STORE_NAMES.every((name) => existing.has(name))).toBe(true);
  });

  it('keeps a completed result retryable when chunk persistence fails', async () => {
    class FailingChunkDriver extends MemoryTrackingDriver {
      async saveChunks(): Promise<void> {
        throw new Error('chunk write failed');
      }
    }
    const driver = new FailingChunkDriver();
    setTrackingStorageDriver(driver);
    const analysis: TrackingAnalysis = {
      id: 'analysis-retry', projectId: 'p1', sportType: 'badminton', gameType: 'singles',
      status: 'completed', engineVersion: 'tracking-v2', detectorModel: 'YOLO', trackerModel: 'ByteTrack',
      sampleRateHz: 10, createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
      players: [], quality: { detectionCoverage: 1, lostTimePercent: 0, confidence: 1, manualCorrections: 0 },
      summary: { durationSeconds: 0, sampleCount: 0, players: {} },
    };
    const chunks: TrackingSampleChunk[] = [];

    await expect(saveTrackingAnalysis(analysis, chunks)).rejects.toThrow('chunk write failed');
    expect((await getTrackingAnalysis(analysis.id))?.status).toBe('processing');
  });
});
