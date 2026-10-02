"""
server.py โ€” FastAPI + WebSocket Telemetry Server for SportsScout AI Auto-Tracking
Bridges Python Badminton Motion Analyzer with React/TypeScript PWA.
"""

import os
import sys
import tempfile
import asyncio
import json
import hashlib
import math
import threading
import time
import logging
from contextlib import asynccontextmanager
from typing import Set, Literal
from pathlib import Path, PurePosixPath, PureWindowsPath

_REPO_ROOT = Path(__file__).resolve().parent.parent
_AI_SERVICE_DIR = Path(__file__).resolve().parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
if str(_AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(_AI_SERVICE_DIR))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import cv2

try:
    from ai_service.upload_media import has_video_container_header
    from ai_service.resource_limits import (
        get_max_upload_bytes, validate_processing_numbers, bounded_number,
        ResourceConfigError, safe_filename,
    )
except ImportError:
    from upload_media import has_video_container_header
    from resource_limits import (
        get_max_upload_bytes, validate_processing_numbers, bounded_number,
        ResourceConfigError, safe_filename,
    )

logger = logging.getLogger(__name__)


try:
    from ai_service.path_utils import sanitize_path_reference
except ImportError:
    from path_utils import sanitize_path_reference


def public_metadata(value):
    """Expose model/source names, not absolute machine paths, in API metadata."""
    if isinstance(value, dict):
        return {key: public_metadata(item) for key, item in value.items()}
    if isinstance(value, list):
        return [public_metadata(item) for item in value]
    if isinstance(value, str):
        sanitized = sanitize_path_reference(value)
        return sanitized if sanitized is not None else value
    return value


from analyzer_v2 import BadmintonAnalyzerV2
from calibration_contract import CalibrationState, CalibrationSource
from dataclasses import replace
from pose_adapter import PoseArchitectureNotImplementedError
from court_mapper import CourtMapper
from device_runtime import capability_report, resolve_device
from engine_config import (
    TrackingEngineConfig,
    create_baseline_engine_config,
    validate_engine_config,
    InvalidEngineConfigError,
    ModelNotFoundError,
)
from analysis_job_store import (
    AnalysisJobStore,
    JobStoreCorruptionError,
    JobStoreError,
    default_analysis_store,
)
try:
    from ai_service.video_metadata import extract_video_metadata
except ImportError:
    from video_metadata import extract_video_metadata

try:
    from ai_service.shuttle_pipeline import (
        create_shuttle_pipeline,
        ShuttlePipelineConfig,
        STATUS_AVAILABLE,
        STATUS_MODEL_UNAVAILABLE,
        STATUS_DISABLED,
    )
except ImportError:
    from shuttle_pipeline import (
        create_shuttle_pipeline,
        ShuttlePipelineConfig,
        STATUS_AVAILABLE,
        STATUS_MODEL_UNAVAILABLE,
        STATUS_DISABLED,
    )

try:
    from ai_service.local_security import SecurityConfigurationError, SecuritySettings, LegacySourceError
except ImportError:
    from local_security import SecurityConfigurationError, SecuritySettings, LegacySourceError


@asynccontextmanager
async def security_lifespan(_app: FastAPI):
    SecuritySettings.from_env().validate_bind()
    yield


app = FastAPI(title="SportsScout Badminton AI Service", version="1.0.0", lifespan=security_lifespan)

analysis_job_store = default_analysis_store()
ANALYSIS_RESULT_CHUNK_SIZE = 64
SESSION_RESULT_WINDOW_SIZE = 128
SEMANTIC_OWNER_HISTORY_LIMIT = 4096
RESULT_PAGE_SIZE = 250
RESUME_WARMUP_SOURCE_FRAMES = 60


@app.exception_handler(RequestValidationError)
async def safe_validation_error(request: Request, error: RequestValidationError):
    # Do not echo untrusted input (including paths and non-JSON NaN/Infinity).
    details = [{key: item[key] for key in ('loc', 'msg', 'type')} for item in error.errors()]
    return JSONResponse(status_code=422, content={'detail': details})

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

DEFAULT_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


def _positive_finite(value):
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        return None
    return float(value)


def _video_frame_timestamp(frame_index: int, fps: float, pos_msec, previous_timestamp: float | None = None) -> float:
    reported_msec = _positive_finite(pos_msec)
    timestamp = reported_msec / 1000.0 if reported_msec is not None else None
    if timestamp is None or (previous_timestamp is not None and timestamp <= previous_timestamp):
        timestamp = frame_index / fps
        if previous_timestamp is not None and timestamp <= previous_timestamp:
            timestamp = previous_timestamp + (1.0 / fps)
    return timestamp


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
    allow_private_network=True,
)


@app.middleware("http")
async def add_pna_and_cors_headers(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


@app.middleware("http")
async def enforce_ai_security(request: Request, call_next):
    settings = SecuritySettings.from_env()
    try:
        settings.validate_bind()
    except SecurityConfigurationError:
        return JSONResponse(status_code=503, content={"detail": "AI service security configuration is invalid"})

    server_address = request.scope.get("server")
    if server_address and not settings.may_serve_interface(server_address[0]):
        return JSONResponse(status_code=403, content={"detail": "Remote AI service access is disabled"})

    path = request.url.path
    if (
        path.startswith("/api/")
        and request.method != "OPTIONS"
        and not (request.method == "GET" and path == "/api/status")
        and not settings.authorize_bearer(request.headers.get("authorization"))
    ):
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await call_next(request)

# Global State
analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=4)
is_tracking = False
tracking_mode = "idle"  # "idle" | "real" | "demo"
tracking_thread = None
connected_websockets: Set[WebSocket] = set()
latest_telemetry = {}


class CalibrateRequest(BaseModel):
    corners: list[list[float]]
    game_type: Literal['singles', 'doubles'] = "doubles"


class InitPlayerRequest(BaseModel):
    players: list[dict]


class SwapPlayersRequest(BaseModel):
    pid_a: int
    pid_b: int


class StartStreamRequest(BaseModel):
    video_source: str = "demo"  # "demo", local video path, or "0" for webcam
    game_type: Literal['singles', 'doubles'] = "doubles"


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
    report["detectorModel"] = public_metadata(analyzer.model_path)
    pose_m = analyzer.engine_config.pose_model if hasattr(analyzer, "engine_config") and analyzer.engine_config.pose_model else "yolov8n-pose.pt"
    report["poseModel"] = pose_m
    default_shuttle = create_shuttle_pipeline()
    shuttle_prov = default_shuttle.get_provenance()
    probe_pipeline = create_shuttle_pipeline({"shuttle_enabled": True})
    shuttle_prov["modelAvailable"] = (probe_pipeline.status == STATUS_AVAILABLE)
    shuttle_prov["configuredModel"] = probe_pipeline.get_provenance().get("model")
    shuttle_prov["probeStatus"] = probe_pipeline.status
    shuttle_prov["probeFailureReason"] = probe_pipeline.failure_reason
    report["shuttle"] = shuttle_prov
    return public_metadata(report)


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
    print("[AI Service] Real Tracking worker started")
    tracking_mode = "real"

    src = int(video_source) if video_source.isdigit() else video_source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        is_tracking = False
        tracking_mode = "idle"
        error_msg = "Failed to open video source"
        print(f"[AI Service] Error: {error_msg}")
        asyncio.run_coroutine_threadsafe(
            broadcast_telemetry({"type": "error", "error": error_msg, "is_synthetic": False}),
            loop
        )
        return

    fps = _positive_finite(cap.get(cv2.CAP_PROP_FPS))
    if fps is None:
        cap.release()
        is_tracking = False
        tracking_mode = "idle"
        error_msg = "Source FPS unavailable; tracking cannot produce trustworthy video timestamps"
        asyncio.run_coroutine_threadsafe(
            broadcast_telemetry({"type": "error", "error": error_msg, "is_synthetic": False}),
            loop,
        )
        return
    frame_delay = 1.0 / fps
    frame_idx = 0
    last_timestamp_sec = None

    try:
        while is_tracking and tracking_mode == "real":
            start_t = time.time()
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
            timestamp_sec = _video_frame_timestamp(frame_idx, fps, pos_msec, last_timestamp_sec)
            last_timestamp_sec = timestamp_sec

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
    try:
        SecuritySettings.from_env().validate_legacy_source(req.video_source)
    except LegacySourceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from None
    if is_tracking:
        return {"status": "already_running", "mode": tracking_mode}

    if req.video_source == "demo":
        return await start_demo()

    is_tracking = True
    tracking_mode = "real"
    loop = asyncio.get_running_loop()
    tracking_thread = threading.Thread(
        target=_video_tracking_worker,
        args=(req.video_source, loop),
        daemon=True,
    )
    tracking_thread.start()
    return {"status": "started", "mode": "real", "is_synthetic": False}


@app.post("/api/stop")
def stop_tracking():
    global is_tracking, tracking_mode
    is_tracking = False
    tracking_mode = "idle"
    return {"status": "stopped", "mode": "idle"}


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    settings = SecuritySettings.from_env()
    server_address = websocket.scope.get("server")
    protocols = websocket.scope.get("subprotocols") or []
    try:
        settings.validate_bind()
    except SecurityConfigurationError:
        await websocket.close(code=4401)
        return
    if (
        (server_address and not settings.may_serve_interface(server_address[0]))
        or not settings.authorize_websocket(websocket.headers.get("authorization"), protocols)
    ):
        await websocket.close(code=4401)
        return
    await websocket.accept(subprotocol="sportscout" if "sportscout" in protocols else None)
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
# Tracking Session API (PDF ยง53-55)
# ==========================================
import uuid
import numpy as np

