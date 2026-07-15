import React, { useMemo, useState, lazy, Suspense } from 'react';
import { AlertTriangle, ChevronDown, FilterX, Printer, X } from 'lucide-react';
import { useScoutContext } from '../context/ScoutContext';
import type { SportType, Team } from '../types';
import { SPORT_TEMPLATES, OUT_ZONE_LABELS, DETAILED_ZONE_LABELS } from '../sports';
import { formatPreciseTime } from '../utils';
import CustomSelect from './ui/CustomSelect';
import { t } from '../i18n';
import { buildAnalyticsSummary, buildDataQualityDrilldown, buildDataQualityReport, getFoulLabel as getScoutFoulLabel } from '../utils/scoutData';
import { calculateDashboardStats } from '../utils/dashboardStats';
import { getEventQueryOptions } from '../utils/eventQuery';
import type { AnalyticsSummary } from '../utils/analyticsEngine';
import type { DataQualityReport } from '../utils/scoutData';

import RadarChart from './charts/RadarChart';
import FieldSequenceMap from './charts/FieldSequenceMap';
import TeamComparisonChart from './charts/TeamComparisonChart';
import SkillFrequencyChart from './charts/SkillFrequencyChart';
import ResultDistributionChart from './charts/ResultDistributionChart';
import SportSpecificKPIs from './charts/SportSpecificKPIs';

