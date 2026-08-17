import type { Action, EventRow } from '../types';

export const UNGRADED_RESULT_DETAIL = '__ungraded__';

export type EventSortField = 'videoTime' | 'createdAt' | 'no' | 'team' | 'skill' | 'result';
export type SortDirection = 'asc' | 'desc';
export type BookmarkFilter = 'all' | 'bookmarked' | 'unbookmarked';

export interface EventQuery {
  search: string;
  team: string;
  skill: string;
  result: string;
  resultDetail: string;
  foul: string;
  area: string;
  startArea: string;
  targetArea: string;
  systemContext: string;
  bookmark: BookmarkFilter;
  player: string;
  timeFrom?: number;
  timeTo?: number;
  sortBy: EventSortField;
  sortDirection: SortDirection;
}

export interface EventQueryOptions {
  teams: string[];
  skills: string[];
  results: string[];
  resultDetails: string[];
  fouls: string[];
  areas: string[];
  startAreas: string[];
  targetAreas: string[];
  systemContexts: string[];
  players: string[];
}

const normalize = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase();

const actionPlayerLabel = (action: Action): string => [
  action.playerNumber ? `#${action.playerNumber}` : '',
  action.playerName || '',
].filter(Boolean).join(' ');

const actionAreaValues = (action: Action): string[] => [
  action.areaCode,
  action.areaLabel,
  action.outZone,
  action.areaResolution,
].filter((value): value is string => Boolean(value));

export function getEventTimestamp(event: EventRow): number | undefined {
  return event.videoTime
    ?? event.sequenceStartTime
    ?? event.previewStartTime
    ?? event.actions?.find(action => action.videoTime !== undefined)?.videoTime;
}

function includesValue(values: Array<string | undefined>, expected: string): boolean {
  const needle = normalize(expected);
  return !needle || values.some(value => normalize(value) === needle);
}

function matchesSearch(event: EventRow, search: string): boolean {
  const needle = normalize(search);
  if (!needle) return true;

  const values: unknown[] = [
    event.no,
    event.point,
    event.eventText,
    event.extendedEventText,
    event.thaiMeaningText,
    event.note,
    event.resultText,
    event.sportType,
  ];
  event.actions?.forEach(action => {
    values.push(
      action.teamCode,
      action.skillCode,
      action.resultCode,
      action.resultDetailCode,
      action.foulCode,
      action.playerNumber,
      action.playerName,
      ...actionAreaValues(action),
      action.domainPayload?.type === 'volleyball' ? action.domainPayload.startArea?.areaCode : undefined,
      action.domainPayload?.type === 'volleyball' ? action.domainPayload.targetArea?.areaCode : undefined,
      action.domainPayload?.type === 'volleyball' ? action.domainPayload.systemContext : undefined,
    );
  });

  return values.some(value => normalize(value).includes(needle));
}

function firstActionValue(event: EventRow, field: 'teamCode' | 'skillCode' | 'resultCode'): string {
  return event.actions?.find(action => action[field])?.[field] || '';
}

function compareEvents(left: EventRow, right: EventRow, sortBy: EventSortField): number {
  switch (sortBy) {
    case 'videoTime':
      return (getEventTimestamp(left) ?? Number.POSITIVE_INFINITY) - (getEventTimestamp(right) ?? Number.POSITIVE_INFINITY);
    case 'createdAt':
      return Date.parse(left.createdAt || '') - Date.parse(right.createdAt || '');
    case 'team':
      return firstActionValue(left, 'teamCode').localeCompare(firstActionValue(right, 'teamCode'));
    case 'skill':
      return firstActionValue(left, 'skillCode').localeCompare(firstActionValue(right, 'skillCode'));
    case 'result':
      return (firstActionValue(left, 'resultCode') || left.resultText).localeCompare(firstActionValue(right, 'resultCode') || right.resultText);
    case 'no':
    default:
      return left.no - right.no;
  }
}

