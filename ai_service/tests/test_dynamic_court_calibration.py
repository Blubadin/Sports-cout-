import json
import math
import sys
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import MagicMock

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2
from calibration_contract import CalibrationProvenance, CalibrationSource, CalibrationState
from court_calibration import (
    AutomaticCourtCalibrationProvider,
    CourtCalibrationCandidate,
    ManualCourtCalibrationProvider,
    TemporalStabilityValidator,
    validate_automatic_candidate_acceptance,
    validate_court_geometry,
)


def synthetic_court_frame(player_x: int | None = None) -> np.ndarray:
    """Standard synthetic court frame with BWF outer doubles & inner lines."""
    frame = np.full((480, 640, 3), (60, 115, 35), dtype=np.uint8)
    for x in (70, 130, 320, 510, 570):
        cv2.line(frame, (x, 35), (x, 445), (230, 230, 230), 3)
    for y in (35, 155, 240, 325, 445):
        cv2.line(frame, (70, y), (570, y), (230, 230, 230), 3)
    if player_x is not None:
        cv2.rectangle(frame, (player_x, 170), (player_x + 28, 270), (20, 20, 210), -1)
    return frame


def non_court_replay_frame() -> np.ndarray:
    """Non-court diagonal pattern simulating broadcast graphic / replay."""
    frame = np.full((480, 640, 3), (175, 45, 90), dtype=np.uint8)
    for offset in range(-480, 640, 36):
        cv2.line(frame, (offset, 0), (offset + 480, 479), (20, 220, 230), 5)
    return frame


def non_court_geometry_frames() -> dict[str, np.ndarray]:
    """Stable visual lookalikes that do not establish badminton court landmarks."""
    def canvas() -> np.ndarray:
        return np.full((480, 640, 3), (55, 105, 40), dtype=np.uint8)

    generic_grid = canvas()
    for x in (70, 195, 320, 445, 570):
        cv2.line(generic_grid, (x, 35), (x, 445), (235, 235, 235), 3)
    for y in (35, 137, 240, 343, 445):
        cv2.line(generic_grid, (70, y), (570, y), (235, 235, 235), 3)

    rectangle = canvas()
    cv2.rectangle(rectangle, (70, 35), (570, 445), (235, 235, 235), 3)

    floor_seams = canvas()
    for x in (45, 190, 335, 480, 625):
        cv2.line(floor_seams, (x, 0), (x, 479), (190, 190, 190), 2)
    for y in (30, 150, 270, 390):
        cv2.line(floor_seams, (0, y), (639, y), (190, 190, 190), 2)

    advertising_board = canvas()
    cv2.rectangle(advertising_board, (40, 45), (600, 180), (235, 235, 235), 4)
    cv2.rectangle(advertising_board, (75, 70), (565, 155), (235, 235, 235), 3)

    parallel_lines = canvas()
    for x in (70, 130, 320, 510, 570):
        cv2.line(parallel_lines, (x, 35), (x, 445), (235, 235, 235), 3)

    wrong_quadrilateral = synthetic_court_frame()
    cv2.rectangle(wrong_quadrilateral, (10, 10), (630, 470), (235, 235, 235), 3)

    missing_evidence = canvas()
    for x in (70, 130, 320, 510, 570):
        cv2.line(missing_evidence, (x, 35), (x, 445), (235, 235, 235), 3)
    for y in (35, 240, 445):
        cv2.line(missing_evidence, (70, y), (570, y), (235, 235, 235), 3)

    return {
        "generic_5x5_grid": generic_grid,
        "generic_rectangle": rectangle,
        "floor_seams": floor_seams,
        "advertising_board_rectangle": advertising_board,
        "parallel_line_pattern": parallel_lines,
        "stable_wrong_quadrilateral": wrong_quadrilateral,
        "court_like_missing_service_lines": missing_evidence,
    }


