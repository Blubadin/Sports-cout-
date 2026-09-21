"""
test_detector_candidates.py — Unit tests for Phase 1.2 Benchmark Detector Candidates.

Verifies:
1. All configured candidates (YOLOv8n, YOLO11s, YOLO11m, YOLO26s, YOLO26m) resolve correctly
2. Baseline remains strictly YOLOv8n
3. Model names flow into benchmark provenance without generic labels
4. Unsupported models fail cleanly
5. Selecting a candidate does not mutate global baseline config
6. No model binary is added to tracked repository files
"""

from __future__ import annotations
import subprocess
import unittest
from pathlib import Path
import sys
import numpy as np

# Ensure ai_service is on sys.path
ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from model_registry import (
    PHASE_1_DETECTOR_CANDIDATES,
    get_candidate,
    get_baseline_candidate,
    list_candidates,
    get_candidate_registry_report,
    BENCHMARK_INPUT_SIZES,
)
from engine_config import (
    create_baseline_engine_config,
    InvalidEngineConfigError,
    ModelNotFoundError,
)
from analyzer_v2 import BadmintonAnalyzerV2
from server import TrackingSession, _build_session_metrics
from benchmark_schema import create_benchmark_run_from_session_dict


class TestDetectorCandidates(unittest.TestCase):

    def test_all_configured_candidates_resolve_correctly(self):
        """All 5 Phase-1 detector candidates must resolve and only the initial matrix is supported."""
        expected_ids = ["yolov8n", "yolo11s", "yolo11m", "yolo26s", "yolo26m"]
        registered_ids = list(PHASE_1_DETECTOR_CANDIDATES.keys())
        self.assertEqual(sorted(registered_ids), sorted(expected_ids))

        for cid in expected_ids:
            cand = get_candidate(cid)
            self.assertEqual(cand.id, cid)
            self.assertEqual(cand.supported_input_sizes, [640, 960])
            self.assertEqual(cand.confidence_threshold, 0.35)

        # Verify resolution by various aliases (case-insensitive, .pt extension, hyphens)
        self.assertEqual(get_candidate("YOLO11s").id, "yolo11s")
        self.assertEqual(get_candidate("yolo11s.pt").id, "yolo11s")
        self.assertEqual(get_candidate("yolo-26-m").id, "yolo26m")
        self.assertEqual(get_candidate("YOLO26M.PT").id, "yolo26m")

    def test_baseline_remains_yolov8n(self):
        """Baseline must strictly remain YOLOv8n; all other candidates must have baseline=False."""
        baseline = get_baseline_candidate()
        self.assertEqual(baseline.id, "yolov8n")
        self.assertEqual(baseline.display_name, "YOLOv8n")
        self.assertEqual(baseline.model_file, "yolov8n.pt")
        self.assertTrue(baseline.baseline)

        for cand in list_candidates():
            if cand.id != "yolov8n":
                self.assertFalse(cand.baseline, f"Candidate {cand.id} must not be marked baseline")

    def test_model_names_flow_into_benchmark_provenance(self):
        """Exact model names must flow into analyzer provenance and benchmark schema (no generic 'yolo')."""
        cand = get_candidate("yolo11s")
        cfg = cand.to_engine_config(input_size=960)

        analyzer = BadmintonAnalyzerV2(engine_config=cfg)
        prov = analyzer.get_provenance()

        self.assertEqual(prov["detectorModel"], "yolo11s.pt")
        self.assertEqual(prov["detectorFamily"], "yolo11")
        self.assertEqual(prov["detectorInputSize"], 960)
        self.assertNotEqual(prov["detectorModel"], "yolo")

        # Verify flow into TrackingSession and benchmark run
        session = TrackingSession(
            session_id="test_cand_prov_session",
            game_type="doubles",
            tracked_player_count=2,
            processing_config={
                "profile": "custom",
                "detectorModel": "yolo26m.pt",
                "detectorFamily": "yolo26",
                "detectorInputSize": 640,
            },
        )
        _, _, session_prov = _build_session_metrics(session)
        self.assertEqual(session_prov["detectorModel"], "yolo26m.pt")
        self.assertEqual(session_prov["detectorFamily"], "yolo26")

        session_dict = {
            "sessionId": "test_cand_prov_session",
            "effectiveDevice": "cpu",
            "runtimeProvenance": session_prov,
            "performance": {"analysisFps": 30.0, "elapsedSec": 10.0},
            "quality": {"observedCoveragePct": 95.0},
            "videoMetadata": {"durationSeconds": 10.0, "width": 1920, "height": 1080, "nominalFps": 30.0},
        }
        benchmark_run = create_benchmark_run_from_session_dict(session_dict)
        self.assertEqual(benchmark_run.model_config.detector_name, "yolo26m.pt")
        self.assertNotEqual(benchmark_run.model_config.detector_name, "yolo")

    def test_unsupported_model_fails_cleanly(self):
        """Unsupported candidate IDs or missing files must raise explicit errors without silent fallback."""
        with self.assertRaises(InvalidEngineConfigError):
            get_candidate("nonexistent_yolo_model_999")

        cand = get_candidate("yolo11s")
        # 1280 is not yet in benchmark input sizes
        with self.assertRaises(InvalidEngineConfigError):
            cand.to_engine_config(input_size=1280)

        # Missing weight file must fail with ModelNotFoundError
        cfg = cand.to_engine_config(input_size=640)
        analyzer = BadmintonAnalyzerV2(engine_config=cfg)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)

        with self.assertRaises(ModelNotFoundError):
            analyzer.detect_and_track(frame)

    def test_selecting_candidate_does_not_mutate_baseline(self):
        """Creating an engine config for a candidate must not mutate the baseline candidate or config."""
        baseline_before = get_baseline_candidate()
        baseline_cfg_before = create_baseline_engine_config()

        cand = get_candidate("yolo26s")
        cand_cfg = cand.to_engine_config(input_size=960, confidence_threshold=0.5)

        self.assertEqual(cand_cfg.detector_model, "yolo26s.pt")
        self.assertEqual(cand_cfg.detector_input_size, 960)

        baseline_after = get_baseline_candidate()
        baseline_cfg_after = create_baseline_engine_config()

        self.assertEqual(baseline_before.model_file, baseline_after.model_file)
        self.assertEqual(baseline_cfg_before.detector_model, baseline_cfg_after.detector_model)
        self.assertEqual(baseline_cfg_after.detector_model, "yolov8n.pt")
        self.assertEqual(baseline_cfg_after.detector_input_size, 640)

    def test_no_model_binary_in_tracked_files(self):
        """No large model weights (.pt, .engine, .onnx, .bin) may be committed or tracked in Git."""
        repo_root = ai_service_dir.parent
        res = subprocess.run(
            ["git", "ls-files"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=True,
        )
        tracked_files = res.stdout.splitlines()

        binary_extensions = (".pt", ".engine", ".onnx", ".bin")
        committed_binaries = [f for f in tracked_files if f.lower().endswith(binary_extensions)]

        self.assertEqual(
            committed_binaries,
            [],
            f"Prohibited binary model files found in tracked git repository: {committed_binaries}",
        )

    def test_candidate_availability_reporting(self):
        """Availability report correctly distinguishes local baseline from un-cached candidates."""
        repo_root = ai_service_dir.parent
        report = get_candidate_registry_report(workspace_root=repo_root)

        self.assertEqual(report["baseline"], "YOLOv8n")
        self.assertEqual(report["supportedInputSizes"], [640, 960])

        avail_names = [c["displayName"] for c in report["availableCandidates"]]
        self.assertIn("YOLOv8n", avail_names)

        unavail_names = [c["displayName"] for c in report["unavailableCandidates"]]
        for unavail_candidate in ["YOLO11s", "YOLO11m", "YOLO26s", "YOLO26m"]:
            self.assertIn(unavail_candidate, unavail_names)


if __name__ == "__main__":
    unittest.main()
