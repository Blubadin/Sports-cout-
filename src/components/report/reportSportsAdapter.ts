import type { SportType, EventRow } from '../../types';
import { SPORT_TEMPLATES } from '../../sports';

export interface SportReportMeta {
  sportType: SportType;
  sportName: string;
  sportThaiName: string;
  icon: string;
  scoreLabelTh: string;
  scoreLabelEn: string;
  stageLabel: (val?: string | number) => { th: string; en: string };
  zonesOverviewLabelTh: string;
  zonesOverviewLabelEn: string;
}

export interface ZoneReportData {
  id: string;
  code: string;
  labelTh: string;
  labelEn: string;
  subTh: string;
  subEn: string;
  posTh: string;
  posEn: string;
  total: number;
  kills: number;
  errors: number;
  attacks: number;
}

export interface SportTacticalAnalysis {
  zones: ZoneReportData[];
  hottestAttackZone: ZoneReportData | null;
  highestErrorZone: ZoneReportData | null;
  offensiveDiagnosisTh: string;
  offensiveDiagnosisEn: string;
  defensiveDiagnosisTh: string;
  defensiveDiagnosisEn: string;
  tacticalRecommendationsTh: string[];
  tacticalRecommendationsEn: string[];
}

export interface SportSkillBreakdownItem {
  skillCode: string;
  name: string;
  thaiName: string;
  total: number;
  success: number;
  error: number;
  inPlay: number;
}

export interface SkillEvaluationMetrics {
  total: number;
  level4: { count: number; pct: string; titleTh: string; titleEn: string; descTh: string; descEn: string };
  level3: { count: number; pct: string; titleTh: string; titleEn: string; descTh: string; descEn: string };
  level2: { count: number; pct: string; titleTh: string; titleEn: string; descTh: string; descEn: string };
  level1: { count: number; pct: string; titleTh: string; titleEn: string; descTh: string; descEn: string };
}

export function getSportReportMeta(sportType: SportType = 'volleyball'): SportReportMeta {
  switch (sportType) {
    case 'badminton':
      return {
        sportType: 'badminton',
        sportName: 'Badminton',
        sportThaiName: 'แบดมินตัน',
        icon: '🏸',
        scoreLabelTh: 'คะแนนรวมที่บันทึก (Recorded Points)',
        scoreLabelEn: 'Total Match Points',
        stageLabel: (val) => ({
          th: val ? `เกม ${val}` : 'ทั้งแมตช์',
          en: val ? `Game ${val}` : 'Full Match',
        }),
        zonesOverviewLabelTh: '6 โซนสนาม (Front / Mid / Rear)',
        zonesOverviewLabelEn: '6 Court Zones (Front/Mid/Rear)',
      };
    case 'football':
      return {
        sportType: 'football',
        sportName: 'Football',
        sportThaiName: 'ฟุตบอล',
        icon: '⚽',
        scoreLabelTh: 'ประตูรวมที่บันทึก (Total Goals)',
        scoreLabelEn: 'Total Match Goals',
        stageLabel: (val) => ({
          th: val ? `ครึ่งที่ ${val}` : 'ทั้งแมตช์',
          en: val ? `Half ${val}` : 'Full Match',
        }),
        zonesOverviewLabelTh: '9 โซนแท็กติก (Tactical Thirds)',
        zonesOverviewLabelEn: '9 Tactical Thirds Grid',
      };
    case 'basketball':
      return {
        sportType: 'basketball',
        sportName: 'Basketball',
        sportThaiName: 'บาสเกตบอล',
        icon: '🏀',
        scoreLabelTh: 'คะแนนรวมที่บันทึก (Total Points)',
        scoreLabelEn: 'Total Match Points',
        stageLabel: (val) => ({
          th: val ? `ควอเตอร์ ${val}` : 'ทั้งแมตช์',
          en: val ? `Quarter ${val}` : 'Full Match',
        }),
        zonesOverviewLabelTh: '7 โซนยิง (Floor Shot Zones)',
        zonesOverviewLabelEn: '7 Floor Shot Zones',
      };
    case 'volleyball':
    default:
      return {
        sportType: 'volleyball',
        sportName: 'Volleyball',
        sportThaiName: 'วอลเลย์บอล',
        icon: '🏐',
        scoreLabelTh: 'คะแนนรวมที่บันทึก (Recorded Points)',
        scoreLabelEn: 'Total Match Points',
        stageLabel: (val) => ({
          th: val ? `เซต ${val}` : 'ทั้งแมตช์',
          en: val ? `Set ${val}` : 'Full Match',
        }),
        zonesOverviewLabelTh: '9 โซนสากล (FIVB 9 Zones)',
        zonesOverviewLabelEn: 'FIVB 9-Zone Distribution',
      };
  }
}