class TestDynamicCourtCalibrationFoundation(unittest.TestCase):
    def setUp(self):
        self.court_corners = [[70, 35], [570, 35], [570, 445], [70, 445]]

    def test_non_court_geometry_never_locks_automatic_calibration(self):
        for name, image in non_court_geometry_frames().items():
            with self.subTest(name=name):
                analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
                analyzer._detector = "dummy"
                analyzer.detect_and_track = lambda _: []
                for index in range(4):
                    result = analyzer.process_frame(image, timestamp_sec=index / 30)
                    self.assertIn(result["calibrationState"], ("UNCALIBRATED", "RECALIBRATING"))
                    self.assertIsNone(result["calibrationId"])
                    self.assertIsNone(analyzer.mapper.H)

    # 1. clean synthetic court -> valid candidate
    def test_1_clean_synthetic_court_produces_valid_candidate(self):
        provider = AutomaticCourtCalibrationProvider()
        frame = synthetic_court_frame()
        candidate = provider.get_candidate(frame, frame_index=0, timestamp_sec=0.0, camera_segment_id="segment-0")

        self.assertIsNotNone(candidate)
        self.assertIsInstance(candidate, CourtCalibrationCandidate)
        self.assertEqual(candidate.source, CalibrationSource.AUTOMATIC)
        self.assertEqual(len(candidate.corners_px), 4)

        # Check that extracted corners are within 2px of expected [70, 35], [570, 35], [570, 445], [70, 445]
        expected = np.array(self.court_corners, dtype=np.float32)
        extracted = np.array(candidate.corners_px, dtype=np.float32)
        diff = np.linalg.norm(extracted - expected, axis=1)
        self.assertTrue(np.all(diff < 2.5), f"Corner differences {diff} exceeded threshold")

        # Homography matrices are present and finite
        self.assertIsNotNone(candidate.h_matrix)
        self.assertIsNotNone(candidate.h_inv_matrix)

    # 2. degenerate geometry -> rejected
    def test_2_degenerate_geometry_rejected(self):
        # 4 collinear points with distances > 15px
        collinear = [[10.0, 10.0], [40.0, 40.0], [70.0, 70.0], [100.0, 100.0]]
        valid, reason = validate_court_geometry(collinear)
        self.assertFalse(valid)
        self.assertTrue("convex" in reason.lower() or "area too small" in reason.lower())

    # 3. duplicate corners -> rejected
    def test_3_duplicate_corners_rejected(self):
        # Pairwise distance < 15px
        duplicate = [[70.0, 35.0], [70.5, 35.2], [570.0, 445.0], [70.0, 445.0]]
        valid, reason = validate_court_geometry(duplicate)
        self.assertFalse(valid)
        self.assertIn("collapsed", reason.lower())

    # 4. implausible geometry -> rejected
    def test_4_implausible_geometry_rejected(self):
        # Bow-tie self-intersecting polygon (TR and BR crossed)
        bowtie = [[70.0, 35.0], [570.0, 445.0], [570.0, 35.0], [70.0, 445.0]]
        valid, reason = validate_court_geometry(bowtie)
        self.assertFalse(valid)

        # Inverted vertical ordering (TL below BL)
        inverted = [[70.0, 445.0], [570.0, 445.0], [570.0, 35.0], [70.0, 35.0]]
        valid, _ = validate_court_geometry(inverted)
        self.assertFalse(valid)

        # Extremely tiny polygon area
        tiny = [[10.0, 10.0], [14.0, 10.0], [14.0, 14.0], [10.0, 14.0]]
        valid, reason = validate_court_geometry(tiny)
        self.assertFalse(valid)
        self.assertTrue("collapsed" in reason.lower() or "too small" in reason.lower())

    # 5. unstable candidate -> not immediately CALIBRATED
    def test_5_unstable_candidate_not_immediately_calibrated(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda f: []

        # Frame 1: Valid court candidate observed for the first time
        frame1 = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.0)
        # Must NOT be CALIBRATED on frame 1 (requires temporal stability)
        self.assertIn(frame1["calibrationState"], ("UNCALIBRATED", "RECALIBRATING"))
        self.assertIsNone(frame1["calibrationId"])
        self.assertFalse(analyzer.calibration_context.is_metric_valid)

        # Frame 2: Shifted frame (corners jumped by 50px)
        shifted = cv2.warpAffine(synthetic_court_frame(), np.float32([[1, 0, 50], [0, 1, 0]]), (640, 480))
        frame2 = analyzer.process_frame(shifted, timestamp_sec=0.033)
        self.assertIn(frame2["calibrationState"], ("UNCALIBRATED", "RECALIBRATING", "CALIBRATION_LOST"))
        self.assertNotEqual(frame2["calibrationState"], "CALIBRATED")
        self.assertIsNone(frame2["calibrationId"])

    # 6. stable repeated candidates -> CALIBRATED
    def test_6_stable_repeated_candidates_calibrated(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda f: []

        # Feed 3 consecutive consistent frames
        analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.0)
        analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.033)
        frame3 = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.066)

        self.assertEqual(frame3["calibrationState"], "CALIBRATED")
        self.assertIsNotNone(frame3["calibrationId"])
        self.assertTrue(frame3["calibrationId"].startswith("cal-"))
        self.assertTrue(analyzer.calibration_context.is_metric_valid)
        self.assertTrue(analyzer.mapper.is_calibrated)

    # 7. calibration confidence finite or null
    def test_7_calibration_confidence_finite_or_null(self):
        provider = AutomaticCourtCalibrationProvider()
        candidate = provider.get_candidate(synthetic_court_frame())
        self.assertIsNotNone(candidate.confidence)
        self.assertTrue(math.isfinite(candidate.confidence))
        self.assertTrue(0.0 <= candidate.confidence <= 1.0)

        manual_provider = ManualCourtCalibrationProvider()
        manual_cand = manual_provider.set_corners(self.court_corners)
        self.assertIsNone(manual_cand.confidence)

        # Non-finite confidence in provenance must raise ValueError
        with self.assertRaises(ValueError):
            CalibrationProvenance(
                calibration_id="cal-test", camera_segment_id="segment-0",
                state=CalibrationState.CALIBRATED, source=CalibrationSource.AUTOMATIC,
                created_at_frame=0, created_at_timestamp_sec=0.0,
                confidence=float("nan"),
            )

    # 8. reprojection error measured only when supported
    def test_8_reprojection_error_measured_only_when_supported(self):
        provider = AutomaticCourtCalibrationProvider()
        # Synthetic court has net and service lines -> measurable reprojection error
        candidate = provider.get_candidate(synthetic_court_frame())
        self.assertIsNotNone(candidate.reprojection_error_px)
        self.assertTrue(math.isfinite(candidate.reprojection_error_px))
        self.assertGreaterEqual(candidate.reprojection_error_px, 0.0)

        # Manual calibration has no measurable quality
        manual_provider = ManualCourtCalibrationProvider()
        manual_cand = manual_provider.set_corners(self.court_corners)
        self.assertIsNone(manual_cand.reprojection_error_px)

        # Unsupported / unmeasured must remain None, never 0.0 fabricated
        with self.assertRaises(ValueError):
            CalibrationProvenance(
                calibration_id="cal-test", camera_segment_id="segment-0",
                state=CalibrationState.CALIBRATED, source=CalibrationSource.MANUAL,
                created_at_frame=0, created_at_timestamp_sec=0.0,
                reprojection_error_px=0.0,
            )

    # 9. camera segment change -> previous H unavailable
    def test_9_camera_segment_change_previous_h_unavailable(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1)
        analyzer.set_court_corners(self.court_corners)
        self.assertTrue(analyzer.mapper.is_calibrated)
        self.assertIsNotNone(analyzer.mapper.H)

        # Cut occurs
        analyzer.start_camera_segment()
        self.assertFalse(analyzer.mapper.is_calibrated)
        self.assertIsNone(analyzer.mapper.H)
        self.assertIsNone(analyzer.mapper.H_inv)
        with self.assertRaises(RuntimeError):
            analyzer.mapper.pixel_to_real((100, 100))

    # 10. new segment cannot reuse previous calibrationId
    def test_10_new_segment_cannot_reuse_previous_calibration_id(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1)
        analyzer.set_court_corners(self.court_corners)
        old_id = analyzer.calibration_context.provenance.calibration_id

        analyzer.start_camera_segment()
        frame = analyzer.process_frame(non_court_replay_frame(), timestamp_sec=0.1)

        self.assertEqual(frame["cameraSegmentId"], "segment-1")
        self.assertIsNone(frame["calibrationId"])
        self.assertNotEqual(frame["calibrationId"], old_id)

    # 11. successful relock -> new calibrationId
    def test_11_successful_relock_new_calibration_id(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda f: []

        # Lock in segment-0
        for i in range(3):
            f0 = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=i * 0.033)
        self.assertEqual(f0["calibrationState"], "CALIBRATED")
        id_0 = f0["calibrationId"]

        # Hard cut to replay frame (segment-1)
        cut_frame = analyzer.process_frame(non_court_replay_frame(), timestamp_sec=0.1)
        self.assertEqual(cut_frame["calibrationState"], "CALIBRATION_LOST")
        self.assertEqual(cut_frame["cameraSegmentId"], "segment-1")

        # Cut returning to court view (advances to segment-2 and requires 3 frames to lock)
        analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.2)
        analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.233)
        analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.266)
        relocked = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.300)

        self.assertEqual(relocked["calibrationState"], "CALIBRATED")
        self.assertEqual(relocked["cameraSegmentId"], "segment-2")
        id_1 = relocked["calibrationId"]
        self.assertIsNotNone(id_1)
        self.assertNotEqual(id_1, id_0)

    # 12. failed relock -> CALIBRATION_LOST / RECALIBRATING
    def test_12_failed_relock_remains_fail_closed(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda f: [{
            "bbox": [100, 100, 150, 200], "center": (125, 200),
            "conf": 0.9, "track_id": 1,
        }]

        # Calibrate initial segment
        for i in range(3):
            analyzer.process_frame(synthetic_court_frame(), timestamp_sec=i * 0.033)

        # Camera cut to replay
        analyzer.process_frame(non_court_replay_frame(), timestamp_sec=0.1)

        # 5 consecutive replay frames (no court detectable)
        for i in range(5):
            lost = analyzer.process_frame(non_court_replay_frame(), timestamp_sec=0.2 + i * 0.033)
            self.assertIn(lost["calibrationState"], ("CALIBRATION_LOST", "RECALIBRATING"))
            self.assertIsNone(lost["calibrationId"])
            player = lost["players"][0]
            self.assertIsNone(player["courtPosition"])
            self.assertIsNone(player["speedMps"])
            self.assertIsNone(player["absoluteZone"])
            self.assertIsNone(player["playerRelativeZone"])

    # 13. manual fallback works
    def test_13_manual_fallback_works(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda f: []

        # Cut occurs to replay
        analyzer.start_camera_segment()
        lost = analyzer.process_frame(non_court_replay_frame(), timestamp_sec=0.1)
        self.assertEqual(lost["calibrationState"], "CALIBRATION_LOST")

        # Camera cuts back to court view
        court_cut = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.2)
        self.assertEqual(court_cut["calibrationState"], "CALIBRATION_LOST")

        # User performs manual fallback on the new court view
        analyzer.set_court_corners(self.court_corners)
        calibrated = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=0.233)
        self.assertEqual(calibrated["calibrationState"], "CALIBRATED")
        self.assertEqual(calibrated["calibration"]["source"], "manual")
        self.assertIsNotNone(calibrated["calibrationId"])

    # 14. static camera does not generate calibration every frame
    def test_14_static_camera_does_not_generate_calibration_every_frame(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda f: []

        # Lock calibration
        for i in range(3):
            first = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=i * 0.033)
        locked_id = first["calibrationId"]

        # Run 10 subsequent static frames
        ids = []
        for i in range(3, 13):
            frame = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=i * 0.033)
            ids.append(frame["calibrationId"])

        self.assertTrue(all(cid == locked_id for cid in ids))
        self.assertEqual(len(set(ids)), 1)
        self.assertEqual(len(analyzer.calibration_context.history), 0)

    # 15. shuttle remains image-space
    def test_15_shuttle_remains_image_space(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda f: []

        shuttle_mock = MagicMock()
        shuttle_mock.process_frame.return_value.to_dict.return_value = {
            "positionPx": {"x": 320.0, "y": 240.0},
            "state": "observed",
        }
        analyzer.shuttle_pipeline = shuttle_mock

        # Across calibrated and uncalibrated frames, shuttle remains image-space only
        for i in range(4):
            frame = analyzer.process_frame(synthetic_court_frame(), timestamp_sec=i * 0.033)
            shuttle = frame["shuttle"]
            self.assertEqual(shuttle["positionPx"], {"x": 320.0, "y": 240.0})
            self.assertNotIn("courtPosition", shuttle)
            self.assertNotIn("court_pos_m", shuttle)

    # 16. no NaN / Infinity
    def test_16_no_nan_or_infinity(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda f: []

        test_frames = [
            synthetic_court_frame(),
            non_court_replay_frame(),
            np.zeros((480, 640, 3), dtype=np.uint8),
            np.full((480, 640, 3), 255, dtype=np.uint8),
            np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8),
        ]

        for i, frame in enumerate(test_frames):
            result = analyzer.process_frame(frame, timestamp_sec=i * 0.033)
            # Ensure serialization does not encounter NaN or Inf
            dumped = json.dumps(result)
            self.assertNotIn("NaN", dumped)
            self.assertNotIn("Infinity", dumped)


    # 17. strict candidate acceptance gate
    def test_17_validate_automatic_candidate_acceptance(self):
        # The gate must consume measured provider evidence, not caller-supplied line counts.
        valid_candidate = AutomaticCourtCalibrationProvider().get_candidate(synthetic_court_frame())
        self.assertIsNotNone(valid_candidate)
        ok, reason = validate_automatic_candidate_acceptance(valid_candidate)
        self.assertTrue(ok, f"Expected acceptance but failed with {reason}")

        high_reproj = replace(valid_candidate, reprojection_error_px=55.0)
        ok, reason = validate_automatic_candidate_acceptance(high_reproj)
        self.assertFalse(ok)
        self.assertIn("exceeds", reason)

        unmeasured_few_lines = replace(valid_candidate, supporting_evidence={
            "interior_transverse_count": 1, "interior_longitudinal_count": 0,
        }, reprojection_error_px=None)
        ok, reason = validate_automatic_candidate_acceptance(unmeasured_few_lines)
        self.assertFalse(ok)
        self.assertIsNotNone(reason)

        low_conf = replace(valid_candidate, confidence=0.45)
        ok, reason = validate_automatic_candidate_acceptance(low_conf)
        self.assertFalse(ok)
        self.assertIn("below acceptance threshold", reason)

        # 5. Non-automatic source fails
        manual_candidate = CourtCalibrationCandidate(
            corners_px=((70.0, 35.0), (570.0, 35.0), (570.0, 445.0), (70.0, 445.0)),
            source=CalibrationSource.MANUAL,
            confidence=None,
            supporting_evidence={"mode": "manual"},
            reprojection_error_px=None,
        )
        ok, reason = validate_automatic_candidate_acceptance(manual_candidate)
        self.assertFalse(ok)
        self.assertIn("Expected AUTOMATIC candidate", reason)

    # 18. production tracking session auto calibration wiring
    def test_18_production_tracking_session_wiring(self):
        from server import TrackingSession, resolve_processing_config

        # 1. Default config has autoCourtCalibrationEnabled = False
        default_cfg = resolve_processing_config(None)
        self.assertFalse(default_cfg["autoCourtCalibrationEnabled"])

        # 2. TrackingSession with default config has None auto_calibration_provider
        default_session = TrackingSession(
            session_id="test_court_cal_default",
            game_type="singles",
            tracked_player_count=2,
        )
        self.assertFalse(default_session.effective_processing_config["autoCourtCalibrationEnabled"])
        self.assertIsNone(default_session.analyzer.auto_calibration_provider)

        # 3. TrackingSession with autoCourtCalibrationEnabled=True enables provider
        enabled_session = TrackingSession(
            session_id="test_court_cal_enabled",
            game_type="singles",
            tracked_player_count=2,
            processing_config={"autoCourtCalibrationEnabled": True},
        )
        self.assertTrue(enabled_session.effective_processing_config["autoCourtCalibrationEnabled"])
        self.assertIsNotNone(enabled_session.analyzer.auto_calibration_provider)
        self.assertIsInstance(enabled_session.analyzer.auto_calibration_provider, AutomaticCourtCalibrationProvider)


if __name__ == "__main__":
    unittest.main()
