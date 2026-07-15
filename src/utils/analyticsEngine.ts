import type { Action, AppSettings, EventRow, SportType, Team } from "../types";
import { getAreaPrecision, type AreaPrecision } from "./areaGeometry";

export type DerivedOutcomePoints = {
  total: number;
  byTeam: Record<string, number>;
  earnedByTeam: Record<string, number>;
  opponentErrorByTeam: Record<string, number>;
};

export type AnalyticsSummary = {
  totalEvents: number;
  totalActions: number;
  teamCounts: Record<string, number>;
  skillCounts: Record<string, number>;
  eventResultCounts: Record<"Yes" | "Out" | "Pass", number>;
  actionResultCounts: Record<"Yes" | "Out" | "Pass", number>;
  areaCounts: Record<string, number>;
  foulCounts: Record<string, number>;
  precisionCounts: Record<AreaPrecision, number>;
  derivedOutcomePoints: DerivedOutcomePoints;
};

export type AnalyticsOptions = {
  sportType?: SportType | "ALL";
  teams?: Team[];
  uiLanguage?: AppSettings["uiLanguage"];
};

export type FieldMapQuery = {
  sportType: SportType;
  eventId?: string;
  team?: string;
  skill?: string;
  result?: string;
  foul?: string;
  area?: string;
  timeFrom?: number;
  timeTo?: number;
};

export type FieldMapRecord = Action & {
  eventId: string;
  eventNo: number;
  sportType: SportType;
  videoTime: number;
  precision: AreaPrecision;
};

const RESULT_KEYS = ["Yes", "Out", "Pass"] as const;
const PRECISION_KEYS: AreaPrecision[] = ["Point", "Detailed", "Zone", "Out", "Unknown"];

function increment(record: Record<string, number>, key?: string): void {
  if (key) record[key] = (record[key] ?? 0) + 1;
}

function getStableAreaKey(action: Action): string {
  if (action.outZone) return action.outZone;
  if (action.areaCode && action.areaCode !== "UNKNOWN") return action.areaCode;
  return "UNKNOWN";
}

function normalizeResult(value?: string): "Yes" | "Out" | "Pass" {
  if (value === "Yes" || value === "+1") return "Yes";
  if (value === "Out" || value === "-1") return "Out";
  return "Pass";
}

function getEventResult(event: EventRow, actions: Action[]): "Yes" | "Out" | "Pass" {
  if (event.resultText === "+1") return "Yes";
  if (event.resultText === "-1") return "Out";
  const lastAction = actions[actions.length - 1];
  return normalizeResult(lastAction?.resultCode);
}

function getLegacyActions(event: EventRow): Action[] {
  if (event.actions.length > 0 || !event.eventText) return event.actions;
  const parts = event.eventText.split(" / ").map(value => value.trim()).filter(Boolean);
  const actions: Action[] = [];
  for (let index = 0; index + 3 < parts.length; index += 4) {
    const result = normalizeResult(parts[index + 3]);
    actions.push({
      id: `${event.id || "legacy"}-analytics-${index / 4}`,
      teamCode: parts[index],
      skillCode: parts[index + 1],
      areaCode: parts[index + 2],
      resultCode: result,
    });
  }
  return actions;
}

export function buildAnalyticsSummary(
  events: EventRow[],
  options: AnalyticsOptions = {},
): AnalyticsSummary {
  const summary: AnalyticsSummary = {
    totalEvents: 0,
    totalActions: 0,
    teamCounts: {},
    skillCounts: {},
    eventResultCounts: { Yes: 0, Out: 0, Pass: 0 },
    actionResultCounts: { Yes: 0, Out: 0, Pass: 0 },
    areaCounts: {},
    foulCounts: {},
    precisionCounts: Object.fromEntries(PRECISION_KEYS.map(key => [key, 0])) as Record<AreaPrecision, number>,
    derivedOutcomePoints: {
      total: 0,
      byTeam: {},
      earnedByTeam: {},
      opponentErrorByTeam: {},
    },
  };

  const filteredEvents = options.sportType && options.sportType !== "ALL"
    ? events.filter(event => event.sportType === options.sportType)
    : events;
  const configuredTeams = options.teams?.map(team => team.code).filter(Boolean) ?? [];
  const inferredTeams = Array.from(new Set(
    filteredEvents.flatMap(event => getLegacyActions(event).map(action => action.teamCode)).filter(Boolean),
  )) as string[];
  const teamCodes = configuredTeams.length >= 2 ? configuredTeams : inferredTeams;

  filteredEvents.forEach(event => {
    const actions = getLegacyActions(event);
    const eventResult = getEventResult(event, actions);
    const lastTeam = actions.at(-1)?.teamCode;
    summary.totalEvents += 1;
    summary.eventResultCounts[eventResult] += 1;

    if (eventResult !== "Pass" && lastTeam) {
      const scoringTeam = eventResult === "Yes"
        ? lastTeam
        : teamCodes.find(teamCode => teamCode !== lastTeam);
      if (scoringTeam) {
        summary.derivedOutcomePoints.total += 1;
        increment(summary.derivedOutcomePoints.byTeam, scoringTeam);
        if (eventResult === "Yes") increment(summary.derivedOutcomePoints.earnedByTeam, scoringTeam);
        else increment(summary.derivedOutcomePoints.opponentErrorByTeam, scoringTeam);
      }
    }

    actions.forEach(action => {
      summary.totalActions += 1;
      increment(summary.teamCounts, action.teamCode);
      increment(summary.skillCounts, action.skillCode);
      summary.actionResultCounts[normalizeResult(action.resultCode)] += 1;
      increment(summary.areaCounts, getStableAreaKey(action));
      increment(summary.foulCounts, action.foulCode);
      summary.precisionCounts[getAreaPrecision(action)] += 1;
    });
  });

  return summary;
}

export function buildFieldMapRecords(events: EventRow[], query: FieldMapQuery): FieldMapRecord[] {
  const records: FieldMapRecord[] = [];

  events.forEach(event => {
    if (event.sportType !== query.sportType || (query.eventId && event.id !== query.eventId)) return;
    getLegacyActions(event).forEach((action, actionIndex) => {
      const videoTime = action.videoTime ?? event.videoTime ?? event.sequenceStartTime ?? actionIndex;
      const areaKey = getStableAreaKey(action);
      const matchesFoul = !query.foul
        || query.foul === "ALL"
        || (query.foul === "with-foul" ? Boolean(action.foulCode) : action.foulCode === query.foul);
      if (query.team && query.team !== "ALL" && action.teamCode !== query.team) return;
      if (query.skill && query.skill !== "ALL" && action.skillCode !== query.skill) return;
      if (query.result && query.result !== "ALL" && action.resultCode !== query.result) return;
      if (!matchesFoul) return;
      if (
        query.area
        && query.area !== "ALL"
        && ![areaKey, action.areaCode, action.outZone, action.areaLabel].includes(query.area)
      ) return;
      if (query.timeFrom !== undefined && videoTime < query.timeFrom) return;
      if (query.timeTo !== undefined && videoTime > query.timeTo) return;

      records.push({
        ...action,
        eventId: event.id,
        eventNo: event.no,
        sportType: event.sportType,
        videoTime,
        precision: getAreaPrecision(action),
      });
    });
  });

  return records.sort((a, b) => a.videoTime - b.videoTime || a.eventNo - b.eventNo);
}