export function computeSportSpatialAnalysis(
  sportType: SportType = 'volleyball',
  events: EventRow[] = []
): SportTacticalAnalysis {
  switch (sportType) {
    case 'badminton':
      return computeBadmintonSpatialAnalysis(events);
    case 'football':
      return computeFootballSpatialAnalysis(events);
    case 'basketball':
      return computeBasketballSpatialAnalysis(events);
    case 'volleyball':
    default:
      return computeVolleyballSpatialAnalysis(events);
  }
}

function computeVolleyballSpatialAnalysis(events: EventRow[]): SportTacticalAnalysis {
  const zoneDefs: Array<{ id: string; labelTh: string; labelEn: string; posTh: string; posEn: string }> = [
    { id: '4', labelTh: 'โซน 4 (หัวเสาซ้าย)', labelEn: 'Zone 4 (Left Front)', posTh: 'แดนหน้า', posEn: 'Front Left' },
    { id: '3', labelTh: 'โซน 3 (บล็อกกลาง)', labelEn: 'Zone 3 (Middle Front)', posTh: 'แดนหน้า', posEn: 'Front Mid' },
    { id: '2', labelTh: 'โซน 2 (หัวเสาขวา)', labelEn: 'Zone 2 (Right Front)', posTh: 'แดนหน้า', posEn: 'Front Right' },
    { id: '5', labelTh: 'โซน 5 (หลังซ้าย)', labelEn: 'Zone 5 (Left Back)', posTh: 'แดนหลัง', posEn: 'Back Left' },
    { id: '6', labelTh: 'โซน 6 (หลังกลาง)', labelEn: 'Zone 6 (Middle Back)', posTh: 'แดนหลัง', posEn: 'Back Mid' },
    { id: '1', labelTh: 'โซน 1 (หลังขวา/เสิร์ฟ)', labelEn: 'Zone 1 (Right Back)', posTh: 'แดนหลัง', posEn: 'Back Right' },
  ];

  const zoneMap: Record<string, ZoneReportData> = {};
  zoneDefs.forEach((def) => {
    zoneMap[def.id] = {
      id: def.id,
      code: def.id,
      labelTh: def.labelTh,
      labelEn: def.labelEn,
      subTh: def.labelTh,
      subEn: def.labelEn,
      posTh: def.posTh,
      posEn: def.posEn,
      total: 0,
      kills: 0,
      errors: 0,
      attacks: 0,
    };
  });

  events.forEach((ev) => {
    ev.actions?.forEach((a) => {
      const areaStr = String(a.areaCode || a.areaLabel || '').toUpperCase();
      let targetZone = '';
      if (areaStr.includes('4') || areaStr === 'LN') targetZone = '4';
      else if (areaStr.includes('3') || areaStr === 'CN') targetZone = '3';
      else if (areaStr.includes('2') || areaStr === 'RN') targetZone = '2';
      else if (areaStr.includes('5') || areaStr === 'LB') targetZone = '5';
      else if (areaStr.includes('6') || areaStr === 'CB') targetZone = '6';
      else if (areaStr.includes('1') || areaStr === 'RB') targetZone = '1';
      else {
        const match = areaStr.match(/[1-6]/);
        if (match) targetZone = match[0];
      }

      if (targetZone && zoneMap[targetZone]) {
        zoneMap[targetZone].total++;
        if (ev.resultText === '+1') zoneMap[targetZone].kills++;
        if (ev.resultText === '-1') zoneMap[targetZone].errors++;
        if (a.skillCode === 'SPK' || a.skillCode === 'ATK' || a.skillCode?.includes('SPIKE')) {
          zoneMap[targetZone].attacks++;
        }
      }
    });
  });

  const zones = zoneDefs.map((def) => zoneMap[def.id]);
  const hottest = zones.reduce((best, z) => (z.attacks > (best?.attacks ?? -1) ? z : best), zones[0]);
  const weakest = zones.reduce((best, z) => (z.errors > (best?.errors ?? -1) ? z : best), zones[0]);

  const hasAttacks = hottest && hottest.attacks > 0;
  const hasErrors = weakest && weakest.errors > 0;

  return {
    zones,
    hottestAttackZone: hasAttacks ? hottest : null,
    highestErrorZone: hasErrors ? weakest : null,
    offensiveDiagnosisTh: hasAttacks
      ? `มีการขึ้นตีลูกและส่งบอลไปยัง${hottest.labelTh}บ่อยที่สุด (${hottest.attacks} ครั้ง) โดยเฉพาะการเล่นบอลโครงสร้างหัวเสาและการเซ็ตบอลแบบ In-system ดึงตัวบล็อกคู่แข่ง`
      : 'ยังไม่มีข้อมูลการบุกแบบเจาะจงโซนในเซตนี้',
    offensiveDiagnosisEn: hasAttacks
      ? `${hottest.labelEn} registered the highest attacking volume (${hottest.attacks} attacks), primarily utilizing outside hitters in transition.`
      : 'No zone-specific attack data recorded yet for this session.',
    defensiveDiagnosisTh: hasErrors
      ? `${weakest.labelTh}มีอัตราลูกเสียและรับบอลแตกสูงสุด (${weakest.errors} ครั้ง) คู่แข่งมักเลือกจี้ลูกเสิร์ฟและตบปัดทอดมาที่มุมนี้ ควรปรับแนวการยืนของลิเบอโร่เพื่อปิดช่องว่าง`
      : 'ทีมรักษาระเบียบเกมรับได้สม่ำเสมอ ยังไม่พบจุดอ่อนสะสมชัดเจน',
    defensiveDiagnosisEn: hasErrors
      ? `${weakest.labelEn} registered the highest error and reception breakdowns (${weakest.errors} faults). Recommend adjusting defensive coverage.`
      : 'Defensive organization remains stable across all court zones.',
    tacticalRecommendationsTh: [
      'เน้นเสิร์ฟจี้ไปยัง Zone 5 และ Zone 6 ของคู่แข่งเพื่อตัดเกมรุกบอลเร็ว',
      'ปรับตัวบล็อกกลาง (MB) ให้ยืนชิดเสาซ้ายมากขึ้นเพื่อปิดมุมตบฉีก',
      'เร่งจังหวะการโต้กลับ (Counter-attack) เมื่อรับบอลแรกเข้าจุด A-Pass',
    ],
    tacticalRecommendationsEn: [
      'Target opponent Zone 5 & 6 on serve to disrupt quick middle attacks.',
      'Commit middle blocker slightly towards antenna to neutralize cross-court hits.',
      'Accelerate counter-attack tempo when primary pass reaches the setter in-system.',
    ],
  };
}

