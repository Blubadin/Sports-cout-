"""Server-side restrictions for the association pilot distribution."""
import os
import re


def is_pilot_release() -> bool:
    return os.getenv("SPORTSCOUT_RELEASE_CHANNEL", "development").strip().lower() == "pilot"


def export_is_restricted(path: str) -> bool:
    return is_pilot_release() and (
        path.startswith("/api/tracking/exports/")
        or re.fullmatch(r"/api/tracking/sessions/[^/]+/export/?", path) is not None
    )
