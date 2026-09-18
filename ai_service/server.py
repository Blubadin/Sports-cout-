"""
server.py — FastAPI + WebSocket Telemetry Server for SportsScout AI Auto-Tracking
Bridges Python Badminton Motion Analyzer with React/TypeScript PWA.
"""

import os
import tempfile
import asyncio
import json
import threading
import time
from typing import Set
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2

from analyzer_v2 import BadmintonAnalyzerV2
from court_mapper import CourtMapper
from device_runtime import capability_report, resolve_device
try:
    from ai_service.video_metadata import extract_video_metadata
except ImportError:
    from video_metadata import extract_video_metadata


app = FastAPI(title="SportsScout Badminton AI Service", version="1.0.0")

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

DEFAULT_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


def get_cors_configuration(
    cors_origins: str | None = None,
    cors_origin_regex: str | None = None,
) -> tuple[list[str], str | None]:
    """Build safe CORS origins and regex from defaults and optional environment overrides."""
    origins = list(DEFAULT_ALLOWED_ORIGINS)
    if cors_origins:
        for item in cors_origins.split(","):
            cleaned = item.strip()
            if cleaned and cleaned not in origins:
                origins.append(cleaned)

    regex = cors_origin_regex if cors_origin_regex is not None else DEFAULT_ORIGIN_REGEX
    return origins, regex


