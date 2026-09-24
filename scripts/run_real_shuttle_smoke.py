#!/usr/bin/env python3
"""run_real_shuttle_smoke.py — Real badminton video shuttle tracking smoke test.

Executes the production shuttle tracking pipeline against a decoded segment of real video,
using the local RallyLens TrackNet model checkpoint, and records measured runtime metrics
without claiming ground-truth accuracy.
"""

import argparse
import json
import logging
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

# Add repo root and ai_service to Python path
REPO_ROOT = Path(__file__).resolve().parent.parent
AI_SERVICE_DIR = REPO_ROOT / "ai_service"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from shuttle_pipeline import (
    ShuttleObservation,
    ShuttlePipelineConfig,
    create_shuttle_pipeline,
)

logger = logging.getLogger("run_real_shuttle_smoke")


def compute_observed_confidence_stats(
    observations: List[ShuttleObservation],
) -> Dict[str, Any]:
    """Compute min, median, max confidence for observed detections only.

    Returns nulls (None) rather than 0.0 when no observed detections are present.
    """
    confidences = [
        float(obs.confidence)
        for obs in observations
        if obs.state == "observed" and obs.confidence is not None
    ]
    if not confidences:
        return {
            "count": 0,
            "min": None,
            "median": None,
            "max": None,
        }
    return {
        "count": len(confidences),
        "min": round(float(np.min(confidences)), 4),
        "median": round(float(np.median(confidences)), 4),
        "max": round(float(np.max(confidences)), 4),
    }


def summarize_smoke_report(
    video_path: str,
    width: int,
    height: int,
    fps: float,
    start_frame: int,
    analyzed_frames: int,
    pipeline_provenance: Dict[str, Any],
    observations: List[ShuttleObservation],
) -> Dict[str, Any]:
    """Generate structured JSON smoke report."""
    return {
        "video": {
            "filename": Path(video_path).name,
            "width": int(width),
            "height": int(height),
            "fps": round(float(fps), 2),
        },
        "segment": {
            "start_frame": int(start_frame),
            "analyzed_frames": int(analyzed_frames),
        },
        "runtime": {
            "frames_received": pipeline_provenance.get("framesReceived"),
            "valid_frames": pipeline_provenance.get("validFrames"),
            "inference_calls": pipeline_provenance.get("inferenceCalls"),
            "mean_inference_ms": pipeline_provenance.get("meanInferenceMs"),
        },
        "observations": {
            "observed_count": pipeline_provenance.get("observedCount"),
            "predicted_count": pipeline_provenance.get("predictedCount"),
            "lost_count": pipeline_provenance.get("lostCount"),
            "unknown_count": pipeline_provenance.get("unknownCount"),
        },
        "observed_confidence": compute_observed_confidence_stats(observations),
        "metadata": {
            "provider": pipeline_provenance.get("provider"),
            "model": pipeline_provenance.get("model"),
            "runtime": pipeline_provenance.get("runtime"),
            "precision": pipeline_provenance.get("precision"),
            "device": pipeline_provenance.get("device"),
            "window_size": pipeline_provenance.get("windowSize"),
            "last_failure": pipeline_provenance.get("lastFailure"),
        },
        "disclaimer": (
            "Monocular 2D pixel estimates from runtime smoke execution without ground truth. "
            "Not a claim of detection accuracy, recall, or 3D trajectory."
        ),
    }


def run_real_shuttle_smoke(
    video_path: str,
    model_path: str,
    start_frame: int = 100,
    frame_count: int = 60,
    output_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Run real video frames through production shuttle pipeline and produce smoke report."""
    v_path = Path(video_path)
    if not v_path.is_file():
        raise FileNotFoundError(f"Video file not found at: {video_path}")

    m_path = Path(model_path)
    if not m_path.is_file():
        raise FileNotFoundError(f"Model checkpoint not found at: {model_path}")

    cap = cv2.VideoCapture(str(v_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video file: {video_path}")

    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        print(f"=== SportsScout Real Shuttle Smoke Test ===")
        print(f"Video: {v_path.name} ({width}x{height} @ {fps:.1f} FPS, {total_frames} total frames)")
        print(f"Model: {m_path.name} ({m_path.stat().st_size:,} bytes)")
        print(f"Segment: frames {start_frame}..{start_frame + frame_count - 1} ({frame_count} frames)")

        config = ShuttlePipelineConfig(
            enabled=True,
            provider="rallylens_tracknet",
            model_path=str(m_path),
            runtime="pytorch",
            device="cpu",
            window_size=9,
            confidence_threshold=0.5,
            recovery_enabled=False,
        )

        pipeline = create_shuttle_pipeline(config)

        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        observations: List[ShuttleObservation] = []
        frames_processed = 0

        t0 = time.perf_counter()
        for i in range(frame_count):
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            current_frame_idx = start_frame + i
            timestamp_sec = current_frame_idx / fps
            obs = pipeline.process_frame(frame, timestamp_sec=timestamp_sec, frame_index=current_frame_idx)
            if obs is not None:
                observations.append(obs)
            frames_processed += 1

        elapsed_sec = time.perf_counter() - t0
        pipeline.end_stream()
        prov = pipeline.get_provenance()

        report = summarize_smoke_report(
            video_path=str(v_path),
            width=width,
            height=height,
            fps=fps,
            start_frame=start_frame,
            analyzed_frames=frames_processed,
            pipeline_provenance=prov,
            observations=observations,
        )
        report["elapsed_wall_sec"] = round(elapsed_sec, 3)

        if output_path:
            out_file = Path(output_path)
            out_file.parent.mkdir(parents=True, exist_ok=True)
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)
            print(f"Report saved to: {out_file}")

        print("\n--- Smoke Results ---")
        print(f"Frames Analyzed: {report['segment']['analyzed_frames']}")
        print(f"Inference Calls: {report['runtime']['inference_calls']}")
        print(f"Mean Inference:  {report['runtime']['mean_inference_ms']} ms")
        print(f"Observed Count:  {report['observations']['observed_count']}")
        print(f"Predicted Count: {report['observations']['predicted_count']}")
        print(f"Lost Count:      {report['observations']['lost_count']}")
        print(f"Unknown Count:   {report['observations']['unknown_count']}")
        print(f"Confidence:      {report['observed_confidence']}")
        print(f"Wall Time:       {report['elapsed_wall_sec']:.2f} s")
        print("---------------------")

        return report
    finally:
        cap.release()


def main():
    parser = argparse.ArgumentParser(description="Real Video Shuttle Smoke Test")
    parser.add_argument(
        "--video",
        type=str,
        default=r"C:\Users\Sport-Science-R3909\Desktop\AI\Vedio Bad\Badminton test.mp4",
        help="Path to real video",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=str(REPO_ROOT / ".local-models" / "rallylens-shuttle-tracknet.pth"),
        help="Path to RallyLens TrackNet model checkpoint",
    )
    parser.add_argument("--start-frame", type=int, default=100, help="Start frame index")
    parser.add_argument("--frame-count", type=int, default=60, help="Number of frames to analyze")
    parser.add_argument(
        "--output",
        type=str,
        default=str(REPO_ROOT / "test-results" / "phase29c" / "real_shuttle_smoke_report.json"),
        help="Output report JSON path",
    )
    args = parser.parse_args()

    run_real_shuttle_smoke(
        video_path=args.video,
        model_path=args.model,
        start_frame=args.start_frame,
        frame_count=args.frame_count,
        output_path=args.output,
    )


if __name__ == "__main__":
    main()
