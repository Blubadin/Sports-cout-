import type {
  Action,
  AppSettings,
  Area,
  AreaSelectionPayload,
  OutZoneType,
  SportType,
} from "../types";
import { DETAILED_ZONE_LABELS, OUT_ZONE_LABELS } from "../sports";
import {
  getSportGeometrySpec,
  isPointOutsideCourt,
  normalizePointToCourt,
} from "../geometry/sportGeometrySpec";

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

function getGeneratedGridLabel(payload: AreaSelectionPayload, isThai: boolean) {
  if (!/^[FB]-\d+-\d+$/.test(payload.areaCode || '')) return undefined;
  const [, rowText, columnText] = payload.areaCode.split('-');
  const row = Number(rowText) + 1;
  const column = Number(columnText) + 1;
  return isThai ? `แถว ${row} · ช่อง ${column}` : `Row ${row} · Column ${column}`;
}

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
  side_left_near: { top: 75, left: -5 }, side_left_far: { top: 25, left: -5 },
  side_right_near: { top: 75, left: 105 }, side_right_far: { top: 25, left: 105 },
  back_left: { top: 105, left: 25 }, back_right: { top: 105, left: 75 },
  opp_back_left: { top: -5, left: 25 }, opp_back_right: { top: -5, left: 75 },
  own_back_out: { top: 105, left: 50 }, opp_back_out: { top: -5, left: 50 },
  left_touchline_att: { top: 20, left: -5 }, left_touchline_mid: { top: 50, left: -5 }, left_touchline_def: { top: 80, left: -5 },
  right_touchline_att: { top: 20, left: 105 }, right_touchline_mid: { top: 50, left: 105 }, right_touchline_def: { top: 80, left: 105 },
  own_endline: { top: 105, left: 50 }, opp_endline: { top: -5, left: 50 },
  corner_left: { top: -5, left: 5 }, corner_right: { top: -5, left: 95 }, goal_kick: { top: 105, left: 50 },
  left_sideline: { top: 50, left: -5 }, right_sideline: { top: 50, left: 105 },
  baseline_left: { top: -5, left: 25 }, baseline_right: { top: -5, left: 75 }, endline: { top: 105, left: 50 },
  net_error: { top: 50, left: 50 },
};

export type AreaPreviewCell = {
  row: number;
  col: number;
  payload: AreaSelectionPayload | null;
};

export type AreaPreviewGrid = {
  rows: number;
  cols: number;
  cells: AreaPreviewCell[];
};

function resolveSidedAreaPoint(
  sportType: SportType,
  action: Pick<Action, "areaCode" | "courtSide">,
): AreaDisplayPoint | null {
  const code = action.areaCode || "";
  const side = action.courtSide;
  if (!side || side === "neutral") return null;

  if (sportType === "volleyball" && /^[LCR][NB]$/.test(code)) {
    const lateral = code[0] === "L" ? 25 : code[0] === "C" ? 50 : 75;
    const top = side === "teamB" ? 100 - lateral : lateral;
    const isNearNet = code[1] === "N";
    return {
      top,
      left: side === "teamA" ? (isNearNet ? 40 : 18) : (isNearNet ? 60 : 82),
    };
  }

  if (sportType === "football" && /^(ATT|MID|DEF)_[LCR]$/.test(code)) {
    const [row, column] = code.split("_");
    const teamATop = row === "ATT" ? 60 : row === "MID" ? 75 : 90;
    const top = side === "teamA" ? teamATop : 100 - teamATop;
    const leftForTeamA = column === "L" ? 20 : column === "C" ? 50 : 80;
    return { top, left: side === "teamA" ? leftForTeamA : 100 - leftForTeamA };
  }

  if (sportType === "badminton") {
    const normalized = code === "FRONT" ? "F" : code === "MID" ? "M" : code === "BACK" ? "B" : code;
    if (/^[FMB]([LCR])?$/.test(normalized)) {
      const row = normalized[0];
      const teamATop = row === "F" ? 60 : row === "M" ? 75 : 90;
      const column = normalized[1];
      const leftForTeamA = column === "L" ? 25 : column === "R" ? 75 : 50;
      return {
        top: side === "teamA" ? teamATop : 100 - teamATop,
        left: side === "teamA" ? leftForTeamA : 100 - leftForTeamA,
      };
    }
  }

  if (sportType === "basketball") {
    if (/^B-[0-3]-[0-2]$/.test(code)) {
      const [, rowText, columnText] = code.split("-");
      const row = Number(rowText);
      const column = Number(columnText);
      const halfTop = ((row + 0.5) / 4) * 45;
      return {
        top: side === "teamB" ? halfTop : 100 - halfTop,
        left: ((column + 0.5) / 3) * 100,
      };
    }
    const halfPoint = AREA_DISPLAY_POINTS.basketball[code === "THREE_POINT" ? "THREE_PT" : code];
    if (halfPoint) {
      return {
        top: side === "teamB" ? halfPoint.top : 100 - halfPoint.top,
        left: halfPoint.left,
      };
    }
  }

  return null;
}

