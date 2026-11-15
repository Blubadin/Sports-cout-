import { useCallback, useState, type RefObject } from 'react';
import { aiTrackingService, type BadmintonGameType } from '../../services/aiTrackingService';
import type { ProjectTrackingState } from '../../services/trackingSessionStore';
import type { TrackingTelemetryV1 } from '../../types';

interface UseTrackingCourtRecoveryParams {
  sessionId: string | null;
  status: ProjectTrackingState['status'];
  frames: TrackingTelemetryV1[];
  corners: number[][];
  gameType: BadmintonGameType;
  videoRef: RefObject<HTMLVideoElement | null>;
  update: (updater: Partial<ProjectTrackingState> | ((prev: ProjectTrackingState) => Partial<ProjectTrackingState>)) => void;
}

/** Manages manual 4-corner court selection and camera-cut recalibration recovery state. */
export function useTrackingCourtRecovery({
  sessionId,
  status,
  frames,
  corners,
  gameType,
  videoRef,
  update,
}: UseTrackingCourtRecoveryParams) {
  const [calibrating, setCalibrating] = useState(false);
  const [recoverySelectionKey, setRecoverySelectionKey] = useState<string | null>(null);
  const [recoverySelectionFrame, setRecoverySelectionFrame] = useState<{ frameIndex: number; timestampSec: number } | null>(null);
  const [recoveryViewReady, setRecoveryViewReady] = useState(false);
  const [recoveredKey, setRecoveredKey] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const latestFrame = frames.length ? frames[frames.length - 1] : null;
  const latestLostSegmentId = status === 'PROCESSING' &&
    (latestFrame?.calibrationState === 'CALIBRATION_LOST' || latestFrame?.calibrationState === 'RECALIBRATING')
    ? latestFrame.cameraSegmentId ?? null : null;
  const latestLostKey = sessionId && latestLostSegmentId
    ? `${sessionId}:${latestLostSegmentId}` : null;
  const lostSegmentId = latestLostKey !== recoveredKey ? latestLostSegmentId : null;
  const lostSegmentKey = lostSegmentId && sessionId ? `${sessionId}:${lostSegmentId}` : null;

  const resetRecovery = useCallback(() => {
    setCalibrating(false);
    setRecoverySelectionKey(null);
    setRecoverySelectionFrame(null);
    setRecoveryViewReady(false);
    setRecoveredKey(null);
    setRecoveryError(null);
  }, []);

  const applyManualRecovery = useCallback(async () => {
    if (!sessionId || !lostSegmentId || recoverySelectionKey !== lostSegmentKey ||
        !recoverySelectionFrame || !recoveryViewReady || corners.length !== 4 || recoveryPending) return;
    const viewedTime = videoRef.current?.currentTime;
    if (viewedTime === undefined || !Number.isFinite(viewedTime) ||
        Math.abs(viewedTime - recoverySelectionFrame.timestampSec) > 0.05) {
      setRecoveryError('Video view changed. Select four corners on the current segment frame again.');
      return;
    }
    setRecoveryPending(true);
    setRecoveryError(null);
    try {
      await aiTrackingService.calibrateSession(sessionId, corners, gameType, lostSegmentId, recoverySelectionFrame);
      setRecoveredKey(lostSegmentKey);
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Manual calibration failed');
    } finally {
      setRecoveryPending(false);
    }
  }, [
    corners,
    gameType,
    lostSegmentId,
    lostSegmentKey,
    recoveryPending,
    recoverySelectionFrame,
    recoverySelectionKey,
    recoveryViewReady,
    sessionId,
    videoRef,
  ]);

  const startCornerSelection = useCallback(() => {
    videoRef.current?.pause();
    if (lostSegmentId && latestFrame && videoRef.current) {
      videoRef.current.currentTime = latestFrame.timestampSec;
    }
    update({ corners: [] });
    setRecoverySelectionKey(lostSegmentKey);
    setRecoveryViewReady(false);
    setRecoverySelectionFrame(lostSegmentId && latestFrame ? {
      frameIndex: latestFrame.frameIndex,
      timestampSec: latestFrame.timestampSec,
    } : null);
    setRecoveryError(null);
    setCalibrating(true);
  }, [latestFrame, lostSegmentId, lostSegmentKey, update, videoRef]);

  const applySuggestedRecoveryCorners = useCallback((suggested: number[][]) => {
    videoRef.current?.pause();
    if (!latestFrame || !videoRef.current) return;
    videoRef.current.currentTime = latestFrame.timestampSec;
    setRecoverySelectionFrame({ frameIndex: latestFrame.frameIndex, timestampSec: latestFrame.timestampSec });
    setRecoveryViewReady(false);
    update({ corners: suggested });
    setRecoverySelectionKey(lostSegmentKey);
  }, [latestFrame, lostSegmentKey, update, videoRef]);

  const syncRecoveryViewOnSeek = useCallback((currentTime: number) => {
    setRecoveryViewReady(Boolean(recoverySelectionFrame &&
      Math.abs(currentTime - recoverySelectionFrame.timestampSec) <= 0.05));
  }, [recoverySelectionFrame]);

  return {
    calibrating,
    setCalibrating,
    latestFrame,
    lostSegmentId,
    lostSegmentKey,
    recoverySelectionKey,
    recoverySelectionFrame,
    recoveryViewReady,
    recoveryPending,
    recoveryError,
    resetRecovery,
    applyManualRecovery,
    startCornerSelection,
    applySuggestedRecoveryCorners,
    syncRecoveryViewOnSeek,
  };
}
