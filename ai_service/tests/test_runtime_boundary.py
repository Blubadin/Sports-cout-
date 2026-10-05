"""Fault injection is not hardware validation. Inputs never enter persistence."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from device_runtime import InferenceExecution, InferenceExecutionError


class RuntimeBoundaryTests(unittest.TestCase):
    def test_same_input_is_retried_once_and_cpu_is_sticky(self):
        with patch('device_runtime.resolve_device', return_value='cuda'):
            runtime = InferenceExecution('auto')
        attempts = []
        canonical_input = object()

        def infer(device):
            attempts.append((device, canonical_input))
            if device == 'cuda':
                raise RuntimeError('injected accelerator loss')
            return 42

        self.assertEqual(runtime.run(infer), 42)
        self.assertEqual(runtime.run(infer), 42)
        self.assertEqual([d for d, _ in attempts], ['cuda', 'cpu', 'cpu'])
        self.assertTrue(all(value is canonical_input for _, value in attempts))
        self.assertEqual(runtime.provenance()['effectiveDevice'], 'cpu')
        self.assertEqual(runtime.provenance()['executionStatus'], 'READY')
        self.assertIn('RuntimeError', runtime.provenance()['fallbackReason'])

    def test_cpu_failure_is_terminal_not_successful_fallback(self):
        with patch('device_runtime.resolve_device', return_value='cuda'):
            runtime = InferenceExecution('cuda')
        with self.assertRaises(InferenceExecutionError):
            runtime.run(lambda device: (_ for _ in ()).throw(ValueError(device)))
        self.assertEqual(runtime.provenance()['executionStatus'], 'ERROR')

    def test_unavailable_cuda_has_warning_before_inference(self):
        with patch('device_runtime.resolve_device', return_value='cpu'):
            runtime = InferenceExecution('cuda')
        self.assertEqual(runtime.provenance()['requestedDevice'], 'cuda')
        self.assertIn('unavailable', runtime.provenance()['fallbackReason'])

    def test_predictor_midrun_failure_keeps_mot_state_and_updates_once(self):
        from ultralytics_runtime import runtime_predictor
        import torch
        with patch('device_runtime.resolve_device', return_value='cuda'):
            runtime = InferenceExecution('auto')
        attempts = []

        class Tensor:
            def to(self, device):
                return self
            def cpu(self):
                return self
            def detach(self):
                return self

        class Predictor:
            def setup_model(self, model, verbose=True):
                self.model = SimpleNamespace(warmup=lambda **kw: None)
            def preprocess(self, images):
                return Tensor()
            def inference(self, tensor):
                attempts.append((self.args.device, self.frame))
                if self.frame == 1 and self.args.device == 'cuda':
                    raise RuntimeError('injected midrun failure')
                return tensor
            def postprocess(self, predictions, tensor, originals):
                return predictions

        predictor = runtime_predictor(Predictor, runtime)()
        predictor.args = SimpleNamespace(device='cuda')
        predictor.trackers = [SimpleNamespace(frame_id=0, track_id=71)]
        tracker = predictor.trackers[0]
        with patch('ultralytics_runtime._synchronize_device'):
            predictor.setup_model('local-model')
            for index in range(3):
                predictor.frame = index
                tensor = predictor.preprocess([index])
                predictor.model.warmup(im=tensor)
                output = predictor.inference(tensor)
                predictor.postprocess(output, tensor, [index])
                # Vendor callback runs after all retryable computation.
                tracker.frame_id += 1
        self.assertIs(predictor.trackers[0], tracker)
        self.assertEqual(tracker.frame_id, 3)
        self.assertEqual(tracker.track_id, 71)
        self.assertEqual(attempts, [('cuda', 0), ('cuda', 1), ('cpu', 1), ('cpu', 2)])

    def test_cuda_synchronize_failure_retries_before_tracking_callback(self):
        from ultralytics_runtime import runtime_predictor
        import torch
        with patch('device_runtime.resolve_device', return_value='cuda'):
            runtime = InferenceExecution('auto')
        attempts = []
        sync_devices = []

        class Tensor:
            def to(self, device):
                return self
            def cpu(self):
                return self
            def detach(self):
                return self

        class Predictor:
            def setup_model(self, model, verbose=True):
                self.model = SimpleNamespace(warmup=lambda **kw: None)
            def preprocess(self, images):
                return Tensor()
            def inference(self, tensor):
                attempts.append((self.args.device, self.frame))
                return tensor
            def postprocess(self, predictions, tensor, originals):
                return predictions

        def synchronize(device):
            sync_devices.append(str(device))
            # setup and warmup syncs pass; the first inference sync reports the
            # asynchronous CUDA failure before Ultralytics' tracker callback.
            if str(device).startswith('cuda') and sync_devices.count(str(device)) == 3:
                raise RuntimeError('injected CUDA profiler synchronization failure')

        predictor = runtime_predictor(Predictor, runtime)()
        predictor.args = SimpleNamespace(device='cuda')
        predictor.frame = 0
        predictor.trackers = [SimpleNamespace(frame_id=0, track_id=71)]
        tracker = predictor.trackers[0]
        with patch('ultralytics_runtime._synchronize_device', side_effect=synchronize, create=True):
            predictor.setup_model('local-model')
            self.assertEqual(predictor.device.type, 'cpu')
            tensor = predictor.preprocess([0])
            predictor.model.warmup(im=tensor)
            output = predictor.inference(tensor)
            predictor.postprocess(output, tensor, [0])
            # Ultralytics advances MOT once, only after all guarded stages pass.
            tracker.frame_id += 1

        self.assertEqual(attempts, [('cuda', 0), ('cpu', 0)])
        self.assertEqual(runtime.device, 'cpu')
        self.assertEqual(runtime.provenance()['executionStatus'], 'READY')
        self.assertIn('RuntimeError', runtime.provenance()['fallbackReason'])
        self.assertEqual(tracker.frame_id, 1)
        self.assertEqual(tracker.track_id, 71)
        self.assertEqual(sync_devices, ['cuda', 'cuda', 'cuda', 'cpu', 'cpu', 'cpu'])

    def test_temporal_retry_does_not_duplicate_or_skip_observations(self):
        from ai_service.shuttle_tracker import ShuttleTrackerProvider, TemporalModelOutput
        from ai_service.shuttle_pipeline import ProductionShuttlePipeline, ShuttlePipelineConfig
        with patch('device_runtime.resolve_device', return_value='cuda'):
            runtime = InferenceExecution('auto')
        windows = []

        class Provider(ShuttleTrackerProvider):
            def infer(self, frames):
                def run(device):
                    windows.append((device, tuple(f.frame_index for f in frames)))
                    if device == 'cuda':
                        raise RuntimeError('injected')
                    heatmap = np.zeros((6, 8), dtype=np.float32)
                    heatmap[3, 4] = 1
                    return TemporalModelOutput(heatmap)
                return runtime.run(run)

        pipeline = ProductionShuttlePipeline(ShuttlePipelineConfig(enabled=True, recovery_enabled=False), Provider())
        observations = [pipeline.process_frame(np.zeros((6, 8, 3), np.uint8), i/30, i) for i in range(5)]
        self.assertEqual([o.frame_index for o in observations], list(range(5)))
        self.assertEqual(windows, [('cuda', (0, 1, 2)), ('cpu', (0, 1, 2)), ('cpu', (1, 2, 3)), ('cpu', (2, 3, 4))])
        self.assertEqual(pipeline.get_provenance()['observedCount'], 3)

    def test_terminal_shuttle_cpu_failure_stops_job(self):
        from ai_service.shuttle_tracker import ShuttleTrackerProvider
        from ai_service.shuttle_pipeline import ProductionShuttlePipeline, ShuttlePipelineConfig
        class Provider(ShuttleTrackerProvider):
            def infer(self, frames):
                raise InferenceExecutionError('CPU failure')
        pipeline = ProductionShuttlePipeline(ShuttlePipelineConfig(enabled=True), Provider())
        with self.assertRaises(InferenceExecutionError):
            for i in range(3):
                pipeline.process_frame(np.zeros((6, 8, 3), np.uint8), i/30, i)
        self.assertEqual(pipeline.status, 'ERROR')
        self.assertEqual(pipeline.get_provenance()['lostCount'], 0)

    def test_rallylens_recreation_keeps_nine_frame_tensor_and_latest_map(self):
        import torch
        from ai_service.rallylens_adapter import RallyLensTemporalModelAdapter
        from ai_service.shuttle_tracker import TemporalFrame
        with patch('device_runtime.resolve_device', return_value='cuda'):
            adapter = RallyLensTemporalModelAdapter('injected.pth', device='auto')
        loaded = []
        tensors = []
        class Model:
            def to(self, device):
                if device == 'cuda':
                    raise RuntimeError('injected initialization failure')
                return self
            def __call__(self, tensor):
                tensors.append(tensor.numpy().copy())
                output = torch.zeros((1, 8, 288, 512), dtype=torch.float32)
                output[0, 7, 20, 40] = 1
                return output
        def load():
            if adapter._model is None:
                adapter._model = Model()
                loaded.append(adapter._model)
            return adapter._model
        adapter.load = load
        frames = tuple(TemporalFrame(np.full((6, 8, 3), i, np.uint8), i/30, i) for i in range(9))
        output = adapter.infer(frames)
        self.assertEqual(len(loaded), 2)
        self.assertEqual(tensors[0].shape, (1, 27, 288, 512))
        self.assertEqual(float(output.probability_map[20, 40]), 1)
        self.assertEqual(adapter.inference_calls, 1)
        self.assertEqual(adapter.execution.device, 'cpu')

    def test_session_exports_provider_provenance_after_fallback(self):
        import server
        session = server.TrackingSession('runtime-provenance', processing_config={'device': 'cuda'})
        provenance = {
            'requestedDevice': 'cuda', 'effectiveDevice': 'cpu', 'backend': 'pytorch',
            'runtimeVersion': 'test', 'precision': 'fp32', 'modelSha256': 'a' * 64,
            'preprocessVersion': 'pre-v1', 'postprocessVersion': 'post-v1',
            'fallbackReason': 'CUDA inference failed; CPU selected',
        }
        session.analyzer.detector_adapter = SimpleNamespace(model_name='local.pt', get_provenance=lambda: provenance)
        session.analyzer.device = 'cpu'
        _, _, result = server._build_session_metrics(session)
        self.assertEqual(result['requestedDevice'], 'cuda')
        self.assertEqual(result['effectiveDevice'], 'cpu')
        self.assertEqual(result['inferenceProviders']['detector'], provenance)


if __name__ == '__main__':
    unittest.main()
