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
} from '../types';

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
  if (typeof window !== 'undefined' && window.location.hostname) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '::1') return '127.0.0.1';
    return host;
  }
  return '127.0.0.1';
}

export class TrackingSessionApiClient {
  private activeBaseUrl: string | null = null;
  private status: AIConnectionStatus = 'disconnected';
  private mode: AIEngineMode = 'server';
  private gameType: BadmintonGameType = 'doubles';
  private latestFrame: AITelemetryFrame | null = null;
  private telemetryListeners: Set<(frame: AITelemetryFrame) => void> = new Set();
  private telemetryV1Listeners: Set<(telemetry: TrackingTelemetryV1) => void> = new Set();
  private statusListeners: Set<(status: AIConnectionStatus) => void> = new Set();

  public setBaseUrl(url: string | null): void {
    this.activeBaseUrl = url;
  }

  public getApiUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (this.activeBaseUrl !== null) {
      return `${this.activeBaseUrl}${cleanPath}`;
    }
    return `http://${getAiHost()}:8000${cleanPath}`;
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
    this.status = 'disconnected';
    this.statusListeners.forEach((cb) => cb('disconnected'));
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

  public async checkBackendHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(this.getApiUrl('/api/status'), {
        signal: controller.signal,
      });
      clearTimeout(id);
      return res.ok;
    } catch {
      return false;
    }
  }

  public async getCapabilities(): Promise<{
    selectedDevice: string;
    cudaAvailable: boolean;
    mpsAvailable: boolean;
  }> {
    const res = await fetch(this.getApiUrl('/api/capabilities'));
    if (!res.ok) throw new Error(`Failed to fetch backend capabilities: ${res.statusText}`);
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
    const res = await fetch(this.getApiUrl('/api/tracking/sessions'), {
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
    if (!res.ok) throw new Error(`Failed to create tracking session: ${res.statusText}`);
    return res.json();
  }

  public async uploadSessionVideo(
    sessionId: string,
    file: File,
    signal?: AbortSignal
  ): Promise<{ width: number; height: number }> {
    const encodedFilename = encodeURIComponent(file.name);
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/video?filename=${encodedFilename}`), {
      method: 'POST',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Video upload failed (${res.status})`);
    }
    return res.json();
  }

  public async calibrateSession(
    sessionId: string,
    corners: number[][],
    gameType: BadmintonGameType
  ): Promise<void> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/calibration`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corners, game_type: gameType }),
    });
    if (!res.ok) throw new Error(`Failed to calibrate session: ${res.statusText}`);
  }

  public async assignSessionPlayers(
    sessionId: string,
    players: { player_id: number; bbox: number[]; name?: string }[]
  ): Promise<void> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/players`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players }),
    });
    if (!res.ok) throw new Error(`Failed to assign players: ${res.statusText}`);
  }

  public async startSessionAnalysis(sessionId: string): Promise<void> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/start`), {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to start analysis: ${res.statusText}`);
  }

  public async getSessionStatus(sessionId: string): Promise<TrackingSessionStatus> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/status`));
    if (!res.ok) throw new Error(`Failed to get session status: ${res.statusText}`);
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
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/results${query}`));
    if (!res.ok) throw new Error(`Failed to get session results: ${res.statusText}`);
    return res.json();
  }

  public async listSessions(projectId?: string | null): Promise<
    Array<{
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
    }>
  > {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions${query}`));
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.statusText}`);
    const payload = (await res.json()) as {
      sessions?: Array<{
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
      }>;
    };
    return payload.sessions ?? [];
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}`), { method: 'DELETE' });
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
  };
}

export const trackingSessionApi = new TrackingSessionApiClient();
