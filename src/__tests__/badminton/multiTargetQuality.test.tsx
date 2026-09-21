import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { TrackingTelemetryV1 } from '../../types';
import {
  computeTrackingQuality,
  downsampleAndChunkTrackingSamples,
  type TrackingAnalysis,
  type TrackingSample,
} from '../../services/storage/trackingStorage';
import BadmintonMovementDashboard from '../../components/analytics/BadmintonMovementDashboard';

describe('Multi-Target Tracking Quality Metrics (Phase 0.2)', () => {
  // Helper to create synthetic frame
  function makeFrame(
    frameIndex: number,
    players: {
      playerId: string;
      state: 'observed' | 'predicted' | 'lost';
      confidence?: number;
    }[]
  ): TrackingTelemetryV1 {
    return {
      schemaVersion: 1,
      analysisId: 'quality_test_session',
      timestampSec: Number((frameIndex * 0.1).toFixed(2)),
      frameIndex,
      source: 'real_tracking',
      isSynthetic: false,
      players: players.map((p) => ({
        playerId: p.playerId,
        trackId: 1,
        teamCode: 'team1',
        courtPosition: { xM: 2.5, yM: 3.0, xPct: 41.0, yPct: 22.4 },
        playerRelativeZone: 'mid',
        speedMps: 1.0,
        detectionConfidence: p.confidence ?? (p.state === 'observed' ? 0.9 : 0),
        state: p.state,
      })),
    };
  }

  // CASE A: P1 observed, P2 observed => fully observed
  it('CASE A — marks frame as fully observed when ALL expected targets are observed', () => {
    const frames: TrackingTelemetryV1[] = [
      makeFrame(0, [
        { playerId: 'P1', state: 'observed', confidence: 0.95 },
        { playerId: 'P2', state: 'observed', confidence: 0.85 },
      ]),
    ];

    const quality = computeTrackingQuality(frames);

    expect(quality.fullyObservedFrameCount).toBe(1);
    expect(quality.partiallyObservedFrameCount).toBe(0);
    expect(quality.fullyLostFrameCount).toBe(0);
    expect(quality.simultaneousTargetCoverage).toBe(1.0);
    expect(quality.meanTargetCoverage).toBe(1.0);
    expect(quality.playerCoverage?.P1.detectionCoverage).toBe(1.0);
    expect(quality.playerCoverage?.P2.detectionCoverage).toBe(1.0);
    expect(quality.playerCoverage?.P1.observedFrameCount).toBe(1);
    expect(quality.playerCoverage?.P2.observedFrameCount).toBe(1);
    expect(quality.confidence).toBe(0.9);
  });

  // CASE B: P1 observed, P2 lost => not fully observed, partially observed
  it('CASE B — marks frame as partially observed (not fully observed) when P1 observed and P2 lost', () => {
    const frames: TrackingTelemetryV1[] = [
      makeFrame(0, [
        { playerId: 'P1', state: 'observed', confidence: 0.9 },
        { playerId: 'P2', state: 'lost', confidence: 0 },
      ]),
    ];

    const quality = computeTrackingQuality(frames);

    expect(quality.fullyObservedFrameCount).toBe(0);
    expect(quality.partiallyObservedFrameCount).toBe(1);
    expect(quality.fullyLostFrameCount).toBe(0);
    expect(quality.simultaneousTargetCoverage).toBe(0.0);
    expect(quality.playerCoverage?.P1.detectionCoverage).toBe(1.0);
    expect(quality.playerCoverage?.P2.detectionCoverage).toBe(0.0);
    expect(quality.playerCoverage?.P2.lostPercent).toBe(100.0);
    expect(quality.meanTargetCoverage).toBe(0.5);
  });

  // CASE C: P1 observed, P2 predicted => not fully observed
  it('CASE C — does not treat predicted as observed: P1 observed, P2 predicted is NOT fully observed', () => {
    const frames: TrackingTelemetryV1[] = [
      makeFrame(0, [
        { playerId: 'P1', state: 'observed', confidence: 0.92 },
        { playerId: 'P2', state: 'predicted', confidence: 0.5 },
      ]),
    ];

    const quality = computeTrackingQuality(frames);

    expect(quality.fullyObservedFrameCount).toBe(0);
    expect(quality.partiallyObservedFrameCount).toBe(1);
    expect(quality.simultaneousTargetCoverage).toBe(0.0);
    expect(quality.playerCoverage?.P1.detectionCoverage).toBe(1.0);
    expect(quality.playerCoverage?.P2.detectionCoverage).toBe(0.0);
    expect(quality.playerCoverage?.P2.predictedPercent).toBe(100.0);
    expect(quality.playerCoverage?.P2.predictedFrameCount).toBe(1);
    // Confidence must be based on real observed data only
    expect(quality.playerCoverage?.P1.meanObservedConfidence).toBe(0.92);
    expect(quality.playerCoverage?.P2.meanObservedConfidence).toBeNull();
    expect(quality.confidence).toBe(0.92);
  });

  // CASE D: P1 coverage 100%, P2 coverage 50% => mean = 75%, UI must not claim 100%
  it('CASE D — computes meanTargetCoverage = 75% and ensures UI does not claim 100%', () => {
    const frames: TrackingTelemetryV1[] = [
      makeFrame(0, [
        { playerId: 'P1', state: 'observed', confidence: 0.9 },
        { playerId: 'P2', state: 'observed', confidence: 0.8 },
      ]),
      makeFrame(1, [
        { playerId: 'P1', state: 'observed', confidence: 0.9 },
        { playerId: 'P2', state: 'lost', confidence: 0 },
      ]),
    ];

    const quality = computeTrackingQuality(frames);

    expect(quality.playerCoverage?.P1.detectionCoverage).toBe(1.0); // 100%
    expect(quality.playerCoverage?.P2.detectionCoverage).toBe(0.5); // 50%
    expect(quality.meanTargetCoverage).toBe(0.75); // 75%
    expect(quality.simultaneousTargetCoverage).toBe(0.5); // 50%
    expect(quality.detectionCoverage).toBe(0.75);

    // Verify UI rendering: Session UI must not claim 100%
    const analysis: TrackingAnalysis = {
      id: 'test_d',
      projectId: 'proj_1',
      sportType: 'badminton',
      gameType: 'doubles',
      status: 'completed',
      engineVersion: 'tracking-v1',
      detectorModel: 'yolo',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      createdAt: new Date().toISOString(),
      players: [
        { playerId: 'P1', side: 'near' },
        { playerId: 'P2', side: 'far' },
      ],
      quality,
      summary: {
        durationSeconds: 0.2,
        sampleCount: 2,
        players: {},
      },
    };

    const samples: TrackingSample[] = [
      { timestamp: 0.0, playerId: 'P1', courtX: 2, courtY: 2, speed: 0, confidence: 0.9, trackingState: 'tracked' },
      { timestamp: 0.0, playerId: 'P2', courtX: 4, courtY: 10, speed: 0, confidence: 0.8, trackingState: 'tracked' },
    ];

    render(<BadmintonMovementDashboard analysis={analysis} samples={samples} />);

    // Must display Mean Target Coverage of 75.0%
    expect(screen.getByText('Mean Target Coverage')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.queryByText('100.0%')).not.toBeInTheDocument();

    // Must display All Targets Visible of 50.0%
    expect(screen.getByText('All Targets Visible')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  // CASE E: single-player session => sensible compatible metrics
  it('CASE E — yields sensible compatible metrics for single-player session', () => {
    const frames: TrackingTelemetryV1[] = Array.from({ length: 10 }, (_, i) =>
      makeFrame(i, [{ playerId: 'P1', state: i < 8 ? 'observed' : 'lost', confidence: 0.85 }])
    );

    const quality = computeTrackingQuality(frames);

    expect(quality.playerCoverage?.P1.detectionCoverage).toBe(0.8);
    expect(quality.meanTargetCoverage).toBe(0.8);
    expect(quality.simultaneousTargetCoverage).toBe(0.8);
    expect(quality.detectionCoverage).toBe(0.8);
    expect(quality.fullyObservedFrameCount).toBe(8);
    expect(quality.partiallyObservedFrameCount).toBe(0);
    expect(quality.fullyLostFrameCount).toBe(2);
    expect(quality.playerCoverage?.P1.lostPercent).toBe(20.0);
  });

  // CASE F: no eligible frames => all rate/quality metrics are unknown, not measured zero
  it('CASE F — keeps zero-frame quality unavailable instead of fabricating loss or confidence', () => {
    const quality = computeTrackingQuality([]);

    expect(quality.meanTargetCoverage).toBeNull();
    expect(quality.simultaneousTargetCoverage).toBeNull();
    expect(quality.fullyObservedFrameCount).toBe(0);
    expect(quality.partiallyObservedFrameCount).toBe(0);
    expect(quality.fullyLostFrameCount).toBe(0);
    expect(quality.predictedPercent).toBeNull();
    expect(quality.lostPercent).toBeNull();
    expect(quality.confidence).toBeNull();
    expect(quality.detectionCoverage).toBeNull();
    expect(quality.lostTimePercent).toBeNull();

    // Also via downsampleAndChunkTrackingSamples
    const res = downsampleAndChunkTrackingSamples('empty_session', [], 10, 15, {
      P1: { totalDistanceM: 0 },
      P2: { totalDistanceM: 0 },
    });
    expect(res.quality.meanTargetCoverage).toBeNull();
    expect(res.quality.simultaneousTargetCoverage).toBeNull();
    expect(res.summary.players).toEqual({});
  });

  it('uses the configured target roster when an expected player never appears', () => {
    const quality = computeTrackingQuality(
      [makeFrame(0, [{ playerId: 'P1', state: 'observed', confidence: 0.9 }])],
      ['P1', 'P2'],
    );

    expect(quality.playerCoverage?.P1.detectionCoverage).toBe(1);
    expect(quality.playerCoverage?.P2.detectionCoverage).toBe(0);
    expect(quality.playerCoverage?.P2.lostPercent).toBe(100);
    expect(quality.meanTargetCoverage).toBe(0.5);
    expect(quality.simultaneousTargetCoverage).toBe(0);
  });

  // FUTURE FIELDS: idSwitchCount and manualCorrectionCount are null when unmeasured
  it('returns null (not fake 0) for unmeasured future audit fields', () => {
    const frames: TrackingTelemetryV1[] = [
      makeFrame(0, [{ playerId: 'P1', state: 'observed', confidence: 0.9 }]),
    ];

    const quality = computeTrackingQuality(frames);

    expect(quality.idSwitchCount).toBeNull();
    expect(quality.manualCorrectionCount).toBeNull();
    expect(quality.manualCorrections).toBeNull();
    expect(quality.playerCoverage?.P1.idSwitchCount).toBeNull();
    expect(quality.playerCoverage?.P1.manualCorrectionCount).toBeNull();
  });

  // PER-PLAYER INSPECTION PILLS IN UI
  it('renders per-player quality inspection pills and allows selecting players', () => {
    const quality = computeTrackingQuality([
      makeFrame(0, [
        { playerId: 'P1', state: 'observed', confidence: 0.9 },
        { playerId: 'P2', state: 'observed', confidence: 0.8 },
      ]),
      makeFrame(1, [
        { playerId: 'P1', state: 'observed', confidence: 0.9 },
        { playerId: 'P2', state: 'lost', confidence: 0 },
      ]),
    ]);

    const analysis: TrackingAnalysis = {
      id: 'test_inspect',
      projectId: 'proj_1',
      sportType: 'badminton',
      gameType: 'doubles',
      status: 'completed',
      engineVersion: 'tracking-v1',
      detectorModel: 'yolo',
      trackerModel: 'bytetrack',
      sampleRateHz: 10,
      createdAt: new Date().toISOString(),
      players: [
        { playerId: 'P1', side: 'near' },
        { playerId: 'P2', side: 'far' },
      ],
      quality,
      summary: {
        durationSeconds: 0.2,
        sampleCount: 2,
        players: {},
      },
    };

    const samples: TrackingSample[] = [
      { timestamp: 0.0, playerId: 'P1', courtX: 2, courtY: 2, speed: 0, confidence: 0.9, trackingState: 'tracked' },
      { timestamp: 0.0, playerId: 'P2', courtX: 4, courtY: 10, speed: 0, confidence: 0.8, trackingState: 'tracked' },
    ];

    render(<BadmintonMovementDashboard analysis={analysis} samples={samples} />);

    expect(screen.getByTestId('player-quality-pill-P1')).toBeInTheDocument();
    expect(screen.getByTestId('player-quality-pill-P2')).toBeInTheDocument();
    expect(screen.getByText('100.0% obs')).toBeInTheDocument();
    expect(screen.getByText('50.0% obs')).toBeInTheDocument();
  });
});
