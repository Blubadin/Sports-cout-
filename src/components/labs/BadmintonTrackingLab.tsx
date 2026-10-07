import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { aiTrackingService, type BadmintonGameType } from '../../services/aiTrackingService';
import { isCompatibleResumableTrackingSession, MAX_TRACKING_RESULTS_PAGE_SIZE, type BackendCapabilities } from '../../services/trackingSessionApi';
import { AIConnectionError, type AIConnectionSnapshot } from '../../services/aiConnection';
import type {
  TrackingTelemetryV1,
  TrackingOverlayMode,
  TrackingSessionStatus,
  ProcessingConfig,
  ProcessingProfile,
  ShuttleProvenance,
  ShuttleTrackingStatus,
} from '../../types';
import { loadProjectVideoFileHandle } from '../../utils/videoFileStore';
import { isMetricCalibrationValid } from '../../types/calibration';
import {
  getLatestTrackingAnalysisForProject,
  getTrackingSampleChunkPage,
} from '../../services/storage/trackingStorage';
import BadmintonMovementDashboard from '../analytics/BadmintonMovementDashboard';
import TrackingVideoOverlay, { resolveOverlayAtTime } from './TrackingVideoOverlay';
import { projectCourtMarkings } from './courtMarkingOverlay';
import { ShuttleOverlay, ShuttleControls, ShuttleDiagnostics, type ShuttleMode } from './ShuttleOverlay';
import {
  framesForCameraSegmentAtTime,
  TrackingOverlayWindowLoader,
  trackingOverlayStatusText,
  trackingOverlayWindowContainsTime,
  type TrackingOverlayWindow,
} from './trackingOverlayWindow';
import TrackingLabInspector from './TrackingLabInspector';
import {
  useProjectTrackingSession,
  computeVideoFingerprint,
} from '../../services/trackingSessionStore';
import ExportConfigModal from './ExportConfigModal';

function formatDiagnosticCount(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return String(val);
}

function telemetryCoversTime(items: TrackingTelemetryV1[], target: number): boolean {
  return items.length > 0 && target >= items[0].timestampSec && target <= items[items.length - 1].timestampSec;
}

export function deriveShuttleEngineStatus(params: {
  enabled: boolean;
  sessionProvenance?: ShuttleProvenance | null;
  backendCapability?: BackendCapabilities['shuttle'] | null;
  isProcessing?: boolean;
}): {
  status: ShuttleTrackingStatus;
  displayText: string;
  detailText: string;
  badgeClass: string;
} {
  const { enabled, sessionProvenance, backendCapability, isProcessing } = params;

  if (!enabled) {
    return {
      status: 'DISABLED',
      displayText: 'Disabled',
      detailText: 'Tracking disabled',
      badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
    };
  }

  // 1. Live session provenance
  if (sessionProvenance) {
    if (sessionProvenance.status === 'MODEL_UNAVAILABLE') {
      const hasModel = Boolean(sessionProvenance.model || sessionProvenance.configuredModel);
      return {
        status: 'MODEL_UNAVAILABLE',
        displayText: 'Model unavailable',
        detailText: hasModel ? 'Model failed to load' : 'No model configured',
        badgeClass: 'bg-amber-950/60 text-amber-300 border border-amber-800',
      };
    }
    if (sessionProvenance.status === 'RUNTIME_UNAVAILABLE') {
      return {
        status: 'RUNTIME_UNAVAILABLE',
        displayText: 'Runtime unavailable',
        detailText: 'Runtime unavailable',
        badgeClass: 'bg-rose-950/60 text-rose-300 border border-rose-800',
      };
    }
    if (sessionProvenance.status === 'INITIALIZATION_ERROR') {
      return {
        status: 'INITIALIZATION_ERROR',
        displayText: 'Initialization error',
        detailText: 'Model failed to load',
        badgeClass: 'bg-rose-950/60 text-rose-300 border border-rose-800',
      };
    }
    if (sessionProvenance.status === 'DISABLED') {
      return {
        status: 'DISABLED',
        displayText: 'Disabled',
        detailText: 'Tracking disabled',
        badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
      };
    }
    if (sessionProvenance.status === 'AVAILABLE') {
      const active = Boolean(sessionProvenance.active || isProcessing);
      const calls = sessionProvenance.inferenceCalls ?? 0;
      const observed = sessionProvenance.observedCount ?? 0;
      let detailText = 'Model ready';
      if (active) {
        if (calls > 0 && observed === 0) {
          detailText = 'Model active but no shuttle candidates';
        } else if (observed > 0) {
          detailText = 'Model active and shuttle observed';
        } else {
          detailText = 'Model active';
        }
      }
      return {
        status: 'AVAILABLE',
        displayText: active ? 'Active' : 'Ready',
        detailText,
        badgeClass: active
          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
          : 'bg-sky-950/60 text-sky-300 border border-sky-800',
      };
    }
    return {
      status: sessionProvenance.status,
      displayText: sessionProvenance.status,
      detailText: sessionProvenance.status,
      badgeClass: 'bg-slate-800 text-slate-300 border border-slate-700',
    };
  }

  // 2. Pre-session backend capability probe
  if (backendCapability) {
    const probe = backendCapability.probeStatus || backendCapability.status;
    const hasModel = Boolean(backendCapability.configuredModel || backendCapability.model);
    if (probe === 'MODEL_UNAVAILABLE' || backendCapability.modelAvailable === false) {
      return {
        status: 'MODEL_UNAVAILABLE',
        displayText: 'Model unavailable',
        detailText: hasModel ? 'Model failed to load' : 'No model configured',
        badgeClass: 'bg-amber-950/60 text-amber-300 border border-amber-800',
      };
    }
    if (probe === 'RUNTIME_UNAVAILABLE') {
      return {
        status: 'RUNTIME_UNAVAILABLE',
        displayText: 'Runtime unavailable',
        detailText: 'Runtime unavailable',
        badgeClass: 'bg-rose-950/60 text-rose-300 border border-rose-800',
      };
    }
    if (probe === 'INITIALIZATION_ERROR') {
      return {
        status: 'INITIALIZATION_ERROR',
        displayText: 'Initialization error',
        detailText: 'Model failed to load',
        badgeClass: 'bg-rose-950/60 text-rose-300 border border-rose-800',
      };
    }
    if (probe === 'AVAILABLE' || backendCapability.modelAvailable === true) {
      return {
        status: 'AVAILABLE',
        displayText: 'Ready',
        detailText: 'Model ready',
        badgeClass: 'bg-sky-950/60 text-sky-300 border border-sky-800',
      };
    }
  }

  return {
    status: 'REQUESTED',
    displayText: 'Requested',
    detailText: 'Tracking requested',
    badgeClass: 'bg-indigo-950/60 text-indigo-300 border border-indigo-800',
  };
}

function connectionStatusText(connection: AIConnectionSnapshot | null, th: boolean): string {
  if (connection === null) return th ? 'กำลังตรวจสอบบริการ AI…' : 'Checking local AI service…';
  const english: Record<AIConnectionSnapshot['code'], string> = {
    CONNECTED: 'Local AI Connected',
    AI_OFFLINE: 'Local AI service offline',
    AUTH_REQUIRED: 'Local AI Authentication required',
    AUTH_FAILED: 'Local AI Authentication failed',
    ENDPOINT_NOT_CONFIGURED: 'Remote AI endpoint not configured',
    MIXED_CONTENT: 'Local AI Blocked by browser security',
    NETWORK_ERROR: 'Local AI network error',
    BROWSER_SECURITY_BLOCKED: 'Local AI Blocked by browser security',
    CSP_BLOCKED: 'Local AI Blocked by browser security',
    AI_BUSY: 'Another Local AI analysis is running',
    AI_SESSION_CONFLICT: 'Local AI tracking session conflict',
    AI_SERVER_ERROR: 'Local AI service error',
    AI_REQUEST_REJECTED: 'Local AI rejected the request',
  };
  if (!th) return english[connection.code];
  const thai: Record<AIConnectionSnapshot['code'], string> = {
    CONNECTED: 'เชื่อมต่อ Local AI แล้ว',
    AI_OFFLINE: 'บริการ Local AI ยังไม่ทำงาน',
    AUTH_REQUIRED: 'Local AI ต้องยืนยันตัวตน',
    AUTH_FAILED: 'Local AI ยืนยันตัวตนไม่สำเร็จ',
    ENDPOINT_NOT_CONFIGURED: 'ยังไม่ได้ตั้งค่า Remote AI endpoint',
    MIXED_CONTENT: 'Local AI ถูกบล็อกโดยความปลอดภัยของเบราว์เซอร์',
    NETWORK_ERROR: 'เกิดข้อผิดพลาดเครือข่าย Local AI',
    BROWSER_SECURITY_BLOCKED: 'Local AI ถูกบล็อกโดยความปลอดภัยของเบราว์เซอร์',
    CSP_BLOCKED: 'Local AI ถูกบล็อกโดยนโยบายความปลอดภัย',
    AI_BUSY: 'Local AI กำลังวิเคราะห์งานอื่นอยู่ กรุณารอหรือยกเลิกงานเดิมก่อนเริ่มงานใหม่',
    AI_SESSION_CONFLICT: 'เซสชันติดตามของ Local AI อยู่ในสถานะที่ทำรายการนี้ไม่ได้',
    AI_SERVER_ERROR: 'บริการ Local AI เกิดข้อผิดพลาดขณะประมวลผลคำขอ',
    AI_REQUEST_REJECTED: 'บริการ Local AI ปฏิเสธคำขอนี้',
  };
  return thai[connection.code];
}

