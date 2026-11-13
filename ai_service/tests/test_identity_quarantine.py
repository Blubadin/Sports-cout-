"""
test_identity_quarantine.py — Part 11 Anti-Hijack Identity Quarantine Tests.

Verifies:
1. Outsider track in NEAR_COURT or FAR_OUTSIDE attempting to hijack an established
   player slot incurs the quarantine penalty (+50.0).
2. With quarantine penalty (+50.0), total cost exceeds the Hungarian assignment gate (25.0),
   blocking hijack even if distance/appearance seems plausible.
3. Returning player IN_COURT incurs 0.0 quarantine penalty and successfully associates.
4. Quarantine penalty is recorded in SemanticIdentityCosts and serialized into telemetry.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import PlayerProfile
from player_eligibility import CourtEnvelopeZone
from semantic_identity import (
    SemanticIdentityCosts,
    compute_identity_association_cost,
    match_tracks_to_profiles_with_reid,
)


class TestIdentityQuarantine(unittest.TestCase):
    def setUp(self):
        self.profile = PlayerProfile(player_id=1, team=1)
        self.profile.track_id = 10
        self.profile.last_real_pos = (2.5, 3.0)  # Near baseline
        self.profile.last_bbox = [200, 200, 240, 300]
        self.profile.missed_frames = 2  # Temporarily missed for 2 frames

    def test_outsider_in_near_court_incurs_quarantine_penalty(self):
        """Outsider track in NEAR_COURT incurs +50.0 quarantine penalty when attempting to match lost player."""
        det = {
            "track_id": 99,  # New track ID (different from profile.track_id=10)
            "conf": 0.90,
            "bbox": [210, 205, 250, 305],
            "real_pos": (2.6, 3.1),
            "envelope_zone": CourtEnvelopeZone.NEAR_COURT,
        }

        breakdown = compute_identity_association_cost(
            profile=self.profile,
            detection=det,
            frame=None,
        )

        self.assertEqual(breakdown.quarantine_penalty, 50.0)
        self.assertGreater(breakdown.total_cost, 25.0)  # Exceeds the 25.0 Hungarian gate!
        serialized = breakdown.to_dict()
        self.assertEqual(serialized["quarantinePenalty"], 50.0)

    def test_outsider_in_far_outside_incurs_quarantine_penalty(self):
        """Outsider track in FAR_OUTSIDE incurs +50.0 quarantine penalty."""
        det = {
            "track_id": 99,
            "conf": 0.85,
            "bbox": [50, 50, 90, 150],
            "real_pos": (0.5, 0.5),
            "envelope_zone": CourtEnvelopeZone.FAR_OUTSIDE,
        }

        breakdown = compute_identity_association_cost(
            profile=self.profile,
            detection=det,
            frame=None,
        )

        self.assertEqual(breakdown.quarantine_penalty, 50.0)
        self.assertGreater(breakdown.total_cost, 25.0)

    def test_returning_player_in_court_has_zero_quarantine_penalty(self):
        """Legitimate player observed IN_COURT incurs 0.0 quarantine penalty."""
        det = {
            "track_id": 10,  # Same track ID
            "conf": 0.95,
            "bbox": [202, 202, 242, 302],
            "real_pos": (2.52, 3.02),
            "envelope_zone": CourtEnvelopeZone.IN_COURT,
        }

        breakdown = compute_identity_association_cost(
            profile=self.profile,
            detection=det,
            frame=None,
        )

        self.assertEqual(breakdown.quarantine_penalty, 0.0)
        self.assertLess(breakdown.total_cost, 25.0)  # Successfully passes gate

    def test_hungarian_matching_blocks_outsider_hijack_when_player_track_lost(self):
        """Hungarian matching strictly blocks outsider in NEAR_COURT from hijacking lost player identity."""
        p1 = PlayerProfile(player_id=1, team=1)
        p1.track_id = 10
        p1.last_real_pos = (2.5, 3.0)
        p1.last_bbox = [200, 200, 240, 300]
        p1.missed_frames = 2

        profiles = {1: p1}

        # Outsider track 99 in NEAR_COURT
        det_outsider = {
            "track_id": 99,
            "conf": 0.90,
            "bbox": [205, 205, 245, 305],
            "real_pos": (2.55, 3.05),
            "envelope_zone": CourtEnvelopeZone.NEAR_COURT,
        }

        matched, cost_breakdowns, raw_switches, sem_switches = match_tracks_to_profiles_with_reid(
            profiles=profiles,
            detections=[det_outsider],
            frame=np.zeros((480, 640, 3), dtype=np.uint8),
            dist_tracker=None,
        )

        # Invariant: P1 is NOT hijacked by outsider track 99!
        self.assertNotIn(1, matched)

    def test_changed_mot_id_requires_three_confirmed_frames_before_updating_profile(self):
        profile = self.profile
        image = np.full((480, 640, 3), 120, dtype=np.uint8)
        replacement_track = {
            "track_id": 11,
            "conf": 0.95,
            "bbox": [200, 200, 240, 300],
            "center": (220, 300),
            "real_pos": (2.5, 3.0),
        }
        owners = {10: 1}

        for _ in range(2):
            matched, _, _, semantic_switches = match_tracks_to_profiles_with_reid(
                {1: profile}, [dict(replacement_track)], image, None,
                last_known_track_owners=owners,
            )
            self.assertEqual(matched, {})
            self.assertEqual(profile.track_id, 10)
            self.assertIsNone(profile.color_hist)
            self.assertEqual(semantic_switches, 0)
            self.assertNotIn(11, owners)

        matched, _, raw_switches, semantic_switches = match_tracks_to_profiles_with_reid(
            {1: profile}, [dict(replacement_track)], image, None,
            last_known_track_owners=owners,
        )
        self.assertEqual(matched[1]["track_id"], 11)
        self.assertEqual(profile.track_id, 11)
        self.assertIsNotNone(profile.color_hist)
        self.assertEqual(raw_switches, 1)
        self.assertEqual(semantic_switches, 0)

    def test_missing_frame_resets_changed_mot_id_confirmation(self):
        profile = self.profile
        image = np.full((480, 640, 3), 120, dtype=np.uint8)
        replacement_track = {
            "track_id": 11,
            "conf": 0.95,
            "bbox": [200, 200, 240, 300],
            "center": (220, 300),
            "real_pos": (2.5, 3.0),
        }

        for _ in range(2):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {1: profile}, [dict(replacement_track)], image, None,
            )
            self.assertEqual(matched, {})
        self.assertEqual(profile.identity_confirmation_frames, 2)

        matched, _, _, _ = match_tracks_to_profiles_with_reid({1: profile}, [], image, None)
        self.assertEqual(matched, {})
        self.assertEqual(profile.identity_confirmation_frames, 0)

        for _ in range(2):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {1: profile}, [dict(replacement_track)], image, None,
            )
            self.assertEqual(matched, {})
            self.assertEqual(profile.track_id, 10)
        matched, _, raw_switches, _ = match_tracks_to_profiles_with_reid(
            {1: profile}, [dict(replacement_track)], image, None,
        )
        self.assertEqual(matched[1]["track_id"], 11)
        self.assertEqual(raw_switches, 1)

    def test_cost_gate_rejection_resets_changed_mot_id_confirmation(self):
        profile = self.profile
        image = np.full((480, 640, 3), 120, dtype=np.uint8)
        replacement_track = {
            "track_id": 11,
            "conf": 0.95,
            "bbox": [200, 200, 240, 300],
            "center": (220, 300),
            "real_pos": (2.5, 3.0),
        }
        for _ in range(2):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {1: profile}, [dict(replacement_track)], image, None,
            )
            self.assertEqual(matched, {})
        self.assertEqual(profile.identity_confirmation_frames, 2)

        rejected = dict(replacement_track, real_pos=(2.5, 50.0))
        matched, _, _, _ = match_tracks_to_profiles_with_reid(
            {1: profile}, [rejected], image, None,
        )
        self.assertEqual(matched, {})
        self.assertEqual(profile.identity_confirmation_frames, 0)
        self.assertIsNone(profile.identity_confirmation_track)

        for _ in range(2):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {1: profile}, [dict(replacement_track)], image, None,
            )
            self.assertEqual(matched, {})
        matched, _, raw_switches, _ = match_tracks_to_profiles_with_reid(
            {1: profile}, [dict(replacement_track)], image, None,
        )
        self.assertEqual(matched[1]["track_id"], 11)
        self.assertEqual(raw_switches, 1)

    def test_previously_owned_lost_track_cannot_be_hijacked_without_appearance_evidence(self):
        p1 = PlayerProfile(player_id=1, team=1)
        p1.track_id = 99
        p1.missed_frames = 35
        p1.identity_established = True
        p1.identity_needs_reacquisition = True
        p2 = PlayerProfile(player_id=2, team=1)
        p2.track_id = 20
        p2.last_real_pos = (2.5, 3.0)
        p2.last_bbox = [50, 30, 100, 160]
        owners = {99: 1, 20: 2}
        detection = {
            "track_id": 99, "conf": .9, "bbox": [50, 30, 100, 160],
            "center": (75, 160), "real_pos": (2.5, 3.0),
        }

        for _ in range(3):
            matched, _, _, semantic_switches = match_tracks_to_profiles_with_reid(
                {1: p1, 2: p2}, [dict(detection)], np.zeros((200, 200, 3), dtype=np.uint8),
                None, last_known_track_owners=owners,
            )
            self.assertNotIn(2, matched)
            self.assertEqual(semantic_switches, 0)

    def _lost_profile(self, pid, team, track):
        p = PlayerProfile(player_id=pid, team=team)
        p.track_id = track
        p.missed_frames = 35
        p.identity_established = True
        p.identity_needs_reacquisition = True
        p.shoe_color = "DARK"
        return p

    def test_unique_lost_teammate_is_reacquired_by_side_elimination(self):
        lost = self._lost_profile(1, 1, 99)
        live = PlayerProfile(player_id=2, team=1)
        live.track_id = 20
        live.last_real_pos = (2.5, 3.0)
        live.last_bbox = [50, 30, 100, 160]
        owners = {99: 1, 20: 2}
        img = np.random.default_rng(0).integers(0, 256, (200, 200, 3), dtype=np.uint8)
        dets = [
            {"track_id": 20, "conf": .9, "bbox": [50, 30, 100, 160], "center": (75, 160), "real_pos": (2.5, 3.0)},
            {"track_id": 55, "conf": .9, "bbox": [120, 30, 170, 160], "center": (145, 160), "real_pos": (4.5, 3.5)},
        ]
        matched = {}
        for _ in range(3):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {1: lost, 2: live}, [dict(d) for d in dets], img, None, last_known_track_owners=owners)
        self.assertEqual(matched[1]["track_id"], 55)
        self.assertEqual(matched[2]["track_id"], 20)

    def test_two_free_detections_for_one_lost_teammate_stay_ambiguous(self):
        lost = self._lost_profile(1, 1, 99)
        img = np.random.default_rng(0).integers(0, 256, (200, 200, 3), dtype=np.uint8)
        dets = [
            {"track_id": 55, "conf": .9, "bbox": [50, 30, 100, 160], "center": (75, 160), "real_pos": (2.5, 3.0)},
            {"track_id": 56, "conf": .9, "bbox": [120, 30, 170, 160], "center": (145, 160), "real_pos": (4.5, 3.5)},
        ]
        for _ in range(4):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {1: lost}, [dict(d) for d in dets], img, None, last_known_track_owners={99: 1})
            self.assertNotIn(1, matched)

    def test_opposite_side_detection_is_not_reacquired(self):
        lost = self._lost_profile(1, 1, 99)
        img = np.random.default_rng(0).integers(0, 256, (200, 200, 3), dtype=np.uint8)
        det = {"track_id": 55, "conf": .9, "bbox": [50, 30, 100, 160], "center": (75, 160), "real_pos": (2.5, 10.0)}
        for _ in range(4):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {1: lost}, [dict(det)], img, None, last_known_track_owners={99: 1})
            self.assertNotIn(1, matched)

    def test_lost_player_cannot_cross_net_while_live_teammate_on_home_side(self):
        lost = self._lost_profile(4, 2, 99)
        mate = PlayerProfile(player_id=3, team=2)
        mate.track_id = 20
        mate.last_real_pos = (2.5, 10.0)
        mate.last_bbox = [50, 30, 100, 160]
        img = np.random.default_rng(1).integers(0, 256, (200, 200, 3), dtype=np.uint8)
        dets = [
            {"track_id": 20, "conf": .9, "bbox": [50, 30, 100, 160], "center": (75, 160), "real_pos": (2.5, 10.0)},
            {"track_id": 55, "conf": .9, "bbox": [120, 30, 170, 160], "center": (145, 160), "real_pos": (4.5, 3.0)},
        ]
        for _ in range(5):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {4: lost, 3: mate}, [dict(d) for d in dets], img, None, last_known_track_owners={99: 4, 20: 3})
            self.assertNotIn(4, matched)

    def test_doubles_auto_seed_never_puts_near_athlete_into_far_slot(self):
        profiles = {i: PlayerProfile(player_id=i, team=0) for i in (1, 2, 3, 4)}
        img = np.random.default_rng(2).integers(0, 256, (200, 200, 3), dtype=np.uint8)
        dets = [  # one far athlete, two near athletes
            {"track_id": 1, "conf": .9, "bbox": [10, 10, 50, 90], "center": (30, 90), "real_pos": (2.0, 3.0)},
            {"track_id": 2, "conf": .9, "bbox": [60, 100, 100, 190], "center": (80, 190), "real_pos": (2.0, 10.0)},
            {"track_id": 3, "conf": .9, "bbox": [120, 100, 160, 190], "center": (140, 190), "real_pos": (4.0, 10.5)},
        ]
        matched, _, _, _ = match_tracks_to_profiles_with_reid(
            profiles, [dict(d) for d in dets], img, None)
        self.assertEqual(matched[1]["track_id"], 1)
        self.assertNotIn(2, matched)
        self.assertEqual({matched[3]["track_id"], matched[4]["track_id"]}, {2, 3})

    def test_lost_teammate_without_appearance_evidence_is_still_reacquired_by_side(self):
        lost = PlayerProfile(player_id=2, team=1)
        lost.track_id = 99
        lost.missed_frames = 35
        lost.identity_established = True
        lost.identity_needs_reacquisition = True
        live = PlayerProfile(player_id=1, team=1)
        live.track_id = 20
        live.last_real_pos = (2.5, 3.0)
        live.last_bbox = [50, 30, 100, 160]
        img = np.random.default_rng(3).integers(0, 256, (200, 200, 3), dtype=np.uint8)
        dets = [
            {"track_id": 20, "conf": .9, "bbox": [50, 30, 100, 160], "center": (75, 160), "real_pos": (2.5, 3.0)},
            {"track_id": 55, "conf": .9, "bbox": [120, 30, 170, 160], "center": (145, 160), "real_pos": (4.5, 3.5)},
        ]
        matched = {}
        for _ in range(3):
            matched, _, _, _ = match_tracks_to_profiles_with_reid(
                {1: live, 2: lost}, [dict(d) for d in dets], img, None, last_known_track_owners={99: 2, 20: 1})
        self.assertEqual(matched[2]["track_id"], 55)

    def test_unlinked_filtered_candidate_is_not_attributed_to_every_player(self):
        analyzer = __import__("analyzer_v2").BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer._last_court_filter_counts = {
            "active": True,
            "calibrationAvailable": True,
            "candidateCount": 4,
            "acceptedCount": 2,
            "rejectedOutsideCourtCount": 2,
        }

        reason = analyzer._tracking_reason_for_profile(
            analyzer.profiles[1], "lost", [{"track_id": 7}], metric_valid=True,
        )

        self.assertEqual(reason, "ASSOCIATION_REJECTED")

    def test_all_filtered_candidates_have_a_frame_level_loss_reason(self):
        analyzer = __import__("analyzer_v2").BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer._last_court_filter_counts = {
            "active": True,
            "calibrationAvailable": True,
            "candidateCount": 3,
            "acceptedCount": 0,
            "rejectedOutsideCourtCount": 3,
        }

        reason = analyzer._tracking_reason_for_profile(
            analyzer.profiles[1], "lost", [], metric_valid=True,
        )

        self.assertEqual(reason, "COURT_FILTER_REJECTED_ALL")


if __name__ == "__main__":
    unittest.main()
