import React, { useMemo, useState, lazy, Suspense } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { SportType } from '../types';
import { SPORT_TEMPLATES, OUT_ZONE_LABELS, DETAILED_ZONE_LABELS } from '../sports';
import { Settings as SettingsIcon } from 'lucide-react';
import { formatPreciseTime } from '../utils';
import CustomSelect from './ui/CustomSelect';
import { t } from '../i18n';

import RadarChart from './charts/RadarChart';
import FieldSequenceMap from './charts/FieldSequenceMap';
import TeamComparisonChart from './charts/TeamComparisonChart';
import SkillFrequencyChart from './charts/SkillFrequencyChart';
import ResultDistributionChart from './charts/ResultDistributionChart';
import SportSpecificKPIs from './charts/SportSpecificKPIs';

export default function Dashboard() {
  const { events, matchInfo, changeSportType, teams, setSeekRequest, settings, sportTemplate } = useScoutContext();
  const [filterSport, setFilterSport] = useState<SportType | 'ALL'>('ALL');
  const [mapMode, setMapMode] = useState<'heatmap' | 'sequence' | 'result'>('heatmap');
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
  const [teamFilter, setTeamFilter] = useState<'ALL' | 'teamA' | 'teamB'>('ALL');


  const [selectedMapAction, setSelectedMapAction] = useState<{event: any, action: any} | null>(null);

  const stats = useMemo(() => {
    let filteredEvents = events;
    if (filterSport !== 'ALL') {
      filteredEvents = events.filter(e => e.sportType === filterSport);
    }

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

      if (lastTeam) {
        if (lastTeam === teamA) {
          teamATotalEvents++;
          if (e.resultText === '+1') {
            teamAScore++;
            teamAYes++;
            teamAEarned++;
            teamBOpponentEarned++;
          } else if (e.resultText === '-1') {
            teamBScore++;
            teamAOut++;
            teamAErrors++;
            teamBErrorPoints++;
          } else {
            teamAPass++;
          }
        } else if (lastTeam === teamB) {
          teamBTotalEvents++;
          if (e.resultText === '+1') {
            teamBScore++;
            teamBYes++;
            teamBEarned++;
            teamAOpponentEarned++;
          } else if (e.resultText === '-1') {
            teamAScore++;
            teamBOut++;
            teamBErrors++;
            teamAErrorPoints++;
          } else {
            teamBPass++;
          }
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
            let isAttack = false, isDefense = false;
            
            if (currentSport === 'volleyball') {
              if (['SV', 'SPK'].includes(skill.toUpperCase())) isAttack = true;
              if (['REC', 'DIG', 'BLK', 'UND'].includes(skill.toUpperCase())) isDefense = true;
            } else if (currentSport === 'football') {
              if (['PAS', 'DRB', 'SHT', 'CRS'].includes(skill.toUpperCase())) isAttack = true;
              if (['TKL', 'INT', 'CLR', 'SAV'].includes(skill.toUpperCase())) isDefense = true;
            } else if (currentSport === 'badminton') {
              if (['SMH', 'DRP', 'DRV'].includes(skill.toUpperCase())) isAttack = true;
              if (['DEF', 'LFT', 'CLR'].includes(skill.toUpperCase())) isDefense = true;
            } else if (currentSport === 'basketball') {
              if (['PAS', 'DRB', 'SHT', 'LAY'].includes(skill.toUpperCase())) isAttack = true;
              if (['REB', 'STL', 'BLK'].includes(skill.toUpperCase())) isDefense = true;
            }

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
            let isAttack = false, isDefense = false;
            
            if (currentSport === 'volleyball') {
              if (['SV', 'SPK'].includes(skill.toUpperCase())) isAttack = true;
              if (['REC', 'DIG', 'BLK', 'UND'].includes(skill.toUpperCase())) isDefense = true;
            } else if (currentSport === 'football') {
              if (['PAS', 'DRB', 'SHT', 'CRS'].includes(skill.toUpperCase())) isAttack = true;
              if (['TKL', 'INT', 'CLR', 'SAV'].includes(skill.toUpperCase())) isDefense = true;
            } else if (currentSport === 'badminton') {
              if (['SMH', 'DRP', 'DRV'].includes(skill.toUpperCase())) isAttack = true;
              if (['DEF', 'LFT', 'CLR'].includes(skill.toUpperCase())) isDefense = true;
            } else if (currentSport === 'basketball') {
              if (['PAS', 'DRB', 'SHT', 'LAY'].includes(skill.toUpperCase())) isAttack = true;
              if (['REB', 'STL', 'BLK'].includes(skill.toUpperCase())) isDefense = true;
            }

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
      total, yes, out, pass,
      teamAScore, teamBScore,
      teamCounts, skillCounts, areaCounts,
      
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
  }, [events, filterSport, teams]);

  const successRate = stats.total > 0 ? ((stats.yes / stats.total) * 100).toFixed(1) : '0.0';

  const getTopEntry = (record: Record<string, number>): [string, number] => {
    return Object.entries(record).sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  };

  const getTopSkill = (): [string, number] => {
    return Object.entries(stats.skillCounts)
      .map(([k, v]) => [k, v.teamA + v.teamB] as [string, number])
      .sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  };

  const topTeam = getTopEntry(stats.teamCounts);
  const topSkill = getTopSkill();
  const topArea = getTopEntry(stats.areaCounts);

  const filterOptions = [
    { value: 'ALL', label: 'All Sports' },
    ...Object.values(SPORT_TEMPLATES).map(t => ({
      value: t.id,
      label: t.name,
      subLabel: t.thaiName
    }))
  ];

  const sportOptions = Object.values(SPORT_TEMPLATES).map(t => ({
    value: t.id,
    label: t.name,
    subLabel: t.thaiName
  }));

  const activeRadarData = teamFilter === 'ALL'
    ? stats.radarDataGlobal
    : teamFilter === 'teamA'
      ? stats.radarDataTeamA
      : stats.radarDataTeamB;

  const activeBarData = teamFilter === 'ALL'
    ? stats.barDataGlobal
    : teamFilter === 'teamA'
      ? stats.barDataTeamA
      : stats.barDataTeamB;

  const activePieData = teamFilter === 'ALL'
    ? stats.pieDataGlobal
    : teamFilter === 'teamA'
      ? stats.pieDataTeamA
      : stats.pieDataTeamB;

  const getFoulLabel = (code: string) => {
    const foulDef = sportTemplate?.fouls?.find(f => f.code === code);
    if (!foulDef) return code;
    return settings.uiLanguage === 'th' ? (foulDef.labelTh || foulDef.label) : foulDef.label;
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mt-4">
      {/* Header Container */}
      <div className="flex flex-col gap-4 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {settings.uiLanguage === 'th' ? 'แดชบอร์ดสรุปผล (Summary Dashboard)' : 'Summary Dashboard'}
            </h2>
            {teams.length >= 2 && (
              <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-900 px-4 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="font-bold text-gray-800 dark:text-gray-200">{teams[0]?.icon && <span className="mr-1">{teams[0].icon}</span>}{teams[0]?.code}</span>
                <span className="text-xl font-black text-sky-600 dark:text-sky-400">{stats.teamAScore}</span>
                <span className="text-gray-400 font-medium">-</span>
                <span className="text-xl font-black text-sky-600 dark:text-sky-400">{stats.teamBScore}</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">{teams[1]?.icon && <span className="mr-1">{teams[1].icon}</span>}{teams[1]?.code}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-sm z-50">
            <span className="text-xs text-sky-700 dark:text-sky-400 font-semibold">
              {settings.uiLanguage === 'th' ? 'กีฬาที่บันทึก:' : 'Active Sport:'}
            </span>
            <div className="w-40">
              <CustomSelect 
                value={matchInfo.sportType || 'volleyball'} 
                onChange={(v) => changeSportType(v as SportType)}
                options={sportOptions}
                disabled={events.length > 0}
                title={events.length > 0 ? (settings.uiLanguage === 'th' ? `ล็อกกีฬาไว้แล้วเพราะมีข้อมูลบันทึกอยู่ ${events.length} รายการ ต้องการเปลี่ยนกีฬา ให้สร้างโปรเจคใหม่` : `Sport locked because ${events.length} events are recorded. Create a new project to change sport.`) : undefined}
              />
            </div>
          </div>
        </div>

        {/* Segmented Control & Sport filter */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50 dark:bg-gray-900/10 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {settings.uiLanguage === 'th' ? 'วิเคราะห์เฉพาะฝั่ง:' : 'Analyze Side:'}
            </span>
            <div className="flex bg-gray-200 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-300/30 dark:border-gray-700/30 shadow-xs">
              <button
                onClick={() => setTeamFilter('ALL')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  teamFilter === 'ALL'
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
                }`}
              >
                {settings.uiLanguage === 'th' ? 'ทั้งหมด' : 'All Teams'}
              </button>
              <button
                onClick={() => setTeamFilter('teamA')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  teamFilter === 'teamA'
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
                }`}
              >
                {teams[0]?.icon && <span className="mr-1">{teams[0].icon}</span>}{teams[0]?.code ?? 'Team A'}
              </button>
              <button
                onClick={() => setTeamFilter('teamB')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  teamFilter === 'teamB'
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
                }`}
              >
                {teams[1]?.icon && <span className="mr-1">{teams[1].icon}</span>}{teams[1]?.code ?? 'Team B'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-gray-500 font-medium">
              {settings.uiLanguage === 'th' ? 'กรองสถิติ:' : 'Filter Stats:'}
            </span>
            <div className="w-40">
              <CustomSelect 
                value={filterSport} 
                onChange={(v) => setFilterSport(v as SportType | 'ALL')}
                options={filterOptions}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 mb-6 hide-scrollbar">
        <StatCard title={settings.uiLanguage === 'th' ? 'จำนวนเหตุการณ์ทั้งหมด' : 'Total Events'} value={stats.total} color="bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300" />
        <StatCard title={settings.uiLanguage === 'th' ? 'ได้แต้ม (+1)' : 'Success (+1)'} value={stats.yes} color="bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" />
        <StatCard title={settings.uiLanguage === 'th' ? 'เสียแต้ม (-1)' : 'Errors (-1)'} value={stats.out} color="bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" />
        <StatCard title={settings.uiLanguage === 'th' ? 'อัตราความสำเร็จ' : 'Success Rate'} value={`${successRate}%`} color="bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400" />
        <StatCard title={settings.uiLanguage === 'th' ? 'ทีมเด่น' : 'Top Team'} value={`${topTeam[0]} (${topTeam[1]})`} color="bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300" />
        <StatCard title={settings.uiLanguage === 'th' ? 'ทักษะเด่น' : 'Top Skill'} value={`${topSkill[0]} (${topSkill[1]})`} color="bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300" />
        <StatCard title={settings.uiLanguage === 'th' ? 'พื้นที่เด่น' : 'Top Area'} value={`${topArea[0]} (${topArea[1]})`} color="bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300" />
      </div>

      {stats.total > 0 ? (
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading charts...</div>}>
          <SportSpecificKPIs 
            events={events} 
            teams={teams} 
            matchInfo={matchInfo} 
            teamFilter={teamFilter} 
            uiLanguage={settings.uiLanguage} 
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SkillFrequencyChart data={activeBarData} teamAName={teams[0]?.code ?? 'Team A'} teamBName={teams[1]?.code ?? 'Team B'} />

            <ResultDistributionChart data={activePieData} />

            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl flex flex-col items-center">
              <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase w-full text-left">
                {settings.uiLanguage === 'th' ? 'เรดาร์สมรรถภาพ (Performance Radar)' : 'Performance Radar'}
              </h3>
              {stats.total < 5 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg w-full text-center mb-2">
                  {settings.uiLanguage === 'th' 
                    ? 'ข้อมูลยังน้อย กราฟอาจยังไม่สะท้อนภาพรวมจริง' 
                    : 'Few data points, radar might not reflect the full picture yet.'}
                </div>
              )}
              <RadarChart data={activeRadarData} size={180} />
            </div>

            {/* Detailed Points won/lost breakdown */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl lg:col-span-3 flex flex-col gap-5 border border-gray-100 dark:border-gray-800 shadow-xs">
              <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {settings.uiLanguage === 'th' ? 'ตารางสรุปการได้/เสียคะแนนรายฝั่ง' : 'Points Won/Lost Detailed Summary'}
                </h3>
                <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                  {settings.uiLanguage === 'th' ? '*คำนวณจากผลลัพธ์ของเซ็ตผู้เล่นล่าสุด' : '*Computed from last active sequence plays'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
                      <th className="pb-3 font-semibold text-gray-400">{settings.uiLanguage === 'th' ? 'ประเภทคะแนน' : 'Point Type'}</th>
                      <th className="pb-3 text-center font-bold text-sky-600 dark:text-sky-400 w-1/4">{teams[0]?.icon && <span className="mr-1">{teams[0].icon}</span>}{teams[0]?.code ?? 'Team A'} ({settings.uiLanguage === 'th' ? teams[0]?.thaiName : teams[0]?.name})</th>
                      <th className="pb-3 text-center font-bold text-orange-600 dark:text-orange-400 w-1/4">{teams[1]?.icon && <span className="mr-1">{teams[1].icon}</span>}{teams[1]?.code ?? 'Team B'} ({settings.uiLanguage === 'th' ? teams[1]?.thaiName : teams[1]?.name})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/40">
                    {/* Earned Points */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{settings.uiLanguage === 'th' ? 'ได้แต้มจากการเล่นของตนเอง (+1)' : 'Earned Points (+1)'}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{settings.uiLanguage === 'th' ? 'ทำคะแนนได้เอง เช่น การตบ, การเสิร์ฟเอซ' : 'Points scored directly via active skills'}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center font-mono font-bold text-gray-800 dark:text-gray-100">{stats.teamAEarned}</td>
                      <td className="py-3 text-center font-mono font-bold text-gray-800 dark:text-gray-100">{stats.teamBEarned}</td>
                    </tr>

                    {/* Opponent Error Points */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{settings.uiLanguage === 'th' ? 'ได้แต้มจากคู่แข่งทำเสีย (+1)' : 'Points from Opponent Errors (+1)'}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{settings.uiLanguage === 'th' ? 'คู่แข่งทำเสียเองในจังหวะสุดท้าย' : 'Points received due to opponent out/error'}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center font-mono font-bold text-gray-800 dark:text-gray-100">{stats.teamAErrorPoints}</td>
                      <td className="py-3 text-center font-mono font-bold text-gray-800 dark:text-gray-100">{stats.teamBErrorPoints}</td>
                    </tr>

                    {/* Total Points Won (Score) */}
                    <tr className="bg-gray-50/50 dark:bg-gray-900/30 transition-colors">
                      <td className="py-3.5 pr-4 font-bold text-gray-900 dark:text-white pl-2">
                        <div className="flex flex-col">
                          <span>{settings.uiLanguage === 'th' ? 'รวมคะแนนที่ได้ทั้งหมด' : 'Total Points Won (Score)'}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{settings.uiLanguage === 'th' ? 'คะแนนรวมปัจจุบันตามบอร์ด' : 'Combined scoreboard matches'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-center font-mono text-base font-black text-sky-600 dark:text-sky-400 border-t border-gray-100 dark:border-gray-800">
                        {stats.teamAEarned + stats.teamAErrorPoints}
                      </td>
                      <td className="py-3.5 text-center font-mono text-base font-black text-orange-600 dark:text-orange-400 border-t border-gray-100 dark:border-gray-800">
                        {stats.teamBEarned + stats.teamBErrorPoints}
                      </td>
                    </tr>

                    {/* Fouls */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{settings.uiLanguage === 'th' ? 'ทำฟาวล์ / ผิดกติกา' : 'Fouls / Violations'}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{settings.uiLanguage === 'th' ? 'จำนวนครั้งที่ทำฟาวล์หรือผิดกติกา' : 'Total fouls and violations committed'}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center font-mono text-gray-600 dark:text-gray-300">{stats.teamAFouls}</td>
                      <td className="py-3 text-center font-mono text-gray-600 dark:text-gray-300">{stats.teamBFouls}</td>
                    </tr>
                    {/* Own Errors */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{settings.uiLanguage === 'th' ? 'เสียแต้มจากการทำเสียเอง (-1)' : 'Own Errors Conceded (-1)'}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{settings.uiLanguage === 'th' ? 'ทำเสียเองทำให้ฝั่งตรงข้ามได้แต้ม' : 'Points given away due to own error/out'}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center font-mono text-gray-600 dark:text-gray-300">{stats.teamAErrors}</td>
                      <td className="py-3 text-center font-mono text-gray-600 dark:text-gray-300">{stats.teamBErrors}</td>
                    </tr>

                    {/* Opponent Earned */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{settings.uiLanguage === 'th' ? 'เสียแต้มจากฝีมือคู่แข่ง (-1)' : 'Opponent Earned Points Conceded (-1)'}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{settings.uiLanguage === 'th' ? 'คู่แข่งเล่นจังหวะได้แต้ม' : 'Opponent scored a direct point'}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center font-mono text-gray-600 dark:text-gray-300">{stats.teamAOpponentEarned}</td>
                      <td className="py-3 text-center font-mono text-gray-600 dark:text-gray-300">{stats.teamBOpponentEarned}</td>
                    </tr>

                    {/* Total Points Lost */}
                    <tr className="bg-gray-50/50 dark:bg-gray-900/30 transition-colors">
                      <td className="py-3.5 pr-4 font-bold text-gray-900 dark:text-white pl-2">
                        <div className="flex flex-col">
                          <span>{settings.uiLanguage === 'th' ? 'รวมคะแนนที่เสียทั้งหมด' : 'Total Points Lost'}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{settings.uiLanguage === 'th' ? 'จำนวนคะแนนที่เสียให้ฝั่งตรงข้าม' : 'Combined total points lost'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-center font-mono text-base font-bold text-red-500 dark:text-red-400 border-t border-gray-100 dark:border-gray-800">
                        {stats.teamAErrors + stats.teamAOpponentEarned}
                      </td>
                      <td className="py-3.5 text-center font-mono text-base font-bold text-red-500 dark:text-red-400 border-t border-gray-100 dark:border-gray-800">
                        {stats.teamBErrors + stats.teamBOpponentEarned}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl lg:col-span-3 flex flex-col gap-4">
              <TeamComparisonChart events={filterSport === 'ALL' ? events : events.filter(e => e.sportType === filterSport)} team1={teams[0]?.code} team2={teams[1]?.code} />
            </div>

            {/* Fouls & Violations Section */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl lg:col-span-3 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                <span className="text-amber-500">⚠️</span>
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {settings.uiLanguage === 'th' ? 'สถิติการฟาวล์และการผิดกติกา (Fouls & Violations)' : 'Fouls & Violations Analytics'}
                </h3>
              </div>
              
              {stats.foulsList.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                  {settings.uiLanguage === 'th' ? 'ไม่มีข้อมูลการทำฟาวล์ในการแข่งนี้' : 'No fouls or violations recorded for this match.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Summary / Top Stats */}
                  <div className="bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                        {settings.uiLanguage === 'th' ? 'ภาพรวมการฟาวล์' : 'Foul Overview'}
                      </h4>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm text-gray-500">{settings.uiLanguage === 'th' ? 'จำนวนฟาวล์ทั้งหมด:' : 'Total Fouls:'}</span>
                        <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.foulsList.length}</span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-gray-500">{settings.uiLanguage === 'th' ? 'ประเภทที่เกิดบ่อยสุด:' : 'Top Foul Type:'}</span>
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{getFoulLabel(stats.topFoulType)} ({stats.topFoulCount})</span>
                      </div>
                    </div>
                  </div>

                  {/* Foul Count by Team */}
                  <div className="bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-xl">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                      {settings.uiLanguage === 'th' ? 'ฟาวล์รายทีม' : 'Fouls by Team'}
                    </h4>
                    <div className="flex flex-col gap-3">
                      {teams.map((t) => {
                        const count = stats.foulCountByTeam[t.code] || 0;
                        const pct = stats.foulsList.length > 0 ? (count / stats.foulsList.length) * 100 : 0;
                        return (
                          <div key={t.code} className="text-sm">
                            <div className="flex justify-between font-semibold text-gray-700 dark:text-gray-300 mb-1">
                              <span>{t.icon} {t.code}</span>
                              <span>{count}</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                              <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Foul Type Frequency */}
                  <div className="bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-xl md:col-span-2 lg:col-span-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                      {settings.uiLanguage === 'th' ? 'ความถี่ประเภทฟาวล์' : 'Foul Type Frequency'}
                    </h4>
                    <div className="max-h-[140px] overflow-y-auto pr-1 flex flex-col gap-2">
                      {Object.entries(stats.foulTypeFrequency).sort((a,b)=>b[1]-a[1]).map(([code, count]) => {
                        const pct = stats.foulsList.length > 0 ? (count / stats.foulsList.length) * 100 : 0;
                        return (
                          <div key={code} className="text-xs">
                            <div className="flex justify-between text-gray-600 dark:text-gray-300 mb-0.5">
                              <span className="font-medium truncate max-w-[200px]">{getFoulLabel(code)}</span>
                              <span className="font-mono font-bold">{count} ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-red-400 h-full rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Foul Severity Breakdown */}
                  <div className="bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-xl md:col-span-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                      {settings.uiLanguage === 'th' ? 'ระดับความรุนแรง (Severity Breakdown)' : 'Foul Severity Breakdown'}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(stats.foulSeverityCount).map(([sev, count]) => {
                        let badgeColor = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
                        if (sev === 'card') badgeColor = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
                        if (sev === 'warning') badgeColor = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
                        if (sev === 'technical') badgeColor = "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
                        return (
                          <div key={sev} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${badgeColor} flex items-center gap-2`}>
                            <span className="capitalize">{sev}</span>
                            <span className="font-mono font-bold text-sm bg-black/5 px-1.5 py-0.5 rounded">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Foul Timeline */}
                  <div className="bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-xl md:col-span-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                      {settings.uiLanguage === 'th' ? 'ลำดับเหตุการณ์ฟาวล์ (Foul Timeline)' : 'Foul Timeline'}
                    </h4>
                    <div className="max-h-[140px] overflow-y-auto pr-1 flex flex-col gap-1.5 font-mono text-[11px]">
                      {stats.foulsList.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-800/60 hover:bg-black/5 dark:hover:bg-white/5 px-1.5 rounded transition-colors">
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-gray-400">#{f.eventNo}</span>
                            <span className="font-bold text-sky-600 dark:text-sky-400">{f.teamCode}</span>
                            <span className="text-gray-700 dark:text-gray-200 truncate">{getFoulLabel(f.foulCode)}</span>
                          </div>
                          {f.videoTime !== undefined && (
                            <button
                              onClick={() => setSeekRequest(Math.max(0, f.videoTime - 3))}
                              className="text-sky-500 hover:underline flex-shrink-0 cursor-pointer"
                            >
                              {formatPreciseTime(f.videoTime)}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

          <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl lg:col-span-3 flex flex-col items-center">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full mb-4 gap-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase">Field Intelligence Map</h3>
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                {mapMode === 'sequence' && (() => {
                  const eventOptions = events
                    .filter(e => filterSport === 'ALL' || e.sportType === filterSport)
                    .map((e, idx) => ({
                      value: e.id,
                      label: `Event #${e.no}`,
                      subLabel: e.actions.length > 0 ? (e.actions[0].teamCode || 'No Team') : undefined,
                    }));

                  return (
                    <CustomSelect
                      value={selectedEventId || ''}
                      options={eventOptions}
                      onChange={(v) => setSelectedEventId(v || undefined)}
                      placeholder="-- เลือก Event เพื่อดู Sequence --"
                      className="max-w-xs"
                    />
                  );
                })()}
                <div className="flex gap-2 bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                  <button 
                    onClick={() => setMapMode('heatmap')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg ${mapMode === 'heatmap' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >Heatmap</button>
                  <button 
                    onClick={() => setMapMode('sequence')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg ${mapMode === 'sequence' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >Sequence</button>
                  <button 
                    onClick={() => setMapMode('result')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg ${mapMode === 'result' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >Result</button>
                </div>
              </div>
            </div>
            
            {(filterSport !== 'ALL' || matchInfo.sportType) && (
              <FieldSequenceMap 
                sportType={filterSport !== 'ALL' ? filterSport : matchInfo.sportType} 
                events={events}
                mode={mapMode}
                selectedEventId={selectedEventId}
                teamAName={teams[0]?.code ?? 'Team A'}
                teamBName={teams[1]?.code ?? 'Team B'}
                onEventClick={(event, action) => {
                  setSelectedMapAction({ event, action });
                  setSelectedEventId(event.id);
                }}
              />
            )}
            
            {selectedMapAction && (
              <div className="w-full mt-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-sky-100 dark:border-sky-900/50 shadow-sm relative">
                <button 
                  onClick={() => setSelectedMapAction(null)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  &times;
                </button>
                <h4 className="text-xs font-bold text-sky-600 dark:text-sky-400 mb-2 uppercase">Action Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-500">Event No:</div>
                  <div className="font-semibold">{selectedMapAction.event.no}</div>
                  <div className="text-gray-500">Point:</div>
                  <div className="font-semibold">{selectedMapAction.event.point}</div>
                  <div className="text-gray-500">Team:</div>
                  <div className="font-semibold text-sky-600">{selectedMapAction.action.teamCode}</div>
                  <div className="text-gray-500">Skill:</div>
                  <div className="font-semibold">{selectedMapAction.action.skillCode}</div>
                  <div className="text-gray-500">Area:</div>
                  <div className="font-semibold">{selectedMapAction.action.areaLabel || selectedMapAction.action.outZone || selectedMapAction.action.areaCode || '-'}</div>
                  <div className="text-gray-500">Result:</div>
                  <div className={`font-semibold ${selectedMapAction.action.resultCode === 'Yes' ? 'text-green-600' : selectedMapAction.action.resultCode === 'Out' ? 'text-red-600' : 'text-gray-600'}`}>
                    {selectedMapAction.action.resultCode}
                  </div>
                  {(() => {
                    const vt = selectedMapAction.action.videoTime ?? selectedMapAction.event.videoTime;
                    if (vt !== undefined && vt !== null) {
                      return (
                        <>
                          <div className="text-gray-500">Video Time:</div>
                          <div className="font-semibold text-sky-600 cursor-pointer hover:underline" onClick={() => {
                            setSeekRequest(Math.max(0, vt - 3));
                          }}>
                            {formatPreciseTime(vt)} (Click to Go)
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
        </Suspense>
      ) : (
        <div className="text-center py-8 text-gray-500 text-sm">
          ไม่มีข้อมูลสำหรับกีฬาที่เลือก
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string, value: string | number, color: string }) {
  return (
    <div className={`p-3 rounded-xl border border-transparent min-w-[120px] flex-shrink-0 ${color}`}>
      <div className="text-xs uppercase font-semibold opacity-80">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
