import type {
  Action,
  AppSettings,
  Area,
  AreaSelectionPayload,
  OutZoneType,
  SportType,
} from "../types";
import { DETAILED_ZONE_LABELS, OUT_ZONE_LABELS } from "../sports";

export type AreaSelectionPoint = {
  rx: number;
  ry: number;
};

export type AreaSelectionSource = "absolute-pointer" | "joystick-cursor" | "gamepad-stick";
export type VisibleCourtRegion = "primary" | "opponent";

export function resolveVisibleCourtSide(
  region: VisibleCourtRegion,
  flipCourtSide = false,
): "teamA" | "teamB" {
  if (region === "primary") return flipCourtSide ? "teamB" : "teamA";
  return flipCourtSide ? "teamA" : "teamB";
}

export type AreaGeometryResolverOptions = {
  sportType: SportType;
  areas?: Area[];
  point: AreaSelectionPoint;
  flipCourtSide?: boolean;
  enableOutOfBoundsZones?: boolean;
  areaPrecisionMode?: AppSettings["areaPrecisionMode"];
  uiLanguage?: AppSettings["uiLanguage"];
  source?: AreaSelectionSource;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export type AreaPrecision = "Point" | "Detailed" | "Zone" | "Out" | "Unknown";
export type AreaDisplayPoint = { top: number; left: number };

const AREA_DISPLAY_POINTS: Record<SportType, Record<string, AreaDisplayPoint>> = {
  volleyball: {
    LN: { top: 25, left: 20 }, CN: { top: 50, left: 20 }, RN: { top: 75, left: 20 },
    RB: { top: 25, left: 80 }, CB: { top: 50, left: 80 }, LB: { top: 75, left: 80 },
    NET: { top: 50, left: 50 }, NET_ERR: { top: 50, left: 50 },
  },
  football: {
    ATT_L: { top: 20, left: 20 }, ATT_C: { top: 20, left: 50 }, ATT_R: { top: 20, left: 80 },
    MID_L: { top: 50, left: 20 }, MID_C: { top: 50, left: 50 }, MID_R: { top: 50, left: 80 },
    DEF_L: { top: 80, left: 20 }, DEF_C: { top: 80, left: 50 }, DEF_R: { top: 80, left: 80 },
    BOX: { top: 10, left: 50 }, GOAL: { top: 5, left: 50 },
  },
  badminton: {
    FRONT: { top: 25, left: 50 }, MID: { top: 50, left: 50 }, BACK: { top: 75, left: 50 },
    FL: { top: 65, left: 25 }, FC: { top: 65, left: 50 }, FR: { top: 65, left: 75 },
    ML: { top: 75, left: 25 }, MC: { top: 75, left: 50 }, MR: { top: 75, left: 75 },
    BL: { top: 90, left: 25 }, BC: { top: 90, left: 50 }, BR: { top: 90, left: 75 },
    NET: { top: 50, left: 50 }, NET_ERR: { top: 50, left: 50 },
  },
  basketball: {
    PAINT: { top: 15, left: 50 }, LEFT_WING: { top: 25, left: 20 }, RIGHT_WING: { top: 25, left: 80 },
    TOP_KEY: { top: 35, left: 50 }, LEFT_CORNER: { top: 8, left: 10 }, RIGHT_CORNER: { top: 8, left: 90 },
    MID_RANGE: { top: 23, left: 50 }, THREE_PT: { top: 43, left: 50 },
  },
};

const OUT_DISPLAY_POINTS: Partial<Record<OutZoneType, AreaDisplayPoint>> = {
  side_left_near: { top: 75, left: -8 }, side_left_far: { top: 25, left: -8 },
  side_right_near: { top: 75, left: 108 }, side_right_far: { top: 25, left: 108 },
  back_left: { top: 108, left: 25 }, back_right: { top: 108, left: 75 },
  opp_back_left: { top: -8, left: 25 }, opp_back_right: { top: -8, left: 75 },
  left_touchline_att: { top: 20, left: -8 }, left_touchline_mid: { top: 50, left: -8 }, left_touchline_def: { top: 80, left: -8 },
  right_touchline_att: { top: 20, left: 108 }, right_touchline_mid: { top: 50, left: 108 }, right_touchline_def: { top: 80, left: 108 },
  own_endline: { top: 108, left: 50 }, opp_endline: { top: -8, left: 50 },
  left_sideline: { top: 50, left: -8 }, right_sideline: { top: 50, left: 108 },
  baseline_left: { top: -8, left: 25 }, baseline_right: { top: -8, left: 75 }, endline: { top: 108, left: 50 },
  net_error: { top: 50, left: 50 },
};

export function getAreaPrecision(action: Pick<Action, "pointX" | "pointY" | "outZone" | "areaResolution" | "areaMode" | "areaCode">): AreaPrecision {
  if (Number.isFinite(action.pointX) && Number.isFinite(action.pointY)) return "Point";
  if (action.outZone || action.areaResolution === "out-zone" || ["OUT", "LONG_OUT", "SIDE_OUT"].includes(action.areaCode || "")) return "Out";
  if (!action.areaCode || action.areaCode === "UNKNOWN") return "Unknown";
  if (action.areaMode === "detailed" || action.areaResolution === "detailed" || action.areaCode.startsWith("F-") || /-[1-4]$/.test(action.areaCode)) return "Detailed";
  return "Zone";
}

export function resolveAreaDisplayPoint(
  sportType: SportType,
  action: Pick<Action, "pointX" | "pointY" | "outZone" | "areaCode" | "areaMode" | "areaResolution" | "gridX" | "gridY" | "courtSide">,
): AreaDisplayPoint | null {
  if (Number.isFinite(action.pointX) && Number.isFinite(action.pointY)) {
    return { top: clamp01(action.pointY!) * 100, left: clamp01(action.pointX!) * 100 };
  }
  if (action.outZone) return OUT_DISPLAY_POINTS[action.outZone] ?? null;
  if (["OUT", "LONG_OUT", "SIDE_OUT"].includes(action.areaCode || "")) return { top: 108, left: 50 };
  if (!action.areaCode || action.areaCode === "UNKNOWN") return null;

  let point: AreaDisplayPoint | undefined;
  if (sportType === "football" && action.areaCode.startsWith("F-")) {
    const [, row, column] = action.areaCode.split("-").map(Number);
    if (Number.isFinite(row) && Number.isFinite(column)) {
      point = { top: (row + 0.5) * 25, left: (column + 0.5) * 25 };
    }
  } else if (sportType === "volleyball" && /-[1-4]$/.test(action.areaCode)) {
    const [baseCode, subGrid] = action.areaCode.split("-");
    const base = AREA_DISPLAY_POINTS.volleyball[baseCode];
    const offsets: Record<string, AreaDisplayPoint> = {
      "1": { top: -7, left: -4 }, "2": { top: -7, left: 4 },
      "3": { top: 7, left: -4 }, "4": { top: 7, left: 4 },
    };
    const offset = offsets[subGrid];
    if (base && offset) point = { top: base.top + offset.top, left: base.left + offset.left };
  } else if (Number.isFinite(action.gridX) && Number.isFinite(action.gridY)) {
    point = { top: (action.gridY! + 0.5) * 25, left: (action.gridX! + 0.5) * 25 };
  } else {
    const normalizedCode = action.areaCode === "THREE_POINT" ? "THREE_PT" : action.areaCode;
    point = AREA_DISPLAY_POINTS[sportType][normalizedCode];
  }

  if (!point) return null;
  if ((sportType === "football" || sportType === "basketball") && action.courtSide === "teamB") {
    return { top: 100 - point.top, left: 100 - point.left };
  }
  return point;
}

export function resolveAreaSelectionFromPoint({
  sportType,
  areas = [],
  point,
  flipCourtSide = false,
  enableOutOfBoundsZones = true,
  areaPrecisionMode,
  uiLanguage,
  source = "absolute-pointer",
}: AreaGeometryResolverOptions): AreaSelectionPayload | null {
  const rx = clamp01(point.rx);
  const ry = clamp01(point.ry);

  let payload: AreaSelectionPayload | null = null;
  const isOutZone = rx < 0.15 || rx > 0.85 || ry < 0.15 || ry > 0.85;

  if (enableOutOfBoundsZones && isOutZone) {
    payload = resolveOutZone({ sportType, rx, ry });
  } else {
    const cx = clamp01((rx - 0.15) / 0.7);
    const cy = clamp01((ry - 0.15) / 0.7);
    const isDetailed = areaPrecisionMode === "detailed" || areaPrecisionMode === "point";
    payload = resolveInnerCourt({ sportType, cx, cy, flipCourtSide, isDetailed });
  }

  if (!payload?.areaCode) return payload;

  const areaObj = areas.find((area) => area.code === payload.areaCode);
  const isThai = uiLanguage === "th";
  const outLabel = payload.outZone ? OUT_ZONE_LABELS[payload.outZone] : undefined;
  const detailedLabel = payload.areaCode ? DETAILED_ZONE_LABELS[payload.areaCode] : undefined;
  payload.areaLabel = outLabel
    ? (isThai ? outLabel.thaiLabel : outLabel.label)
    : detailedLabel
      ? (isThai ? detailedLabel.thaiLabel : detailedLabel.label)
      : (areaObj ? (isThai ? areaObj.thaiName : areaObj.code) : payload.areaCode);
  payload.areaResolution = payload.areaResolution || source;
  return payload;
}

function resolveOutZone({
  sportType,
  rx,
  ry,
}: {
  sportType: SportType;
  rx: number;
  ry: number;
}): AreaSelectionPayload {
  let outZone: OutZoneType = "unknown";
  let areaCode = "OUT";

  if (sportType === "volleyball") {
    if (rx < 0.15) outZone = ry < 0.5 ? "side_left_far" : "side_left_near";
    else if (rx > 0.85) outZone = ry < 0.5 ? "side_right_far" : "side_right_near";
    else if (ry < 0.15) outZone = rx < 0.5 ? "opp_back_left" : "opp_back_right";
    else if (ry > 0.85) outZone = rx < 0.5 ? "back_left" : "back_right";
    if (rx > 0.43 && rx < 0.57 && ry > 0.1 && ry < 0.9) {
      outZone = "net_error";
      areaCode = "NET_ERR";
    }
  } else if (sportType === "football") {
    if (rx < 0.15) outZone = ry < 0.33 ? "left_touchline_att" : ry < 0.66 ? "left_touchline_mid" : "left_touchline_def";
    else if (rx > 0.85) outZone = ry < 0.33 ? "right_touchline_att" : ry < 0.66 ? "right_touchline_mid" : "right_touchline_def";
    else if (ry < 0.15) outZone = rx < 0.2 ? "corner_left" : rx > 0.8 ? "corner_right" : "opp_endline";
    else if (ry > 0.85) outZone = rx > 0.35 && rx < 0.65 ? "goal_kick" : "own_endline";
  } else if (sportType === "badminton") {
    if (rx < 0.15) outZone = ry < 0.5 ? "side_left_far" : "side_left_near";
    else if (rx > 0.85) outZone = ry < 0.5 ? "side_right_far" : "side_right_near";
    else if (ry < 0.15) outZone = "opp_back_out";
    else if (ry > 0.85) outZone = "own_back_out";
  } else if (sportType === "basketball") {
    if (rx < 0.15) outZone = "left_sideline";
    else if (rx > 0.85) outZone = "right_sideline";
    else if (ry < 0.15) outZone = rx < 0.5 ? "baseline_left" : "baseline_right";
    else if (ry > 0.85) outZone = "endline";
  }

  return {
    areaCode,
    courtSide: "neutral",
    outZone,
    areaResolution: "out-zone",
    areaMode: "normal",
    areaLabel: OUT_ZONE_LABELS[outZone]?.label || outZone,
  };
}

function resolveInnerCourt({
  sportType,
  cx,
  cy,
  flipCourtSide,
  isDetailed,
}: {
  sportType: SportType;
  cx: number;
  cy: number;
  flipCourtSide: boolean;
  isDetailed: boolean;
}): AreaSelectionPayload | null {
  if (sportType === "volleyball") {
    const leftCourtSide = resolveVisibleCourtSide("primary", flipCourtSide);
    const rightCourtSide = resolveVisibleCourtSide("opponent", flipCourtSide);

    if (cx < 0.46) {
      const colX = cx / 0.46;
      const rowCode = cy < 0.33 ? "L" : cy < 0.66 ? "C" : "R";
      const areaCode = isDetailed
        ? `${rowCode}${colX < 0.66 ? "B" : "N"}-${colX < 0.33 ? "1" : colX < 0.66 ? "2" : "1"}`
        : `${rowCode}${colX < 0.5 ? "B" : "N"}`;
      return { areaCode, courtSide: leftCourtSide, areaResolution: isDetailed ? "detailed" : "normal", areaMode: isDetailed ? "detailed" : "normal" };
    }

    if (cx > 0.54) {
      const colX = (cx - 0.54) / 0.46;
      const rowCode = cy < 0.33 ? "R" : cy < 0.66 ? "C" : "L";
      const areaCode = isDetailed
        ? `${rowCode}${colX < 0.33 ? "N" : "B"}-${colX < 0.33 ? "2" : colX < 0.66 ? "3" : "4"}`
        : `${rowCode}${colX < 0.5 ? "N" : "B"}`;
      return { areaCode, courtSide: rightCourtSide, areaResolution: isDetailed ? "detailed" : "normal", areaMode: isDetailed ? "detailed" : "normal" };
    }

    return { areaCode: "NET", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
  }

  if (sportType === "football") {
    // Position-based: matches CourtAreaSelector — top half = teamB (normal), teamA (flipped)
    const attackCourtSide = resolveVisibleCourtSide("opponent", flipCourtSide);
    if (isDetailed) {
      const r = Math.min(3, Math.floor(cy * 4));
      const c = Math.min(3, Math.floor(cx * 4));
      return { areaCode: `F-${r}-${c}`, courtSide: attackCourtSide, areaResolution: "detailed", areaMode: "detailed" };
    }
    if (cy < 0.22) {
      const areaCode = cx > 0.33 && cx < 0.67 ? "GOAL" : "BOX";
      return { areaCode, courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };
    }
    const gridY = (cy - 0.22) / 0.78;
    const rowLabel = gridY < 0.33 ? "ATT" : gridY < 0.66 ? "MID" : "DEF";
    const colLabel = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
    return { areaCode: `${rowLabel}_${colLabel}`, courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };
  }

  if (sportType === "badminton") {
    if (cy < 0.46) {
      const gridY = cy / 0.46;
      const rowCode = gridY < 0.33 ? "B" : gridY < 0.66 ? "M" : "F";
      const colCode = cx < 0.33 ? "R" : cx < 0.66 ? "C" : "L";
      return { areaCode: rowCode + colCode, courtSide: resolveVisibleCourtSide("opponent", flipCourtSide), areaResolution: "normal", areaMode: "normal" };
    }
    if (cy > 0.54) {
      const gridY = (cy - 0.54) / 0.46;
      const rowCode = gridY < 0.33 ? "F" : gridY < 0.66 ? "M" : "B";
      const colCode = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
      return { areaCode: rowCode + colCode, courtSide: resolveVisibleCourtSide("primary", flipCourtSide), areaResolution: "normal", areaMode: "normal" };
    }
    return { areaCode: "NET_ERR", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
  }

  if (sportType === "basketball") {
    // Position-based: matches CourtAreaSelector — top half = teamB (normal), teamA (flipped)
    const attackCourtSide = resolveVisibleCourtSide("opponent", flipCourtSide);
    if (cy < 0.25) {
      const areaCode = cx > 0.33 && cx < 0.67 ? "PAINT" : cx < 0.33 ? "LEFT_WING" : "RIGHT_WING";
      return { areaCode, courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };
    }
    if (cy >= 0.75) return { areaCode: "THREE_PT", courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };

    const gridY = (cy - 0.25) / 0.5;
    if (gridY < 0.5) {
      const areaCode = cx < 0.33 ? "LEFT_WING" : cx < 0.66 ? "TOP_KEY" : "RIGHT_WING";
      return { areaCode, courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };
    }
    const areaCode = cx < 0.33 ? "LEFT_CORNER" : cx < 0.66 ? "MID_RANGE" : "RIGHT_CORNER";
    return { areaCode, courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };
  }

  return null;
}
