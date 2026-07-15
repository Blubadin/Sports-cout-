import { describe, expect, it } from 'vitest';
import { createDefaultControllerProfile } from '../../controller/controllerProfiles';
import {
  resolveControllerAimClientPoint,
  resolveControllerHudIntent,
  type ControllerHudContext,
} from '../../controller/controllerHudBridge';
import type { ControllerButtonName, ControllerInputEvent } from '../../controller/types';

const profile = createDefaultControllerProfile('xbox');

const context = (overrides: Partial<ControllerHudContext> = {}): ControllerHudContext => ({
  mode: 'hud-base',
  activeMenu: 'none',
  ...overrides,
});

const buttonEvent = (
  type: 'button-down' | 'button-up' | 'button-repeat',
  control: ControllerButtonName,
): ControllerInputEvent => ({
  type,
  controllerIndex: 0,
  family: 'xbox',
  control,
  value: type === 'button-up' ? 0 : 1,
});

describe('resolveControllerHudIntent', () => {
  it('opens and releases a hold menu from the configured button', () => {
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'button-west'), profile, context()))
      .toEqual({ type: 'open-menu', menu: 'skill', control: 'button-west' });

    expect(resolveControllerHudIntent(
      buttonEvent('button-up', 'button-west'),
      profile,
      context({ mode: 'active-wheel', activeMenu: 'skill', activeMenuControl: 'button-west' }),
    )).toEqual({ type: 'release-menu', menu: 'skill' });
  });

  it('uses the left stick as normalized wheel aim only while a wheel is active', () => {
    const axisEvent: ControllerInputEvent = {
      type: 'axis-change',
      controllerIndex: 0,
      family: 'xbox',
      stick: 'left',
      x: 0.5,
      y: -0.25,
      magnitude: 0.56,
    };

    expect(resolveControllerHudIntent(axisEvent, profile, context())).toBeNull();
    expect(resolveControllerHudIntent(axisEvent, profile, context({ mode: 'active-wheel', activeMenu: 'area' })))
      .toEqual({ type: 'aim', x: 0.5, y: -0.25, magnitude: 0.56 });
  });

  it('projects normalized stick aim around the active wheel center', () => {
    expect(resolveControllerAimClientPoint(
      { left: 100, top: 50, width: 300, height: 200 },
      { x: 1, y: -0.5, magnitude: 1 },
      0.28,
    )).toEqual({ x: 385, y: 105 });

    expect(resolveControllerAimClientPoint(
      { left: 100, top: 50, width: 300, height: 200 },
      { x: 0.1, y: 0.1, magnitude: 0.2 },
      0.28,
    )).toEqual({ x: 250, y: 150 });
  });

  it('prefers Result over Cancel for the shared east button in HUD base', () => {
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'button-east'), profile, context()))
      .toEqual({ type: 'open-menu', menu: 'result', control: 'button-east' });
  });

  it('exits HUD from base when Cancel is mapped to a control without a menu collision', () => {
    const customProfile = {
      ...profile,
      bindings: { ...profile.bindings, cancel: 'home' as const },
    };
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'home'), customProfile, context()))
      .toEqual({ type: 'exit-hud' });
  });

  it('confirms the current wheel with the confirm binding without waiting for opener release', () => {
    expect(resolveControllerHudIntent(
      buttonEvent('button-down', 'button-south'),
      profile,
      context({ mode: 'active-wheel', activeMenu: 'skill', activeMenuControl: 'button-west' }),
    )).toEqual({ type: 'release-menu', menu: 'skill' });
  });

  it('maps base commands without allowing repeated save events', () => {
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'dpad-right'), profile, context()))
      .toEqual({ type: 'cycle-team', direction: 1 });
    expect(resolveControllerHudIntent(buttonEvent('button-repeat', 'dpad-right'), profile, context()))
      .toEqual({ type: 'cycle-team', direction: 1 });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'right-shoulder'), profile, context()))
      .toEqual({ type: 'save-event' });
    expect(resolveControllerHudIntent(buttonEvent('button-repeat', 'right-shoulder'), profile, context()))
      .toBeNull();
  });

  it('uses history-specific navigation and closes with the cancel binding', () => {
    const history = context({ mode: 'history' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'dpad-left'), profile, history))
      .toEqual({ type: 'history-command', command: 'previous-tab' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'dpad-down'), profile, history))
      .toEqual({ type: 'history-command', command: 'next-item' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'button-south'), profile, history))
      .toEqual({ type: 'history-command', command: 'confirm' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'button-east'), profile, history))
      .toEqual({ type: 'history-command', command: 'close' });
  });

  it('uses replay-specific play, loop, seek, bookmark and close commands', () => {
    const replay = context({ mode: 'replay' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'button-south'), profile, replay))
      .toEqual({ type: 'replay-command', command: 'toggle-playback' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'right-shoulder'), profile, replay))
      .toEqual({ type: 'replay-command', command: 'toggle-loop' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'left-trigger'), profile, replay))
      .toEqual({ type: 'replay-command', command: 'seek-backward' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'right-stick'), profile, replay))
      .toEqual({ type: 'replay-command', command: 'bookmark' });
    expect(resolveControllerHudIntent(buttonEvent('button-down', 'button-east'), profile, replay))
      .toEqual({ type: 'replay-command', command: 'close' });
  });

  it('cancels held input after blur, hidden, disconnect or runtime shutdown', () => {
    const cancelled: ControllerInputEvent = {
      type: 'cancelled',
      controllerIndex: 0,
      family: 'xbox',
      reason: 'blur',
    };
    expect(resolveControllerHudIntent(cancelled, profile, context({ mode: 'active-wheel', activeMenu: 'skill' })))
      .toEqual({ type: 'cancel-input' });
  });

  it('ignores all commands while a blocking modal owns input', () => {
    expect(resolveControllerHudIntent(
      buttonEvent('button-down', 'button-west'),
      profile,
      context({ mode: 'blocking-modal' }),
    )).toBeNull();
  });
});
