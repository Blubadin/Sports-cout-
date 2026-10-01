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
  getTrackingAnalysis,
  getTrackingSampleChunks,
  deleteTrackingTelemetryPages,
  getTrackingTelemetryPage,
  saveTrackingAnalysisRecord,
  saveTrackingSampleChunks,
  saveTrackingTelemetryPage,
  TrackingAnalysisStreamBuilder,
  calculateNominalAnalysisHz,
  calculateEffectiveStoredHz,
  MAX_TRACKING_PAGE_SIZE,
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
  status: 'IDLE' | 'CREATED' | 'UPLOADING' | 'VIDEO_READY' | 'READY_TO_ANALYZE' | 'PROCESSING' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'INTERRUPTED' | 'COMPLETED' | 'ERROR';
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

export const MAX_LIVE_TELEMETRY_FRAMES = 512;

export function mergeBoundedTelemetry(
  current: TrackingTelemetryV1[],
  incoming: TrackingTelemetryV1[],
  maximum = MAX_LIVE_TELEMETRY_FRAMES,
): TrackingTelemetryV1[] {
  const pageKeys = new Set<string>();
  const unique = incoming.filter((frame) => {
    const key = `${frame.frameIndex}:${frame.timestampSec}`;
    if (pageKeys.has(key)) return false;
    pageKeys.add(key);
    return true;
  });
  return [...current, ...unique].slice(-maximum);
}

