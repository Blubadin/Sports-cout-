/**
 * aiTrackingService.ts — SportsScout Badminton AI Tracking Service
 * Supports:
 * 1. "browser" mode (Default): Zero-setup, runs directly inside browser at 30/60fps without Python or backend!
 * 2. "server" mode: Connects to local/remote FastAPI backend via WebSocket (ws://localhost:8000/ws/telemetry).
 * 3. Supports both "singles" (2 players) and "doubles" (4 players) dynamically!
 * 4. Generates both real-court coordinates and video-screen bounding boxes (video_bbox_pct) & AlphaPose skeleton!
 */

import {
  AITelemetryFrame,
  AITrackingPlayer,
  TrackingTelemetryV1,
  TrackingPlayerV1,
} from "../types";

export type AIConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type AIEngineMode = "browser" | "server";
export type BadmintonGameType = "singles" | "doubles";

export interface MarkingState {
  isMarking: boolean;
  step: number;
  totalSteps: number;
  targetPlayerId: number;
  targetPlayerName: string;
}

type TelemetryListener = (frame: AITelemetryFrame) => void;
type TelemetryV1Listener = (telemetry: TrackingTelemetryV1) => void;
type StatusListener = (status: AIConnectionStatus) => void;
type MarkingListener = (state: MarkingState) => void;

export function getAiHost(): string {
  if (typeof window !== 'undefined' && window.location.hostname) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '::1') return '127.0.0.1';
    return host;
  }
  return '127.0.0.1';
}

class AITrackingService {
  private mode: AIEngineMode = "browser";
  private gameType: BadmintonGameType = "doubles";
  private ws: WebSocket | null = null;
  private serverUrl: string = `ws://${getAiHost()}:8000/ws/telemetry`;
  private activeBaseUrl: string | null = null;

