import React, { useState, useMemo, useEffect } from 'react';
import { 
  Trophy, Flag, Shield, Activity, Target, Flame, AlertTriangle, 
  CheckCircle2, Video, Printer, Eye, BarChart2, TrendingUp, 
  Lightbulb, Layers, HelpCircle, ArrowRight, UserCheck, ShieldAlert,
  Gauge, Crosshair
} from 'lucide-react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { EventRow, Team, Action } from '../../types';
import { SPORT_TEMPLATES } from '../../sports';
import { formatPreciseTime } from '../../utils';
import { buildVolleyballPyramidSummary } from '../../volleyball/volleyballPyramid';
import { buildDataQualityReport } from '../../utils/scoutData';
import { getSportRuleEngine } from '../../sports/rules/registry';
import { buildAnalyticsSummary } from '../../utils/analyticsEngine';
import { loadBadmintonTrackingAnalysis, type TrackingAnalysis } from '../../services/storage/trackingStorage';
import ReportClipModal from '../ReportClipModal';
import VolleyballPyramidPanel from '../VolleyballPyramidPanel';

interface FullCoachReportProps {
  onGoToVideoTime?: (time: number) => void;
}

export default function FullCoachReport({ onGoToVideoTime }: FullCoachReportProps) {
  const { 
    events, teams, matchInfo, settings 
  } = useScoutContext();
  const { activeProjectId } = useWorkspace();
  const isThai = settings.uiLanguage === 'th';

  const [selectedClipEvent, setSelectedClipEvent] = useState<EventRow | null>(null);
  const [trackingAnalysis, setTrackingAnalysis] = useState<TrackingAnalysis | null>(null);

  useEffect(() => {
    let active = true;
    setTrackingAnalysis(null);
    if (!activeProjectId) return () => { active = false; };

    loadBadmintonTrackingAnalysis(activeProjectId).then((analysis) => {
      if (active) setTrackingAnalysis(analysis);
    }).catch((err) => {
      if (active) setTrackingAnalysis(null);
      console.warn('Failed to load tracking analysis for coach report:', err);
    });
    return () => {
      active = false;
    };
  }, [activeProjectId]);

  const team1 = teams[0] || { id: 't1', code: 'Team A', name: 'Team A', thaiName: 'ทีม A' };
  const team2 = teams[1] || { id: 't2', code: 'Team B', name: 'Team B', thaiName: 'ทีม B' };

  // Canonical Sport Scoring Engine Resolution (PDF §59, §13)
  const ruleEngine = useMemo(() => getSportRuleEngine(matchInfo.sportType), [matchInfo.sportType]);

  const matchScores = useMemo(() => {
    const scores: Record<string, number> = {
      [team1.code]: 0,
      [team2.code]: 0,
    };
    for (const ev of events) {
      const resolution = ruleEngine.resolveEvent(ev.actions || [], {
        sportType: matchInfo.sportType,
        teamCodes: [team1.code, team2.code],
      }, ev);
      for (const [teamCode, delta] of Object.entries(resolution.teamScoreDeltas)) {
        scores[teamCode] = (scores[teamCode] ?? 0) + delta;
      }
    }
    return scores;
  }, [ruleEngine, events, matchInfo.sportType, team1.code, team2.code]);

  const teamAScore = matchScores[team1.code] ?? 0;
  const teamBScore = matchScores[team2.code] ?? 0;

  // Canonical Analytics Engine (PDF §13)
  const analyticsSummary = useMemo(() => {
    return buildAnalyticsSummary(events, {
      sportType: matchInfo.sportType,
      teams,
      uiLanguage: settings.uiLanguage,
    });
  }, [events, matchInfo.sportType, teams, settings.uiLanguage]);

  const volleyballPyramidSummary = useMemo(() => {
    return buildVolleyballPyramidSummary(events);
  }, [events]);

  const dataQuality = useMemo(() => {
    return buildDataQualityReport(events);
  }, [events]);

  // 4-Level Skill Evaluation Metrics (Kasem Bundit / FIVB Standard)
  const evaluationMetrics = useMemo(() => {
    let totalEvaluated = 0;
    let level4Count = 0; // ++++ / Excellent / Ace / Kill / A-Pass
    let level3Count = 0; // +++ / Good / Effective / B-Pass / Touch Block
    let level2Count = 0; // ++ / Fair / In-Play / C-Pass
    let level1Count = 0; // - / Error / Miss / Blocked

    events.forEach(ev => {
      totalEvaluated++;
      if (ev.resultText === '+1') {
        level4Count++;
      } else if (ev.resultText === '-1') {
        level1Count++;
      } else {
        // In-play checks
        const hasGoodTag = ev.actions?.some(a => a.resultDetailCode?.includes('Good') || a.resultDetailCode?.includes('A-Pass'));
        if (hasGoodTag) level3Count++;
        else level2Count++;
      }
    });

    const pct = (cnt: number) => totalEvaluated > 0 ? ((cnt / totalEvaluated) * 100).toFixed(1) : '0.0';

    return {
      total: totalEvaluated,
      level4: { count: level4Count, pct: pct(level4Count) },
      level3: { count: level3Count, pct: pct(level3Count) },
      level2: { count: level2Count, pct: pct(level2Count) },
      level1: { count: level1Count, pct: pct(level1Count) },
    };
  }, [events]);

  // Spatial Zone Analysis (FIVB 9 Zones)
  const zoneAnalysis = useMemo(() => {
    const zoneCounts: Record<string, { total: number; kills: number; errors: number; serves: number; attacks: number }> = {
      '1': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
      '2': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
      '3': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
      '4': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
      '5': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
      '6': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
      '7': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
      '8': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
      '9': { total: 0, kills: 0, errors: 0, serves: 0, attacks: 0 },
    };

    events.forEach(ev => {
      ev.actions?.forEach(a => {
        const areaStr = String(a.areaCode || a.areaLabel || '');
        const matched = areaStr.match(/[1-9]/);
        if (matched) {
          const z = matched[0];
          if (zoneCounts[z]) {
            zoneCounts[z].total++;
            if (ev.resultText === '+1') zoneCounts[z].kills++;
            if (ev.resultText === '-1') zoneCounts[z].errors++;
            if (a.skillCode === 'SRV' || a.skillCode?.includes('SERVE')) zoneCounts[z].serves++;
            if (a.skillCode === 'ATK' || a.skillCode === 'SPK' || a.skillCode?.includes('ATTACK')) zoneCounts[z].attacks++;
          }
        }
      });
    });

    // Find hottest attack zone and weakest zone
    let hottestAttackZone = '4';
    let maxAttacks = -1;
    let highestErrorZone = '5';
    let maxErrors = -1;

    Object.entries(zoneCounts).forEach(([zone, data]) => {
      if (data.attacks > maxAttacks) {
        maxAttacks = data.attacks;
        hottestAttackZone = zone;
      }
      if (data.errors > maxErrors) {
        maxErrors = data.errors;
        highestErrorZone = zone;
      }
    });

    return {
      counts: zoneCounts,
      hottestAttackZone,
      maxAttacks,
      highestErrorZone,
      maxErrors,
    };
  }, [events]);

  // Key Moment Highlights (Aces, Kills, Crucial Errors) with Video Timestamps
  const keyMomentClips = useMemo(() => {
    return events
      .filter(ev => typeof ev.videoTime === 'number' && ev.videoTime > 0)
      .filter(ev => ev.resultText === '+1' || ev.resultText === '-1' || (ev.point >= 20))
      .slice(0, 10);
  }, [events]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      
      {/* 1. MATCH SNAPSHOT (TOP HEADER) */}
      <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 dark:border-[#263642] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 text-[10px] font-black uppercase tracking-wider">
                {matchInfo.sportType ? SPORT_TEMPLATES[matchInfo.sportType].name : 'Volleyball'} · 5Ws Standard Report
              </span>
              <span className="text-gray-400 text-xs font-mono">
                Kasem Bundit Sports Science Analytics Framework
              </span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-gray-50 tracking-tight">
              {matchInfo.matchName || `${team1.code} vs ${team2.code}`}
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              {isThai ? 'ผู้บันทึกสถิติ:' : 'Scouter:'} <span className="font-bold text-gray-700 dark:text-gray-300">{matchInfo.scouterName || 'Lead Analyst'}</span> · {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Printer size={15} />
              <span>{isThai ? 'พิมพ์รายงานโค้ช (Print PDF)' : 'Print PDF Report'}</span>
            </button>
          </div>
        </div>

        {/* Score & Competitor Match Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-gradient-to-r from-sky-50 via-white to-amber-50 dark:from-sky-950/40 dark:via-gray-900 dark:to-amber-950/40 p-6 rounded-2xl border border-gray-200 dark:border-[#263642]">
          <div className="text-center md:text-left space-y-1">
            <div className="text-3xl mb-1">{team1.icon || '🏐'}</div>
            <div className="text-lg font-black text-gray-900 dark:text-gray-100">{team1.name || team1.code}</div>
            <div className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">{team1.code} (Team A)</div>
          </div>

          <div className="text-center space-y-1">
            <div className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
              <span className="text-sky-600 dark:text-sky-400">{teamAScore}</span>
              <span className="text-gray-300 dark:text-gray-600 mx-3">-</span>
              <span className="text-amber-600 dark:text-amber-400">{teamBScore}</span>
            </div>
            <div className="text-[11px] font-extrabold uppercase text-gray-400 tracking-widest">
              {isThai ? 'คะแนนรวมที่บันทึก (Recorded Points)' : 'Total Match Points'}
            </div>
          </div>

          <div className="text-center md:text-right space-y-1">
            <div className="text-3xl mb-1">{team2.icon || '🏐'}</div>
            <div className="text-lg font-black text-gray-900 dark:text-gray-100">{team2.name || team2.code}</div>
            <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">{team2.code} (Team B)</div>
          </div>
        </div>

        {/* 5Ws Overview Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center">
            <div className="text-[10px] font-black text-gray-400 uppercase">1. WHO (ผู้เล่น)</div>
            <div className="text-sm font-black text-gray-800 dark:text-gray-200 mt-1">{teams.length} ทีมหลัก</div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center">
            <div className="text-[10px] font-black text-gray-400 uppercase">2. WHAT (ทักษะ)</div>
            <div className="text-sm font-black text-sky-600 dark:text-sky-400 mt-1">{events.length} เหตุการณ์</div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center">
            <div className="text-[10px] font-black text-gray-400 uppercase">3. WHERE (โซนสนาม)</div>
            <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1">9 โซนสากล</div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center">
            <div className="text-[10px] font-black text-gray-400 uppercase">4. WHEN (บริบทเวลา)</div>
            <div className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-1">{matchInfo.setOrGame ? `เซต ${matchInfo.setOrGame}` : 'ทั้งแมตช์'}</div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center col-span-2 sm:col-span-1">
            <div className="text-[10px] font-black text-gray-400 uppercase">5. HOW (คุณภาพ)</div>
            <div className="text-sm font-black text-amber-600 dark:text-amber-400 mt-1">4 ระดับคะแนน</div>
          </div>
        </div>
      </div>

      {/* 2. SKILL EVALUATION METRIC (4-LEVEL SCALING) */}
      <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100">
                {isThai ? 'ดัชนีชี้วัดผลลัพธ์ทักษะ 4 ระดับ (Skill Evaluation Metric)' : '4-Level Skill Evaluation Metrics'}
              </h2>
              <p className="text-xs text-gray-500">
                {isThai ? 'ประเมินคุณภาพทักษะตามมาตรฐาน ++++ (Excellent), +++ (Good), ++ (Fair), - (Error)' : 'Quality breakdown across rally outcomes'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Level 4 */}
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4.5 space-y-2">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
              <span className="text-xs font-black uppercase">4 คะแนน (++++ / Ace / Kill)</span>
              <CheckCircle2 size={16} />
            </div>
            <div className="text-3xl font-black text-emerald-800 dark:text-emerald-200">{evaluationMetrics.level4.count}</div>
            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {evaluationMetrics.level4.pct}% {isThai ? 'ของแอคชั่นทั้งหมด' : 'of total actions'}
            </div>
            <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 leading-relaxed">
              {isThai ? 'ลูกทำแต้มเด็ดขาด (Ace, Kill, A-Pass 100%, Kill Block, Perfect Dig)' : 'Direct winning points & perfect execution.'}
            </p>
          </div>

          {/* Level 3 */}
          <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-2xl p-4.5 space-y-2">
            <div className="flex items-center justify-between text-sky-700 dark:text-sky-300">
              <span className="text-xs font-black uppercase">3 คะแนน (+++ / Good / Effective)</span>
              <TrendingUp size={16} />
            </div>
            <div className="text-3xl font-black text-sky-800 dark:text-sky-200">{evaluationMetrics.level3.count}</div>
            <div className="text-xs font-bold text-sky-600 dark:text-sky-400">
              {evaluationMetrics.level3.pct}% {isThai ? 'ประสิทธิภาพสูง' : 'effective rate'}
            </div>
            <p className="text-[10px] text-sky-700/80 dark:text-sky-300/80 leading-relaxed">
              {isThai ? 'สร้างความได้เปรียบ (เสิร์ฟกดดัน, B-Pass, เซ็ตหลอก, Touch Block, Playable Dig)' : 'High quality tactical execution that creates scoring opportunities.'}
            </p>
          </div>

          {/* Level 2 */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4.5 space-y-2">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
              <span className="text-xs font-black uppercase">2 คะแนน (++ / Fair / In-Play)</span>
              <Activity size={16} />
            </div>
            <div className="text-3xl font-black text-amber-800 dark:text-amber-200">{evaluationMetrics.level2.count}</div>
            <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {evaluationMetrics.level2.pct}% {isThai ? 'เล่นต่อในระบบ' : 'in-play rate'}
            </div>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
              {isThai ? 'ลูกข้ามแดนปกติ (คู่แข่งรับง่าย, C-Pass บอลแก้, บอลเซ็ตห่างเน็ต)' : 'Neutral plays that keep the rally alive without decisive advantage.'}
            </p>
          </div>

          {/* Level 1 */}
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-4.5 space-y-2">
            <div className="flex items-center justify-between text-rose-700 dark:text-rose-300">
              <span className="text-xs font-black uppercase">1 คะแนน (- / Error / เสียแต้ม)</span>
              <AlertTriangle size={16} />
            </div>
            <div className="text-3xl font-black text-rose-800 dark:text-rose-200">{evaluationMetrics.level1.count}</div>
            <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
              {evaluationMetrics.level1.pct}% {isThai ? 'อัตราเสียคะแนน' : 'error rate'}
            </div>
            <p className="text-[10px] text-rose-700/80 dark:text-rose-300/80 leading-relaxed">
              {isThai ? 'ข้อผิดพลาด (เสิร์ฟเสีย, รับแตก, ตบติดบล็อก/ออก, ฟาวล์ตาข่าย)' : 'Unforced and forced errors resulting in lost points.'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. SPATIAL 9-ZONE HEATMAP & WEAKNESS EXPLANATION */}
      <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
              <Target size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100">
                {isThai ? 'การวิเคราะห์พิกัดสนาม 9 โซน (Court Spatial Heatmap & Weakness Analysis)' : 'Court Spatial Mapping (FIVB 9 Zones)'}
              </h2>
              <p className="text-xs text-gray-500">
                {isThai ? 'แสดงความหนาแน่นของการโจมตี เสิร์ฟ และจุดตกกระทบบอลเพื่อวินิจฉัยจุดอ่อน' : 'Visual breakdown of landing spots and target vulnerabilities'}
              </p>
            </div>
          </div>
        </div>

        {/* 2-Column: Left Court Heatmap, Right Tactical Insights & Zone Data */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* Left: Court Grid Visualizer */}
          <div className="lg:col-span-6 bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-200 dark:border-[#263642]">
            <div className="text-center mb-3">
              <span className="text-xs font-black uppercase text-gray-700 dark:text-gray-300 tracking-wider">
                {isThai ? 'แผนผัง 9 โซนมาตรฐาน (FIVB Spatial Distribution)' : 'FIVB 9-Zone Heatmap'}
              </span>
            </div>

            {/* Visual 9-Zone Grid */}
            <div className="grid grid-cols-3 gap-2 bg-[#f4cb93] p-3 rounded-2xl border-4 border-white shadow-inner aspect-[3/2] max-w-[420px] mx-auto text-gray-900">
              {[
                { zone: '4', labelTh: 'โซน 4 (หัวเสาซ้าย)', sub: 'Front Left', pos: 'แดนหน้า' },
                { zone: '3', labelTh: 'โซน 3 (บล็อกกลาง)', sub: 'Front Mid', pos: 'แดนหน้า' },
                { zone: '2', labelTh: 'โซน 2 (หัวเสาขวา)', sub: 'Front Right', pos: 'แดนหน้า' },
                { zone: '5', labelTh: 'โซน 5 (หลังซ้าย)', sub: 'Back Left', pos: 'แดนหลัง' },
                { zone: '6', labelTh: 'โซน 6 (หลังกลาง)', sub: 'Back Mid', pos: 'แดนหลัง' },
                { zone: '1', labelTh: 'โซน 1 (หลังขวา/เสิร์ฟ)', sub: 'Back Right', pos: 'แดนหลัง' },
              ].map(item => {
                const zData = zoneAnalysis.counts[item.zone] || { total: 0, attacks: 0, errors: 0, kills: 0 };
                const isHottest = zoneAnalysis.hottestAttackZone === item.zone;
                const isWeakest = zoneAnalysis.highestErrorZone === item.zone;

                return (
                  <div
                    key={item.zone}
                    className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
                      isHottest
                        ? 'bg-rose-500/80 text-white border-rose-300 shadow-md ring-2 ring-rose-400'
                        : isWeakest
                        ? 'bg-amber-500/70 text-white border-amber-300 shadow-md ring-2 ring-amber-400'
                        : 'bg-white/80 border-white/60 hover:bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-center text-[10px] font-black">
                      <span>ZONE {item.zone}</span>
                      <span className="opacity-75">{item.pos}</span>
                    </div>
                    <div className="text-center py-1">
                      <div className="text-lg font-black">{zData.total} <span className="text-[10px] font-normal">acts</span></div>
                      <div className="text-[9px] font-bold">
                        {zData.kills > 0 && <span className="text-emerald-700 font-extrabold mr-1">+{zData.kills}</span>}
                        {zData.errors > 0 && <span className="text-rose-900 font-extrabold">-{zData.errors}</span>}
                      </div>
                    </div>
                    <div className="text-[8px] text-center font-semibold truncate opacity-80">
                      {item.labelTh}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-center gap-4 mt-3 text-[10px] font-bold">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> โซนบุกสูงสุด (Hottest Attack)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> จุดผิดพลาดสะสม (Weakness Zone)</span>
            </div>
          </div>

          {/* Right: Coach Tactical Diagnosis based on Heatmap */}
          <div className="lg:col-span-6 space-y-4">
            <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-black text-xs uppercase">
                <Flame size={15} />
                <span>{isThai ? 'การวินิจฉัยจุดโจมตีหลัก (Offensive Pattern)' : 'Primary Offensive Vector'}</span>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                {isThai
                  ? `มีการขึ้นตีลูกและส่งบอลไปยังโซน ${zoneAnalysis.hottestAttackZone} บ่อยที่สุด (${zoneAnalysis.maxAttacks} ครั้ง) โดยเฉพาะการเล่นบอลโครงสร้างหัวเสาและการเซ็ตบอลแบบ In-system ดึงตัวบล็อกคู่แข่ง`
                  : `Zone ${zoneAnalysis.hottestAttackZone} received the highest attacking volume (${zoneAnalysis.maxAttacks} attacks), primarily utilizing outside hitters in transition.`}
              </p>
            </div>

            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-black text-xs uppercase">
                <ShieldAlert size={15} />
                <span>{isThai ? 'จุดอ่อนและช่องโหว่ในการรับ (Vulnerability Diagnosis)' : 'Defensive Vulnerability'}</span>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                {isThai
                  ? `โซน ${zoneAnalysis.highestErrorZone} มีอัตราลูกเสียและรับบอลแตกสูงสุด (${zoneAnalysis.maxErrors} ครั้ง) คู่แข่งมักเลือกจี้ลูกเสิร์ฟและตบปัดทอดมาที่มุมนี้ ควรปรับแนวการยืนของลิเบอโร่เพื่อปิดช่องว่าง`
                  : `Zone ${zoneAnalysis.highestErrorZone} registered the highest error and reception breakdowns (${zoneAnalysis.maxErrors} faults). Recommend adjusting defensive coverage.`}
              </p>
            </div>

            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-black text-xs uppercase">
                <Lightbulb size={15} />
                <span>{isThai ? 'คำแนะนำเชิงกลยุทธ์สำหรับโค้ช (Tactical Action Plan)' : 'Tactical Recommendations'}</span>
              </div>
              <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1.5 list-disc list-inside">
                <li>{isThai ? 'เน้นเสิร์ฟจี้ไปยัง Zone 5 และ Zone 6 ของคู่แข่งเพื่อตัดเกมรุกบอลเร็ว' : 'Target opponent Zone 5 & 6 on serve to disrupt quick middle attacks.'}</li>
                <li>{isThai ? 'ปรับตัวบล็อกกลาง (MB) ให้ยืนชิดเสาซ้ายมากขึ้นเพื่อปิดมุมตบฉีก' : 'Commit middle blocker slightly towards antenna to neutralize cross-court hits.'}</li>
              </ul>
            </div>
          </div>

        </div>
      </div>

      {/* 4. VOLLEYBALL PYRAMID SUMMARY */}
      {volleyballPyramidSummary && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-500 flex items-center justify-center">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100">
                {isThai ? 'พีระมิดประสิทธิภาพทักษะ (Skill Pyramid & Quality Levels)' : 'Volleyball Skill Pyramid'}
              </h2>
              <p className="text-xs text-gray-500">
                {isThai ? 'การเชื่อมโยงระหว่างการรับเสิร์ฟ (Pass) → เซ็ต (Set) → ตบทำแต้ม (Attack)' : 'Sequential transition from reception to attack conversion'}
              </p>
            </div>
          </div>

          <VolleyballPyramidPanel
            summary={volleyballPyramidSummary}
            language={settings.uiLanguage}
            interactive={false}
          />
        </div>
      )}

      {/* 5. KEY MOMENTS & VIDEO DRILLDOWN ("ดูคลิปประกอบ") */}
      <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
              <Video size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100">
                {isThai ? 'จังหวะสำคัญและการตรวจสอบคลิปวิดีโอ (Key Video Highlights)' : 'Key Moment Replays'}
              </h2>
              <p className="text-xs text-gray-500">
                {isThai ? 'คลิก "ดูคลิปประกอบ" เพื่อเปิดวิดีโอกระโดดไปยังจังหวะที่เลือกทันที' : 'Open video modal to inspect critical rally events'}
              </p>
            </div>
          </div>
        </div>

        {keyMomentClips.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 text-xs">
            {isThai ? 'ยังไม่มีจังหวะที่ผูกกับเวลาวิดีโอ (บันทึกเวลาบน Video Player เพื่อใช้งาน)' : 'No video timestamps logged yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {keyMomentClips.map((ev) => (
              <div
                key={ev.id}
                className="bg-gray-50 dark:bg-gray-900/60 p-3.5 rounded-2xl border border-gray-200 dark:border-[#263642] flex items-center justify-between hover:border-sky-500 transition-all group shadow-sm"
              >
                <div className="space-y-1 truncate pr-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      ev.resultText === '+1' ? 'bg-emerald-600 text-white' : ev.resultText === '-1' ? 'bg-rose-600 text-white' : 'bg-gray-700 text-gray-200'
                    }`}>
                      Pt #{ev.point} ({ev.resultText})
                    </span>
                    <span className="font-mono text-[11px] font-bold text-sky-600 dark:text-sky-400">
                      {formatPreciseTime(ev.videoTime || 0)}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                    {ev.thaiMeaningText || ev.eventText || ev.actions?.[0]?.skillCode || 'Moment'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedClipEvent(ev)}
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-md shadow-sky-500/20 active:scale-95"
                >
                  <Video size={14} />
                  <span>{isThai ? 'ดูคลิป' : 'Watch'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. MOVEMENT ANALYSIS (PDF §59, Phase 13: Displayed only when tracking data exists) */}
      {trackingAnalysis?.status === 'completed' && trackingAnalysis.summary && Object.keys(trackingAnalysis.summary.players || {}).length > 0 && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                <Gauge size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900 dark:text-gray-100">
                  {isThai ? '5. การวิเคราะห์การเคลื่อนที่ผู้เล่น (Movement Analysis)' : '5. Player Movement Analysis'}
                </h2>
                <p className="text-xs text-gray-500">
                  {isThai ? 'คำนวณจาก Optical Tracking จริง: ระยะทาง, ความเร็ว P95, และการครอบคลุมพื้นที่สนาม' : 'Calculated from optical player tracking: distance, robust P95 speed, court coverage'}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-black uppercase">
              {trackingAnalysis.gameType === 'singles' ? 'Singles (1v1)' : 'Doubles (2v2)'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(trackingAnalysis.summary.players).map(([playerId, m]) => (
              <div key={playerId} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-[#263642] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-sky-600 dark:text-sky-400 uppercase">
                    {playerId}
                  </span>
                  <span className="text-xs font-bold text-gray-500">
                    {m.totalDistanceMeters.toFixed(1)} m
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">{isThai ? 'ความเร็ว P95' : 'P95 Speed'}</div>
                    <div className="text-sm font-black text-gray-900 dark:text-white mt-0.5">{m.p95SpeedMps.toFixed(2)} m/s</div>
                  </div>
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">{isThai ? 'ความเร็วสูงสุด' : 'Max Speed'}</div>
                    <div className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">{m.maxSpeedMps.toFixed(2)} m/s</div>
                  </div>
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">{isThai ? 'การกระจายตัว' : 'Dispersion'}</div>
                    <div className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{m.basePosition.dispersion.toFixed(2)} m</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500">
                    <span>{isThai ? 'แดนหน้า / กลาง / หลัง' : 'Front / Mid / Rear'}</span>
                    <span>{m.courtCoverage.frontPercent.toFixed(0)}% / {m.courtCoverage.midPercent.toFixed(0)}% / {m.courtCoverage.rearPercent.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-800 h-2 rounded-full overflow-hidden flex">
                    <div className="bg-sky-500 h-full" style={{ width: `${m.courtCoverage.frontPercent}%` }} />
                    <div className="bg-emerald-500 h-full" style={{ width: `${m.courtCoverage.midPercent}%` }} />
                    <div className="bg-purple-500 h-full" style={{ width: `${m.courtCoverage.rearPercent}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. TRACKING QUALITY & AUDIT (PDF §59, Phase 13) */}
      {trackingAnalysis?.status === 'completed' && trackingAnalysis.quality && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-500 flex items-center justify-center">
                <Crosshair size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900 dark:text-gray-100">
                  {isThai ? '6. คุณภาพการแทร็กและความน่าเชื่อถือ (Tracking Quality & Audit)' : '6. Tracking Quality & Audit'}
                </h2>
                <p className="text-xs text-gray-500">
                  {isThai ? 'อัตราความครอบคลุม, ความเชื่อมั่นของโมเดล, และการตรวจสอบความถูกต้อง' : 'Detection coverage, confidence rating, and audit metrics'}
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
              trackingAnalysis.quality.lowConfidenceWarning
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
            }`}>
              {trackingAnalysis.quality.lowConfidenceWarning ? 'Warning: Low Confidence' : 'Validated Tracking'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'ความครอบคลุม' : 'Detection Coverage'}</div>
              <div className="text-xl font-black text-teal-600 mt-1">{(trackingAnalysis.quality.detectionCoverage * 100).toFixed(1)}%</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'ความเชื่อมั่นเฉลี่ย' : 'Avg Confidence'}</div>
              <div className="text-xl font-black text-sky-600 mt-1">{(trackingAnalysis.quality.confidence * 100).toFixed(1)}%</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'เวลาที่แทร็กหลุด' : 'Lost Track Time'}</div>
              <div className="text-xl font-black text-indigo-600 mt-1">{trackingAnalysis.quality.lostTimePercent.toFixed(1)}%</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'การปรับแก้ด้วยมือ' : 'Manual Edits'}</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{trackingAnalysis.quality.manualCorrections}</div>
            </div>
          </div>
        </div>
      )}

      {/* 6B. DATA QUALITY & COVERAGE */}
      {dataQuality && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-500 flex items-center justify-center">
              <UserCheck size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100">
                {isThai ? 'การตรวจสอบความสมบูรณ์ของข้อมูล (Data Quality Assurance)' : 'Data Quality & Verification'}
              </h2>
              <p className="text-xs text-gray-500">
                {isThai ? 'ประเมินความครอบคลุมของการระบุผู้เล่น ตำแหน่ง และความต่อเนื่องของแต้ม' : 'Reliability score and missing attribute audit'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'เหตุการณ์ที่สมบูรณ์' : 'Valid Events'}</div>
              <div className="text-xl font-black text-teal-600 mt-1">{dataQuality.validEvents} / {dataQuality.totalEvents}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'แอคชั่นทั้งหมด' : 'Total Actions'}</div>
              <div className="text-xl font-black text-sky-600 mt-1">{dataQuality.totalActions}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'การแจ้งเตือน' : 'Warnings'}</div>
              <div className="text-xl font-black text-indigo-600 mt-1">{dataQuality.warnings}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'ข้อผิดพลาด' : 'Errors'}</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{dataQuality.errors}</div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Clip Modal */}
      {selectedClipEvent && (
        <ReportClipModal
          isOpen={Boolean(selectedClipEvent)}
          onClose={() => setSelectedClipEvent(null)}
          videoTime={selectedClipEvent.videoTime || 0}
          title={`Point ${selectedClipEvent.point}: ${selectedClipEvent.thaiMeaningText || selectedClipEvent.eventText || ''}`}
          event={selectedClipEvent}
        />
      )}

    </div>
  );
}
