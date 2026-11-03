import { describe, it, expect } from 'vitest';
import {
  getSportReportMeta,
  computeSportSpatialAnalysis,
  computeSportSkillBreakdown,
  compute4LevelSkillMetrics,
} from '../../components/report/reportSportsAdapter';
import type { EventRow } from '../../types';

function createMockEvent(overrides: Partial<EventRow>): EventRow {
  return {
    id: 'ev-adapter-test',
    no: 1,
    point: 1,
    resultText: '0',
    eventText: 'mock event',
    createdAt: new Date().toISOString(),
    actions: [],
    ...overrides,
  };
}

describe('reportSportsAdapter (Multi-Sport Coach Report Adapter)', () => {
  describe('getSportReportMeta', () => {
    it('returns appropriate metadata for all supported sports', () => {
      const vbMeta = getSportReportMeta('volleyball');
      expect(vbMeta.sportType).toBe('volleyball');
      expect(vbMeta.icon).toBe('🏐');
      expect(vbMeta.stageLabel(2).th).toContain('เซต 2');

      const bmMeta = getSportReportMeta('badminton');
      expect(bmMeta.sportType).toBe('badminton');
      expect(bmMeta.icon).toBe('🏸');
      expect(bmMeta.stageLabel(1).th).toContain('เกม 1');

      const fbMeta = getSportReportMeta('football');
      expect(fbMeta.sportType).toBe('football');
      expect(fbMeta.icon).toBe('⚽');
      expect(fbMeta.scoreLabelTh).toContain('ประตูรวม');
      expect(fbMeta.stageLabel(2).th).toContain('ครึ่งที่ 2');

      const bbMeta = getSportReportMeta('basketball');
      expect(bbMeta.sportType).toBe('basketball');
      expect(bbMeta.icon).toBe('🏀');
      expect(bbMeta.stageLabel(4).th).toContain('ควอเตอร์ 4');
    });

    it('defaults gracefully to volleyball when sport is unknown or undefined', () => {
      const defaultMeta = getSportReportMeta(undefined as unknown as import('../../types').SportType);
      expect(defaultMeta.sportType).toBe('volleyball');
      expect(defaultMeta.icon).toBe('🏐');
    });
  });

  describe('computeSportSpatialAnalysis', () => {
    it('accurately maps volleyball 6/9 zones and diagnoses attack/error hotspots', () => {
      const events: EventRow[] = [
        createMockEvent({
          id: 'vb-1',
          no: 1,
          point: 1,
          resultText: '+1',
          actions: [{ teamCode: 'THA', skillCode: 'SPK', areaCode: '4' }],
        }),
        createMockEvent({
          id: 'vb-2',
          no: 2,
          point: 2,
          resultText: '-1',
          actions: [{ teamCode: 'THA', skillCode: 'REC', areaCode: '5' }],
        }),
      ];

      const analysis = computeSportSpatialAnalysis('volleyball', events);
      expect(analysis.zones.length).toBe(6);
      expect(analysis.hottestAttackZone?.id).toBe('4');
      expect(analysis.highestErrorZone?.id).toBe('5');
      expect(analysis.offensiveDiagnosisTh).toContain('โซน 4');
      expect(analysis.defensiveDiagnosisTh).toContain('โซน 5');
      expect(analysis.tacticalRecommendationsTh.length).toBeGreaterThan(0);
    });

    it('accurately maps badminton court front/mid/rear zones', () => {
      const events: EventRow[] = [
        createMockEvent({
          id: 'bm-1',
          no: 1,
          point: 1,
          resultText: '+1',
          actions: [{ teamCode: 'P1', skillCode: 'SMH', areaCode: 'BL' }],
        }),
        createMockEvent({
          id: 'bm-2',
          no: 2,
          point: 2,
          resultText: '-1',
          actions: [{ teamCode: 'P1', skillCode: 'NET', areaCode: 'FL' }],
        }),
      ];

      const analysis = computeSportSpatialAnalysis('badminton', events);
      expect(analysis.zones.length).toBe(6);
      expect(analysis.hottestAttackZone?.id).toBe('BL');
      expect(analysis.highestErrorZone?.id).toBe('FL');
      expect(analysis.offensiveDiagnosisTh).toContain('หลังซ้าย');
      expect(analysis.defensiveDiagnosisTh).toContain('หน้าซ้าย');
      expect(analysis.tacticalRecommendationsTh.some((r) => r.includes('หยอด'))).toBe(true);
    });

    it('accurately maps football pitch tactical thirds and box', () => {
      const events: EventRow[] = [
        createMockEvent({
          id: 'fb-1',
          no: 1,
          point: 1,
          resultText: '+1',
          actions: [{ teamCode: 'LIV', skillCode: 'SHT', areaCode: 'BOX' }],
        }),
        createMockEvent({
          id: 'fb-2',
          no: 2,
          point: 2,
          resultText: '-1',
          actions: [{ teamCode: 'LIV', skillCode: 'PAS', areaCode: 'MID_L' }],
        }),
      ];

      const analysis = computeSportSpatialAnalysis('football', events);
      expect(analysis.zones.length).toBe(9);
      expect(analysis.hottestAttackZone?.id).toBe('ATT_C');
      expect(analysis.highestErrorZone?.id).toBe('MID_L');
      expect(analysis.offensiveDiagnosisTh).toContain('รุกกลาง/เขตโทษ');
      expect(analysis.defensiveDiagnosisTh).toContain('กลางซ้าย');
    });

    it('accurately maps basketball shot zones (paint, perimeter, corners)', () => {
      const events: EventRow[] = [
        createMockEvent({
          id: 'bb-1',
          no: 1,
          point: 1,
          resultText: '+1',
          actions: [{ teamCode: 'LAL', skillCode: 'SHT', areaCode: 'PAINT' }],
        }),
        createMockEvent({
          id: 'bb-2',
          no: 2,
          point: 2,
          resultText: '-1',
          actions: [{ teamCode: 'LAL', skillCode: 'SHT', areaCode: 'LEFT_CORNER' }],
        }),
      ];

      const analysis = computeSportSpatialAnalysis('basketball', events);
      expect(analysis.zones.length).toBe(7);
      expect(analysis.hottestAttackZone?.id).toBe('PAINT');
      expect(analysis.highestErrorZone?.id).toBe('LEFT_CORNER');
      expect(analysis.offensiveDiagnosisTh).toContain('ใต้แป้น');
    });

    it('gracefully handles empty events without crashing or returning NaN', () => {
      const analysis = computeSportSpatialAnalysis('badminton', []);
      expect(analysis.zones.length).toBe(6);
      expect(analysis.hottestAttackZone).toBeNull();
      expect(analysis.highestErrorZone).toBeNull();
      expect(analysis.offensiveDiagnosisTh).toBeDefined();
      expect(analysis.defensiveDiagnosisTh).toBeDefined();
    });
  });

  describe('computeSportSkillBreakdown', () => {
    it('aggregates skill actions with success and error metrics', () => {
      const events: EventRow[] = [
        createMockEvent({
          id: '1',
          no: 1,
          point: 1,
          resultText: '+1',
          actions: [{ skillCode: 'SMH', resultCode: 'Yes' }],
        }),
        createMockEvent({
          id: '2',
          no: 2,
          point: 2,
          resultText: '-1',
          actions: [{ skillCode: 'SMH', resultCode: 'Out' }],
        }),
        createMockEvent({
          id: '3',
          no: 3,
          point: 3,
          resultText: '0',
          actions: [{ skillCode: 'CLR', resultCode: 'Pass' }],
        }),
      ];

      const breakdown = computeSportSkillBreakdown('badminton', events);
      const smh = breakdown.find((b) => b.skillCode === 'SMH');
      expect(smh).toBeDefined();
      expect(smh?.total).toBe(2);
      expect(smh?.success).toBe(1);
      expect(smh?.error).toBe(1);

      const clr = breakdown.find((b) => b.skillCode === 'CLR');
      expect(clr).toBeDefined();
      expect(clr?.total).toBe(1);
      expect(clr?.inPlay).toBe(1);
    });
  });

  describe('compute4LevelSkillMetrics', () => {
    it('computes 4-level metrics and sport-specific descriptions', () => {
      const events: EventRow[] = [
        createMockEvent({ id: '1', no: 1, point: 1, resultText: '+1' }),
        createMockEvent({ id: '2', no: 2, point: 2, resultText: '-1' }),
        createMockEvent({ id: '3', no: 3, point: 3, resultText: '0', actions: [{ resultDetailCode: 'A-Pass' }] }),
        createMockEvent({ id: '4', no: 4, point: 4, resultText: '0' }),
      ];

      const metrics = compute4LevelSkillMetrics('volleyball', events);
      expect(metrics.total).toBe(4);
      expect(metrics.level4.count).toBe(1);
      expect(metrics.level4.pct).toBe('25.0');
      expect(metrics.level3.count).toBe(1);
      expect(metrics.level3.pct).toBe('25.0');
      expect(metrics.level2.count).toBe(1);
      expect(metrics.level2.pct).toBe('25.0');
      expect(metrics.level1.count).toBe(1);
      expect(metrics.level1.pct).toBe('25.0');

      const footballMetrics = compute4LevelSkillMetrics('football', events);
      expect(footballMetrics.level4.descTh).toContain('Goal');
    });
  });
});
