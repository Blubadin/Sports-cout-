import { describe, expect, it } from 'vitest';
import type { Team } from '../../types';
import { resolveCourtTeamPresentation } from '../../utils/courtPresentation';

const teams: Team[] = [
  { id: 'tha', code: 'THA', name: 'Thailand', thaiName: 'ไทย' },
  { id: 'jpn', code: 'JPN', name: 'Japan', thaiName: 'ญี่ปุ่น' },
];

describe('court team presentation', () => {
  it('places the opponent above and the primary team below on vertical courts', () => {
    const result = resolveCourtTeamPresentation({
      teams,
      sportType: 'football',
      flipCourtSide: false,
      courtViewMode: 'full',
    });

    expect(result.orientation).toBe('vertical');
    expect(result.farTeam.code).toBe('JPN');
    expect(result.nearTeam.code).toBe('THA');
  });

  it('swaps visual team labels without changing the team identities', () => {
    const result = resolveCourtTeamPresentation({
      teams,
      sportType: 'basketball',
      flipCourtSide: true,
      courtViewMode: 'full',
    });

    expect(result.farTeam.code).toBe('THA');
    expect(result.nearTeam.code).toBe('JPN');
  });

  it('uses left and right team labels for volleyball', () => {
    const result = resolveCourtTeamPresentation({
      teams,
      sportType: 'volleyball',
      flipCourtSide: false,
      courtViewMode: 'full',
    });

    expect(result.orientation).toBe('horizontal');
    expect(result.nearTeam.code).toBe('THA');
    expect(result.farTeam.code).toBe('JPN');
  });

  it('identifies the focused team in Half Court view', () => {
    expect(resolveCourtTeamPresentation({
      teams,
      sportType: 'badminton',
      flipCourtSide: false,
      courtViewMode: 'half',
    }).focusedTeam?.code).toBe('THA');

    expect(resolveCourtTeamPresentation({
      teams,
      sportType: 'badminton',
      flipCourtSide: true,
      courtViewMode: 'half',
    }).focusedTeam?.code).toBe('JPN');
  });
});
