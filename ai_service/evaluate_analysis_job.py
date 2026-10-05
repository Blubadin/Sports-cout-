"""Isolated real-video durability/RAM evaluation; no production dependencies added."""
import argparse
import json
import sys
import tempfile
import threading
import time
from pathlib import Path

import cv2
import psutil
import torch

import server
from analysis_job_store import AnalysisJobStore


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--seconds", type=int, default=600)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    # Explicit evaluation execution setting; model, precision and sampling stay
    # at the existing CPU reference profile for both passes.
    torch.set_num_threads(1)
    import ultralytics.utils.torch_utils as torch_utils
    torch_utils.NUM_THREADS = 1  # select_device otherwise resets the declared thread setting
    original_capture = cv2.VideoCapture

    class LimitedCapture:
        def __init__(self, path):
            self.cap = original_capture(path)
            self.limit = min(int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT)), int(args.seconds * self.cap.get(cv2.CAP_PROP_FPS)))
        def get(self, prop):
            return self.limit if prop == cv2.CAP_PROP_FRAME_COUNT else self.cap.get(prop)
        def read(self):
            if self.cap.get(cv2.CAP_PROP_POS_FRAMES) >= self.limit:
                return False, None
            return self.cap.read()
        def __getattr__(self, name):
            return getattr(self.cap, name)

    server.cv2.VideoCapture = LimitedCapture
    report = {"mediaName": Path(args.media).name, "secondsRequested": args.seconds, "cpuThreads": 1, "runs": []}
    process = psutil.Process()
    with tempfile.TemporaryDirectory(prefix="sportscout-long-evaluation-") as folder:
        server.analysis_job_store = AnalysisJobStore(folder)
        for run_id, resume in (("baseline", False), ("recovered", True)):
            session = server.TrackingSession(run_id, video_source=str(Path(args.media).resolve()), game_type="singles", device="cpu")
            session.status = "READY_TO_ANALYZE"
            session.job_store.create_job(run_id, server._session_identity(session), server._session_job_metadata(session))
            server.tracking_sessions[run_id] = session
            started = time.monotonic()
            readings = []
            cancelled = False
            recovered = False
            server.start_session_analysis(run_id)
            while True:
                session = server.tracking_sessions[run_id]
                readings.append({"elapsedSec": round(time.monotonic() - started, 2), "rssBytes": process.memory_info().rss, "frame": session.current_frame, "window": len(session.results)})
                if resume and not cancelled and session.current_frame >= int(session.total_frames / 2):
                    server.cancel_session_analysis(run_id)
                    cancelled = True
                if session._thread and not session._thread.is_alive():
                    if cancelled and not recovered and session.status == "CANCELLED":
                        session.job_store.update_job(run_id, {"status": "PROCESSING"})
                        server.analysis_job_store = AnalysisJobStore(folder)
                        server.tracking_sessions.pop(run_id)
                        recovery_started = time.monotonic()
                        server.start_session_analysis(run_id)
                        report["recoveryStartupSec"] = round(time.monotonic() - recovery_started, 3)
                        recovered = True
                        continue
                    break
                print(json.dumps({"run": run_id, **readings[-1]}), flush=True)
                time.sleep(5)
            session.job_store.validate_committed(run_id)
            job = session.job_store.get_job(run_id)
            report["runs"].append({"id": run_id, "status": session.status, "error": session.error_message, "processingSec": round(time.monotonic() - started, 3), "videoSec": session.duration_sec, "config": session.processing_config, "committedCount": job["checkpoint"]["committedCursor"], "maxWindow": max(r["window"] for r in readings), "ramReadings": readings, "resume": job.get("resume")})
        baseline = server.analysis_job_store.iter_chunks("baseline")
        recovered = server.analysis_job_store.iter_chunks("recovered")
        def rows(chunks):
            for chunk in chunks:
                yield from chunk
        from itertools import zip_longest
        mismatch = 0
        count = 0
        prior_frame = -1
        duplicates = 0
        for left, right in zip_longest(rows(baseline), rows(recovered)):
            count += 1
            if right:
                if right["frameIndex"] <= prior_frame:
                    duplicates += 1
                prior_frame = right["frameIndex"]
            # Compare canonical tracking output, excluding session-level random
            # calibration identities and elapsed processing time.
            keys = ("frameIndex", "timestampSec", "cameraSegmentId", "players", "shuttle", "sceneState")
            if left is None or right is None or any(left.get(key) != right.get(key) for key in keys):
                mismatch += 1
        report["parity"] = {"tolerance": "exact canonical fields listed in script, frozen before run", "count": count, "mismatchedRows": mismatch, "duplicateOrReorderedFrames": duplicates, "status": ("PASS" if mismatch == 0 and duplicates == 0 else "FAIL") if count > 0 and all(run["status"] == "COMPLETED" for run in report["runs"]) else "NOT VALIDATED"}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"output": args.output, "parity": report["parity"]}), flush=True)


if __name__ == "__main__":
    main()
