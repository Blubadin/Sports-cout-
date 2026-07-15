import { detectControllerFamily, getStandardButtonName, normalizeStick } from './controllerMapping';
import type {
  ControllerButtonName,
  ControllerCalibration,
  ControllerInputEvent,
  GamepadSnapshot,
} from './types';

type RepeatTiming = {
  initialDelayMs: number;
  repeatIntervalMs: number;
};

const DEFAULT_REPEAT_TIMING: RepeatTiming = {
  initialDelayMs: 420,
  repeatIntervalMs: 120,
};

const REPEATABLE_CONTROLS = new Set<ControllerButtonName>([
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
]);

type ButtonState = {
  active: boolean;
  nextRepeatAt: number;
};

type StickState = { x: number; y: number; magnitude: number };

export class ControllerInputProcessor {
  private readonly buttonStates = new Map<ControllerButtonName, ButtonState>();
  private readonly stickStates: Record<'left' | 'right', StickState> = {
    left: { x: 0, y: 0, magnitude: 0 },
    right: { x: 0, y: 0, magnitude: 0 },
  };
  private readonly nextStickRepeatAt: Record<'left' | 'right', number> = {
    left: 0,
    right: 0,
  };

  constructor(
    private readonly calibration: ControllerCalibration,
    private readonly repeatTiming: RepeatTiming = DEFAULT_REPEAT_TIMING,
  ) {}

  process(gamepad: GamepadSnapshot, now: number): ControllerInputEvent[] {
    const family = detectControllerFamily(gamepad.id, gamepad.mapping);
    const events: ControllerInputEvent[] = [];

    gamepad.buttons.forEach((button, index) => {
      const control = getStandardButtonName(index);
      if (!control) return;
      const previous = this.buttonStates.get(control) ?? { active: false, nextRepeatAt: 0 };
      const active = button.pressed || button.value >= this.calibration.activationThreshold;

      if (active && !previous.active) {
        this.buttonStates.set(control, {
          active: true,
          nextRepeatAt: now + this.repeatTiming.initialDelayMs,
        });
        events.push({
          type: 'button-down',
          controllerIndex: gamepad.index,
          family,
          control,
          value: button.value,
        });
        return;
      }

      if (!active && previous.active) {
        this.buttonStates.set(control, { active: false, nextRepeatAt: 0 });
        events.push({
          type: 'button-up',
          controllerIndex: gamepad.index,
          family,
          control,
          value: button.value,
        });
        return;
      }

      if (active && REPEATABLE_CONTROLS.has(control) && now >= previous.nextRepeatAt) {
        this.buttonStates.set(control, {
          active: true,
          nextRepeatAt: now + this.repeatTiming.repeatIntervalMs,
        });
        events.push({
          type: 'button-repeat',
          controllerIndex: gamepad.index,
          family,
          control,
          value: button.value,
        });
      }
    });

    this.processStick(gamepad, family, 'left', 0, now, events);
    this.processStick(gamepad, family, 'right', 2, now, events);
    return events;
  }

  cancel(
    gamepad: Pick<GamepadSnapshot, 'index' | 'id' | 'mapping'>,
    reason: Extract<ControllerInputEvent, { type: 'cancelled' }>['reason'],
  ): ControllerInputEvent[] {
    const hadInput = [...this.buttonStates.values()].some((state) => state.active) ||
      this.stickStates.left.magnitude > 0 || this.stickStates.right.magnitude > 0;
    this.reset();
    if (!hadInput) return [];
    return [{
      type: 'cancelled',
      controllerIndex: gamepad.index,
      family: detectControllerFamily(gamepad.id, gamepad.mapping),
      reason,
    }];
  }

  reset() {
    this.buttonStates.clear();
    this.stickStates.left = { x: 0, y: 0, magnitude: 0 };
    this.stickStates.right = { x: 0, y: 0, magnitude: 0 };
    this.nextStickRepeatAt.left = 0;
    this.nextStickRepeatAt.right = 0;
  }

  isNeutral(gamepad: GamepadSnapshot): boolean {
    const buttonsNeutral = gamepad.buttons.every(
      (button) => !button.pressed && button.value < this.calibration.activationThreshold,
    );
    const leftMagnitude = Math.hypot(gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0);
    const rightMagnitude = Math.hypot(gamepad.axes[2] ?? 0, gamepad.axes[3] ?? 0);
    return buttonsNeutral &&
      leftMagnitude <= this.calibration.neutralCancelThreshold &&
      rightMagnitude <= this.calibration.neutralCancelThreshold;
  }

  private processStick(
    gamepad: GamepadSnapshot,
    family: ReturnType<typeof detectControllerFamily>,
    stick: 'left' | 'right',
    axisOffset: number,
    now: number,
    events: ControllerInputEvent[],
  ) {
    const normalized = normalizeStick(
      gamepad.axes[axisOffset] ?? 0,
      gamepad.axes[axisOffset + 1] ?? 0,
      this.calibration,
    );
    const previous = this.stickStates[stick];
    const smoothing = Math.min(0.95, Math.max(0, this.calibration.smoothing));
    const next = previous.magnitude === 0 || normalized.magnitude === 0
      ? normalized
      : {
          x: previous.x * smoothing + normalized.x * (1 - smoothing),
          y: previous.y * smoothing + normalized.y * (1 - smoothing),
          magnitude: previous.magnitude * smoothing + normalized.magnitude * (1 - smoothing),
        };
    const changed = Math.abs(next.x - previous.x) > 0.005 || Math.abs(next.y - previous.y) > 0.005;
    this.stickStates[stick] = next;
    if (next.magnitude === 0) {
      this.nextStickRepeatAt[stick] = 0;
    }
    const shouldRepeat = next.magnitude > 0 && now >= this.nextStickRepeatAt[stick];
    if (!changed && !shouldRepeat) return;
    this.nextStickRepeatAt[stick] = next.magnitude > 0
      ? now + this.repeatTiming.repeatIntervalMs
      : 0;

    events.push({
      type: 'axis-change',
      controllerIndex: gamepad.index,
      family,
      stick,
      ...next,
    });
  }
}
