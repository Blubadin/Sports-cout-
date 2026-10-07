/**
 * trackingSessionApi.ts — Canonical Production Client for SportsScout Tracking Lab
 *
 * Dedicated, typed API client for interacting with the FastAPI CV backend sessions:
 * - Session lifecycle: create, upload video, court calibration, start analysis, status polling, results retrieval, listing, deletion.
 * - Hardware capabilities & backend health reporting.
 * - Schema conversion into canonical TrackingTelemetryV1.
 *
 * This client contains NO synthetic browser simulation, NO fake skeletons, and NO fake stroke recognitions.
 */

import type {
  AITelemetryFrame,
  TrackingTelemetryV1,
  TrackingSessionStatus,
  ProcessingConfig,
  TrackingPerformanceStats,
  TrackingQualityStats,
  ShuttleProvenance,
} from '../types';
import { isCalibrationState, isMetricCalibrationValid, parseCalibrationProvenance } from '../types/calibration';
import { parseSceneEvidence, parseSceneTransition } from '../types/scene';
import { parseSegmentCapabilities } from '../types/capabilities';
import type {
  StartExportRequest,
  StartExportResponse,
  ExportJobProgress,
} from '../types/export';
import {
  AIConnectionError,
  type AIConnectionCode,
  type AIConnectionSnapshot,
  resolveAiConnection,
  toWebSocketUrl,
} from './aiConnection';

export type BadmintonGameType = 'singles' | 'doubles';
export type AIConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type AIEngineMode = 'browser' | 'server';
export const MAX_TRACKING_RESULTS_PAGE_SIZE = 250;

function normalizePoseCoordinateSpace(pose: any, sourceSchemaVersion: unknown): any {
  if (!pose || typeof pose !== 'object') return pose;
  if (pose.keypointCoordinateSpace === 'pixel' || pose.keypointCoordinateSpace === 'normalized_percent') {
    return pose;
  }
  // SchemaVersion 1 poses predate the marker but the backend serialized their
  // x/y values as 0..100 source-frame percentages. Unknown schemas stay unavailable.
  if (pose.keypointCoordinateSpace == null && sourceSchemaVersion === 1) {
    return { ...pose, keypointCoordinateSpace: 'normalized_percent' };
  }
  return undefined;
}

export interface MarkingState {
  isMarking: boolean;
  step: number;
  totalSteps: number;
  targetPlayerId: number;
  targetPlayerName: string;
}

export function getAiHost(): string {
  const endpoint = resolveAiConnection().endpoint;
  return endpoint ? new URL(endpoint).hostname : '127.0.0.1';
}

export interface BackendCapabilities {
  selectedDevice: string;
  cudaAvailable: boolean;
  mpsAvailable: boolean;
  detectorModel?: string;
  poseModel?: string;
  shuttle?: ShuttleProvenance & {
    modelAvailable?: boolean;
    configuredModel?: string | null;
    probeStatus?: string;
    probeFailureReason?: string | null;
  };
}

export interface TrackingSessionSummary {
  sessionId: string;
  runId: string;
  status: string;
  gameType: BadmintonGameType;
  projectId: string | null;
  videoFingerprint: string | null;
  progressPct: number;
  currentFrame: number;
  totalFrames: number;
  trackedPlayerCount?: number;
  processingConfig?: ProcessingConfig;
  resumable: boolean;
  resume?: { available?: boolean; mode?: string | null; reason?: string | null; [key: string]: unknown };
  checkpointSequence?: number;
  committedCursor?: number;
  lastProcessedFrame?: number;
  error?: string | null;
}

export interface TrackingSessionPage {
  sessions: TrackingSessionSummary[];
  nextCursor: string | null;
  maximumPageSize: number;
  recoveryIssues: string[];
  recoveryIssueCount: number;
  recoveryIssuesTruncated: boolean;
  pageIssues: string[];
  pageIssueCount: number;
  pageIssuesTruncated: boolean;
}

export const MAX_TRACKING_SESSION_PAGE_SIZE = 250;

export interface TrackingSessionCompatibility {
  projectId: string;
  videoFingerprint: string | null;
  processingConfig: ProcessingConfig;
  runId?: string | null;
}

