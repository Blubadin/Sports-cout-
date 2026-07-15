import { describe, expect, it } from 'vitest';
import { ControllerInputProcessor } from '../../controller/controllerInputProcessor';
import { DEFAULT_CONTROLLER_CALIBRATION } from '../../controller/controllerProfiles';
import type { GamepadSnapshot } from '../../controller/types';

function gamepad(buttonValues: number[] = [], axes = [0, 0, 0, 0]): GamepadSnapshot {
  return {
    index: 0,
    connected: true,
    id: 'Xbox Wireless Controller',
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: (buttonValues[index] ?? 0) >= 0.5,
      value: buttonValues[index] ?? 0,
    })),
    axes,
  };
}

describe('ControllerInputProcessor', () => {
  it('emits one down edge while a button remains held', () => {
    const processor = new ControllerInputProcessor(DEFAULT_CONTROLLER_CALIBRATION);
    const held = gamepad([1]);

    expect(processor.process(held, 0).map((event) => event.type)).toEqual(['button-down']);
    expect(processor.process(held, 100).filter((event) => event.type === 'button-down')).toHaveLength(0);
    expect(processor.process(held, 200).filter((event) => event.type === 'button-down')).toHaveLength(0);
  });

  it('uses explicit repeat events after the configured delay', () => {
    const processor = new ControllerInputProcessor(DEFAULT_CONTROLLER_CALIBRATION, {
      initialDelayMs: 300,
      repeatIntervalMs: 100,
    });
    const held = gamepad(Array.from({ length: 13 }, (_, index) => index === 12 ? 1 : 0));

    processor.process(held, 0);
    expect(processor.process(held, 299)).toEqual([]);
    expect(processor.process(held, 300)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'button-repeat', control: 'dpad-up' }),
    ]));
  });

  it('emits normalized stick changes and a release edge', () => {
    const processor = new ControllerInputProcessor(DEFAULT_CONTROLLER_CALIBRATION);
    processor.process(gamepad([1]), 0);

    const events = processor.process(gamepad([], [0.7, -0.5, 0, 0]), 20);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'button-up', control: 'button-south' }),
      expect.objectContaining({ type: 'axis-change', stick: 'left' }),
    ]));
  });

  it('re-emits a held stick direction at a controlled interval for menu scrolling', () => {
    const processor = new ControllerInputProcessor(DEFAULT_CONTROLLER_CALIBRATION, {
      initialDelayMs: 300,
      repeatIntervalMs: 100,
    });
    const heldStick = gamepad([], [0, 0.8, 0, 0]);

    expect(processor.process(heldStick, 0)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'axis-change', stick: 'left' }),
    ]));
    expect(processor.process(heldStick, 99)).toEqual([]);
    expect(processor.process(heldStick, 100)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'axis-change', stick: 'left' }),
    ]));
  });
});
