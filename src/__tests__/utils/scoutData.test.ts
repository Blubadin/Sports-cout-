import { describe, it, expect } from 'vitest';
import {
  createScoutId,
  getValidSportType,
  getAreaLabel,
  getFoulLabel,
  formatActionCode,
  formatExtendedActionCode,
  formatActionMeaning,
  deriveEventResultText,
  sanitizeEvents,
  createEventsExport,
  buildAnalyticsSummary,
  buildDataQualityReport,
  buildDataQualityDrilldown,
  isAttackingSkill,
  isDefensiveSkill,
  SCOUT_EXPORT_SCHEMA_VERSION,
  SCOUT_EXPORT_APP_NAME,
} from '../../utils/scoutData';
import { SPORT_TEMPLATES } from '../../sports';
import { SPORTSCOUT_APP_VERSION } from '../../appMetadata';
import {
  createMockAction,
  createMockFoulAction,
  createMockEvent,
  createMockEventList,
  createLegacyEvent,
  mockTeams,
} from '../fixtures';

// ═══════════════════════════════════════════════════════════
// createScoutId
// ═══════════════════════════════════════════════════════════
describe('createScoutId', () => {
  it('should generate a unique id with default prefix', () => {
    const id = createScoutId();
    expect(id).toMatch(/^scout-\d+-[a-z0-9]+$/);
  });

  it('should generate a unique id with custom prefix', () => {
    const id = createScoutId('event');
    expect(id).toMatch(/^event-\d+-[a-z0-9]+$/);
  });

  it('should generate different ids on successive calls', () => {
    const id1 = createScoutId();
    const id2 = createScoutId();
    expect(id1).not.toBe(id2);
  });
});

// ═══════════════════════════════════════════════════════════
// getValidSportType
// ═══════════════════════════════════════════════════════════
describe('getValidSportType', () => {
  it.each(['volleyball', 'football', 'badminton', 'basketball'] as const)(
    'should accept valid sport type: %s',
    (sport) => {
      expect(getValidSportType(sport)).toBe(sport);
    }
  );

  it('should return fallback for invalid value', () => {
    expect(getValidSportType('tennis')).toBe('volleyball');
    expect(getValidSportType(null)).toBe('volleyball');
    expect(getValidSportType(undefined)).toBe('volleyball');
    expect(getValidSportType(42)).toBe('volleyball');
  });

  it('should return custom fallback', () => {
    expect(getValidSportType('invalid', 'football')).toBe('football');
  });
});

// ═══════════════════════════════════════════════════════════
// getAreaLabel
// ═══════════════════════════════════════════════════════════
describe('getAreaLabel', () => {
  const template = SPORT_TEMPLATES['volleyball'];

  it('should return area code in English', () => {
    const action = createMockAction({ areaCode: 'LN' });
    const label = getAreaLabel(action, { sportTemplate: template, uiLanguage: 'en' });
    expect(label).toBe('LN');
  });

  it('should return Thai name when uiLanguage is th', () => {
    const action = createMockAction({ areaCode: 'LN' });
    const label = getAreaLabel(action, { sportTemplate: template, uiLanguage: 'th' });
    expect(label).toBe('ซ้ายหน้า');
  });

  it('should return OUT for Out result without area', () => {
    const action = createMockAction({ areaCode: undefined, resultCode: 'Out' });
    const label = getAreaLabel(action, { sportTemplate: template, uiLanguage: 'en' });
    expect(label).toBe('OUT');
  });

  it('should return areaLabel if provided', () => {
    const action = createMockAction({ areaCode: undefined, areaLabel: 'Custom Zone' });
    const label = getAreaLabel(action, { sportTemplate: template, uiLanguage: 'en' });
    expect(label).toBe('Custom Zone');
  });
});

// ═══════════════════════════════════════════════════════════
// getFoulLabel
// ═══════════════════════════════════════════════════════════
describe('getFoulLabel', () => {
  const template = SPORT_TEMPLATES['volleyball'];

  it('should return empty string when no foulCode', () => {
    const action = createMockAction({ foulCode: undefined });
    expect(getFoulLabel(action, { sportTemplate: template })).toBe('');
  });

  it('should return foulCode if foul not found in template', () => {
    const action = createMockAction({ foulCode: 'UNKNOWN_FOUL' });
    expect(getFoulLabel(action, { sportTemplate: template })).toBe('UNKNOWN_FOUL');
  });

  it('should return label from template when foul exists', () => {
    if (!template.fouls || template.fouls.length === 0) return;
    const foul = template.fouls[0];
    const action = createMockAction({ foulCode: foul.code });
    const label = getFoulLabel(action, { sportTemplate: template, uiLanguage: 'en' });
    expect(label).toBe(foul.label);
  });
});

