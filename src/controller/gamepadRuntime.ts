import { ControllerInputProcessor } from './controllerInputProcessor';
import { detectControllerFamily } from './controllerMapping';
import type {
  ActiveController,
  ControllerCalibration,
  ControllerInputEvent,
  GamepadSnapshot,
} from './types';

export type GamepadRuntimeEnvironment = {
  getGamepads: () => readonly (GamepadSnapshot | null)[];
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frameId: number) => void;
  isVisible: () => boolean;
};

export type GamepadRuntimeOptions = {
  getCalibration: (family: ActiveController['family']) => ControllerCalibration;
  onEvent: (event: ControllerInputEvent) => void;
};

export class GamepadRuntimeAdapter {
  private running = false;
  private frameId: number | null = null;
  private active: ActiveController | null = null;
  private activeSnapshot: GamepadSnapshot | null = null;
  private processor: ControllerInputProcessor | null = null;
  private requireNeutral = false;

  constructor(
    private readonly environment: GamepadRuntimeEnvironment,
    private readonly options: GamepadRuntimeOptions,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.scheduleFrame();
  }

  stop(reason: 'disabled' | 'stopped' = 'stopped') {
    this.running = false;
    this.cancelScheduledFrame();
    this.cancelInput(reason);
    this.clearActiveController(false);
  }

  handleBlur() {
    this.cancelInput('blur');
    this.requireNeutral = true;
  }

  handleVisibilityChange() {
    if (!this.environment.isVisible()) {
      this.cancelScheduledFrame();
      this.cancelInput('hidden');
      this.requireNeutral = true;
      return;
    }
    this.scheduleFrame();
  }

  getActiveController(): ActiveController | null {
    return this.active ? { ...this.active } : null;
  }

  private readonly frameLoop = (time: number) => {
    this.frameId = null;
    if (!this.running || !this.environment.isVisible()) return;
    this.poll(time);
    this.scheduleFrame();
  };

  private poll(time: number) {
    const available = this.environment.getGamepads()
      .filter((gamepad): gamepad is GamepadSnapshot => Boolean(gamepad?.connected))
      .sort((a, b) => a.index - b.index);
    let snapshot = this.active
      ? available.find((gamepad) => gamepad.index === this.active!.index) ?? null
      : null;

    if (this.active && !snapshot) {
      this.cancelInput('disconnect');
      this.emitConnectionEvent('disconnected');
      this.clearActiveController(true);
    }

    if (!this.active) {
      snapshot = available[0] ?? null;
      if (!snapshot) return;
      const family = detectControllerFamily(snapshot.id, snapshot.mapping);
      this.active = {
        index: snapshot.index,
        family,
        mapping: snapshot.mapping === 'standard' ? 'standard' : 'generic',
      };
      this.activeSnapshot = snapshot;
      this.processor = new ControllerInputProcessor(this.options.getCalibration(family));
      this.emitConnectionEvent('connected');
    }

    if (!snapshot || !this.processor) return;
    this.activeSnapshot = snapshot;
    if (this.requireNeutral) {
      if (!this.processor.isNeutral(snapshot)) return;
      this.processor.reset();
      this.requireNeutral = false;
      return;
    }

    this.processor.process(snapshot, time).forEach(this.options.onEvent);
  }

  private scheduleFrame() {
    if (!this.running || !this.environment.isVisible() || this.frameId !== null) return;
    this.frameId = this.environment.requestFrame(this.frameLoop);
  }

  private cancelScheduledFrame() {
    if (this.frameId === null) return;
    this.environment.cancelFrame(this.frameId);
    this.frameId = null;
  }

  private cancelInput(
    reason: Extract<ControllerInputEvent, { type: 'cancelled' }>['reason'],
  ) {
    if (!this.processor || !this.activeSnapshot) return;
    this.processor.cancel(this.activeSnapshot, reason).forEach(this.options.onEvent);
  }

  private emitConnectionEvent(type: 'connected' | 'disconnected') {
    if (!this.active) return;
    this.options.onEvent({
      type,
      controllerIndex: this.active.index,
      family: this.active.family,
      mapping: this.active.mapping,
    });
  }

  private clearActiveController(requireNeutral: boolean) {
    this.active = null;
    this.activeSnapshot = null;
    this.processor = null;
    this.requireNeutral = requireNeutral;
  }
}

export function snapshotBrowserGamepad(gamepad: Gamepad): GamepadSnapshot {
  return {
    index: gamepad.index,
    connected: gamepad.connected,
    id: gamepad.id,
    mapping: gamepad.mapping,
    buttons: gamepad.buttons.map((button) => ({ pressed: button.pressed, value: button.value })),
    axes: [...gamepad.axes],
    timestamp: gamepad.timestamp,
  };
}

export async function pulseBrowserGamepad(
  controllerIndex: number,
  durationMs = 30,
): Promise<boolean> {
  if (typeof navigator.getGamepads !== 'function') return false;
  const gamepad = navigator.getGamepads()[controllerIndex] as (Gamepad & {
    vibrationActuator?: {
      playEffect?: (
        effect: string,
        params: { duration: number; strongMagnitude: number; weakMagnitude: number },
      ) => Promise<unknown>;
    };
  }) | null;
  const playEffect = gamepad?.vibrationActuator?.playEffect;
  if (!playEffect) return false;
  try {
    await playEffect.call(gamepad.vibrationActuator, 'dual-rumble', {
      duration: Math.max(10, Math.min(250, durationMs)),
      strongMagnitude: 0.25,
      weakMagnitude: 0.35,
    });
    return true;
  } catch {
    return false;
  }
}
