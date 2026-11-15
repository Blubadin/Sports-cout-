import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { aiTrackingService, type BadmintonGameType } from '../../services/aiTrackingService';
import type { BackendCapabilities } from '../../services/trackingSessionApi';
import { AIConnectionError } from '../../services/aiConnection';
import {
  computeVideoFingerprint,
  type ProjectTrackingState,
  type ProjectTrackingUIPreferences,
  type trackingSessionStore,
} from '../../services/trackingSessionStore';
import type { ProcessingConfig, ProcessingProfile, SportType } from '../../types';

interface UseTrackingWorkflowActionsParams {
  activeProjectId: string | null;
  sportType: SportType;
  online: boolean | null;
  processing: boolean;
  calibrationReadyToStart: boolean;
  autoCourtCalibrationEnabled: boolean;
  file: File | null;
  gameType: BadmintonGameType;
  trackedPlayerCount: number;
  corners: number[][];
  state: ProjectTrackingState;
  capabilities: BackendCapabilities | null;
  generation: MutableRefObject<number>;
  timer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  pollSession: (sessionId: string, runId: number) => void;
  update: (updater: Partial<ProjectTrackingState> | ((prev: ProjectTrackingState) => Partial<ProjectTrackingState>)) => void;
  setFile: (file: File | null) => void;
  setLocalFileName: (name: string) => void;
  setVideoSourceType: (source: 'local' | 'youtube') => void;
  setUIPreference: <K extends keyof ProjectTrackingUIPreferences>(key: K, val: ProjectTrackingUIPreferences[K]) => void;
  cancelSession: () => Promise<void>;
  store: typeof trackingSessionStore;
  onResetVideoView: () => void;
}

/** Coordinates performance profile settings, file selection, session upload/start, and cancellation. */
export function useTrackingWorkflowActions({
  activeProjectId,
  sportType,
  online,
  processing,
  calibrationReadyToStart,
  autoCourtCalibrationEnabled,
  file,
  gameType,
  trackedPlayerCount,
  corners,
  state,
  capabilities,
  generation,
  timer,
  pollSession,
  update,
  setFile,
  setLocalFileName,
  setVideoSourceType,
  setUIPreference,
  cancelSession,
  store,
  onResetVideoView,
}: UseTrackingWorkflowActionsParams) {
  const [shuttleTrackingEnabled, setShuttleTrackingEnabled] = useState<boolean>(
    state.processingConfig?.shuttleEnabled ?? false
  );
  const [devicePreference, setDevicePreference] = useState<'auto' | 'cpu' | 'cuda' | 'mps'>('auto');
  const [profile, setProfile] = useState<ProcessingProfile>('auto');
  const [detectorInputSize, setDetectorInputSize] = useState<number>(640);
  const [useCourtRoi, setUseCourtRoi] = useState<boolean>(false);
  const [courtRoiMarginPx, setCourtRoiMarginPx] = useState<number>(60);
  const [frameStride, setFrameStride] = useState<number>(2);
  const [poseStride, setPoseStride] = useState<number>(1);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  const upload = useRef<AbortController | null>(null);

  useEffect(() => {
    if (state.processingConfig?.shuttleEnabled !== undefined) {
      setShuttleTrackingEnabled(state.processingConfig.shuttleEnabled);
    }
  }, [state.processingConfig?.shuttleEnabled]);

  const requiredShuttleFrameStride = shuttleTrackingEnabled
    ? capabilities?.shuttle?.requiredFrameStride
    : null;
  const effectiveFrameStride = requiredShuttleFrameStride ?? frameStride;

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
      onResetVideoView();
      setUIPreference('videoCurrentTime', 0);
    }
  };

  const run = async () => {
    if (
      !file ||
      online !== true ||
      !calibrationReadyToStart ||
      processing ||
      sportType !== 'badminton'
    ) {
      return;
    }
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
    sportType === 'badminton' &&
    online === true &&
    !!file &&
    calibrationReadyToStart &&
    !processing;

  return {
    shuttleTrackingEnabled,
    setShuttleTrackingEnabled,
    devicePreference,
    setDevicePreference,
    profile,
    setProfile,
    detectorInputSize,
    setDetectorInputSize,
    useCourtRoi,
    setUseCourtRoi,
    courtRoiMarginPx,
    setCourtRoiMarginPx,
    frameStride,
    setFrameStride,
    poseStride,
    setPoseStride,
    showAdvancedSettings,
    setShowAdvancedSettings,
    requiredShuttleFrameStride,
    effectiveFrameStride,
    selectProfile,
    cancel,
    choose,
    run,
    canRun,
  };
}
