import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Area, Action, SportType, Team } from '../../types';
import { SPORT_TEMPLATES } from '../../sports';

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    settings: {
      uiLanguage: 'en' as const,
      areaPrecisionMode: 'normal' as const,
      areaCourtViewMode: 'auto' as const,
    },
  }),
}));

vi.mock('../../components/badminton/BadmintonTouchCourt', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-badminton-court">Badminton Court</div>,
  resolveBadmintonPointSelection: vi.fn(),
}));

import ProAreaCommandPad from '../../components/hud/ProAreaCommandPad';

const teams: Team[] = [
  { id: 't1', code: 'THA', name: 'Thailand', thaiName: 'ไทย', teamType: 'country' },
  { id: 't2', code: 'JPN', name: 'Japan', thaiName: 'ญี่ปุ่น', teamType: 'country' },
];

describe('ProAreaCommandPad hooks ordering safety', () => {
  afterEach(() => {
    cleanup();
  });

  it('toggles active state and switches between badminton and volleyball inside StrictMode without hook-order errors', () => {
    const emptyAction: Action = {};
    const onSelectArea = vi.fn();
    const onHoverArea = vi.fn();

    const renderPad = (active: boolean, sportType: SportType, areas: Area[]) => (
      <React.StrictMode>
        <ProAreaCommandPad
          sportType={sportType}
          areas={areas}
          currentAction={emptyAction}
          teams={teams}
          onSelectArea={onSelectArea}
          active={active}
          pointerX={0}
          pointerY={0}
          flipCourtSide={false}
          onHoverArea={onHoverArea}
          enableOutOfBoundsZones={true}
        />
      </React.StrictMode>
    );

    const { rerender } = render(renderPad(false, 'badminton', SPORT_TEMPLATES.badminton.areas));
    expect(screen.queryByTestId('mock-badminton-court')).not.toBeInTheDocument();

    rerender(renderPad(true, 'badminton', SPORT_TEMPLATES.badminton.areas));
    expect(screen.getByTestId('mock-badminton-court')).toBeInTheDocument();

    rerender(renderPad(true, 'volleyball', SPORT_TEMPLATES.volleyball.areas));
    expect(screen.queryByTestId('mock-badminton-court')).not.toBeInTheDocument();
    expect(screen.getByText('NET')).toBeInTheDocument();

    rerender(renderPad(false, 'volleyball', SPORT_TEMPLATES.volleyball.areas));
    expect(screen.queryByText('NET')).not.toBeInTheDocument();
  });
});