function computeBadmintonSpatialAnalysis(events: EventRow[]): SportTacticalAnalysis {
  const zoneDefs: Array<{ id: string; labelTh: string; labelEn: string; posTh: string; posEn: string }> = [
    { id: 'FL', labelTh: 'หน้าซ้าย (Net Left)', labelEn: 'Front Left', posTh: 'หน้าเน็ต', posEn: 'Net Area' },
    { id: 'FR', labelTh: 'หน้าขวา (Net Right)', labelEn: 'Front Right', posTh: 'หน้าเน็ต', posEn: 'Net Area' },
    { id: 'ML', labelTh: 'กลางซ้าย (Mid Left)', labelEn: 'Mid Left', posTh: 'กลางคอร์ต', posEn: 'Midcourt' },
    { id: 'MR', labelTh: 'กลางขวา (Mid Right)', labelEn: 'Mid Right', posTh: 'กลางคอร์ต', posEn: 'Midcourt' },
    { id: 'BL', labelTh: 'หลังซ้าย (Back Left)', labelEn: 'Back Left', posTh: 'ท้ายคอร์ต', posEn: 'Rear Court' },
    { id: 'BR', labelTh: 'หลังขวา (Back Right)', labelEn: 'Back Right', posTh: 'ท้ายคอร์ต', posEn: 'Rear Court' },
  ];

  const zoneMap: Record<string, ZoneReportData> = {};
  zoneDefs.forEach((def) => {
    zoneMap[def.id] = {
      id: def.id,
      code: def.id,
      labelTh: def.labelTh,
      labelEn: def.labelEn,
      subTh: def.labelTh,
      subEn: def.labelEn,
      posTh: def.posTh,
      posEn: def.posEn,
      total: 0,
      kills: 0,
      errors: 0,
      attacks: 0,
    };
  });

  events.forEach((ev) => {
    ev.actions?.forEach((a) => {
      const area = String(a.areaCode || a.areaLabel || '').toUpperCase();
      let targetZone = '';

      if (area === 'FL' || area === 'FRONT_LEFT') targetZone = 'FL';
      else if (area === 'FR' || area === 'FRONT_RIGHT') targetZone = 'FR';
      else if (area === 'FRONT' || area === 'FC') targetZone = 'FL'; // distribute front
      else if (area === 'ML' || area === 'MID_LEFT') targetZone = 'ML';
      else if (area === 'MR' || area === 'MID_RIGHT') targetZone = 'MR';
      else if (area === 'MID' || area === 'MC') targetZone = 'ML'; // distribute mid
      else if (area === 'BL' || area === 'BACK_LEFT') targetZone = 'BL';
      else if (area === 'BR' || area === 'BACK_RIGHT') targetZone = 'BR';
      else if (area === 'BACK' || area === 'BC') targetZone = 'BR'; // distribute back

      if (targetZone && zoneMap[targetZone]) {
        zoneMap[targetZone].total++;
        if (ev.resultText === '+1') zoneMap[targetZone].kills++;
        if (ev.resultText === '-1') zoneMap[targetZone].errors++;
        if ((a.skillCode === 'SMH' || a.skillCode === 'DRP' || a.skillCode?.includes('SMASH')) ||
            (a.skillCode === 'NET' && ev.resultText !== '-1')) {
          zoneMap[targetZone].attacks++;
        }
      }
    });
  });

  const zones = zoneDefs.map((def) => zoneMap[def.id]);
  const hottest = zones.reduce((best, z) => (z.attacks > (best?.attacks ?? -1) ? z : best), zones[0]);
  const weakest = zones.reduce((best, z) => (z.errors > (best?.errors ?? -1) ? z : best), zones[0]);

  const hasAttacks = hottest && hottest.attacks > 0;
  const hasErrors = weakest && weakest.errors > 0;

  return {
    zones,
    hottestAttackZone: hasAttacks ? hottest : null,
    highestErrorZone: hasErrors ? weakest : null,
    offensiveDiagnosisTh: hasAttacks
      ? `พื้นที่ ${hottest.labelTh} เป็นจุดที่ทำเกมรุกกดดันสำเร็จสูงสุด (${hottest.attacks} ครั้ง) มีการใช้ลูกตบปักและหยอดตัดหน้าเน็ตเพื่อปิดแต้มอย่างมีประสิทธิภาพ`
      : 'ยังไม่มีสถิติจุดทำแต้มเด็ดขาดในเกมนี้',
    offensiveDiagnosisEn: hasAttacks
      ? `${hottest.labelEn} proved the primary offensive target area (${hottest.attacks} decisive attacks), effectively finished by smashes and sharp net drops.`
      : 'No dominant attacking zone recorded yet.',
    defensiveDiagnosisTh: hasErrors
      ? `พบจุดเสียเปรียบและข้อผิดพลาดสูงสุดที่บริเวณ ${weakest.labelTh} (${weakest.errors} ครั้ง) มีทั้งการรับลูกตบไม่พ้นเน็ตและการตีลูกออกหลังเส้น`
      : 'การคุมพื้นที่รับและป้องกันลูกเสิร์ฟมีความรัดกุมสูง',
    defensiveDiagnosisEn: hasErrors
      ? `${weakest.labelEn} accumulated the most unforced and pressured errors (${weakest.errors} faults), showing vulnerability to steep cross-court shots.`
      : 'Court coverage and defensive footwork remain solid without focal breakdowns.',
    tacticalRecommendationsTh: [
      'จี้ลูกหยอดและตัดชิดตาข่ายบังคับให้คู่แข่งต้องงัดลูกโด่ง (Lift) เปิดโอกาสตบทำแต้ม',
      'โจมตีมุมหลังโฟร์แฮนด์/แบ็คแฮนด์สลับเพื่อดึงให้คู่แข่งเสียสมดุลการยืน',
      'เพิ่มความแม่นยำในการวางลูกไดรฟ์เรียดเน็ตตัดจังหวะการบุกของคู่แข่ง',
    ],
    tacticalRecommendationsEn: [
      'Tighten net drops to force high, shallow lifts for overhead attack conversion.',
      'Target opponent deep corners alternately to break their center-court base recovery.',
      'Employ fast flat drives down the sideline to bypass opponent intercepting net players.',
    ],
  };
}

