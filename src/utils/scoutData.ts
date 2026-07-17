import type {
  Action,
  AppSettings,
  EventRow,
  ScoutProject,
  SportTemplate,
  SportType,
  Team,
} from "../types";
import { DETAILED_ZONE_LABELS, OUT_ZONE_LABELS, SPORT_TEMPLATES } from "../sports";
import {
  SPORTSCOUT_APP_NAME,
  SPORTSCOUT_APP_VERSION,
  SPORTSCOUT_EXPORT_SCHEMA_VERSION,
} from "../appMetadata";
import { sanitizeUserText } from "./security";
import {
  buildAnalyticsSummary as buildUnifiedAnalyticsSummary,
  type AnalyticsSummary,
} from "./analyticsEngine";
export { buildUnifiedAnalyticsSummary as buildAnalyticsSummary };
export type { AnalyticsSummary };

export const SCOUT_EXPORT_SCHEMA_VERSION = SPORTSCOUT_EXPORT_SCHEMA_VERSION;
export const SCOUT_EXPORT_APP_NAME = SPORTSCOUT_APP_NAME;

export type ScoutExportEnvelopeType = "events" | "projects";

export type ScoutExportEnvelope<T extends ScoutExportEnvelopeType> = {
  schemaVersion: string;
  app: string;
  appVersion?: string;
  type: T;
  exportedAt: string;
  events?: EventRow[];
  projects?: ScoutProject[];
  analytics?: AnalyticsSummary;
};

export type DataQualityIssueSeverity = "info" | "warning" | "error";

export type DataQualityIssueCode =
  | "missing_event_id"
  | "duplicate_event_id"
  | "missing_action_id"
  | "duplicate_action_id"
  | "missing_actions"
  | "invalid_sport_type"
  | "sport_mismatch"
  | "missing_team"
  | "invalid_team"
  | "missing_skill"
  | "invalid_skill"
  | "missing_result"
  | "invalid_result"
  | "missing_area"
  | "invalid_area"
  | "invalid_foul"
  | "legacy_event_text";

export type DataQualityIssue = {
  severity: DataQualityIssueSeverity;
  code: DataQualityIssueCode;
  message: string;
  eventId?: string;
  eventNo?: number;
  actionId?: string;
};

export type DataQualityReport = {
  totalEvents: number;
  totalActions: number;
  validEvents: number;
  incompleteEvents: number;
  legacyEvents: number;
  duplicateEventIds: number;
  duplicateActionIds: number;
  warnings: number;
  errors: number;
  issues: DataQualityIssue[];
};

export type DataQualityDrilldownGroup = {
  code: DataQualityIssueCode;
  severity: DataQualityIssueSeverity;
  count: number;
  eventIds: string[];
  eventNos: number[];
  actionIds: string[];
};

type FormatContext = {
  sportTemplate?: SportTemplate;
  teams?: Team[];
  uiLanguage?: AppSettings["uiLanguage"];
};

const VALID_SPORT_TYPES: SportType[] = [
  "volleyball",
  "football",
  "badminton",
  "basketball",
];

export function createScoutId(prefix = "scout"): string {
  const randomPart = Math.random().toString(36).slice(2, 11);
  return `${prefix}-${Date.now()}-${randomPart}`;
}

export function getValidSportType(value: unknown, fallback: SportType = "volleyball"): SportType {
  return VALID_SPORT_TYPES.includes(value as SportType) ? (value as SportType) : fallback;
}

function getTemplateForEvent(event?: Pick<EventRow, "sportType">, fallback?: SportTemplate): SportTemplate | undefined {
  if (fallback) return fallback;
  return SPORT_TEMPLATES[getValidSportType(event?.sportType)];
}

export function getAreaLabel(action: Action, context: FormatContext = {}): string {
  const isThai = context.uiLanguage === "th";
  if (action.outZone && OUT_ZONE_LABELS[action.outZone]) {
    return isThai ? OUT_ZONE_LABELS[action.outZone].thaiLabel : OUT_ZONE_LABELS[action.outZone].label;
  }
  if (action.areaCode && DETAILED_ZONE_LABELS[action.areaCode]) {
    return isThai ? DETAILED_ZONE_LABELS[action.areaCode].thaiLabel : DETAILED_ZONE_LABELS[action.areaCode].label;
  }
  const area = context.sportTemplate?.areas.find((item) => item.code === action.areaCode);
  return action.areaLabel || (isThai ? area?.thaiName : area?.code) || action.areaCode || (action.resultCode === "Out" ? "OUT" : "");
}

export function getFoulLabel(action: Action, context: FormatContext = {}): string {
  if (!action.foulCode) return "";
  const foul = context.sportTemplate?.fouls?.find((item) => item.code === action.foulCode);
  if (!foul) return action.foulCode;
  return context.uiLanguage === "th" ? foul.labelTh || foul.label : foul.label;
}

