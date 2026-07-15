import { useEffect, useRef, useState } from 'react';
import { createControllerProfileRepository } from '../controller/controllerProfileRepository';
import { DEFAULT_CONTROLLER_CALIBRATION } from '../controller/controllerProfiles';
import {
  GamepadRuntimeAdapter,
  snapshotBrowserGamepad,
  type GamepadRuntimeEnvironment,
} from '../controller/gamepadRuntime';
import type {
  ActiveController,
  ControllerCalibration,
  ControllerDeviceFamily,
  ControllerInputEvent,
} from '../controller/types';

export type GamepadRuntimeStatus =
  | { state: 'disabled' | 'unsupported' | 'waiting' }
  | { state: 'connected'; controller: ActiveController };

export function useGamepadRuntime({
  enabled,
  onInputEvent,
  calibrationByFamily,
}: {
  enabled: boolean;
  onInputEvent?: (event: ControllerInputEvent) => void;
  calibrationByFamily?: Partial<Record<ControllerDeviceFamily, ControllerCalibration>>;
}): GamepadRuntimeStatus {
  const eventHandlerRef = useRef(onInputEvent);
  eventHandlerRef.current = onInputEvent;
  const [status, setStatus] = useState<GamepadRuntimeStatus>(
    enabled ? { state: 'waiting' } : { state: 'disabled' },
  );
  const calibrationSignature = JSON.stringify(calibrationByFamily ?? {});

  useEffect(() => {
    if (!enabled) {
      setStatus({ state: 'disabled' });
      return;
    }
    if (typeof navigator.getGamepads !== 'function') {
      setStatus({ state: 'unsupported' });
      return;
    }

    let disposed = false;
    let runtime: GamepadRuntimeAdapter | null = null;
    let removeListeners = () => {};
    setStatus({ state: 'waiting' });

    const initialize = async () => {
      const repository = createControllerProfileRepository();
      const profileState = await repository.load();
      if (disposed) return;
      const storedCalibrationByFamily = Object.fromEntries(
        (['ps4', 'ps5', 'xbox', 'generic'] as ControllerDeviceFamily[]).map((family) => {
          const activeId = profileState.activeProfileByFamily[family];
          const profile = profileState.profiles.find((item) => item.id === activeId);
          return [family, profile?.calibration ?? DEFAULT_CONTROLLER_CALIBRATION];
        }),
      ) as Record<ControllerDeviceFamily, ControllerCalibration>;
      const runtimeCalibrationByFamily = {
        ...storedCalibrationByFamily,
        ...calibrationByFamily,
      };

      const environment: GamepadRuntimeEnvironment = {
        getGamepads: () => Array.from(navigator.getGamepads(), (gamepad) =>
          gamepad ? snapshotBrowserGamepad(gamepad) : null,
        ),
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
        isVisible: () => document.visibilityState === 'visible',
      };
      runtime = new GamepadRuntimeAdapter(environment, {
        getCalibration: (family) => runtimeCalibrationByFamily[family],
        onEvent: (event) => {
          if (event.type === 'connected') {
            setStatus({
              state: 'connected',
              controller: {
                index: event.controllerIndex,
                family: event.family,
                mapping: event.mapping,
              },
            });
          } else if (event.type === 'disconnected') {
            setStatus({ state: 'waiting' });
          }
          eventHandlerRef.current?.(event);
        },
      });

      const handleVisibility = () => runtime?.handleVisibilityChange();
      const handleBlur = () => runtime?.handleBlur();
      const handleConnectionChange = () => runtime?.handleVisibilityChange();
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('blur', handleBlur);
      window.addEventListener('gamepadconnected', handleConnectionChange);
      window.addEventListener('gamepaddisconnected', handleConnectionChange);
      removeListeners = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('gamepadconnected', handleConnectionChange);
        window.removeEventListener('gamepaddisconnected', handleConnectionChange);
      };
      runtime.start();
    };

    void initialize().catch(() => {
      if (!disposed) setStatus({ state: 'unsupported' });
    });
    return () => {
      disposed = true;
      removeListeners();
      runtime?.stop('disabled');
    };
  }, [enabled, calibrationSignature]);

  return status;
}