// ═══════════════════════════════════════════════════════════
// formatActionCode
// ═══════════════════════════════════════════════════════════
describe('formatActionCode', () => {
  it('should format basic action fields', () => {
    const action = createMockAction({
      teamCode: 'THA',
      skillCode: 'SV',
      areaCode: 'LN',
      resultCode: 'Yes',
    });
    const result = formatActionCode(action, { sportTemplate: SPORT_TEMPLATES['volleyball'] });
    expect(result).toContain('THA');
    expect(result).toContain('SV');
    expect(result).toContain('LN');
    expect(result).toContain('Yes');
  });

  it('should include foulCode when present', () => {
    const action = createMockFoulAction({ foulCode: 'NET_TOUCH' });
    const result = formatActionCode(action);
    expect(result).toContain('NET_TOUCH');
  });
});

// ═══════════════════════════════════════════════════════════
// formatExtendedActionCode
// ═══════════════════════════════════════════════════════════
describe('formatExtendedActionCode', () => {
  it('should include player number if present', () => {
    const action = createMockAction({ playerNumber: '7', playerName: 'Somchai' });
    const result = formatExtendedActionCode(action, { sportTemplate: SPORT_TEMPLATES['volleyball'] });
    expect(result).toContain('#7');
    expect(result).toContain('Somchai');
  });

  it('should be same as formatActionCode when no extra details', () => {
    const action = createMockAction();
    const template = SPORT_TEMPLATES['volleyball'];
    const basic = formatActionCode(action, { sportTemplate: template });
    const extended = formatExtendedActionCode(action, { sportTemplate: template });
    expect(extended).toBe(basic);
  });
});

// ═══════════════════════════════════════════════════════════
// formatActionMeaning
// ═══════════════════════════════════════════════════════════
describe('formatActionMeaning', () => {
  const template = SPORT_TEMPLATES['volleyball'];

  it('should format Thai meaning correctly', () => {
    const action = createMockAction({ teamCode: 'THA', skillCode: 'SV', resultCode: 'Yes' });
    const meaning = formatActionMeaning(action, {
      sportTemplate: template,
      teams: mockTeams,
      uiLanguage: 'th',
    });
    expect(meaning).toContain('ไทย');
    expect(meaning).toContain('เสิร์ฟ');
    expect(meaning).toContain('ได้แต้ม');
  });

  it('should format English meaning correctly', () => {
    const action = createMockAction({ teamCode: 'THA', skillCode: 'SV', resultCode: 'Yes' });
    const meaning = formatActionMeaning(action, {
      sportTemplate: template,
      teams: mockTeams,
      uiLanguage: 'en',
    });
    expect(meaning).toContain('THA');
    expect(meaning).toContain('SV');
    expect(meaning).toContain('Yes');
  });
});

// ═══════════════════════════════════════════════════════════
// deriveEventResultText
// ═══════════════════════════════════════════════════════════
describe('deriveEventResultText', () => {
  it('should return +1 when last action is Yes', () => {
    expect(deriveEventResultText([createMockAction({ resultCode: 'Yes' })])).toBe('+1');
  });

  it('should return -1 when last action is Out', () => {
    expect(deriveEventResultText([createMockAction({ resultCode: 'Out' })])).toBe('-1');
  });

  it('should return -1 when last action is a foul', () => {
    expect(deriveEventResultText([createMockFoulAction()])).toBe('-1');
  });

  it('should return 0 when last action is Pass', () => {
    expect(deriveEventResultText([createMockAction({ resultCode: 'Pass' })])).toBe('0');
  });

  it('should return 0 for empty actions', () => {
    expect(deriveEventResultText([])).toBe('0');
  });

  it('should use last action when multiple actions', () => {
    const actions = [
      createMockAction({ resultCode: 'Pass' }),
      createMockAction({ resultCode: 'Yes' }),
    ];
    expect(deriveEventResultText(actions)).toBe('+1');
  });
});

