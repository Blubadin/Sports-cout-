/**
 * trackingSessionStore.ts — Project-Scoped Tracking Session Store
 *
 * Owns the lifecycle and state of tracking jobs across SPA navigation.
 * Navigation (Lab -> Scout -> Lab) must NEVER cancel or delete active backend sessions.
 * Retains in-memory File references during the SPA session, manages incremental
 * telemetry cursors, deduplicates samples, handles completion while unmounted,
 * and ensures strict project isolation.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  TrackingTelemetryV1,
  TrackingOverlayMode,
  TrackingSessionStatus,
  ProcessingConfig,
  ProcessingProfile,
} from '../types';
import {
  aiTrackingService,
  type BadmintonGameType,
} from './aiTrackingService';
import {
  saveTrackingAnalysis,
  listTrackingAnalyses,
  getLatestTrackingAnalysis,
  getTrackingSampleChunks,
  downsampleAndChunkTrackingSamples,
  calculateNominalAnalysisHz,
  calculateEffectiveStoredHz,
  type TrackingAnalysis,
  type TrackingSampleChunk,
} from './storage/trackingStorage';
import { loadProjectVideoFileHandle } from '../utils/videoFileStore';

export interface ProjectTrackingUIPreferences {
  overlayMode: TrackingOverlayMode;
  videoCurrentTime: number;
  selectedInspectorTab: 'analysis' | 'performance' | 'config';
}

export interface ProjectTrackingState {
  projectId: string;
  sessionId: string | null;
  videoFingerprint: string | null;
  file: File | null;
  localFileName: string | null;
  gameType: BadmintonGameType;
  trackedPlayerCount: number;
  corners: number[][];
  processingConfig: ProcessingConfig;
  status: 'IDLE' | 'CREATED' | 'UPLOADING' | 'VIDEO_READY' | 'READY_TO_ANALYZE' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  progress: number;
  currentFrame: number;
  totalFrames: number;
  analyzedFrames: number;
  cursor: number;
  telemetry: TrackingTelemetryV1[];
  error: string | null;
  sessionStatus: TrackingSessionStatus | null;
  analysis: TrackingAnalysis | null;
  chunks: TrackingSampleChunk[];
  isPersisting: boolean;
  uiPreferences: ProjectTrackingUIPreferences;
}

export function getDefaultProcessingConfig(): ProcessingConfig {
  return {
    profile: 'auto',
    device: 'auto',
    detectorInputSize: 512,
    useCourtRoi: true,
    courtRoiMarginPx: 60,
    frameStride: 2,
    poseStride: 1,
    shuttleEnabled: false,
  };
}

export function createDefaultProjectTrackingState(projectId: string): ProjectTrackingState {
  return {
    projectId,
    sessionId: null,
    videoFingerprint: null,
    file: null,
    localFileName: null,
    gameType: 'singles',
    trackedPlayerCount: 2,
    corners: [],
    processingConfig: getDefaultProcessingConfig(),
    status: 'IDLE',
    progress: 0,
    currentFrame: 0,
    totalFrames: 0,
    analyzedFrames: 0,
    cursor: 0,
    telemetry: [],
    error: null,
    sessionStatus: null,
    analysis: null,
    chunks: [],
    isPersisting: false,
    uiPreferences: {
      overlayMode: 'skeleton',
      videoCurrentTime: 0,
      selectedInspectorTab: 'analysis',
    },
  };
}

export function computeVideoFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

type StoreListener = (state: ProjectTrackingState) => void;

class TrackingSessionStore {
  private states = new Map<string, ProjectTrackingState>();
  private listeners = new Map<string, Set<StoreListener>>();
  private uploadControllers = new Map<string, AbortController>();
  private pollTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.hydrateFromStorage();
  }

  private getStorageKey(projectId: string): string {
    return `scout_tracking_session_${projectId}`;
  }

  private hydrateFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('scout_tracking_session_')) {
          const projectId = key.replace('scout_tracking_session_', '');
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const data = JSON.parse(raw);
            const state = createDefaultProjectTrackingState(projectId);
            state.sessionId = data.sessionId ?? null;
            state.videoFingerprint = data.videoFingerprint ?? null;
            state.localFileName = data.localFileName ?? null;
            state.gameType = data.gameType ?? 'singles';
            state.trackedPlayerCount = data.trackedPlayerCount ?? 2;
            state.corners = data.corners ?? [];
            const loadedCfg = data.processingConfig ?? getDefaultProcessingConfig();
            state.processingConfig = {
              ...loadedCfg,
              shuttleEnabled: loadedCfg.shuttleEnabled ?? false,
            };
            state.status = data.status ?? 'IDLE';
            state.progress = data.progress ?? 0;
            state.currentFrame = data.currentFrame ?? 0;
            state.totalFrames = data.totalFrames ?? 0;
            state.analyzedFrames = data.analyzedFrames ?? 0;
            state.cursor = data.cursor ?? 0;
            if (data.uiPreferences) {
              state.uiPreferences = { ...state.uiPreferences, ...data.uiPreferences };
            }
            this.states.set(projectId, state);
          }
        }
      }
    } catch {
      // Non-critical local storage parse failure
    }
  }

  private saveToStorage(projectId: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const state = this.states.get(projectId);
    if (!state) {
      window.localStorage.removeItem(this.getStorageKey(projectId));
      return;
    }
    // Only persist serializable metadata (not the File instance or massive raw telemetry)
    const data = {
      sessionId: state.sessionId,
      videoFingerprint: state.videoFingerprint,
      localFileName: state.localFileName,
      gameType: state.gameType,
      trackedPlayerCount: state.trackedPlayerCount,
      corners: state.corners,
      processingConfig: state.processingConfig,
      status: state.status,
      progress: state.progress,
      currentFrame: state.currentFrame,
      totalFrames: state.totalFrames,
      analyzedFrames: state.analyzedFrames,
      cursor: state.cursor,
      uiPreferences: state.uiPreferences,
    };
    try {
      window.localStorage.setItem(this.getStorageKey(projectId), JSON.stringify(data));
    } catch {
      // Storage quota exceeded or private mode
    }
  }

  public getProjectState(projectId: string | null): ProjectTrackingState | null {
    if (!projectId) return null;
    let state = this.states.get(projectId);
    if (!state) {
      state = createDefaultProjectTrackingState(projectId);
      this.states.set(projectId, state);
    }
    return state;
  }

  public subscribe(projectId: string, listener: StoreListener): () => void {
    if (!this.listeners.has(projectId)) {
      this.listeners.set(projectId, new Set());
    }
    this.listeners.get(projectId)!.add(listener);
    const state = this.getProjectState(projectId);
    if (state) listener(state);
    return () => {
      this.listeners.get(projectId)?.delete(listener);
    };
  }

  private notify(projectId: string): void {
    const state = this.states.get(projectId);
    if (!state) return;
    this.saveToStorage(projectId);
    const pListeners = this.listeners.get(projectId);
    if (pListeners) {
      pListeners.forEach((l) => l({ ...state, uiPreferences: { ...state.uiPreferences } }));
    }
  }

  public updateProjectState(
    projectId: string,
    updater: Partial<ProjectTrackingState> | ((prev: ProjectTrackingState) => Partial<ProjectTrackingState>)
  ): void {
    const current = this.getProjectState(projectId);
    if (!current) return;
    const partial = typeof updater === 'function' ? updater(current) : updater;
    Object.assign(current, partial);
    this.notify(projectId);
  }

  public setFile(projectId: string, file: File | null): void {
    const state = this.getProjectState(projectId);
    if (!state) return;
    state.file = file;
    if (file) {
      state.localFileName = file.name;
      state.videoFingerprint = computeVideoFingerprint(file);
    }
    this.notify(projectId);
  }

  public setUIPreference<K extends keyof ProjectTrackingUIPreferences>(
    projectId: string,
    key: K,
    val: ProjectTrackingUIPreferences[K]
  ): void {
    const state = this.getProjectState(projectId);
    if (!state) return;
    state.uiPreferences[key] = val;
    this.notify(projectId);
  }

  /**
   * Explicitly cancels and deletes tracking session for a project.
   */
  public async cancelTracking(projectId: string): Promise<void> {
    const state = this.states.get(projectId);
    if (!state) return;

    // Abort in-flight upload
    const uploadCtrl = this.uploadControllers.get(projectId);
    if (uploadCtrl) {
      uploadCtrl.abort();
      this.uploadControllers.delete(projectId);
    }

    // Clear polling timer
    const timer = this.pollTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.pollTimers.delete(projectId);
    }

    // Delete session from backend
    if (state.sessionId) {
      try {
        await aiTrackingService.deleteSession(state.sessionId);
      } catch {
        // Backend might already have cleaned it up
      }
    }

    // Reset tracking state
    state.sessionId = null;
    state.status = 'IDLE';
    state.progress = 0;
    state.currentFrame = 0;
    state.totalFrames = 0;
    state.analyzedFrames = 0;
    state.cursor = 0;
    state.telemetry = [];
    state.error = null;
    state.sessionStatus = null;
    state.isPersisting = false;

    this.notify(projectId);
  }

  public registerUploadController(projectId: string, ctrl: AbortController): void {
    this.uploadControllers.set(projectId, ctrl);
  }

  public clearUploadController(projectId: string): void {
    this.uploadControllers.delete(projectId);
  }

  public registerPollTimer(projectId: string, timer: ReturnType<typeof setTimeout>): void {
    this.pollTimers.set(projectId, timer);
  }

  public clearPollTimer(projectId: string): void {
    const timer = this.pollTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.pollTimers.delete(projectId);
    }
  }

  /**
   * Appends newly received frames into the project state, deduplicating by frameIndex + timestampSec.
   */
  public appendTelemetry(projectId: string, newFrames: TrackingTelemetryV1[], nextCursor: number): void {
    const state = this.states.get(projectId);
    if (!state || newFrames.length === 0) {
      if (state) {
        state.cursor = nextCursor;
        this.notify(projectId);
      }
      return;
    }

    const existingMap = new Set(state.telemetry.map((f) => `${f.frameIndex}:${f.timestampSec}`));
    const unique = newFrames.filter((f) => !existingMap.has(`${f.frameIndex}:${f.timestampSec}`));

    if (unique.length > 0) {
      state.telemetry.push(...unique);
    }
    state.cursor = nextCursor;
    this.notify(projectId);
  }

  /**
   * Persists a completed analysis to IndexedDB storage exactly once.
   */
  public async persistCompletedAnalysis(
    projectId: string,
    state: ProjectTrackingState
  ): Promise<void> {
    if (!state.sessionId || state.isPersisting) return;
    state.isPersisting = true;

    try {
      const realTelemetry = state.telemetry.filter(
        (frame) => frame.isSynthetic !== true && frame.source !== 'synthetic_demo'
      );
      if (realTelemetry.length === 0) {
        state.analysis = null;
        state.chunks = [];
        state.status = 'COMPLETED';
        state.progress = 100;
        return;
      }

      const count = state.trackedPlayerCount;
      const expectedIds = Array.from({ length: count }, (_, i) => `P${i + 1}`);
      const canonicalMetrics: Record<string, { totalDistanceM?: number }> = Object.fromEntries(
        expectedIds.map((playerId) => [playerId, {}])
      );
      if (state.sessionStatus?.players) {
        for (const lp of state.sessionStatus.players) {
          if (lp.playerId && typeof lp.totalDistanceM === 'number' && Number.isFinite(lp.totalDistanceM)) {
            canonicalMetrics[lp.playerId] = { totalDistanceM: lp.totalDistanceM };
          }
        }
      }

      const saved = downsampleAndChunkTrackingSamples(
        state.sessionId,
        realTelemetry,
        10,
        15,
        canonicalMetrics
      );

      const observedPlayerIds = new Set<string>();
      realTelemetry.forEach((f) => f.players.forEach((p) => observedPlayerIds.add(p.playerId)));
      const effectiveIds = Array.from(new Set([...expectedIds, ...observedPlayerIds])).sort();

      const sourceFps = state.sessionStatus?.videoMetadata?.nominalFps ?? state.sessionStatus?.sourceFps;
      const frameStride = state.sessionStatus?.frameStride ?? state.processingConfig?.frameStride;
      const nominalAnalysisHz = calculateNominalAnalysisHz(sourceFps, frameStride);
      const uniqueStoredTimestamps = new Set(
        saved.chunks.flatMap((chunk) => chunk.samples.map((sample) => sample.timestamp))
      ).size;
      const effectiveStoredHz = calculateEffectiveStoredHz(
        uniqueStoredTimestamps,
        saved.summary.durationSeconds
      );

      const record: TrackingAnalysis = {
        id: state.sessionId,
        projectId,
        sportType: 'badminton',
        gameType: state.gameType,
        trackedPlayerCount: count,
        status: 'completed',
        videoFingerprint: state.videoFingerprint ?? undefined,
        engineVersion: '1.0.0',
        detectorModel: 'yolo',
        trackerModel: 'bytetrack',
        poseModel: 'yolo_pose',
        sampleRateHz: effectiveStoredHz,
        persistedTargetHz: 10,
        nominalAnalysisHz,
        effectiveStoredHz,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        device: state.sessionStatus?.effectiveDevice || state.sessionStatus?.device,
        effectiveDevice: state.sessionStatus?.effectiveDevice || state.sessionStatus?.device,
        runtimeProvenance: state.sessionStatus?.runtimeProvenance,
        videoMetadata: state.sessionStatus?.videoMetadata,
        researchMetadata: state.sessionStatus?.researchMetadata,
        localFileName: state.localFileName ?? undefined,
        analyzedFrames: state.sessionStatus?.analyzedFrames ?? realTelemetry.length,
        totalFrames: state.sessionStatus?.totalFrames ?? state.totalFrames,
        processingConfig: state.processingConfig,
        performance: state.sessionStatus?.performance,
        qualityStats: state.sessionStatus?.quality,
        players: effectiveIds.map((playerId) => {
          const lastObserved = [...realTelemetry]
            .reverse()
            .find((f) => f.players.some((p) => p.playerId === playerId));
          const pData = lastObserved?.players.find((p) => p.playerId === playerId);
          let side: 'near' | 'far' | 'unknown' = 'unknown';
          if (pData?.teamCode === 'team1') {
            side = 'far';
          } else if (pData?.teamCode === 'team2') {
            side = 'near';
          } else if (pData?.courtPosition?.yM !== undefined && pData.courtPosition.yM !== null) {
            side = pData.courtPosition.yM < 6.7 ? 'far' : 'near';
          }
          return { playerId, name: playerId, side };
        }),
        summary: saved.summary,
        quality: saved.quality,
      };

      await saveTrackingAnalysis(record, saved.chunks);
      state.analysis = record;
      state.chunks = saved.chunks;
      state.status = 'COMPLETED';
      state.progress = 100;
    } finally {
      state.isPersisting = false;
      this.notify(projectId);
    }
  }
}

