import type { AreaPrecisionMode, OutZoneType, SportType } from '../types';

export type UnitRect = { x: number; y: number; width: number; height: number };
export type GeometryModeSpec = {
  type: 'grid' | 'zones' | 'point';
  resolution: string;
  rows?: number;
  cols?: number;
};

export type SportGeometrySpec = {
  sportType: SportType;
  frame: {
    courtBounds: UnitRect;
    outLaneRatio: number;
    orientationAxis: 'horizontal' | 'vertical';
  };
  modes: Record<AreaPrecisionMode, GeometryModeSpec>;
  outZones: readonly OutZoneType[];
};

const FRAME = {
  courtBounds: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
  outLaneRatio: 0.05,
} as const;

export const SPORT_GEOMETRY_SPECS: Record<SportType, SportGeometrySpec> = {
  volleyball: {
    sportType: 'volleyball',
    frame: { ...FRAME, orientationAxis: 'horizontal' },
    modes: {
      normal: { type: 'zones', resolution: '2x3', rows: 2, cols: 3 },
      detailed: { type: 'grid', resolution: '3x3-per-side', rows: 3, cols: 3 },
      point: { type: 'point', resolution: 'point' },
    },
    outZones: ['side_left_near', 'side_left_far', 'side_right_near', 'side_right_far', 'back_left', 'back_right', 'opp_back_left', 'opp_back_right', 'net_error', 'unknown'],
  },
  football: {
    sportType: 'football',
    frame: { ...FRAME, orientationAxis: 'vertical' },
    modes: {
      normal: { type: 'grid', resolution: '3x3', rows: 3, cols: 3 },
      detailed: { type: 'grid', resolution: '4x6', rows: 4, cols: 6 },
      point: { type: 'point', resolution: 'point' },
    },
    outZones: ['left_touchline_def', 'left_touchline_mid', 'left_touchline_att', 'right_touchline_def', 'right_touchline_mid', 'right_touchline_att', 'own_endline', 'opp_endline', 'corner_left', 'corner_right', 'goal_kick', 'unknown'],
  },
  badminton: {
    sportType: 'badminton',
    frame: { ...FRAME, orientationAxis: 'vertical' },
    modes: {
      normal: { type: 'zones', resolution: '1x3-per-side', rows: 3, cols: 1 },
      detailed: { type: 'grid', resolution: '3x3-per-side', rows: 3, cols: 3 },
      point: { type: 'point', resolution: 'point' },
    },
    outZones: ['side_left_near', 'side_left_far', 'side_right_near', 'side_right_far', 'own_back_out', 'opp_back_out', 'net_error', 'unknown'],
  },
  basketball: {
    sportType: 'basketball',
    frame: { ...FRAME, orientationAxis: 'vertical' },
    modes: {
      normal: { type: 'zones', resolution: 'shot-8' },
      detailed: { type: 'grid', resolution: 'shot-12', rows: 4, cols: 3 },
      point: { type: 'point', resolution: 'point' },
    },
    outZones: ['left_sideline', 'right_sideline', 'baseline_left', 'baseline_right', 'endline', 'unknown'],
  },
};

export function getSportGeometrySpec(sportType: SportType): SportGeometrySpec {
  return SPORT_GEOMETRY_SPECS[sportType];
}

export function normalizePointToCourt(
  sportType: SportType,
  point: { rx: number; ry: number },
) {
  const { courtBounds } = getSportGeometrySpec(sportType).frame;
  return {
    x: Math.max(0, Math.min(1, (point.rx - courtBounds.x) / courtBounds.width)),
    y: Math.max(0, Math.min(1, (point.ry - courtBounds.y) / courtBounds.height)),
  };
}

export function isPointOutsideCourt(sportType: SportType, point: { rx: number; ry: number }) {
  const bounds = getSportGeometrySpec(sportType).frame.courtBounds;
  return point.rx < bounds.x
    || point.rx > bounds.x + bounds.width
    || point.ry < bounds.y
    || point.ry > bounds.y + bounds.height;
}
