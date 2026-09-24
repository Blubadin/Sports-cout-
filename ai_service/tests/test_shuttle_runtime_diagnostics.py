"""Measured runtime diagnostics for the production shuttle pipeline."""

from __future__ import annotations

import unittest
from typing import Sequence

import numpy as np

from ai_service.shuttle_pipeline import create_shuttle_pipeline
from ai_service.shuttle_tracker import (
    ProviderAvailability,
    ShuttleTrackerProvider,
    TemporalFrame,
    TemporalModelOutput,
)


MEASURED_COUNTERS = (
    "framesReceived",
    "validFrames",
    "inferenceCalls",
    "meanInferenceMs",
    "observedCount",
    "predictedCount",
    "lostCount",
    "unknownCount",
)


class DeterministicProvider(ShuttleTrackerProvider):
    def __init__(self, probability_map: np.ndarray) -> None:
        self.probability_map = probability_map

    def infer(self, frames: Sequence[TemporalFrame]) -> TemporalModelOutput:
        return TemporalModelOutput(probability_map=self.probability_map.copy())


class MissingModelProvider(ShuttleTrackerProvider):
    def availability(self) -> ProviderAvailability:
        return ProviderAvailability(False, "MODEL UNAVAILABLE", "test model is missing")

    def infer(self, frames: Sequence[TemporalFrame]) -> TemporalModelOutput:
        raise AssertionError("unavailable provider must not run inference")


def active_pipeline(probability_map: np.ndarray):
    return create_shuttle_pipeline(
        {
            "shuttle_enabled": True,
            "shuttle_window_size": 2,
            "shuttle_recovery_enabled": False,
        },
        custom_provider=DeterministicProvider(probability_map),
    )


class TestShuttleRuntimeDiagnostics(unittest.TestCase):
    def test_unavailable_pipelines_report_no_measured_counters(self) -> None:
        pipelines = (
            create_shuttle_pipeline({"shuttle_enabled": False}),
            create_shuttle_pipeline(
                {"shuttle_enabled": True},
                custom_provider=MissingModelProvider(),
            ),
        )

        for pipeline in pipelines:
            with self.subTest(status=pipeline.status):
                provenance = pipeline.get_provenance()
                for counter in MEASURED_COUNTERS:
                    self.assertIsNone(provenance[counter], counter)

    def test_active_zero_frame_pipeline_reports_measured_zero_counts(self) -> None:
        provenance = active_pipeline(np.zeros((8, 8), dtype=np.float32)).get_provenance()

        self.assertEqual(provenance["framesReceived"], 0)
        self.assertEqual(provenance["validFrames"], 0)
        self.assertEqual(provenance["inferenceCalls"], 0)
        self.assertIsNone(provenance["meanInferenceMs"])
        self.assertEqual(provenance["observedCount"], 0)
        self.assertEqual(provenance["predictedCount"], 0)
        self.assertEqual(provenance["lostCount"], 0)
        self.assertEqual(provenance["unknownCount"], 0)
        self.assertIsNone(provenance["lastFailure"])

    def test_empty_heatmap_records_inference_and_unknown_observations(self) -> None:
        pipeline = active_pipeline(np.zeros((8, 8), dtype=np.float32))
        frame = np.zeros((24, 32, 3), dtype=np.uint8)

        pipeline.process_frame(frame, timestamp_sec=0.0, frame_index=0)
        observation = pipeline.process_frame(frame, timestamp_sec=0.04, frame_index=1)
        provenance = pipeline.get_provenance()

        self.assertEqual(observation.state, "unknown")
        self.assertEqual(provenance["framesReceived"], 2)
        self.assertEqual(provenance["validFrames"], 2)
        self.assertEqual(provenance["inferenceCalls"], 1)
        self.assertIsNotNone(provenance["meanInferenceMs"])
        self.assertEqual(provenance["observedCount"], 0)
        self.assertEqual(provenance["predictedCount"], 0)
        self.assertEqual(provenance["lostCount"], 0)
        self.assertEqual(provenance["unknownCount"], 2)
        self.assertEqual(provenance["lastFailure"], "NO SHUTTLE CANDIDATE")

    def test_valid_heatmap_records_observed_observation(self) -> None:
        heatmap = np.zeros((8, 8), dtype=np.float32)
        heatmap[3, 5] = 0.95
        pipeline = active_pipeline(heatmap)
        frame = np.zeros((24, 32, 3), dtype=np.uint8)

        pipeline.process_frame(frame, timestamp_sec=0.0, frame_index=0)
        observation = pipeline.process_frame(frame, timestamp_sec=0.04, frame_index=1)
        provenance = pipeline.get_provenance()

        self.assertEqual(observation.state, "observed")
        self.assertEqual(provenance["observedCount"], 1)
        self.assertEqual(provenance["predictedCount"], 0)
        self.assertEqual(provenance["lostCount"], 0)
        self.assertEqual(provenance["unknownCount"], 1)
        self.assertIsNone(provenance["lastFailure"])


if __name__ == "__main__":
    unittest.main()