function computeFootballSpatialAnalysis(events: EventRow[]): SportTacticalAnalysis {
  const zoneDefs: Array<{ id: string; labelTh: string; labelEn: string; posTh: string; posEn: string }> = [
    { id: 'ATT_L', labelTh: 'รุกซ้าย (Attacking Left)', labelEn: 'Attacking Left Flank', posTh: 'แดนหน้า', posEn: 'Final Third' },
    { id: 'ATT_C', labelTh: 'รุกกลาง/เขตโทษ (Box & Center)', labelEn: 'Penalty Box & Center', posTh: 'แดนหน้า', posEn: 'Final Third' },
    { id: 'ATT_R', labelTh: 'รุกขวา (Attacking Right)', labelEn: 'Attacking Right Flank', posTh: 'แดนหน้า', posEn: 'Final Third' },
    { id: 'MID_L', labelTh: 'กลางซ้าย (Midfield Left)', labelEn: 'Midfield Left', posTh: 'แดนกลาง', posEn: 'Middle Third' },
    { id: 'MID_C', labelTh: 'กลางสนาม (Central Midfield)', labelEn: 'Central Midfield', posTh: 'แดนกลาง', posEn: 'Middle Third' },
    { id: 'MID_R', labelTh: 'กลางขวา (Midfield Right)', labelEn: 'Midfield Right', posTh: 'แดนกลาง', posEn: 'Middle Third' },
    { id: 'DEF_L', labelTh: 'รับซ้าย (Defensive Left)', labelEn: 'Defensive Left', posTh: 'แดนหลัง', posEn: 'Defensive Third' },
    { id: 'DEF_C', labelTh: 'รับกลาง/หน้าประตู (Own Goal)', labelEn: 'Central Defense & Goal', posTh: 'แดนหลัง', posEn: 'Defensive Third' },
    { id: 'DEF_R', labelTh: 'รับขวา (Defensive Right)', labelEn: 'Defensive Right', posTh: 'แดนหลัง', posEn: 'Defensive Third' },
  ];

  const zoneMap: Record<string, ZoneReportData> = {};
  zoneDefs.forEach((def) => {
    zoneMap[def.id] = {
      id: def.id,
      code: def.id,
      labelTh: def.labelTh,
      labelEn: def.labelEn,
      subTh: def.labelTh,
      subEn: def.labelEn,
      posTh: def.posTh,
      posEn: def.posEn,
      total: 0,
      kills: 0,
      errors: 0,
      attacks: 0,
    };
  });

  events.forEach((ev) => {
    ev.actions?.forEach((a) => {
      const area = String(a.areaCode || a.areaLabel || '').toUpperCase();
      let targetZone = '';

      if (area === 'ATT_L') targetZone = 'ATT_L';
      else if (area === 'ATT_C' || area === 'BOX' || area === 'GOAL') targetZone = 'ATT_C';
      else if (area === 'ATT_R') targetZone = 'ATT_R';
      else if (area === 'MID_L') targetZone = 'MID_L';
      else if (area === 'MID_C' || area === 'MID') targetZone = 'MID_C';
      else if (area === 'MID_R') targetZone = 'MID_R';
      else if (area === 'DEF_L') targetZone = 'DEF_L';
      else if (area === 'DEF_C' || area === 'DEF') targetZone = 'DEF_C';
      else if (area === 'DEF_R') targetZone = 'DEF_R';

      if (targetZone && zoneMap[targetZone]) {
        zoneMap[targetZone].total++;
        if (ev.resultText === '+1') zoneMap[targetZone].kills++;
        if (ev.resultText === '-1') zoneMap[targetZone].errors++;
        if (a.skillCode === 'SHT' || a.skillCode === 'CRS' || a.skillCode === 'DRB') {
          zoneMap[targetZone].attacks++;
        }
      }
    });
  });

  const zones = zoneDefs.map((def) => zoneMap[def.id]);
  const hottest = zones.reduce((best, z) => (z.attacks > (best?.attacks ?? -1) ? z : best), zones[0]);
  const weakest = zones.reduce((best, z) => (z.errors > (best?.errors ?? -1) ? z : best), zones[0]);

  const hasAttacks = hottest && hottest.attacks > 0;
  const hasErrors = weakest && weakest.errors > 0;

  return {
    zones,
    hottestAttackZone: hasAttacks ? hottest : null,
    highestErrorZone: hasErrors ? weakest : null,
    offensiveDiagnosisTh: hasAttacks
      ? `พื้นที่ ${hottest.labelTh} มีการสร้างสรรค์เกมรุกและโอกาสจบสกอร์สูงสุด (${hottest.attacks} ครั้ง) เน้นการเจาะผ่านช่องว่างและการประสานงานแดนบน`
      : 'ยังไม่มีข้อมูลการสร้างโอกาสเข้าทำชัดเจนในแมตช์นี้',
    offensiveDiagnosisEn: hasAttacks
      ? `${hottest.labelEn} served as the primary attacking corridor (${hottest.attacks} attacking actions / shots / crosses), exploiting defensive seam gaps.`
      : 'No concentrated final-third threat area observed yet.',
    defensiveDiagnosisTh: hasErrors
      ? `มีการเสียการครอบครองบอลและถูกตัดบอลมากที่สุดในพื้นที่ ${weakest.labelTh} (${weakest.errors} ครั้ง) ต้องระวังการถูกโต้กลับเร็ว (Counter-pressing)`
      : 'การเก็บบอลจังหวะสองและป้องกันแดนหลังมีวินัยสูง',
    defensiveDiagnosisEn: hasErrors
      ? `${weakest.labelEn} suffered the highest turnover and interception losses (${weakest.errors} turnovers), leaving vulnerable transitional channels.`
      : 'Defensive shape and possession retention remain balanced.',
    tacticalRecommendationsTh: [
      'ใช้การถ่ายบอลเร็ว (Switch of play) ข้ามฟากเพื่อดึงกองหลังคู่แข่งออกจากจุดศูนย์กลาง',
      'เพิ่มผู้เล่นในพื้นที่ Half-space บริเวณรอยต่อระหว่างแดนกลางกับแดนหน้า',
      'กวดขันการจัดตำแหน่งแผงหลัง (Rest defense) เมื่อดันเกมรุกสูงเพื่อป้องกันลูกแทงทะลุช่อง',
    ],
    tacticalRecommendationsEn: [
      'Switch play quickly to opposite flank to stretch opponent compact defensive block.',
      'Occupy half-spaces effectively to create overloads against opposing fullbacks.',
      'Strengthen rest defense positioning during high attacking phases to shut down counters.',
    ],
  };
}

