"""
test_spectator_rejection.py — Comprehensive Verification of Part 10 Spectator Rejection Matrix.

Explicitly tests Scenarios A through J:
- Scenario A: Unknown person in audience seating (FAR_OUTSIDE) -> SPECTATOR_OR_OFFICIAL.
- Scenario B: Unknown coach/official in NEAR_COURT for 10 consecutive frames -> stays CANDIDATE, never promoted.
- Scenario C: Unknown person in court for 1 frame -> awaiting temporal confirmation (min_obs=3).
- Scenario D: Unknown person in court for >= 3 frames -> confirmed and promoted to ELIGIBLE candidate.
- Scenario E: Known player excursion into NEAR_COURT -> preserved as ELIGIBLE player.
- Scenario F: Known player in FAR_OUTSIDE for < 15 frames -> bounded grace continuity preserved.
- Scenario G: Known player in FAR_OUTSIDE for > 15 frames -> transitions to lost/unresolved without outsider hijacking.
- Scenario H: Court calibration lost / uncalibrated -> new identity promotion blocked with courtEligibilityUnavailable=True.
- Scenario I: Singles match with only 1 player visible + spectators -> returns exactly 1 player (no spectator force-fill).
- Scenario J: Doubles match with only 2 players visible + spectators -> returns exactly 2 players (no spectator force-fill).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import PlayerProfile
from court_mapper import CourtMapper
from ground_position import CanonicalGroundPoint, FootObservation, CANONICAL_PROVENANCE_BBOX
from player_eligibility import (
    CourtEnvelopeConfig,
    CourtEnvelopeZone,
    EligibilityStatus,
    PlayerEligibility,
    classify_court_envelope,
    evaluate_player_eligibility,
    select_eligible_player_candidates,
)
from scene_lifecycle import SceneState


class TestSpectatorRejectionMatrix(unittest.TestCase):
    def setUp(self):
        self.config = CourtEnvelopeConfig(
            margin_x_m=2.0,
            margin_y_m=2.5,
            far_outside_margin_m=3.5,
            player_promotion_min_in_court_observations=3,
            far_outside_grace_frames=15,
        )
        self.mapper = CourtMapper(game_type="singles")
        corners = np.array([
            [100.0, 100.0],
            [500.0, 100.0],
            [500.0, 500.0],
            [100.0, 500.0],
        ], dtype=np.float32)
        self.mapper.calibrate(corners)

    def _make_ground_point(self, gx: float, gy: float, conf: float = 0.9) -> CanonicalGroundPoint:
        real = self.mapper.pixel_to_real((gx, gy)) if self.mapper.is_calibrated else None
        return CanonicalGroundPoint(
            ground_px=(gx, gy),
            ground_pct=(gx / 640.0 * 100.0, gy / 640.0 * 100.0),
            ground_position_m=real,
            confidence=conf,
            provenance=CANONICAL_PROVENANCE_BBOX,
            left_foot=FootObservation(),
            right_foot=FootObservation(),
            is_stale=False,
            stale_reason=None,
            pose_source="none",
            pose_age_frames=0,
            pose_age_sec=0.0,
        )

    def test_scenario_a_unknown_person_in_audience_is_spectator(self):
        """Scenario A: Unknown person deep in audience seating (FAR_OUTSIDE) -> SPECTATOR_OR_OFFICIAL."""
        # Ground position far outside court boundary (> 3.5m outside)
        gp = self._make_ground_point(10.0, 10.0)
        zone, dist_m, _ = classify_court_envelope(
            ground_px=gp.ground_px,
            ground_m=gp.ground_position_m,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(zone, CourtEnvelopeZone.FAR_OUTSIDE)

        det = {"track_id": 101, "conf": 0.92, "bbox": [0, 0, 20, 20]}
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=gp,
            envelope_zone=zone,
            envelope_dist_m=dist_m,
            active_profiles={},
            scene_state=SceneState.COURT_PLAY,
            is_metric_valid=True,
            config=self.config,
            in_court_observations=0,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(elig.status, EligibilityStatus.SPECTATOR_OR_OFFICIAL)
        self.assertFalse(elig.is_eligible_for_profile)
        self.assertIn("detection_far_outside_court_envelope", elig.reasons)

    def test_scenario_b_unknown_official_in_near_court_stays_candidate(self):
        """Scenario B: Unknown coach/official in NEAR_COURT for 10 frames -> stays CANDIDATE, never promoted."""
        # Ground point in NEAR_COURT (e.g. 1 meter outside sideline)
        gp = self._make_ground_point(70.0, 300.0)
        zone, dist_m, _ = classify_court_envelope(
            ground_px=gp.ground_px,
            ground_m=gp.ground_position_m,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(zone, CourtEnvelopeZone.NEAR_COURT)

        det = {"track_id": 202, "conf": 0.88, "bbox": [50, 250, 90, 350]}
        for frame in range(1, 11):
            elig = evaluate_player_eligibility(
                detection=det,
                ground_point=gp,
                envelope_zone=zone,
                envelope_dist_m=dist_m,
                active_profiles={},
                scene_state=SceneState.COURT_PLAY,
                is_metric_valid=True,
                config=self.config,
                in_court_observations=0,
                calibration_state="CALIBRATED",
            )
            self.assertEqual(elig.status, EligibilityStatus.CANDIDATE, f"Failed at frame {frame}")
            self.assertFalse(elig.is_eligible_for_profile, f"Must not be eligible for profile at frame {frame}")
            self.assertIn("unknown_person_near_court_candidate_only", elig.reasons)

    def test_scenario_c_unknown_person_in_court_frame_1_awaits_confirmation(self):
        """Scenario C: Unknown person in court for 1 frame -> awaits temporal confirmation (min_obs=3)."""
        # Ground point in court center
        gp = self._make_ground_point(300.0, 300.0)
        zone, dist_m, _ = classify_court_envelope(
            ground_px=gp.ground_px,
            ground_m=gp.ground_position_m,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(zone, CourtEnvelopeZone.IN_COURT)

        det = {"track_id": 303, "conf": 0.90, "bbox": [280, 250, 320, 350]}
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=gp,
            envelope_zone=zone,
            envelope_dist_m=dist_m,
            active_profiles={},
            scene_state=SceneState.COURT_PLAY,
            is_metric_valid=True,
            config=self.config,
            in_court_observations=1,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(elig.status, EligibilityStatus.CANDIDATE)
        self.assertFalse(elig.is_eligible_for_profile)
        self.assertIn("awaiting_in_court_confirmation", elig.reasons)

    def test_scenario_d_unknown_person_in_court_3_frames_is_promoted(self):
        """Scenario D: Unknown person in court for >= 3 frames -> promoted to player candidate (ELIGIBLE)."""
        gp = self._make_ground_point(300.0, 300.0)
        zone, dist_m, _ = classify_court_envelope(
            ground_px=gp.ground_px,
            ground_m=gp.ground_position_m,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
            calibration_state="CALIBRATED",
        )
        det = {"track_id": 303, "conf": 0.90, "bbox": [280, 250, 320, 350]}

        # Observation 3
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=gp,
            envelope_zone=zone,
            envelope_dist_m=dist_m,
            active_profiles={},
            scene_state=SceneState.COURT_PLAY,
            is_metric_valid=True,
            config=self.config,
            in_court_observations=3,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(elig.status, EligibilityStatus.ELIGIBLE)
        self.assertTrue(elig.is_eligible_for_profile)
        self.assertIn("player_in_court_confirmed", elig.reasons)

    def test_scenario_e_known_player_excursion_into_near_court_preserved(self):
        """Scenario E: Known player excursion into NEAR_COURT -> preserved as ELIGIBLE player."""
        gp = self._make_ground_point(70.0, 300.0)
        zone, dist_m, _ = classify_court_envelope(
            ground_px=gp.ground_px,
            ground_m=gp.ground_position_m,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(zone, CourtEnvelopeZone.NEAR_COURT)

        p1 = PlayerProfile(player_id=1, team=1)
        p1.track_id = 42
        p1.missed_frames = 0
        active_profiles = {1: p1}

        det = {"track_id": 42, "conf": 0.91, "bbox": [50, 250, 90, 350]}
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=gp,
            envelope_zone=zone,
            envelope_dist_m=dist_m,
            active_profiles=active_profiles,
            scene_state=SceneState.COURT_PLAY,
            is_metric_valid=True,
            config=self.config,
            in_court_observations=0,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(elig.status, EligibilityStatus.ELIGIBLE)
        self.assertTrue(elig.is_eligible_for_profile)
        self.assertIn("player_near_court_excursion", elig.reasons)

    def test_scenario_f_known_player_far_outside_grace_period_preserved(self):
        """Scenario F: Known player in FAR_OUTSIDE for < 15 frames -> bounded grace continuity preserved."""
        gp = self._make_ground_point(10.0, 10.0)
        zone, dist_m, _ = classify_court_envelope(
            ground_px=gp.ground_px,
            ground_m=gp.ground_position_m,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(zone, CourtEnvelopeZone.FAR_OUTSIDE)

        p1 = PlayerProfile(player_id=1, team=1)
        p1.track_id = 42
        p1.missed_frames = 0
        active_profiles = {1: p1}

        det = {"track_id": 42, "conf": 0.88, "bbox": [0, 0, 20, 20]}
        # 10 frames far outside (< 15 limit)
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=gp,
            envelope_zone=zone,
            envelope_dist_m=dist_m,
            active_profiles=active_profiles,
            scene_state=SceneState.COURT_PLAY,
            is_metric_valid=True,
            config=self.config,
            in_court_observations=0,
            far_outside_frames=10,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(elig.status, EligibilityStatus.CANDIDATE)
        self.assertTrue(elig.is_eligible_for_profile)
        self.assertIn("known_player_excursion_far_outside", elig.reasons)

    def test_scenario_g_known_player_far_outside_exceeding_grace_becomes_unresolved(self):
        """Scenario G: Known player in FAR_OUTSIDE for > 15 frames -> transitions to lost/unresolved."""
        gp = self._make_ground_point(10.0, 10.0)
        zone, dist_m, _ = classify_court_envelope(
            ground_px=gp.ground_px,
            ground_m=gp.ground_position_m,
            court_mapper=self.mapper,
            is_metric_valid=True,
            config=self.config,
            calibration_state="CALIBRATED",
        )
        p1 = PlayerProfile(player_id=1, team=1)
        p1.track_id = 42
        p1.missed_frames = 0
        active_profiles = {1: p1}

        det = {"track_id": 42, "conf": 0.88, "bbox": [0, 0, 20, 20]}
        # 16 frames far outside (> 15 limit)
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=gp,
            envelope_zone=zone,
            envelope_dist_m=dist_m,
            active_profiles=active_profiles,
            scene_state=SceneState.COURT_PLAY,
            is_metric_valid=True,
            config=self.config,
            in_court_observations=0,
            far_outside_frames=16,
            calibration_state="CALIBRATED",
        )
        self.assertEqual(elig.status, EligibilityStatus.UNRESOLVED)
        self.assertFalse(elig.is_eligible_for_profile)
        self.assertIn("known_player_excursion_grace_expired", elig.reasons)

    def test_scenario_h_uncalibrated_blocks_new_identity_promotion(self):
        """Scenario H: Court calibration uncalibrated -> new identity promotion blocked."""
        gp = self._make_ground_point(300.0, 300.0)
        zone, dist_m, _ = classify_court_envelope(
            ground_px=gp.ground_px,
            ground_m=None,
            court_corners_px=None,
            court_mapper=None,
            is_metric_valid=False,
            config=self.config,
            calibration_state="UNCALIBRATED",
        )
        self.assertEqual(zone, CourtEnvelopeZone.UNAVAILABLE)

        det = {"track_id": 505, "conf": 0.92, "bbox": [280, 250, 320, 350]}
        elig = evaluate_player_eligibility(
            detection=det,
            ground_point=gp,
            envelope_zone=zone,
            envelope_dist_m=dist_m,
            active_profiles={},
            scene_state=SceneState.COURT_PLAY,
            is_metric_valid=False,
            config=self.config,
            in_court_observations=5,
            calibration_state="UNCALIBRATED",
        )
        self.assertEqual(elig.status, EligibilityStatus.UNRESOLVED)
        self.assertFalse(elig.is_eligible_for_profile)
        self.assertTrue(elig.to_dict()["courtEligibilityUnavailable"])
        self.assertTrue(elig.provenance["courtEligibilityUnavailable"])
        self.assertIn("court_eligibility_unavailable", elig.reasons)

    def test_scenario_i_singles_one_player_visible_no_spectator_force_fill(self):
        """Scenario I: Singles match with 1 player visible + spectators -> returns exactly 1 player."""
        # 1 valid confirmed in-court player
        det_player = {"track_id": 1, "conf": 0.95, "bbox": [200, 200, 240, 300]}
        elig_player = PlayerEligibility(
            status=EligibilityStatus.ELIGIBLE,
            envelope_zone=CourtEnvelopeZone.IN_COURT,
            envelope_distance_m=1.0,
            envelope_distance_px=None,
            confidence=0.95,
            reasons=["player_in_court_confirmed"],
            is_eligible_for_profile=True,
            provenance={"isKnownPlayer": False, "inCourtObservations": 5},
        )

        # 3 spectators in audience
        det_spec1 = {"track_id": 10, "conf": 0.85, "bbox": [10, 10, 30, 40]}
        elig_spec1 = PlayerEligibility(
            status=EligibilityStatus.SPECTATOR_OR_OFFICIAL,
            envelope_zone=CourtEnvelopeZone.FAR_OUTSIDE,
            envelope_distance_m=-4.0,
            envelope_distance_px=None,
            confidence=0.85,
            reasons=["spectator_far_outside"],
            is_eligible_for_profile=False,
        )
        det_spec2 = {"track_id": 11, "conf": 0.80, "bbox": [580, 10, 600, 40]}
        elig_spec2 = PlayerEligibility(
            status=EligibilityStatus.SPECTATOR_OR_OFFICIAL,
            envelope_zone=CourtEnvelopeZone.FAR_OUTSIDE,
            envelope_distance_m=-4.5,
            envelope_distance_px=None,
            confidence=0.80,
            reasons=["spectator_far_outside"],
            is_eligible_for_profile=False,
        )

        candidates = select_eligible_player_candidates(
            detections=[det_player, det_spec1, det_spec2],
            eligibilities=[elig_player, elig_spec1, elig_spec2],
            max_players=2,  # Singles capacity
        )

        # Invariant: exactly 1 player returned, NOT force-filled with a spectator!
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["track_id"], 1)

    def test_scenario_j_doubles_two_players_visible_no_spectator_force_fill(self):
        """Scenario J: Doubles match with 2 players visible + spectators -> returns exactly 2 players."""
        det_p1 = {"track_id": 1, "conf": 0.94, "bbox": [200, 200, 240, 300]}
        elig_p1 = PlayerEligibility(
            status=EligibilityStatus.ELIGIBLE,
            envelope_zone=CourtEnvelopeZone.IN_COURT,
            envelope_distance_m=1.0,
            envelope_distance_px=None,
            confidence=0.94,
            reasons=["player_in_court_confirmed"],
            is_eligible_for_profile=True,
            provenance={"isKnownPlayer": True},
        )
        det_p2 = {"track_id": 2, "conf": 0.91, "bbox": [400, 200, 440, 300]}
        elig_p2 = PlayerEligibility(
            status=EligibilityStatus.ELIGIBLE,
            envelope_zone=CourtEnvelopeZone.IN_COURT,
            envelope_distance_m=1.2,
            envelope_distance_px=None,
            confidence=0.91,
            reasons=["player_in_court_confirmed"],
            is_eligible_for_profile=True,
            provenance={"isKnownPlayer": True},
        )

        # 2 near-court officials who are not players
        det_off1 = {"track_id": 20, "conf": 0.89, "bbox": [70, 300, 90, 350]}
        elig_off1 = PlayerEligibility(
            status=EligibilityStatus.CANDIDATE,
            envelope_zone=CourtEnvelopeZone.NEAR_COURT,
            envelope_distance_m=-0.5,
            envelope_distance_px=None,
            confidence=0.89,
            reasons=["near_court_unknown_candidate"],
            is_eligible_for_profile=False,
        )
        det_off2 = {"track_id": 21, "conf": 0.87, "bbox": [530, 300, 550, 350]}
        elig_off2 = PlayerEligibility(
            status=EligibilityStatus.CANDIDATE,
            envelope_zone=CourtEnvelopeZone.NEAR_COURT,
            envelope_distance_m=-0.6,
            envelope_distance_px=None,
            confidence=0.87,
            reasons=["near_court_unknown_candidate"],
            is_eligible_for_profile=False,
        )

        candidates = select_eligible_player_candidates(
            detections=[det_p1, det_p2, det_off1, det_off2],
            eligibilities=[elig_p1, elig_p2, elig_off1, elig_off2],
            max_players=4,  # Doubles capacity
        )

        # Invariant: exactly 2 players returned, NOT force-filled to 4 with officials!
        self.assertEqual(len(candidates), 2)
        candidate_ids = {c["track_id"] for c in candidates}
        self.assertEqual(candidate_ids, {1, 2})


if __name__ == "__main__":
    unittest.main()
