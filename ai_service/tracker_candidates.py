"""Small, explicit tracker candidate registry for Phase 1.5 benchmarks.

This registry intentionally describes raw MOT choices only.  It does not
participate in SportsScout semantic player identity assignment.
"""

from __future__ import annotations

from dataclasses import dataclass

from engine_config import InvalidEngineConfigError


@dataclass(frozen=True)
class TrackerCandidate:
    """A benchmarkable raw tracker configuration with honest provenance."""

    id: str
    display_name: str
    tracker_name: str
    tracker_config: str | None
    reid_enabled: bool
    reid_model: str | None
    baseline: bool = False


PHASE_1_TRACKER_CANDIDATES: dict[str, TrackerCandidate] = {
    "bytetrack": TrackerCandidate(
        id="bytetrack",
        display_name="ByteTrack",
        tracker_name="bytetrack",
        tracker_config=None,
        reid_enabled=False,
        reid_model=None,
        baseline=True,
    ),
    "botsort": TrackerCandidate(
        id="botsort",
        display_name="BoT-SORT",
        tracker_name="botsort",
        tracker_config="botsort.yaml",
        reid_enabled=False,
        reid_model=None,
    ),
    "botsort_reid": TrackerCandidate(
        id="botsort_reid",
        display_name="BoT-SORT + ReID",
        tracker_name="botsort",
        tracker_config="botsort.yaml",
        reid_enabled=True,
        reid_model="spatial_multi_zone_v1",
    ),
}


def get_tracker_candidate(candidate_id: str) -> TrackerCandidate:
    """Resolve a registered raw tracker candidate without any fallback."""
    raw = candidate_id.strip().lower()
    if raw in PHASE_1_TRACKER_CANDIDATES:
        return PHASE_1_TRACKER_CANDIDATES[raw]
    normalized = raw.replace("-", "").replace("_", "")
    for candidate in PHASE_1_TRACKER_CANDIDATES.values():
        if normalized == candidate.id.replace("-", "").replace("_", ""):
            return candidate
    for candidate in PHASE_1_TRACKER_CANDIDATES.values():
        if normalized == candidate.tracker_name.replace("-", "").replace("_", "") and not candidate.reid_enabled:
            return candidate

    raise InvalidEngineConfigError(
        f"Unknown tracker candidate: '{candidate_id}'. "
        f"Registered candidates: {list(PHASE_1_TRACKER_CANDIDATES)}"
    )


def get_baseline_tracker_candidate() -> TrackerCandidate:
    """Return the production-compatible ByteTrack benchmark baseline."""
    return PHASE_1_TRACKER_CANDIDATES["bytetrack"]


def list_tracker_candidates() -> list[TrackerCandidate]:
    """Return candidates in deterministic benchmark order."""
    return list(PHASE_1_TRACKER_CANDIDATES.values())
