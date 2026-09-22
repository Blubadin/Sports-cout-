"""Normalized MOT output boundary for tracker benchmarking.

Raw tracker identifiers are intentionally kept separate from SportsScout's
semantic P1/P2/P3/P4 identity layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TrackerProvenance:
    tracker_name: str
    tracker_config: str | None
    reid_enabled: bool
    reid_model: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "trackerName": self.tracker_name,
            "trackerConfig": self.tracker_config,
            "reidEnabled": self.reid_enabled,
            "reidModel": self.reid_model,
        }


@dataclass(frozen=True)
class NormalizedTrackResult:
    bbox: tuple[float, float, float, float]
    confidence: float
    raw_track_id: int | None
    provenance: TrackerProvenance

    def to_detection(self) -> dict[str, Any]:
        """Return the legacy matcher input without creating a semantic player ID."""
        x1, y1, x2, y2 = self.bbox
        return {
            "bbox": [x1, y1, x2, y2],
            "center": ((x1 + x2) / 2.0, y2),
            "conf": self.confidence,
            "track_id": self.raw_track_id,
            "rawTrackId": self.raw_track_id,
            "trackerProvenance": self.provenance.to_dict(),
        }
