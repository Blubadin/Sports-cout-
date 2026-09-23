"""Dedicated CPU/FP32 adapter for one verified local 9-frame/8-map checkpoint."""

import hashlib
from pathlib import Path

import cv2
import numpy as np

try:
    from ai_service.shuttle_tracker import (
        ShuttleTrackerProvider, ProviderAvailability, TemporalModelOutput,
        ModelUnavailableError, ShuttleInferenceError,
    )
except ImportError:
    from shuttle_tracker import (
        ShuttleTrackerProvider, ProviderAvailability, TemporalModelOutput,
        ModelUnavailableError, ShuttleInferenceError,
    )

MODEL_SHA256 = '08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5'
MODEL_BYTES = 45431245
INPUT_SHAPE = (1, 27, 288, 512)
OUTPUT_SHAPE = (1, 8, 288, 512)


def prepare_rallylens_input(frames):
    if len(frames) != 9:
        raise ValueError('RallyLens checkpoint requires exactly 9 consecutive frames')
    channels = []
    for index, frame in enumerate(frames):
        image = frame.image
        if (not isinstance(image, np.ndarray) or image.dtype != np.uint8 or image.ndim != 3
                or image.shape[2] != 3 or min(image.shape[:2]) < 1):
            raise ValueError('RallyLens input must be uint8 BGR frames')
        if index and (frame.frame_index != frames[index - 1].frame_index + 1
                      or frame.timestamp_sec < frames[index - 1].timestamp_sec):
            raise ValueError('RallyLens frames must be consecutive and chronological')
        rgb = cv2.cvtColor(cv2.resize(image, (512, 288), interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
        channels.append((rgb.astype(np.float32) / 255.0).transpose(2, 0, 1))
    return np.ascontiguousarray(np.concatenate(channels, axis=0)[None])


class RallyLensTemporalModelAdapter(ShuttleTrackerProvider):
    """Uses the accompanying local inference code's explicit temporal mapping.

    Output i corresponds to input frame i+1. SportsScout consumes output 7 for
    the latest frame, rather than squeezing/averaging eight different times.
    """

    def __init__(self, model_path):
        self.model_path = Path(model_path)
        self._model = None
        self.inference_calls = 0
        self.output_tensor_received = False
        self.last_output_shape = None
        self.last_output_range = None

    def load(self):
        if self._model is not None:
            return self._model
        if not self.model_path.is_file():
            raise ModelUnavailableError('Verified RallyLens checkpoint is not available locally')
        import torch
        try:
            from ai_service.rallylens_network import RallyLensTrackNet
        except ImportError:
            from rallylens_network import RallyLensTrackNet
        # Pin the exact audited artifact, not just its tensor sizes or filename.
        with self.model_path.open('rb') as stream:
            if self.model_path.stat().st_size != MODEL_BYTES or hashlib.file_digest(stream, 'sha256').hexdigest() != MODEL_SHA256:
                raise ValueError('Checkpoint does not match the audited RallyLens SHA256')
            stream.seek(0)
            state = torch.load(stream, map_location='cpu', weights_only=True)
        model = RallyLensTrackNet()
        model.load_state_dict(state, strict=True)
        model.eval()
        self._model = model
        return model

    def availability(self):
        self.load()
        return ProviderAvailability(True, 'AVAILABLE', 'Verified local RallyLens checkpoint loaded')

    def infer(self, frames):
        import torch
        tensor = prepare_rallylens_input(frames)
        model = self.load()
        self.inference_calls += 1
        try:
            with torch.inference_mode():
                output = model(torch.from_numpy(tensor))
            self.output_tensor_received = True
            self.last_output_shape = list(output.shape)
            if tuple(output.shape) != OUTPUT_SHAPE or output.dtype != torch.float32:
                raise ValueError('RallyLens model output contract mismatch')
            if not torch.isfinite(output).all() or output.min() < 0 or output.max() > 1:
                raise ValueError('RallyLens output must contain finite sigmoid probabilities')
            self.last_output_range = [float(output.min()), float(output.max())]
            return TemporalModelOutput(output[0, 7].numpy().copy())
        except Exception as error:
            raise ShuttleInferenceError('RallyLens temporal inference failed') from error

    def get_provenance(self):
        return {
            'modelName': 'RallyLens TrackNet 9-frame/8-heatmap checkpoint',
            'modelSha256': MODEL_SHA256 if self._model is not None else None,
            'modelLoaded': self._model is not None,
            'runtime': 'pytorch', 'precision': 'fp32', 'device': 'cpu',
            'inputContract': {
                'count': 1, 'name': 'x (PyTorch forward argument; not an ONNX name)',
                'dtype': 'float32', 'shape': list(INPUT_SHAPE), 'dynamicDimensions': False,
                'layout': 'NCHW; 9 RGB frames oldest to newest, concatenated on channels',
                'normalization': 'uint8 / 255; no mean/std; linear resize to 512x288',
            },
            'outputContract': {
                'count': 1, 'name': 'forward return (not an ONNX name)',
                'dtype': 'float32', 'shape': list(OUTPUT_SHAPE), 'dynamicDimensions': False,
                'semantics': '8 sigmoid probability heatmaps; output i maps to input i+1',
                'selectedHeatmap': 7,
                'coordinateScaling': 'x * source_width / 512; y * source_height / 288 (local reference convention)',
                'contractSource': 'local RallyLens inference source; training preprocessing not independently verified',
            },
            'outputTensorReceived': self.output_tensor_received,
            'lastOutputShape': self.last_output_shape,
            'lastOutputRange': self.last_output_range,
        }

    def scale_coordinate(self, value, heatmap_extent, source_extent):
        return float(np.clip(value * source_extent / heatmap_extent, 0, source_extent - 1))
