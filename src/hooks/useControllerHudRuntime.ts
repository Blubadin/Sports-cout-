import { useCallback, useRef, useState } from 'react';
import {
  resolveControllerHudIntent,
  type ControllerHudContext,
  type ControllerHudIntent,
} from '../controller/controllerHudBridge';
import { createControllerProfileRepository } from '../controller/controllerProfileRepository';
import { createDefaultControllerProfile } from '../controller/controllerProfiles';
import type { ControllerInputEvent, ControllerProfile } from '../controller/types';
import { useGamepadRuntime } from './useGamepadRuntime';

export function useControllerHudRuntime({
  enabled,
  getContext,
  onIntent,
}: {
  enabled: boolean;
  getContext: () => ControllerHudContext;
  onIntent: (intent: ControllerHudIntent, event: ControllerInputEvent) => void;
}) {
  const [profile, setProfile] = useState<ControllerProfile | null>(null);
  const profileRef = useRef<ControllerProfile | null>(null);
  const contextRef = useRef(getContext);
  const intentRef = useRef(onIntent);
  const pendingEventsRef = useRef<ControllerInputEvent[]>([]);
  contextRef.current = getContext;
  intentRef.current = onIntent;

  const dispatchEvent = useCallback((event: ControllerInputEvent, activeProfile: ControllerProfile) => {
    const intent = resolveControllerHudIntent(event, activeProfile, contextRef.current());
    if (intent) intentRef.current(intent, event);
  }, []);

  const handleInputEvent = useCallback((event: ControllerInputEvent) => {
    if (event.type === 'connected') {
      pendingEventsRef.current = [];
      void createControllerProfileRepository().getActiveProfile(event.family).catch(() => (
        createDefaultControllerProfile(event.family)
      )).then((nextProfile) => {
        profileRef.current = nextProfile;
        setProfile(nextProfile);
        const pending = pendingEventsRef.current;
        pendingEventsRef.current = [];
        pending.forEach((pendingEvent) => dispatchEvent(pendingEvent, nextProfile));
      });
      return;
    }
    if (event.type === 'disconnected') {
      const activeProfile = profileRef.current;
      if (activeProfile) dispatchEvent(event, activeProfile);
      profileRef.current = null;
      setProfile(null);
      pendingEventsRef.current = [];
      return;
    }
    const activeProfile = profileRef.current;
    if (!activeProfile) {
      pendingEventsRef.current.push(event);
      return;
    }
    dispatchEvent(event, activeProfile);
  }, [dispatchEvent]);

  const status = useGamepadRuntime({ enabled, onInputEvent: handleInputEvent });
  return { status, profile };
}
