import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TimelinePanel from '../../components/video/TimelinePanel';

const mockProjectState = vi.hoisted(() => ({
  annotations: [] as any[],
  aiSuggestions: [] as any[],
}));

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    events: [
      {
        id: 'ev-1',
        point: 1,
        videoTime: 10,
        sequenceStartTime: 8,
        sequenceEndTime: 15,
        duration: 7,
        resultText: '+1',
        actions: [{ skillCode: 'SMH', teamCode: 't1' }],
        createdAt: '2026-09-11T00:00:00.000Z',
      },
      {
        id: 'ev-2',
        point: 2,
        videoTime: 25,
        sequenceStartTime: 22,
        sequenceEndTime: 30,
        duration: 8,
        resultText: '-1',
        isBookmarked: true,
        actions: [{ skillCode: 'SRV', teamCode: 't2' }],
        createdAt: '2026-09-11T00:00:00.000Z',
      },
    ],
    teams: [
      { id: 't1', code: 'T1', name: 'Team Alpha' },
      { id: 't2', code: 'T2', name: 'Team Beta' },
    ],
    settings: { uiLanguage: 'en' },
    updateEventRow: vi.fn(),
    showToast: vi.fn(),
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: 'proj-1',
    projects: [
      {
        id: 'proj-1',
        videoMeta: {
          annotations: mockProjectState.annotations,
          aiSuggestions: mockProjectState.aiSuggestions,
        },
      },
    ],
  }),
}));

describe('TimelinePanel 2.0', () => {
  it('renders standard lanes without AI suggestions by default', () => {
    mockProjectState.aiSuggestions = [];
    render(
      <TimelinePanel
        currentTime={10}
        duration={100}
        onSeek={vi.fn()}
      />
    );

    expect(screen.getByText('VIDEO')).toBeInTheDocument();
    expect(screen.getByText('RALLY / SEQ')).toBeInTheDocument();
    expect(screen.getByText('EVENTS')).toBeInTheDocument();
    expect(screen.getByText('KEY MOMENTS')).toBeInTheDocument();
    expect(screen.queryByText('AI SUGGESTIONS')).not.toBeInTheDocument();
  });

  it('renders AI suggestions lane when AI suggestions are present', () => {
    mockProjectState.aiSuggestions = [
      { id: 'sug-1', time: 14, label: 'Smash Winner', confidence: 0.94 },
    ];

    render(
      <TimelinePanel
        currentTime={10}
        duration={100}
        onSeek={vi.fn()}
      />
    );

    expect(screen.getByText('AI SUGGESTIONS')).toBeInTheDocument();
    expect(screen.getByText('Smash Winner')).toBeInTheDocument();
  });

  it('handles zoom in, zoom out, and fit controls', () => {
    mockProjectState.aiSuggestions = [];
    render(
      <TimelinePanel
        currentTime={10}
        duration={100}
        onSeek={vi.fn()}
      />
    );

    expect(screen.getByText('1x')).toBeInTheDocument();

    const zoomInBtn = screen.getByTitle('Zoom in');
    fireEvent.click(zoomInBtn);
    expect(screen.getByText('1.5x')).toBeInTheDocument();

    fireEvent.click(zoomInBtn);
    expect(screen.getByText('2x')).toBeInTheDocument();

    const zoomOutBtn = screen.getByTitle('Zoom out');
    fireEvent.click(zoomOutBtn);
    expect(screen.getByText('1.5x')).toBeInTheDocument();

    const fitBtn = screen.getByTitle('Fit to entire video (1x)');
    fireEvent.click(fitBtn);
    expect(screen.getByText('1x')).toBeInTheDocument();
  });

  it('renders sequence range blocks with point and duration', () => {
    render(
      <TimelinePanel
        currentTime={10}
        duration={100}
        onSeek={vi.fn()}
      />
    );

    expect(screen.getByText('7.0s')).toBeInTheDocument();
    expect(screen.getByText('8.0s')).toBeInTheDocument();
  });
});
