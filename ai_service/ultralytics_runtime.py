"""Ultralytics inference seam. ByteTrack callbacks are never replayed.

Only setup, preprocessing, tensor inference and postprocessing may retry. The
vendor invokes MOT updates after postprocessing, once per input frame. A fresh
CPU backend retains the SAME predictor and its tracker objects/counters.
"""
from copy import deepcopy


def precision_options(precision):
    from ultralytics.cfg import DEFAULT_CFG_DICT
    if 'quantize' in DEFAULT_CFG_DICT:
        return {'quantize': 16 if precision == 'fp16' else None}
    return {'half': precision == 'fp16'}


def runtime_predictor(base, execution):
    class RuntimePredictor(base):
        def setup_model(self, model, verbose=True):
            # Preserve pristine CPU weights before vendor fusion/device transfers.
            self._runtime_source = deepcopy(model).cpu() if hasattr(model, 'cpu') else model
            self._backend_device = None

            def setup(device):
                self.args.device = device
                super(RuntimePredictor, self).setup_model(self._runtime_source, verbose=verbose)
                if hasattr(self.model, 'fp16') and bool(self.model.fp16) != (execution.precision == 'fp16'):
                    raise ValueError('Provider changed requested precision')
                self._backend_device = device
                # Warmup is also inference and occurs before MOT observations.
                warmup = self.model.warmup

                def guarded_warmup(*args, **kwargs):
                    def run(target):
                        if target != self._backend_device:
                            self._cpu_backend()
                            if 'im' in kwargs:
                                kwargs['im'] = self._canonical_tensor
                            return self.model.warmup(*args, **_move(kwargs, target))
                        return warmup(*args, **kwargs)
                    return execution.run(run, stage='warmup')
                self.model.warmup = guarded_warmup

            execution.run(setup, stage='initialization')

        def _cpu_backend(self):
            # setup_model preserves trackers, vid_path and callback registration.
            self.setup_model(self._runtime_source, verbose=False)

        def _on_device(self, device):
            if device != self._backend_device:
                self._cpu_backend()

        def preprocess(self, images):
            def run(device):
                self._on_device(device)
                tensor = super(RuntimePredictor, self).preprocess(images)
                self._canonical_tensor = tensor.detach().cpu()
                return tensor
            return execution.run(run, stage='preprocessing')

        def inference(self, tensor, *args, **kwargs):
            # Keep a CPU canonical tensor before CUDA execution can fail.
            canonical = self._canonical_tensor
            def run(device):
                self._on_device(device)
                return super(RuntimePredictor, self).inference(canonical.to(device), *args, **kwargs)
            return execution.run(run)

        def postprocess(self, predictions, tensor, originals, **kwargs):
            original_device = self._backend_device
            def run(device):
                self._on_device(device)
                current = predictions
                if device != original_device:
                    current = self.inference(self._canonical_tensor)
                return super(RuntimePredictor, self).postprocess(
                    _move(current, device), self._canonical_tensor.to(device), originals, **kwargs)
            return execution.run(run, stage='postprocessing')

    return RuntimePredictor


def _move(value, device):
    if isinstance(value, dict):
        return {key: _move(item, device) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_move(item, device) for item in value)
    return value.to(device) if hasattr(value, 'to') else value
