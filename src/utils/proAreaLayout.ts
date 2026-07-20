import type { OutZoneType, SportType } from '../types';

export interface ProAreaLayoutMetrics {
  outLanePercent: number;
  minimumTapTargetPx: number;
  maximumOutLanePx: number;
}

export interface ProAreaOutZoneItem {
  id: string;
  outZone: OutZoneType;
  weight?: number;
  shortLabel?: { th: string; en: string };
}

export interface ProAreaOutZoneLayout {
  sportType: SportType;
  top: ProAreaOutZoneItem[];
  left: ProAreaOutZoneItem[];
  right: ProAreaOutZoneItem[];
  bottom: ProAreaOutZoneItem[];
}

const item = (
  sportType: SportType,
  id: string,
  outZone: OutZoneType,
  options: Omit<ProAreaOutZoneItem, 'id' | 'outZone'> = {},
): ProAreaOutZoneItem => ({ id: `${sportType}:${id}`, outZone, ...options });

const PRO_AREA_OUT_ZONE_LAYOUTS: Record<SportType, ProAreaOutZoneLayout> = {
  volleyball: {
    sportType: 'volleyball',
    top: [
      item('volleyball', 'opp-back-left', 'opp_back_left'),
      item('volleyball', 'opp-back-right', 'opp_back_right'),
    ],
    left: [
      item('volleyball', 'side-left-far', 'side_left_far', { shortLabel: { th: 'ซ้ายไกล', en: 'L Far' } }),
      item('volleyball', 'side-left-near', 'side_left_near', { shortLabel: { th: 'ซ้ายใกล้', en: 'L Near' } }),
    ],
    right: [
      item('volleyball', 'side-right-far', 'side_right_far', { shortLabel: { th: 'ขวาไกล', en: 'R Far' } }),
      item('volleyball', 'side-right-near', 'side_right_near', { shortLabel: { th: 'ขวาใกล้', en: 'R Near' } }),
    ],
    bottom: [item('volleyball', 'own-back-out', 'own_back_out')],
  },
  football: {
    sportType: 'football',
    top: [
      item('football', 'corner-left', 'corner_left', { weight: 0.7 }),
      item('football', 'opponent-endline', 'opp_endline'),
      item('football', 'corner-right', 'corner_right', { weight: 0.7 }),
    ],
    left: [
      item('football', 'left-touchline-attack', 'left_touchline_att', { shortLabel: { th: 'ซ้ายรุก', en: 'L Att' } }),
      item('football', 'left-touchline-midfield', 'left_touchline_mid', { shortLabel: { th: 'ซ้ายกลาง', en: 'L Mid' } }),
      item('football', 'left-touchline-defense', 'left_touchline_def', { shortLabel: { th: 'ซ้ายรับ', en: 'L Def' } }),
    ],
    right: [
      item('football', 'right-touchline-attack', 'right_touchline_att', { shortLabel: { th: 'ขวารุก', en: 'R Att' } }),
      item('football', 'right-touchline-midfield', 'right_touchline_mid', { shortLabel: { th: 'ขวากลาง', en: 'R Mid' } }),
      item('football', 'right-touchline-defense', 'right_touchline_def', { shortLabel: { th: 'ขวารับ', en: 'R Def' } }),
    ],
    bottom: [
      item('football', 'own-endline-left', 'own_endline'),
      item('football', 'goal-kick', 'goal_kick', { weight: 1.2 }),
      item('football', 'own-endline-right', 'own_endline'),
    ],
  },
  badminton: {
    sportType: 'badminton',
    top: [item('badminton', 'opponent-back-out', 'opp_back_out')],
    left: [
      item('badminton', 'side-left-far', 'side_left_far', { shortLabel: { th: 'ไกล', en: 'Far' } }),
      item('badminton', 'side-left-near', 'side_left_near', { shortLabel: { th: 'ใกล้', en: 'Near' } }),
    ],
    right: [
      item('badminton', 'side-right-far', 'side_right_far', { shortLabel: { th: 'ไกล', en: 'Far' } }),
      item('badminton', 'side-right-near', 'side_right_near', { shortLabel: { th: 'ใกล้', en: 'Near' } }),
    ],
    bottom: [
      item('badminton', 'back-left', 'back_left'),
      item('badminton', 'back-right', 'back_right'),
    ],
  },
  basketball: {
    sportType: 'basketball',
    top: [
      item('basketball', 'baseline-left', 'baseline_left'),
      item('basketball', 'baseline-right', 'baseline_right'),
    ],
    left: [item('basketball', 'left-sideline', 'left_sideline')],
    right: [item('basketball', 'right-sideline', 'right_sideline')],
    bottom: [item('basketball', 'endline', 'endline')],
  },
};

const PRO_AREA_LAYOUT_METRICS: Record<SportType, ProAreaLayoutMetrics> = {
  volleyball: { outLanePercent: 11, minimumTapTargetPx: 44, maximumOutLanePx: 56 },
  football: { outLanePercent: 12, minimumTapTargetPx: 44, maximumOutLanePx: 60 },
  badminton: { outLanePercent: 11, minimumTapTargetPx: 44, maximumOutLanePx: 56 },
  basketball: { outLanePercent: 12, minimumTapTargetPx: 44, maximumOutLanePx: 60 },
};

export function getProAreaLayoutMetrics(sportType: SportType): ProAreaLayoutMetrics {
  return PRO_AREA_LAYOUT_METRICS[sportType];
}

export function getProAreaOutZoneLayout(sportType: SportType): ProAreaOutZoneLayout {
  return PRO_AREA_OUT_ZONE_LAYOUTS[sportType];
}

export function getProAreaOutLaneSize(sportType: SportType): string {
  const metrics = getProAreaLayoutMetrics(sportType);
  return `clamp(${metrics.minimumTapTargetPx}px, ${metrics.outLanePercent}%, ${metrics.maximumOutLanePx}px)`;
}