export default function Dashboard() {
  const { events, matchInfo, changeSportType, teams, setSeekRequest, setPreviewState, settings, sportTemplate } = useScoutContext();
  const [filterSport, setFilterSport] = useState<SportType | 'ALL'>('ALL');
  const [mapMode, setMapMode] = useState<'heatmap' | 'sequence' | 'result'>('heatmap');
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
  const [teamFilter, setTeamFilter] = useState<'ALL' | 'teamA' | 'teamB'>('ALL');
  const [showQualityDetails, setShowQualityDetails] = useState(false);
  const [mapTeamFilter, setMapTeamFilter] = useState('ALL');
  const [mapSkillFilter, setMapSkillFilter] = useState('ALL');
  const [mapResultFilter, setMapResultFilter] = useState('ALL');
  const [mapFoulFilter, setMapFoulFilter] = useState('ALL');
  const [mapAreaFilter, setMapAreaFilter] = useState('ALL');
  const [mapTimeFrom, setMapTimeFrom] = useState<number | undefined>();
  const [mapTimeTo, setMapTimeTo] = useState<number | undefined>();


  const [selectedMapAction, setSelectedMapAction] = useState<{event: any, action: any} | null>(null);
  const filteredSportEvents = useMemo(
    () => filterSport === 'ALL' ? events : events.filter(event => event.sportType === filterSport),
    [events, filterSport],
  );
  const dataQuality = useMemo(() => buildDataQualityReport(filteredSportEvents, teams), [filteredSportEvents, teams]);
  const qualityDrilldown = useMemo(() => buildDataQualityDrilldown(dataQuality), [dataQuality]);
  const analyticsSummary = useMemo(
    () => buildAnalyticsSummary(events, { sportType: filterSport, teams, uiLanguage: settings.uiLanguage }),
    [events, filterSport, teams, settings.uiLanguage],
  );

  const stats = useMemo(() => {
    return calculateDashboardStats(events, filterSport, teams);
  }, [events, filterSport, teams]);
  const mapQueryOptions = useMemo(() => getEventQueryOptions(filteredSportEvents), [filteredSportEvents]);

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

  const filterOptions = useMemo(() => [
    { value: 'ALL', label: 'All Sports' },
    ...Object.values(SPORT_TEMPLATES).map(t => ({
      value: t.id,
      label: t.name,
      subLabel: t.thaiName
    }))
  ], []);

  const sportOptions = useMemo(() => Object.values(SPORT_TEMPLATES).map(t => ({
    value: t.id,
    label: t.name,
    subLabel: t.thaiName
  })), []);

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
    return getScoutFoulLabel({ foulCode: code }, { sportTemplate, uiLanguage: settings.uiLanguage });
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mt-4">
      <CoachPrintSummary
        language={settings.uiLanguage}
        sportLabel={filterSport === 'ALL' ? 'ALL' : SPORT_TEMPLATES[filterSport].name}
        teams={teams}
        analytics={analyticsSummary}
        dataQuality={dataQuality}
      />
      {/* Header Container */}
      <div className="flex flex-col gap-4 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('dashboard.summary', settings.uiLanguage)}
            </h2>
            <button
              type="button"
              onClick={() => window.print()}
              className="print:hidden inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 hover:border-sky-400 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <Printer size={14} />
              {t('dashboard.printCoachSummary', settings.uiLanguage)}
            </button>
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

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">
        <DataQualityCard label={t('dashboard.valid', settings.uiLanguage)} value={dataQuality.validEvents} tone="green" />
        <DataQualityCard label={t('dashboard.incomplete', settings.uiLanguage)} value={dataQuality.incompleteEvents} tone={dataQuality.incompleteEvents > 0 ? 'red' : 'gray'} />
        <DataQualityCard label={t('dashboard.warnings', settings.uiLanguage)} value={dataQuality.warnings} tone={dataQuality.warnings > 0 ? 'amber' : 'gray'} />
        <DataQualityCard label={t('dashboard.legacy', settings.uiLanguage)} value={dataQuality.legacyEvents} tone={dataQuality.legacyEvents > 0 ? 'amber' : 'gray'} />
        <DataQualityCard label={t('dashboard.totalEvents', settings.uiLanguage)} value={analyticsSummary.totalEvents} tone="sky" />
        <DataQualityCard label={t('dashboard.totalActions', settings.uiLanguage)} value={analyticsSummary.totalActions} tone="sky" />
        <DataQualityCard label={t('dashboard.derivedPoints', settings.uiLanguage)} value={analyticsSummary.derivedOutcomePoints.total} tone="amber" />
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-900/30">
        <button
          type="button"
          onClick={() => setShowQualityDetails(current => !current)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-expanded={showQualityDetails}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className={dataQuality.errors > 0 ? 'text-red-500' : dataQuality.warnings > 0 ? 'text-amber-500' : 'text-green-500'} />
            {showQualityDetails ? t('dashboard.hideIssues', settings.uiLanguage) : t('dashboard.reviewIssues', settings.uiLanguage)}
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] dark:bg-gray-800">{qualityDrilldown.length}</span>
          </span>
          <ChevronDown size={15} className={`transition-transform ${showQualityDetails ? 'rotate-180' : ''}`} />
        </button>
        {showQualityDetails && (
          <div className="grid gap-2 border-t border-gray-200 p-3 dark:border-gray-700 md:grid-cols-2 xl:grid-cols-3">
            {qualityDrilldown.length === 0 ? (
              <p className="text-xs text-green-700 dark:text-green-300">{t('dashboard.noQualityIssues', settings.uiLanguage)}</p>
            ) : qualityDrilldown.map(group => (
              <div key={group.code} className="rounded-md border border-gray-200 bg-white p-2.5 text-xs dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-bold ${group.severity === 'error' ? 'text-red-600' : group.severity === 'warning' ? 'text-amber-600' : 'text-sky-600'}`}>
                    {group.code.replaceAll('_', ' ')}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-bold dark:bg-gray-800">{group.count}</span>
                </div>
                <p className="mt-1 text-gray-500 dark:text-gray-400">
                  {t('dashboard.issueEvents', settings.uiLanguage)}: {group.eventNos.length > 0 ? group.eventNos.join(', ') : '-'}
                </p>
              </div>
            ))}
          </div>
        )}
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
              <h3 className="text-xs font-bold text-gray-500 uppercase">{t('dashboard.fieldMap', settings.uiLanguage)}</h3>
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
                      placeholder={t('dashboard.selectEventSequence', settings.uiLanguage)}
                      className="max-w-xs"
                    />
                  );
                })()}
                <div className="flex gap-2 bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                  <button 
                    onClick={() => setMapMode('heatmap')}
                    aria-pressed={mapMode === 'heatmap'}
                    className={`px-3 py-1 text-xs font-medium rounded-lg ${mapMode === 'heatmap' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >{t('dashboard.heatmap', settings.uiLanguage)}</button>
                  <button 
                    onClick={() => setMapMode('sequence')}
                    aria-pressed={mapMode === 'sequence'}
                    className={`px-3 py-1 text-xs font-medium rounded-lg ${mapMode === 'sequence' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >{t('dashboard.sequence', settings.uiLanguage)}</button>
                  <button 
                    onClick={() => setMapMode('result')}
                    aria-pressed={mapMode === 'result'}
                    className={`px-3 py-1 text-xs font-medium rounded-lg ${mapMode === 'result' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >{t('dashboard.result', settings.uiLanguage)}</button>
                </div>
              </div>
            </div>

            <div className="mb-3 grid w-full grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-4 xl:grid-cols-7">
              <div className="col-span-2 flex items-center justify-between md:col-span-4 xl:col-span-7">
                <span className="text-[11px] font-bold uppercase text-gray-500 dark:text-gray-400">{t('dashboard.mapFilters', settings.uiLanguage)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMapTeamFilter('ALL');
                    setMapSkillFilter('ALL');
                    setMapResultFilter('ALL');
                    setMapFoulFilter('ALL');
                    setMapAreaFilter('ALL');
                    setMapTimeFrom(undefined);
                    setMapTimeTo(undefined);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-sky-600"
                >
                  <FilterX size={13} /> {t('dashboard.clearMapFilters', settings.uiLanguage)}
                </button>
              </div>
              <MapFilterSelect label={t('input.team', settings.uiLanguage)} value={mapTeamFilter} options={mapQueryOptions.teams} allLabel={t('table.allTeams', settings.uiLanguage)} onChange={setMapTeamFilter} />
              <MapFilterSelect label={t('input.skill', settings.uiLanguage)} value={mapSkillFilter} options={mapQueryOptions.skills} allLabel={t('table.allSkills', settings.uiLanguage)} onChange={setMapSkillFilter} />
              <MapFilterSelect label={t('input.result', settings.uiLanguage)} value={mapResultFilter} options={mapQueryOptions.results} allLabel={t('table.allResults', settings.uiLanguage)} onChange={setMapResultFilter} />
              <MapFilterSelect label={t('table.foul', settings.uiLanguage)} value={mapFoulFilter} options={['with-foul', ...mapQueryOptions.fouls]} allLabel={t('dashboard.allFouls', settings.uiLanguage)} specialLabel={t('dashboard.withFoul', settings.uiLanguage)} onChange={setMapFoulFilter} />
              <MapFilterSelect label={t('input.area', settings.uiLanguage)} value={mapAreaFilter} options={mapQueryOptions.areas} allLabel={t('table.allAreas', settings.uiLanguage)} onChange={setMapAreaFilter} />
              <MapTimeInput label={t('dashboard.timeFrom', settings.uiLanguage)} value={mapTimeFrom} onChange={setMapTimeFrom} />
              <MapTimeInput label={t('dashboard.timeTo', settings.uiLanguage)} value={mapTimeTo} onChange={setMapTimeTo} invalid={mapTimeFrom !== undefined && mapTimeTo !== undefined && mapTimeFrom > mapTimeTo} />
            </div>
            
            {(filterSport !== 'ALL' || matchInfo.sportType) && (
              <FieldSequenceMap 
                sportType={filterSport !== 'ALL' ? filterSport : matchInfo.sportType} 
                events={events}
                mode={mapMode}
                selectedEventId={selectedEventId}
                teamFilter={mapTeamFilter}
                skillFilter={mapSkillFilter}
                resultFilter={mapResultFilter}
                foulFilter={mapFoulFilter}
                areaFilter={mapAreaFilter}
                timeFrom={mapTimeFrom}
                timeTo={mapTimeTo}
                teamAName={teams[0]?.code ?? 'Team A'}
                teamBName={teams[1]?.code ?? 'Team B'}
                onEventClick={(event, action) => {
                  setSelectedMapAction({ event, action });
                  setSelectedEventId(event.id);
                }}
                onGoToVideoTime={(videoTime) => setSeekRequest(Math.max(0, videoTime - 3))}
              />
            )}
            
            {selectedMapAction && (
              <div className="w-full mt-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-sky-100 dark:border-sky-900/50 shadow-sm relative">
                <button 
                  onClick={() => setSelectedMapAction(null)}
                  aria-label={t('dashboard.closeDetails', settings.uiLanguage)}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <X size={16} />
                </button>
                <h4 className="text-xs font-bold text-sky-600 dark:text-sky-400 mb-2 uppercase">{t('dashboard.actionDetails', settings.uiLanguage)}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-500">{t('dashboard.eventNo', settings.uiLanguage)}:</div>
                  <div className="font-semibold">{selectedMapAction.event.no}</div>
                  <div className="text-gray-500">{t('dashboard.point', settings.uiLanguage)}:</div>
                  <div className="font-semibold">{selectedMapAction.event.point}</div>
                  <div className="text-gray-500">{t('input.team', settings.uiLanguage)}:</div>
                  <div className="font-semibold text-sky-600">{selectedMapAction.action.teamCode}</div>
                  <div className="text-gray-500">{t('input.skill', settings.uiLanguage)}:</div>
                  <div className="font-semibold">{selectedMapAction.action.skillCode}</div>
                  {(selectedMapAction.action.playerNumber || selectedMapAction.action.playerName) && (
                    <>
                      <div className="text-gray-500">{t('table.player', settings.uiLanguage)}:</div>
                      <div className="font-semibold">{[selectedMapAction.action.playerNumber ? `#${selectedMapAction.action.playerNumber}` : '', selectedMapAction.action.playerName].filter(Boolean).join(' ')}</div>
                    </>
                  )}
                  <div className="text-gray-500">{t('input.area', settings.uiLanguage)}:</div>
                  <div className="font-semibold">{selectedMapAction.action.areaLabel || selectedMapAction.action.outZone || selectedMapAction.action.areaCode || '-'}</div>
                  <div className="text-gray-500">{t('dashboard.precision', settings.uiLanguage)}:</div>
                  <div className="font-semibold">{selectedMapAction.action.precision || selectedMapAction.action.areaResolution || selectedMapAction.action.areaMode || '-'}</div>
                  {selectedMapAction.action.foulCode && (
                    <>
                      <div className="text-gray-500">{t('table.foul', settings.uiLanguage)}:</div>
                      <div className="font-semibold text-amber-600">{selectedMapAction.action.foulLabel || selectedMapAction.action.foulCode}</div>
                    </>
                  )}
                  <div className="text-gray-500">{t('input.result', settings.uiLanguage)}:</div>
                  <div className={`font-semibold ${selectedMapAction.action.resultCode === 'Yes' ? 'text-green-600' : selectedMapAction.action.resultCode === 'Out' ? 'text-red-600' : 'text-gray-600'}`}>
                    {selectedMapAction.action.resultCode}
                  </div>
                  {(() => {
                    const vt = selectedMapAction.action.videoTime ?? selectedMapAction.event.videoTime;
                    if (vt !== undefined && vt !== null) {
                      return (
                        <>
                          <div className="text-gray-500">{t('dashboard.videoTime', settings.uiLanguage)}:</div>
                          <div className="font-semibold text-sky-600 cursor-pointer hover:underline" onClick={() => {
                            setSeekRequest(Math.max(0, vt - 3));
                          }}>
                            {formatPreciseTime(vt)} · {t('dashboard.goToVideo', settings.uiLanguage)}
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewState({ isActive: true, eventRow: selectedMapAction.event, loop: true })}
                  className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-sky-600 px-3 text-xs font-bold text-white hover:bg-sky-500"
                >
                  {t('dashboard.openKeyMoment', settings.uiLanguage)}
                </button>
              </div>
            )}
          </div>
        </div>
        </Suspense>
      ) : (
        <div className="text-center py-8 text-gray-500 text-sm">
          {t('dashboard.noData', settings.uiLanguage)}
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

function DataQualityCard({ label, value, tone }: { label: string, value: number, tone: 'green' | 'red' | 'amber' | 'gray' | 'sky' }) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-100 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/40',
    red: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40',
    amber: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40',
    gray: 'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
    sky: 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900/40',
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">{label}</div>
      <div className="text-lg font-black leading-tight">{value}</div>
    </div>
  );
}

function MapFilterSelect({
  label,
  value,
  options,
  allLabel,
  specialLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  specialLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
      {label}
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-md border border-gray-300 bg-white px-2 text-xs font-normal normal-case text-gray-800 outline-none focus:border-sky-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        <option value="ALL">{allLabel}</option>
        {options.map(option => (
          <option key={option} value={option}>{option === 'with-foul' ? specialLabel : option}</option>
        ))}
      </select>
    </label>
  );
}

function MapTimeInput({
  label,
  value,
  invalid = false,
  onChange,
}: {
  label: string;
  value?: number;
  invalid?: boolean;
  onChange: (value?: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
      {label}
      <input
        type="number"
        min="0"
        step="0.1"
        value={value ?? ''}
        onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        className={`h-9 min-w-0 rounded-md border bg-white px-2 text-xs font-normal text-gray-800 outline-none focus:border-sky-500 dark:bg-gray-900 dark:text-gray-100 ${invalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
      />
    </label>
  );
}

function CoachPrintSummary({
  language,
  sportLabel,
  teams,
  analytics,
  dataQuality,
}: {
  language: 'th' | 'en';
  sportLabel: string;
  teams: Team[];
  analytics: AnalyticsSummary;
  dataQuality: DataQualityReport;
}) {
  const topSkills = Object.entries(analytics.skillCounts).sort((left, right) => right[1] - left[1]).slice(0, 5);
  const topAreas = Object.entries(analytics.areaCounts).sort((left, right) => right[1] - left[1]).slice(0, 5);

  return (
    <section className="coach-print-summary hidden" aria-hidden="true">
      <header>
        <h1>SPORTSCOUT · {t('dashboard.coachSummary', language)}</h1>
        <p>{sportLabel} · {teams.map(team => team.code).join(' vs ') || '-'}</p>
      </header>
      <div className="coach-print-metrics">
        <div><strong>{analytics.totalEvents}</strong><span>{t('dashboard.totalEvents', language)}</span></div>
        <div><strong>{analytics.totalActions}</strong><span>{t('dashboard.totalActions', language)}</span></div>
        <div><strong>{analytics.derivedOutcomePoints.total}</strong><span>{t('dashboard.derivedPoints', language)}</span></div>
        <div><strong>{dataQuality.incompleteEvents}</strong><span>{t('dashboard.incomplete', language)}</span></div>
      </div>
      <p className="coach-print-note">{t('dashboard.derivedPointsHelp', language)}</p>
      <div className="coach-print-columns">
        <div><h2>{language === 'th' ? 'ทักษะที่พบบ่อย' : 'Top Skills'}</h2>{topSkills.map(([key, value]) => <p key={key}>{key}<strong>{value}</strong></p>)}</div>
        <div><h2>{language === 'th' ? 'พื้นที่ที่พบบ่อย' : 'Top Areas'}</h2>{topAreas.map(([key, value]) => <p key={key}>{key}<strong>{value}</strong></p>)}</div>
        <div><h2>{t('dashboard.dataQuality', language)}</h2><p>{t('dashboard.valid', language)}<strong>{dataQuality.validEvents}</strong></p><p>{t('dashboard.warnings', language)}<strong>{dataQuality.warnings}</strong></p><p>{t('dashboard.legacy', language)}<strong>{dataQuality.legacyEvents}</strong></p></div>
      </div>
    </section>
  );
}
