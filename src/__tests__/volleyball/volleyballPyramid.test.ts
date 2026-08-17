import { describe, expect, it } from 'vitest';
import type { Action, EventRow } from '../../types';
import {
  buildVolleyballPyramidSummary,
  getVolleyballDataConfidence,
} from '../../volleyball/volleyballPyramid';

function volleyballEvent(id: string, actions: Action[]): EventRow {
  return {
    id,
    no: Number(id.replace(/\D/g, '')) || 1,
    point: 1,
    sportType: 'volleyball',
    eventText: '',
    resultText: '0',
    createdAt: '2026-08-17T00:00:00.000Z',
    videoTime: 12,
    actions,
  };
}

function gradedAction(
  skillCode: string,
  resultDetailCode: string,
  startArea = 'Z1',
  targetArea = 'Z2',
  systemContext?: 'in_system' | 'out_of_system',
): Action {
  return {
    teamCode: 'THA',
    playerNumber: '7',
    skillCode,
    resultCode: resultDetailCode === 'ERROR' ? 'Out' : 'Pass',
    resultDetailCode,
    videoTime: 12,
    areaCode: startArea,
    domainPayload: {
      type: 'volleyball',
      startArea: { areaCode: startArea },
      targetArea: { areaCode: targetArea },
      systemContext,
    },
  };
}

describe('volleyball pyramid', () => {
  it('uses the approved confidence boundaries', () => {
    expect(getVolleyballDataConfidence(4, 100)).toBe('low');
    expect(getVolleyballDataConfidence(20, 49.99)).toBe('low');
    expect(getVolleyballDataConfidence(5, 50)).toBe('medium');
    expect(getVolleyballDataConfidence(20, 79.99)).toBe('medium');
    expect(getVolleyballDataConfidence(20, 80)).toBe('high');
  });

  it('summarizes 5Ws, skill grades, rally sequences, and Start-to-Target flows', () => {
    const summary = buildVolleyballPyramidSummary([
      volleyballEvent('1', [
        gradedAction('REC', 'A_PASS', 'Z5', 'Z3'),
        gradedAction('SET', 'EXCELLENT', 'Z3', 'Z4', 'in_system'),
        gradedAction('SPK', 'KILL', 'Z4', 'Z1', 'in_system'),
      ]),
    ]);

    expect(summary.data.totalActions).toBe(3);
    expect(summary.data.fiveWsCompletenessPercentage).toBe(100);
    expect(summary.data.fieldCoverage).toEqual({ who: 100, what: 100, where: 100, how: 100, when: 100 });
    expect(summary.skills.gradeSummary.coveragePercentage).toBe(100);
    expect(summary.rally.sequences[0]).toMatchObject({ pattern: 'REC → SET → SPK', count: 1 });
    expect(summary.rally.flows.find(flow => flow.skillCode === 'SET')).toMatchObject({
      startArea: 'Z3', targetArea: 'Z4', total: 1, averageGrade: 4,
    });
  });

  it('does not create coach advice from fewer than five samples', () => {
    const summary = buildVolleyballPyramidSummary([
      volleyballEvent('1', Array.from({ length: 4 }, () => gradedAction('REC', 'ERROR'))),
    ]);
    expect(summary.insights).toEqual([]);
  });

  it('flags low coverage, reception, attack efficiency, and high error rate with review filters', () => {
    const reception = [
      gradedAction('REC', 'C_PASS'), gradedAction('REC', 'C_PASS'), gradedAction('REC', 'C_PASS'),
      gradedAction('REC', 'ERROR'), gradedAction('REC', 'ERROR'),
    ];
    const attack = [
      gradedAction('SPK', 'BLOCKED'), gradedAction('SPK', 'BLOCKED'), gradedAction('SPK', 'BLOCKED'),
      gradedAction('SPK', 'ERROR'), gradedAction('SPK', 'ERROR'),
    ];
    const ungraded = Array.from({ length: 5 }, () => ({ ...gradedAction('DIG', 'PLAYABLE'), resultDetailCode: undefined }));
    const summary = buildVolleyballPyramidSummary([volleyballEvent('1', [...reception, ...attack, ...ungraded])]);

    expect(summary.insights.find(item => item.rule === 'grade_coverage_low')).toMatchObject({ threshold: 70, sampleSize: 15 });
    expect(summary.insights.find(item => item.rule === 'reception_quality_low')).toMatchObject({ threshold: 50, filters: { skill: 'REC' } });
    expect(summary.insights.find(item => item.rule === 'attack_efficiency_low')).toMatchObject({ threshold: 0, filters: { skill: 'SPK' } });
    expect(summary.insights.find(item => item.rule === 'error_rate_high' && item.filters.skill === 'REC')).toMatchObject({ threshold: 25, sampleSize: 5 });
  });

  it('finds weak/strong flows and a transparent system drop only at the approved sample sizes', () => {
    const weak = Array.from({ length: 5 }, () => gradedAction('DIG', 'DIFFICULT', 'Z6', 'Z3'));
    const strong = Array.from({ length: 5 }, () => gradedAction('SV', 'ACE', 'Z1', 'Z5'));
    const inSystem = Array.from({ length: 5 }, () => gradedAction('SET', 'EXCELLENT', 'Z3', 'Z4', 'in_system'));
    const outSystem = Array.from({ length: 5 }, () => gradedAction('SET', 'BAD_SET', 'Z3', 'Z4', 'out_of_system'));
    const summary = buildVolleyballPyramidSummary([volleyballEvent('1', [...weak, ...strong, ...inSystem, ...outSystem])]);

    expect(summary.insights.find(item => item.rule === 'weak_area')).toMatchObject({
      value: 2, threshold: 2.5, sampleSize: 5,
      filters: { skill: 'DIG', startArea: 'Z6', targetArea: 'Z3' },
    });
    expect(summary.insights.find(item => item.rule === 'strong_pattern')).toMatchObject({
      value: 4, threshold: 3.25, sampleSize: 5,
      filters: { skill: 'SV', startArea: 'Z1', targetArea: 'Z5' },
    });
    expect(summary.insights.find(item => item.rule === 'system_drop')).toMatchObject({
      value: 2, threshold: 0.75, sampleSize: 10, filters: { skill: 'SET', systemContext: 'out_of_system' },
    });
  });
});
