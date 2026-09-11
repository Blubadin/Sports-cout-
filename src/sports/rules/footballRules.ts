import type { Action, EventRow } from '../../types';
import type {
  SportActionResolution,
  SportEventResolution,
  SportRuleContext,
  SportRuleEngine,
} from './types';

export class FootballRuleEngine implements SportRuleEngine {
  readonly sportType = 'football' as const;

  resolveAction(action: Action, context: SportRuleContext): SportActionResolution {
    const actingTeam = action.teamCode || context.activeTeamCode || 't1';
    const skill = (action.skillCode || '').toUpperCase();
    const result = action.resultCode;
    const shotRes = (action.descriptors?.shot_res || '').toUpperCase();

    // In football, ONLY a goal scores +1
    const isGoal = skill === 'SHT' && (shotRes === 'GOAL' || action.areaCode === 'GOAL' && result === 'Yes');

    if (isGoal) {
      return {
        outcomeStatus: 'success',
        scoreDelta: 1,
        terminatesSequence: true,
        scoringTeamCode: actingTeam,
        possessionChange: true,
        classification: 'goal',
      };
    }

    // Passes, dribbles, tackles, fouls, off-target shots NEVER change scoreboard
    const outcomeStatus: 'success' | 'error' | 'neutral' | 'continued' =
      result === 'Yes' ? 'success' : result === 'Out' ? 'error' : 'continued';

    return {
      outcomeStatus,
      scoreDelta: 0,
      terminatesSequence: false,
      possessionChange: result === 'Out' || skill === 'TKL' && result === 'Yes',
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

    const goalAction = resolutions.find((r) => r.classification === 'goal');
    if (goalAction && goalAction.scoringTeamCode) {
      teamScoreDeltas[goalAction.scoringTeamCode] = (teamScoreDeltas[goalAction.scoringTeamCode] || 0) + 1;
      return {
        outcomeStatus: 'success',
        scoreDelta: 1,
        terminatesSequence: true,
        scoringTeamCode: goalAction.scoringTeamCode,
        winningTeamCode: goalAction.scoringTeamCode,
        teamScoreDeltas,
        actionResolutions: resolutions,
      };
    }

    const lastAction = resolutions.at(-1);
    return {
      outcomeStatus: lastAction?.outcomeStatus ?? 'neutral',
      scoreDelta: 0,
      terminatesSequence: false,
      teamScoreDeltas,
      actionResolutions: resolutions,
    };
  }
}

export const footballRuleEngine = new FootballRuleEngine();