/**
 * Calculates a 3x3 homography matrix from 4 source points to 4 destination points.
 * Expects points as [x, y].
 * (Used for mapping canonical 0-1 court bounds onto a video perspective quad)
 */
export function calculateHomography(
  src: [number, number][],
  dst: [number, number][]
): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  // Simple adjugate-based Gaussian elimination for 8 DOF
  const A = [];
  for (let i = 0; i < 4; i++) {
    const x = src[i][0];
    const y = src[i][1];
    const u = dst[i][0];
    const v = dst[i][1];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  // Gaussian elimination (partial pivoting)
  for (let i = 0; i < 8; i++) {
    let maxRow = i;
    for (let j = i + 1; j < 8; j++) {
      if (Math.abs(A[j][i]) > Math.abs(A[maxRow][i])) {
        maxRow = j;
      }
    }
    const tmp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tmp;

    if (Math.abs(A[i][i]) < 1e-10) return null; // Singular

    for (let j = i + 1; j < 8; j++) {
      const factor = A[j][i] / A[i][i];
      for (let k = i; k < 9; k++) {
        A[j][k] -= factor * A[i][k];
      }
    }
  }

  const h = new Array(9).fill(0);
  h[8] = 1;
  for (let i = 7; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < 8; j++) {
      sum += A[i][j] * h[j];
    }
    h[i] = (A[i][8] - sum) / A[i][i];
  }

  return h;
}

/**
 * Creates a CSS matrix3d string from a 3x3 homography matrix.
 */
export function homographyToMatrix3d(h: number[]): string {
  // Convert 3x3 to 4x4 for CSS matrix3d
  // [h0, h1, h2]    [h0, h1, 0, h2]
  // [h3, h4, h5] -> [h3, h4, 0, h5]
  // [h6, h7, h8]    [ 0,  0, 1,  0]
  //                 [h6, h7, 0, h8]
  // CSS matrix3d is column-major.
  return `matrix3d(
    ${h[0]}, ${h[3]}, 0, ${h[6]},
    ${h[1]}, ${h[4]}, 0, ${h[7]},
    0, 0, 1, 0,
    ${h[2]}, ${h[5]}, 0, ${h[8]}
  )`;
}

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
  if (["OUT", "LONG_OUT", "SIDE_OUT"].includes(action.areaCode || "")) return { top: 105, left: 50 };
  if (!action.areaCode || action.areaCode === "UNKNOWN") return null;

  const sidedPoint = resolveSidedAreaPoint(sportType, action);
  if (sidedPoint) return sidedPoint;

  let point: AreaDisplayPoint | undefined;
  if (sportType === "football" && action.areaCode.startsWith("F-")) {
    const [, row, column] = action.areaCode.split("-").map(Number);
    if (Number.isFinite(row) && Number.isFinite(column)) {
      point = { top: ((row + 0.5) / 4) * 100, left: ((column + 0.5) / 6) * 100 };
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
    const mode = action.areaMode === "detailed" ? "detailed" : "normal";
    const geometryMode = getSportGeometrySpec(sportType).modes[mode];
    const rows = geometryMode.rows || 1;
    const cols = geometryMode.cols || 1;
    point = { top: ((action.gridY! + 0.5) / rows) * 100, left: ((action.gridX! + 0.5) / cols) * 100 };
  } else {
    const normalizedCode = action.areaCode === "THREE_POINT" ? "THREE_PT" : action.areaCode;
    point = AREA_DISPLAY_POINTS[sportType][normalizedCode];
  }

  if (!point) return null;
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
  const isOutZone = isPointOutsideCourt(sportType, { rx, ry });

  if (enableOutOfBoundsZones && isOutZone) {
    payload = resolveOutZone({ sportType, rx, ry });
  } else {
    const normalizedPoint = normalizePointToCourt(sportType, { rx, ry });
    const cx = normalizedPoint.x;
    const cy = normalizedPoint.y;
    const isDetailed = areaPrecisionMode === "detailed";
    payload = resolveInnerCourt({ sportType, cx, cy, flipCourtSide, isDetailed });
    if (payload && areaPrecisionMode === "point") {
      payload = {
        ...payload,
        areaMode: "point",
        areaResolution: "point",
        pointX: cx,
        pointY: cy,
      };
    }
  }

  if (!payload?.areaCode) return payload;

  const areaObj = areas.find((area) => area.code === payload.areaCode);
  const isThai = uiLanguage === "th";
  const outLabel = payload.outZone ? OUT_ZONE_LABELS[payload.outZone] : undefined;
  const detailedLabel = payload.areaCode ? DETAILED_ZONE_LABELS[payload.areaCode] : undefined;
  const generatedGridLabel = getGeneratedGridLabel(payload, isThai);
  payload.areaLabel = outLabel
    ? (isThai ? outLabel.thaiLabel : outLabel.label)
    : generatedGridLabel
      ? generatedGridLabel
    : detailedLabel
      ? (isThai ? detailedLabel.thaiLabel : detailedLabel.label)
      : (areaObj ? (isThai ? areaObj.thaiName : areaObj.code) : payload.areaCode);
  payload.areaResolution = payload.areaResolution || source;
  return payload;
}

