"""Regressions for R01/R03/R05; synthetic inputs are isolated test fixtures."""
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from analyzer_v2 import BadmintonAnalyzerV2
from shuttle_pipeline import create_shuttle_pipeline
from shuttle_telemetry import ShuttleObservation
from shuttle_tracker import ShuttleTrackerProvider, TemporalModelOutput
from test_camera_cut_safety import court_frame, replay_frame
from reid_adapter import MockReIDAdapter


class PeakProvider(ShuttleTrackerProvider):
    def __init__(self, confidence=0.45):
        self.confidence = confidence
        self.calls = 0

    def infer(self, frames):
        self.calls += 1
        heatmap = np.zeros((480, 640), dtype=np.float32)
        heatmap[200, 300] = self.confidence
        return TemporalModelOutput(heatmap)


class TestPostCutIdentity(unittest.TestCase):
    def setup_analyzer(self, max_players=1):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=max_players)
        analyzer._detector = "test fixture"
        analyzer.pose_adapter = MagicMock()
        analyzer.pose_adapter.estimate_pose_in_roi.return_value = {
            "keypoints": [(100, 150, .9)], "metrics": {}, "keypointCoordinateSpace": "pixel",
        }
        analyzer.detect_and_track = lambda _: [{
            "bbox": [150, 150, 190, 260], "center": (170, 260), "conf": .9, "track_id": 42,
        }]
        analyzer.set_court_corners([[70, 35], [570, 35], [570, 445], [70, 445]])
        initial = court_frame()
        initial[150:260, 150:190] = (20, 20, 210)
        first = analyzer.process_frame(initial, timestamp_sec=0)
        self.assertEqual(first["players"][0]["trackId"], 42)
        return analyzer

    def test_new_person_remains_unresolved_for_twelve_frames_with_raw_pose(self):
        analyzer = self.setup_analyzer()
        prior_histogram = analyzer.profiles[1].color_hist.copy()
        analyzer.detect_and_track = lambda _: [{
            "bbox": [420, 150, 460, 260], "center": (440, 260), "conf": .9, "track_id": 99,
        }]
        after_cut = replay_frame()
        after_cut[150:260, 420:460] = (210, 20, 20)
        for index in range(1, 13):
            result = analyzer.process_frame(after_cut, timestamp_sec=index / 30)
            self.assertEqual(result["cameraSegmentId"], "segment-1")
            self.assertIsNone(result["players"][0]["trackId"], f"frame after cut {index}")
            self.assertIsNone(result["players"][0]["speedMps"])
            self.assertEqual(result["rawPlayerDetections"][0]["trackId"], 99)
            self.assertIsNotNone(result["rawPlayerDetections"][0]["pose"])
        np.testing.assert_array_equal(analyzer.profiles[1].color_hist, prior_histogram)

    def test_returning_person_needs_repeated_distinct_appearance_evidence(self):
        analyzer = self.setup_analyzer()
        analyzer.detect_and_track = lambda _: [{
            "bbox": [420, 150, 460, 260], "center": (440, 260), "conf": .9, "track_id": 99,
        }]
        after_cut = replay_frame()
        after_cut[150:260, 420:460] = (20, 20, 210)
        results = [analyzer.process_frame(after_cut, timestamp_sec=i / 30) for i in range(1, 7)]
        self.assertTrue(all(r["players"][0]["trackId"] is None for r in results[:3]))
        self.assertEqual(results[3]["players"][0]["trackId"], 99)
        self.assertIsNone(results[3]["players"][0]["courtPosition"])

    def test_ambiguous_appearance_does_not_choose_a_slot(self):
        analyzer = self.setup_analyzer(max_players=2)
        analyzer.profiles[2].color_hist = analyzer.profiles[1].color_hist.copy()
        analyzer.detect_and_track = lambda _: [{
            "bbox": [420, 150, 460, 260], "center": (440, 260), "conf": .9, "track_id": 99,
        }]
        after_cut = replay_frame()
        after_cut[150:260, 420:460] = (20, 20, 210)
        for i in range(1, 9):
            result = analyzer.process_frame(after_cut, timestamp_sec=i / 30)
            self.assertTrue(all(p["trackId"] is None for p in result["players"]))

    def test_contradictory_reid_cannot_be_overruled_by_matching_shirt(self):
        analyzer = self.setup_analyzer()
        analyzer.reid_adapter = MockReIDAdapter()
        analyzer.profiles[1].reid_embedding = np.eye(128, dtype=np.float32)[22]
        analyzer.detect_and_track = lambda _: [{
            "bbox": [420, 150, 460, 260], "center": (440, 260), "conf": .9, "track_id": 99,
        }]
        image = replay_frame()
        image[150:260, 420:460] = (20, 20, 210)
        for i in range(1, 9):
            frame = analyzer.process_frame(image, timestamp_sec=i / 30)
            self.assertIsNone(frame["players"][0]["trackId"])

    def test_missing_frame_breaks_reacquisition_confirmation(self):
        analyzer = self.setup_analyzer()
        detection = {"bbox": [420, 150, 460, 260], "center": (440, 260), "conf": .9, "track_id": 99}
        image = replay_frame()
        image[150:260, 420:460] = (20, 20, 210)
        for i in range(1, 7):
            analyzer.detect_and_track = lambda _, i=i: [] if i == 3 else [detection.copy()]
            frame = analyzer.process_frame(image, timestamp_sec=i / 30)
            if i < 6:
                self.assertIsNone(frame["players"][0]["trackId"])
            else:
                self.assertEqual(frame["players"][0]["trackId"], 99)


