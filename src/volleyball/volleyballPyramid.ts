import type { Action, EventRow } from '../types';
import { UNGRADED_RESULT_DETAIL, type EventQuery } from '../utils/eventQuery';
import { getVolleyballPrimaryArea } from './volleyballActionContext';
import {
  buildVolleyballGradeSummary,
  resolveVolleyballGrade,
  type VolleyballGradeSummary,
} from './volleyballSkillGrades';

export type DataConfidence = 'low' | 'medium' | 'high';
export type CoachInsightRule =
  | 'grade_coverage_low'
  | 'reception_quality_low'
  | 'attack_efficiency_low'
  | 'error_rate_high'
  | 'weak_area'
  | 'system_drop'
  | 'strong_pattern';

export type CoachInsight = {
  id: string;
  rule: CoachInsightRule;
  tone: 'warning' | 'strength';
  value: number;
  threshold: number;
  unit: 'percent' | 'grade' | 'gap';
  sampleSize: number;
  confidence: DataConfidence;
  reason: string;
  filters: Partial<EventQuery>;
};

export type VolleyballFlowSummary = {
  key: string;
  skillCode: string;
  startArea: string;
  targetArea?: string;
  total: number;
  gradedActions: number;
  averageGrade: number;
};

export type VolleyballSequenceSummary = {
  pattern: string;
  count: number;
  averageGrade: number;
};

export type VolleyballSystemSkillSummary = {
  skillCode: string;
  inSystem: { total: number; averageGrade: number };
  outOfSystem: { total: number; averageGrade: number };
  gradeGap: number;
};

export type VolleyballPyramidSummary = {
  data: {
    totalActions: number;
    fiveWsCompletenessPercentage: number;
    fieldCoverage: Record<'who' | 'what' | 'where' | 'how' | 'when', number>;
    gradeCoveragePercentage: number;
    confidence: DataConfidence;
  };
  skills: {
    gradeSummary: VolleyballGradeSummary;
  };
  rally: {
    flows: VolleyballFlowSummary[];
    sequences: VolleyballSequenceSummary[];
    systems: VolleyballSystemSkillSummary[];
  };
  insights: CoachInsight[];
};

const round = (value: number): number => Number(value.toFixed(2));
const percentage = (value: number, total: number): number => total ? round((value / total) * 100) : 0;

export function getVolleyballDataConfidence(sampleSize: number, coveragePercentage: number): DataConfidence {
  if (sampleSize < 5 || coveragePercentage < 50) return 'low';
  if (sampleSize >= 20 && coveragePercentage >= 80) return 'high';
  return 'medium';
}

function areaCode(action: Action, kind: 'start' | 'target'): string | undefined {
  if (action.domainPayload?.type === 'volleyball') {
    const selected = kind === 'start' ? action.domainPayload.startArea : action.domainPayload.targetArea;
    if (selected?.outZone || selected?.areaCode) return selected.outZone || selected.areaCode;
  }
  const primary = kind === 'start' ? getVolleyballPrimaryArea(action) : undefined;
  return primary?.outZone || primary?.areaCode;
}

function actionGrade(action: Action): number | undefined {
  return resolveVolleyballGrade(action.skillCode, action.resultDetailCode)?.grade;
}

function insightConfidence(sampleSize: number, coverage: number): DataConfidence {
  return getVolleyballDataConfidence(sampleSize, coverage);
}

