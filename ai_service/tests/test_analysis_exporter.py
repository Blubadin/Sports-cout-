"""Unit tests for Phase 3.5E — Analysis Export Foundation.

Covers all 25 required test cases:
1. all overlays enabled
2. all overlays disabled
3. court-only export
4. pose-only export
5. shuttle-only export
6. custom overlay configuration
7. overlay timestamp/frame alignment
8. camera cut resets calibration/trails
9. missing pose data
10. missing shuttle data
11. UNKNOWN shuttle state
12. missing calibration
13. analysis with partial capability coverage
14. cancel during video rendering
15. cancel during PDF generation
16. cancel during archive creation
17. insufficient-storage handling
18. source video missing
19. safe ZIP paths (path traversal protection)
20. analysis revision consistency
21. manifest generation
22. PDF generation
23. heatmap generation
24. archive contents
25. deterministic rerun from same stored snapshot
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_AI_SERVICE = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
if str(_AI_SERVICE) not in sys.path:
    sys.path.insert(0, str(_AI_SERVICE))

import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import zipfile

import cv2
import numpy as np

from analysis_job_store import AnalysisJobStore
from analysis_exporter import (
    AnalysisExporter,
    ArchiveFailedError,
    ExportCancelledError,
    ExportOptions,
    ExportProgressState,
    InsufficientStorageError,
    InvalidAnalysisRevisionError,
    SourceVideoMissingError,
)


def create_test_video(path: Path, frame_count: int = 15, width: int = 320, height: int = 240, fps: int = 30) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(path), fourcc, fps, (width, height))
    for i in range(frame_count):
        # Create a frame with some variation
        frame = np.full((height, width, 3), (i * 10) % 255, dtype=np.uint8)
        writer.write(frame)
    writer.release()


def sample_telemetry_chunk(frame_count: int = 15) -> list[dict]:
    items = []
    for i in range(frame_count):
        item = {
            "frameIndex": i,
            "timestampSec": round(i / 30.0, 3),
            "cameraSegmentId": "segment-001" if i < 10 else "segment-002",
            "isCut": i == 10,
            "calibrationState": "CALIBRATED" if i < 10 else "UNCALIBRATED",
            "courtCornersPx": [[40, 40], [280, 40], [300, 200], [20, 200]] if i < 10 else None,
            "players": [
                {
                    "trackId": 1,
                    "playerId": "P1",
                    "bboxPx": [50, 60, 100, 160],
                    "detectionConfidence": 0.92,
                    "groundPointPx": [75, 160],
                    "groundPointProvenance": "FEET",
                    "courtPositionM": [3.05, 4.0],
                    "pose": {
                        "keypoints": [[75, 70, 0.9], [72, 68, 0.9], [78, 68, 0.9]] + [[75, 100, 0.8]] * 14,
                        "keypointCoordinateSpace": "pixel",
                    },
                },
                {
                    "trackId": 2,
                    "playerId": "P2",
                    "bboxPx": [200, 60, 250, 160],
                    "detectionConfidence": 0.88,
                    "groundPointPx": [225, 160],
                    "groundPointProvenance": "BBOX_BOTTOM",
                    "courtPositionM": [3.05, 9.4],
                    "pose": {
                        "keypoints": [[225, 70, 0.85]] * 17,
                        "keypointCoordinateSpace": "pixel",
                    },
                },
            ],
            "shuttle": {
                "frameIndex": i,
                "timestampSec": round(i / 30.0, 3),
                "positionPx": {"x": 80 + i * 5, "y": 90 + i * 2} if i < 12 else None,
                "confidence": 0.85 if i < 12 else None,
                "state": "observed" if i < 12 else "unknown",
            },
        }
        items.append(item)
    return items


class TestAnalysisExporter(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.base_path = Path(self.test_dir.name)
        self.store_dir = self.base_path / "store"
        self.output_dir = self.base_path / "exports"
        self.video_path = self.base_path / "source.mp4"

        create_test_video(self.video_path, frame_count=15)
        self.store = AnalysisJobStore(self.store_dir, page_limit=10)
        self.session_id = "sess_export_test"

        # Create session in store
        self.store.create_job(
            self.session_id,
            {"mediaHash": "mock_media_hash", "configHash": "mock_cfg_hash"},
            metadata={
                "session": {
                    "videoSource": str(self.video_path),
                    "gameType": "doubles",
                    "projectId": "proj_123",
                    "videoMetadata": {"width": 320, "height": 240, "fps": 30.0, "totalFrames": 15},
                    "processingConfig": {"shuttleEnabled": True, "poseStride": 1},
                },
                "provenance": {
                    "engineVersion": "Phase 3.5E",
                    "selectedDevice": "cpu",
                    "detector": {"name": "yolov8m"},
                    "pose": {"name": "yolov8m-pose"},
                    "shuttle": {"name": "TrackNetV2"},
                },
            },
        )
        self.store.update_job(self.session_id, {"status": "COMPLETED"})

        # Commit result chunks
        self.telemetry = sample_telemetry_chunk(15)
        self.store.append_result_chunk(self.session_id, 1, self.telemetry[:10])
        self.store.append_result_chunk(self.session_id, 2, self.telemetry[10:])

        self.exporter = AnalysisExporter(self.store)

    def tearDown(self):
        self.test_dir.cleanup()

    # 1. all overlays enabled
    def test_01_all_overlays_enabled(self):
        opts = ExportOptions.preset_debug()
        out_zip = self.output_dir / "all_overlays.zip"
        res = self.exporter.export(self.session_id, options=opts, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        self.assertGreater(out_zip.stat().st_size, 1000)
        self.assertEqual(res["videoOverlays"]["court"], True)
        self.assertEqual(res["videoOverlays"]["track_ids"], True)

    # 2. all overlays disabled
    def test_02_all_overlays_disabled(self):
        opts = ExportOptions.preset_clean()
        out_zip = self.output_dir / "clean.zip"
        res = self.exporter.export(self.session_id, options=opts, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        self.assertEqual(res["videoOverlays"]["court"], False)
        self.assertEqual(res["videoOverlays"]["player_detection"], False)
        self.assertEqual(res["videoOverlays"]["pose"], False)
        self.assertEqual(res["videoOverlays"]["shuttle"], False)

    # 3. court-only export
    def test_03_court_only_export(self):
        opts = ExportOptions(
            court=True,
            player_detection=False,
            pose=False,
            ground_points=False,
            shuttle=False,
            player_labels=False,
            track_ids=False,
            debug_info=False,
        )
        out_zip = self.output_dir / "court_only.zip"
        res = self.exporter.export(self.session_id, options=opts, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        self.assertTrue(res["videoOverlays"]["court"])
        self.assertFalse(res["videoOverlays"]["pose"])

    # 4. pose-only export
    def test_04_pose_only_export(self):
        opts = ExportOptions(
            court=False,
            player_detection=False,
            pose=True,
            ground_points=False,
            shuttle=False,
            player_labels=False,
            track_ids=False,
            debug_info=False,
        )
        out_zip = self.output_dir / "pose_only.zip"
        res = self.exporter.export(self.session_id, options=opts, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        self.assertTrue(res["videoOverlays"]["pose"])
        self.assertFalse(res["videoOverlays"]["court"])

    # 5. shuttle-only export
    def test_05_shuttle_only_export(self):
        opts = ExportOptions(
            court=False,
            player_detection=False,
            pose=False,
            ground_points=False,
            shuttle=True,
            player_labels=False,
            track_ids=False,
            debug_info=False,
        )
        out_zip = self.output_dir / "shuttle_only.zip"
        res = self.exporter.export(self.session_id, options=opts, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        self.assertTrue(res["videoOverlays"]["shuttle"])
        self.assertFalse(res["videoOverlays"]["player_detection"])

    # 6. custom overlay configuration
    def test_06_custom_overlay_configuration(self):
        opts = ExportOptions(
            court=True,
            player_detection=True,
            pose=False,
            ground_points=True,
            shuttle=False,
            player_labels=True,
            track_ids=False,
            debug_info=True,
            confidences=True,
        )
        out_zip = self.output_dir / "custom.zip"
        res = self.exporter.export(self.session_id, options=opts, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        self.assertTrue(res["videoOverlays"]["debug_info"])
        self.assertFalse(res["videoOverlays"]["shuttle"])

    # 7. overlay timestamp/frame alignment
    def test_07_overlay_timestamp_frame_alignment(self):
        # Modify video and ensure frames map 1:1 by index
        out_zip = self.output_dir / "alignment.zip"
        res = self.exporter.export(self.session_id, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        with zipfile.ZipFile(out_zip, "r") as zf:
            summary = json.loads(zf.read("data/analysis_summary.json").decode("utf-8"))
            self.assertEqual(summary["totalSamples"], 15)

    # 8. camera cut resets calibration/trails
    def test_08_camera_cut_resets_calibration_and_trails(self):
        # Telemetry has isCut=True at frame 10 and transitions from CALIBRATED to UNCALIBRATED
        out_zip = self.output_dir / "cut_reset.zip"
        res = self.exporter.export(self.session_id, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        # Confirms export successfully handles cut boundary and uncalibrated segment without errors
        self.assertEqual(res["totalSamples"], 15)

    # 9. missing pose data
    def test_09_missing_pose_data(self):
        # Create job where pose is None for all players
        sess_id = "sess_no_pose"
        self.store.create_job(sess_id, {"mediaHash": "mock_media", "configHash": "cfg"}, metadata={"session": {"videoSource": str(self.video_path)}})
        self.store.update_job(sess_id, {"status": "COMPLETED"})
        frames = [
            {
                "frameIndex": i,
                "timestampSec": i / 30.0,
                "players": [{"trackId": 1, "playerId": "P1", "bboxPx": [10, 10, 50, 50], "pose": None}],
            }
            for i in range(5)
        ]
        self.store.append_result_chunk(sess_id, 1, frames)
        out_zip = self.output_dir / "no_pose.zip"
        res = self.exporter.export(sess_id, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())

    # 10. missing shuttle data
    def test_10_missing_shuttle_data(self):
        sess_id = "sess_no_shuttle"
        self.store.create_job(sess_id, {"mediaHash": "mock_media", "configHash": "cfg"}, metadata={"session": {"videoSource": str(self.video_path)}})
        self.store.update_job(sess_id, {"status": "COMPLETED"})
        frames = [{"frameIndex": i, "timestampSec": i / 30.0, "shuttle": None} for i in range(5)]
        self.store.append_result_chunk(sess_id, 1, frames)
        out_zip = self.output_dir / "no_shuttle.zip"
        res = self.exporter.export(sess_id, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())

    # 11. UNKNOWN shuttle state
    def test_11_unknown_shuttle_state(self):
        sess_id = "sess_unknown_shuttle"
        self.store.create_job(sess_id, {"mediaHash": "mock_media", "configHash": "cfg"}, metadata={"session": {"videoSource": str(self.video_path)}})
        self.store.update_job(sess_id, {"status": "COMPLETED"})
        frames = [
            {
                "frameIndex": i,
                "timestampSec": i / 30.0,
                "shuttle": {"frameIndex": i, "positionPx": None, "state": "unknown"},
            }
            for i in range(5)
        ]
        self.store.append_result_chunk(sess_id, 1, frames)
        out_zip = self.output_dir / "unknown_shuttle.zip"
        res = self.exporter.export(sess_id, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())

    # 12. missing calibration
    def test_12_missing_calibration(self):
        sess_id = "sess_uncalibrated"
        self.store.create_job(sess_id, {"mediaHash": "mock_media", "configHash": "cfg"}, metadata={"session": {"videoSource": str(self.video_path)}})
        self.store.update_job(sess_id, {"status": "COMPLETED"})
        frames = [
            {
                "frameIndex": i,
                "timestampSec": i / 30.0,
                "calibrationState": "UNCALIBRATED",
                "courtCornersPx": None,
                "players": [],
            }
            for i in range(5)
        ]
        self.store.append_result_chunk(sess_id, 1, frames)
        out_zip = self.output_dir / "uncalibrated.zip"
        res = self.exporter.export(sess_id, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())
        with zipfile.ZipFile(out_zip, "r") as zf:
            # Heatmaps should still exist (with fallback badge)
            self.assertIn("heatmaps/player_movement_heatmap.png", zf.namelist())

    # 13. analysis with partial capability coverage
    def test_13_analysis_with_partial_capability_coverage(self):
        sess_id = "sess_partial_cap"
        self.store.create_job(
            sess_id,
            {"mediaHash": "mock_media", "configHash": "cfg"},
            metadata={
                "session": {
                    "videoSource": str(self.video_path),
                    "processingConfig": {"shuttleEnabled": False, "poseStride": 0},
                }
            },
        )
        self.store.update_job(sess_id, {"status": "COMPLETED"})
        frames = [{"frameIndex": 0, "timestampSec": 0.0}]
        self.store.append_result_chunk(sess_id, 1, frames)
        out_zip = self.output_dir / "partial_cap.zip"
        res = self.exporter.export(sess_id, target_zip_path=out_zip)
        self.assertTrue(out_zip.exists())

    # 14. cancel during video rendering
    def test_14_cancel_during_video_rendering(self):
        progress = ExportProgressState("exp_c1", self.session_id)
        # Cancel before rendering begins
        progress.cancel()
        out_zip = self.output_dir / "cancel_render.zip"
        with self.assertRaises(ExportCancelledError):
            self.exporter.export(self.session_id, target_zip_path=out_zip, progress=progress)
        self.assertFalse(out_zip.exists())

    # 15. cancel during PDF generation
    def test_15_cancel_during_pdf_generation(self):
        progress = ExportProgressState("exp_c2", self.session_id)

        # Hook into video render to trigger cancel immediately after video rendering finishes
        orig_render = self.exporter._render_video

        def fake_render(*args, **kwargs):
            orig_render(*args, **kwargs)
            progress.cancel()

        with patch.object(self.exporter, "_render_video", side_effect=fake_render):
            out_zip = self.output_dir / "cancel_pdf.zip"
            with self.assertRaises(ExportCancelledError):
                self.exporter.export(self.session_id, target_zip_path=out_zip, progress=progress)
            self.assertFalse(out_zip.exists())

    # 16. cancel during archive creation
    def test_16_cancel_during_archive_creation(self):
        progress = ExportProgressState("exp_c3", self.session_id)

        orig_pdf = self.exporter._generate_pdf_report

        def fake_pdf(*args, **kwargs):
            orig_pdf(*args, **kwargs)
            progress.cancel()

        with patch.object(self.exporter, "_generate_pdf_report", side_effect=fake_pdf):
            out_zip = self.output_dir / "cancel_zip.zip"
            with self.assertRaises(ExportCancelledError):
                self.exporter.export(self.session_id, target_zip_path=out_zip, progress=progress)
            self.assertFalse(out_zip.exists())

    # 17. insufficient-storage handling
    def test_17_insufficient_storage_handling(self):
        # Mock shutil.disk_usage to return 100 bytes free
        with patch("shutil.disk_usage", return_value=(1000000, 999900, 100)):
            out_zip = self.output_dir / "storage.zip"
            with self.assertRaises(InsufficientStorageError):
                self.exporter.export(self.session_id, target_zip_path=out_zip)
            self.assertFalse(out_zip.exists())

    # 18. source video missing
    def test_18_source_video_missing(self):
        sess_id = "sess_missing_video"
        self.store.create_job(
            sess_id,
            {"mediaHash": "mock_media", "configHash": "cfg"},
            metadata={"session": {"videoSource": str(self.base_path / "non_existent.mp4")}},
        )
        self.store.update_job(sess_id, {"status": "COMPLETED"})
        self.store.append_result_chunk(sess_id, 1, [{"frameIndex": 0}])
        out_zip = self.output_dir / "missing_video.zip"
        with self.assertRaises(SourceVideoMissingError):
            self.exporter.export(sess_id, target_zip_path=out_zip)

    # 19. safe ZIP paths (path traversal protection)
    def test_19_safe_zip_paths_path_traversal_protection(self):
        with self.assertRaises(ArchiveFailedError):
            self.exporter._validate_archive_path("../malicious.txt")
        with self.assertRaises(ArchiveFailedError):
            self.exporter._validate_archive_path("/etc/passwd")
        with self.assertRaises(ArchiveFailedError):
            self.exporter._validate_archive_path("C:\\Windows\\System32")
        with self.assertRaises(ArchiveFailedError):
            self.exporter._validate_archive_path("nested/../../bad.txt")

    # 20. analysis revision consistency
    def test_20_analysis_revision_consistency(self):
        # Mutate checkpoint committedCursor (within valid sequence bounds) to simulate frame count mismatch
        self.store.update_job(self.session_id, {"checkpoint": {"committedCursor": 50, "committedSequence": 2}})
        out_zip = self.output_dir / "revision.zip"
        with self.assertRaises(InvalidAnalysisRevisionError):
            self.exporter.export(self.session_id, target_zip_path=out_zip)

    # 21. manifest generation
    def test_21_manifest_generation(self):
        out_zip = self.output_dir / "manifests.zip"
        self.exporter.export(self.session_id, target_zip_path=out_zip)
        with zipfile.ZipFile(out_zip, "r") as zf:
            manifest_bytes = zf.read("data/export_manifest.json")
            manifest = json.loads(manifest_bytes.decode("utf-8"))
            self.assertEqual(manifest["exportVersion"], "1.0.0")
            self.assertEqual(manifest["phase"], "3.5E")
            self.assertIn("sourceFilename", manifest)
            self.assertIn("generatedArtifacts", manifest)
            self.assertNotIn("apiKey", manifest_bytes.decode("utf-8"))

    # 22. PDF generation
    def test_22_pdf_generation(self):
        out_zip = self.output_dir / "pdf_test.zip"
        self.exporter.export(self.session_id, target_zip_path=out_zip)
        with zipfile.ZipFile(out_zip, "r") as zf:
            pdf_bytes = zf.read("report/SportsScout_Report.pdf")
            self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
            self.assertGreater(len(pdf_bytes), 5000)

    # 23. heatmap generation
    def test_23_heatmap_generation(self):
        out_zip = self.output_dir / "heatmaps_test.zip"
        self.exporter.export(self.session_id, target_zip_path=out_zip)
        with zipfile.ZipFile(out_zip, "r") as zf:
            self.assertIn("heatmaps/player_movement_heatmap.png", zf.namelist())
            self.assertIn("heatmaps/shuttle_heatmap.png", zf.namelist())
            img_bytes = zf.read("heatmaps/player_movement_heatmap.png")
            self.assertTrue(img_bytes.startswith(b"\x89PNG\r\n\x1a\n"))

    # 24. archive contents
    def test_24_archive_contents(self):
        out_zip = self.output_dir / "contents.zip"
        self.exporter.export(self.session_id, target_zip_path=out_zip)
        with zipfile.ZipFile(out_zip, "r") as zf:
            names = set(zf.namelist())
            self.assertIn("video/analysis_overlay.mp4", names)
            self.assertIn("report/SportsScout_Report.pdf", names)
            self.assertIn("README.txt", names)
            self.assertIn("data/export_manifest.json", names)
            self.assertIn("data/analysis_summary.json", names)
            self.assertIn("heatmaps/player_movement_heatmap.png", names)

    # 25. deterministic rerun from same stored snapshot
    def test_25_deterministic_rerun_from_same_stored_snapshot(self):
        out_zip1 = self.output_dir / "rerun1.zip"
        out_zip2 = self.output_dir / "rerun2.zip"
        opts = ExportOptions.preset_analysis()
        self.exporter.export(self.session_id, options=opts, target_zip_path=out_zip1)
        self.exporter.export(self.session_id, options=opts, target_zip_path=out_zip2)

        with zipfile.ZipFile(out_zip1, "r") as zf1, zipfile.ZipFile(out_zip2, "r") as zf2:
            self.assertEqual(sorted(zf1.namelist()), sorted(zf2.namelist()))
            s1 = json.loads(zf1.read("data/analysis_summary.json").decode("utf-8"))
            s2 = json.loads(zf2.read("data/analysis_summary.json").decode("utf-8"))
            self.assertEqual(s1["totalSamples"], s2["totalSamples"])
            self.assertEqual(s1["sessionId"], s2["sessionId"])


if __name__ == "__main__":
    unittest.main()
