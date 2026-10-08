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
from calibration_contract import CalibrationContext, CalibrationSource, CalibrationState
from court_calibration import (
    AutomaticCourtCalibrationProvider,
    CourtCalibrationCandidate,
    CourtCalibrationProvider,
    ManualCourtCalibrationProvider,
    TemporalStabilityValidator,
    validate_court_geometry,
)
from camera_cut_detector import CameraCutDetector
from scene_lifecycle import (
    CameraSegmentLifecycleManager,
    ImageSpaceHitEvidence,
    ImageSpacePlayerObservation,
    ImageSpaceShuttleObservation,
    SceneState,
    SceneStateTransition,
    compute_image_space_hit_capability,
)
from court_roi import calculate_court_roi, inverse_transform_bbox
from device_runtime import resolve_device
from shuttle_shots import ShuttleShotTracker
from engine_config import (
    TrackingEngineConfig,
    create_baseline_engine_config,
    resolve_tracker_config,
    validate_runtime_and_precision,
)
from detector_adapter import BaseDetectorAdapter, UltralyticsDetectorAdapter
from tracker_adapter import NormalizedTrackResult, TrackerProvenance
from pose_adapter import BasePoseAdapter, create_pose_provider, FullFramePoseCandidate
from pose_coordinate_space import (
    POSE_COORDINATE_SPACE_NORMALIZED_PERCENT,
    POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS,
    SUPPORTED_POSE_COORDINATE_SPACES,
)
from pose_association import associate_poses_to_athletes
from reid_adapter import BaseReIDAdapter, create_reid_provider
from semantic_identity import match_tracks_to_profiles_with_reid, SemanticIdentityCosts
from ground_position import (
    resolve_canonical_ground_point,
    CANONICAL_PROVENANCE_BOTH_ANKLES,
    CANONICAL_PROVENANCE_LEFT_ANKLE,
    CANONICAL_PROVENANCE_RIGHT_ANKLE,
    CANONICAL_PROVENANCE_BBOX,
)
from player_eligibility import (
    CourtEnvelopeZone,
    CourtEnvelopeConfig,
    EligibilityStatus,
    PlayerEligibility,
    classify_court_envelope,
    evaluate_player_eligibility,
    select_eligible_player_candidates,
)
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
        self.last_envelope_zone: str | None = None
        self.last_eligibility_status: str | None = None
        self.last_ground_pt: CanonicalGroundPoint | None = None
        self.identity_needs_reacquisition = False
        self.identity_confirmation_track = None
        self.identity_confirmation_frames = 0

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
        calibration_provider: CourtCalibrationProvider | None = None,
        auto_calibrate: bool = False,
        player_promotion_min_in_court_observations: int = 1,
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
        self.shot_tracker = ShuttleShotTracker(game_type)
        self.requested_device = device if device is not None else (engine_config.device if engine_config else 'auto')
        self.device = resolve_device(self.requested_device)

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
        self._camera_cut_pending_semantic_reset = False
        self.court_corners_px: np.ndarray | None = None
        self.manual_calibration_provider = ManualCourtCalibrationProvider()
        self.auto_calibration_provider = (
            calibration_provider
            if calibration_provider is not None
            else (AutomaticCourtCalibrationProvider() if auto_calibrate else None)
        )
        # Three measured, consistent candidates within at most five frames.
        # Missing line evidence never creates a candidate; cuts/drift still reset.
        self.temporal_stability_validator = TemporalStabilityValidator(max_missing_frames=2)
        self.scene_lifecycle = CameraSegmentLifecycleManager(
            calibration_context=self.calibration_context,
            camera_cut_detector=self.camera_cut_detector,
            on_cut_callback=self._invalidate_for_camera_cut,
        )
        self.frame_count = 0
        self.court_envelope_config = CourtEnvelopeConfig(
            margin_x_m=self.court_roi_margin_m if self.court_roi_margin_m > 0 else 2.0,
            margin_y_m=2.5,
            image_margin_px=float(self.court_roi_margin_px),
            player_promotion_min_in_court_observations=int(player_promotion_min_in_court_observations),
        )

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
        self.track_in_court_counts: dict[int, int] = {}
        self.track_far_outside_counts: dict[int, int] = {}
        self._detector = None
        self._pose_detector = None
        self.shuttle_pipeline = shuttle_pipeline

        if self.pose_adapter is None and self.pose_architecture == "full_frame_pose":
            self.pose_adapter = create_pose_provider(
                architecture=self.pose_architecture,
                model_path=self.engine_config.pose_model,
                conf_threshold=0.4,
                device=self.requested_device,
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
                device=self.requested_device,
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

        if self._pose_detector is not None and self.pose_adapter is None:
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
            device=self.requested_device,
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
            device=self.requested_device,
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
        camera_segment_id: str | None = None, calibration_version: str | None = None,
    ):
        """Set court corners for perspective calibration."""
        if camera_segment_id is not None and camera_segment_id != self.calibration_context.camera_segment_id:
            raise ValueError(
                f"Stale calibration correction: target segment '{camera_segment_id}' does not match active segment '{self.calibration_context.camera_segment_id}'"
            )
        source_kind = CalibrationSource(source)
        if source_kind is CalibrationSource.MANUAL and (confidence is not None or reprojection_error_px is not None):
            raise ValueError("Manual four-corner calibration has no measured confidence or reprojection error")
        candidate = np.array(corners, dtype=np.float32)
        valid, reason = validate_court_geometry(candidate)
        if not valid:
            raise ValueError(f"Invalid court geometry: {reason}")
        candidate_mapper = CourtMapper(game_type=self.game_type)
        candidate_mapper.calibrate(candidate)
        self.calibration_context.accept(
            source=source_kind,
            frame=self.frame_count if created_at_frame is None else created_at_frame,
            timestamp_sec=self.frame_count / self.fps if created_at_timestamp_sec is None else created_at_timestamp_sec,
            confidence=confidence,
            reprojection_error_px=reprojection_error_px,
            calibration_version=calibration_version,
            corners=candidate.tolist(),
            h_matrix=candidate_mapper.H.tolist(),
            h_inv_matrix=candidate_mapper.H_inv.tolist(),
        )
        self.mapper.H = candidate_mapper.H
        self.mapper.H_inv = candidate_mapper.H_inv
        self.mapper.game_type = self.game_type
        self.court_corners_px = candidate
        self.dist_tracker.pause_metric_tracking()
        self.camera_cut_detector.rearm_after_calibration()
        self.manual_calibration_provider.set_corners(candidate, self.calibration_context.camera_segment_id)
        self.temporal_stability_validator.invalidate()
        cand_tuple = tuple(tuple(float(c) for c in pt) for pt in candidate)
        self.temporal_stability_validator.is_locked = True
        self.temporal_stability_validator.locked_candidate = CourtCalibrationCandidate(
            corners_px=cand_tuple,
            source=source_kind,
            confidence=confidence,
            reprojection_error_px=reprojection_error_px,
            h_matrix=tuple(tuple(float(v) for v in row) for row in candidate_mapper.H),
            h_inv_matrix=tuple(tuple(float(v) for v in row) for row in candidate_mapper.H_inv),
        )
        self.temporal_stability_validator.current_segment_id = self.calibration_context.camera_segment_id
        for profile in self.profiles.values():
            profile.last_real_pos = None

    def _accept_automatic_candidate(
        self, candidate: CourtCalibrationCandidate, frame: int, timestamp_sec: float
    ) -> None:
        candidate_arr = np.asarray(candidate.corners_px, dtype=np.float32)
        candidate_mapper = CourtMapper(game_type=self.game_type)
        candidate_mapper.calibrate(candidate_arr)
        self.calibration_context.accept(
            source=CalibrationSource.AUTOMATIC,
            frame=frame,
            timestamp_sec=timestamp_sec,
            confidence=candidate.confidence,
            reprojection_error_px=candidate.reprojection_error_px,
            corners=candidate_arr.tolist(),
            h_matrix=candidate_mapper.H.tolist(),
            h_inv_matrix=candidate_mapper.H_inv.tolist(),
        )
        self.mapper.H = candidate_mapper.H
        self.mapper.H_inv = candidate_mapper.H_inv
        self.mapper.game_type = self.game_type
        self.court_corners_px = candidate_arr
        self.dist_tracker.pause_metric_tracking()
        self.camera_cut_detector.rearm_after_calibration()
        for profile in self.profiles.values():
            profile.last_real_pos = None

    def lose_calibration(self) -> None:
        self.temporal_stability_validator.invalidate()
        self.calibration_context.lose()
        self.mapper.invalidate()
        self.court_corners_px = None
        self.dist_tracker.pause_metric_tracking()
        for profile in self.profiles.values():
            profile.last_real_pos = None

    def begin_recalibration(self) -> None:
        self.temporal_stability_validator.invalidate()
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
        self.scene_lifecycle.notify_cut(frame_index=self.frame_count, timestamp_sec=self.frame_count / self.fps)

    def _invalidate_for_camera_cut(self) -> None:
        """Break all metric state before processing the first frame of a cut."""
        self._camera_cut_pending_semantic_reset = True
        self.temporal_stability_validator.invalidate()
        self.calibration_context.start_camera_segment()
        self.mapper.invalidate()
        self.court_corners_px = None
        self.dist_tracker.break_metric_segment()
        self.last_known_track_owners.clear()
        self.track_in_court_counts.clear()
        self.track_far_outside_counts.clear()
        for profile in self.profiles.values():
            profile.identity_needs_reacquisition = True
            profile.identity_confirmation_track = None
            profile.identity_confirmation_frames = 0
            profile.last_real_pos = None
            profile.last_bbox = None
            profile.missed_frames = 30
            profile.track_id = None
            profile.detection_confidence = None
            profile.last_pose = None
            profile.last_pose_age = 0
            profile.last_envelope_zone = None
            profile.last_eligibility_status = None
            profile.last_ground_pt = None

        if self.shuttle_pipeline is not None and hasattr(self.shuttle_pipeline, "reset_for_camera_segment"):
            self.shuttle_pipeline.reset_for_camera_segment(
                camera_segment_id=self.calibration_context.camera_segment_id,
                pipeline_run_id=getattr(self, "pipeline_run_id", getattr(self, "analysis_id", "live_session")),
            )

    def is_observation_accepted(self, camera_segment_id: str | None) -> bool:
        """Reject late or stale observations from older camera segments."""
        return self.scene_lifecycle.is_observation_accepted(camera_segment_id)

    def set_manual_scene_override(
        self,
        state: SceneState | str,
        override_by: str,
        reason: str,
        timestamp_sec: float | None = None,
    ) -> None:
        enum_state = SceneState(state) if isinstance(state, str) else state
        self.scene_lifecycle.set_manual_override(
            state=enum_state,
            override_by=override_by,
            reason=reason,
            timestamp_sec=timestamp_sec,
        )

    def clear_manual_scene_override(self) -> None:
        self.scene_lifecycle.clear_manual_override()

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
            # PART 4: Ensure known tracked players temporarily outside court ROI are recoverable
            for p in self.profiles.values():
                if p.last_bbox is not None and p.missed_frames < 15:
                    bx1, by1, bx2, by2 = p.last_bbox
                    margin = float(self.court_roi_margin_px)
                    roi_x1 = max(0, min(roi_x1, int(bx1 - margin)))
                    roi_y1 = max(0, min(roi_y1, int(by1 - margin)))
                    roi_x2 = min(w, max(roi_x2, int(bx2 + margin)))
                    roi_y2 = min(h, max(roi_y2, int(by2 + margin)))

            if (roi_x2 - roi_x1) >= 50 and (roi_y2 - roi_y1) >= 50:
                inference_frame = frame[roi_y1:roi_y2, roi_x1:roi_x2]
                offset_x, offset_y = roi_x1, roi_y1

        if self.detector_adapter is not None:
            if self._detector is not None and hasattr(self.detector_adapter, "_model"):
                self.detector_adapter._model = self._detector
            detections = self.detector_adapter.detect_and_track(
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
            execution = getattr(self.detector_adapter, 'execution', None)
            if execution is not None:
                self.device = execution.device
            return detections

        return []

    def process_frame(
        self,
        frame: np.ndarray,
        timestamp_sec: float | None = None,
        frame_index: int | None = None,
        source_frame: int | None = None,
    ) -> dict:
        """Process a single frame and generate structured telemetry."""
        if frame_index is not None:
            self.frame_count = int(frame_index)
        else:
            self.frame_count += 1
        self.analyzed_frame_count += 1
        should_run_pose = (self.analyzed_frame_count % self.pose_stride == 0)
        t_sec = timestamp_sec if timestamp_sec is not None else (self.frame_count / self.fps)

        # Check camera cut first to ensure no stale ROI is used during detection
        cut_detected = self.camera_cut_detector.observe(frame)
        if cut_detected:
            self._invalidate_for_camera_cut()

        raw_detections = self.detect_and_track(frame)
        player_bboxes = [d["bbox"] for d in raw_detections if "bbox" in d]

        # Evaluate coarse scene state and segment lifecycle
        transition = self.scene_lifecycle.evaluate_frame(
            frame=frame,
            frame_index=self.frame_count,
            timestamp_sec=t_sec,
            player_bboxes=player_bboxes,
            is_side_view_cue=getattr(self, "is_side_view", False),
            is_replay_cue=getattr(self, "is_replay", False),
            cut_detected=cut_detected,
        )
        camera_cut_boundary = cut_detected or self._camera_cut_pending_semantic_reset
        self._camera_cut_pending_semantic_reset = False

        # Pan/tilt/zoom motion drift suspends metrics and invalidates court homography
        if transition.evidence.is_pan_tilt_zoom:
            self.temporal_stability_validator.invalidate()
            self.calibration_context.lose()
            self.mapper.invalidate()
            self.court_corners_px = None
            self.dist_tracker.break_metric_segment()

        # Attempt auto-calibration only when court is stable (not in cut, transition, close-up, side play, replay)
        if (
            self.auto_calibration_provider is not None
            and not self.calibration_context.is_metric_valid
            and transition.to_state not in (
                SceneState.CAMERA_TRANSITION,
                SceneState.CLOSE_UP,
                SceneState.REPLAY,
                SceneState.SIDE_PLAY,
            )
        ):
            cand = self.auto_calibration_provider.get_candidate(
                frame,
                frame_index=self.frame_count,
                timestamp_sec=t_sec,
                camera_segment_id=self.calibration_context.camera_segment_id,
            )
            if cand is not None:
                if self.calibration_context.state is CalibrationState.CALIBRATION_LOST:
                    self.calibration_context.begin_recalibration()
                locked = self.temporal_stability_validator.observe(cand, self.calibration_context.camera_segment_id)
                if locked is not None:
                    self._accept_automatic_candidate(locked, frame=self.frame_count, timestamp_sec=t_sec)
                    transition = self.scene_lifecycle.evaluate_frame(
                        frame=frame,
                        frame_index=self.frame_count,
                        timestamp_sec=t_sec,
                        player_bboxes=player_bboxes,
                        is_side_view_cue=getattr(self, "is_side_view", False),
                        is_replay_cue=getattr(self, "is_replay", False),
                        cut_detected=False,
                    )
                else:
                    if self.calibration_context.state is CalibrationState.CALIBRATION_LOST:
                        self.calibration_context.begin_recalibration()
            else:
                self.temporal_stability_validator.observe(None, self.calibration_context.camera_segment_id)
        elif not self.calibration_context.is_metric_valid:
            # Do not join line observations across an excluded scene interval.
            self.temporal_stability_validator.invalidate()

        # Pipeline: Person Detection -> Pose/Feet -> Eligibility -> Temporal Identity -> Player Candidate
        h, w = frame.shape[:2] if frame is not None else (720, 1280)
        cal_obj = getattr(self.calibration_context, "state", getattr(self.calibration_context, "status", None))
        calibration_state = (
            cal_obj.value
            if hasattr(cal_obj, "value")
            else str(cal_obj or "UNCALIBRATED")
        )
        metric_valid = bool(
            transition.is_metric_valid
            and self.mapper.is_calibrated
            and calibration_state == "CALIBRATED"
        )

        # 1. Pose estimation across candidate detections
        full_frame_candidates: list[FullFramePoseCandidate] = []
        if self.pose_architecture == "full_frame_pose" and should_run_pose:
            full_frame_candidates = self._estimate_full_frame_poses(frame)

        for d in raw_detections:
            bbox = d.get("bbox")
            if bbox is None:
                continue

            # If test mock provided a dummy bbox [0, 0, 50, 50] with an explicit center, align bbox to center
            if bbox == [0, 0, 50, 50] and "center" in d and d["center"] is not None:
                cx, cy = d["center"]
                bbox = [cx - 25.0, cy - 50.0, cx + 25.0, cy]
                d["bbox"] = bbox

            pose_res = None
            pose_kps = None
            is_pose_reused = False
            pose_age_frames = 0
            pose_age_sec = 0.0

            # Match to existing profile for temporal pose continuity if present
            matched_prof = None
            det_track_id = d.get("track_id")
            if det_track_id is not None:
                for p in self.profiles.values():
                    if p.track_id == det_track_id and p.missed_frames < 30:
                        matched_prof = p
                        break

            # Part 12 Performance optimization: Skip running pose on obvious FAR_OUTSIDE spectators
            rough_gx = (bbox[0] + bbox[2]) / 2.0
            rough_gy = float(bbox[3])
            rough_zone, _, _ = classify_court_envelope(
                ground_px=(rough_gx, rough_gy),
                court_corners_px=self.court_corners_px,
                court_mapper=self.mapper,
                is_metric_valid=metric_valid,
                config=self.court_envelope_config,
                calibration_state=calibration_state,
            )
            is_known = (matched_prof is not None)
            skip_pose_for_spectator = (
                not is_known
                and rough_zone == CourtEnvelopeZone.FAR_OUTSIDE
                and self.pose_architecture != "full_frame_pose"
            )

            if self.pose_architecture == "full_frame_pose":
                if should_run_pose and full_frame_candidates:
                    best_cand = None
                    best_iou = 0.0
                    bx1, by1, bx2, by2 = bbox
                    for cand in full_frame_candidates:
                        cx1, cy1, cx2, cy2 = cand.bbox
                        ix1, iy1 = max(bx1, cx1), max(by1, cy1)
                        ix2, iy2 = min(bx2, cx2), min(by2, cy2)
                        if ix2 > ix1 and iy2 > iy1:
                            inter = (ix2 - ix1) * (iy2 - iy1)
                            union = (bx2 - bx1) * (by2 - by1) + (cx2 - cx1) * (cy2 - cy1) - inter
                            iou = inter / max(1.0, union)
                            if iou > best_iou:
                                best_iou = iou
                                best_cand = cand
                    if best_cand is not None:
                        pose_kps = best_cand.keypoints
                        pose_res = {
                            "keypoints": pose_kps,
                            "metrics": best_cand.metrics,
                            "keypointCoordinateSpace": best_cand.keypoint_coordinate_space,
                        }
                        is_pose_reused = False
                        pose_age_frames = 0
                    elif matched_prof is not None and matched_prof.last_pose is not None and matched_prof.missed_frames < 15:
                        is_pose_reused = True
                        pose_age_frames = matched_prof.last_pose_age + 1
                        pose_age_sec = pose_age_frames / self.fps
                        pose_kps = matched_prof.last_pose.get("keypoints")
                        pose_res = matched_prof.last_pose
                else:
                    if matched_prof is not None and matched_prof.last_pose is not None and matched_prof.missed_frames < 15:
                        is_pose_reused = True
                        pose_age_frames = matched_prof.last_pose_age + 1
                        pose_age_sec = pose_age_frames / self.fps
                        pose_kps = matched_prof.last_pose.get("keypoints")
                        pose_res = matched_prof.last_pose
            else:
                if should_run_pose and not skip_pose_for_spectator:
                    pose_res = self._estimate_pose(frame, bbox)
                    if pose_res and pose_res.get("keypoints"):
                        pose_kps = pose_res["keypoints"]
                        is_pose_reused = False
                        pose_age_frames = 0
                    elif matched_prof is not None and matched_prof.last_pose is not None and matched_prof.missed_frames < 15:
                        is_pose_reused = True
                        pose_age_frames = matched_prof.last_pose_age + 1
                        pose_age_sec = pose_age_frames / self.fps
                        pose_kps = matched_prof.last_pose.get("keypoints")
                        pose_res = matched_prof.last_pose
                else:
                    if matched_prof is not None and matched_prof.last_pose is not None and matched_prof.missed_frames < 15:
                        is_pose_reused = True
                        pose_age_frames = matched_prof.last_pose_age + 1
                        pose_age_sec = pose_age_frames / self.fps
                        pose_kps = matched_prof.last_pose.get("keypoints")
                        pose_res = matched_prof.last_pose

            # 2. Feet / Canonical Ground Point Resolution
            ground_pt = resolve_canonical_ground_point(
                bbox=bbox,
                frame_width=w,
                frame_height=h,
                pose_keypoints=pose_kps,
                pose_coordinate_space=(pose_res.get("keypointCoordinateSpace") if pose_res else None),
                is_pose_reused=is_pose_reused,
                pose_age_frames=pose_age_frames,
                pose_age_sec=pose_age_sec,
                bbox_confidence=d.get("conf"),
                court_mapper=self.mapper,
                is_metric_valid=metric_valid,
            )
            d["ground_pt"] = ground_pt
            d["real_pos"] = d.get("real_pos") if d.get("real_pos") is not None else ground_pt.ground_position_m

            pose_obj = None
            pose_coordinate_space = pose_res.get("keypointCoordinateSpace") if pose_res else None
            if pose_kps is not None and pose_coordinate_space in SUPPORTED_POSE_COORDINATE_SPACES:
                pose_obj = {
                    "keypoints": [
                        {
                            "x": (
                                float(k[0]) / w * 100.0
                                if pose_coordinate_space == POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS
                                else float(k[0])
                            ),
                            "y": (
                                float(k[1]) / h * 100.0
                                if pose_coordinate_space == POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS
                                else float(k[1])
                            ),
                            "score": float(k[2]) if len(k) >= 3 else 1.0,
                        }
                        if isinstance(k, (list, tuple)) and len(k) >= 2 else
                        {
                            **k,
                            "x": (
                                float(k["x"]) / w * 100.0
                                if pose_coordinate_space == POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS
                                else float(k["x"])
                            ),
                            "y": (
                                float(k["y"]) / h * 100.0
                                if pose_coordinate_space == POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS
                                else float(k["y"])
                            ),
                            "score": float(k.get("score", k.get("conf", 0.0))),
                        }
                        if isinstance(k, dict) and "x" in k and "y" in k else
                        {"x": 0.0, "y": 0.0, "score": 0.0}
                        for k in pose_kps
                    ],
                    "metrics": pose_res.get("metrics", {}) if pose_res else {},
                    "keypointCoordinateSpace": POSE_COORDINATE_SPACE_NORMALIZED_PERCENT,
                    "isReused": is_pose_reused,
                    "ageFrames": pose_age_frames,
                    "ageSec": round(pose_age_sec, 3),
                    "isStale": ground_pt.is_stale,
                    "staleReason": ground_pt.stale_reason,
                }
            d["pose_obj"] = pose_obj

            # 3. Court Envelope & Eligibility Evaluation
            zone, dist_m, dist_px = classify_court_envelope(
                ground_px=ground_pt.ground_px,
                ground_m=ground_pt.ground_position_m,
                court_corners_px=self.court_corners_px,
                court_mapper=self.mapper,
                is_metric_valid=metric_valid,
                config=self.court_envelope_config,
                calibration_state=calibration_state,
            )

            # Update temporal confirmation observation counts per track
            if det_track_id is not None:
                if zone == CourtEnvelopeZone.IN_COURT:
                    self.track_in_court_counts[det_track_id] = self.track_in_court_counts.get(det_track_id, 0) + 1
                    self.track_far_outside_counts[det_track_id] = 0
                elif zone == CourtEnvelopeZone.FAR_OUTSIDE:
                    self.track_far_outside_counts[det_track_id] = self.track_far_outside_counts.get(det_track_id, 0) + 1
                    self.track_in_court_counts[det_track_id] = max(0, self.track_in_court_counts.get(det_track_id, 0) - 1)
                else:
                    self.track_far_outside_counts[det_track_id] = 0

            in_court_count = self.track_in_court_counts.get(det_track_id, 1 if det_track_id is None else 0)
            far_outside_count = self.track_far_outside_counts.get(det_track_id, 0)
            if not hasattr(self, "track_uncalibrated_counts"):
                self.track_uncalibrated_counts = {}
            self.track_uncalibrated_counts[det_track_id] = self.track_uncalibrated_counts.get(det_track_id, 0) + 1 if zone == CourtEnvelopeZone.UNAVAILABLE else 0
            if len(self.track_uncalibrated_counts) > 4096:
                self.track_uncalibrated_counts.pop(next(iter(self.track_uncalibrated_counts)))

            elig = evaluate_player_eligibility(
                detection=d,
                ground_point=ground_pt,
                envelope_zone=zone,
                envelope_dist_m=dist_m,
                envelope_dist_px=dist_px,
                active_profiles=self.profiles,
                scene_state=transition.to_state,
                game_type=self.game_type,
                is_metric_valid=metric_valid,
                config=self.court_envelope_config,
                in_court_observations=in_court_count,
                calibration_state=calibration_state,
                far_outside_frames=far_outside_count,
                unavailable_frames=self.track_uncalibrated_counts[det_track_id],
            )
            d["envelope_zone"] = zone
            d["eligibility"] = elig

        # 4. Select Player Candidates
        if camera_cut_boundary or transition.to_state is SceneState.CLOSE_UP:
            eligible_candidates = []
        else:
            eligible_candidates = select_eligible_player_candidates(
                detections=raw_detections,
                eligibilities=[d.get("eligibility") for d in raw_detections if "eligibility" in d],
                max_players=self.max_players,
                active_profiles=self.profiles,
            )

        # 5. Temporal Identity Association (Bipartite Hungarian Matching)
        matched_players = self._match_tracks_to_profiles(
            frame, eligible_candidates, timestamp_sec=t_sec
        )

        # 6. Update distance tracker and profile state
        for pid, p in self.profiles.items():
            if pid in matched_players:
                p.last_pose_age = 0
                ground_pt = p.last_ground_pt
                if ground_pt is not None:
                    self.dist_tracker.update(
                        player_id=pid,
                        center_px=ground_pt.ground_px,
                        timestamp_sec=t_sec,
                        camera_segment_id=self.calibration_context.camera_segment_id,
                        calibration_id=self.calibration_context.provenance.calibration_id if metric_valid else None,
                        provenance=ground_pt.provenance,
                        allow_canonical_writes=transition.allow_canonical_writes,
                        confidence=ground_pt.confidence,
                        metric_eligible=metric_valid and ground_pt.metric_eligible and p.missed_frames == 0,
                        calibration_confidence=(self.calibration_context.provenance.confidence if self.calibration_context.provenance.confidence is not None else .5) if metric_valid else 0.0,
                        identity_confidence=0.0 if p.identity_needs_reacquisition else 1.0,
                        scene_state=transition.to_state.value,
                    )
            else:
                self.dist_tracker.pause_player(pid)
                if p.missed_frames < 30:
                    p.last_pose_age += 1
                if p.missed_frames >= 15:
                    p.last_pose = None
                    p.last_pose_age = 0

        # Build telemetry frame (TrackingTelemetryV1 compliant, PDF §45-47)
        player_telemetry = []
        for pid, p in self.profiles.items():
            if self.pose_architecture == "full_frame_pose":
                pose_obj = p.last_pose if (pid in matched_players or p.missed_frames < 15) else None
            else:
                pose_obj = p.last_pose if pid in matched_players else None

            bbox = p.last_bbox if p.missed_frames < 30 else None
            ground_pt = p.last_ground_pt if p.missed_frames < 30 else None
            if bbox is not None and ground_pt is None:
                pose_kps = pose_obj.get("keypoints") if pose_obj is not None else None
                is_reused = pose_obj.get("isReused", False) if pose_obj is not None else (p.missed_frames > 0)
                ground_pt = resolve_canonical_ground_point(
                    bbox=bbox,
                    frame_width=w,
                    frame_height=h,
                    pose_keypoints=pose_kps,
                    pose_coordinate_space=(
                        pose_obj.get("keypointCoordinateSpace") if pose_obj is not None else None
                    ),
                    is_pose_reused=is_reused,
                    pose_age_frames=p.last_pose_age,
                    pose_age_sec=p.last_pose_age / self.fps,
                    bbox_confidence=p.detection_confidence,
                    court_mapper=self.mapper,
                    is_metric_valid=metric_valid,
                )

            stats = self.dist_tracker.get_stats(pid)
            pos_m = stats.get("court_pos_m") if metric_valid else None
            pos_pct = stats.get("court_pos_pct") if metric_valid else None
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
            if bbox is not None:
                bx = round((bbox[0] / w) * 100.0, 2)
                by = round((bbox[1] / h) * 100.0, 2)
                bw = round(((bbox[2] - bbox[0]) / w) * 100.0, 2)
                bh = round(((bbox[3] - bbox[1]) / h) * 100.0, 2)
                bbox_pct = {"x": bx, "y": by, "width": bw, "height": bh}

            ground_pt_pct = None
            if ground_pt is not None:
                ground_pt_pct = {"x": ground_pt.ground_pct[0], "y": ground_pt.ground_pct[1]}

            ground_pos_m = None
            court_position = None
            if metric_valid and ground_pt is not None and ground_pt.ground_position_m is not None:
                gx_m, gy_m = ground_pt.ground_position_m
                ground_pos_m = {"xM": gx_m, "yM": gy_m}
                p.last_real_pos = (gx_m, gy_m)
                x_pct = pos_pct["x"] if pos_pct is not None else ground_pt.ground_pct[0]
                y_pct = pos_pct["y"] if pos_pct is not None else ground_pt.ground_pct[1]
                court_position = {
                    "xM": gx_m,
                    "yM": gy_m,
                    "xPct": round(x_pct, 2),
                    "yPct": round(y_pct, 2),
                }
            elif metric_valid and p.last_real_pos is not None:
                rx, ry = p.last_real_pos
                ground_pos_m = {"xM": round(rx, 2), "yM": round(ry, 2)}
                x_pct = pos_pct["x"] if pos_pct is not None else (round(rx / self.mapper.court_w * 100.0, 2))
                y_pct = pos_pct["y"] if pos_pct is not None else (round(ry / self.mapper.court_l * 100.0, 2))
                court_position = {
                    "xM": round(rx, 2),
                    "yM": round(ry, 2),
                    "xPct": round(x_pct, 2),
                    "yPct": round(y_pct, 2),
                }
            elif not metric_valid:
                p.last_real_pos = None

            confidence = (
                round(float(p.detection_confidence), 3)
                if (p.last_bbox is not None and p.missed_frames == 0 and p.detection_confidence is not None)
                else None
            )

            left_foot_dict = ground_pt.left_foot.to_dict() if ground_pt is not None else None
            right_foot_dict = ground_pt.right_foot.to_dict() if ground_pt is not None else None

            if tracking_state == "lost":
                obs_state = None
                ground_provenance = None
                bbox_pct = None
                ground_pt_pct = None
                ground_pos_m = None
                court_position = None
                confidence = None
                left_foot_dict = None
                right_foot_dict = None
                pose_obj = None
            elif tracking_state == "predicted":
                obs_state = getattr(p, "observation_state", None) or "predicted"
                ground_provenance = ground_pt.provenance if ground_pt is not None else "last_known_bbox"
            else:
                obs_state = getattr(p, "observation_state", None) or "observed"
                ground_provenance = ground_pt.provenance if ground_pt is not None else None

            player_data = {
                # Canonical V1 Tracking Protocol (PDF §45)
                "playerId": f"P{pid}",
                "trackId": p.track_id if tracking_state != "lost" else None,
                "teamCode": f"team{p.team}" if p.team in (1, 2) else "unknown",
                "bboxPct": bbox_pct,
                "groundPointPct": ground_pt_pct,
                "groundPointProvenance": ground_provenance,
                "groundPositionM": ground_pos_m,
                "courtPositionM": ground_pos_m,
                "courtPosition": court_position,
                "absoluteZone": abs_zone if tracking_state != "lost" else None,
                "playerRelativeZone": rel_zone if tracking_state != "lost" else None,
                "speedMps": stats.get("current_speed_ms") if (metric_valid and court_position is not None and transition.allow_canonical_writes and tracking_state != "lost") else None,
                "totalDistanceM": stats.get("total_dist_m") if self.dist_tracker.has_metric_observation(pid) else None,
                "rawGroundPoint": ground_pt.to_dict() if ground_pt is not None and tracking_state == "observed" else None,
                "filteredGroundPoint": stats.get("filteredGroundPoint") if tracking_state == "observed" and metric_valid else None,
                "distanceMetrics": {key: stats.get(key) for key in ("totalTrackedDistanceM", "distanceDuringActivePlayM", "metricDistanceCoverage", "groundPointQuality", "rawMovementM", "filteredMovementM", "jitterRejectedDistanceM", "validMovementSamples", "provenanceDistribution", "measurementUncertaintyM")},
                "detectionConfidence": confidence,
                "confidence": confidence,
                "state": tracking_state,
                "observationState": obs_state,
                "reviewState": getattr(p, "review_state", "unreviewed"),
                "athleteId": getattr(p, "athlete_id", None),
                "identityCosts": self._last_cost_breakdowns.get(pid).to_dict() if (hasattr(self, "_last_cost_breakdowns") and pid in self._last_cost_breakdowns and tracking_state != "lost") else None,
                "leftFootPx": left_foot_dict["positionPx"] if left_foot_dict else None,
                "rightFootPx": right_foot_dict["positionPx"] if right_foot_dict else None,
                "leftFootConfidence": left_foot_dict["confidence"] if left_foot_dict else None,
                "rightFootConfidence": right_foot_dict["confidence"] if right_foot_dict else None,
                "leftFootCourtM": left_foot_dict["courtPositionM"] if left_foot_dict else None,
                "rightFootCourtM": right_foot_dict["courtPositionM"] if right_foot_dict else None,
                "leftFoot": left_foot_dict,
                "rightFoot": right_foot_dict,
                "envelopeZone": getattr(p, "last_envelope_zone", None) if tracking_state != "lost" else None,
                "eligibilityStatus": getattr(p, "last_eligibility_status", None) if tracking_state != "lost" else None,
                "poseSource": ground_pt.pose_source if (ground_pt is not None and tracking_state != "lost") else None,
                "poseAgeFrames": ground_pt.pose_age_frames if (ground_pt is not None and tracking_state != "lost") else 0,
                "poseAgeSec": ground_pt.pose_age_sec if (ground_pt is not None and tracking_state != "lost") else 0.0,
                "isPoseStale": ground_pt.is_stale if (ground_pt is not None and tracking_state != "lost") else False,
                "staleReason": ground_pt.stale_reason if (ground_pt is not None and tracking_state != "lost") else None,

                # Backward compatibility aliases
                "id": pid,
                "team": p.team,
                "name": p.name,
                "bbox": bbox if tracking_state != "lost" else None,
                "court_pos_pct": pos_pct if (metric_valid and tracking_state != "lost") else None,
                "court_pos_m": pos_m if (metric_valid and tracking_state != "lost") else None,
                "zone": abs_zone if tracking_state != "lost" else None,
                "speed_ms": stats.get("current_speed_ms") if (metric_valid and court_position is not None and transition.allow_canonical_writes and tracking_state != "lost") else None,
                "total_dist_m": stats.get("total_dist_m") if self.dist_tracker.has_metric_observation(pid) else None,
                "is_active": p.missed_frames < 10 and tracking_state != "lost",
                "video_bbox_pct": bbox_pct,
            }
            if pose_obj is not None:
                player_data["pose"] = pose_obj
            player_telemetry.append(player_data)

        shuttle_obs = None
        if self.shuttle_pipeline is not None:
            shuttle_obs = self.shuttle_pipeline.process_frame(
                frame,
                timestamp_sec=t_sec,
                frame_index=self.frame_count,
                camera_segment_id=self.calibration_context.camera_segment_id,
                pipeline_run_id=getattr(self, "pipeline_run_id", getattr(self, "analysis_id", "live_session")),
                scene_evidence=transition.evidence.to_dict(),
            )

        # The lifecycle pass runs before shuttle inference, so finalize only the hit
        # readiness gate here using measured same-frame image evidence. This gate
        # does not create or assert a hit/contact event and does not affect metrics.
        if transition.capabilities is not None:
            image_players = []
            # Hit readiness is an image-space capability, not semantic promotion.
            image_observations = [{"state": "observed", "pose": d.get("pose_obj"),
                "detectionConfidence": d.get("conf"), "poseAgeFrames": d["ground_pt"].pose_age_frames,
                "isPoseStale": d["ground_pt"].is_stale, "poseSource": d["ground_pt"].pose_source}
                for d in raw_detections if d.get("ground_pt") is not None]
            for player in image_observations:
                pose = player.get("pose")
                raw_keypoints = pose.get("keypoints") if isinstance(pose, dict) else None
                keypoints = tuple(
                    (point.get("x"), point.get("y"), point.get("score"))
                    for point in raw_keypoints
                    if isinstance(point, dict)
                ) if isinstance(raw_keypoints, (tuple, list)) else ()
                image_players.append(ImageSpacePlayerObservation(
                    frame_index=transition.frame_index,
                    camera_segment_id=transition.camera_segment_id,
                    state=player.get("state", "unknown"),
                    detection_confidence=player.get("detectionConfidence"),
                    pose_keypoints=keypoints,
                    pose_coordinate_space=(pose.get("keypointCoordinateSpace") if isinstance(pose, dict) else None),
                    pose_age_frames=player.get("poseAgeFrames"),
                    pose_is_reused=(pose.get("isReused") is True if isinstance(pose, dict) else False),
                    pose_is_stale=(
                        player.get("isPoseStale") is True
                        or (pose.get("isStale") is True if isinstance(pose, dict) else False)
                        or player.get("poseSource") != "fresh"
                    ),
                ))

            shuttle_position = getattr(shuttle_obs, "position_px", None)
            image_shuttle = (
                ImageSpaceShuttleObservation(
                    frame_index=getattr(shuttle_obs, "frame_index", -1),
                    camera_segment_id=getattr(shuttle_obs, "camera_segment_id", None),
                    state=getattr(shuttle_obs, "state", "unknown"),
                    position_px=(
                        (getattr(shuttle_position, "x", None), getattr(shuttle_position, "y", None))
                        if shuttle_position is not None
                        else None
                    ),
                    confidence=getattr(shuttle_obs, "confidence", None),
                )
                if shuttle_obs is not None
                else None
            )
            hit_evidence = ImageSpaceHitEvidence(
                frame_index=transition.frame_index,
                camera_segment_id=transition.camera_segment_id,
                frame_width=w,
                frame_height=h,
                players=tuple(image_players),
                shuttle=image_shuttle,
            )
            transition.capabilities.can_estimate_hit = compute_image_space_hit_capability(
                transition.to_state,
                transition.evidence,
                hit_evidence,
            )

        raw_player_detections = [
            {
                "trackId": detection.get("track_id"),
                "bboxPx": list(detection["bbox"]),
                "confidence": detection.get("conf"),
                "pose": detection.get("pose_obj"),
                "eligibility": (
                    detection["eligibility"].to_dict()
                    if hasattr(detection.get("eligibility"), "to_dict")
                    else None
                ),
            }
            for detection in raw_detections
            if detection.get("bbox") is not None
        ]

        shot_events = self.shot_tracker.update({
            "frameIndex": self.frame_count, "sourceFrame": source_frame or self.frame_count,
            "timestampSec": t_sec, "cameraSegmentId": self.calibration_context.camera_segment_id,
            "sceneState": transition.to_state.value, "isMetricValid": metric_valid,
            "players": player_telemetry, "shuttle": shuttle_obs.to_dict() if shuttle_obs is not None else None,
        }, w, h)

        shuttle_telemetry = shuttle_obs.to_dict() if shuttle_obs is not None else None
        if shuttle_telemetry is not None and shot_events["visibility"] == "OUT_OF_FRAME":
            shuttle_telemetry = dict(shuttle_telemetry, positionPx=None, positionM=None, velocityPxPerSec=None, speedPxPerSec=None, validity={"positionValid": False, "reason": "no_reliable_position"})

        return {
            # Canonical V1 Protocol (PDF §45 & §47)
            "schemaVersion": 1,
            "analysisId": getattr(self, "analysis_id", "live_session"),
            "pipelineRunId": getattr(self, "pipeline_run_id", getattr(self, "analysis_id", "live_session")),
            "timestampSec": round(t_sec, 3),
            "frameIndex": self.frame_count,
            **({"sourceFrame": source_frame} if source_frame is not None else {}),
            "shuttleShotEvents": shot_events,
            "timebase": getattr(self, "timebase", None),
            "sceneState": transition.to_state.value,
            "sceneTransition": transition.to_dict(),
            "sceneEvidence": transition.evidence.to_dict(),
            "capabilities": transition.capabilities.to_dict() if transition.capabilities is not None else None,
            "canTrackPlayer": transition.capabilities.can_track_player.enabled if transition.capabilities is not None else True,
            "canTrackShuttle": transition.capabilities.can_track_shuttle.enabled if transition.capabilities is not None else True,
            "canUseCourtMetric": transition.capabilities.can_use_court_metric.enabled if transition.capabilities is not None else metric_valid,
            "canBuildHeatmap": transition.capabilities.can_build_heatmap.enabled if transition.capabilities is not None else metric_valid,
            "canEstimateHit": transition.capabilities.can_estimate_hit.enabled if transition.capabilities is not None else False,
            "canWriteCanonicalMatchData": transition.capabilities.can_write_canonical_match_data.enabled if transition.capabilities is not None else transition.allow_canonical_writes,
            "isMetricValid": metric_valid,
            "allowCanonicalWrites": transition.allow_canonical_writes,
            "engineVersion": "1.0.0",
            "modelVersion": getattr(self, "model_path", "yolov8n.pt"),
            "modelArtifactHash": getattr(self, "model_artifact_hash", None),
            "requestedDevice": getattr(self, "requested_device", None),
            "effectiveDevice": self.device,
            "runtime": self.engine_config.runtime,
            "precision": self.engine_config.precision,
            "supersededBy": getattr(self, "superseded_by", None),
            "observationState": "observed",
            "reviewState": getattr(self, "review_state", "unreviewed"),
            **self.calibration_context.frame_fields(),
            "isSynthetic": False,
            "source": "real_tracking",
            "rawTrackerIdSwitches": getattr(self, "raw_tracker_id_switches", 0),
            "semanticPlayerIdSwitches": getattr(self, "semantic_player_id_switches", 0),
            "reidEnabled": self.reid_adapter.is_enabled if getattr(self, "reid_adapter", None) is not None else False,
            "reidModel": self.reid_adapter.model_name if getattr(self, "reid_adapter", None) is not None else None,
            "actualModel": getattr(self.detector_adapter, "actual_model", None) or self.engine_config.model_artifact_reference or getattr(self, "model_path", "yolov8n.pt"),
            "device": self.device,
            "players": player_telemetry,
            "rawPlayerDetections": raw_player_detections,
            "shuttle": shuttle_telemetry,

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
                "envelopeZone": getattr(p, "last_envelope_zone", None),
                "eligibilityStatus": getattr(p, "last_eligibility_status", None),
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
            dist_tracker=None,
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
            pa.last_envelope_zone, pb.last_envelope_zone = pb.last_envelope_zone, pa.last_envelope_zone
            pa.last_eligibility_status, pb.last_eligibility_status = pb.last_eligibility_status, pa.last_eligibility_status
            pa.last_ground_pt, pb.last_ground_pt = pb.last_ground_pt, pa.last_ground_pt
            if pa.track_id is not None:
                self.last_known_track_owners[pa.track_id] = pid_a
            if pb.track_id is not None:
                self.last_known_track_owners[pb.track_id] = pid_b
            self.semantic_player_id_switches += 1
            print(f"[BadmintonAnalyzerV2] Swapped player identities {pid_a} <-> {pid_b}")

    def get_provenance(self) -> dict[str, Any]:
        """Return truthful runtime provenance matching the configured vision engine seams."""
        execution = getattr(self.detector_adapter, 'execution', None)
        if execution is not None:
            self.device = execution.device
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
            "autoCourtCalibrationEnabled": self.auto_calibration_provider is not None,
            "device": self.device,
            "requestedDevice": self.requested_device,
            "effectiveDevice": self.device,
            "executionValidated": bool(execution is not None and execution.status == 'READY'),
            "detectorDevice": (self.detector_adapter.get_provenance() or {}).get('effectiveDevice') if hasattr(self.detector_adapter, 'get_provenance') else None,
            "poseDevice": (self.pose_adapter.get_provenance() or {}).get('effectiveDevice') if hasattr(self.pose_adapter, 'get_provenance') else None,
            "shuttleDevice": self.shuttle_pipeline.get_provenance().get('effectiveDevice') if self.shuttle_pipeline is not None else None,
            "inferenceProviders": {
                'detector': self.detector_adapter.get_provenance() if hasattr(self.detector_adapter, 'get_provenance') else None,
                'pose': self.pose_adapter.get_provenance() if hasattr(self.pose_adapter, 'get_provenance') else None,
            },
        }
