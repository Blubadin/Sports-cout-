"""
server.py — FastAPI + WebSocket Telemetry Server for SportsScout AI Auto-Tracking
Bridges Python Badminton Motion Analyzer with React/TypeScript PWA.
"""

import asyncio
import json
import threading
import time
from typing import Set
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2

from analyzer_v2 import BadmintonAnalyzerV2
from court_mapper import CourtMapper

app = FastAPI(title="SportsScout Badminton AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State
analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=4)
is_tracking = False
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


def _tracking_worker(video_source: str, loop: asyncio.AbstractEventLoop):
    """Background thread running video frame processing or demo simulation."""
    global is_tracking
    print(f"🚀 AI Tracking worker started for source: {video_source}")

    if video_source == "demo" or not Path(video_source).exists():
        # Simulated live demo telemetry for testing without video file
        t = 0.0
        while is_tracking:
            t += 0.05
            # Simulate 4 players moving on court
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
                "timestamp": round(t, 2),
                "frame_idx": int(t * 30),
                "source": "simulated",
                "players": [
                    {
                        "id": 1,
                        "team": 1,
                        "name": "Player 1 (Top Left)",
                        "court_pos_pct": {"x": round(p1_x, 1), "y": round(p1_y, 1)},
                        "zone": "FL" if p1_y > 25 else "BL",
                        "speed_ms": round(abs(math.sin(t)) * 3.5, 2),
                        "total_dist_m": round(t * 1.8, 1),
                        "is_active": True,
                    },
                    {
                        "id": 2,
                        "team": 1,
                        "name": "Player 2 (Top Right)",
                        "court_pos_pct": {"x": round(p2_x, 1), "y": round(p2_y, 1)},
                        "zone": "FR" if p2_y > 25 else "BR",
                        "speed_ms": round(abs(math.cos(t)) * 3.1, 2),
                        "total_dist_m": round(t * 1.5, 1),
                        "is_active": True,
                    },
                    {
                        "id": 3,
                        "team": 2,
                        "name": "Player 3 (Bottom Left)",
                        "court_pos_pct": {"x": round(p3_x, 1), "y": round(p3_y, 1)},
                        "zone": "FL" if p3_y < 75 else "BL",
                        "speed_ms": round(abs(math.sin(t * 1.2)) * 4.0, 2),
                        "total_dist_m": round(t * 2.1, 1),
                        "is_active": True,
                    },
                    {
                        "id": 4,
                        "team": 2,
                        "name": "Player 4 (Bottom Right)",
                        "court_pos_pct": {"x": round(p4_x, 1), "y": round(p4_y, 1)},
                        "zone": "FR" if p4_y < 75 else "BR",
                        "speed_ms": round(abs(math.cos(t * 0.9)) * 2.9, 2),
                        "total_dist_m": round(t * 1.6, 1),
                        "is_active": True,
                    },
                ],
            }
            asyncio.run_coroutine_threadsafe(broadcast_telemetry(mock_data), loop)
            time.sleep(0.066)  # ~15 fps
    else:
        cap = cv2.VideoCapture(video_source)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_delay = 1.0 / fps

        while is_tracking:
            start_t = time.time()
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            telemetry = analyzer.process_frame(frame)
            asyncio.run_coroutine_threadsafe(broadcast_telemetry(telemetry), loop)

            elapsed = time.time() - start_t
            sleep_time = max(0.001, frame_delay - elapsed)
            time.sleep(sleep_time)

        cap.release()

    print("🛑 AI Tracking worker stopped.")


@app.post("/api/start")
def start_tracking(req: StartStreamRequest):
    global is_tracking, tracking_thread
    if is_tracking:
        return {"status": "already_running"}

    is_tracking = True
    loop = asyncio.get_event_loop()
    tracking_thread = threading.Thread(
        target=_tracking_worker,
        args=(req.video_source, loop),
        daemon=True,
    )
    tracking_thread.start()
    return {"status": "started", "video_source": req.video_source}


@app.post("/api/stop")
def stop_tracking():
    global is_tracking
    is_tracking = False
    return {"status": "stopped"}


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    print("📡 Client connected to AI Telemetry WebSocket")

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
                start_tracking(StartStreamRequest(video_source=source))
            elif action == "stop":
                stop_tracking()
            elif action == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        connected_websockets.remove(websocket)
        print("🔌 Client disconnected from AI Telemetry WebSocket")


if __name__ == "__main__":
    import uvicorn
    print("🏸 Starting SportsScout Badminton AI Service on http://localhost:8000 ...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
