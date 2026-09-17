import type { Action, EventRow } from '../../types';
import type {
  SportActionResolution,
  SportEventResolution,
  SportRuleContext,
  SportRuleEngine,
} from './types';

function getOpponentTeam(actingTeam: string, teamCodes?: string[]): string | undefined {
  if (!teamCodes || teamCodes.length === 0) return undefined;
  return teamCodes.find((c) => c !== actingTeam) ?? (actingTeam === 't1' ? 't2' : 't1');
}

export class BadmintonRuleEngine implements SportRuleEngine {
  readonly sportType = 'badminton' as const;

  resolveAction(action: Action, context: SportRuleContext): SportActionResolution {
    const actingTeam = action.teamCode || context.activeTeamCode || 't1';
    const opponentTeam = getOpponentTeam(actingTeam, context.teamCodes);
    const result = action.resultCode;
    const foul = action.foulCode;

    if (foul) {
      return {
        outcomeStatus: 'error',
        scoreDelta: -1,
        terminatesSequence: true,
        scoringTeamCode: opponentTeam,
        possessionChange: true,
        classification: 'fault',
      };
    }

    if (result === 'Yes') {
      return {
        outcomeStatus: 'success',
        scoreDelta: 1,
        terminatesSequence: true,
        scoringTeamCode: actingTeam,
        possessionChange: false,
        classification: 'winner',
      };
    }

    if (result === 'Out') {
      const isUnforced = action.descriptors?.error_type === 'unforced' || !action.descriptors?.error_type;
      return {
        outcomeStatus: 'error',
        scoreDelta: -1,
        terminatesSequence: true,
        scoringTeamCode: opponentTeam,
        possessionChange: true,
        classification: isUnforced ? 'unforced_error' : 'forced_error',
      };
    }

    // Pass / Continued rally
    return {
      outcomeStatus: 'continued',
      scoreDelta: 0,
      terminatesSequence: false,
      possessionChange: false,
      classification: 'continuation',
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

    if (resolutions.length === 0) {
      return {
        outcomeStatus: 'neutral',
        scoreDelta: 0,
        terminatesSequence: false,
        teamScoreDeltas,
        actionResolutions: [],
      };
    }

    // For Badminton, the terminal action (usually the last one) determines the rally result
    const terminalAction = resolutions.find((r) => r.terminatesSequence) ?? resolutions.at(-1)!;
    const scoringTeam = terminalAction.scoringTeamCode;

    if (scoringTeam) {
      teamScoreDeltas[scoringTeam] = (teamScoreDeltas[scoringTeam] || 0) + 1;
    }

    return {
      outcomeStatus: terminalAction.outcomeStatus,
      scoreDelta: terminalAction.scoreDelta,
      terminatesSequence: terminalAction.terminatesSequence,
      scoringTeamCode: scoringTeam,
      winningTeamCode: scoringTeam,
      teamScoreDeltas,
      actionResolutions: resolutions,
    };
  }
}

export const badmintonRuleEngine = new BadmintonRuleEngine();