ALLOWED_ORIGINS, ALLOWED_ORIGIN_REGEX = get_cors_configuration(
    cors_origins=os.getenv("CORS_ORIGINS"),
    cors_origin_regex=os.getenv("CORS_ORIGIN_REGEX"),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_pna_and_cors_headers(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# Global State
analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=4)
is_tracking = False
tracking_mode = "idle"  # "idle" | "real" | "demo"
tracking_thread = None
connected_websockets: Set[WebSocket] = set()
latest_telemetry = {}


class CalibrateRequest(BaseModel):
    corners: list[list[float]]
    game_type: str = "doubles"


class InitPlayerRequest(BaseModel):
    players: list[dict]


class SwapPlayersRequest(BaseModel):
    pid_a: int
    pid_b: int


class StartStreamRequest(BaseModel):
    video_source: str = "demo"  # "demo", local video path, or "0" for webcam
    game_type: str = "doubles"


@app.get("/api/status")
def get_status():
    return {
        "status": "online",
        "is_tracking": is_tracking,
        "mode": tracking_mode,
        "game_type": analyzer.game_type,
        "max_players": analyzer.max_players,
        "connected_clients": len(connected_websockets),
        "has_calibrated": analyzer.court_corners_px is not None,
        "device": analyzer.device,
    }


@app.get("/api/capabilities")
def get_capabilities():
    """Expose the actual inference runtime so the UI never guesses GPU state."""
    report = capability_report()
    report["selectedDevice"] = analyzer.device
    report["detectorModel"] = analyzer.model_path
    report["poseModel"] = "yolov8n-pose.pt"
    return report


@app.post("/api/calibrate")
def calibrate_court(req: CalibrateRequest):
    analyzer.game_type = req.game_type
    analyzer.set_court_corners(req.corners)
    return {"status": "success", "message": "Court calibrated successfully"}


@app.post("/api/init-players")
def init_players(req: InitPlayerRequest):
    # Dummy frame for initial assignment
    frame = cv2.imread("sample.jpg") if Path("sample.jpg").exists() else None
    if frame is None:
        import numpy as np
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    analyzer.assign_initial_players(frame, req.players)
    return {"status": "success", "message": f"Initialized {len(req.players)} players"}


@app.post("/api/swap-players")
def swap_players(req: SwapPlayersRequest):
    analyzer.swap_players(req.pid_a, req.pid_b)
    return {"status": "success", "message": f"Swapped Player {req.pid_a} and Player {req.pid_b}"}


async def broadcast_telemetry(data: dict):
    global latest_telemetry
    latest_telemetry = data
    msg = json.dumps({"type": "telemetry", "data": data})
    disconnected = set()
    for ws in list(connected_websockets):
        try:
            await ws.send_text(msg)
        except Exception:
            disconnected.add(ws)
    connected_websockets.difference_update(disconnected)


def _demo_worker(loop: asyncio.AbstractEventLoop):
    """Background thread running simulated synthetic demo telemetry."""
    global is_tracking, tracking_mode
    print("[AI Service] Synthetic Demo worker started.")
    tracking_mode = "demo"
    t = 0.0

    while is_tracking and tracking_mode == "demo":
        t += 0.05
        import math
        p1_x = 30.0 + 15.0 * math.sin(t * 0.8)
        p1_y = 20.0 + 10.0 * math.cos(t * 0.9)

        p2_x = 70.0 + 12.0 * math.cos(t * 0.7)
        p2_y = 35.0 + 8.0 * math.sin(t * 0.8)

        p3_x = 35.0 + 14.0 * math.sin(t * 1.1)
        p3_y = 68.0 + 9.0 * math.cos(t * 0.6)

        p4_x = 65.0 + 16.0 * math.cos(t * 0.9)
        p4_y = 82.0 + 7.0 * math.sin(t * 0.7)

        mock_data = {
            "schemaVersion": 1,
            "analysisId": "synthetic_demo_session",
            "timestampSec": round(t, 2),
            "frameIndex": int(t * 30),
            "engineVersion": "1.0.0-demo",
            "modelVersion": "synthetic-sine-v1",
            "source": "synthetic_demo",
            "isSynthetic": True,
            "is_synthetic": True,
            # Legacy fields
            "timestamp": round(t, 2),
            "frame_idx": int(t * 30),
            "players": [
                {
                    "playerId": "P1",
                    "trackId": 1,
                    "teamCode": "team1",
                    "id": 1,
                    "team": 1,
                    "name": "Player 1 (Top Left)",
                    "courtPosition": {"xM": 2.01, "yM": 2.95, "xPct": round(p1_x, 1), "yPct": round(p1_y, 1)},
                    "court_pos_pct": {"x": round(p1_x, 1), "y": round(p1_y, 1)},
                    "absoluteZone": "FL" if p1_y > 25 else "BL",
                    "playerRelativeZone": "FR" if p1_y > 25 else "BR",
                    "zone": "FL" if p1_y > 25 else "BL",
                    "speedMps": round(abs(math.sin(t)) * 3.5, 2),
                    "speed_ms": round(abs(math.sin(t)) * 3.5, 2),
                    "totalDistanceM": round(t * 1.8, 1),
                    "total_dist_m": round(t * 1.8, 1),
                    "detectionConfidence": 0.95,
                    "state": "observed",
                    "is_active": True,
                },
                {
                    "playerId": "P2",
                    "trackId": 2,
                    "teamCode": "team1",
                    "id": 2,
                    "team": 1,
                    "name": "Player 2 (Top Right)",
                    "courtPosition": {"xM": 4.70, "yM": 4.29, "xPct": round(p2_x, 1), "yPct": round(p2_y, 1)},
                    "court_pos_pct": {"x": round(p2_x, 1), "y": round(p2_y, 1)},
                    "absoluteZone": "FR" if p2_y > 25 else "BR",
                    "playerRelativeZone": "FL" if p2_y > 25 else "BL",
                    "zone": "FR" if p2_y > 25 else "BR",
                    "speedMps": round(abs(math.cos(t)) * 3.1, 2),
                    "speed_ms": round(abs(math.cos(t)) * 3.1, 2),
                    "totalDistanceM": round(t * 1.5, 1),
                    "total_dist_m": round(t * 1.5, 1),
                    "detectionConfidence": 0.93,
                    "state": "observed",
                    "is_active": True,
                },
                {
                    "playerId": "P3",
                    "trackId": 3,
                    "teamCode": "team2",
                    "id": 3,
                    "team": 2,
                    "name": "Player 3 (Bottom Left)",
                    "courtPosition": {"xM": 2.15, "yM": 9.65, "xPct": round(p3_x, 1), "yPct": round(p3_y, 1)},
                    "court_pos_pct": {"x": round(p3_x, 1), "y": round(p3_y, 1)},
                    "absoluteZone": "FL" if p3_y < 75 else "BL",
                    "playerRelativeZone": "FL" if p3_y < 75 else "BL",
                    "zone": "FL" if p3_y < 75 else "BL",
                    "speedMps": round(abs(math.sin(t * 1.2)) * 4.0, 2),
                    "speed_ms": round(abs(math.sin(t * 1.2)) * 4.0, 2),
                    "totalDistanceM": round(t * 2.1, 1),
                    "total_dist_m": round(t * 2.1, 1),
                    "detectionConfidence": 0.94,
                    "state": "observed",
                    "is_active": True,
                },
                {
                    "playerId": "P4",
                    "trackId": 4,
                    "teamCode": "team2",
                    "id": 4,
                    "team": 2,
                    "name": "Player 4 (Bottom Right)",
                    "courtPosition": {"xM": 4.10, "yM": 11.2, "xPct": round(p4_x, 1), "yPct": round(p4_y, 1)},
                    "court_pos_pct": {"x": round(p4_x, 1), "y": round(p4_y, 1)},
                    "absoluteZone": "FR" if p4_y < 75 else "BR",
                    "playerRelativeZone": "FR" if p4_y < 75 else "BR",
                    "zone": "FR" if p4_y < 75 else "BR",
                    "speedMps": round(abs(math.cos(t * 0.9)) * 2.9, 2),
                    "speed_ms": round(abs(math.cos(t * 0.9)) * 2.9, 2),
                    "totalDistanceM": round(t * 1.6, 1),
                    "total_dist_m": round(t * 1.6, 1),
                    "detectionConfidence": 0.91,
                    "state": "observed",
                    "is_active": True,
                },
            ],
        }
        asyncio.run_coroutine_threadsafe(broadcast_telemetry(mock_data), loop)
        time.sleep(0.066)  # ~15 fps

    tracking_mode = "idle"
    print("[AI Service] Synthetic Demo worker stopped.")


def _video_tracking_worker(video_source: str, loop: asyncio.AbstractEventLoop):
    """Background thread running real video frame inference."""
    global is_tracking, tracking_mode
    print(f"[AI Service] Real Tracking worker started for source: {video_source}")
    tracking_mode = "real"

    src = int(video_source) if video_source.isdigit() else video_source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        is_tracking = False
        tracking_mode = "idle"
        error_msg = f"Failed to open video source: {video_source}"
        print(f"[AI Service] Error: {error_msg}")
        asyncio.run_coroutine_threadsafe(
            broadcast_telemetry({"type": "error", "error": error_msg, "is_synthetic": False}),
            loop
        )
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_delay = 1.0 / fps
    frame_idx = 0

    try:
        while is_tracking and tracking_mode == "real":
            start_t = time.time()
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
            timestamp_sec = (pos_msec / 1000.0) if pos_msec > 0 else (frame_idx / fps)

            telemetry = analyzer.process_frame(frame, timestamp_sec=timestamp_sec)
            telemetry["source"] = "real_tracking"
            telemetry["is_synthetic"] = False
            asyncio.run_coroutine_threadsafe(broadcast_telemetry(telemetry), loop)

            elapsed = time.time() - start_t
            sleep_time = max(0.001, frame_delay - elapsed)
            time.sleep(sleep_time)
    finally:
        cap.release()
        is_tracking = False
        tracking_mode = "idle"
        print("[AI Service] Real Tracking worker stopped.")


@app.post("/api/demo")
async def start_demo():
    """Explicitly start synthetic simulated demo tracking."""
    global is_tracking, tracking_mode, tracking_thread
    if is_tracking:
        return {"status": "already_running", "mode": tracking_mode}

    is_tracking = True
    tracking_mode = "demo"
    loop = asyncio.get_running_loop()
    tracking_thread = threading.Thread(
        target=_demo_worker,
        args=(loop,),
        daemon=True,
    )
    tracking_thread.start()
    return {"status": "started", "mode": "demo", "is_synthetic": True}


@app.post("/api/start")
@app.post("/api/start-stream")
async def start_tracking(req: StartStreamRequest):
    """Start tracking from video source or webcam. Requires a valid source."""
    global is_tracking, tracking_mode, tracking_thread
    if is_tracking:
        return {"status": "already_running", "mode": tracking_mode}

    if req.video_source == "demo":
        return await start_demo()

    # Validate video source existence if not numeric webcam device
    if not req.video_source.isdigit():
        video_path = Path(req.video_source)
        if not video_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Video file not found: '{req.video_source}'. For simulated testing, use POST /api/demo."
            )

    is_tracking = True
    tracking_mode = "real"
    loop = asyncio.get_running_loop()
    tracking_thread = threading.Thread(
        target=_video_tracking_worker,
        args=(req.video_source, loop),
        daemon=True,
    )
    tracking_thread.start()
    return {"status": "started", "mode": "real", "video_source": req.video_source, "is_synthetic": False}


