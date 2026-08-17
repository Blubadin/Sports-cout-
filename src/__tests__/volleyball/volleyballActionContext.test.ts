import { describe, expect, it } from 'vitest';
import type { Action } from '../../types';
import {
  captureVolleyballPathArea,
  getVolleyballPrimaryArea,
  getVolleyballSkillCapabilities,
  resetVolleyballActionForSkill,
} from '../../volleyball/volleyballActionContext';

describe('volleyball action context', () => {
  it('defines path and system capabilities for each volleyball skill', () => {
    expect(getVolleyballSkillCapabilities('SV')).toEqual({ phase: 'serve', supportsTarget: true, supportsSystem: false });
    expect(getVolleyballSkillCapabilities('SET')).toEqual({ phase: 'set', supportsTarget: true, supportsSystem: true });
    expect(getVolleyballSkillCapabilities('SPK')).toEqual({ phase: 'attack', supportsTarget: true, supportsSystem: true });
    expect(getVolleyballSkillCapabilities('BLK')).toEqual({ phase: 'block', supportsTarget: false, supportsSystem: false });
    expect(getVolleyballSkillCapabilities('UNKNOWN')).toBeUndefined();
  });

  it('uses the legacy action area when a start area has not been captured', () => {
    const action: Action = { areaCode: 'LN', courtSide: 'teamA', gridX: 2, gridY: 1 };
    expect(getVolleyballPrimaryArea(action)).toEqual({ areaCode: 'LN', courtSide: 'teamA', gridX: 2, gridY: 1 });

    const detailed: Action = {
      ...action,
      domainPayload: { type: 'volleyball', startArea: { areaCode: 'RB', courtSide: 'teamB' } },
    };
    expect(getVolleyballPrimaryArea(detailed)).toEqual({ areaCode: 'RB', courtSide: 'teamB' });
  });

  it('clears incompatible detail data when the skill changes and preserves identity', () => {
    const action: Action = {
      teamCode: 'THA',
      playerNumber: '7',
      skillCode: 'SET',
      resultDetailCode: 'EXCELLENT',
      descriptors: { tempo: 'QUICK' },
      domainPayload: {
        type: 'volleyball',
        rallyPhase: 'set',
        startArea: { areaCode: 'CN' },
        targetArea: { areaCode: 'LN' },
        systemContext: 'in_system',
      },
    };

    expect(resetVolleyballActionForSkill(action, 'BLK')).toEqual({
      teamCode: 'THA',
      playerNumber: '7',
      skillCode: 'BLK',
      descriptors: {},
      domainPayload: { type: 'volleyball', rallyPhase: 'block' },
    });
  });

  it('preserves detail data when the selected skill does not change', () => {
    const action: Action = {
      skillCode: 'SPK',
      resultDetailCode: 'KILL',
      domainPayload: { type: 'volleyball', rallyPhase: 'attack', targetArea: { areaCode: 'RB' } },
    };
    expect(resetVolleyballActionForSkill(action, 'SPK')).toEqual(action);
  });

  it('captures a start area into both the legacy projection and volleyball payload', () => {
    const result = captureVolleyballPathArea(
      { skillCode: 'SV', domainPayload: { type: 'volleyball', rallyPhase: 'serve' } },
      'start',
      { areaCode: 'LB', courtSide: 'teamA', gridX: 1, gridY: 2 },
    );
    expect(result.nextStage).toBe('target');
    expect(result.action).toMatchObject({
      areaCode: 'LB', courtSide: 'teamA', gridX: 1, gridY: 2,
      domainPayload: { startArea: { areaCode: 'LB', courtSide: 'teamA', gridX: 1, gridY: 2 } },
    });
  });

  it('captures a target without replacing the legacy start area', () => {
    const result = captureVolleyballPathArea(
      {
        skillCode: 'SPK', areaCode: 'LN', courtSide: 'teamA',
        domainPayload: { type: 'volleyball', rallyPhase: 'attack', startArea: { areaCode: 'LN', courtSide: 'teamA' } },
      },
      'target',
      { areaCode: 'RB', courtSide: 'teamB' },
    );
    expect(result.nextStage).toBe('complete');
    expect(result.action.areaCode).toBe('LN');
    expect(result.action.domainPayload).toMatchObject({ targetArea: { areaCode: 'RB', courtSide: 'teamB' } });
  });

  it('completes immediately after the start area for block', () => {
    const result = captureVolleyballPathArea(
      { skillCode: 'BLK' },
      'start',
      { areaCode: 'CN', courtSide: 'teamA' },
    );
    expect(result.nextStage).toBe('complete');
  });
});
