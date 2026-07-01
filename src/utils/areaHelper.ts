export interface AreaDisplay {
  main: string;   // Always the uppercase short code/abbreviation
  sub: string;    // Clean description without redundant code in parentheses
}

const thMap: Record<string, string> = {
  LN: 'ซ้ายหน้า',
  CN: 'กลางหน้า',
  RN: 'ขวาหน้า',
  LB: 'ซ้ายหลัง',
  CB: 'กลางหลัง',
  RB: 'ขวาหลัง',
  NET: 'ติดเน็ต',
  OUT: 'ออกนอกสนาม',
  PAINT: 'ใต้แป้น',
  THREE_PT: 'สามแต้ม',
  LONG_OUT: 'ออกหลังเส้น',
  SIDE_OUT: 'ออกข้าง',
  NET_ERR: 'ติดเน็ต / เสียเน็ต',
  NET_ERROR: 'ติดเน็ต / เสียเน็ต',
  UNKNOWN: 'ไม่ระบุพื้นที่',
  BOX: 'กรอบเขตโทษ',
  GOAL: 'หน้าประตู',
  
  // Detailed grid zones for volleyball (e.g., LB-1, LN-1, CB-1, etc.)
  'LB-1': 'ซ้ายหลัง 1',
  'LB-2': 'ซ้ายหลัง 2',
  'LB-3': 'ซ้ายหลัง 3',
  'LB-4': 'ซ้ายหลัง 4',
  'LN-1': 'ซ้ายหน้า 1',
  'LN-2': 'ซ้ายหน้า 2',
  'CB-1': 'กลางหลัง 1',
  'CB-2': 'กลางหลัง 2',
  'CB-3': 'กลางหลัง 3',
  'CB-4': 'กลางหลัง 4',
  'CN-1': 'กลางหน้า 1',
  'CN-2': 'กลางหน้า 2',
  'RB-1': 'ขวาหลัง 1',
  'RB-2': 'ขวาหลัง 2',
  'RB-3': 'ขวาหลัง 3',
  'RB-4': 'ขวาหลัง 4',
  'RN-1': 'ขวาหน้า 1',
  'RN-2': 'ขวาหน้า 2',

  // Football
  ATT_L: 'หน้าซ้าย',
  ATT_C: 'หน้ากลาง',
  ATT_R: 'หน้าขวา',
  MID_L: 'กลางซ้าย',
  MID_C: 'กลาง',
  MID_R: 'กลางขวา',
  DEF_L: 'หลังซ้าย',
  DEF_C: 'หลังกลาง',
  DEF_R: 'หลังขวา',

  // Badminton
  FL: 'หน้าซ้าย',
  FC: 'หน้ากลาง',
  FR: 'หน้าขวา',
  ML: 'กลางซ้าย',
  MC: 'กลาง',
  MR: 'กลางขวา',
  BL: 'หลังซ้าย',
  BC: 'หลังกลาง',
  BR: 'หลังขวา',

  // Basketball
  LEFT_WING: 'ปีกซ้าย',
  RIGHT_WING: 'ปีกขวา',
  TOP_KEY: 'หัวกะโหลก',
  LEFT_CORNER: 'มุมซ้าย',
  RIGHT_CORNER: 'มุมขวา',
  MID_RANGE: 'ระยะกลาง',
};

const enMap: Record<string, string> = {
  LN: 'Left Near',
  CN: 'Center Near',
  RN: 'Right Near',
  LB: 'Left Back',
  CB: 'Center Back',
  RB: 'Right Back',
  NET: 'Net',
  OUT: 'Out of Bounds',
  PAINT: 'In the Paint',
  THREE_PT: '3-Pointer',
  LONG_OUT: 'Long Out',
  SIDE_OUT: 'Side Out',
  NET_ERR: 'Net Error',
  NET_ERROR: 'Net Error',
  UNKNOWN: 'Unknown Area',
  BOX: 'Penalty Box',
  GOAL: 'Goal Area',
  
  // Detailed grid zones for volleyball (e.g., LB-1, LN-1, CB-1, etc.)
  'LB-1': 'Left Back 1',
  'LB-2': 'Left Back 2',
  'LB-3': 'Left Back 3',
  'LB-4': 'Left Back 4',
  'LN-1': 'Left Near 1',
  'LN-2': 'Left Near 2',
  'CB-1': 'Center Back 1',
  'CB-2': 'Center Back 2',
  'CB-3': 'Center Back 3',
  'CB-4': 'Center Back 4',
  'CN-1': 'Center Near 1',
  'CN-2': 'Center Near 2',
  'RB-1': 'Right Back 1',
  'RB-2': 'Right Back 2',
  'RB-3': 'Right Back 3',
  'RB-4': 'Right Back 4',
  'RN-1': 'Right Near 1',
  'RN-2': 'Right Near 2',

  // Football
  ATT_L: 'Attack Left',
  ATT_C: 'Attack Center',
  ATT_R: 'Attack Right',
  MID_L: 'Midfield Left',
  MID_C: 'Midfield Center',
  MID_R: 'Midfield Right',
  DEF_L: 'Defense Left',
  DEF_C: 'Defense Center',
  DEF_R: 'Defense Right',

  // Badminton
  FL: 'Front Left',
  FC: 'Front Center',
  FR: 'Front Right',
  ML: 'Mid Left',
  MC: 'Mid Center',
  MR: 'Mid Right',
  BL: 'Back Left',
  BC: 'Back Center',
  BR: 'Back Right',

  // Basketball
  LEFT_WING: 'Left Wing',
  RIGHT_WING: 'Right Wing',
  TOP_KEY: 'Top of Key',
  LEFT_CORNER: 'Left Corner',
  RIGHT_CORNER: 'Right Corner',
  MID_RANGE: 'Mid Range',
};

export function getAreaDisplay(code: string, isThai: boolean = false, fallbackText: string = ''): AreaDisplay {
  if (!code) {
    return { main: '', sub: '' };
  }
  
  const cleanCode = code.toUpperCase().trim();
  
  let subText = '';
  if (isThai) {
    subText = thMap[cleanCode] || cleanParentheses(fallbackText);
  } else {
    subText = enMap[cleanCode] || cleanParentheses(fallbackText);
  }
  
  return {
    main: cleanCode,
    sub: subText
  };
}

function cleanParentheses(str: string): string {
  if (!str) return '';
  // Remove " (someCode)" or "(someCode)" patterns
  return str.replace(/\s*\([^)]*\)/g, '').trim();
}
