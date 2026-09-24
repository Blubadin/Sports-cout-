import unittest
from pathlib import Path
import sys

# Ensure scripts and ai_service are on path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "ai_service"))

from run_real_shuttle_smoke import (
    compute_observed_confidence_stats,
    summarize_smoke_report,
)
from shuttle_pipeline import ShuttleObservation


class TestRealShuttleSmokeReport(unittest.TestCase):
    def test_observed_confidence_stats_empty(self):
        obs = [
            ShuttleObservation(
                timestamp_sec=0.1,
                frame_index=3,
                state="lost",
                source="temporal_tracker",
                position_px=None,
                confidence=None,
            ),
            ShuttleObservation(
                timestamp_sec=0.2,
                frame_index=6,
                state="unknown",
                source="temporal_tracker",
                position_px=None,
                confidence=None,
            ),
        ]
        stats = compute_observed_confidence_stats(obs)
        self.assertEqual(stats["count"], 0)
        self.assertIsNone(stats["min"])
        self.assertIsNone(stats["median"])
        self.assertIsNone(stats["max"])

    def test_observed_confidence_stats_with_observations(self):
        obs = [
            ShuttleObservation(
                timestamp_sec=0.1,
                frame_index=3,
                state="observed",
                source="temporal_tracker",
                position_px={"x": 100.0, "y": 200.0},
                confidence=0.6,
            ),
            ShuttleObservation(
                timestamp_sec=0.2,
                frame_index=6,
                state="observed",
                source="temporal_tracker",
                position_px={"x": 105.0, "y": 195.0},
                confidence=0.8,
            ),
            ShuttleObservation(
                timestamp_sec=0.3,
                frame_index=9,
                state="observed",
                source="temporal_tracker",
                position_px={"x": 110.0, "y": 190.0},
                confidence=0.7,
            ),
            ShuttleObservation(
                timestamp_sec=0.4,
                frame_index=12,
                state="lost",
                source="temporal_tracker",
                position_px=None,
                confidence=0.9,  # Non-observed state confidence should be ignored
            ),
        ]
        stats = compute_observed_confidence_stats(obs)
        self.assertEqual(stats["count"], 3)
        self.assertEqual(stats["min"], 0.6)
        self.assertEqual(stats["median"], 0.7)
        self.assertEqual(stats["max"], 0.8)

    def test_summarize_smoke_report_structure(self):
        prov = {
            "enabled": True,
            "provider": "rallylens_tracknet",
            "model": "rallylens-shuttle-tracknet.pth",
            "runtime": "pytorch",
            "precision": "fp32",
            "device": "cpu",
            "windowSize": 9,
            "framesReceived": 30,
            "validFrames": 30,
            "inferenceCalls": 22,
            "meanInferenceMs": 15.2,
            "observedCount": 18,
            "predictedCount": 0,
            "lostCount": 4,
            "unknownCount": 0,
            "lastFailure": None,
        }
        report = summarize_smoke_report(
            video_path="C:/videos/Badminton test.mp4",
            width=1280,
            height=720,
            fps=30.0,
            start_frame=300,
            analyzed_frames=30,
            pipeline_provenance=prov,
            observations=[],
        )
        self.assertEqual(report["video"]["filename"], "Badminton test.mp4")
        self.assertEqual(report["video"]["width"], 1280)
        self.assertEqual(report["video"]["height"], 720)
        self.assertEqual(report["video"]["fps"], 30.0)
        self.assertEqual(report["segment"]["start_frame"], 300)
        self.assertEqual(report["segment"]["analyzed_frames"], 30)
        self.assertEqual(report["runtime"]["inference_calls"], 22)
        self.assertEqual(report["observations"]["observed_count"], 18)
        self.assertEqual(report["observed_confidence"]["count"], 0)
        self.assertIsNone(report["observed_confidence"]["min"])
        self.assertIn("accuracy", report["disclaimer"].lower())


if __name__ == "__main__":
    unittest.main()
