import { describe, expect, it, vi } from 'vitest';
import {
  createCommandEdgeGuard,
  dispatchCoachCommand,
  resolveCoachInputContext,
  resolveKeyboardCoachCommand,
} from '../../utils/coachCommands';

describe('coach command model', () => {
  it('applies the documented input context priority', () => {
    expect(resolveCoachInputContext({ blockingModal: true, historyReplay: true, activeWheel: true, hudActive: true })).toBe('blocking-modal');
    expect(resolveCoachInputContext({ historyReplay: true, activeWheel: true, hudActive: true })).toBe('history-replay');
    expect(resolveCoachInputContext({ activeWheel: true, hudActive: true })).toBe('active-wheel');
    expect(resolveCoachInputContext({ hudActive: true })).toBe('hud-base');
    expect(resolveCoachInputContext({})).toBe('normal-input');
  });

  it.each([
    ['Digit1', { type: 'selectTeam', teamIndex: 0 }],
    ['Numpad2', { type: 'selectTeam', teamIndex: 1 }],
    ['KeyQ', { type: 'openMenu', menu: 'skill' }],
    ['KeyW', { type: 'openMenu', menu: 'area' }],
    ['KeyE', { type: 'openMenu', menu: 'result' }],
    ['KeyR', { type: 'openMenu', menu: 'foul' }],
    ['Enter', { type: 'saveEvent' }],
    ['KeyH', { type: 'toggleHistory' }],
  ] as const)('maps %s to a semantic HUD command', (code, expected) => {
    expect(resolveKeyboardCoachCommand({ code }, 'hud-base')).toEqual(expected);
  });

  it('blocks background commands while a blocking modal owns input', () => {
    expect(resolveKeyboardCoachCommand({ code: 'Enter' }, 'blocking-modal')).toBeNull();
  });

  it('dispatches one command through the matching handler', () => {
    const saveEvent = vi.fn();
    const selectTeam = vi.fn();
    expect(dispatchCoachCommand({ type: 'saveEvent' }, { saveEvent, selectTeam })).toBe(true);
    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(selectTeam).not.toHaveBeenCalled();
  });

  it('guards held inputs from firing the same edge twice', () => {
    const guard = createCommandEdgeGuard();
    expect(guard.begin('keyboard:Enter')).toBe(true);
    expect(guard.begin('keyboard:Enter')).toBe(false);
    expect(guard.end('keyboard:Enter')).toBe(true);
    expect(guard.begin('keyboard:Enter')).toBe(true);
  });
});
