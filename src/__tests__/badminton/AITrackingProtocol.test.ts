import { describe, it, expect, beforeEach } from 'vitest';
import {
  aiTrackingService,
  toTrackingTelemetryV1,
} from '../../services/aiTrackingService';
import {
  AITelemetryFrame,
  TrackingTelemetryV1,
} from '../../types';

describe('Phase 5 — Versioned Tracking Protocol (TrackingTelemetryV1)', () => {
  beforeEach(() => {
    aiTrackingService.disconnect();
  });

  it('converts legacy AITelemetryFrame into canonical TrackingTelemetryV1 schema', () => {
    const legacyFrame: AITelemetryFrame = {
      timestamp: 15.5,
      frame_idx: 465,
      source: 'real_tracking',
      players: [
        {
          id: 1,
          trackId: 101, // Distinct ByteTrack MOT ID
          team: 1,
          name: 'Player 1',
          court_pos_pct: { x: 30.0, y: 20.0 },
          court_pos_m: { x: 1.83, y: 2.68 },
          zone: 'BL',
          speed_ms: 2.4,
          total_dist_m: 35.2,
          is_active: true,
          video_bbox_pct: { x: 25.0, y: 15.0, width: 8.0, height: 16.0 },
        },
        {
          id: 3,
          team: 2,
          name: 'Player 3',
          court_pos_pct: { x: 70.0, y: 80.0 },
          court_pos_m: { x: 4.27, y: 10.72 },
          zone: 'BR',
          speed_ms: 3.1,
          total_dist_m: 42.0,
          is_active: false,
        },
      ],
    };

    const v1: TrackingTelemetryV1 = toTrackingTelemetryV1(legacyFrame);

    expect(v1.schemaVersion).toBe(1);
    expect(v1.timestampSec).toBe(15.5);
    expect(v1.frameIndex).toBe(465);
    expect(v1.source).toBe('real_tracking');
    expect(v1.isSynthetic).toBe(false);
    expect(v1.players).toHaveLength(2);

    const p1 = v1.players[0];
    expect(p1.playerId).toBe('P1');
    expect(p1.trackId).toBe(101);
    expect(p1.teamCode).toBe('team1');
    expect(p1.courtPosition.xPct).toBe(30.0);
    expect(p1.courtPosition.yPct).toBe(20.0);
    expect(p1.courtPosition.xM).toBe(1.83);
    expect(p1.courtPosition.yM).toBe(2.68);
    expect(p1.absoluteZone).toBe('BL');
    expect(p1.speedMps).toBe(2.4);
    expect(p1.totalDistanceM).toBe(35.2);
    expect(p1.state).toBe('observed');
    expect(p1.bboxPct).toEqual({ x: 25.0, y: 15.0, width: 8.0, height: 16.0 });

    const p3 = v1.players[1];
    expect(p3.playerId).toBe('P3');
    expect(p3.trackId).toBeUndefined(); // Never substitute playerId as trackId
    expect(p3.state).toBe('lost');
  });

  it('marks simulated / browser frames explicitly as synthetic (Hard No List: No Fake AI masquerading as real)', () => {
    const demoFrame: AITelemetryFrame = {
      timestamp: 2.0,
      frame_idx: 60,
      source: 'synthetic_demo',
      isSynthetic: true,
      players: [],
    };

    const v1 = toTrackingTelemetryV1(demoFrame);
    expect(v1.schemaVersion).toBe(1);
    expect(v1.isSynthetic).toBe(true);
    expect(v1.source).toBe('synthetic_demo');
  });

  it('broadcasts to onTelemetryV1 subscribers with typed TrackingTelemetryV1', () => {
    const received: TrackingTelemetryV1[] = [];
    const unsub = aiTrackingService.onTelemetryV1((telemetry) => {
      received.push(telemetry);
    });

    // Emitting position triggers emitTelemetry
    aiTrackingService.setPlayerDirectPosition(1, 40, 30);

    expect(received.length).toBeGreaterThan(0);
    const last = received[received.length - 1];
    expect(last.schemaVersion).toBe(1);
    expect(last.players.length).toBeGreaterThan(0);
    expect(last.players[0].playerId).toBe('P1');

    unsub();
  });

  it('provides getLatestTelemetryV1 aligned with latest frame', () => {
    aiTrackingService.syncWithVideo(5.0, false);
    const v1 = aiTrackingService.getLatestTelemetryV1();

    expect(v1).not.toBeNull();
    expect(v1?.schemaVersion).toBe(1);
    expect(v1?.timestampSec).toBe(5.0);
    expect(v1?.players[0].courtPosition).toBeDefined();
  });
});