@app.post("/api/stop")
def stop_tracking():
    global is_tracking, tracking_mode
    is_tracking = False
    tracking_mode = "idle"
    return {"status": "stopped", "mode": "idle"}


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    print("[AI Service] Client connected to AI Telemetry WebSocket")

    # Send initial status & latest telemetry if available
    await websocket.send_text(json.dumps({
        "type": "connection_ack",
        "is_tracking": is_tracking,
        "game_type": analyzer.game_type,
    }))
    if latest_telemetry:
        await websocket.send_text(json.dumps({
            "type": "telemetry",
            "data": latest_telemetry,
        }))

    try:
        while True:
            raw_text = await websocket.receive_text()
            data = json.loads(raw_text)
            action = data.get("action")

            if action == "swap_players":
                pid_a = int(data.get("pid_a", 1))
                pid_b = int(data.get("pid_b", 2))
                analyzer.swap_players(pid_a, pid_b)
                await websocket.send_text(json.dumps({
                    "type": "action_result",
                    "action": "swap_players",
                    "status": "success",
                }))
            elif action == "start":
                source = data.get("source", "demo")
                await start_tracking(StartStreamRequest(video_source=source))
            elif action == "stop":
                stop_tracking()
            elif action == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        connected_websockets.remove(websocket)
        print("[AI Service] Client disconnected from AI Telemetry WebSocket")


# ==========================================
# Tracking Session API (PDF §53-55)
# ==========================================
import uuid
import numpy as np

