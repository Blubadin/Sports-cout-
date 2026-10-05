"""Persistent real-video evaluation using the production analysis-job worker.

No synthetic observations, model tuning, or exact temporal restoration claims.
Prepare freezes code, artifacts and diagnostics BEFORE running child processes.
Each restart uses a fresh interpreter and the production durable reconstruction.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import platform
import subprocess
import sys
import time


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False), encoding="utf-8")
    os.replace(temporary, path)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def code_hashes():
    return {p.name: sha(p) for p in sorted(Path(__file__).parent.glob("*.py"))}


def load_runtime(root):
    # Set before importing server: never open the user's normal job store.
    os.environ["SPORTSCOUT_ANALYSIS_STORE_DIR"] = str(Path(root).resolve())
    import torch
    import ultralytics.utils.torch_utils as torch_utils
    torch.set_num_threads(1)  # Existing evaluate_analysis_job.py CPU execution setting.
    torch_utils.NUM_THREADS = 1
    import server
    return server


def prepare(args):
    import cv2
    import torch
    server = load_runtime(Path(args.protocol).parent / "preflight-store")
    cap = cv2.VideoCapture(args.media)
    frames, fps = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), cap.get(cv2.CAP_PROP_FPS)
    if args.seconds <= 0 or frames <= 0 or not math.isfinite(fps) or fps <= 0:
        cap.release()
        raise ValueError("Positive duration, source frame count and finite positive FPS required")
    media = {"path": str(Path(args.media).resolve()), "sha256": sha(args.media),
             "bytes": Path(args.media).stat().st_size, "frames": frames, "fps": fps,
             "durationSec": frames / fps, "width": cap.get(cv2.CAP_PROP_FRAME_WIDTH),
             "height": cap.get(cv2.CAP_PROP_FRAME_HEIGHT), "firstFrameDecoded": cap.read()[0]}
    cap.release()
    if not media["firstFrameDecoded"] or frames < args.seconds * fps:
        raise ValueError("Requested duration requires actual decodable source media; no looping")
    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("Requested CUDA evidence requires actual available hardware/runtime")
    config = server.resolve_processing_config({"profile": "reference", "device": args.device,
        "detectorModel": str(Path(args.models, "yolov8n.pt").resolve()),
        "poseModel": str(Path(args.models, "yolov8n-pose.pt").resolve()),
        "shuttleEnabled": False, "autoCourtCalibrationEnabled": True}, runtime_device=args.device)
    import ultralytics
    tracker = Path(ultralytics.__file__).parent / "cfg/trackers/bytetrack.yaml"
    repo = Path(__file__).resolve().parent.parent
    def git(*command):
        return subprocess.check_output([args.git, *command], cwd=repo).decode("utf-8")
    full_config = server.resolve_processing_config({**config, "profile": "quality", "frameStride": 1,
        "shuttleEnabled": True, "shuttleProvider": "rallylens_tracknet", "shuttleRuntime": "pytorch",
        "shuttleWindowSize": 9, "shuttleModelPath": str(repo / ".local-models/rallylens-shuttle-tracknet.pth"),
        "shuttleDevice": args.device}, runtime_device=args.device)
    protocol = {"schemaVersion": 1, "preparedAtUnix": time.time(),
        "codeSha": git("rev-parse", "HEAD").strip(), "branch": git("branch", "--show-current").strip(),
        "workingTreeStatus": git("status", "--short"), "workingTreeDiff": git("diff", "--binary"),
        "untrackedSourceContents": {name: (repo / name).read_text(encoding="utf-8") for name in
            git("ls-files", "--others", "--exclude-standard").splitlines() if name.endswith(".py")},
        "codeFileHashes": code_hashes(), "runnerSha256": sha(__file__), "media": media,
        "seconds": args.seconds, "sourceFrames": int(args.seconds * fps),
        "expectedRows": int(args.seconds * fps) // config["frameStride"],
        "configurationClass": "REDUCED_PLAYER_POSE_AUTO_CALIBRATION_NO_SHUTTLE",
        "fullPipelineValidated": False, "processingConfig": config, "gameType": "doubles",
        "fullConfigurationNotExecuted": {"status": "NOT VALIDATED", "processingConfig": full_config,
            "reason": "Pinned RallyLens artifact missing; not comparable to reduced stride2 workload"},
        "device": args.device, "precision": "fp32", "cpuThreads": 1,
        "torchCudaRuntime": torch.version.cuda,
        "cudaDevices": [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())],
        "torchBackendDefaults": {"cudaMatmulAllowTf32": torch.backends.cuda.matmul.allow_tf32,
            "cudnnAllowTf32": torch.backends.cudnn.allow_tf32, "cudnnBenchmark": torch.backends.cudnn.benchmark,
            "deterministicAlgorithms": torch.are_deterministic_algorithms_enabled()},
        "gpuOptimization": "None: existing PyTorch backend and FP32 tensors; backend defaults recorded without tuning",
        "python": sys.version, "platform": platform.platform(),
        "packages": subprocess.check_output([sys.executable, "-m", "pip", "freeze"]).decode(),
        "artifacts": [{"path": str(p), "sha256": sha(p), "bytes": p.stat().st_size}
                      for p in [Path(config["detectorModel"]), Path(config["poseModel"]), tracker,
                          Path(ultralytics.__file__).parent / "cfg/default.yaml"]],
        "modelAcquisition": "Explicit preflight downloads of unchanged yolov8n.pt and yolov8n-pose.pt from https://github.com/ultralytics/assets/releases/download/v8.3.0/; never downloaded during analysis",
        "preprocessing": "Installed Ultralytics Detection/PosePredictor BGR->RGB letterbox640 FP32 /255; pose on person ROI mapped back to source pixels",
        "postprocessing": "Installed Ultralytics NMS defaults; detector confidence0.35, pose confidence0.4; COCO17 source-frame pixels; ByteTrack pinned YAML",
        "sampling": "Decode originals in order, analyze every second source frame, poseStride1. Limit only source duration; no duplicate footage.",
        "interruptAfterCommittedSourceFrame": int(args.seconds * fps / 2),
        "diagnosticTolerances": {"timestampSec": 1e-9, "coordinates": 1e-6},
        "parityPolicy": "Exact: schemas, order, duplicate absence, frame/timestamp alignment and retained committed prefix. Numerical/identity differences measured, not forced equal; safe-boundary warmup, no exact temporal restore.",
        "qualityThresholdApproval": "UNSET", "ramGrowthThresholdApproval": "UNSET",
        "heldOutGroundTruth": "NONE_QUALIFIED_IN_CHECKED_IN_MANIFEST",
        "manualCorrectionPersistence": "NOT VALIDATED: no human corrections supplied",
        "missingFullPipelineArtifact": "RallyLens checkpoint SHA256 08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5 unavailable; full provider requires frameStride1"}
    if Path(args.protocol).exists():
        raise FileExistsError("Frozen protocol already exists; create a new evaluation directory")
    write(args.protocol, protocol)
    print(json.dumps({"prepared": args.protocol, "configurationClass": protocol["configurationClass"]}), flush=True)


def worker(args, protocol):
    import cv2
    import torch
    server = load_runtime(Path(args.output) / "store")
    original_capture = cv2.VideoCapture
    class LimitedCapture:
        def __init__(self, path):
            self.cap = original_capture(path)
        def get(self, prop):
            return protocol["sourceFrames"] if prop == cv2.CAP_PROP_FRAME_COUNT else self.cap.get(prop)
        def read(self):
            if self.cap.get(cv2.CAP_PROP_POS_FRAMES) >= protocol["sourceFrames"]:
                return False, None
            return self.cap.read()
        def __getattr__(self, name):
            return getattr(self.cap, name)
    server.cv2.VideoCapture = LimitedCapture
    folder = Path(args.output) / args.mode
    folder.mkdir(exist_ok=True, parents=True)
    job_path = server.analysis_job_store.job_path(args.mode) / "job.json"
    restored = job_path.exists()
    before = read(job_path) if restored else None
    if not restored:
        session = server.TrackingSession(args.mode, video_source=protocol["media"]["path"],
            game_type=protocol["gameType"], device=protocol["device"], processing_config=protocol["processingConfig"])
        session.status = "READY_TO_ANALYZE"
        session.job_store.create_job(args.mode, server._session_identity(session), server._session_job_metadata(session))
        server.tracking_sessions[args.mode] = session
    started = server.start_session_analysis(args.mode)
    session = server.tracking_sessions[args.mode]
    write(folder / f"startup-{os.getpid()}.json", {"pid": os.getpid(), "restoredFromDurableJob": restored,
        "startResult": started, "recoveryReport": server.analysis_job_store.recovery_report,
        "checkpointBeforeStart": before.get("checkpoint") if before else None,
        "processingConfig": session.processing_config, "modelIdentity": server._model_identity(session)})
    while True:
        snapshot = {"pid": os.getpid(), "sourceFrame": session.current_frame, "status": session.status,
            "cudaAllocatedBytes": torch.cuda.memory_allocated() if torch.cuda.is_available() else None,
            "cudaReservedBytes": torch.cuda.memory_reserved() if torch.cuda.is_available() else None,
            "resultWindow": len(session.results), "pending": len(session.pending_results),
            "semanticOwners": len(session.analyzer.last_known_track_owners),
            "transitionHistory": len(session.analyzer.scene_lifecycle.transition_history),
            "checkpoint": session.job_store.get_job(args.mode)["checkpoint"]}
        write(folder / "progress.json", snapshot)
        if (folder / "cancel-request").exists() and session.status == "PROCESSING":
            server.cancel_session_analysis(args.mode)
        if session._thread and not session._thread.is_alive():
            break
        time.sleep(2)
    session.job_store.validate_committed(args.mode)
    write(folder / f"finish-{os.getpid()}.json", {"status": session.status, "error": session.error_message,
        "job": session.job_store.get_job(args.mode), "sourceFrame": session.current_frame})


def committed_prefix(root, mode):
    job = read(root / "store" / mode / "job.json")
    return {"checkpoint": job["checkpoint"], "metadata": job["metadata"],
        "chunks": {f"{i:012d}.json": sha(root / "store" / mode / "chunks" / f"{i:012d}.json")
                   for i in range(1, job["checkpoint"]["committedSequence"] + 1)}}


def run(args, protocol):
    import psutil
    root = Path(args.output).resolve()
    root.mkdir(parents=True, exist_ok=True)
    report = {"protocolPath": str(Path(args.protocol).resolve()), "protocolSha256": sha(args.protocol),
              "codeSha": protocol["codeSha"], "configurationClass": protocol["configurationClass"], "runs": []}
    modes = ["baseline", "cancel_restart", "process_kill"] if args.mode == "all" else [args.mode]
    for mode in modes:
        if (root / "store" / mode).exists():
            raise FileExistsError("Refusing to reuse an existing evaluation job")
        folder = root / mode
        folder.mkdir(exist_ok=True)
        readings, processes = [], []
        prefix = None
        began = time.monotonic()
        for attempt in range(2 if mode != "baseline" else 1):
            command = [sys.executable, str(Path(__file__).resolve()), "--worker", "--protocol", args.protocol,
                       "--output", str(root), "--mode", mode]
            with (folder / f"worker-{attempt}.log").open("w", encoding="utf-8") as log:
                process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, cwd=Path(__file__).parent)
                processes.append({"pid": process.pid, "command": command})
                requested = False
                while process.poll() is None:
                    progress_path = folder / "progress.json"
                    progress = read(progress_path) if progress_path.exists() else {}
                    try:
                        launcher = psutil.Process(process.pid)
                        descendants = launcher.children(recursive=True)
                        owned_pids = {process.pid, *(p.pid for p in descendants)}
                        # Windows venv python.exe can be a redirector. Measure/kill
                        # the interpreter doing inference, not just its launcher.
                        observed_pid = progress.get("pid")
                        target = psutil.Process(observed_pid) if observed_pid in owned_pids else (descendants[-1] if descendants else launcher)
                        rss = target.memory_info().rss
                    except psutil.NoSuchProcess:
                        break
                    if progress.get("pid") not in owned_pids:
                        progress = {}  # Previous interpreter's final snapshot.
                    sample = {**{k: v for k, v in progress.items() if k != "checkpoint"},
                              "elapsedSec": round(time.monotonic() - began, 3), "pid": target.pid,
                              "launcherPid": process.pid, "rssBytes": rss}
                    processes[-1]["workerPid"] = target.pid
                    cp = progress.get("checkpoint", {})
                    sample.update({"committedCursor": cp.get("committedCursor", 0),
                                   "committedSequence": cp.get("committedSequence", 0),
                                   "committedSourceFrame": cp.get("lastProcessedFrame", 0)})
                    readings.append(sample)
                    with (folder / "readings.jsonl").open("a", encoding="utf-8") as stream:
                        stream.write(json.dumps(sample) + "\n")
                    print(json.dumps({"run": mode, "attempt": attempt, **sample}), flush=True)
                    live_job = read(root / "store" / mode / "job.json") if (root / "store" / mode / "job.json").exists() else {}
                    if mode != "baseline" and attempt == 0 and not requested and live_job.get("status") == "PROCESSING" and cp.get("lastProcessedFrame", 0) >= protocol["interruptAfterCommittedSourceFrame"] and cp.get("committedCursor", 0) > 0 and cp.get("lastProcessedFrame", 0) < protocol["sourceFrames"]:
                        requested = True
                        if mode == "process_kill":
                            prefix = committed_prefix(root, mode)
                            write(folder / "before-interruption.json", prefix)
                            processes[-1]["killedWorkerPid"] = target.pid
                            target.kill()  # Evaluator-owned inference interpreter; no graceful flush.
                        else:
                            (folder / "cancel-request").write_text("production cancel", encoding="utf-8")
                    time.sleep(5)
                process.wait()
                processes[-1]["exitCode"] = process.returncode
                processes[-1]["interruptionRequested"] = requested
            job_path = root / "store" / mode / "job.json"
            job = read(job_path) if job_path.exists() else {}
            if attempt == 0 and requested:
                if mode == "cancel_restart":
                    prefix = committed_prefix(root, mode)
                    write(folder / "before-interruption.json", prefix)
                    (folder / "cancel-request").unlink()
                continue
            break
        elapsed = time.monotonic() - began
        prefix_retained = None if prefix is None else all(sha(root / "store" / mode / "chunks" / name) == value for name, value in prefix["chunks"].items())
        item = {"id": mode, "status": job.get("status", "ERROR"), "error": job.get("error"),
            "processingSec": elapsed, "sourceDurationCommittedSec": job.get("checkpoint", {}).get("lastProcessedFrame", 0) / protocol["media"]["fps"],
            "processingTimePerRequestedVideoTime": elapsed / protocol["seconds"], "processes": processes,
            "prefixChunksRetained": prefix_retained, "checkpoint": job.get("checkpoint"),
            "resume": job.get("resume"), "maxRssBytes": max((x["rssBytes"] for x in readings), default=None),
            "maxCudaAllocatedBytes": max((x["cudaAllocatedBytes"] for x in readings if x.get("cudaAllocatedBytes") is not None), default=None),
            "maxCudaReservedBytes": max((x["cudaReservedBytes"] for x in readings if x.get("cudaReservedBytes") is not None), default=None),
            "bufferMaxima": {k: max((x.get(k, 0) for x in readings), default=0) for k in ("resultWindow", "pending", "semanticOwners", "transitionHistory")}}
        report["runs"].append(item)
        write(root / "report.json", report)  # Preserve partial evidence after each run.
    summarize(root, protocol, report)


def rows(store, mode):
    for chunk in store.iter_chunks(mode):
        yield from chunk


def numeric_difference(left, right, tolerance):
    """Compare same-schema numeric leaves; null stays unavailable, never zero."""
    result = {"pairedFiniteValues": 0, "availabilityOrShapeDifferences": 0,
              "valuesOutsideTolerance": 0, "maxAbsoluteDifference": None}
    def visit(a, b):
        if isinstance(a, dict) and isinstance(b, dict):
            for key in a.keys() | b.keys():
                visit(a.get(key), b.get(key))
        elif isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
            if len(a) != len(b):
                result["availabilityOrShapeDifferences"] += 1
            for x, y in zip(a, b):
                visit(x, y)
        elif a is None or b is None:
            result["availabilityOrShapeDifferences"] += int(a != b)
        elif type(a) in (float, int) and type(b) in (float, int):
            difference = abs(a - b)
            result["pairedFiniteValues"] += 1
            result["valuesOutsideTolerance"] += int(difference > tolerance)
            result["maxAbsoluteDifference"] = max(result["maxAbsoluteDifference"] or 0, difference)
        elif type(a) != type(b):
            result["availabilityOrShapeDifferences"] += 1
    visit(left, right)
    return result


def summarize(root, protocol, report):
    from analysis_job_store import AnalysisJobStore
    report["postProcessingRunnerSha256"] = sha(__file__)
    store = AnalysisJobStore(root / "store")  # Workers are finished before recovery/validation.
    for item in report["runs"]:
        mode = item["id"]
        counts, states = Counter(), Counter()
        previous = (0, -1.0)
        try:
            store.validate_committed(mode)
            for row in rows(store, mode):
                counts["rows"] += 1
                current = row["frameIndex"], row["timestampSec"]
                counts["duplicateOrOrderViolations"] += int(current[0] <= previous[0] or current[1] <= previous[1])
                counts["frameIndexGaps"] += int(current[0] != counts["rows"])
                expected_timestamp = round((counts["rows"] * protocol["processingConfig"]["frameStride"] - 1) / protocol["media"]["fps"], 3)
                counts["timestampAlignmentViolations"] += int(abs(current[1] - expected_timestamp) > protocol["diagnosticTolerances"]["timestampSec"])
                counts["schemaOrSyntheticViolations"] += int(row.get("schemaVersion") != 1 or row.get("source") != "real_tracking" or row.get("isSynthetic") is not False)
                previous = current
                states[str(row.get("sceneState"))] += 1
                for key in ("isMetricValid", "canUseCourtMetric", "canBuildHeatmap", "canEstimateHit", "allowCanonicalWrites"):
                    counts[key] += int(row.get(key) is True)
                counts["shuttleObservations"] += int(row.get("shuttle") is not None)
                for player in row.get("players", []):
                    counts["playerObservations"] += 1
                    counts["playerObserved"] += int(player.get("state") == "observed")
                    counts["courtPositionAvailable"] += int(player.get("courtPosition") is not None)
            item["exactInvariants"] = {"chainIntegrity": True, **{k: counts[k] for k in ("duplicateOrOrderViolations", "schemaOrSyntheticViolations", "frameIndexGaps", "timestampAlignmentViolations")}, "expectedRowCount": protocol["expectedRows"], "actualRowCount": counts["rows"]}
            item["completionGate"] = "PASS" if item["status"] == "COMPLETED" and counts["rows"] == protocol["expectedRows"] and not any(counts[k] for k in ("duplicateOrOrderViolations", "schemaOrSyntheticViolations", "frameIndexGaps", "timestampAlignmentViolations")) else "FAIL"
        except Exception as error:
            item["exactInvariants"] = {"chainIntegrity": False, "error": str(error)}
            item["completionGate"] = "FAIL"
        item["observationCounts"] = dict(counts)
        item["sceneCounts"] = dict(states)
        item["qualityAccuracyMetrics"] = {k: None for k in ("groundErrorM", "calibrationErrorPx", "idSwitchesAgainstGt", "cutF1", "relockSec", "shuttlePrecision", "shuttleRecall", "shuttleReacquisitionSec")}
        item["qualityStatus"] = "NOT VALIDATED: no qualified GT or approved thresholds"
        item["sampledBufferGate"] = "PASS" if all(item["bufferMaxima"][key] <= limit for key, limit in
            {"resultWindow": 128, "pending": 64, "semanticOwners": 4096, "transitionHistory": 128}.items()) else "FAIL"
        item["bufferScope"] = "5-second controller samples of 2-second worker snapshots; not every append or internal vendor buffer"
        startups = [read(path) for path in (root / mode).glob("startup-*.json")]
        item["durableReconstruction"] = [{"pid": x["pid"], "restoredFromDurableJob": x["restoredFromDurableJob"],
            "startResult": x["startResult"], "recoveryReport": x["recoveryReport"]} for x in startups]
        item["recoveryGate"] = ("PASS" if item["completionGate"] == "PASS" and item["prefixChunksRetained"] is True
            and len(item["processes"]) == 2 and any(x["restoredFromDurableJob"] and x["startResult"]["status"] == "resumed" for x in startups)
            and (mode != "process_kill" or item["processes"][0].get("killedWorkerPid") == item["processes"][0].get("workerPid"))
            else "FAIL") if mode != "baseline" else "NOT APPLICABLE"
        samples = [json.loads(line) for line in (root / mode / "readings.jsonl").read_text().splitlines()]
        # Diagnostic RSS change, not an approved leak/stability threshold.
        import statistics
        width = max(1, len(samples) // 5)
        item["rssDiagnostics"] = {"sampleCount": len(samples),
            "first20PercentMedianBytes": statistics.median(x["rssBytes"] for x in samples[:width]),
            "last20PercentMedianBytes": statistics.median(x["rssBytes"] for x in samples[-width:]),
            "stabilityAcceptance": "NOT VALIDATED: no frozen RAM growth threshold"}
    report["comparisons"] = []
    if any(x["id"] == "baseline" for x in report["runs"]):
        for item in report["runs"]:
            if item["id"] == "baseline":
                continue
            mismatches = Counter()
            numeric = {}
            identity = Counter()
            examples = []
            for left, right in itertools.zip_longest(rows(store, "baseline"), rows(store, item["id"])):
                if left is None or right is None:
                    mismatches["unpairedRows"] += 1
                    continue
                for key in ("frameIndex", "timestampSec", "sceneState", "cameraSegmentId", "players", "rawPlayerDetections", "shuttle", "isMetricValid", "canUseCourtMetric", "rawTrackerIdSwitches", "semanticPlayerIdSwitches"):
                    if left.get(key) != right.get(key):
                        mismatches[key] += 1
                a = {p["playerId"]: p for p in left.get("players", [])}
                b = {p["playerId"]: p for p in right.get("players", [])}
                for pid in a.keys() | b.keys():
                    pa, pb = a.get(pid, {}), b.get(pid, {})
                    for key in ("trackId", "state", "eligibilityStatus"):
                        identity[key] += int(pa.get(key) != pb.get(key))
                    for key in ("bboxPct", "groundPointPct", "leftFootPx", "rightFootPx", "courtPositionM", "speedMps", "totalDistanceM"):
                        delta = numeric_difference(pa.get(key), pb.get(key), protocol["diagnosticTolerances"]["coordinates"])
                        total = numeric.setdefault(key, {"pairedFiniteValues": 0, "availabilityOrShapeDifferences": 0, "valuesOutsideTolerance": 0, "maxAbsoluteDifference": None})
                        for count in ("pairedFiniteValues", "availabilityOrShapeDifferences", "valuesOutsideTolerance"):
                            total[count] += delta[count]
                        if delta["maxAbsoluteDifference"] is not None:
                            total["maxAbsoluteDifference"] = max(total["maxAbsoluteDifference"] or 0, delta["maxAbsoluteDifference"])
                if len(examples) < 10 and any(left.get(k) != right.get(k) for k in ("sceneState", "cameraSegmentId", "rawTrackerIdSwitches", "semanticPlayerIdSwitches")):
                    examples.append({"frameIndex": left["frameIndex"], "timestampSec": left["timestampSec"],
                                     "baselineScene": left.get("sceneState"), "resumedScene": right.get("sceneState"),
                                     "baselineSegment": left.get("cameraSegmentId"), "resumedSegment": right.get("cameraSegmentId")})
            report["comparisons"].append({"recoveredRun": item["id"], "exactFieldDifferenceRowCounts": dict(mismatches),
                "playerIdentityDifferenceCounts": dict(identity), "numericDiagnostics": numeric, "differenceExamples": examples,
                "numericalQualityAcceptance": "NOT VALIDATED: diagnostic differences are not approved GT accuracy tolerances",
                "temporalStateRestoredExactly": False})
    write(root / "report.json", report)
    print(json.dumps({"report": str(root / "report.json"), "completion": [(x["id"], x["completionGate"]) for x in report["runs"]]}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--output")
    parser.add_argument("--media")
    parser.add_argument("--models")
    parser.add_argument("--seconds", type=int, default=600)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--git", default="git")
    parser.add_argument("--mode", choices=["all", "baseline", "cancel_restart", "process_kill"], default="all")
    args = parser.parse_args()
    if args.prepare:
        prepare(args)
        return
    protocol = read(args.protocol)
    if code_hashes() != protocol["codeFileHashes"]:
        raise RuntimeError("Code changed since protocol freeze; prepare a new protocol")
    for artifact in protocol["artifacts"]:
        if sha(artifact["path"]) != artifact["sha256"]:
            raise RuntimeError("Artifact changed since protocol freeze")
    if sha(protocol["media"]["path"]) != protocol["media"]["sha256"]:
        raise RuntimeError("Media changed since protocol freeze")
    if args.worker:
        worker(args, protocol)
    else:
        run(args, protocol)


if __name__ == "__main__":
    main()
