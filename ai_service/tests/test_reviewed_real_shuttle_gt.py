"""Reviewed source-frame GT and opt-in RallyLens quality gate (no video in Git)."""

import dataclasses
import hashlib
import json
import os
from pathlib import Path
import time
import unittest

import cv2

from ai_service.shuttle_benchmark import run_benchmark_on_manifest
from ai_service.shuttle_benchmark_schema import ShuttleBenchmarkManifest
from ai_service.shuttle_pipeline import ShuttlePipelineConfig, create_shuttle_pipeline


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "src" / "benchmarks" / "reviewedRealShuttleGt.json"
VIDEO_SHA256 = "84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817"
SOURCE_START = 180
SOURCE_END = 209
WARMUP_START = SOURCE_START - 8


class ReviewedManifestTests(unittest.TestCase):
    def test_reviewed_clip_is_complete_only_for_its_thirty_source_frames(self):
        manifest = ShuttleBenchmarkManifest.load_json(MANIFEST)
        self.assertEqual(manifest.validate(), [])
        self.assertEqual(len(manifest.clips), 1)
        clip = manifest.clips[0]
        self.assertEqual(len(clip.ground_truth_frames), 30)
        self.assertEqual([f.frame_index for f in clip.ground_truth_frames], list(range(30)))
        self.assertTrue(all(f.reviewed is True and f.annotation_source == "manual" for f in clip.ground_truth_frames))
        self.assertEqual(sum(f.visibility == "visible" for f in clip.ground_truth_frames), 20)
        self.assertEqual(sum(f.visibility == "unknown" for f in clip.ground_truth_frames), 10)
        self.assertEqual(run_benchmark_on_manifest(manifest)[clip.id]["status"], "COMPLETE")


@unittest.skipUnless(
    os.getenv("SPORTSCOUT_TEST_SHUTTLE_MODEL") and os.getenv("SPORTSCOUT_TEST_REAL_VIDEO"),
    "Explicit local RallyLens model and reviewed video paths required",
)
class RealReviewedQualityTests(unittest.TestCase):
    def test_real_model_against_reviewed_frames(self):
        import torch

        video_path = Path(os.environ["SPORTSCOUT_TEST_REAL_VIDEO"])
        model_path = Path(os.environ["SPORTSCOUT_TEST_SHUTTLE_MODEL"])
        with video_path.open("rb") as stream:
            self.assertEqual(hashlib.file_digest(stream, "sha256").hexdigest(), VIDEO_SHA256)
        manifest = ShuttleBenchmarkManifest.load_json(MANIFEST)
        clip = manifest.clips[0]

        previous_threads = torch.get_num_threads()
        torch.set_num_threads(4)
        self.addCleanup(torch.set_num_threads, previous_threads)
        pipeline = create_shuttle_pipeline(ShuttlePipelineConfig(
            enabled=True,
            provider="rallylens_tracknet",
            model_path=str(model_path),
            runtime="pytorch",
            device="cpu",
            window_size=9,
            confidence_threshold=0.5,
            recovery_enabled=False,
        ))
        self.assertEqual(pipeline.status, "AVAILABLE", pipeline.failure_reason)
        capture = cv2.VideoCapture(str(video_path))
        self.addCleanup(capture.release)
        self.assertTrue(capture.isOpened())
        self.assertEqual(int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), clip.source_width)
        self.assertEqual(int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)), clip.source_height)
        fps = capture.get(cv2.CAP_PROP_FPS)
        self.assertAlmostEqual(fps, clip.source_fps)
        self.assertTrue(capture.set(cv2.CAP_PROP_POS_FRAMES, WARMUP_START))

        predictions = []
        observed_locations = []
        started_at = time.perf_counter()
        for source_index in range(WARMUP_START, SOURCE_END + 1):
            self.assertEqual(int(capture.get(cv2.CAP_PROP_POS_FRAMES)), source_index)
            ok, frame = capture.read()
            self.assertTrue(ok, f"Could not decode source frame {source_index}")
            observation = pipeline.process_frame(frame, source_index / fps, source_index)
            if source_index >= SOURCE_START and observation is not None:
                predictions.append(dataclasses.replace(
                    observation,
                    frame_index=source_index - SOURCE_START,
                    timestamp_sec=(source_index - SOURCE_START) / fps,
                ))
                if observation.state == "observed" and observation.position_px is not None:
                    observed_locations.append({
                        "sourceFrame": source_index,
                        "x": round(observation.position_px.x, 1),
                        "y": round(observation.position_px.y, 1),
                        "confidence": round(observation.confidence or 0, 3),
                    })

        elapsed_sec = time.perf_counter() - started_at
        pipeline.end_stream()
        provenance = pipeline.get_provenance()
        self.assertTrue(provenance["modelLoaded"])
        self.assertGreater(provenance["inferenceCalls"], 0)
        self.assertEqual(provenance["lastOutputShape"], [1, 8, 288, 512])
        self.assertEqual(provenance["provider"], "rallylens_tracknet")
        self.assertEqual(len(predictions), 30)

        result = run_benchmark_on_manifest(manifest, {clip.id: predictions})[clip.id]
        self.assertEqual(result["status"], "COMPLETE")
        metrics = result["metrics"]
        self.assertEqual(metrics["gtVisibleCount"], 20)
        self.assertIsNotNone(metrics["truePositivesCount"])
        print("REVIEWED_REAL_SHUTTLE_RESULT=" + json.dumps({
            "sourceFrameRange": [SOURCE_START, SOURCE_END],
            "inferenceCalls": provenance["inferenceCalls"],
            "meanInferenceMs": provenance["meanInferenceMs"],
            "analysisElapsedSec": round(elapsed_sec, 3),
            "inferenceFpsIncludingWarmup": round(provenance["inferenceCalls"] / elapsed_sec, 4),
            "realtimeRatioIncludingWarmup": round(provenance["inferenceCalls"] / (fps * elapsed_sec), 4),
            "runtime": provenance["runtime"],
            "device": provenance["device"],
            "metrics": metrics,
            "observedLocations": observed_locations,
        }, sort_keys=True))


if __name__ == "__main__":
    unittest.main()
