import sys
import tempfile
import time
import errno
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
import server
from analysis_job_store import AnalysisJobStore


class TestAnalysisJobAPI(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.prior_store = server.analysis_job_store
        server.analysis_job_store = AnalysisJobStore(Path(self.temp_dir.name))
        server.tracking_sessions.clear()
        self.client = TestClient(server.app)

    def tearDown(self):
        for session in server.tracking_sessions.values():
            if session._thread and session._thread.is_alive():
                session._cancel = True
                session._thread.join(5)
        server.tracking_sessions.clear()
        server.analysis_job_store = self.prior_store
        self.temp_dir.cleanup()

    def _create_ready_demo(self):
        created = self.client.post("/api/tracking/sessions", json={"video_source": "demo", "game_type": "singles"})
        self.assertEqual(created.status_code, 200)
        session_id = created.json()["sessionId"]
        calibrated = self.client.post(
            f"/api/tracking/sessions/{session_id}/calibration",
            json={"corners": [[100, 100], [700, 100], [700, 500], [100, 500]], "game_type": "singles"},
        )
        self.assertEqual(calibrated.status_code, 200)
        return session_id

    def _wait_for(self, session_id, wanted, timeout=8):
        deadline = time.time() + timeout
        while time.time() < deadline:
            status = self.client.get(f"/api/tracking/sessions/{session_id}/status")
            if status.status_code == 200 and status.json()["status"] in wanted:
                return status.json()
            time.sleep(0.02)
        self.fail(f"Session did not reach one of {wanted}")

    def test_completed_results_are_durable_paged_and_session_memory_is_bounded(self):
        session_id = self._create_ready_demo()
        started = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(started.status_code, 200)
        self._wait_for(session_id, {"COMPLETED"})

        session = server.tracking_sessions[session_id]
        self.assertLessEqual(len(session.results), server.SESSION_RESULT_WINDOW_SIZE)
        job = server.analysis_job_store.get_job(session_id)
        self.assertEqual(job["status"], "COMPLETED")
        self.assertEqual(job["checkpoint"]["committedCursor"], 60)
        self.assertEqual(job["checkpoint"]["temporalState"]["restored"], False)

        page = self.client.get(f"/api/tracking/sessions/{session_id}/results", params={"after": 0, "limit": 5})
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.json()["sampleCount"], 5)
        self.assertEqual(page.json()["totalSampleCount"], 60)
        self.assertEqual(page.json()["nextCursor"], 5)

        clamped = self.client.get(f"/api/tracking/sessions/{session_id}/results", params={"after": 0, "limit": 5000})
        self.assertEqual(clamped.status_code, 200)
        self.assertLessEqual(clamped.json()["sampleCount"], server.RESULT_PAGE_SIZE)

    def test_interrupted_job_resumes_from_committed_boundary_without_duplicate_results(self):
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        original_chunk_size = server.ANALYSIS_RESULT_CHUNK_SIZE
        server.ANALYSIS_RESULT_CHUNK_SIZE = 1
        original_sleep = server.time.sleep
        cancel_requested = False

        def cancel_after_three_frames(duration):
            nonlocal cancel_requested
            if not cancel_requested and session.analyzed_frames >= 3:
                cancel_requested = True
                session._cancel = True
            original_sleep(min(duration, 0.001))

        try:
            with patch("server.time.sleep", side_effect=cancel_after_three_frames):
                started = self.client.post(f"/api/tracking/sessions/{session_id}/start")
                self.assertEqual(started.status_code, 200)
                self._wait_for(session_id, {"CANCELLED"})
        finally:
            server.ANALYSIS_RESULT_CHUNK_SIZE = original_chunk_size

        job = server.analysis_job_store.get_job(session_id)
        self.assertEqual(job["checkpoint"]["committedCursor"], 3)
        server.analysis_job_store.update_job(session_id, {"status": "PROCESSING"})

        recovered_store = AnalysisJobStore(Path(self.temp_dir.name))
        self.assertIn(session_id, recovered_store.recovery_report["interrupted"])
        server.analysis_job_store = recovered_store
        server.tracking_sessions.clear()  # Simulate the process-local session registry being lost.
        interrupted = self.client.get(f"/api/tracking/sessions/{session_id}/status")
        self.assertEqual(interrupted.status_code, 200)
        self.assertEqual(interrupted.json()["status"], "INTERRUPTED")

        resumed = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(resumed.json()["status"], "resumed")
        self._wait_for(session_id, {"COMPLETED"})

        page = self.client.get(f"/api/tracking/sessions/{session_id}/results", params={"after": 0, "limit": 250})
        frames = page.json()["telemetry"]
        frame_indexes = [row["frameIndex"] for row in frames]
        self.assertEqual(len(frames), 60)
        self.assertEqual(len(set(frame_indexes)), 60)
        self.assertEqual(frame_indexes, list(range(1, 61)))
        resume_info = recovered_store.get_job(session_id)["resume"]
        self.assertFalse(resume_info["temporalStateRestoredExactly"])

    def test_cancel_endpoint_commits_a_resumable_interrupted_boundary(self):
        session_id = self._create_ready_demo()
        original_sleep = server.time.sleep

        with patch("server.time.sleep", side_effect=lambda duration: original_sleep(0.01)):
            started = self.client.post(f"/api/tracking/sessions/{session_id}/start")
            self.assertEqual(started.status_code, 200)
            self._wait_for(session_id, {"PROCESSING"})
            requested = self.client.post(f"/api/tracking/sessions/{session_id}/cancel")
            self.assertEqual(requested.status_code, 200)
            self.assertEqual(requested.json()["status"], "cancellation_requested")
            self._wait_for(session_id, {"CANCELLED"})

        job = server.analysis_job_store.get_job(session_id)
        self.assertEqual(job["status"], "CANCELLED")
        self.assertGreater(job["checkpoint"]["committedCursor"], 0)
        self.assertTrue(job["resume"]["available"])

    def test_storage_failure_is_error_and_never_completed(self):
        session_id = self._create_ready_demo()
        with patch.object(server.analysis_job_store, "append_result_chunk", side_effect=OSError(errno.ENOSPC, "disk full")):
            self.client.post(f"/api/tracking/sessions/{session_id}/start")
            self._wait_for(session_id, {"ERROR"})
            server.tracking_sessions[session_id]._thread.join(timeout=5)
        self.assertEqual(server.analysis_job_store.get_job(session_id)["status"], "ERROR")
        self.assertEqual(server.analysis_job_store.get_job(session_id)["checkpoint"]["committedCursor"], 0)

    def test_corrupt_committed_chunk_returns_session_error_instead_of_network_failure(self):
        session_id = self._create_ready_demo()
        server.analysis_job_store.append_result_chunk(session_id, 1, [{"frameIndex": 1}])
        chunk_path = server.analysis_job_store.job_path(session_id) / "chunks" / "000000000001.json"
        chunk_path.unlink()

        server.analysis_job_store.recover()
        server.tracking_sessions.clear()

        status = self.client.get(f"/api/tracking/sessions/{session_id}/status")
        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.json()["status"], "ERROR")
        self.assertIn("Committed result chunk 1 is unreadable", status.json()["error"])

        results = self.client.get(f"/api/tracking/sessions/{session_id}/results")
        self.assertEqual(results.status_code, 409)

    def test_restore_keeps_active_segment_and_does_not_restore_pre_cut_calibration(self):
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        session.analyzer.start_camera_segment()
        session.analyzer.start_camera_segment()
        session.current_frame = 2
        server._append_session_result(session, {"frameIndex": 2, "cameraSegmentId": "segment-2", "players": []})
        server._commit_pending_results(session)
        server._persist_session_job(session, status="CANCELLED")
        server.tracking_sessions.clear()
        restored = server._restore_persisted_session(session_id)
        self.assertIsNone(restored.analyzer.mapper.H)
        self.assertEqual(restored.analyzer.calibration_context.camera_segment_id, "segment-2")
        restored.analyzer.start_camera_segment()
        self.assertEqual(restored.analyzer.calibration_context.camera_segment_id, "segment-3")

    def test_worker_concurrency_is_bounded(self):
        import threading
        entered = threading.Event()
        release = threading.Event()
        first = self._create_ready_demo()
        second = self._create_ready_demo()
        def gated(session):
            entered.set()
            release.wait(5)
            return "COMPLETED"
        with patch("server._analyze_session_frames", side_effect=gated):
            self.assertEqual(self.client.post(f"/api/tracking/sessions/{first}/start").status_code, 200)
            self.assertTrue(entered.wait(3))
            self.assertEqual(self.client.post(f"/api/tracking/sessions/{second}/start").status_code, 429)
            release.set()
            server.tracking_sessions[first]._thread.join(5)
        self.assertEqual(server.tracking_sessions[second].status, "READY_TO_ANALYZE")


    def test_repeated_cancel_restart_resume_is_idempotent(self):
        session_id = self._create_ready_demo()
        original_sleep = server.time.sleep
        with patch("server.ANALYSIS_RESULT_CHUNK_SIZE", 1):
            for boundary in (3, 6, 9):
                def cancel_at_boundary(duration):
                    session = server.tracking_sessions[session_id]
                    if session.analyzed_frames >= boundary:
                        session._cancel = True
                    original_sleep(0.001)
                with patch("server.time.sleep", side_effect=cancel_at_boundary):
                    self.assertEqual(self.client.post(f"/api/tracking/sessions/{session_id}/start").status_code, 200)
                    self._wait_for(session_id, {"CANCELLED"})
                    server.tracking_sessions[session_id]._thread.join(5)
                server.analysis_job_store.update_job(session_id, {"status": "PROCESSING"})
                server.analysis_job_store = AnalysisJobStore(self.temp_dir.name)
                server.tracking_sessions.clear()
            self.assertEqual(self.client.post(f"/api/tracking/sessions/{session_id}/start").status_code, 200)
            self._wait_for(session_id, {"COMPLETED"})
        page = server.analysis_job_store.page_results(session_id)
        self.assertEqual([row["frameIndex"] for row in page["items"]], list(range(1, 61)))
        self.assertEqual(server.analysis_job_store.get_job(session_id)["resumeSequence"], 3)
        self.assertEqual(len(list((server.analysis_job_store.job_path(session_id) / "resume-events").glob("*.json"))), 3)

    def test_incompatible_config_and_missing_media_reject_resume(self):
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        server._persist_session_job(session, status="CANCELLED")
        job = server.analysis_job_store.get_job(session_id)
        bad_identity = {**job["identity"], "configHash": "changed"}
        server.analysis_job_store.update_job(session_id, {"identity": bad_identity})
        server.tracking_sessions.clear()
        self.assertEqual(self.client.post(f"/api/tracking/sessions/{session_id}/start").status_code, 409)
        second = self._create_ready_demo()
        session = server.tracking_sessions[second]
        session.video_source = str(Path(self.temp_dir.name) / "missing.mp4")
        server._persist_session_job(session, status="CANCELLED")
        server.tracking_sessions.clear()
        self.assertEqual(self.client.post(f"/api/tracking/sessions/{second}/start").status_code, 409)


    def test_job_listing_is_paged_without_recreating_analyzers(self):
        ids = [self._create_ready_demo() for _ in range(3)]
        server.tracking_sessions.clear()
        with patch("server.TrackingSession", side_effect=AssertionError("Must not load models for listing")):
            first = self.client.get("/api/tracking/sessions", params={"limit": 2}).json()
            self.assertEqual(len(first["sessions"]), 2)
            second = self.client.get("/api/tracking/sessions", params={"limit": 2, "after": first["nextCursor"]}).json()
            self.assertEqual(len(second["sessions"]), 1)
        self.assertEqual(sorted(row["sessionId"] for row in first["sessions"] + second["sessions"]), sorted(ids))

    def test_interrupted_job_is_discoverable_after_the_first_bounded_page(self):
        for index in range(5):
            session_id = f"paged-job-{index:03d}"
            server.analysis_job_store.create_job(
                session_id,
                {"configHash": f"config-{index}", "mediaHash": f"media-{index}"},
                {"session": {
                    "projectId": "project-paged",
                    "videoFingerprint": f"fingerprint-{index}",
                    "gameType": "singles",
                    "processingConfig": {"frameStride": 1},
                }},
            )
            server.analysis_job_store.update_job(session_id, {
                "status": "INTERRUPTED" if index == 4 else "COMPLETED",
                "resume": {"available": index == 4, "mode": "SAFE_BOUNDARY_REPROCESS" if index == 4 else None},
            })
        server.tracking_sessions.clear()

        with patch("server.TrackingSession", side_effect=AssertionError("Listing must not recreate analyzers")):
            first = self.client.get("/api/tracking/sessions", params={"limit": 2}).json()
            second = self.client.get(
                "/api/tracking/sessions",
                params={"limit": 2, "after": first["nextCursor"]},
            ).json()
            third = self.client.get(
                "/api/tracking/sessions",
                params={"limit": 2, "after": second["nextCursor"]},
            ).json()

        rows = first["sessions"] + second["sessions"] + third["sessions"]
        interrupted = next(row for row in rows if row["sessionId"] == "paged-job-004")
        self.assertTrue(interrupted["resumable"])
        self.assertTrue(interrupted["resume"]["available"])
        self.assertEqual(interrupted["projectId"], "project-paged")
        self.assertEqual(first["maximumPageSize"], server.analysis_job_store.maximum_page_size)
        self.assertIn("recoveryIssues", first)
        self.assertIn("pageIssues", first)

    def test_artifact_hash_change_rejects_resume(self):
        session_id = self._create_ready_demo()
        artifact = Path(self.temp_dir.name) / "model.pt"
        artifact.write_bytes(b"first-model")
        session = server.tracking_sessions[session_id]
        session.processing_config["modelArtifactReference"] = str(artifact)
        server._persist_session_job(session, status="CANCELLED")
        artifact.write_bytes(b"different-model")
        server.tracking_sessions.clear()
        response = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(response.status_code, 409)
        self.assertIn("identity changed", response.json()["detail"])


    def test_restore_appearance_summary_and_aggregates_without_reusing_track_or_bbox(self):
        import numpy as np
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        profile = session.analyzer.profiles[1]
        profile.name = "Persisted player"
        profile.team = 1
        profile.track_id = 42
        profile.last_bbox = [100, 100, 200, 200]
        profile.color_hist = np.ones((16, 16), dtype=np.float32)
        session.current_frame = 1
        session.duration_sec = 5
        session.source_fps = 30
        server._append_session_result(session, {"frameIndex": 1, "players": []})
        server._commit_pending_results(session)
        server._persist_session_job(session, status="COMPLETED")
        prior = self.client.get(f"/api/tracking/sessions/{session_id}/status").json()
        server.tracking_sessions.clear()
        restored = server._restore_persisted_session(session_id)
        self.assertEqual(restored.analyzer.profiles[1].name, "Persisted player")
        self.assertEqual(restored.analyzer.profiles[1].team, 1)
        self.assertIsNone(restored.analyzer.profiles[1].track_id)
        self.assertIsNone(restored.analyzer.profiles[1].last_bbox)
        np.testing.assert_array_equal(restored.analyzer.profiles[1].color_hist, profile.color_hist)
        after = self.client.get(f"/api/tracking/sessions/{session_id}/status").json()
        self.assertEqual(after["players"], prior["players"])
        self.assertEqual(after["sourceFps"], 30)
        self.assertEqual(after["durationSec"], 5)
        self.assertEqual(after["runtimeProvenance"], prior["runtimeProvenance"])


    def test_raw_owner_history_is_bounded_without_evicting_active_identity(self):
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        session.analyzer.profiles[1].track_id = 1
        session.analyzer.last_known_track_owners.update({index: 1 for index in range(1, 10)})
        with patch("server.SEMANTIC_OWNER_HISTORY_LIMIT", 3):
            server._append_session_result(session, {"frameIndex": 1, "players": []})
        self.assertEqual(len(session.analyzer.last_known_track_owners), 3)
        self.assertIn(1, session.analyzer.last_known_track_owners)

    def test_resume_warmup_covers_the_temporal_contract(self):
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        session.processing_config.update({"shuttleEnabled": True, "shuttleWindowSize": 20})
        session.frame_stride = 3
        self.assertEqual(server._resume_warmup_source_frames(session), 60)


if __name__ == "__main__":
    unittest.main()
