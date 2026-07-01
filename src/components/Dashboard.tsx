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

export default function Dashboard() {
  const { events, matchInfo, changeSportType, teams, setSeekRequest, settings } = useScoutContext();
  const [filterSport, setFilterSport] = useState<SportType | 'ALL'>('ALL');
  const [mapMode, setMapMode] = useState<'heatmap' | 'sequence' | 'result'>('heatmap');
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();


  const [selectedMapAction, setSelectedMapAction] = useState<{event: any, action: any} | null>(null);

  const stats = useMemo(() => {
    // ... rest of useMemo ...
    let filteredEvents = events;
    if (filterSport !== 'ALL') {
      filteredEvents = events.filter(e => e.sportType === filterSport);
    }

    let total = filteredEvents.length;
    let yes = 0, out = 0, pass = 0;
    
    const teamCounts: Record<string, number> = {};
    const skillCounts: Record<string, number> = {};
    const areaCounts: Record<string, number> = {};
    
    let totalActions = 0;
    let attackingSkills = 0;
    let defensiveSkills = 0;

    let teamAScore = 0;
    let teamBScore = 0;
    const teamA = teams[0]?.code;
    const teamB = teams[1]?.code;

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
        if (e.resultText === '+1') {
          if (lastTeam === teamA) teamAScore++;
          else if (lastTeam === teamB) teamBScore++;
        } else if (e.resultText === '-1') {
          if (lastTeam === teamA) teamBScore++;
          else if (lastTeam === teamB) teamAScore++;
        }
      }
      
      if (e.actions && e.actions.length > 0) {
        e.actions.forEach(action => {
          totalActions++;
          const team = action.teamCode;
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
            skillCounts[skill] = (skillCounts[skill] || 0) + 1;
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
          }
          if (area) areaCounts[area] = (areaCounts[area] || 0) + 1;
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
            skillCounts[skill] = (skillCounts[skill] || 0) + 1;
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
          }
          if (area && !['Yes', 'Out', 'Pass'].includes(area)) {
            areaCounts[area] = (areaCounts[area] || 0) + 1;
          }
        }
      }
    });

    const uniqueSkills = Object.keys(skillCounts).length;
    const uniqueAreas = Object.keys(areaCounts).length;

    // Derived metrics for radar
    const radarData = [
      { name: 'Success', value: total > 0 ? (yes / total) * 100 : 0 },
      { name: 'Error Control', value: total > 0 ? 100 - (out / total) * 100 : 0 },
      { name: 'Diversity', value: Math.min((uniqueSkills / 6) * 100, 100) },
      { name: 'Coverage', value: Math.min((uniqueAreas / 6) * 100, 100) },
      { name: 'Attack', value: totalActions > 0 ? (attackingSkills / totalActions) * 100 * 2 : 0 },
      { name: 'Defense', value: totalActions > 0 ? (defensiveSkills / totalActions) * 100 * 2 : 0 },
    ].map(d => ({ ...d, value: Math.min(Math.max(d.value, 0), 100) })); // clamp 0-100

    const barData = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    const pieData = [
      { name: 'Yes (+1)', value: yes, color: '#10b981' },
      { name: 'Out (-1)', value: out, color: '#ef4444' },
      { name: 'Pass (0)', value: pass, color: '#6b7280' },
    ].filter(d => d.value > 0);

    return { total, yes, out, pass, teamAScore, teamBScore, teamCounts, skillCounts, areaCounts, radarData, barData, pieData };
  }, [events, filterSport, teams]);

  const successRate = stats.total > 0 ? ((stats.yes / stats.total) * 100).toFixed(1) : '0.0';

  const getTopEntry = (record: Record<string, number>): [string, number] => {
    return Object.entries(record).sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  };

  const topTeam = getTopEntry(stats.teamCounts);
  const topSkill = getTopEntry(stats.skillCounts);
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

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mt-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex items-center gap-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {settings.uiLanguage === 'th' ? 'แดชบอร์ดสรุปผล (Summary Dashboard)' : 'Summary Dashboard'}
          </h2>
          {teams.length >= 2 && (
            <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-900 px-4 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="font-bold text-gray-800 dark:text-gray-200">{teams[0]?.code}</span>
              <span className="text-xl font-black text-sky-600 dark:text-sky-400">{stats.teamAScore}</span>
              <span className="text-gray-400 font-medium">-</span>
              <span className="text-xl font-black text-sky-600 dark:text-sky-400">{stats.teamBScore}</span>
              <span className="font-bold text-gray-800 dark:text-gray-200">{teams[1]?.code}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4 text-sm z-50">
          <div className="flex items-center gap-2">
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

          <div className="flex items-center gap-2">
            <span className="text-xs text-sky-700 dark:text-sky-400 font-semibold">
              {settings.uiLanguage === 'th' ? 'กีฬาที่บันทึก:' : 'Active Sport:'}
            </span>
            <div className="w-40">
              <CustomSelect 
                value={matchInfo.sportType || 'volleyball'} 
                onChange={(v) => changeSportType(v as SportType)}
                options={sportOptions}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 mb-6 hide-scrollbar">
        <StatCard title={settings.uiLanguage === 'th' ? 'จำนวนเหตุการณ์ทั้งหมด' : 'Total Events'} value={stats.total} color="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400" />
        <StatCard title={settings.uiLanguage === 'th' ? 'ได้แต้ม (+1)' : 'Success (+1)'} value={stats.yes} color="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" />
        <StatCard title={settings.uiLanguage === 'th' ? 'เสียแต้ม (-1)' : 'Errors (-1)'} value={stats.out} color="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" />
        <StatCard title={settings.uiLanguage === 'th' ? 'อัตราความสำเร็จ' : 'Success Rate'} value={`${successRate}%`} color="bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400" />
        <StatCard title={settings.uiLanguage === 'th' ? 'ทีมเด่น' : 'Top Team'} value={`${topTeam[0]} (${topTeam[1]})`} color="bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300" />
        <StatCard title={settings.uiLanguage === 'th' ? 'ทักษะเด่น' : 'Top Skill'} value={`${topSkill[0]} (${topSkill[1]})`} color="bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300" />
        <StatCard title={settings.uiLanguage === 'th' ? 'พื้นที่เด่น' : 'Top Area'} value={`${topArea[0]} (${topArea[1]})`} color="bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300" />
      </div>

      {stats.total > 0 ? (
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading charts...</div>}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SkillFrequencyChart data={stats.barData} />

            <ResultDistributionChart data={stats.pieData} />

            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl flex flex-col items-center">
              <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase w-full text-left">
                {settings.uiLanguage === 'th' ? 'เรดาร์สมรรถภาพ (Performance Radar)' : 'Performance Radar'}
              </h3>
              {stats.total < 5 && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded w-full text-center mb-2">
                  {settings.uiLanguage === 'th' 
                    ? 'ข้อมูลยังน้อย กราฟอาจยังไม่สะท้อนภาพรวมจริง' 
                    : 'Few data points, radar might not reflect the full picture yet.'}
                </div>
              )}
              <RadarChart data={stats.radarData} size={180} />
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl lg:col-span-3 flex flex-col gap-4">
              <TeamComparisonChart events={filterSport === 'ALL' ? events : events.filter(e => e.sportType === filterSport)} team1={teams[0]?.code} team2={teams[1]?.code} />
            </div>

          <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl lg:col-span-3 flex flex-col items-center">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full mb-4 gap-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase">Field Intelligence Map</h3>
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                {mapMode === 'sequence' && (
                  <select 
                    className="px-2 py-1 border rounded bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white text-xs max-w-xs"
                    value={selectedEventId || ''}
                    onChange={(e) => setSelectedEventId(e.target.value || undefined)}
                  >
                    <option value="">-- เลือก Event เพื่อดู Sequence --</option>
                    {events.filter(e => filterSport === 'ALL' || e.sportType === filterSport).map((e, idx) => (
                      <option key={`${e.id}-${idx}`} value={e.id}>
                        Event #{e.no} {e.actions.length > 0 ? `(${e.actions[0].teamCode || 'No Team'})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex gap-2 bg-white dark:bg-gray-800 p-1 rounded-md border border-gray-200 dark:border-gray-700">
                  <button 
                    onClick={() => setMapMode('heatmap')}
                    className={`px-3 py-1 text-xs font-medium rounded ${mapMode === 'heatmap' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >Heatmap</button>
                  <button 
                    onClick={() => setMapMode('sequence')}
                    className={`px-3 py-1 text-xs font-medium rounded ${mapMode === 'sequence' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >Sequence</button>
                  <button 
                    onClick={() => setMapMode('result')}
                    className={`px-3 py-1 text-xs font-medium rounded ${mapMode === 'result' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
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
                          <div className="font-semibold text-blue-600 cursor-pointer hover:underline" onClick={() => {
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
    <div className={`p-3 rounded-lg border border-transparent min-w-[120px] flex-shrink-0 ${color}`}>
      <div className="text-xs uppercase font-semibold opacity-80">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
