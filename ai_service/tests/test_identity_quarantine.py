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


if __name__ == "__main__":
    unittest.main()
