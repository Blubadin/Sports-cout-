from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from court_roi import filter_court_bboxes


class TestCourtPolygonFiltering(unittest.TestCase):
    def test_perspective_margin_is_measured_in_metres_not_pixels(self):
        # The denominator makes the same 0.4m/0.6m sideline offsets map to
        # different pixel distances at the far end of the perspective view.
        image_to_court = np.array([
            [0.01, 0.0, 0.0],
            [0.0, 0.01, 0.0],
            [0.0, 0.001, 1.0],
        ])
        boxes = [
            [-90, 990, -70, 1000],   # x=-0.4m at this depth: lunge allowed
            [-130, 990, -110, 1000], # x=-0.6m at this depth: spectator rejected
        ]

        selected, counts = filter_court_bboxes(
            boxes,
            image_to_court=image_to_court,
            court_width_m=6.1,
            court_length_m=13.4,
            margin_m=0.5,
        )

        self.assertEqual(selected, [0])
        self.assertEqual(counts["rejectedOutsideCourtCount"], 1)

    def test_filters_spectators_using_calibrated_feet_and_metric_margin(self):
        # H maps source pixels directly to court metres in this fixture.
        boxes = [
            [2.0, 2.0, 3.0, 3.0],       # in court
            [-0.2, 2.0, 0.2, 3.0],       # lunge 0.2m beyond sideline
            [-1.0, 2.0, -0.6, 3.0],      # adjacent-court spectator
            [2.0, 14.0, 3.0, 15.0],      # outside the end margin
        ]

        selected, counts = filter_court_bboxes(
            boxes,
            image_to_court=np.eye(3, dtype=np.float32),
            court_width_m=6.1,
            court_length_m=13.4,
            margin_m=0.5,
        )

        self.assertEqual(selected, [0, 1])
        self.assertEqual(counts, {"candidateCount": 4, "acceptedCount": 2, "rejectedOutsideCourtCount": 2})

    def test_restores_roi_offsets_before_projecting_footpoints(self):
        boxes = [[1.0, 1.0, 2.0, 2.0]]
        # Source x/y are ROI-local + (100, 200); H maps them into a court point.
        image_to_court = np.array([[1, 0, -101], [0, 1, -201], [0, 0, 1]], dtype=np.float32)
        selected, counts = filter_court_bboxes(
            boxes,
            image_to_court=image_to_court,
            court_width_m=6.1,
            court_length_m=13.4,
            margin_m=0.5,
            offset_x=100,
            offset_y=200,
        )

        self.assertEqual(selected, [0])
        self.assertEqual(counts["acceptedCount"], 1)

    def test_invalid_calibration_fails_closed_when_filtering_is_requested(self):
        selected, counts = filter_court_bboxes(
            [[1, 1, 2, 2]],
            image_to_court=None,
            court_width_m=6.1,
            court_length_m=13.4,
            margin_m=0.5,
        )

        self.assertEqual(selected, [])
        self.assertEqual(counts["rejectedOutsideCourtCount"], 1)


if __name__ == "__main__":
    unittest.main()
