"""
test_player_eligibility_pipeline.py — Verification of Phase 3.3 Player Eligibility,
Court Envelope Gating, Temporal Identity Matching, and Motion Metric Continuity.

Validates all Phase 3.3 pipeline stages:
1. Court Envelope: IN_COURT / NEAR_COURT / FAR_OUTSIDE classification with configurable margins.
2. Eligibility Evaluator:
   - Near court excursion allowed (athletes retrieving smash are preserved).
   - Spectators / officials around court classified as SPECTATOR_OR_OFFICIAL and ignored.
   - Non-gameplay scene states (CLOSE_UP, REPLAY) block promoting unknown detections to players.
   - Known player continuity maintained during excursions or close-ups.
3. Player Candidate Selection:
   - Expected count is a constraint/budget, NEVER a command to force-fill.
   - Partial visibility (1 player in singles, 2 in doubles) leaves unobserved slots unresolved.
   - Spectators NEVER promoted to make up numbers.
4. Temporal Identity & Crossing Resolution:
   - Singles net crossing: court-side penalty (+15.0) prevents false swap.
   - Doubles crossing: MOT trackId switch handled while preserving semantic P1/P2 identities.
5. Camera Cut & Motion Continuity:
   - Distance tracker does NOT bridge metrics across camera cut until calibration is valid and relocked.
   - No fake distance spikes or NaN/Inf.
6. Pose Stale Reason & Foot Evidence:
   - Reused or stale pose strictly rejected for ankle positioning; marked is_stale with stale_reason.
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2, PlayerProfile
from court_mapper import CourtMapper, DistanceTracker
from ground_position import (
    resolve_canonical_ground_point,
    CANONICAL_PROVENANCE_BOTH_ANKLES,
    CANONICAL_PROVENANCE_LEFT_ANKLE,
    CANONICAL_PROVENANCE_RIGHT_ANKLE,
    CANONICAL_PROVENANCE_BBOX,
)
from pose_coordinate_space import POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS
from player_eligibility import (
    CourtEnvelopeZone,
    CourtEnvelopeConfig,
    EligibilityStatus,
    PlayerEligibility,
    classify_court_envelope,
    evaluate_player_eligibility,
    select_eligible_player_candidates,
)
from scene_lifecycle import SceneState


def make_coco_keypoints(
    la: tuple[float, float, float] | None = None,
    ra: tuple[float, float, float] | None = None,
) -> list[dict]:
    kps = [{"x": 50.0, "y": 50.0, "score": 0.8} for _ in range(17)]
    if la is not None:
        kps[15] = {"x": float(la[0]), "y": float(la[1]), "score": float(la[2])}
    else:
        kps[15] = {"x": 0.0, "y": 0.0, "score": 0.0}

    if ra is not None:
        kps[16] = {"x": float(ra[0]), "y": float(ra[1]), "score": float(ra[2])}
    else:
        kps[16] = {"x": 0.0, "y": 0.0, "score": 0.0}
    return kps


class TestCourtEnvelopeClassification(unittest.TestCase):
    def setUp(self):
        self.corners = np.array([[100, 100], [1180, 100], [1180, 620], [100, 620]], dtype=np.float32)
        self.mapper = CourtMapper(game_type="singles")
        self.mapper.calibrate(self.corners)
        self.config = CourtEnvelopeConfig(margin_x_m=2.0, margin_y_m=2.5, image_margin_px=60.0)

    def test_in_court_metric(self):
        """Points strictly within singles boundaries (x in [0, 5.18], y in [0, 13.40]) are IN_COURT."""
        zone, dist_m, dist_px = classify_court_envelope(
            ground_px=(640.0, 360.0),
            ground_m=(2.50, 6.70),
            court_corners_px=self.corners,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
        )
        self.assertEqual(zone, CourtEnvelopeZone.IN_COURT)
        self.assertIsNotNone(dist_m)
        self.assertGreaterEqual(dist_m, 0.0)

    def test_near_court_lateral_excursion_metric(self):
        """Points within 2.0m lateral margin outside sideline are NEAR_COURT."""
        # 1.2m outside left sideline (x = -1.2m, within 2.0m margin)
        zone, dist_m, dist_px = classify_court_envelope(
            ground_px=(80.0, 360.0),
            ground_m=(-1.20, 6.70),
            court_corners_px=self.corners,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
        )
        self.assertEqual(zone, CourtEnvelopeZone.NEAR_COURT)
        self.assertIsNotNone(dist_m)
        self.assertLess(dist_m, 0.0)
        self.assertAlmostEqual(dist_m, -1.20, places=2)

    def test_near_court_longitudinal_excursion_metric(self):
        """Points within 2.5m behind baseline are NEAR_COURT."""
        # 1.5m behind near baseline (y = 14.90m, court_l=13.40m, dy=1.5m <= 2.5m)
        zone, dist_m, dist_px = classify_court_envelope(
            ground_px=(640.0, 650.0),
            ground_m=(2.50, 14.90),
            court_corners_px=self.corners,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
        )
        self.assertEqual(zone, CourtEnvelopeZone.NEAR_COURT)
        self.assertIsNotNone(dist_m)
        self.assertLess(dist_m, 0.0)

    def test_far_outside_metric(self):
        """Points beyond 2.0m lateral or 2.5m longitudinal margin are FAR_OUTSIDE."""
        # 3.5m outside sideline (seated linesman or coach)
        zone, dist_m, dist_px = classify_court_envelope(
            ground_px=(20.0, 360.0),
            ground_m=(-3.50, 6.70),
            court_corners_px=self.corners,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
        )
        self.assertEqual(zone, CourtEnvelopeZone.FAR_OUTSIDE)
        self.assertIsNotNone(dist_m)
        self.assertLess(dist_m, -2.0)

    def test_uncalibrated_polygon_fallback(self):
        """When is_metric_valid is False, classify via pixel distance to court polygon."""
        # Center of polygon
        zone, dist_m, dist_px = classify_court_envelope(
            ground_px=(640.0, 360.0),
            ground_m=None,
            court_corners_px=self.corners,
            court_mapper=self.mapper,
            is_metric_valid=False,
            config=self.config,
        )
        self.assertEqual(zone, CourtEnvelopeZone.IN_COURT)
        self.assertGreater(dist_px, 0.0)

        # 30px outside polygon (within image_margin_px=60px)
        zone, dist_m, dist_px = classify_court_envelope(
            ground_px=(70.0, 360.0),
            ground_m=None,
            court_corners_px=self.corners,
            court_mapper=self.mapper,
            is_metric_valid=False,
            config=self.config,
        )
        self.assertEqual(zone, CourtEnvelopeZone.NEAR_COURT)
        self.assertLess(dist_px, 0.0)

        # 120px outside polygon (beyond image_margin_px)
        zone, dist_m, dist_px = classify_court_envelope(
            ground_px=(10.0, 10.0),
            ground_m=None,
            court_corners_px=self.corners,
            court_mapper=self.mapper,
            is_metric_valid=False,
            config=self.config,
        )
        self.assertEqual(zone, CourtEnvelopeZone.FAR_OUTSIDE)
        self.assertLess(dist_px, -60.0)


class TestPlayerEligibilityEvaluation(unittest.TestCase):
    def setUp(self):
        self.corners = np.array([[100, 100], [1180, 100], [1180, 620], [100, 620]], dtype=np.float32)
        self.mapper = CourtMapper(game_type="singles")
        self.mapper.calibrate(self.corners)
        self.config = CourtEnvelopeConfig()

    def test_spectator_in_far_outside_disqualified(self):
        """A person in FAR_OUTSIDE with no prior player history is classified as SPECTATOR_OR_OFFICIAL."""
        det = {"bbox": [10.0, 100.0, 60.0, 220.0], "conf": 0.88, "track_id": 99}
        ground_pt = resolve_canonical_ground_point(
            bbox=det["bbox"],
            frame_width=1280,
            frame_height=720,
            pose_keypoints=None,
            court_mapper=self.mapper,
            is_metric_valid=False,
        )
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=ground_pt,
            envelope_zone=CourtEnvelopeZone.FAR_OUTSIDE,
            envelope_dist_m=-3.8,
            active_profiles={},
            scene_state=SceneState.COURT_PLAY,
        )
        self.assertEqual(elig.status, EligibilityStatus.SPECTATOR_OR_OFFICIAL)
        self.assertFalse(elig.is_eligible_for_profile)
        self.assertIn("detection_far_outside_court_envelope", elig.reasons)

    def test_seated_spectator_aspect_ratio_near_court(self):
        """A person seated (aspect ratio > 0.95) near court is disqualified as SPECTATOR_OR_OFFICIAL."""
        # Seated umpire / linesman: width 90px, height 80px -> aspect ratio > 1.1
        det = {"bbox": [50.0, 300.0, 140.0, 380.0], "conf": 0.85, "track_id": 88}
        ground_pt = resolve_canonical_ground_point(
            bbox=det["bbox"],
            frame_width=1280,
            frame_height=720,
            pose_keypoints=None,
            court_mapper=self.mapper,
            is_metric_valid=False,
        )
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=ground_pt,
            envelope_zone=CourtEnvelopeZone.NEAR_COURT,
            envelope_dist_m=-0.8,
            active_profiles={},
            scene_state=SceneState.COURT_PLAY,
        )
        self.assertEqual(elig.status, EligibilityStatus.SPECTATOR_OR_OFFICIAL)
        self.assertFalse(elig.is_eligible_for_profile)

    def test_player_near_court_excursion_eligible(self):
        """A player making an excursion into NEAR_COURT remains ELIGIBLE."""
        det = {"bbox": [80.0, 200.0, 140.0, 420.0], "conf": 0.89, "track_id": 1}
        ground_pt = resolve_canonical_ground_point(
            bbox=det["bbox"],
            frame_width=1280,
            frame_height=720,
            pose_keypoints=None,
            court_mapper=self.mapper,
            is_metric_valid=True,
        )
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=ground_pt,
            envelope_zone=CourtEnvelopeZone.NEAR_COURT,
            envelope_dist_m=-0.9,
            active_profiles={},
            scene_state=SceneState.COURT_PLAY,
        )
        self.assertEqual(elig.status, EligibilityStatus.ELIGIBLE)
        self.assertTrue(elig.is_eligible_for_profile)
        self.assertIn("player_near_court_excursion", elig.reasons)

    def test_small_source_pixel_ankles_drive_court_projection_and_eligibility(self):
        class RecordingCourtMapper:
            is_calibrated = True
            court_w = 5.18
            court_l = 13.40

            def __init__(self):
                self.projected_points = []

            def pixel_to_real(self, point):
                self.projected_points.append(point)
                return 2.5, 6.7

        det = {"bbox": [40.0, 40.0, 60.0, 100.0], "conf": 0.9, "track_id": 17}
        kps = make_coco_keypoints(la=(50.0, 90.0, 0.9), ra=(50.0, 90.0, 0.9))
        mapper = RecordingCourtMapper()
        ground_pt = resolve_canonical_ground_point(
            bbox=det["bbox"],
            frame_width=1280,
            frame_height=720,
            pose_keypoints=kps,
            pose_coordinate_space=POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS,
            court_mapper=mapper,
            is_metric_valid=True,
        )
        zone, dist_m, dist_px = classify_court_envelope(
            ground_px=ground_pt.ground_px,
            ground_m=ground_pt.ground_position_m,
            court_corners_px=self.corners,
            court_mapper=mapper,
            is_metric_valid=True,
            config=self.config,
        )
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=ground_pt,
            envelope_zone=zone,
            envelope_dist_m=dist_m,
            envelope_dist_px=dist_px,
            active_profiles={},
            scene_state=SceneState.COURT_PLAY,
            is_metric_valid=True,
            config=self.config,
        )

        self.assertEqual(ground_pt.ground_px, (50.0, 90.0))
        self.assertEqual(ground_pt.ground_position_m, (2.5, 6.7))
        self.assertEqual(mapper.projected_points, [(50.0, 90.0)] * 3)
        self.assertEqual(zone, CourtEnvelopeZone.IN_COURT)
        self.assertTrue(elig.is_eligible_for_profile)
        self.assertEqual(elig.status, EligibilityStatus.ELIGIBLE)

    def test_non_gameplay_scene_blocks_new_player(self):
        """Scene states like CLOSE_UP or REPLAY block promoting new unknown tracks to players."""
        det = {"bbox": [300.0, 100.0, 600.0, 650.0], "conf": 0.95, "track_id": 77}
        ground_pt = resolve_canonical_ground_point(
            bbox=det["bbox"],
            frame_width=1280,
            frame_height=720,
            pose_keypoints=None,
            court_mapper=self.mapper,
            is_metric_valid=False,
        )
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=ground_pt,
            envelope_zone=CourtEnvelopeZone.IN_COURT,
            active_profiles={},  # No active profiles have track_id=77
            scene_state=SceneState.CLOSE_UP,
        )
        self.assertFalse(elig.is_eligible_for_profile)
        self.assertIn("scene_state_CLOSE_UP_blocks_new_player", elig.reasons)


class TestPlayerCandidateSelection(unittest.TestCase):
    def test_singles_partial_visibility_leaves_p2_unresolved(self):
        """Singles (budget=2): when only 1 player is visible, returns only 1 candidate without force-fill."""
        d1 = {"track_id": 1, "conf": 0.90, "bbox": [500, 200, 560, 400]}
        e1 = PlayerEligibility(
            status=EligibilityStatus.ELIGIBLE,
            envelope_zone=CourtEnvelopeZone.IN_COURT,
            envelope_distance_m=1.0,
            envelope_distance_px=50.0,
            confidence=0.90,
            is_eligible_for_profile=True,
        )
        candidates = select_eligible_player_candidates(
            detections=[d1],
            eligibilities=[e1],
            max_players=2,
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["track_id"], 1)

    def test_spectators_not_promoted_to_make_up_numbers(self):
        """Spectators in FAR_OUTSIDE are never promoted even if active players are missing."""
        d_player = {"track_id": 1, "conf": 0.92, "bbox": [500, 200, 560, 400]}
        e_player = PlayerEligibility(
            status=EligibilityStatus.ELIGIBLE,
            envelope_zone=CourtEnvelopeZone.IN_COURT,
            envelope_distance_m=1.0,
            envelope_distance_px=50.0,
            confidence=0.92,
            is_eligible_for_profile=True,
        )
        d_umpire = {"track_id": 99, "conf": 0.85, "bbox": [20, 20, 60, 120]}
        e_umpire = PlayerEligibility(
            status=EligibilityStatus.SPECTATOR_OR_OFFICIAL,
            envelope_zone=CourtEnvelopeZone.FAR_OUTSIDE,
            envelope_distance_m=-4.0,
            envelope_distance_px=-120.0,
            confidence=0.85,
            is_eligible_for_profile=False,
        )
        candidates = select_eligible_player_candidates(
            detections=[d_player, d_umpire],
            eligibilities=[e_player, e_umpire],
            max_players=2,  # Singles needs 2, but only 1 is a player!
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["track_id"], 1)

    def test_profile_ineligible_candidate_is_not_sent_to_semantic_matcher(self):
        detection = {"track_id": 99, "conf": 0.9, "bbox": [500, 200, 560, 400]}
        eligibility = PlayerEligibility(
            status=EligibilityStatus.CANDIDATE,
            envelope_zone=CourtEnvelopeZone.IN_COURT,
            envelope_distance_m=1.0,
            envelope_distance_px=50.0,
            confidence=0.45,
            is_eligible_for_profile=False,
        )

        candidates = select_eligible_player_candidates(
            detections=[detection],
            eligibilities=[eligibility],
            max_players=1,
        )

        self.assertEqual(candidates, [])

    def test_candidate_budget_ranking_prioritizes_in_court_over_near_court(self):
        """When more detections qualify than allowed budget, rank by known player and IN_COURT."""
        d1 = {"track_id": 1, "conf": 0.85, "bbox": [100, 100, 150, 300]}
        e1 = PlayerEligibility(
            status=EligibilityStatus.ELIGIBLE,
            envelope_zone=CourtEnvelopeZone.IN_COURT,
            envelope_distance_m=1.0,
            envelope_distance_px=30.0,
            confidence=0.85,
            is_eligible_for_profile=True,
        )
        d2 = {"track_id": 2, "conf": 0.88, "bbox": [200, 100, 250, 300]}
        e2 = PlayerEligibility(
            status=EligibilityStatus.ELIGIBLE,
            envelope_zone=CourtEnvelopeZone.NEAR_COURT,
            envelope_distance_m=-0.5,
            envelope_distance_px=-15.0,
            confidence=0.88,
            is_eligible_for_profile=True,
        )
        # Budget = 1
        candidates = select_eligible_player_candidates(
            detections=[d1, d2],
            eligibilities=[e1, e2],
            max_players=1,
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["track_id"], 1)  # IN_COURT ranked higher than NEAR_COURT


class TestAnalyzerFullPipeline(unittest.TestCase):
    def setUp(self):
        # Realistic court perspective in 1280x720 frame:
        # Top baseline (far): y=220, x in [350, 930]
        # Bottom baseline (near): y=620, x in [250, 1030]
        self.corners = [[350, 220], [930, 220], [1030, 620], [250, 620]]
        self.frame = np.full((720, 1280, 3), 120, dtype=np.uint8)

    def test_analyzer_singles_one_player_no_force_fill(self):
        """In singles with 1 player and 1 spectator, P1 is assigned, P2 is lost without spectator promotion."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)

        # Mock detect_and_track with 1 in-court player (x=630, y=435) and 1 spectator in bleachers (x=50, y=400, >2m outside)
        analyzer.detect_and_track = lambda f: [
            {"bbox": [600, 350, 660, 520], "center": (630, 435), "conf": 0.94, "track_id": 10},
            {"bbox": [20, 360, 80, 440], "center": (50, 400), "conf": 0.88, "track_id": 99},
        ]

        res = analyzer.process_frame(self.frame, timestamp_sec=0.0)
        players = res["players"]
        self.assertEqual(len(players), 2)

        p1 = next(p for p in players if p["playerId"] == "P1")
        p2 = next(p for p in players if p["playerId"] == "P2")

        # P1 is observed and on court
        self.assertEqual(p1["state"], "observed")
        self.assertEqual(p1["trackId"], 10)
        self.assertEqual(p1["envelopeZone"], "IN_COURT")
        self.assertIsNotNone(p1["groundPositionM"])

        # P2 was never seen: remains lost, NOT force-filled with spectator track 99!
        self.assertEqual(p2["state"], "lost")
        self.assertIsNone(p2["trackId"])
        self.assertIsNone(p2["groundPositionM"])
        self.assertIsNone(p2["bboxPct"])

    def test_analyzer_near_court_player_preserved(self):
        """Player in NEAR_COURT (excursion to retrieve shuttle) is preserved as player."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)

        # Player at screen coordinate x=220 (approx 0.7m outside left sideline) -> NEAR_COURT
        analyzer.detect_and_track = lambda f: [
            {"bbox": [200, 360, 240, 520], "center": (220, 440), "conf": 0.91, "track_id": 11}
        ]

        res = analyzer.process_frame(self.frame, timestamp_sec=0.0)
        p1 = res["players"][0]
        self.assertEqual(p1["state"], "observed")
        self.assertEqual(p1["trackId"], 11)
        self.assertEqual(p1["envelopeZone"], "NEAR_COURT")

    def test_analyzer_reused_pose_marked_stale(self):
        """Reused pose is marked stale, includes staleReason, and falls back to bbox bottom center."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, pose_stride=2)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)

        kps = [(630.0, 510.0, 0.90) for _ in range(17)]
        analyzer.pose_adapter = MagicMock()
        analyzer.pose_adapter.estimate_pose_in_roi.return_value = {
            "keypoints": kps,
            "metrics": {},
            "keypointCoordinateSpace": POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS,
        }

        analyzer.detect_and_track = lambda f: [
            {"bbox": [600, 350, 660, 520], "center": (630, 435), "conf": 0.94, "track_id": 10}
        ]

        res1 = analyzer.process_frame(self.frame, timestamp_sec=0.0)
        res2 = analyzer.process_frame(self.frame, timestamp_sec=0.033)
        res3 = analyzer.process_frame(self.frame, timestamp_sec=0.066)

        p_reused = res3["players"][0]
        self.assertTrue(p_reused["isPoseStale"])
        self.assertEqual(p_reused["groundPointProvenance"], CANONICAL_PROVENANCE_BBOX)
        self.assertIsNotNone(p_reused["staleReason"])

    def test_analyzer_camera_cut_prevents_metric_bridging(self):
        """Camera cut breaks metric segment; distance tracker does not bridge across cut."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)

        # Step 1: initial frame
        analyzer.detect_and_track = lambda f: [
            {"bbox": [600, 350, 660, 520], "center": (630, 435), "conf": 0.92, "track_id": 10}
        ]
        analyzer.process_frame(self.frame, timestamp_sec=0.0)

        # Step 2: motion in segment 1
        analyzer.detect_and_track = lambda f: [
            {"bbox": [620, 350, 680, 520], "center": (650, 435), "conf": 0.92, "track_id": 10}
        ]
        res1 = analyzer.process_frame(self.frame, timestamp_sec=0.1)
        dist_before_cut = res1["players"][0]["totalDistanceM"]
        self.assertIsNotNone(dist_before_cut)
        self.assertGreater(dist_before_cut, 0.0)

        # Step 3: Trigger camera cut
        analyzer.start_camera_segment()

        # Step 4: First frame after cut at completely different position
        analyzer.detect_and_track = lambda f: [
            {"bbox": [400, 250, 460, 400], "center": (430, 325), "conf": 0.92, "track_id": 20}
        ]
        res_after_cut = analyzer.process_frame(self.frame, timestamp_sec=0.2)
        # Calibration is lost on cut; metric fields are None
        self.assertEqual(res_after_cut["calibrationState"], "CALIBRATION_LOST")
        self.assertIsNone(res_after_cut["players"][0]["groundPositionM"])

        # Step 5: Recalibrate in new segment
        analyzer.set_court_corners(self.corners)
        res_recal = analyzer.process_frame(self.frame, timestamp_sec=0.3)
        p_recal = res_recal["players"][0]

        # Initial frame after recalibration establishes baseline WITHOUT jumping distance!
        dist_after_recal = p_recal["totalDistanceM"]
        self.assertEqual(dist_after_recal, dist_before_cut)

    def test_new_track_after_camera_cut_stays_raw_and_does_not_become_p1(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)
        analyzer.detect_and_track = lambda frame: [
            {"bbox": [600, 350, 660, 520], "center": (630, 435), "conf": 0.92, "track_id": 10}
        ]
        analyzer.process_frame(self.frame, timestamp_sec=0.0)

        analyzer.start_camera_segment()
        analyzer.detect_and_track = lambda frame: [
            {"bbox": [400, 250, 460, 400], "center": (430, 325), "conf": 0.92, "track_id": 99}
        ]
        analyzer._estimate_pose = lambda frame, bbox: {
            "keypoints": [(430.0, 330.0, 0.9) for _ in range(17)],
            "metrics": {},
            "keypointCoordinateSpace": POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS,
        }

        result = analyzer.process_frame(self.frame, timestamp_sec=0.2)

        p1 = next(player for player in result["players"] if player["playerId"] == "P1")
        self.assertEqual(p1["state"], "lost")
        self.assertIsNone(p1["trackId"])
        self.assertEqual(result["rawPlayerDetections"][0]["trackId"], 99)
        self.assertIsNotNone(result["rawPlayerDetections"][0]["pose"])
        self.assertNotIn("playerId", result["rawPlayerDetections"][0])

    def test_close_up_detection_and_pose_remain_outside_semantic_player_stream(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)
        detection = {"bbox": [600, 350, 660, 520], "center": (630, 435), "conf": 0.92, "track_id": 10}
        analyzer.detect_and_track = lambda frame: [detection]
        analyzer._estimate_pose = lambda frame, bbox: {
            "keypoints": [(630.0, 430.0, 0.9) for _ in range(17)],
            "metrics": {},
            "keypointCoordinateSpace": POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS,
        }
        analyzer.process_frame(self.frame, timestamp_sec=0.0)

        analyzer.set_manual_scene_override(SceneState.CLOSE_UP, "reviewer", "close-up view")
        analyzer.detect_and_track = lambda frame: [dict(detection)]
        result = analyzer.process_frame(self.frame, timestamp_sec=0.1)

        p1 = next(player for player in result["players"] if player["playerId"] == "P1")
        self.assertEqual(p1["state"], "predicted")
        self.assertEqual(result["rawPlayerDetections"][0]["trackId"], 10)
        self.assertIsNotNone(result["rawPlayerDetections"][0]["pose"])

    def test_singles_net_crossing_penalty_prevents_swap(self):
        """Singles players approaching net closely do not swap identities due to court side penalty."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)

        # Frame 1: P1 on top court (far), P2 on bottom court (near)
        analyzer.detect_and_track = lambda f: [
            {"bbox": [600, 260, 660, 380], "center": (630, 320), "conf": 0.92, "track_id": 1},
            {"bbox": [600, 480, 660, 600], "center": (630, 540), "conf": 0.92, "track_id": 2},
        ]
        res1 = analyzer.process_frame(self.frame, timestamp_sec=0.0)
        p1_id = analyzer.profiles[1].track_id
        p2_id = analyzer.profiles[2].track_id
        self.assertEqual(p1_id, 1)
        self.assertEqual(p2_id, 2)

        # Frame 2: Both move close to the net (net is near y=420)
        # P1 is just north of net (y=400), P2 is just south of net (y=440)
        analyzer.detect_and_track = lambda f: [
            {"bbox": [610, 340, 670, 405], "center": (640, 372), "conf": 0.92, "track_id": 1},
            {"bbox": [620, 435, 680, 500], "center": (650, 467), "conf": 0.92, "track_id": 2},
        ]
        res2 = analyzer.process_frame(self.frame, timestamp_sec=0.033)
        self.assertEqual(analyzer.profiles[1].track_id, 1)
        self.assertEqual(analyzer.profiles[2].track_id, 2)

    def test_doubles_crossing_preserves_semantic_identity(self):
        """When two teammates cross, MOT track switches are handled while semantic identities remain."""
        analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=4)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)

        # Frame 1: Seed 4 players with distinct shirt appearances
        frame1 = np.full((720, 1280, 3), 120, dtype=np.uint8)
        frame1[260:380, 400:450] = [0, 0, 255]  # P1 red jersey
        frame1[260:380, 830:880] = [255, 0, 0]  # P2 blue jersey

        analyzer.detect_and_track = lambda f: [
            {"bbox": [400, 260, 450, 380], "center": (425, 320), "conf": 0.90, "track_id": 1},
            {"bbox": [830, 260, 880, 380], "center": (855, 320), "conf": 0.90, "track_id": 2},
            {"bbox": [450, 480, 510, 600], "center": (480, 540), "conf": 0.90, "track_id": 3},
            {"bbox": [750, 480, 810, 600], "center": (780, 540), "conf": 0.90, "track_id": 4},
        ]
        analyzer.process_frame(frame1, timestamp_sec=0.0)

        # Frame 2: P1 and P2 cross paths laterally: MOT tracker swaps tracks 1 and 2
        # Track 2 is now on the red player at x=420, Track 1 is on the blue player at x=810
        frame2 = np.full((720, 1280, 3), 120, dtype=np.uint8)
        frame2[260:380, 420:470] = [0, 0, 255]  # Red player (P1)
        frame2[260:380, 810:860] = [255, 0, 0]  # Blue player (P2)

        analyzer.detect_and_track = lambda f: [
            {"bbox": [420, 260, 470, 380], "center": (445, 320), "conf": 0.90, "track_id": 2},
            {"bbox": [810, 260, 860, 380], "center": (835, 320), "conf": 0.90, "track_id": 1},
            {"bbox": [450, 480, 510, 600], "center": (480, 540), "conf": 0.90, "track_id": 3},
            {"bbox": [750, 480, 810, 600], "center": (780, 540), "conf": 0.90, "track_id": 4},
        ]
        res2 = analyzer.process_frame(frame2, timestamp_sec=0.033)

        # Appearance + spatial continuity preserves semantic identity (P1 stays P1, P2 stays P2)
        self.assertEqual(analyzer.profiles[1].track_id, 2)
        self.assertEqual(analyzer.profiles[2].track_id, 1)
        # Raw MOT switches are distinctly tracked
        self.assertGreater(analyzer.raw_tracker_id_switches, 0)


if __name__ == "__main__":
    unittest.main()
