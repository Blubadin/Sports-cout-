from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from detector_adapter import court_filtered_predictor
from analyzer_v2 import BadmintonAnalyzerV2


class _ArrayValue:
    def __init__(self, value):
        self.value = np.asarray(value)

    def cpu(self):
        return self

    def numpy(self):
        return self.value


class _Boxes:
    def __init__(self, xyxy):
        self.xyxy = _ArrayValue(xyxy)

    def __getitem__(self, index):
        return _Boxes(self.xyxy.value[index])


class _Result:
    def __init__(self, boxes):
        self.boxes = boxes

    def __getitem__(self, index):
        return _Result(self.boxes[index])


class _Predictor:
    def __init__(self, results):
        self.results = results

    def postprocess(self, predictions, tensor, originals, **kwargs):
        return self.results


class TestDetectorCourtFilter(unittest.TestCase):
    def test_calibrated_polygon_gate_is_independent_of_optional_crop_acceleration(self):
        adapter = MagicMock()
        adapter.detect_and_track.return_value = []
        analyzer = BadmintonAnalyzerV2(
            game_type="doubles",
            use_court_roi=False,
            detector_adapter=adapter,
        )
        analyzer._detector = object()
        corners = [[100, 100], [700, 100], [700, 900], [100, 900]]
        analyzer.set_court_corners(corners)

        analyzer.detect_and_track(np.zeros((1000, 800, 3), dtype=np.uint8))

        kwargs = adapter.detect_and_track.call_args.kwargs
        self.assertTrue(kwargs["court_filter_active"])
        np.testing.assert_allclose(kwargs["image_to_court"], analyzer.mapper.H)
        self.assertEqual(kwargs["court_margin_m"], 0.5)

    def test_excludes_outside_people_before_results_reach_tracker_callback(self):
        state = {
            "active": True,
            "imageToCourt": np.eye(3),
            "courtWidthM": 6.1,
            "courtLengthM": 13.4,
            "marginM": 0.5,
            "offsetX": 0,
            "offsetY": 0,
        }
        diagnostics = {}
        result = _Result(_Boxes([
            [2.0, 2.0, 3.0, 3.0],
            [-1.0, 2.0, -0.6, 3.0],
        ]))
        predictor = court_filtered_predictor(_Predictor, state, diagnostics.update)([result])

        tracked_input = predictor.postprocess(None, None, None)

        np.testing.assert_array_equal(tracked_input[0].boxes.xyxy.value, [[2.0, 2.0, 3.0, 3.0]])
        self.assertEqual(diagnostics["candidateCount"], 2)
        self.assertEqual(diagnostics["acceptedCount"], 1)
        self.assertEqual(diagnostics["rejectedOutsideCourtCount"], 1)

    def test_fails_closed_until_a_camera_segment_has_calibration(self):
        state = {
            "active": True,
            "imageToCourt": None,
            "courtWidthM": 6.1,
            "courtLengthM": 13.4,
            "marginM": 0.5,
            "offsetX": 0,
            "offsetY": 0,
        }
        diagnostics = {}
        result = _Result(_Boxes([[2.0, 2.0, 3.0, 3.0]]))
        predictor = court_filtered_predictor(_Predictor, state, diagnostics.update)([result])

        tracked_input = predictor.postprocess(None, None, None)

        self.assertEqual(tracked_input[0].boxes.xyxy.value.shape, (0, 4))
        self.assertFalse(diagnostics["calibrationAvailable"])
        self.assertEqual(diagnostics["rejectedOutsideCourtCount"], 1)


if __name__ == "__main__":
    unittest.main()