export function getDefaultProcessingConfig(): ProcessingConfig {
  return {
    profile: 'auto',
    device: 'auto',
    detectorInputSize: 640,
    useCourtRoi: false,
    courtRoiMarginPx: 60,
    frameStride: 2,
    poseStride: 1,
    shuttleEnabled: false,
    autoCourtCalibrationEnabled: false,
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

    const timer = this.pollTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.pollTimers.delete(projectId);
    }

    if (state.sessionId && ['PROCESSING', 'CANCEL_REQUESTED'].includes(state.status)) {
      try {
        await aiTrackingService.cancelSessionAnalysis(state.sessionId);
      } catch (error) {
        state.error = `Unable to request analysis cancellation: ${error instanceof Error ? error.message : 'connection error'}`;
        this.notify(projectId);
        throw error;
      }
      state.status = 'CANCEL_REQUESTED';
      state.error = null;
      this.notify(projectId);
      return;
    }

    // Abort in-flight upload
    const uploadCtrl = this.uploadControllers.get(projectId);
    if (uploadCtrl) {
      uploadCtrl.abort();
      this.uploadControllers.delete(projectId);
    }

    // Delete session from backend
    if (state.sessionId) {
      try {
        await aiTrackingService.deleteSession(state.sessionId);
      } catch (error) {
        state.error = `Unable to delete tracking session: ${error instanceof Error ? error.message : 'connection error'}`;
        this.notify(projectId);
        throw error;
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
  public async appendTelemetry(projectId: string, newFrames: TrackingTelemetryV1[], nextCursor: number): Promise<void> {
    const state = this.states.get(projectId);
    if (!state || nextCursor < state.cursor) return;
    if (newFrames.length > 0 && state.sessionId && nextCursor > state.cursor) {
      if (nextCursor - state.cursor !== newFrames.length) {
        throw new Error('Tracking result page cursor does not match its frame count');
      }
      const realFrames = newFrames.filter(
        (frame) => frame.isSynthetic !== true && frame.source !== 'synthetic_demo'
      );
      if (realFrames.length > 0 && realFrames.length !== newFrames.length) {
        throw new Error('Backend result page mixed synthetic and real tracking frames');
      }
      if (realFrames.length === newFrames.length) {
        await saveTrackingTelemetryPage({
          id: `${state.sessionId}:${String(state.cursor).padStart(20, '0')}`,
          analysisId: state.sessionId,
          startCursor: state.cursor,
          endCursor: nextCursor,
          frames: realFrames,
        });
      }
    }
    state.telemetry = mergeBoundedTelemetry(state.telemetry, newFrames);
    state.cursor = nextCursor;
    this.saveToStorage(projectId);
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
      const sessionId = state.sessionId;
      const existingAnalysis = await getTrackingAnalysis(sessionId);
      if (existingAnalysis?.status === "completed") {
        state.analysis = existingAnalysis;
        state.chunks = await getTrackingSampleChunks(sessionId, -1, MAX_TRACKING_PAGE_SIZE);
        const committedCursor = state.sessionStatus?.committedResultCursor;
        if (typeof committedCursor === 'number' && Number.isSafeInteger(committedCursor) && committedCursor >= 0) {
          state.cursor = committedCursor;
          this.saveToStorage(projectId);
        }
        state.status = "COMPLETED";
        state.progress = 100;
        return;
      }
      const count = state.trackedPlayerCount;
      const expectedIds = Array.from({ length: count }, (_, i) => `P${i + 1}`);
      const canonicalMetrics: Record<string, { totalDistanceM?: number }> = Object.fromEntries(
        expectedIds.map((playerId) => [playerId, {}])
      );
      for (const player of state.sessionStatus?.players ?? []) {
        if (player.playerId && typeof player.totalDistanceM === 'number' && Number.isFinite(player.totalDistanceM)) {
          canonicalMetrics[player.playerId] = { totalDistanceM: player.totalDistanceM };
        }
      }

      let totalSampleCount = state.sessionStatus?.committedResultCursor;
      if (typeof totalSampleCount === 'number' && (!Number.isSafeInteger(totalSampleCount) || totalSampleCount < 0)) {
        throw new Error('Backend committed result cursor is invalid');
      }
      if (typeof totalSampleCount !== 'number') {
        totalSampleCount = state.cursor || state.telemetry.length;
        const realFrames = state.telemetry.filter(
          (frame) => frame.isSynthetic !== true && frame.source !== 'synthetic_demo'
        );
        if (realFrames.length > 0 && realFrames.length !== state.telemetry.length) {
          throw new Error('Local telemetry mixed synthetic and real tracking frames');
        }
        if (state.cursor === 0 && realFrames.length > 0) {
          for (let offset = 0; offset < realFrames.length; offset += MAX_TRACKING_PAGE_SIZE) {
            const frames = realFrames.slice(offset, offset + MAX_TRACKING_PAGE_SIZE);
            await saveTrackingTelemetryPage({
              id: `${sessionId}:${String(offset).padStart(20, '0')}`,
              analysisId: sessionId,
              startCursor: offset,
              endCursor: offset + frames.length,
              frames,
            });
          }
        } else if (realFrames.length === 0) {
          // Synthetic demo frames are intentionally excluded from browser persistence.
          totalSampleCount = 0;
        }
      }

      // Repair gaps from an older browser cursor before turning the raw result pages into saved chunks.
      let resultCursor = 0;
      let realFrameCount = 0;
      while (resultCursor < totalSampleCount) {
        const localPage = await getTrackingTelemetryPage(sessionId, resultCursor);
        if (localPage && localPage.startCursor <= resultCursor && localPage.endCursor > resultCursor) {
          if (localPage.frames.length !== localPage.endCursor - localPage.startCursor) {
            throw new Error(`Persisted telemetry page length does not match its cursor range at ${localPage.startCursor}`);
          }
          const coveredEnd = Math.min(localPage.endCursor, totalSampleCount);
          realFrameCount += coveredEnd - resultCursor;
          resultCursor = coveredEnd;
          continue;
        }

        const gapEnd = localPage?.startCursor != null && localPage.startCursor > resultCursor
          ? Math.min(localPage.startCursor, totalSampleCount)
          : totalSampleCount;
        const requestedLimit = localPage?.startCursor != null && localPage.startCursor > resultCursor
          ? Math.min(MAX_TRACKING_PAGE_SIZE, gapEnd - resultCursor)
          : MAX_TRACKING_PAGE_SIZE;
        const page = await aiTrackingService.getSessionResults(sessionId, resultCursor, requestedLimit);
        if (
          page.nextCursor <= resultCursor ||
          page.nextCursor > gapEnd ||
          page.nextCursor > totalSampleCount ||
          page.telemetry.length !== page.nextCursor - resultCursor
        ) {
          throw new Error(`Missing durable telemetry page at result cursor ${resultCursor}`);
        }
        const realFrames = page.telemetry.filter(
          (frame) => frame.isSynthetic !== true && frame.source !== 'synthetic_demo'
        );
        if (realFrames.length > 0 && realFrames.length !== page.telemetry.length) {
          throw new Error('Backend result page mixed synthetic and real tracking frames');
        }
        if (realFrames.length > 0) {
          const storedPage = {
            id: `${sessionId}:${String(resultCursor).padStart(20, '0')}`,
            analysisId: sessionId,
            startCursor: resultCursor,
            endCursor: page.nextCursor,
            frames: realFrames,
          };
          await saveTrackingTelemetryPage(storedPage);
          realFrameCount += realFrames.length;
        }
        resultCursor = page.nextCursor;
      }

      // The backend committed cursor is the durable boundary; localStorage is only a hint.
      state.cursor = totalSampleCount;
      this.saveToStorage(projectId);
      if (realFrameCount === 0) {
        state.analysis = null;
        state.chunks = [];
        state.status = 'COMPLETED';
        state.progress = 100;
        return;
      }

      const builder = new TrackingAnalysisStreamBuilder(sessionId, expectedIds, 10, 15);
      builder.setCanonicalPlayerMetrics(canonicalMetrics);
      let transformCursor = 0;
      while (transformCursor < totalSampleCount) {
        const page = await getTrackingTelemetryPage(sessionId, transformCursor);
        if (!page || page.startCursor > transformCursor || page.endCursor <= transformCursor) {
          throw new Error(`Persisted telemetry chunk gap at cursor ${transformCursor}`);
        }
        const offset = transformCursor - page.startCursor;
        const committedLength = Math.min(page.endCursor, totalSampleCount) - transformCursor;
        const frames = page.frames.slice(offset, offset + committedLength);
        const chunks = builder.addFrames(frames);
        if (chunks.length) await saveTrackingSampleChunks(chunks);
        transformCursor = Math.min(page.endCursor, totalSampleCount);
      }

      let dispersionCursor = 0;
      while (dispersionCursor < totalSampleCount) {
        const page = await getTrackingTelemetryPage(sessionId, dispersionCursor);
        if (!page || page.startCursor > dispersionCursor || page.endCursor <= dispersionCursor) {
          throw new Error(`Persisted telemetry chunk gap during summary pass at cursor ${dispersionCursor}`);
        }
        const offset = dispersionCursor - page.startCursor;
        const committedLength = Math.min(page.endCursor, totalSampleCount) - dispersionCursor;
        builder.addDispersionFrames(page.frames.slice(offset, offset + committedLength));
        dispersionCursor = Math.min(page.endCursor, totalSampleCount);
      }
      const finalChunks = builder.finishChunks();
      if (finalChunks.length) await saveTrackingSampleChunks(finalChunks);
      const saved = builder.finish();
      const effectiveIds = [...new Set([...expectedIds, ...state.telemetry.flatMap((frame) => frame.players.map((player) => player.playerId))])].sort();

      const sourceFps = state.sessionStatus?.videoMetadata?.nominalFps ?? state.sessionStatus?.sourceFps;
      const frameStride = state.sessionStatus?.frameStride ?? state.processingConfig?.frameStride;
      const nominalAnalysisHz = calculateNominalAnalysisHz(sourceFps, frameStride);
      const effectiveStoredHz = calculateEffectiveStoredHz(
        saved.uniqueStoredTimestampCount,
        saved.summary.durationSeconds
      );
      const recentTelemetry = state.telemetry.filter(
        (frame) => frame.isSynthetic !== true && frame.source !== 'synthetic_demo'
      );

      const record: TrackingAnalysis = {
        id: state.sessionId,
        projectId,
        sportType: 'badminton',
        gameType: state.gameType,
        trackedPlayerCount: count,
        status: 'completed',
        videoFingerprint: state.videoFingerprint ?? undefined,
        engineVersion: recentTelemetry[0]?.engineVersion ?? '1.0.0',
        detectorModel: state.sessionStatus?.runtimeProvenance?.detectorModel ?? recentTelemetry[0]?.modelVersion ?? 'unknown',
        trackerModel: state.sessionStatus?.runtimeProvenance?.trackerModel ?? 'unknown',
        poseModel: state.sessionStatus?.runtimeProvenance?.poseModel,
        sampleRateHz: effectiveStoredHz,
        persistedTargetHz: 10,
        nominalAnalysisHz,
        effectiveStoredHz,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        device: state.sessionStatus?.effectiveDevice || state.sessionStatus?.device,
        effectiveDevice: state.sessionStatus?.effectiveDevice || state.sessionStatus?.device,
        runtimeProvenance: state.sessionStatus?.runtimeProvenance,
        calibrationTimeline: saved.calibrationTimeline,
        videoMetadata: state.sessionStatus?.videoMetadata,
        researchMetadata: state.sessionStatus?.researchMetadata,
        localFileName: state.localFileName ?? undefined,
        analyzedFrames: state.sessionStatus?.analyzedFrames ?? totalSampleCount,
        totalFrames: state.sessionStatus?.totalFrames ?? state.totalFrames,
        processingConfig: state.processingConfig,
        performance: state.sessionStatus?.performance,
        qualityStats: state.sessionStatus?.quality,
        players: effectiveIds.map((playerId) => {
          const lastObserved = [...recentTelemetry]
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

      await saveTrackingAnalysisRecord(record);
      state.analysis = record;
      state.chunks = await getTrackingSampleChunks(sessionId, -1, MAX_TRACKING_PAGE_SIZE);
      state.status = 'COMPLETED';
      state.progress = 100;
      try {
        await deleteTrackingTelemetryPages(sessionId);
      } catch (error) {
        state.error = `Analysis completed; temporary telemetry cleanup failed: ${error instanceof Error ? error.message : 'storage error'}`;
      }
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
