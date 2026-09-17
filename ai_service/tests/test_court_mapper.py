"""
test_court_mapper.py — Unit tests for BWF standard dimensions, homography, and zone mapping.
"""

import unittest
import numpy as np
import sys
from pathlib import Path

# Add ai_service to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from court_mapper import (
    CourtMapper,
    DistanceTracker,
    COURT_LENGTH_M,
    COURT_WIDTH_DOUBLES_M,
    COURT_WIDTH_SINGLES_M,
    SINGLES_SIDE_ALLEY_M,
    NET_Y_M,
    FRONT_BOUNDARY_TOP_M,
    FRONT_BOUNDARY_BOT_M,
    MID_BOUNDARY_TOP_M,
    MID_BOUNDARY_BOT_M,
)


class TestCourtMapperDimensions(unittest.TestCase):
    def test_bwf_dimensions(self):
        """Verify official BWF court dimensions are used."""
        self.assertEqual(COURT_LENGTH_M, 13.40)
        self.assertEqual(COURT_WIDTH_DOUBLES_M, 6.10)
        self.assertEqual(COURT_WIDTH_SINGLES_M, 5.18)
        self.assertAlmostEqual(SINGLES_SIDE_ALLEY_M, 0.46, places=2)
        self.assertEqual(NET_Y_M, 6.70)

    def test_doubles_court_mapper_initialization(self):
        mapper = CourtMapper(game_type="doubles")
        self.assertEqual(mapper.court_w, 6.10)
        self.assertEqual(mapper.court_l, 13.40)
        np.testing.assert_array_almost_equal(
            mapper.real_corners,
            np.array([
                [0.0, 0.0],
                [6.10, 0.0],
                [6.10, 13.40],
                [0.0, 13.40],
            ], dtype=np.float32)
        )

    def test_singles_court_mapper_initialization(self):
        """Singles camera homography uses outer doubles boundaries (6.10m x 13.40m)."""
        mapper = CourtMapper(game_type="singles")
        self.assertEqual(mapper.court_w, 6.10)
        self.assertEqual(mapper.court_l, 13.40)
        np.testing.assert_array_almost_equal(
            mapper.real_corners,
            np.array([
                [0.0, 0.0],
                [6.10, 0.0],
                [6.10, 13.40],
                [0.0, 13.40],
            ], dtype=np.float32)
        )


class TestPerspectiveTransform(unittest.TestCase):
    def setUp(self):
        self.mapper = CourtMapper(game_type="doubles")
        # Simulate video resolution 1920x1080 with court corners
        self.image_corners = np.array([
            [400.0, 200.0],   # TL
            [1520.0, 200.0],  # TR
            [1720.0, 1000.0], # BR
            [200.0, 1000.0],  # BL
        ], dtype=np.float32)
        self.mapper.calibrate(self.image_corners)

    def test_homography_corners(self):
        """Corner pixels must project to real court corners."""
        tl_real = self.mapper.pixel_to_real((400.0, 200.0))
        self.assertAlmostEqual(tl_real[0], 0.0, delta=0.05)
        self.assertAlmostEqual(tl_real[1], 0.0, delta=0.05)

        br_real = self.mapper.pixel_to_real((1720.0, 1000.0))
        self.assertAlmostEqual(br_real[0], 6.10, delta=0.05)
        self.assertAlmostEqual(br_real[1], 13.40, delta=0.05)

    def test_real_to_pixel_roundtrip(self):
        """Converting pixel -> real -> pixel must preserve location."""
        test_px = (960.0, 600.0)
        real = self.mapper.pixel_to_real(test_px)
        recovered_px = self.mapper.real_to_pixel(real)
        self.assertAlmostEqual(recovered_px[0], test_px[0], delta=1.0)
        self.assertAlmostEqual(recovered_px[1], test_px[1], delta=1.0)

    def test_real_to_percent(self):
        pct_center = self.mapper.real_to_percent((3.05, 6.70))
        self.assertAlmostEqual(pct_center[0], 50.0, delta=0.1)
        self.assertAlmostEqual(pct_center[1], 50.0, delta=0.1)


