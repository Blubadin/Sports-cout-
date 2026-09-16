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


def resolve_device(requested: str | None = None, *, torch_module: Any = None) -> str:
    """Return ``cuda``, ``mps`` or ``cpu`` and reject unavailable overrides."""
    torch_module = torch_module if torch_module is not None else _load_torch()
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


def capability_report(*, requested: str | None = None, torch_module: Any = None) -> dict[str, Any]:
    torch_module = torch_module if torch_module is not None else _load_torch()
    cuda_available, mps_available = _availability(torch_module)
    selected = resolve_device(requested, torch_module=torch_module)
    version = getattr(getattr(torch_module, "version", None), "__version__", None)
    return {
        "selectedDevice": selected,
        "requestedDevice": requested or "auto",
        "cudaAvailable": cuda_available,
        "mpsAvailable": mps_available,
        "torchVersion": version,
    }
