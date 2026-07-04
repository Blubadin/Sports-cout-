import fs from 'fs';
let code = fs.readFileSync('src/sports.ts', 'utf-8');

const vbFouls = `
    fouls: [
      { code: 'NET_TOUCH', label: 'Net Touch', labelTh: 'แตะเน็ต', role: 'violation', severity: 'normal' },
      { code: 'FOOT_FAULT', label: 'Foot Fault', labelTh: 'เหยียบเส้น', role: 'violation', severity: 'normal' },
      { code: 'ROTATION', label: 'Rotation Fault', labelTh: 'ผิดตำแหน่งหมุน', role: 'violation', severity: 'normal' },
      { code: 'DOUBLE', label: 'Double Contact', labelTh: 'สัมผัสสองครั้ง', role: 'violation', severity: 'normal' },
      { code: 'FOUR_HITS', label: 'Four Hits', labelTh: 'เล่นเกิน 3 ครั้ง', role: 'violation', severity: 'normal' },
      { code: 'CARRY', label: 'Carry', labelTh: 'อุ้มบอล / พักบอล', role: 'violation', severity: 'normal' }
    ],`;

code = code.replace(
  `{ id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],
    descriptors: {`,
  `{ id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],` + vbFouls + `
    descriptors: {`
);

const fbFouls = `
    fouls: [
      { code: 'FOUL', label: 'Foul', labelTh: 'ทำฟาวล์', role: 'committed', severity: 'normal' },
      { code: 'HANDBALL', label: 'Handball', labelTh: 'แฮนด์บอล', role: 'violation', severity: 'normal' },
      { code: 'OFFSIDE', label: 'Offside', labelTh: 'ล้ำหน้า', role: 'violation', severity: 'normal' },
      { code: 'YELLOW', label: 'Yellow Card', labelTh: 'ใบเหลือง', role: 'committed', severity: 'card' },
      { code: 'RED', label: 'Red Card', labelTh: 'ใบแดง', role: 'committed', severity: 'card' },
      { code: 'PENALTY', label: 'Penalty Conceded', labelTh: 'เสียจุดโทษ', role: 'committed', severity: 'normal' }
    ],`;

code = code.replace(
  `{ id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],
    descriptors: {`,
  `{ id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],` + fbFouls + `
    descriptors: {`
);

const bdFouls = `
    fouls: [
      { code: 'SERVICE_FAULT', label: 'Service Fault', labelTh: 'เสิร์ฟผิดกติกา', role: 'violation', severity: 'normal' },
      { code: 'NET_TOUCH', label: 'Net Touch', labelTh: 'แตะเน็ต', role: 'violation', severity: 'normal' },
      { code: 'DOUBLE_HIT', label: 'Double Hit', labelTh: 'ตีสองครั้ง', role: 'violation', severity: 'normal' },
      { code: 'CARRY', label: 'Carry', labelTh: 'พักลูก / อุ้มลูก', role: 'violation', severity: 'normal' },
      { code: 'WRONG_COURT', label: 'Wrong Court', labelTh: 'ยืนผิดตำแหน่ง', role: 'violation', severity: 'normal' }
    ],`;

code = code.replace(
  `{ id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],
    descriptors: {`,
  `{ id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],` + bdFouls + `
    descriptors: {`
);

const bkbFouls = `
    fouls: [
      { code: 'PERSONAL', label: 'Personal Foul', labelTh: 'ฟาวล์บุคคล', role: 'committed', severity: 'normal' },
      { code: 'OFFENSIVE', label: 'Offensive Foul', labelTh: 'ฟาวล์รุก', role: 'committed', severity: 'normal' },
      { code: 'SHOOTING', label: 'Shooting Foul', labelTh: 'ฟาวล์ขณะยิง', role: 'committed', severity: 'normal' },
      { code: 'TECHNICAL', label: 'Technical Foul', labelTh: 'ฟาวล์เทคนิค', role: 'technical', severity: 'technical' },
      { code: 'UNSPORT', label: 'Unsportsmanlike Foul', labelTh: 'ฟาวล์ไม่มีน้ำใจนักกีฬา', role: 'committed', severity: 'technical' },
      { code: 'TRAVEL', label: 'Traveling', labelTh: 'เดิน', role: 'violation', severity: 'normal' },
      { code: 'DOUBLE_DRIBBLE', label: 'Double Dribble', labelTh: 'เลี้ยงสองครั้ง', role: 'violation', severity: 'normal' }
    ],`;

code = code.replace(
  `{ id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],
    descriptors: {`,
  `{ id: 'res_pass', code: 'Pass', score: 0, thaiName: 'เล่นต่อ' },
    ],` + bkbFouls + `
    descriptors: {`
);

fs.writeFileSync('src/sports.ts', code);
