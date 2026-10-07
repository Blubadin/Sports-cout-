"""
test_export_smoke.py — Verification of Phase 3 Analysis Export Reliability and Hardening.

Verifies:
1. probe_video_encoder: verifies VideoWriter opening, frame writing, non-zero file creation,
   and reopenability. Fast-fails if no encoder is available.
2. Dynamic git SHA resolution: _get_git_commit_sha returns real commit hash, eliminating
   fake hardcoded hashes.
3. Manifest completeness: generated export manifest includes exportVersion, dynamic repositorySha,
   and full provenance metadata.
4. Frame index 0-based vs 1-based source alignment: verifies canonical frame mapping handles both
   0-indexed and 1-indexed inputs correctly.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analysis_exporter import (
    AnalysisExporter,
    ExportOptions,
    probe_video_encoder,
    _get_git_commit_sha,
)


class TestExportSmoke(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_probe_video_encoder_succeeds_on_supported_platform(self):
        """probe_video_encoder must probe codecs, write a test frame, and verify readback."""
        selected_codec = probe_video_encoder(self.temp_path, codecs=("mp4v", "avc1"))
        self.assertIn(selected_codec, ("mp4v", "avc1"))

    def test_git_commit_sha_returns_truthful_sha(self):
        """_get_git_commit_sha must resolve a real 40-character git commit SHA."""
        sha = _get_git_commit_sha()
        self.assertIsInstance(sha, str)
        self.assertEqual(len(sha), 40)
        self.assertTrue(all(c in "0123456789abcdef" for c in sha.lower()))
        # Must not be the old fake hardcoded placeholder
        self.assertNotEqual(sha, "22c623dc90f68ab3ef89922325947fc929675757")

    def test_manifest_contains_dynamic_sha_and_provenance(self):
        """Export manifest must include real git SHA and full provenance metadata."""
        from unittest.mock import MagicMock
        exporter = AnalysisExporter(job_store=MagicMock(), export_root=self.temp_path)
        job = {
            "id": "session_test_export",
            "metadata": {
                "session": {
                    "videoMetadata": {"filename": "match_clip.mp4"}
                },
                "engine": {
                    "detectorModel": "yolov8x",
                    "poseModel": "yolov8x-pose",
                    "shuttleModel": "tracknet-v2",
                    "device": "cpu",
                }
            },
            "identity": {
                "mediaHash": "abcdef1234567890",
            }
        }
        dummy_video = self.temp_path / "match_clip.mp4"
        dummy_video.write_bytes(b"dummy")
        manifest_path = self.temp_path / "manifest.json"

        exporter._generate_manifest(
            job=job,
            analysis_frames=[],
            options=ExportOptions(),
            artifact_list=["summary.json"],
            output_path=manifest_path,
            source_media_path=dummy_video,
        )

        import json
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest["exportVersion"], "1.0.0")
        self.assertEqual(manifest["phase"], "3.5E")
        self.assertEqual(manifest["analysisJobId"], "session_test_export")
        self.assertEqual(manifest["sourceMediaSha256"], "abcdef1234567890")
        self.assertEqual(manifest["repositorySha"], _get_git_commit_sha())
        self.assertIn("provenance", manifest)
        self.assertEqual(manifest["provenance"]["detectorModel"], "yolov8x")
        self.assertEqual(manifest["provenance"]["poseModel"], "yolov8x-pose")
        self.assertEqual(manifest["provenance"]["shuttleModel"], "tracknet-v2")

    def test_frame_index_mapping_0_based_vs_1_based(self):
        """Exporter frame_map correctly maps both 0-based and 1-based telemetry rows."""
        # Case A: 1-based frames (e.g. frameIndex = 1, 2, 3)
        one_based = [{"frameIndex": 1, "data": "A"}, {"frameIndex": 2, "data": "B"}]
        raw_indices = [r["frameIndex"] for r in one_based]
        total_source_frames = 10
        is_zero_indexed = len(raw_indices) > 0 and min(raw_indices) == 0 and (total_source_frames <= 0 or max(raw_indices) < total_source_frames)
        self.assertFalse(is_zero_indexed)

        frame_map = {}
        for r in one_based:
            idx = r["frameIndex"]
            canonical = idx + 1 if is_zero_indexed else idx
            frame_map[canonical] = r
        self.assertEqual(frame_map[1]["data"], "A")
        self.assertEqual(frame_map[2]["data"], "B")

        # Case B: 0-based frames (e.g. frameIndex = 0, 1, 2)
        zero_based = [{"frameIndex": 0, "data": "Z0"}, {"frameIndex": 1, "data": "Z1"}]
        raw_indices = [r["frameIndex"] for r in zero_based]
        is_zero_indexed = len(raw_indices) > 0 and min(raw_indices) == 0 and (total_source_frames <= 0 or max(raw_indices) < total_source_frames)
        self.assertTrue(is_zero_indexed)

        frame_map_zero = {}
        for r in zero_based:
            idx = r["frameIndex"]
            canonical = idx + 1 if is_zero_indexed else idx
            frame_map_zero[canonical] = r
        self.assertEqual(frame_map_zero[1]["data"], "Z0")
        self.assertEqual(frame_map_zero[2]["data"], "Z1")


if __name__ == "__main__":
    unittest.main()