function computeBasketballSpatialAnalysis(events: EventRow[]): SportTacticalAnalysis {
  const zoneDefs: Array<{ id: string; labelTh: string; labelEn: string; posTh: string; posEn: string }> = [
    { id: 'PAINT', labelTh: 'ใต้แป้น (Paint / Rim)', labelEn: 'Paint / Restricted Area', posTh: 'ใต้แป้น', posEn: 'Under Rim' },
    { id: 'MID_RANGE', labelTh: 'ระยะกลาง (Mid-Range)', labelEn: 'Mid-Range', posTh: 'สองแต้ม', posEn: '2PT Mid' },
    { id: 'TOP_KEY', labelTh: 'หัวกะโหลก 3 แต้ม (Top of Key)', labelEn: 'Top of Key (3PT)', posTh: 'นอกเส้น', posEn: '3PT Arc' },
    { id: 'LEFT_WING', labelTh: 'ปีกซ้าย (Left Wing)', labelEn: 'Left Wing (3PT / Mid)', posTh: 'ริมเส้น', posEn: 'Perimeter' },
    { id: 'RIGHT_WING', labelTh: 'ปีกขวา (Right Wing)', labelEn: 'Right Wing (3PT / Mid)', posTh: 'ริมเส้น', posEn: 'Perimeter' },
    { id: 'LEFT_CORNER', labelTh: 'มุมซ้าย 3 แต้ม (Left Corner)', labelEn: 'Left Corner (3PT)', posTh: 'มุมสนาม', posEn: 'Corner' },
    { id: 'RIGHT_CORNER', labelTh: 'มุมขวา 3 แต้ม (Right Corner)', labelEn: 'Right Corner (3PT)', posTh: 'มุมสนาม', posEn: 'Corner' },
  ];

  const zoneMap: Record<string, ZoneReportData> = {};
  zoneDefs.forEach((def) => {
    zoneMap[def.id] = {
      id: def.id,
      code: def.id,
      labelTh: def.labelTh,
      labelEn: def.labelEn,
      subTh: def.labelTh,
      subEn: def.labelEn,
      posTh: def.posTh,
      posEn: def.posEn,
      total: 0,
      kills: 0,
      errors: 0,
      attacks: 0,
    };
  });

  events.forEach((ev) => {
    ev.actions?.forEach((a) => {
      const area = String(a.areaCode || a.areaLabel || '').toUpperCase();
      let targetZone = '';

      if (area === 'PAINT') targetZone = 'PAINT';
      else if (area === 'MID_RANGE' || area === 'MID') targetZone = 'MID_RANGE';
      else if (area === 'TOP_KEY' || area === 'THREE_PT' || area === '3PT') targetZone = 'TOP_KEY';
      else if (area === 'LEFT_WING') targetZone = 'LEFT_WING';
      else if (area === 'RIGHT_WING') targetZone = 'RIGHT_WING';
      else if (area === 'LEFT_CORNER') targetZone = 'LEFT_CORNER';
      else if (area === 'RIGHT_CORNER') targetZone = 'RIGHT_CORNER';

      if (targetZone && zoneMap[targetZone]) {
        zoneMap[targetZone].total++;
        if (ev.resultText === '+1') zoneMap[targetZone].kills++;
        if (ev.resultText === '-1') zoneMap[targetZone].errors++;
        if (a.skillCode === 'SHT' || a.skillCode === 'LAY' || a.skillCode?.includes('SHOT')) {
          zoneMap[targetZone].attacks++;
        }
      }
    });
  });

  const zones = zoneDefs.map((def) => zoneMap[def.id]);
  const hottest = zones.reduce((best, z) => (z.attacks > (best?.attacks ?? -1) ? z : best), zones[0]);
  const weakest = zones.reduce((best, z) => (z.errors > (best?.errors ?? -1) ? z : best), zones[0]);

  const hasAttacks = hottest && hottest.attacks > 0;
  const hasErrors = weakest && weakest.errors > 0;

  return {
    zones,
    hottestAttackZone: hasAttacks ? hottest : null,
    highestErrorZone: hasErrors ? weakest : null,
    offensiveDiagnosisTh: hasAttacks
      ? `ทีมทำคะแนนและปล่อยการยิงมากที่สุดในพื้นที่ ${hottest.labelTh} (${hottest.attacks} ครั้ง) ประสิทธิภาพการเข้าทำขึ้นอยู่กับการสร้างจังหวะ Open Shot`
      : 'ยังไม่มีสถิติโซนการยิงที่บันทึกไว้ในเกมนี้',
    offensiveDiagnosisEn: hasAttacks
      ? `${hottest.labelEn} generated the highest shot volume (${hottest.attacks} attempts), driven by offensive penetration and floor spacing.`
      : 'No concentrated shot location data logged yet.',
    defensiveDiagnosisTh: hasErrors
      ? `มีอัตราการยิงพลาดและเสียการครอบครองบอล (Turnovers) สะสมสูงสุดที่ ${weakest.labelTh} (${weakest.errors} ครั้ง)`
      : 'การดูแลบอลและการป้องกันไม่ให้คู่แข่งเข้าทำในพื้นที่อันตรายทำได้ดี',
    defensiveDiagnosisEn: hasErrors
      ? `${weakest.labelEn} registered the highest missed field goals and turnovers (${weakest.errors} faults).`
      : 'Ball security and paint defense remain consistent across possessions.',
    tacticalRecommendationsTh: [
      'ใช้การสกรีน Pick & Roll เพื่อดึงตัวประกบคู่แข่งและเปิดพื้นที่ Drive เข้าหาห่วง',
      'หมุนบอลออกมุมปีกและคอร์เนอร์ (Kick-out pass) เพื่อสร้างโอกาสยิงสามแต้มโล่งๆ',
      'เน้นการรีบาวด์เกมรับ (Box-out) เพื่อตัดโอกาสการเล่นลูกซ้ำรอบสองของคู่แข่ง',
    ],
    tacticalRecommendationsEn: [
      'Leverage high Pick & Roll to compromise opponent drop coverage and unlock paint lanes.',
      'Kick out to perimeter corners for high-percentage spot-up three-point opportunities.',
      'Reinforce defensive box-outs to prevent opponent offensive second-chance points.',
    ],
  };
}

