import type { Action, EventRow, Team, SportType } from '../types';

// ─── Teams ───────────────────────────────────────────────
export const mockTeamA: Team = {
  id: 't1',
  code: 'THA',
  name: 'Thailand',
  thaiName: 'ไทย',
  teamType: 'country',
  icon: '🇹🇭',
};

export const mockTeamB: Team = {
  id: 't2',
  code: 'JPN',
  name: 'Japan',
  thaiName: 'ญี่ปุ่น',
  teamType: 'country',
  icon: '🇯🇵',
};

export const mockTeams: Team[] = [mockTeamA, mockTeamB];

// ─── Actions ─────────────────────────────────────────────
export function createMockAction(overrides: Partial<Action> = {}): Action {
  return {
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    teamCode: 'THA',
    skillCode: 'SV',
    areaCode: 'LN',
    resultCode: 'Yes',
    ...overrides,
  };
}

export function createMockFoulAction(overrides: Partial<Action> = {}): Action {
  return {
    id: `action-foul-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    teamCode: 'JPN',
    foulCode: 'NET_TOUCH',
    foulRole: 'committed',
    foulSeverity: 'normal',
    ...overrides,
  };
}

// ─── Events ──────────────────────────────────────────────
export function createMockEvent(overrides: Partial<EventRow> = {}): EventRow {
  const actions = overrides.actions ?? [createMockAction()];
  return {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    no: 1,
    point: 1,
    sportType: 'volleyball' as SportType,
    actions,
    eventText: 'THA / SV / LN / Yes',
    extendedEventText: 'THA / SV / LN / Yes',
    thaiMeaningText: 'ไทย / เสิร์ฟ / ซ้ายหน้า / ได้แต้ม',
    resultText: '+1',
    createdAt: new Date().toISOString(),
    videoTime: 12.5,
    ...overrides,
  };
}

export function createMockEventList(count: number = 5): EventRow[] {
  return Array.from({ length: count }, (_, i) => {
    const resultOptions: Array<{ resultCode: string; resultText: '+1' | '-1' | '0' }> = [
      { resultCode: 'Yes', resultText: '+1' },
      { resultCode: 'Out', resultText: '-1' },
      { resultCode: 'Pass', resultText: '0' },
    ];
    const result = resultOptions[i % 3];
    const skills = ['SV', 'REC', 'SPK', 'SET', 'BLK'];
    const areas = ['LN', 'CN', 'RN', 'LB', 'CB'];
    const team = i % 2 === 0 ? 'THA' : 'JPN';

    return createMockEvent({
      id: `event-mock-${i + 1}`,
      no: i + 1,
      point: i + 1,
      resultText: result.resultText,
      videoTime: i * 10.5,
      actions: [
        createMockAction({
          id: `action-mock-${i + 1}`,
          teamCode: team,
          skillCode: skills[i % skills.length],
          areaCode: areas[i % areas.length],
          resultCode: result.resultCode,
        }),
      ],
    });
  });
}

// ─── Legacy event (no actions array, just eventText) ─────
export function createLegacyEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: `legacy-${Date.now()}`,
    no: 1,
    point: 1,
    sportType: 'volleyball' as SportType,
    actions: [],
    eventText: 'THA / SV / LN / Yes',
    resultText: '+1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