export function buildAreaPreviewGrid(
  sportType: SportType,
  precisionMode: "normal" | "detailed" | "point",
  flipCourtSide = false,
  courtViewMode: AppSettings["areaCourtViewMode"] = "full",
  uiLanguage: AppSettings["uiLanguage"] = "en",
): AreaPreviewGrid {
  const effectiveMode = precisionMode === "point" ? "detailed" : precisionMode;
  const isHalfCourt = courtViewMode === "half";
  const dimensions = sportType === "football"
    ? (effectiveMode === "detailed"
      ? { rows: isHalfCourt ? 2 : 4, cols: 6 }
      : { rows: isHalfCourt ? 3 : 6, cols: 3 })
    : sportType === "badminton"
      ? { rows: isHalfCourt ? 3 : 7, cols: effectiveMode === "detailed" ? 3 : 1 }
      : sportType === "basketball"
        ? { rows: isHalfCourt ? 4 : 8, cols: 3 }
        : { rows: 3, cols: effectiveMode === "detailed" ? (isHalfCourt ? 3 : 6) : (isHalfCourt ? 2 : 4) };
  const bounds = getSportGeometrySpec(sportType).frame.courtBounds;
  const cells: AreaPreviewCell[] = [];

  for (let row = 0; row < dimensions.rows; row += 1) {
    for (let col = 0; col < dimensions.cols; col += 1) {
      const viewPoint = {
        rx: bounds.x + ((col + 0.5) / dimensions.cols) * bounds.width,
        ry: bounds.y + ((row + 0.5) / dimensions.rows) * bounds.height,
      };
      const point = mapAreaViewPointToFullCourt(sportType, viewPoint, courtViewMode);
      cells.push({
        row,
        col,
        payload: resolveAreaSelectionFromPoint({
          sportType,
          point,
          flipCourtSide,
          enableOutOfBoundsZones: false,
          areaPrecisionMode: effectiveMode,
          uiLanguage,
        }),
      });
    }
  }

  return { ...dimensions, cells };
}

export function mapAreaViewPointToFullCourt(
  sportType: SportType,
  point: AreaSelectionPoint,
  courtViewMode: AppSettings["areaCourtViewMode"] = "full",
): AreaSelectionPoint {
  if (courtViewMode !== "half" || isPointOutsideCourt(sportType, point)) return point;

  const spec = getSportGeometrySpec(sportType);
  const courtPoint = normalizePointToCourt(sportType, point);
  const canonicalPoint = spec.frame.orientationAxis === "horizontal"
    ? { x: courtPoint.x * 0.46, y: courtPoint.y }
    : { x: courtPoint.x, y: 0.54 + courtPoint.y * 0.46 };

  return {
    rx: spec.frame.courtBounds.x + canonicalPoint.x * spec.frame.courtBounds.width,
    ry: spec.frame.courtBounds.y + canonicalPoint.y * spec.frame.courtBounds.height,
  };
}

