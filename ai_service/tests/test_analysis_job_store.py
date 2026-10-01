import tempfile
import unittest
import sys
import errno
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from analysis_job_store import (
    AnalysisJobStore,
    JobStoreCorruptionError,
    JobStoreSequenceError,
)


class TestAnalysisJobStore(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = AnalysisJobStore(Path(self.temp_dir.name), page_limit=3)
        self.store.create_job("session_test", {"mediaHash": "abc", "configHash": "cfg"})

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_committed_chunks_page_with_a_hard_limit(self):
        self.store.append_result_chunk("session_test", 1, [{"frameIndex": i} for i in range(4)])
        self.store.append_result_chunk("session_test", 2, [{"frameIndex": i} for i in range(4, 8)])

        page = self.store.page_results("session_test", after_cursor=2, limit=999)

        self.assertEqual([row["frameIndex"] for row in page["items"]], [2, 3, 4])
        self.assertEqual(page["nextCursor"], 5)
        self.assertEqual(page["totalCount"], 8)
        self.assertEqual(page["maximumPageSize"], 3)

    def test_chunk_write_is_idempotent_and_rejects_sequence_conflicts(self):
        payload = [{"frameIndex": 0}]
        self.store.append_result_chunk("session_test", 1, payload)
        self.store.append_result_chunk("session_test", 1, payload)

        with self.assertRaises(JobStoreSequenceError):
            self.store.append_result_chunk("session_test", 1, [{"frameIndex": 1}])
        with self.assertRaises(JobStoreSequenceError):
            self.store.append_result_chunk("session_test", 3, [{"frameIndex": 2}])

        self.assertEqual(self.store.get_job("session_test")["checkpoint"]["committedSequence"], 1)

    def test_orphan_chunk_is_not_visible_until_checkpoint_commit(self):
        self.store.append_result_chunk("session_test", 1, [{"frameIndex": 0}])
        manifest = self.store.get_job("session_test")
        self.store.update_job("session_test", {"status": "PROCESSING"})
        # Simulate a chunk file from a write that crashed before the journal commit.
        self.store._write_chunk_file("session_test", 2, 1, [{"frameIndex": 1}])

        page = self.store.page_results("session_test", after_cursor=0, limit=10)

        self.assertEqual([row["frameIndex"] for row in page["items"]], [0])
        self.assertEqual(page["totalCount"], 1)
        self.assertEqual(manifest["checkpoint"]["committedSequence"], 1)

    def test_corrupt_job_integrity_is_reported(self):
        manifest_path = self.store.job_path("session_test") / "job.json"
        manifest_path.write_text('{"status":"COMPLETED","checkpoint":{}}', encoding="utf-8")

        with self.assertRaises(JobStoreCorruptionError):
            self.store.get_job("session_test")

    def test_restart_marks_processing_job_interrupted(self):
        self.store.update_job("session_test", {"status": "PROCESSING"})

        recovered = AnalysisJobStore(Path(self.temp_dir.name), page_limit=3)
        job = recovered.get_job("session_test")

        self.assertEqual(job["status"], "INTERRUPTED")
        self.assertIn("interruptedAt", job)

    def test_interrupted_delete_leaves_tombstone_and_can_be_repaired(self):
        original = self.store._remove_tree

        def fail_once(path):
            raise PermissionError("injected delete failure")

        self.store._remove_tree = fail_once
        with self.assertRaises(PermissionError):
            self.store.delete_job("session_test")
        self.assertTrue((self.store.job_path("session_test") / "delete.json").exists())

        self.store._remove_tree = original
        recovered = AnalysisJobStore(Path(self.temp_dir.name), page_limit=3)
        self.assertFalse(self.store.job_path("session_test").exists())
        self.assertIn("session_test", recovered.recovery_report["deleted"])

    def test_partial_delete_remains_repairable_after_inner_marker_removed(self):
        def partial_delete(path):
            (path / "delete.json").unlink()
            (path / "job.json").unlink()
            raise PermissionError("injected partial delete")
        with patch.object(self.store, "_remove_tree", side_effect=partial_delete):
            with self.assertRaises(PermissionError):
                self.store.delete_job("session_test")
        recovered = AnalysisJobStore(Path(self.temp_dir.name))
        self.assertIn("session_test", recovered.recovery_report["deleted"])
        self.assertFalse(self.store.job_path("session_test").exists())

    def test_disk_full_or_permission_failure_never_commits_or_exposes_partial_chunk(self):
        for error in (OSError(errno.ENOSPC, "disk full"), PermissionError("denied")):
            with patch.object(self.store, "_write_job", side_effect=error):
                with self.assertRaises(OSError):
                    self.store.append_result_chunk("session_test", 1, [{"frameIndex": 1}])
            self.assertEqual(self.store.page_results("session_test")["totalCount"], 0)
            recovered = AnalysisJobStore(Path(self.temp_dir.name))
            self.assertFalse((recovered.job_path("session_test") / "chunks" / "000000000001.json").exists())
            self.store = recovered
        self.store.append_result_chunk("session_test", 1, [{"frameIndex": 1}])
        self.store.validate_committed("session_test")

    def test_checksum_and_index_sequence_mismatch_reject_resume_chain(self):
        self.store.append_result_chunk("session_test", 1, [{"frameIndex": 1}])
        index = self.store.job_path("session_test") / "chunks.index"
        index.write_bytes(b"\0" * 24)
        with self.assertRaises(JobStoreCorruptionError):
            self.store.validate_committed("session_test")
        chunk = self.store.job_path("session_test") / "chunks" / "000000000001.json"
        chunk.write_text("{}", encoding="utf-8")
        with self.assertRaises(JobStoreCorruptionError):
            self.store.page_results("session_test")


    def test_new_sequence_cannot_duplicate_canonical_frames(self):
        self.store.append_result_chunk("session_test", 1, [{"frameIndex": 1}])
        with self.assertRaises(JobStoreSequenceError):
            self.store.append_result_chunk("session_test", 2, [{"frameIndex": 1}])
        self.assertEqual(self.store.page_results("session_test")["totalCount"], 1)


if __name__ == "__main__":
    unittest.main()
