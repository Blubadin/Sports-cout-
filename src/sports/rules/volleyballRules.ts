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

const CONTINUATION_SKILLS = new Set(['REC', 'SET', 'DIG', 'UND']);
const TERMINAL_CANDIDATE_SKILLS = new Set(['SV', 'SPK', 'BLK']);

export class VolleyballRuleEngine implements SportRuleEngine {
  readonly sportType = 'volleyball' as const;

  resolveAction(action: Action, context: SportRuleContext): SportActionResolution {
    const actingTeam = action.teamCode || context.activeTeamCode || 't1';
    const opponentTeam = getOpponentTeam(actingTeam, context.teamCodes);
    const skill = (action.skillCode || '').toUpperCase();
    const result = action.resultCode;
    const foul = action.foulCode;

    // Any fault/foul gives point to opponent
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

    // Continuation skills (Receive, Set, Dig, Under) never award a point directly on 'Yes'
    if (CONTINUATION_SKILLS.has(skill)) {
      if (result === 'Out') {
        // Error on pass/receive/dig -> opponent point
        return {
          outcomeStatus: 'error',
          scoreDelta: -1,
          terminatesSequence: true,
          scoringTeamCode: opponentTeam,
          possessionChange: true,
          classification: 'unforced_error',
        };
      }
      // Successful or continued receive/set/dig is 0 points
      return {
        outcomeStatus: result === 'Yes' ? 'success' : 'continued',
        scoreDelta: 0,
        terminatesSequence: false,
        possessionChange: false,
        classification: 'continuation',
      };
    }

    // Terminal candidate skills (Serve, Spike, Block)
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
      return {
        outcomeStatus: 'error',
        scoreDelta: -1,
        terminatesSequence: true,
        scoringTeamCode: opponentTeam,
        possessionChange: true,
        classification: 'unforced_error',
      };
    }

    // Default Pass
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

    // Final terminal action resolves rally
    const terminalAction = resolutions.find((r) => r.terminatesSequence) ?? resolutions.at(-1)!;
    const scoringTeam = terminalAction.scoringTeamCode;

    if (scoringTeam && terminalAction.terminatesSequence) {
      teamScoreDeltas[scoringTeam] = (teamScoreDeltas[scoringTeam] || 0) + 1;
    }

    return {
      outcomeStatus: terminalAction.outcomeStatus,
      scoreDelta: terminalAction.terminatesSequence ? terminalAction.scoreDelta : 0,
      terminatesSequence: terminalAction.terminatesSequence,
      scoringTeamCode: terminalAction.terminatesSequence ? scoringTeam : undefined,
      winningTeamCode: terminalAction.terminatesSequence ? scoringTeam : undefined,
      teamScoreDeltas,
      actionResolutions: resolutions,
    };
  }
}

export const volleyballRuleEngine = new VolleyballRuleEngine();
