import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toTrackingTelemetryV1, TrackingSessionApiClient } from '../../services/trackingSessionApi';
import {
  downsampleAndChunkTrackingSamples,
  getTrackingAnalysis,
  MemoryTrackingDriver,
  saveTrackingAnalysis,
  setTrackingStorageDriver,
  type TrackingAnalysis,
} from '../../services/storage/trackingStorage';
import type { TrackingTelemetryV1 } from '../../types';

const player = {
  playerId: 'P1', trackId: 47, state: 'observed' as const,
  bboxPct: { x: 10, y: 20, width: 5, height: 15 },
  pose: { keypoints: [{ x: 12, y: 21, score: 0.9 }] },
  courtPosition: { xM: 2, yM: 3, xPct: 33, yPct: 22 },
  speedMps: 1.2, absoluteZone: 'ML', playerRelativeZone: 'MR', totalDistanceM: 3,
};
const provenance = {
  calibrationId: 'cal-1', cameraSegmentId: 'segment-1', state: 'CALIBRATED' as const,
  source: 'manual' as const, createdAtFrame: 0, createdAtTimestampSec: 0,
  confidence: null, reprojectionErrorPx: null,
};

function frame(index: number, overrides: Record<string, unknown> = {}): TrackingTelemetryV1 {
  return toTrackingTelemetryV1({
    schemaVersion: 1, analysisId: 'a1', frameIndex: index, timestampSec: index,
    players: [player], cameraSegmentId: 'segment-1', calibrationId: 'cal-1',
    calibrationState: 'CALIBRATED', calibrationConfidence: null, calibration: provenance,
    ...overrides,
  });
}

describe('calibration contract', () => {
  const originalFetch = global.fetch;
  beforeEach(() => setTrackingStorageDriver(new MemoryTrackingDriver()));
  afterEach(() => { global.fetch = originalFetch; });

  it('loads legacy V1 frames without inventing calibration confidence or identity', () => {
    const legacy = toTrackingTelemetryV1({ timestamp: 1, frame_idx: 5, players: [player] });
    expect(legacy.schemaVersion).toBe(1);
    expect(legacy.cameraSegmentId).toBeUndefined();
    expect(legacy.calibrationConfidence).toBeUndefined();
    expect(legacy.players[0].courtPosition?.xM).toBe(2);
  });

  it('preserves calibrated identity and rejects uncalibrated metric values', () => {
    const calibrated = frame(0);
    expect(calibrated.calibration?.calibrationId).toBe('cal-1');
    expect(calibrated.calibrationConfidence).toBeNull();

    for (const state of ['UNCALIBRATED', 'CALIBRATION_LOST', 'RECALIBRATING']) {
      const unavailable = frame(1, { calibrationState: state, calibrationId: null });
      expect(unavailable.players[0].courtPosition).toBeNull();
      expect(unavailable.players[0].speedMps).toBeNull();
      expect(unavailable.players[0].absoluteZone).toBeNull();
      expect(unavailable.players[0].bboxPct).toEqual(player.bboxPct);
      expect(unavailable.players[0].pose).toEqual(player.pose);
      expect(unavailable.players[0].totalDistanceM).toBe(3);
    }
  });

  it('persists calibration provenance and pauses derived movement across a lost interval', async () => {
    const frames = [
      frame(0),
      frame(1, { calibrationState: 'CALIBRATION_LOST', calibrationId: null }),
      frame(2, { calibrationId: 'cal-2', calibration: { ...provenance, calibrationId: 'cal-2', createdAtFrame: 2 } }),
    ];
    const saved = downsampleAndChunkTrackingSamples('a1', frames, 10, 15);
    expect(saved.chunks.flatMap(chunk => chunk.samples).map(sample => sample.calibrationId)).toEqual(['cal-1', 'cal-2']);
    expect(saved.summary.players.P1.totalDistanceMeters).toBe(3);
    expect(saved.calibrationTimeline.map(event => event.state)).toEqual(['CALIBRATED', 'CALIBRATION_LOST', 'CALIBRATED']);

    const analysis: TrackingAnalysis = {
      id: 'a1', projectId: 'p1', sportType: 'badminton', gameType: 'singles', status: 'completed',
      engineVersion: '1', detectorModel: 'yolo', trackerModel: 'bytetrack', sampleRateHz: 1,
      createdAt: new Date().toISOString(), players: [], summary: saved.summary,
      calibrationTimeline: saved.calibrationTimeline,
    };
    await saveTrackingAnalysis(analysis, saved.chunks);
    expect((await getTrackingAnalysis('a1'))?.calibrationTimeline).toEqual(saved.calibrationTimeline);
  });

  it('carries API result identity through frontend conversion into stored samples', async () => {
    const client = new TrackingSessionApiClient();
    client.setBaseUrl('http://127.0.0.1:8000');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ sessionId: 'a1', status: 'COMPLETED', nextCursor: 1, telemetry: [{
        schemaVersion: 1, analysisId: 'a1', frameIndex: 0, timestampSec: 0,
        cameraSegmentId: 'segment-1', calibrationId: 'cal-1', calibrationState: 'CALIBRATED',
        calibration: provenance, players: [player],
      }] }),
    } as Response);
    const results = await client.getSessionResults('a1');
    expect(results.telemetry[0].calibration?.calibrationId).toBe('cal-1');
    const saved = downsampleAndChunkTrackingSamples('a1', results.telemetry);
    expect(saved.chunks[0].samples[0]).toMatchObject({
      cameraSegmentId: 'segment-1', calibrationId: 'cal-1',
    });
    expect(saved.calibrationTimeline[0].provenance).toEqual(provenance);
  });

  it('does not infer a zero confidence or map meters from an unknown state', () => {
    const unknown = frame(1, { calibrationState: 'UNRECOGNIZED', calibrationConfidence: 0 });
    expect(unknown.calibrationState).toBe('UNCALIBRATED');
    expect(unknown.calibrationConfidence).toBeNull();
    expect(unknown.players[0].courtPosition).toBeNull();
  });

  it('does not connect stored metric movement across a calibration gap', () => {
    const frames = [
      frame(0, { players: [{ ...player, totalDistanceM: undefined }] }),
      frame(1, { calibrationState: 'CALIBRATION_LOST', calibrationId: null }),
      frame(2, {
        calibrationId: 'cal-2', calibration: { ...provenance, calibrationId: 'cal-2' },
        players: [{ ...player, totalDistanceM: undefined, courtPosition: { xM: 5, yM: 9, xPct: 82, yPct: 67 } }],
      }),
    ];
    const saved = downsampleAndChunkTrackingSamples('a1', frames);
    expect(saved.summary.players.P1.totalDistanceMeters).toBe(0);
  });

  it('loads a saved legacy analysis with no calibration timeline', async () => {
    const saved = downsampleAndChunkTrackingSamples('legacy', [
      toTrackingTelemetryV1({ analysisId: 'legacy', timestamp: 0, frame_idx: 0, players: [player] }),
    ]);
    const analysis: TrackingAnalysis = {
      id: 'legacy', projectId: 'p1', sportType: 'badminton', gameType: 'singles', status: 'completed',
      engineVersion: '1', detectorModel: 'yolo', trackerModel: 'bytetrack', sampleRateHz: 1,
      createdAt: new Date().toISOString(), players: [], summary: saved.summary,
    };
    await saveTrackingAnalysis(analysis, saved.chunks);
    expect((await getTrackingAnalysis('legacy'))?.calibrationTimeline).toBeUndefined();
  });
});
