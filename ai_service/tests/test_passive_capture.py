"""
ai_service/tests/test_passive_capture.py — Unit Tests for Passive Capture Module
"""

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from ai_service.passive_capture import (
    CaptureResult,
    CaptureStatus,
    PassiveCaptureManager,
    PassiveCaptureRecord,
)


class TestPassiveCapture(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.storage_path = Path(self.temp_dir.name)
        self.manager = PassiveCaptureManager(
            storage_dir=self.storage_path,
            max_records=5,
            max_storage_bytes=100_000,
            dedup_window_frames=10,
            dedup_window_sec=0.5,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _sample_record(
        self,
        record_id: str = "rec-1",
        frame_index: int = 100,
        timestamp_sec: float = 4.0,
        failure_reason: str = "low_detection_confidence",
        target_id: str = "P1",
        is_confirmed: bool = False,
    ) -> PassiveCaptureRecord:
        return PassiveCaptureRecord(
            record_id=record_id,
            created_at="2026-09-30T10:00:00Z",
            analysis_id="analysis-test",
            pipeline_run_id="run-test-01",
            camera_segment_id="segment-0",
            frame_index=frame_index,
            timestamp_sec=timestamp_sec,
            failure_reason=failure_reason,
            uncertainty_score=0.82,
            prediction_data={"bbox": [100, 100, 200, 200], "confidence": 0.28},
            clip_id="clip-001",
            video_reference="C:\\Users\\Secret\\videos\\match.mp4",
            target_id=target_id,
            model_version="yolov8n-badminton-v1",
            model_artifact_hash="sha256:abc1234",
            runtime="pytorch",
            device="cuda:0",
            precision="fp16",
            is_confirmed_correction=is_confirmed,
        )

    def test_capture_and_retrieve_success(self) -> None:
        rec = self._sample_record()
        result = self.manager.capture(rec)

        self.assertEqual(result.status, CaptureStatus.STORED)
        self.assertEqual(result.record_id, "rec-1")

        loaded = self.manager.get_record("rec-1")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.analysis_id, "analysis-test")
        self.assertEqual(loaded.pipeline_run_id, "run-test-01")
        self.assertEqual(loaded.failure_reason, "low_detection_confidence")
        self.assertAlmostEqual(loaded.uncertainty_score, 0.82)
        # Verify path sanitization on video_reference
        self.assertEqual(loaded.to_dict()["videoReference"], "match.mp4")

    def test_deduplication_suppression(self) -> None:
        rec1 = self._sample_record("rec-1", frame_index=100, timestamp_sec=4.0)
        res1 = self.manager.capture(rec1)
        self.assertEqual(res1.status, CaptureStatus.STORED)

        # Immediate follow-up frame with same failure reason and target
        rec2 = self._sample_record("rec-2", frame_index=105, timestamp_sec=4.2)
        res2 = self.manager.capture(rec2)
        self.assertEqual(res2.status, CaptureStatus.DEDUP_SUPPRESSED)
        self.assertIn("deduplication window", res2.reason)

        # Different target should not be suppressed
        rec3 = self._sample_record("rec-3", frame_index=105, timestamp_sec=4.2, target_id="P2")
        res3 = self.manager.capture(rec3)
        self.assertEqual(res3.status, CaptureStatus.STORED)

        # Frame outside window (frame 120 > 100 + 10)
        rec4 = self._sample_record("rec-4", frame_index=125, timestamp_sec=5.5)
        res4 = self.manager.capture(rec4)
        self.assertEqual(res4.status, CaptureStatus.STORED)

    def test_quota_evicts_oldest_unconfirmed_record(self) -> None:
        # Max records is 5
        for i in range(5):
            rec = self._sample_record(
                f"rec-{i}",
                frame_index=100 + i * 20,
                timestamp_sec=4.0 + i * 2.0,
            )
            res = self.manager.capture(rec)
            self.assertEqual(res.status, CaptureStatus.STORED)

        stats = self.manager.get_stats()
        self.assertEqual(stats["totalRecords"], 5)

        # 6th record triggers eviction of oldest unconfirmed
        rec_new = self._sample_record("rec-new", frame_index=300, timestamp_sec=15.0)
        res_new = self.manager.capture(rec_new)
        self.assertEqual(res_new.status, CaptureStatus.STORED)

        # Total records stays within limit <= 5
        records = self.manager.list_records()
        self.assertLessEqual(len(records), 5)
        self.assertIsNotNone(self.manager.get_record("rec-new"))

    def test_confirmed_human_corrections_are_protected_from_eviction(self) -> None:
        # Fill storage with confirmed human corrections
        for i in range(5):
            rec = self._sample_record(
                f"rec-confirmed-{i}",
                frame_index=100 + i * 20,
                timestamp_sec=4.0 + i * 2.0,
                is_confirmed=True,
            )
            res = self.manager.capture(rec)
            self.assertEqual(res.status, CaptureStatus.STORED)

        stats = self.manager.get_stats()
        self.assertEqual(stats["confirmedCount"], 5)
        self.assertEqual(stats["unconfirmedCount"], 0)

        # Attempt to capture a 6th unconfirmed record when quota is full of confirmed records
        rec_new = self._sample_record("rec-unconfirmed", frame_index=500, timestamp_sec=30.0)
        res_new = self.manager.capture(rec_new)

        # Quota must be exceeded because confirmed records CANNOT be evicted!
        self.assertEqual(res_new.status, CaptureStatus.QUOTA_EXCEEDED)
        self.assertIn("confirmed human corrections", res_new.reason)

        # Verify all 5 confirmed records are still safe
        for i in range(5):
            self.assertIsNotNone(self.manager.get_record(f"rec-confirmed-{i}"))

    def test_confirm_correction_workflow(self) -> None:
        rec = self._sample_record("rec-audit-1")
        self.manager.capture(rec)

        self.assertFalse(self.manager.get_record("rec-audit-1").is_confirmed_correction)

        confirmed = self.manager.confirm_correction(
            "rec-audit-1",
            confirmed_by="scout_analyst_01",
            notes="Confirmed athlete foot position swap P1 <-> P2",
        )
        self.assertTrue(confirmed)

        loaded = self.manager.get_record("rec-audit-1")
        self.assertTrue(loaded.is_confirmed_correction)
        self.assertEqual(loaded.confirmed_by, "scout_analyst_01")
        self.assertIn("athlete foot position", loaded.notes)

    def test_clear_unconfirmed_preserves_confirmed_corrections(self) -> None:
        self.manager.capture(self._sample_record("rec-unconf-1", frame_index=10, timestamp_sec=1.0))
        self.manager.capture(self._sample_record("rec-conf-1", frame_index=50, timestamp_sec=3.0, is_confirmed=True))
        self.manager.capture(self._sample_record("rec-unconf-2", frame_index=90, timestamp_sec=5.0))

        deleted = self.manager.clear_unconfirmed()
        self.assertEqual(deleted, 2)

        self.assertIsNone(self.manager.get_record("rec-unconf-1"))
        self.assertIsNone(self.manager.get_record("rec-unconf-2"))
        self.assertIsNotNone(self.manager.get_record("rec-conf-1"))

    def test_storage_failure_is_reported_explicitly_never_swallowed(self) -> None:
        rec = self._sample_record("rec-fail")
        with patch.object(Path, "write_text", side_effect=OSError("Disk write permission denied")):
            res = self.manager.capture(rec)
            self.assertEqual(res.status, CaptureStatus.STORAGE_ERROR)
            self.assertIn("Disk write permission denied", str(res.error))
            self.assertIsNotNone(res.reason)


if __name__ == "__main__":
    unittest.main()
