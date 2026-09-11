"""
analyzer_v2.py — Multi-Player Badminton Motion Analyzer
Supports Doubles (4 players) & Singles (2 players) with:
- Initial Click-to-Assign
- HSV Color Appearance Profiles
- Hungarian (1-to-1) Match Cost Optimization (Spatial + Color)
- Real-time Frame Telemetry Generator for Web HUD
"""

from __future__ import annotations
import json
import time
from pathlib import Path
import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment

from court_mapper import CourtMapper, DistanceTracker, COURT_LENGTH_M, COURT_WIDTH_DOUBLES_M, COURT_WIDTH_SINGLES_M


class PlayerProfile:
    def __init__(self, player_id: int, team: int, name: str | None = None):
        self.player_id = player_id
        self.team = team  # Team 1 (Top / Far Court) or Team 2 (Bottom / Near Court)
        self.name = name or f"Player {player_id}"
        self.color_hist: np.ndarray | None = None
        self.last_real_pos: tuple[float, float] | None = None
        self.last_bbox: list[int] | None = None
        self.missed_frames = 0

    def update_appearance(self, frame: np.ndarray, bbox: list[int]):
        """Extract HSV color histogram from upper 60% of bbox (shirt / jersey)."""
        x1, y1, x2, y2 = [int(v) for v in bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            return

        # Focus on upper torso (jersey/shirt)
        torso_y2 = y1 + int((y2 - y1) * 0.65)
        crop = frame[y1:torso_y2, x1:x2]
        if crop.size == 0:
            return

        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
        cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)

        if self.color_hist is None:
            self.color_hist = hist
        else:
            # Exponential moving average update (90% existing, 10% new)
            self.color_hist = 0.90 * self.color_hist + 0.10 * hist