// ═══════════════════════════════════════════════════════════
// sanitizeEvents
// ═══════════════════════════════════════════════════════════
describe('sanitizeEvents', () => {
  it('should return empty array for non-array input', () => {
    expect(sanitizeEvents(null as any)).toEqual([]);
    expect(sanitizeEvents(undefined as any)).toEqual([]);
    expect(sanitizeEvents('hello' as any)).toEqual([]);
  });

  it('should sanitize and renumber events', () => {
    const events = [
      { id: 'e1', eventText: 'test1', resultText: '+1' },
      { id: 'e2', eventText: 'test2', resultText: '-1' },
    ];
    const result = sanitizeEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].no).toBe(1);
    expect(result[1].no).toBe(2);
  });

  it('should assign valid sportType', () => {
    const events = [{ id: 'e1', sportType: 'invalid_sport' }];
    const result = sanitizeEvents(events);
    expect(result[0].sportType).toBe('volleyball'); // default fallback
  });

  it('should use provided fallback sport type', () => {
    const events = [{ id: 'e1' }];
    const result = sanitizeEvents(events, 'basketball');
    expect(result[0].sportType).toBe('basketball');
  });

  it('should deduplicate event ids', () => {
    const events = [
      { id: 'same-id', eventText: 'a' },
      { id: 'same-id', eventText: 'b' },
    ];
    const result = sanitizeEvents(events);
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('should handle numeric-only ids by regenerating', () => {
    const events = [{ id: '12345' }];
    const result = sanitizeEvents(events);
    expect(result[0].id).not.toBe('12345');
  });

  it('should parse legacy event text into actions', () => {
    const events = [{ id: 'legacy1', eventText: 'THA / SV / LN / Yes' }];
    const result = sanitizeEvents(events);
    expect(result[0].actions.length).toBeGreaterThan(0);
    expect(result[0].actions[0].teamCode).toBe('THA');
    expect(result[0].actions[0].skillCode).toBe('SV');
  });
});

// ═══════════════════════════════════════════════════════════
// createEventsExport
// ═══════════════════════════════════════════════════════════
describe('createEventsExport', () => {
  it('should create export envelope with correct metadata', () => {
    const events = createMockEventList(3);
    const envelope = createEventsExport(events);
    expect(envelope.schemaVersion).toBe(SCOUT_EXPORT_SCHEMA_VERSION);
    expect(envelope.app).toBe(SCOUT_EXPORT_APP_NAME);
    expect(envelope.appVersion).toBe(SPORTSCOUT_APP_VERSION);
    expect(envelope.type).toBe('events');
    expect(envelope.exportedAt).toBeTruthy();
    expect(envelope.events).toHaveLength(3);
  });
});

describe('createProjectsExport', () => {
  it('includes the deployed app version without changing schema 1.1', async () => {
    const { createProjectsExport } = await import('../../utils/scoutData');
    const envelope = createProjectsExport([]);

    expect(envelope.schemaVersion).toBe('1.1');
    expect(envelope.appVersion).toBe(SPORTSCOUT_APP_VERSION);
  });
});