export function applyEventQuery(events: EventRow[], query: EventQuery): EventRow[] {
  const filtered = events.filter(event => {
    const actions = event.actions || [];
    const timestamp = getEventTimestamp(event);

    if (!matchesSearch(event, query.search)) return false;
    if (query.team && !actions.some(action => includesValue([action.teamCode], query.team))) return false;
    if (query.skill && !actions.some(action => includesValue([action.skillCode], query.skill))) return false;
    if (query.result && !actions.some(action => includesValue([action.resultCode], query.result))) return false;
    if (query.resultDetail === UNGRADED_RESULT_DETAIL) {
      if (!actions.some(action => action.skillCode && !action.resultDetailCode)) return false;
    } else if (query.resultDetail && !actions.some(action => includesValue([action.resultDetailCode], query.resultDetail))) return false;
    if (query.foul && !actions.some(action => includesValue([action.foulCode], query.foul))) return false;
    if (query.area && !actions.some(action => includesValue(actionAreaValues(action), query.area))) return false;
    if (query.startArea && !actions.some(action => includesValue([
      action.domainPayload?.type === 'volleyball' ? action.domainPayload.startArea?.areaCode : undefined,
      action.domainPayload?.type === 'volleyball' ? action.domainPayload.startArea?.outZone : undefined,
    ], query.startArea))) return false;
    if (query.targetArea && !actions.some(action => includesValue([
      action.domainPayload?.type === 'volleyball' ? action.domainPayload.targetArea?.areaCode : undefined,
      action.domainPayload?.type === 'volleyball' ? action.domainPayload.targetArea?.outZone : undefined,
    ], query.targetArea))) return false;
    if (query.systemContext && !actions.some(action => includesValue([
      action.domainPayload?.type === 'volleyball' ? action.domainPayload.systemContext : undefined,
    ], query.systemContext))) return false;
    if (query.player && !actions.some(action => normalize(actionPlayerLabel(action)).includes(normalize(query.player)))) return false;
    if (query.bookmark === 'bookmarked' && !event.isBookmarked) return false;
    if (query.bookmark === 'unbookmarked' && event.isBookmarked) return false;
    if (query.timeFrom !== undefined && (timestamp === undefined || timestamp < query.timeFrom)) return false;
    if (query.timeTo !== undefined && (timestamp === undefined || timestamp > query.timeTo)) return false;
    return true;
  });

  return filtered
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const compared = compareEvents(left.event, right.event, query.sortBy);
      const directed = query.sortDirection === 'asc' ? compared : -compared;
      return directed || left.index - right.index;
    })
    .map(item => item.event);
}

function sortedUnique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export function getEventQueryOptions(events: EventRow[]): EventQueryOptions {
  const actions = events.flatMap(event => event.actions || []);
  return {
    teams: sortedUnique(actions.map(action => action.teamCode)),
    skills: sortedUnique(actions.map(action => action.skillCode)),
    results: sortedUnique(actions.map(action => action.resultCode)),
    resultDetails: [
      ...sortedUnique(actions.map(action => action.resultDetailCode)),
      ...(actions.some(action => action.skillCode && !action.resultDetailCode) ? [UNGRADED_RESULT_DETAIL] : []),
    ],
    fouls: sortedUnique(actions.map(action => action.foulCode)),
    areas: sortedUnique(actions.flatMap(action => [action.areaCode, action.outZone])),
    startAreas: sortedUnique(actions.flatMap(action => action.domainPayload?.type === 'volleyball' ? [action.domainPayload.startArea?.areaCode, action.domainPayload.startArea?.outZone] : [])),
    targetAreas: sortedUnique(actions.flatMap(action => action.domainPayload?.type === 'volleyball' ? [action.domainPayload.targetArea?.areaCode, action.domainPayload.targetArea?.outZone] : [])),
    systemContexts: sortedUnique(actions.map(action => action.domainPayload?.type === 'volleyball' ? action.domainPayload.systemContext : undefined)),
    players: sortedUnique(actions.map(actionPlayerLabel)),
  };
}
