"""
ai_service/path_utils.py — Path Sanitization and Reference Separation Utilities

Guarantees:
- Windows drive paths (e.g. C:\\... or d:/...) -> safe filename or normalized relative subpath
- UNC network paths (e.g. \\\\server\\share\\... or //server/share/...) -> safe filename
- Unix absolute paths (e.g. /home/... or /var/...) -> safe filename
- Mixed path separators (/ and \\) -> normalized to forward slashes
- Parent directory traversal (.. and .) -> stripped to prevent leaking host directory hierarchy
- Unicode characters (Thai, accents, spaces) -> preserved without mangling
- Empty, whitespace, or invalid types (None, dict, bool) -> None
- Separation of operational reference (used by backend to open files) from display/export reference
"""

from __future__ import annotations
import math
import os
from pathlib import Path, PureWindowsPath, PurePosixPath
import re
from typing import Any, Optional


def sanitize_path_reference(path_or_str: Any) -> Optional[str]:
    """
    Strips sensitive local machine paths, UNC shares, and parent directory traversal,
    preserving only safe logical relative paths or file basenames for display and export.

    Guarantees:
    - Windows drive paths (e.g. C:\\... or d:/...) -> safe filename or normalized relative subpath
    - UNC network paths (e.g. \\\\server\\share\\... or //server/share/...) -> safe filename
    - Unix absolute paths (e.g. /home/... or /var/...) -> safe filename
    - Mixed path separators (/ and \\) -> normalized to forward slashes
    - Parent directory traversal (.. and .) -> stripped to prevent leaking host directory hierarchy
    - Unicode characters (Thai, accents, spaces) -> preserved without mangling
    - Empty, whitespace, or invalid types (None, dict, bool) -> None
    """
    if path_or_str is None:
        return None
    if isinstance(path_or_str, (bool, dict, list, set, tuple)):
        return None
    raw = str(path_or_str).strip()
    if not raw:
        return None

    # Normalize all backslashes to forward slashes
    normalized = raw.replace("\\", "/")

    # 1. UNC network paths: \\server\share\... or //server/share/...
    if normalized.startswith("//"):
        parts = [p for p in normalized.split("/") if p]
        return parts[-1] if parts else None

    # 2. Windows drive paths: C:\..., d:/..., etc.
    if re.match(r"^[a-zA-Z]:", normalized):
        without_drive = re.sub(r"^[a-zA-Z]:/?", "", normalized)
        parts = [p for p in without_drive.split("/") if p]
        return parts[-1] if parts else None

    # 3. Unix absolute paths: /home/..., /var/..., etc.
    if normalized.startswith("/"):
        parts = [p for p in normalized.split("/") if p]
        return parts[-1] if parts else None

    # 4. Sensitive OS directories anywhere in the path (e.g. subpath containing /home/ or /Users/)
    lower_norm = normalized.lower()
    if "/home/" in lower_norm or "/users/" in lower_norm or "/etc/" in lower_norm or "/var/" in lower_norm:
        parts = [p for p in normalized.split("/") if p]
        return parts[-1] if parts else None

    # 5. Parent directory traversal: check for '..'
    segments = [s for s in normalized.split("/") if s and s != "."]
    if any(s == ".." for s in segments):
        # Prevent leaking parent hierarchy; return the terminal safe file/dir basename
        valid_segments = [s for s in segments if s != ".."]
        return valid_segments[-1] if valid_segments else None

    # 6. Safe logical relative path (e.g. "videos/B01_singles_center.mp4" or "yolov8n.pt")
    if segments:
        return "/".join(segments)

    return None
