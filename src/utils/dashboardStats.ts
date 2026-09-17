import { EventRow, SportType, Team } from '../types';
import { OUT_ZONE_LABELS, DETAILED_ZONE_LABELS } from '../sports';
import { isAttackingSkill, isDefensiveSkill } from './scoutData';
import { buildAnalyticsSummary } from './analyticsEngine';
import { getSportRuleEngine } from '../sports/rules/registry';

export function calculateDashboardStats(
  events: EventRow[],
  filterSport: SportType | 'ALL',
  teams: Team[]
) {
  let filteredEvents = events;
  if (filterSport !== 'ALL') {
    filteredEvents = events.filter(e => e.sportType === filterSport);
  }
  const analyticsSummary = buildAnalyticsSummary(events, { sportType: filterSport, teams });

  let total = filteredEvents.length;
  let yes = 0, out = 0, pass = 0;
  
  const teamCounts: Record<string, number> = {};
  const skillCounts: Record<string, { teamA: number, teamB: number }> = {};
  const areaCounts: Record<string, number> = {};
  
  let totalActions = 0;
  let attackingSkills = 0;
  let defensiveSkills = 0;

  let teamAScore = 0;
  let teamBScore = 0;
  const teamA = teams[0]?.code;
  const teamB = teams[1]?.code;

  // Detailed points breakdown by team
  let teamAEarned = 0;
  let teamAErrorPoints = 0;
  let teamAErrors = 0;
  let teamAOpponentEarned = 0;

  let teamBEarned = 0;
  let teamBErrorPoints = 0;
  let teamBErrors = 0;
  let teamBOpponentEarned = 0;

  // Team A specific aggregates for radar/pie charts
  let teamATotalEvents = 0;
  let teamAYes = 0;
  let teamAOut = 0;
  let teamAPass = 0;
  let teamAFouls = 0;
  const teamASkills = new Set<string>();
  const teamAAreas = new Set<string>();
  let teamATotalActions = 0;
  let teamAAttackingSkills = 0;
  let teamADefensiveSkills = 0;

  // Team B specific aggregates for radar/pie charts
  let teamBTotalEvents = 0;
  let teamBYes = 0;
  let teamBOut = 0;
  let teamBPass = 0;
  let teamBFouls = 0;
  const teamBSkills = new Set<string>();
  const teamBAreas = new Set<string>();
  let teamBTotalActions = 0;
  let teamBAttackingSkills = 0;
  let teamBDefensiveSkills = 0;

  const foulsList: Array<{
    foulCode: string;
    foulRole?: string;
    foulSeverity?: string;
    teamCode?: string;
    videoTime?: number;
    eventNo: number;
  }> = [];

  const foulCountByTeam: Record<string, number> = {};
  const foulTypeFrequency: Record<string, number> = {};
  const foulSeverityCount: Record<string, number> = {};

  filteredEvents.forEach(e => {
    if (e.resultText === '+1') yes++;
    else if (e.resultText === '-1') out++;
    else pass++;
    
    let lastTeam = '';
    if (e.actions && e.actions.length > 0) {
      lastTeam = e.actions[e.actions.length - 1].teamCode || '';
    } else if (e.eventText) {
      const parts = e.eventText.split(' / ');
      for (let i = Math.max(0, parts.length - 4); i < parts.length; i += 4) {
        lastTeam = parts[i] || '';
      }
    }

    const effectiveSport = e.sportType || (filterSport !== 'ALL' ? filterSport : undefined);
    if (effectiveSport) {
      const ruleEngine = getSportRuleEngine(effectiveSport);
      const actions = (e.actions && e.actions.length > 0) ? e.actions : [
        {
          id: e.id,
          teamCode: lastTeam,
          skillCode: e.eventText?.split(' / ')[1] || 'ACT',
          resultCode: e.resultText === '+1' ? 'Yes' : e.resultText === '-1' ? 'Out' : 'Pass',
        }
      ];
      const eventRes = ruleEngine.resolveEvent(
        actions,
        {
          sportType: effectiveSport,
          teamCodes: [teamA || 'A', teamB || 'B'],
          activeTeamCode: lastTeam || teamA,
        },
        e
      );
      const deltaA = eventRes.teamScoreDeltas[teamA || 'A'] ?? 0;
      const deltaB = eventRes.teamScoreDeltas[teamB || 'B'] ?? 0;
      teamAScore += deltaA;
      teamBScore += deltaB;

      if (deltaA > 0) {
        if (eventRes.outcomeStatus === 'success') {
          teamAEarned += deltaA;
          teamBOpponentEarned += deltaA;
        } else {
          teamBErrors += deltaA;
          teamAErrorPoints += deltaA;
        }
      }
      if (deltaB > 0) {
        if (eventRes.outcomeStatus === 'success') {
          teamBEarned += deltaB;
          teamAOpponentEarned += deltaB;
        } else {
          teamAErrors += deltaB;
          teamBErrorPoints += deltaB;
        }
      }
    } else {
      if (lastTeam === teamA) {
        if (e.resultText === '+1') {
          teamAScore++;
          teamAEarned++;
          teamBOpponentEarned++;
        } else if (e.resultText === '-1') {
          teamBScore++;
          teamAErrors++;
          teamBErrorPoints++;
        }
      } else if (lastTeam === teamB) {
        if (e.resultText === '+1') {
          teamBScore++;
          teamBEarned++;
          teamAOpponentEarned++;
        } else if (e.resultText === '-1') {
          teamAScore++;
          teamBErrors++;
          teamAErrorPoints++;
        }
      }
    }

    if (lastTeam) {
      if (lastTeam === teamA) {
        teamATotalEvents++;
        if (e.resultText === '+1') teamAYes++;
        else if (e.resultText === '-1') teamAOut++;
        else teamAPass++;
      } else if (lastTeam === teamB) {
        teamBTotalEvents++;
        if (e.resultText === '+1') teamBYes++;
        else if (e.resultText === '-1') teamBOut++;
        else teamBPass++;
      }
    }
    
    if (e.actions && e.actions.length > 0) {
      e.actions.forEach(action => {
        totalActions++;
        const team = action.teamCode;
        if (action.foulCode) {
          if (team === teamA) teamAFouls++;
          if (team === teamB) teamBFouls++;

          foulsList.push({
            foulCode: action.foulCode,
            foulRole: action.foulRole,
            foulSeverity: action.foulSeverity || 'normal',
            teamCode: team,
            videoTime: action.videoTime !== undefined ? action.videoTime : e.videoTime,
            eventNo: e.no,
          });

          if (team) {
            foulCountByTeam[team] = (foulCountByTeam[team] || 0) + 1;
          }
          foulTypeFrequency[action.foulCode] = (foulTypeFrequency[action.foulCode] || 0) + 1;
          const severity = action.foulSeverity || 'normal';
          foulSeverityCount[severity] = (foulSeverityCount[severity] || 0) + 1;
        }
        const skill = action.skillCode;
        let area = action.areaLabel || action.outZone || action.areaCode;
        if (action.outZone && OUT_ZONE_LABELS[action.outZone]) {
          area = OUT_ZONE_LABELS[action.outZone].label;
        } else if (action.areaCode && DETAILED_ZONE_LABELS[action.areaCode]) {
          area = DETAILED_ZONE_LABELS[action.areaCode].label;
        }
        if (area === 'THREE_POINT') area = 'THREE_PT';
        if (!area) area = 'UNKNOWN';
        
        if (team) teamCounts[team] = (teamCounts[team] || 0) + 1;
        if (skill) {
          if (!skillCounts[skill]) skillCounts[skill] = { teamA: 0, teamB: 0 };
          if (team === teamA) skillCounts[skill].teamA++;
          else if (team === teamB) skillCounts[skill].teamB++;
          
          const currentSport = e.sportType;
          let isAttack = isAttackingSkill(currentSport, skill);
          let isDefense = isDefensiveSkill(currentSport, skill);

          if (isAttack) attackingSkills++;
          if (isDefense) defensiveSkills++;

          if (team === teamA) {
            teamASkills.add(skill);
            teamATotalActions++;
            if (isAttack) teamAAttackingSkills++;
            if (isDefense) teamADefensiveSkills++;
          } else if (team === teamB) {
            teamBSkills.add(skill);
            teamBTotalActions++;
            if (isAttack) teamBAttackingSkills++;
            if (isDefense) teamBDefensiveSkills++;
          }
        }
        if (area) {
          areaCounts[area] = (areaCounts[area] || 0) + 1;
          if (team === teamA) teamAAreas.add(area);
          else if (team === teamB) teamBAreas.add(area);
        }
      });
    } else if (e.eventText) {
      // Fallback for old data
      const parts = e.eventText.split(' / ');
      for (let i = 0; i < parts.length; i += 4) {
        totalActions++;
        const team = parts[i];
        const skill = parts[i+1];
        const area = parts[i+2];
        
        if (team && !['Yes', 'Out', 'Pass'].includes(team)) {
          teamCounts[team] = (teamCounts[team] || 0) + 1;
        }
        if (skill && !['Yes', 'Out', 'Pass'].includes(skill)) {
          if (!skillCounts[skill]) skillCounts[skill] = { teamA: 0, teamB: 0 };
          if (team === teamA) skillCounts[skill].teamA++;
          else if (team === teamB) skillCounts[skill].teamB++;
          
          const currentSport = e.sportType;
          let isAttack = isAttackingSkill(currentSport, skill);
          let isDefense = isDefensiveSkill(currentSport, skill);

          if (isAttack) attackingSkills++;
          if (isDefense) defensiveSkills++;

          if (team === teamA) {
            teamASkills.add(skill);
            teamATotalActions++;
            if (isAttack) teamAAttackingSkills++;
            if (isDefense) teamADefensiveSkills++;
          } else if (team === teamB) {
            teamBSkills.add(skill);
            teamBTotalActions++;
            if (isAttack) teamBAttackingSkills++;
            if (isDefense) teamBDefensiveSkills++;
          }
        }
        if (area && !['Yes', 'Out', 'Pass'].includes(area)) {
          areaCounts[area] = (areaCounts[area] || 0) + 1;
          if (team === teamA) teamAAreas.add(area);
          else if (team === teamB) teamBAreas.add(area);
        }
      }
    }
  });

  const uniqueSkills = Object.keys(skillCounts).length;
  const uniqueAreas = Object.keys(areaCounts).length;

  // Derived metrics for radar (Global)
  const radarDataGlobal = [
    { name: 'Success', value: total > 0 ? (yes / total) * 100 : 0 },
    { name: 'Error Control', value: total > 0 ? 100 - (out / total) * 100 : 0 },
    { name: 'Diversity', value: Math.min((uniqueSkills / 6) * 100, 100) },
    { name: 'Coverage', value: Math.min((uniqueAreas / 6) * 100, 100) },
    { name: 'Attack', value: totalActions > 0 ? (attackingSkills / totalActions) * 100 * 2 : 0 },
    { name: 'Defense', value: totalActions > 0 ? (defensiveSkills / totalActions) * 100 * 2 : 0 },
  ].map(d => ({ ...d, value: Math.min(Math.max(d.value, 0), 100) }));

  // Derived metrics for radar (Team A)
  const radarDataTeamA = [
    { name: 'Success', value: teamATotalEvents > 0 ? (teamAYes / teamATotalEvents) * 100 : 0 },
    { name: 'Error Control', value: teamATotalEvents > 0 ? 100 - (teamAOut / teamATotalEvents) * 100 : 0 },
    { name: 'Diversity', value: Math.min((teamASkills.size / 6) * 100, 100) },
    { name: 'Coverage', value: Math.min((teamAAreas.size / 6) * 100, 100) },
    { name: 'Attack', value: teamATotalActions > 0 ? (teamAAttackingSkills / teamATotalActions) * 100 * 2 : 0 },
    { name: 'Defense', value: teamATotalActions > 0 ? (teamADefensiveSkills / teamATotalActions) * 100 * 2 : 0 },
  ].map(d => ({ ...d, value: Math.min(Math.max(d.value, 0), 100) }));

  // Derived metrics for radar (Team B)
  const radarDataTeamB = [
    { name: 'Success', value: teamBTotalEvents > 0 ? (teamBYes / teamBTotalEvents) * 100 : 0 },
    { name: 'Error Control', value: teamBTotalEvents > 0 ? 100 - (teamBOut / teamBTotalEvents) * 100 : 0 },
    { name: 'Diversity', value: Math.min((teamBSkills.size / 6) * 100, 100) },
    { name: 'Coverage', value: Math.min((teamBAreas.size / 6) * 100, 100) },
    { name: 'Attack', value: teamBTotalActions > 0 ? (teamBAttackingSkills / teamBTotalActions) * 100 * 2 : 0 },
    { name: 'Defense', value: teamBTotalActions > 0 ? (teamBDefensiveSkills / teamBTotalActions) * 100 * 2 : 0 },
  ].map(d => ({ ...d, value: Math.min(Math.max(d.value, 0), 100) }));

  // Bar Data (Skill Frequency)
  const barDataGlobal = Object.entries(skillCounts)
    .sort((a, b) => (b[1].teamA + b[1].teamB) - (a[1].teamA + a[1].teamB))
    .slice(0, 5)
    .map(([name, counts]) => ({ name, teamA: counts.teamA, teamB: counts.teamB }));

  const barDataTeamA = Object.entries(skillCounts)
    .filter(([_, counts]) => counts.teamA > 0)
    .sort((a, b) => b[1].teamA - a[1].teamA)
    .slice(0, 5)
    .map(([name, counts]) => ({ name, teamA: counts.teamA, teamB: 0 }));

  const barDataTeamB = Object.entries(skillCounts)
    .filter(([_, counts]) => counts.teamB > 0)
    .sort((a, b) => b[1].teamB - a[1].teamB)
    .slice(0, 5)
    .map(([name, counts]) => ({ name, teamA: 0, teamB: counts.teamB }));

  // Pie Data (Result Distribution)
  const pieDataGlobal = [
    { name: 'Yes (+1)', value: yes, color: '#22c55e' },
    { name: 'Out (-1)', value: out, color: '#ef4444' },
    { name: 'Pass (0)', value: pass, color: '#6b7280' },
  ].filter(d => d.value > 0);

  const pieDataTeamA = [
    { name: 'Yes (+1)', value: teamAYes, color: '#22c55e' },
    { name: 'Out (-1)', value: teamAOut, color: '#ef4444' },
    { name: 'Pass (0)', value: teamAPass, color: '#6b7280' },
  ].filter(d => d.value > 0);

  const pieDataTeamB = [
    { name: 'Yes (+1)', value: teamBYes, color: '#22c55e' },
    { name: 'Out (-1)', value: teamBOut, color: '#ef4444' },
    { name: 'Pass (0)', value: teamBPass, color: '#6b7280' },
  ].filter(d => d.value > 0);

  return {
    total: analyticsSummary.totalEvents,
    totalActions: analyticsSummary.totalActions,
    yes: analyticsSummary.eventResultCounts.Yes,
    out: analyticsSummary.eventResultCounts.Out,
    pass: analyticsSummary.eventResultCounts.Pass,
    teamAScore: teamAScore,
    teamBScore: teamBScore,
    teamCounts: analyticsSummary.teamCounts,
    skillCounts,
    areaCounts: analyticsSummary.areaCounts,
    analyticsSummary,
    
    // Point Summary Breakdown values
    teamAEarned, teamAErrorPoints, teamAErrors, teamAOpponentEarned,
    teamBEarned, teamBErrorPoints, teamBErrors, teamBOpponentEarned,

    // Filtered Chart datasets
    radarDataGlobal, radarDataTeamA, radarDataTeamB,
    barDataGlobal, barDataTeamA, barDataTeamB,
    pieDataGlobal, pieDataTeamA, pieDataTeamB,
    teamAFouls, teamBFouls,
    foulsList,
    foulCountByTeam,
    foulTypeFrequency,
    foulSeverityCount,
    topFoulType: Object.entries(foulTypeFrequency).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "-",
    topFoulCount: Object.entries(foulTypeFrequency).sort((a,b)=>b[1]-a[1])[0]?.[1] ?? 0
  };
}