const RESUME_CONFIG_KEYS: Array<keyof ProcessingConfig> = [
  'profile', 'requestedProfile', 'device', 'requestedDevice',
  'detectorInputSize', 'useCourtRoi', 'courtRoiMarginPx', 'courtRoiMarginM',
  'frameStride', 'poseStride', 'detectorModel', 'detectorFamily', 'poseModel', 'poseFamily',
  'poseArchitecture', 'trackerName', 'trackerConfigPath', 'trackerConfig', 'reidEnabled', 'reidModel',
  'runtime', 'precision', 'confidenceThreshold', 'autoCourtCalibrationEnabled',
  'shuttleEnabled', 'shuttleProvider', 'shuttleModelPath', 'shuttleWindowSize',
  'shuttleInputWidth', 'shuttleInputHeight', 'shuttleConfidenceThreshold',
  'shuttleCentroidRelativeThreshold', 'shuttleCandidateMode', 'shuttleRecoveryEnabled',
  'shuttleDevice', 'shuttleRuntime', 'shuttlePrecision', 'shuttleAuxiliaryDetector', 'shuttleBuildTrajectory',
];

function sessionConfigMatches(expected: ProcessingConfig, actual: ProcessingConfig | undefined): boolean {
  if (!actual) return false;
  return RESUME_CONFIG_KEYS.every((key) => expected[key] === undefined || expected[key] === actual[key]);
}

export function isCompatibleResumableTrackingSession(
  candidate: TrackingSessionSummary,
  expected: TrackingSessionCompatibility,
): boolean {
  if (candidate.projectId !== expected.projectId || !expected.videoFingerprint ||
    candidate.videoFingerprint !== expected.videoFingerprint ||
    candidate.runId !== candidate.sessionId ||
    (expected.runId && candidate.runId !== expected.runId)
  ) return false;
  if (!['VIDEO_READY', 'READY_TO_ANALYZE', 'PROCESSING', 'CANCELLED', 'INTERRUPTED', 'COMPLETED'].includes(candidate.status)) return false;
  if (['CANCELLED', 'INTERRUPTED'].includes(candidate.status) && (!candidate.resumable || candidate.resume?.available !== true)) return false;
  if (!Number.isSafeInteger(candidate.checkpointSequence) || (candidate.checkpointSequence ?? -1) < 0 ||
    !Number.isSafeInteger(candidate.committedCursor) || (candidate.committedCursor ?? -1) < 0 ||
    (candidate.committedCursor ?? 0) < (candidate.checkpointSequence ?? 0) ||
    (candidate.committedCursor ?? 0) > (candidate.checkpointSequence ?? 0) * 256) return false;
  return sessionConfigMatches(expected.processingConfig, candidate.processingConfig);
}

function asConnectionFailure(code: AIConnectionCode): Exclude<AIConnectionCode, 'CONNECTED'> {
  return code === 'CONNECTED' ? 'NETWORK_ERROR' : code;
}

export class TrackingSessionApiClient {
  private activeBaseUrl: string | null = null;
  private credential: string | null = null;
  private connectionSnapshot: AIConnectionSnapshot = resolveAiConnection();
  private status: AIConnectionStatus = 'disconnected';
  private mode: AIEngineMode = 'server';
  private gameType: BadmintonGameType = 'doubles';
  private latestFrame: AITelemetryFrame | null = null;
  private telemetryListeners: Set<(frame: AITelemetryFrame) => void> = new Set();
  private telemetryV1Listeners: Set<(telemetry: TrackingTelemetryV1) => void> = new Set();
  private statusListeners: Set<(status: AIConnectionStatus) => void> = new Set();
  private telemetrySocket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  public setBaseUrl(url: string | null): void {
    this.activeBaseUrl = url?.trim().replace(/\/+$/, '') || null;
    this.connectionSnapshot = this.resolveConnection();
  }

  /** Runtime-only bearer credential. It is never persisted by this client. */
  public setCredential(token: string | null): void {
    this.credential = token?.trim() || null;
  }

  public getConnectionSnapshot(): AIConnectionSnapshot {
    return this.connectionSnapshot;
  }

