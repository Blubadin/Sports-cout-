import { Team, Skill, Area, ResultType } from './types';

export const DEFAULT_TEAMS: Team[] = [
  { id: 't1', code: 'THA', name: 'THAILAND', thaiName: 'ไทย' },
  { id: 't2', code: 'JPN', name: 'JAPAN', thaiName: 'ญี่ปุ่น' },
];

export const DEFAULT_SKILLS: Skill[] = [
  { id: 's1', code: 'SV', name: 'Serve', thaiName: 'เสิร์ฟ' },
  { id: 's2', code: 'SPK', name: 'Spike', thaiName: 'ตบ' },
  { id: 's3', code: 'UND', name: 'Under', thaiName: 'รับล่าง' },
  { id: 's4', code: 'SET', name: 'Set', thaiName: 'ตั้ง' },
  { id: 's5', code: 'BLK', name: 'Block', thaiName: 'บล็อก' },
  { id: 's6', code: 'REC', name: 'Receive', thaiName: 'รับเสิร์ฟ' },
  { id: 's7', code: 'DIG', name: 'Dig', thaiName: 'รับตบ' },
];

export const DEFAULT_AREAS: Area[] = [
  { id: 'a4', code: 'LN', thaiName: 'หน้า/ซ้าย' },
  { id: 'a5', code: 'CN', thaiName: 'หน้า/กลาง' },
  { id: 'a6', code: 'RN', thaiName: 'หน้า/ขวา' },
  { id: 'a1', code: 'LB', thaiName: 'หลัง/ซ้าย' },
  { id: 'a2', code: 'CB', thaiName: 'หลัง/กลาง' },
  { id: 'a3', code: 'RB', thaiName: 'หลัง/ขวา' },
  { id: 'a7', code: 'NET', thaiName: 'เน็ต' },
];

export const DEFAULT_RESULTS: ResultType[] = [
  { id: 'r1', code: 'Yes', score: 1, thaiName: 'ได้แต้ม / สำเร็จ' },
  { id: 'r2', code: 'Out', score: -1, thaiName: 'เสียแต้ม / ผิดพลาด' },
  { id: 'r3', code: 'Pass', score: 0, thaiName: 'ผ่าน / เล่นต่อ' },
];
