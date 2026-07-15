import { describe, expect, it } from 'vitest';
import { createMockEvent, createMockEventList } from '../fixtures';
import {
  applyEventQuery,
  getEventQueryOptions,
  getEventTimestamp,
  type EventQuery,
} from '../../utils/eventQuery';

const emptyQuery: EventQuery = {
  search: '',
  team: '',
  skill: '',
  result: '',
  foul: '',
  area: '',
  bookmark: 'all',
  player: '',
  sortBy: 'videoTime',
  sortDirection: 'asc',
};

describe('eventQuery', () => {
  const events = [
    createMockEvent({
      id: 'event-a',
      no: 1,
      videoTime: 12,
      note: 'Strong opening serve',
      isBookmarked: true,
      actions: [{
        teamCode: 'THA',
        skillCode: 'SV',
        resultCode: 'Yes',
        areaCode: 'LN',
        foulCode: 'NET_TOUCH',
        playerNumber: '7',
        playerName: 'Mali',
      }],
    }),
    createMockEvent({
      id: 'event-b',
      no: 2,
      videoTime: 42,
      note: 'Transition attack',
      actions: [{
        teamCode: 'JPN',
        skillCode: 'SPK',
        resultCode: 'Out',
        areaLabel: 'Right Front',
        outZone: 'side_right',
        playerNumber: '12',
        playerName: 'Aiko',
      }],
    }),
    createMockEvent({
      id: 'event-c',
      no: 3,
      sequenceStartTime: 25,
      videoTime: undefined,
      actions: [{
        teamCode: 'THA',
        skillCode: 'REC',
        resultCode: 'Pass',
        areaCode: 'CB',
        playerName: 'Mali',
      }],
    }),
  ];

  it.each([
    [{ team: 'THA' }, ['event-a', 'event-c']],
    [{ skill: 'SPK' }, ['event-b']],
    [{ result: 'Yes' }, ['event-a']],
    [{ foul: 'NET_TOUCH' }, ['event-a']],
    [{ area: 'side_right' }, ['event-b']],
    [{ bookmark: 'bookmarked' }, ['event-a']],
    [{ player: 'mali' }, ['event-a', 'event-c']],
  ] as Array<[Partial<EventQuery>, string[]]>)('filters %o', (query, expectedIds) => {
    expect(applyEventQuery(events, { ...emptyQuery, ...query }).map(event => event.id)).toEqual(expectedIds);
  });

  it('searches event text, note, team, player, skill, result, foul, and area values', () => {
    expect(applyEventQuery(events, { ...emptyQuery, search: 'opening' }).map(event => event.id)).toEqual(['event-a']);
    expect(applyEventQuery(events, { ...emptyQuery, search: 'aiko' }).map(event => event.id)).toEqual(['event-b']);
    expect(applyEventQuery(events, { ...emptyQuery, search: 'net_touch' }).map(event => event.id)).toEqual(['event-a']);
  });

  it('uses inclusive time range boundaries and falls back to sequence start time', () => {
    expect(applyEventQuery(events, { ...emptyQuery, timeFrom: 12, timeTo: 25 }).map(event => event.id)).toEqual([
      'event-a',
      'event-c',
    ]);
    expect(getEventTimestamp(events[2])).toBe(25);
  });

  it('sorts without mutating the source list', () => {
    const sourceOrder = events.map(event => event.id);
    const result = applyEventQuery(events, { ...emptyQuery, sortBy: 'videoTime', sortDirection: 'desc' });

    expect(result.map(event => event.id)).toEqual(['event-b', 'event-c', 'event-a']);
    expect(events.map(event => event.id)).toEqual(sourceOrder);
  });

  it('derives unique options from action metadata', () => {
    expect(getEventQueryOptions(events)).toEqual({
      teams: ['JPN', 'THA'],
      skills: ['REC', 'SPK', 'SV'],
      results: ['Out', 'Pass', 'Yes'],
      fouls: ['NET_TOUCH'],
      areas: ['CB', 'LN', 'side_right'],
      players: ['#7 Mali', '#12 Aiko', 'Mali'],
    });
  });

  it('offers both the area code and detailed out-zone for map filters', () => {
    const outEvent = createMockEvent({
      id: 'out-area',
      actions: [{ areaCode: 'OUT', outZone: 'side_left_near' }],
    });
    const options = getEventQueryOptions([outEvent]);
    expect(options.areas).toContain('OUT');
    expect(options.areas).toContain('side_left_near');
  });

  it('handles 500 events and returns the exact filtered set', () => {
    const largeSet = createMockEventList(500);
    const result = applyEventQuery(largeSet, { ...emptyQuery, team: 'THA', skill: 'SV' });

    expect(result).toHaveLength(50);
    expect(result.every(event => event.actions.every(action => action.teamCode === 'THA' && action.skillCode === 'SV'))).toBe(true);
  });
});