export function buildVolleyballPyramidSummary(events: EventRow[]): VolleyballPyramidSummary {
  const volleyballEvents = events.filter(event => event.sportType === 'volleyball');
  const actionEntries = volleyballEvents.flatMap(event => event.actions.map(action => ({ action, event })));
  const actions = actionEntries.map(entry => entry.action);
  const gradeSummary = buildVolleyballGradeSummary(volleyballEvents);

  const fieldCounts = { who: 0, what: 0, where: 0, how: 0, when: 0 };
  actionEntries.forEach(({ action, event }) => {
    if (action.teamCode || action.playerNumber || action.playerName) fieldCounts.who += 1;
    if (action.skillCode) fieldCounts.what += 1;
    if (areaCode(action, 'start')) fieldCounts.where += 1;
    if (action.resultDetailCode || action.resultCode) fieldCounts.how += 1;
    if (action.videoTime !== undefined || event.videoTime !== undefined || event.sequenceStartTime !== undefined) fieldCounts.when += 1;
  });
  const fieldCoverage = {
    who: percentage(fieldCounts.who, actions.length),
    what: percentage(fieldCounts.what, actions.length),
    where: percentage(fieldCounts.where, actions.length),
    how: percentage(fieldCounts.how, actions.length),
    when: percentage(fieldCounts.when, actions.length),
  };
  const fiveWsCompletenessPercentage = actions.length
    ? round(Object.values(fieldCounts).reduce((sum, value) => sum + value, 0) / (actions.length * 5) * 100)
    : 0;

  const flowMap = new Map<string, { skillCode: string; startArea: string; targetArea?: string; total: number; graded: number; gradeSum: number }>();
  actions.forEach(action => {
    if (!action.skillCode) return;
    const start = areaCode(action, 'start');
    if (!start) return;
    const target = areaCode(action, 'target');
    const key = `${action.skillCode}|${start}|${target ?? ''}`;
    const current = flowMap.get(key) ?? { skillCode: action.skillCode, startArea: start, targetArea: target, total: 0, graded: 0, gradeSum: 0 };
    current.total += 1;
    const grade = actionGrade(action);
    if (grade !== undefined) {
      current.graded += 1;
      current.gradeSum += grade;
    }
    flowMap.set(key, current);
  });
  const flows: VolleyballFlowSummary[] = Array.from(flowMap.entries()).map(([key, flow]) => ({
    key,
    skillCode: flow.skillCode,
    startArea: flow.startArea,
    targetArea: flow.targetArea,
    total: flow.total,
    gradedActions: flow.graded,
    averageGrade: flow.graded ? round(flow.gradeSum / flow.graded) : 0,
  })).sort((left, right) => right.total - left.total || right.averageGrade - left.averageGrade);

  const sequenceMap = new Map<string, { count: number; gradeSum: number; graded: number }>();
  volleyballEvents.forEach(event => {
    const pattern = event.actions.map(action => action.skillCode).filter(Boolean).join(' → ');
    if (!pattern) return;
    const current = sequenceMap.get(pattern) ?? { count: 0, gradeSum: 0, graded: 0 };
    current.count += 1;
    event.actions.forEach(action => {
      const grade = actionGrade(action);
      if (grade !== undefined) { current.gradeSum += grade; current.graded += 1; }
    });
    sequenceMap.set(pattern, current);
  });
  const sequences = Array.from(sequenceMap.entries()).map(([pattern, stats]) => ({
    pattern,
    count: stats.count,
    averageGrade: stats.graded ? round(stats.gradeSum / stats.graded) : 0,
  })).sort((left, right) => right.count - left.count || right.averageGrade - left.averageGrade);

  const systemMap = new Map<string, { in_system: number[]; out_of_system: number[] }>();
  actions.forEach(action => {
    if (!action.skillCode || action.domainPayload?.type !== 'volleyball' || !action.domainPayload.systemContext) return;
    const grade = actionGrade(action);
    if (grade === undefined) return;
    const current = systemMap.get(action.skillCode) ?? { in_system: [], out_of_system: [] };
    current[action.domainPayload.systemContext].push(grade);
    systemMap.set(action.skillCode, current);
  });
  const average = (values: number[]) => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const systems: VolleyballSystemSkillSummary[] = Array.from(systemMap.entries()).map(([skillCode, values]) => {
    const inAverage = average(values.in_system);
    const outAverage = average(values.out_of_system);
    return {
      skillCode,
      inSystem: { total: values.in_system.length, averageGrade: inAverage },
      outOfSystem: { total: values.out_of_system.length, averageGrade: outAverage },
      gradeGap: round(Math.abs(inAverage - outAverage)),
    };
  });

  const confidence = getVolleyballDataConfidence(gradeSummary.gradedActions, gradeSummary.coveragePercentage);
  const insights: CoachInsight[] = [];
  const addInsight = (insight: Omit<CoachInsight, 'id' | 'confidence'>) => insights.push({
    ...insight,
    id: `${insight.rule}-${insights.length + 1}`,
    confidence: insightConfidence(insight.sampleSize, gradeSummary.coveragePercentage),
  });

  if (gradeSummary.eligibleActions >= 5) {
    if (gradeSummary.coveragePercentage < 70) addInsight({
      rule: 'grade_coverage_low', tone: 'warning', value: gradeSummary.coveragePercentage, threshold: 70,
      unit: 'percent', sampleSize: gradeSummary.eligibleActions,
      reason: `Detailed grade coverage is ${gradeSummary.coveragePercentage}% (target at least 70%).`, filters: { resultDetail: UNGRADED_RESULT_DETAIL },
    });

    const reception = gradeSummary.bySkill.REC;
    if (reception?.total >= 5 && gradeSummary.receptionQualityPercentage < 50) addInsight({
      rule: 'reception_quality_low', tone: 'warning', value: gradeSummary.receptionQualityPercentage, threshold: 50,
      unit: 'percent', sampleSize: reception.total,
      reason: `Reception quality is ${gradeSummary.receptionQualityPercentage}% (target at least 50%).`, filters: { skill: 'REC' },
    });
    const attack = gradeSummary.bySkill.SPK;
    if (attack?.total >= 5 && gradeSummary.attackEfficiencyPercentage < 0) addInsight({
      rule: 'attack_efficiency_low', tone: 'warning', value: gradeSummary.attackEfficiencyPercentage, threshold: 0,
      unit: 'percent', sampleSize: attack.total,
      reason: `Attack efficiency is ${gradeSummary.attackEfficiencyPercentage}% (target at least 0%).`, filters: { skill: 'SPK' },
    });

    Object.entries(gradeSummary.bySkill).forEach(([skillCode, stats]) => {
      const errorRate = percentage(stats.gradeCounts[1], stats.total);
      if (stats.total >= 5 && errorRate >= 25) addInsight({
        rule: 'error_rate_high', tone: 'warning', value: errorRate, threshold: 25, unit: 'percent', sampleSize: stats.total,
        reason: `${skillCode} error rate is ${errorRate}% (warning at 25% or higher).`, filters: { skill: skillCode, resultDetail: 'ERROR' },
      });
    });

    flows.forEach(flow => {
      if (flow.gradedActions < 5) return;
      const filters: Partial<EventQuery> = { skill: flow.skillCode, startArea: flow.startArea };
      if (flow.targetArea) filters.targetArea = flow.targetArea;
      if (flow.averageGrade < 2.5) addInsight({
        rule: 'weak_area', tone: 'warning', value: flow.averageGrade, threshold: 2.5, unit: 'grade', sampleSize: flow.gradedActions,
        reason: `${flow.skillCode} ${flow.startArea}→${flow.targetArea ?? '—'} averages ${flow.averageGrade} (weak below 2.5).`, filters,
      });
      if (flow.averageGrade >= 3.25) addInsight({
        rule: 'strong_pattern', tone: 'strength', value: flow.averageGrade, threshold: 3.25, unit: 'grade', sampleSize: flow.gradedActions,
        reason: `${flow.skillCode} ${flow.startArea}→${flow.targetArea ?? '—'} averages ${flow.averageGrade} (strong at 3.25 or higher).`, filters,
      });
    });

    systems.forEach(system => {
      if (system.inSystem.total < 5 || system.outOfSystem.total < 5 || system.gradeGap < 0.75) return;
      const weakerContext = system.inSystem.averageGrade <= system.outOfSystem.averageGrade ? 'in_system' : 'out_of_system';
      addInsight({
        rule: 'system_drop', tone: 'warning', value: system.gradeGap, threshold: 0.75, unit: 'gap',
        sampleSize: system.inSystem.total + system.outOfSystem.total,
        reason: `${system.skillCode} changes by ${system.gradeGap} grades between In/Out-of-System (warning at 0.75 or more).`,
        filters: { skill: system.skillCode, systemContext: weakerContext },
      });
    });
  }

  return {
    data: {
      totalActions: actions.length,
      fiveWsCompletenessPercentage,
      fieldCoverage,
      gradeCoveragePercentage: gradeSummary.coveragePercentage,
      confidence,
    },
    skills: { gradeSummary },
    rally: { flows, sequences, systems },
    insights,
  };
}