def resolve_processing_config(cfg: dict | None, runtime_device: str = "cpu") -> dict:
    cfg = dict(cfg or {})
    requested_profile = cfg.get("profile") or "reference"
    requested_device = cfg.get("device") or "auto"

    effective_device = resolve_device(requested_device) if requested_device != "auto" else runtime_device
    if effective_device == "auto":
        effective_device = resolve_device("auto")

    # Default Reference baseline
    detector_input_size = 640
    use_court_roi = False
    court_roi_margin_px = 60
    court_roi_margin_m = 0.5
    frame_stride = 2
    pose_stride = 1
    effective_profile = requested_profile

    if requested_profile == "quality":
        detector_input_size = 640
        use_court_roi = False
        court_roi_margin_px = 60
        court_roi_margin_m = 0.5
        frame_stride = 1
        pose_stride = 1
    elif requested_profile == "balanced":
        detector_input_size = 512
        use_court_roi = True
        court_roi_margin_px = 60
        court_roi_margin_m = 0.5
        frame_stride = 2
        pose_stride = 1
    elif requested_profile == "fast":
        detector_input_size = 416
        use_court_roi = True
        court_roi_margin_px = 60
        court_roi_margin_m = 0.5
        frame_stride = 3
        pose_stride = 2
    elif requested_profile == "auto":
        is_cuda = (effective_device == "cuda")
        if is_cuda:
            detector_input_size = 512
            use_court_roi = True
            court_roi_margin_px = 60
            court_roi_margin_m = 0.5
            frame_stride = 2
            pose_stride = 1
            effective_profile = "balanced"
        else:
            detector_input_size = 416
            use_court_roi = True
            court_roi_margin_px = 60
            court_roi_margin_m = 0.5
            frame_stride = 3
            pose_stride = 2
            effective_profile = "fast"
    elif requested_profile == "custom":
        detector_input_size = cfg.get("detector_input_size", cfg.get("detectorInputSize", 640))
        use_court_roi = cfg.get("use_court_roi", cfg.get("useCourtRoi", False))
        court_roi_margin_px = cfg.get("court_roi_margin_px", cfg.get("courtRoiMarginPx", 60))
        court_roi_margin_m = cfg.get("court_roi_margin_m", cfg.get("courtRoiMarginM", 0.5))
        frame_stride = cfg.get("frame_stride", cfg.get("frameStride", 2))
        pose_stride = cfg.get("pose_stride", cfg.get("poseStride", 1))

    # Explicit user overrides if provided
    if "detector_input_size" in cfg or "detectorInputSize" in cfg:
        detector_input_size = cfg.get("detector_input_size", cfg.get("detectorInputSize"))
    if "use_court_roi" in cfg or "useCourtRoi" in cfg:
        use_court_roi = cfg.get("use_court_roi", cfg.get("useCourtRoi"))
    if "court_roi_margin_px" in cfg or "courtRoiMarginPx" in cfg:
        court_roi_margin_px = cfg.get("court_roi_margin_px", cfg.get("courtRoiMarginPx"))
    if "court_roi_margin_m" in cfg or "courtRoiMarginM" in cfg:
        court_roi_margin_m = cfg.get("court_roi_margin_m", cfg.get("courtRoiMarginM"))
    if "frame_stride" in cfg or "frameStride" in cfg:
        frame_stride = cfg.get("frame_stride", cfg.get("frameStride"))
    if "pose_stride" in cfg or "poseStride" in cfg:
        pose_stride = cfg.get("pose_stride", cfg.get("poseStride"))

    return {
        "profile": requested_profile,
        "requestedProfile": requested_profile,
        "effectiveProfile": effective_profile,
        "device": requested_device,
        "requestedDevice": requested_device,
        "effectiveDevice": effective_device,
        "detectorInputSize": int(detector_input_size),
        "useCourtRoi": bool(use_court_roi),
        "courtRoiMarginPx": int(court_roi_margin_px),
        "courtRoiMarginM": float(court_roi_margin_m),
        "frameStride": max(1, int(frame_stride)),
        "poseStride": max(1, int(pose_stride)),
    }


