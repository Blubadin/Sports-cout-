import type { Action, EventRow } from '../../types';
import type {
  SportActionResolution,
  SportEventResolution,
  SportRuleContext,
  SportRuleEngine,
} from './types';

export class BasketballRuleEngine implements SportRuleEngine {
  readonly sportType = 'basketball' as const;

  resolveAction(action: Action, context: SportRuleContext): SportActionResolution {
    const actingTeam = action.teamCode || context.activeTeamCode || 't1';
    const skill = (action.skillCode || '').toUpperCase();
    const result = action.resultCode;
    const shotType = (action.descriptors?.shot_type || '').toUpperCase();
    const areaCode = (action.areaCode || '').toUpperCase();

    // Miss (Out), turnover, foul do NOT change score!
    if (result !== 'Yes') {
      return {
        outcomeStatus: result === 'Out' ? 'error' : 'continued',
        scoreDelta: 0,
        terminatesSequence: result === 'Out' || skill === 'TO',
        possessionChange: result === 'Out' || skill === 'TO',
        classification: 'none',
      };
    }

    // Shot made
    if (skill === 'LAY') {
      return {
        outcomeStatus: 'success',
        scoreDelta: 2,
        terminatesSequence: true,
        scoringTeamCode: actingTeam,
        possessionChange: true,
        classification: 'winner',
      };
    }

    if (skill === 'SHT' || skill === '3PT') {
      let points = 2;
      if (shotType === '3PT' || skill === '3PT' || areaCode === 'THREE_PT' || areaCode === '3PT') {
        points = 3;
      } else if (shotType === 'FT') {
        points = 1;
      } else if (shotType === '2PT') {
        points = 2;
      }

      return {
        outcomeStatus: 'success',
        scoreDelta: points,
        terminatesSequence: true,
        scoringTeamCode: actingTeam,
        possessionChange: true,
        classification: 'winner',
      };
    }

    // Other actions (Pass, Dribble, Rebound, Assist, Steal, etc.)
    return {
      outcomeStatus: 'success',
      scoreDelta: 0,
      terminatesSequence: false,
      possessionChange: skill === 'STL',
      classification: 'none',
    };
  }

  resolveEvent(
    actions: Action[],
    context: SportRuleContext,
    eventRow?: Partial<EventRow>
  ): SportEventResolution {
    const resolutions = actions.map((a) => this.resolveAction(a, context));
    const teamScoreDeltas: Record<string, number> = {};
    (context.teamCodes ?? []).forEach((code) => {
      teamScoreDeltas[code] = 0;
    });

    let totalScoreDelta = 0;
    let scoringTeam: string | undefined;

    for (const res of resolutions) {
      if (res.scoreDelta > 0 && res.scoringTeamCode) {
        totalScoreDelta += res.scoreDelta;
        scoringTeam = res.scoringTeamCode;
        teamScoreDeltas[res.scoringTeamCode] =
          (teamScoreDeltas[res.scoringTeamCode] || 0) + res.scoreDelta;
      }
    }

    const lastAction = resolutions.at(-1);

    return {
      outcomeStatus: lastAction?.outcomeStatus ?? 'neutral',
      scoreDelta: totalScoreDelta,
      terminatesSequence: resolutions.some((r) => r.terminatesSequence),
      scoringTeamCode: scoringTeam,
      winningTeamCode: scoringTeam,
      teamScoreDeltas,
      actionResolutions: resolutions,
    };
  }
}

export const basketballRuleEngine = new BasketballRuleEngine();