  public getApiUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const connection = this.resolveConnection();
    if (!connection.endpoint || connection.code !== 'CONNECTED') {
      throw new AIConnectionError(asConnectionFailure(connection.code));
    }
    return `${connection.endpoint}${cleanPath}`;
  }

  public getStatus(): AIConnectionStatus {
    return this.status;
  }

  public getMode(): AIEngineMode {
    return this.mode;
  }

  public setMode(mode: AIEngineMode): void {
    this.mode = mode;
  }

  public getGameType(): BadmintonGameType {
    return this.gameType;
  }

  public setGameType(gt: BadmintonGameType): void {
    this.gameType = gt;
  }

  public getLatestFrame(): AITelemetryFrame | null {
    return this.latestFrame;
  }

  public getLatestTelemetryV1(): TrackingTelemetryV1 | null {
    return this.latestFrame ? toTrackingTelemetryV1(this.latestFrame) : null;
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.telemetrySocket?.close();
    this.telemetrySocket = null;
    this.setStatus('disconnected');
  }

  public onStatus(cb: (status: AIConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  public onTelemetry(cb: (frame: AITelemetryFrame) => void): () => void {
    this.telemetryListeners.add(cb);
    return () => this.telemetryListeners.delete(cb);
  }

  public onTelemetryV1(cb: (telemetry: TrackingTelemetryV1) => void): () => void {
    this.telemetryV1Listeners.add(cb);
    return () => this.telemetryV1Listeners.delete(cb);
  }

  public emitTelemetry(frame: AITelemetryFrame): void {
    this.latestFrame = frame;
    this.telemetryListeners.forEach((cb) => cb(frame));
    const v1 = toTrackingTelemetryV1(frame);
    this.telemetryV1Listeners.forEach((cb) => cb(v1));
  }

  public async checkConnection(): Promise<AIConnectionSnapshot> {
    const initial = this.resolveConnection();
    if (initial.code !== 'CONNECTED') return initial;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      await this.request('/api/capabilities', { signal: controller.signal });
      clearTimeout(id);
      return this.setConnectionSnapshot({ ...initial, code: 'CONNECTED', connected: true });
    } catch (error) {
      const code = error instanceof AIConnectionError ? error.code : 'NETWORK_ERROR';
      return this.setConnectionSnapshot({ ...initial, code, connected: false });
    }
  }

  public async checkBackendHealth(): Promise<boolean> {
    return (await this.checkConnection()).code === 'CONNECTED';
  }

  public async getCapabilities(): Promise<BackendCapabilities> {
    const res = await this.request('/api/capabilities');
    return res.json();
  }

  public async createSession(
    gameType: BadmintonGameType,
    videoSource: string = 'demo',
    options?: {
      projectId?: string | null;
      videoFingerprint?: string | null;
      device?: 'auto' | 'cpu' | 'cuda' | 'mps';
      trackedPlayerCount?: number;
      processingConfig?: ProcessingConfig;
    }
  ): Promise<{
    sessionId: string;
    status: string;
    trackedPlayerCount?: number;
    processingConfig?: ProcessingConfig;
  }> {
    const res = await this.request('/api/tracking/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_source: videoSource,
        game_type: gameType,
        project_id: options?.projectId ?? null,
        video_fingerprint: options?.videoFingerprint ?? null,
        device: options?.device ?? 'auto',
        tracked_player_count: options?.trackedPlayerCount ?? (gameType === 'singles' ? 2 : 4),
        processing_config: options?.processingConfig ?? null,
      }),
    });
    return res.json();
  }

  public async uploadSessionVideo(
    sessionId: string,
    file: File,
    signal?: AbortSignal
  ): Promise<{ width: number; height: number }> {
    const encodedFilename = encodeURIComponent(file.name);
    const res = await this.request(
      `/api/tracking/sessions/${sessionId}/video?filename=${encodedFilename}`,
      {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        signal,
      },
      true,
      true
    );
    if (!res.ok) {
      const payload = await res.json().catch(() => null) as { detail?: unknown } | null;
      const detail = typeof payload?.detail === 'string' ? payload.detail : 'Video upload was rejected.';
      throw new Error(this.redactCredential(detail));
    }
    return res.json();
  }

  public async calibrateSession(
    sessionId: string,
    corners: number[][],
    gameType: BadmintonGameType,
    cameraSegmentIdOrOptions?: string | {
      cameraSegmentId?: string;
      frameIndex?: number;
      timestampSec?: number;
      calibrationVersion?: string;
    },
    selectedFrame?: { frameIndex: number; timestampSec: number },
  ): Promise<Pick<TrackingTelemetryV1, 'cameraSegmentId' | 'calibrationId' | 'calibrationState' | 'calibrationConfidence' | 'calibration'>> {
    const opts = typeof cameraSegmentIdOrOptions === 'string'
      ? { camera_segment_id: cameraSegmentIdOrOptions }
      : cameraSegmentIdOrOptions
        ? {
            camera_segment_id: cameraSegmentIdOrOptions.cameraSegmentId,
            frame_index: cameraSegmentIdOrOptions.frameIndex,
            timestamp_sec: cameraSegmentIdOrOptions.timestampSec,
            calibration_version: cameraSegmentIdOrOptions.calibrationVersion,
          }
        : {};
    const res = await this.request(`/api/tracking/sessions/${sessionId}/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        corners, game_type: gameType, ...opts,
        ...(selectedFrame ? {
          selected_at_frame_index: selectedFrame.frameIndex,
          selected_at_timestamp_sec: selectedFrame.timestampSec,
        } : {}),
      }),
    });
    return res.json();
  }

  public async assignSessionPlayers(
    sessionId: string,
    players: { player_id: number; bbox: number[]; name?: string }[]
  ): Promise<void> {
    await this.request(`/api/tracking/sessions/${sessionId}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players }),
    });
  }

  public async startSessionAnalysis(sessionId: string): Promise<void> {
    await this.request(`/api/tracking/sessions/${sessionId}/start`, {
      method: 'POST',
    });
  }

  public async cancelSessionAnalysis(sessionId: string): Promise<{ status: string }> {
    const res = await this.request(`/api/tracking/sessions/${sessionId}/cancel`, { method: 'POST' });
    return res.json();
  }

  public async getSessionStatus(sessionId: string, signal?: AbortSignal): Promise<TrackingSessionStatus> {
    const res = await this.request(`/api/tracking/sessions/${sessionId}/status`, { signal });
    return res.json();
  }

  public async getSessionResults(
    sessionId: string,
    after?: number,
    limit = MAX_TRACKING_RESULTS_PAGE_SIZE,
    signal?: AbortSignal,
  ): Promise<{
    sessionId: string;
    status: string;
    sampleCount: number;
    totalSampleCount: number;
    nextCursor: number;
    maximumPageSize?: number;
    trackedPlayerCount?: number;
    processingConfig?: ProcessingConfig;
    performance?: TrackingPerformanceStats;
    quality?: TrackingQualityStats;
    telemetry: TrackingTelemetryV1[];
  }> {
    const params = new URLSearchParams();
    if (after !== undefined) params.set('after', String(after));
    params.set('limit', String(limit));
    const query = `?${params.toString()}`;
    const res = await this.request(`/api/tracking/sessions/${sessionId}/results${query}`, { signal });
    const payload = await res.json();
    return { ...payload, telemetry: (payload.telemetry || []).map(toTrackingTelemetryV1) };
  }

  public async listSessions(
    projectId?: string | null,
    afterCursor?: string | null,
    limit = MAX_TRACKING_SESSION_PAGE_SIZE,
  ): Promise<TrackingSessionPage> {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', projectId);
    if (afterCursor) params.set('after', afterCursor);
    params.set('limit', String(Math.max(1, Math.min(MAX_TRACKING_SESSION_PAGE_SIZE, Math.floor(limit)))));
    const res = await this.request(`/api/tracking/sessions?${params.toString()}`);
    const payload = (await res.json()) as {
      sessions?: TrackingSessionSummary[];
      nextCursor?: string | null;
      maximumPageSize?: number;
      recoveryIssues?: string[];
      recoveryIssueCount?: number;
      recoveryIssuesTruncated?: boolean;
      pageIssues?: string[];
      pageIssueCount?: number;
      pageIssuesTruncated?: boolean;
    };
    const recoveryIssues = payload.recoveryIssues ?? [];
    return {
      sessions: payload.sessions ?? [],
      nextCursor: payload.nextCursor ?? null,
      maximumPageSize: payload.maximumPageSize ?? MAX_TRACKING_SESSION_PAGE_SIZE,
      recoveryIssues,
      recoveryIssueCount: payload.recoveryIssueCount ?? recoveryIssues.length,
      recoveryIssuesTruncated: payload.recoveryIssuesTruncated ?? false,
      pageIssues: payload.pageIssues ?? [],
      pageIssueCount: payload.pageIssueCount ?? payload.pageIssues?.length ?? 0,
      pageIssuesTruncated: payload.pageIssuesTruncated ?? false,
    };
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.request(`/api/tracking/sessions/${sessionId}`, { method: 'DELETE' });
  }

  public async startSessionExport(
    sessionId: string,
    req?: StartExportRequest
  ): Promise<StartExportResponse> {
    const res = await this.request(`/api/tracking/sessions/${sessionId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req ?? {}),
    });
    return res.json();
  }

  public async getExportStatus(exportId: string): Promise<ExportJobProgress> {
    const res = await this.request(`/api/tracking/exports/${exportId}/status`);
    return res.json();
  }

  public async cancelExport(exportId: string): Promise<{ exportId: string; status: string }> {
    const res = await this.request(`/api/tracking/exports/${exportId}/cancel`, {
      method: 'POST',
    });
    return res.json();
  }

  public getExportDownloadUrl(exportId: string): string {
    return this.getApiUrl(`/api/tracking/exports/${exportId}/download`);
  }

  public connectTelemetry(): WebSocket {
    const connection = this.resolveConnection();
    if (!connection.endpoint || connection.code !== 'CONNECTED') {
      throw new AIConnectionError(asConnectionFailure(connection.code));
    }
    if (typeof WebSocket === 'undefined') {
      throw new AIConnectionError('BROWSER_SECURITY_BLOCKED');
    }

    const protocols = this.credential ? ['sportscout', `auth.${this.credential}`] : ['sportscout'];
    const socket = new WebSocket(toWebSocketUrl(connection.endpoint), protocols);
    this.telemetrySocket = socket;
    this.setStatus('connecting');
    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setConnectionSnapshot({ ...connection, code: 'CONNECTED', connected: true });
      this.setStatus('connected');
    };
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; data?: AITelemetryFrame };
        if (payload.type === 'telemetry' && payload.data) this.emitTelemetry(payload.data);
      } catch {
        // Ignore malformed telemetry; it does not alter connection authorization.
      }
    };
    socket.onclose = (event) => {
      this.telemetrySocket = null;
      if (event.code === 4401) {
        this.setConnectionSnapshot({
          ...connection,
          code: this.credential ? 'AUTH_FAILED' : 'AUTH_REQUIRED',
          connected: false,
        });
        this.setStatus('error');
        return;
      }
      this.setConnectionSnapshot({ ...connection, code: 'AI_OFFLINE', connected: false });
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };
    return socket;
  }

  private resolveConnection(): AIConnectionSnapshot {
    return this.setConnectionSnapshot(resolveAiConnection({ configuredEndpoint: this.activeBaseUrl }));
  }

  private setConnectionSnapshot(snapshot: AIConnectionSnapshot): AIConnectionSnapshot {
    this.connectionSnapshot = snapshot;
    return snapshot;
  }

  private setStatus(status: AIConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.reconnectAttempts >= 3) return;
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      try {
        this.connectTelemetry();
      } catch {
        // The typed snapshot already describes a configuration/security failure.
      }
    }, 1000 * this.reconnectAttempts);
  }

  private async request(
    path: string,
    init: RequestInit = {},
    sensitive = true,
    preserveValidationError = false
  ): Promise<Response> {
    const url = this.getApiUrl(path);
    const headers = this.mergeHeaders(init.headers, sensitive);
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new AIConnectionError(this.classifyTransportError(error));
    }
    if (response.status === 401) {
      throw new AIConnectionError(this.credential ? 'AUTH_FAILED' : 'AUTH_REQUIRED');
    }
    if (response.status === 403) throw new AIConnectionError('AUTH_FAILED');
    if (!response.ok) {
      if (preserveValidationError && response.status === 422) return response;
      if (response.status === 409) throw new AIConnectionError('AI_SESSION_CONFLICT');
      if (response.status === 429) throw new AIConnectionError('AI_BUSY');
      if (response.status >= 500) throw new AIConnectionError('AI_SERVER_ERROR');
      throw new AIConnectionError('AI_REQUEST_REJECTED');
    }
    return response;
  }

  private mergeHeaders(headers: HeadersInit | undefined, sensitive: boolean): Record<string, string> {
    const merged: Record<string, string> = {};
    if (headers instanceof Headers) headers.forEach((value, key) => { merged[key] = value; });
    else if (Array.isArray(headers)) headers.forEach(([key, value]) => { merged[key] = value; });
    else if (headers) Object.assign(merged, headers);
    if (sensitive && this.credential) merged.Authorization = `Bearer ${this.credential}`;
    return merged;
  }

  private classifyTransportError(error: unknown): Exclude<AIConnectionCode, 'CONNECTED'> {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('content security policy')) return 'CSP_BLOCKED';
    if (message.includes('mixed content') || message.includes('blocked')) return 'BROWSER_SECURITY_BLOCKED';
    if (message.includes('abort') || message.includes('failed to fetch') || message.includes('networkerror')) return 'AI_OFFLINE';
    return 'NETWORK_ERROR';
  }

  private redactCredential(value: string): string {
    return this.credential ? value.split(this.credential).join('[redacted]') : value;
  }
}

/**
 * Converts legacy or raw telemetry frame into canonical TrackingTelemetryV1 schema.
 * Preserves MOT identity independence and does not invent fake tracking state.
 */
export function toTrackingTelemetryV1(frame: any): TrackingTelemetryV1 {
  const isSynthetic =
    frame.isSynthetic ??
    (frame.source
      ? frame.source.includes('synthetic') ||
        frame.source.includes('simulated') ||
        frame.source.includes('browser')
      : false);

  const hasCalibrationFields = frame.calibrationState !== undefined || frame.calibration !== undefined ||
    frame.cameraSegmentId !== undefined || frame.calibrationId !== undefined || frame.calibrationConfidence !== undefined;
  const parsedCalibration = parseCalibrationProvenance(frame.calibration);
  const calibrationState = !hasCalibrationFields ? undefined :
    isCalibrationState(frame.calibrationState) ? frame.calibrationState :
      frame.calibrationState === undefined && parsedCalibration ? parsedCalibration.state : 'UNCALIBRATED';
  const cameraSegmentId = typeof frame.cameraSegmentId === 'string' && frame.cameraSegmentId
    ? frame.cameraSegmentId : parsedCalibration?.cameraSegmentId;
  const calibrationId = typeof frame.calibrationId === 'string' && frame.calibrationId
    ? frame.calibrationId : frame.calibrationId === null ? null : parsedCalibration?.calibrationId ?? null;
  const calibration = parsedCalibration && parsedCalibration.state === calibrationState &&
    parsedCalibration.cameraSegmentId === cameraSegmentId && parsedCalibration.calibrationId === calibrationId
    ? parsedCalibration : null;
  const metricValid = isMetricCalibrationValid({ calibrationState, cameraSegmentId, calibrationId, calibration });

  const sceneTransition = parseSceneTransition(frame.sceneTransition || frame.scene_transition);
  const capabilities = parseSegmentCapabilities(frame.capabilities)
    ?? parseSegmentCapabilities(frame.sceneTransition?.capabilities)
    ?? sceneTransition?.capabilities
    ?? null;
  const isMetricValid = frame.isMetricValid ?? frame.is_metric_valid ?? capabilities?.canUseCourtMetric.enabled ?? metricValid;
  const allowCanonicalWrites = frame.allowCanonicalWrites ?? frame.allow_canonical_writes ?? capabilities?.canWriteCanonicalMatchData.enabled ?? (metricValid && (frame.sceneState === 'COURT_PLAY' || !frame.sceneState));

  return {
    schemaVersion: 1,
    analysisId: frame.analysisId || 'tracking_session',
    pipelineRunId: frame.pipelineRunId || frame.pipeline_run_id || frame.analysisId || 'tracking_session',
    timestampSec: frame.timestampSec ?? frame.timestamp,
    frameIndex: frame.frameIndex ?? frame.frame_idx,
    timebase: frame.timebase ?? null,
    sceneState: frame.sceneState || frame.scene_state || null,
    sceneTransition,
    sceneEvidence: parseSceneEvidence(frame.sceneEvidence || frame.scene_evidence),
    capabilities,
    canTrackPlayer: typeof frame.canTrackPlayer === 'boolean'
      ? frame.canTrackPlayer
      : capabilities?.canTrackPlayer.enabled ?? true,
    canTrackShuttle: typeof frame.canTrackShuttle === 'boolean'
      ? frame.canTrackShuttle
      : capabilities?.canTrackShuttle.enabled ?? true,
    canUseCourtMetric: typeof frame.canUseCourtMetric === 'boolean'
      ? frame.canUseCourtMetric
      : capabilities?.canUseCourtMetric.enabled ?? isMetricValid,
    canBuildHeatmap: typeof frame.canBuildHeatmap === 'boolean'
      ? frame.canBuildHeatmap
      : capabilities?.canBuildHeatmap.enabled ?? isMetricValid,
    // Structured capability is canonical. Boolean-only legacy payloads cannot
    // prove current image observations, so they remain unavailable.
    canEstimateHit: capabilities?.canEstimateHit.enabled ?? false,
    canWriteCanonicalMatchData: typeof frame.canWriteCanonicalMatchData === 'boolean'
      ? frame.canWriteCanonicalMatchData
      : capabilities?.canWriteCanonicalMatchData.enabled ?? allowCanonicalWrites,
    isMetricValid,
    allowCanonicalWrites,
    calibrationUnavailableReason: frame.calibrationUnavailableReason || frame.calibration_unavailable_reason || null,
    engineVersion: frame.engineVersion || '1.0.0',
    modelVersion: frame.modelVersion || 'badminton-tracking-v1',
    modelArtifactHash: frame.modelArtifactHash || frame.model_artifact_hash || null,
    runtime: frame.runtime || null,
    requestedDevice: frame.requestedDevice || frame.requested_device || null,
    effectiveDevice: frame.effectiveDevice || frame.effective_device || frame.device || null,
    precision: frame.precision || null,
    ...(hasCalibrationFields ? {
      cameraSegmentId,
      calibrationId,
      calibrationVersion: frame.calibrationVersion || frame.calibration_version || (calibrationId ?? null),
      calibrationState,
      calibrationConfidence: calibrationState === 'CALIBRATED' && metricValid
        ? calibration?.confidence ?? null : null,
      calibration,
    } : {}),
    confidence: frame.confidence ?? null,
    observationState: frame.observationState || frame.observation_state || 'observed',
    reviewState: frame.reviewState || frame.review_state || 'unreviewed',
    supersededBy: frame.supersededBy || frame.superseded_by || null,
    isSynthetic,
    source: frame.source || (isSynthetic ? 'synthetic_demo' : 'real_tracking'),
    trackedPlayerCount: frame.trackedPlayerCount ?? frame.tracked_player_count,
    rawPlayerDetections: (frame.rawPlayerDetections || frame.raw_player_detections || []).map((d: any) => {
      const bbox = d.bboxPx || d.bbox;
      return {
        trackId: d.trackId ?? d.track_id ?? null,
        bboxPx: [Number(bbox[0]), Number(bbox[1]), Number(bbox[2]), Number(bbox[3])] as [number, number, number, number],
        confidence: typeof d.confidence === 'number' ? d.confidence : (typeof d.conf === 'number' ? d.conf : null),
        pose: normalizePoseCoordinateSpace(d.pose ?? d.pose_obj ?? null, frame.schemaVersion) ?? null,
        eligibility: d.eligibility ?? null,
      };
    }),
    players: (frame.players || []).map((p: any) => {
      const posPct = p.court_pos_pct;
      const posM = p.court_pos_m;
      const courtPos =
        p.courtPosition ??
        (posM && posPct
          ? {
              xM: posM.x,
              yM: posM.y,
              xPct: posPct.x,
              yPct: posPct.y,
            }
          : null);
      const hasCanonicalGroundPoint = Object.prototype.hasOwnProperty.call(p, 'groundPointPct');
      const groundPoint = hasCanonicalGroundPoint
        ? p.groundPointPct
        : (p.video_bbox_pct
          ? {
              x: Number((p.video_bbox_pct.x + p.video_bbox_pct.width / 2).toFixed(2)),
              y: Number((p.video_bbox_pct.y + p.video_bbox_pct.height).toFixed(2)),
            }
          : undefined);
      const normalizeFoot = (foot: any) => foot && typeof foot === 'object'
        ? { ...foot, ...(metricValid ? {} : { courtPositionM: null }) }
        : foot;
      const pose = normalizePoseCoordinateSpace(p.pose, frame.schemaVersion);
      const groundPositionM = metricValid
        ? (p.groundPositionM !== undefined ? p.groundPositionM : p.courtPositionM)
        : null;
      const leftFootCourtM = metricValid
        ? (p.leftFootCourtM !== undefined ? p.leftFootCourtM : p.leftFoot?.courtPositionM)
        : null;
      const rightFootCourtM = metricValid
        ? (p.rightFootCourtM !== undefined ? p.rightFootCourtM : p.rightFoot?.courtPositionM)
        : null;

      const state =
        p.state ||
        (p.is_active !== undefined
          ? p.is_active
            ? 'observed'
            : 'lost'
          : p.observationState === 'predicted'
            ? 'predicted'
            : 'observed');
      const observationState =
        state === 'lost'
          ? null
          : p.observationState !== undefined
          ? p.observationState
          : p.observation_state !== undefined
            ? p.observation_state
            : state === 'predicted'
              ? 'predicted'
              : state === 'lost'
                ? null
                : 'observed';
      const groundPointProvenance =
        state === 'lost' ? null : (p.groundPointProvenance || p.ground_point_provenance || null);

      return {
        playerId: p.playerId || `P${p.id}`,
        athleteId: p.athleteId || p.athlete_id || null,
        trackId: p.trackId,
        teamCode: p.teamCode || (p.team ? `team${p.team}` : undefined),
        bboxPct: state === 'lost' ? null : (p.bboxPct || p.video_bbox_pct),
        groundPointPct: state === 'lost' ? null : groundPoint,
        groundPointProvenance,
        groundPositionM,
        courtPositionM: metricValid
          ? (p.courtPositionM !== undefined ? p.courtPositionM : posM ?? null)
          : null,
        leftFootPx: p.leftFootPx !== undefined ? p.leftFootPx : p.leftFoot?.positionPx ?? null,
        rightFootPx: p.rightFootPx !== undefined ? p.rightFootPx : p.rightFoot?.positionPx ?? null,
        leftFootConfidence: p.leftFootConfidence !== undefined ? p.leftFootConfidence : p.leftFoot?.confidence ?? null,
        rightFootConfidence: p.rightFootConfidence !== undefined ? p.rightFootConfidence : p.rightFoot?.confidence ?? null,
        leftFootCourtM,
        rightFootCourtM,
        leftFoot: normalizeFoot(p.leftFoot),
        rightFoot: normalizeFoot(p.rightFoot),
        courtPosition: metricValid ? courtPos : null,
        absoluteZone: metricValid ? (p.absoluteZone ?? p.zone) : null,
        playerRelativeZone: metricValid ? (p.playerRelativeZone ?? p.zone) : null,
        speedMps: metricValid ? (p.speedMps ?? p.speed_ms) : null,
        totalDistanceM: metricValid ? (p.totalDistanceM ?? p.total_dist_m ?? null) : null,
        detectionConfidence: typeof p.detectionConfidence === 'number' ? p.detectionConfidence : null,
        confidence: typeof p.confidence === 'number' ? p.confidence : (typeof p.detectionConfidence === 'number' ? p.detectionConfidence : null),
        state,
        observationState,
        reviewState: p.reviewState || p.review_state || 'unreviewed',
        pose: state === 'lost' ? null : pose,
      };
    }),
    shuttle: frame.shuttle
      ? {
          timestampSec: frame.shuttle.timestampSec ?? (frame.timestampSec ?? frame.timestamp),
          frameIndex: frame.shuttle.frameIndex ?? (frame.frameIndex ?? frame.frame_idx),
          positionPx:
            frame.shuttle.positionPx !== null && frame.shuttle.positionPx !== undefined
              ? {
                  x: Number(frame.shuttle.positionPx.x),
                  y: Number(frame.shuttle.positionPx.y),
                }
              : null,
          confidence: typeof frame.shuttle.confidence === 'number' ? frame.shuttle.confidence : null,
          state: frame.shuttle.state || 'unknown',
          source: frame.shuttle.source || 'unknown',
          trajectoryId: frame.shuttle.trajectoryId ?? null,
          velocityPxPerSec: frame.shuttle.velocityPxPerSec ?? null,
          speedPxPerSec: frame.shuttle.speedPxPerSec ?? null,
          ...(frame.shuttle.trackingState !== undefined ? { trackingState: frame.shuttle.trackingState } : {}),
          ...(frame.shuttle.warmupRemainingFrames !== undefined ? { warmupRemainingFrames: frame.shuttle.warmupRemainingFrames } : {}),
          ...(frame.shuttle.validity !== undefined ? { validity: frame.shuttle.validity } : {}),
          ...(frame.shuttle.evidenceFusion !== undefined ? { evidenceFusion: frame.shuttle.evidenceFusion } : {}),
          ...(typeof (frame.shuttle.cameraSegmentId || frame.shuttle.camera_segment_id) === 'string'
            ? { cameraSegmentId: frame.shuttle.cameraSegmentId || frame.shuttle.camera_segment_id }
            : {}),
          ...(typeof (frame.shuttle.pipelineRunId || frame.shuttle.pipeline_run_id) === 'string'
            ? { pipelineRunId: frame.shuttle.pipelineRunId || frame.shuttle.pipeline_run_id }
            : {}),
        }
      : null,
  };
}

export const trackingSessionApi = new TrackingSessionApiClient();
