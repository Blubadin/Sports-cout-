import { useEffect, useState } from 'react';
import { aiTrackingService } from '../../services/aiTrackingService';
import type { BackendCapabilities } from '../../services/trackingSessionApi';
import { AIConnectionError, type AIConnectionSnapshot } from '../../services/aiConnection';
import type { ProjectTrackingState, trackingSessionStore } from '../../services/trackingSessionStore';

interface UseTrackingBackendConnectionParams {
  activeProjectId: string | null;
  th: boolean;
  store: typeof trackingSessionStore;
  update: (updater: Partial<ProjectTrackingState> | ((prev: ProjectTrackingState) => Partial<ProjectTrackingState>)) => void;
}

/** Polls the local AI service connection and hardware/shuttle capabilities. */
export function useTrackingBackendConnection({
  activeProjectId,
  th,
  store,
  update,
}: UseTrackingBackendConnectionParams) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [connection, setConnection] = useState<AIConnectionSnapshot | null>(null);
  const [inferenceDevice, setInferenceDevice] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const service = aiTrackingService as typeof aiTrackingService & {
        checkConnection?: () => Promise<AIConnectionSnapshot>;
      };
      let snapshot: AIConnectionSnapshot;
      if (service.checkConnection) {
        snapshot = await service.checkConnection();
      } else {
        const connected = await aiTrackingService.checkBackendHealth();
        snapshot = { code: connected ? 'CONNECTED' : 'AI_OFFLINE', connected, endpoint: null };
      }
      if (!alive) return;
      setConnection(snapshot);
      setOnline(snapshot.connected);
      if (snapshot.connected) {
        const previousError = store.getProjectState(activeProjectId)?.error;
        if (previousError === new AIConnectionError('NETWORK_ERROR').message) {
          update({
            error: th
              ? 'เชื่อมต่อ Local AI ได้แล้ว แต่คำขอก่อนหน้าล้มเหลว กดเริ่มวิเคราะห์อีกครั้งได้'
              : 'Local AI is reachable, but the previous request failed. Retry the analysis.',
          });
        }
        try {
          const caps = await aiTrackingService.getCapabilities();
          if (alive) {
            setCapabilities(caps);
            setInferenceDevice(caps.selectedDevice);
          }
        } catch {
          if (alive) {
            setInferenceDevice(null);
            setCapabilities(null);
          }
        }
      } else {
        setInferenceDevice(null);
        setCapabilities(null);
      }
    };
    void check();
    const interval = setInterval(check, 10000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [activeProjectId, store, th, update]);

  return {
    online,
    connection,
    capabilities,
    inferenceDevice,
  };
}
