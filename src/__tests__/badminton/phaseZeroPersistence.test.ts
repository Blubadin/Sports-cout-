import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TrackingSessionStatus, TrackingTelemetryV1 } from '../../types';
import {
  getTrackingStorageDriver,
  MemoryTrackingDriver,
  setTrackingStorageDriver,
} from '../../services/storage/trackingStorage';
import {
  createDefaultProjectTrackingState,
  trackingSessionStore,
} from '../../services/trackingSessionStore';

const originalDriver = getTrackingStorageDriver();

function observedFrame(frameIndex: number, timestampSec: number): TrackingTelemetryV1 {
  return {
    schemaVersion: 1,
    analysisId: 'phase-zero-final',
    frameIndex,
    timestampSec,
    source: 'real_tracking',
    isSynthetic: false,
    players: [{
      playerId: 'P1',
      trackId: 101,
      state: 'observed',
      detectionConfidence: 0.9,
      courtPosition: { xM: 2 + timestampSec, yM: 3, xPct: 30, yPct: 20 },
      totalDistanceM: timestampSec,
    }],
  };
}

describe('Phase 0 final persistence contracts', () => {
  let driver: MemoryTrackingDriver;

  beforeEach(() => {
    driver = new MemoryTrackingDriver();
    setTrackingStorageDriver(driver);
  });

  afterEach(() => {
    setTrackingStorageDriver(originalDriver);
  });

  it('persists measured cadence and keeps never-observed expected players in quality', async () => {
    const state = createDefaultProjectTrackingState('phase-zero-project');
    state.sessionId = 'phase-zero-final';
    state.status = 'COMPLETED';
    state.trackedPlayerCount = 2;
    state.telemetry = [
      observedFrame(0, 0),
      observedFrame(1, 0.25),
      observedFrame(2, 0.5),
      observedFrame(3, 0.75),
      observedFrame(4, 1),
    ];
    state.sessionStatus = {
      sourceFps: 30,
      frameStride: 3,
      players: [],
      videoMetadata: { nominalFps: 30 },
    } as unknown as TrackingSessionStatus;

    await trackingSessionStore.persistCompletedAnalysis(state.projectId, state);

    const saved = await driver.getAnalysis('phase-zero-final');
    expect(saved?.persistedTargetHz).toBe(10);
    expect(saved?.nominalAnalysisHz).toBe(10);
    expect(saved?.effectiveStoredHz).toBe(5);
    expect(saved?.sampleRateHz).toBe(5);
    expect(saved?.quality?.playerCoverage?.P1.detectionCoverage).toBe(1);
    expect(saved?.quality?.playerCoverage?.P2.detectionCoverage).toBe(0);
    expect(saved?.quality?.meanTargetCoverage).toBe(0.5);
    expect(saved?.quality?.simultaneousTargetCoverage).toBe(0);
    expect(saved?.summary.players.P2).toBeUndefined();
  });

  it('does not persist an analysis when no real telemetry exists', async () => {
    const state = createDefaultProjectTrackingState('empty-project');
    state.sessionId = 'empty-session';
    state.status = 'COMPLETED';

    await trackingSessionStore.persistCompletedAnalysis(state.projectId, state);

    expect(await driver.getAnalysis('empty-session')).toBeNull();
    expect(state.analysis).toBeNull();
    expect(state.chunks).toEqual([]);
  });

  it('never persists synthetic demo telemetry as analysis', async () => {
    const state = createDefaultProjectTrackingState('synthetic-project');
    state.sessionId = 'synthetic-session';
    state.status = 'COMPLETED';
    state.telemetry = [{
      ...observedFrame(0, 0),
      analysisId: 'synthetic-session',
      source: 'synthetic_demo',
      isSynthetic: true,
    }];

    await trackingSessionStore.persistCompletedAnalysis(state.projectId, state);

    expect(await driver.getAnalysis('synthetic-session')).toBeNull();
    expect(state.analysis).toBeNull();
    expect(state.chunks).toEqual([]);
  });
});
