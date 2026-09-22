"""
ai_service/tests/test_shuttle_telemetry.py

Unit tests for Phase 2.1 Canonical Shuttlecock Telemetry Contract in Python:
1. Observed position with fresh measurement
2. Predicted position (tracker extrapolation)
3. Interpolated position (derived between observations)
4. Lost position (null coordinates)
5. Unknown state (null coordinates)
6. Missing coordinates handling
7. Measured coordinate (0, 0) is valid when actually measured
8. Unknown / lost state with fake (0, 0) is rejected
9. Backward compatibility: old session without shuttle loads safely
10. Full JSON serialization / deserialization roundtrip
11. ShuttleRunConfig benchmark provenance
"""

import json
import unittest

from ai_service.shuttle_telemetry import (
    ShuttleObservation,
    ShuttlePositionPx,
    ShuttleRunConfig,
    ShuttleVelocityPx,
    TrackingFrame,
)


class TestShuttleTelemetryContract(unittest.TestCase):
    def test_observed_position_valid(self):
        """1. Observed position requires valid coordinates."""
        obs = ShuttleObservation(
            timestamp_sec=1.45,
            frame_index=43,
            state="observed",
            source="temporal_tracker",
            position_px=ShuttlePositionPx(x=960.5, y=340.2),
            confidence=0.94,
            trajectory_id="traj_01",
            velocity_px_per_sec=ShuttleVelocityPx(vx=-120.5, vy=450.0),
            speed_px_per_sec=465.8,
        )
        self.assertEqual(obs.validate(), [])
        self.assertEqual(obs.position_px.x, 960.5)
        self.assertEqual(obs.position_px.y, 340.2)

        # Missing position_px for observed must fail
        invalid_obs = ShuttleObservation(
            timestamp_sec=1.45,
            frame_index=43,
            state="observed",
            source="temporal_tracker",
            position_px=None,
        )
        errors = invalid_obs.validate()
        self.assertTrue(any("observed state requires a valid positionPx" in err for err in errors))

    def test_predicted_position(self):
        """2. Predicted position represents tracker estimate."""
        obs = ShuttleObservation(
            timestamp_sec=1.483,
            frame_index=44,
            state="predicted",
            source="temporal_tracker",
            position_px=ShuttlePositionPx(x=955.0, y=360.0),
            confidence=0.72,
            trajectory_id="traj_01",
        )
        self.assertEqual(obs.validate(), [])

    def test_interpolated_position(self):
        """3. Interpolated position represents smoothed / derived point."""
        obs = ShuttleObservation(
            timestamp_sec=1.516,
            frame_index=45,
            state="interpolated",
            source="model_assisted",
            position_px=ShuttlePositionPx(x=950.0, y=380.0),
            confidence=0.85,
        )
        self.assertEqual(obs.validate(), [])

    def test_lost_position(self):
        """4. Lost position has None coordinates."""
        obs = ShuttleObservation(
            timestamp_sec=2.1,
            frame_index=63,
            state="lost",
            source="temporal_tracker",
            position_px=None,
            confidence=None,
        )
        self.assertEqual(obs.validate(), [])

    def test_unknown_state(self):
        """5. Unknown state has None coordinates."""
        obs = ShuttleObservation(
            timestamp_sec=0.0,
            frame_index=0,
            state="unknown",
            source="unknown",
            position_px=None,
        )
        self.assertEqual(obs.validate(), [])

    def test_missing_coordinates(self):
        """6. Missing coordinates remain None."""
        obs = ShuttleObservation(
            timestamp_sec=0.1,
            frame_index=3,
            state="lost",
        )
        self.assertIsNone(obs.position_px)
        self.assertIsNone(obs.confidence)
        self.assertEqual(obs.validate(), [])

    def test_measured_zero_is_valid(self):
        """7. Measured coordinate (0, 0) at top-left is valid when actually measured."""
        obs = ShuttleObservation(
            timestamp_sec=3.2,
            frame_index=96,
            state="observed",
            source="manual",
            position_px=ShuttlePositionPx(x=0.0, y=0.0),
            confidence=1.0,
        )
        self.assertEqual(obs.validate(), [])
        self.assertEqual(obs.position_px.x, 0.0)
        self.assertEqual(obs.position_px.y, 0.0)

        pred = ShuttleObservation(
            timestamp_sec=3.233,
            frame_index=97,
            state="predicted",
            source="temporal_tracker",
            position_px=ShuttlePositionPx(x=0.0, y=0.0),
        )
        self.assertEqual(pred.validate(), [])

    def test_unknown_or_lost_with_fake_zero_rejected(self):
        """8. Unknown or lost with fake zero (0, 0) is rejected."""
        fake_zero_lost = ShuttleObservation(
            timestamp_sec=4.0,
            frame_index=120,
            state="lost",
            source="temporal_tracker",
            position_px=ShuttlePositionPx(x=0.0, y=0.0),
        )
        errors = fake_zero_lost.validate()
        self.assertTrue(any("fake zero (0, 0)" in err for err in errors))

        fake_zero_unknown = ShuttleObservation(
            timestamp_sec=4.033,
            frame_index=121,
            state="unknown",
            source="unknown",
            position_px=ShuttlePositionPx(x=0.0, y=0.0),
        )
        errors = fake_zero_unknown.validate()
        self.assertTrue(any("fake zero (0, 0)" in err for err in errors))

    def test_backward_compatibility_old_session(self):
        """9. Legacy session dictionary without 'shuttle' key loads safely with shuttle=None."""
        legacy_dict = {
            "schemaVersion": 1,
            "timestampSec": 10.5,
            "frameIndex": 315,
            "players": [
                {"playerId": "P1", "trackId": 1, "state": "observed"},
                {"playerId": "P2", "trackId": 2, "state": "observed"},
            ],
        }
        frame = TrackingFrame.from_dict(legacy_dict)
        self.assertEqual(frame.timestamp_sec, 10.5)
        self.assertEqual(frame.frame_index, 315)
        self.assertEqual(len(frame.players), 2)
        # Shuttle field must be None without raising any error
        self.assertIsNone(frame.shuttle)

    def test_serialization_roundtrip(self):
        """10. JSON serialization and deserialization preserves all values and nulls."""
        obs = ShuttleObservation(
            timestamp_sec=5.0,
            frame_index=150,
            state="observed",
            source="temporal_tracker",
            position_px=ShuttlePositionPx(x=1024.0, y=512.0),
            confidence=0.91,
            trajectory_id="rally_03",
            velocity_px_per_sec=ShuttleVelocityPx(vx=50.0, vy=-200.0),
            speed_px_per_sec=206.15,
        )
        frame = TrackingFrame(
            timestamp_sec=5.0,
            frame_index=150,
            players=[{"playerId": "P1"}],
            shuttle=obs,
        )

        d = frame.to_dict()
        json_str = json.dumps(d)
        restored_dict = json.loads(json_str)

        restored_frame = TrackingFrame.from_dict(restored_dict)
        self.assertEqual(restored_frame.timestamp_sec, 5.0)
        self.assertIsNotNone(restored_frame.shuttle)
        self.assertEqual(restored_frame.shuttle.position_px.x, 1024.0)
        self.assertEqual(restored_frame.shuttle.position_px.y, 512.0)
        self.assertEqual(restored_frame.shuttle.velocity_px_per_sec.vy, -200.0)
        self.assertEqual(restored_frame.shuttle.validate(), [])

    def test_shuttle_run_config(self):
        """11. ShuttleRunConfig exposes model, version, window size, auxiliary detector."""
        cfg = ShuttleRunConfig(
            tracker_model="tracknet_v2",
            tracker_version="2.1.0",
            window_size=3,
            input_width=512,
            input_height=288,
            confidence_threshold=0.5,
            device="cuda",
            runtime="tensorrt",
            precision="fp16",
            auxiliary_detector="yolov8x-shuttle",
        )
        d = cfg.to_dict()
        self.assertEqual(d["trackerModel"], "tracknet_v2")
        self.assertEqual(d["windowSize"], 3)
        self.assertEqual(d["precision"], "fp16")
        self.assertEqual(d["auxiliaryDetector"], "yolov8x-shuttle")

        restored = ShuttleRunConfig.from_dict(d)
        self.assertEqual(restored.tracker_model, "tracknet_v2")
        self.assertEqual(restored.window_size, 3)
        self.assertEqual(restored.auxiliary_detector, "yolov8x-shuttle")


if __name__ == "__main__":
    unittest.main()