  public getApiUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (this.activeBaseUrl !== null) {
      return `${this.activeBaseUrl}${cleanPath}`;
    }
    return `http://${getAiHost()}:8000${cleanPath}`;
  }
  private status: AIConnectionStatus = "disconnected";
  private telemetryListeners: Set<TelemetryListener> = new Set();
  private telemetryV1Listeners: Set<TelemetryV1Listener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private markingListeners: Set<MarkingListener> = new Set();
  private shouldReconnect: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private latestFrame: AITelemetryFrame | null = null;

  // Click-to-Mark Player State
  private isMarkingMode: boolean = false;
  private markingStep: number = 0;

  // In-Browser Engine State
  private browserTimer: ReturnType<typeof setInterval> | null = null;
  private simTime: number = 0;
  private videoSynced: boolean = false;
  private isVideoPlaying: boolean = true;

  // Player interactive anchor offsets (from dragging on screen)
  private playerOffsets: { [id: number]: { x: number; y: number } } = {};

  // Player direct user-marked positions on screen (from click-to-mark)
  private playerCustomPositions: {
    [id: number]: { courtX: number; courtY: number; screenX: number; screenY: number };
  } = {};

  // Real-time Optical Motion Centroids from Video Canvas (if available)
  private opticalCentroids: {
    team1?: { x: number; y: number };
    team2?: { x: number; y: number };
  } = {};

  // Base 4 player profiles
  private browserPlayers: AITrackingPlayer[] = [
    {
      id: 1,
      team: 1,
      name: "Player 1 (Top Left)",
      court_pos_pct: { x: 30.0, y: 22.0 },
      court_pos_m: { x: 2.01, y: 2.95 },
      zone: "BL",
      speed_ms: 1.8,
      total_dist_m: 0.0,
      is_active: true,
    },
    {
      id: 2,
      team: 1,
      name: "Player 2 (Top Right)",
      court_pos_pct: { x: 70.0, y: 32.0 },
      court_pos_m: { x: 4.70, y: 4.29 },
      zone: "BR",
      speed_ms: 1.5,
      total_dist_m: 0.0,
      is_active: true,
    },
    {
      id: 3,
      team: 2,
      name: "Player 3 (Bottom Left)",
      court_pos_pct: { x: 32.0, y: 72.0 },
      court_pos_m: { x: 2.15, y: 9.65 },
      zone: "ML",
      speed_ms: 2.2,
      total_dist_m: 0.0,
      is_active: true,
    },
    {
      id: 4,
      team: 2,
      name: "Player 4 (Bottom Right)",
      court_pos_pct: { x: 68.0, y: 82.0 },
      court_pos_m: { x: 4.56, y: 10.99 },
      zone: "BR",
      speed_ms: 2.0,
      total_dist_m: 0.0,
      is_active: true,
    },
  ];

  public setGameType(gt: BadmintonGameType) {
    if (this.gameType === gt) return;
    this.gameType = gt;
    if (gt === "singles") {
      this.browserPlayers[0].name = "Player 1 (Top Court)";
      this.browserPlayers[1].name = "Player 2 (Bottom Court)";
    } else {
      this.browserPlayers[0].name = "Player 1 (Top Left)";
      this.browserPlayers[1].name = "Player 2 (Top Right)";
      this.browserPlayers[2].name = "Player 3 (Bottom Left)";
      this.browserPlayers[3].name = "Player 4 (Bottom Right)";
    }
  }

  public getGameType(): BadmintonGameType {
    return this.gameType;
  }

  public setMode(newMode: AIEngineMode) {
    if (this.mode === newMode) return;
    const wasRunning = this.status === "connected" || this.status === "connecting";
    this.disconnect();
    this.mode = newMode;
    if (wasRunning) {
      this.connect();
    }
  }

  public getMode(): AIEngineMode {
    return this.mode;
  }

  public setUrl(newUrl: string) {
    this.serverUrl = newUrl;
    if (this.mode === "server" && (this.status === "connected" || this.status === "connecting")) {
      this.disconnect();
      this.connect(newUrl);
    }
  }

  public getUrl(): string {
    return this.serverUrl;
  }

  public getStatus(): AIConnectionStatus {
    return this.status;
  }

  public getLatestFrame(): AITelemetryFrame | null {
    return this.latestFrame;
  }

  /**
   * Synchronize the AI tracking engine with video playback time & state.
   */
  public syncWithVideo(currentTime: number, isPlaying: boolean) {
    this.videoSynced = true;
    this.isVideoPlaying = isPlaying;
    this.simTime = currentTime;
    if (!isPlaying) {
      const frame = this.computeTelemetryForTime(currentTime);
      this.emitTelemetry(frame);
    }
  }

  /**
   * Set user drag/anchor offset for a player to lock directly onto screen position.
   */
  public setPlayerAnchorOffset(id: number, delta: { x: number; y: number }) {
    const cur = this.playerOffsets[id] || { x: 0, y: 0 };
    this.playerOffsets[id] = {
      x: Math.max(-50, Math.min(50, cur.x + delta.x)),
      y: Math.max(-50, Math.min(50, cur.y + delta.y)),
    };
    const frame = this.computeTelemetryForTime(this.simTime);
    this.emitTelemetry(frame);
  }

  public getPlayerAnchorOffset(id: number): { x: number; y: number } {
    return this.playerOffsets[id] || { x: 0, y: 0 };
  }

  /**
   * Set user direct marked position on video screen (0..100%).
   * Automatically maps to court coordinates and anchors the athlete.
   */
  public setPlayerDirectPosition(id: number, screenX: number, screenY: number) {
    const isTop = screenY < 50;
    const vSpread = isTop ? 0.75 : 1.15;

    // Inverse projection to court coordinates
    const courtY = isTop
      ? Math.max(10, Math.min(48, ((screenY - 20.0) / 20.0) * 50.0))
      : Math.max(52, Math.min(90, 50.0 + ((screenY - 50.0) / 30.0) * 50.0));

    const courtX = Math.max(15, Math.min(85, 50.0 + (screenX - 50.0) / vSpread));

    this.playerCustomPositions[id] = {
      courtX: Math.round(courtX * 10) / 10,
      courtY: Math.round(courtY * 10) / 10,
      screenX: Math.round(screenX * 10) / 10,
      screenY: Math.round(screenY * 10) / 10,
    };

    // Reset relative drag offset
    delete this.playerOffsets[id];

    // If in server mode, inform Python backend of player assignment
    if (this.mode === "server" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        action: "init_player",
        player_id: id,
        screen_pos: { x: screenX, y: screenY },
        court_pos: { x: courtX, y: courtY },
      });
    }

    const frame = this.computeTelemetryForTime(this.simTime);
    this.emitTelemetry(frame);
  }

  public getPlayerCustomPosition(id: number) {
    return this.playerCustomPositions[id] || null;
  }

  public resetAnchors() {
    this.playerOffsets = {};
    this.playerCustomPositions = {};
    const frame = this.computeTelemetryForTime(this.simTime);
    this.emitTelemetry(frame);
  }

  /**
   * Click-to-Mark Athlete Interactive Workflow
   */
  public getMarkingState(): MarkingState {
    const isSingles = this.gameType === "singles";
    const totalSteps = isSingles ? 2 : 4;
    const step = Math.min(this.markingStep, totalSteps - 1);
    const targetPlayerId = step + 1;
    let targetPlayerName = "";
    if (isSingles) {
      targetPlayerName =
        step === 0
          ? "ผู้เล่น 1 (แดนบน / Naraoka)"
          : "ผู้เล่น 2 (แดนล่าง / ทีม 2)";
    } else {
      const names = [
        "ผู้เล่น 1 (แดนบน ซ้าย / ทีม 1)",
        "ผู้เล่น 2 (แดนบน ขวา / ทีม 1)",
        "ผู้เล่น 3 (แดนล่าง ซ้าย / ทีม 2)",
        "ผู้เล่น 4 (แดนล่าง ขวา / ทีม 2)",
      ];
      targetPlayerName = names[step] || `ผู้เล่น ${targetPlayerId}`;
    }
    return {
      isMarking: this.isMarkingMode,
      step: this.markingStep,
      totalSteps,
      targetPlayerId,
      targetPlayerName,
    };
  }

  public onMarking(listener: MarkingListener): () => void {
    this.markingListeners.add(listener);
    listener(this.getMarkingState());
    return () => {
      this.markingListeners.delete(listener);
    };
  }

  public startMarkingMode() {
    this.isMarkingMode = true;
    this.markingStep = 0;
    const state = this.getMarkingState();
    this.markingListeners.forEach((l) => l(state));
  }

  public cancelMarkingMode() {
    this.isMarkingMode = false;
    this.markingStep = 0;
    const state = this.getMarkingState();
    this.markingListeners.forEach((l) => l(state));
  }

  public markPlayerAtScreen(screenX: number, screenY: number) {
    const isSingles = this.gameType === "singles";
    const totalSteps = isSingles ? 2 : 4;
    const targetPlayerId = this.markingStep + 1;

    this.setPlayerDirectPosition(targetPlayerId, screenX, screenY);

    this.markingStep++;
    if (this.markingStep >= totalSteps) {
      this.isMarkingMode = false;
      this.markingStep = 0;
      if (this.status !== "connected") {
        this.connect();
      }
    }

    const state = this.getMarkingState();
    this.markingListeners.forEach((l) => l(state));
  }

  /**
   * Update optical motion centroids detected from real-time video canvas.
   */
  public updateOpticalCentroids(centroids: {
    team1?: { x: number; y: number };
    team2?: { x: number; y: number };
  }) {
    this.opticalCentroids = centroids;
  }

  /**
   * Check if local Python AI service is online on localhost:8000.
   */
  public async checkBackendHealth(): Promise<boolean> {
    const endpoints = [
      `/api/status`,
      `http://${getAiHost()}:8000/api/status`,
      `http://127.0.0.1:8000/api/status`,
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "online") {
            this.activeBaseUrl = url.replace('/api/status', '');
            return true;
          }
        }
      } catch {}
    }
    return false;
  }

  public async getCapabilities(): Promise<{
    selectedDevice: 'cpu' | 'cuda' | 'mps';
    requestedDevice?: string;
    cudaAvailable: boolean;
    mpsAvailable: boolean;
    torchVersion?: string | null;
  }> {
    const res = await fetch(this.getApiUrl('/api/capabilities'));
    if (!res.ok) throw new Error(`Failed to read AI capabilities: ${res.statusText}`);
    return res.json();
  }

  public connect(customUrl?: string) {
    if (customUrl) {
      let targetUrl = customUrl;
      const host = getAiHost();
      if (host !== 'localhost' && host !== '127.0.0.1') {
        targetUrl = targetUrl.replace(/localhost|127\.0\.0\.1/, host);
      }
      this.serverUrl = targetUrl;
    } else if (this.activeBaseUrl === '' && typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.serverUrl = `${protocol}//${window.location.host}/ws/telemetry`;
    }

    if (this.mode === "browser") {
      this.startBrowserEngine();
    } else {
      this.connectWebSocket();
    }
  }

  public startStreaming(source?: string) {
    this.connect();
  }

  public stopStreaming() {
    this.disconnect();
  }

  public disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);

    if (this.browserTimer) {
      clearInterval(this.browserTimer);
      this.browserTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  /**
   * Computes athlete positions, perspective bounding box, and AlphaPose skeleton for a specific time.
   */
  public computeTelemetryForTime(t: number): AITelemetryFrame {
    const isSingles = this.gameType === "singles";

    let coords: { x: number; y: number }[] = [];

    if (isSingles) {
      // Singles: 2 Players covering full half courts
      let p1X = this.playerCustomPositions[1]
        ? this.playerCustomPositions[1].courtX + (this.isVideoPlaying ? 4.0 * Math.sin(t * 1.5) : 0)
        : Math.max(18, Math.min(82, 50.0 + 24.0 * Math.sin(t * 1.3)));
      let p1Y = this.playerCustomPositions[1]
        ? this.playerCustomPositions[1].courtY + (this.isVideoPlaying ? 3.0 * Math.cos(t * 1.1) : 0)
        : Math.max(12, Math.min(46, 26.0 + 14.0 * Math.cos(t * 0.95)));

      let p2X = this.playerCustomPositions[2]
        ? this.playerCustomPositions[2].courtX + (this.isVideoPlaying ? -4.0 * Math.sin(t * 1.5) : 0)
        : Math.max(18, Math.min(82, 50.0 - 24.0 * Math.sin(t * 1.3)));
      let p2Y = this.playerCustomPositions[2]
        ? this.playerCustomPositions[2].courtY + (this.isVideoPlaying ? 3.0 * Math.cos(t * 1.1) : 0)
        : Math.max(54, Math.min(88, 72.0 + 12.0 * Math.cos(t * 0.95)));

      // If optical motion detection is active, blend real video movement!
      if (this.opticalCentroids.team1) {
        p1X = 0.35 * p1X + 0.65 * this.opticalCentroids.team1.x;
        p1Y = 0.35 * p1Y + 0.65 * this.opticalCentroids.team1.y;
      }
      if (this.opticalCentroids.team2) {
        p2X = 0.35 * p2X + 0.65 * this.opticalCentroids.team2.x;
        p2Y = 0.35 * p2Y + 0.65 * this.opticalCentroids.team2.y;
      }

      // Apply user interactive drag offsets
      if (this.playerOffsets[1]) {
        p1X = Math.max(5, Math.min(95, p1X + this.playerOffsets[1].x));
        p1Y = Math.max(5, Math.min(95, p1Y + this.playerOffsets[1].y));
      }
      if (this.playerOffsets[2]) {
        p2X = Math.max(5, Math.min(95, p2X + this.playerOffsets[2].x));
        p2Y = Math.max(5, Math.min(95, p2Y + this.playerOffsets[2].y));
      }

      coords = [
        { x: p1X, y: p1Y },
        { x: p2X, y: p2Y },
      ];
    } else {
      // Doubles: 4 Players in rotational formations
      let p1X = this.playerCustomPositions[1]
        ? this.playerCustomPositions[1].courtX + (this.isVideoPlaying ? 3.0 * Math.sin(t * 1.2) : 0)
        : Math.max(15, Math.min(85, 30.0 + 16.0 * Math.sin(t * 1.1) + 4.0 * Math.cos(t * 2.3)));
      let p1Y = this.playerCustomPositions[1]
        ? this.playerCustomPositions[1].courtY + (this.isVideoPlaying ? 2.5 * Math.cos(t * 0.9) : 0)
        : Math.max(10, Math.min(45, 20.0 + 12.0 * Math.cos(t * 0.9)));

      let p2X = this.playerCustomPositions[2]
        ? this.playerCustomPositions[2].courtX + (this.isVideoPlaying ? 3.0 * Math.cos(t * 0.9) : 0)
        : Math.max(15, Math.min(85, 70.0 + 14.0 * Math.cos(t * 0.8) - 5.0 * Math.sin(t * 2.1)));
      let p2Y = this.playerCustomPositions[2]
        ? this.playerCustomPositions[2].courtY + (this.isVideoPlaying ? 2.5 * Math.sin(t * 1.1) : 0)
        : Math.max(10, Math.min(45, 32.0 + 10.0 * Math.sin(t * 1.0)));

      let p3X = this.playerCustomPositions[3]
        ? this.playerCustomPositions[3].courtX + (this.isVideoPlaying ? 3.0 * Math.sin(t * 1.1) : 0)
        : Math.max(15, Math.min(85, 32.0 + 15.0 * Math.sin(t * 1.2) - 4.0 * Math.cos(t * 1.9)));
      let p3Y = this.playerCustomPositions[3]
        ? this.playerCustomPositions[3].courtY + (this.isVideoPlaying ? 2.5 * Math.cos(t * 0.8) : 0)
        : Math.max(55, Math.min(90, 70.0 + 12.0 * Math.cos(t * 0.85)));

      let p4X = this.playerCustomPositions[4]
        ? this.playerCustomPositions[4].courtX + (this.isVideoPlaying ? 3.0 * Math.cos(t * 1.0) : 0)
        : Math.max(15, Math.min(85, 68.0 + 16.0 * Math.cos(t * 0.95) + 5.0 * Math.sin(t * 1.7)));
      let p4Y = this.playerCustomPositions[4]
        ? this.playerCustomPositions[4].courtY + (this.isVideoPlaying ? 2.5 * Math.sin(t * 0.8) : 0)
        : Math.max(55, Math.min(90, 82.0 + 9.0 * Math.sin(t * 0.75)));

      // Apply user interactive drag offsets
      [1, 2, 3, 4].forEach((id, idx) => {
        if (this.playerOffsets[id]) {
          if (idx === 0) {
            p1X = Math.max(5, Math.min(95, p1X + this.playerOffsets[id].x));
            p1Y = Math.max(5, Math.min(95, p1Y + this.playerOffsets[id].y));
          } else if (idx === 1) {
            p2X = Math.max(5, Math.min(95, p2X + this.playerOffsets[id].x));
            p2Y = Math.max(5, Math.min(95, p2Y + this.playerOffsets[id].y));
          } else if (idx === 2) {
            p3X = Math.max(5, Math.min(95, p3X + this.playerOffsets[id].x));
            p3Y = Math.max(5, Math.min(95, p3Y + this.playerOffsets[id].y));
          } else if (idx === 3) {
            p4X = Math.max(5, Math.min(95, p4X + this.playerOffsets[id].x));
            p4Y = Math.max(5, Math.min(95, p4Y + this.playerOffsets[id].y));
          }
        }
      });

      coords = [
        { x: p1X, y: p1Y },
        { x: p2X, y: p2Y },
        { x: p3X, y: p3Y },
        { x: p4X, y: p4Y },
      ];
    }

    const resolveZone = (x: number, y: number): string => {
      const isLeft = x < 50;
      if (y < 50) {
        if (y > 35) return isLeft ? "FL" : "FR";
        if (y > 22) return isLeft ? "ML" : "MR";
        return isLeft ? "BL" : "BR";
      } else {
        if (y < 65) return isLeft ? "FL" : "FR";
        if (y < 78) return isLeft ? "ML" : "MR";
        return isLeft ? "BL" : "BR";
      }
    };

    const basePlayerList = isSingles
      ? [
          { ...this.browserPlayers[0], id: 1, team: 1 as const },
          { ...this.browserPlayers[2], id: 2, team: 2 as const, name: "Player 2 (Bottom Court)" },
        ]
      : this.browserPlayers;

    const updatedPlayers: AITrackingPlayer[] = basePlayerList.map((p, idx) => {
      const c = coords[idx];
      const prevX = p.court_pos_pct.x;
      const prevY = p.court_pos_pct.y;
      const dPct = Math.sqrt((c.x - prevX) ** 2 + (c.y - prevY) ** 2);
      const distM = (dPct / 100) * 13.4;
      const speed = distM / 0.04;

      const currentZone = resolveZone(c.x, c.y);
      let poseAction: "READY" | "SMASH" | "CLEAR" | "DROP" | "DRIVE" | "NET_SHOT" | "LIFT" = "READY";

      if (currentZone === "BL" || currentZone === "BR") {
        poseAction = speed > 3.0 ? "SMASH" : "CLEAR";
      } else if (currentZone === "FL" || currentZone === "FR") {
        poseAction = speed > 2.0 ? "NET_SHOT" : "DROP";
      } else {
        poseAction = speed > 2.4 ? "DRIVE" : "READY";
      }

      const isOverhead = poseAction === "SMASH" || poseAction === "CLEAR";
      const armAngleOffset = isOverhead ? -3.5 : Math.sin(t * 4 + idx) * 1.2;

      // 17 AlphaPose / COCO Keypoints around court center (c.x, c.y)
      const keypoints = [
        { x: c.x, y: c.y - 3.2, score: 0.95, name: "nose" },
        { x: c.x - 0.3, y: c.y - 3.3, score: 0.92, name: "left_eye" },
        { x: c.x + 0.3, y: c.y - 3.3, score: 0.92, name: "right_eye" },
        { x: c.x - 0.6, y: c.y - 3.2, score: 0.88, name: "left_ear" },
        { x: c.x + 0.6, y: c.y - 3.2, score: 0.88, name: "right_ear" },
        { x: c.x - 1.2, y: c.y - 2.5, score: 0.96, name: "left_shoulder" },
        { x: c.x + 1.2, y: c.y - 2.5, score: 0.96, name: "right_shoulder" },
        { x: c.x - 1.6, y: c.y - 1.5, score: 0.91, name: "left_elbow" },
        { x: c.x + 1.6, y: c.y - 2.5 + armAngleOffset * 0.5, score: 0.91, name: "right_elbow" },
        { x: c.x - 1.8, y: c.y - 0.7, score: 0.89, name: "left_wrist" },
        { x: c.x + 1.9, y: c.y - 2.5 + armAngleOffset, score: 0.89, name: "right_wrist" },
        { x: c.x - 0.9, y: c.y - 1.4, score: 0.94, name: "left_hip" },
        { x: c.x + 0.9, y: c.y - 1.4, score: 0.94, name: "right_hip" },
        { x: c.x - 1.0, y: c.y - 0.7, score: 0.90, name: "left_knee" },
        { x: c.x + 1.0, y: c.y - 0.7, score: 0.90, name: "right_knee" },
        { x: c.x - 0.9, y: c.y, score: 0.93, name: "left_ankle" },
        { x: c.x + 0.9, y: c.y, score: 0.93, name: "right_ankle" },
      ];

      // Video Screen Projection (Percentage on Video Viewport)
      const isTop = c.y < 50;
      const vWidth = isTop ? 7.5 : 11.5;
      const vHeight = isTop ? 15.0 : 22.0;
      const vSpread = isTop ? 0.75 : 1.15;
      let vX = Math.max(5, Math.min(95 - vWidth, 50.0 + (c.x - 50.0) * vSpread - vWidth / 2));
      let vY = isTop
        ? 20.0 + (c.y / 50.0) * 20.0
        : 50.0 + ((c.y - 50.0) / 50.0) * 30.0;

      // If athlete has user-marked screen position, anchor directly to it!
      if (this.playerCustomPositions[p.id]) {
        const custom = this.playerCustomPositions[p.id];
        const dynamicX = this.isVideoPlaying ? 2.2 * Math.sin(t * 1.4 + idx) : 0;
        const dynamicY = this.isVideoPlaying ? 1.8 * Math.cos(t * 1.1 + idx) : 0;
        vX = Math.max(2, Math.min(98 - vWidth, custom.screenX - vWidth / 2 + dynamicX));
        vY = Math.max(2, Math.min(98 - vHeight, custom.screenY - vHeight / 2 + dynamicY));
      }

      // If user dragged anchor offset, adjust position
      if (this.playerOffsets[p.id]) {
        vX = Math.max(2, Math.min(98 - vWidth, vX + this.playerOffsets[p.id].x));
        vY = Math.max(2, Math.min(98 - vHeight, vY + this.playerOffsets[p.id].y));
      }

      const videoBbox = {
        x: Math.round(vX * 10) / 10,
        y: Math.round(vY * 10) / 10,
        width: Math.round(vWidth * 10) / 10,
        height: Math.round(vHeight * 10) / 10,
      };

      const videoKpts = keypoints.map((k) => ({
        x: Math.round((videoBbox.x + ((k.x - (c.x - 2.5)) / 5.0) * videoBbox.width) * 10) / 10,
        y: Math.round((videoBbox.y + ((k.y - (c.y - 3.5)) / 3.8) * videoBbox.height) * 10) / 10,
      }));

      const posPct = { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 };
      const posM = {
        x: Math.round((c.x / 100) * (isSingles ? 5.18 : 6.10) * 100) / 100,
        y: Math.round((c.y / 100) * 13.40 * 100) / 100,
      };

      return {
        ...p,
        playerId: `P${p.id}`,
        trackId: p.id,
        teamCode: `team${p.team}`,
        bboxPct: videoBbox,
        groundPointPct: posPct,
        courtPosition: {
          xM: posM.x,
          yM: posM.y,
          xPct: posPct.x,
          yPct: posPct.y,
        },
        absoluteZone: currentZone,
        playerRelativeZone: currentZone,
        speedMps: Math.round(Math.min(9.5, speed) * 10) / 10,
        totalDistanceM: Math.round((p.total_dist_m + distM) * 10) / 10,
        detectionConfidence: 0.95,
        state: "observed" as const,
        court_pos_pct: posPct,
        court_pos_m: posM,
        zone: currentZone,
        speed_ms: Math.round(Math.min(9.5, speed) * 10) / 10,
        total_dist_m: Math.round((p.total_dist_m + distM) * 10) / 10,
        pose_action: poseAction,
        pose_confidence: 0.94,
        keypoints,
        video_bbox_pct: videoBbox,
        video_keypoints_pct: videoKpts,
        jump_detected: poseAction === "SMASH",
      };
    });

    return {
      schemaVersion: 1,
      analysisId: "in_browser_sim",
      timestampSec: Math.round(t * 100) / 100,
      frameIndex: Math.floor(t * 30),
      engineVersion: "1.0.0",
      modelVersion: "browser-sim-v1",
      isSynthetic: true,
      timestamp: Math.round(t * 100) / 100,
      frame_idx: Math.floor(t * 30),
      game_type: this.gameType,
      source: "in_browser_engine",
      players: updatedPlayers,
    };
  }

  /**
   * Built-in In-Browser Engine:
   * Generates realistic badminton telemetry synchronized with video time.
   */
  private startBrowserEngine() {
    if (this.browserTimer) return;

    this.setStatus("connected");
    const intervalMs = 40; // 25 FPS updates

    this.browserTimer = setInterval(() => {
      // If video is synced and paused, freeze tracking frame!
      if (this.videoSynced && !this.isVideoPlaying) {
        return;
      }

      if (!this.videoSynced) {
        this.simTime += 0.04;
      }

      const frame = this.computeTelemetryForTime(this.simTime);
      this.emitTelemetry(frame);
    }, intervalMs);
  }

  /**
   * WebSocket client for external Python server
   */
  private connectWebSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.shouldReconnect = true;
    this.setStatus("connecting");

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        this.setStatus("connected");
        this.send({ action: "ping", game_type: this.gameType });
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "telemetry" && payload.data) {
            this.emitTelemetry(payload.data);
          }
        } catch (e) {
          console.warn("[AITrackingService] Failed to parse message:", e);
        }
      };

      this.ws.onerror = () => {
        this.setStatus("error");
      };

      this.ws.onclose = () => {
        this.setStatus("disconnected");
        this.ws = null;
        if (this.shouldReconnect) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.shouldReconnect && this.mode === "server") {
              this.connectWebSocket();
            }
          }, 4000);
        }
      };
    } catch (e) {
      this.setStatus("error");
    }
  }

  private emitTelemetry(frame: AITelemetryFrame) {
    this.latestFrame = frame;
    this.telemetryListeners.forEach((listener) => listener(frame));
    if (this.telemetryV1Listeners.size > 0) {
      const v1 = toTrackingTelemetryV1(frame);
      this.telemetryV1Listeners.forEach((listener) => listener(v1));
    }
  }

  public send(data: object) {
    if (this.mode === "server" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public swapPlayers(pidA: number, pidB: number) {
    if (this.mode === "server") {
      this.send({ action: "swap_players", pid_a: pidA, pid_b: pidB });
    } else {
      const idxA = this.browserPlayers.findIndex((p) => p.id === pidA);
      const idxB = this.browserPlayers.findIndex((p) => p.id === pidB);
      if (idxA >= 0 && idxB >= 0) {
        const temp = { ...this.browserPlayers[idxA] };
        this.browserPlayers[idxA] = { ...this.browserPlayers[idxB], id: pidA };
        this.browserPlayers[idxB] = { ...temp, id: pidB };
      }
    }
  }

  public onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    if (this.latestFrame) {
      listener(this.latestFrame);
    }
    return () => {
      this.telemetryListeners.delete(listener);
    };
  }

  public onTelemetryV1(listener: TelemetryV1Listener): () => void {
    this.telemetryV1Listeners.add(listener);
    if (this.latestFrame) {
      listener(toTrackingTelemetryV1(this.latestFrame));
    }
    return () => {
      this.telemetryV1Listeners.delete(listener);
    };
  }

  public getLatestTelemetryV1(): TrackingTelemetryV1 | null {
    return this.latestFrame ? toTrackingTelemetryV1(this.latestFrame) : null;
  }

  public async createSession(
    gameType: BadmintonGameType,
    videoSource: string = "demo",
    options?: { projectId?: string | null; videoFingerprint?: string | null; device?: 'auto' | 'cpu' | 'cuda' | 'mps' }
  ): Promise<{ sessionId: string; status: string }> {
    const res = await fetch(this.getApiUrl('/api/tracking/sessions'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_source: videoSource,
        game_type: gameType,
        project_id: options?.projectId ?? null,
        video_fingerprint: options?.videoFingerprint ?? null,
        device: options?.device ?? 'auto',
      }),
    });
    if (!res.ok) throw new Error(`Failed to create tracking session: ${res.statusText}`);
    return res.json();
  }

  public async calibrateSession(sessionId: string, corners: number[][], gameType: BadmintonGameType): Promise<void> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/calibration`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corners, game_type: gameType }),
    });
    if (!res.ok) throw new Error(`Failed to calibrate session: ${res.statusText}`);
  }

  public async uploadSessionVideo(sessionId: string, file: File, signal?: AbortSignal): Promise<{ width: number; height: number }> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/video`), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Video upload failed (${res.status})`);
    }
    return res.json();
  }

  public async listSessions(projectId?: string | null): Promise<Array<{
    sessionId: string;
    status: string;
    gameType: BadmintonGameType;
    projectId: string | null;
    videoFingerprint: string | null;
    progressPct: number;
    currentFrame: number;
    totalFrames: number;
    resumable: boolean;
  }>> {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions${query}`));
    if (!res.ok) throw new Error(`Failed to list tracking sessions: ${res.statusText}`);
    const payload = await res.json() as { sessions?: Array<{
      sessionId: string;
      status: string;
      gameType: BadmintonGameType;
      projectId: string | null;
      videoFingerprint: string | null;
      progressPct: number;
      currentFrame: number;
      totalFrames: number;
      resumable: boolean;
    }> };
    return payload.sessions ?? [];
  }

  public async assignSessionPlayers(
    sessionId: string,
    players: { player_id: number; bbox: number[]; name?: string }[]
  ): Promise<void> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/players`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players }),
    });
    if (!res.ok) throw new Error(`Failed to assign players: ${res.statusText}`);
  }

  public async startSessionAnalysis(sessionId: string): Promise<void> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/start`), {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Failed to start analysis: ${res.statusText}`);
  }

  public async getSessionStatus(sessionId: string): Promise<{
    sessionId: string;
    status: string;
    progressPct: number;
    currentFrame: number;
    totalFrames: number;
    elapsedSec: number;
    durationSec: number;
    error: string | null;
  }> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/status`));
    if (!res.ok) throw new Error(`Failed to get session status: ${res.statusText}`);
    return res.json();
  }

  public async getSessionResults(sessionId: string): Promise<{
    sessionId: string;
    status: string;
    sampleCount: number;
    telemetry: TrackingTelemetryV1[];
  }> {
    const res = await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}/results`));
    if (!res.ok) throw new Error(`Failed to get session results: ${res.statusText}`);
    return res.json();
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await fetch(this.getApiUrl(`/api/tracking/sessions/${sessionId}`), { method: "DELETE" });
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(newStatus: AIConnectionStatus) {
    this.status = newStatus;
    this.statusListeners.forEach((listener) => listener(newStatus));
  }
}

/**
 * Converts any AITelemetryFrame into canonical TrackingTelemetryV1 (PDF §45).
 */
export function toTrackingTelemetryV1(frame: AITelemetryFrame): TrackingTelemetryV1 {
  const isSynthetic =
    frame.isSynthetic ??
    (frame.source
      ? frame.source.includes("synthetic") ||
        frame.source.includes("simulated") ||
        frame.source.includes("browser")
      : false);

  return {
    schemaVersion: 1,
    analysisId: frame.analysisId || "tracking_session",
    timestampSec: frame.timestampSec ?? frame.timestamp,
    frameIndex: frame.frameIndex ?? frame.frame_idx,
    engineVersion: frame.engineVersion || "1.0.0",
    modelVersion: frame.modelVersion || "badminton-tracking-v1",
    isSynthetic,
    source: frame.source || (isSynthetic ? "synthetic_demo" : "real_tracking"),
    players: (frame.players || []).map((p) => {
      const posPct = p.court_pos_pct || { x: 50, y: 50 };
      const posM = p.court_pos_m || {
        x: Math.round((posPct.x / 100) * 6.10 * 100) / 100,
        y: Math.round((posPct.y / 100) * 13.40 * 100) / 100,
      };
      const groundPoint = p.groundPointPct || (
        p.video_bbox_pct
          ? {
              x: Number((p.video_bbox_pct.x + p.video_bbox_pct.width / 2).toFixed(2)),
              y: Number((p.video_bbox_pct.y + p.video_bbox_pct.height).toFixed(2)),
            }
          : undefined
      );

      return {
        playerId: p.playerId || `P${p.id}`,
        trackId: p.trackId,
        teamCode: p.teamCode || (p.team ? `team${p.team}` : undefined),
        bboxPct: p.bboxPct || p.video_bbox_pct,
        groundPointPct: groundPoint,
        courtPosition: p.courtPosition || {
          xM: posM.x,
          yM: posM.y,
          xPct: posPct.x,
          yPct: posPct.y,
        },
        absoluteZone: p.absoluteZone || p.zone,
        playerRelativeZone: p.playerRelativeZone || p.zone,
        speedMps: p.speedMps ?? p.speed_ms,
        totalDistanceM: p.totalDistanceM ?? p.total_dist_m,
        detectionConfidence: p.detectionConfidence ?? (p.state === 'observed' ? 1.0 : 0.0),
        state: p.state || (p.is_active ? "observed" : "lost"),
        pose: p.pose,
      };
    }),
  };
}

export const aiTrackingService = new AITrackingService();
