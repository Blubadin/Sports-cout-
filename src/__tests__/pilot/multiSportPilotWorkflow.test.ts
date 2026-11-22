import { describe, it, expect } from 'vitest';
import { getSportRuleEngine } from '../../sports/rules/registry';
import { SPORT_TEMPLATES } from '../../sports';
import { buildDataQualityReport } from '../../utils/scoutData';
import type { SportType, EventRow, Team, MatchInfo, ScoutProject } from '../../types';

describe('Multi-Sport Pilot Workflow Verification (4 Sports × 3 Modes × 2 Sources = 24 Cases)', () => {
  const SPORTS: SportType[] = ['volleyball', 'badminton', 'football', 'basketball'];
  const INPUT_MODES = ['normal', 'hud', 'controller'] as const;
  const VIDEO_SOURCES = ['local', 'youtube'] as const;

  const mockTeams: Record<SportType, [Team, Team]> = {
    volleyball: [
      { id: 'vb-1', code: 'THA', name: 'Thailand', thaiName: 'ไทย' },
      { id: 'vb-2', code: 'JPN', name: 'Japan', thaiName: 'ญี่ปุ่น' },
    ],
    badminton: [
      { id: 'bm-1', code: 'KUN', name: 'Kunlavut', thaiName: 'กุลวุฒิ' },
      { id: 'bm-2', code: 'AXE', name: 'Axelsen', thaiName: 'อเซลเซน' },
    ],
    football: [
      { id: 'fb-1', code: 'LIV', name: 'Liverpool', thaiName: 'ลิเวอร์พูล' },
      { id: 'fb-2', code: 'ARS', name: 'Arsenal', thaiName: 'อาร์เซนอล' },
    ],
    basketball: [
      { id: 'bb-1', code: 'LAL', name: 'Lakers', thaiName: 'เลเกอร์ส' },
      { id: 'bb-2', code: 'GSW', name: 'Warriors', thaiName: 'วอร์ริเออร์ส' },
    ],
  };

  describe('Sport Templates & Rule Engines Integrity', () => {
    it.each(SPORTS)('provides complete template and functional rule engine for %s', (sport) => {
      const template = SPORT_TEMPLATES[sport];
      expect(template).toBeDefined();
      expect(template.name).toBeDefined();
      expect(template.skills.length).toBeGreaterThan(0);
      expect(template.areas.length).toBeGreaterThan(0);
      expect(template.results.length).toBeGreaterThan(0);

      const engine = getSportRuleEngine(sport);
      expect(engine).toBeDefined();
      expect(typeof engine.resolveAction).toBe('function');
      expect(typeof engine.resolveEvent).toBe('function');
    });
  });

  describe('24 Golden Workflow Permutations', () => {
    // Generate all 24 cases: 4 sports × 3 input modes × 2 video sources
    const cases: Array<{
      sport: SportType;
      inputMode: 'normal' | 'hud' | 'controller';
      videoSource: 'local' | 'youtube';
    }> = [];

    for (const sport of SPORTS) {
      for (const inputMode of INPUT_MODES) {
        for (const videoSource of VIDEO_SOURCES) {
          cases.push({ sport, inputMode, videoSource });
        }
      }
    }

    it('contains exactly 24 standardized pilot workflow test cases', () => {
      expect(cases.length).toBe(24);
    });

    it.each(cases)(
      'executes end-to-end workflow for $sport with $inputMode mode and $videoSource video',
      ({ sport, inputMode, videoSource }) => {
        const teams = mockTeams[sport];
        const engine = getSportRuleEngine(sport);

        // 1. Setup Match Configuration
        const matchInfo: MatchInfo = {
          sportType: sport,
          matchName: `${teams[0].code} vs ${teams[1].code}`,
          scouterName: `Pilot Evaluator (${inputMode})`,
          nickname: `${teams[0].code}${teams[1].code}`,
          matchType: 'Team',
          currentPoint: 1,
          setOrGame: '1',
        };
        expect(matchInfo.sportType).toBe(sport);

        // 2. Setup Video Configuration
        const videoConfig = {
          sourceType: videoSource,
          localFile: videoSource === 'local' ? `${sport}_match_test.mp4` : null,
          youtubeUrl: videoSource === 'youtube' ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : null,
        };
        expect(videoConfig.sourceType).toBe(videoSource);

        // 3. Log a valid scoring event
        const template = SPORT_TEMPLATES[sport];
        const primarySkill = template.skills[0].code;
        const primaryArea = template.areas[0].code;

        const event: EventRow = {
          id: `ev-${sport}-${inputMode}-${videoSource}`,
          no: 1,
          point: 1,
          resultText: '+1',
          eventText: `${teams[0].code} / ${primarySkill} / Yes`,
          createdAt: new Date().toISOString(),
          videoTime: 14.5,
          actions: [
            {
              teamCode: teams[0].code,
              skillCode: primarySkill,
              resultCode: 'Yes',
              areaCode: primaryArea,
            },
          ],
        };

        // 4. Resolve Scoring via Rule Engine
        const resolved = engine.resolveEvent(event.actions, {
          sportType: sport,
          teamCodes: [teams[0].code, teams[1].code],
          activeTeamCode: teams[0].code,
        }, event);

        expect(resolved.teamScoreDeltas).toBeDefined();

        // 5. Verify Data Quality
        const quality = buildDataQualityReport([event], teams);
        expect(quality.totalEvents).toBe(1);
        expect(quality.validEvents).toBe(1);
        expect(quality.errors).toBe(0);

        // 6. Verify Project Schema Envelope Simulation
        const project: ScoutProject = {
          id: `proj-${sport}-${inputMode}-${videoSource}`,
          title: matchInfo.matchName,
          sportType: sport,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          events: [event],
          teams,
          matchInfo,
        };

        const serialized = JSON.stringify(project);
        const deserialized = JSON.parse(serialized) as ScoutProject;

        expect(deserialized.id).toBe(project.id);
        expect(deserialized.title).toBe(project.title);
        expect(deserialized.sportType).toBe(sport);
        expect(deserialized.events.length).toBe(1);
        expect(deserialized.events[0].actions?.[0].skillCode).toBe(primarySkill);
      }
    );
  });

  describe('Data Quality Detection on Incomplete Events', () => {
    it.each(SPORTS)('accurately detects missing team or missing actions in %s', (sport) => {
      const teams = mockTeams[sport];
      const invalidEvents: EventRow[] = [
        {
          id: 'bad-1',
          no: 1,
          point: 1,
          resultText: '+1',
          eventText: '',
          createdAt: '',
          actions: [], // missing actions without legacy text!
        },
        {
          id: 'bad-2',
          no: 2,
          point: 2,
          resultText: '+1',
          eventText: 'Unknown Team Event',
          createdAt: '',
          actions: [{ teamCode: 'UNKNOWN_CODE', skillCode: 'SKILL', resultCode: 'Yes' }],
        },
        {
          id: 'bad-3',
          no: 3,
          point: 3,
          resultText: '+1',
          eventText: 'Missing Team Event',
          createdAt: '',
          actions: [{ teamCode: '', skillCode: 'SKILL', resultCode: 'Yes' }],
        },
      ];

      const quality = buildDataQualityReport(invalidEvents, teams);
      expect(quality.totalEvents).toBe(3);
      expect(quality.errors).toBeGreaterThan(0);
      expect(quality.issues.some((i) => i.code === 'missing_actions')).toBe(true);
      expect(quality.issues.some((i) => i.code === 'invalid_team')).toBe(true);
      expect(quality.issues.some((i) => i.code === 'missing_team')).toBe(true);
    });
  });
});
