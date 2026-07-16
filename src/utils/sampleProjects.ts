import { SPORT_TEMPLATES } from '../sports';
import type { EventRow, ScoutProject, SportType, Team } from '../types';

const PILOT_SPORTS: SportType[] = ['volleyball', 'football', 'badminton', 'basketball'];

function createTeams(sport: SportType): Team[] {
  return [
    { id: `${sport}-sample-a`, code: 'A', name: 'Pilot Team A', thaiName: 'ทีมตัวอย่าง A', teamType: 'club' },
    { id: `${sport}-sample-b`, code: 'B', name: 'Pilot Team B', thaiName: 'ทีมตัวอย่าง B', teamType: 'club' },
  ];
}

function createEvents(sport: SportType, seed: string): EventRow[] {
  const template = SPORT_TEMPLATES[sport];
  const areas = template.areas.filter((area) => !['UNKNOWN', 'NET_ERR'].includes(area.code));
  return Array.from({ length: 6 }, (_, index) => {
    const skill = template.skills[index % template.skills.length];
    const area = areas[index % areas.length] ?? template.areas[0];
    const result = template.results[index % template.results.length];
    const teamCode = index % 2 === 0 ? 'A' : 'B';
    const resultText: EventRow['resultText'] = result.code === 'Yes' ? '+1' : result.code === 'Out' ? '-1' : '0';
    return {
      id: `${seed}-${sport}-event-${index + 1}`,
      no: index + 1,
      point: index + 1,
      sportType: sport,
      actions: [{
        id: `${seed}-${sport}-action-${index + 1}`,
        teamCode,
        skillCode: skill.code,
        areaCode: area?.code,
        resultCode: result.code,
        videoTime: index * 12 + 5,
      }],
      eventText: `${teamCode} / ${skill.code} / ${area?.code ?? ''} / ${result.code}`,
      resultText,
      videoTime: index * 12 + 5,
      createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    };
  });
}

export function createPilotSampleProjects(seed = 'pilot-sample'): ScoutProject[] {
  return PILOT_SPORTS.map((sport) => {
    const teams = createTeams(sport);
    const timestamp = '2026-01-01T00:00:00.000Z';
    return {
      id: `${seed}-${sport}`,
      title: `SPORTSCOUT Pilot - ${SPORT_TEMPLATES[sport].name}`,
      sportType: sport,
      matchInfo: {
        scouterName: 'Pilot Coach',
        nickname: '',
        matchName: `${SPORT_TEMPLATES[sport].name} Sample Match`,
        matchType: 'Team',
        setOrGame: '1',
        currentPoint: 1,
        sportType: sport,
      },
      teams,
      events: createEvents(sport, seed),
      videoMeta: { sourceType: 'none' },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}
