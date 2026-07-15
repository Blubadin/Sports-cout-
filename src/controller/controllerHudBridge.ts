import type { HudCommandMenu } from '../utils/hudCommandBindings';
import type {
  ControllerButtonName,
  ControllerCommandId,
  ControllerInputEvent,
  ControllerProfile,
} from './types';

export type ControllerHudMode =
  | 'blocking-modal'
  | 'hud-base'
  | 'active-wheel'
  | 'history'
  | 'replay';

export type ControllerHudContext = {
  mode: ControllerHudMode;
  activeMenu: HudCommandMenu | 'none';
  activeMenuControl?: ControllerButtonName;
};

export type ControllerHistoryCommand =
  | 'previous-tab'
  | 'next-tab'
  | 'previous-item'
  | 'next-item'
  | 'confirm'
  | 'close'
  | 'scroll-up'
  | 'scroll-down';

export type ControllerReplayCommand =
  | 'toggle-playback'
  | 'toggle-loop'
  | 'seek-backward'
  | 'seek-forward'
  | 'bookmark'
  | 'close';

export type ControllerHudIntent =
  | { type: 'open-menu'; menu: HudCommandMenu; control: ControllerButtonName }
  | { type: 'release-menu'; menu: HudCommandMenu }
  | { type: 'aim'; x: number; y: number; magnitude: number }
  | { type: 'cycle-team'; direction: -1 | 1 }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save-event' }
  | { type: 'toggle-history' }
  | { type: 'toggle-playback' }
  | { type: 'seek-by'; seconds: number }
  | { type: 'bookmark-latest' }
  | { type: 'exit-hud' }
  | { type: 'history-command'; command: ControllerHistoryCommand }
  | { type: 'replay-command'; command: ControllerReplayCommand }
  | { type: 'cancel-input' };

export function resolveControllerAimClientPoint(
  rect: { left: number; top: number; width: number; height: number },
  aim: { x: number; y: number; magnitude: number },
  neutralCancelThreshold: number,
) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  if (aim.magnitude < neutralCancelThreshold) return { x: centerX, y: centerY };
  return {
    x: centerX + aim.x * rect.width * 0.45,
    y: centerY + aim.y * rect.height * 0.45,
  };
}

const MENU_COMMANDS: Partial<Record<ControllerCommandId, HudCommandMenu>> = {
  openSkill: 'skill',
  openArea: 'area',
  openResult: 'result',
  openFoul: 'foul',
};

function hasBinding(
  profile: ControllerProfile,
  command: ControllerCommandId,
  control: ControllerButtonName,
) {
  return profile.bindings[command] === control;
}

function findMenuBinding(profile: ControllerProfile, control: ControllerButtonName) {
  for (const [command, menu] of Object.entries(MENU_COMMANDS) as Array<
    [ControllerCommandId, HudCommandMenu]
  >) {
    if (hasBinding(profile, command, control)) return menu;
  }
  return null;
}

function resolveHistoryButton(
  control: ControllerButtonName,
  profile: ControllerProfile,
): ControllerHudIntent | null {
  if (hasBinding(profile, 'previousTeam', control)) {
    return { type: 'history-command', command: 'previous-tab' };
  }
  if (hasBinding(profile, 'nextTeam', control)) {
    return { type: 'history-command', command: 'next-tab' };
  }
  if (hasBinding(profile, 'undo', control)) {
    return { type: 'history-command', command: 'previous-item' };
  }
  if (hasBinding(profile, 'redo', control)) {
    return { type: 'history-command', command: 'next-item' };
  }
  if (hasBinding(profile, 'confirm', control)) {
    return { type: 'history-command', command: 'confirm' };
  }
  if (
    hasBinding(profile, 'cancel', control) ||
    hasBinding(profile, 'openResult', control) ||
    hasBinding(profile, 'toggleHistory', control)
  ) {
    return { type: 'history-command', command: 'close' };
  }
  return null;
}

