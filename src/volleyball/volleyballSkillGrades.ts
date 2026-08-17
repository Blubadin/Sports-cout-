import type { EventRow } from '../types';

export type VolleyballCanonicalResult = 'Yes' | 'Pass' | 'Out';
export type VolleyballGrade = 1 | 2 | 3 | 4;
export type VolleyballGradeDefinition = {
  code: string;
  label: string;
  thaiLabel: string;
  grade: VolleyballGrade;
  resultCode: VolleyballCanonicalResult;
};

const grade = (code: string, label: string, thaiLabel: string, value: VolleyballGrade, resultCode: VolleyballCanonicalResult): VolleyballGradeDefinition => ({ code, label, thaiLabel, grade: value, resultCode });
const DIG_GRADES = [grade('PERFECT', 'Perfect', 'สมบูรณ์', 4, 'Pass'), grade('PLAYABLE', 'Playable', 'เล่นต่อได้', 3, 'Pass'), grade('DIFFICULT', 'Difficult', 'เล่นต่อยาก', 2, 'Pass'), grade('ERROR', 'Error', 'ผิดพลาด', 1, 'Out')];

export const VOLLEYBALL_SKILL_GRADES: Record<string, VolleyballGradeDefinition[]> = {
  SV: [grade('ACE', 'Ace', 'เอซ', 4, 'Yes'), grade('PRESSURE', 'Pressure', 'กดดันคู่แข่ง', 3, 'Pass'), grade('IN_PLAY', 'In play', 'เล่นต่อ', 2, 'Pass'), grade('ERROR', 'Error', 'เสิร์ฟเสีย', 1, 'Out')],
  REC: [grade('A_PASS', 'A-pass', 'บอลเข้าจุด', 4, 'Pass'), grade('B_PASS', 'B-pass', 'บอลห่างเล็กน้อย', 3, 'Pass'), grade('C_PASS', 'C-pass', 'บอลแก้', 2, 'Pass'), grade('ERROR', 'Error', 'รับเสีย', 1, 'Out')],
  SET: [grade('EXCELLENT', 'Excellent', 'ยอดเยี่ยม', 4, 'Pass'), grade('PLAYABLE', 'Playable', 'เล่นได้ตามระบบ', 3, 'Pass'), grade('BAD_SET', 'Bad set', 'เซ็ตไม่เข้าจุด', 2, 'Pass'), grade('ERROR', 'Error', 'เซ็ตเสีย', 1, 'Out')],
  SPK: [grade('KILL', 'Kill', 'ทำคะแนน', 4, 'Yes'), grade('IN_PLAY', 'In play', 'คู่แข่งรับได้', 3, 'Pass'), grade('BLOCKED', 'Blocked', 'ถูกบล็อก', 2, 'Out'), grade('ERROR', 'Error', 'ตบเสีย', 1, 'Out')],
  BLK: [grade('KILL_BLOCK', 'Kill block', 'บล็อกได้แต้ม', 4, 'Yes'), grade('TOUCH', 'Touch', 'แตะชะลอบอล', 3, 'Pass'), grade('OPEN_GAP', 'Open gap', 'บล็อกเปิดช่อง', 2, 'Pass'), grade('ERROR', 'Error', 'บล็อกเสีย', 1, 'Out')],
  DIG: DIG_GRADES,
  UND: DIG_GRADES,
};

export function getVolleyballGradeOptions(skillCode?: string): VolleyballGradeDefinition[] {
  return skillCode ? VOLLEYBALL_SKILL_GRADES[skillCode] ?? [] : [];
}

export function resolveVolleyballGrade(skillCode?: string, detailCode?: string): VolleyballGradeDefinition | undefined {
  return getVolleyballGradeOptions(skillCode).find(option => option.code === detailCode);
}

export type VolleyballSkillGradeStats = { total: number; gradeCounts: Record<VolleyballGrade, number>; averageGrade: number };
export type VolleyballGradeSummary = {
  eligibleActions: number; gradedActions: number; coveragePercentage: number;
  gradeCounts: Record<VolleyballGrade, number>;
  bySkill: Record<string, VolleyballSkillGradeStats>;
  receptionQualityPercentage: number;
  attackEfficiencyPercentage: number;
};

export function buildVolleyballGradeSummary(events: EventRow[]): VolleyballGradeSummary {
  const gradeCounts: Record<VolleyballGrade, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const bySkill: Record<string, VolleyballSkillGradeStats> = {};
  let eligibleActions = 0;
  let gradedActions = 0;
  let receptionPoints = 0;
  let receptionTotal = 0;
  let attackKills = 0;
  let attackErrors = 0;
  let attackBlocks = 0;
  let attackTotal = 0;

  events.filter(event => event.sportType === 'volleyball').forEach(event => event.actions.forEach(action => {
    if (getVolleyballGradeOptions(action.skillCode).length === 0) return;
    eligibleActions += 1;
    const detail = resolveVolleyballGrade(action.skillCode, action.resultDetailCode);
    if (!detail) return;
    gradedActions += 1;
    gradeCounts[detail.grade] += 1;
    const stats = bySkill[action.skillCode!] ?? { total: 0, gradeCounts: { 1: 0, 2: 0, 3: 0, 4: 0 }, averageGrade: 0 };
    stats.total += 1;
    stats.gradeCounts[detail.grade] += 1;
    bySkill[action.skillCode!] = stats;
    if (action.skillCode === 'REC') { receptionTotal += 1; receptionPoints += detail.grade - 1; }
    if (action.skillCode === 'SPK') {
      attackTotal += 1;
      if (detail.code === 'KILL') attackKills += 1;
      if (detail.code === 'ERROR') attackErrors += 1;
      if (detail.code === 'BLOCKED') attackBlocks += 1;
    }
  }));
  Object.values(bySkill).forEach(stats => {
    const sum = ([1, 2, 3, 4] as VolleyballGrade[]).reduce((total, value) => total + value * stats.gradeCounts[value], 0);
    stats.averageGrade = stats.total ? Number((sum / stats.total).toFixed(2)) : 0;
  });
  return {
    eligibleActions, gradedActions,
    coveragePercentage: eligibleActions ? Number(((gradedActions / eligibleActions) * 100).toFixed(2)) : 0,
    gradeCounts, bySkill,
    receptionQualityPercentage: receptionTotal ? Number(((receptionPoints / (3 * receptionTotal)) * 100).toFixed(2)) : 0,
    attackEfficiencyPercentage: attackTotal ? Number((((attackKills - attackErrors - attackBlocks) / attackTotal) * 100).toFixed(2)) : 0,
  };
}
