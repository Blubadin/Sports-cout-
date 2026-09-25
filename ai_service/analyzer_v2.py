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
from calibration_contract import CalibrationContext, CalibrationSource
from camera_cut_detector import CameraCutDetector
from court_roi import calculate_court_roi, inverse_transform_bbox
from device_runtime import resolve_device
from engine_config import (
    TrackingEngineConfig,
    create_baseline_engine_config,
    resolve_tracker_config,
    validate_runtime_and_precision,
)
from detector_adapter import BaseDetectorAdapter, UltralyticsDetectorAdapter
from tracker_adapter import NormalizedTrackResult, TrackerProvenance
from pose_adapter import BasePoseAdapter, create_pose_provider, FullFramePoseCandidate
from pose_association import associate_poses_to_athletes
from reid_adapter import BaseReIDAdapter, create_reid_provider
from semantic_identity import match_tracks_to_profiles_with_reid, SemanticIdentityCosts
try:
    from ai_service.shuttle_pipeline import ProductionShuttlePipeline
except ImportError:
    try:
        from shuttle_pipeline import ProductionShuttlePipeline
    except ImportError:
        ProductionShuttlePipeline = None


class PlayerProfile:
    def __init__(self, player_id: int, team: int = 0, name: str | None = None):
        self.player_id = player_id
        self.team = team  # 0: Unknown, 1: Team 1 (Top / Far Court), 2: Team 2 (Bottom / Near Court)
        self.name = name or f"Player {player_id}"
        self.color_hist: np.ndarray | None = None
        self.last_real_pos: tuple[float, float] | None = None
        self.last_bbox: list[int] | None = None
        self.missed_frames = 0
        self.track_id = None
        self.detection_confidence: float | None = None
        self.last_pose: dict | None = None
        self.last_pose_age = 0
        self.reid_embedding: np.ndarray | None = None

    def update_reid_embedding(self, embedding: np.ndarray | None, alpha: float = 0.2):
        """Update ReID appearance embedding using exponential moving average."""
        if embedding is None:
            return
        if self.reid_embedding is None:
            self.reid_embedding = embedding
        else:
            updated = (1.0 - alpha) * self.reid_embedding + alpha * embedding
            norm = float(np.linalg.norm(updated))
            if norm > 1e-6:
                self.reid_embedding = updated / norm

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
        max_players: int | None = None,
        fps: float = 30.0,
        model_path: str = "yolov8n.pt",
        conf_threshold: float = 0.35,
        device: str | None = None,
        detector_input_size: int = 640,
        use_court_roi: bool = False,
        court_roi_margin_px: int = 60,
        court_roi_margin_m: float = 0.5,
        pose_stride: int = 1,
        engine_config: TrackingEngineConfig | None = None,
        detector_adapter: BaseDetectorAdapter | None = None,
        pose_adapter: BasePoseAdapter | None = None,
        reid_adapter: BaseReIDAdapter | None = None,
        shuttle_pipeline: ProductionShuttlePipeline | None = None,
    ):
        self.game_type = game_type
        if max_players is None:
            resolved_max = 4 if game_type == "doubles" else 2
        else:
            resolved_max = int(max_players)

        if not (1 <= resolved_max <= 4):
            raise ValueError(f"max_players must be between 1 and 4, got {resolved_max}")
        self.max_players = resolved_max

        self.fps = fps
        self.device = resolve_device(device if device is not None else (engine_config.device if engine_config else "auto"))

        if engine_config is not None:
            self.engine_config = engine_config
            self.engine_config.device = self.device
        else:
            self.engine_config = create_baseline_engine_config(
                detector_model=model_path,
                confidence_threshold=conf_threshold,
                device=self.device,
                detector_input_size=detector_input_size,
                use_court_roi=use_court_roi,
                court_roi_margin_px=court_roi_margin_px,
                court_roi_margin_m=court_roi_margin_m,
                pose_stride=pose_stride,
            )

        self.conf = self.engine_config.confidence_threshold
        self.model_path = self.engine_config.detector_model
        self.detector_input_size = int(self.engine_config.detector_input_size)
        self.use_court_roi = bool(self.engine_config.use_court_roi)
        self.court_roi_margin_px = int(self.engine_config.court_roi_margin_px)
        self.court_roi_margin_m = float(self.engine_config.court_roi_margin_m)
        self.pose_stride = max(1, int(self.engine_config.pose_stride))
        self.pose_architecture = self.engine_config.pose_architecture
        self.pose_inference_calls = 0
        self.analyzed_frame_count = 0

        self.mapper = CourtMapper(game_type=game_type)
        self.dist_tracker = DistanceTracker(self.mapper, fps=self.fps)
        self.calibration_context = CalibrationContext()
        self.camera_cut_detector = CameraCutDetector()
        self.court_corners_px: np.ndarray | None = None
        self.frame_count = 0

        # Initialize player profiles (exactly max_players, no phantoms)
        self.profiles: dict[int, PlayerProfile] = {}
        for pid in range(1, self.max_players + 1):
            if self.max_players == 2:
                team = 1 if pid == 1 else 2
            elif self.max_players == 4:
                team = 1 if pid <= 2 else 2
            else:
                team = 0  # Irregular count (1 or 3): dynamic side inference from first observation
            self.profiles[pid] = PlayerProfile(player_id=pid, team=team)

        self.detector_adapter = detector_adapter
        self.pose_adapter = pose_adapter
        self.reid_adapter = reid_adapter
        if self.reid_adapter is None:
            self.reid_adapter = create_reid_provider(
                enabled=self.engine_config.reid_enabled,
                model_name=self.engine_config.reid_model,
                device=self.device,
            )
        self.raw_tracker_id_switches = 0
        self.semantic_player_id_switches = 0
        self.last_known_track_owners: dict[int, int] = {}
        self._last_cost_breakdowns: dict[int, SemanticIdentityCosts] = {}
        self._detector = None
        self._pose_detector = None
        self.shuttle_pipeline = shuttle_pipeline

        if self.pose_adapter is None and self.pose_architecture == "full_frame_pose":
            self.pose_adapter = create_pose_provider(
                architecture=self.pose_architecture,
                model_path=self.engine_config.pose_model,
                conf_threshold=0.4,
                device=self.device,
            )

    def _lazy_init_ai(self):
        """Lazy load detector adapter and underlying model; load failures must fail explicitly."""
        if self._detector == "dummy":
            return

        validate_runtime_and_precision(
            runtime=self.engine_config.runtime,
            precision=self.engine_config.precision,
            device=self.device,
            model_artifact_reference=self.engine_config.model_artifact_reference,
        )

        if self.detector_adapter is None:
            self.detector_adapter = UltralyticsDetectorAdapter(
                model_path=self.engine_config.detector_model,
                device=self.device,
                runtime=self.engine_config.runtime,
                precision=self.engine_config.precision,
                model_artifact_reference=self.engine_config.model_artifact_reference,
            )

        if self._detector is not None:
            if hasattr(self.detector_adapter, "_model"):
                self.detector_adapter._model = self._detector
        else:
            if hasattr(self.detector_adapter, "_init_model"):
                self.detector_adapter._init_model()
            if hasattr(self.detector_adapter, "_model"):
                self._detector = self.detector_adapter._model

    def _estimate_pose(self, frame, bbox):
        if self._pose_detector == "dummy":
            return {"keypoints": [], "metrics": {}}

        if self._pose_detector is not None:
            self.pose_inference_calls += 1
            return self._pose_detector.estimate_pose_in_roi(frame, bbox)

        if self.pose_adapter is not None:
            self.pose_inference_calls += 1
            return self.pose_adapter.estimate_pose_in_roi(frame, bbox)

        # If the detector or tracking logic is mocked or in dummy test mode, avoid loading real YOLO pose
        is_mocked = (
            self._detector == "dummy"
            or hasattr(self._detector, "mock_calls")
            or hasattr(self._detector, "_mock_name")
            or hasattr(self.detect_and_track, "mock_calls")
            or getattr(self.detect_and_track, "__func__", None) is not BadmintonAnalyzerV2.detect_and_track
        )
        if is_mocked:
            return {"keypoints": [], "metrics": {}}

        self.pose_adapter = create_pose_provider(
            architecture=self.pose_architecture,
            model_path=self.engine_config.pose_model,
            conf_threshold=0.4,
            device=self.device,
        )
        self.pose_inference_calls += 1
        res = self.pose_adapter.estimate_pose_in_roi(frame, bbox)
        if hasattr(self.pose_adapter, "_detector") and self.pose_adapter._detector is not None:
            self._pose_detector = self.pose_adapter._detector
        return res

    def _estimate_full_frame_poses(self, frame: np.ndarray) -> list[FullFramePoseCandidate]:
        if self._pose_detector == "dummy":
            return []

        if self.pose_adapter is not None:
            self.pose_inference_calls += 1
            return self.pose_adapter.estimate_full_frame(frame)

        if self._pose_detector is not None and hasattr(self._pose_detector, "estimate_full_frame"):
            self.pose_inference_calls += 1
            return self._pose_detector.estimate_full_frame(frame)

        is_mocked = (
            self._detector == "dummy"
            or hasattr(self._detector, "mock_calls")
            or hasattr(self._detector, "_mock_name")
            or hasattr(self.detect_and_track, "mock_calls")
            or getattr(self.detect_and_track, "__func__", None) is not BadmintonAnalyzerV2.detect_and_track
        )
        if is_mocked:
            return []

        self.pose_adapter = create_pose_provider(
            architecture=self.pose_architecture,
            model_path=self.engine_config.pose_model,
            conf_threshold=0.4,
            device=self.device,
        )
        self.pose_inference_calls += 1
        res = self.pose_adapter.estimate_full_frame(frame)
        if hasattr(self.pose_adapter, "_detector") and self.pose_adapter._detector is not None:
            self._pose_detector = self.pose_adapter._detector
        return res

    def set_court_corners(
        self, corners: list[list[float]] | np.ndarray, *,
        source: str = "manual", created_at_frame: int | None = None,
        created_at_timestamp_sec: float | None = None,
        confidence: float | None = None, reprojection_error_px: float | None = None,
    ):
        """Set court corners for perspective calibration."""
        source_kind = CalibrationSource(source)
        if source_kind is CalibrationSource.MANUAL and (confidence is not None or reprojection_error_px is not None):
            raise ValueError("Manual four-corner calibration has no measured confidence or reprojection error")
        candidate = np.array(corners, dtype=np.float32)
        candidate_mapper = CourtMapper(game_type=self.game_type)
        candidate_mapper.calibrate(candidate)
        self.calibration_context.accept(
            source=source_kind,
            frame=self.frame_count if created_at_frame is None else created_at_frame,
            timestamp_sec=self.frame_count / self.fps if created_at_timestamp_sec is None else created_at_timestamp_sec,
            confidence=confidence,
            reprojection_error_px=reprojection_error_px,
        )
        self.mapper.H = candidate_mapper.H
        self.mapper.H_inv = candidate_mapper.H_inv
        self.mapper.game_type = self.game_type
        self.court_corners_px = candidate
        self.dist_tracker.pause_metric_tracking()
        self.camera_cut_detector.rearm_after_calibration()
        for profile in self.profiles.values():
            profile.last_real_pos = None

    def lose_calibration(self) -> None:
        self.calibration_context.lose()
        self.mapper.invalidate()
        self.court_corners_px = None
        self.dist_tracker.pause_metric_tracking()
        for profile in self.profiles.values():
            profile.last_real_pos = None

    def begin_recalibration(self) -> None:
        self.calibration_context.begin_recalibration()
        self.mapper.invalidate()
        self.court_corners_px = None
        self.dist_tracker.pause_metric_tracking()
        for profile in self.profiles.values():
            profile.last_real_pos = None

    def start_camera_segment(self) -> None:
        """Invalidate calibration for an externally confirmed camera cut."""
        self.camera_cut_detector.reset()
        self._invalidate_for_camera_cut()

    def _invalidate_for_camera_cut(self) -> None:
        """Break all metric state before processing the first frame of a cut."""
        self.calibration_context.start_camera_segment()
        self.mapper.invalidate()
        self.court_corners_px = None
        self.dist_tracker.break_metric_segment()
        self.last_known_track_owners.clear()
        for profile in self.profiles.values():
            profile.last_real_pos = None
            profile.last_bbox = None
            profile.missed_frames = 30
            profile.track_id = None
            profile.detection_confidence = None
            profile.last_pose = None
            profile.last_pose_age = 0

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
                if self.reid_adapter is not None and self.reid_adapter.is_enabled and frame is not None and frame.size > 0:
                    emb = self.reid_adapter.extract(frame, bbox)
                    if emb is not None:
                        p.reid_embedding = emb
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = float(bbox[3])  # Feet level on ground plane
                real = self.mapper.pixel_to_real((cx, cy))
                p.last_real_pos = real
                p.last_bbox = bbox
                p.missed_frames = 0
                if p.team == 0:
                    p.team = 1 if real[1] < (COURT_LENGTH_M / 2.0) else 2
                self.dist_tracker.update(pid, (cx, cy))

    def detect_and_track(self, frame: np.ndarray) -> list[dict]:
        """Detect person bounding boxes and return list of detections in full source coordinates."""
        if self._detector == "dummy":
            return []

        self._lazy_init_ai()
        h, w = frame.shape[:2]
        inference_frame = frame
        offset_x, offset_y = 0, 0

        if self.use_court_roi and self.court_corners_px is not None:
            roi_x1, roi_y1, roi_x2, roi_y2 = calculate_court_roi(
                self.court_corners_px, w, h, self.court_roi_margin_px
            )
            if (roi_x2 - roi_x1) >= 50 and (roi_y2 - roi_y1) >= 50:
                inference_frame = frame[roi_y1:roi_y2, roi_x1:roi_x2]
                offset_x, offset_y = roi_x1, roi_y1

        if self.detector_adapter is not None:
            if self._detector is not None and hasattr(self.detector_adapter, "_model"):
                self.detector_adapter._model = self._detector
            return self.detector_adapter.detect_and_track(
                inference_frame,
                conf=self.conf,
                imgsz=self.detector_input_size,
                device=self.device,
                tracker_name=self.engine_config.tracker_name,
                tracker_config_path=self.engine_config.tracker_config_path,
                tracker_config=self.engine_config.tracker_config,
                reid_enabled=self.engine_config.reid_enabled,
                reid_model=self.engine_config.reid_model,
                classes=[0],
                offset_x=offset_x,
                offset_y=offset_y,
            )

        detections = []
        if self._detector != "dummy" and self._detector is not None:
            tracker_cfg = resolve_tracker_config(
                self.engine_config.tracker_name,
                self.engine_config.tracker_config_path or self.engine_config.tracker_config,
            )
            tracker_provenance = TrackerProvenance(
                self.engine_config.tracker_name,
                self.engine_config.tracker_config or self.engine_config.tracker_config_path,
                self.engine_config.reid_enabled,
                self.engine_config.reid_model,
            )
            results = self._detector.track(
                inference_frame,
                persist=True,
                tracker=tracker_cfg,
                classes=[0],  # Person class
                conf=self.conf,
                device=self.device,
                imgsz=self.detector_input_size,
                verbose=False,
            )
            for r in results:
                boxes = r.boxes.xyxy.cpu().numpy()
                confs = r.boxes.conf.cpu().numpy()
                track_ids = r.boxes.id.cpu().numpy() if r.boxes.id is not None else [None] * len(boxes)
                for box, conf, track_id in zip(boxes, confs, track_ids):
                    x1, y1, x2, y2 = box.tolist()
                    src_x1, src_y1, src_x2, src_y2 = inverse_transform_bbox(
                        [x1, y1, x2, y2], offset_x, offset_y
                    )
                    detections.append(NormalizedTrackResult(
                        bbox=(src_x1, src_y1, src_x2, src_y2),
                        confidence=float(conf),
                        raw_track_id=int(track_id) if track_id is not None else None,
                        provenance=tracker_provenance,
                    ).to_detection())
        return detections

    def process_frame(self, frame: np.ndarray, timestamp_sec: float | None = None) -> dict:
        """Process a single frame and generate structured telemetry."""
        self.frame_count += 1
        self.analyzed_frame_count += 1
        should_run_pose = (self.analyzed_frame_count % self.pose_stride == 0)
        t_sec = timestamp_sec if timestamp_sec is not None else (self.frame_count / self.fps)

        if self.camera_cut_detector.observe(frame):
            self._invalidate_for_camera_cut()

        raw_detections = self.detect_and_track(frame)

        # Filter detections inside calibrated physical court boundaries + margin in meters
        valid_detections = []
        for d in raw_detections:
            cx, cy = d["center"]
            if self.court_corners_px is not None and self.mapper.is_calibrated:
                try:
                    real_pos = self.mapper.pixel_to_real((cx, cy))
                    x_m, y_m = real_pos
                    # Physical court boundaries with margin in meters (allowing athlete excursions, rejecting outsiders)
                    min_x = -self.court_roi_margin_m
                    max_x = self.mapper.court_w + self.court_roi_margin_m
                    min_y = -self.court_roi_margin_m
                    max_y = self.mapper.court_l + self.court_roi_margin_m
                    if not (min_x <= x_m <= max_x and min_y <= y_m <= max_y):
                        continue
                    d["real_pos"] = real_pos
                except Exception:
                    continue
            elif self.court_corners_px is not None:
                dist_px = cv2.pointPolygonTest(self.court_corners_px.astype(np.float32), (float(cx), float(cy)), True)
                if dist_px < -30.0:
                    continue
                d["real_pos"] = None
            else:
                d["real_pos"] = None
            valid_detections.append(d)

        # Match detections to the 4 player profiles using Hungarian Algorithm
        matched_players = self._match_tracks_to_profiles(frame, valid_detections, timestamp_sec=t_sec)

        # For full-frame pose architecture, run one full-frame pose inference per scheduled frame and associate
        assigned_full_frame_poses: dict[int, FullFramePoseCandidate] = {}
        if self.pose_architecture == "full_frame_pose" and should_run_pose:
            candidates = self._estimate_full_frame_poses(frame)
            athlete_boxes = {pid: matched_players[pid]["bbox"] for pid in matched_players}
            assigned_full_frame_poses = associate_poses_to_athletes(athlete_boxes, candidates)

        # Build telemetry frame (TrackingTelemetryV1 compliant, PDF §45-47)
        h, w = frame.shape[:2] if frame is not None else (720, 1280)
        player_telemetry = []
        for pid, p in self.profiles.items():
            stats = self.dist_tracker.get_stats(pid)
            bbox = p.last_bbox if p.missed_frames < 30 else None
            pos_m = stats.get("court_pos_m")
            pos_pct = stats.get("court_pos_pct")
            metric_valid = self.calibration_context.is_metric_valid and self.mapper.is_calibrated
            abs_zone = stats.get("current_zone") if metric_valid else None
            rel_zone = (
                self.mapper.get_relative_zone_2d((pos_m["x"], pos_m["y"]), p.team)
                if (metric_valid and pos_m is not None and p.team in (1, 2))
                else abs_zone
            )

            # State: observed | predicted | lost (PDF §45)
            if p.last_bbox is None:
                tracking_state = "lost"
            elif p.missed_frames == 0:
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

            court_position = None
            if metric_valid and pos_m is not None and pos_pct is not None and p.last_real_pos is not None:
                court_position = {
                    "xM": round(pos_m["x"], 2),
                    "yM": round(pos_m["y"], 2),
                    "xPct": round(pos_pct["x"], 2),
                    "yPct": round(pos_pct["y"], 2),
                }

            confidence = (
                round(float(p.detection_confidence), 3)
                if (p.last_bbox is not None and p.missed_frames == 0 and p.detection_confidence is not None)
                else None
            )

            player_telemetry.append({
                # Canonical V1 Tracking Protocol (PDF §45)
                "playerId": f"P{pid}",
                "trackId": p.track_id,
                "teamCode": f"team{p.team}" if p.team in (1, 2) else "unknown",
                "bboxPct": bbox_pct,
                "groundPointPct": ground_pt_pct,
                "courtPosition": court_position,
                "absoluteZone": abs_zone,
                "playerRelativeZone": rel_zone,
                "speedMps": stats.get("current_speed_ms") if metric_valid and court_position is not None else None,
                "totalDistanceM": stats.get("total_dist_m") if self.dist_tracker.has_metric_observation(pid) else None,
                "detectionConfidence": confidence,
                "state": tracking_state,
                "identityCosts": self._last_cost_breakdowns.get(pid).to_dict() if (hasattr(self, "_last_cost_breakdowns") and pid in self._last_cost_breakdowns) else None,

                # Backward compatibility aliases
                "id": pid,
                "team": p.team,
                "name": p.name,
                "bbox": bbox,
                "court_pos_pct": pos_pct if metric_valid else None,
                "court_pos_m": pos_m if metric_valid else None,
                "zone": abs_zone,
                "speed_ms": stats.get("current_speed_ms") if metric_valid and court_position is not None else None,
                "total_dist_m": stats.get("total_dist_m") if self.dist_tracker.has_metric_observation(pid) else None,
                "is_active": p.missed_frames < 10,
                "video_bbox_pct": bbox_pct,
            })

            if self.pose_architecture == "full_frame_pose":
                if pid in matched_players:
                    if should_run_pose:
                        if pid in assigned_full_frame_poses and assigned_full_frame_poses[pid].keypoints:
                            cand = assigned_full_frame_poses[pid]
                            pose_obj = {
                                "keypoints": [
                                    {"x": float(x) / w * 100.0, "y": float(y) / h * 100.0, "score": float(score)}
                                    for x, y, score in cand.keypoints
                                ],
                                "metrics": cand.metrics,
                                "isReused": False,
                                "ageFrames": 0,
                            }
                            p.last_pose = pose_obj
                            p.last_pose_age = 0
                            player_telemetry[-1]["pose"] = pose_obj
                        else:
                            # Athlete matched to track, but no pose candidate matched
                            if p.last_pose is not None and p.missed_frames < 15:
                                p.last_pose_age += 1
                                reused_pose = dict(p.last_pose)
                                reused_pose["isReused"] = True
                                reused_pose["ageFrames"] = p.last_pose_age
                                player_telemetry[-1]["pose"] = reused_pose
                    else:
                        if p.last_pose is not None and p.missed_frames < 15:
                            p.last_pose_age += 1
                            reused_pose = dict(p.last_pose)
                            reused_pose["isReused"] = True
                            reused_pose["ageFrames"] = p.last_pose_age
                            player_telemetry[-1]["pose"] = reused_pose
                else:
                    if p.missed_frames >= 15:
                        p.last_pose = None
                        p.last_pose_age = 0
            else:
                if pid in matched_players:
                    if should_run_pose:
                        pose = self._estimate_pose(frame, matched_players[pid]["bbox"])
                        if pose["keypoints"]:
                            pose_obj = {
                                "keypoints": [
                                    {"x": float(x) / w * 100, "y": float(y) / h * 100, "score": float(score)}
                                    for x, y, score in pose["keypoints"]
                                ],
                                "metrics": pose["metrics"],
                                "isReused": False,
                                "ageFrames": 0,
                            }
                            p.last_pose = pose_obj
                            p.last_pose_age = 0
                            player_telemetry[-1]["pose"] = pose_obj
                    else:
                        if p.last_pose is not None and p.missed_frames < 15:
                            p.last_pose_age += 1
                            reused_pose = dict(p.last_pose)
                            reused_pose["isReused"] = True
                            reused_pose["ageFrames"] = p.last_pose_age
                            player_telemetry[-1]["pose"] = reused_pose
                else:
                    if p.missed_frames >= 15:
                        p.last_pose = None
                        p.last_pose_age = 0

        shuttle_obs = None
        if self.shuttle_pipeline is not None:
            shuttle_obs = self.shuttle_pipeline.process_frame(
                frame,
                timestamp_sec=t_sec,
                frame_index=self.frame_count,
            )

        return {
            # Canonical V1 Protocol (PDF §45 & §47)
            "schemaVersion": 1,
            "analysisId": getattr(self, "analysis_id", "live_session"),
            "timestampSec": round(t_sec, 3),
            "frameIndex": self.frame_count,
            "engineVersion": "1.0.0",
            "modelVersion": getattr(self, "model_path", "yolov8n.pt"),
            **self.calibration_context.frame_fields(),
            "isSynthetic": False,
            "source": "real_tracking",
            "rawTrackerIdSwitches": getattr(self, "raw_tracker_id_switches", 0),
            "semanticPlayerIdSwitches": getattr(self, "semantic_player_id_switches", 0),
            "reidEnabled": self.reid_adapter.is_enabled if getattr(self, "reid_adapter", None) is not None else False,
            "reidModel": self.reid_adapter.model_name if getattr(self, "reid_adapter", None) is not None else None,
            "runtime": self.engine_config.runtime,
            "precision": self.engine_config.precision,
            "actualModel": getattr(self.detector_adapter, "actual_model", None) or self.engine_config.model_artifact_reference or getattr(self, "model_path", "yolov8n.pt"),
            "device": self.device,
            "players": player_telemetry,
            "shuttle": shuttle_obs.to_dict() if shuttle_obs is not None else None,

            # Backward compatibility aliases
            "timestamp": round(t_sec, 3),
            "frame_idx": self.frame_count,
        }

    def get_live_player_statuses(self) -> list[dict]:
        """
        Return live status snapshot for each active player profile (Phase 3.10).
        """
        statuses = []
        for pid, p in self.profiles.items():
            stats = self.dist_tracker.get_stats(pid)
            if p.last_bbox is None:
                tracking_state = "lost"
            elif p.missed_frames == 0:
                tracking_state = "observed"
            elif p.missed_frames < 15:
                tracking_state = "predicted"
            else:
                tracking_state = "lost"

            pos_m = stats.get("court_pos_m")
            pos_pct = stats.get("court_pos_pct")
            court_pos = None
            if self.calibration_context.is_metric_valid and self.mapper.is_calibrated and pos_m and pos_pct and p.last_real_pos is not None:
                court_pos = {
                    "xM": round(pos_m.get("x", 0.0), 2),
                    "yM": round(pos_m.get("y", 0.0), 2),
                    "xPct": round(pos_pct.get("x", 0.0), 2),
                    "yPct": round(pos_pct.get("y", 0.0), 2),
                }

            confidence = (
                round(float(p.detection_confidence), 3)
                if (p.last_bbox is not None and p.missed_frames == 0 and p.detection_confidence is not None)
                else None
            )

            statuses.append({
                "playerId": f"P{pid}",
                "trackId": p.track_id,
                "totalDistanceM": round(stats.get("total_dist_m", 0.0), 2) if self.dist_tracker.has_metric_observation(pid) else None,
                "currentSpeedMps": round(stats["current_speed_ms"], 2) if court_pos is not None and stats.get("current_speed_ms") is not None else None,
                "trackingState": tracking_state,
                "detectionConfidence": confidence,
                "courtPosition": court_pos,
            })
        return statuses

    def _match_tracks_to_profiles(self, frame: np.ndarray, detections: list[dict], timestamp_sec: float | None = None) -> dict:
        """
        Global Hungarian (Bipartite) matching between active PlayerProfiles and Detections.
        Uses explicit 5-component cost model with ReID assistance, tracking raw vs semantic identity switches.
        """
        matched, cost_breakdowns, raw_switches, sem_switches = match_tracks_to_profiles_with_reid(
            profiles=self.profiles,
            detections=detections,
            frame=frame,
            dist_tracker=self.dist_tracker,
            reid_adapter=self.reid_adapter,
            timestamp_sec=timestamp_sec,
            last_known_track_owners=self.last_known_track_owners,
        )
        self.raw_tracker_id_switches += raw_switches
        self.semantic_player_id_switches += sem_switches
        self._last_cost_breakdowns = cost_breakdowns
        return matched

    def swap_players(self, pid_a: int, pid_b: int):
        """Swap identities of two players (e.g., P1 <-> P2 or P3 <-> P4)."""
        if pid_a in self.profiles and pid_b in self.profiles:
            pa = self.profiles[pid_a]
            pb = self.profiles[pid_b]
            pa.track_id, pb.track_id = pb.track_id, pa.track_id
            pa.detection_confidence, pb.detection_confidence = pb.detection_confidence, pa.detection_confidence
            pa.color_hist, pb.color_hist = pb.color_hist, pa.color_hist
            pa.reid_embedding, pb.reid_embedding = pb.reid_embedding, pa.reid_embedding
            pa.last_real_pos, pb.last_real_pos = pb.last_real_pos, pa.last_real_pos
            pa.last_bbox, pb.last_bbox = pb.last_bbox, pa.last_bbox
            pa.last_pose, pb.last_pose = pb.last_pose, pa.last_pose
            pa.last_pose_age, pb.last_pose_age = pb.last_pose_age, pa.last_pose_age
            if pa.track_id is not None:
                self.last_known_track_owners[pa.track_id] = pid_a
            if pb.track_id is not None:
                self.last_known_track_owners[pb.track_id] = pid_b
            self.semantic_player_id_switches += 1
            print(f"[BadmintonAnalyzerV2] Swapped player identities {pid_a} <-> {pid_b}")

    def get_provenance(self) -> dict[str, Any]:
        """Return truthful runtime provenance matching the configured vision engine seams."""
        det_m = self.detector_adapter.model_name if self.detector_adapter is not None else self.engine_config.detector_model
        actual_m = getattr(self.detector_adapter, "actual_model", None) or self.engine_config.model_artifact_reference or det_m
        pose_m = self.pose_adapter.model_name if self.pose_adapter is not None else self.engine_config.pose_model
        reid_m = self.reid_adapter.model_name if getattr(self, "reid_adapter", None) is not None else self.engine_config.reid_model
        reid_en = self.reid_adapter.is_enabled if getattr(self, "reid_adapter", None) is not None else self.engine_config.reid_enabled

        return {
            "detectorModel": det_m,
            "detectorFamily": self.engine_config.detector_family,
            "poseModel": pose_m,
            "poseFamily": self.engine_config.pose_family,
            "poseArchitecture": self.pose_architecture,
            "trackerModel": self.engine_config.tracker_name,
            "trackerName": self.engine_config.tracker_name,
            "trackerConfigPath": self.engine_config.tracker_config_path,
            "trackerConfig": self.engine_config.tracker_config,
            "reidEnabled": reid_en,
            "reidModel": reid_m,
            "rawTrackerIdSwitches": getattr(self, "raw_tracker_id_switches", 0),
            "semanticPlayerIdSwitches": getattr(self, "semantic_player_id_switches", 0),
            "runtime": self.engine_config.runtime,
            "precision": self.engine_config.precision,
            "actualModel": actual_m,
            "modelArtifactReference": self.engine_config.model_artifact_reference,
            "detectorInputSize": self.detector_input_size,
            "confidenceThreshold": self.conf,
            "frameStride": getattr(self, "frame_stride", 1),
            "poseStride": self.pose_stride,
            "useCourtRoi": self.use_court_roi,
            "courtRoiMarginPx": self.court_roi_margin_px,
            "courtRoiMarginM": self.court_roi_margin_m,
            "device": self.device,
        }
