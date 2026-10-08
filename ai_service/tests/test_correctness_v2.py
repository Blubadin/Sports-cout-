"""Deterministic physical and rendered production-path regressions (not real GT)."""
import ast
import copy
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from court_mapper import CourtMapper, DistanceTracker
from device_runtime import resolve_device, InferenceExecution, InferenceExecutionError
from analysis_exporter import AnalysisExporter, ExportOptions, ExportProgressState
from ground_position import resolve_canonical_ground_point
from player_eligibility import evaluate_player_eligibility, CourtEnvelopeZone
from shuttle_shots import ShuttleShotTracker, landing_zone, shot_analytics


class PhysicalDistanceTests(unittest.TestCase):
    def setUp(self):
        self.mapper = CourtMapper()
        self.mapper.calibrate([[0, 0], [610, 0], [610, 1340], [0, 1340]])
        self.tracker = DistanceTracker(self.mapper)

    def feed(self, coords, provenance="pose_both_ankles", dt=1/30, offset=0, **kwargs):
        for i, (x, y) in enumerate(coords):
            self.tracker.update(1, (x*100, y*100), timestamp_sec=offset+i*dt,
                provenance=provenance, confidence=.9, **kwargs)
        return self.tracker.get_stats(1)

    def test_stationary_ankle_noise_and_2_to_10_cm_jitter(self):
        rng = np.random.default_rng(71)
        angle = rng.uniform(0, 2*np.pi, 9000)
        radius = rng.uniform(.02, .10, 9000)
        stats = self.feed(zip(3+radius*np.cos(angle), 5+radius*np.sin(angle)))
        self.assertLess(stats["totalTrackedDistanceM"], .3)
        self.assertGreater(stats["rawMovementM"], 100)
        self.assertGreater(stats["jitterRejectedDistanceM"], 100)
        self.assertNotEqual(stats["rawGroundPoint"], stats["filteredGroundPoint"])

    def test_sudden_persistent_jump_after_long_stationary_interval_is_not_travel(self):
        stats = self.feed([(3, 5)] * 150 + [(3, 7)] * 10)
        self.assertLess(stats["totalTrackedDistanceM"], .1)
        self.assertGreater(stats["jitterRejectedDistanceM"], 1.5)

    def test_prior_metric_snapshot_keeps_its_observation_counts(self):
        earlier = self.feed([(3, 5), (3, 5)])
        self.feed([(3, 5), (3, 5)], offset=.1)
        self.assertEqual(earlier["provenanceDistribution"]["pose_both_ankles"], 2)

    def test_known_10_m_path(self):
        stats = self.feed([(3, y) for y in np.linspace(1, 11, 301)])
        self.assertAlmostEqual(stats["totalTrackedDistanceM"], 10, delta=.35)

    def test_5_m_forward_and_return(self):
        stats = self.feed([(3, y) for y in np.r_[np.linspace(1, 6, 151), np.linspace(6, 1, 151)[1:]]])
        self.assertAlmostEqual(stats["totalTrackedDistanceM"], 10, delta=.55)

    def test_bbox_anchor_switch_has_no_travel_and_no_metric_coverage(self):
        self.feed([(3, 3), (3, 3)])
        stats = self.feed([(3, 4), (3, 4)], provenance="bbox_bottom_center", offset=.1)
        self.assertIsNone(stats["filteredGroundPoint"])
        stats = self.feed([(3, 3), (3, 3)], offset=.2)
        self.assertEqual(stats["totalTrackedDistanceM"], 0)
        self.assertLess(stats["metricDistanceCoverage"], 1)

    def test_single_ankle_is_lower_quality_then_recovers(self):
        self.feed([(3, 3)])
        stats = self.feed([(3, 3.5), (3, 3.5)], provenance="pose_left_ankle", offset=.1)
        self.assertGreater(stats["measurementUncertaintyM"], .24)
        stats = self.feed([(3, 3)], offset=.2)
        self.assertEqual(stats["totalTrackedDistanceM"], 0)

    def test_camera_cut_and_calibration_do_not_bridge(self):
        for key in ("camera_segment_id", "calibration_id"):
            with self.subTest(key=key):
                self.setUp()
                self.feed([(3, 1)], **{key: "one"})
                stats = self.feed([(3, 8)], offset=.1, **{key: "two"})
                self.assertEqual(stats["totalTrackedDistanceM"], 0)

    def test_gap_and_identity_loss_do_not_bridge(self):
        self.feed([(3, 1)])
        stats = self.feed([(3, 8)], offset=2)
        self.assertEqual(stats["totalTrackedDistanceM"], 0)
        self.tracker.pause_player(1)
        stats = self.feed([(3, 1)], offset=2.1)
        self.assertEqual(stats["totalTrackedDistanceM"], 0)

    def test_fast_badminton_lunge_measurable(self):
        stats = self.feed([(3, y) for y in np.linspace(3, 5, 11)])
        self.assertAlmostEqual(stats["totalTrackedDistanceM"], 2, delta=.3)
        self.assertGreater(stats["validMovementSamples"], 0)

    def test_idle_is_total_only_and_replay_is_excluded(self):
        self.feed([(3, 1), (3, 2)], dt=.5, scene_state="COURT_IDLE")
        stats = self.tracker.get_stats(1)
        self.assertGreater(stats["totalTrackedDistanceM"], .9)
        self.assertEqual(stats["distanceDuringActivePlayM"], 0)
        replay = self.feed([(3, 4)], offset=1, scene_state="REPLAY")
        self.assertEqual(stats["totalTrackedDistanceM"], replay["totalTrackedDistanceM"])