export function formatActionCode(action: Action, context: FormatContext = {}): string {
  const area = getAreaLabel(action, { ...context, uiLanguage: "en" });
  return [
    action.teamCode,
    action.skillCode,
    ...(action.descriptors ? Object.values(action.descriptors) : []),
    area,
    action.resultCode,
    action.foulCode,
  ].filter(Boolean).join(" / ");
}

export function formatExtendedActionCode(action: Action, context: FormatContext = {}): string {
  const base = formatActionCode(action, context);
  const details = [
    [action.playerNumber ? `#${action.playerNumber}` : "", action.playerName].filter(Boolean).join(" "),
    action.resultDetailCode,
  ].filter(Boolean);
  return details.length > 0 ? `${base} / ${details.join(" / ")}` : base;
}

export function formatActionMeaning(action: Action, context: FormatContext = {}): string {
  const isThai = context.uiLanguage === "th";
  const template = context.sportTemplate;
  const team = context.teams?.find((item) => item.code === action.teamCode);
  const skill = template?.skills.find((item) => item.code === action.skillCode);
  const result = template?.results.find((item) => item.code === action.resultCode);
  const descriptors: string[] = [];

  if (action.descriptors && template?.descriptors) {
    Object.entries(action.descriptors).forEach(([groupId, optionCode]) => {
      Object.values(template.descriptors || {}).forEach((groups) => {
        groups.forEach((group) => {
          if (group.id === groupId) {
            const option = group.options.find((item) => item.code === optionCode);
            if (option) descriptors.push(isThai ? option.thaiLabel : option.label);
          }
        });
      });
    });
  }

  const player = [action.playerNumber ? `#${action.playerNumber}` : "", action.playerName].filter(Boolean).join(" ");
  return [
    isThai ? team?.thaiName || team?.name || action.teamCode : team?.code || team?.name || action.teamCode,
    isThai ? skill?.thaiName || action.skillCode : skill?.code || action.skillCode,
    ...descriptors,
    getAreaLabel(action, context),
    isThai ? result?.thaiName || action.resultCode : result?.code || action.resultCode,
    getFoulLabel(action, context),
    player,
  ].filter(Boolean).join(" / ");
}

export function deriveEventResultText(actions: Action[]): EventRow["resultText"] {
  const lastAction = actions[actions.length - 1];
  if (!lastAction) return "0";
  if (lastAction.resultCode === "Yes") return "+1";
  if (lastAction.resultCode === "Out") return "-1";
  if (lastAction.foulCode) return "-1";
  return "0";
}

export function sanitizeEvents(eventsList: unknown[], fallbackSportType: SportType = "volleyball"): EventRow[] {
  if (!Array.isArray(eventsList)) return [];
  const seenEventIds = new Set<string>();

  return eventsList.map((row: any, index) => {
    const nextRow: EventRow = {
      ...row,
      id: typeof row?.id === "string" && row.id ? row.id : createScoutId(`event-${index}`),
      no: typeof row?.no === "number" ? row.no : index + 1,
      point: typeof row?.point === "number" ? row.point : index + 1,
      sportType: getValidSportType(row?.sportType, fallbackSportType),
      actions: [],
      eventText: typeof row?.eventText === "string" ? row.eventText : "",
      resultText: row?.resultText === "+1" || row?.resultText === "-1" || row?.resultText === "0" ? row.resultText : "0",
      createdAt: typeof row?.createdAt === "string" ? row.createdAt : new Date().toISOString(),
      note: sanitizeUserText(row?.note, 2000) || undefined,
      bookmarkNote: sanitizeUserText(row?.bookmarkNote, 1000) || undefined,
      localFileName: sanitizeUserText(row?.localFileName, 255) || undefined,
    };

    if (/^\d+$/.test(nextRow.id) || seenEventIds.has(nextRow.id)) {
      nextRow.id = createScoutId(`${nextRow.id || "event"}-${index}`);
    }
    seenEventIds.add(nextRow.id);

    const rawActions = Array.isArray(row?.actions) ? row.actions : parseLegacyActions(row?.eventText, index);
    const seenActionIds = new Set<string>();
    nextRow.actions = rawActions.map((action: any, actionIndex: number) => {
      const nextAction: Action = {
        ...action,
        id: typeof action?.id === "string" && action.id ? action.id : createScoutId(`action-${index}-${actionIndex}`),
        playerName: sanitizeUserText(action?.playerName, 120) || undefined,
        playerNumber: sanitizeUserText(action?.playerNumber, 20) || undefined,
      };
      if (/^\d+$/.test(String(nextAction.id)) || seenActionIds.has(String(nextAction.id))) {
        nextAction.id = createScoutId(`${nextAction.id || "action"}-${actionIndex}`);
      }
      seenActionIds.add(String(nextAction.id));
      return nextAction;
    });

    if (!nextRow.eventText && nextRow.actions.length > 0) {
      const template = getTemplateForEvent(nextRow);
      nextRow.eventText = nextRow.actions.map((action) => formatActionCode(action, { sportTemplate: template })).join(" / ");
    }
    if (!nextRow.extendedEventText && nextRow.actions.length > 0) {
      const template = getTemplateForEvent(nextRow);
      nextRow.extendedEventText = nextRow.actions.map((action) => formatExtendedActionCode(action, { sportTemplate: template })).join(" / ");
    }
    nextRow.resultText = deriveEventResultText(nextRow.actions) || nextRow.resultText;
    return nextRow;
  }).map((row, index) => ({ ...row, no: index + 1 }));
}

