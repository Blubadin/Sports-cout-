import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from court_mapper import CourtMapper, DistanceTracker


class TestBoundedDistanceTracker(unittest.TestCase):
    def test_long_run_retains_only_current_positions_and_bounded_speed_window(self):
        mapper = CourtMapper()
        mapper.calibrate(np.array([[0, 0], [610, 0], [610, 1340], [0, 1340]], dtype=np.float32))
        tracker = DistanceTracker(mapper)

        for frame in range(5000):
            tracker.update(1, (100 + (frame % 100) * 5, 300), timestamp_sec=frame / 30)

        data = tracker._data[1]
        self.assertLessEqual(len(data["positions_px"]), 1)
        self.assertLessEqual(len(data["positions_m"]), 1)
        self.assertLessEqual(len(data["positions_pct"]), 1)
        self.assertLessEqual(len(data["speeds_ms"]), tracker.speed_history_limit)
        self.assertEqual(data["speed_count"], 5000)
        self.assertGreater(tracker.get_stats(1)["total_dist_m"], 0)

    def test_aggregate_snapshot_restores_distance_without_a_bridge_position(self):
        mapper = CourtMapper()
        mapper.calibrate(np.array([[0, 0], [610, 0], [610, 1340], [0, 1340]], dtype=np.float32))
        tracker = DistanceTracker(mapper)
        tracker.update(1, (100, 300), timestamp_sec=0)
        tracker.update(1, (120, 300), timestamp_sec=1)
        snapshot = tracker.aggregate_snapshot()

        restored = DistanceTracker(mapper)
        restored.restore_aggregates(snapshot)

        self.assertEqual(restored.get_stats(1)["total_dist_m"], tracker.get_stats(1)["total_dist_m"])
        self.assertIsNone(restored.get_stats(1)["court_pos_m"])
        self.assertIsNone(restored._data[1]["prev_real"])


    def test_scene_and_calibration_runtime_histories_are_bounded(self):
        from scene_lifecycle import CameraSegmentLifecycleManager
        from calibration_contract import CalibrationContext, CalibrationSource
        context = CalibrationContext()
        scene = CameraSegmentLifecycleManager(context)
        for index in range(500):
            scene.evaluate_frame(np.zeros((64, 64, 3), dtype=np.uint8), index, index / 30, cut_detected=False)
            context.accept(source=CalibrationSource.MANUAL, frame=index, timestamp_sec=index / 30)
            context.start_camera_segment()
        self.assertLessEqual(len(scene.transition_history), 128)
        self.assertLessEqual(len(context.history), 128)


if __name__ == "__main__":
    unittest.main()
