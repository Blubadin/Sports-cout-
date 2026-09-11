import { describe, it, expect } from 'vitest';
import { buildBadmintonTrainingDataset } from '../../utils/badmintonDatasetExport';
import type { EventRow } from '../../types';
import type { TrackingSample } from '../../services/storage/trackingStorage';

describe('Phase 11 — AI Suggestion & ML Dataset Export', () => {
  it('builds paired training dataset with temporal windows around manual scouting events', () => {
    const mockEvents: EventRow[] = [
      {
        id: 'ev-1',
        no: 1,
        point: 1,
        videoTime: 12.5,
        sportType: 'badminton',
        eventText: 'Smash',
        createdAt: '2026-09-11T00:00:00Z',
        actions: [
          {
            id: 'act-1',
            teamCode: 'team1',
            skillCode: 'SMH',
            resultCode: 'Yes',
            playerName: 'P1',
            gridX: 2,
            gridY: 3,
            videoTime: 12.5,
          },
        ],
        resultText: '+1',
      },
      {
        id: 'ev-2',
        no: 2,
        point: 2,
        videoTime: 25.0,
        sportType: 'badminton',
        eventText: 'Net',
        createdAt: '2026-09-11T00:00:00Z',
        actions: [
          {
            id: 'act-2',
            teamCode: 'team2',
            skillCode: 'NET',
            resultCode: 'Pass',
            playerName: 'P2',
            gridX: 1,
            gridY: 1,
            videoTime: 25.0,
          },
        ],
        resultText: '0',
      },
    ];

    const mockSamples: TrackingSample[] = [
      {
        timestamp: 12.2, // Within 12.5 - 0.5s window
        playerId: 'P1',
        courtX: 2.5,
        courtY: 3.2,
        speed: 2.1,
        confidence: 0.9,
        trackingState: 'tracked',
      },
      {
        timestamp: 12.6, // Within 12.5 + 0.5s window
        playerId: 'P1',
        courtX: 2.8,
        courtY: 3.5,
        speed: 3.4,
        confidence: 0.95,
        trackingState: 'tracked',
      },
      {
        timestamp: 18.0, // Outside both windows
        playerId: 'P1',
        courtX: 3.0,
        courtY: 4.0,
        speed: 1.0,
        confidence: 0.8,
        trackingState: 'tracked',
      },
      {
        timestamp: 25.1, // Within 25.0 window
        playerId: 'P2',
        courtX: 3.1,
        courtY: 9.8,
        speed: 1.2,
        confidence: 0.88,
        trackingState: 'tracked',
      },
    ];

    const dataset = buildBadmintonTrainingDataset(mockEvents, mockSamples, 0.5, 0.5);

    expect(dataset.datasetVersion).toBe('1.0');
    expect(dataset.sport).toBe('badminton');
    expect(dataset.totalInstances).toBe(2);
    expect(dataset.skillDistribution['SMH']).toBe(1);
    expect(dataset.skillDistribution['NET']).toBe(1);

    const inst1 = dataset.instances[0];
    expect(inst1.manualSkillLabel).toBe('SMH');
    expect(inst1.timeWindow.startSec).toBe(12.0);
    expect(inst1.timeWindow.endSec).toBe(13.0);
    expect(inst1.trackingSequence).toHaveLength(2); // Samples at 12.2 and 12.6

    const inst2 = dataset.instances[1];
    expect(inst2.manualSkillLabel).toBe('NET');
    expect(inst2.trackingSequence).toHaveLength(1); // Sample at 25.1
  });

  it('rejects events outside badminton sport type', () => {
    const mockVolleyballEvent: EventRow = {
      id: 'vb-1',
      no: 1,
      point: 1,
      videoTime: 10.0,
      sportType: 'volleyball',
      eventText: 'Attack',
      resultText: '+1',
      createdAt: '2026-09-11T00:00:00Z',
      actions: [{ id: 'a1', skillCode: 'ATT', teamCode: 't1' }],
    };

    const dataset = buildBadmintonTrainingDataset([mockVolleyballEvent], []);
    expect(dataset.totalInstances).toBe(0);
  });
});
