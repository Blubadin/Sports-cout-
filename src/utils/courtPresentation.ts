import type { AreaCourtViewMode, SportType, Team } from '../types';

export type CourtTeamPresentation = {
  orientation: 'horizontal' | 'vertical';
  nearTeam: Team;
  farTeam: Team;
  focusedTeam?: Team;
};

export function resolveCourtTeamPresentation(options: {
  teams: Team[];
  sportType: SportType;
  flipCourtSide: boolean;
  courtViewMode: AreaCourtViewMode;
}): CourtTeamPresentation {
  const teamA = options.teams[0] || { id: 'team-a', code: 'A', name: 'Team A', thaiName: 'ทีม A' };
  const teamB = options.teams[1] || { id: 'team-b', code: 'B', name: 'Team B', thaiName: 'ทีม B' };
  const primaryVisibleTeam = options.flipCourtSide ? teamB : teamA;
  const opponentVisibleTeam = options.flipCourtSide ? teamA : teamB;
  return {
    orientation: options.sportType === 'volleyball' ? 'horizontal' : 'vertical',
    nearTeam: primaryVisibleTeam,
    farTeam: opponentVisibleTeam,
    focusedTeam: options.courtViewMode === 'half' ? primaryVisibleTeam : undefined,
  };
}
