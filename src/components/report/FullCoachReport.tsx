import React, { useState, useMemo, useEffect } from 'react';
import { 
  Activity, Target, Flame, AlertTriangle, 
  CheckCircle2, Video, Printer, TrendingUp, 
  Lightbulb, Layers, UserCheck, ShieldAlert,
  Gauge, Crosshair, BarChart3
} from 'lucide-react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { EventRow } from '../../types';
import { formatPreciseTime } from '../../utils';
import { buildVolleyballPyramidSummary } from '../../volleyball/volleyballPyramid';
import { buildDataQualityReport } from '../../utils/scoutData';
import { getSportRuleEngine } from '../../sports/rules/registry';
import { buildAnalyticsSummary } from '../../utils/analyticsEngine';
import { loadBadmintonTrackingAnalysis, type TrackingAnalysis } from '../../services/storage/trackingStorage';
import ReportClipModal from '../ReportClipModal';
import VolleyballPyramidPanel from '../VolleyballPyramidPanel';
import {
  getSportReportMeta,
  computeSportSpatialAnalysis,
  computeSportSkillBreakdown,
  compute4LevelSkillMetrics,
} from './reportSportsAdapter';

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

  // Sport metadata & canonical rule engine
  const sportMeta = useMemo(() => getSportReportMeta(matchInfo.sportType), [matchInfo.sportType]);
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

  // Canonical Analytics Summary
  const analyticsSummary = useMemo(() => {
    return buildAnalyticsSummary(events, {
      sportType: matchInfo.sportType,
      teams,
      uiLanguage: settings.uiLanguage,
    });
  }, [events, matchInfo.sportType, teams, settings.uiLanguage]);

  const volleyballPyramidSummary = useMemo(() => {
    if (matchInfo.sportType !== 'volleyball') return null;
    return buildVolleyballPyramidSummary(events);
  }, [events, matchInfo.sportType]);

  const dataQuality = useMemo(() => {
    return buildDataQualityReport(events);
  }, [events]);

  // Sport-specific spatial analysis
  const spatialAnalysis = useMemo(() => {
    return computeSportSpatialAnalysis(matchInfo.sportType, events);
  }, [matchInfo.sportType, events]);

  // Sport-specific skill breakdown
  const skillBreakdown = useMemo(() => {
    return computeSportSkillBreakdown(matchInfo.sportType, events);
  }, [matchInfo.sportType, events]);

  // 4-Level Skill Evaluation Metrics
  const evaluationMetrics = useMemo(() => {
    return compute4LevelSkillMetrics(matchInfo.sportType, events);
  }, [matchInfo.sportType, events]);

  // Key Moment Highlights with Video Timestamps
  const keyMomentClips = useMemo(() => {
    return events
      .filter(ev => typeof ev.videoTime === 'number' && ev.videoTime > 0)
      .filter(ev => ev.resultText === '+1' || ev.resultText === '-1' || (ev.point >= 20))
      .slice(0, 10);
  }, [events]);

  const stageLabel = sportMeta.stageLabel(matchInfo.setOrGame);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200 print:space-y-4 print:pb-0 print:text-black print:max-w-none">
      
      {/* 1. MATCH SNAPSHOT (TOP HEADER) */}
      <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-6 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 dark:border-[#263642] pb-5 print:border-gray-300">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 text-[10px] font-black uppercase tracking-wider print:bg-gray-100 print:text-black">
                {sportMeta.sportName} · 5Ws Standard Report
              </span>
              <span className="text-gray-400 text-xs font-mono">
                Sports Science Analytics Framework
              </span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-gray-50 tracking-tight print:text-black">
              {matchInfo.matchName || `${team1.code} vs ${team2.code}`}
            </h1>
            <p className="text-xs text-gray-500 font-medium print:text-gray-700">
              {isThai ? 'ผู้บันทึกสถิติ:' : 'Scouter:'} <span className="font-bold text-gray-700 dark:text-gray-300 print:text-black">{matchInfo.scouterName || 'Lead Analyst'}</span> · {new Date().toLocaleDateString(isThai ? 'th-TH' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 print:hidden"
            >
              <Printer size={15} />
              <span>{isThai ? 'พิมพ์รายงานโค้ช (Print PDF)' : 'Print PDF Report'}</span>
            </button>
          </div>
        </div>

        {/* Score & Competitor Match Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-gradient-to-r from-sky-50 via-white to-amber-50 dark:from-sky-950/40 dark:via-gray-900 dark:to-amber-950/40 p-6 rounded-2xl border border-gray-200 dark:border-[#263642] print:bg-gray-50 print:border-gray-300">
          <div className="text-center md:text-left space-y-1">
            <div className="text-3xl mb-1">{team1.icon || sportMeta.icon}</div>
            <div className="text-lg font-black text-gray-900 dark:text-gray-100 print:text-black">{team1.name || team1.code}</div>
            <div className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider print:text-sky-800">{team1.code} (Team A)</div>
          </div>

          <div className="text-center space-y-1">
            <div className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight print:text-black">
              <span className="text-sky-600 dark:text-sky-400 print:text-sky-800">{teamAScore}</span>
              <span className="text-gray-300 dark:text-gray-600 mx-3">-</span>
              <span className="text-amber-600 dark:text-amber-400 print:text-amber-800">{teamBScore}</span>
            </div>
            <div className="text-[11px] font-extrabold uppercase text-gray-400 print:text-gray-600 tracking-widest">
              {isThai ? sportMeta.scoreLabelTh : sportMeta.scoreLabelEn}
            </div>
          </div>

          <div className="text-center md:text-right space-y-1">
            <div className="text-3xl mb-1">{team2.icon || sportMeta.icon}</div>
            <div className="text-lg font-black text-gray-900 dark:text-gray-100 print:text-black">{team2.name || team2.code}</div>
            <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider print:text-amber-800">{team2.code} (Team B)</div>
          </div>
        </div>

        {/* 5Ws Overview Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center print:border-gray-300 print:bg-gray-50">
            <div className="text-[10px] font-black text-gray-400 uppercase">1. WHO (ผู้เล่น)</div>
            <div className="text-sm font-black text-gray-800 dark:text-gray-200 print:text-black mt-1">{teams.length} ทีมหลัก</div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center print:border-gray-300 print:bg-gray-50">
            <div className="text-[10px] font-black text-gray-400 uppercase">2. WHAT (ทักษะ)</div>
            <div className="text-sm font-black text-sky-600 dark:text-sky-400 print:text-sky-800 mt-1">{events.length} เหตุการณ์</div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center print:border-gray-300 print:bg-gray-50">
            <div className="text-[10px] font-black text-gray-400 uppercase">3. WHERE (โซนสนาม)</div>
            <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 print:text-emerald-800 mt-1">
              {isThai ? sportMeta.zonesOverviewLabelTh : sportMeta.zonesOverviewLabelEn}
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center print:border-gray-300 print:bg-gray-50">
            <div className="text-[10px] font-black text-gray-400 uppercase">4. WHEN (บริบทเวลา)</div>
            <div className="text-sm font-black text-indigo-600 dark:text-indigo-400 print:text-indigo-800 mt-1">
              {isThai ? stageLabel.th : stageLabel.en}
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-[#263642] text-center col-span-2 sm:col-span-1 print:border-gray-300 print:bg-gray-50">
            <div className="text-[10px] font-black text-gray-400 uppercase">5. HOW (คุณภาพ)</div>
            <div className="text-sm font-black text-amber-600 dark:text-amber-400 print:text-amber-800 mt-1">4 ระดับคะแนน</div>
          </div>
        </div>
      </div>

      {/* 2. SKILL EVALUATION METRIC (4-LEVEL SCALING) */}
      <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-5 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center print:hidden">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100 print:text-black">
                {isThai ? 'ดัชนีชี้วัดผลลัพธ์ทักษะ 4 ระดับ (Skill Evaluation Metric)' : '4-Level Skill Evaluation Metrics'}
              </h2>
              <p className="text-xs text-gray-500 print:text-gray-600">
                {isThai ? 'ประเมินคุณภาพทักษะตามมาตรฐาน ++++ (Excellent), +++ (Good), ++ (Fair), - (Error)' : 'Quality breakdown across rally outcomes'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Level 4 */}
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4.5 space-y-2 print:border-gray-300 print:bg-emerald-50/50">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 print:text-emerald-900">
              <span className="text-xs font-black uppercase">{isThai ? evaluationMetrics.level4.titleTh : evaluationMetrics.level4.titleEn}</span>
              <CheckCircle2 size={16} />
            </div>
            <div className="text-3xl font-black text-emerald-800 dark:text-emerald-200 print:text-emerald-950">{evaluationMetrics.level4.count}</div>
            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 print:text-emerald-800">
              {evaluationMetrics.level4.pct}% {isThai ? 'ของแอคชั่นทั้งหมด' : 'of total actions'}
            </div>
            <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 print:text-gray-700 leading-relaxed">
              {isThai ? evaluationMetrics.level4.descTh : evaluationMetrics.level4.descEn}
            </p>
          </div>

          {/* Level 3 */}
          <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-2xl p-4.5 space-y-2 print:border-gray-300 print:bg-sky-50/50">
            <div className="flex items-center justify-between text-sky-700 dark:text-sky-300 print:text-sky-900">
              <span className="text-xs font-black uppercase">{isThai ? evaluationMetrics.level3.titleTh : evaluationMetrics.level3.titleEn}</span>
              <TrendingUp size={16} />
            </div>
            <div className="text-3xl font-black text-sky-800 dark:text-sky-200 print:text-sky-950">{evaluationMetrics.level3.count}</div>
            <div className="text-xs font-bold text-sky-600 dark:text-sky-400 print:text-sky-800">
              {evaluationMetrics.level3.pct}% {isThai ? 'ประสิทธิภาพสูง' : 'effective rate'}
            </div>
            <p className="text-[10px] text-sky-700/80 dark:text-sky-300/80 print:text-gray-700 leading-relaxed">
              {isThai ? evaluationMetrics.level3.descTh : evaluationMetrics.level3.descEn}
            </p>
          </div>

          {/* Level 2 */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4.5 space-y-2 print:border-gray-300 print:bg-amber-50/50">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 print:text-amber-900">
              <span className="text-xs font-black uppercase">{isThai ? evaluationMetrics.level2.titleTh : evaluationMetrics.level2.titleEn}</span>
              <Activity size={16} />
            </div>
            <div className="text-3xl font-black text-amber-800 dark:text-amber-200 print:text-amber-950">{evaluationMetrics.level2.count}</div>
            <div className="text-xs font-bold text-amber-600 dark:text-amber-400 print:text-amber-800">
              {evaluationMetrics.level2.pct}% {isThai ? 'เล่นต่อในระบบ' : 'in-play rate'}
            </div>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 print:text-gray-700 leading-relaxed">
              {isThai ? evaluationMetrics.level2.descTh : evaluationMetrics.level2.descEn}
            </p>
          </div>

          {/* Level 1 */}
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-4.5 space-y-2 print:border-gray-300 print:bg-rose-50/50">
            <div className="flex items-center justify-between text-rose-700 dark:text-rose-300 print:text-rose-900">
              <span className="text-xs font-black uppercase">{isThai ? evaluationMetrics.level1.titleTh : evaluationMetrics.level1.titleEn}</span>
              <AlertTriangle size={16} />
            </div>
            <div className="text-3xl font-black text-rose-800 dark:text-rose-200 print:text-rose-950">{evaluationMetrics.level1.count}</div>
            <div className="text-xs font-bold text-rose-600 dark:text-rose-400 print:text-rose-800">
              {evaluationMetrics.level1.pct}% {isThai ? 'อัตราเสียคะแนน' : 'error rate'}
            </div>
            <p className="text-[10px] text-rose-700/80 dark:text-rose-300/80 print:text-gray-700 leading-relaxed">
              {isThai ? evaluationMetrics.level1.descTh : evaluationMetrics.level1.descEn}
            </p>
          </div>
        </div>
      </div>

      {/* 3. SPATIAL COURT HEATMAP & TACTICAL ANALYSIS */}
      <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-6 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center print:hidden">
              <Target size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100 print:text-black">
                {isThai ? `การวิเคราะห์พิกัดสนามและแท็กติก (${sportMeta.sportThaiName})` : `Court Spatial & Tactical Analysis (${sportMeta.sportName})`}
              </h2>
              <p className="text-xs text-gray-500 print:text-gray-600">
                {isThai ? 'แสดงความหนาแน่นของการเข้าทำ จุดตกกระทบ และพื้นที่เกิดข้อผิดพลาดสะสม' : 'Spatial activity heatmap, offensive hotspots, and defensive leak areas'}
              </p>
            </div>
          </div>
        </div>

        {/* 2-Column: Left Court Heatmap, Right Tactical Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* Left: Sport-specific Court Grid Visualizer */}
          <div className="lg:col-span-6 bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-200 dark:border-[#263642] print:border-gray-300 print:bg-gray-50">
            <div className="text-center mb-3">
              <span className="text-xs font-black uppercase text-gray-700 dark:text-gray-300 print:text-black tracking-wider">
                {isThai ? `แผนผังสนาม (${sportMeta.sportThaiName})` : `Court Map (${sportMeta.sportName})`}
              </span>
            </div>

            {/* Sport Court Wrapper */}
            <div className={`p-3 rounded-2xl border-4 border-white shadow-inner max-w-[440px] mx-auto text-gray-900 ${
              matchInfo.sportType === 'badminton'
                ? 'bg-[#1b5e20] aspect-[3/4]'
                : matchInfo.sportType === 'football'
                ? 'bg-[#15803d] aspect-[3/4]'
                : matchInfo.sportType === 'basketball'
                ? 'bg-[#b45309] aspect-[4/3]'
                : 'bg-[#f4cb93] aspect-[3/2]'
            }`}>
              <div className={`grid gap-2 h-full ${
                matchInfo.sportType === 'badminton'
                  ? 'grid-cols-2 grid-rows-3'
                  : matchInfo.sportType === 'football'
                  ? 'grid-cols-3 grid-rows-3'
                  : matchInfo.sportType === 'basketball'
                  ? 'grid-cols-3'
                  : 'grid-cols-3 grid-rows-2'
              }`}>
                {spatialAnalysis.zones.map((zone) => {
                  const isHottest = spatialAnalysis.hottestAttackZone?.id === zone.id;
                  const isWeakest = spatialAnalysis.highestErrorZone?.id === zone.id;

                  return (
                    <div
                      key={zone.id}
                      className={`p-2 rounded-xl border flex flex-col justify-between transition-all ${
                        isHottest
                          ? 'bg-rose-500/90 text-white border-rose-300 shadow-md ring-2 ring-rose-400'
                          : isWeakest
                          ? 'bg-amber-500/90 text-white border-amber-300 shadow-md ring-2 ring-amber-400'
                          : 'bg-white/90 border-white/70 hover:bg-white text-gray-900 shadow-sm'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-black">
                        <span className="truncate pr-1">{zone.id}</span>
                        <span className="opacity-75 text-[9px] truncate">{isThai ? zone.posTh : zone.posEn}</span>
                      </div>
                      <div className="text-center py-1">
                        <div className="text-base font-black">
                          {zone.total} <span className="text-[10px] font-normal">acts</span>
                        </div>
                        <div className="text-[9px] font-bold">
                          {zone.kills > 0 && <span className="text-emerald-700 font-extrabold mr-1">+{zone.kills}</span>}
                          {zone.errors > 0 && <span className="text-rose-900 font-extrabold">-{zone.errors}</span>}
                        </div>
                      </div>
                      <div className="text-[8px] text-center font-semibold truncate opacity-90">
                        {isThai ? zone.labelTh : zone.labelEn}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="flex justify-center gap-4 mt-3 text-[10px] font-bold">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> 
                {isThai ? 'โซนบุกสูงสุด (Hottest Attack)' : 'Primary Attack Hotspot'}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 
                {isThai ? 'จุดผิดพลาดสะสม (Weakness Zone)' : 'Defensive Fault Area'}
              </span>
            </div>
          </div>

          {/* Right: Coach Tactical Diagnosis based on Heatmap */}
          <div className="lg:col-span-6 space-y-4">
            <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-2xl space-y-2 print:border-gray-300 print:bg-sky-50/50">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 print:text-sky-900 font-black text-xs uppercase">
                <Flame size={15} />
                <span>{isThai ? 'การวินิจฉัยจุดโจมตีหลัก (Offensive Vector)' : 'Primary Offensive Vector'}</span>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 print:text-gray-800 leading-relaxed">
                {isThai ? spatialAnalysis.offensiveDiagnosisTh : spatialAnalysis.offensiveDiagnosisEn}
              </p>
            </div>

            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl space-y-2 print:border-gray-300 print:bg-rose-50/50">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 print:text-rose-900 font-black text-xs uppercase">
                <ShieldAlert size={15} />
                <span>{isThai ? 'จุดอ่อนและช่องโหว่ในการรับ (Vulnerability Diagnosis)' : 'Defensive Vulnerability'}</span>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 print:text-gray-800 leading-relaxed">
                {isThai ? spatialAnalysis.defensiveDiagnosisTh : spatialAnalysis.defensiveDiagnosisEn}
              </p>
            </div>

            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2 print:border-gray-300 print:bg-emerald-50/50">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 print:text-emerald-900 font-black text-xs uppercase">
                <Lightbulb size={15} />
                <span>{isThai ? 'คำแนะนำเชิงกลยุทธ์สำหรับโค้ช (Tactical Action Plan)' : 'Tactical Recommendations'}</span>
              </div>
              <ul className="text-xs text-gray-700 dark:text-gray-300 print:text-gray-800 space-y-1.5 list-disc list-inside">
                {(isThai ? spatialAnalysis.tacticalRecommendationsTh : spatialAnalysis.tacticalRecommendationsEn).map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </div>

      {/* 4. SPORT-SPECIFIC PERFORMANCE BREAKDOWN */}
      {/* Volleyball Skill Pyramid */}
      {matchInfo.sportType === 'volleyball' && volleyballPyramidSummary && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-4 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-500 flex items-center justify-center print:hidden">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100 print:text-black">
                {isThai ? 'พีระมิดประสิทธิภาพทักษะ (Skill Pyramid & Quality Levels)' : 'Volleyball Skill Pyramid'}
              </h2>
              <p className="text-xs text-gray-500 print:text-gray-600">
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

      {/* Non-Volleyball Sport Skill Distribution & Effectiveness */}
      {matchInfo.sportType !== 'volleyball' && skillBreakdown.length > 0 && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-4 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-500 flex items-center justify-center print:hidden">
              <BarChart3 size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100 print:text-black">
                {isThai ? `สถิติทักษะรายประเภท (${sportMeta.sportThaiName})` : `Skill Performance Breakdown (${sportMeta.sportName})`}
              </h2>
              <p className="text-xs text-gray-500 print:text-gray-600">
                {isThai ? 'สรุปจำนวนครั้ง อัตราการทำคะแนน และข้อผิดพลาดจำแนกตามทักษะ' : 'Action counts, conversion success rate, and error breakdown'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {skillBreakdown.map((item) => {
              const successPct = item.total > 0 ? ((item.success / item.total) * 100).toFixed(0) : '0';
              const errorPct = item.total > 0 ? ((item.error / item.total) * 100).toFixed(0) : '0';

              return (
                <div
                  key={item.skillCode}
                  className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-200 dark:border-[#263642] space-y-2 print:border-gray-300 print:bg-gray-50"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-gray-900 dark:text-gray-100 print:text-black">
                      {isThai ? item.thaiName : item.name} ({item.skillCode})
                    </span>
                    <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400 print:text-sky-800">
                      {item.total} acts
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                    <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg">
                      <div className="text-[9px] text-emerald-700 font-bold uppercase">{isThai ? 'สำเร็จ' : 'Success'}</div>
                      <div className="font-black text-emerald-800 dark:text-emerald-200">{item.success} ({successPct}%)</div>
                    </div>
                    <div className="p-1.5 bg-rose-50 dark:bg-rose-950/40 rounded-lg">
                      <div className="text-[9px] text-rose-700 font-bold uppercase">{isThai ? 'ผิดพลาด' : 'Error'}</div>
                      <div className="font-black text-rose-800 dark:text-rose-200">{item.error} ({errorPct}%)</div>
                    </div>
                    <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <div className="text-[9px] text-gray-500 font-bold uppercase">{isThai ? 'เล่นต่อ' : 'In-Play'}</div>
                      <div className="font-black text-gray-700 dark:text-gray-300">{item.inPlay}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. KEY MOMENTS & VIDEO DRILLDOWN ("ดูคลิปประกอบ") */}
      <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-5 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center print:hidden">
              <Video size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100 print:text-black">
                {isThai ? 'จังหวะสำคัญและการตรวจสอบคลิปวิดีโอ (Key Video Highlights)' : 'Key Moment Replays'}
              </h2>
              <p className="text-xs text-gray-500 print:text-gray-600">
                {isThai ? 'คลิก "ดูคลิป" เพื่อเปิดวิดีโอกระโดดไปยังจังหวะที่เลือกทันที' : 'Open video modal to inspect critical rally events'}
              </p>
            </div>
          </div>
        </div>

        {keyMomentClips.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 text-xs print:border-gray-300">
            {isThai ? 'ยังไม่มีจังหวะที่ผูกกับเวลาวิดีโอ (บันทึกเวลาบน Video Player เพื่อใช้งาน)' : 'No video timestamps logged yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {keyMomentClips.map((ev) => (
              <div
                key={ev.id}
                className="bg-gray-50 dark:bg-gray-900/60 p-3.5 rounded-2xl border border-gray-200 dark:border-[#263642] flex items-center justify-between hover:border-sky-500 transition-all group shadow-sm print:border-gray-300 print:bg-gray-50"
              >
                <div className="space-y-1 truncate pr-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      ev.resultText === '+1' ? 'bg-emerald-600 text-white' : ev.resultText === '-1' ? 'bg-rose-600 text-white' : 'bg-gray-700 text-gray-200'
                    }`}>
                      Pt #{ev.point} ({ev.resultText})
                    </span>
                    <span className="font-mono text-[11px] font-bold text-sky-600 dark:text-sky-400 print:text-sky-800">
                      {formatPreciseTime(ev.videoTime || 0)}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-gray-800 dark:text-gray-200 print:text-black truncate">
                    {ev.thaiMeaningText || ev.eventText || ev.actions?.[0]?.skillCode || 'Moment'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedClipEvent(ev)}
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-md shadow-sky-500/20 active:scale-95 print:hidden"
                >
                  <Video size={14} />
                  <span>{isThai ? 'ดูคลิป' : 'Watch'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. MOVEMENT ANALYSIS (PDF §59, Phase 13: Displayed only when tracking data exists) */}
      {trackingAnalysis?.status === 'completed' && trackingAnalysis.summary && Object.keys(trackingAnalysis.summary.players || {}).length > 0 && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-6 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center print:hidden">
                <Gauge size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900 dark:text-gray-100 print:text-black">
                  {isThai ? 'การวิเคราะห์การเคลื่อนที่ผู้เล่น (Movement Analysis)' : 'Player Movement Analysis'}
                </h2>
                <p className="text-xs text-gray-500 print:text-gray-600">
                  {isThai ? 'คำนวณจาก Optical Tracking จริง: ระยะทาง, ความเร็ว P95, และการครอบคลุมพื้นที่สนาม' : 'Calculated from optical player tracking: distance, robust P95 speed, court coverage'}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-black uppercase print:border print:border-gray-400">
              {trackingAnalysis.gameType === 'singles' ? 'Singles (1v1)' : 'Doubles (2v2)'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(trackingAnalysis.summary.players).map(([playerId, m]) => (
              <div key={playerId} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-[#263642] space-y-3 print:border-gray-300 print:bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-sky-600 dark:text-sky-400 print:text-sky-800 uppercase">
                    {playerId}
                  </span>
                  <span className="text-xs font-bold text-gray-500 print:text-gray-700">
                    {m.totalDistanceMeters.toFixed(1)} m
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 print:border-gray-300">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">{isThai ? 'ความเร็ว P95' : 'P95 Speed'}</div>
                    <div className="text-sm font-black text-gray-900 dark:text-white print:text-black mt-0.5">{m.p95SpeedMps.toFixed(2)} m/s</div>
                  </div>
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 print:border-gray-300">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">{isThai ? 'ความเร็วสูงสุด' : 'Max Speed'}</div>
                    <div className="text-sm font-black text-rose-600 dark:text-rose-400 print:text-rose-800 mt-0.5">{m.maxSpeedMps.toFixed(2)} m/s</div>
                  </div>
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 print:border-gray-300">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">{isThai ? 'การกระจายตัว' : 'Dispersion'}</div>
                    <div className="text-sm font-black text-amber-600 dark:text-amber-400 print:text-amber-800 mt-0.5">{m.basePosition.dispersion.toFixed(2)} m</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 print:text-gray-700">
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

      {/* 7. TRACKING QUALITY & AUDIT (PDF §59, Phase 13) */}
      {trackingAnalysis?.status === 'completed'
        && trackingAnalysis.quality
        && [
          trackingAnalysis.quality.detectionCoverage,
          trackingAnalysis.quality.confidence,
          trackingAnalysis.quality.lostTimePercent,
        ].some((value) => typeof value === 'number' && Number.isFinite(value)) && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-4 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-500 flex items-center justify-center print:hidden">
                <Crosshair size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900 dark:text-gray-100 print:text-black">
                  {isThai ? 'คุณภาพการแทร็กและความน่าเชื่อถือ (Tracking Quality & Audit)' : 'Tracking Quality & Audit'}
                </h2>
                <p className="text-xs text-gray-500 print:text-gray-600">
                  {isThai ? 'อัตราความครอบคลุม, ความเชื่อมั่นของโมเดล, และการตรวจสอบความถูกต้อง' : 'Detection coverage, confidence rating, and audit metrics'}
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
              trackingAnalysis.quality.lowConfidenceWarning
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
            }`}>
              {trackingAnalysis.quality.lowConfidenceWarning ? 'Warning: Low Confidence' : 'Measured Tracking'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center print:border-gray-300 print:bg-gray-50">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'ความครอบคลุม' : 'Detection Coverage'}</div>
              <div className="text-xl font-black text-teal-600 mt-1">
                {trackingAnalysis.quality.detectionCoverage !== null
                  ? `${(trackingAnalysis.quality.detectionCoverage * 100).toFixed(1)}%`
                  : '—'}
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center print:border-gray-300 print:bg-gray-50">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'ความเชื่อมั่นเฉลี่ย' : 'Avg Confidence'}</div>
              <div className="text-xl font-black text-sky-600 mt-1">
                {trackingAnalysis.quality.confidence !== null
                  ? `${(trackingAnalysis.quality.confidence * 100).toFixed(1)}%`
                  : '—'}
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center print:border-gray-300 print:bg-gray-50">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'เวลาที่แทร็กหลุด' : 'Lost Track Time'}</div>
              <div className="text-xl font-black text-indigo-600 mt-1">
                {trackingAnalysis.quality.lostTimePercent !== null
                  ? `${trackingAnalysis.quality.lostTimePercent.toFixed(1)}%`
                  : '—'}
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center print:border-gray-300 print:bg-gray-50">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'การปรับแก้ด้วยมือ' : 'Manual Edits'}</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{trackingAnalysis.quality.manualCorrections ?? '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* 8. DATA QUALITY & COVERAGE */}
      {dataQuality && (
        <div className="bg-white dark:bg-[#111c26] rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-[#263642] shadow-xl space-y-4 print:rounded-xl print:p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid print:bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-500 flex items-center justify-center print:hidden">
              <UserCheck size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100 print:text-black">
                {isThai ? 'การตรวจสอบความสมบูรณ์ของข้อมูล (Data Quality Assurance)' : 'Data Quality & Verification'}
              </h2>
              <p className="text-xs text-gray-500 print:text-gray-600">
                {isThai ? 'ประเมินความครอบคลุมของการระบุผู้เล่น ตำแหน่ง และความต่อเนื่องของแต้ม' : 'Reliability score and missing attribute audit'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center print:border-gray-300 print:bg-gray-50">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'เหตุการณ์ที่สมบูรณ์' : 'Valid Events'}</div>
              <div className="text-xl font-black text-teal-600 mt-1">{dataQuality.validEvents} / {dataQuality.totalEvents}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center print:border-gray-300 print:bg-gray-50">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'แอคชั่นทั้งหมด' : 'Total Actions'}</div>
              <div className="text-xl font-black text-sky-600 mt-1">{dataQuality.totalActions}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center print:border-gray-300 print:bg-gray-50">
              <div className="text-[10px] font-black text-gray-400 uppercase">{isThai ? 'การแจ้งเตือน' : 'Warnings'}</div>
              <div className="text-xl font-black text-indigo-600 mt-1">{dataQuality.warnings}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-center print:border-gray-300 print:bg-gray-50">
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