export const trackingSessionStore = new TrackingSessionStore();

/**
 * Custom React hook for project-scoped tracking session state.
 */
export function useProjectTrackingSession(projectId: string | null) {
  const [state, setState] = useState<ProjectTrackingState>(() =>
    projectId
      ? trackingSessionStore.getProjectState(projectId) || createDefaultProjectTrackingState(projectId)
      : createDefaultProjectTrackingState('default')
  );

  useEffect(() => {
    if (!projectId) return;
    const unsub = trackingSessionStore.subscribe(projectId, (next) => {
      setState(next);
    });
    return unsub;
  }, [projectId]);

  const update = useCallback(
    (updater: Partial<ProjectTrackingState> | ((prev: ProjectTrackingState) => Partial<ProjectTrackingState>)) => {
      if (!projectId) return;
      trackingSessionStore.updateProjectState(projectId, updater);
    },
    [projectId]
  );

  const setFile = useCallback(
    (file: File | null) => {
      if (!projectId) return;
      trackingSessionStore.setFile(projectId, file);
    },
    [projectId]
  );

  const setUIPreference = useCallback(
    <K extends keyof ProjectTrackingUIPreferences>(key: K, val: ProjectTrackingUIPreferences[K]) => {
      if (!projectId) return;
      trackingSessionStore.setUIPreference(projectId, key, val);
    },
    [projectId]
  );

  const cancel = useCallback(async () => {
    if (!projectId) return;
    await trackingSessionStore.cancelTracking(projectId);
  }, [projectId]);

  return {
    state,
    update,
    setFile,
    setUIPreference,
    cancel,
    store: trackingSessionStore,
  };
}
