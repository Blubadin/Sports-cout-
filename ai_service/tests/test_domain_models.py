"""
ai_service/tests/test_domain_models.py — Unit Tests for Parallel Architecture Domain Models
"""

import unittest
from ai_service.domain_models import (
    Athlete,
    Match,
    MatchTeam,
    Rally,
    Hit,
    Skill,
    Video,
    AnalysisRun,
    TrackingSession,
    ModelRun,
    ReviewCorrection,
)


class TestDomainModels(unittest.TestCase):
    def test_athlete_uses_stable_athlete_id_not_name(self) -> None:
        athlete = Athlete(
            athlete_id="ath-tha-001",
            display_name="Kunlavut Vitidsarn",
            official_name="Kunlavut VITIDSARN",
            nationality="THA",
            dominant_hand="right",
            play_style="counter-attacking",
        )
        data = athlete.to_dict()
        self.assertEqual(data["athleteId"], "ath-tha-001")
        self.assertEqual(data["displayName"], "Kunlavut Vitidsarn")

        restored = Athlete.from_dict(data)
        self.assertEqual(restored.athlete_id, "ath-tha-001")
        self.assertEqual(restored.nationality, "THA")

    def test_match_and_rally_round_trip(self) -> None:
        team1 = MatchTeam(team_id="team-1", name="THA Singles", athlete_ids=["ath-tha-001"])
        team2 = MatchTeam(team_id="team-2", name="DEN Singles", athlete_ids=["ath-den-002"])
        match = Match(
            match_id="match-paris-2024-final",
            match_date="2024-08-05",
            game_type="singles",
            team1=team1,
            team2=team2,
            tournament_name="Olympic Games Paris 2024",
        )
        match_data = match.to_dict()
        self.assertEqual(match_data["matchId"], "match-paris-2024-final")
        self.assertEqual(match_data["team1"]["athleteIds"], ["ath-tha-001"])

        rally = Rally(
            rally_id="rally-001",
            match_id=match.match_id,
            set_index=1,
            rally_index=1,
            serving_team=1,
            serving_athlete_id="ath-tha-001",
            receiving_athlete_id="ath-den-002",
            score_before={"team1": 0, "team2": 0},
            score_after={"team1": 1, "team2": 0},
            duration_sec=14.5,
            result_type="winner",
            winning_team=1,
        )
        rally_data = rally.to_dict()
        restored_rally = Rally.from_dict(rally_data)
        self.assertEqual(restored_rally.rally_id, "rally-001")
        self.assertEqual(restored_rally.serving_athlete_id, "ath-tha-001")
        self.assertEqual(restored_rally.duration_sec, 14.5)

    def test_hit_stroke_entity(self) -> None:
        hit = Hit(
            hit_id="hit-042",
            rally_id="rally-001",
            hit_index=5,
            athlete_id="ath-tha-001",
            team=1,
            timestamp_sec=8.45,
            frame_index=254,
            stroke_type="smash",
            shuttle_speed_mps=78.2,
            court_position={"x": 2.1, "y": 11.2},
            confidence=0.92,
        )
        data = hit.to_dict()
        restored = Hit.from_dict(data)
        self.assertEqual(restored.hit_id, "hit-042")
        self.assertEqual(restored.athlete_id, "ath-tha-001")
        self.assertEqual(restored.stroke_type, "smash")
        self.assertAlmostEqual(restored.shuttle_speed_mps, 78.2)

    def test_video_and_analysis_run(self) -> None:
        video = Video(
            video_id="vid-101",
            video_reference="match_court1.mp4",
            duration_sec=3600.0,
            fps=59.94,
            width=1920,
            height=1080,
            venue_id="arena-porte-de-la-chapelle",
        )
        run = AnalysisRun(
            analysis_id="analysis-2024-001",
            video_id=video.video_id,
            pipeline_run_id="pipe-run-001",
            status="completed",
            started_at="2026-09-30T10:00:00Z",
            completed_at="2026-09-30T10:45:00Z",
        )
        self.assertEqual(run.analysis_id, "analysis-2024-001")
        self.assertEqual(run.video_id, "vid-101")
        self.assertEqual(run.status, "completed")

    def test_review_correction_provenance(self) -> None:
        corr = ReviewCorrection(
            correction_id="corr-99",
            analysis_id="analysis-2024-001",
            target_type="athlete_identity",
            target_ref="frame-150-track-4",
            athlete_id="ath-tha-001",
            original_value="ath-den-002",
            corrected_value="ath-tha-001",
            corrected_by="senior_scout",
            is_confirmed=True,
            notes="Correction of crossing error at net",
        )
        data = corr.to_dict()
        restored = ReviewCorrection.from_dict(data)
        self.assertEqual(restored.correction_id, "corr-99")
        self.assertEqual(restored.corrected_by, "senior_scout")
        self.assertTrue(restored.is_confirmed)


if __name__ == "__main__":
    unittest.main()
