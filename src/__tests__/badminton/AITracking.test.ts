import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiTrackingService } from '../../services/aiTrackingService';
import { AITelemetryFrame } from '../../types';

describe('AI Tracking Service & Telemetry Flow', () => {
  beforeEach(() => {
    aiTrackingService.disconnect();
  });

  it('initializes with disconnected status', () => {
    expect(aiTrackingService.getStatus()).toBe('disconnected');
    expect(aiTrackingService.getLatestFrame()).toBeNull();
  });

  it('notifies status listeners on status change', () => {
    const statuses: string[] = [];
    const unsub = aiTrackingService.onStatus((s) => statuses.push(s));

    expect(statuses).toContain('disconnected');
    unsub();
  });

  it('notifies telemetry listeners when telemetry frame arrives', () => {
    const receivedFrames: AITelemetryFrame[] = [];
    const unsub = aiTrackingService.onTelemetry((frame) => {
      receivedFrames.push(frame);
    });

    const mockFrame: AITelemetryFrame = {
      timestamp: 12.34,
      frame_idx: 370,
      players: [
        {
          id: 1,
          team: 1,
          name: 'Player 1',
          court_pos_pct: { x: 35.0, y: 22.0 },
          zone: 'BL',
          speed_ms: 2.5,
          total_dist_m: 45.0,
        },
        {
          id: 2,
          team: 1,
          name: 'Player 2',
          court_pos_pct: { x: 70.0, y: 30.0 },
          zone: 'BR',
          speed_ms: 1.8,
          total_dist_m: 38.0,
        },
        {
          id: 3,
          team: 2,
          name: 'Player 3',
          court_pos_pct: { x: 30.0, y: 70.0 },
          zone: 'FL',
          speed_ms: 3.2,
          total_dist_m: 52.0,
        },
        {
          id: 4,
          team: 2,
          name: 'Player 4',
          court_pos_pct: { x: 65.0, y: 85.0 },
          zone: 'BR',
          speed_ms: 2.1,
          total_dist_m: 40.0,
        },
      ],
    };

    // Simulate WebSocket message reception
    // @ts-ignore - access private handler for testing
    if (aiTrackingService['telemetryListeners']) {
      // @ts-ignore
      aiTrackingService['latestFrame'] = mockFrame;
      // @ts-ignore
      aiTrackingService['telemetryListeners'].forEach((cb: any) => cb(mockFrame));
    }

    expect(receivedFrames.length).toBe(1);
    expect(receivedFrames[0].players.length).toBe(4);
    expect(receivedFrames[0].players[0].name).toBe('Player 1');
    expect(receivedFrames[0].players[2].zone).toBe('FL');

    unsub();
  });

  it('runs directly in browser without server when mode is browser', () => {
    vi.useFakeTimers();
    aiTrackingService.setMode('browser');
    expect(aiTrackingService.getMode()).toBe('browser');

    let latestFrame: AITelemetryFrame | null = null;
    const unsub = aiTrackingService.onTelemetry((f) => {
      latestFrame = f;
    });

    aiTrackingService.connect();
    expect(aiTrackingService.getStatus()).toBe('connected');

    vi.advanceTimersByTime(100);
    expect(latestFrame).not.toBeNull();
    expect(latestFrame!.players.length).toBe(4);
    expect(latestFrame!.source).toBe('in_browser_engine');

    // Test player swap
    aiTrackingService.swapPlayers(1, 2);
    vi.advanceTimersByTime(60);
    expect(latestFrame!.players.length).toBe(4);

    aiTrackingService.disconnect();
    expect(aiTrackingService.getStatus()).toBe('disconnected');
    unsub();
    vi.useRealTimers();
  });

  it('supports interactive click-to-mark player anchoring in singles', () => {
    aiTrackingService.setGameType('singles');
    aiTrackingService.resetAnchors();
    expect(aiTrackingService.getMarkingState().isMarking).toBe(false);

    let lastState: any = null;
    const unsub = aiTrackingService.onMarking((state) => {
      lastState = state;
    });

    aiTrackingService.startMarkingMode();
    expect(lastState.isMarking).toBe(true);
    expect(lastState.step).toBe(0);
    expect(lastState.totalSteps).toBe(2);
    expect(lastState.targetPlayerId).toBe(1);
    expect(lastState.targetPlayerName).toContain('แดนบน');

    // Step 0: Mark Player 1 (Top Court Naraoka at screen 48%, 32%)
    aiTrackingService.markPlayerAtScreen(48, 32);
    expect(lastState.isMarking).toBe(true);
    expect(lastState.step).toBe(1);
    expect(lastState.targetPlayerId).toBe(2);
    expect(lastState.targetPlayerName).toContain('แดนล่าง');

    // Step 1: Mark Player 2 (Bottom Court opponent at screen 52%, 78%)
    aiTrackingService.markPlayerAtScreen(52, 78);
    // After step 1 in singles (2 steps total), marking completes and auto-starts tracking!
    expect(lastState.isMarking).toBe(false);
    expect(aiTrackingService.getStatus()).toBe('connected');

    const frame = aiTrackingService.getLatestFrame();
    expect(frame).not.toBeNull();
    const p1 = frame!.players.find((p) => p.id === 1);
    const p2 = frame!.players.find((p) => p.id === 2);
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    // Verify player 1 bbox is centered around screenX=48, screenY=32
    expect(p1!.video_bbox_pct).toBeDefined();
    const p1CenterX = p1!.video_bbox_pct!.x + p1!.video_bbox_pct!.width / 2;
    expect(Math.abs(p1CenterX - 48)).toBeLessThan(2);

    // Test Reset Anchors clears custom positions
    aiTrackingService.resetAnchors();
    expect(aiTrackingService.getPlayerCustomPosition(1)).toBeNull();

    aiTrackingService.disconnect();
    unsub();
  });
});
