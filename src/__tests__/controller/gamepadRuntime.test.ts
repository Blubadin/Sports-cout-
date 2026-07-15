import { describe, expect, it, vi } from 'vitest';
import { GamepadRuntimeAdapter } from '../../controller/gamepadRuntime';
import { DEFAULT_CONTROLLER_CALIBRATION } from '../../controller/controllerProfiles';
import type { GamepadSnapshot } from '../../controller/types';

function snapshot(index: number, pressed = false): GamepadSnapshot {
  return {
    index,
    connected: true,
    id: index === 0 ? 'DualSense Wireless Controller' : 'Xbox Wireless Controller',
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, buttonIndex) => ({
      pressed: buttonIndex === 0 && pressed,
      value: buttonIndex === 0 && pressed ? 1 : 0,
    })),
    axes: [0, 0, 0, 0],
  };
}

function createHarness(initialGamepads: Array<GamepadSnapshot | null>, visible = true) {
  let gamepads = initialGamepads;
  let frame: FrameRequestCallback | null = null;
  const getGamepads = vi.fn(() => gamepads);
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  const cancelFrame = vi.fn();
  const isVisible = vi.fn(() => visible);

  return {
    environment: { getGamepads, requestFrame, cancelFrame, isVisible },
    runFrame(time: number) {
      const callback = frame;
      frame = null;
      callback?.(time);
    },
    setGamepads(next: Array<GamepadSnapshot | null>) {
      gamepads = next;
    },
  };
}

describe('GamepadRuntimeAdapter', () => {
  it('does not poll while the document is hidden', () => {
    const harness = createHarness([snapshot(0)], false);
    const runtime = new GamepadRuntimeAdapter(harness.environment, {
      getCalibration: () => DEFAULT_CONTROLLER_CALIBRATION,
      onEvent: vi.fn(),
    });

    runtime.start();
    expect(harness.environment.requestFrame).not.toHaveBeenCalled();
    expect(harness.environment.getGamepads).not.toHaveBeenCalled();
  });

  it('keeps one active controller when multiple controllers are present', () => {
    const harness = createHarness([snapshot(0), snapshot(1)]);
    const onEvent = vi.fn();
    const runtime = new GamepadRuntimeAdapter(harness.environment, {
      getCalibration: () => DEFAULT_CONTROLLER_CALIBRATION,
      onEvent,
    });

    runtime.start();
    harness.runFrame(0);
    expect(runtime.getActiveController()).toEqual({ index: 0, family: 'ps5', mapping: 'standard' });

    harness.setGamepads([snapshot(0), snapshot(1, true)]);
    harness.runFrame(16);
    expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'button-down', controllerIndex: 1 }));
  });

  it.each(['blur', 'disconnect'] as const)('cancels held input on %s without emitting a release commit', (reason) => {
    const harness = createHarness([snapshot(0, true)]);
    const events: unknown[] = [];
    const runtime = new GamepadRuntimeAdapter(harness.environment, {
      getCalibration: () => DEFAULT_CONTROLLER_CALIBRATION,
      onEvent: (event) => events.push(event),
    });

    runtime.start();
    harness.runFrame(0);
    if (reason === 'blur') {
      runtime.handleBlur();
    } else {
      harness.setGamepads([]);
      harness.runFrame(16);
    }

    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'cancelled', reason })]));
    expect(events.filter((event: any) => event.type === 'button-up')).toHaveLength(0);
  });

  it('requires neutral input before accepting a reconnected held controller', () => {
    const harness = createHarness([snapshot(0, true)]);
    const events: any[] = [];
    const runtime = new GamepadRuntimeAdapter(harness.environment, {
      getCalibration: () => DEFAULT_CONTROLLER_CALIBRATION,
      onEvent: (event) => events.push(event),
    });

    runtime.start();
    harness.runFrame(0);
    harness.setGamepads([]);
    harness.runFrame(16);
    harness.setGamepads([snapshot(0, true)]);
    harness.runFrame(32);

    const downsBeforeNeutral = events.filter((event) => event.type === 'button-down');
    expect(downsBeforeNeutral).toHaveLength(1);

    harness.setGamepads([snapshot(0, false)]);
    harness.runFrame(48);
    harness.setGamepads([snapshot(0, true)]);
    harness.runFrame(64);
    expect(events.filter((event) => event.type === 'button-down')).toHaveLength(2);
  });
});
