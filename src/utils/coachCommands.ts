import type { AreaSelectionPayload } from '../types';
import {
  getHudMenuForKeyboardCode,
  type HudCommandMenu,
} from './hudCommandBindings';

export type CoachInputContext =
  | 'blocking-modal'
  | 'history-replay'
  | 'active-wheel'
  | 'hud-base'
  | 'normal-input';

export type CoachCommand =
  | { type: 'selectTeam'; teamIndex: 0 | 1 }
  | { type: 'selectSkill'; skillCode: string }
  | { type: 'selectArea'; area: AreaSelectionPayload }
  | { type: 'selectResult'; resultCode: string }
  | { type: 'selectFoul'; foulCode: string }
  | { type: 'openMenu'; menu: HudCommandMenu }
  | { type: 'saveEvent' }
  | { type: 'undoAction' }
  | { type: 'redoAction' }
  | { type: 'clearCurrent' }
  | { type: 'cancelContext' }
  | { type: 'toggleHistory' }
  | { type: 'togglePlayback' }
  | { type: 'seekBy'; seconds: number }
  | { type: 'quickBookmark' }
  | { type: 'editLastEvent' };

export type CoachCommandHandlers = {
  selectTeam?: (teamIndex: 0 | 1) => void;
  selectSkill?: (skillCode: string) => void;
  selectArea?: (area: AreaSelectionPayload) => void;
  selectResult?: (resultCode: string) => void;
  selectFoul?: (foulCode: string) => void;
  openMenu?: (menu: HudCommandMenu) => void;
  saveEvent?: () => void;
  undoAction?: () => void;
  redoAction?: () => void;
  clearCurrent?: () => void;
  cancelContext?: () => void;
  toggleHistory?: () => void;
  togglePlayback?: () => void;
  seekBy?: (seconds: number) => void;
  quickBookmark?: () => void;
  editLastEvent?: () => void;
};

export type CoachKeyboardInput = {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

export function resolveCoachInputContext({
  blockingModal = false,
  historyReplay = false,
  activeWheel = false,
  hudActive = false,
}: {
  blockingModal?: boolean;
  historyReplay?: boolean;
  activeWheel?: boolean;
  hudActive?: boolean;
}): CoachInputContext {
  if (blockingModal) return 'blocking-modal';
  if (historyReplay) return 'history-replay';
  if (activeWheel) return 'active-wheel';
  if (hudActive) return 'hud-base';
  return 'normal-input';
}

export function resolveKeyboardCoachCommand(
  input: CoachKeyboardInput,
  context: CoachInputContext,
): CoachCommand | null {
  if (context === 'blocking-modal') return null;

  if (input.code === 'Escape') return { type: 'cancelContext' };
  if (context === 'history-replay') {
    return input.code === 'KeyH' ? { type: 'toggleHistory' } : null;
  }

  if (input.code === 'Digit1' || input.code === 'Numpad1') {
    return { type: 'selectTeam', teamIndex: 0 };
  }
  if (input.code === 'Digit2' || input.code === 'Numpad2') {
    return { type: 'selectTeam', teamIndex: 1 };
  }
  if (input.code === 'Enter') return { type: 'saveEvent' };
  if (input.code === 'Backspace') {
    return input.ctrlKey || input.metaKey
      ? { type: 'clearCurrent' }
      : { type: 'undoAction' };
  }
  if (input.code === 'KeyY' && (input.ctrlKey || input.metaKey)) {
    return { type: 'redoAction' };
  }
  if (input.code === 'KeyZ' && (input.ctrlKey || input.metaKey)) {
    return input.shiftKey ? { type: 'redoAction' } : { type: 'undoAction' };
  }
  if ((input.code === 'KeyB' || input.code === 'KeyK') && !input.ctrlKey && !input.metaKey) {
    return { type: 'quickBookmark' };
  }
  if (input.code === 'KeyE' && (input.ctrlKey || input.metaKey)) {
    return { type: 'editLastEvent' };
  }

  if (context === 'active-wheel' || context === 'hud-base') {
    const menu = getHudMenuForKeyboardCode(input.code);
    if (menu && menu !== 'team') return { type: 'openMenu', menu };
    if (input.code === 'KeyH') return { type: 'toggleHistory' };
    if (input.code === 'Space') return { type: 'togglePlayback' };
    if (input.code === 'KeyA') return { type: 'seekBy', seconds: -3 };
    if (input.code === 'KeyD') return { type: 'seekBy', seconds: 3 };
  }

  return null;
}

export function dispatchCoachCommand(
  command: CoachCommand,
  handlers: CoachCommandHandlers,
): boolean {
  switch (command.type) {
    case 'selectTeam':
      handlers.selectTeam?.(command.teamIndex);
      return Boolean(handlers.selectTeam);
    case 'selectSkill':
      handlers.selectSkill?.(command.skillCode);
      return Boolean(handlers.selectSkill);
    case 'selectArea':
      handlers.selectArea?.(command.area);
      return Boolean(handlers.selectArea);
    case 'selectResult':
      handlers.selectResult?.(command.resultCode);
      return Boolean(handlers.selectResult);
    case 'selectFoul':
      handlers.selectFoul?.(command.foulCode);
      return Boolean(handlers.selectFoul);
    case 'openMenu':
      handlers.openMenu?.(command.menu);
      return Boolean(handlers.openMenu);
    case 'saveEvent':
      handlers.saveEvent?.();
      return Boolean(handlers.saveEvent);
    case 'undoAction':
      handlers.undoAction?.();
      return Boolean(handlers.undoAction);
    case 'redoAction':
      handlers.redoAction?.();
      return Boolean(handlers.redoAction);
    case 'clearCurrent':
      handlers.clearCurrent?.();
      return Boolean(handlers.clearCurrent);
    case 'cancelContext':
      handlers.cancelContext?.();
      return Boolean(handlers.cancelContext);
    case 'toggleHistory':
      handlers.toggleHistory?.();
      return Boolean(handlers.toggleHistory);
    case 'togglePlayback':
      handlers.togglePlayback?.();
      return Boolean(handlers.togglePlayback);
    case 'seekBy':
      handlers.seekBy?.(command.seconds);
      return Boolean(handlers.seekBy);
    case 'quickBookmark':
      handlers.quickBookmark?.();
      return Boolean(handlers.quickBookmark);
    case 'editLastEvent':
      handlers.editLastEvent?.();
      return Boolean(handlers.editLastEvent);
  }
}

export function createCommandEdgeGuard() {
  const activeInputs = new Set<string>();
  return {
    begin(inputId: string) {
      if (activeInputs.has(inputId)) return false;
      activeInputs.add(inputId);
      return true;
    },
    end(inputId: string) {
      return activeInputs.delete(inputId);
    },
    cancelAll() {
      activeInputs.clear();
    },
  };
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
