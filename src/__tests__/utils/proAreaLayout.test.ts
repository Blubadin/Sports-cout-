import { describe, expect, it } from 'vitest';
import { resolveControllerHudIntent, type ControllerHudContext } from '../../controller/controllerHudBridge';
import { createDefaultControllerProfile } from '../../controller/controllerProfiles';
import type { ControllerButtonName, ControllerInputEvent } from '../../controller/types';
import type { SportType } from '../../types';
import { resolveAreaSelectionFromPoint } from '../../utils/areaGeometry';
import { resolveKeyboardCoachCommand } from '../../utils/coachCommands';
import { getProAreaLayoutMetrics, getProAreaOutZoneLayout } from '../../utils/proAreaLayout';

describe('Pro HUD area layout', () => {
  it.each(['volleyball', 'football', 'badminton', 'basketball'] as SportType[])(
    'keeps %s out-of-court lanes large enough for pointer and touch input',
    (sportType) => {
      const metrics = getProAreaLayoutMetrics(sportType);

      expect(metrics.minimumTapTargetPx).toBeGreaterThanOrEqual(44);
      expect(metrics.outLanePercent).toBeGreaterThanOrEqual(10);
      expect(metrics.outLanePercent).toBeLessThanOrEqual(14);
    },
  );

  it.each([
    ['volleyball', ['opp_back_left', 'opp_back_right', 'side_left_far', 'side_left_near', 'side_right_far', 'side_right_near', 'back_left', 'back_right']],
    ['football', ['corner_left', 'opp_endline', 'corner_right', 'left_touchline_att', 'left_touchline_mid', 'left_touchline_def', 'right_touchline_att', 'right_touchline_mid', 'right_touchline_def', 'own_endline', 'goal_kick', 'own_endline']],
    ['badminton', ['opp_back_out', 'side_left_far', 'side_left_near', 'side_right_far', 'side_right_near', 'back_left', 'back_right']],
    ['basketball', ['baseline_left', 'baseline_right', 'left_sideline', 'right_sideline', 'endline']],
  ] as const)('keeps %s out zones isolated in its own typed layout', (sportType, expectedZones) => {
    const layout = getProAreaOutZoneLayout(sportType);
    const items = [...layout.top, ...layout.left, ...layout.right, ...layout.bottom];

    expect(items.map(item => item.outZone)).toEqual(expectedZones);
    expect(items.every(item => item.id.startsWith(`${sportType}:`))).toBe(true);
  });

  it('splits the volleyball near baseline into left and right out zones', () => {
    const layout = getProAreaOutZoneLayout('volleyball');

    expect(layout.bottom.map(item => item.outZone)).toEqual(['back_left', 'back_right']);
  });

  it('uses globally unique UI ids across all sport layouts', () => {
    const ids = (['volleyball', 'football', 'badminton', 'basketball'] as SportType[])
      .flatMap(sportType => {
        const layout = getProAreaOutZoneLayout(sportType);
        return [...layout.top, ...layout.left, ...layout.right, ...layout.bottom].map(item => item.id);
      });

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the visible zone stable while flip court swaps its physical side', () => {
    const resolve = (flipCourtSide: boolean) => resolveAreaSelectionFromPoint({
      sportType: 'volleyball',
      point: { rx: 0.25, ry: 0.25 },
      flipCourtSide,
      enableOutOfBoundsZones: true,
      areaPrecisionMode: 'normal',
      uiLanguage: 'en',
    });

    expect(resolve(false)).toMatchObject({ areaCode: 'LB', courtSide: 'teamA' });
    expect(resolve(true)).toMatchObject({ areaCode: 'LB', courtSide: 'teamB' });
  });

  it('opens the area wheel through the shared keyboard and controller command paths', () => {
    expect(resolveKeyboardCoachCommand({ code: 'KeyW' }, 'hud-base'))
      .toEqual({ type: 'openMenu', menu: 'area' });

    const profile = createDefaultControllerProfile('xbox');
    const areaControl = profile.bindings.openArea;
    const context = (overrides: Partial<ControllerHudContext> = {}): ControllerHudContext => ({
      mode: 'hud-base',
      activeMenu: 'none',
      ...overrides,
    });
    const buttonEvent = (
      type: 'button-down' | 'button-up',
      control: ControllerButtonName,
    ): ControllerInputEvent => ({
      type,
      controllerIndex: 0,
      family: 'xbox',
      control,
      value: type === 'button-up' ? 0 : 1,
    });

    expect(resolveControllerHudIntent(buttonEvent('button-down', areaControl), profile, context()))
      .toEqual({ type: 'open-menu', menu: 'area', control: areaControl });
    expect(resolveControllerHudIntent(
      buttonEvent('button-up', areaControl),
      profile,
      context({ mode: 'active-wheel', activeMenu: 'area', activeMenuControl: areaControl }),
    )).toEqual({ type: 'release-menu', menu: 'area' });
  });
});