function parseLegacyActions(eventText: unknown, eventIndex: number): Action[] {
  if (typeof eventText !== "string") return [];
  const parts = eventText.split(" / ").map((item) => item.trim()).filter(Boolean);
  const actions: Action[] = [];
  for (let i = 0; i + 3 < parts.length; i += 4) {
    let resultCode = parts[i + 3];
    if (!["Yes", "Out", "Pass", "0", "+1", "-1"].includes(resultCode)) continue;
    if (resultCode === "+1") resultCode = "Yes";
    if (resultCode === "-1") resultCode = "Out";
    if (resultCode === "0") resultCode = "Pass";
    actions.push({
      id: createScoutId(`legacy-${eventIndex}-${i}`),
      teamCode: parts[i],
      skillCode: parts[i + 1],
      areaCode: parts[i + 2],
      resultCode,
    });
  }
  return actions;
}

export function createEventsExport(events: EventRow[]): ScoutExportEnvelope<"events"> {
  const sanitizedEvents = sanitizeEvents(events);
  return {
    schemaVersion: SCOUT_EXPORT_SCHEMA_VERSION,
    app: SCOUT_EXPORT_APP_NAME,
    appVersion: SPORTSCOUT_APP_VERSION,
    exportedAt: new Date().toISOString(),
    type: "events",
    events: sanitizedEvents,
    analytics: buildUnifiedAnalyticsSummary(sanitizedEvents),
  };
}

export function createProjectsExport(projects: ScoutProject[]): ScoutExportEnvelope<"projects"> {
  return {
    schemaVersion: SCOUT_EXPORT_SCHEMA_VERSION,
    app: SCOUT_EXPORT_APP_NAME,
    appVersion: SPORTSCOUT_APP_VERSION,
    exportedAt: new Date().toISOString(),
    type: "projects",
    projects: projects.map((project) => ({
      ...project,
      sportType: getValidSportType(project.sportType),
      events: sanitizeEvents(project.events, getValidSportType(project.sportType)),
      updatedAt: project.updatedAt || new Date().toISOString(),
    })),
  };
}

