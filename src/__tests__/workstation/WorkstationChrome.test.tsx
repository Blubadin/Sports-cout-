import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorkstationCommandBar,
  WorkstationLeftRail,
} from '../../components/workstation/WorkstationChrome';

vi.mock('../../components/WorkspaceMenu', () => ({ default: () => null }));

afterEach(() => cleanup());

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
});
