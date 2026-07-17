import { describe, expect, it } from 'vitest';
import { SPORT_TEMPLATES } from '../../sports';
import {
  SPORT_GEOMETRY_SPECS,
  getSportGeometrySpec,
} from '../../geometry/sportGeometrySpec';
import {
  buildAreaPreviewGrid,
  mapFullCourtPointToAreaView,
  mapAreaViewPointToFullCourt,
  resolveAreaDisplayPoint,
  resolveAreaSelectionFromPoint,
} from '../../utils/areaGeometry';
import type { SportType } from '../../types';

const SPORTS: SportType[] = ['volleyball', 'football', 'badminton', 'basketball'];

describe('SportGeometrySpec contract', () => {
  it.each(SPORTS)('%s uses a 90% playable field and a 5% outer lane', (sport) => {
    const spec = getSportGeometrySpec(sport);
    expect(spec.frame.courtBounds).toEqual({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
    expect(spec.frame.outLaneRatio).toBe(0.05);
  });

  it.each(SPORTS)('%s exposes every configured precision mode from one registry', (sport) => {
    expect(SPORT_GEOMETRY_SPECS[sport].modes.normal).toBeDefined();
    expect(SPORT_GEOMETRY_SPECS[sport].modes.detailed).toBeDefined();
    expect(SPORT_GEOMETRY_SPECS[sport].modes.point.type).toBe('point');
    expect(SPORT_TEMPLATES[sport].areaLayouts?.point?.type).toBe('point');
  });

  it('uses the football 4x6 detailed contract instead of a 4x4 resolver', () => {
    const result = resolveAreaSelectionFromPoint({
      sportType: 'football',
      point: { rx: 0.94, ry: 0.94 },
      enableOutOfBoundsZones: false,
      areaPrecisionMode: 'detailed',
    });

    expect(result).toMatchObject({ areaCode: 'F-3-5', gridX: 5, gridY: 3, areaResolution: '4x6' });
  });

  it('records canonical point coordinates in Point mode', () => {
    const result = resolveAreaSelectionFromPoint({
      sportType: 'basketball',
      point: { rx: 0.275, ry: 0.725 },
      enableOutOfBoundsZones: true,
      areaPrecisionMode: 'point',
    });

    expect(result?.areaMode).toBe('point');
    expect(result?.pointX).toBeCloseTo(0.25, 4);
    expect(result?.pointY).toBeCloseTo(0.75, 4);
  });

  it('keeps playable selections inside the 5% lane and resolves true outside points as Out', () => {
    const inside = resolveAreaSelectionFromPoint({
      sportType: 'football',
      point: { rx: 0.06, ry: 0.5 },
      enableOutOfBoundsZones: true,
    });
    const outside = resolveAreaSelectionFromPoint({
      sportType: 'football',
      point: { rx: 0.03, ry: 0.5 },
      enableOutOfBoundsZones: true,
    });

    expect(inside?.outZone).toBeUndefined();
    expect(outside).toMatchObject({ areaCode: 'OUT', outZone: 'left_touchline_mid' });
  });

  it.each([
    ['football', 'goal_kick'],
    ['badminton', 'own_back_out'],
    ['badminton', 'opp_back_out'],
  ] as const)('keeps %s out zone %s visible on Field Intelligence maps', (sport, outZone) => {
    expect(resolveAreaDisplayPoint(sport, { outZone })).not.toBeNull();
  });

  it.each([
    ['football', { rx: 0.2, ry: 0.12 }, 'DEF_R', 'teamB'],
    ['football', { rx: 0.2, ry: 0.88 }, 'DEF_L', 'teamA'],
    ['badminton', { rx: 0.2, ry: 0.12 }, 'BACK', 'teamB'],
    ['badminton', { rx: 0.2, ry: 0.88 }, 'BACK', 'teamA'],
    ['basketball', { rx: 0.5, ry: 0.12 }, 'PAINT', 'teamB'],
    ['basketball', { rx: 0.5, ry: 0.88 }, 'PAINT', 'teamA'],
  ] as const)('matches the Normal court layout for %s at %j', (sport, point, areaCode, courtSide) => {
    const result = resolveAreaSelectionFromPoint({
      sportType: sport,
      point,
      enableOutOfBoundsZones: true,
      areaPrecisionMode: 'normal',
    });
    expect(result).toMatchObject({ areaCode, courtSide });
  });

  it.each([
    ['football', { areaCode: 'DEF_R', courtSide: 'teamB' }, 'top'],
    ['football', { areaCode: 'DEF_L', courtSide: 'teamA' }, 'bottom'],
    ['badminton', { areaCode: 'BACK', courtSide: 'teamB' }, 'top'],
    ['badminton', { areaCode: 'BACK', courtSide: 'teamA' }, 'bottom'],
    ['basketball', { areaCode: 'PAINT', courtSide: 'teamB' }, 'top'],
    ['basketball', { areaCode: 'PAINT', courtSide: 'teamA' }, 'bottom'],
  ] as const)('places %s %j on the correct Field Intelligence half', (sport, action, half) => {
    const point = resolveAreaDisplayPoint(sport, action);
    expect(point).not.toBeNull();
    expect(half === 'top' ? point!.top < 50 : point!.top > 50).toBe(true);
  });

  it('places volleyball court sides on opposite horizontal halves', () => {
    expect(resolveAreaDisplayPoint('volleyball', { areaCode: 'LB', courtSide: 'teamA' })!.left).toBeLessThan(50);
    expect(resolveAreaDisplayPoint('volleyball', { areaCode: 'LB', courtSide: 'teamB' })!.left).toBeGreaterThan(50);
  });

  it.each([
    ['football', 'normal', 6, 3],
    ['football', 'detailed', 4, 6],
    ['badminton', 'normal', 7, 1],
    ['badminton', 'detailed', 7, 3],
    ['basketball', 'normal', 8, 3],
    ['basketball', 'detailed', 8, 3],
  ] as const)('builds a %s %s HUD preview from the shared resolver', (sport, mode, rows, cols) => {
    const preview = buildAreaPreviewGrid(sport, mode, false);
    expect(preview).toMatchObject({ rows, cols });
    expect(preview.cells).toHaveLength(rows * cols);
    expect(preview.cells.every((cell) => cell.payload?.areaCode)).toBe(true);
  });

  it('keeps both basketball court sides in the full-court HUD preview', () => {
    const preview = buildAreaPreviewGrid('basketball', 'normal', false);
    expect(preview.cells.some((cell) => cell.payload?.courtSide === 'teamA')).toBe(true);
    expect(preview.cells.some((cell) => cell.payload?.courtSide === 'teamB')).toBe(true);
  });

  it('uses the center badminton preview row as the net separator', () => {
    const preview = buildAreaPreviewGrid('badminton', 'normal', false);
    expect(preview.cells[3].payload).toMatchObject({ areaCode: 'NET_ERR', courtSide: 'neutral' });
  });

  it('gives generated detailed grid cells a readable English label', () => {
    const result = resolveAreaSelectionFromPoint({
      sportType: 'football',
      point: { rx: 0.94, ry: 0.94 },
      enableOutOfBoundsZones: false,
      areaPrecisionMode: 'detailed',
      uiLanguage: 'en',
    });
    expect(result?.areaLabel).toBe('Row 4 · Column 6');
  });

  it('gives generated detailed grid cells a readable Thai label', () => {
    const result = resolveAreaSelectionFromPoint({
      sportType: 'basketball',
      point: { rx: 0.5, ry: 0.9 },
      enableOutOfBoundsZones: false,
      areaPrecisionMode: 'detailed',
      uiLanguage: 'th',
    });
    expect(result?.areaLabel).toBe('แถว 1 · ช่อง 2');
  });

  it('localizes generated preview labels with the active UI language', () => {
    const preview = buildAreaPreviewGrid('football', 'detailed', false, 'full', 'th');
    expect(preview.cells[0].payload?.areaLabel).toBe('แถว 1 · ช่อง 1');
    expect(preview.cells.at(-1)?.payload?.areaLabel).toBe('แถว 4 · ช่อง 6');
  });

  it.each([
    ['football', 3, 3],
    ['badminton', 3, 1],
    ['basketball', 4, 3],
    ['volleyball', 3, 2],
  ] as const)('shows the primary %s half at a larger usable size', (sport, rows, cols) => {
    const preview = buildAreaPreviewGrid(sport, 'normal', false, 'half');
    expect(preview).toMatchObject({ rows, cols });
    expect(preview.cells.every((cell) => cell.payload?.courtSide === 'teamA')).toBe(true);
  });

  it('keeps Half Court focused on the primary visible side after a court flip', () => {
    const preview = buildAreaPreviewGrid('football', 'normal', true, 'half');
    expect(preview.cells.every((cell) => cell.payload?.courtSide === 'teamB')).toBe(true);
  });

  it('maps a half-court pointer into canonical full-court coordinates', () => {
    const point = mapAreaViewPointToFullCourt('football', { rx: 0.5, ry: 0.5 }, 'half');
    expect(point.rx).toBeCloseTo(0.5, 4);
    expect(point.ry).toBeCloseTo(0.743, 3);
    const viewPoint = mapFullCourtPointToAreaView('football', point, 'half');
    expect(viewPoint.rx).toBeCloseTo(0.5, 4);
    expect(viewPoint.ry).toBeCloseTo(0.5, 4);
  });
});