class TestBadmintonZones(unittest.TestCase):
    def setUp(self):
        self.doubles_mapper = CourtMapper(game_type="doubles")

    def test_top_court_zones(self):
        # Top-Left Back: (x=1.5, y=1.0) -> BL
        self.assertEqual(self.doubles_mapper.get_zone_2d((1.5, 1.0)), "BL")
        # Top-Right Back: (x=4.5, y=1.0) -> BR
        self.assertEqual(self.doubles_mapper.get_zone_2d((4.5, 1.0)), "BR")
        # Top-Left Mid: (x=1.5, y=3.5) -> ML
        self.assertEqual(self.doubles_mapper.get_zone_2d((1.5, 3.5)), "ML")
        # Top-Right Mid: (x=4.5, y=3.5) -> MR
        self.assertEqual(self.doubles_mapper.get_zone_2d((4.5, 3.5)), "MR")
        # Top-Left Front: (x=1.5, y=5.5) -> FL
        self.assertEqual(self.doubles_mapper.get_zone_2d((1.5, 5.5)), "FL")
        # Top-Right Front: (x=4.5, y=5.5) -> FR
        self.assertEqual(self.doubles_mapper.get_zone_2d((4.5, 5.5)), "FR")

    def test_bottom_court_zones(self):
        # Bottom-Left Front: (x=1.5, y=7.5) -> FL
        self.assertEqual(self.doubles_mapper.get_zone_2d((1.5, 7.5)), "FL")
        # Bottom-Right Front: (x=4.5, y=7.5) -> FR
        self.assertEqual(self.doubles_mapper.get_zone_2d((4.5, 7.5)), "FR")
        # Bottom-Left Mid: (x=1.5, y=10.0) -> ML
        self.assertEqual(self.doubles_mapper.get_zone_2d((1.5, 10.0)), "ML")
        # Bottom-Right Mid: (x=4.5, y=10.0) -> MR
        self.assertEqual(self.doubles_mapper.get_zone_2d((4.5, 10.0)), "MR")
        # Bottom-Left Back: (x=1.5, y=12.5) -> BL
        self.assertEqual(self.doubles_mapper.get_zone_2d((1.5, 12.5)), "BL")
        # Bottom-Right Back: (x=4.5, y=12.5) -> BR
        self.assertEqual(self.doubles_mapper.get_zone_2d((4.5, 12.5)), "BR")

    def test_out_of_bounds(self):
        # Side out left
        self.assertEqual(self.doubles_mapper.get_zone_2d((-0.5, 5.0)), "SIDE_OUT")
        # Side out right
        self.assertEqual(self.doubles_mapper.get_zone_2d((6.8, 5.0)), "SIDE_OUT")
        # Long out top
        self.assertEqual(self.doubles_mapper.get_zone_2d((3.0, -0.5)), "LONG_OUT")
        # Long out bottom
        self.assertEqual(self.doubles_mapper.get_zone_2d((3.0, 14.0)), "LONG_OUT")

    def test_shuttle_net_error(self):
        # Near net with is_shuttle=True
        self.assertEqual(self.doubles_mapper.get_zone_2d((3.0, 6.70), is_shuttle=True), "NET_ERR")
        # Player standing near net should NOT be NET_ERR
        self.assertEqual(self.doubles_mapper.get_zone_2d((1.5, 6.65), is_shuttle=False), "FL")


class TestCalibrationValidation(unittest.TestCase):
    def test_uncalibrated_raises_runtime_error(self):
        mapper = CourtMapper()
        self.assertFalse(mapper.is_calibrated)
        with self.assertRaises(RuntimeError):
            mapper.pixel_to_real((100.0, 100.0))
        with self.assertRaises(RuntimeError):
            mapper.real_to_pixel((3.0, 6.0))
        with self.assertRaises(RuntimeError):
            mapper.real_to_pixel_subpixel((3.0, 6.0))

    def test_calibrate_rejects_non_4_points(self):
        mapper = CourtMapper()
        with self.assertRaises(ValueError):
            mapper.calibrate([[0, 0], [100, 0], [100, 100]])
        with self.assertRaises(ValueError):
            mapper.calibrate([[0, 0], [100, 0], [100, 100], [0, 100], [50, 50]])

    def test_calibrate_rejects_nan_and_inf(self):
        mapper = CourtMapper()
        with self.assertRaises(ValueError):
            mapper.calibrate([[0, 0], [np.nan, 0], [100, 100], [0, 100]])
        with self.assertRaises(ValueError):
            mapper.calibrate([[0, 0], [np.inf, 0], [100, 100], [0, 100]])

    def test_calibrate_rejects_duplicate_points(self):
        mapper = CourtMapper()
        with self.assertRaises(ValueError):
            mapper.calibrate([[0, 0], [0, 0], [100, 100], [0, 100]])

    def test_calibrate_rejects_degenerate_area(self):
        mapper = CourtMapper()
        # Collinear line has 0 area (< 10 px²)
        with self.assertRaises(ValueError):
            mapper.calibrate([[0, 0], [100, 0], [200, 0], [300, 0]])


class TestTimestampAwareDistanceTracker(unittest.TestCase):
    def setUp(self):
        self.mapper = CourtMapper()
        corners = np.array([
            [100.0, 50.0],
            [1180.0, 50.0],
            [1180.0, 670.0],
            [100.0, 670.0],
        ], dtype=np.float32)
        self.mapper.calibrate(corners)
        self.tracker = DistanceTracker(self.mapper, fps=30.0)

    def test_initial_assignment_establishes_zero_speed(self):
        pt_px = self.mapper.real_to_pixel((3.05, 6.70))
        res = self.tracker.update(1, pt_px, timestamp_sec=0.0)
        self.assertEqual(res["total_dist_m"], 0.0)
        self.assertEqual(res["current_speed_ms"], 0.0)

    def test_timestamp_delta_speed_calculation(self):
        # Initial pos at t=0.0s
        self.tracker.update(1, self.mapper.real_to_pixel((3.05, 6.70)), timestamp_sec=0.0)
        # Move 1.0m along Y in 0.5s => 2.0 m/s
        res = self.tracker.update(1, self.mapper.real_to_pixel((3.05, 7.70)), timestamp_sec=0.5)
        self.assertAlmostEqual(res["current_speed_ms"], 2.0, delta=0.05)
        self.assertAlmostEqual(res["total_dist_m"], 1.0, delta=0.05)

    def test_non_positive_delta_time_rejected(self):
        # Initial pos at t=1.0s
        self.tracker.update(1, self.mapper.real_to_pixel((3.05, 6.70)), timestamp_sec=1.0)
        # Duplicate or earlier timestamp (t=1.0s or t=0.5s)
        res = self.tracker.update(1, self.mapper.real_to_pixel((3.05, 7.70)), timestamp_sec=1.0)
        self.assertEqual(res["current_speed_ms"], 0.0)
        self.assertEqual(res["total_dist_m"], 0.0)


if __name__ == "__main__":
    unittest.main()
