import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { aiTrackingService } from '../../services/aiTrackingService';
import { MAX_TRACKING_RESULTS_PAGE_SIZE } from '../../services/trackingSessionApi';
import { getTrackingTelemetryPage, type TrackingAnalysis } from '../../services/storage/trackingStorage';
import type { TrackingSessionStatus, TrackingTelemetryV1 } from '../../types';
import { isMetricCalibrationValid } from '../../types/calibration';
import { resolveOverlayAtTime } from './TrackingVideoOverlay';
import { projectCourtMarkings } from './courtMarkingOverlay';
import {
  framesForCameraSegmentAtTime,
  TrackingOverlayWindowLoader,
  trackingOverlayStatusText,
  trackingOverlayWindowContainsTime,
  type TrackingOverlayWindow,
} from './trackingOverlayWindow';
import { telemetryCoversTime } from './trackingLabStatus';

interface UseTrackingOverlayWindowParams {
  activeProjectId: string | null;
  sessionId: string | null;
  sessionStatus: TrackingSessionStatus | null;
  frames: TrackingTelemetryV1[];
  analysis: TrackingAnalysis | null;
  url: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  dimensions: { width: number; height: number };
  calibrating: boolean;
  th: boolean;
}

/** Manages playback-time overlay window fetching, segment scoping, and court markings. */
export function useTrackingOverlayWindow({
  activeProjectId,
  sessionId,
  sessionStatus,
  frames,
  analysis,
  url,
  videoRef,
  dimensions,
  calibrating,
  th,
}: UseTrackingOverlayWindowParams) {
  const [time, setTime] = useState(0);
  const [overlayWindow, setOverlayWindow] = useState<TrackingOverlayWindow | null>(null);
  const [overlayWindowStatus, setOverlayWindowStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle');

  const overlayWindowLoader = useRef(new TrackingOverlayWindowLoader());
  const overlayRequestId = useRef(0);
  const overlayRequest = useRef<{ projectId: string; sessionId: string; timeSec: number; coverageSec: number } | null>(null);
  const overlayOwner = useRef({ projectId: activeProjectId, sessionId });
  overlayOwner.current = { projectId: activeProjectId, sessionId };
  const overlayTime = useRef(time);
  overlayTime.current = time;
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;

  useEffect(() => {
    overlayRequestId.current += 1;
    overlayRequest.current = null;
    overlayWindowLoader.current.cancel();
    setOverlayWindow(null);
    setOverlayWindowStatus('idle');
  }, [activeProjectId, sessionId]);

  const resetOverlayWindow = useCallback(() => {
    setTime(0);
    setOverlayWindow(null);
    setOverlayWindowStatus('idle');
  }, []);

  const loadOverlayWindow = useCallback(async (targetTime: number, force = false) => {
    const projectId = activeProjectId;
    if (telemetryCoversTime(frames, targetTime)) {
      overlayRequestId.current += 1;
      overlayRequest.current = null;
      overlayWindowLoader.current.cancel();
      setOverlayWindowStatus('idle');
      return;
    }

    if (
      overlayWindow && overlayWindow.projectId === projectId && overlayWindow.sessionId === sessionId
      && trackingOverlayWindowContainsTime(overlayWindow, targetTime)
      && (framesForCameraSegmentAtTime(overlayWindow.frames, targetTime)[0]?.cameraSegmentId ?? null) === overlayWindow.cameraSegmentId
    ) return;

    if (!force && overlayRequest.current?.projectId === projectId && overlayRequest.current.sessionId === sessionId) {
      const activeRequest = overlayRequest.current;
      if (Math.abs(targetTime - activeRequest.timeSec) <= Math.max(2, activeRequest.coverageSec / 2)) return;
    }

    if (!projectId || !sessionId) {
      setOverlayWindow(null);
      setOverlayWindowStatus('unavailable');
      return;
    }

    const requestId = ++overlayRequestId.current;
    setOverlayWindow((prev) => (!prev || prev.sessionId !== sessionId || prev.projectId !== projectId ? null : prev));
    setOverlayWindowStatus('loading');
    overlayRequest.current = {
      projectId,
      sessionId,
      timeSec: targetTime,
      coverageSec: sessionStatus?.committedResultCursor && sessionStatus.videoDurationSec
        ? (MAX_TRACKING_RESULTS_PAGE_SIZE * sessionStatus.videoDurationSec) / sessionStatus.committedResultCursor
        : 5,
    };

    try {
      const result = await overlayWindowLoader.current.load(
        { projectId, sessionId, timeSec: targetTime, status: sessionStatus },
        (id, signal) => aiTrackingService.getSessionStatus(id, signal),
        (id, cursor, limit, signal) => aiTrackingService.getSessionResults(id, cursor, limit, signal),
        async (reqSessionId) => {
          try {
            const currentAnalysis = analysisRef.current;
            const analysisId = currentAnalysis?.id;
            if (analysisId && (analysisId === reqSessionId || currentAnalysis?.pipelineRunId === reqSessionId)) {
              const page = await getTrackingTelemetryPage(analysisId, 0);
              if (page?.frames && page.frames.length > 0) {
                return page.frames;
              }
            }
          } catch {
            // Ignore storage lookup error and fall through to backend
          }
          return null;
        },
      );
      if (
        requestId !== overlayRequestId.current
        || overlayOwner.current.projectId !== projectId
        || overlayOwner.current.sessionId !== sessionId
      ) return;
      if (result.status === 'stale') return;
      if (result.status === 'unavailable') {
        setOverlayWindow(null);
        setOverlayWindowStatus('unavailable');
        return;
      }

      const currentTime = overlayTime.current;
      const currentSegment = framesForCameraSegmentAtTime(result.window.frames, currentTime)[0]?.cameraSegmentId ?? null;
      if (currentSegment !== result.window.cameraSegmentId) {
        setOverlayWindow(null);
        setOverlayWindowStatus('loading');
        void loadOverlayWindow(currentTime, true);
        return;
      }

      setOverlayWindow(result.window);
      const scopedFrames = framesForCameraSegmentAtTime(result.window.frames, targetTime);
      const playerResolution = resolveOverlayAtTime(scopedFrames, targetTime);
      const firstTime = result.window.frames[0]?.timestampSec;
      const lastTime = result.window.frames[result.window.frames.length - 1]?.timestampSec;
      if (playerResolution.status !== 'resolved' || targetTime < (firstTime ?? Infinity) || targetTime > (lastTime ?? -Infinity)) {
        setOverlayWindowStatus('unavailable');
      } else {
        setOverlayWindowStatus('ready');
      }
    } catch {
      if (
        requestId === overlayRequestId.current
        && overlayOwner.current.projectId === projectId
        && overlayOwner.current.sessionId === sessionId
      ) {
        setOverlayWindow(null);
        setOverlayWindowStatus('error');
      }
    } finally {
      if (requestId === overlayRequestId.current) overlayRequest.current = null;
    }
  }, [activeProjectId, frames, overlayWindow, sessionId, sessionStatus]);

  const overlayLoadCallback = useRef(loadOverlayWindow);
  overlayLoadCallback.current = loadOverlayWindow;

  // Follow decoded video presentation time for fast shuttle motion.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.requestVideoFrameCallback) return;
    let callbackId = 0;
    const tick: VideoFrameRequestCallback = (_now, metadata) => {
      setTime(metadata.mediaTime);
      void overlayLoadCallback.current(metadata.mediaTime);
      callbackId = video.requestVideoFrameCallback(tick);
    };
    callbackId = video.requestVideoFrameCallback(tick);
    return () => video.cancelVideoFrameCallback(callbackId);
  }, [url, videoRef]);

  const activeRemoteWindow = overlayWindow && overlayWindow.projectId === activeProjectId
    && overlayWindow.sessionId === sessionId && trackingOverlayWindowContainsTime(overlayWindow, time)
    && (framesForCameraSegmentAtTime(overlayWindow.frames, time)[0]?.cameraSegmentId ?? null) === overlayWindow.cameraSegmentId
    ? overlayWindow : null;
  const hasLiveOverlayWindow = telemetryCoversTime(frames, time);
  const sourceOverlayFrames = hasLiveOverlayWindow
    ? frames
    : activeRemoteWindow?.frames ?? [];
  const displayFrames = framesForCameraSegmentAtTime(sourceOverlayFrames, time);
  const overlayFrame = [...displayFrames].reverse().find((frame) => frame.timestampSec <= time) ?? null;
  const displayResolutionStatus = displayFrames.length ? resolveOverlayAtTime(displayFrames, time).status : 'unavailable';
  const acceptedCourtCorners = overlayFrame?.calibration?.corners;
  const courtOverlayCorners = displayResolutionStatus === 'resolved' && overlayFrame?.calibrationState === 'CALIBRATED' &&
    isMetricCalibrationValid(overlayFrame) && dimensions.width > 0 && dimensions.height > 0 &&
    Array.isArray(acceptedCourtCorners) && acceptedCourtCorners.length === 4 && acceptedCourtCorners.every((point) =>
      Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && point[0] >= 0 && point[0] < dimensions.width &&
      point[1] >= 0 && point[1] < dimensions.height)
    ? acceptedCourtCorners : null;
  const courtOverlayLines = courtOverlayCorners
    ? projectCourtMarkings(overlayFrame?.calibration?.hInvMatrix, dimensions.width, dimensions.height)
    : [];
  const playbackSegmentId = overlayFrame?.cameraSegmentId ?? displayFrames[0]?.cameraSegmentId;
  const upcomingCourtFrame = displayFrames.find((frame) => frame.timestampSec > time + 0.05 &&
    frame.cameraSegmentId === playbackSegmentId && isMetricCalibrationValid(frame) &&
    frame.calibrationState === 'CALIBRATED' && Array.isArray(frame.calibration?.corners));
  const statusCalibration = sessionStatus?.calibration;
  const firstCourtTime = upcomingCourtFrame?.timestampSec ??
    (statusCalibration?.state === 'CALIBRATED' && statusCalibration.cameraSegmentId === playbackSegmentId
      ? statusCalibration.createdAtTimestampSec : null);
  const courtStartsLater = !calibrating && !courtOverlayCorners &&
    firstCourtTime != null && Number.isFinite(firstCourtTime) && time + 0.05 < firstCourtTime;
  const overlayStatusKey = hasLiveOverlayWindow
    ? 'idle'
    : overlayWindowStatus === 'loading' || overlayWindowStatus === 'error'
      ? overlayWindowStatus
      : displayResolutionStatus === 'resolved' ? 'idle' : 'unavailable';
  const overlayStatus = trackingOverlayStatusText(overlayStatusKey, th);

  return {
    time,
    setTime,
    loadOverlayWindow,
    resetOverlayWindow,
    displayFrames,
    overlayFrame,
    overlayWindowStatus,
    overlayStatus,
    courtOverlayCorners,
    courtOverlayLines,
    courtStartsLater,
    firstCourtTime,
  };
}