function resolveReplayButton(
  control: ControllerButtonName,
  profile: ControllerProfile,
): ControllerHudIntent | null {
  if (hasBinding(profile, 'confirm', control) || hasBinding(profile, 'togglePlayback', control)) {
    return { type: 'replay-command', command: 'toggle-playback' };
  }
  if (hasBinding(profile, 'saveEvent', control)) {
    return { type: 'replay-command', command: 'toggle-loop' };
  }
  if (hasBinding(profile, 'seekBackward', control)) {
    return { type: 'replay-command', command: 'seek-backward' };
  }
  if (hasBinding(profile, 'seekForward', control)) {
    return { type: 'replay-command', command: 'seek-forward' };
  }
  if (hasBinding(profile, 'bookmark', control)) {
    return { type: 'replay-command', command: 'bookmark' };
  }
  if (
    hasBinding(profile, 'cancel', control) ||
    hasBinding(profile, 'openResult', control) ||
    hasBinding(profile, 'toggleHistory', control)
  ) {
    return { type: 'replay-command', command: 'close' };
  }
  return null;
}

export function resolveControllerHudIntent(
  event: ControllerInputEvent,
  profile: ControllerProfile,
  context: ControllerHudContext,
): ControllerHudIntent | null {
  if (context.mode === 'blocking-modal') return null;
  if (event.type === 'cancelled' || event.type === 'disconnected') {
    return { type: 'cancel-input' };
  }
  if (event.type === 'connected') return null;

  if (event.type === 'axis-change') {
    if (event.stick !== 'left') return null;
    if (context.mode === 'active-wheel') {
      return { type: 'aim', x: event.x, y: event.y, magnitude: event.magnitude };
    }
    if (context.mode === 'history' && Math.abs(event.y) >= 0.55) {
      return {
        type: 'history-command',
        command: event.y < 0 ? 'scroll-up' : 'scroll-down',
      };
    }
    return null;
  }
  if (!("control" in event)) return null;

  if (event.type === 'button-up') {
    if (
      context.mode === 'active-wheel' &&
      context.activeMenu !== 'none' &&
      context.activeMenuControl === event.control
    ) {
      return { type: 'release-menu', menu: context.activeMenu };
    }
    return null;
  }

  if (event.type === 'button-repeat') {
    if (context.mode === 'history') return resolveHistoryButton(event.control, profile);
    if (context.mode !== 'hud-base') return null;
    if (hasBinding(profile, 'previousTeam', event.control)) {
      return { type: 'cycle-team', direction: -1 };
    }
    if (hasBinding(profile, 'nextTeam', event.control)) {
      return { type: 'cycle-team', direction: 1 };
    }
    if (hasBinding(profile, 'undo', event.control)) return { type: 'undo' };
    if (hasBinding(profile, 'redo', event.control)) return { type: 'redo' };
    return null;
  }

  if (context.mode === 'history') return resolveHistoryButton(event.control, profile);
  if (context.mode === 'replay') return resolveReplayButton(event.control, profile);

  if (context.mode === 'active-wheel') {
    if (context.activeMenu !== 'none' && hasBinding(profile, 'confirm', event.control)) {
      return { type: 'release-menu', menu: context.activeMenu };
    }
    if (
      (hasBinding(profile, 'cancel', event.control) || hasBinding(profile, 'openResult', event.control)) &&
      event.control !== context.activeMenuControl
    ) {
      return { type: 'cancel-input' };
    }
    return null;
  }

  const menu = findMenuBinding(profile, event.control);
  if (menu) return { type: 'open-menu', menu, control: event.control };
  if (hasBinding(profile, 'previousTeam', event.control)) return { type: 'cycle-team', direction: -1 };
  if (hasBinding(profile, 'nextTeam', event.control)) return { type: 'cycle-team', direction: 1 };
  if (hasBinding(profile, 'undo', event.control)) return { type: 'undo' };
  if (hasBinding(profile, 'redo', event.control)) return { type: 'redo' };
  if (hasBinding(profile, 'saveEvent', event.control)) return { type: 'save-event' };
  if (hasBinding(profile, 'toggleHistory', event.control)) return { type: 'toggle-history' };
  if (hasBinding(profile, 'togglePlayback', event.control)) return { type: 'toggle-playback' };
  if (hasBinding(profile, 'seekBackward', event.control)) return { type: 'seek-by', seconds: -3 };
  if (hasBinding(profile, 'seekForward', event.control)) return { type: 'seek-by', seconds: 3 };
  if (hasBinding(profile, 'bookmark', event.control)) return { type: 'bookmark-latest' };
  if (hasBinding(profile, 'cancel', event.control)) return { type: 'exit-hud' };
  return null;
}