// ═══════════════════════════════════════════════════════════
// buildAnalyticsSummary
// ═══════════════════════════════════════════════════════════
describe('buildAnalyticsSummary', () => {
  it('should return zero counts for empty events', () => {
    const summary = buildAnalyticsSummary([]);
    expect(summary.totalEvents).toBe(0);
    expect(summary.totalActions).toBe(0);
  });

  it('should count events and actions correctly', () => {
    const events = createMockEventList(5);
    const summary = buildAnalyticsSummary(events);
    expect(summary.totalEvents).toBe(5);
    expect(summary.totalActions).toBe(5); // 1 action per event
  });

  it('should count team appearances', () => {
    const events = createMockEventList(4);
    const summary = buildAnalyticsSummary(events);
    expect(summary.teamCounts['THA']).toBeGreaterThan(0);
    expect(summary.teamCounts['JPN']).toBeGreaterThan(0);
  });

  it('should filter by sport type', () => {
    const events = [
      createMockEvent({ sportType: 'volleyball' }),
      createMockEvent({ sportType: 'football' }),
    ];
    const summary = buildAnalyticsSummary(events, { sportType: 'volleyball' });
    expect(summary.totalEvents).toBe(1);
  });

  it('should include all sports when sportType is ALL', () => {
    const events = [
      createMockEvent({ sportType: 'volleyball' }),
      createMockEvent({ sportType: 'football' }),
    ];
    const summary = buildAnalyticsSummary(events, { sportType: 'ALL' });
    expect(summary.totalEvents).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// buildDataQualityReport
// ═══════════════════════════════════════════════════════════
describe('buildDataQualityReport', () => {
  it('should return clean report for valid events', () => {
    const events = createMockEventList(3);
    const report = buildDataQualityReport(events, mockTeams);
    expect(report.totalEvents).toBe(3);
    expect(report.errors).toBe(0);
  });

  it('should detect missing event id', () => {
    const events = [createMockEvent({ id: '' })];
    const report = buildDataQualityReport(events);
    expect(report.issues.some(i => i.code === 'missing_event_id')).toBe(true);
  });

  it('should detect duplicate event ids', () => {
    const events = [
      createMockEvent({ id: 'dup-id' }),
      createMockEvent({ id: 'dup-id' }),
    ];
    const report = buildDataQualityReport(events);
    expect(report.duplicateEventIds).toBeGreaterThan(0);
  });

  it('should detect events with no actions', () => {
    const events = [createMockEvent({ actions: [], eventText: '' })];
    const report = buildDataQualityReport(events);
    expect(report.issues.some(i => i.code === 'missing_actions')).toBe(true);
  });

  it('should detect legacy events', () => {
    const events = [createLegacyEvent()];
    const report = buildDataQualityReport(events);
    expect(report.legacyEvents).toBe(1);
  });

  it('should detect missing team', () => {
    const events = [createMockEvent({
      actions: [createMockAction({ teamCode: undefined })],
    })];
    const report = buildDataQualityReport(events, mockTeams);
    expect(report.issues.some(i => i.code === 'missing_team')).toBe(true);
  });

  it('should warn about unknown team', () => {
    const events = [createMockEvent({
      actions: [createMockAction({ teamCode: 'UNKNOWN_TEAM' })],
    })];
    const report = buildDataQualityReport(events, mockTeams);
    expect(report.issues.some(i => i.code === 'invalid_team')).toBe(true);
  });

  it('groups data quality issues for coach drill-down without losing event references', () => {
    const events = [
      createMockEvent({ id: 'duplicate', actions: [] as any, eventText: '' }),
      createMockEvent({ id: 'duplicate', actions: [] as any, eventText: '' }),
    ];
    const drilldown = buildDataQualityDrilldown(buildDataQualityReport(events));

    expect(drilldown[0].severity).toBe('error');
    expect(drilldown.find(group => group.code === 'missing_actions')?.count).toBe(2);
    expect(drilldown.find(group => group.code === 'duplicate_event_id')?.eventNos).toEqual([1]);
  });

  it('adds unified analytics metadata to JSON exports without changing schema 1.1', () => {
    const envelope = createEventsExport(createMockEventList(4));
    expect(envelope.schemaVersion).toBe('1.1');
    expect(envelope.analytics?.totalEvents).toBe(4);
    expect(envelope.analytics?.totalActions).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════
// isAttackingSkill / isDefensiveSkill
// ═══════════════════════════════════════════════════════════
describe('isAttackingSkill', () => {
  it('should identify volleyball attacking skills', () => {
    expect(isAttackingSkill('volleyball', 'SV')).toBe(true);
    expect(isAttackingSkill('volleyball', 'SPK')).toBe(true);
    expect(isAttackingSkill('volleyball', 'REC')).toBe(false);
    expect(isAttackingSkill('volleyball', 'DIG')).toBe(false);
  });

  it('should identify football attacking skills', () => {
    expect(isAttackingSkill('football', 'SHT')).toBe(true);
    expect(isAttackingSkill('football', 'TKL')).toBe(false);
  });

  it('should return false for empty skill code', () => {
    expect(isAttackingSkill('volleyball', '')).toBe(false);
  });
});

describe('isDefensiveSkill', () => {
  it('should identify volleyball defensive skills', () => {
    expect(isDefensiveSkill('volleyball', 'REC')).toBe(true);
    expect(isDefensiveSkill('volleyball', 'DIG')).toBe(true);
    expect(isDefensiveSkill('volleyball', 'BLK')).toBe(true);
    expect(isDefensiveSkill('volleyball', 'SV')).toBe(false);
  });

  it('should identify basketball defensive skills', () => {
    expect(isDefensiveSkill('basketball', 'REB')).toBe(true);
    expect(isDefensiveSkill('basketball', 'STL')).toBe(true);
    expect(isDefensiveSkill('basketball', 'SHT')).toBe(false);
  });

  it('should return false for empty skill code', () => {
    expect(isDefensiveSkill('volleyball', '')).toBe(false);
  });
});