class EligibilityRuntimeTests(unittest.TestCase):
    def test_cpu_doctor_executes_without_cuda(self):
        from runtime_doctor import accelerator_probe
        class Tensor:
            device = types.SimpleNamespace(type="cpu")
            def __matmul__(self, other):
                return self
        fake = types.SimpleNamespace(ones=lambda shape, device: Tensor(),
            isfinite=lambda tensor: types.SimpleNamespace(all=lambda: types.SimpleNamespace(item=lambda: True)),
            cuda=types.SimpleNamespace(is_available=lambda: False))
        self.assertEqual(accelerator_probe("cpu", fake), "cpu")
        with self.assertRaises(ValueError):
            accelerator_probe("cuda", fake)

    def test_unknown_side_play_and_mot_semantic_collision_are_blocked(self):
        from analyzer_v2 import PlayerProfile
        ground = resolve_canonical_ground_point([10, 10, 30, 60], 100, 100)
        for profiles in ({}, {1: PlayerProfile(1)}):
            elig = evaluate_player_eligibility({"track_id": 1, "bbox": [10, 10, 30, 60]}, ground,
                CourtEnvelopeZone.UNAVAILABLE, active_profiles=profiles, scene_state="SIDE_PLAY")
            self.assertFalse(elig.is_eligible_for_profile)

    def test_identity_boundary_cannot_seed_unavailable_court(self):
        from analyzer_v2 import PlayerProfile
        from semantic_identity import match_tracks_to_profiles_with_reid
        profiles = {1: PlayerProfile(1), 2: PlayerProfile(2)}
        detection = {"eligibility": types.SimpleNamespace(provenance={"courtEligibilityUnavailable": True})}
        result = match_tracks_to_profiles_with_reid(profiles, [detection], np.zeros((100, 100, 3), dtype=np.uint8), None)
        self.assertEqual(result[0], {})
        self.assertTrue(all(p.track_id is None for p in profiles.values()))

    def test_distinctive_athletes_change_ends_despite_recycled_mot_ids(self):
        from analyzer_v2 import PlayerProfile
        from semantic_identity import match_tracks_to_profiles_with_reid
        profiles = {1: PlayerProfile(1), 2: PlayerProfile(2)}
        boxes = [[70, 10, 110, 60], [70, 120, 110, 170]]
        detections = [{"bbox": box, "center": (90, (box[1]+box[3])/2), "real_pos": (3, y), "track_id": track, "conf": .95}
                      for box, y, track in zip(boxes, (3, 10), (1, 2))]
        initial = np.zeros((200, 200, 3), dtype=np.uint8)
        initial[10:60, 70:110] = (20, 20, 210)
        initial[120:170, 70:110] = (160, 160, 160)
        owners = {}
        match_tracks_to_profiles_with_reid(profiles, detections, initial, None, last_known_track_owners=owners)
        switched = np.zeros_like(initial)
        switched[10:60, 70:110] = (160, 160, 160)
        switched[120:170, 70:110] = (20, 20, 210)
        for _ in range(2):
            self.assertEqual(match_tracks_to_profiles_with_reid(profiles, detections, switched, None, last_known_track_owners=owners)[0], {})
        matched, _, raw_switches, semantic_switches = match_tracks_to_profiles_with_reid(profiles, detections, switched, None, last_known_track_owners=owners)
        self.assertEqual(matched[1]["track_id"], 2)
        self.assertEqual(matched[2]["track_id"], 1)
        self.assertEqual(raw_switches, 2)
        self.assertEqual(semantic_switches, 0)

    def test_known_continuity_is_bounded(self):
        ground = resolve_canonical_ground_point([10, 10, 30, 60], 100, 100)
        for age, expected in ((1, True), (16, False)):
            elig = evaluate_player_eligibility({"is_known_player": True}, ground,
                CourtEnvelopeZone.UNAVAILABLE, scene_state="SIDE_PLAY", unavailable_frames=age)
            self.assertEqual(elig.is_eligible_for_profile, expected)

    def test_one_visible_near_athlete_is_not_transferred_into_an_empty_slot(self):
        from analyzer_v2 import PlayerProfile
        from semantic_identity import match_tracks_to_profiles_with_reid
        profiles = {1: PlayerProfile(1, team=1), 2: PlayerProfile(2, team=2)}
        image = np.zeros((200, 200, 3), dtype=np.uint8)
        image[120:170, 70:110] = (160, 160, 160)
        image[10:60, 70:110] = (20, 20, 210)
        gray = dict(bbox=[70,120,110,170], center=(90,170), real_pos=(3,10), track_id=7, conf=.95)
        red = dict(bbox=[70,10,110,60], center=(90,60), real_pos=(3,3), track_id=8, conf=.95)
        initial = match_tracks_to_profiles_with_reid(profiles, [gray], image, None)[0]
        self.assertEqual(initial[1]["track_id"], 7)
        self.assertEqual(profiles[1].team, 2)
        for _ in range(5):
            matched = match_tracks_to_profiles_with_reid(profiles, [gray, red], image, None)[0]
            self.assertEqual(matched[1]["track_id"], 7)
            self.assertEqual(matched[2]["track_id"], 8)

    def test_jersey_reference_does_not_drift_with_background_or_adaptive_updates(self):
        from analyzer_v2 import PlayerProfile
        from semantic_identity import compute_identity_association_cost
        profile = PlayerProfile(1)
        bbox = [20, 10, 120, 190]
        image = np.full((200, 150, 3), (40, 180, 40), dtype=np.uint8)
        image[46:100, 50:90] = (20, 20, 210)
        profile.update_appearance(image, bbox)
        reference = profile.identity_color_hist.copy()
        changed_background = np.full_like(image, (220, 60, 20))
        changed_background[46:100, 50:90] = (20, 20, 210)
        cost = compute_identity_association_cost(profile, {"bbox": bbox}, changed_background)
        self.assertAlmostEqual(cost.hsv_distance, 0)
        wrong_athlete = np.full_like(image, (160, 160, 160))
        for _ in range(60):
            profile.update_appearance(wrong_athlete, bbox)
        np.testing.assert_array_equal(reference, profile.identity_color_hist)
        cost = compute_identity_association_cost(profile, {"bbox": bbox}, wrong_athlete)
        self.assertGreater(cost.hsv_distance, .5)

    def test_explicit_cuda_unavailable_errors_auto_uses_cpu(self):
        fake = types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda: False))
        self.assertEqual(resolve_device("auto", torch_module=fake), "cpu")
        with self.assertRaises(ValueError):
            resolve_device("cuda", torch_module=fake)

    def test_explicit_cuda_failure_does_not_retry_cpu(self):
        with patch("device_runtime.resolve_device", return_value="cuda"):
            execution = InferenceExecution("cuda")
        calls = []
        def operation(device):
            calls.append(device)
            raise RuntimeError("fault injection")
        with self.assertRaises(InferenceExecutionError):
            execution.run(operation)
        self.assertEqual(calls, ["cuda"])
        self.assertFalse(execution.provenance()["executionValidated"])

    def test_annotator_every_declared_key_reachable(self):
        tree = ast.parse((Path(__file__).parent.parent / "annotate_gt.py").read_text(encoding="utf-8-sig"))
        keys = [node.args[0].value for node in ast.walk(tree) if isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name) and node.func.id == "ord"
                and len(node.args) == 1 and isinstance(node.args[0], ast.Constant)]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertIn("a", keys)
        self.assertIn("b", keys)