def compute_session_quality_metrics(results: list[dict], tracked_player_count: int = 2) -> dict:
    count = max(1, min(4, int(tracked_player_count or 2)))
    player_ids = [f"P{i}" for i in range(1, count + 1)]

    empty_player_stats = {
        pid: {
            "playerId": pid,
            "expectedFrames": 0,
            "observedFrames": 0,
            "predictedFrames": 0,
            "lostFrames": 0,
            "observedCoveragePct": 0.0,
            "predictedFramesPct": 0.0,
            "lostFramesPct": 0.0,
            "lostTimeSec": 0.0,
        }
        for pid in player_ids
    }

    if not results:
        return {
            "observedCoveragePct": 0.0,
            "lostFramesPct": 0.0,
            "predictedFramesPct": 0.0,
            "poseCoveragePct": 0.0,
            "playerCoverage": empty_player_stats,
        }

    total_expected_frames = len(results)
    player_observed = {pid: 0 for pid in player_ids}
    player_predicted = {pid: 0 for pid in player_ids}
    player_lost = {pid: 0 for pid in player_ids}
    player_lost_time = {pid: 0.0 for pid in player_ids}

    total_pose_observed = 0
    total_player_samples = 0

    timestamps = []
    for idx, frame in enumerate(results):
        t = frame.get("timestampSec", frame.get("timestamp_sec"))
        if t is None:
            t = round(idx * 0.033, 3)
        timestamps.append(float(t))

    for idx, frame in enumerate(results):
        if idx > 0:
            dt = max(0.0, timestamps[idx] - timestamps[idx - 1])
        elif len(timestamps) > 1:
            dt = max(0.0, timestamps[1] - timestamps[0])
        else:
            dt = 0.033

        frame_players = frame.get("players", [])
        frame_state_by_pid = {}
        for p_idx, p in enumerate(frame_players):
            pid = p.get("playerId")
            if not pid and "id" in p:
                pid = f"P{p['id']}"
            if not pid:
                pid = player_ids[p_idx] if p_idx < len(player_ids) else f"P{p_idx + 1}"
            frame_state_by_pid[pid] = p

        for pid in player_ids:
            p_data = frame_state_by_pid.get(pid)
            if p_data is None:
                player_lost[pid] += 1
                player_lost_time[pid] += dt
                total_player_samples += 1
                continue

            total_player_samples += 1
            state = p_data.get("state")
            if state == "observed":
                player_observed[pid] += 1
            elif state == "predicted":
                player_predicted[pid] += 1
            else:
                player_lost[pid] += 1
                player_lost_time[pid] += dt

            pose = p_data.get("pose")
            if pose and not pose.get("isReused", False):
                total_pose_observed += 1

    player_coverage = {}
    for pid in player_ids:
        obs = player_observed[pid]
        pred = player_predicted[pid]
        lost = player_lost[pid]
        cov_pct = round((obs / total_expected_frames) * 100.0, 1) if total_expected_frames > 0 else 0.0
        pred_pct = round((pred / total_expected_frames) * 100.0, 1) if total_expected_frames > 0 else 0.0
        lost_pct = round((lost / total_expected_frames) * 100.0, 1) if total_expected_frames > 0 else 0.0
        player_coverage[pid] = {
            "playerId": pid,
            "expectedFrames": total_expected_frames,
            "observedFrames": obs,
            "predictedFrames": pred,
            "lostFrames": lost,
            "observedCoveragePct": cov_pct,
            "predictedFramesPct": pred_pct,
            "lostFramesPct": lost_pct,
            "lostTimeSec": round(player_lost_time[pid], 2),
        }

    mean_observed_pct = round(sum(p["observedCoveragePct"] for p in player_coverage.values()) / len(player_coverage), 1)
    mean_lost_pct = round(sum(p["lostFramesPct"] for p in player_coverage.values()) / len(player_coverage), 1)
    mean_pred_pct = round(sum(p["predictedFramesPct"] for p in player_coverage.values()) / len(player_coverage), 1)
    pose_cov_pct = round((total_pose_observed / total_player_samples) * 100.0, 1) if total_player_samples > 0 else 0.0

    return {
        "observedCoveragePct": mean_observed_pct,
        "lostFramesPct": mean_lost_pct,
        "predictedFramesPct": mean_pred_pct,
        "poseCoveragePct": pose_cov_pct,
        "playerCoverage": player_coverage,
    }


class CreateSessionRequest(BaseModel):
    video_source: str = "demo"
    game_type: str = "doubles"
    project_id: str | None = None
    video_fingerprint: str | None = None
    device: str = "auto"
    tracked_player_count: int | None = None
    processing_config: dict | None = None

class SessionCalibrationRequest(BaseModel):
    corners: list[list[float]]
    game_type: str = "doubles"

class SessionPlayerRequest(BaseModel):
    players: list[dict]

class TrackingSession:
    def __init__(
        self,
        session_id: str,
        video_source: str = "demo",
        game_type: str = "doubles",
        project_id: str | None = None,
        video_fingerprint: str | None = None,
        device: str = "auto",
        tracked_player_count: int | None = None,
        processing_config: dict | None = None,
    ):
        self.session_id = session_id
        self.video_source = video_source
        self.game_type = game_type
        self.project_id = project_id
        self.video_fingerprint = video_fingerprint
        self.created_at = time.time()

        count = tracked_player_count
        if count is None:
            count = 2 if game_type == "singles" else 4
        if not (1 <= count <= 4):
            raise ValueError(f"tracked_player_count must be between 1 and 4, got {count}")
        self.tracked_player_count = count

        raw_config = dict(processing_config or {})
        if "device" not in raw_config:
            raw_config["device"] = device
        runtime_dev = resolve_device(device)
        resolved_cfg = resolve_processing_config(raw_config, runtime_device=runtime_dev)
        self.processing_config = resolved_cfg
        self.effective_processing_config = resolved_cfg
        self.requested_profile = resolved_cfg["requestedProfile"]
        self.effective_profile = resolved_cfg["effectiveProfile"]
        self.requested_device = resolved_cfg["requestedDevice"]
        self.effective_device = resolved_cfg["effectiveDevice"]
        self.device = resolved_cfg["effectiveDevice"]

        self.analyzer = BadmintonAnalyzerV2(
            game_type=game_type,
            max_players=self.tracked_player_count,
            device=self.effective_device,
            detector_input_size=resolved_cfg["detectorInputSize"],
            use_court_roi=resolved_cfg["useCourtRoi"],
            court_roi_margin_px=resolved_cfg["courtRoiMarginPx"],
            court_roi_margin_m=resolved_cfg.get("courtRoiMarginM", 2.0),
            pose_stride=resolved_cfg["poseStride"],
        )
        self.analyzer.analysis_id = session_id
        self.status = "READY"  # READY | CALIBRATING | ASSIGNING_PLAYERS | READY_TO_ANALYZE | PROCESSING | COMPLETED | ERROR
        self.progress_pct = 0.0
        self.current_frame = 0
        self.total_frames = 0
        self.analyzed_frames = 0
        self.source_fps = 30.0
        self.elapsed_sec = 0.0
        self.duration_sec = 0.0
        self.frame_stride = resolved_cfg["frameStride"]
        self.results: list[dict] = []
        self.error_message: str | None = None
        self.owned_video_path: Path | None = None
        v_meta, r_meta = extract_video_metadata(video_source)
        self.video_metadata: dict = v_meta
        self.research_metadata: dict = r_meta
        self._uploading = False
        self._cancel = False
        self._thread: threading.Thread | None = None

