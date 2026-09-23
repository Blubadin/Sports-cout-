"""
ai_service/tests/test_vision_benchmark_protocol.py

Unit tests for Phase 1.0 Vision Benchmark Protocol in Python:
1. Manifest with complete metadata
2. Manifest with partial metadata
3. groundTruthAvailable=false
4. Known difficult segments
5. Experiment configurations remain model-neutral
6. Missing values remain unavailable (None)
7. Measured zero remains different from unavailable (None)
8. Structured run ID generation and traceability
"""

import json
from pathlib import Path
import unittest

from ai_service.benchmark_schema import (
    BenchmarkClipEntry,
    BenchmarkDifficultSegment,
    BenchmarkManifest,
    BenchmarkModelConfig,
    BenchmarkQuality,
    BenchmarkRunIdentity,
    BenchmarkVideoMetadata,
    TrackingBenchmarkRun,
    VisionBenchmarkExperimentConfig,
    generate_benchmark_run_id,
)


class TestVisionBenchmarkProtocol(unittest.TestCase):
    def test_complete_clip_metadata(self):
        """1. Manifest with complete metadata."""
        segment = BenchmarkDifficultSegment(
            start_sec=12.0,
            end_sec=18.5,
            tags=["fast_rally", "motion_blur"],
            description="High speed exchange",
        )
        clip = BenchmarkClipEntry(
            id="B01_singles_easy",
            name="Singles / Easy (Static Rear)",
            sport="badminton",
            game_type="singles",
            player_count=2,
            video_reference="benchmarks/videos/B01_singles_easy.mp4",
            duration_sec=45.0,
            source_width=1920,
            source_height=1080,
            source_fps=30.0,
            camera_type="static_rear",
            camera_motion="static",
            difficulty_tags=["singles", "clear_lighting", "static_camera"],
            court_calibration_reference="calib_01",
            ground_truth_available=True,
            notes="Full metadata clip",
            known_difficult_segments=[segment],
        )

        clip_dict = clip.to_dict()
        self.assertEqual(clip_dict["id"], "B01_singles_easy")
        self.assertEqual(clip_dict["playerCount"], 2)
        self.assertEqual(clip_dict["durationSec"], 45.0)
        self.assertTrue(clip_dict["groundTruthAvailable"])
        self.assertEqual(len(clip_dict["knownDifficultSegments"]), 1)

        # Roundtrip via from_dict
        restored = BenchmarkClipEntry.from_dict(clip_dict)
        self.assertEqual(restored.id, clip.id)
        self.assertEqual(restored.duration_sec, 45.0)
        self.assertEqual(len(restored.known_difficult_segments), 1)
        self.assertEqual(restored.known_difficult_segments[0].start_sec, 12.0)

    def test_partial_clip_metadata(self):
        """2. Manifest with partial metadata."""
        partial_data = {
            "id": "B99_partial",
            "name": "Partial Metadata Clip",
            "sport": "badminton",
            "gameType": "singles",
            "playerCount": 2,
            "cameraType": "static_rear",
            "cameraMotion": "static",
            "difficultyTags": ["uncalibrated"],
            "groundTruthAvailable": False,
        }
        clip = BenchmarkClipEntry.from_dict(partial_data)
        self.assertEqual(clip.id, "B99_partial")
        self.assertIsNone(clip.video_reference)
        self.assertIsNone(clip.duration_sec)
        self.assertIsNone(clip.source_width)
        self.assertIsNone(clip.source_height)
        self.assertIsNone(clip.source_fps)
        self.assertIsNone(clip.court_calibration_reference)
        self.assertIsNone(clip.notes)
        self.assertEqual(clip.known_difficult_segments, [])

    def test_ground_truth_available_false(self):
        """3. groundTruthAvailable=false."""
        clip = BenchmarkClipEntry(
            id="B01_no_gt",
            name="No GT",
            sport="badminton",
            game_type="singles",
            player_count=2,
            camera_type="static_rear",
            camera_motion="static",
            ground_truth_available=False,
        )
        self.assertFalse(clip.ground_truth_available)
        d = clip.to_dict()
        self.assertFalse(d["groundTruthAvailable"])

    def test_known_difficult_segments(self):
        """4. Known difficult segments."""
        seg = BenchmarkDifficultSegment.from_dict({
            "startSec": 15.0,
            "endSec": 22.0,
            "tags": ["player-crossing", "occlusion"],
            "description": "Crossing at mid-court",
        })
        self.assertEqual(seg.start_sec, 15.0)
        self.assertEqual(seg.end_sec, 22.0)
        self.assertEqual(seg.tags, ["player-crossing", "occlusion"])

        d = seg.to_dict()
        self.assertEqual(d["startSec"], 15.0)
        self.assertEqual(d["endSec"], 22.0)

    def test_model_neutral_experiment_configurations(self):
        """5. Experiment configurations remain model-neutral."""
        # YOLOv8 baseline
        exp_v8 = VisionBenchmarkExperimentConfig(
            experiment_id="EXP_YOLOV8N_CPU",
            name="YOLOv8n Baseline",
            detector="yolov8n",
            tracker="bytetrack",
            runtime="pytorch",
            input_size=640,
            confidence_threshold=0.25,
            frame_stride=2,
            pose_stride=1,
            court_roi_enabled=False,
            device="cpu",
            precision="fp32",
        )
        # YOLO11 candidate
        exp_11 = VisionBenchmarkExperimentConfig(
            experiment_id="EXP_YOLO11N_ONNX",
            name="YOLO11n ONNX",
            detector="yolo11n",
            detector_version="11.0.0",
            tracker="bytetrack",
            runtime="onnxruntime",
            input_size=512,
            confidence_threshold=0.3,
            frame_stride=1,
            pose_stride=1,
            court_roi_enabled=True,
            device="cuda",
            precision="fp16",
        )
        # YOLO26 candidate with TensorRT
        exp_26 = VisionBenchmarkExperimentConfig(
            experiment_id="EXP_YOLO26_TENSORRT",
            name="YOLO26 TensorRT",
            detector="yolo26",
            tracker="norfair",
            runtime="tensorrt",
            input_size=640,
            confidence_threshold=0.25,
            frame_stride=2,
            pose_stride=1,
            court_roi_enabled=False,
            device="cuda",
            precision="fp16",
        )

        for exp in [exp_v8, exp_11, exp_26]:
            d = exp.to_dict()
            restored = VisionBenchmarkExperimentConfig.from_dict(d)
            self.assertEqual(restored.detector, exp.detector)
            self.assertEqual(restored.tracker, exp.tracker)
            self.assertEqual(restored.runtime, exp.runtime)
            self.assertEqual(restored.precision, exp.precision)

            model_cfg = exp.to_model_config()
            self.assertEqual(model_cfg.detector_name, exp.detector)
            self.assertEqual(model_cfg.tracker_name, exp.tracker)
            self.assertEqual(model_cfg.runtime, exp.runtime)
            self.assertEqual(model_cfg.precision, exp.precision)
            self.assertEqual(model_cfg.court_roi_enabled, exp.court_roi_enabled)

    def test_missing_values_remain_unavailable(self):
        """6. Missing values remain unavailable (None)."""
        model_cfg = BenchmarkModelConfig(
            detector_name=None,
            pose_model=None,
            tracker_name=None,
            detector_input_size=None,
            confidence_threshold=None,
            frame_stride=None,
            pose_stride=None,
            max_players=None,
            device=None,
            runtime=None,
            precision=None,
            court_roi_enabled=None,
        )
        d = model_cfg.to_dict()
        self.assertIsNone(d["detectorName"])
        self.assertIsNone(d["detectorInputSize"])
        self.assertIsNone(d["runtime"])
        self.assertIsNone(d["precision"])
        self.assertIsNone(d["courtRoiEnabled"])

    def test_measured_zero_distinct_from_unavailable(self):
        """7. Measured zero remains different from unavailable."""
        model_cfg = BenchmarkModelConfig.from_dict({
            "detectorName": "yolov8n",
            "poseModel": "yolov8n-pose",
            "trackerName": "bytetrack",
            "detectorInputSize": 640,
            "confidenceThreshold": 0.0,  # Measured 0.0
            "frameStride": 1,
            "poseStride": 1,
            "maxPlayers": 2,
            "device": "cpu",
            "courtRoiEnabled": False,  # Measured False
        })
        self.assertEqual(model_cfg.confidence_threshold, 0.0)
        self.assertIsNotNone(model_cfg.confidence_threshold)
        self.assertFalse(model_cfg.court_roi_enabled)
        self.assertIsNotNone(model_cfg.court_roi_enabled)

    def test_structured_run_id_generation(self):
        """8. Structured Run ID Generation & Traceability."""
        run_id = generate_benchmark_run_id(
            clip_id="B01_singles_easy",
            detector="yolov8n",
            tracker="bytetrack",
            input_size=640,
            device="cpu",
            runtime="pytorch",
            precision="fp32",
            timestamp="2026-09-21T14:00:00Z",
        )
        self.assertEqual(
            run_id,
            "RUN__b01_singles_easy__yolov8n_bytetrack_640px_cpu_pytorch_fp32__20260921T140000Z",
        )
        self.assertNotIn("test1", run_id)
        self.assertNotIn("best", run_id)

    def test_bundled_manifest_json_loads(self):
        """Loads and validates the bundled visionBenchmarkManifest.json."""
        manifest_path = (
            Path(__file__).resolve().parent.parent.parent
            / "src"
            / "benchmarks"
            / "visionBenchmarkManifest.json"
        )
        if manifest_path.exists():
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            manifest = BenchmarkManifest.from_dict(data)
            self.assertEqual(manifest.schema_version, 1)
            self.assertGreaterEqual(len(manifest.clips), 5)

            clip_ids = [c.id for c in manifest.clips]
            self.assertIn("B01_singles_easy", clip_ids)
            self.assertIn("B02_singles_fast_rally", clip_ids)
            self.assertIn("B03_doubles_standard", clip_ids)
            self.assertIn("B04_doubles_occlusion", clip_ids)
            self.assertIn("B05_difficult_broadcast", clip_ids)

            # Test manifest filter helpers
            singles = manifest.filter_by_game_type("singles")
            doubles = manifest.filter_by_game_type("doubles")
            self.assertGreaterEqual(len(singles), 3)
            self.assertGreaterEqual(len(doubles), 2)


if __name__ == "__main__":
    unittest.main()
