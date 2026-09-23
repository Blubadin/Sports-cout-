"""Contract and opt-in real artifact tests for the locally audited checkpoint."""

import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from ai_service.shuttle_pipeline import create_shuttle_pipeline, ShuttlePipelineConfig


class RallyLensContractTests(unittest.TestCase):
    def test_named_adapter_defaults_to_verified_contract(self):
        config = ShuttlePipelineConfig.from_dict({'shuttle_provider': 'rallylens_tracknet'})
        self.assertEqual(config.window_size, 9)
        self.assertEqual(config.runtime, 'pytorch')
        self.assertEqual(config.device, 'cpu')

    def test_incompatible_explicit_contract_is_rejected(self):
        for key, value in [('shuttle_window_size', 3), ('shuttle_input_width', 640),
                           ('shuttle_input_height', 512), ('shuttle_precision', 'fp16'),
                           ('shuttle_runtime', 'opencv_dnn'), ('shuttle_device', 'cuda')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                ShuttlePipelineConfig.from_dict({'shuttle_provider': 'rallylens_tracknet', key: value})

    def test_missing_checkpoint_is_model_unavailable(self):
        pipeline = create_shuttle_pipeline({'shuttle_enabled': True, 'shuttle_provider': 'rallylens_tracknet',
                                           'shuttle_model_path': 'absent-checkpoint.pth'})
        self.assertEqual(pipeline.status, 'MODEL_UNAVAILABLE')
        self.assertFalse(pipeline.is_active)

    def test_unverified_weights_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'wrong.pth'
            path.touch()
            pipeline = create_shuttle_pipeline({'shuttle_enabled': True, 'shuttle_provider': 'rallylens_tracknet',
                                               'shuttle_model_path': str(path)})
            self.assertFalse(pipeline.is_active)
            self.assertEqual(pipeline.status, 'INITIALIZATION_ERROR')

    def test_production_rejects_frame_skipping_for_fixed_temporal_contract(self):
        import server
        with self.assertRaises(ValueError):
            server.resolve_processing_config({'shuttle_enabled': True, 'shuttle_provider': 'rallylens_tracknet',
                                              'frameStride': 2}, runtime_device='cpu')

    def test_preprocessing_uses_rgb_chronological_channels_and_divides_255(self):
        self.assertIsNotNone(importlib.util.find_spec('ai_service.rallylens_adapter'))
        from ai_service.rallylens_adapter import prepare_rallylens_input
        from ai_service.shuttle_tracker import TemporalFrame
        frames = [TemporalFrame(np.full((8, 8, 3), [i, 20, 200], dtype=np.uint8), i / 30, i)
                  for i in range(9)]
        tensor = prepare_rallylens_input(frames)
        self.assertEqual(tensor.shape, (1, 27, 288, 512))
        self.assertEqual(tensor.dtype, np.float32)
        np.testing.assert_allclose(tensor[0, :3, 0, 0], [200/255, 20/255, 0])
        np.testing.assert_allclose(tensor[0, -3:, 0, 0], [200/255, 20/255, 8/255])
        with self.assertRaises(ValueError):
            prepare_rallylens_input(frames[:3])
        with self.assertRaises(ValueError):
            prepare_rallylens_input(list(reversed(frames)))

    def test_coordinates_follow_local_reference_scaling(self):
        from ai_service.rallylens_adapter import RallyLensTemporalModelAdapter
        adapter = RallyLensTemporalModelAdapter('absent.pth')
        self.assertEqual(adapter.scale_coordinate(256, 512, 1920), 960)
        self.assertEqual(adapter.scale_coordinate(144, 288, 1080), 540)


@unittest.skipUnless(os.getenv('SPORTSCOUT_TEST_SHUTTLE_MODEL') and os.getenv('SPORTSCOUT_TEST_REAL_VIDEO'),
                     'Real local shuttle model/video paths must be supplied explicitly')
class RealRallyLensTests(unittest.TestCase):
    def test_production_uploaded_session_invokes_real_model(self):
        import torch
        import server
        from fastapi.testclient import TestClient
        previous_threads = torch.get_num_threads()
        torch.set_num_threads(4)
        self.addCleanup(torch.set_num_threads, previous_threads)
        capture = cv2.VideoCapture(os.environ['SPORTSCOUT_TEST_REAL_VIDEO'])
        self.addCleanup(capture.release)
        fps = capture.get(cv2.CAP_PROP_FPS)
        self.assertGreater(fps, 0)
        frames = []
        for _ in range(10):
            ok, frame = capture.read()
            self.assertTrue(ok)
            frames.append(frame)
        height, width = frames[0].shape[:2]
        with tempfile.TemporaryDirectory() as folder:
            clip = Path(folder) / 'real-decoded-frames.avi'
            writer = cv2.VideoWriter(str(clip), cv2.VideoWriter_fourcc(*'MJPG'), fps, (width, height))
            self.assertTrue(writer.isOpened())
            try:
                for frame in frames:
                    writer.write(frame)
            finally:
                writer.release()
            client = TestClient(server.app)
            response = client.post('/api/tracking/sessions', json={
                'video_source': 'upload', 'game_type': 'singles', 'device': 'cpu',
                'processing_config': {
                    'frameStride': 1, 'shuttle_enabled': True, 'shuttle_provider': 'rallylens_tracknet',
                    'shuttle_model_path': os.environ['SPORTSCOUT_TEST_SHUTTLE_MODEL'],
                    'shuttle_recovery_enabled': False,
                },
            })
            self.assertEqual(response.status_code, 200, response.text)
            sid = response.json()['sessionId']
            self.addCleanup(client.delete, f'/api/tracking/sessions/{sid}')
            response = client.post(f'/api/tracking/sessions/{sid}/video?filename=real-clip.avi', content=clip.read_bytes())
            self.assertEqual(response.status_code, 200, response.text)
            # Image boundary calibration is an infrastructure smoke test only;
            # these are NOT surveyed court corners or valid tactical metrics.
            response = client.post(f'/api/tracking/sessions/{sid}/calibration', json={
                'game_type': 'singles', 'corners': [[0, 0], [width-1, 0], [width-1, height-1], [0, height-1]],
            })
            self.assertEqual(response.status_code, 200, response.text)
            response = client.post(f'/api/tracking/sessions/{sid}/start')
            self.assertEqual(response.status_code, 200, response.text)
            session = server.tracking_sessions[sid]
            session._thread.join(timeout=120)
            self.assertFalse(session._thread.is_alive(), 'Real production smoke test timed out')
            results = client.get(f'/api/tracking/sessions/{sid}/results').json()
            self.assertEqual(results['status'], 'COMPLETED', session.error_message)
            self.assertEqual(results['sampleCount'], 10)
            self.assertTrue(all(item['source'] == 'real_tracking' and not item['isSynthetic']
                                for item in results['telemetry']))
            provenance = results['shuttle']
            self.assertEqual(provenance['provider'], 'rallylens_tracknet')
            self.assertTrue(provenance['modelLoaded'])
            self.assertGreater(provenance['inferenceCalls'], 0)
            self.assertEqual(provenance['inferenceCalls'], provenance['candidateExtractionCalls'])
            self.assertTrue(provenance['outputTensorReceived'])
            self.assertEqual(provenance['lastOutputShape'], [1, 8, 288, 512])
            print('REAL_PRODUCTION_SHUTTLE_REPORT=' + json.dumps(provenance, sort_keys=True))
            observed = sum(item.get('shuttle', {}).get('state') == 'observed' for item in results['telemetry'])
            print(f'REAL_PRODUCTION_OBSERVED_CANDIDATES={observed}')

    def test_real_forward_candidate_extraction_and_canonical_observation(self):
        import torch
        previous_threads = torch.get_num_threads()
        torch.set_num_threads(4)
        self.addCleanup(torch.set_num_threads, previous_threads)
        pipeline = create_shuttle_pipeline({
            'shuttle_enabled': True, 'shuttle_provider': 'rallylens_tracknet',
            'shuttle_model_path': os.environ['SPORTSCOUT_TEST_SHUTTLE_MODEL'],
            'shuttle_recovery_enabled': False,
        })
        self.assertEqual(pipeline.status, 'AVAILABLE', pipeline.failure_reason)
        capture = cv2.VideoCapture(os.environ['SPORTSCOUT_TEST_REAL_VIDEO'])
        self.addCleanup(capture.release)
        fps = capture.get(cv2.CAP_PROP_FPS)
        self.assertGreater(fps, 0)
        for index in range(9):
            ok, frame = capture.read()
            self.assertTrue(ok)
            observation = pipeline.process_frame(frame, index / fps, index)
        provenance = pipeline.get_provenance()
        self.assertEqual(provenance['inferenceCalls'], 1)
        self.assertEqual(provenance['candidateExtractionCalls'], 1)
        self.assertEqual(provenance['lastOutputShape'], [1, 8, 288, 512])
        self.assertTrue(provenance['outputTensorReceived'])
        self.assertEqual(provenance['runtime'], 'pytorch')
        self.assertEqual(observation.frame_index, 8)
        # No assertion invents a detected shuttle when the genuine model has none.
        self.assertIn(observation.state, ('observed', 'unknown'))
        if observation.state == 'observed':
            self.assertGreaterEqual(observation.confidence, 0.5)
        else:
            self.assertIsNone(observation.position_px)


if __name__ == '__main__':
    unittest.main()