def resolve_processing_config(cfg: dict | None, runtime_device: str = "cpu") -> dict:
    cfg = dict(cfg or {})
    validate_processing_numbers(cfg)
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
        # Hardware selection must not change the analysis workload.
        effective_profile = "reference"
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

    # Vision engine seams (detector, pose, tracker, runtime, precision)
    detector_model = cfg.get("detector_model") or cfg.get("detectorModel") or "yolov8n.pt"
    detector_family = cfg.get("detector_family") or cfg.get("detectorFamily") or "yolov8"
    pose_model = cfg.get("pose_model") if "pose_model" in cfg else cfg.get("poseModel", "yolov8n-pose.pt")
    pose_family = cfg.get("pose_family") or cfg.get("poseFamily") or "yolov8"
    pose_architecture = cfg.get("pose_architecture") or cfg.get("poseArchitecture") or "roi_pose"
    tracker_name = cfg.get("tracker_name") or cfg.get("trackerName") or "bytetrack"
    tracker_config_path = cfg.get("tracker_config_path") or cfg.get("trackerConfigPath")
    tracker_config = cfg.get("tracker_config") or cfg.get("trackerConfig")
    reid_enabled = bool(cfg.get("reid_enabled") if "reid_enabled" in cfg else cfg.get("reidEnabled", False))
    reid_model = cfg.get("reid_model") if "reid_model" in cfg else cfg.get("reidModel")
    runtime = cfg.get("runtime") or "pytorch"
    precision = cfg.get("precision") or "fp32"
    model_artifact_ref = cfg.get("model_artifact_reference") or cfg.get("modelArtifactReference")
    conf_threshold = cfg.get("confidence_threshold") if "confidence_threshold" in cfg else cfg.get("confidenceThreshold", 0.35)
    shuttle_cfg = ShuttlePipelineConfig.from_dict(cfg, default_device=effective_device)
    if shuttle_cfg.enabled and shuttle_cfg.provider == 'rallylens_tracknet' and frame_stride != 1:
        raise ResourceConfigError('rallylens_tracknet requires frameStride=1 for consecutive source frames')

    return {
        "profile": requested_profile,
        "requestedProfile": requested_profile,
        "effectiveProfile": effective_profile,
        "device": requested_device,
        "requestedDevice": requested_device,
        "effectiveDevice": effective_device,
        "fallbackReason": 'CUDA unavailable; CPU selected' if effective_device == 'cpu' and requested_device in ('auto', 'cuda') else None,
        "detectorInputSize": int(detector_input_size),
        "useCourtRoi": bool(use_court_roi),
        "courtRoiMarginPx": int(court_roi_margin_px),
        "courtRoiMarginM": float(court_roi_margin_m),
        "frameStride": max(1, int(frame_stride)),
        "poseStride": max(1, int(pose_stride)),
        "detectorModel": str(detector_model),
        "detectorFamily": str(detector_family),
        "poseModel": str(pose_model) if pose_model is not None else None,
        "poseFamily": str(pose_family) if pose_family is not None else None,
        "poseArchitecture": str(pose_architecture),
        "trackerName": str(tracker_name),
        "trackerConfigPath": str(tracker_config_path) if tracker_config_path else None,
        "trackerConfig": str(tracker_config) if tracker_config else None,
        "reidEnabled": reid_enabled,
        "reidModel": str(reid_model) if reid_model else None,
        "runtime": str(runtime),
        "precision": str(precision),
        "modelArtifactReference": str(model_artifact_ref) if model_artifact_ref else None,
        "confidenceThreshold": float(conf_threshold),
        "shuttleEnabled": shuttle_cfg.enabled,
        "shuttleProvider": shuttle_cfg.provider,
        "shuttleModelPath": shuttle_cfg.model_path,
        "shuttleWindowSize": shuttle_cfg.window_size,
        "shuttleInputWidth": shuttle_cfg.input_width,
        "shuttleInputHeight": shuttle_cfg.input_height,
        "shuttleConfidenceThreshold": shuttle_cfg.confidence_threshold,
        "shuttleCentroidRelativeThreshold": shuttle_cfg.centroid_relative_threshold,
        "shuttleCandidateMode": shuttle_cfg.candidate_mode,
        "shuttleRecoveryEnabled": shuttle_cfg.recovery_enabled,
        "shuttleDevice": shuttle_cfg.device,
        "shuttleRuntime": shuttle_cfg.runtime,
        "shuttlePrecision": shuttle_cfg.precision,
        "shuttleAuxiliaryDetector": shuttle_cfg.auxiliary_detector,
        "shuttleBuildTrajectory": shuttle_cfg.build_trajectory,
        "autoCourtCalibrationEnabled": bool(
            cfg.get("auto_court_calibration_enabled")
            if "auto_court_calibration_enabled" in cfg
            else cfg.get("autoCourtCalibrationEnabled", False)
        ),
    }


