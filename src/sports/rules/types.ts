import type { Action, EventRow, SportType } from '../../types';

export interface SportActionResolution {
  outcomeStatus: 'success' | 'error' | 'neutral' | 'continued';
  scoreDelta: number;
  terminatesSequence: boolean;
  scoringTeamCode?: string;
  possessionChange?: boolean;
  classification?: 'winner' | 'forced_error' | 'unforced_error' | 'fault' | 'continuation' | 'goal' | 'none';
}

export interface SportEventResolution {
  outcomeStatus: 'success' | 'error' | 'neutral' | 'continued';
  scoreDelta: number;
  terminatesSequence: boolean;
  scoringTeamCode?: string;
  teamScoreDeltas: Record<string, number>;
  actionResolutions: SportActionResolution[];
  winningTeamCode?: string;
}

export interface SportRuleContext {
  sportType: SportType | string;
  teamCodes?: string[];
  activeTeamCode?: string;
  servingTeamCode?: string;
  currentScores?: Record<string, number>;
}

export interface SportRuleEngine {
  readonly sportType: SportType | string;
  resolveAction(action: Action, context: SportRuleContext): SportActionResolution;
  resolveEvent(actions: Action[], context: SportRuleContext, eventRow?: Partial<EventRow>): SportEventResolution;
}
