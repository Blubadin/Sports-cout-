import React, { useMemo } from 'react';
import { EventRow, Team, MatchInfo, SportType } from '../../types';

interface SportSpecificKPIsProps {
  events: EventRow[];
  teams: Team[];
  matchInfo: MatchInfo;
  teamFilter: 'ALL' | 'teamA' | 'teamB';
  uiLanguage: 'en' | 'th';
}

export default function SportSpecificKPIs({ events, teams, matchInfo, teamFilter, uiLanguage }: SportSpecificKPIsProps) {
  const sport = matchInfo.sportType;
  const teamA = teams[0]?.code ?? 'Team A';
  const teamB = teams[1]?.code ?? 'Team B';

  const kpis = useMemo(() => {
    let filteredEvents = events.filter(e => e.sportType === sport);
    if (teamFilter === 'teamA') {
      filteredEvents = filteredEvents.filter(e => e.actions.some(a => a.teamCode === teamA));
    } else if (teamFilter === 'teamB') {
      filteredEvents = filteredEvents.filter(e => e.actions.some(a => a.teamCode === teamB));
    }

    const data: Array<{ label: string; thLabel: string; value: string; color: string }> = [];

    const getActionsBySkill = (skillList: string[]) => {
      const matched: any[] = [];
      filteredEvents.forEach(ev => {
        ev.actions.forEach(a => {
          if (a.skill && skillList.includes(a.skill.toUpperCase())) {
            matched.push({ ...a, resultText: ev.resultText });
          }
        });
      });
      return matched;
    };

    if (sport === 'volleyball') {
      const serves = getActionsBySkill(['SRV']);
      const totalServes = serves.length;
      const serveAces = serves.filter(s => s.resultText === '+1').length;
      const serveErrors = serves.filter(s => s.resultText === '-1').length;
      const serveEfficiency = totalServes > 0 ? ((serveAces - serveErrors) / totalServes * 100).toFixed(1) : '0.0';
      
      const receives = getActionsBySkill(['RCV']);
      const totalReceives = receives.length;
      const receiveExcellent = receives.filter(r => r.resultText === '+1').length;
      const receiveErrors = receives.filter(r => r.resultText === '-1').length;
      const receiveEfficiency = totalReceives > 0 ? ((receiveExcellent - receiveErrors) / totalReceives * 100).toFixed(1) : '0.0';

      const attacks = getActionsBySkill(['ATK', 'SPK']);
      const attackErrors = attacks.filter(a => a.resultText === '-1').length;

      const blocks = getActionsBySkill(['BLK']);
      const blockPoints = blocks.filter(b => b.resultText === '+1').length;

      data.push(
        { label: 'Serve Efficiency', thLabel: 'ประสิทธิภาพการเสิร์ฟ', value: `${serveEfficiency}%`, color: 'text-blue-600 dark:text-blue-400' },
        { label: 'Receive Efficiency', thLabel: 'ประสิทธิภาพการรับเสิร์ฟ', value: `${receiveEfficiency}%`, color: 'text-indigo-600 dark:text-indigo-400' },
        { label: 'Attack Errors', thLabel: 'ตบเสีย (Attack Errors)', value: attackErrors.toString(), color: 'text-red-600 dark:text-red-400' },
        { label: 'Block Points', thLabel: 'แต้มจากการบล็อก', value: blockPoints.toString(), color: 'text-green-600 dark:text-green-400' },
      );
    } else if (sport === 'badminton') {
      const smashes = getActionsBySkill(['SMH']);
      const smashSuccess = smashes.filter(s => s.resultText === '+1').length;
      const smashRate = smashes.length > 0 ? (smashSuccess / smashes.length * 100).toFixed(1) : '0.0';

      const nets = getActionsBySkill(['NET']);
      const netSuccess = nets.filter(n => n.resultText === '+1').length;

      data.push(
        { label: 'Smash Success Rate', thLabel: 'อัตราความสำเร็จลูกตบ', value: `${smashRate}%`, color: 'text-orange-600 dark:text-orange-400' },
        { label: 'Net Play Winners', thLabel: 'แต้มหน้าเน็ต', value: netSuccess.toString(), color: 'text-teal-600 dark:text-teal-400' }
      );
    } else if (sport === 'basketball') {
      const shots = getActionsBySkill(['SHT', 'LAY', '3PT']);
      const made = shots.filter(s => s.resultText === '+1').length;
      const shotRate = shots.length > 0 ? (made / shots.length * 100).toFixed(1) : '0.0';

      const rebounds = getActionsBySkill(['REB']);
      const assists = getActionsBySkill(['AST']);

      data.push(
        { label: 'Field Goal %', thLabel: 'ความแม่นยำในการยิง', value: `${shotRate}%`, color: 'text-orange-600 dark:text-orange-400' },
        { label: 'Rebounds', thLabel: 'รีบาวด์', value: rebounds.length.toString(), color: 'text-blue-600 dark:text-blue-400' },
        { label: 'Assists', thLabel: 'แอสซิสต์', value: assists.length.toString(), color: 'text-emerald-600 dark:text-emerald-400' }
      );
    } else if (sport === 'football') {
      const shots = getActionsBySkill(['SHT']);
      const goals = shots.filter(s => s.resultText === '+1').length;
      
      const passes = getActionsBySkill(['PAS', 'CRS']);
      const passSuccess = passes.filter(p => p.resultText !== '-1').length;
      const passRate = passes.length > 0 ? (passSuccess / passes.length * 100).toFixed(1) : '0.0';

      data.push(
        { label: 'Goals', thLabel: 'ประตู', value: goals.toString(), color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Pass Accuracy', thLabel: 'ความแม่นยำการส่งบอล', value: `${passRate}%`, color: 'text-sky-600 dark:text-sky-400' },
        { label: 'Total Shots', thLabel: 'โอกาสยิง', value: shots.length.toString(), color: 'text-orange-600 dark:text-orange-400' }
      );
    } else if (sport === 'tennis') {
      const serves = getActionsBySkill(['SRV']);
      const aces = serves.filter(s => s.resultText === '+1').length;

      const unforced = filteredEvents.filter(e => e.resultText === '-1').length;

      data.push(
        { label: 'Aces', thLabel: 'เสิร์ฟเอซ', value: aces.toString(), color: 'text-green-600 dark:text-green-400' },
        { label: 'Unforced Errors', thLabel: 'ตีเสียเอง', value: unforced.toString(), color: 'text-red-600 dark:text-red-400' }
      );
    }

    return data;
  }, [events, sport, teamFilter, teamA, teamB]);

  if (kpis.length === 0) return null;

  return (
    <div className="bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-xl mb-6">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
        {uiLanguage === 'th' ? 'สถิติเฉพาะกีฬา (Sport-Specific KPIs)' : 'Sport-Specific KPIs'}
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-gray-500 mb-1">{uiLanguage === 'th' ? kpi.thLabel : kpi.label}</span>
            <span className={`text-xl font-bold font-mono ${kpi.color}`}>{kpi.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
