import tempfile
import unittest
import sys
import errno
import subprocess
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from analysis_job_store import (
    AnalysisJobStore,
    JobStoreBusyError,
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

    def test_frame_lookup_is_bounded_and_does_not_confuse_frames_with_cursors(self):
        for sequence in range(1, 17):
            self.store.append_result_chunk("session_test", sequence, [
                {"frameIndex": sequence * 10 + offset * 2} for offset in range(3)
            ])
        self.store._write_chunk_file("session_test", 17, 48, [{"frameIndex": 170}])
        with patch.object(self.store, "_read_chunk", wraps=self.store._read_chunk) as read:
            self.assertEqual(self.store.find_result_frame("session_test", 72), {"frameIndex": 72})
            self.assertLessEqual(read.call_count, 5)
        self.assertIsNone(self.store.find_result_frame("session_test", 73))
        self.assertIsNone(self.store.find_result_frame("session_test", 170))

    def test_frame_lookup_rejects_corrupt_chunk_evidence(self):
        self.store.append_result_chunk("session_test", 1, [{"frameIndex": 10}])
        self.store._chunk_path("session_test", 1).write_text('{}', encoding="utf-8")
        with self.assertRaises(JobStoreCorruptionError):
            self.store.find_result_frame("session_test", 10)

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

    def test_environment_store_lock_prevents_another_service_process_from_recovering_jobs(self):
        with patch.dict("os.environ", {"SPORTSCOUT_ANALYSIS_STORE_DIR": self.temp_dir.name}):
            owner = AnalysisJobStore.from_environment()

        child_script = (
            "import sys\n"
            "sys.path.insert(0, sys.argv[1])\n"
            "from analysis_job_store import AnalysisJobStore, JobStoreBusyError\n"
            "try:\n"
            "    AnalysisJobStore(sys.argv[2], acquire_process_lock=True)\n"
            "except JobStoreBusyError:\n"
            "    print('LOCKED')\n"
            "else:\n"
            "    raise SystemExit(3)\n"
        )
        try:
            result = subprocess.run(
                [sys.executable, "-c", child_script, str(Path(__file__).parent.parent), self.temp_dir.name],
                capture_output=True,
                text=True,
                timeout=15,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("LOCKED", result.stdout)
        finally:
            owner.close()

        reopened = AnalysisJobStore(self.temp_dir.name, acquire_process_lock=True)
        reopened.close()

    def test_recovery_report_includes_safe_corruption_reason(self):
        self.store.append_result_chunk("session_test", 1, [{"frameIndex": 1}])
        chunk_path = self.store.job_path("session_test") / "chunks" / "000000000001.json"
        chunk_path.unlink()

        recovered = AnalysisJobStore(Path(self.temp_dir.name), page_limit=3)

        self.assertIn(
            "session_test: recovery failed (JobStoreCorruptionError): Committed result chunk 1 is unreadable",
            recovered.recovery_report["issues"],
        )
        self.assertIn(
            "Committed result chunk 1 is unreadable",
            recovered.get_job("session_test")["error"],
        )

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
