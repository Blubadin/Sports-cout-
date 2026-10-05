"""Evaluator diagnostics only; these are not real-video quality evidence."""
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evaluate_phase3_real import numeric_difference


class TestNumericDiagnostics(unittest.TestCase):
    def test_missing_is_not_measured_zero(self):
        result = numeric_difference(None, 0.0, 1e-6)
        self.assertEqual(result["availabilityOrShapeDifferences"], 1)
        self.assertEqual(result["pairedFiniteValues"], 0)
        self.assertIsNone(result["maxAbsoluteDifference"])

    def test_explicit_tolerance_and_shape(self):
        result = numeric_difference({"x": 50, "y": 90}, {"x": 50.0000001, "y": 91}, 1e-6)
        self.assertEqual(result["pairedFiniteValues"], 2)
        self.assertEqual(result["valuesOutsideTolerance"], 1)
        self.assertEqual(result["maxAbsoluteDifference"], 1)
        self.assertEqual(numeric_difference([1, 2], [1], 1e-6)["availabilityOrShapeDifferences"], 1)


if __name__ == "__main__":
    unittest.main()