def compute_session_quality_metrics(results: list[dict], tracked_player_count: int = 2) -> dict:
    count = max(1, min(4, int(tracked_player_count or 2)))
    player_ids = [f"P{i}" for i in range(1, count + 1)]

    if not results:
        return {
            "observedCoveragePct": None,
            "lostFramesPct": None,
            "predictedFramesPct": None,
            "poseCoveragePct": None,
            "playerCoverage": {},
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
    game_type: Literal['singles', 'doubles'] = "doubles"
    project_id: str | None = None
    video_fingerprint: str | None = None
    device: str = "auto"
    tracked_player_count: int | None = Field(default=None, strict=True, ge=1, le=4)
    processing_config: dict | None = None

class SessionCalibrationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    corners: list[list[float]]
    game_type: Literal['singles', 'doubles'] = "doubles"
    camera_segment_id: str | None = None
    frame_index: int | None = None
    timestamp_sec: float | None = None
    calibration_version: str | None = None

class SessionPlayerRequest(BaseModel):
    players: list[dict]


class SessionQualityAccumulator:
    """Fixed-size quality counters; the frame history remains in the durable result store."""

    def __init__(self, tracked_player_count: int, snapshot: dict | None = None):
        self.player_ids = [f"P{i}" for i in range(1, max(1, min(4, int(tracked_player_count or 2))) + 1)]
        self.frames = 0
        self.observed = {pid: 0 for pid in self.player_ids}
        self.predicted = {pid: 0 for pid in self.player_ids}
        self.lost = {pid: 0 for pid in self.player_ids}
        self.lost_time = {pid: 0.0 for pid in self.player_ids}
        self.pose_observed = 0
        self.player_samples = 0
        self.previous_timestamp: float | None = None
        self.previous_states: dict[str, str] | None = None
        if snapshot:
            self.restore(snapshot)

    def _frame_states(self, frame: dict) -> tuple[dict[str, str], int]:
        by_id: dict[str, dict] = {}
        players = frame.get("players", [])
        for index, player in enumerate(players):
            pid = player.get("playerId")
            if not pid and "id" in player:
                pid = f"P{player['id']}"
            if not pid:
                pid = self.player_ids[index] if index < len(self.player_ids) else f"P{index + 1}"
            by_id[pid] = player
        states: dict[str, str] = {}
        poses = 0
        for pid in self.player_ids:
            player = by_id.get(pid)
            state = player.get("state") if player else "lost"
            states[pid] = state if state in {"observed", "predicted"} else "lost"
            if player and player.get("pose") and not player["pose"].get("isReused", False):
                poses += 1
        return states, poses

    def _add_lost_time(self, states: dict[str, str], delta_sec: float) -> None:
        for pid, state in states.items():
            if state == "lost":
                self.lost_time[pid] += delta_sec

    def update(self, frame: dict) -> None:
        timestamp = frame.get("timestampSec", frame.get("timestamp_sec"))
        if timestamp is None or not math.isfinite(float(timestamp)):
            timestamp = max(0, self.frames - 1) * 0.033
        timestamp = float(timestamp)
        states, poses = self._frame_states(frame)

        if self.frames == 1 and self.previous_timestamp is not None and self.previous_states is not None:
            first_gap = max(0.0, timestamp - self.previous_timestamp)
            self._add_lost_time(self.previous_states, first_gap)
            self._add_lost_time(states, first_gap)
        elif self.previous_timestamp is not None:
            self._add_lost_time(states, max(0.0, timestamp - self.previous_timestamp))

        for pid, state in states.items():
            if state == "observed":
                self.observed[pid] += 1
            elif state == "predicted":
                self.predicted[pid] += 1
            else:
                self.lost[pid] += 1
        self.player_samples += len(self.player_ids)
        self.pose_observed += poses
        self.frames += 1
        self.previous_timestamp = timestamp
        self.previous_states = states

    def snapshot(self) -> dict:
        return {
            "frames": self.frames,
            "playerIds": self.player_ids,
            "observed": self.observed,
            "predicted": self.predicted,
            "lost": self.lost,
            "lostTimeSec": self.lost_time,
            "poseObserved": self.pose_observed,
            "playerSamples": self.player_samples,
            "previousTimestamp": self.previous_timestamp,
            "previousStates": self.previous_states,
        }

    def restore(self, snapshot: dict) -> None:
        self.frames = int(snapshot.get("frames", 0))
        for key, target in (("observed", self.observed), ("predicted", self.predicted), ("lost", self.lost), ("lostTimeSec", self.lost_time)):
            source = snapshot.get(key, {})
            for pid in self.player_ids:
                target[pid] = source.get(pid, target[pid])
        self.pose_observed = int(snapshot.get("poseObserved", 0))
        self.player_samples = int(snapshot.get("playerSamples", 0))
        self.previous_timestamp = snapshot.get("previousTimestamp")
        self.previous_states = snapshot.get("previousStates")

    def to_dict(self) -> dict:
        if self.frames == 0:
            return {
                "observedCoveragePct": None,
                "lostFramesPct": None,
                "predictedFramesPct": None,
                "poseCoveragePct": None,
                "playerCoverage": {},
            }
        player_coverage = {}
        for pid in self.player_ids:
            observed = self.observed[pid]
            predicted = self.predicted[pid]
            lost = self.lost[pid]
            player_coverage[pid] = {
                "playerId": pid,
                "expectedFrames": self.frames,
                "observedFrames": observed,
                "predictedFrames": predicted,
                "lostFrames": lost,
                "observedCoveragePct": round(observed / self.frames * 100.0, 1),
                "predictedFramesPct": round(predicted / self.frames * 100.0, 1),
                "lostFramesPct": round(lost / self.frames * 100.0, 1),
                "lostTimeSec": round(self.lost_time[pid], 2),
            }
        return {
            "observedCoveragePct": round(sum(row["observedCoveragePct"] for row in player_coverage.values()) / len(player_coverage), 1),
            "lostFramesPct": round(sum(row["lostFramesPct"] for row in player_coverage.values()) / len(player_coverage), 1),
            "predictedFramesPct": round(sum(row["predictedFramesPct"] for row in player_coverage.values()) / len(player_coverage), 1),
            "poseCoveragePct": round(self.pose_observed / self.player_samples * 100.0, 1) if self.player_samples else 0.0,
            "playerCoverage": player_coverage,
        }


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
        if game_type not in {'singles', 'doubles'}:
            raise ResourceConfigError('game_type must be singles or doubles')
        self.project_id = project_id
        self.video_fingerprint = video_fingerprint
        self.created_at = time.time()

        count = tracked_player_count
        if count is None:
            count = 2 if game_type == "singles" else 4
        bounded_number(count, 'tracked_player_count', 1, 4, integer=True)
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

        engine_cfg = TrackingEngineConfig(
            detector_model=resolved_cfg.get("detectorModel", "yolov8n.pt"),
            detector_family=resolved_cfg.get("detectorFamily", "yolov8"),
            pose_model=resolved_cfg.get("poseModel", "yolov8n-pose.pt"),
            pose_family=resolved_cfg.get("poseFamily", "yolov8"),
            pose_architecture=resolved_cfg.get("poseArchitecture", "roi_pose"),
            tracker_name=resolved_cfg.get("trackerName", "bytetrack"),
            tracker_config_path=resolved_cfg.get("trackerConfigPath"),
            tracker_config=resolved_cfg.get("trackerConfig"),
            reid_enabled=resolved_cfg.get("reidEnabled", False),
            reid_model=resolved_cfg.get("reidModel"),
            runtime=resolved_cfg.get("runtime", "pytorch"),
            precision=resolved_cfg.get("precision", "fp32"),
            model_artifact_reference=resolved_cfg.get("modelArtifactReference"),
            detector_input_size=resolved_cfg["detectorInputSize"],
            confidence_threshold=resolved_cfg.get("confidenceThreshold", 0.35),
            frame_stride=resolved_cfg["frameStride"],
            pose_stride=resolved_cfg["poseStride"],
            use_court_roi=resolved_cfg["useCourtRoi"],
            court_roi_margin_px=resolved_cfg["courtRoiMarginPx"],
            court_roi_margin_m=resolved_cfg.get("courtRoiMarginM", 2.0),
            auto_court_calibration_enabled=bool(resolved_cfg.get("autoCourtCalibrationEnabled", False)),
            device=self.effective_device,
        )
        validate_engine_config(engine_cfg)

        custom_provider = raw_config.get("custom_provider") or raw_config.get("customProvider")
        custom_auxiliary = raw_config.get("custom_auxiliary") or raw_config.get("customAuxiliary")
        self.shuttle_pipeline = create_shuttle_pipeline(
            resolved_cfg,
            custom_provider=custom_provider,
            custom_auxiliary=custom_auxiliary,
            default_device=self.effective_device,
        )

        self.analyzer = BadmintonAnalyzerV2(
            game_type=game_type,
            max_players=self.tracked_player_count,
            device=self.requested_device,
            engine_config=engine_cfg,
            shuttle_pipeline=self.shuttle_pipeline,
            auto_calibrate=bool(resolved_cfg.get("autoCourtCalibrationEnabled", False)),
        )
        self.analyzer.analysis_id = session_id
        self.status = "READY"  # READY | VIDEO_READY | READY_TO_ANALYZE | PROCESSING | COMPLETED | ERROR
        self.progress_pct = 0.0
        self.current_frame = 0
        self.total_frames = 0
        self.analyzed_frames = 0
        self.source_fps = 30.0
        self.elapsed_sec = 0.0
        self.duration_sec = 0.0
        self.frame_stride = resolved_cfg["frameStride"]
        self.results: list[dict] = []
        self.pending_results: list[dict] = []
        self.quality_accumulator = SessionQualityAccumulator(self.tracked_player_count)
        self.error_message: str | None = None
        self.owned_video_path: Path | None = None
        self.job_store = analysis_job_store
        self.calibration_request: dict | None = None
        self.player_assignments: list[dict] | None = None
        self.resume_checkpoint: dict | None = None
        self.resume_distance_aggregates: dict | None = None
        self.is_resuming = False
        self.media_hash: str | None = None
        self.result_write_sequence = 0
        self.segment_start_frame = 0
        self.last_observation_frame = 0
        self.last_camera_segment_id: str | None = None
        v_meta, r_meta = extract_video_metadata(video_source)
        self.video_metadata: dict = v_meta
        self.research_metadata: dict = r_meta
        self._uploading = False
        self._deleting = False
        self._cancel = False
        self._thread: threading.Thread | None = None
        self._state_lock = threading.RLock()

tracking_sessions: dict[str, TrackingSession] = {}
analysis_worker_slots = threading.BoundedSemaphore(1)


def _config_identity(config: dict) -> str:
    stable = {key: value for key, value in config.items() if key not in {"effectiveDevice", "fallbackReason"}}
    encoded = json.dumps(stable, sort_keys=True, separators=(",", ":"), default=str, allow_nan=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _model_identity(session: TrackingSession) -> dict:
    cfg = session.processing_config
    from device_runtime import artifact_sha256, package_version
    hashes = {}
    for kind, reference in {
        "detector": cfg.get("modelArtifactReference") or cfg.get("detectorModel", "yolov8n.pt"),
        "pose": cfg.get("poseModel"),
        "shuttle": cfg.get("shuttleModelPath") if cfg.get("shuttleEnabled") else None,
        "reid": cfg.get("reidModel") if cfg.get("reidEnabled") else None,
    }.items():
        digest = None
        if reference:
            for candidate in (Path(reference), Path.home() / "AppData/Roaming/Ultralytics" / reference, Path.home() / ".cache/ultralytics" / reference):
                if candidate.is_file():
                    digest = artifact_sha256(candidate)
                    break
        hashes[kind] = digest
    return {
        "artifactSha256": hashes,
        "runtimeVersion": package_version("torch"),
        "providerVersion": package_version("ultralytics"),
        "pipelineContractVersion": "analysis-job-v1",
        "detectorModel": cfg.get("detectorModel", "yolov8n.pt"),
        "poseModel": cfg.get("poseModel", "yolov8n-pose.pt"),
        "runtime": cfg.get("runtime", "pytorch"),
        "precision": cfg.get("precision", "fp32"),
        "artifactReference": cfg.get("modelArtifactReference"),
    }


def _session_identity(session: TrackingSession, current: dict | None = None) -> dict:
    identity = dict(current or {})
    source = session.video_source
    identity.update({
        "mediaSource": "synthetic_demo" if source == "demo" else str(Path(source).expanduser().resolve()),
        "mediaHash": session.media_hash or identity.get("mediaHash"),
        "videoFingerprint": session.video_fingerprint,
        "configHash": _config_identity(session.processing_config),
        "model": _model_identity(session),
    })
    return identity


def _session_job_metadata(session: TrackingSession, existing: dict | None = None) -> dict:
    metadata = dict(existing or {})
    metadata["session"] = {
        "videoSource": session.video_source,
        "ownedVideo": bool(session.owned_video_path),
        "gameType": session.game_type,
        "projectId": session.project_id,
        "videoFingerprint": session.video_fingerprint,
        "device": session.requested_device,
        "trackedPlayerCount": session.tracked_player_count,
        "processingConfig": session.processing_config,
        "videoMetadata": session.video_metadata,
        "researchMetadata": session.research_metadata,
        "calibration": session.calibration_request,
        "players": session.player_assignments,
        "mediaHash": session.media_hash,
    }
    return metadata


_UNSET_JOB_ERROR = object()


def _persist_session_job(session: TrackingSession, *, status: str | None = None, error: str | None | object = _UNSET_JOB_ERROR) -> dict:
    job = session.job_store.get_job(session.session_id)
    patch = {
        "identity": _session_identity(session, job.get("identity")),
        "metadata": _session_job_metadata(session, job.get("metadata")),
    }
    if status is not None:
        patch["status"] = status
    if error is not _UNSET_JOB_ERROR:
        patch["error"] = error
    return session.job_store.update_job(session.session_id, patch)


def _resume_warmup_source_frames(session: TrackingSession) -> int:
    temporal_window = int(session.processing_config.get("shuttleWindowSize", 1)) if session.processing_config.get("shuttleEnabled") else 1
    return max(RESUME_WARMUP_SOURCE_FRAMES, session.frame_stride * temporal_window)


def _checkpoint_payload(session: TrackingSession) -> dict:
    analyzer = session.analyzer
    calibration = analyzer.calibration_context.frame_fields()
    committed = session.job_store.get_job(session.session_id)["checkpoint"]
    last_processed_frame = (
        session.last_observation_frame
        if session.pending_results
        else int(committed.get("lastProcessedFrame", 0) or 0)
    )
    return {
        "lastProcessedFrame": last_processed_frame,
        "segmentStartFrame": session.segment_start_frame,
        "analyzerFrameIndex": analyzer.frame_count,
        "analyzedFrames": session.analyzed_frames,
        "sourceFps": session.source_fps,
        "durationSec": session.duration_sec,
        "elapsedSec": session.elapsed_sec,
        "playerSummary": analyzer.get_live_player_statuses(),
        "identityProfiles": {str(pid): {"name": profile.name, "team": profile.team, "colorHistogram": profile.color_hist.tolist() if profile.color_hist is not None else None, "reidEmbedding": profile.reid_embedding.tolist() if profile.reid_embedding is not None else None, "needsReacquisition": profile.identity_needs_reacquisition} for pid, profile in analyzer.profiles.items()},
        "identityCounters": {"rawTrackerIdSwitches": analyzer.raw_tracker_id_switches, "semanticPlayerIdSwitches": analyzer.semantic_player_id_switches},
        "frameStride": session.frame_stride,
        "segmentCalibrationState": {
            "cameraSegmentId": analyzer.calibration_context.camera_segment_id,
            "calibrationId": calibration.get("calibrationId"),
            "calibrationState": calibration.get("calibrationState"),
            "calibrationVersion": calibration.get("calibrationVersion"),
            "cornersPx": analyzer.court_corners_px.tolist() if analyzer.court_corners_px is not None else None,
            "provenance": calibration.get("calibration"),
        },
        "backendProvenance": _build_session_metrics(session)[2],
        "distanceAggregates": analyzer.dist_tracker.aggregate_snapshot(),
        "qualityAccumulator": session.quality_accumulator.snapshot(),
        "temporalState": {
            "mode": "RECENT_FRAME_WARMUP",
            "restored": False,
            "warmupSourceFrames": _resume_warmup_source_frames(session),
            "identityState": "APPEARANCE_RESTORED_TRACK_IDS_REACQUIRE",
            "metricContinuity": "BREAK_AT_RESUME_BOUNDARY",
            "reason": "Detector tracker and shuttle temporal inputs are recreated; recent source frames must be replayed before continuing.",
        },
    }


def _commit_pending_results(session: TrackingSession) -> None:
    with session._state_lock:
        if not session.pending_results:
            return
        job = session.job_store.get_job(session.session_id)
        sequence = job["checkpoint"]["committedSequence"] + 1
        pending = session.pending_results
        checkpoint = _checkpoint_payload(session)
        committed = session.job_store.append_result_chunk(
            session.session_id,
            sequence,
            pending,
            checkpoint=checkpoint,
        )
        session.result_write_sequence = committed["checkpoint"]["committedSequence"]
        session.persisted_provenance = checkpoint["backendProvenance"]
        session.persisted_player_summary = checkpoint["playerSummary"]
        session.pending_results = []
        session.job_store.update_job(session.session_id, {
            "progress": {
                "progressPct": session.progress_pct,
                "lastProcessedFrame": session.current_frame,
                "analyzedFrames": session.analyzed_frames,
                "totalFrames": session.total_frames,
            },
        })


def _append_session_result(session: TrackingSession, telemetry: dict) -> None:
    telemetry = jsonable_encoder(telemetry)
    segment_id = telemetry.get("cameraSegmentId")
    if session.last_camera_segment_id is None:
        session.last_camera_segment_id = segment_id
        session.segment_start_frame = max(0, session.current_frame)
    elif segment_id is not None and segment_id != session.last_camera_segment_id:
        session.last_camera_segment_id = segment_id
        session.segment_start_frame = max(0, session.current_frame)
    session.results.append(telemetry)
    if len(session.results) > SESSION_RESULT_WINDOW_SIZE:
        del session.results[:len(session.results) - SESSION_RESULT_WINDOW_SIZE]
    session.pending_results.append(telemetry)
    session.last_observation_frame = session.current_frame
    session.analyzed_frames += 1
    session.quality_accumulator.update(telemetry)
    with session._state_lock:
        owners = session.analyzer.last_known_track_owners
        if len(owners) > SEMANTIC_OWNER_HISTORY_LIMIT:
            active_ids = {profile.track_id for profile in session.analyzer.profiles.values() if profile.track_id is not None}
            for track_id in list(owners):
                if len(owners) <= SEMANTIC_OWNER_HISTORY_LIMIT:
                    break
                if track_id not in active_ids:
                    owners.pop(track_id, None)
    if len(session.pending_results) >= ANALYSIS_RESULT_CHUNK_SIZE:
        _commit_pending_results(session)


def _ensure_media_identity(session: TrackingSession) -> None:
    if session.video_source == "demo":
        session.media_hash = "synthetic-demo-v1"
    else:
        path = Path(session.video_source)
        if not path.exists() or not path.is_file():
            raise FileNotFoundError("Video file not found; analysis cannot resume")
        observed_hash = session.job_store.hash_file(path)
        job = session.job_store.get_job(session.session_id)
        prior_hash = job.get("identity", {}).get("mediaHash")
        if prior_hash and prior_hash != observed_hash:
            raise JobStoreError("Video media identity changed since this job was checkpointed")
        session.media_hash = observed_hash
    _persist_session_job(session)


def _restore_persisted_session(session_id: str) -> TrackingSession | None:
    existing = tracking_sessions.get(session_id)
    if existing is not None:
        return existing
    try:
        job = analysis_job_store.get_job(session_id)
    except FileNotFoundError:
        return None
    except JobStoreError as error:
        issue = f"{session_id}: persisted job unavailable ({type(error).__name__})"
        analysis_job_store.recovery_report.setdefault("issues", []).append(issue)
        logger.error("%s", issue)
        return None
    metadata = job.get("metadata", {}).get("session") or {}
    video_source = metadata.get("videoSource", "demo")
    try:
        session = TrackingSession(
            session_id,
            video_source=video_source,
            game_type=metadata.get("gameType", "doubles"),
            project_id=metadata.get("projectId"),
            video_fingerprint=metadata.get("videoFingerprint"),
            device=metadata.get("device", "auto"),
            tracked_player_count=metadata.get("trackedPlayerCount"),
            processing_config=metadata.get("processingConfig"),
        )
    except Exception as error:
        logger.error("Persisted analysis session could not be reconstructed (%s)", type(error).__name__)
        return None

    session.job_store = analysis_job_store
    session.created_at = job.get("createdAt", session.created_at)
    session.status = job.get("status", "ERROR")
    session.error_message = job.get("error")
    session.video_metadata = metadata.get("videoMetadata") or session.video_metadata
    session.research_metadata = metadata.get("researchMetadata") or session.research_metadata
    session.media_hash = metadata.get("mediaHash")
    if metadata.get("ownedVideo") and video_source != "demo":
        session.owned_video_path = Path(video_source)
    checkpoint = job.get("checkpoint", {})
    segment_state = checkpoint.get("segmentCalibrationState") or {}
    segment_id = segment_state.get("cameraSegmentId")
    if segment_id:
        session.analyzer.calibration_context.camera_segment_id = segment_id
        session.analyzer.calibration_context.camera_segment_index = int(segment_id.removeprefix("segment-"))
        session.analyzer.scene_lifecycle.current_segment_id = segment_id
    calibration = metadata.get("calibration")
    session.calibration_request = calibration
    if checkpoint.get("committedCursor", 0) > 0:
        calibration = None
        if segment_state.get("calibrationState") == "CALIBRATED" and segment_state.get("cornersPx"):
            calibration = {"corners": segment_state["cornersPx"], "calibration_version": segment_state.get("calibrationVersion")}
        else:
            session.analyzer.calibration_context.state = CalibrationState(segment_state.get("calibrationState", "UNCALIBRATED"))
    if calibration and calibration.get("corners"):
        try:
            session.analyzer.set_court_corners(
                calibration["corners"],
                camera_segment_id=segment_id,
                calibration_version=calibration.get("calibration_version"),
                created_at_frame=calibration.get("frame_index"),
                created_at_timestamp_sec=calibration.get("timestamp_sec"),
            )
            if checkpoint.get("committedCursor", 0) and segment_state.get("calibrationId"):
                provenance = segment_state.get("provenance") or {}
                session.analyzer.calibration_context.provenance = replace(
                    session.analyzer.calibration_context.provenance,
                    calibration_id=segment_state["calibrationId"],
                    source=CalibrationSource(provenance.get("source", "manual")),
                    confidence=provenance.get("confidence"),
                    reprojection_error_px=provenance.get("reprojectionErrorPx"),
                    created_at_frame=provenance.get("createdAtFrame", 0),
                    created_at_timestamp_sec=provenance.get("createdAtTimestampSec", 0.0),
                )
        except (ValueError, TypeError):
            session.status = "ERROR"
            session.error_message = "Saved calibration state is invalid; analysis cannot resume"
    for pid, saved in checkpoint.get("identityProfiles", {}).items():
        profile = session.analyzer.profiles.get(int(pid))
        if profile is None:
            continue
        profile.name = saved.get("name", profile.name)
        profile.team = saved.get("team", 0)
        # MOT/spatial continuity and pending confirmation counts are not durable.
        # Older checkpoints in a later segment must also forbid initial seeding.
        profile.identity_needs_reacquisition = saved.get("needsReacquisition", segment_id not in (None, "segment-0"))
        profile.identity_confirmation_track = None
        profile.identity_confirmation_frames = 0
        histogram = saved.get("colorHistogram")
        embedding = saved.get("reidEmbedding")
        if histogram is not None:
            restored_histogram = np.asarray(histogram, dtype=np.float32)
            if restored_histogram.shape != (16, 16) or not np.isfinite(restored_histogram).all():
                raise JobStoreError("Invalid saved appearance histogram")
            profile.color_hist = restored_histogram
        if embedding is not None:
            restored_embedding = np.asarray(embedding, dtype=np.float32)
            if restored_embedding.ndim != 1 or restored_embedding.size > 4096 or not np.isfinite(restored_embedding).all():
                raise JobStoreError("Invalid saved identity embedding")
            profile.reid_embedding = restored_embedding
    session.player_assignments = metadata.get("players")
    if not checkpoint.get("committedCursor", 0) and session.player_assignments and video_source != "demo" and Path(video_source).exists():
        cap = cv2.VideoCapture(video_source)
        try:
            readable, first_frame = cap.read()
            if readable and first_frame is not None:
                session.analyzer.assign_initial_players(first_frame, session.player_assignments)
        finally:
            cap.release()

    progress = job.get("progress", {})
    session.progress_pct = float(progress.get("progressPct", 0.0) or 0.0)
    session.current_frame = int(checkpoint.get("lastProcessedFrame", progress.get("lastProcessedFrame", 0)) or 0)
    session.total_frames = int(progress.get("totalFrames", 0) or 0)
    session.analyzed_frames = int(checkpoint.get("analyzedFrames", 0) or 0)
    session.frame_stride = int(checkpoint.get("frameStride", session.frame_stride) or session.frame_stride)
    session.result_write_sequence = int(checkpoint.get("committedSequence", 0) or 0)
    session.last_observation_frame = int(checkpoint.get("lastProcessedFrame", 0) or 0)
    session.segment_start_frame = int(checkpoint.get("segmentStartFrame", 0) or 0)
    session.last_camera_segment_id = segment_state.get("cameraSegmentId")
    session.source_fps = checkpoint.get("sourceFps")
    session.duration_sec = float(checkpoint.get("durationSec", 0.0) or 0.0)
    session.elapsed_sec = float(checkpoint.get("elapsedSec", 0.0) or 0.0)
    session.persisted_player_summary = checkpoint.get("playerSummary")
    session.analyzer.dist_tracker.restore_aggregates(checkpoint.get("distanceAggregates"))
    if checkpoint.get("committedCursor", 0):
        session.results = session.job_store.page_results(session_id, max(0, checkpoint["committedCursor"] - SESSION_RESULT_WINDOW_SIZE), SESSION_RESULT_WINDOW_SIZE)["items"]
    session.resume_checkpoint = checkpoint if session.status in {"INTERRUPTED", "CANCELLED"} else None
    session.persisted_provenance = checkpoint.get("backendProvenance")
    session.resume_distance_aggregates = checkpoint.get("distanceAggregates")
    session.quality_accumulator.restore(checkpoint.get("qualityAccumulator", {}))
    tracking_sessions[session_id] = session
    return session


def _validate_resume(session: TrackingSession) -> None:
    session.job_store.validate_committed(session.session_id)
    job = session.job_store.get_job(session.session_id)
    identity = job.get("identity", {})
    if identity.get("configHash") != _config_identity(session.processing_config):
        raise JobStoreError("Processing configuration changed since checkpoint")
    if identity.get("model") != _model_identity(session):
        raise JobStoreError("Model/runtime identity changed since checkpoint")
    _ensure_media_identity(session)


def _run_session_analysis(session: TrackingSession):
    try:
        terminal_status = _analyze_session_frames(session)
        _commit_pending_results(session)
        if terminal_status == "COMPLETED":
            session.progress_pct = 100.0
            _persist_session_job(session, status="COMPLETED", error=None)
            session.job_store.update_job(session.session_id, {
                "progress": {
                    "progressPct": 100.0,
                    "lastProcessedFrame": session.current_frame,
                    "analyzedFrames": session.analyzed_frames,
                    "totalFrames": session.total_frames,
                },
            })
            session.status = "COMPLETED"
        elif terminal_status == "CANCELLED":
            _persist_session_job(session, status="CANCELLED", error=None)
            session.job_store.update_job(session.session_id, {
                "resume": {
                    "available": True,
                    "mode": "SAFE_BOUNDARY_REPROCESS",
                    "reason": "Cancellation committed a safe result boundary; replay recent source frames to warm temporal tracker state before continuing.",
                    "temporalStateRestoredExactly": False,
                },
            })
            session.status = "CANCELLED"
        elif session.status == "ERROR":
            _persist_session_job(session, status="ERROR", error=session.error_message)
    except Exception as error:
        logger.error('Analysis initialization/execution failed for session %s (%s)', session.session_id, type(error).__name__)
        session.status = 'ERROR'
        session.error_message = f'Video analysis failed: {type(error).__name__}'
        try:
            _persist_session_job(session, status="ERROR", error=session.error_message)
        except Exception as journal_error:
            logger.error('Analysis job error state could not be journaled for %s (%s)', session.session_id, type(journal_error).__name__)


def _run_analysis_worker(session: TrackingSession):
    try:
        _run_session_analysis(session)
    finally:
        if getattr(session, "_worker_slot_owned", False):
            session._worker_slot_owned = False
            analysis_worker_slots.release()


def _finish_resume_warmup(session: TrackingSession, analyzer_frame: int):
    session.analyzer.dist_tracker.restore_aggregates(session.resume_distance_aggregates, preserve_temporal=False)
    session.analyzer.frame_count = analyzer_frame
    session.analyzer.analyzed_frame_count = session.analyzed_frames
    counters = (session.resume_checkpoint or {}).get("identityCounters", {})
    session.analyzer.raw_tracker_id_switches = int(counters.get("rawTrackerIdSwitches", 0))
    session.analyzer.semantic_player_id_switches = int(counters.get("semanticPlayerIdSwitches", 0))
    session.is_resuming = False


def _analyze_session_frames(session: TrackingSession):
    # session.status is already PROCESSING (set atomically by the /start endpoint)
    if not session.is_resuming:
        session.progress_pct = 0.0
        session.results = []
        session.pending_results = []
        session.analyzed_frames = 0
        session.current_frame = 0
        session.quality_accumulator = SessionQualityAccumulator(session.tracked_player_count)
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
        resume_frame = int(session.resume_checkpoint.get("lastProcessedFrame", 0)) if session.is_resuming and session.resume_checkpoint else 0
        resume_analyzer_frame = int(session.resume_checkpoint.get("analyzerFrameIndex", 0)) if session.is_resuming and session.resume_checkpoint else 0
        if session.is_resuming and resume_frame > 0:
            warmup_start = max(
                int(session.resume_checkpoint.get("segmentStartFrame", 0)),
                resume_frame - _resume_warmup_source_frames(session),
            )
            session.analyzer.frame_count = max(0, resume_analyzer_frame - (resume_frame - warmup_start))
            for warmup_i in range(warmup_start, resume_frame):
                warmup_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
                with session._state_lock:
                    session.analyzer.process_frame(warmup_frame, timestamp_sec=round(warmup_i * 0.033, 2))
            _finish_resume_warmup(session, resume_analyzer_frame)
        elif session.is_resuming:
            session.is_resuming = False
        for i in range(resume_frame, total_frames):
            if session._cancel:
                break
            t = round(i * 0.033, 2)
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            with session._state_lock:
                telemetry = session.analyzer.process_frame(frame, timestamp_sec=t)
                telemetry["source"] = "synthetic_demo"
                telemetry["isSynthetic"] = True
                session.current_frame = i + 1
                session.progress_pct = round(((i + 1) / total_frames) * 100.0, 1)
                _append_session_result(session, telemetry)
            session.elapsed_sec = round(time.time() - start_time, 1)
            time.sleep(0.01)

        if not session._cancel:
            return "COMPLETED"
        else:
            return "CANCELLED"

    # Real video file
    video_path = Path(session.video_source)
    if not video_path.exists():
        session.status = "ERROR"
        session.error_message = "Video file not found"
        return

    cap = cv2.VideoCapture(session.video_source)
    try:
        return _analyze_captured_frames(session, cap, start_time)
    finally:
        cap.release()
        if session.shuttle_pipeline is not None:
            session.shuttle_pipeline.end_stream()


def _analyze_captured_frames(session: TrackingSession, cap, start_time: float):
    if not cap.isOpened():
        session.status = "ERROR"
        session.error_message = "Failed to open video file"
        return

    raw_total_frames = _positive_finite(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    total_frames = int(raw_total_frames) if raw_total_frames is not None else 0
    fps = _positive_finite(cap.get(cv2.CAP_PROP_FPS))
    if fps is None:
        session.status = "ERROR"
        session.error_message = "Source FPS unavailable; tracking cannot produce trustworthy video timestamps"
        return
    session.source_fps = fps
    session.analyzer.fps = fps
    session.analyzer.dist_tracker.fps = fps
    session.total_frames = total_frames
    session.duration_sec = round(total_frames / fps, 2) if total_frames > 0 else 0.0

    resume_source_frame = int(session.resume_checkpoint.get("lastProcessedFrame", 0)) if session.is_resuming and session.resume_checkpoint else 0
    resume_analyzer_frame = int(session.resume_checkpoint.get("analyzerFrameIndex", 0)) if session.is_resuming and session.resume_checkpoint else 0
    warmup_start = max(
        int(session.resume_checkpoint.get("segmentStartFrame", 0)),
        resume_source_frame - _resume_warmup_source_frames(session),
    ) if resume_source_frame else 0
    if resume_source_frame > 0:
        if not cap.set(cv2.CAP_PROP_POS_FRAMES, warmup_start):
            session.status = "ERROR"
            session.error_message = "Video decoder cannot seek to a safe resume boundary"
            return
        reported_position = _positive_finite(cap.get(cv2.CAP_PROP_POS_FRAMES))
        if reported_position is not None and abs(reported_position - warmup_start) > 1:
            session.status = "ERROR"
            session.error_message = "Video decoder seek did not reach the recorded safe resume boundary"
            return
        warmup_sample_count = sum(1 for index in range(warmup_start + 1, resume_source_frame + 1) if index % session.frame_stride == 0)
        session.analyzer.frame_count = max(0, resume_analyzer_frame - warmup_sample_count)
        session.analyzer.analyzed_frame_count = max(0, session.analyzed_frames - warmup_sample_count)
    frame_idx = warmup_start
    last_timestamp_sec = None
    try:
        while not session._cancel:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
            timestamp_sec = _video_frame_timestamp(frame_idx, fps, pos_msec, last_timestamp_sec)
            last_timestamp_sec = timestamp_sec
            if frame_idx % session.frame_stride != 0:
                if frame_idx > resume_source_frame:
                    session.current_frame = frame_idx
                    session.progress_pct = round((frame_idx / total_frames) * 100.0, 1) if total_frames > 0 else 0.0
                if session.is_resuming and frame_idx >= resume_source_frame:
                    _finish_resume_warmup(session, resume_analyzer_frame)
                continue
            with session._state_lock:
                telemetry = session.analyzer.process_frame(frame, timestamp_sec=timestamp_sec)
                if session.is_resuming and frame_idx <= resume_source_frame:
                    if frame_idx >= resume_source_frame:
                        _finish_resume_warmup(session, resume_analyzer_frame)
                    continue
                telemetry["source"] = "real_tracking"
                telemetry["isSynthetic"] = False
                session.current_frame = frame_idx
                session.progress_pct = round((frame_idx / total_frames) * 100.0, 1) if total_frames > 0 else 0.0
                _append_session_result(session, telemetry)
            session.elapsed_sec = round(time.time() - start_time, 1)
        
        if not session._cancel:
            if total_frames > 0 and frame_idx < total_frames:
                session.status = "ERROR"
                session.error_message = f"Video decode ended before the expected final frame ({frame_idx}/{total_frames}); partial data retained"
                return
            return "COMPLETED"
        else:
            return "CANCELLED"
    except Exception as error:
        logger.error('Video analysis failed for session %s (%s)', session.session_id, type(error).__name__)
        session.status = "ERROR"
        session.error_message = 'Video analysis failed; see local service logs'


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
    except (ValueError, InvalidEngineConfigError, ModelNotFoundError, PoseArchitectureNotImplementedError) as error:
        logger.error('Tracking session configuration rejected (%s)', type(error).__name__)
        detail = 'Invalid tracking configuration; check device (cuda/mps), model and processing settings'
        raise HTTPException(status_code=422, detail=detail) from error
    try:
        session.job_store.create_job(
            session_id,
            _session_identity(session),
            _session_job_metadata(session),
        )
        _persist_session_job(session, status=session.status)
    except (OSError, JobStoreError, ValueError) as error:
        logger.error('Analysis job journal could not be created (%s)', type(error).__name__)
        raise HTTPException(status_code=507, detail='Analysis job storage unavailable') from None
    tracking_sessions[session_id] = session
    return {
        "sessionId": session_id,
        "status": session.status,
        "gameType": session.game_type,
        "videoSource": public_metadata(session.video_source),
        "trackedPlayerCount": session.tracked_player_count,
        "device": session.effective_device,
        "requestedDevice": session.requested_device,
        "effectiveDevice": session.effective_device,
        "processingConfig": public_metadata(session.processing_config),
        "effectiveProcessingConfig": public_metadata(session.effective_processing_config),
    }


@app.get("/api/tracking/sessions")
def list_tracking_sessions(project_id: str | None = None, after: str | None = None, limit: int = 250):
    try:
        session_ids, next_cursor, has_more = analysis_job_store.list_job_ids_page(after, limit)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    sessions = []
    page_issues = []
    for session_id in session_ids:
        try:
            job = analysis_job_store.get_job(session_id)
        except (OSError, JobStoreError, ValueError) as error:
            page_issues.append(f"{session_id}: job listing failed ({type(error).__name__})")
            continue
        metadata = (job.get("metadata", {}).get("session") or {})
        if project_id is not None and metadata.get("projectId") != project_id:
            continue
        checkpoint = job.get("checkpoint", {})
        progress = job.get("progress", {})
        status = job.get("status", "ERROR")
        resume = job.get("resume") or {"available": False, "reason": "No resume record is available"}
        resumable = status in {"VIDEO_READY", "READY_TO_ANALYZE"} or (
            status in {"INTERRUPTED", "CANCELLED"} and resume.get("available") is True
        )
        sessions.append({
            "sessionId": session_id,
            "runId": session_id,
            "status": status,
            "gameType": metadata.get("gameType", "doubles"),
            "projectId": metadata.get("projectId"),
            "videoFingerprint": metadata.get("videoFingerprint"),
            "device": metadata.get("device"),
            "requestedDevice": metadata.get("device"),
            "effectiveDevice": (metadata.get("processingConfig") or {}).get("effectiveDevice"),
            "progressPct": float(progress.get("progressPct", 0.0) or 0.0),
            "currentFrame": int(progress.get("lastProcessedFrame", checkpoint.get("lastCommittedFrame", 0)) or 0),
            "totalFrames": int(progress.get("totalFrames", 0) or 0),
            "analyzedFrames": int(checkpoint.get("analyzedFrames", checkpoint.get("committedCursor", 0)) or 0),
            "trackedPlayerCount": metadata.get("trackedPlayerCount"),
            "processingConfig": public_metadata(metadata.get("processingConfig", {})),
            "effectiveProcessingConfig": public_metadata(metadata.get("effectiveProcessingConfig", metadata.get("processingConfig", {}))),
            "lastProcessedFrame": int(checkpoint.get("lastCommittedFrame", 0) or 0),
            "checkpointSequence": int(checkpoint.get("committedSequence", 0) or 0),
            "committedCursor": int(checkpoint.get("committedCursor", 0) or 0),
            "resumable": resumable,
            "resume": resume,
            "error": job.get("error"),
        })

    recovery_issues = analysis_job_store.recovery_report.get("issues", [])
    maximum_diagnostics = min(50, analysis_job_store.maximum_page_size)
    return {
        "sessions": sessions,
        "nextCursor": next_cursor if has_more else None,
        "maximumPageSize": analysis_job_store.maximum_page_size,
        "recoveryIssues": recovery_issues[:maximum_diagnostics],
        "recoveryIssueCount": len(recovery_issues),
        "recoveryIssuesTruncated": len(recovery_issues) > maximum_diagnostics,
        "pageIssues": page_issues[:maximum_diagnostics],
        "pageIssueCount": len(page_issues),
        "pageIssuesTruncated": len(page_issues) > maximum_diagnostics,
    }

ALLOWED_UPLOAD_STATES = {"READY", "VIDEO_READY"}


@app.post("/api/tracking/sessions/{session_id}/video")
async def upload_session_video(session_id: str, request: Request):
    session = _restore_persisted_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    with session._state_lock:
        if session._deleting or tracking_sessions.get(session_id) is not session:
            raise HTTPException(status_code=409, detail="Session is being deleted")
        if session.status not in ALLOWED_UPLOAD_STATES:
            raise HTTPException(status_code=409, detail=f"Cannot upload video in {session.status} state")
        if session._uploading or (session._thread and session._thread.is_alive()):
            raise HTTPException(status_code=409, detail="Session is busy")
        session._uploading = True

    temp_path = None
    try:
        try:
            max_upload_bytes = get_max_upload_bytes()
        except ResourceConfigError:
            raise HTTPException(status_code=503, detail='Upload size limit is misconfigured') from None
        content_length = request.headers.get('content-length')
        if content_length is not None:
            if not content_length.isascii() or not content_length.isdecimal() or len(content_length) > 20:
                raise HTTPException(status_code=400, detail='Invalid Content-Length')
            if int(content_length) > max_upload_bytes:
                raise HTTPException(status_code=413, detail=f'Video upload exceeds the {max_upload_bytes}-byte limit')
        content_type = request.headers.get("content-type", "")
        if content_type.startswith("multipart/form-data"):
            raise HTTPException(status_code=400, detail="Multipart upload not supported. Send raw file bytes.")

        orig_filename = (
            request.query_params.get("filename")
            or request.headers.get("X-Original-Filename")
            or request.headers.get("X-Filename")
        )
        if orig_filename:
            orig_filename = safe_filename(orig_filename)
        
        safe_ext = ".video"
        if orig_filename:
            ext = Path(orig_filename).suffix.lower()
            if ext in [".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"]:
                safe_ext = ext

        bytes_written = 0
        with tempfile.NamedTemporaryFile(
            prefix="upload_",
            suffix=safe_ext,
            dir=str(session.job_store.job_path(session_id)),
            delete=False,
        ) as target:
            temp_path = Path(target.name)
            async for chunk in request.stream():
                if bytes_written + len(chunk) > max_upload_bytes:
                    raise HTTPException(status_code=413, detail=f'Video upload exceeds the {max_upload_bytes}-byte limit')
                target.write(chunk)
                bytes_written += len(chunk)
            target.flush()
            os.fsync(target.fileno())

        if bytes_written == 0:
            raise HTTPException(status_code=400, detail="Empty upload")

        if not has_video_container_header(temp_path):
            raise HTTPException(status_code=422, detail='Container cannot be opened: expected AVI, MP4/M4V/MOV or MKV/WebM video')

        cap = cv2.VideoCapture(str(temp_path))
        try:
            if not cap.isOpened():
                raise HTTPException(status_code=422, detail="Container cannot be opened")
            readable, frame = cap.read()
            if not readable or frame is None:
                raise HTTPException(status_code=422, detail="Container opens but first frame cannot be decoded")
            fps = cap.get(cv2.CAP_PROP_FPS)
        finally:
            cap.release()

        # Finish all fallible validation before changing ownership or removing
        # the previous upload. A rejected replacement leaves that upload usable.
        v_meta, r_meta = extract_video_metadata(str(temp_path), original_filename=orig_filename)
        with session._state_lock:
            durable_path = session.job_store.media_path(session_id, safe_ext)
            media_hash = session.job_store.hash_file(temp_path)
            old_video_path = session.owned_video_path
            fields = ("owned_video_path", "video_source", "media_hash", "video_metadata", "research_metadata", "status")
            prior_state = {field: getattr(session, field) for field in fields}
            prior_fps = session.analyzer.fps
            os.replace(temp_path, durable_path)
            temp_path = durable_path
            try:
                session.owned_video_path = durable_path
                session.video_source = str(durable_path)
                session.media_hash = media_hash
                session.analyzer.fps = fps if fps > 0 else 30.0
                session.analyzer.dist_tracker.fps = session.analyzer.fps
                session.video_metadata = v_meta
                session.research_metadata = r_meta
                session.status = "VIDEO_READY"
                _persist_session_job(session, status="VIDEO_READY", error=None)
            except Exception:
                for field, value in prior_state.items():
                    setattr(session, field, value)
                session.analyzer.fps = prior_fps
                session.analyzer.dist_tracker.fps = prior_fps
                raise
            temp_path = None
            if old_video_path and old_video_path != durable_path:
                old_video_path.unlink(missing_ok=True)

        return {
            "sessionId": session_id,
            "width": frame.shape[1],
            "height": frame.shape[0],
            "fps": session.analyzer.fps,
            "videoMetadata": session.video_metadata,
            "researchMetadata": session.research_metadata,
        }
    except HTTPException:
        raise
    except (OSError, JobStoreError) as error:
        logger.error('Video storage failed for session %s (%s)', session_id, type(error).__name__)
        raise HTTPException(status_code=507, detail='Video storage unavailable') from None
    except (cv2.error, ValueError, RuntimeError) as error:
        logger.error('Video validation failed for session %s (%s)', session_id, type(error).__name__)
        raise HTTPException(status_code=422, detail='Video could not be validated') from None
    finally:
        try:
            if temp_path:
                temp_path.unlink(missing_ok=True)
        finally:
            with session._state_lock:
                session._uploading = False


ALLOWED_CALIBRATION_STATES_REAL = {"VIDEO_READY", "READY_TO_ANALYZE"}
ALLOWED_CALIBRATION_STATES_DEMO = {"READY", "VIDEO_READY", "READY_TO_ANALYZE"}


@app.post("/api/tracking/sessions/{session_id}/calibration")
def calibrate_session(session_id: str, req: SessionCalibrationRequest):
    session = _restore_persisted_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    with session._state_lock:
        if session._uploading or session._deleting:
            raise HTTPException(status_code=409, detail='Session is busy')
        allowed = ALLOWED_CALIBRATION_STATES_DEMO if session.video_source == "demo" else ALLOWED_CALIBRATION_STATES_REAL
        active_segment = session.analyzer.calibration_context.camera_segment_id
        recovering_during_processing = (
            session.status == "PROCESSING"
            and session.analyzer.calibration_context.state in (CalibrationState.CALIBRATION_LOST, CalibrationState.RECALIBRATING)
            and req.game_type == session.game_type
        )
        if session.status not in allowed and not recovering_during_processing:
            raise HTTPException(status_code=409, detail=f"Cannot calibrate in {session.status} state")
        if recovering_during_processing and req.camera_segment_id is not None and req.camera_segment_id != active_segment:
            raise HTTPException(
                status_code=409,
                detail=f"Stale calibration correction: target segment '{req.camera_segment_id}' does not match active segment '{active_segment}'",
            )
        if req.frame_index is not None:
            if req.frame_index < 0:
                raise HTTPException(status_code=400, detail="frameIndex must be non-negative")
            if session.status == "PROCESSING" and req.frame_index > session.analyzer.frame_count:
                raise HTTPException(
                    status_code=409,
                    detail=f"Stale calibration correction: frameIndex {req.frame_index} exceeds currently analyzed frame {session.analyzer.frame_count}",
                )

        try:
            # Commit observations before advancing the checkpoint to recovered calibration state.
            if session.pending_results:
                try:
                    _commit_pending_results(session)
                except (OSError, JobStoreError, ValueError) as error:
                    session._cancel = True
                    session.error_message = "Pending observations could not be committed before calibration recovery"
                    logger.error("Calibration recovery could not commit pending results (%s)", type(error).__name__)
                    raise HTTPException(status_code=507, detail=session.error_message) from None

            session.analyzer.set_court_corners(
                req.corners,
                camera_segment_id=req.camera_segment_id,
                calibration_version=req.calibration_version,
                created_at_frame=req.frame_index,
                created_at_timestamp_sec=req.timestamp_sec,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        session.game_type = req.game_type
        session.analyzer.game_type = req.game_type
        session.analyzer.mapper.game_type = req.game_type
        session.calibration_request = req.model_dump()
        if not recovering_during_processing:
            session.status = "READY_TO_ANALYZE"
        try:
            job = session.job_store.get_job(session.session_id)
            session.job_store.update_job(session.session_id, {
                "identity": _session_identity(session, job.get("identity")),
                "metadata": _session_job_metadata(session, job.get("metadata")),
                "status": session.status,
                "error": None,
                "checkpoint": _checkpoint_payload(session),
            })
        except (OSError, JobStoreError, ValueError) as error:
            session._cancel = True
            session.status = "ERROR"
            session.error_message = "Calibration checkpoint could not be committed; analysis has been stopped"
            logger.error("Calibration checkpoint could not be committed (%s)", type(error).__name__)
            raise HTTPException(status_code=507, detail=session.error_message) from None
        return {"status": "success", "sessionStatus": session.status, **session.analyzer.calibration_context.frame_fields()}


@app.post("/api/tracking/sessions/{session_id}/players")
def assign_session_players(session_id: str, req: SessionPlayerRequest):
    session = _restore_persisted_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    with session._state_lock:
        if session._uploading or session._deleting:
            raise HTTPException(status_code=409, detail='Session is busy')
        if session.status != "READY_TO_ANALYZE":
            raise HTTPException(status_code=409, detail=f"Cannot assign players in {session.status} state")

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
        session.player_assignments = req.players
        _persist_session_job(session, status=session.status, error=None)
        return {"status": "success", "sessionStatus": session.status, "assignedCount": len(req.players)}


@app.post("/api/tracking/sessions/{session_id}/start")
def start_session_analysis(session_id: str):
    session = _restore_persisted_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    with session._state_lock:
        if session._uploading or session._deleting:
            raise HTTPException(status_code=409, detail='Session is busy')
        if session.status == "PROCESSING":
            return {"status": "already_processing", "sessionId": session_id}
        is_resume = session.status in {"INTERRUPTED", "CANCELLED"}
        if session.status == "ERROR":
            raise HTTPException(status_code=409, detail=session.error_message or "Cannot start a session in ERROR state")
        if session.status != "READY_TO_ANALYZE" and not is_resume:
            raise HTTPException(status_code=409, detail=f"Cannot start analysis in {session.status} state")

        if is_resume:
            # Recreate worker-owned temporal objects and warm them from the recorded safe boundary.
            tracking_sessions.pop(session_id, None)
            session = _restore_persisted_session(session_id)
            if session is None:
                raise HTTPException(status_code=409, detail="Saved analysis session cannot be reconstructed")
            try:
                _validate_resume(session)
            except (OSError, JobStoreError, ValueError) as error:
                session.status = "ERROR"
                reason = "Video file not found; re-upload before resuming" if isinstance(error, FileNotFoundError) else f"{type(error).__name__}: {error}"
                session.error_message = f"Resume rejected: {reason}"
                try:
                    _persist_session_job(session, status="ERROR", error=session.error_message)
                except Exception:
                    pass
                raise HTTPException(status_code=409, detail=session.error_message) from None
            job = session.job_store.get_job(session_id)
            session.resume_checkpoint = job["checkpoint"]
            session.resume_distance_aggregates = job["checkpoint"].get("distanceAggregates")
            session.quality_accumulator.restore(job["checkpoint"].get("qualityAccumulator", {}))
            session.is_resuming = True
        else:
            try:
                _ensure_media_identity(session)
            except (OSError, JobStoreError, ValueError) as error:
                session.status = "ERROR"
                reason = "Video file not found; upload it before starting analysis" if isinstance(error, FileNotFoundError) else f"{type(error).__name__}: {error}"
                session.error_message = f"Analysis input unavailable: {reason}"
                try:
                    _persist_session_job(session, status="ERROR", error=session.error_message)
                except Exception:
                    pass
                raise HTTPException(status_code=409, detail=session.error_message) from None

        # Atomically transition to PROCESSING before creating the thread
        if not analysis_worker_slots.acquire(blocking=False):
            raise HTTPException(status_code=429, detail="Analysis worker is busy; retry after the active job finishes or is cancelled")
        session._worker_slot_owned = True
        session.status = "PROCESSING"
        session._cancel = False
        try:
            _persist_session_job(session, status="PROCESSING", error=None)
            if is_resume:
                session.job_store.record_resume(session_id, {
                    "available": True,
                    "mode": "SAFE_BOUNDARY_REPROCESS",
                    "reason": "Committed chunks are retained; recent source frames are replayed only to warm tracker/shuttle state before new frames are committed. Metric continuity is broken at the resume boundary.",
                    "reprocessingFromFrame": max(
                        int(session.resume_checkpoint.get("segmentStartFrame", 0)),
                        int(session.resume_checkpoint.get("lastProcessedFrame", 0)) - _resume_warmup_source_frames(session),
                    ),
                    "reprocessingThroughFrame": int(session.resume_checkpoint.get("lastProcessedFrame", 0)),
                    "temporalStateRestoredExactly": False,
                })
            session._thread = threading.Thread(target=_run_analysis_worker, args=(session,), daemon=True)
            session._thread.start()
        except Exception as error:
            if session._worker_slot_owned:
                session._worker_slot_owned = False
                analysis_worker_slots.release()
            logger.error('Analysis worker failed to start for session %s (%s)', session_id, type(error).__name__)
            session.status = "ERROR"
            session.error_message = f'Failed to start analysis worker: {type(error).__name__}'
            try:
                _persist_session_job(session, status="ERROR", error=session.error_message)
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=session.error_message)

    return {"status": "resumed" if is_resume else "started", "sessionId": session_id}


@app.post("/api/tracking/sessions/{session_id}/cancel")
def cancel_session_analysis(session_id: str):
    session = _restore_persisted_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    with session._state_lock:
        if session.status not in {"PROCESSING", "CANCEL_REQUESTED"}:
            return {"status": session.status, "sessionId": session_id}
        session._cancel = True
        session.status = "CANCEL_REQUESTED"
        try:
            _persist_session_job(session, status="CANCEL_REQUESTED")
        except (OSError, JobStoreError) as error:
            session.status = "ERROR"
            session.error_message = f"Cancellation could not be journaled: {type(error).__name__}"
            raise HTTPException(status_code=507, detail=session.error_message) from None
    return {"status": "cancellation_requested", "sessionId": session_id}


def _build_session_metrics(session: TrackingSession):
    source_fps = (
        float(session.source_fps)
        if isinstance(session.source_fps, (int, float)) and math.isfinite(session.source_fps) and session.source_fps > 0
        else None
    )
    elapsed_sec = (
        float(session.elapsed_sec)
        if isinstance(session.elapsed_sec, (int, float)) and math.isfinite(session.elapsed_sec) and session.elapsed_sec >= 0
        else None
    )
    frame_stride = session.frame_stride if session.frame_stride > 0 else None
    sampling_fps = round(source_fps / frame_stride, 2) if source_fps is not None and frame_stride is not None else None
    analysis_fps = (
        round(session.analyzed_frames / session.elapsed_sec, 2)
        if elapsed_sec is not None and elapsed_sec > 0.05
        else None
    )
    processed_video_time = (
        round(session.current_frame / source_fps, 2)
        if source_fps is not None
        else None
    )
    duration_sec = (
        float(session.duration_sec)
        if isinstance(session.duration_sec, (int, float)) and math.isfinite(session.duration_sec) and session.duration_sec > 0
        else None
    )

    if session.status == "COMPLETED":
        # Final performance metrics: computed against total video duration (with zero protection)
        rtf = round(elapsed_sec / duration_sec, 2) if duration_sec is not None and elapsed_sec is not None else None
        realtime_speed = round(duration_sec / elapsed_sec, 2) if duration_sec is not None and elapsed_sec is not None and elapsed_sec > 0.05 else None
    else:
        # Live processing metrics: computed against processed video time, NOT total duration!
        rtf = round(elapsed_sec / processed_video_time, 2) if elapsed_sec is not None and processed_video_time is not None and processed_video_time > 0.05 else None
        realtime_speed = round(processed_video_time / elapsed_sec, 2) if processed_video_time is not None and elapsed_sec is not None and elapsed_sec > 0.05 else None

    performance = {
        "elapsedSec": round(elapsed_sec, 1) if elapsed_sec is not None else None,
        "processedVideoTimeSec": processed_video_time,
        "videoDurationSec": duration_sec,
        "rtf": rtf,
        "realtimeSpeed": realtime_speed,
        "analysisFps": analysis_fps,
        "samplingFps": sampling_fps,
        "isFinal": (session.status == "COMPLETED"),
    }

    quality = session.quality_accumulator.to_dict()

    analyzer_prov = session.analyzer.get_provenance() if hasattr(session.analyzer, "get_provenance") else {}
    session.effective_device = analyzer_prov.get("device", session.effective_device)
    session.device = session.effective_device
    session.processing_config["effectiveDevice"] = session.effective_device
    providers = analyzer_prov.get('inferenceProviders', {})
    detector_execution = providers.get('detector') or {}
    session.processing_config['fallbackReason'] = detector_execution.get('fallbackReason', session.processing_config.get('fallbackReason'))
    tracker_name = analyzer_prov.get("trackerName") or analyzer_prov.get("trackerModel") or "bytetrack"
    provenance = {
        "detectorModel": analyzer_prov.get("detectorModel", session.analyzer.model_path),
        "detectorFamily": analyzer_prov.get("detectorFamily", "yolov8"),
        "trackerModel": tracker_name,
        "trackerName": tracker_name,
        "trackerConfigPath": analyzer_prov.get("trackerConfigPath"),
        "trackerConfig": analyzer_prov.get("trackerConfig"),
        "reidEnabled": analyzer_prov.get("reidEnabled", False),
        "reidModel": analyzer_prov.get("reidModel"),
        "poseModel": analyzer_prov.get("poseModel", "yolov8n-pose.pt"),
        "poseFamily": analyzer_prov.get("poseFamily", "yolov8"),
        "poseArchitecture": analyzer_prov.get("poseArchitecture", "roi_pose"),
        "inferenceProviders": analyzer_prov.get("inferenceProviders", {}),
        "fallbackReason": session.processing_config.get('fallbackReason'),
        "runtime": analyzer_prov.get("runtime", "pytorch"),
        "precision": analyzer_prov.get("precision", "fp32"),
        "actualModel": analyzer_prov.get("actualModel", analyzer_prov.get("detectorModel", session.analyzer.model_path)),
        "modelArtifactReference": analyzer_prov.get("modelArtifactReference"),
        "confidenceThreshold": analyzer_prov.get("confidenceThreshold", getattr(session.analyzer, "conf", 0.35)),
        "device": session.effective_device,
        "requestedDevice": session.requested_device,
        "effectiveDevice": session.effective_device,
        "requestedProfile": session.requested_profile,
        "effectiveProfile": session.effective_profile,
        "detectorInputSize": analyzer_prov.get("detectorInputSize", session.analyzer.detector_input_size),
        "frameStride": session.frame_stride,
        "poseStride": analyzer_prov.get("poseStride", session.analyzer.pose_stride),
        "useCourtRoi": analyzer_prov.get("useCourtRoi", session.analyzer.use_court_roi),
        "courtRoiMarginPx": analyzer_prov.get("courtRoiMarginPx", session.analyzer.court_roi_margin_px),
        "courtRoiMarginM": analyzer_prov.get("courtRoiMarginM", session.analyzer.court_roi_margin_m),
    }

    shuttle_prov = (
        session.shuttle_pipeline.get_provenance()
        if hasattr(session, "shuttle_pipeline") and session.shuttle_pipeline is not None
        else {
            "enabled": False,
            "requested": False,
            "active": False,
            "status": "DISABLED",
            "provider": "opencv_onnx",
            "model": None,
            "runtime": "opencv_dnn",
            "precision": "fp32",
            "device": session.effective_device,
            "windowSize": 3,
            "confidenceThreshold": 0.5,
            "recoveryEnabled": False,
            "auxiliaryDetectorAvailable": False,
            "failureReason": None,
            "lastFailure": None,
        }
    )
    provenance["shuttle"] = shuttle_prov
    calib_prov = session.analyzer.calibration_context.provenance
    cal_state = session.analyzer.calibration_context.state
    unavailable_reason = None
    if cal_state == CalibrationState.RECALIBRATING:
        unavailable_reason = "Camera cut or motion drift detected: searching for court lines or awaiting manual recovery"
    elif cal_state == CalibrationState.CALIBRATION_LOST:
        unavailable_reason = "Court calibration lost: awaiting automatic line relock or manual calibration"
    elif cal_state == CalibrationState.UNCALIBRATED:
        unavailable_reason = "Court uncalibrated: four court corners required"

    suggested_corners = None
    suggested_confidence = None
    if cal_state in (CalibrationState.CALIBRATION_LOST, CalibrationState.RECALIBRATING, CalibrationState.UNCALIBRATED):
        tsv = getattr(session.analyzer, "temporal_stability_validator", None)
        if tsv and tsv.streak:
            latest_cand = tsv.streak[-1]
            if latest_cand.corners_px:
                suggested_corners = [list(pt) for pt in latest_cand.corners_px]
                suggested_confidence = latest_cand.confidence

    provenance["autoCourtCalibrationEnabled"] = session.analyzer.auto_calibration_provider is not None
    provenance["calibration"] = {
        "autoCalibrationEnabled": session.analyzer.auto_calibration_provider is not None,
        "cameraSegmentId": session.analyzer.calibration_context.camera_segment_id,
        "calibrationId": calib_prov.calibration_id if calib_prov else None,
        "calibrationVersion": (calib_prov.calibration_version or calib_prov.calibration_id) if calib_prov else None,
        "state": cal_state.value,
        "source": calib_prov.source.value if calib_prov else None,
        "confidence": calib_prov.confidence if calib_prov else None,
        "reprojectionErrorPx": calib_prov.reprojection_error_px if calib_prov else None,
        "unavailableReason": unavailable_reason,
        "suggestedCorners": suggested_corners,
        "suggestedConfidence": suggested_confidence,
    }

    saved_provenance = getattr(session, "persisted_provenance", None)
    if saved_provenance and session.status != "PROCESSING":
        provenance.update({key: value for key, value in saved_provenance.items() if key not in {"calibration", "autoCourtCalibrationEnabled"}})
    return performance, quality, public_metadata(provenance)


@app.get("/api/tracking/sessions/{session_id}/status")
def get_session_status(session_id: str):
    session = _restore_persisted_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    performance_stats, quality_stats, runtime_provenance = _build_session_metrics(session)
    last_timestamp = session.results[-1].get("timestampSec") if session.results else None

    return {
        "sessionId": session_id,
        "status": session.status,
        "progressPct": session.progress_pct,
        "currentFrame": session.current_frame,
        "lastProcessedFrame": session.current_frame,
        "durableCheckpointFrame": (
            session.job_store.get_job(session_id).get("checkpoint", {}).get("lastProcessedFrame", 0)
        ),
        "checkpointSequence": session.result_write_sequence,
        "committedResultCursor": (
            session.job_store.get_job(session_id).get("checkpoint", {}).get("committedCursor", 0)
        ),
        "totalFrames": session.total_frames,
        "analyzedFrames": session.analyzed_frames,
        "frameStride": session.frame_stride,
        "elapsedSec": session.elapsed_sec,
        "videoDurationSec": session.duration_sec,
        "durationSec": session.duration_sec,
        "lastTelemetryTimestampSec": last_timestamp,
        "sourceFps": round(session.source_fps, 2) if isinstance(session.source_fps, (int, float)) and math.isfinite(session.source_fps) and session.source_fps > 0 else None,
        "samplingFps": performance_stats["samplingFps"],
        "analysisFps": performance_stats["analysisFps"],
        "trackedPlayerCount": session.tracked_player_count,
        "device": session.effective_device,
        "requestedDevice": session.requested_device,
        "effectiveDevice": session.effective_device,
        "processingConfig": public_metadata(session.processing_config),
        "effectiveProcessingConfig": public_metadata(session.effective_processing_config),
        "runtimeProvenance": runtime_provenance,
        "provenance": runtime_provenance,
        "performance": performance_stats,
        "quality": quality_stats,
        "shuttle": runtime_provenance.get("shuttle"),
        "videoMetadata": getattr(session, "video_metadata", None),
        "researchMetadata": getattr(session, "research_metadata", None),
        "players": (getattr(session, "persisted_player_summary", None) if session.status == "COMPLETED" else None) or session.analyzer.get_live_player_statuses(),
        **session.analyzer.calibration_context.frame_fields(),
        "error": session.error_message,
        "analysisJob": {
            "status": session.status,
            "progressPct": session.progress_pct,
            "lastProcessedFrame": session.current_frame,
            "checkpoint": session.job_store.get_job(session_id).get("checkpoint"),
            "resume": session.job_store.get_job(session_id).get("resume"),
            "cancelRequested": session._cancel,
            "error": session.error_message,
        },
    }


@app.get("/api/tracking/sessions/{session_id}/results")
def get_session_results(session_id: str, after: int | None = None, limit: int = RESULT_PAGE_SIZE):
    session = _restore_persisted_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    try:
        page = session.job_store.page_results(
            session_id,
            after_cursor=0 if after is None else after,
            limit=limit,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except (OSError, JobStoreError) as error:
        logger.error('Stored results could not be paged for %s (%s)', session_id, type(error).__name__)
        raise HTTPException(status_code=500, detail='Stored analysis results failed integrity validation') from None

    performance_stats, quality_stats, runtime_provenance = _build_session_metrics(session)

    return {
        "sessionId": session_id,
        "status": session.status,
        "sampleCount": len(page["items"]),
        "totalSampleCount": page["totalCount"],
        "nextCursor": page["nextCursor"],
        "committedSequence": page["committedSequence"],
        "maximumPageSize": page["maximumPageSize"],
        "trackedPlayerCount": session.tracked_player_count,
        "device": session.effective_device,
        "requestedDevice": session.requested_device,
        "effectiveDevice": session.effective_device,
        "processingConfig": public_metadata(session.processing_config),
        "effectiveProcessingConfig": public_metadata(session.effective_processing_config),
        "runtimeProvenance": runtime_provenance,
        "provenance": runtime_provenance,
        "shuttle": runtime_provenance.get("shuttle"),
        "performance": performance_stats,
        "quality": quality_stats,
        "videoMetadata": getattr(session, "video_metadata", None),
        "researchMetadata": getattr(session, "research_metadata", None),
        "telemetry": page["items"],
        **session.analyzer.calibration_context.frame_fields(),
    }


@app.delete("/api/tracking/sessions/{session_id}")
def delete_tracking_session(session_id: str):
    session = _restore_persisted_session(session_id)
    if session is None:
        if session_id not in analysis_job_store.list_job_ids():
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        try:
            analysis_job_store.delete_job(session_id)
        except (OSError, JobStoreError) as error:
            logger.error('Analysis job delete repair failed for %s (%s)', session_id, type(error).__name__)
            raise HTTPException(status_code=507, detail='Analysis job storage unavailable; retry deletion') from None
        return {"status": "deleted", "sessionId": session_id}
    with session._state_lock:
        if session._uploading or session._deleting:
            raise HTTPException(status_code=409, detail="Session is busy")
        if tracking_sessions.get(session_id) is not session:
            raise HTTPException(status_code=404, detail='Session not found')
        session._deleting = True
        session._cancel = True
    try:
        if session._thread and session._thread.is_alive():
            session._thread.join(timeout=30)
            if session._thread.is_alive():
                raise HTTPException(status_code=409, detail="Analysis is stopping; retry deletion shortly")
        with session._state_lock:
            session.job_store.delete_job(session_id)
            tracking_sessions.pop(session_id)
    except (OSError, JobStoreError) as error:
        logger.error('Analysis job deletion failed for session %s (%s)', session_id, type(error).__name__)
        raise HTTPException(status_code=507, detail='Analysis job storage unavailable; retry deletion') from None
    finally:
        with session._state_lock:
            session._deleting = False
    return {"status": "deleted", "sessionId": session_id}


if __name__ == "__main__":
    import uvicorn
    security_settings = SecuritySettings.from_env()
    security_settings.validate_bind()
    print(f"[AI Service] Starting SportsScout Badminton AI Service on {security_settings.host}:8000 ...")
    uvicorn.run(app, host=security_settings.host, port=8000)