export function mapFullCourtPointToAreaView(
  sportType: SportType,
  point: AreaSelectionPoint,
  courtViewMode: AppSettings["areaCourtViewMode"] = "full",
): AreaSelectionPoint {
  if (courtViewMode !== "half" || isPointOutsideCourt(sportType, point)) return point;

  const spec = getSportGeometrySpec(sportType);
  const canonicalPoint = normalizePointToCourt(sportType, point);
  const viewPoint = spec.frame.orientationAxis === "horizontal"
    ? { x: clamp01(canonicalPoint.x / 0.46), y: canonicalPoint.y }
    : { x: canonicalPoint.x, y: clamp01((canonicalPoint.y - 0.54) / 0.46) };

  return {
    rx: spec.frame.courtBounds.x + viewPoint.x * spec.frame.courtBounds.width,
    ry: spec.frame.courtBounds.y + viewPoint.y * spec.frame.courtBounds.height,
  };
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
    const isOpponentHalf = cy < 0.5;
    const attackCourtSide = resolveVisibleCourtSide(isOpponentHalf ? "opponent" : "primary", flipCourtSide);
    if (isDetailed) {
      const r = Math.min(3, Math.floor(cy * 4));
      const c = Math.min(5, Math.floor(cx * 6));
      return {
        areaCode: `F-${r}-${c}`,
        courtSide: attackCourtSide,
        gridX: c,
        gridY: r,
        areaResolution: "4x6",
        areaMode: "detailed",
      };
    }
    const localY = isOpponentHalf ? cy / 0.5 : (cy - 0.5) / 0.5;
    const rowLabel = isOpponentHalf
      ? (localY < 0.33 ? "DEF" : localY < 0.66 ? "MID" : "ATT")
      : (localY < 0.33 ? "ATT" : localY < 0.66 ? "MID" : "DEF");
    const colLabel = isOpponentHalf
      ? (cx < 0.33 ? "R" : cx < 0.66 ? "C" : "L")
      : (cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R");
    return { areaCode: `${rowLabel}_${colLabel}`, courtSide: attackCourtSide, areaResolution: "3x3-per-side", areaMode: "normal" };
  }

  if (sportType === "badminton") {
    if (cy < 0.46) {
      const gridY = cy / 0.46;
      const rowCode = gridY < 0.33 ? "B" : gridY < 0.66 ? "M" : "F";
      if (!isDetailed) {
        const areaCode = rowCode === "F" ? "FRONT" : rowCode === "M" ? "MID" : "BACK";
        return { areaCode, courtSide: resolveVisibleCourtSide("opponent", flipCourtSide), areaResolution: "1x3-per-side", areaMode: "normal" };
      }
      const colCode = cx < 0.33 ? "R" : cx < 0.66 ? "C" : "L";
      return {
        areaCode: rowCode + colCode,
        courtSide: resolveVisibleCourtSide("opponent", flipCourtSide),
        gridX: Math.min(2, Math.floor(cx * 3)),
        gridY: Math.min(2, Math.floor(gridY * 3)),
        areaResolution: "3x3-per-side",
        areaMode: "detailed",
      };
    }
    if (cy > 0.54) {
      const gridY = (cy - 0.54) / 0.46;
      const rowCode = gridY < 0.33 ? "F" : gridY < 0.66 ? "M" : "B";
      if (!isDetailed) {
        const areaCode = rowCode === "F" ? "FRONT" : rowCode === "M" ? "MID" : "BACK";
        return { areaCode, courtSide: resolveVisibleCourtSide("primary", flipCourtSide), areaResolution: "1x3-per-side", areaMode: "normal" };
      }
      const colCode = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
      return {
        areaCode: rowCode + colCode,
        courtSide: resolveVisibleCourtSide("primary", flipCourtSide),
        gridX: Math.min(2, Math.floor(cx * 3)),
        gridY: Math.min(2, Math.floor(gridY * 3)),
        areaResolution: "3x3-per-side",
        areaMode: "detailed",
      };
    }
    return { areaCode: "NET_ERR", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
  }

  if (sportType === "basketball") {
    // Position-based: matches CourtAreaSelector — top half = teamB (normal), teamA (flipped)
    const isOpponentHalf = cy < 0.5;
    const halfY = isOpponentHalf ? cy / 0.5 : (1 - cy) / 0.5;
    const attackCourtSide = resolveVisibleCourtSide(isOpponentHalf ? "opponent" : "primary", flipCourtSide);
    if (isDetailed) {
      const row = Math.min(3, Math.floor(halfY * 4));
      const column = Math.min(2, Math.floor(cx * 3));
      return {
        areaCode: `B-${row}-${column}`,
        courtSide: attackCourtSide,
        gridX: column,
        gridY: row,
        areaResolution: "shot-12",
        areaMode: "detailed",
      };
    }
    if (halfY < 0.3) {
      const areaCode = cx > 0.33 && cx < 0.67 ? "PAINT" : cx < 0.33 ? "LEFT_WING" : "RIGHT_WING";
      return { areaCode, courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };
    }
    if (halfY >= 0.75) return { areaCode: "THREE_PT", courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };

    const gridY = (halfY - 0.3) / 0.45;
    if (gridY < 0.5) {
      const areaCode = cx < 0.33 ? "LEFT_WING" : cx < 0.66 ? "TOP_KEY" : "RIGHT_WING";
      return { areaCode, courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };
    }
    const areaCode = cx < 0.33 ? "LEFT_CORNER" : cx < 0.66 ? "MID_RANGE" : "RIGHT_CORNER";
    return { areaCode, courtSide: attackCourtSide, areaResolution: "normal", areaMode: "normal" };
  }

  return null;
}
