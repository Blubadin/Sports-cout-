"""Deterministic Phase 2.2 temporal shuttle tracker baseline tests."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from ai_service.shuttle_tracker import (
    ModelUnavailableError,
    OpenCvOnnxShuttleTrackerProvider,
    RuntimeUnavailableError,
    ShuttleTrackerConfig,
    ShuttleTrackerProvider,
    TemporalFrame,
    TemporalModelOutput,
    TemporalShuttleTracker,
)


class RecordingProvider(ShuttleTrackerProvider):
    def __init__(self, outputs: list[TemporalModelOutput]) -> None:
        self.outputs = list(outputs)
        self.windows: list[list[TemporalFrame]] = []

    def infer(self, frames):  # type: ignore[no-untyped-def]
        self.windows.append(list(frames))
        return self.outputs.pop(0)


def frame(value: int = 0, width: int = 8, height: int = 6) -> np.ndarray:
    return np.full((height, width, 3), value, dtype=np.uint8)


def tracker(provider: ShuttleTrackerProvider, **overrides) -> TemporalShuttleTracker:  # type: ignore[no-untyped-def]
    config = ShuttleTrackerConfig(
        window_size=3,
        input_width=8,
        input_height=6,
        confidence_threshold=0.6,
        **overrides,
    )
    return TemporalShuttleTracker(provider=provider, config=config)


class TestTemporalShuttleTracker(unittest.TestCase):
    def test_caller_buffer_reuse_cannot_rewrite_temporal_history(self):
        provider = RecordingProvider([TemporalModelOutput(probability_map=None)])
        subject = tracker(provider)
        reused = frame(1)
        subject.process_frame(reused, 0.0, 0)
        reused[:] = 2
        subject.process_frame(reused, 0.04, 1)
        reused[:] = 3
        subject.process_frame(reused, 0.08, 2)
        self.assertEqual([int(f.image[0, 0, 0]) for f in provider.windows[0]], [1, 2, 3])

    def test_nan_frame_does_not_reach_model(self):
        provider = RecordingProvider([])
        subject = tracker(provider)
        bad = np.full((6, 8, 3), np.nan)
        for index in range(3):
            subject.process_frame(bad, index / 30, index)
        self.assertEqual(provider.windows, [])

    def test_window_initialization_is_unknown_without_inference(self):
        provider = RecordingProvider([])
        subject = tracker(provider)

        first = subject.process_frame(frame(1), timestamp_sec=0.0, frame_index=0)
        second = subject.process_frame(frame(2), timestamp_sec=0.04, frame_index=1)

        self.assertEqual([first.state, second.state], ["unknown", "unknown"])
        self.assertIsNone(first.position_px)
        self.assertEqual(provider.windows, [])

    def test_rolling_window_preserves_chronological_order(self):
        heatmap = np.array([[0.0, 0.9]], dtype=np.float32)
        provider = RecordingProvider([
            TemporalModelOutput(probability_map=heatmap),
            TemporalModelOutput(probability_map=heatmap),
        ])
        subject = tracker(provider)

        for index in range(4):
            subject.process_frame(frame(index), timestamp_sec=index / 30.0, frame_index=index)

        self.assertEqual(
            [[item.frame_index for item in window] for window in provider.windows],
            [[0, 1, 2], [1, 2, 3]],
        )
        self.assertEqual(
            [[int(item.image[0, 0, 0]) for item in window] for window in provider.windows],
            [[0, 1, 2], [1, 2, 3]],
        )

    def test_timestamp_and_frame_index_are_preserved(self):
        provider = RecordingProvider([
            TemporalModelOutput(probability_map=np.array([[0.0, 0.8]], dtype=np.float32))
        ])
        subject = tracker(provider)
        subject.process_frame(frame(), 1.0, 10)
        subject.process_frame(frame(), 1.04, 11)
        observation = subject.process_frame(frame(), 1.08, 12)

        self.assertEqual(observation.timestamp_sec, 1.08)
        self.assertEqual(observation.frame_index, 12)

    def test_valid_candidate_is_observed_in_source_image_space(self):
        heatmap = np.zeros((3, 5), dtype=np.float32)
        heatmap[1, 2] = 0.92
        provider = RecordingProvider([TemporalModelOutput(probability_map=heatmap)])
        subject = tracker(provider)
        subject.process_frame(frame(width=1920, height=1080), 0.0, 0)
        subject.process_frame(frame(width=1920, height=1080), 0.04, 1)
        observation = subject.process_frame(frame(width=1920, height=1080), 0.08, 2)

        self.assertEqual(observation.state, "observed")
        self.assertEqual(observation.source, "temporal_tracker")
        self.assertAlmostEqual(observation.confidence or 0.0, 0.92, places=5)
        self.assertAlmostEqual(observation.position_px.x, 959.5)  # type: ignore[union-attr]
        self.assertAlmostEqual(observation.position_px.y, 539.5)  # type: ignore[union-attr]

    def test_empty_output_is_no_candidate_and_never_fake_zero(self):
        provider = RecordingProvider([TemporalModelOutput(probability_map=None)])
        subject = tracker(provider)
        subject.process_frame(frame(), 0.0, 0)
        subject.process_frame(frame(), 0.04, 1)
        observation = subject.process_frame(frame(), 0.08, 2)

        self.assertEqual(observation.state, "unknown")
        self.assertIsNone(observation.position_px)
        self.assertIsNone(observation.confidence)

    def test_confidence_below_threshold_is_rejected(self):
        provider = RecordingProvider([
            TemporalModelOutput(probability_map=np.array([[0.59]], dtype=np.float32))
        ])
        subject = tracker(provider)
        subject.process_frame(frame(), 0.0, 0)
        subject.process_frame(frame(), 0.04, 1)
        observation = subject.process_frame(frame(), 0.08, 2)

        self.assertEqual(observation.state, "unknown")
        self.assertIsNone(observation.position_px)

    def test_nan_and_invalid_heatmaps_are_rejected(self):
        for heatmap in (
            np.array([[np.nan]], dtype=np.float32),
            np.array([], dtype=np.float32),
            np.zeros((1, 1, 1, 2), dtype=np.float32),
            np.array([[1.1]], dtype=np.float32),
        ):
            with self.subTest(shape=heatmap.shape):
                provider = RecordingProvider([TemporalModelOutput(probability_map=heatmap)])
                subject = tracker(provider)
                subject.process_frame(frame(), 0.0, 0)
                subject.process_frame(frame(), 0.04, 1)
                observation = subject.process_frame(frame(), 0.08, 2)
                self.assertEqual(observation.state, "unknown")
                self.assertIsNone(observation.position_px)
                self.assertEqual(subject.metrics().last_failure, "INVALID MODEL OUTPUT")

    def test_heatmap_position_is_normalized_to_source_resolution(self):
        heatmap = np.zeros((3, 5), dtype=np.float32)
        heatmap[2, 4] = 1.0
        provider = RecordingProvider([TemporalModelOutput(probability_map=heatmap)])
        subject = tracker(provider)
        for index in range(2):
            subject.process_frame(frame(width=1920, height=1080), index / 30.0, index)
        observation = subject.process_frame(frame(width=1920, height=1080), 2 / 30.0, 2)

        self.assertEqual(observation.position_px.x, 1919.0)  # type: ignore[union-attr]
        self.assertEqual(observation.position_px.y, 1079.0)  # type: ignore[union-attr]

    def test_real_top_left_measurement_is_allowed_but_missing_is_null(self):
        observed_provider = RecordingProvider([
            TemporalModelOutput(probability_map=np.array([[1.0, 0.0]], dtype=np.float32))
        ])
        observed_tracker = tracker(observed_provider)
        for index in range(3):
            observed = observed_tracker.process_frame(frame(), index / 30.0, index)

        self.assertEqual(observed.state, "observed")
        self.assertEqual(observed.position_px.x, 0.0)  # type: ignore[union-attr]
        self.assertEqual(observed.position_px.y, 0.0)  # type: ignore[union-attr]

        missing_provider = RecordingProvider([
            TemporalModelOutput(probability_map=np.array([[0.0]], dtype=np.float32))
        ])
        missing_tracker = tracker(missing_provider)
        for index in range(3):
            missing = missing_tracker.process_frame(frame(), index / 30.0, index)
        self.assertIsNone(missing.position_px)

    def test_model_unavailable_is_explicit_and_does_not_infer(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_path = Path(temp_dir) / "tracknet.onnx"
            provider = OpenCvOnnxShuttleTrackerProvider(missing_path)
            subject = tracker(provider)
            subject.process_frame(frame(), 0.0, 0)
            subject.process_frame(frame(), 0.04, 1)

            with self.assertRaisesRegex(ModelUnavailableError, "^MODEL UNAVAILABLE:"):
                subject.process_frame(frame(), 0.08, 2)

            self.assertEqual(subject.metrics().inference_calls, 0)

    def test_runtime_unavailable_is_explicit(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = Path(temp_dir) / "tracknet.onnx"
            model_path.touch()
            provider = OpenCvOnnxShuttleTrackerProvider(model_path, device="cuda")
            subject = tracker(provider)
            subject.process_frame(frame(), 0.0, 0)
            subject.process_frame(frame(), 0.04, 1)

            with self.assertRaisesRegex(RuntimeUnavailableError, "^RUNTIME UNAVAILABLE:"):
                subject.process_frame(frame(), 0.08, 2)

            self.assertEqual(subject.metrics().inference_calls, 0)

    def test_invalid_configured_input_dimensions_are_rejected(self):
        provider = RecordingProvider([])
        with self.assertRaisesRegex(ValueError, "input_width"):
            TemporalShuttleTracker(
                provider,
                ShuttleTrackerConfig(window_size=3, input_width=0, input_height=6),
            )

    def test_invalid_frame_is_not_added_to_window(self):
        provider = RecordingProvider([
            TemporalModelOutput(probability_map=np.array([[1.0]], dtype=np.float32))
        ])
        subject = tracker(provider)
        subject.process_frame(frame(), 0.0, 0)
        bad = subject.process_frame(np.array([1, 2, 3]), 0.04, 1)
        subject.process_frame(frame(), 0.08, 2)
        subject.process_frame(frame(), 0.12, 3)
        observed = subject.process_frame(frame(), 0.16, 4)

        self.assertEqual(bad.state, "unknown")
        self.assertIsNone(bad.position_px)
        self.assertEqual([item.frame_index for item in provider.windows[0]], [2, 3, 4])
        self.assertEqual(observed.state, "observed")
        self.assertEqual(subject.metrics().invalid_frames, 1)

    def test_missing_frame_index_restarts_temporal_window(self):
        provider = RecordingProvider([
            TemporalModelOutput(probability_map=np.array([[1.0]], dtype=np.float32))
        ])
        subject = tracker(provider)
        subject.process_frame(frame(), 0.0, 0)
        after_gap = subject.process_frame(frame(), 0.08, 2)
        next_frame = subject.process_frame(frame(), 0.12, 3)
        observed = subject.process_frame(frame(), 0.16, 4)

        self.assertEqual(after_gap.state, "unknown")
        self.assertEqual(next_frame.state, "unknown")
        self.assertEqual(observed.state, "observed")
        self.assertEqual([item.frame_index for item in provider.windows[0]], [2, 3, 4])

    def test_missing_candidate_is_lost_after_an_observation(self):
        provider = RecordingProvider([
            TemporalModelOutput(probability_map=np.array([[1.0]], dtype=np.float32)),
            TemporalModelOutput(probability_map=np.array([[0.0]], dtype=np.float32)),
        ])
        subject = tracker(provider)
        states = [
            subject.process_frame(frame(), index / 30.0, index).state
            for index in range(4)
        ]
        self.assertEqual(states, ["unknown", "unknown", "observed", "lost"])

    def test_source_fps_does_not_change_state_semantics(self):
        def states_for_fps(fps: float) -> list[str]:
            provider = RecordingProvider([
                TemporalModelOutput(probability_map=np.array([[1.0]], dtype=np.float32)),
                TemporalModelOutput(probability_map=np.array([[0.0]], dtype=np.float32)),
            ])
            subject = tracker(provider)
            return [
                subject.process_frame(frame(), index / fps, index).state
                for index in range(4)
            ]

        self.assertEqual(states_for_fps(25.0), states_for_fps(60.0))

    def test_performance_metrics_record_run_configuration_and_calls(self):
        provider = RecordingProvider([
            TemporalModelOutput(probability_map=np.array([[1.0]], dtype=np.float32)),
            TemporalModelOutput(probability_map=np.array([[1.0]], dtype=np.float32)),
        ])
        subject = tracker(provider)
        for index in range(4):
            subject.process_frame(frame(), index / 30.0, index)

        metrics = subject.metrics()
        self.assertEqual(metrics.inference_calls, 2)
        self.assertEqual(metrics.window_size, 3)
        self.assertEqual(metrics.input_resolution, (8, 6))
        self.assertEqual(metrics.device, "cpu")
        self.assertEqual(metrics.runtime, "opencv_dnn")
        self.assertEqual(metrics.precision, "fp32")
        self.assertIsNotNone(metrics.mean_inference_ms)
        self.assertIsNotNone(metrics.analysis_fps)

    def test_end_stream_clears_partial_window_without_fabricating_output(self):
        provider = RecordingProvider([])
        subject = tracker(provider)
        subject.process_frame(frame(), 0.0, 0)
        subject.process_frame(frame(), 0.04, 1)

        metrics = subject.end_stream()

        self.assertEqual(metrics.frames_received, 2)
        self.assertEqual(metrics.inference_calls, 0)
        self.assertEqual(subject.buffered_frame_count, 0)


if __name__ == "__main__":
    unittest.main()
