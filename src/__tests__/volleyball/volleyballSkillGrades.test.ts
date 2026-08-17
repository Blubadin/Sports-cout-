import { describe, expect, it } from 'vitest';
import {
  buildVolleyballGradeSummary,
  getVolleyballGradeOptions,
  resolveVolleyballGrade,
} from '../../volleyball/volleyballSkillGrades';

describe('volleyball skill grades', () => {
  it('provides four ordered grades and canonical results for every supported skill', () => {
    expect(getVolleyballGradeOptions('SV').map(option => [option.code, option.grade, option.resultCode])).toEqual([
      ['ACE', 4, 'Yes'], ['PRESSURE', 3, 'Pass'], ['IN_PLAY', 2, 'Pass'], ['ERROR', 1, 'Out'],
    ]);
    expect(getVolleyballGradeOptions('REC').map(option => option.code)).toEqual(['A_PASS', 'B_PASS', 'C_PASS', 'ERROR']);
    expect(getVolleyballGradeOptions('SET').map(option => option.code)).toEqual(['EXCELLENT', 'PLAYABLE', 'BAD_SET', 'ERROR']);
    expect(getVolleyballGradeOptions('SPK').map(option => option.code)).toEqual(['KILL', 'IN_PLAY', 'BLOCKED', 'ERROR']);
    expect(getVolleyballGradeOptions('BLK').map(option => option.code)).toEqual(['KILL_BLOCK', 'TOUCH', 'OPEN_GAP', 'ERROR']);
    expect(getVolleyballGradeOptions('DIG').map(option => option.code)).toEqual(['PERFECT', 'PLAYABLE', 'DIFFICULT', 'ERROR']);
    expect(getVolleyballGradeOptions('UND')).toEqual(getVolleyballGradeOptions('DIG'));
  });

  it('rejects a detail code that does not belong to the selected skill', () => {
    expect(resolveVolleyballGrade('SV', 'ACE')?.resultCode).toBe('Yes');
    expect(resolveVolleyballGrade('REC', 'ACE')).toBeUndefined();
    expect(resolveVolleyballGrade(undefined, 'ACE')).toBeUndefined();
  });

  it('summarizes coverage, grade distribution, reception quality, and attack efficiency', () => {
    const summary = buildVolleyballGradeSummary([
      { id: '1', no: 1, point: 1, sportType: 'volleyball', eventText: '', resultText: '0', createdAt: '', actions: [
        { skillCode: 'REC', resultCode: 'Pass', resultDetailCode: 'A_PASS' },
        { skillCode: 'SPK', resultCode: 'Yes', resultDetailCode: 'KILL' },
      ] },
      { id: '2', no: 2, point: 2, sportType: 'volleyball', eventText: '', resultText: '-1', createdAt: '', actions: [
        { skillCode: 'REC', resultCode: 'Out', resultDetailCode: 'ERROR' },
        { skillCode: 'SPK', resultCode: 'Out', resultDetailCode: 'BLOCKED' },
        { skillCode: 'DIG', resultCode: 'Pass' },
      ] },
    ]);

    expect(summary.eligibleActions).toBe(5);
    expect(summary.gradedActions).toBe(4);
    expect(summary.coveragePercentage).toBe(80);
    expect(summary.gradeCounts).toEqual({ 1: 1, 2: 1, 3: 0, 4: 2 });
    expect(summary.bySkill.REC.averageGrade).toBe(2.5);
    expect(summary.receptionQualityPercentage).toBe(50);
    expect(summary.attackEfficiencyPercentage).toBe(0);
  });
});
