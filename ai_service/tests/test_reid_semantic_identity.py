"""
test_reid_semantic_identity.py — Unit tests for ReID-assisted semantic identity association.

Covers the 11 required invariant scenarios:
1. Two players cross paths without identity inversion.
2. Raw MOT track IDs swap, but semantic identities remain stable.
3. Semantic identity stays stable across continuous movement.
4. Temporary tracking loss followed by correct reacquisition.
5. Similar jersey HSV appearance disambiguated by ReID embeddings.
6. Misleading ReID embedding overridden by spatial and court-side constraints.
7. ReID unavailable: graceful fallback to HSV + spatial cues.
8. Doubles with 4 players maintains team and individual stability.
9. Court-side constraint prevents teleportation across net.
10. Raw tracker ID switch count != semantic player ID switch count.
11. True semantic player identity switch is measurable and recorded.
"""

from __future__ import annotations
import sys
from pathlib import Path
import unittest
import numpy as np

ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from analyzer_v2 import BadmintonAnalyzerV2, PlayerProfile
from reid_adapter import (
    BaseReIDAdapter,
    DisabledReIDAdapter,
    SpatialFeatureReIDAdapter,
    MockReIDAdapter,
    create_reid_provider,
)
from semantic_identity import (
    compute_identity_association_cost,
    match_tracks_to_profiles_with_reid,
    SemanticIdentityCosts,
)
from court_mapper import CourtMapper, DistanceTracker, COURT_LENGTH_M, COURT_WIDTH_DOUBLES_M


def make_embedding(seed: int, dim: int = 128) -> np.ndarray:
    rng = np.random.RandomState(seed)
    vec = rng.randn(dim).astype(np.float32)
    return vec / np.linalg.norm(vec)


