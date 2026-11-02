"""
topology_tracker.py — Court-Side Topology Tracking & Change-of-ends Detection.

Maintains court-side topology (near court vs far court) across gameplay intervals
and sets, detecting change-of-ends transitions using sustained appearance-confirmed
player positions without accumulating false ID switches.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
from court_mapper import COURT_LENGTH_M


@dataclass(frozen=True)
class ChangeOfEndsEvent:
    """Represents a confirmed change-of-ends (court side swap) transition."""
    frame_index: int
    timestamp_sec: float
    side_mapping: dict[int, int]  # playerId -> court_side (1: Far/Top, 2: Near/Bottom)
    reason: str
    change_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "frameIndex": self.frame_index,
            "timestampSec": round(self.timestamp_sec, 3),
            "sideMapping": dict(self.side_mapping),
            "reason": self.reason,
            "changeCount": self.change_count,
        }


class CourtSideTopologyTracker:
    """
    Tracks and validates court-side topology across time.
    Detects when players exchange ends of the court (at 11-point interval or between sets).
    """

    def __init__(
        self,
        game_type: str = "singles",
        max_players: int = 2,
        net_y: float = COURT_LENGTH_M / 2.0,
        min_confirmation_frames: int = 3,
        cooldown_frames: int = 30,
    ):
        self.game_type = game_type
        self.max_players = max_players
        self.net_y = float(net_y)
        self.min_confirmation_frames = max(1, int(min_confirmation_frames))
        self.cooldown_frames = max(1, int(cooldown_frames))

        # Initial side mapping: 1 is Far/Top Court (y < net_y), 2 is Near/Bottom Court (y > net_y)
        self.player_sides: dict[int, int] = {}
        self._init_sides()

        self._inverted_streak = 0
        self._last_switch_frame = -9999
        self.history: list[ChangeOfEndsEvent] = []

    def _init_sides(self) -> None:
        """Initialize default player court sides based on game type."""
        self.player_sides.clear()
        if self.max_players == 1:
            self.player_sides[1] = 1
        elif self.max_players == 2:
            self.player_sides[1] = 1
            self.player_sides[2] = 2
        elif self.max_players == 4:
            self.player_sides[1] = 1
            self.player_sides[2] = 1
            self.player_sides[3] = 2
            self.player_sides[4] = 2
        else:
            for pid in range(1, self.max_players + 1):
                self.player_sides[pid] = 1 if pid <= (self.max_players // 2) else 2

    def reset(self) -> None:
        """Reset topology state."""
        self._init_sides()
        self._inverted_streak = 0
        self._last_switch_frame = -9999
        self.history.clear()

    @property
    def change_count(self) -> int:
        return len(self.history)

    def get_expected_side(self, pid: int) -> int:
        """Return expected court side for a given player ID (1: Top/Far, 2: Bottom/Near)."""
        return self.player_sides.get(pid, 1 if pid == 1 else 2)

    def observe_and_update(
        self,
        profiles: dict[int, Any],
        matched_detections: dict[int, dict[str, Any]],
        frame_index: int,
        timestamp_sec: float,
        is_camera_cut: bool = False,
    ) -> ChangeOfEndsEvent | None:
        """
        Evaluate observed court positions of matched players.
        If an inverted topology is observed with matching appearance across the net,
        confirms change-of-ends, updates profile team sides, and returns a ChangeOfEndsEvent.
        """
        if len(profiles) < 2 or len(matched_detections) < 2:
            self._inverted_streak = 0
            return None

        # Check cooldown to avoid oscillation
        if (frame_index - self._last_switch_frame) < self.cooldown_frames:
            return None

        # Check observed side for each matched player
        observed_sides: dict[int, int] = {}
        for pid, d in matched_detections.items():
            real_pos = d.get("real_pos")
            if real_pos is not None:
                observed_sides[pid] = 1 if real_pos[1] < self.net_y else 2

        # Check if the observed topology is fully inverted from expected sides
        is_inverted = False
        if self.max_players == 2:
            p1_obs = observed_sides.get(1)
            p2_obs = observed_sides.get(2)
            if p1_obs is not None and p2_obs is not None:
                exp_p1 = self.player_sides.get(1, 1)
                exp_p2 = self.player_sides.get(2, 2)
                if p1_obs != exp_p1 and p2_obs != exp_p2 and p1_obs != p2_obs:
                    is_inverted = True
        elif self.max_players >= 4:
            # Check team 1 (p1, p2) vs team 2 (p3, p4)
            team1_pids = [1, 2]
            team2_pids = [3, 4]
            t1_obs = [observed_sides[pid] for pid in team1_pids if pid in observed_sides]
            t2_obs = [observed_sides[pid] for pid in team2_pids if pid in observed_sides]
            if t1_obs and t2_obs:
                t1_all_side2 = all(s == 2 for s in t1_obs)
                t2_all_side1 = all(s == 1 for s in t2_obs)
                if t1_all_side2 and t2_all_side1:
                    is_inverted = True

        if is_inverted:
            self._inverted_streak += 1
            threshold = 1 if is_camera_cut else self.min_confirmation_frames
            if self._inverted_streak >= threshold:
                # Confirm change of ends!
                if self.max_players == 2:
                    old_p1 = self.player_sides.get(1, 1)
                    old_p2 = self.player_sides.get(2, 2)
                    self.player_sides[1] = old_p2
                    self.player_sides[2] = old_p1
                    if 1 in profiles:
                        profiles[1].team = self.player_sides[1]
                    if 2 in profiles:
                        profiles[2].team = self.player_sides[2]
                elif self.max_players >= 4:
                    for pid in (1, 2):
                        self.player_sides[pid] = 2
                        if pid in profiles:
                            profiles[pid].team = 2
                    for pid in (3, 4):
                        self.player_sides[pid] = 1
                        if pid in profiles:
                            profiles[pid].team = 1

                self._last_switch_frame = frame_index
                self._inverted_streak = 0

                event = ChangeOfEndsEvent(
                    frame_index=frame_index,
                    timestamp_sec=timestamp_sec,
                    side_mapping=dict(self.player_sides),
                    reason="appearance_topology_inversion",
                    change_count=self.change_count + 1,
                )
                self.history.append(event)
                return event
        else:
            self._inverted_streak = max(0, self._inverted_streak - 1)

        return None
