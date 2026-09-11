import { describe, expect, it } from 'vitest';
import {
  badmintonRuleEngine,
  basketballRuleEngine,
  footballRuleEngine,
  getSportRuleEngine,
  resolveSportAction,
  resolveSportEvent,
  volleyballRuleEngine,
} from '../../sports/rules/registry';
import type { Action } from '../../types';

describe('Sport Rule Engine Golden Tests', () => {
  const contextA = {
    sportType: 'badminton',
    teamCodes: ['Team A', 'Team B'],
    activeTeamCode: 'Team A',
  };

  describe('Badminton Rules', () => {
    it('Badminton SMH Yes → Team A +1', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'SMH',
        resultCode: 'Yes',
      };
      const res = badmintonRuleEngine.resolveAction(action, contextA);
      expect(res.scoreDelta).toBe(1);
      expect(res.scoringTeamCode).toBe('Team A');
      expect(res.outcomeStatus).toBe('success');
      expect(res.terminatesSequence).toBe(true);

      const eventRes = badmintonRuleEngine.resolveEvent([action], contextA);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(1);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Badminton SMH Out → Team B +1', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'SMH',
        resultCode: 'Out',
      };
      const res = badmintonRuleEngine.resolveAction(action, contextA);
      expect(res.scoreDelta).toBe(-1);
      expect(res.scoringTeamCode).toBe('Team B');
      expect(res.outcomeStatus).toBe('error');
      expect(res.terminatesSequence).toBe(true);

      const eventRes = badmintonRuleEngine.resolveEvent([action], contextA);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(1);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(0);
    });
  });

  describe('Volleyball Rules', () => {
    const vbContext = {
      sportType: 'volleyball',
      teamCodes: ['Team A', 'Team B'],
      activeTeamCode: 'Team A',
    };

    it('Volleyball REC Yes → score 0', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'REC',
        resultCode: 'Yes',
      };
      const res = volleyballRuleEngine.resolveAction(action, vbContext);
      expect(res.scoreDelta).toBe(0);
      expect(res.terminatesSequence).toBe(false);

      const eventRes = volleyballRuleEngine.resolveEvent([action], vbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(0);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Volleyball SPK terminal Yes → +1', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'SPK',
        resultCode: 'Yes',
      };
      const res = volleyballRuleEngine.resolveAction(action, vbContext);
      expect(res.scoreDelta).toBe(1);
      expect(res.scoringTeamCode).toBe('Team A');
      expect(res.terminatesSequence).toBe(true);

      const eventRes = volleyballRuleEngine.resolveEvent([action], vbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(1);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });
  });

  describe('Football Rules', () => {
    const fbContext = {
      sportType: 'football',
      teamCodes: ['Team A', 'Team B'],
      activeTeamCode: 'Team A',
    };

    it('Football PAS Yes → score 0', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'PAS',
        resultCode: 'Yes',
      };
      const res = footballRuleEngine.resolveAction(action, fbContext);
      expect(res.scoreDelta).toBe(0);
      expect(res.terminatesSequence).toBe(false);

      const eventRes = footballRuleEngine.resolveEvent([action], fbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(0);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Football SHT GOAL → +1', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'SHT',
        resultCode: 'Yes',
        descriptors: { shot_res: 'GOAL' },
      };
      const res = footballRuleEngine.resolveAction(action, fbContext);
      expect(res.scoreDelta).toBe(1);
      expect(res.scoringTeamCode).toBe('Team A');
      expect(res.terminatesSequence).toBe(true);

      const eventRes = footballRuleEngine.resolveEvent([action], fbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(1);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Football foul → 0', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'TKL',
        resultCode: 'Out',
        foulCode: 'FOUL',
      };
      const res = footballRuleEngine.resolveAction(action, fbContext);
      expect(res.scoreDelta).toBe(0);

      const eventRes = footballRuleEngine.resolveEvent([action], fbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(0);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });
  });

  describe('Basketball Rules', () => {
    const bbContext = {
      sportType: 'basketball',
      teamCodes: ['Team A', 'Team B'],
      activeTeamCode: 'Team A',
    };

    it('Basketball 3PT made → +3', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'SHT',
        resultCode: 'Yes',
        descriptors: { shot_type: '3PT' },
      };
      const res = basketballRuleEngine.resolveAction(action, bbContext);
      expect(res.scoreDelta).toBe(3);
      expect(res.scoringTeamCode).toBe('Team A');

      const eventRes = basketballRuleEngine.resolveEvent([action], bbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(3);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Basketball 2PT made → +2', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'SHT',
        resultCode: 'Yes',
        descriptors: { shot_type: '2PT' },
      };
      const res = basketballRuleEngine.resolveAction(action, bbContext);
      expect(res.scoreDelta).toBe(2);
      expect(res.scoringTeamCode).toBe('Team A');

      const eventRes = basketballRuleEngine.resolveEvent([action], bbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(2);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Basketball FT made → +1', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'SHT',
        resultCode: 'Yes',
        descriptors: { shot_type: 'FT' },
      };
      const res = basketballRuleEngine.resolveAction(action, bbContext);
      expect(res.scoreDelta).toBe(1);
      expect(res.scoringTeamCode).toBe('Team A');

      const eventRes = basketballRuleEngine.resolveEvent([action], bbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(1);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Basketball missed 3PT → 0', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'SHT',
        resultCode: 'Out',
        descriptors: { shot_type: '3PT' },
      };
      const res = basketballRuleEngine.resolveAction(action, bbContext);
      expect(res.scoreDelta).toBe(0);

      const eventRes = basketballRuleEngine.resolveEvent([action], bbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(0);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Basketball turnover → 0', () => {
      const action: Action = {
        teamCode: 'Team A',
        skillCode: 'TO',
        resultCode: 'Out',
      };
      const res = basketballRuleEngine.resolveAction(action, bbContext);
      expect(res.scoreDelta).toBe(0);

      const eventRes = basketballRuleEngine.resolveEvent([action], bbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(0);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });

    it('Basketball foul → 0', () => {
      const action: Action = {
        teamCode: 'Team A',
        foulCode: 'PERSONAL',
        resultCode: 'Out',
      };
      const res = basketballRuleEngine.resolveAction(action, bbContext);
      expect(res.scoreDelta).toBe(0);

      const eventRes = basketballRuleEngine.resolveEvent([action], bbContext);
      expect(eventRes.teamScoreDeltas['Team A']).toBe(0);
      expect(eventRes.teamScoreDeltas['Team B']).toBe(0);
    });
  });

  describe('Rule Registry Lookup', () => {
    it('returns appropriate engine for each sport', () => {
      expect(getSportRuleEngine('badminton')).toBe(badmintonRuleEngine);
      expect(getSportRuleEngine('volleyball')).toBe(volleyballRuleEngine);
      expect(getSportRuleEngine('football')).toBe(footballRuleEngine);
      expect(getSportRuleEngine('basketball')).toBe(basketballRuleEngine);
      expect(getSportRuleEngine(undefined)).toBe(volleyballRuleEngine);
    });
  });
});