class BadmintonAnalyzerV2:
    def __init__(
        self,
        game_type: str = "doubles",
        max_players: int = 4,
        fps: float = 30.0,
        model_path: str = "yolov8n.pt",
        conf_threshold: float = 0.35,
        device: str = "cpu",
    ):
        self.game_type = game_type
        self.max_players = 4 if game_type == "doubles" else 2
        self.fps = fps
        self.conf = conf_threshold
        self.device = device
        self.model_path = model_path

        self.mapper = CourtMapper(game_type=game_type)
        self.dist_tracker = DistanceTracker(self.mapper, fps=self.fps)
        self.court_corners_px: np.ndarray | None = None
        self.frame_count = 0

        # Initialize player profiles (P1, P2: Team 1; P3, P4: Team 2)
        self.profiles: dict[int, PlayerProfile] = {}
        for pid in range(1, self.max_players + 1):
            team = 1 if pid <= (self.max_players // 2) else 2
            self.profiles[pid] = PlayerProfile(player_id=pid, team=team)

        self._detector = None
        self._tracker = None

    def _lazy_init_ai(self):
        """Lazy load YOLO and DeepSORT to avoid startup lag if running tests."""
        if self._detector is None:
            try:
                from ultralytics import YOLO
                self._detector = YOLO(self.model_path)
            except ImportError:
                print("[BadmintonAnalyzerV2] Warning: ultralytics is not installed. AI inference will be simulated.")
                self._detector = "dummy"

    def set_court_corners(self, corners: list[list[float]] | np.ndarray):
        """Set court corners for perspective calibration."""
        self.court_corners_px = np.array(corners, dtype=np.float32)
        self.mapper.calibrate(self.court_corners_px)

    def assign_initial_players(self, frame: np.ndarray, assignments: list[dict]):
        """
        Assign initial players on court.
        assignments: [
            {"player_id": 1, "bbox": [x1, y1, x2, y2], "name": "Player 1"},
            {"player_id": 2, "bbox": [x1, y1, x2, y2], "name": "Player 2"},
            ...
        ]
        """
        for a in assignments:
            pid = a["player_id"]
            if pid in self.profiles:
                p = self.profiles[pid]
                if "name" in a and a["name"]:
                    p.name = a["name"]
                bbox = a["bbox"]
                p.update_appearance(frame, bbox)
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = float(bbox[3])  # Feet level on ground plane
                real = self.mapper.pixel_to_real((cx, cy))
                p.last_real_pos = real
                p.last_bbox = bbox
                p.missed_frames = 0
                self.dist_tracker.update(pid, (cx, cy))

    def detect_and_track(self, frame: np.ndarray) -> list[dict]:
        """Detect person bounding boxes and return list of detections."""
        self._lazy_init_ai()
        detections = []

        if self._detector != "dummy" and self._detector is not None:
            results = self._detector.predict(
                frame,
                classes=[0],  # Person class
                conf=self.conf,
                device=self.device,
                verbose=False,
            )
            for r in results:
                boxes = r.boxes.xyxy.cpu().numpy()
                confs = r.boxes.conf.cpu().numpy()
                for box, conf in zip(boxes, confs):
                    x1, y1, x2, y2 = box.tolist()
                    cx = (x1 + x2) / 2.0
                    cy = y2  # Feet level on ground for court position
                    detections.append({
                        "bbox": [x1, y1, x2, y2],
                        "center": (cx, cy),
                        "conf": float(conf),
                    })
        return detections

    def process_frame(self, frame: np.ndarray, timestamp_sec: float | None = None) -> dict:
        """Process a single frame and generate structured telemetry."""
        self.frame_count += 1
        t_sec = timestamp_sec if timestamp_sec is not None else (self.frame_count / self.fps)

        raw_detections = self.detect_and_track(frame)

        # Filter detections inside court polygon (allow margin of -30px for feet slightly out of line)
        valid_detections = []
        for d in raw_detections:
            cx, cy = d["center"]
            if self.court_corners_px is not None:
                # measureDist=True returns signed distance: >0 inside, 0 on edge, <0 outside
                dist_px = cv2.pointPolygonTest(self.court_corners_px.astype(np.float32), (float(cx), float(cy)), True)
                if dist_px < -30.0:  # Reject detections outside margin
                    continue
            d["real_pos"] = self.mapper.pixel_to_real((cx, cy))
            valid_detections.append(d)

        # Match detections to the 4 player profiles using Hungarian Algorithm
        matched_players = self._match_tracks_to_profiles(frame, valid_detections)

        # Build telemetry frame (TrackingTelemetryV1 compliant, PDF §45-47)
        h, w = frame.shape[:2] if frame is not None else (720, 1280)
        player_telemetry = []
        for pid, p in self.profiles.items():
            stats = self.dist_tracker.get_stats(pid)
            bbox = p.last_bbox if p.missed_frames < 30 else None
            pos_m = stats.get("court_pos_m", {"x": 3.05, "y": 6.70})
            pos_pct = stats.get("court_pos_pct", {"x": 50.0, "y": 50.0})
            abs_zone = stats.get("current_zone", "ML")
            rel_zone = self.mapper.get_relative_zone_2d((pos_m["x"], pos_m["y"]), p.team)

            # State: observed | predicted | lost (PDF §45)
            if p.missed_frames == 0:
                tracking_state = "observed"
            elif p.missed_frames < 15:
                tracking_state = "predicted"
            else:
                tracking_state = "lost"

            bbox_pct = None
            ground_pt_pct = None
            if bbox is not None:
                bx = round((bbox[0] / w) * 100.0, 2)
                by = round((bbox[1] / h) * 100.0, 2)
                bw = round(((bbox[2] - bbox[0]) / w) * 100.0, 2)
                bh = round(((bbox[3] - bbox[1]) / h) * 100.0, 2)
                bbox_pct = {"x": bx, "y": by, "width": bw, "height": bh}
                cx_pct = round(((bbox[0] + bbox[2]) / (2.0 * w)) * 100.0, 2)
                cy_pct = round((bbox[3] / h) * 100.0, 2)
                ground_pt_pct = {"x": cx_pct, "y": cy_pct}

            player_telemetry.append({
                # Canonical V1 Tracking Protocol (PDF §45)
                "playerId": f"P{pid}",
                "trackId": pid,
                "teamCode": f"team{p.team}",
                "bboxPct": bbox_pct,
                "groundPointPct": ground_pt_pct,
                "courtPosition": {
                    "xM": pos_m["x"],
                    "yM": pos_m["y"],
                    "xPct": pos_pct["x"],
                    "yPct": pos_pct["y"],
                },
                "absoluteZone": abs_zone,
                "playerRelativeZone": rel_zone,
                "speedMps": stats.get("current_speed_ms", 0.0),
                "totalDistanceM": stats.get("total_dist_m", 0.0),
                "detectionConfidence": 0.90 if p.missed_frames == 0 else max(0.1, round(0.90 - p.missed_frames * 0.05, 2)),
                "state": tracking_state,

                # Backward compatibility aliases
                "id": pid,
                "team": p.team,
                "name": p.name,
                "bbox": bbox,
                "court_pos_pct": pos_pct,
                "court_pos_m": pos_m,
                "zone": abs_zone,
                "speed_ms": stats.get("current_speed_ms", 0.0),
                "total_dist_m": stats.get("total_dist_m", 0.0),
                "is_active": p.missed_frames < 10,
                "video_bbox_pct": bbox_pct,
            })

        return {
            # Canonical V1 Protocol (PDF §45 & §47)
            "schemaVersion": 1,
            "analysisId": getattr(self, "analysis_id", "live_session"),
            "timestampSec": round(t_sec, 3),
            "frameIndex": self.frame_count,
            "engineVersion": "1.0.0",
            "modelVersion": getattr(self, "model_path", "yolov8n.pt"),
            "isSynthetic": False,
            "source": "real_tracking",
            "players": player_telemetry,

            # Backward compatibility aliases
            "timestamp": round(t_sec, 3),
            "frame_idx": self.frame_count,
        }

    def _match_tracks_to_profiles(self, frame: np.ndarray, detections: list[dict]) -> dict:
        """
        Global Hungarian (Bipartite) matching between active PlayerProfiles and Detections.
        Prevents ID collisions and resolves partner swaps using spatial + appearance costs.
        """
        if not detections:
            for p in self.profiles.values():
                p.missed_frames += 1
            return {}

        active_pids = list(self.profiles.keys())
        N = len(active_pids)
        M = len(detections)

        cost_matrix = np.zeros((N, M), dtype=np.float32)

        for i, pid in enumerate(active_pids):
            profile = self.profiles[pid]
            for j, d in enumerate(detections):
                d_real = d["real_pos"]
                
                # 1. Spatial Distance Cost (meters)
                if profile.last_real_pos is not None:
                    spatial_dist = CourtMapper.euclidean_distance(profile.last_real_pos, d_real)
                else:
                    # Initial default expected position based on team & player
                    net_y = COURT_LENGTH_M / 2.0
                    expected_y = 3.0 if profile.team == 1 else 10.0
                    spatial_dist = abs(d_real[1] - expected_y)

                # 2. Side Penalty: penalize jumping across net drastically (unless intentional switch)
                net_y = COURT_LENGTH_M / 2.0
                d_team = 1 if d_real[1] < net_y else 2
                side_penalty = 15.0 if d_team != profile.team else 0.0

                # 3. Appearance Cost (HSV Histogram Bhattacharyya Distance)
                color_cost = 0.0
                if profile.color_hist is not None:
                    temp_p = PlayerProfile(0, 0)
                    temp_p.update_appearance(frame, d["bbox"])
                    if temp_p.color_hist is not None:
                        # cv2.HISTCMP_BHATTACHARYYA: 0 (identical) to 1 (disjoint)
                        color_dist = cv2.compareHist(profile.color_hist, temp_p.color_hist, cv2.HISTCMP_BHATTACHARYYA)
                        color_cost = color_dist * 8.0

                total_cost = spatial_dist + side_penalty + color_cost
                cost_matrix[i, j] = total_cost

        # Hungarian Assignment: Optimal 1-to-1 match
        row_ind, col_ind = linear_sum_assignment(cost_matrix)

        matched = {}
        matched_pids = set()

        for r, c in zip(row_ind, col_ind):
            pid = active_pids[r]
            cost = cost_matrix[r, c]
            
            # Gating threshold (if cost is too absurdly high, don't match)
            if cost < 25.0:
                d = detections[c]
                profile = self.profiles[pid]
                profile.last_real_pos = d["real_pos"]
                profile.last_bbox = d["bbox"]
                profile.missed_frames = 0
                profile.update_appearance(frame, d["bbox"])

                cx, cy = d["center"]
                self.dist_tracker.update(pid, (cx, cy))
                matched[pid] = d
                matched_pids.add(pid)

        # Increase missed frame counter for unmatched players
        for pid, p in self.profiles.items():
            if pid not in matched_pids:
                p.missed_frames += 1

        return matched

    def swap_players(self, pid_a: int, pid_b: int):
        """Swap identities of two players (e.g., P1 <-> P2 or P3 <-> P4)."""
        if pid_a in self.profiles and pid_b in self.profiles:
            pa = self.profiles[pid_a]
            pb = self.profiles[pid_b]
            pa.color_hist, pb.color_hist = pb.color_hist, pa.color_hist
            pa.last_real_pos, pb.last_real_pos = pb.last_real_pos, pa.last_real_pos
            pa.last_bbox, pb.last_bbox = pb.last_bbox, pa.last_bbox
            print(f"[BadmintonAnalyzerV2] Swapped player identities {pid_a} <-> {pid_b}")