export default function BadmintonTrackingLab() {
  const { matchInfo, settings, localFileName, setLocalFileName, setVideoSourceType } = useScoutContext();
  const { activeProjectId } = useWorkspace();
  const th = settings.uiLanguage === 'th';

  const {
    state,
    update,
    setFile,
    setUIPreference,
    cancel: cancelSession,
    store,
  } = useProjectTrackingSession(activeProjectId);

  const [url, setUrl] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const [connection, setConnection] = useState<AIConnectionSnapshot | null>(null);
  const [inferenceDevice, setInferenceDevice] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null);
  const [shuttleTrackingEnabled, setShuttleTrackingEnabled] = useState<boolean>(
    state.processingConfig?.shuttleEnabled ?? false
  );
  const [devicePreference, setDevicePreference] = useState<'auto' | 'cpu' | 'cuda' | 'mps'>('auto');
  const [profile, setProfile] = useState<ProcessingProfile>('auto');
  const [detectorInputSize, setDetectorInputSize] = useState<number>(640);
  const [useCourtRoi, setUseCourtRoi] = useState<boolean>(false);
  const [exportTargetSessionId, setExportTargetSessionId] = useState<string | null>(null);
  const [courtRoiMarginPx, setCourtRoiMarginPx] = useState<number>(60);
  const [frameStride, setFrameStride] = useState<number>(2);
  const [poseStride, setPoseStride] = useState<number>(1);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [calibrating, setCalibrating] = useState(false);
  const [recoverySelectionKey, setRecoverySelectionKey] = useState<string | null>(null);
  const [recoverySelectionFrame, setRecoverySelectionFrame] = useState<{ frameIndex: number; timestampSec: number } | null>(null);
  const [recoveryViewReady, setRecoveryViewReady] = useState(false);
  const [recoveredKey, setRecoveredKey] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [shuttleMode, setShuttleMode] = useState<ShuttleMode>('off');
  const [overlayWindow, setOverlayWindow] = useState<TrackingOverlayWindow | null>(null);
  const [overlayWindowStatus, setOverlayWindowStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upload = useRef<AbortController | null>(null);
  const overlayWindowLoader = useRef(new TrackingOverlayWindowLoader());
  const overlayRequestId = useRef(0);
  const overlayRequest = useRef<{ projectId: string; sessionId: string; timeSec: number; coverageSec: number } | null>(null);
  const overlayOwner = useRef({ projectId: activeProjectId, sessionId: state.sessionId });
  overlayOwner.current = { projectId: activeProjectId, sessionId: state.sessionId };
  const overlayTime = useRef(time);
  overlayTime.current = time;

  const file = state.file;
  const processing = state.status === 'PROCESSING' || state.status === 'CANCEL_REQUESTED' || state.status === 'UPLOADING';
  const progress = state.progress;
  const gameType = state.gameType;
  const trackedPlayerCount = state.trackedPlayerCount;
  const corners = state.corners;
  const autoCourtCalibrationEnabled = state.processingConfig?.autoCourtCalibrationEnabled ?? false;
  const existingPreparedSession = !!state.sessionId &&
    ['READY_TO_ANALYZE', 'INTERRUPTED', 'CANCELLED'].includes(state.status);
  const calibrationReadyToStart = autoCourtCalibrationEnabled || corners.length === 4 || existingPreparedSession;
  const frames = state.telemetry;
  const latestFrame = frames.length ? frames[frames.length - 1] : null;
  const latestLostSegmentId = state.status === 'PROCESSING' &&
    (latestFrame?.calibrationState === 'CALIBRATION_LOST' || latestFrame?.calibrationState === 'RECALIBRATING')
    ? latestFrame.cameraSegmentId ?? null : null;
  const latestLostKey = state.sessionId && latestLostSegmentId
    ? `${state.sessionId}:${latestLostSegmentId}` : null;
  const lostSegmentId = latestLostKey !== recoveredKey ? latestLostSegmentId : null;
  const lostSegmentKey = lostSegmentId && state.sessionId ? `${state.sessionId}:${lostSegmentId}` : null;
  const sessionStatus = state.sessionStatus;
  const actualInferenceDevice = sessionStatus?.effectiveDevice ?? sessionStatus?.device ?? inferenceDevice;
  const analysis = state.analysis;
  const completedAnalysisSessionId = analysis?.status === 'completed' && /^session_[a-f0-9]{8}$/.test(analysis.id)
    ? analysis.id : null;
  const exportSessionId = state.sessionId && sessionStatus?.status === 'COMPLETED'
    ? state.sessionId : completedAnalysisSessionId;
  const exportingPreviousAnalysis = Boolean(exportSessionId && exportSessionId !== state.sessionId);
  const chunks = state.chunks;
  const error = state.error;
  const overlayMode = state.uiPreferences.overlayMode;

  useEffect(() => {
    overlayRequestId.current += 1;
    overlayRequest.current = null;
    overlayWindowLoader.current.cancel();
    setOverlayWindow(null);
    setOverlayWindowStatus('idle');
  }, [activeProjectId, state.sessionId]);

  const loadOverlayWindow = useCallback(async (targetTime: number, force = false) => {
    const sessionId = state.sessionId;
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
    setOverlayWindow(null);
    setOverlayWindowStatus('loading');
    overlayRequest.current = {
      projectId,
      sessionId,
      timeSec: targetTime,
      coverageSec: state.sessionStatus?.committedResultCursor && state.sessionStatus.videoDurationSec
        ? (MAX_TRACKING_RESULTS_PAGE_SIZE * state.sessionStatus.videoDurationSec) / state.sessionStatus.committedResultCursor
        : 5,
    };

    try {
      const result = await overlayWindowLoader.current.load(
        { projectId, sessionId, timeSec: targetTime, status: state.sessionStatus },
        (id, signal) => aiTrackingService.getSessionStatus(id, signal),
        (id, cursor, limit, signal) => aiTrackingService.getSessionResults(id, cursor, limit, signal),
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
  }, [activeProjectId, frames, overlayWindow, state.sessionId, state.sessionStatus]);
  const overlayLoadCallback = useRef(loadOverlayWindow);
  overlayLoadCallback.current = loadOverlayWindow;

  const activeRemoteWindow = overlayWindow && overlayWindow.projectId === activeProjectId
    && overlayWindow.sessionId === state.sessionId && trackingOverlayWindowContainsTime(overlayWindow, time)
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
    Array.isArray(acceptedCourtCorners) && acceptedCourtCorners.length === 4 && acceptedCourtCorners.every(point =>
      Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && point[0] >= 0 && point[0] < dimensions.width &&
      point[1] >= 0 && point[1] < dimensions.height)
    ? acceptedCourtCorners : null;
  const courtOverlayLines = courtOverlayCorners
    ? projectCourtMarkings(overlayFrame?.calibration?.hInvMatrix, dimensions.width, dimensions.height)
    : [];
  const playbackSegmentId = overlayFrame?.cameraSegmentId ?? displayFrames[0]?.cameraSegmentId;
  const upcomingCourtFrame = displayFrames.find(frame => frame.timestampSec > time + 0.05 &&
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

  // This control describes the runtime available for the next analysis. A
  // completed analysis keeps its historical provenance in the results, but it
  // must not override a fresh capability probe after the service is restarted.
  const effectiveShuttleProv = (processing || sessionStatus?.status === 'PROCESSING')
    ? sessionStatus?.shuttle || sessionStatus?.runtimeProvenance?.shuttle || null
    : null;

  const shuttleStatusInfo = deriveShuttleEngineStatus({
    enabled: shuttleTrackingEnabled || Boolean(effectiveShuttleProv?.enabled),
    sessionProvenance: effectiveShuttleProv,
    backendCapability: capabilities?.shuttle,
    isProcessing: processing,
  });

  const sanitizedModelName =
    effectiveShuttleProv?.model ||
    capabilities?.shuttle?.configuredModel ||
    capabilities?.shuttle?.model ||
    null;

  const requiredShuttleFrameStride = shuttleTrackingEnabled
    ? capabilities?.shuttle?.requiredFrameStride
    : null;
  const effectiveFrameStride = requiredShuttleFrameStride ?? frameStride;

  useEffect(() => {
    if (state.processingConfig?.shuttleEnabled !== undefined) {
      setShuttleTrackingEnabled(state.processingConfig.shuttleEnabled);
    }
  }, [state.processingConfig?.shuttleEnabled]);

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
  }, [url]);

  // 1. Backend health & capabilities
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

  // 2. Profile configuration helper
  const selectProfile = (nextProfile: ProcessingProfile) => {
    setProfile(nextProfile);
    if (nextProfile === 'reference' || nextProfile === 'auto') {
      setDetectorInputSize(640);
      setUseCourtRoi(false);
      setCourtRoiMarginPx(60);
      setFrameStride(2);
      setPoseStride(1);
    } else if (nextProfile === 'quality') {
      setDetectorInputSize(640);
      setUseCourtRoi(false);
      setCourtRoiMarginPx(60);
      setFrameStride(1);
      setPoseStride(1);
    } else if (nextProfile === 'balanced') {
      setDetectorInputSize(512);
      setUseCourtRoi(true);
      setCourtRoiMarginPx(60);
      setFrameStride(2);
      setPoseStride(1);
    } else if (nextProfile === 'fast') {
      setDetectorInputSize(416);
      setUseCourtRoi(true);
      setCourtRoiMarginPx(60);
      setFrameStride(3);
      setPoseStride(2);
    }
  };

  // 3. Object URL for video playback (re-created safely in SPA session)
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    setDimensions({ width: 0, height: 0 });
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  // 4. Load persisted project analysis from IndexedDB if not already in state
  useEffect(() => {
    let alive = true;
    if (activeProjectId && !state.analysis) {
      void getLatestTrackingAnalysisForProject(activeProjectId)
        .then(async (latest) => {
          if (!latest || !alive) return;
          const page = await getTrackingSampleChunkPage(latest.id);
          if (alive) {
            update({
              analysis: latest,
              chunks: page.chunks,
              chunksNextCursor: page.nextCursor,
              chunksHasMore: page.hasMore,
              trackedPlayerCount: latest.trackedPlayerCount ?? state.trackedPlayerCount,
              gameType: latest.gameType ?? state.gameType,
            });
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [activeProjectId, state.analysis]);

  // 5. Try restoring file handle from IndexedDB on hard page refresh
  useEffect(() => {
    let alive = true;
    if (activeProjectId && !state.file) {
      void loadProjectVideoFileHandle(activeProjectId, state.localFileName || localFileName)
        .then(async (handle) => {
          if (!handle || !alive) return;
          if (handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) !== 'granted') return;
          const restored = await handle.getFile();
          if (alive) {
            setFile(restored);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [activeProjectId, state.file, state.localFileName, localFileName]);

  // 6. Polling session helper
  const pollSession = useCallback(
    (sessionId: string, runId: number) => {
      const current = () => generation.current === runId;
      const poll = async (): Promise<void> => {
        try {
          const latestStatus = await aiTrackingService.getSessionStatus(sessionId);
          if (!current()) return;

          const currentState = store.getProjectState(activeProjectId);
          const cur = currentState?.cursor ?? 0;
          if (latestStatus.status !== 'COMPLETED' && latestStatus.status !== 'ERROR') {
            const committedCursor = latestStatus.committedResultCursor;
            const requestCursor = typeof committedCursor === 'number' && Number.isSafeInteger(committedCursor)
              ? Math.min(cur, committedCursor)
              : cur;
            if (requestCursor !== cur) update({ cursor: requestCursor });
            const partial = await aiTrackingService.getSessionResults(sessionId, requestCursor);
            if (!current()) return;

            if (partial.telemetry && partial.telemetry.length > 0) {
              await store.appendTelemetry(activeProjectId!, partial.telemetry, partial.nextCursor);
            } else if (partial.nextCursor !== undefined && partial.nextCursor !== requestCursor) {
              update({ cursor: partial.nextCursor });
            }
          }

          update({
            sessionStatus: latestStatus,
            progress: Math.round(latestStatus.progressPct),
            currentFrame: latestStatus.currentFrame,
            totalFrames: latestStatus.totalFrames,
            analyzedFrames: latestStatus.analyzedFrames,
            status:
              latestStatus.status === 'ERROR'
                ? 'ERROR'
              : latestStatus.status === 'COMPLETED'
                ? 'PROCESSING'
                : latestStatus.status === 'CANCEL_REQUESTED'
                ? 'CANCEL_REQUESTED'
                : latestStatus.status === 'INTERRUPTED'
                ? 'INTERRUPTED'
                : latestStatus.status === 'CANCELLED'
                ? 'CANCELLED'
                : 'PROCESSING',
            error: latestStatus.error || null,
          });

          if (latestStatus.status === 'ERROR') {
            throw new Error(latestStatus.error || 'Tracking engine error');
          }

          if (latestStatus.status === 'COMPLETED') {
            const freshState = store.getProjectState(activeProjectId!);
            if (freshState) {
              await store.persistCompletedAnalysis(activeProjectId!, freshState);
            }
          } else if (latestStatus.status === 'INTERRUPTED' || latestStatus.status === 'CANCELLED') {
            return;
          } else {
            timer.current = setTimeout(() => void poll(), 500);
          }
        } catch (err) {
          if (current()) {
            update({
              error: err instanceof Error ? err.message : 'Tracking failed',
              status: 'ERROR',
            });
          }
        }
      };
      void poll();
    },
    [activeProjectId, store, update]
  );

  // 7. Navigation-Safe Session Lifecycle & Discovery
  useEffect(() => {
    if (!activeProjectId || online === false) return;
    let alive = true;
    const runId = ++generation.current;

    const syncSession = async () => {
      // Case A: active project already has a sessionId in store
      if (
        state.sessionId &&
        ['VIDEO_READY', 'READY_TO_ANALYZE', 'PROCESSING', 'CANCEL_REQUESTED', 'CANCELLED', 'INTERRUPTED', 'UPLOADING', 'COMPLETED', 'ERROR'].includes(state.status)
      ) {
        // Enforce fingerprint match if file is loaded
        if (file && state.videoFingerprint) {
          if (state.videoFingerprint !== computeVideoFingerprint(file)) {
            // Mismatch: clear old non-processing session to force recreation
            if (['VIDEO_READY', 'READY_TO_ANALYZE', 'CANCELLED', 'INTERRUPTED', 'ERROR'].includes(state.status)) {
              void aiTrackingService.deleteSession(state.sessionId).catch(() => {});
              update({ sessionId: null, status: 'IDLE', sessionStatus: null });
            }
            return;
          }
        }

        try {
          const currentStatus = await aiTrackingService.getSessionStatus(state.sessionId);
          if (!alive) return;
          update({
            sessionStatus: currentStatus,
            progress: Math.round(currentStatus.progressPct),
            currentFrame: currentStatus.currentFrame,
            totalFrames: currentStatus.totalFrames,
            analyzedFrames: currentStatus.analyzedFrames,
          });

          if (currentStatus.status === 'VIDEO_READY') {
            update({ status: 'VIDEO_READY' });
          } else if (currentStatus.status === 'READY_TO_ANALYZE') {
            update({ status: 'READY_TO_ANALYZE' });
          } else if (currentStatus.status === 'PROCESSING') {
            update({ status: 'PROCESSING' });
            pollSession(state.sessionId, runId);
          } else if (currentStatus.status === 'CANCEL_REQUESTED') {
            update({ status: 'CANCEL_REQUESTED' });
            pollSession(state.sessionId, runId);
          } else if (currentStatus.status === 'INTERRUPTED' || currentStatus.status === 'CANCELLED') {
            update({ status: currentStatus.status });
          } else if (currentStatus.status === 'COMPLETED') {
            const freshState = store.getProjectState(activeProjectId);
            if (freshState) {
              update({ status: 'PROCESSING' });
              try {
                await store.persistCompletedAnalysis(activeProjectId, freshState);
              } catch (err) {
                if (alive) {
                  update({
                    status: 'ERROR',
                    error: err instanceof Error ? err.message : 'Unable to persist completed analysis',
                  });
                }
              }
            }
          } else if (currentStatus.status === 'ERROR') {
            update({ status: 'ERROR', error: currentStatus.error || 'Unknown backend error' });
          }
        } catch {
          // Status check failure
        }
        return;
      }

      // Case B: No sessionId in store, discover from backend listSessions
      try {
        const fingerprint = state.videoFingerprint || (file ? computeVideoFingerprint(file) : null);
        const recoveryIssues: string[] = [];
        let recoveryIssueCount = 0;
        let recoveryIssuesTruncated = false;
        let cursor: string | null = null;
        let firstPage = true;
        let candidate = null;
        if (fingerprint) {
          do {
            const page = await aiTrackingService.listSessions(activeProjectId, cursor);
            if (!alive) return;
            if (firstPage) {
              recoveryIssues.push(...page.recoveryIssues.slice(0, 3));
              recoveryIssueCount = page.recoveryIssueCount;
              recoveryIssuesTruncated = page.recoveryIssuesTruncated;
              firstPage = false;
            }
            recoveryIssueCount += page.pageIssueCount;
            for (const issue of page.pageIssues) {
              if (recoveryIssues.length < 3) recoveryIssues.push(issue);
            }
            recoveryIssuesTruncated ||= page.pageIssuesTruncated || page.pageIssueCount > 3;
            candidate = page.sessions.find((item) => isCompatibleResumableTrackingSession(item, {
              projectId: activeProjectId,
              videoFingerprint: fingerprint,
              processingConfig: state.processingConfig,
            })) ?? null;
            if (candidate || !page.nextCursor) break;
            if (page.nextCursor === cursor) throw new Error('Tracking job listing repeated a cursor');
            cursor = page.nextCursor;
          } while (alive);
        }
        const recoveryNotice = recoveryIssueCount > 0
          ? `${th ? 'พบปัญหาการกู้คืน' : 'Recovery diagnostics'} (${recoveryIssueCount}): ${recoveryIssues.slice(0, 3).join('; ')}${recoveryIssuesTruncated || recoveryIssueCount > 3 ? '…' : ''}`
          : !fingerprint ? (th ? 'ยังเลือกงานกู้คืนไม่ได้: ไม่พบ fingerprint ของวิดีโอสำหรับยืนยันสื่อ' : 'Resume job not selected: video fingerprint is unavailable for media verification') : null;
        if (candidate) {
          update({
            error: recoveryNotice,
            sessionId: candidate.sessionId,
            status: candidate.status as any,
            gameType: candidate.gameType,
            trackedPlayerCount:
              candidate.trackedPlayerCount ?? (candidate.gameType === 'singles' ? 2 : 4),
            progress: Math.round(candidate.progressPct),
            currentFrame: candidate.currentFrame,
            totalFrames: candidate.totalFrames,
            videoFingerprint: candidate.videoFingerprint,
            sessionStatus: candidate,
            processingConfig: candidate.processingConfig
              ? { ...state.processingConfig, ...candidate.processingConfig }
              : state.processingConfig,
          });
          if (['PROCESSING', 'CANCEL_REQUESTED', 'COMPLETED'].includes(candidate.status)) {
            pollSession(candidate.sessionId, runId);
          }
        } else if (recoveryNotice) {
          update({ error: recoveryNotice });
        }
      } catch (error) {
        update({ error: error instanceof Error ? error.message : 'Unable to list compatible tracking jobs' });
      }
    };

    void syncSession();

    return () => {
      alive = false;
      generation.current++;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      // Note: We intentionally do NOT abort or delete session here!
      // Navigation is NOT cancellation!
    };
  }, [activeProjectId, file]);

  // 8. Explicit User Actions
  const cancel = async () => {
    generation.current++;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    upload.current?.abort();
    try {
      await cancelSession();
      const latest = activeProjectId ? store.getProjectState(activeProjectId) : null;
      if (latest?.status === 'CANCEL_REQUESTED' && latest.sessionId) {
        pollSession(latest.sessionId, generation.current);
      }
    } catch (err) {
      update({ error: err instanceof Error ? err.message : 'Unable to cancel analysis' });
    }
  };

  const choose = (next: File | undefined) => {
    if (!next || processing) return;
    const nextFingerprint = computeVideoFingerprint(next);
    const isReconnecting =
      Boolean(state.sessionId || state.analysis) &&
      state.videoFingerprint === nextFingerprint;

    setFile(next);
    setLocalFileName(next.name);
    setVideoSourceType('local');

    if (!isReconnecting) {
      update({
        sessionId: null,
        videoFingerprint: nextFingerprint,
        status: 'IDLE',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        analyzedFrames: 0,
        corners: [],
        telemetry: [],
        cursor: 0,
        analysis: null,
        chunks: [],
        chunksNextCursor: null,
        chunksHasMore: false,
        error: null,
        sessionStatus: null,
      });
      setCalibrating(false);
      setTime(0);
      setRecoverySelectionKey(null);
      setRecoverySelectionFrame(null);
      setRecoveryViewReady(false);
      setRecoveredKey(null);
      setRecoveryError(null);
      setOverlayWindow(null);
      setOverlayWindowStatus('idle');
      setUIPreference('videoCurrentTime', 0);
    }
  };

  const run = async () => {
    if (
      !file ||
      online !== true ||
      !calibrationReadyToStart ||
      processing ||
      matchInfo.sportType !== 'badminton'
    )
      return;
    const runId = ++generation.current;
    const current = () => generation.current === runId;

    let id: string | null = state.sessionId;
    const currentBackendStatus = state.status;
    const sameDeviceRequest = (state.processingConfig?.requestedDevice ?? state.processingConfig?.device ?? 'auto') === devicePreference;
    const isResumable =
      id &&
      ['VIDEO_READY', 'READY_TO_ANALYZE', 'PROCESSING', 'CANCELLED', 'INTERRUPTED'].includes(currentBackendStatus) &&
      sameDeviceRequest &&
      (!file || !state.videoFingerprint || state.videoFingerprint === computeVideoFingerprint(file));

    const fail = (err: unknown) => {
      if (current()) {
        const latestState = store.getProjectState(activeProjectId);
        const canRetryPreparedSession = err instanceof AIConnectionError && err.code === 'AI_BUSY' &&
          latestState?.sessionId === id &&
          ['VIDEO_READY', 'READY_TO_ANALYZE', 'CANCELLED', 'INTERRUPTED'].includes(latestState.status);
        update({
          error: err instanceof Error ? err.message : 'Tracking failed',
          status: canRetryPreparedSession ? latestState.status : 'ERROR',
        });
      }
    };

    try {
      const processingConfig: ProcessingConfig = {
        profile,
        requestedProfile: profile,
        device: devicePreference,
        requestedDevice: devicePreference,
        detectorInputSize,
        useCourtRoi,
        courtRoiMarginPx,
        courtRoiMarginM: 0.5,
        frameStride: effectiveFrameStride,
        poseStride,
        shuttleEnabled: shuttleTrackingEnabled,
        autoCourtCalibrationEnabled,
        ...(shuttleTrackingEnabled
          ? {
              shuttleProvider: capabilities?.shuttle?.provider ?? 'opencv_onnx',
              shuttleWindowSize: capabilities?.shuttle?.windowSize ?? 3,
              shuttleInputWidth: capabilities?.shuttle?.inputWidth ?? 512,
              shuttleInputHeight: capabilities?.shuttle?.inputHeight ?? 288,
              shuttleRuntime: capabilities?.shuttle?.runtime,
              shuttlePrecision: capabilities?.shuttle?.precision,
              shuttleDevice: devicePreference,
              shuttleConfidenceThreshold: 0.5,
              shuttleRecoveryEnabled: true,
              shuttleBuildTrajectory: false,
            }
          : {}),
      };

      if (!isResumable) {
        if (id && sameDeviceRequest && ['VIDEO_READY', 'READY_TO_ANALYZE', 'CANCELLED', 'INTERRUPTED', 'ERROR'].includes(currentBackendStatus)) {
          void aiTrackingService.deleteSession(id).catch(() => {});
        }
        update({
          status: 'UPLOADING',
          error: null,
          progress: 0,
          telemetry: [],
          cursor: 0,
          sessionStatus: null,
        });

        const created = await aiTrackingService.createSession(gameType, 'upload', {
          projectId: activeProjectId,
          videoFingerprint: computeVideoFingerprint(file),
          device: devicePreference,
          trackedPlayerCount,
          processingConfig,
        });

        id = created.sessionId;
        if (!current()) {
          void aiTrackingService.deleteSession(id);
          return;
        }

        update({
          sessionId: id,
          videoFingerprint: computeVideoFingerprint(file),
          processingConfig,
        });

        upload.current = new AbortController();
        store.registerUploadController(activeProjectId!, upload.current);
        await aiTrackingService.uploadSessionVideo(id, file, upload.current.signal);
        store.clearUploadController(activeProjectId!);
        if (!current()) return;

        update({ status: 'VIDEO_READY' });
      }

      // Resume flow picks up from here using the existing id
      const activeStatus = store.getProjectState(activeProjectId!)?.status || 'VIDEO_READY';

      if ((activeStatus === 'VIDEO_READY' || activeStatus === 'IDLE' || activeStatus === 'CREATED') &&
          !autoCourtCalibrationEnabled) {
        await aiTrackingService.calibrateSession(id!, corners, gameType);
        if (!current()) return;
        update({ status: 'READY_TO_ANALYZE' });
      }

      const activeStatus2 = store.getProjectState(activeProjectId!)?.status || 'READY_TO_ANALYZE';
      if (['READY_TO_ANALYZE', 'INTERRUPTED', 'CANCELLED'].includes(activeStatus2) ||
          (activeStatus2 === 'VIDEO_READY' && autoCourtCalibrationEnabled)) {
        await aiTrackingService.startSessionAnalysis(id!);
        if (!current()) return;
        update({ status: 'PROCESSING' });
      }

      pollSession(id!, runId);
    } catch (err) {
      fail(err);
    }
  };

  const canRun =
    matchInfo.sportType === 'badminton' &&
    online === true &&
    !!file &&
    calibrationReadyToStart &&
    !processing;
  const applyManualRecovery = async () => {
    if (!state.sessionId || !lostSegmentId || recoverySelectionKey !== lostSegmentKey ||
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
      await aiTrackingService.calibrateSession(state.sessionId, corners, gameType, lostSegmentId, recoverySelectionFrame);
      setRecoveredKey(lostSegmentKey);
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Manual calibration failed');
    } finally {
      setRecoveryPending(false);
    }
  };
  const button =
    'rounded-lg border border-slate-600 px-3 py-2 text-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 motion-reduce:transform-none motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="h-full overflow-y-auto bg-[#0c1721] text-slate-200 p-4 space-y-4">
      <div>
        <h2 className="font-bold text-lg">
          {th ? 'แล็บตรวจจับร่างกายและการเคลื่อนที่แบดมินตัน' : 'Badminton Tracking Lab'}
        </h2>
        <p className="text-sm text-slate-400">
          {th
            ? 'ตรวจจับผู้เล่นและจุดร่างกายจากวิดีโอจริง • ค่าท่าทางเป็นการประมาณแบบ 2 มิติ'
            : 'Real video player and body detection • Pose measurements are 2D estimates'}
        </p>
      </div>

      <div
        role="status"
        className={connection?.connected ? 'text-emerald-400' : 'text-amber-300'}
      >
        {connectionStatusText(connection, th)}
      </div>

      {actualInferenceDevice && (
        <p className="text-xs text-slate-400">Inference device: {actualInferenceDevice}</p>
      )}

      {/* Primary Control: Processing Profile Hierarchy (Phase 4) */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="font-medium">{th ? 'โปรไฟล์การประมวลผล' : 'Performance profile'}</span>
          <select
            aria-label={th ? 'โปรไฟล์การประมวลผล' : 'Performance profile'}
            disabled={processing}
            value={profile}
            onChange={(e) => selectProfile(e.target.value as ProcessingProfile)}
            className="bg-slate-800 p-2 rounded border border-slate-700 text-slate-200"
          >
            <option value="auto">{th ? 'อัตโนมัติ (Auto)' : 'Auto'}</option>
            <option value="reference">{th ? 'มาตรฐาน (Reference baseline)' : 'Reference baseline'}</option>
            <option value="fast">{th ? 'เน้นความเร็ว (Fast)' : 'Fast'}</option>
            <option value="balanced">{th ? 'สมดุล (Balanced)' : 'Balanced'}</option>
            <option value="quality">{th ? 'เน้นความแม่นยำ (Quality)' : 'Quality'}</option>
            {profile === 'custom' && <option value="custom">{th ? 'กำหนดเอง (Custom)' : 'Custom'}</option>}
          </select>
        </label>

        <button
          type="button"
          className={button}
          disabled={processing || !capabilities?.cudaAvailable}
          title={
            capabilities?.cudaAvailable
              ? 'Use NVIDIA CUDA for this analysis'
              : 'CUDA is unavailable in the current Python environment'
          }
          onClick={() => {
            setDevicePreference('cuda');
            setProfile('custom');
          }}
        >
          {th ? 'ใช้ GPU' : 'Use GPU'}
        </button>

        <span className="text-xs px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded font-mono text-slate-300">
          {th ? 'อุปกรณ์ฮาร์ดแวร์:' : 'Inference:'} <span className="uppercase text-sky-400 font-semibold">{devicePreference === 'auto' ? `Auto (${actualInferenceDevice || 'CPU'})` : devicePreference}</span>
        </span>

        <button
          type="button"
          className="text-xs text-sky-400 hover:text-sky-300 underline font-medium"
          onClick={() => setShowAdvancedSettings((prev) => !prev)}
        >
          {showAdvancedSettings
            ? th
              ? 'ซ่อนการตั้งค่าขั้นสูง ▲'
              : 'Hide advanced settings ▲'
            : th
            ? 'ตั้งค่าขั้นสูง (Advanced) ▼'
            : 'Advanced settings ▼'}
        </button>
      </div>

      {showAdvancedSettings && (
        <div
          data-testid="advanced-settings-drawer"
          className="bg-slate-900/60 border border-slate-800 rounded p-3 text-xs space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="space-y-1 block">
              <span className="text-slate-400 block">{th ? 'เป้าหมายฮาร์ดแวร์' : 'Target Hardware'}</span>
              <select
                aria-label="Processing mode"
                disabled={processing}
                value={devicePreference}
                onChange={(e) => {
                  setDevicePreference(e.target.value as 'auto' | 'cpu' | 'cuda' | 'mps');
                  setProfile('custom');
                }}
                className="bg-slate-800 p-1.5 rounded w-full text-slate-200 border border-slate-700"
              >
                <option value="auto">{th ? 'อัตโนมัติ (Auto)' : 'Auto'}</option>
                <option value="cpu">CPU</option>
                <option value="cuda" disabled={!capabilities?.cudaAvailable}>
                  GPU (CUDA){capabilities?.cudaAvailable ? '' : ' — unavailable'}
                </option>
                <option value="mps" disabled={!capabilities?.mpsAvailable}>
                  GPU (MPS){capabilities?.mpsAvailable ? '' : ' — unavailable'}
                </option>
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-400 block">{th ? 'ความละเอียดตัวตรวจจับ' : 'Detector Input Size'}</span>
              <select
                aria-label="Detector Input Size"
                disabled={processing}
                value={detectorInputSize}
                onChange={(e) => {
                  setDetectorInputSize(Number(e.target.value));
                  setProfile('custom');
                }}
                className="bg-slate-800 p-1.5 rounded w-full text-slate-200"
              >
                <option value={416}>416 px</option>
                <option value={512}>512 px</option>
                <option value={640}>640 px</option>
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-400 block">{th ? 'สุ่มเฟรมตรวจจับ (Frame Stride)' : 'Frame Stride'}</span>
              <select
                aria-label="Frame Stride"
                disabled={processing || requiredShuttleFrameStride != null}
                value={effectiveFrameStride}
                onChange={(e) => {
                  setFrameStride(Number(e.target.value));
                  setProfile('custom');
                }}
                className="bg-slate-800 p-1.5 rounded w-full text-slate-200"
              >
                <option value={1}>1 ({th ? 'ทุกเฟรม' : 'Every frame'})</option>
                <option value={2}>2 ({th ? 'ทุก 2 เฟรม' : 'Every 2nd frame'})</option>
                <option value={3}>3 ({th ? 'ทุก 3 เฟรม' : 'Every 3rd frame'})</option>
                <option value={4}>4 ({th ? 'ทุก 4 เฟรม' : 'Every 4th frame'})</option>
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-400 block">{th ? 'สุ่มเฟรมท่าทาง (Pose Stride)' : 'Pose Stride'}</span>
              <select
                aria-label="Pose Stride"
                disabled={processing}
                value={poseStride}
                onChange={(e) => {
                  setPoseStride(Number(e.target.value));
                  setProfile('custom');
                }}
                className="bg-slate-800 p-1.5 rounded w-full text-slate-200"
              >
                <option value={1}>1 ({th ? 'ทุกเฟรมที่วิเคราะห์' : 'Every analyzed frame'})</option>
                <option value={2}>2 ({th ? 'ทุก 2 เฟรม' : 'Every 2nd analyzed frame'})</option>
                <option value={3}>3 ({th ? 'ทุก 3 เฟรม' : 'Every 3rd analyzed frame'})</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                aria-label="Court ROI Cropping"
                disabled={processing}
                checked={useCourtRoi}
                onChange={(e) => {
                  setUseCourtRoi(e.target.checked);
                  setProfile('custom');
                }}
                className="rounded bg-slate-800 border-slate-700 text-sky-500"
              />
              <span>{th ? 'ตัดเฉพาะบริเวณสนาม (Court ROI Cropping)' : 'Crop Court ROI to accelerate inference'}</span>
            </label>
            {useCourtRoi && (
              <label className="flex items-center gap-2">
                <span className="text-slate-400">{th ? 'ระยะเผื่อขอบ:' : 'Margin:'}</span>
                <input
                  type="number"
                  aria-label="Court ROI Margin"
                  disabled={processing}
                  value={courtRoiMarginPx}
                  onChange={(e) => {
                    setCourtRoiMarginPx(Math.max(10, Number(e.target.value)));
                    setProfile('custom');
                  }}
                  className="bg-slate-800 p-1 rounded w-16 text-center text-slate-200"
                  min={10}
                  max={200}
                />
                <span className="text-slate-400">px</span>
              </label>
            )}
          </div>

          {/* Shuttle Tracking Engine Section */}
          <div
            className="pt-2 border-t border-slate-800/80 space-y-2"
            data-testid="shuttle-tracking-engine-section"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-300 flex items-center gap-2">
                <span>{th ? 'การตรวจจับลูกขนไก่ (Shuttle Tracking Engine)' : 'Shuttle Tracking Engine'}</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {th ? '(Inference runtime — แยกจาก Overlay)' : '(Inference runtime — separate from display overlay)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{th ? 'สถานะ:' : 'Status:'}</span>
                <span
                  data-testid="shuttle-tracking-status"
                  data-status={shuttleStatusInfo.status}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${shuttleStatusInfo.badgeClass}`}
                >
                  {shuttleStatusInfo.displayText}
                </span>
              </div>
            </div>

            <p data-testid="shuttle-tracking-explanation" className="text-xs text-slate-400">
              {shuttleStatusInfo.detailText}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-2 rounded border border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Enable Shuttle Tracking"
                  disabled={processing}
                  checked={shuttleTrackingEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setShuttleTrackingEnabled(enabled);
                    update({
                      processingConfig: {
                        ...state.processingConfig,
                        shuttleEnabled: enabled,
                      },
                    });
                  }}
                  className="rounded bg-slate-800 border-slate-700 text-sky-500"
                />
                <span className="font-medium text-slate-200">
                  {th ? 'เปิดใช้งานการตรวจจับลูกขนไก่ (Enable Shuttle Tracking)' : 'Enable Shuttle Tracking'}
                </span>
              </label>

              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>{th ? 'โมเดล:' : 'Model:'}</span>
                <span className="text-slate-300 font-mono">
                  {sanitizedModelName || (th ? 'ยังไม่ได้ระบุโมเดล (SHUTTLE_MODEL_PATH)' : 'None (configured via backend/env)')}
                </span>
              </div>
            </div>

            {(shuttleTrackingEnabled || Boolean(effectiveShuttleProv?.enabled)) && (
              <div
                data-testid="shuttle-runtime-diagnostics"
                className="bg-slate-950/60 p-2.5 rounded border border-slate-800 space-y-2 text-[11px]"
              >
                <div className="font-medium text-slate-300">
                  {th ? 'การวินิจฉัยรันไทม์ลูกขนไก่ (Runtime Diagnostics)' : 'Shuttle Runtime Diagnostics'}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-400">
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Provider / Model</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-provider-model">
                      {effectiveShuttleProv?.provider ?? capabilities?.shuttle?.provider ?? '—'} / {sanitizedModelName ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Runtime / Precision</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-runtime-precision">
                      {effectiveShuttleProv?.runtime ?? capabilities?.shuttle?.runtime ?? '—'} ({effectiveShuttleProv?.precision ?? capabilities?.shuttle?.precision ?? '—'})
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Device / Window</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-device-window">
                      {effectiveShuttleProv?.device ?? capabilities?.shuttle?.device ?? '—'} / {effectiveShuttleProv?.windowSize ?? capabilities?.shuttle?.windowSize ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Frames (Rec / Valid)</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-frames">
                      {formatDiagnosticCount(effectiveShuttleProv?.framesReceived)} / {formatDiagnosticCount(effectiveShuttleProv?.validFrames)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Inference Calls / Mean</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-inference">
                      {formatDiagnosticCount(effectiveShuttleProv?.inferenceCalls)} ({effectiveShuttleProv?.meanInferenceMs != null ? `${effectiveShuttleProv.meanInferenceMs.toFixed(1)}ms` : '—'})
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Obs / Pred</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-obs-pred">
                      {formatDiagnosticCount(effectiveShuttleProv?.observedCount)} / {formatDiagnosticCount(effectiveShuttleProv?.predictedCount)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Lost / Unknown</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-lost-unknown">
                      {formatDiagnosticCount(effectiveShuttleProv?.lostCount)} / {formatDiagnosticCount(effectiveShuttleProv?.unknownCount)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Last Failure</span>
                    <span className="text-slate-200 font-mono truncate" data-testid="diag-last-failure">
                      {effectiveShuttleProv?.lastFailure || effectiveShuttleProv?.failureReason || '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {requiredShuttleFrameStride === 1 && (
              <p className="text-xs text-slate-400">
                {th
                  ? `โมเดลนี้ต้องใช้ ${capabilities?.shuttle?.windowSize} เฟรมต่อเนื่อง ระบบจึงวิเคราะห์ทุกเฟรม (Frame Stride 1)`
                  : `This model requires ${capabilities?.shuttle?.windowSize} consecutive frames; analysis uses every frame (Frame Stride 1).`}
              </p>
            )}
          </div>
        </div>
      )}

      {online === false && (
        <p className="text-sm">
          {th ? 'เปิดบริการ AI ในเครื่องก่อนเริ่มวิเคราะห์' : 'Start the local AI service before running analysis.'}
        </p>
      )}

      {matchInfo.sportType !== 'badminton' && (
        <p className="text-amber-300">
          {th ? 'เลือกโปรเจกต์กีฬาแบดมินตันก่อนเริ่มวิเคราะห์' : 'Select a Badminton project to enable analysis.'}
        </p>
      )}

      <div className="space-y-1 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoCourtCalibrationEnabled}
            disabled={processing || (!!state.sessionId && ['VIDEO_READY', 'READY_TO_ANALYZE', 'INTERRUPTED', 'CANCELLED'].includes(state.status))}
            onChange={(e) => update({ processingConfig: {
              ...state.processingConfig, autoCourtCalibrationEnabled: e.target.checked,
            } })}
            className="rounded bg-slate-800 border-slate-700 text-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500"
          />
          <span>{th ? 'ตรวจจับสนามอัตโนมัติ' : 'Automatic court calibration'}</span>
        </label>
        <p className="text-xs text-slate-400">
          {autoCourtCalibrationEnabled
            ? (th ? 'เริ่มได้โดยไม่ต้องเลือกมุมสนาม ค่าสนามจะแสดงเมื่อระบบตรวจสอบการปรับเทียบผ่านเท่านั้น'
              : 'Start without marking corners. Court metrics become available only after calibration is validated.')
            : (th ? 'เลือกมุมสนาม 4 จุดก่อนเริ่มวิเคราะห์' : 'Mark four court corners before starting analysis.')}
        </p>
      </div>

      {/* Video Selection & Reconnection */}
      <div className="space-y-2">
        <span className="block text-sm">{th ? 'เลือกไฟล์วิดีโอจากเครื่อง' : 'Select video file'}</span>
        {processing && (
          <p className="text-xs text-amber-300">
            {th
              ? 'ยกเลิกการวิเคราะห์และรอให้หยุดก่อนจึงจะเปลี่ยนวิดีโอได้'
              : 'Cancel analysis and wait for it to stop before changing videos.'}
          </p>
        )}
        <input
          ref={fileInputRef}
          aria-label="Select video file"
          type="file"
          accept="video/*"
          disabled={processing}
          onChange={(e) => choose(e.target.files?.[0])}
          className="sr-only"
        />
        <button
          type="button"
          className={`${button} bg-sky-700 hover:bg-sky-600`}
          disabled={processing}
          onClick={() => fileInputRef.current?.click()}
        >
          {file
            ? th
              ? 'เปลี่ยนไฟล์วิดีโอ'
              : 'Change video file'
            : th
            ? 'เลือกไฟล์วิดีโอ'
            : 'Choose video file'}
        </button>
      </div>

      {/* Source Video Reconnect Banner when file is unattached but session/analysis exists */}
      {!file && (state.sessionId || state.analysis || state.localFileName) && (
        <div
          data-testid="reconnect-source-video-banner"
          className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2"
        >
          <div>
            <div className="font-semibold">
              {th ? 'โปรดเชื่อมต่อไฟล์วิดีโอต้นฉบับอีกครั้ง' : 'Reconnect source video'}
            </div>
            <div className="text-[11px] text-amber-300/80">
              {th
                ? `เลือกไฟล์ ${state.localFileName || 'วิดีโอ'} เพื่อดูคลิปและโอเวอร์เลย์ (ข้อมูลผลการวิเคราะห์ยังคงอยู่)`
                : `Select ${state.localFileName || 'the video file'} to view playback & overlays. Analysis data is preserved.`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium text-xs whitespace-nowrap"
          >
            {th ? 'เชื่อมต่อไฟล์วิดีโอ' : 'Reconnect source video'}
          </button>
        </div>
      )}

      {!file && state.localFileName && !state.sessionId && !state.analysis && (
        <p className="text-sm text-slate-400">
          {th
            ? `เลือกไฟล์ ${state.localFileName} อีกครั้งเพื่อให้ระบบอ่านวิดีโอได้`
            : `Reselect ${state.localFileName} to give the analyzer access to the video.`}
        </p>
      )}

      {/* Match Configuration Controls */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span>{th ? 'ประเภทการแข่งขัน' : 'Game type'}</span>
          <select
            aria-label={th ? 'ประเภทการแข่งขัน' : 'Game type'}
            disabled={processing}
            value={gameType}
            onChange={(e) => {
              const nextType = e.target.value as BadmintonGameType;
              update({
                gameType: nextType,
                trackedPlayerCount: nextType === 'singles' ? 2 : 4,
              });
            }}
            className="bg-slate-800 p-2 rounded"
          >
            <option value="singles">{th ? 'เดี่ยว' : 'Singles'}</option>
            <option value="doubles">{th ? 'คู่' : 'Doubles'}</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span>{th ? 'จำนวนผู้เล่นที่ตรวจจับ' : 'Players to track'}</span>
          <select
            aria-label={th ? 'จำนวนผู้เล่นที่ตรวจจับ' : 'Players to track'}
            disabled={processing}
            value={trackedPlayerCount}
            onChange={(e) => update({ trackedPlayerCount: Number(e.target.value) })}
            className="bg-slate-800 p-2 rounded"
          >
            <option value={1}>1 {th ? 'คน (เดี่ยวฝึกซ้อม)' : 'player (solo drill)'}</option>
            <option value={2}>2 {th ? 'คน (เดี่ยวแข่งขัน)' : 'players (singles)'}</option>
            <option value={3}>3 {th ? 'คน (2 ต่อ 1 / ป้อนลูก)' : 'players (2v1 / feeder)'}</option>
            <option value={4}>4 {th ? 'คน (คู่แข่งขัน)' : 'players (doubles)'}</option>
          </select>
        </label>
      </div>

      {/* Video & Overlays */}
      {url && (
        <>
          <div
            className="relative w-full max-w-4xl bg-black"
            style={{
              aspectRatio: dimensions.width ? `${dimensions.width}/${dimensions.height}` : '16/9',
            }}
          >
            <video
              ref={videoRef}
              src={url}
              controls={!calibrating}
              className="w-full h-full"
              onLoadedMetadata={(e) => {
                setDimensions({
                  width: e.currentTarget.videoWidth,
                  height: e.currentTarget.videoHeight,
                });
                const savedTime = state.videoFingerprint && file
                  && state.videoFingerprint === computeVideoFingerprint(file)
                  ? state.uiPreferences.videoCurrentTime
                  : 0;
                const restoredTime = Number.isFinite(savedTime) && savedTime > 0
                  ? (Number.isFinite(e.currentTarget.duration) ? Math.min(savedTime, e.currentTarget.duration) : savedTime)
                  : 0;
                if (restoredTime > 0) {
                  e.currentTarget.currentTime = restoredTime;
                }
                setTime(restoredTime);
                void loadOverlayWindow(restoredTime, true);
              }}
              onTimeUpdate={(e) => {
                const cur = e.currentTarget.currentTime;
                setTime(cur);
                setUIPreference('videoCurrentTime', cur);
                void loadOverlayWindow(cur);
              }}
              onSeeked={(e) => {
                const cur = e.currentTarget.currentTime;
                setTime(cur);
                setUIPreference('videoCurrentTime', cur);
                void loadOverlayWindow(cur, true);
                setRecoveryViewReady(Boolean(recoverySelectionFrame &&
                  Math.abs(cur - recoverySelectionFrame.timestampSec) <= 0.05));
              }}
              onSeeking={() => setRecoveryViewReady(false)}
            />
            <TrackingVideoOverlay
              frames={displayFrames}
              time={time}
              mode={overlayMode}
              isProcessing={processing}
            />
            <ShuttleOverlay frames={displayFrames} time={time} mode={shuttleMode} width={dimensions.width} height={dimensions.height} />
            {overlayStatus && (
              <div
                role={overlayWindowStatus === 'error' ? 'alert' : 'status'}
                aria-live={overlayWindowStatus === 'error' ? 'assertive' : 'polite'}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 rounded border border-slate-600 bg-slate-950/90 px-3 py-1.5 text-xs text-slate-200 shadow"
              >
                {overlayStatus}
              </div>
            )}
            {overlayFrame && (
              <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1.5 pointer-events-none z-10 text-[11px] font-mono">
                {overlayFrame.sceneState && (
                  <span className={`px-2 py-0.5 rounded border font-semibold ${
                    overlayFrame.sceneState === 'COURT_PLAY'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      : overlayFrame.sceneState === 'REPLAY'
                        ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                        : overlayFrame.sceneState === 'SIDE_PLAY'
                          ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                          : overlayFrame.sceneState === 'CAMERA_TRANSITION'
                            ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                            : 'bg-slate-900/80 border-slate-700 text-slate-300'
                  }`}>
                    {overlayFrame.sceneState}
                  </span>
                )}
                {overlayFrame.cameraSegmentId && (
                  <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900/80 text-slate-300">
                    {overlayFrame.cameraSegmentId}
                  </span>
                )}
                {overlayFrame.calibrationState && (
                  <span className={`px-2 py-0.5 rounded border ${
                    overlayFrame.calibrationState === 'CALIBRATED'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      : overlayFrame.calibrationState === 'RECALIBRATING'
                        ? 'bg-amber-950/90 border-amber-500 text-amber-200 animate-pulse motion-reduce:animate-none'
                        : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                  }`}
                  title={overlayFrame.calibrationUnavailableReason || overlayFrame.calibrationState}>
                    {overlayFrame.calibrationState}
                  </span>
                )}
                {overlayFrame.canTrackPlayer !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded border ${
                      overlayFrame.canTrackPlayer
                        ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900/80 border-slate-700 text-slate-500 line-through'
                    }`}
                    title={overlayFrame.capabilities?.canTrackPlayer?.reason || 'Player tracking'}
                  >
                    2D
                  </span>
                )}
                {overlayFrame.canUseCourtMetric !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded border ${
                      overlayFrame.canUseCourtMetric
                        ? 'bg-sky-950/80 border-sky-500/40 text-sky-300'
                        : 'bg-slate-900/80 border-slate-700 text-slate-500 line-through'
                    }`}
                    title={overlayFrame.capabilities?.canUseCourtMetric?.reason || 'Court metric'}
                  >
                    METRIC
                  </span>
                )}
                {overlayFrame.canWriteCanonicalMatchData !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded border ${
                      overlayFrame.canWriteCanonicalMatchData
                        ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900/80 border-slate-700 text-slate-500 line-through'
                    }`}
                    title={overlayFrame.capabilities?.canWriteCanonicalMatchData?.reason || 'Canonical writes'}
                  >
                    CANONICAL
                  </span>
                )}
              </div>
            )}
            {!calibrating && courtOverlayCorners && (
              <svg
                aria-label={th ? 'สนามที่ผ่านการตรวจสอบการปรับเทียบ' : 'Validated court calibration'}
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <polygon points={courtOverlayCorners.map(point => point.join(',')).join(' ')}
                  fill="none" stroke="#38bdf8" strokeWidth={dimensions.width / 400} />
                {courtOverlayLines.map(line => (
                  <line key={line.id} data-testid={`court-marking-${line.id}`}
                    x1={line.from[0]} y1={line.from[1]} x2={line.to[0]} y2={line.to[1]}
                    stroke="#38bdf8" strokeOpacity="0.8" strokeWidth={dimensions.width / 800} />
                ))}
              </svg>
            )}
            {(calibrating || (corners.length > 0 && !state.sessionId && frames.length === 0) ||
              (corners.length > 0 && lostSegmentKey && recoverySelectionKey === lostSegmentKey)) && (
              <svg
                aria-label="Court calibration"
                viewBox={`0 0 ${dimensions.width || 1} ${dimensions.height || 1}`}
                className={`absolute inset-0 w-full h-full ${
                  calibrating ? 'cursor-crosshair' : 'pointer-events-none'
                }`}
                onClick={(e) => {
                  if (!calibrating || corners.length >= 4 || (lostSegmentId && !recoveryViewReady)) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (!rect.width || !rect.height) return;
                  const next = [
                    ...corners,
                    [
                      Math.round(((e.clientX - rect.left) / rect.width) * dimensions.width),
                      Math.round(((e.clientY - rect.top) / rect.height) * dimensions.height),
                    ],
                  ];
                  update({ corners: next });
                  if (next.length === 4) setCalibrating(false);
                }}
              >
                {corners.length > 1 && (
                  <polyline
                    points={[...corners, ...(corners.length === 4 ? [corners[0]] : [])]
                      .map((p) => p.join(','))
                      .join(' ')}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={dimensions.width / 400}
                  />
                )}
                {corners.map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r={dimensions.width / 160} fill="#38bdf8" />
                    <text
                      x={x + dimensions.width / 100}
                      y={y}
                      fontSize={dimensions.width / 50}
                      fill="white"
                    >
                      {['TL', 'TR', 'BR', 'BL'][i]}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </div>
          {courtStartsLater && (
            <div role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded border border-sky-900 bg-slate-900 px-3 py-2 text-sm text-sky-200">
              <span>{th
                ? `วิดีโอช่วงนี้ยังไม่ผ่านการปรับเทียบสนาม ระบบเริ่มแสดงแนวเส้นสนามที่ ${firstCourtTime!.toFixed(1)} วินาที`
                : `This part of the video is not court calibrated yet. Court line guides begin at ${firstCourtTime!.toFixed(1)} s.`}</span>
              <button type="button" className="rounded border border-sky-700 bg-sky-950 px-2 py-1 text-sky-100 hover:bg-sky-900"
                onClick={() => {
                  const video = videoRef.current;
                  if (!video || firstCourtTime == null) return;
                  const target = Math.min(firstCourtTime,
                    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity);
                  video.currentTime = target;
                  setTime(target);
                  setUIPreference('videoCurrentTime', target);
                  void loadOverlayWindow(target, true);
                }}>
                {th ? 'ไปยังช่วงที่ตรวจพบสนาม' : 'Jump to detected court'}
              </button>
            </div>
          )}
          <ShuttleControls mode={shuttleMode} onChange={setShuttleMode} />
          <ShuttleDiagnostics frames={displayFrames} time={time} />
          <button
            className={button}
            disabled={(processing && !lostSegmentId) || !dimensions.width}
            onClick={() => {
              videoRef.current?.pause();
              if (lostSegmentId && latestFrame) videoRef.current!.currentTime = latestFrame.timestampSec;
              update({ corners: [] });
              setRecoverySelectionKey(lostSegmentKey);
              setRecoveryViewReady(false);
              setRecoverySelectionFrame(lostSegmentId && latestFrame ? {
                frameIndex: latestFrame.frameIndex,
                timestampSec: latestFrame.timestampSec,
              } : null);
              setRecoveryError(null);
              setCalibrating(true);
            }}
          >
            {th ? 'เลือก 4 มุมสนามจากภาพวิดีโอ' : 'Calibrate four court corners'}
          </button>
          {latestFrame?.calibrationState === 'RECALIBRATING' && (
            <div role="status" className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-200 text-xs space-y-1">
              <p className="font-semibold text-amber-300">
                {th ? 'กำลังปรับเทียบสนามใหม่ (Recalibrating)' : 'Court Recalibration In Progress'}
              </p>
              <p className="text-slate-300">
                {latestFrame.calibrationUnavailableReason ||
                  (th
                    ? 'ตรวจพบการตัดภาพหรือการเคลื่อนไหวของกล้อง กำลังค้นหาเส้นสนามหรือรอการกู้คืนด้วยตนเอง'
                    : 'Camera cut or motion drift detected. System is searching for court lines or awaiting manual recovery.')}
              </p>
            </div>
          )}
          {lostSegmentId && (
            <div role="status" className="text-sm text-amber-300 space-y-2 p-3 rounded-lg border border-amber-600/40 bg-amber-950/20">
              <p>{th ? 'การปรับเทียบสนามสูญหาย เลือกมุมสนาม 4 จุดจากภาพของช่วงกล้องปัจจุบัน' :
                'Court calibration unavailable. Select four corners on the current camera segment.'}</p>
              {(() => {
                const suggested = (state.sessionStatus?.runtimeProvenance?.calibration as any)?.suggestedCorners;
                const suggestedConf = (state.sessionStatus?.runtimeProvenance?.calibration as any)?.suggestedConfidence;
                if (!suggested || !Array.isArray(suggested) || suggested.length !== 4) return null;
                return (
                  <div className="flex items-center justify-between gap-2 text-xs text-sky-300 bg-sky-950/40 p-2 rounded border border-sky-800/50">
                    <span>
                      {th
                        ? `ข้อเสนอ Hybrid: ตรวจพบจุดสนาม (${Math.round((suggestedConf || 0) * 100)}% ความมั่นใจ)`
                        : `Hybrid Proposal: Candidate corners detected (${Math.round((suggestedConf || 0) * 100)}% conf)`}
                    </span>
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition-transform active:scale-95 motion-reduce:transform-none"
                      onClick={() => {
                        videoRef.current?.pause();
                        if (!latestFrame || !videoRef.current) return;
                        videoRef.current.currentTime = latestFrame.timestampSec;
                        setRecoverySelectionFrame({ frameIndex: latestFrame.frameIndex, timestampSec: latestFrame.timestampSec });
                        setRecoveryViewReady(false);
                        update({ corners: suggested });
                        setRecoverySelectionKey(lostSegmentKey);
                      }}
                    >
                      {th ? 'ใช้จุดแนะนำ' : 'Use suggested corners'}
                    </button>
                  </div>
                );
              })()}
              <button
                className={button}
                disabled={corners.length !== 4 || recoverySelectionKey !== lostSegmentKey || !recoverySelectionFrame || !recoveryViewReady || recoveryPending}
                onClick={() => void applyManualRecovery()}
              >
                {recoveryPending
                  ? (th ? 'กำลังบันทึก...' : 'Applying...')
                  : (th ? 'ใช้การปรับเทียบด้วยตนเอง' : 'Apply manual calibration')}
              </button>
              {recoveryError && <p role="alert" className="text-red-300 text-xs">{recoveryError}</p>}
            </div>
          )}
          <p className="text-sm text-slate-400">
            {th
              ? 'เลือกมุมนอกสนามคู่: บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย'
              : 'Choose outer doubles court corners: top left → top right → bottom right → bottom left'}{' '}
            ({corners.length}/4)
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
            <span className="text-slate-400">{th ? 'โหมดแสดงผลบนวิดีโอ:' : 'Overlay mode:'}</span>
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
              {(
                [
                  { id: 'skeleton', en: 'Skeleton', th: 'โครงกระดูก' },
                  { id: 'center', en: 'Body Center', th: 'จุดกลางร่างกาย' },
                  { id: 'feet', en: 'Feet', th: 'ตำแหน่งเท้า' },
                  { id: 'box', en: 'Bounding Box', th: 'กรอบผู้เล่น' },
                  { id: 'off', en: 'Off', th: 'ปิด' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setUIPreference('overlayMode', m.id)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    overlayMode === m.id
                      ? 'bg-sky-600 text-white font-medium shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {th ? m.th : m.en}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}

      {processing ? (
        <div className="space-x-3">
          <span>
            {th ? 'กำลังวิเคราะห์' : 'Analyzing'} {progress}%
          </span>
          <button className={button} onClick={cancel} disabled={state.status === 'CANCEL_REQUESTED'}>
            {state.status === 'CANCEL_REQUESTED'
              ? th ? 'กำลังหยุด…' : 'Stopping…'
              : th ? 'ยกเลิก' : 'Cancel analysis'}
          </button>
        </div>
      ) : (
        <button className={`${button} bg-sky-700`} disabled={!canRun} onClick={() => void run()}>
          {th ? 'เริ่มตรวจจับร่างกายและการเคลื่อนที่' : 'Run Movement Analysis'}
        </button>
      )}

      {exportSessionId && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 shadow-sm">
          <p className="text-sm text-emerald-300 font-medium">
            {exportingPreviousAnalysis
              ? th ? 'ผลวิเคราะห์รอบก่อนเสร็จแล้ว สามารถส่งออกได้ระหว่างรอบปัจจุบัน'
                : 'The previous analysis is complete and can be exported while the current run continues.'
              : th
              ? 'วิเคราะห์เสร็จสมบูรณ์แล้ว กดเล่นวิดีโอเพื่อดูตำแหน่งร่างกายและการเคลื่อนที่'
              : 'Analysis complete. Play the video to inspect detected body positions and movement.'}
          </p>
          <button
            type="button"
            onClick={() => setExportTargetSessionId(exportSessionId)}
            className="flex shrink-0 items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-sm transition shadow"
          >
            <span>📥</span>
            <span>{th
              ? exportingPreviousAnalysis ? 'ส่งออกผลรอบก่อน (EXPORT)' : 'ส่งออกผลลัพธ์ (EXPORT)'
              : exportingPreviousAnalysis ? 'EXPORT PREVIOUS' : 'EXPORT'}</span>
          </button>
        </div>
      )}

      <TrackingLabInspector
        status={sessionStatus}
        isProcessing={processing}
        language={th ? 'th' : 'en'}
        projectId={activeProjectId}
        videoFingerprint={state.videoFingerprint}
        localFileName={state.localFileName || localFileName}
      />

      {analysis && (
        <BadmintonMovementDashboard
          analysis={analysis}
          chunks={chunks}
          hasMoreChunks={state.chunksHasMore}
          language={th ? 'th' : 'en'}
          title={th ? 'ผลการเคลื่อนที่ของผู้เล่น' : 'Player movement results'}
        />
      )}

      {exportTargetSessionId && (
        <ExportConfigModal
          isOpen={true}
          onClose={() => setExportTargetSessionId(null)}
          sessionId={exportTargetSessionId}
          language={th ? 'th' : 'en'}
        />
      )}
    </div>
  );
}
