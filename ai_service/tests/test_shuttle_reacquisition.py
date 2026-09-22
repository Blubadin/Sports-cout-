import unittest
import numpy as np
from ai_service.shuttle_tracker import TemporalShuttleTracker, ShuttleTrackerConfig, TemporalModelOutput, ShuttleTrackerProvider
from ai_service.shuttle_reacquisition import RecoveringShuttleTracker, RecoveryConfig, AuxiliaryCandidate, TrackingState


class Temporal(ShuttleTrackerProvider):
    def __init__(self):
        self.confidence = 1.0
        self.x = 50

    def infer(self, frames):
        hm = np.zeros((100, 100), dtype=np.float32)
        hm[50, self.x] = self.confidence
        return TemporalModelOutput(hm)


class Auxiliary:
    def __init__(self):
        self.candidates = []
        self.regions = []

    def detect(self, image, timestamp_sec, frame_index, region):
        self.regions.append(region)
        return self.candidates


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.provider = Temporal()
        self.aux = Auxiliary()
        self.tracker = RecoveringShuttleTracker(TemporalShuttleTracker(self.provider,
            ShuttleTrackerConfig(window_size=2)), self.aux)
        self.index = -1

    def step(self, timestamp=None):
        self.index += 1
        return self.tracker.process_frame(np.zeros((100, 100, 3), dtype=np.uint8),
            self.index / 30 if timestamp is None else timestamp, self.index)

    def lock(self):
        for _ in range(4):
            self.step()
        self.assertEqual(self.tracker.state, TrackingState.TRACKING)

    def lose(self):
        self.lock()
        self.provider.confidence = 0.1
        for _ in range(3):
            result = self.step()
        self.assertEqual(self.tracker.state, TrackingState.LOST)
        self.assertIsNone(result.position_px)

    def test_weak_hysteresis_and_prediction_bounds(self):
        self.lock()
        self.provider.confidence = 0.1
        first = self.step()
        self.assertEqual(self.tracker.state, TrackingState.WEAK)
        self.assertEqual(first.state, 'predicted')
        self.assertEqual(self.step().state, 'predicted')
        self.assertEqual(self.step().state, 'lost')
        for _ in range(20):
            result = self.step()
            self.assertIsNone(result.position_px)
            self.assertNotEqual(result.state, 'observed')

    def test_time_bound_independent_of_frame_bound(self):
        self.lock()
        self.provider.confidence = 0
        result = self.step(timestamp=0.3)
        self.assertEqual(self.tracker.state, TrackingState.WEAK)
        self.assertIsNone(result.position_px)

    def test_isolated_auxiliary_candidate_rejected(self):
        self.lose()
        self.aux.candidates = [AuxiliaryCandidate(52, 50, 0.9)]
        result = self.step()
        self.assertEqual(self.tracker.state, TrackingState.REACQUIRING)
        self.assertIsNone(result.position_px)
        self.aux.candidates = []
        self.assertIsNone(self.step().position_px)
        self.assertEqual(self.tracker.state, TrackingState.LOST)

    def test_confirmed_auxiliary_and_temporal_provenance(self):
        self.lose()
        self.aux.candidates = [AuxiliaryCandidate(52, 50, 0.9)]
        self.step()
        result = self.step()
        self.assertEqual(result.state, 'observed')
        self.assertEqual(result.source, 'auxiliary_detector')
        self.provider.confidence = 1
        self.assertEqual(self.step().source, 'temporal_tracker')
        event = self.tracker.metrics()['events'][-1]
        self.assertEqual(event['reacquisitionSource'], 'auxiliary_detector')
        self.assertAlmostEqual(event['lostDuration'], 2/30)
        self.assertEqual(event['reacquisitionTime'], event['lostDuration'])

    def test_local_search_eventually_becomes_full_frame(self):
        self.lose()
        self.assertIsNotNone(self.aux.regions[-1])
        for _ in range(12):
            self.step()
        self.assertIsNone(self.aux.regions[-1])

    def test_initial_auxiliary_lock_requires_confirmation(self):
        self.provider.confidence = 0
        self.aux.candidates = [AuxiliaryCandidate(20, 20, 0.8)]
        self.assertEqual(self.step().state, 'unknown')
        self.assertEqual(self.step().source, 'auxiliary_detector')

    def test_temporal_reacquisition_requires_confirmation(self):
        self.lose()
        self.provider.confidence = 1
        self.assertIsNone(self.step().position_px)
        self.assertEqual(self.step().state, 'observed')

    def test_invalid_auxiliary_output_is_rejected(self):
        self.provider.confidence = 0
        self.aux.candidates = [AuxiliaryCandidate(float('nan'), 1, 1), AuxiliaryCandidate(500, 1, 1)]
        for _ in range(4):
            self.assertIsNone(self.step().position_px)
        self.assertEqual(self.tracker.reacquisition_attempts, 0)

    def test_end_stream_and_input_order(self):
        self.step()
        with self.assertRaises(ValueError):
            self.step(timestamp=0)
        self.tracker.end_stream()
        with self.assertRaises(ValueError):
            self.step()

    def test_invalid_configuration(self):
        for kwargs in ({'confirmation_frames': 1}, {'prediction_seconds': -1}, {'confidence_threshold': float('nan')}):
            with self.assertRaises(ValueError):
                RecoveryConfig(**kwargs)

    def test_motion_inconsistent_temporal_candidate_is_weak(self):
        self.lock()
        self.tracker.config = RecoveryConfig(max_speed_px_sec=1, position_tolerance_px=1)
        self.provider.x = 0
        result = self.step()
        self.assertEqual(self.tracker.state, TrackingState.WEAK)
        self.assertNotEqual(result.state, 'observed')

    def test_gap_breaks_confirmation_sequence(self):
        self.provider.confidence = 0
        self.aux.candidates = [AuxiliaryCandidate(20, 20, 0.9)]
        self.step()
        self.index += 2
        self.assertIsNone(self.step().position_px)
        self.assertEqual(self.step().state, 'observed')


if __name__ == '__main__':
    unittest.main()
