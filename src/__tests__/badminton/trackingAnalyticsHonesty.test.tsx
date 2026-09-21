import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import BadmintonMovementDashboard from '../../components/analytics/BadmintonMovementDashboard';
import FullCoachReport from '../../components/report/FullCoachReport';
import type { TrackingAnalysis, TrackingSample } from '../../services/storage/trackingStorage';

const reportState = vi.hoisted(() => ({
  activeProjectId: 'project-a' as string | null,
  analysis: null as TrackingAnalysis | null,
}));

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    events: [],
    teams: [],
    matchInfo: { sportType: 'badminton' },
    settings: { uiLanguage: 'en' },
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ activeProjectId: reportState.activeProjectId }),
}));

vi.mock('../../services/storage/trackingStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/storage/trackingStorage')>();
  return {
    ...actual,
    loadBadmintonTrackingAnalysis: vi.fn(async () => reportState.analysis),
  };
});

const analysis = (overrides: Partial<TrackingAnalysis> = {}): TrackingAnalysis => ({
  id: 'analysis-a',
  projectId: 'project-a',
  sportType: 'badminton',
  gameType: 'singles',
  status: 'completed',
  engineVersion: 'tracking-v1',
  detectorModel: 'yolo',
  trackerModel: 'bytetrack',
  sampleRateHz: 15,
  createdAt: '2026-01-01T00:00:00.000Z',
  players: [{ playerId: 'P1', side: 'near' }],
  quality: {
    detectionCoverage: 0.91,
    lostTimePercent: 9,
    confidence: 0.82,
    manualCorrections: 0,
  },
  summary: { durationSeconds: 10, sampleCount: 1, players: {} },
  ...overrides,
});

const measuredSample: TrackingSample = {
  timestamp: 1,
  playerId: 'P1',
  courtX: 3,
  courtY: 6,
  speed: 2,
  confidence: 0.82,
  trackingState: 'tracked',
};

describe('Phase 0.5 tracking analytics honesty', () => {
  beforeEach(() => {
    reportState.activeProjectId = 'project-a';
    reportState.analysis = null;
  });

  afterEach(cleanup);

  it('shows no realistic movement KPI when analysis is missing', () => {
    render(<BadmintonMovementDashboard />);

    expect(screen.getByTestId('tracking-analysis-unavailable')).toHaveTextContent('No tracking analysis available');
    expect(screen.queryByText('95.0%')).not.toBeInTheDocument();
    expect(screen.queryByText('88.0%')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Distance')).not.toBeInTheDocument();
  });

  it('marks missing quality as unavailable rather than fabricating KPIs', () => {
    render(
      <BadmintonMovementDashboard
        analysis={{ ...analysis(), quality: undefined as unknown as TrackingAnalysis['quality'] }}
        samples={[measuredSample]}
      />,
    );

    expect(screen.getByTestId('tracking-quality-unavailable')).toHaveTextContent('Quality unavailable');
    expect(screen.queryByText('95.0%')).not.toBeInTheDocument();
  });

  it('preserves real quality values and the measured sample rate', () => {
    render(<BadmintonMovementDashboard analysis={analysis()} samples={[measuredSample]} />);

    expect(screen.getByText('91.0%')).toBeInTheDocument();
    expect(screen.getByText('82.0%')).toBeInTheDocument();
    expect(screen.getByText('9.0%')).toBeInTheDocument();
    expect(screen.getByText('@ 15Hz')).toBeInTheDocument();
    expect(screen.getByTestId('tracking-provenance')).toHaveTextContent('Measured');
  });

  it('labels predicted-only samples as predicted, not measured', () => {
    render(
      <BadmintonMovementDashboard
        analysis={analysis()}
        samples={[{ ...measuredSample, trackingState: 'predicted' }]}
      />,
    );

    expect(screen.getByTestId('tracking-provenance')).toHaveTextContent('Predicted');
    expect(screen.getByTestId('tracking-movement-unavailable')).toHaveTextContent('No measured tracking samples');
    expect(screen.queryByText('Total Distance')).not.toBeInTheDocument();
  });

  it('does not fabricate tracking measurements in a report without analysis', async () => {
    render(<FullCoachReport />);

    await waitFor(() => {
      expect(screen.queryByText(/Player Movement Analysis/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tracking Quality & Audit/)).not.toBeInTheDocument();
    });
  });

  it('does not present an incomplete analysis as validated report measurements', async () => {
    reportState.analysis = analysis({ status: 'processing' });
    render(<FullCoachReport />);
    await act(async () => { await Promise.resolve(); });

    expect(screen.queryByText(/Player Movement Analysis/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tracking Quality & Audit/)).not.toBeInTheDocument();
    expect(screen.queryByText('Validated Tracking')).not.toBeInTheDocument();
  });

  it('clears prior tracking analysis when the active project has no analysis', async () => {
    reportState.analysis = analysis();
    const { rerender } = render(<FullCoachReport />);

    await screen.findByText(/Tracking Quality & Audit/);
    reportState.activeProjectId = 'project-b';
    reportState.analysis = null;
    rerender(<FullCoachReport />);

    await waitFor(() => {
      expect(screen.queryByText(/Tracking Quality & Audit/)).not.toBeInTheDocument();
    });
  });
});