class RenderedExportTests(unittest.TestCase):
    def test_real_production_fixture_executes_court_pose_and_debug_paths(self):
        # Captured from real Badminton test.mp4 frame 150 with this analyzer;
        # schema regression only, not human ground-truth certification.
        data = json.loads((Path(__file__).parent / "fixtures/production_export_frame.json").read_text())
        self.assertTrue(any(p.get("state") == "observed" and p.get("pose") for p in data["players"]))
        with tempfile.TemporaryDirectory() as folder:
            exporter = AnalysisExporter(None, Path(folder))
            for options in (ExportOptions(court=True, pose=False, player_detection=False, ground_points=False, shuttle=False),
                            ExportOptions(court=False, pose=True, player_detection=False, ground_points=False, shuttle=False),
                            ExportOptions.preset_debug()):
                image = np.zeros((720, 1280, 3), np.uint8)
                exporter._render_overlays_on_frame(image, data, 150, options, 1280, 720, [])
                self.assertGreater(np.count_nonzero(image[60:]), 100)

    def test_manifest_does_not_invent_runtime_session_or_encoder(self):
        with tempfile.TemporaryDirectory() as folder:
            exporter = AnalysisExporter(None, Path(folder))
            path = Path(folder)/"manifest.json"
            exporter._generate_manifest({"sessionId": "real-session", "metadata": {"session": {"projectId": "project"}}},
                [{"sourceFrame": 2, "frameIndex": 1}], ExportOptions(), [], path, Path(folder)/"source.mp4",
                render_facts={"videoCodec": "avc1", "resolution": [64, 64], "fps": 25., "legacyFrameIndexFallbackCount": 0})
            manifest = json.loads(path.read_text())
            self.assertEqual(manifest["analysisSessionId"], "real-session")
            self.assertEqual(manifest["analysisJobId"], "real-session")
            self.assertEqual(manifest["videoCodec"], "avc1")
            for key in ("detectorModel", "poseModel", "shuttleModel", "precision", "runtime", "effectiveDevice"):
                self.assertIsNone(manifest["provenance"][key])
            exporter._generate_manifest({"sessionId": "recorded-session", "metadata": {"engine": {
                "effectiveDevice": None, "device": "cpu", "runtime": "recorded", "precision": "fp32"}}},
                [], ExportOptions(), [], path, Path(folder)/"source.mp4")
            recorded = json.loads(path.read_text())["provenance"]
            self.assertIsNone(recorded["effectiveDevice"])
            self.assertIsNone(recorded["device"])
            self.assertIsNone(recorded["precision"])

    def test_shuttle_heatmaps_use_measured_metric_data_and_separate_landings(self):
        with tempfile.TemporaryDirectory() as folder:
            exporter = AnalysisExporter(None, Path(folder))
            rows = [{"isMetricValid": True, "sceneState": "COURT_PLAY", "players": [],
                "shuttle": {"state": "observed", "positionM": {"xM": 3, "yM": 5}, "metricEligible": True},
                "shuttleShotEvents": {"shots": [{"shotId": "one", "outcome": "UNKNOWN", "landingPositionM": None}]}}]
            with patch.object(exporter, "_plot_court_heatmap") as plot:
                exporter._generate_heatmaps(rows, Path(folder), ExportOptions(), ExportProgressState("exp", "session"))
            trajectory = next(call for call in plot.call_args_list if call.args[2].name == "shuttle_trajectory_heatmap.png")
            landing = next(call for call in plot.call_args_list if call.args[2].name == "shuttle_landing_heatmap.png")
            self.assertEqual(trajectory.args[0], [(3, 5)])
            self.assertEqual(landing.args[0], [])
            self.assertEqual(landing.args[1], "INSUFFICIENT_SHUTTLE_METRIC_DATA")

    def test_pdf_reports_real_session_and_valid_zero_distance(self):
        import matplotlib.pyplot as plt
        exporter = AnalysisExporter(None, Path("."))
        job = {"sessionId": "real-session", "metadata": {"session": {"gameType": "singles"}}}
        summary = exporter._build_pdf_page_summary(job, [], ExportOptions())
        summary_text = [text.get_text() for ax in summary.axes for text in ax.texts]
        self.assertIn("real-session", summary_text)
        self.assertNotIn("reference", summary_text)
        players = exporter._build_pdf_page_players(job, [{"players": [{"playerId": "P1", "state": "observed", "totalDistanceM": 0.0}]}], [])
        text = [text.get_text() for ax in players.axes for text in ax.texts]
        self.assertIn("0.0 m", text)
        quality = exporter._build_pdf_page_ground_quality([{"players": [{"playerId": "P2", "distanceMetrics": {"metricDistanceCoverage": None}}]}])
        self.assertTrue(any("coverage: unknown" in t.get_text() for ax in quality.axes for t in ax.texts))
        plt.close(summary)
        plt.close(players)
        plt.close(quality)

    def test_player_heatmap_uses_only_observed_metric_filtered_points(self):
        with tempfile.TemporaryDirectory() as folder:
            exporter = AnalysisExporter(None, Path(folder))
            rows = [{"isMetricValid": True, "sceneState": "COURT_PLAY", "players": [
                {"playerId": "P1", "state": "observed", "courtPosition": {"xM": 1, "yM": 1}, "filteredGroundPoint": {"xM": 3, "yM": 5}},
                {"playerId": "P1", "state": "observed", "groundPointProvenance": "bbox_bottom_center", "courtPosition": {"xM": 2, "yM": 2}},
                {"playerId": "P1", "state": "predicted", "courtPosition": {"xM": 4, "yM": 4}},
            ]}]
            with patch.object(exporter, "_plot_court_heatmap") as plot:
                exporter._generate_heatmaps(rows, Path(folder), ExportOptions(), ExportProgressState("exp", "session"))
            overall = next(call for call in plot.call_args_list if call.args[2].name == "player_movement_heatmap.png")
            self.assertEqual(overall.args[0], [(3, 5)])

    def test_stride_two_actual_decoded_pixels(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source, dest = root/"source.mp4", root/"overlay.mp4"
            writer = cv2.VideoWriter(str(source), cv2.VideoWriter_fourcc(*"mp4v"), 30, (160, 120))
            self.assertTrue(writer.isOpened())
            for _ in range(6):
                writer.write(np.zeros((120, 160, 3), np.uint8))
            writer.release()
            exporter = AnalysisExporter(None, root)
            frames = [{"sourceFrame": i*2, "frameIndex": i, "timestampSec": (i*2-1)/30, "sceneState": "COURT_PLAY", "cameraSegmentId": "seg",
                       "players": [{"playerId": "P1", "state": "observed", "bboxPx": [40, 40, 100, 90]}]} for i in (1, 2, 3)]
            facts = exporter._render_video(source, frames, dest, ExportOptions(pose=False, court=False, ground_points=False, shuttle=False, player_labels=False), ExportProgressState("exp", "session"), 0, 100, codec="mp4v")
            cap = cv2.VideoCapture(str(dest))
            visible = []
            for i in range(1, 7):
                ok, frame = cap.read()
                self.assertTrue(ok)
                if frame[39:43, 45:95].max() > 80:
                    visible.append(i)
            cap.release()
            self.assertEqual(visible, [2, 4, 6])
            self.assertEqual(facts["legacyFrameIndexFallbackCount"], 0)

    def test_canonical_court_pose_and_rejected_raw_detection_render_pixels(self):
        with tempfile.TemporaryDirectory() as folder:
            exporter = AnalysisExporter(None, Path(folder))
            data = {"isMetricValid": True, "sceneState": "COURT_PLAY", "calibration": {"corners": [[10, 10], [190, 10], [190, 190], [10, 190]]},
                    "players": [{"playerId": "P1", "state": "observed", "pose": {"keypointCoordinateSpace": "pixel", "keypoints": [[60, 80, .9], {"x": 80, "y": 90, "score": .9}]}}],
                    "rawPlayerDetections": [{"trackId": 99, "bboxPx": [130, 120, 170, 170], "eligibility": {"isEligibleForProfile": False}}]}
            original = copy.deepcopy(data)
            image = np.zeros((200, 200, 3), np.uint8)
            exporter._render_overlays_on_frame(image, data, 1, ExportOptions.preset_debug(), 200, 200, [])
            self.assertGreater(image[170:190, 10:12].max(), 80)
            self.assertGreater(image[78:83, 58:63].max(), 80)
            self.assertGreater(image[140:160, 129:132].max(), 80)
            self.assertEqual(data, original)


class ShuttleShotTests(unittest.TestCase):
    def test_automatic_contact_runs_unique_wrist_and_velocity_gates(self):
        tracker = ShuttleShotTracker()
        def observed(t, px):
            row = self.frame(t, px)
            row["shuttle"]["confidence"] = .9
            row["players"] = [{"playerId": "P1", "state": "observed", "poseSource": "fresh", "detectionConfidence": .9,
                "pose": {"keypointCoordinateSpace": "pixel", "keypoints": [[100, 80, .9] for _ in range(17)]}}]
            return row
        tracker.update(observed(0, (80, 80)), 200, 200)
        tracker.update(observed(.033, (100, 80)), 200, 200)
        shot = tracker.update(observed(.066, (80, 80)), 200, 200)["shots"][0]
        self.assertEqual(shot["contactFrame"], 1)
        self.assertEqual(shot["contactPositionPx"], {"x": 100, "y": 80})
        self.assertEqual(shot["hitterPlayerId"], "P1")

    def test_low_confidence_history_cannot_infer_contact(self):
        tracker = ShuttleShotTracker()
        for t, px, confidence in ((0, (80, 80), .1), (.033, (100, 80), .1), (.066, (80, 80), .9)):
            row = self.frame(t, px)
            row["shuttle"]["confidence"] = confidence
            row["players"] = [{"playerId": "P1", "state": "observed", "poseSource": "fresh", "detectionConfidence": .9,
                "pose": {"keypointCoordinateSpace": "pixel", "keypoints": [[100, 80, .9] for _ in range(17)]}}]
            events = tracker.update(row, 200, 200)
        self.assertEqual(events["shots"], [])

    def test_confirmed_out_landing_is_not_in(self):
        tracker = ShuttleShotTracker()
        tracker.update(self.frame(0, (80, 80), shuttleContactEvidence=self.contact()), 200, 200)
        terminal = {"outcome": "CONFIRMED_LANDING", "kind": "REVIEWED_LANDING", "confidence": .95, "positionPx": [100, 100], "positionM": [-1, 5]}
        shot = tracker.update(self.frame(.5, (100, 100), shuttleTerminalEvidence=terminal), 200, 200)["shots"][0]
        self.assertEqual(shot["outcome"], "OUT_SIDE")
        analytics = shot_analytics([shot])
        self.assertEqual(analytics["outcomes"]["IN"], 0)
        self.assertEqual(analytics["outcomes"]["OUT_SIDE"], 1)

    def frame(self, t, px=None, **kwargs):
        return {"frameIndex": round(t*30), "sourceFrame": round(t*30), "timestampSec": t, "cameraSegmentId": "seg1", "sceneState": "COURT_PLAY", "isMetricValid": True,
                "shuttle": {"state": "observed" if px else "lost", "positionPx": {"x": px[0], "y": px[1]} if px else None}, **kwargs}

    def contact(self):
        return {"confidence": .9, "semanticConfidence": .9, "hitterPlayerId": "P1"}

    def test_clear_exits_then_reacquires_same_shot_and_loss_is_unknown(self):
        tracker = ShuttleShotTracker()
        first = tracker.update(self.frame(0, (100, 80), shuttleContactEvidence=self.contact()), 200, 200)
        sid = first["shots"][0]["shotId"]
        tracker.update(self.frame(.1, (100, 4)), 200, 200)
        off = tracker.update(self.frame(.2), 200, 200)
        self.assertEqual(off["visibility"], "OUT_OF_FRAME")
        self.assertIsNone(off["measuredPositionPx"])
        back = tracker.update(self.frame(.6, (101, 6)), 200, 200)
        self.assertEqual(back["visibility"], "REACQUIRED")
        self.assertEqual(back["shots"][-1]["shotId"], sid)
        ended = tracker.update(self.frame(5), 200, 200)["shots"][0]
        self.assertEqual(ended["outcome"], "UNKNOWN")
        self.assertIsNone(ended["landingPositionM"])
        analytics = shot_analytics([ended])
        self.assertEqual(analytics["unknownLandings"], 1)
        self.assertEqual(analytics["landingAnalyticsCoverage"], 0)

    def test_return_contact_begins_new_shot_unknown_hitter_stays_null(self):
        tracker = ShuttleShotTracker()
        tracker.update(self.frame(0, (80, 80), shuttleContactEvidence={"confidence": .9}), 200, 200)
        result = tracker.update(self.frame(.5, (120, 100), shuttleContactEvidence=self.contact()), 200, 200)
        self.assertEqual(result["shots"][0]["outcome"], "RETURNED")
        self.assertIsNone(result["shots"][0]["hitterPlayerId"])
        self.assertNotEqual(result["shots"][0]["shotId"], result["shots"][1]["shotId"])
        self.assertEqual(result["shots"][0]["rallyId"], result["shots"][1]["rallyId"])

    def test_landing_requires_evidence_calibration_and_three_by_three_zones(self):
        for x, side in ((.5, "LEFT"), (3, "CENTER"), (5.5, "RIGHT")):
            for y, depth in ((5, "FRONT"), (3, "MID"), (1, "REAR")):
                self.assertEqual(landing_zone((x, y))[0], f"{depth}_{side}")
        tracker = ShuttleShotTracker()
        tracker.update(self.frame(0, (80, 80), shuttleContactEvidence=self.contact()), 200, 200)
        terminal = {"outcome": "CONFIRMED_LANDING", "kind": "REVIEWED_LANDING", "confidence": .95, "positionPx": [100, 100], "positionM": [3, 5]}
        shot = tracker.update(self.frame(.5, (100, 100), shuttleTerminalEvidence=terminal), 200, 200)["shots"][0]
        self.assertEqual(shot["landingZone"], "FRONT_CENTER")
        self.assertEqual(shot_analytics([shot])["landingAnalyticsCoverage"], 1)
        tracker.update(self.frame(1, (80, 80), shuttleContactEvidence=self.contact()), 200, 200)
        shot = tracker.update(self.frame(1.5, (100, 100), isMetricValid=False, shuttleTerminalEvidence=terminal), 200, 200)["shots"][0]
        self.assertIsNone(shot["landingPositionM"])

    def test_cut_and_incompatible_entry_cannot_force_association(self):
        for override in ({"cameraSegmentId": "seg2"}, {}):
            tracker = ShuttleShotTracker()
            tracker.update(self.frame(0, (100, 80), shuttleContactEvidence=self.contact()), 200, 200)
            tracker.update(self.frame(.1, (100, 4)), 200, 200)
            tracker.update(self.frame(.2), 200, 200)
            result = tracker.update(self.frame(.5, (190, 100), **override), 200, 200)
            self.assertEqual(result["shots"][0]["outcome"], "UNKNOWN")
            self.assertFalse(result["shots"][0]["reacquired"])


if __name__ == "__main__":
    unittest.main()
