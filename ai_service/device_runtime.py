"""Runtime accelerator detection shared by the tracking service and diagnostics."""

from __future__ import annotations

from typing import Any
import hashlib
import logging
from pathlib import Path
from importlib.metadata import version, PackageNotFoundError


def _load_torch() -> Any:
    try:
        import torch
        return torch
    except Exception:
        return None


def _availability(torch_module: Any) -> tuple[bool, bool]:
    if torch_module is None:
        return False, False
    try:
        cuda_available = bool(torch_module.cuda.is_available())
    except Exception:
        cuda_available = False
    try:
        mps_available = bool(torch_module.backends.mps.is_available())
    except Exception:
        mps_available = False
    return cuda_available, mps_available


_SENTINEL = object()


def resolve_device(requested: str | None = None, *, torch_module: Any = _SENTINEL) -> str:
    """Select an available device; adapters must still validate execution."""
    torch_module = _load_torch() if torch_module is _SENTINEL else torch_module
    cuda_available, mps_available = _availability(torch_module)
    choice = (requested or "auto").strip().lower()
    if choice == "auto":
        if cuda_available:
            return "cuda"
        return "cpu"
    if choice not in {"cuda", "mps", "cpu"}:
        raise ValueError(f"Unsupported tracking device: {requested}")
    if choice == "cuda" and not cuda_available:
        return "cpu"
    if choice == "mps" and not mps_available:
        raise ValueError("Requested mps device is unavailable")
    return choice


class InferenceExecutionError(RuntimeError):
    """Terminal provider failure, including a failed CPU fallback."""


class InferenceExecution:
    """Small adapter-local execution record, using the existing device selector.

    The callable must be inference-only: never retry tracking/identity updates.
    Adapters own their model and immutable input; no models are managed here.
    """

    def __init__(self, requested='cpu', *, backend='pytorch', precision='fp32'):
        self.requested = requested or 'auto'
        self.device = resolve_device(self.requested)
        self.backend = backend
        self.precision = precision
        self.status = 'PENDING'
        self.fallback_reason = None
        if self.requested in ('auto', 'cuda') and self.device == 'cpu':
            self._warn('CUDA unavailable; CPU selected')

    def _warn(self, reason):
        self.fallback_reason = reason
        logging.getLogger(__name__).warning('%s', reason)

    def run(self, operation, *, stage='inference'):
        if self.status == 'ERROR':
            raise InferenceExecutionError('Inference provider is in terminal ERROR state')
        try:
            result = operation(self.device)
        except Exception as error:
            if self.device != 'cuda':
                self.status = 'ERROR'
                raise InferenceExecutionError(f'{self.device} {stage} failed ({type(error).__name__})') from error
            self._warn(f'CUDA {stage} failed ({type(error).__name__}); retrying identical input on CPU')
            self.device = 'cpu'
            try:
                result = operation('cpu')
            except Exception as cpu_error:
                self.status = 'ERROR'
                raise InferenceExecutionError(f'CPU fallback {stage} failed ({type(cpu_error).__name__})') from cpu_error
        if stage == 'inference':
            self.status = 'READY'
        return result

    def provenance(self):
        return {
            'requestedDevice': self.requested, 'effectiveDevice': self.device,
            'device': self.device, 'backend': self.backend, 'precision': self.precision,
            'fallbackReason': self.fallback_reason, 'executionStatus': self.status,
        }


def artifact_sha256(path):
    artifact = Path(path)
    if not artifact.is_file():
        return None
    with artifact.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def package_version(package):
    try:
        return version(package)
    except PackageNotFoundError:
        return None


def capability_report(*, requested: str | None = None, torch_module: Any = _SENTINEL) -> dict[str, Any]:
    torch_module = _load_torch() if torch_module is _SENTINEL else torch_module
    cuda_available, mps_available = _availability(torch_module)
    selected = resolve_device(requested, torch_module=torch_module)
    version = getattr(torch_module, "__version__", None) if torch_module is not None else None
    return {
        "selectedDevice": selected,
        "requestedDevice": requested or "auto",
        "fallbackReason": 'CUDA unavailable; CPU selected' if selected == 'cpu' and (requested or 'auto') in ('auto', 'cuda') else None,
        "executionValidated": False,
        "cudaAvailable": cuda_available,
        "mpsAvailable": mps_available,
        "torchVersion": version,
    }
