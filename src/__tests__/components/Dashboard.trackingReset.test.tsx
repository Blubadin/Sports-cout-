import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackingAnalysis, TrackingSampleChunk } from '../../services/storage/trackingStorage';
import { mockTeams } from '../fixtures';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const mocks = vi.hoisted(() => ({
  activeProjectId: 'proj-1' as string | null,
  getLatestTrackingAnalysisForProject: vi.fn(),
  getTrackingSampleChunkPage: vi.fn(),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: mocks.activeProjectId,
  }),
}));

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    events: [],
    matchInfo: { sportType: 'volleyball', setOrGame: '1', currentPoint: 0 },
    changeSportType: vi.fn(),
    teams: mockTeams,
    setSeekRequest: vi.fn(),
    setPreviewState: vi.fn(),
    settings: { uiLanguage: 'en', enableKeyMoments: true },
    sportTemplate: {
      id: 'volleyball',
      name: 'Volleyball',
      thaiName: 'วอลเลย์บอล',
      teamsEnabled: true,
      playersEnabled: false,
      skills: [],
      areas: [],
      results: [],
      fouls: [],
      descriptors: {},
    },
  }),
}));

vi.mock('../../services/storage/trackingStorage', () => ({
  getLatestTrackingAnalysisForProject: (...args: unknown[]) => mocks.getLatestTrackingAnalysisForProject(...args),
  getTrackingSampleChunkPage: (...args: unknown[]) => mocks.getTrackingSampleChunkPage(...args),
}));

vi.mock('../../components/charts/RadarChart', () => ({ default: () => null }));
vi.mock('../../components/charts/FieldSequenceMap', () => ({ default: () => null }));
vi.mock('../../components/charts/TeamComparisonChart', () => ({ default: () => null }));
vi.mock('../../components/charts/SkillFrequencyChart', () => ({ default: () => null }));
vi.mock('../../components/charts/ResultDistributionChart', () => ({ default: () => null }));
vi.mock('../../components/charts/SportSpecificKPIs', () => ({ default: () => null }));
vi.mock('../../components/VolleyballPyramidPanel', () => ({ default: () => null }));
vi.mock('../../components/report/FullCoachReport', () => ({ default: () => null }));
vi.mock('../../components/analytics/BadmintonMovementDashboard', () => ({
  default: ({ analysis }: { analysis: TrackingAnalysis }) => (
    <div data-testid="movement-dashboard">{analysis.id}</div>
  ),
}));

import Dashboard from '../../components/Dashboard';

const makeAnalysis = (id: string, projectId: string): TrackingAnalysis => ({
  id,
  projectId,
  sportType: 'badminton',
  gameType: 'singles',
  status: 'completed',
  engineVersion: 'v2',
  detectorModel: 'yolo',
  trackerModel: 'bytetrack',
  sampleRateHz: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  players: [],
  quality: {
    detectionCoverage: 0.95,
    lostTimePercent: 0,
    confidence: 0.9,
    manualCorrections: 0,
  },
  summary: {
    durationSeconds: 10,
    sampleCount: 1,
    players: {},
  },
});

describe('Dashboard tracking analysis project switch reset and race guard', () => {
  beforeEach(() => {
    mocks.activeProjectId = 'proj-1';
    mocks.getLatestTrackingAnalysisForProject.mockReset();
    mocks.getTrackingSampleChunkPage.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('ignores stale async analysis resolution and resets state when switching or clearing activeProjectId', async () => {
    const p1Req = deferred<TrackingAnalysis | null>();
    const p2Req = deferred<TrackingAnalysis | null>();

    mocks.getLatestTrackingAnalysisForProject.mockImplementation((projectId: string) => {
      if (projectId === 'proj-1') return p1Req.promise;
      if (projectId === 'proj-2') return p2Req.promise;
      return Promise.resolve(null);
    });
    mocks.getTrackingSampleChunkPage.mockResolvedValue({
      chunks: [] as TrackingSampleChunk[],
      hasMore: false,
    });

    const { rerender } = render(<Dashboard />);

    // Switch to proj-2 (which has no tracking analysis) BEFORE proj-1 settles
    mocks.activeProjectId = 'proj-2';
    rerender(<Dashboard />);

    await act(async () => {
      p2Req.resolve(null);
      await p2Req.promise;
    });

    // Late resolution of proj-1 must be ignored because the effect was cleaned up
    await act(async () => {
      p1Req.resolve(makeAnalysis('analysis-stale-p1', 'proj-1'));
      await p1Req.promise;
    });

    expect(screen.queryByRole('button', { name: /Movement Tracking/i })).not.toBeInTheDocument();

    // Now load valid analysis for proj-2, then clear activeProjectId -> must reset immediately
    mocks.getLatestTrackingAnalysisForProject.mockResolvedValueOnce(makeAnalysis('analysis-p2', 'proj-2'));
    mocks.activeProjectId = 'proj-2-reloaded';
    rerender(<Dashboard />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /Movement Tracking/i })).toBeInTheDocument();

    mocks.activeProjectId = null;
    rerender(<Dashboard />);
    expect(screen.queryByRole('button', { name: /Movement Tracking/i })).not.toBeInTheDocument();
  });
});
