import React from 'react';
import { ArrowUpRight, BarChart3, Database, Lightbulb, Route, ShieldCheck } from 'lucide-react';
import type { CoachInsight, CoachInsightRule, VolleyballPyramidSummary } from '../volleyball/volleyballPyramid';
import { requestReviewDrilldown } from '../utils/reviewDrilldown';

type Props = {
  summary: VolleyballPyramidSummary;
  language: 'th' | 'en';
  interactive?: boolean;
};

const insightTitles: Record<CoachInsightRule, { th: string; en: string }> = {
  grade_coverage_low: { th: 'ข้อมูลเกรดยังไม่ครบ', en: 'Detailed grades need more coverage' },
  reception_quality_low: { th: 'คุณภาพการรับเสิร์ฟต่ำกว่าเป้า', en: 'Reception quality is below target' },
  attack_efficiency_low: { th: 'ประสิทธิภาพการรุกติดลบ', en: 'Attack efficiency is negative' },
  error_rate_high: { th: 'อัตราผิดพลาดสูง', en: 'Error rate is high' },
  weak_area: { th: 'เส้นทางบอลที่ควรแก้ก่อน', en: 'Weak ball path to address' },
  system_drop: { th: 'คุณภาพตกเมื่อระบบเปลี่ยน', en: 'Performance drops by system context' },
  strong_pattern: { th: 'รูปแบบเด่นที่ควรรักษา', en: 'Strong pattern to preserve' },
};

const confidenceLabels = {
  low: { th: 'ต่ำ', en: 'Low' },
  medium: { th: 'ปานกลาง', en: 'Medium' },
  high: { th: 'สูง', en: 'High' },
};

function valueLabel(insight: CoachInsight): string {
  return insight.unit === 'percent' ? `${insight.value}%` : insight.value.toFixed(2).replace(/\.00$/, '');
}

function thresholdLabel(insight: CoachInsight): string {
  const comparator = insight.rule === 'error_rate_high' || insight.rule === 'system_drop' || insight.rule === 'strong_pattern' ? '≥' : '<';
  const suffix = insight.unit === 'percent' ? '%' : '';
  return `${comparator} ${insight.threshold}${suffix}`;
}