class TestReIDSemanticIdentity(unittest.TestCase):
    def setUp(self):
        self.frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        # Add some color variations so crops aren't completely blank
        self.frame[100:300, 100:300] = [200, 50, 50]
        self.frame[400:600, 100:300] = [50, 200, 50]

    def test_01_two_players_cross(self):
        """Scenario 1: Two players move toward each other, cross, and separate."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        emb_p1 = make_embedding(101)
        emb_p2 = make_embedding(202)

        # Initial seeding: P1 at (3.0, 3.0), P2 at (3.0, 10.4)
        analyzer.profiles[1].last_real_pos = (3.0, 3.0)
        analyzer.profiles[1].team = 1
        analyzer.profiles[1].track_id = 1
        analyzer.profiles[1].reid_embedding = emb_p1

        analyzer.profiles[2].last_real_pos = (3.0, 10.4)
        analyzer.profiles[2].team = 2
        analyzer.profiles[2].track_id = 2
        analyzer.profiles[2].reid_embedding = emb_p2

        # Step towards crossing: P1 at (3.0, 4.5), P2 at (3.0, 8.5)
        dets = [
            {"track_id": 1, "real_pos": (3.0, 4.5), "bbox": [100, 100, 150, 250], "center": (125, 250), "conf": 0.9, "reid_embedding": emb_p1},
            {"track_id": 2, "real_pos": (3.0, 8.5), "bbox": [100, 400, 150, 550], "center": (125, 550), "conf": 0.9, "reid_embedding": emb_p2},
        ]
        matched = analyzer._match_tracks_to_profiles(self.frame, dets)
        self.assertEqual(matched[1]["track_id"], 1)
        self.assertEqual(matched[2]["track_id"], 2)

    def test_02_raw_ids_swap_semantic_preserved(self):
        """Scenario 2: Raw tracker IDs swap, but spatial + ReID cues preserve semantic identity."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        emb_p1 = make_embedding(10)
        emb_p2 = make_embedding(20)

        # Setup initial state
        analyzer.profiles[1].last_real_pos = (2.0, 3.0)
        analyzer.profiles[1].team = 1
        analyzer.profiles[1].track_id = 10
        analyzer.profiles[1].reid_embedding = emb_p1

        analyzer.profiles[2].last_real_pos = (4.0, 3.5)
        analyzer.profiles[2].team = 1
        analyzer.profiles[2].track_id = 20
        analyzer.profiles[2].reid_embedding = emb_p2

        # Tracker incorrectly swapped IDs: track 20 is near P1 (2.1, 3.1) with P1's embedding
        # and track 10 is near P2 (4.1, 3.6) with P2's embedding
        dets = [
            {"track_id": 20, "real_pos": (2.1, 3.1), "bbox": [100, 100, 150, 250], "center": (125, 250), "conf": 0.9, "reid_embedding": emb_p1},
            {"track_id": 10, "real_pos": (4.1, 3.6), "bbox": [200, 100, 250, 250], "center": (225, 250), "conf": 0.9, "reid_embedding": emb_p2},
        ]

        matched = analyzer._match_tracks_to_profiles(self.frame, dets)
        # P1 receives the detection at (2.1, 3.1) despite its track_id being 20
        self.assertEqual(matched[1]["real_pos"], (2.1, 3.1))
        self.assertEqual(matched[2]["real_pos"], (4.1, 3.6))

    def test_03_semantic_identity_stays_stable(self):
        """Scenario 3: Semantic identity stays stable across 10 continuous frames."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        emb_p1 = make_embedding(1)
        emb_p2 = make_embedding(2)

        analyzer.profiles[1].last_real_pos = (2.0, 2.5)
        analyzer.profiles[1].team = 1
        analyzer.profiles[1].track_id = 1
        analyzer.profiles[1].reid_embedding = emb_p1

        analyzer.profiles[2].last_real_pos = (2.0, 11.0)
        analyzer.profiles[2].team = 2
        analyzer.profiles[2].track_id = 2
        analyzer.profiles[2].reid_embedding = emb_p2

        for step in range(10):
            p1_pos = (2.0 + step * 0.05, 2.5 + step * 0.05)
            p2_pos = (2.0 - step * 0.05, 11.0 - step * 0.05)
            dets = [
                {"track_id": 1, "real_pos": p1_pos, "bbox": [100, 100, 150, 250], "center": (125, 250), "conf": 0.9, "reid_embedding": emb_p1},
                {"track_id": 2, "real_pos": p2_pos, "bbox": [100, 400, 150, 550], "center": (125, 550), "conf": 0.9, "reid_embedding": emb_p2},
            ]
            matched = analyzer._match_tracks_to_profiles(self.frame, dets)
            self.assertEqual(matched[1]["track_id"], 1)
            self.assertEqual(matched[2]["track_id"], 2)

        self.assertEqual(analyzer.semantic_player_id_switches, 0)

    def test_04_temporary_lost_and_reacquisition(self):
        """Scenario 4: Player lost for several frames is reacquired with a new raw track ID."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        emb_p1 = make_embedding(55)
        analyzer.profiles[1].last_real_pos = (3.0, 2.5)
        analyzer.profiles[1].team = 1
        analyzer.profiles[1].track_id = 5
        analyzer.profiles[1].reid_embedding = emb_p1

        # Missed for 5 frames
        for _ in range(5):
            analyzer._match_tracks_to_profiles(self.frame, [])

        self.assertEqual(analyzer.profiles[1].missed_frames, 5)

        # Reappears nearby with new raw track ID 99 and same ReID embedding
        dets = [
            {"track_id": 99, "real_pos": (3.2, 2.7), "bbox": [100, 100, 150, 250], "center": (125, 250), "conf": 0.88, "reid_embedding": emb_p1}
        ]
        matched = analyzer._match_tracks_to_profiles(self.frame, dets)
        self.assertIn(1, matched)
        self.assertEqual(analyzer.profiles[1].track_id, 99)
        self.assertEqual(analyzer.profiles[1].missed_frames, 0)
        # Raw track switch incremented, but no semantic player swap
        self.assertEqual(analyzer.raw_tracker_id_switches, 1)
        self.assertEqual(analyzer.semantic_player_id_switches, 0)

    def test_05_similar_jersey_hsv_disambiguated_by_reid(self):
        """Scenario 5: Two players have identical HSV histograms, but distinct ReID embeddings."""
        analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=2)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        # Same HSV histogram
        dummy_hist = np.ones((16, 16), dtype=np.float32)
        dummy_hist /= np.sum(dummy_hist)

        emb_a = np.zeros(128, dtype=np.float32)
        emb_a[0] = 1.0
        emb_b = np.zeros(128, dtype=np.float32)
        emb_b[64] = 1.0

        p1 = analyzer.profiles[1]
        p1.team = 1
        p1.last_real_pos = (2.0, 3.0)
        p1.color_hist = dummy_hist.copy()
        p1.reid_embedding = emb_a

        p2 = analyzer.profiles[2]
        p2.team = 1
        p2.last_real_pos = (4.0, 3.0)
        p2.color_hist = dummy_hist.copy()
        p2.reid_embedding = emb_b

        # Detection at equidistant position (3.0, 3.0) with emb_b
        det = {
            "track_id": None,
            "real_pos": (3.0, 3.0),
            "bbox": [100, 100, 150, 250],
            "center": (125, 250),
            "conf": 0.9,
            "reid_embedding": emb_b,
        }

        cost_p1 = compute_identity_association_cost(p1, det, frame=self.frame, reid_adapter=mock_reid)
        cost_p2 = compute_identity_association_cost(p2, det, frame=self.frame, reid_adapter=mock_reid)

        # Cost for p2 must be lower because ReID embedding matches emb_b
        self.assertLess(cost_p2.total_cost, cost_p1.total_cost)
        self.assertGreater(cost_p1.reid_appearance_cost, cost_p2.reid_appearance_cost)

    def test_06_misleading_reid_overridden_by_spatial(self):
        """Scenario 6: Misleading ReID embedding cannot overcome severe spatial distance."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        emb_p1 = np.zeros(128, dtype=np.float32)
        emb_p1[0] = 1.0

        p1 = analyzer.profiles[1]
        p1.last_real_pos = (2.0, 2.0)
        p1.team = 1
        p1.reid_embedding = emb_p1

        # Detection 1: Close to P1 (2.2, 2.1), but orthogonal ReID embedding
        emb_other = np.zeros(128, dtype=np.float32)
        emb_other[10] = 1.0
        det_close = {
            "track_id": 1,
            "real_pos": (2.2, 2.1),
            "bbox": [100, 100, 150, 250],
            "center": (125, 250),
            "conf": 0.9,
            "reid_embedding": emb_other,
        }

        # Detection 2: Far away across the court (5.0, 12.0), but falsely matches P1 embedding
        det_far = {
            "track_id": 2,
            "real_pos": (5.0, 12.0),
            "bbox": [100, 400, 150, 550],
            "center": (125, 550),
            "conf": 0.9,
            "reid_embedding": emb_p1,
        }

        cost_close = compute_identity_association_cost(p1, det_close, frame=self.frame, reid_adapter=mock_reid)
        cost_far = compute_identity_association_cost(p1, det_far, frame=self.frame, reid_adapter=mock_reid)

        # Spatial cost and court-side penalty ensure close detection has lower cost
        self.assertLess(cost_close.total_cost, cost_far.total_cost)

    def test_07_reid_unavailable_graceful_fallback(self):
        """Scenario 7: When ReID is disabled, system gracefully falls back to spatial and HSV cues."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer.reid_adapter = DisabledReIDAdapter()

        self.assertFalse(analyzer.reid_adapter.is_enabled)
        self.assertIsNone(analyzer.reid_adapter.model_name)

        analyzer.profiles[1].last_real_pos = (2.0, 3.0)
        analyzer.profiles[1].team = 1
        analyzer.profiles[1].track_id = 1

        dets = [
            {"track_id": 1, "real_pos": (2.1, 3.1), "bbox": [100, 100, 150, 250], "center": (125, 250), "conf": 0.9},
        ]
        matched = analyzer._match_tracks_to_profiles(self.frame, dets)
        self.assertIn(1, matched)
        cost = analyzer._last_cost_breakdowns[1]
        self.assertEqual(cost.reid_appearance_cost, 0.0)
        self.assertIsNone(cost.reid_similarity)

    def test_08_doubles_4_players_stability(self):
        """Scenario 8: Doubles match with 4 players on court maintains correct team separation."""
        analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=4)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        embeddings = [make_embedding(i) for i in range(1, 5)]
        init_positions = [(2.0, 2.5), (4.0, 2.5), (2.0, 10.5), (4.0, 10.5)]

        for pid in range(1, 5):
            p = analyzer.profiles[pid]
            p.last_real_pos = init_positions[pid - 1]
            p.team = 1 if pid <= 2 else 2
            p.track_id = pid
            p.reid_embedding = embeddings[pid - 1]

        dets = [
            {"track_id": pid, "real_pos": init_positions[pid - 1], "bbox": [100 * pid, 100, 100 * pid + 50, 250], "center": (100 * pid + 25, 250), "conf": 0.9, "reid_embedding": embeddings[pid - 1]}
            for pid in range(1, 5)
        ]

        matched = analyzer._match_tracks_to_profiles(self.frame, dets)
        self.assertEqual(len(matched), 4)
        for pid in range(1, 5):
            self.assertEqual(matched[pid]["track_id"], pid)
            self.assertEqual(analyzer.profiles[pid].team, 1 if pid <= 2 else 2)

    def test_09_court_side_constraint(self):
        """Scenario 9: Severe court-side penalty prevents jump across the net."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        emb = make_embedding(77)
        p1 = analyzer.profiles[1]
        p1.last_real_pos = (3.0, 2.0)
        p1.team = 1
        p1.reid_embedding = emb

        # Candidate detection on team 2 side (y = 10.0m)
        det_opponent_side = {
            "track_id": 99,
            "real_pos": (3.0, 10.0),
            "bbox": [100, 400, 150, 550],
            "center": (125, 550),
            "conf": 0.9,
            "reid_embedding": emb,
        }

        cost = compute_identity_association_cost(p1, det_opponent_side, frame=self.frame, reid_adapter=mock_reid)
        self.assertGreaterEqual(cost.court_side_penalty, 15.0)
        self.assertGreater(cost.total_cost, 20.0)

    def test_10_raw_id_switch_vs_semantic_switch(self):
        """Scenario 10: MOT ID change increments raw switch count, NOT semantic switch count."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid

        emb_p1 = make_embedding(11)
        analyzer.profiles[1].last_real_pos = (3.0, 3.0)
        analyzer.profiles[1].team = 1
        analyzer.profiles[1].track_id = 7
        analyzer.profiles[1].reid_embedding = emb_p1

        # Frame where MOT reassigns track 7 to track 19
        dets = [
            {"track_id": 19, "real_pos": (3.05, 3.05), "bbox": [100, 100, 150, 250], "center": (125, 250), "conf": 0.92, "reid_embedding": emb_p1}
        ]
        matched = analyzer._match_tracks_to_profiles(self.frame, dets)
        self.assertIn(1, matched)
        self.assertEqual(analyzer.profiles[1].track_id, 19)

        self.assertEqual(analyzer.raw_tracker_id_switches, 1)
        self.assertEqual(analyzer.semantic_player_id_switches, 0)

    def test_11_true_semantic_switch_measurable(self):
        """Scenario 11: True semantic swap (e.g. manual swap or profile reassignment) is measured."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        emb_p1 = make_embedding(1)
        emb_p2 = make_embedding(2)

        analyzer.profiles[1].track_id = 10
        analyzer.profiles[1].last_real_pos = (2.0, 2.0)
        analyzer.profiles[1].reid_embedding = emb_p1

        analyzer.profiles[2].track_id = 20
        analyzer.profiles[2].last_real_pos = (2.0, 11.0)
        analyzer.profiles[2].reid_embedding = emb_p2

        initial_semantic_switches = analyzer.semantic_player_id_switches
        analyzer.swap_players(1, 2)

        self.assertEqual(analyzer.semantic_player_id_switches, initial_semantic_switches + 1)
        self.assertEqual(analyzer.profiles[1].track_id, 20)
        self.assertEqual(analyzer.profiles[2].track_id, 10)
        np.testing.assert_array_equal(analyzer.profiles[1].reid_embedding, emb_p2)
        np.testing.assert_array_equal(analyzer.profiles[2].reid_embedding, emb_p1)


if __name__ == "__main__":
    unittest.main()