tracking_sessions: dict[str, TrackingSession] = {}


def _run_session_analysis(session: TrackingSession):
    session.status = "PROCESSING"
    session.progress_pct = 0.0
    session.results = []
    session.analyzed_frames = 0
    start_time = time.time()

    if session.video_source == "demo":
        # Synthetic demo generator (60 frames ~ 2s clip)
        # Demo sessions are explicitly synthetic and must not load or run the
        # production detector. Besides wasting work on blank frames, doing so
        # made the lifecycle depend on model warm-up time and could leave the
        # session in PROCESSING past the API's completion window.
        session.analyzer._detector = "dummy"
        total_frames = 60
        session.total_frames = total_frames
        session.duration_sec = 2.0
        session.source_fps = 30.0
        session.frame_stride = 1
        for i in range(total_frames):
            if session._cancel:
                break
            t = round(i * 0.033, 2)
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            telemetry = session.analyzer.process_frame(frame, timestamp_sec=t)
            telemetry["source"] = "synthetic_demo"
            telemetry["isSynthetic"] = True
            session.results.append(telemetry)
            session.analyzed_frames += 1
            session.current_frame = i + 1
            session.progress_pct = round(((i + 1) / total_frames) * 100.0, 1)
            session.elapsed_sec = round(time.time() - start_time, 1)
            time.sleep(0.01)

        if not session._cancel:
            session.status = "COMPLETED"
            session.progress_pct = 100.0
        else:
            session.status = "READY"
        return

    # Real video file
    video_path = Path(session.video_source)
    if not video_path.exists():
        session.status = "ERROR"
        session.error_message = f"Video file not found: {session.video_source}"
        return

    cap = cv2.VideoCapture(session.video_source)
    if not cap.isOpened():
        session.status = "ERROR"
        session.error_message = f"Failed to open video file: {session.video_source}"
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 300
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    session.source_fps = fps
    session.analyzer.fps = fps
    session.analyzer.dist_tracker.fps = fps
    session.total_frames = total_frames
    session.duration_sec = round(total_frames / fps, 2)

    frame_idx = 0
    try:
        while not session._cancel:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
            timestamp_sec = (pos_msec / 1000.0) if pos_msec > 0 else (frame_idx / fps)
            if frame_idx % session.frame_stride != 0:
                session.current_frame = frame_idx
                session.progress_pct = round((frame_idx / total_frames) * 100.0, 1)
                continue
            telemetry = session.analyzer.process_frame(frame, timestamp_sec=timestamp_sec)
            telemetry["source"] = "real_tracking"
            telemetry["isSynthetic"] = False
            session.results.append(telemetry)
            session.analyzed_frames += 1
            session.current_frame = frame_idx
            session.progress_pct = round((frame_idx / total_frames) * 100.0, 1)
            session.elapsed_sec = round(time.time() - start_time, 1)
        
        if not session._cancel:
            session.status = "COMPLETED"
            session.progress_pct = 100.0
        else:
            session.status = "READY"
    except Exception as e:
        session.status = "ERROR"
        session.error_message = str(e)
    finally:
        cap.release()