class TestShuttleSceneAndLifecycle(unittest.TestCase):
    def pipeline(self, provider, recovery=False):
        return create_shuttle_pipeline({"shuttle_enabled": True, "shuttle_window_size": 2,
                                       "shuttle_recovery_enabled": recovery}, custom_provider=provider)

    def test_analyzer_passes_actual_scene_evidence_through_existing_seam(self):
        analyzer = BadmintonAnalyzerV2(max_players=1)
        analyzer._detector = "fixture"
        analyzer.detect_and_track = lambda _: []
        analyzer.shuttle_pipeline = MagicMock()
        analyzer.shuttle_pipeline.process_frame.return_value = None
        result = analyzer.process_frame(court_frame(), timestamp_sec=0)
        self.assertEqual(analyzer.shuttle_pipeline.process_frame.call_args.kwargs["scene_evidence"],
                         result["sceneEvidence"])

    def test_camera_motion_evidence_removes_false_local_motion_boost_without_stopping_inference(self):
        outcomes = []
        for camera_motion in (False, True):
            provider = PeakProvider()
            pipeline = self.pipeline(provider)
            pipeline.process_frame(np.zeros((480, 640, 3), dtype=np.uint8), 0, 0)
            result = pipeline.process_frame(np.full((480, 640, 3), 255, dtype=np.uint8), 1 / 30, 1,
                                            scene_evidence={"is_pan_tilt_zoom": camera_motion})
            self.assertEqual(provider.calls, 1)
            outcomes.append(result.state)
            self.assertEqual(result.to_dict()["evidenceFusion"]["motionReliability"], 0 if camera_motion else 1)
        self.assertEqual(outcomes, ["observed", "unknown"])

    def test_warmup_is_per_frame_roundtrippable_after_initialization_and_cut(self):
        for recovery in (False, True):
            pipeline = self.pipeline(PeakProvider(.95), recovery)
            image = np.zeros((480, 640, 3), dtype=np.uint8)
            for segment, start in (("segment-0", 0), ("segment-1", 10)):
                first = pipeline.process_frame(image, start / 30, start, camera_segment_id=segment, pipeline_run_id="run")
                data = first.to_dict()
                self.assertEqual(data["trackingState"], "WARMING_UP")
                self.assertEqual(data["warmupRemainingFrames"], 1)
                self.assertEqual(data["validity"], {"positionValid": False, "reason": "warming_up"})
                self.assertEqual(ShuttleObservation.from_dict(data).to_dict(), data)
                second = pipeline.process_frame(image, (start + 1) / 30, start + 1, camera_segment_id=segment)
                self.assertEqual(second.to_dict()["warmupRemainingFrames"], 0)
                self.assertNotEqual(second.to_dict()["trackingState"], "WARMING_UP")

    def test_warmup_cannot_claim_a_valid_observed_position(self):
        from shuttle_telemetry import ShuttlePositionPx
        invalid = ShuttleObservation(0, 0, "observed", position_px=ShuttlePositionPx(10, 20))
        invalid.set_frame_validity("WARMING_UP", 1)
        self.assertTrue(invalid.validate())

    def test_scene_labels_alone_do_not_disable_detection_and_stationary_is_not_a_hard_reject(self):
        for label in ("UNKNOWN", "CLOSE_UP", "SIDE_PLAY", "REPLAY"):
            provider = PeakProvider(.95)
            pipeline = self.pipeline(provider, recovery=True)
            image = np.zeros((480, 640, 3), dtype=np.uint8)
            results = [pipeline.process_frame(image, i / 30, i,
                       scene_evidence={"sceneState": label, "is_pan_tilt_zoom": True}) for i in range(21)]
            self.assertEqual(provider.calls, 20)
            self.assertEqual(results[3].state, "observed")
            self.assertEqual(results[7].state, "observed")
            self.assertNotEqual(results[-1].state, "observed")
            self.assertEqual(results[3].evidence_fusion["motionReliability"], 0)


if __name__ == "__main__":
    unittest.main()
