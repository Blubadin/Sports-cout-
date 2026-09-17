import unittest
import numpy as np
import sys
from pathlib import Path

# Add ai_service to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2
from server import TrackingSession, get_session_status, get_session_results, tracking_sessions


class TestLiveTelemetryAndSessionStatus(unittest.TestCase):
    def setUp(self):
        tracking_sessions.clear()

    def test_session_status_expanded_fields(self):
        """Phase 3.9: Verify all required typed session status fields exist and adhere to spec."""
        session_id = "test_status_sess_1"
        session = TrackingSession(session_id, game_type="singles", tracked_player_count=2)
        tracking_sessions[session_id] = session

        status = get_session_status(session_id)

        required_fields = [
            "sessionId",
            "status",
            "progressPct",
            "currentFrame",
            "totalFrames",
            "analyzedFrames",
            "frameStride",
            "elapsedSec",
            "videoDurationSec",
            "lastTelemetryTimestampSec",
            "sourceFps",
            "samplingFps",
            "analysisFps",
            "trackedPlayerCount",
            "device",
            "players",
            "error",
        ]
        for field in required_fields:
            self.assertIn(field, status, f"Missing required field {field} in session status")

        self.assertEqual(status["sessionId"], session_id)
        self.assertEqual(status["trackedPlayerCount"], 2)
        self.assertEqual(status["frameStride"], 2)
        self.assertIsInstance(status["players"], list)
        self.assertEqual(len(status["players"]), 2)

    def test_fps_definitions_and_zero_protection(self):
        """Phase 3.9: Verify sourceFps, samplingFps, and analysisFps definitions and zero protection."""
        session_id = "test_fps_sess"
        session = TrackingSession(session_id, game_type="doubles", tracked_player_count=4)
        session.source_fps = 60.0
        session.frame_stride = 2
        session.analyzed_frames = 120
        session.elapsed_sec = 10.0
        tracking_sessions[session_id] = session

        status = get_session_status(session_id)
        # sourceFps: nominal source video FPS
        self.assertEqual(status["sourceFps"], 60.0)
        # samplingFps: effective source sampling rate (sourceFps / frameStride = 60 / 2 = 30)
        self.assertEqual(status["samplingFps"], 30.0)
        # analysisFps: actual AI processing throughput (analyzedFrames / elapsedSec = 120 / 10 = 12)
        self.assertEqual(status["analysisFps"], 12.0)

        # Zero elapsedSec protection
        session.elapsed_sec = 0.0
        session.analyzed_frames = 0
        status_zero = get_session_status(session_id)
        self.assertEqual(status_zero["analysisFps"], 0.0)

    def test_live_player_statuses_canonical_contract(self):
        """Phase 3.10: Live player metrics contract."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        statuses = analyzer.get_live_player_statuses()

        self.assertEqual(len(statuses), 2)
        p1 = statuses[0]
        self.assertEqual(p1["playerId"], "P1")
        self.assertIn("trackId", p1)
        self.assertIn("totalDistanceM", p1)
        self.assertIn("currentSpeedMps", p1)
        self.assertIn("trackingState", p1)
        self.assertIn("detectionConfidence", p1)
        self.assertIn(p1["trackingState"], ["observed", "predicted", "lost"])

    def test_incremental_results_cursor(self):
        """Phase 3.11: Incremental bounded results with cursor parameter."""
        session_id = "test_cursor_sess"
        session = TrackingSession(session_id, game_type="singles", tracked_player_count=2)
        tracking_sessions[session_id] = session

        # Simulate 5 telemetry frames
        for i in range(5):
            session.results.append({
                "schemaVersion": 1,
                "analysisId": session_id,
                "timestampSec": round(i * 0.1, 2),
                "frameIndex": i + 1,
                "players": [],
            })

        # Fetch without cursor (returns all)
        res_all = get_session_results(session_id)
        self.assertEqual(res_all["sampleCount"], 5)
        self.assertEqual(res_all["totalSampleCount"], 5)
        self.assertEqual(res_all["nextCursor"], 5)
        self.assertEqual(len(res_all["telemetry"]), 5)

        # Fetch with cursor after=3 (should return frames at index 3 and 4 -> 2 items)
        res_after = get_session_results(session_id, after=3)
        self.assertEqual(res_after["sampleCount"], 2)
        self.assertEqual(res_after["totalSampleCount"], 5)
        self.assertEqual(res_after["nextCursor"], 5)
        self.assertEqual(len(res_after["telemetry"]), 2)
        self.assertEqual(res_after["telemetry"][0]["frameIndex"], 4)
        self.assertEqual(res_after["telemetry"][1]["frameIndex"], 5)

        # Fetch with cursor after=5 (no new items)
        res_empty = get_session_results(session_id, after=5)
        self.assertEqual(res_empty["sampleCount"], 0)
        self.assertEqual(res_empty["totalSampleCount"], 5)
        self.assertEqual(res_empty["nextCursor"], 5)
        self.assertEqual(len(res_empty["telemetry"]), 0)


if __name__ == "__main__":
    unittest.main()
