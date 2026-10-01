import sys
import tempfile
import time
import unittest
from pathlib import Path
import threading
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

import server
from analysis_job_store import AnalysisJobStore


class TestCalibrationCheckpointBoundary(unittest.TestCase):
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
            response = self.client.get(f"/api/tracking/sessions/{session_id}/status")
            if response.status_code == 200 and response.json()["status"] in wanted:
                return response.json()
            time.sleep(0.02)
        self.fail(f"Session did not reach one of {wanted}")

    def _recover_calibration(self, session, frame_index):
        response = self.client.post(
            f"/api/tracking/sessions/{session.session_id}/calibration",
            json={
                "corners": [[100, 100], [700, 100], [700, 500], [100, 500]],
                "game_type": session.game_type,
                "frame_index": frame_index,
                "camera_segment_id": session.analyzer.calibration_context.camera_segment_id,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_stride_resume_uses_last_sampled_observation_and_does_not_duplicate_boundary(self):
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        session.status = "PROCESSING"
        session.frame_stride = 2
        session.analyzer.start_camera_segment()
        session.analyzer.lose_calibration()
        server.analysis_job_store.update_job(session_id, {"status": "PROCESSING"})

        # Source frame 2 is sampled and pending; source frame 3 only advances
        # progress. Calibration recovery must checkpoint the committed sample.
        session.current_frame = 2
        session.analyzed_frames = 1
        session.analyzer.frame_count = 1
        server._append_session_result(session, {
            "frameIndex": 1,
            "timestampSec": 2 / 30,
            "cameraSegmentId": session.analyzer.calibration_context.camera_segment_id,
            "players": [],
        })
        session.current_frame = 3
        session.progress_pct = 5.0

        self._recover_calibration(session, frame_index=1)

        checkpoint = server.analysis_job_store.get_job(session_id)["checkpoint"]
        self.assertEqual(checkpoint["committedCursor"], 1)
        self.assertEqual(checkpoint["lastCommittedFrame"], 1)
        self.assertEqual(checkpoint["lastProcessedFrame"], 2)
        self.assertEqual(checkpoint["qualityAccumulator"]["frames"], 1)
        self.assertEqual(checkpoint["segmentCalibrationState"]["cameraSegmentId"], session.analyzer.calibration_context.camera_segment_id)
        self.assertEqual(checkpoint["segmentCalibrationState"]["calibrationId"], session.analyzer.calibration_context.frame_fields()["calibrationId"])

        # Restart at the safe source-frame boundary with stride 2. Frame 2 is
        # warm-up/replay only; frames 4 and 6 become the next canonical rows.
        server.analysis_job_store.update_job(session_id, {"status": "PROCESSING"})
        server.analysis_job_store = AnalysisJobStore(Path(self.temp_dir.name))
        server.tracking_sessions.clear()
        restored = server._restore_persisted_session(session_id)
        self.assertIsNotNone(restored)
        self.assertEqual(restored.status, "INTERRUPTED")
        restored.is_resuming = True
        restored.resume_checkpoint = server.analysis_job_store.get_job(session_id)["checkpoint"]
        restored.resume_distance_aggregates = restored.resume_checkpoint["distanceAggregates"]
        restored.analyzer._detector = "dummy"
        blank = np.zeros((720, 1280, 3), dtype=np.uint8)

        class SixFrameCapture:
            def __init__(self):
                self.frame_position = 0

            def isOpened(self):
                return True

            def get(self, prop):
                if prop == server.cv2.CAP_PROP_FRAME_COUNT:
                    return 6
                if prop == server.cv2.CAP_PROP_FPS:
                    return 30
                if prop == server.cv2.CAP_PROP_POS_MSEC:
                    return self.frame_position * 1000 / 30
                if prop == server.cv2.CAP_PROP_POS_FRAMES:
                    return self.frame_position
                return 0

            def set(self, prop, value):
                if prop != server.cv2.CAP_PROP_POS_FRAMES:
                    return False
                self.frame_position = int(value)
                return True

            def read(self):
                if self.frame_position >= 6:
                    return False, None
                self.frame_position += 1
                return True, blank.copy()

        resumed_capture = SixFrameCapture()
        self.assertEqual(server._analyze_captured_frames(restored, resumed_capture, time.time()), "COMPLETED")
        server._commit_pending_results(restored)
        resumed_page = server.analysis_job_store.page_results(session_id, after_cursor=0, limit=10)
        self.assertEqual([row["frameIndex"] for row in resumed_page["items"]], [1, 2, 3])
        resumed_checkpoint = server.analysis_job_store.get_job(session_id)["checkpoint"]
        self.assertEqual(resumed_checkpoint["lastProcessedFrame"], 6)
        self.assertEqual(resumed_checkpoint["qualityAccumulator"]["frames"], 3)
        self.assertEqual(resumed_checkpoint["committedCursor"], 3)
        self.assertEqual(
            resumed_checkpoint["segmentCalibrationState"]["calibrationId"],
            checkpoint["segmentCalibrationState"]["calibrationId"],
        )

    def test_pending_calibration_commit_and_repeated_resume_keep_rows_statistics_and_calibration_once(self):
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        session.analyzer._detector = "dummy"
        session.analyzer.start_camera_segment()
        session.analyzer.lose_calibration()
        session.status = "PROCESSING"
        server.analysis_job_store.update_job(session_id, {"status": "PROCESSING"})
        blank = np.zeros((720, 1280, 3), dtype=np.uint8)
        for source_frame in range(1, 4):
            telemetry = session.analyzer.process_frame(blank, timestamp_sec=source_frame / 30)
            session.current_frame = source_frame
            session.progress_pct = source_frame / 60 * 100
            server._append_session_result(session, telemetry)

        self.assertEqual(len(session.pending_results), 3)
        self.assertEqual(server.analysis_job_store.get_job(session_id)["checkpoint"]["committedCursor"], 0)
        recovered = self._recover_calibration(session, frame_index=session.analyzer.frame_count)
        self.assertEqual(recovered["sessionStatus"], "PROCESSING")

        job = server.analysis_job_store.get_job(session_id)
        checkpoint = job["checkpoint"]
        self.assertEqual(checkpoint["committedCursor"], 3)
        self.assertEqual(checkpoint["lastProcessedFrame"], 3)
        self.assertEqual(checkpoint["analyzerFrameIndex"], 3)
        self.assertEqual(checkpoint["qualityAccumulator"], session.quality_accumulator.snapshot())
        self.assertEqual(checkpoint["qualityAccumulator"]["frames"], 3)
        self.assertEqual(checkpoint["distanceAggregates"], session.analyzer.dist_tracker.aggregate_snapshot())
        self.assertEqual(
            checkpoint["segmentCalibrationState"]["cameraSegmentId"],
            session.analyzer.calibration_context.camera_segment_id,
        )
        self.assertEqual(
            checkpoint["segmentCalibrationState"]["calibrationId"],
            session.analyzer.calibration_context.frame_fields()["calibrationId"],
        )
        self.assertFalse(checkpoint["temporalState"]["restored"])

        # Simulate a process crash after the calibration journal write.
        server.analysis_job_store.update_job(session_id, {"status": "PROCESSING"})
        server.analysis_job_store = AnalysisJobStore(Path(self.temp_dir.name))
        server.tracking_sessions.clear()
        self.assertEqual(server.analysis_job_store.get_job(session_id)["status"], "INTERRUPTED")

        original_sleep = server.time.sleep
        cancel_requested = False

        def cancel_second_resume(duration):
            nonlocal cancel_requested
            active = server.tracking_sessions.get(session_id)
            if not cancel_requested and active and active.analyzed_frames >= 8:
                cancel_requested = True
                active._cancel = True
            original_sleep(min(duration, 0.001))

        with patch("server.time.sleep", side_effect=cancel_second_resume):
            started = self.client.post(f"/api/tracking/sessions/{session_id}/start")
            self.assertEqual(started.status_code, 200, started.text)
            self._wait_for(session_id, {"CANCELLED"})
        server.tracking_sessions[session_id]._thread.join(5)

        server.analysis_job_store = AnalysisJobStore(Path(self.temp_dir.name))
        server.tracking_sessions.clear()
        resumed = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(resumed.status_code, 200, resumed.text)
        self._wait_for(session_id, {"COMPLETED"})

        final_job = server.analysis_job_store.get_job(session_id)
        page = server.analysis_job_store.page_results(session_id, after_cursor=0, limit=server.RESULT_PAGE_SIZE)
        frame_indexes = [row["frameIndex"] for row in page["items"]]
        self.assertEqual(frame_indexes, list(range(1, 61)))
        self.assertEqual(len(set(frame_indexes)), 60)
        self.assertEqual(final_job["checkpoint"]["committedCursor"], 60)
        self.assertEqual(final_job["checkpoint"]["qualityAccumulator"]["frames"], 60)
        self.assertEqual(final_job["checkpoint"]["analyzedFrames"], 60)
        self.assertEqual(
            final_job["checkpoint"]["segmentCalibrationState"]["cameraSegmentId"],
            checkpoint["segmentCalibrationState"]["cameraSegmentId"],
        )
        self.assertEqual(
            final_job["checkpoint"]["segmentCalibrationState"]["calibrationId"],
            checkpoint["segmentCalibrationState"]["calibrationId"],
        )

    def test_calibration_waits_for_frame_processing_and_append_critical_section(self):
        session_id = self._create_ready_demo()
        session = server.tracking_sessions[session_id]
        session.analyzer.start_camera_segment()
        session.analyzer.lose_calibration()
        session.status = "PROCESSING"
        server.analysis_job_store.update_job(session_id, {"status": "PROCESSING"})

        frame_entered = threading.Event()
        allow_frame = threading.Event()
        calibration_started = threading.Event()
        calibration_finished = threading.Event()
        errors = []
        original_process_frame = session.analyzer.process_frame
        original_sleep = server.time.sleep

        def gated_process_frame(frame, timestamp_sec=None):
            frame_entered.set()
            if not allow_frame.wait(3):
                raise TimeoutError("test did not release frame processing")
            return original_process_frame(frame, timestamp_sec=timestamp_sec)

        session.analyzer.process_frame = gated_process_frame

        def hold_worker_after_first_append(duration):
            if not calibration_finished.wait(3):
                raise TimeoutError("calibration did not finish after frame append")
            session._cancel = True
            original_sleep(0.001)

        def run_analysis():
            try:
                server._analyze_session_frames(session)
            except Exception as error:  # surfaced in the owning test thread
                errors.append(error)

        def recover():
            try:
                calibration_started.set()
                response = self.client.post(
                    f"/api/tracking/sessions/{session_id}/calibration",
                    json={
                        "corners": [[100, 100], [700, 100], [700, 500], [100, 500]],
                        "game_type": session.game_type,
                        "camera_segment_id": session.analyzer.calibration_context.camera_segment_id,
                    },
                )
                if response.status_code != 200:
                    errors.append(AssertionError(response.text))
            except Exception as error:
                errors.append(error)
            finally:
                calibration_finished.set()

        with patch("server.time.sleep", side_effect=hold_worker_after_first_append):
            worker = threading.Thread(target=run_analysis)
            worker.start()
            self.assertTrue(frame_entered.wait(3))
            calibration = threading.Thread(target=recover)
            calibration.start()
            self.assertTrue(calibration_started.wait(3))
            original_sleep(0.05)
            self.assertFalse(calibration_finished.is_set(), "calibration must wait while frame processing owns the state lock")
            allow_frame.set()
            worker.join(5)
            calibration.join(5)

        self.assertFalse(worker.is_alive())
        self.assertFalse(calibration.is_alive())
        self.assertEqual(errors, [])
        checkpoint = server.analysis_job_store.get_job(session_id)["checkpoint"]
        self.assertEqual(checkpoint["committedCursor"], 1)
        self.assertEqual(checkpoint["lastProcessedFrame"], 1)
        self.assertEqual(checkpoint["qualityAccumulator"]["frames"], 1)
        self.assertEqual(len(session.pending_results), 0)
        self.assertEqual(checkpoint["segmentCalibrationState"]["calibrationId"], session.analyzer.calibration_context.frame_fields()["calibrationId"])


class TestChunkCrashBoundaries(unittest.TestCase):
    def test_recovery_uses_journal_as_commit_boundary_at_each_write_stage(self):
        stages = ("before_chunk", "after_chunk", "after_index", "after_journal")
        for stage in stages:
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                store = AnalysisJobStore(root)
                store.create_job("session_crash", {"mediaHash": "media", "configHash": "config"})
                row = {"frameIndex": 7, "timestampSec": 0.25, "value": stage}

                if stage == "before_chunk":
                    fault = patch.object(store, "_write_chunk_file", side_effect=OSError("crash before chunk"))
                elif stage == "after_chunk":
                    write_chunk = store._write_chunk_file

                    def crash_after_chunk(*args, **kwargs):
                        write_chunk(*args, **kwargs)
                        raise OSError("crash after chunk")

                    fault = patch.object(store, "_write_chunk_file", side_effect=crash_after_chunk)
                elif stage == "after_index":
                    write_index = store._ensure_index_record

                    def crash_after_index(*args, **kwargs):
                        write_index(*args, **kwargs)
                        raise OSError("crash after index")

                    fault = patch.object(store, "_ensure_index_record", side_effect=crash_after_index)
                else:
                    write_job = store._write_job

                    def crash_after_journal(*args, **kwargs):
                        write_job(*args, **kwargs)
                        raise OSError("crash after journal")

                    fault = patch.object(store, "_write_job", side_effect=crash_after_journal)

                with fault, self.assertRaises(OSError):
                    store.append_result_chunk("session_crash", 1, [row])

                recovered = AnalysisJobStore(root)
                job = recovered.get_job("session_crash")
                page = recovered.page_results("session_crash", after_cursor=0, limit=10)
                if stage == "after_journal":
                    self.assertEqual(job["checkpoint"]["committedCursor"], 1)
                    self.assertEqual(page["items"], [row])
                    # Retrying the acknowledged sequence is idempotent.
                    recovered.append_result_chunk("session_crash", 1, [row])
                    self.assertEqual(recovered.page_results("session_crash")["totalCount"], 1)
                else:
                    self.assertEqual(job["checkpoint"]["committedCursor"], 0)
                    self.assertEqual(page["items"], [])
                    self.assertFalse((recovered.job_path("session_crash") / "chunks" / "000000000001.json").exists())
                    index_path = recovered.job_path("session_crash") / "chunks.index"
                    self.assertFalse(index_path.exists() and index_path.read_bytes())


if __name__ == "__main__":
    unittest.main()
