"""Opt-in real-artifact ONNX spike; never a production runtime or dependency installer.

Run with an isolated evaluation Python containing onnx/onnxruntime and the same
PyTorch/Ultralytics packages as the CPU baseline. Artifacts are written only to
the explicitly supplied evaluation directory. Results are scoped feasibility
evidence, not accuracy or GPU validation.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import sys
import traceback

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "ai_service")]
os.environ["YOLO_AUTOINSTALL"] = "false"
TOLERANCES = {"tensorAtol": 1e-4, "tensorRtol": 1e-3, "sourcePositionPx": 1.0,
              "confidenceAtol": 1e-4, "angleDegrees": 0.1, "stanceWidthPx": 1.0,
              "countClassIdentityState": "exact"}
SOURCE_START = 100


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def compare_array(left, right, atol, rtol=0.0):
    import numpy as np
    a, b = np.asarray(left), np.asarray(right)
    valid = a.shape == b.shape and np.isfinite(a).all() and np.isfinite(b).all()
    return {"passed": bool(valid and np.allclose(a, b, atol=atol, rtol=rtol)),
            "shapeBaseline": list(a.shape), "shapeCandidate": list(b.shape),
            "maxAbsoluteError": float(np.max(np.abs(a-b))) if valid and a.size else (0.0 if valid else None)}


def tensor_value(output):
    import torch
    while isinstance(output, (tuple, list)):
        output = output[0]
    return output.detach().cpu().numpy() if isinstance(output, torch.Tensor) else output


def io_metadata(session):
    return {"inputs": [{"name": v.name, "dtype": v.type, "shape": v.shape} for v in session.get_inputs()],
            "outputs": [{"name": v.name, "dtype": v.type, "shape": v.shape} for v in session.get_outputs()]}


def downstream_detector(frames, native_results, candidate_results, fps):
    """Replay real model outputs through actual ByteTrack and semantic analytics."""
    import numpy as np
    from ultralytics.trackers.byte_tracker import BYTETracker
    from ultralytics.trackers.basetrack import BaseTrack
    from ultralytics.utils import YAML, IterableSimpleNamespace
    from ultralytics.utils.checks import check_yaml
    from analyzer_v2 import BadmintonAnalyzerV2
    from detector_adapter import BaseDetectorAdapter
    from pose_adapter import DisabledPoseAdapter
    from tracker_adapter import NormalizedTrackResult, TrackerProvenance

    tracked = []
    streams = []
    for results in (native_results, candidate_results):
        BaseTrack.reset_id()
        tracker = BYTETracker(IterableSimpleNamespace(**YAML.load(check_yaml("bytetrack.yaml"))))
        stream = [tracker.update(result.boxes.cpu().numpy(), image).copy() for image, result in zip(frames, results)]
        tracked.append(stream)

        class ReplayAdapter(BaseDetectorAdapter):
            model_name = "yolov8n.pt"
            index = 0
            def detect_and_track(self, frame, **kwargs):
                rows = stream[self.index]
                self.index += 1
                return [NormalizedTrackResult(bbox=tuple(row[:4]), confidence=float(row[5]),
                            raw_track_id=int(row[4]), provenance=TrackerProvenance("bytetrack", None, False, None))
                        .to_detection() for row in rows]

        analyzer = BadmintonAnalyzerV2(device="cpu", fps=fps, detector_adapter=ReplayAdapter(),
                                      pose_adapter=DisabledPoseAdapter())
        telemetry = [analyzer.process_frame(image.copy(), (SOURCE_START+i)/fps) for i, image in enumerate(frames)]
        streams.append([{ "frameIndex": f["frameIndex"],
                          "players": [{k: p.get(k) for k in ("playerId", "trackId", "state", "identityStatus",
                            "eligibilityStatus", "courtPosition", "totalDistanceM", "distancePx")}
                            for p in f["players"]]} for f in telemetry])
    row_checks = []
    for left, right in zip(*tracked):
        row_checks.append({"boxes": compare_array(left[:, :4], right[:, :4], 1.0),
                           "confidence": compare_array(left[:, 5:6], right[:, 5:6], 1e-4),
                           "idsClasses": compare_array(left[:, [4, 6]], right[:, [4, 6]], 0.0)})
    return {"passed": all(c["boxes"]["passed"] and c["confidence"]["passed"] and
                          c["idsClasses"]["passed"] for c in row_checks) and streams[0] == streams[1],
            "byteTrack": row_checks, "semanticIdentityAndMetricsExact": streams[0] == streams[1],
            "trackCounts": [len(rows) for rows in tracked[0]],
            "analyticsScope": "actual semantic pipeline; pose disabled identically, uncalibrated court metrics remain unavailable"}


def evaluate_yolo(name, weights, frames, fps, artifact_dir):
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from ultralytics import YOLO
    from ultralytics_runtime import precision_options
    from pose_detector import YoloPoseDetector

    if not weights.is_file():
        return {"model": name, "status": "NOT ATTEMPTED", "reason": "Local artifact absent"}
    copied = artifact_dir / weights.name
    shutil.copy2(weights, copied)
    report = {"model": name, "modelSha256": sha256(weights), "precision": "fp32",
              "preprocessVersion": "installed-ultralytics-letterbox-bgr-rgb-v1",
              "postprocessVersion": "installed-ultralytics-nms-source-coordinates-v1"}
    try:
        export_path = YOLO(str(copied)).export(format="onnx", imgsz=640, dynamic=True, simplify=False,
                                               opset=17, device="cpu", batch=1, nms=False)
        onnx.checker.check_model(onnx.load(export_path))
        report["onnxSha256"] = sha256(export_path)
        session = ort.InferenceSession(str(export_path), providers=["CPUExecutionProvider"])
        report["graph"] = io_metadata(session)
        native = YOLO(str(weights))
        conf = 0.4 if native.task == "pose" else 0.35
        native.predict(frames[0], imgsz=640, device="cpu", conf=conf, classes=[0], rect=True,
                       verbose=False, **precision_options("fp32"))
        baseline_results, candidate_results, checks = [], [], []
        metric_engine = YoloPoseDetector.__new__(YoloPoseDetector)
        for frame in frames:
            tensor = native.predictor.preprocess([frame.copy()])
            with torch.inference_mode():
                baseline = native.predictor.inference(tensor)
            candidate = session.run(None, {session.get_inputs()[0].name: tensor.cpu().numpy()})[0]
            raw = compare_array(tensor_value(baseline), candidate, 1e-4, 1e-3)
            # Same actual installed CPU postprocessor for both tensors.
            with torch.inference_mode():
                left = native.predictor.postprocess(baseline, tensor, [frame.copy()])[0]
                right = native.predictor.postprocess(torch.from_numpy(candidate.copy()), tensor, [frame.copy()])[0]
            check = {"tensor": raw,
                     "boxes": compare_array(left.boxes.xyxy.cpu(), right.boxes.xyxy.cpu(), 1.0),
                     "confidence": compare_array(left.boxes.conf.cpu(), right.boxes.conf.cpu(), 1e-4),
                     "classes": compare_array(left.boxes.cls.cpu(), right.boxes.cls.cpu(), 0.0)}
            if native.task == "pose":
                la, ra = left.keypoints.data.cpu().numpy(), right.keypoints.data.cpu().numpy()
                check["keypoints"] = compare_array(la[..., :2], ra[..., :2], 1.0)
                check["keypointConfidence"] = compare_array(la[..., 2], ra[..., 2], 1e-4)
                lm = [metric_engine.compute_2d_body_metrics(k.tolist()) for k in la]
                rm = [metric_engine.compute_2d_body_metrics(k.tolist()) for k in ra]
                metric_ok = len(lm) == len(rm)
                for a, b in zip(lm, rm):
                    metric_ok &= a.keys() == b.keys()
                    for key in a.keys() & b.keys():
                        if isinstance(a[key], bool): metric_ok &= a[key] == b[key]
                        else: metric_ok &= abs(a[key]-b[key]) <= (1.0 if key.endswith("_px") else 0.1)
                check["body2dMetrics"] = {"passed": bool(metric_ok), "baseline": lm, "candidate": rm}
            checks.append(check)
            baseline_results.append(left)
            candidate_results.append(right)
        report["frames"] = checks
        # Extra dynamic batch/spatial execution, never substituted for the real-frame workload.
        probe = np.repeat(tensor.cpu().numpy(), 2, axis=0)
        probe_output = session.run(None, {session.get_inputs()[0].name: probe})[0]
        report["dynamicBatchProbe"] = {"inputShape": list(probe.shape), "outputShape": list(probe_output.shape),
                                       "passed": probe_output.shape[0] == 2 and bool(np.isfinite(probe_output).all())}
        report["realInputShapes"] = [list(native.predictor.preprocess([f]).shape) for f in frames]
        if native.task == "detect":
            report["downstream"] = downstream_detector(frames, baseline_results, candidate_results, fps)
        passed = all(v["passed"] for c in checks for v in c.values())
        passed &= report["dynamicBatchProbe"]["passed"] and report.get("downstream", {"passed": True})["passed"]
        report["status"] = "VALIDATED" if passed else "FAILED"
        report["reason"] = "Bounded real-frame CPU feasibility checks passed" if passed else "At least one preregistered parity/contract check failed"
        report["scope"] = "12 consecutive frames; not production adoption or GT quality validation"
    except Exception as error:
        report.update(status="FAILED", reason=f"{type(error).__name__}: {error}", traceback=traceback.format_exc())
    return report


def evaluate_shuttle(weights, frames, artifact_dir):
    if weights is None or not weights.is_file():
        return {"model": "RallyLens TrackNet", "status": "NOT ATTEMPTED", "reason": "Audited local checkpoint absent"}
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from ai_service.rallylens_adapter import RallyLensTemporalModelAdapter, prepare_rallylens_input, INPUT_SHAPE, OUTPUT_SHAPE
    from ai_service.shuttle_tracker import TemporalFrame, extract_shuttle_candidate
    report = {"model": "RallyLens TrackNet", "modelSha256": sha256(weights), "precision": "fp32",
              "preprocessVersion": "rallylens-nine-rgb-frames-linear-resize-div255-v1",
              "postprocessVersion": "rallylens-latest-heatmap7-centroid-source-scaling-v1"}
    try:
        adapter = RallyLensTemporalModelAdapter(weights)
        model = adapter.load()
        windows = [[TemporalFrame(image=f, frame_index=SOURCE_START+i+j, timestamp_sec=(SOURCE_START+i+j)/30)
                    for j, f in enumerate(frames[i:i+9])] for i in range(len(frames)-8)]
        inputs = [prepare_rallylens_input(w) for w in windows]
        outpath = artifact_dir / "rallylens-fixed-nine-frame.onnx"
        torch.onnx.export(model, torch.from_numpy(inputs[0]), str(outpath), dynamo=False, opset_version=17,
                          input_names=["nine_frames"], output_names=["eight_heatmaps"], dynamic_axes=None)
        onnx.checker.check_model(onnx.load(outpath))
        session = ort.InferenceSession(str(outpath), providers=["CPUExecutionProvider"])
        report["onnxSha256"] = sha256(outpath)
        report["graph"] = io_metadata(session)
        checks = []
        maps = [[], []]
        for tensor in inputs:
            with torch.inference_mode(): baseline = model(torch.from_numpy(tensor)).numpy()
            candidate = session.run(None, {"nine_frames": tensor})[0]
            check = {"tensor": compare_array(baseline, candidate, 1e-4, 1e-3),
                     "contract": {"passed": tuple(tensor.shape) == INPUT_SHAPE and tuple(candidate.shape) == OUTPUT_SHAPE}}
            a = extract_shuttle_candidate(baseline[0,7], confidence_threshold=0.5)
            b = extract_shuttle_candidate(candidate[0,7], confidence_threshold=0.5)
            agree = (a is None) == (b is None)
            if a and b:
                agree &= abs(adapter.scale_coordinate(a.x_heatmap,512,1280)-adapter.scale_coordinate(b.x_heatmap,512,1280)) <= 1.0
                agree &= abs(adapter.scale_coordinate(a.y_heatmap,288,720)-adapter.scale_coordinate(b.y_heatmap,288,720)) <= 1.0
                agree &= abs(a.confidence-b.confidence) <= 1e-4
            check["latestFrameCandidate"] = {"passed": bool(agree)}
            checks.append(check)
            maps[0].append(baseline[0,7].copy())
            maps[1].append(candidate[0,7].copy())
        from dataclasses import asdict
        from ai_service.shuttle_pipeline import ProductionShuttlePipeline, ShuttlePipelineConfig
        from ai_service.shuttle_tracker import ShuttleTrackerProvider, TemporalModelOutput
        streams, trajectories = [], []
        for heatmaps in maps:
            class ReplayProvider(ShuttleTrackerProvider):
                def __init__(self): self.index = 0
                def infer(self, window):
                    result = TemporalModelOutput(heatmaps[self.index])
                    self.index += 1
                    return result
                def scale_coordinate(self, value, heatmap_extent, source_extent):
                    return adapter.scale_coordinate(value, heatmap_extent, source_extent)
            pipeline = ProductionShuttlePipeline(ShuttlePipelineConfig(enabled=True, window_size=9,
                       recovery_enabled=True, build_trajectory=True), provider=ReplayProvider())
            stream = [pipeline.process_frame(f.copy(),(SOURCE_START+i)/30,SOURCE_START+i) for i,f in enumerate(frames)]
            pipeline.end_stream()
            streams.append(stream)
            trajectories.append(pipeline.get_derived_trajectory())
        parity = True
        for a,b in zip(*streams):
            parity &= (a.frame_index,a.timestamp_sec,a.state,a.source) == (b.frame_index,b.timestamp_sec,b.state,b.source)
            parity &= (a.position_px is None) == (b.position_px is None)
            parity &= (a.confidence is None) == (b.confidence is None)
            if a.position_px and b.position_px:
                parity &= max(abs(a.position_px.x-b.position_px.x),abs(a.position_px.y-b.position_px.y)) <= 1.0
            if a.confidence is not None and b.confidence is not None:
                parity &= abs(a.confidence-b.confidence) <= 1e-4
        ta,tb = trajectories
        parity &= asdict(ta.analytics) == asdict(tb.analytics) and len(ta.points) == len(tb.points)
        for a,b in zip(ta.points,tb.points):
            parity &= (a.frame_index,a.timestamp_sec,a.state,a.source,a.segment_id) == (b.frame_index,b.timestamp_sec,b.state,b.source,b.segment_id)
            parity &= max(abs(a.position_px.x-b.position_px.x),abs(a.position_px.y-b.position_px.y)) <= 1.0
        report["downstream"] = {"passed":bool(parity), "statesBaseline":[o.state for o in streams[0]],
                 "statesCandidate":[o.state for o in streams[1]], "trajectoryAnalyticsBaseline":asdict(ta.analytics),
                 "trajectoryAnalyticsCandidate":asdict(tb.analytics),
                 "scope":"same real frames/output maps through canonical temporal/recovery/trajectory logic; no GT accuracy claim"}
        report["windows"] = checks
        report["temporalContract"] = "fixed [1,27,288,512] nine frames; [1,8,288,512]; select map 7 for latest frame"
        passed = all(v["passed"] for c in checks for v in c.values()) and report["downstream"]["passed"]
        report.update(status="VALIDATED" if passed else "FAILED",
                      reason="Bounded real-window CPU tensor/candidate checks passed" if passed else "Preregistered tolerance/temporal contract failed",
                      scope="four consecutive temporal windows; production ONNX adoption deferred")
    except Exception as error:
        report.update(status="FAILED", reason=f"{type(error).__name__}: {error}", traceback=traceback.format_exc())
    return report


def cpu_adapter_smoke(frame):
    from detector_adapter import UltralyticsDetectorAdapter
    from pose_detector import YoloPoseDetector
    detector = UltralyticsDetectorAdapter(model_path=str(ROOT/"yolov8n.pt"), device="cpu", precision="fp32")
    detections = detector.detect_and_track(frame.copy(), device="cpu")
    pose = YoloPoseDetector(model_path=str(ROOT/"yolov8n-pose.pt"), device="cpu")
    result = pose.estimate_pose_in_roi(frame.copy(), detections[0]["bbox"]) if detections else {"keypoints": []}
    return {"status": "VALIDATED", "detectedPeople": len(detections), "roiPoseKeypoints": len(result["keypoints"]),
            "detectorProvenance": detector.get_provenance(), "poseProvenance": pose.get_provenance()}


def main():
    import cv2
    import torch
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--artifact-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--shuttle-model", type=Path)
    args = parser.parse_args()
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened(): raise RuntimeError("Real video cannot be decoded")
    fps = capture.get(cv2.CAP_PROP_FPS)
    capture.set(cv2.CAP_PROP_POS_FRAMES, SOURCE_START)
    frames = []
    for _ in range(60):
        ok, frame = capture.read()
        if not ok: raise RuntimeError("Real source frames 100-159 incomplete")
        frames.append(frame)
    capture.release()
    report = {"schemaVersion": 1, "date": "2026-09-30", "tolerancesFixedBeforeRun": TOLERANCES,
              "video": {"filename": args.video.name, "sha256": sha256(args.video), "sourceFrames": [SOURCE_START,SOURCE_START+len(frames)-1], "fps": fps},
              "versions": {n: importlib.metadata.version(n) for n in ("torch","ultralytics","opencv-python","numpy","onnx","onnxruntime")},
              "gpuValidation": "NOT VALIDATED", "cudaAvailable": torch.cuda.is_available(),
              "productionRuntimeAdoption": "Current runtimes retained; isolated spike only"}
    report["models"] = [evaluate_yolo("YOLOv8n detection",ROOT/"yolov8n.pt",frames,fps,args.artifact_dir),
                        evaluate_yolo("YOLOv8n pose",ROOT/"yolov8n-pose.pt",frames,fps,args.artifact_dir),
                        evaluate_shuttle(args.shuttle_model,frames,args.artifact_dir)]
    try: report["cpuProductionAdapterSmoke"] = cpu_adapter_smoke(frames[0])
    except Exception as error: report["cpuProductionAdapterSmoke"] = {"status":"FAILED","reason":f"{type(error).__name__}: {error}","traceback":traceback.format_exc()}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"models":[{"model":m["model"],"status":m["status"],"reason":m["reason"]} for m in report["models"]],
                      "cpuSmoke":report["cpuProductionAdapterSmoke"]["status"]},indent=2))


if __name__ == "__main__": main()
