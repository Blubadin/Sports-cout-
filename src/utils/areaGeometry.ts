import type {
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
  let rx = clamp01(point.rx);
  let ry = clamp01(point.ry);

  if (flipCourtSide) {
    rx = 1 - rx;
    ry = 1 - ry;
  }

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
    const leftCourtSide = flipCourtSide ? "teamB" : "teamA";
    const rightCourtSide = flipCourtSide ? "teamA" : "teamB";

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
    if (isDetailed) {
      const r = Math.min(3, Math.floor(cy * 4));
      const c = Math.min(3, Math.floor(cx * 4));
      return { areaCode: `F-${r}-${c}`, courtSide: "neutral", areaResolution: "detailed", areaMode: "detailed" };
    }
    if (cy < 0.22) {
      const areaCode = cx > 0.33 && cx < 0.67 ? "GOAL" : "BOX";
      return { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
    }
    const gridY = (cy - 0.22) / 0.78;
    const rowLabel = gridY < 0.33 ? "ATT" : gridY < 0.66 ? "MID" : "DEF";
    const colLabel = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
    return { areaCode: `${rowLabel}_${colLabel}`, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
  }

  if (sportType === "badminton") {
    if (cy < 0.46) {
      const gridY = cy / 0.46;
      const rowCode = gridY < 0.33 ? "B" : gridY < 0.66 ? "M" : "F";
      const colCode = cx < 0.33 ? "R" : cx < 0.66 ? "C" : "L";
      return { areaCode: rowCode + colCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
    }
    if (cy > 0.54) {
      const gridY = (cy - 0.54) / 0.46;
      const rowCode = gridY < 0.33 ? "F" : gridY < 0.66 ? "M" : "B";
      const colCode = cx < 0.33 ? "L" : cx < 0.66 ? "C" : "R";
      return { areaCode: rowCode + colCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
    }
    return { areaCode: "NET_ERR", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
  }

  if (sportType === "basketball") {
    if (cy < 0.25) {
      const areaCode = cx > 0.33 && cx < 0.67 ? "PAINT" : cx < 0.33 ? "LEFT_WING" : "RIGHT_WING";
      return { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
    }
    if (cy >= 0.75) return { areaCode: "THREE_PT", courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };

    const gridY = (cy - 0.25) / 0.5;
    if (gridY < 0.5) {
      const areaCode = cx < 0.33 ? "LEFT_WING" : cx < 0.66 ? "TOP_KEY" : "RIGHT_WING";
      return { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
    }
    const areaCode = cx < 0.33 ? "LEFT_CORNER" : cx < 0.66 ? "MID_RANGE" : "RIGHT_CORNER";
    return { areaCode, courtSide: "neutral", areaResolution: "normal", areaMode: "normal" };
  }

  return null;
}
