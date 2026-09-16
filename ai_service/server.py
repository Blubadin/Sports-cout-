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

app = FastAPI(title="SportsScout Badminton AI Service", version="1.0.0")

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
custom_origins = os.getenv("CORS_ORIGINS")
if custom_origins:
    ALLOWED_ORIGINS.extend([o.strip() for o in custom_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    }


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

class CreateSessionRequest(BaseModel):
    video_source: str = "demo"
    game_type: str = "doubles"

class SessionCalibrationRequest(BaseModel):
    corners: list[list[float]]
    game_type: str = "doubles"

class SessionPlayerRequest(BaseModel):
    players: list[dict]

class TrackingSession:
    def __init__(self, session_id: str, video_source: str = "demo", game_type: str = "doubles"):
        self.session_id = session_id
        self.video_source = video_source
        self.game_type = game_type
        self.analyzer = BadmintonAnalyzerV2(game_type=game_type)
        self.analyzer.analysis_id = session_id
        self.status = "READY"  # READY | CALIBRATING | ASSIGNING_PLAYERS | READY_TO_ANALYZE | PROCESSING | COMPLETED | ERROR
        self.progress_pct = 0.0
        self.current_frame = 0
        self.total_frames = 0
        self.elapsed_sec = 0.0
        self.duration_sec = 0.0
        self.results: list[dict] = []
        self.error_message: str | None = None
        self.owned_video_path: Path | None = None
        self._uploading = False
        self._cancel = False
        self._thread: threading.Thread | None = None

tracking_sessions: dict[str, TrackingSession] = {}


def _run_session_analysis(session: TrackingSession):
    session.status = "PROCESSING"
    session.progress_pct = 0.0
    session.results = []
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
        for i in range(total_frames):
            if session._cancel:
                break
            t = round(i * 0.033, 2)
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            telemetry = session.analyzer.process_frame(frame, timestamp_sec=t)
            telemetry["source"] = "synthetic_demo"
            telemetry["isSynthetic"] = True
            session.results.append(telemetry)
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
            telemetry = session.analyzer.process_frame(frame, timestamp_sec=timestamp_sec)
            telemetry["source"] = "real_tracking"
            telemetry["isSynthetic"] = False
            session.results.append(telemetry)
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
    session = TrackingSession(session_id, video_source=req.video_source, game_type=req.game_type)
    tracking_sessions[session_id] = session
    return {
        "sessionId": session_id,
        "status": session.status,
        "gameType": session.game_type,
        "videoSource": session.video_source,
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
        temp_path = None
        return {"sessionId": session_id, "width": frame.shape[1], "height": frame.shape[0], "fps": session.analyzer.fps}
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
    session.analyzer.set_court_corners(req.corners)
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


@app.get("/api/tracking/sessions/{session_id}/status")
def get_session_status(session_id: str):
    if session_id not in tracking_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    session = tracking_sessions[session_id]
    return {
        "sessionId": session_id,
        "status": session.status,
        "progressPct": session.progress_pct,
        "currentFrame": session.current_frame,
        "totalFrames": session.total_frames,
        "elapsedSec": session.elapsed_sec,
        "durationSec": session.duration_sec,
        "error": session.error_message,
    }


@app.get("/api/tracking/sessions/{session_id}/results")
def get_session_results(session_id: str):
    if session_id not in tracking_sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    session = tracking_sessions[session_id]
    return {
        "sessionId": session_id,
        "status": session.status,
        "sampleCount": len(session.results),
        "telemetry": session.results,
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
