import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorkstationCommandBar,
  WorkstationLeftRail,
  WorkstationStatusBar,
  WorkstationTopBar,
} from '../../components/workstation/WorkstationChrome';
import { SPORTSCOUT_APP_VERSION } from '../../appMetadata';

vi.mock('../../components/WorkspaceMenu', () => ({ default: () => null }));

const defaultTeams = [
  { id: 't1', code: 'THA', name: 'Thailand', thaiName: 'ไทย', teamType: 'country' as const },
  { id: 't2', code: 'JPN', name: 'Japan', thaiName: 'ญี่ปุ่น', teamType: 'country' as const },
];

const defaultMatchInfo = {
  scouterName: 'Coach',
  nickname: 'C',
  matchName: 'Match 1',
  matchType: 'Team' as const,
  setOrGame: '2',
  currentPoint: 10,
  sportType: 'volleyball' as const,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Workstation HUD entry points', () => {
  it('keeps HUD in the command bar', () => {
    render(
      <WorkstationCommandBar
        language="en"
        theme="dark"
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onToggleHUD={vi.fn()}
        onOpenKeyMoments={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /HUD Mode/i })).toBeInTheDocument();
  });

  it('keeps fullscreen in the rail without rendering a duplicate HUD action', () => {
    render(
      <WorkstationLeftRail
        activeTool="scout"
        onSelectTool={vi.fn()}
        onToggleFullscreen={vi.fn()}
        language="en"
      />,
    );

    expect(screen.getByRole('button', { name: 'FS' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HUD' })).not.toBeInTheDocument();
  });

  it('displays SPORTSCOUT_APP_VERSION dynamically instead of hardcoded v2.1.0', () => {
    render(
      <WorkstationStatusBar
        language="en"
        projectTitle="Demo Match"
        sport="volleyball"
        eventCount={4}
        videoTime={42}
      />,
    );

    expect(screen.getByText(`v${SPORTSCOUT_APP_VERSION}`)).toBeInTheDocument();
    expect(screen.queryByText('v2.1.0')).not.toBeInTheDocument();
  });

  it('reflects live navigator online/offline events in WorkstationTopBar', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);

    render(
      <WorkstationTopBar
        language="en"
        activePreset="scout"
        onPresetChange={vi.fn()}
        teams={defaultTeams}
        matchInfo={defaultMatchInfo}
        saveStatus="saved"
        onEditMatch={vi.fn()}
      />,
    );

    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Online').closest('[data-network-status]')).toHaveAttribute('data-network-status', 'online');
    expect(screen.queryByRole('button', { name: /Classic/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Labs' })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('Offline').closest('[data-network-status]')).toHaveAttribute('data-network-status', 'offline');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});
