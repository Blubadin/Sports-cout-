export interface AreaDisplay {
  main: string;
  sub: string;
}

const thMap: Record<string, string> = {
  LN: "ซ้ายหน้า",
  CN: "กลางหน้า",
  RN: "ขวาหน้า",
  LB: "ซ้ายหลัง",
  CB: "กลางหลัง",
  RB: "ขวาหลัง",
  NET: "ติดเน็ต",
  OUT: "ออกนอกสนาม",
  LONG_OUT: "ออกหลังเส้น",
  SIDE_OUT: "ออกข้าง",
  NET_ERR: "ติดเน็ต / เสียเน็ต",
  NET_ERROR: "ติดเน็ต / เสียเน็ต",
  UNKNOWN: "ไม่ระบุพื้นที่",

  "LB-1": "ซ้ายหลัง 1",
  "LB-2": "ซ้ายหลัง 2",
  "LB-3": "ซ้ายหลัง 3",
  "LB-4": "ซ้ายหลัง 4",
  "LN-1": "ซ้ายหน้า 1",
  "LN-2": "ซ้ายหน้า 2",
  "CB-1": "กลางหลัง 1",
  "CB-2": "กลางหลัง 2",
  "CB-3": "กลางหลัง 3",
  "CB-4": "กลางหลัง 4",
  "CN-1": "กลางหน้า 1",
  "CN-2": "กลางหน้า 2",
  "RB-1": "ขวาหลัง 1",
  "RB-2": "ขวาหลัง 2",
  "RB-3": "ขวาหลัง 3",
  "RB-4": "ขวาหลัง 4",
  "RN-1": "ขวาหน้า 1",
  "RN-2": "ขวาหน้า 2",

  ATT_L: "แดนรุกซ้าย",
  ATT_C: "แดนรุกกลาง",
  ATT_R: "แดนรุกขวา",
  MID_L: "กลางซ้าย",
  MID_C: "กลางสนาม",
  MID_R: "กลางขวา",
  DEF_L: "แดนรับซ้าย",
  DEF_C: "แดนรับกลาง",
  DEF_R: "แดนรับขวา",
  BOX: "กรอบเขตโทษ",
  GOAL: "หน้าประตู",

  FL: "หน้าซ้าย",
  FC: "หน้ากลาง",
  FR: "หน้าขวา",
  ML: "กลางซ้าย",
  MC: "กลาง",
  MR: "กลางขวา",
  BL: "หลังซ้าย",
  BC: "หลังกลาง",
  BR: "หลังขวา",

  PAINT: "ใต้แป้น",
  THREE_PT: "เส้นสามแต้ม",
  LEFT_WING: "ปีกซ้าย",
  RIGHT_WING: "ปีกขวา",
  TOP_KEY: "หัวกะโหลก",
  LEFT_CORNER: "มุมซ้าย",
  RIGHT_CORNER: "มุมขวา",
  MID_RANGE: "ระยะกลาง",
  HOOP: "ห่วง",
};

const enMap: Record<string, string> = {
  LN: "Left Net",
  CN: "Center Net",
  RN: "Right Net",
  LB: "Left Back",
  CB: "Center Back",
  RB: "Right Back",
  NET: "Net",
  OUT: "Out of Bounds",
  LONG_OUT: "Long Out",
  SIDE_OUT: "Side Out",
  NET_ERR: "Net Error",
  NET_ERROR: "Net Error",
  UNKNOWN: "Unknown Area",

  "LB-1": "Left Back 1",
  "LB-2": "Left Back 2",
  "LB-3": "Left Back 3",
  "LB-4": "Left Back 4",
  "LN-1": "Left Net 1",
  "LN-2": "Left Net 2",
  "CB-1": "Center Back 1",
  "CB-2": "Center Back 2",
  "CB-3": "Center Back 3",
  "CB-4": "Center Back 4",
  "CN-1": "Center Net 1",
  "CN-2": "Center Net 2",
  "RB-1": "Right Back 1",
  "RB-2": "Right Back 2",
  "RB-3": "Right Back 3",
  "RB-4": "Right Back 4",
  "RN-1": "Right Net 1",
  "RN-2": "Right Net 2",

  ATT_L: "Attack Left",
  ATT_C: "Attack Center",
  ATT_R: "Attack Right",
  MID_L: "Midfield Left",
  MID_C: "Midfield Center",
  MID_R: "Midfield Right",
  DEF_L: "Defense Left",
  DEF_C: "Defense Center",
  DEF_R: "Defense Right",
  BOX: "Penalty Box",
  GOAL: "Goal Area",

  FL: "Front Left",
  FC: "Front Center",
  FR: "Front Right",
  ML: "Mid Left",
  MC: "Mid Center",
  MR: "Mid Right",
  BL: "Back Left",
  BC: "Back Center",
  BR: "Back Right",

  PAINT: "Paint",
  THREE_PT: "Three Point",
  LEFT_WING: "Left Wing",
  RIGHT_WING: "Right Wing",
  TOP_KEY: "Top of Key",
  LEFT_CORNER: "Left Corner",
  RIGHT_CORNER: "Right Corner",
  MID_RANGE: "Mid Range",
  HOOP: "Hoop",
};

export function getAreaDisplay(code: string, isThai = false, fallbackText = ""): AreaDisplay {
  if (!code) return { main: "", sub: "" };

  const cleanCode = code.toUpperCase().trim();
  const subText = isThai
    ? thMap[cleanCode] || cleanParentheses(fallbackText)
    : enMap[cleanCode] || cleanParentheses(fallbackText);

  return {
    main: cleanCode,
    sub: subText,
  };
}

function cleanParentheses(str: string): string {
  if (!str) return "";
  return str.replace(/\s*\([^)]*\)/g, "").trim();
}
