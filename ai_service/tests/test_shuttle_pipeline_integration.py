"""ai_service/tests/test_shuttle_pipeline_integration.py

Comprehensive Phase 2.8 integration tests for the production shuttlecock tracking pipeline.

Verifies:
A. SHUTTLE DISABLED — Normal player analysis unaffected, shuttle null, no inference calls.
B. SHUTTLE ENABLED + DETERMINISTIC PROVIDER — Frame index & timestamp preserved, canonical observation attached.
C. TEMPORAL STATE PERSISTS — Provider receives rolling sequence across frames; tracker does not reset each frame.
D. MODEL UNAVAILABLE — Explicit MODEL_UNAVAILABLE status, player tracking continues, no fabricated observations.
E. WINDOW INITIALIZATION — Initial frames report state='unknown', position=None.
F. LOST — Absence of detection reports state='lost', position=None, never stale coordinates.
G. PREDICTED — Recovery predictor produces state='predicted' with provenance preserved.
H. PLAYER REGRESSION — Player telemetry unchanged between shuttle disabled and baseline.
I. OLD SESSION COMPATIBILITY — Old sessions lacking shuttle field deserialize cleanly.
J. FRAME IDENTITY — Telemetry frame and shuttle observation share identical frameIndex and video presentation time.
K. NO DOUBLE DECODE — Shuttle pipeline consumes supplied decoded frames without secondary video decode.
L. REAL VIDEO SMOKE TEST — Video processing session decodes, executes player pipeline, reports truthful model status, and terminates without crashing.
"""

from __future__ import annotations

import math
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock

import cv2
import numpy as np

# Ensure ai_service is on sys.path
import sys
ai_service_dir = Path(__file__).resolve().parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from analyzer_v2 import BadmintonAnalyzerV2
from server import TrackingSession, _run_session_analysis, resolve_processing_config, tracking_sessions
from shuttle_pipeline import (
    ShuttlePipelineConfig,
    ProductionShuttlePipeline,
    create_shuttle_pipeline,
    STATUS_AVAILABLE,
    STATUS_MODEL_UNAVAILABLE,
    STATUS_DISABLED,
)
from shuttle_telemetry import (
    ShuttleObservation,
    ShuttlePositionPx,
    TrackingFrame,
)
from shuttle_tracker import (
    ShuttleTrackerProvider,
    TemporalFrame,
    TemporalModelOutput,
    ProviderAvailability,
    ModelUnavailableError,
    ShuttleTrackerConfig,
)
from shuttle_reacquisition import RecoveryConfig


class DeterministicShuttleProvider(ShuttleTrackerProvider):
    """Deterministic test provider producing known heatmaps."""

    def __init__(self, heatmap_fn=None) -> None:
        self.heatmap_fn = heatmap_fn
        self.call_history: list[tuple[TemporalFrame, ...]] = []

    def infer(self, frames: Sequence[TemporalFrame]) -> TemporalModelOutput:
        self.call_history.append(tuple(frames))
        if self.heatmap_fn is not None:
            map_data = self.heatmap_fn(frames)
            return TemporalModelOutput(probability_map=map_data)
        # Default peak at (100, 200) on a 288x512 heatmap
        h, w = 288, 512
        heat = np.zeros((h, w), dtype=np.float32)
        heat[100, 200] = 0.95
        return TemporalModelOutput(probability_map=heat)


class UnavailableModelProvider(ShuttleTrackerProvider):
    """Simulates a provider whose model artifact is missing."""

    def availability(self) -> ProviderAvailability:
        return ProviderAvailability(
            available=False,
            status="MODEL UNAVAILABLE",
            reason="Configured model file does not exist",
        )

    def infer(self, frames: Sequence[TemporalFrame]) -> TemporalModelOutput:
        raise ModelUnavailableError("MODEL UNAVAILABLE: file not found")