export function buildDataQualityReport(events: EventRow[], teams: Team[] = []): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  const seenEventIds = new Set<string>();
  let totalActions = 0;
  let legacyEvents = 0;
  let duplicateEventIds = 0;
  let duplicateActionIds = 0;

  events.forEach((event, eventIndex) => {
    const eventLabel = `Event #${event.no || eventIndex + 1}`;
    const sportType = getValidSportType(event.sportType, "volleyball");
    const template = SPORT_TEMPLATES[sportType];

    if (!event.id) addIssue("error", "missing_event_id", `${eventLabel} is missing an event id.`, event);
    if (event.id && seenEventIds.has(event.id)) {
      duplicateEventIds++;
      addIssue("error", "duplicate_event_id", `${eventLabel} duplicates event id ${event.id}.`, event);
    }
    if (event.id) seenEventIds.add(event.id);

    if (event.sportType && event.sportType !== sportType) {
      addIssue("warning", "invalid_sport_type", `${eventLabel} has an invalid sport type.`, event);
    }

    const actions = Array.isArray(event.actions) ? event.actions : [];
    if (actions.length === 0) {
      if (event.eventText) {
        legacyEvents++;
        addIssue("warning", "legacy_event_text", `${eventLabel} only has legacy event text.`, event);
      } else {
        addIssue("error", "missing_actions", `${eventLabel} has no actions.`, event);
      }
    }

    const seenActionIds = new Set<string>();
    actions.forEach((action) => {
      totalActions++;
      if (!action.id) addIssue("warning", "missing_action_id", `${eventLabel} has an action without an id.`, event, action);
      if (action.id && seenActionIds.has(action.id)) {
        duplicateActionIds++;
        addIssue("error", "duplicate_action_id", `${eventLabel} duplicates action id ${action.id}.`, event, action);
      }
      if (action.id) seenActionIds.add(action.id);

      if (template.teamsEnabled && !action.teamCode) {
        addIssue("error", "missing_team", `${eventLabel} has an action without a team.`, event, action);
      } else if (action.teamCode && teams.length > 0 && !teams.some((team) => team.code === action.teamCode)) {
        addIssue("warning", "invalid_team", `${eventLabel} references unknown team ${action.teamCode}.`, event, action);
      }

      if (!action.foulCode) {
        if (!action.skillCode) addIssue("error", "missing_skill", `${eventLabel} has an action without a skill.`, event, action);
        if (!action.resultCode) addIssue("error", "missing_result", `${eventLabel} has an action without a result.`, event, action);
      }

      if (action.skillCode && !template.skills.some((skill) => skill.code === action.skillCode)) {
        addIssue("warning", "invalid_skill", `${eventLabel} references unknown skill ${action.skillCode}.`, event, action);
      }
      if (action.resultCode && !template.results.some((result) => result.code === action.resultCode)) {
        addIssue("warning", "invalid_result", `${eventLabel} references unknown result ${action.resultCode}.`, event, action);
      }
      if (action.areaCode && !["OUT", "UNKNOWN", "NET", "NET_ERR"].includes(action.areaCode) && !template.areas.some((area) => area.code === action.areaCode) && !DETAILED_ZONE_LABELS[action.areaCode]) {
        addIssue("warning", "invalid_area", `${eventLabel} references unknown area ${action.areaCode}.`, event, action);
      }
      if (action.foulCode && !template.fouls?.some((foul) => foul.code === action.foulCode)) {
        addIssue("warning", "invalid_foul", `${eventLabel} references unknown foul ${action.foulCode}.`, event, action);
      }
    });
  });

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const incompleteEvents = new Set(issues.filter((issue) => issue.severity === "error").map((issue) => issue.eventId || issue.eventNo)).size;

  return {
    totalEvents: events.length,
    totalActions,
    validEvents: Math.max(0, events.length - incompleteEvents),
    incompleteEvents,
    legacyEvents,
    duplicateEventIds,
    duplicateActionIds,
    warnings,
    errors,
    issues,
  };

  function addIssue(
    severity: DataQualityIssueSeverity,
    code: DataQualityIssueCode,
    message: string,
    event?: EventRow,
    action?: Action,
  ) {
    issues.push({
      severity,
      code,
      message,
      eventId: event?.id,
      eventNo: event?.no,
      actionId: action?.id,
    });
  }
}

export function buildDataQualityDrilldown(report: DataQualityReport): DataQualityDrilldownGroup[] {
  const severityRank: Record<DataQualityIssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  const groups = new Map<DataQualityIssueCode, DataQualityDrilldownGroup>();

  report.issues.forEach(issue => {
    const group = groups.get(issue.code) ?? {
      code: issue.code,
      severity: issue.severity,
      count: 0,
      eventIds: [],
      eventNos: [],
      actionIds: [],
    };
    group.count += 1;
    if (issue.eventId && !group.eventIds.includes(issue.eventId)) group.eventIds.push(issue.eventId);
    if (issue.eventNo !== undefined && !group.eventNos.includes(issue.eventNo)) group.eventNos.push(issue.eventNo);
    if (issue.actionId && !group.actionIds.includes(issue.actionId)) group.actionIds.push(issue.actionId);
    if (severityRank[issue.severity] < severityRank[group.severity]) group.severity = issue.severity;
    groups.set(issue.code, group);
  });

  return Array.from(groups.values()).sort((left, right) =>
    severityRank[left.severity] - severityRank[right.severity]
      || right.count - left.count
      || left.code.localeCompare(right.code),
  );
}

export function isAttackingSkill(sportType: SportType, skillCode: string): boolean {
  if (!skillCode) return false;
  const skill = skillCode.toUpperCase();
  switch (sportType) {
    case 'volleyball': return ['SV', 'SPK'].includes(skill);
    case 'football': return ['PAS', 'DRB', 'SHT', 'CRS'].includes(skill);
    case 'badminton': return ['SMH', 'DRP', 'DRV'].includes(skill);
    case 'basketball': return ['PAS', 'DRB', 'SHT', 'LAY'].includes(skill);
    default: return false;
  }
}

export function isDefensiveSkill(sportType: SportType, skillCode: string): boolean {
  if (!skillCode) return false;
  const skill = skillCode.toUpperCase();
  switch (sportType) {
    case 'volleyball': return ['REC', 'DIG', 'BLK', 'UND'].includes(skill);
    case 'football': return ['TKL', 'INT', 'CLR', 'SAV'].includes(skill);
    case 'badminton': return ['DEF', 'LFT', 'CLR'].includes(skill);
    case 'basketball': return ['REB', 'STL', 'BLK'].includes(skill);
    default: return false;
  }
}