export function computeSportSkillBreakdown(
  sportType: SportType = 'volleyball',
  events: EventRow[] = []
): SportSkillBreakdownItem[] {
  const template = SPORT_TEMPLATES[sportType];
  const skills = template?.skills || [];
  const map: Record<string, SportSkillBreakdownItem> = {};

  skills.forEach((s) => {
    map[s.code] = {
      skillCode: s.code,
      name: s.name,
      thaiName: s.thaiName,
      total: 0,
      success: 0,
      error: 0,
      inPlay: 0,
    };
  });

  events.forEach((ev) => {
    ev.actions?.forEach((a) => {
      const code = a.skillCode || '';
      if (!map[code]) {
        map[code] = {
          skillCode: code,
          name: code,
          thaiName: code,
          total: 0,
          success: 0,
          error: 0,
          inPlay: 0,
        };
      }
      map[code].total++;
      if (ev.resultText === '+1' || a.resultCode === 'Yes') {
        map[code].success++;
      } else if (ev.resultText === '-1' || a.resultCode === 'Out') {
        map[code].error++;
      } else {
        map[code].inPlay++;
      }
    });
  });

  return Object.values(map).filter((item) => item.total > 0);
}

export function compute4LevelSkillMetrics(
  sportType: SportType = 'volleyball',
  events: EventRow[] = []
): SkillEvaluationMetrics {
  let total = 0;
  let level4Count = 0;
  let level3Count = 0;
  let level2Count = 0;
  let level1Count = 0;

  events.forEach((ev) => {
    total++;
    if (ev.resultText === '+1') {
      level4Count++;
    } else if (ev.resultText === '-1') {
      level1Count++;
    } else {
      const hasEffectiveDetail = ev.actions?.some(
        (a) =>
          a.resultDetailCode?.includes('Good') ||
          a.resultDetailCode?.includes('A-Pass') ||
          a.resultDetailCode?.includes('CMP') ||
          a.resultDetailCode?.includes('ON')
      );
      if (hasEffectiveDetail) {
        level3Count++;
      } else {
        level2Count++;
      }
    }
  });

  const pct = (cnt: number) => (total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0');

  const l4TitleTh = '4 คะแนน (++++ / เด็ดขาด / ได้แต้ม)';
  const l4TitleEn = 'Level 4 (++++ / Decisive / Winning)';
  let l4DescTh = 'ลูกทำแต้มเด็ดขาด (Ace, Kill, Goal, Direct Winner, Made 3PT)';
  const l4DescEn = 'Direct winning execution, decisive points, and goals.';

  const l3TitleTh = '3 คะแนน (+++ / สร้างความได้เปรียบ)';
  const l3TitleEn = 'Level 3 (+++ / Advantageous)';
  let l3DescTh = 'สร้างความได้เปรียบทางแท็กติกสูง (บุกกดดัน, จ่ายบอลสร้างโอกาส, Touch Block)';
  const l3DescEn = 'High-quality tactical plays creating strong scoring opportunities.';

  const l2TitleTh = '2 คะแนน (++ / เล่นต่อในเกม)';
  const l2TitleEn = 'Level 2 (++ / Neutral / In-Play)';
  let l2DescTh = 'การเล่นรักษาจังหวะ (เก็บบอล, ส่งบอลปกติ, เล่นต่อในระบบ)';
  const l2DescEn = 'Neutral plays keeping possession and rally in sequence.';

  const l1TitleTh = '1 คะแนน (- / ผิดพลาด / เสียแต้ม)';
  const l1TitleEn = 'Level 1 (- / Error / Conceded)';
  let l1DescTh = 'ข้อผิดพลาด (ตีเสีย, จ่ายบอลเสีย, เสียการครองบอล, ฟาวล์)';
  const l1DescEn = 'Unforced/forced errors and lost possessions.';

  if (sportType === 'football') {
    l4DescTh = 'เข้าประตู หรือ จ่ายบอลชี้ขาด (Goal, Assist, Decisive Save)';
    l3DescTh = 'ส่งบอลก้าวหน้าสำเร็จ, เลี้ยงผ่าน, หรือตัดบอลแดนกลาง';
    l2DescTh = 'ส่งบอลคืนหลัง, ประคองบอลในเกม, เคลียร์บอลปลอดภัย';
    l1DescTh = 'เสียบอล, ยิงหลุดกรอบ, เสียฟาวล์, ตัดบอลพลาด';
  } else if (sportType === 'badminton') {
    l4DescTh = 'ลูกตบปิดแต้ม (Smash Winner), หยอดตัดหน้าเน็ตได้แต้ม, เสิร์ฟเอซ';
    l3DescTh = 'ตบกดดันคู่แข่ง, หยอดติดเน็ตบีบคู่แข่งต้องงัดลูกโด่ง, สกัดลูกไดรฟ์';
    l2DescTh = 'โยกโด่งเซฟ, ยกบอลลึกแดนหลัง, ไดรฟ์ประคองข้ามแดน';
    l1DescTh = 'ตีติดเน็ต, ตีออกเส้น, เสิร์ฟเสีย, งัดลูกสั้นเข้าทางคู่แข่ง';
  } else if (sportType === 'basketball') {
    l4DescTh = 'ยิง 3 แต้มลง, Fastbreak Layup, Steal & Score, And-1';
    l3DescTh = 'แอสซิสต์, รีบาวด์เกมรับ, ยิงระยะกลางลง, สกรีนหลุด';
    l2DescTh = 'ส่งบอลรอบวงกลม, ยิงติดบล็อกแต่เก็บบอลได้, ประคองเวลา';
    l1DescTh = 'Turnover, ส่งบอลเสีย, ยิงโดนบล็อก, ทำฟาวล์เสียลูกโทษ';
  }

  return {
    total,
    level4: { count: level4Count, pct: pct(level4Count), titleTh: l4TitleTh, titleEn: l4TitleEn, descTh: l4DescTh, descEn: l4DescEn },
    level3: { count: level3Count, pct: pct(level3Count), titleTh: l3TitleTh, titleEn: l3TitleEn, descTh: l3DescTh, descEn: l3DescEn },
    level2: { count: level2Count, pct: pct(level2Count), titleTh: l2TitleTh, titleEn: l2TitleEn, descTh: l2DescTh, descEn: l2DescEn },
    level1: { count: level1Count, pct: pct(level1Count), titleTh: l1TitleTh, titleEn: l1TitleEn, descTh: l1DescTh, descEn: l1DescEn },
  };
}