function InsightCard({ insight, language, interactive }: { insight: CoachInsight; language: 'th' | 'en'; interactive: boolean }) {
  const isThai = language === 'th';
  const isStrength = insight.tone === 'strength';
  return (
    <article className={`border-l-4 p-3 ${isStrength ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/20' : 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/20'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-black text-gray-900 dark:text-gray-100">{insightTitles[insight.rule][language]}</h4>
        <span className="border border-current px-2 py-0.5 text-[10px] font-black uppercase opacity-70">
          {isThai ? `มั่นใจ ${confidenceLabels[insight.confidence].th}` : `${confidenceLabels[insight.confidence].en} confidence`}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
        {isThai
          ? `ค่าจริง ${valueLabel(insight)} · เกณฑ์ ${thresholdLabel(insight)} · ตัวอย่าง ${insight.sampleSize} ครั้ง`
          : `Actual ${valueLabel(insight)} · Threshold ${thresholdLabel(insight)} · ${insight.sampleSize} samples`}
      </p>
      {interactive && (
        <button type="button" onClick={() => requestReviewDrilldown(insight.filters)} className="mt-2 inline-flex min-h-9 items-center gap-1 border border-gray-300 bg-white px-3 text-xs font-bold text-gray-700 hover:border-sky-500 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          {isThai ? 'เปิดตารางพร้อมตัวกรอง' : 'Open filtered Review'} <ArrowUpRight size={13} />
        </button>
      )}
    </article>
  );
}

export default function VolleyballPyramidPanel({ summary, language, interactive = true }: Props) {
  const isThai = language === 'th';
  const skillRows = Object.entries(summary.skills.gradeSummary.bySkill).sort((left, right) => right[1].total - left[1].total);
  const topFlows = summary.rally.flows.slice(0, 6);
  const topSequences = summary.rally.sequences.slice(0, 4);

  if (summary.data.totalActions === 0) {
    return (
      <section className="my-5 border border-dashed border-gray-300 p-5 text-center dark:border-gray-700" aria-label="Volleyball pyramid">
        <Database className="mx-auto text-gray-400" size={24} />
        <h3 className="mt-2 text-sm font-black">{isThai ? 'พีระมิดจะเริ่มเมื่อมีข้อมูลวอลเลย์บอล' : 'The pyramid starts with volleyball data'}</h3>
        <p className="mt-1 text-xs text-gray-500">{isThai ? 'บันทึก Who, What, Where, How และ When อย่างน้อย 5 ครั้งเพื่อเริ่มสร้างข้อสรุป' : 'Capture Who, What, Where, How and When at least five times to unlock insights.'}</p>
      </section>
    );
  }

  return (
    <section className="my-5 border border-sky-200 bg-white dark:border-sky-900 dark:bg-gray-900" aria-labelledby="volleyball-pyramid-title">
      <header className="border-b border-sky-200 bg-sky-950 px-4 py-3 text-white dark:border-sky-900">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">5Ws → Grade → Rally → Insight</p>
        <h3 id="volleyball-pyramid-title" className="mt-1 text-base font-black">{isThai ? 'พีระมิดวิเคราะห์วอลเลย์บอล' : 'Volleyball analysis pyramid'}</h3>
      </header>

      <div className="grid gap-px bg-gray-200 dark:bg-gray-700 xl:grid-cols-2">
        <section className="bg-white p-4 dark:bg-gray-900">
          <div className="flex items-center gap-2"><Database size={18} className="text-sky-600" /><h4 className="text-sm font-black">1. {isThai ? 'ความน่าเชื่อถือของข้อมูล' : 'Data confidence'}</h4></div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric label="5Ws" value={`${summary.data.fiveWsCompletenessPercentage}%`} />
            <Metric label={isThai ? 'มีเกรด' : 'Grade coverage'} value={`${summary.data.gradeCoveragePercentage}%`} />
            <Metric label={isThai ? 'ความมั่นใจ' : 'Confidence'} value={confidenceLabels[summary.data.confidence][language]} />
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px] font-bold text-gray-500">
            {Object.entries(summary.data.fieldCoverage).map(([field, coverage]) => <span key={field} className="border border-gray-200 py-1 dark:border-gray-700"><strong className="block text-gray-800 dark:text-gray-100">{coverage}%</strong>{field}</span>)}
          </div>
        </section>

        <section className="bg-white p-4 dark:bg-gray-900">
          <div className="flex items-center gap-2"><BarChart3 size={18} className="text-violet-600" /><h4 className="text-sm font-black">2. {isThai ? 'คุณภาพทักษะ' : 'Skill quality'}</h4></div>
          {skillRows.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{skillRows.map(([skill, stats]) => (
            <div key={skill} className="border border-gray-200 p-2 dark:border-gray-700">
              <div className="flex items-center justify-between text-xs font-black"><span>{skill}</span><span>{isThai ? 'เฉลี่ย' : 'Avg'} {stats.averageGrade}</span></div>
              <p className="mt-1 text-[10px] text-gray-500">4:{stats.gradeCounts[4]} · 3:{stats.gradeCounts[3]} · 2:{stats.gradeCounts[2]} · 1:{stats.gradeCounts[1]} · n={stats.total}</p>
            </div>
          ))}</div> : <EmptyText text={isThai ? 'ยังไม่มีเกรดละเอียด' : 'No detailed grades yet'} />}
        </section>

        <section className="bg-white p-4 dark:bg-gray-900">
          <div className="flex items-center gap-2"><Route size={18} className="text-cyan-600" /><h4 className="text-sm font-black">3. {isThai ? 'รูปแบบ Rally และเส้นทางบอล' : 'Rally and ball paths'}</h4></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><p className="text-[10px] font-black uppercase text-gray-500">Start → Target</p>{topFlows.length ? topFlows.map(flow => <p key={flow.key} className="mt-1 flex justify-between gap-2 text-xs"><span className="truncate">{flow.skillCode} · {flow.startArea}→{flow.targetArea ?? '—'}</span><strong>{flow.averageGrade} / n={flow.gradedActions}</strong></p>) : <EmptyText text="—" />}</div>
            <div><p className="text-[10px] font-black uppercase text-gray-500">Rally sequence</p>{topSequences.length ? topSequences.map(sequence => <p key={sequence.pattern} className="mt-1 flex justify-between gap-2 text-xs"><span className="truncate">{sequence.pattern}</span><strong>×{sequence.count}</strong></p>) : <EmptyText text="—" />}</div>
          </div>
          {summary.rally.systems.length > 0 && <div className="mt-3 border-t border-gray-200 pt-2 text-xs dark:border-gray-700">{summary.rally.systems.map(system => <p key={system.skillCode}><strong>{system.skillCode}</strong> · In {system.inSystem.averageGrade} (n={system.inSystem.total}) · Out {system.outOfSystem.averageGrade} (n={system.outOfSystem.total}) · Gap {system.gradeGap}</p>)}</div>}
        </section>

        <section className="bg-white p-4 dark:bg-gray-900">
          <div className="flex items-center gap-2"><Lightbulb size={18} className="text-amber-600" /><h4 className="text-sm font-black">4. {isThai ? 'ข้อสรุปสำหรับโค้ช' : 'Coach insight'}</h4></div>
          <div className="mt-3 space-y-2">
            {summary.insights.length
              ? summary.insights.map(insight => <InsightCard key={insight.id} insight={insight} language={language} interactive={interactive} />)
              : <div className="flex items-start gap-2 border border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-700"><ShieldCheck size={16} className="shrink-0 text-emerald-600" /><span>{isThai ? 'ยังไม่มีข้อสรุปที่ผ่านเกณฑ์ อย่างน้อย 5 ตัวอย่างต่อรูปแบบ' : 'No conclusion has crossed the evidence threshold of five samples per pattern.'}</span></div>}
          </div>
        </section>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-gray-200 p-2 dark:border-gray-700"><span className="block text-[10px] font-bold uppercase text-gray-500">{label}</span><strong className="mt-1 block text-lg text-sky-700 dark:text-sky-300">{value}</strong></div>;
}

function EmptyText({ text }: { text: string }) {
  return <p className="mt-2 text-xs text-gray-400">{text}</p>;
}