@app.post("/api/tracking/sessions")
def create_tracking_session(req: CreateSessionRequest):
    session_id = f"session_{uuid.uuid4().hex[:8]}"
    try:
        session = TrackingSession(
            session_id,
            video_source=req.video_source,
            game_type=req.game_type,
            project_id=req.project_id,
            video_fingerprint=req.video_fingerprint,
            device=req.device,
            tracked_player_count=req.tracked_player_count,
            processing_config=req.processing_config,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    tracking_sessions[session_id] = session
    return {
        "sessionId": session_id,
        "status": session.status,
        "gameType": session.game_type,
        "videoSource": session.video_source,
        "trackedPlayerCount": session.tracked_player_count,
        "device": session.effective_device,
        "requestedDevice": session.requested_device,
        "effectiveDevice": session.effective_device,
        "processingConfig": session.processing_config,
        "effectiveProcessingConfig": session.effective_processing_config,
    }


@app.get("/api/tracking/sessions")
def list_tracking_sessions(project_id: str | None = None):
    sessions = [
        session for session in tracking_sessions.values()
        if project_id is None or session.project_id == project_id
    ]
    sessions.sort(key=lambda session: session.created_at, reverse=True)
    return {
        "sessions": [
            {
                "sessionId": session.session_id,
                "status": session.status,
                "gameType": session.game_type,
                "projectId": session.project_id,
                "videoFingerprint": session.video_fingerprint,
                "device": session.effective_device,
                "requestedDevice": session.requested_device,
                "effectiveDevice": session.effective_device,
                "progressPct": session.progress_pct,
                "currentFrame": session.current_frame,
                "totalFrames": session.total_frames,
                "analyzedFrames": session.analyzed_frames,
                "trackedPlayerCount": session.tracked_player_count,
                "processingConfig": session.processing_config,
                "effectiveProcessingConfig": session.effective_processing_config,
                "resumable": session.status not in {"COMPLETED", "ERROR"},
            }
            for session in sessions
        ]
    }


@app.post("/api/tracking/sessions/{session_id}/video")
async def upload_session_video(session_id: str, request: Request):
    session = tracking_sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session._uploading or (session._thread and session._thread.is_alive()):
        raise HTTPException(status_code=409, detail="Session is busy")
    session._uploading = True
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="sportscout_", suffix=".video", delete=False) as target:
            temp_path = Path(target.name)
            async for chunk in request.stream():
                target.write(chunk)
        cap = cv2.VideoCapture(str(temp_path))
        try:
            readable, frame = cap.read()
            fps = cap.get(cv2.CAP_PROP_FPS)
        finally:
            cap.release()
        if not readable or frame is None:
            raise HTTPException(status_code=422, detail="The uploaded file cannot be decoded as video")
        if session.owned_video_path:
            session.owned_video_path.unlink(missing_ok=True)
        session.owned_video_path = temp_path
        session.video_source = str(temp_path)
        session.analyzer.fps = fps if fps > 0 else 30.0
        session.analyzer.dist_tracker.fps = session.analyzer.fps
        orig_filename = (
            request.query_params.get("filename")
            or request.headers.get("X-Original-Filename")
            or request.headers.get("X-Filename")
        )
        v_meta, r_meta = extract_video_metadata(str(temp_path), original_filename=orig_filename)
        session.video_metadata = v_meta
        session.research_metadata = r_meta
        temp_path = None
        return {
            "sessionId": session_id,
            "width": frame.shape[1],
            "height": frame.shape[0],
            "fps": session.analyzer.fps,
            "videoMetadata": session.video_metadata,
            "researchMetadata": session.research_metadata,
        }
    finally:
        session._uploading = False
        if temp_path:
            temp_path.unlink(missing_ok=True)


@app.post("/api/tracking/sessions/{session_id}/calibration")
def calibrate_session(session_id: str, req: SessionCalibrationRequest):
    if session_id not in tracking_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    session = tracking_sessions[session_id]
    session.game_type = req.game_type
    session.analyzer.game_type = req.game_type
    try:
        session.analyzer.set_court_corners(req.corners)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    session.status = "ASSIGNING_PLAYERS"
    return {"status": "success", "sessionStatus": session.status}


@app.post("/api/tracking/sessions/{session_id}/players")
def assign_session_players(session_id: str, req: SessionPlayerRequest):
    if session_id not in tracking_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    session = tracking_sessions[session_id]
    if session.video_source == "demo":
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    else:
        cap = cv2.VideoCapture(session.video_source)
        try:
            readable, frame = cap.read()
        finally:
            cap.release()
        if not readable or frame is None:
            raise HTTPException(status_code=422, detail="Upload a decodable video before assigning players")
    session.analyzer.assign_initial_players(frame, req.players)
    session.status = "READY_TO_ANALYZE"
    return {"status": "success", "sessionStatus": session.status, "assignedCount": len(req.players)}


@app.post("/api/tracking/sessions/{session_id}/start")
def start_session_analysis(session_id: str):
    if session_id not in tracking_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    session = tracking_sessions[session_id]
    if session.status == "PROCESSING":
        return {"status": "already_processing", "sessionId": session_id}
    
    session._cancel = False
    session._thread = threading.Thread(target=_run_session_analysis, args=(session,), daemon=True)
    session._thread.start()
    return {"status": "started", "sessionId": session_id}


