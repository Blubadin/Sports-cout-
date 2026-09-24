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
    gameType: BadmintonGameType
  ): Promise<void> {
    await this.request(`/api/tracking/sessions/${sessionId}/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corners, game_type: gameType }),
    });
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

  public async getSessionStatus(sessionId: string): Promise<TrackingSessionStatus> {
    const res = await this.request(`/api/tracking/sessions/${sessionId}/status`);
    return res.json();
  }

  public async getSessionResults(
    sessionId: string,
    after?: number
  ): Promise<{
    sessionId: string;
    status: string;
    sampleCount: number;
    totalSampleCount: number;
    nextCursor: number;
    trackedPlayerCount?: number;
    processingConfig?: ProcessingConfig;
    performance?: TrackingPerformanceStats;
    quality?: TrackingQualityStats;
    telemetry: TrackingTelemetryV1[];
  }> {
    const query = after !== undefined ? `?after=${encodeURIComponent(after)}` : '';
    const res = await this.request(`/api/tracking/sessions/${sessionId}/results${query}`);
    return res.json();
  }

  public async listSessions(projectId?: string | null): Promise<TrackingSessionSummary[] | { sessions: TrackingSessionSummary[] }> {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    const res = await this.request(`/api/tracking/sessions${query}`);
    const payload = (await res.json()) as {
      sessions?: TrackingSessionSummary[];
    };
    return payload.sessions ?? [];
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.request(`/api/tracking/sessions/${sessionId}`, { method: 'DELETE' });
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
      throw new AIConnectionError(this.classifyTransportError(error));
    }
    if (response.status === 401) {
      throw new AIConnectionError(this.credential ? 'AUTH_FAILED' : 'AUTH_REQUIRED');
    }
    if (response.status === 403) throw new AIConnectionError('AUTH_FAILED');
    if (!response.ok) {
      if (preserveValidationError && response.status === 422) return response;
      throw new AIConnectionError('NETWORK_ERROR');
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

  return {
    schemaVersion: 1,
    analysisId: frame.analysisId || 'tracking_session',
    timestampSec: frame.timestampSec ?? frame.timestamp,
    frameIndex: frame.frameIndex ?? frame.frame_idx,
    engineVersion: frame.engineVersion || '1.0.0',
    modelVersion: frame.modelVersion || 'badminton-tracking-v1',
    isSynthetic,
    source: frame.source || (isSynthetic ? 'synthetic_demo' : 'real_tracking'),
    trackedPlayerCount: frame.trackedPlayerCount ?? frame.tracked_player_count,
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
      const groundPoint =
        p.groundPointPct ||
        (p.video_bbox_pct
          ? {
              x: Number((p.video_bbox_pct.x + p.video_bbox_pct.width / 2).toFixed(2)),
              y: Number((p.video_bbox_pct.y + p.video_bbox_pct.height).toFixed(2)),
            }
          : undefined);

      return {
        playerId: p.playerId || `P${p.id}`,
        trackId: p.trackId,
        teamCode: p.teamCode || (p.team ? `team${p.team}` : undefined),
        bboxPct: p.bboxPct || p.video_bbox_pct,
        groundPointPct: groundPoint,
        courtPosition: courtPos,
        absoluteZone: p.absoluteZone || p.zone,
        playerRelativeZone: p.playerRelativeZone || p.zone,
        speedMps: p.speedMps ?? p.speed_ms,
        totalDistanceM: p.totalDistanceM ?? p.total_dist_m,
        detectionConfidence: typeof p.detectionConfidence === 'number' ? p.detectionConfidence : null,
        state: p.state || (p.is_active ? 'observed' : 'lost'),
        pose: p.pose,
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
        }
      : null,
  };
}

export const trackingSessionApi = new TrackingSessionApiClient();
