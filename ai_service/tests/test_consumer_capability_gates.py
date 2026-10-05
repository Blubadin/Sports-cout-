"""Tests for unified consumer capability gates and calibration recovery lifecycle.

Verifies:
1. All 6 capability gates (canTrackPlayer, canTrackShuttle, canUseCourtMetric,
   canBuildHeatmap, canEstimateHit, canWriteCanonicalMatchData) are derived from
   the unified source of truth.
2. 2D player & shuttle tracking continue during uncalibrated / lost calibration / recalibrating.
3. Close-up and side views suspend court metric analytics.
4. Canonical match writes are strictly blocked during replays, court idle, and transitions.
5. Stale calibration corrections (segment mismatch, future frame) are rejected with explicit errors.
6. Unavailable reason is reported during RECALIBRATING.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
from fastapi.testclient import TestClient

from calibration_contract import (
    CalibrationContext,
    CalibrationProvenance,
    CalibrationSource,
    CalibrationState,
)
from scene_lifecycle import (
    CameraSegmentLifecycleManager,
    CapabilityGate,
    ImageSpaceHitEvidence,
    ImageSpacePlayerObservation,
    ImageSpaceShuttleObservation,
    SceneEvidence,
    SceneState,
    SegmentCapabilities,
    compute_capabilities,
)
from server import app, tracking_sessions, TrackingSession
import server
from analysis_job_store import AnalysisJobStore


class TestConsumerCapabilityGates(unittest.TestCase):
    """Unit tests for compute_capabilities logic matrix."""

    def setUp(self) -> None:
        self.cal_context = CalibrationContext()
        self.evidence = SceneEvidence(
            camera_cut_detected=False,
            court_visible=True,
            court_edge_coverage=0.03,
            calibration_state="UNCALIBRATED",
            player_count=2,
            max_player_box_area_ratio=0.05,
            global_motion_magnitude=0.2,
            is_pan_tilt_zoom=False,
            is_replay_cue=False,
        )

    def image_hit_evidence(
        self,
        *,
        frame_index: int = 10,
        camera_segment_id: str = "segment-0",
        frame_width: int = 1280,
        frame_height: int = 720,
        player_state: str = "observed",
        player_frame_index: int | None = None,
        player_segment_id: str | None = None,
        detection_confidence: float | None = 0.9,
        pose_keypoints: tuple[tuple[float, float, float], ...] | None = None,
        pose_coordinate_space: str | None = "normalized_percent",
        pose_age_frames: int = 0,
        pose_is_reused: bool = False,
        pose_is_stale: bool = False,
        shuttle_state: str = "observed",
        shuttle_frame_index: int | None = None,
        shuttle_segment_id: str | None = None,
        shuttle_position_px: tuple[float, float] | None = (50.0, 90.0),
        shuttle_confidence: float | None = 0.88,
    ) -> ImageSpaceHitEvidence:
        points = pose_keypoints or tuple((10.0, 20.0, 0.9) for _ in range(17))
        player = ImageSpacePlayerObservation(
            frame_index=frame_index if player_frame_index is None else player_frame_index,
            camera_segment_id=camera_segment_id if player_segment_id is None else player_segment_id,
            state=player_state,
            detection_confidence=detection_confidence,
            pose_keypoints=points,
            pose_coordinate_space=pose_coordinate_space,
            pose_age_frames=pose_age_frames,
            pose_is_reused=pose_is_reused,
            pose_is_stale=pose_is_stale,
        )
        shuttle = ImageSpaceShuttleObservation(
            frame_index=frame_index if shuttle_frame_index is None else shuttle_frame_index,
            camera_segment_id=camera_segment_id if shuttle_segment_id is None else shuttle_segment_id,
            state=shuttle_state,
            position_px=shuttle_position_px,
            confidence=shuttle_confidence,
        )
        return ImageSpaceHitEvidence(
            frame_index=frame_index,
            camera_segment_id=camera_segment_id,
            frame_width=frame_width,
            frame_height=frame_height,
            players=(player,),
            shuttle=shuttle,
        )

    def test_uncalibrated_court_play_capabilities(self) -> None:
        """Uncalibrated court allows 2D tracking and shuttle tracking, but suspends court metrics."""
        self.cal_context.state = CalibrationState.UNCALIBRATED
        caps = compute_capabilities(SceneState.COURT_PLAY, self.cal_context, self.evidence)

        # 2D tracking continues
        self.assertTrue(caps.can_track_player.enabled)
        self.assertIn("2D player detection", caps.can_track_player.reason)
        self.assertTrue(caps.can_track_shuttle.enabled)

        # Metric gates disabled
        self.assertFalse(caps.can_use_court_metric.enabled)
        self.assertIn("Court uncalibrated", caps.can_use_court_metric.reason)
        self.assertFalse(caps.can_build_heatmap.enabled)
        self.assertIn("Heatmap accumulation requires locked court metric", caps.can_build_heatmap.reason)
        self.assertFalse(caps.can_estimate_hit.enabled)
        self.assertIn("current-frame player pose and shuttle", caps.can_estimate_hit.reason)
        self.assertFalse(caps.can_write_canonical_match_data.enabled)

    def test_calibrated_court_play_all_gates_active(self) -> None:
        """Calibrated live play on locked court enables all 6 capability gates."""
        self.cal_context.accept(
            source=CalibrationSource.MANUAL,
            frame=10,
            timestamp_sec=0.333,
            corners=((100, 100), (900, 100), (900, 700), (100, 700)),
        )
        self.evidence.calibration_state = "CALIBRATED"
        self.evidence.calibration_confidence = 0.96

        caps = compute_capabilities(
            SceneState.COURT_PLAY,
            self.cal_context,
            self.evidence,
            image_space_hit_evidence=self.image_hit_evidence(),
        )

        self.assertTrue(caps.can_track_player.enabled)
        self.assertTrue(caps.can_track_shuttle.enabled)
        self.assertTrue(caps.can_use_court_metric.enabled)
        self.assertTrue(caps.can_build_heatmap.enabled)
        self.assertTrue(caps.can_estimate_hit.enabled)
        self.assertTrue(caps.can_write_canonical_match_data.enabled)
        self.assertGreaterEqual(caps.can_estimate_hit.confidence, 0.85)

    def test_court_idle_blocks_canonical_writes(self) -> None:
        """Court idle interval preserves court metric inspection but blocks canonical match data writes."""
        self.cal_context.accept(
            source=CalibrationSource.MANUAL,
            frame=10,
            timestamp_sec=0.333,
        )
        caps = compute_capabilities(SceneState.COURT_IDLE, self.cal_context, self.evidence)

        self.assertTrue(caps.can_use_court_metric.enabled)
        self.assertTrue(caps.can_build_heatmap.enabled)
        self.assertFalse(caps.can_write_canonical_match_data.enabled)
        self.assertIn("Court idle interval: excluded", caps.can_write_canonical_match_data.reason)

    def test_replay_blocks_metrics_and_canonical_writes(self) -> None:
        """Replay footage permits 2D tracking but strictly blocks metric and canonical writes."""
        self.cal_context.accept(
            source=CalibrationSource.MANUAL,
            frame=10,
            timestamp_sec=0.333,
        )
        self.evidence.is_replay_cue = True
        caps = compute_capabilities(
            SceneState.REPLAY,
            self.cal_context,
            self.evidence,
            image_space_hit_evidence=self.image_hit_evidence(),
        )

        self.assertTrue(caps.can_track_player.enabled)
        self.assertTrue(caps.can_track_shuttle.enabled)
        self.assertFalse(caps.can_use_court_metric.enabled)
        self.assertFalse(caps.can_build_heatmap.enabled)
        self.assertTrue(caps.can_estimate_hit.enabled)
        self.assertIn("readiness only", caps.can_estimate_hit.reason)
        self.assertFalse(caps.can_write_canonical_match_data.enabled)
        self.assertIn("Replay segment: canonical match writes prohibited", caps.can_write_canonical_match_data.reason)

    def test_close_up_disables_shuttle_and_court_metrics(self) -> None:
        """Close-up view tracks player 2D body, but disables shuttle trajectory and court metrics."""
        self.cal_context.accept(
            source=CalibrationSource.MANUAL,
            frame=10,
            timestamp_sec=0.333,
        )
        caps = compute_capabilities(SceneState.CLOSE_UP, self.cal_context, self.evidence)

        self.assertTrue(caps.can_track_player.enabled)
        self.assertFalse(caps.can_track_shuttle.enabled)
        self.assertIn("Close-up athlete view", caps.can_track_shuttle.reason)
        self.assertFalse(caps.can_use_court_metric.enabled)
        self.assertIn("Close-up perspective", caps.can_use_court_metric.reason)
        self.assertFalse(caps.can_build_heatmap.enabled)
        self.assertFalse(caps.can_write_canonical_match_data.enabled)

    def test_camera_transition_suspends_all_tracking(self) -> None:
        """Camera transition or hard cut temporarily suspends visual tracking and metric gates."""
        self.evidence.camera_cut_detected = True
        caps = compute_capabilities(
            SceneState.CAMERA_TRANSITION,
            self.cal_context,
            self.evidence,
            image_space_hit_evidence=self.image_hit_evidence(),
        )

        self.assertFalse(caps.can_track_player.enabled)
        self.assertFalse(caps.can_track_shuttle.enabled)
        self.assertFalse(caps.can_use_court_metric.enabled)
        self.assertFalse(caps.can_build_heatmap.enabled)
        self.assertFalse(caps.can_estimate_hit.enabled)
        self.assertFalse(caps.can_write_canonical_match_data.enabled)

    def test_side_play_hit_readiness_is_independent_of_calibration(self) -> None:
        self.cal_context.state = CalibrationState.UNCALIBRATED

        caps = compute_capabilities(
            SceneState.SIDE_PLAY,
            self.cal_context,
            self.evidence,
            image_space_hit_evidence=self.image_hit_evidence(),
        )

        self.assertTrue(caps.can_estimate_hit.enabled)
        self.assertIn("no hit/contact event", caps.can_estimate_hit.reason)
        self.assertFalse(caps.can_use_court_metric.enabled)
        self.assertFalse(caps.can_build_heatmap.enabled)
        self.assertFalse(caps.can_write_canonical_match_data.enabled)

    def test_uncalibrated_court_play_does_not_open_metric_gates_from_hit_readiness(self) -> None:
        caps = compute_capabilities(
            SceneState.COURT_PLAY,
            self.cal_context,
            self.evidence,
            image_space_hit_evidence=self.image_hit_evidence(),
        )

        self.assertTrue(caps.can_estimate_hit.enabled)
        self.assertFalse(caps.can_use_court_metric.enabled)
        self.assertFalse(caps.can_build_heatmap.enabled)
        self.assertFalse(caps.can_write_canonical_match_data.enabled)

    def test_tracker_feasibility_alone_does_not_enable_hit_readiness(self) -> None:
        caps = compute_capabilities(SceneState.COURT_PLAY, self.cal_context, self.evidence)

        self.assertTrue(caps.can_track_player.enabled)
        self.assertTrue(caps.can_track_shuttle.enabled)
        self.assertFalse(caps.can_estimate_hit.enabled)
        self.assertIn("current-frame player pose and shuttle", caps.can_estimate_hit.reason)

    def test_missing_stale_or_cross_segment_observation_fails_closed(self) -> None:
        invalid_cases = (
            ("missing player", {"player_state": "lost"}),
            ("predicted player", {"player_state": "predicted"}),
            ("stale pose", {"pose_age_frames": 1}),
            ("reused pose", {"pose_is_reused": True}),
            ("stale pose flag", {"pose_is_stale": True}),
            ("stale player frame", {"player_frame_index": 9}),
            ("old player segment", {"player_segment_id": "segment-previous"}),
            ("stale shuttle", {"shuttle_frame_index": 9}),
            ("old shuttle segment", {"shuttle_segment_id": "segment-previous"}),
            ("predicted shuttle", {"shuttle_state": "predicted"}),
            ("missing shuttle", {"shuttle_position_px": None}),
        )
        for label, overrides in invalid_cases:
            with self.subTest(label=label):
                caps = compute_capabilities(
                    SceneState.SIDE_PLAY,
                    self.cal_context,
                    self.evidence,
                    image_space_hit_evidence=self.image_hit_evidence(**overrides),
                )
                self.assertFalse(caps.can_estimate_hit.enabled)

    def test_invalid_shuttle_confidence_position_or_frame_dimensions_is_unavailable(self) -> None:
        invalid_cases = (
            {"shuttle_confidence": None},
            {"shuttle_confidence": float("nan")},
            {"shuttle_position_px": (1280.0, 90.0)},
            {"shuttle_position_px": (float("inf"), 90.0)},
            {"detection_confidence": float("nan")},
            {
                "pose_keypoints": ((100.0, 20.0, 0.9),)
                + tuple((10.0, 20.0, 0.9) for _ in range(16))
            },
            {"pose_keypoints": tuple((10.0, 20.0, 0.0) for _ in range(17))},
            {"frame_width": 0},
            {"frame_height": -1},
        )
        for overrides in invalid_cases:
            with self.subTest(overrides=overrides):
                caps = compute_capabilities(
                    SceneState.SIDE_PLAY,
                    self.cal_context,
                    self.evidence,
                    image_space_hit_evidence=self.image_hit_evidence(**overrides),
                )
                self.assertFalse(caps.can_estimate_hit.enabled)

    def test_camera_cut_and_unknown_block_image_evidence_readiness(self) -> None:
        image_evidence = self.image_hit_evidence()
        self.evidence.camera_cut_detected = True
        cut_caps = compute_capabilities(
            SceneState.SIDE_PLAY,
            self.cal_context,
            self.evidence,
            image_space_hit_evidence=image_evidence,
        )
        self.assertFalse(cut_caps.can_estimate_hit.enabled)
        self.evidence.camera_cut_detected = False

        unknown_caps = compute_capabilities(
            SceneState.UNKNOWN,
            self.cal_context,
            self.evidence,
            image_space_hit_evidence=image_evidence,
        )
        self.assertFalse(unknown_caps.can_estimate_hit.enabled)

    def test_recalibrating_reports_unavailable_reason(self) -> None:
        """When state is RECALIBRATING, calibration fields and metric gates report unavailable reason."""
        self.cal_context.begin_recalibration()
        fields = self.cal_context.frame_fields()
        self.assertEqual(fields["calibrationState"], "RECALIBRATING")
        self.assertIsNotNone(fields["calibrationUnavailableReason"])
        self.assertIn("Camera cut or motion drift", fields["calibrationUnavailableReason"])

        caps = compute_capabilities(SceneState.COURT_PLAY, self.cal_context, self.evidence)
        self.assertFalse(caps.can_use_court_metric.enabled)
        self.assertIn("recalibration in progress", caps.can_use_court_metric.reason.lower())


class TestCalibrationRecoveryAPI(unittest.TestCase):
    """API level tests for calibration recovery, stale correction rejection, and diagnostics."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.prior_store = server.analysis_job_store
        server.analysis_job_store = AnalysisJobStore(Path(self.temp_dir.name))
        self.client = TestClient(app)
        tracking_sessions.clear()

    def tearDown(self) -> None:
        tracking_sessions.clear()
        server.analysis_job_store = self.prior_store
        self.temp_dir.cleanup()

    def _register(self, session: TrackingSession) -> None:
        session.job_store.create_job(
            session.session_id,
            server._session_identity(session),
            server._session_job_metadata(session),
        )
        tracking_sessions[session.session_id] = session

    def test_stale_segment_correction_rejected(self) -> None:
        """Manual calibration targeting an older camera segment is rejected with HTTP 409."""
        session = TrackingSession(
            session_id="test_recovery_session",
            video_source="demo",
            game_type="doubles",
        )
        session.status = "PROCESSING"
        # Simulate segment 0 -> cut -> segment 1
        session.analyzer.calibration_context.start_camera_segment()
        active_segment = session.analyzer.calibration_context.camera_segment_id
        self.assertEqual(active_segment, "segment-1")

        self._register(session)

        # Attempt to calibrate using stale "segment-0"
        corners = [[100.0, 100.0], [1180.0, 100.0], [1180.0, 620.0], [100.0, 620.0]]
        res = self.client.post(
            "/api/tracking/sessions/test_recovery_session/calibration",
            json={
                "corners": corners,
                "game_type": "doubles",
                "camera_segment_id": "segment-0",
            },
        )
        self.assertEqual(res.status_code, 409)
        self.assertIn("Stale calibration correction", res.json()["detail"])
        self.assertIn("segment-0", res.json()["detail"])

    def test_stale_future_frame_rejected(self) -> None:
        """Manual correction referencing future frameIndex beyond current analysis is rejected."""
        session = TrackingSession(
            session_id="test_future_frame_session",
            video_source="demo",
            game_type="doubles",
        )
        session.status = "PROCESSING"
        session.analyzer.calibration_context.lose()
        session.analyzer.frame_count = 50
        self._register(session)

        corners = [[100.0, 100.0], [1180.0, 100.0], [1180.0, 620.0], [100.0, 620.0]]
        res = self.client.post(
            "/api/tracking/sessions/test_future_frame_session/calibration",
            json={
                "corners": corners,
                "game_type": "doubles",
                "camera_segment_id": session.analyzer.calibration_context.camera_segment_id,
                "frame_index": 200,  # 200 > current 50
            },
        )
        self.assertEqual(res.status_code, 409)
        self.assertIn("exceeds currently analyzed frame", res.json()["detail"])

    def test_valid_recovery_relocks_segment(self) -> None:
        """Valid manual calibration referencing active segment restores CALIBRATED state."""
        session = TrackingSession(
            session_id="test_valid_relock_session",
            video_source="demo",
            game_type="doubles",
        )
        session.status = "PROCESSING"
        session.analyzer.frame_count = 50
        session.analyzer.calibration_context.lose()
        self._register(session)

        corners = [[100.0, 100.0], [1180.0, 100.0], [1180.0, 620.0], [100.0, 620.0]]
        active_seg = session.analyzer.calibration_context.camera_segment_id
        session.results.append({
            "frameIndex": 10, "timestampSec": 10 / 30, "cameraSegmentId": active_seg,
        })
        res = self.client.post(
            "/api/tracking/sessions/test_valid_relock_session/calibration",
            json={
                "corners": corners,
                "game_type": "doubles",
                "camera_segment_id": active_seg,
                "frame_index": 10,
                "timestamp_sec": 10 / 30,
                "calibration_version": "v1.0",
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["calibrationState"], "CALIBRATED")
        self.assertEqual(data["cameraSegmentId"], active_seg)


if __name__ == "__main__":
    unittest.main()
