"""Runtime accelerator detection shared by the tracking service and diagnostics."""

from __future__ import annotations

from typing import Any


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
    """Return ``cuda``, ``mps`` or ``cpu`` and reject unavailable overrides."""
    torch_module = _load_torch() if torch_module is _SENTINEL else torch_module
    cuda_available, mps_available = _availability(torch_module)
    choice = (requested or "auto").strip().lower()
    if choice == "auto":
        if cuda_available:
            return "cuda"
        if mps_available:
            return "mps"
        return "cpu"
    if choice not in {"cuda", "mps", "cpu"}:
        raise ValueError(f"Unsupported tracking device: {requested}")
    if choice == "cuda" and not cuda_available:
        raise ValueError("Requested cuda device is unavailable")
    if choice == "mps" and not mps_available:
        raise ValueError("Requested mps device is unavailable")
    return choice


def capability_report(*, requested: str | None = None, torch_module: Any = _SENTINEL) -> dict[str, Any]:
    torch_module = _load_torch() if torch_module is _SENTINEL else torch_module
    cuda_available, mps_available = _availability(torch_module)
    selected = resolve_device(requested, torch_module=torch_module)
    version = getattr(torch_module, "__version__", None) if torch_module is not None else None
    return {
        "selectedDevice": selected,
        "requestedDevice": requested or "auto",
        "cudaAvailable": cuda_available,
        "mpsAvailable": mps_available,
        "torchVersion": version,
    }
