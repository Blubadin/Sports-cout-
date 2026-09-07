/**
 * useAITracking.ts — React Hook for SportsScout Badminton AI Tracking
 */

import { useState, useEffect, useCallback } from "react";
import {
  aiTrackingService,
  AIConnectionStatus,
  BadmintonGameType,
  MarkingState,
} from "../services/aiTrackingService";
import { AITelemetryFrame, AITrackingPlayer } from "../types";
import { useScoutContext } from "../context/ScoutContext";

export function useAITracking() {
  const { settings, setSettings } = useScoutContext();
  const [status, setStatus] = useState<AIConnectionStatus>(aiTrackingService.getStatus());
  const [latestFrame, setLatestFrame] = useState<AITelemetryFrame | null>(aiTrackingService.getLatestFrame());
  const [gameType, setGameTypeState] = useState<BadmintonGameType>(
    (settings?.badmintonGameType as BadmintonGameType) || aiTrackingService.getGameType()
  );
  const [markingState, setMarkingState] = useState<MarkingState>(aiTrackingService.getMarkingState());

  const serverUrl = settings?.aiTrackingServerUrl || "ws://localhost:8000/ws/telemetry";
  const isEnabled = settings?.aiTrackingEnabled ?? false;
  const mode = settings?.aiTrackingMode || "browser";

  useEffect(() => {
    aiTrackingService.setMode(mode);
  }, [mode]);

  useEffect(() => {
    if (settings?.badmintonGameType && settings.badmintonGameType !== aiTrackingService.getGameType()) {
      aiTrackingService.setGameType(settings.badmintonGameType);
      setGameTypeState(settings.badmintonGameType);
    }
  }, [settings?.badmintonGameType]);

  useEffect(() => {
    const unsubStatus = aiTrackingService.onStatus((newStatus) => {
      setStatus(newStatus);
    });

    const unsubTelemetry = aiTrackingService.onTelemetry((frame) => {
      setLatestFrame(frame);
      if (frame.game_type && frame.game_type !== gameType) {
        setGameTypeState(frame.game_type);
      }
    });

    const unsubMarking = aiTrackingService.onMarking((state) => {
      setMarkingState(state);
      // If marking completes and service connects, make sure settings reflects it
      if (!state.isMarking && aiTrackingService.getStatus() === "connected") {
        setSettings((s) => ({ ...s, aiTrackingEnabled: true }));
      }
    });

    return () => {
      unsubStatus();
      unsubTelemetry();
      unsubMarking();
    };
  }, [gameType, setSettings]);

  // Auto-connect if enabled in settings
  useEffect(() => {
    if (isEnabled && status === "disconnected") {
      aiTrackingService.setMode(mode);
      aiTrackingService.setGameType(settings?.badmintonGameType || "doubles");
      aiTrackingService.connect(serverUrl);
    } else if (!isEnabled && status === "connected") {
      aiTrackingService.disconnect();
    }
  }, [isEnabled, mode, serverUrl, settings?.badmintonGameType]);

  const toggleConnect = useCallback(() => {
    if (status === "connected" || status === "connecting") {
      aiTrackingService.disconnect();
      setSettings((s) => ({ ...s, aiTrackingEnabled: false }));
    } else {
      aiTrackingService.setMode(settings?.aiTrackingMode || "browser");
      aiTrackingService.setGameType(settings?.badmintonGameType || "doubles");
      aiTrackingService.connect(serverUrl);
      setSettings((s) => ({ ...s, aiTrackingEnabled: true }));
    }
  }, [status, serverUrl, settings?.aiTrackingMode, settings?.badmintonGameType, setSettings]);

  const setGameType = useCallback(
    (gt: BadmintonGameType) => {
      aiTrackingService.setGameType(gt);
      setGameTypeState(gt);
      setSettings((s) => ({ ...s, badmintonGameType: gt }));
    },
    [setSettings]
  );

  const toggleGameType = useCallback(() => {
    const nextGt: BadmintonGameType = gameType === "singles" ? "doubles" : "singles";
    setGameType(nextGt);
  }, [gameType, setGameType]);

  const [isBackendAvailable, setIsBackendAvailable] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const ok = await aiTrackingService.checkBackendHealth();
      if (active) setIsBackendAvailable(ok);
    };
    check();
    const interval = setInterval(check, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const setEngineMode = useCallback(
    (newMode: "browser" | "server") => {
      aiTrackingService.setMode(newMode);
      setSettings((s) => ({ ...s, aiTrackingMode: newMode }));
    },
    [setSettings]
  );

  const setPlayerAnchorOffset = useCallback((id: number, delta: { x: number; y: number }) => {
    aiTrackingService.setPlayerAnchorOffset(id, delta);
  }, []);

  const resetAnchors = useCallback(() => {
    aiTrackingService.resetAnchors();
  }, []);

  const syncWithVideo = useCallback((currentTime: number, isPlaying: boolean) => {
    aiTrackingService.syncWithVideo(currentTime, isPlaying);
  }, []);

  const swapPlayers = useCallback((pidA: number, pidB: number) => {
    aiTrackingService.swapPlayers(pidA, pidB);
  }, []);

  const startStreaming = useCallback((source: string = "demo") => {
    aiTrackingService.startStreaming(source);
  }, []);

  const stopStreaming = useCallback(() => {
    aiTrackingService.stopStreaming();
  }, []);

  const startMarkingMode = useCallback(() => {
    aiTrackingService.startMarkingMode();
  }, []);

  const cancelMarkingMode = useCallback(() => {
    aiTrackingService.cancelMarkingMode();
  }, []);

  const markPlayerAtScreen = useCallback((screenX: number, screenY: number) => {
    aiTrackingService.markPlayerAtScreen(screenX, screenY);
  }, []);

  const setPlayerDirectPosition = useCallback((id: number, screenX: number, screenY: number) => {
    aiTrackingService.setPlayerDirectPosition(id, screenX, screenY);
  }, []);

  return {
    status,
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    gameType,
    setGameType,
    toggleGameType,
    mode,
    setEngineMode,
    isBackendAvailable,
    setPlayerAnchorOffset,
    resetAnchors,
    syncWithVideo,
    players: (latestFrame?.players || []) as AITrackingPlayer[],
    latestFrame,
    toggleConnect,
    connect: (url?: string) => aiTrackingService.connect(url || serverUrl),
    disconnect: () => aiTrackingService.disconnect(),
    swapPlayers,
    startStreaming,
    stopStreaming,
    // Click-to-Mark Player Workflow
    isMarkingMode: markingState.isMarking,
    markingStep: markingState.step,
    totalMarkingSteps: markingState.totalSteps,
    targetPlayerId: markingState.targetPlayerId,
    targetPlayerName: markingState.targetPlayerName,
    startMarkingMode,
    cancelMarkingMode,
    markPlayerAtScreen,
    setPlayerDirectPosition,
  };
}