def _build_session_metrics(session: TrackingSession):
    sampling_fps = round(session.source_fps / session.frame_stride, 2) if session.frame_stride > 0 else 0.0
    analysis_fps = round(session.analyzed_frames / session.elapsed_sec, 2) if session.elapsed_sec > 0.05 else 0.0
    processed_video_time = round(session.current_frame / session.source_fps, 2) if session.source_fps > 0 else 0.0

    if session.status == "COMPLETED":
        # Final performance metrics: computed against total video duration (with zero protection)
        rtf = round(session.elapsed_sec / session.duration_sec, 2) if session.duration_sec > 0 else 0.0
        realtime_speed = round(session.duration_sec / session.elapsed_sec, 2) if session.elapsed_sec > 0.05 else 0.0
    else:
        # Live processing metrics: computed against processed video time, NOT total duration!
        rtf = round(session.elapsed_sec / processed_video_time, 2) if processed_video_time > 0.05 else None
        realtime_speed = round(processed_video_time / session.elapsed_sec, 2) if session.elapsed_sec > 0.05 else None

    performance = {
        "elapsedSec": round(session.elapsed_sec, 1),
        "processedVideoTimeSec": processed_video_time,
        "videoDurationSec": session.duration_sec,
        "rtf": rtf,
        "realtimeSpeed": realtime_speed,
        "analysisFps": analysis_fps,
        "samplingFps": sampling_fps,
        "isFinal": (session.status == "COMPLETED"),
    }

    quality = compute_session_quality_metrics(session.results, session.tracked_player_count)

    provenance = {
        "detectorModel": session.analyzer.model_path,
        "trackerModel": "bytetrack",
        "poseModel": "yolov8n-pose.pt",
        "device": session.effective_device,
        "requestedDevice": session.requested_device,
        "effectiveDevice": session.effective_device,
        "requestedProfile": session.requested_profile,
        "effectiveProfile": session.effective_profile,
        "detectorInputSize": session.analyzer.detector_input_size,
        "frameStride": session.frame_stride,
        "poseStride": session.analyzer.pose_stride,
        "useCourtRoi": session.analyzer.use_court_roi,
        "courtRoiMarginPx": session.analyzer.court_roi_margin_px,
        "courtRoiMarginM": session.analyzer.court_roi_margin_m,
    }

    return performance, quality, provenance


@app.get("/api/tracking/sessions/{session_id}/status")
def get_session_status(session_id: str):
    if session_id not in tracking_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    session = tracking_sessions[session_id]

    performance_stats, quality_stats, runtime_provenance = _build_session_metrics(session)
    last_timestamp = session.results[-1].get("timestampSec") if session.results else None

    return {
        "sessionId": session_id,
        "status": session.status,
        "progressPct": session.progress_pct,
        "currentFrame": session.current_frame,
        "totalFrames": session.total_frames,
        "analyzedFrames": session.analyzed_frames,
        "frameStride": session.frame_stride,
        "elapsedSec": session.elapsed_sec,
        "videoDurationSec": session.duration_sec,
        "durationSec": session.duration_sec,
        "lastTelemetryTimestampSec": last_timestamp,
        "sourceFps": round(session.source_fps, 2),
        "samplingFps": performance_stats["samplingFps"],
        "analysisFps": performance_stats["analysisFps"],
        "trackedPlayerCount": session.tracked_player_count,
        "device": session.effective_device,
        "requestedDevice": session.requested_device,
        "effectiveDevice": session.effective_device,
        "processingConfig": session.processing_config,
        "effectiveProcessingConfig": session.effective_processing_config,
        "runtimeProvenance": runtime_provenance,
        "provenance": runtime_provenance,
        "performance": performance_stats,
        "quality": quality_stats,
        "videoMetadata": getattr(session, "video_metadata", None),
        "researchMetadata": getattr(session, "research_metadata", None),
        "players": session.analyzer.get_live_player_statuses(),
        "error": session.error_message,
    }


@app.get("/api/tracking/sessions/{session_id}/results")
def get_session_results(session_id: str, after: int | None = None):
    if session_id not in tracking_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    session = tracking_sessions[session_id]
    total_count = len(session.results)
    if after is not None:
        start_idx = max(0, int(after))
        items = session.results[start_idx:]
    else:
        items = session.results

    performance_stats, quality_stats, runtime_provenance = _build_session_metrics(session)

    return {
        "sessionId": session_id,
        "status": session.status,
        "sampleCount": len(items),
        "totalSampleCount": total_count,
        "nextCursor": total_count,
        "trackedPlayerCount": session.tracked_player_count,
        "device": session.effective_device,
        "requestedDevice": session.requested_device,
        "effectiveDevice": session.effective_device,
        "processingConfig": session.processing_config,
        "effectiveProcessingConfig": session.effective_processing_config,
        "runtimeProvenance": runtime_provenance,
        "provenance": runtime_provenance,
        "performance": performance_stats,
        "quality": quality_stats,
        "videoMetadata": getattr(session, "video_metadata", None),
        "researchMetadata": getattr(session, "research_metadata", None),
        "telemetry": items,
    }


@app.delete("/api/tracking/sessions/{session_id}")
def delete_tracking_session(session_id: str):
    if session_id not in tracking_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    session = tracking_sessions[session_id]
    if session._uploading:
        raise HTTPException(status_code=409, detail="Video upload is in progress")
    session._cancel = True
    if session._thread and session._thread.is_alive():
        session._thread.join(timeout=30)
        if session._thread.is_alive():
            raise HTTPException(status_code=409, detail="Analysis is stopping; retry deletion shortly")
    tracking_sessions.pop(session_id)
    if session.owned_video_path:
        session.owned_video_path.unlink(missing_ok=True)
    return {"status": "deleted", "sessionId": session_id}


if __name__ == "__main__":
    import uvicorn
    print("[AI Service] Starting SportsScout Badminton AI Service on http://localhost:8000 ...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
