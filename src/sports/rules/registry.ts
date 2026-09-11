import type { Action, EventRow, SportType } from '../../types';
import { badmintonRuleEngine } from './badmintonRules';
import { basketballRuleEngine } from './basketballRules';
import { footballRuleEngine } from './footballRules';
import type {
  SportActionResolution,
  SportEventResolution,
  SportRuleContext,
  SportRuleEngine,
} from './types';
import { volleyballRuleEngine } from './volleyballRules';

const ruleEngineRegistry: Record<string, SportRuleEngine> = {
  badminton: badmintonRuleEngine,
  volleyball: volleyballRuleEngine,
  football: footballRuleEngine,
  basketball: basketballRuleEngine,
};

export function getSportRuleEngine(sportType?: string): SportRuleEngine {
  if (sportType && ruleEngineRegistry[sportType.toLowerCase()]) {
    return ruleEngineRegistry[sportType.toLowerCase()];
  }
  // Fallback to volleyball (default sport in SPORTSCOUT)
  return volleyballRuleEngine;
}

export function resolveSportAction(
  action: Action,
  context: SportRuleContext
): SportActionResolution {
  const engine = getSportRuleEngine(context.sportType);
  return engine.resolveAction(action, context);
}

export function resolveSportEvent(
  actions: Action[],
  context: SportRuleContext,
  eventRow?: Partial<EventRow>
): SportEventResolution {
  const engine = getSportRuleEngine(context.sportType);
  return engine.resolveEvent(actions, context, eventRow);
}

export * from './badmintonRules';
export * from './basketballRules';
export * from './footballRules';
export * from './types';
export * from './volleyballRules';
