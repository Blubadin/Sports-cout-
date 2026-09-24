"""
ai_service/tests/test_shuttle_benchmark_protocol.py

Unit tests for Phase 2.0 Shuttlecock Benchmark Protocol in Python:
1. Manifest with complete metadata & S01-S05 reference clips
2. Manifest with partial metadata (no fake defaults)
3. Visible shuttle with valid coordinate
4. Invisible shuttle without coordinate
5. No fake zero coordinate rule ((0,0) rejected for not_visible/unknown)
6. Unknown state handling
7. Occluded state handling
8. Difficult segments and tagging taxonomy
9. Local video path does not require Git asset
10. Direct court homography projection guard
11. Loading and validating src/benchmarks/shuttleBenchmarkManifest.json
"""

import json
from pathlib import Path
import unittest

from ai_service.shuttle_benchmark_schema import (
    ShuttleBenchmarkClip,
    ShuttleBenchmarkManifest,
    ShuttleDifficultSegment,
    ShuttleGroundTruthFrame,
    forbid_court_homography_projection,
)


class TestShuttleBenchmarkProtocol(unittest.TestCase):
    def test_complete_clip_metadata(self):
        """1. Complete metadata serialization and deserialization."""
        segment = ShuttleDifficultSegment(
            start_sec=4.5,
            end_sec=6.8,
            tags=["far_court", "white_background"],
            description="Clear against light",
        )
        frame = ShuttleGroundTruthFrame(
            frame_index=0,
            timestamp_sec=0.0,
            visibility="visible",
            x_px=962.5,
            y_px=540.2,
            x_normalized=0.501302,
            y_normalized=0.500185,
            annotation_source="manual",
            reviewed=True,
            notes="Service stance",
        )
        clip = ShuttleBenchmarkClip(
            id="S01_singles_clear_rally",
            name="Singles / Clear Rally",
            category="S01",
            sport="badminton",
            game_type="singles",
            split="development",
            player_count=2,
            video_reference="benchmarks/videos/shuttle/S01_singles_clear_rally.mp4",
            duration_sec=15.0,
            source_width=1920,
            source_height=1080,
            source_fps=30.0,
            camera_type="static_rear",
            camera_motion="static",
            difficulty_tags=["singles", "clear_rally"],
            court_calibration_reference="calib_01",
            ground_truth_available=True,
            notes="Development baseline clip",
            known_difficult_segments=[segment],
            ground_truth_frames=[frame],
        )

        errors = clip.validate()
        self.assertEqual(errors, [])

        clip_dict = clip.to_dict()
        self.assertEqual(clip_dict["id"], "S01_singles_clear_rally")
        self.assertEqual(clip_dict["category"], "S01")
        self.assertEqual(clip_dict["split"], "development")
        self.assertEqual(len(clip_dict["knownDifficultSegments"]), 1)
        self.assertEqual(len(clip_dict["groundTruthFrames"]), 1)

        restored = ShuttleBenchmarkClip.from_dict(clip_dict)
        self.assertEqual(restored.id, clip.id)
        self.assertEqual(restored.duration_sec, 15.0)
        self.assertEqual(restored.ground_truth_frames[0].x_px, 962.5)

    def test_partial_clip_metadata(self):
        """2. Partial metadata: missing fields remain None without fake zeroes."""
        clip_data = {
            "id": "S99_partial",
            "name": "Partial Metadata Clip",
            "category": "S01",
            "sport": "badminton",
            "gameType": "singles",
            "split": "development",
            "playerCount": 2,
            "cameraType": "static_rear",
            "cameraMotion": "static",
            "difficultyTags": ["uncalibrated"],
            "groundTruthAvailable": False,
        }
        clip = ShuttleBenchmarkClip.from_dict(clip_data)
        self.assertEqual(clip.validate(), [])
        self.assertIsNone(clip.video_reference)
        self.assertIsNone(clip.duration_sec)
        self.assertIsNone(clip.source_width)
        self.assertIsNone(clip.source_height)
        self.assertIsNone(clip.source_fps)
        self.assertIsNone(clip.court_calibration_reference)
        self.assertIsNone(clip.notes)
        self.assertIsNone(clip.ground_truth_frames)

    def test_visible_shuttle_with_coordinate(self):
        """3. Visible shuttle requires valid non-negative coordinates."""
        frame = ShuttleGroundTruthFrame(
            frame_index=10,
            timestamp_sec=0.333,
            visibility="visible",
            x_px=960.0,
            y_px=540.0,
            annotation_source="manual",
            reviewed=True,
        )
        self.assertEqual(frame.validate(image_width=1920, image_height=1080), [])

        # Missing x_px
        invalid_frame = ShuttleGroundTruthFrame(
            frame_index=10,
            timestamp_sec=0.333,
            visibility="visible",
            x_px=None,
            y_px=540.0,
        )
        errors = invalid_frame.validate()
        self.assertTrue(any("xPx" in err for err in errors))

        # Out of bounds coordinate
        out_of_bounds = ShuttleGroundTruthFrame(
            frame_index=10,
            timestamp_sec=0.333,
            visibility="visible",
            x_px=2000.0,
            y_px=540.0,
        )
        errors = out_of_bounds.validate(image_width=1920, image_height=1080)
        self.assertTrue(any("exceeds source width" in err for err in errors))

    def test_invisible_shuttle_without_coordinate(self):
        """4. Invisible shuttle without coordinate is valid."""
        frame = ShuttleGroundTruthFrame(
            frame_index=45,
            timestamp_sec=1.5,
            visibility="not_visible",
            x_px=None,
            y_px=None,
            annotation_source="manual",
            reviewed=True,
        )
        self.assertEqual(frame.validate(), [])

    def test_no_fake_zero_coordinate(self):
        """5. Representing missing coordinates as (0, 0) is strictly rejected."""
        fake_zero_frame = ShuttleGroundTruthFrame(
            frame_index=46,
            timestamp_sec=1.533,
            visibility="not_visible",
            x_px=0.0,
            y_px=0.0,
        )
        errors = fake_zero_frame.validate()
        self.assertTrue(any("fake zero (0, 0)" in err for err in errors))

        fake_zero_unknown = ShuttleGroundTruthFrame(
            frame_index=47,
            timestamp_sec=1.566,
            visibility="unknown",
            x_px=0.0,
            y_px=0.0,
        )
        errors = fake_zero_unknown.validate()
        self.assertTrue(any("fake zero (0, 0)" in err for err in errors))

    def test_unknown_state_handling(self):
        """6. Unknown state must have None coordinates."""
        valid_unknown = ShuttleGroundTruthFrame(
            frame_index=60,
            timestamp_sec=2.0,
            visibility="unknown",
            x_px=None,
            y_px=None,
        )
        self.assertEqual(valid_unknown.validate(), [])

        invalid_unknown = ShuttleGroundTruthFrame(
            frame_index=61,
            timestamp_sec=2.033,
            visibility="unknown",
            x_px=500.0,
            y_px=200.0,
        )
        errors = invalid_unknown.validate()
        self.assertTrue(any("None xPx" in err for err in errors))

    def test_occluded_state_handling(self):
        """7. Occluded state can have estimated coordinates or None."""
        occluded_with_coord = ShuttleGroundTruthFrame(
            frame_index=80,
            timestamp_sec=2.66,
            visibility="occluded",
            x_px=800.0,
            y_px=400.0,
            annotation_source="semi_automatic",
            reviewed=True,
        )
        self.assertEqual(occluded_with_coord.validate(), [])

        occluded_null = ShuttleGroundTruthFrame(
            frame_index=81,
            timestamp_sec=2.7,
            visibility="occluded",
            x_px=None,
            y_px=None,
        )
        self.assertEqual(occluded_null.validate(), [])

        # Partial coordinates for occluded must fail
        occluded_partial = ShuttleGroundTruthFrame(
            frame_index=82,
            timestamp_sec=2.73,
            visibility="occluded",
            x_px=800.0,
            y_px=None,
        )
        self.assertTrue(any("specify both xPx and yPx" in err for err in occluded_partial.validate()))

    def test_difficult_segments(self):
        """8. Difficult segments validation."""
        valid_seg = ShuttleDifficultSegment(
            start_sec=10.0,
            end_sec=12.5,
            tags=["smash", "motion_blur"],
        )
        self.assertEqual(valid_seg.validate(), [])

        invalid_seg = ShuttleDifficultSegment(
            start_sec=15.0,
            end_sec=12.0,
            tags=["smash"],
        )
        errors = invalid_seg.validate()
        self.assertTrue(any("endSec must be greater than or equal to startSec" in err for err in errors))

    def test_local_video_path_does_not_require_git_asset(self):
        """9. Local video path is a logical reference and does not require file to exist in git."""
        clip = ShuttleBenchmarkClip(
            id="S01_logical_only",
            name="Logical Only Clip",
            category="S01",
            split="development",
            video_reference="benchmarks/videos/shuttle/never_committed_file.mp4",
        )
        self.assertEqual(clip.validate(), [])
        self.assertEqual(clip.video_reference, "benchmarks/videos/shuttle/never_committed_file.mp4")

    def test_direct_court_homography_guard(self):
        """10. Guard raises ValueError when direct court homography projection is attempted."""
        with self.assertRaises(ValueError) as ctx:
            forbid_court_homography_projection()
        self.assertIn("Direct court homography projection is forbidden", str(ctx.exception))

    def test_load_bundled_manifest_json(self):
        """11. Loads and validates the real bundled shuttleBenchmarkManifest.json."""
        manifest_path = Path(__file__).resolve().parent.parent.parent / "src" / "benchmarks" / "shuttleBenchmarkManifest.json"
        self.assertTrue(manifest_path.exists(), f"Missing manifest at {manifest_path}")

        manifest = ShuttleBenchmarkManifest.load_json(manifest_path)
        errors = manifest.validate()
        self.assertEqual(errors, [])
        self.assertGreaterEqual(len(manifest.clips), 5)

        categories = [c.category for c in manifest.clips]
        self.assertIn("S01", categories)
        self.assertIn("S02", categories)
        self.assertIn("S03", categories)
        self.assertIn("S04", categories)
        self.assertIn("S05", categories)

    def test_clip_validation_rejects_duplicate_ground_truth_frame_index(self):
        clip = ShuttleBenchmarkClip(
            id="duplicate-gt",
            name="Duplicate GT",
            category="S01",
            ground_truth_available=True,
            ground_truth_frames=[
                ShuttleGroundTruthFrame(frame_index=1, timestamp_sec=0.0, visibility="visible", x_px=1.0, y_px=1.0),
                ShuttleGroundTruthFrame(frame_index=1, timestamp_sec=0.033, visibility="visible", x_px=2.0, y_px=2.0),
            ],
        )

        errors = clip.validate()

        self.assertTrue(any("duplicate groundTruthFrames frameIndex: 1" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