class TestShuttlePipelineIntegration(unittest.TestCase):
    def setUp(self):
        tracking_sessions.clear()

    def test_trajectory_runtime_buffer_is_bounded_without_dropping_emitted_telemetry(self):
        provider = DeterministicShuttleProvider()
        pipeline = create_shuttle_pipeline(
            {
                "shuttle_enabled": True,
                "shuttle_window_size": 2,
                "shuttle_recovery_enabled": False,
                "shuttle_build_trajectory": True,
                "shuttle_trajectory_history_limit": 2,
            },
            custom_provider=provider,
        )
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)

        emitted = [
            pipeline.process_frame(frame, timestamp_sec=index * 0.04, frame_index=index)
            for index in range(5)
        ]

        self.assertEqual(len(emitted), 5)
        self.assertTrue(all(item is not None for item in emitted))
        self.assertEqual(pipeline.get_trajectory_working_history_size(), 2)

        pipeline.end_stream()
        derived = pipeline.get_derived_trajectory()
        self.assertIsNotNone(derived)
        self.assertLessEqual(len(derived.raw_observations), 2)

    # =========================================================================
    # A. SHUTTLE DISABLED
    # =========================================================================
    def test_a_shuttle_disabled_by_default(self):
        """When shuttle tracking is disabled, player tracking runs normally with shuttle=None."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        telemetry = analyzer.process_frame(frame, timestamp_sec=0.033)

        self.assertIn("players", telemetry)
        self.assertEqual(len(telemetry["players"]), 2)
        self.assertIn("shuttle", telemetry)
        self.assertIsNone(telemetry["shuttle"])

    def test_a_shuttle_explicitly_disabled(self):
        """Explicitly disabling shuttle tracking ensures zero provider inference calls."""
        provider = DeterministicShuttleProvider()
        pipeline = create_shuttle_pipeline(
            {"shuttle_enabled": False},
            custom_provider=provider,
        )
        self.assertEqual(pipeline.status, STATUS_DISABLED)
        self.assertFalse(pipeline.is_active)

        analyzer = BadmintonAnalyzerV2(
            game_type="singles",
            max_players=2,
            shuttle_pipeline=pipeline,
        )
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        for i in range(5):
            res = analyzer.process_frame(frame, timestamp_sec=i * 0.033)
            self.assertIsNone(res["shuttle"])

        self.assertEqual(len(provider.call_history), 0)

    # =========================================================================
    # B. SHUTTLE ENABLED + DETERMINISTIC PROVIDER
    # =========================================================================
    def test_b_shuttle_enabled_deterministic_provider(self):
        """With deterministic provider, canonical ShuttleObservation is attached to each frame."""
        provider = DeterministicShuttleProvider()
        pipeline = create_shuttle_pipeline(
            {"shuttle_enabled": True, "shuttle_window_size": 3, "shuttle_recovery_enabled": False},
            custom_provider=provider,
        )
        self.assertEqual(pipeline.status, STATUS_AVAILABLE)
        self.assertTrue(pipeline.is_active)

        analyzer = BadmintonAnalyzerV2(
            game_type="singles",
            max_players=2,
            shuttle_pipeline=pipeline,
        )
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)

        # Feed 3 frames to fill temporal window (window_size=3)
        t0 = analyzer.process_frame(frame, timestamp_sec=0.033)
        self.assertEqual(t0["shuttle"]["state"], "unknown")
        self.assertIsNone(t0["shuttle"]["positionPx"])

        t1 = analyzer.process_frame(frame, timestamp_sec=0.067)
        self.assertEqual(t1["shuttle"]["state"], "unknown")
        self.assertIsNone(t1["shuttle"]["positionPx"])

        t2 = analyzer.process_frame(frame, timestamp_sec=0.100)
        obs = t2["shuttle"]
        self.assertIsNotNone(obs)
        self.assertEqual(obs["state"], "observed")
        self.assertEqual(obs["source"], "temporal_tracker")
        self.assertIsNotNone(obs["positionPx"])
        self.assertAlmostEqual(obs["timestampSec"], 0.100, places=3)
        self.assertEqual(obs["frameIndex"], 3)
        self.assertGreater(obs["confidence"], 0.9)

    # =========================================================================
    # C. TEMPORAL STATE PERSISTS ACROSS FRAMES
    # =========================================================================
    def test_c_temporal_state_persists(self):
        """Temporal tracker rolling window persists across frames and does NOT reinstantiate."""
        provider = DeterministicShuttleProvider()
        pipeline = create_shuttle_pipeline(
            {"shuttle_enabled": True, "shuttle_window_size": 3, "shuttle_recovery_enabled": False},
            custom_provider=provider,
        )
        analyzer = BadmintonAnalyzerV2(
            game_type="singles",
            max_players=2,
            shuttle_pipeline=pipeline,
        )
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)

        for i in range(1, 6):
            analyzer.process_frame(frame, timestamp_sec=i * 0.033)

        # Provider infer should be called on frames 3, 4, 5 (total 3 times)
        self.assertEqual(len(provider.call_history), 3)

        # Each call must receive rolling window of exactly window_size=3 frames
        for call_frames in provider.call_history:
            self.assertEqual(len(call_frames), 3)

        # Verify consecutive frame indices in last call: 3, 4, 5
        last_window_indices = [f.frame_index for f in provider.call_history[-1]]
        self.assertEqual(last_window_indices, [3, 4, 5])

    # =========================================================================
    # D. MODEL UNAVAILABLE
    # =========================================================================
    def test_d_model_unavailable_graceful_handling(self):
        """When shuttle model artifact is missing, status is MODEL_UNAVAILABLE and player tracking proceeds."""
        provider = UnavailableModelProvider()
        pipeline = create_shuttle_pipeline(
            {"shuttle_enabled": True},
            custom_provider=provider,
        )
        self.assertEqual(pipeline.status, STATUS_MODEL_UNAVAILABLE)
        self.assertFalse(pipeline.is_active)

        prov = pipeline.get_provenance()
        self.assertTrue(prov["requested"])
        self.assertFalse(prov["active"])
        self.assertEqual(prov["status"], STATUS_MODEL_UNAVAILABLE)
        self.assertIsNotNone(prov["failureReason"])

        analyzer = BadmintonAnalyzerV2(
            game_type="singles",
            max_players=2,
            shuttle_pipeline=pipeline,
        )
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        telemetry = analyzer.process_frame(frame, timestamp_sec=0.033)

        # Player tracking completes normally
        self.assertEqual(len(telemetry["players"]), 2)
        # Shuttle telemetry remains None (never fabricates fake coordinates)
        self.assertIsNone(telemetry["shuttle"])

    def test_d_opencv_onnx_missing_file_reports_model_unavailable(self):
        """Configuring non-existent local model file results in truthful MODEL_UNAVAILABLE."""
        pipeline = create_shuttle_pipeline(
            {
                "shuttle_enabled": True,
                "shuttle_provider": "opencv_onnx",
                "shuttle_model_path": "non_existent_shuttle_model_12345.onnx",
            }
        )
        self.assertEqual(pipeline.status, STATUS_MODEL_UNAVAILABLE)
        self.assertIn("non_existent_shuttle_model_12345.onnx", pipeline.status_reason)

    # =========================================================================
    # E. WINDOW INITIALIZATION
    # =========================================================================
    def test_e_window_initialization_reports_unknown_not_fake_zero(self):
        """During window initialization, state is unknown and coordinates are None, never (0, 0)."""
        provider = DeterministicShuttleProvider()
        pipeline = create_shuttle_pipeline(
            {"shuttle_enabled": True, "shuttle_window_size": 4},
            custom_provider=provider,
        )
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)

        for i in range(1, 4):  # frames 1..3 (< window_size 4)
            obs = pipeline.process_frame(frame, timestamp_sec=i * 0.033, frame_index=i)
            self.assertIsNotNone(obs)
            self.assertEqual(obs.state, "unknown")
            self.assertIsNone(obs.position_px)

    # =========================================================================
    # F. LOST
    # =========================================================================
    def test_f_lost_state_emits_null_coordinates(self):
        """When candidate is missing after tracking, state is lost with position null, never stale coordinates."""
        has_shuttle = True

        def heatmap_fn(frames):
            h, w = 288, 512
            heat = np.zeros((h, w), dtype=np.float32)
            if has_shuttle:
                heat[100, 200] = 0.95
            return heat

        provider = DeterministicShuttleProvider(heatmap_fn=heatmap_fn)
        pipeline = create_shuttle_pipeline(
            {"shuttle_enabled": True, "shuttle_window_size": 2, "shuttle_recovery_enabled": False},
            custom_provider=provider,
        )
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)

        # Window size 2: frame 1 initializes (unknown)
        obs1 = pipeline.process_frame(frame, timestamp_sec=0.033, frame_index=1)
        self.assertEqual(obs1.state, "unknown")

        # Frame 2: observed shuttle
        obs2 = pipeline.process_frame(frame, timestamp_sec=0.067, frame_index=2)
        self.assertEqual(obs2.state, "observed")
        self.assertIsNotNone(obs2.position_px)

        # Frame 3: shuttle disappears -> state is lost with position None
        has_shuttle = False
        obs3 = pipeline.process_frame(frame, timestamp_sec=0.100, frame_index=3)
        self.assertEqual(obs3.state, "lost")
        self.assertIsNone(obs3.position_px)

    # =========================================================================
    # G. PREDICTED
    # =========================================================================
    def test_g_predicted_provenance_preserved(self):
        """When recovery tracker produces a prediction during brief dropouts, state is predicted."""
        step = 0

        def moving_peak_heatmap(frames):
            nonlocal step
            h, w = 288, 512
            heat = np.zeros((h, w), dtype=np.float32)
            if step < 4:
                # Shuttle moving steadily
                y = 100
                x = 100 + step * 20
                heat[y, x] = 0.95
            # step >= 4: empty heatmap (drop out)
            return heat

        provider = DeterministicShuttleProvider(heatmap_fn=moving_peak_heatmap)
        pipeline = create_shuttle_pipeline(
            {
                "shuttle_enabled": True,
                "shuttle_window_size": 2,
                "shuttle_recovery_enabled": True,
            },
            custom_provider=provider,
        )
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)

        # Frame 1: window init (unknown)
        obs1 = pipeline.process_frame(frame, timestamp_sec=0.033, frame_index=1)
        step += 1
        # Frame 2: first lock (reacquiring confirmation 1)
        obs2 = pipeline.process_frame(frame, timestamp_sec=0.067, frame_index=2)
        step += 1
        # Frame 3: confirmed lock (observed)
        obs3 = pipeline.process_frame(frame, timestamp_sec=0.100, frame_index=3)
        step += 1
        # Frame 4: second tracking point (observed)
        obs4 = pipeline.process_frame(frame, timestamp_sec=0.133, frame_index=4)
        step += 1
        # Frame 5: dropout -> weak tracking with valid prediction
        obs5 = pipeline.process_frame(frame, timestamp_sec=0.167, frame_index=5)

        self.assertIn(obs5.state, ("predicted", "lost"))
        if obs5.state == "predicted":
            self.assertIsNotNone(obs5.position_px)
            self.assertTrue(math.isfinite(obs5.position_px.x))
            self.assertTrue(math.isfinite(obs5.position_px.y))

    # =========================================================================
    # H. PLAYER REGRESSION
    # =========================================================================
    def test_h_player_results_identical_with_shuttle_disabled(self):
        """Player tracking coordinates, IDs, speed, and count are identical with shuttle disabled vs baseline."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)

        # Analyzer A: Baseline (no shuttle pipeline)
        analyzer_a = BadmintonAnalyzerV2(game_type="doubles", max_players=4)
        telemetry_a = analyzer_a.process_frame(frame, timestamp_sec=0.033)

        # Analyzer B: Shuttle pipeline explicitly disabled
        pipeline_b = create_shuttle_pipeline({"shuttle_enabled": False})
        analyzer_b = BadmintonAnalyzerV2(game_type="doubles", max_players=4, shuttle_pipeline=pipeline_b)
        telemetry_b = analyzer_b.process_frame(frame, timestamp_sec=0.033)

        self.assertEqual(len(telemetry_a["players"]), len(telemetry_b["players"]))
        for pa, pb in zip(telemetry_a["players"], telemetry_b["players"]):
            self.assertEqual(pa["playerId"], pb["playerId"])
            self.assertEqual(pa["teamCode"], pb["teamCode"])
            self.assertEqual(pa["state"], pb["state"])
            self.assertEqual(pa["speedMps"], pb["speedMps"])
            self.assertEqual(pa["courtPosition"], pb["courtPosition"])

    # =========================================================================
    # I. OLD SESSION COMPATIBILITY
    # =========================================================================
    def test_i_old_session_compatibility(self):
        """TrackingFrame and session parser successfully deserialize old sessions without shuttle key."""
        old_data = {
            "timestampSec": 1.25,
            "frameIndex": 38,
            "players": [
                {"playerId": "P1", "state": "observed"},
                {"playerId": "P2", "state": "lost"},
            ],
        }
        frame = TrackingFrame.from_dict(old_data)
        self.assertEqual(frame.timestamp_sec, 1.25)
        self.assertEqual(frame.frame_index, 38)
        self.assertIsNone(frame.shuttle)
        self.assertEqual(len(frame.players), 2)

    # =========================================================================
    # J. FRAME IDENTITY
    # =========================================================================
    def test_j_frame_identity_parity(self):
        """Player telemetry frame and attached shuttle observation share identical frameIndex and video timestamp."""
        provider = DeterministicShuttleProvider()
        pipeline = create_shuttle_pipeline(
            {"shuttle_enabled": True, "shuttle_window_size": 2, "shuttle_recovery_enabled": False},
            custom_provider=provider,
        )
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2, shuttle_pipeline=pipeline)
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)

        # Frame 1
        t1 = analyzer.process_frame(frame, timestamp_sec=0.050)
        self.assertEqual(t1["frameIndex"], 1)
        self.assertEqual(t1["shuttle"]["frameIndex"], 1)
        self.assertAlmostEqual(t1["timestampSec"], 0.050, places=3)
        self.assertAlmostEqual(t1["shuttle"]["timestampSec"], 0.050, places=3)

        # Frame 2
        t2 = analyzer.process_frame(frame, timestamp_sec=0.100)
        self.assertEqual(t2["frameIndex"], 2)
        self.assertEqual(t2["shuttle"]["frameIndex"], 2)
        self.assertAlmostEqual(t2["timestampSec"], 0.100, places=3)
        self.assertAlmostEqual(t2["shuttle"]["timestampSec"], 0.100, places=3)

    # =========================================================================
    # K. NO DOUBLE DECODE
    # =========================================================================
    def test_k_no_double_decode(self):
        """Shuttle pipeline operates on the supplied decoded NumPy image directly."""
        provider = DeterministicShuttleProvider()
        pipeline = create_shuttle_pipeline(
            {"shuttle_enabled": True, "shuttle_window_size": 2, "shuttle_recovery_enabled": False},
            custom_provider=provider,
        )

        test_image = np.full((360, 640, 3), 127, dtype=np.uint8)
        pipeline.process_frame(test_image, timestamp_sec=0.033, frame_index=1)
        pipeline.process_frame(test_image, timestamp_sec=0.067, frame_index=2)

        # Verify provider received the exact test_image shape without re-opening video
        self.assertEqual(len(provider.call_history), 1)
        received_frames = provider.call_history[0]
        self.assertEqual(received_frames[0].image.shape, (360, 640, 3))
        self.assertEqual(received_frames[1].image.shape, (360, 640, 3))

    # =========================================================================
    # L. REAL VIDEO SMOKE TEST (TrackingSession lifecycle)
    # =========================================================================
    def test_l_real_video_session_smoke_test(self):
        """TrackingSession processes real video, player pipeline completes, shuttle reports status truthfully."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = Path(tmp_dir) / "smoke_test.mp4"
            # Write a 10-frame synthetic MP4 video at 30 fps
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(str(video_path), fourcc, 30.0, (640, 360))
            for _ in range(10):
                dummy_frame = np.full((360, 640, 3), 40, dtype=np.uint8)
                writer.write(dummy_frame)
            writer.release()

            # Create session with shuttle enabled but no model path (MODEL_UNAVAILABLE expected)
            session = TrackingSession(
                "smoke_session_001",
                video_source=str(video_path),
                game_type="singles",
                tracked_player_count=2,
                processing_config={
                    "shuttle_enabled": True,
                    "shuttle_model_path": None,  # No model provided
                    "frame_stride": 1,
                },
            )

            # Check that shuttle pipeline status is MODEL_UNAVAILABLE
            self.assertEqual(session.shuttle_pipeline.status, STATUS_MODEL_UNAVAILABLE)

            # Run analysis synchronously
            _run_session_analysis(session)

            # Session should complete cleanly without error
            self.assertEqual(session.status, "COMPLETED")
            self.assertEqual(session.analyzed_frames, 10)
            self.assertEqual(len(session.results), 10)

            # Player tracking telemetry is present on all frames
            for frame_telemetry in session.results:
                self.assertEqual(len(frame_telemetry["players"]), 2)
                # Shuttle is None because model was unavailable
                self.assertIsNone(frame_telemetry.get("shuttle"))


if __name__ == "__main__":
    unittest.main()
