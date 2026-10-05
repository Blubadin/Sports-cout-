"""
player_eligibility.py — Badminton Player Candidate Eligibility & Court Envelope Gating (Phase 3.3)

Determines whether a person detection is an active player candidate, candidate in excursion,
or disqualified spectator/official based on:
- Court envelope geometry (IN_COURT, NEAR_COURT, FAR_OUTSIDE)
- Canonical foot observation evidence
- Player history & temporal continuity
- Scene state constraints (CLOSE_UP, REPLAY, etc.)
- Expected player count bounds (Singles=2, Doubles=4)

Invariants:
- Outside court is NOT an automatic hard reject (players making excursions/retrievals in NEAR_COURT remain players).
- Expected count is a budget/constraint, NEVER a command to force-fill P1..P4 with spectators/officials.
- If evidence is insufficient, remain UNRESOLVED or CANDIDATE.
- Stale poses cannot fabricate fresh feet.
- Scene state CLOSE_UP / REPLAY / TRANSITION blocks promoting new unknown tracks to player profiles.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import math
from typing import Any, Sequence
import cv2
import numpy as np

from ground_position import CanonicalGroundPoint, CANONICAL_PROVENANCE_BBOX
from scene_lifecycle import SceneState


class CourtEnvelopeZone(str, Enum):
    IN_COURT = "IN_COURT"          # Strictly within court lines (+ boundary line margin)
    NEAR_COURT = "NEAR_COURT"      # Outside court lines but within excursion margin (playing recovery)
    FAR_OUTSIDE = "FAR_OUTSIDE"    # Beyond excursion envelope (spectator, umpire, linesman, audience)


class EligibilityStatus(str, Enum):
    ELIGIBLE = "ELIGIBLE"                           # Active player candidate ready for assignment
    CANDIDATE = "CANDIDATE"                         # Potential player, needs further temporal or spatial confirmation
    SPECTATOR_OR_OFFICIAL = "SPECTATOR_OR_OFFICIAL" # Disqualified non-player (umpire, linesman, audience)
    UNRESOLVED = "UNRESOLVED"                       # Ambiguous observation, cannot promote to player profile


@dataclass(frozen=True)
class CourtEnvelopeConfig:
    """Configurable physical and image-space excursion margins for court envelopes."""
    margin_x_m: float = 2.0         # Lateral excursion margin (badminton court width 5.18m / 6.10m)
    margin_y_m: float = 2.5         # Baseline excursion margin (behind baseline)
    image_margin_px: float = 60.0   # Pixel polygon margin when metric calibration is unavailable
    far_outside_margin_m: float = 3.5  # Distance beyond which an outsider is definitely spectator/official
    min_confidence: float = 0.25    # Minimum detection confidence
    boundary_tolerance_m: float = 0.05  # Line thickness tolerance in meters
    boundary_tolerance_px: float = 5.0  # Line thickness tolerance in pixels


@dataclass
class PlayerEligibility:
    """Complete eligibility evaluation for a single person detection."""
    status: EligibilityStatus
    envelope_zone: CourtEnvelopeZone
    envelope_distance_m: float | None
    envelope_distance_px: float | None
    confidence: float
    reasons: list[str] = field(default_factory=list)
    is_eligible_for_profile: bool = True
    provenance: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "envelopeZone": self.envelope_zone.value,
            "envelopeDistanceM": round(self.envelope_distance_m, 2) if self.envelope_distance_m is not None else None,
            "envelopeDistancePx": round(self.envelope_distance_px, 1) if self.envelope_distance_px is not None else None,
            "confidence": round(self.confidence, 3),
            "reasons": list(self.reasons),
            "isEligibleForProfile": self.is_eligible_for_profile,
            "provenance": dict(self.provenance),
        }


def classify_court_envelope(
    ground_px: tuple[float, float],
    ground_m: tuple[float, float] | None = None,
    court_corners_px: np.ndarray | None = None,
    court_mapper: Any | None = None,
    is_metric_valid: bool = False,
    config: CourtEnvelopeConfig | None = None,
) -> tuple[CourtEnvelopeZone, float | None, float | None]:
    """
    Classify ground position into IN_COURT, NEAR_COURT, or FAR_OUTSIDE.

    Returns:
    - zone: CourtEnvelopeZone
    - envelope_distance_m: signed distance in meters (>= 0 inside court, < 0 outside court)
    - envelope_distance_px: signed distance in pixels (>= 0 inside court, < 0 outside court)
    """
    cfg = config or CourtEnvelopeConfig()
    dist_m: float | None = None
    dist_px: float | None = None

    # 1. Metric evaluation on calibrated court plane
    can_use_metric = bool(is_metric_valid and court_mapper and getattr(court_mapper, "is_calibrated", False) and ground_m is not None)
    if can_use_metric and ground_m is not None:
        gx_m, gy_m = ground_m
        court_w = float(court_mapper.court_w)
        court_l = float(court_mapper.court_l)

        # Distance outside court in x and y
        dx = 0.0 if 0.0 <= gx_m <= court_w else max(-gx_m, gx_m - court_w)
        dy = 0.0 if 0.0 <= gy_m <= court_l else max(-gy_m, gy_m - court_l)

        if dx <= cfg.boundary_tolerance_m and dy <= cfg.boundary_tolerance_m:
            # Inside court boundary (with line thickness tolerance)
            edge_dists = [gx_m, court_w - gx_m, gy_m, court_l - gy_m]
            dist_m = float(min(edge_dists)) if all(d >= 0 for d in edge_dists) else 0.0
            return CourtEnvelopeZone.IN_COURT, dist_m, None
        else:
            # Outside court
            outside_dist = float(math.hypot(dx, dy))
            dist_m = -outside_dist
            if dx <= cfg.margin_x_m and dy <= cfg.margin_y_m:
                return CourtEnvelopeZone.NEAR_COURT, dist_m, None
            else:
                return CourtEnvelopeZone.FAR_OUTSIDE, dist_m, None

    # 2. Pixel evaluation via court polygon test when metric homography is unavailable
    if court_corners_px is not None and len(court_corners_px) >= 4:
        poly = court_corners_px.astype(np.float32)
        poly_dist = float(cv2.pointPolygonTest(poly, (float(ground_px[0]), float(ground_px[1])), True))
        dist_px = poly_dist

        if poly_dist >= -cfg.boundary_tolerance_px:
            return CourtEnvelopeZone.IN_COURT, None, dist_px
        elif poly_dist >= -cfg.image_margin_px:
            return CourtEnvelopeZone.NEAR_COURT, None, dist_px
        else:
            return CourtEnvelopeZone.FAR_OUTSIDE, None, dist_px

    # 3. Uncalibrated / No corners fallback: unconstrained image-space
    return CourtEnvelopeZone.NEAR_COURT, None, 0.0


def evaluate_player_eligibility(
    detection: dict[str, Any],
    ground_point: CanonicalGroundPoint,
    envelope_zone: CourtEnvelopeZone,
    envelope_dist_m: float | None = None,
    envelope_dist_px: float | None = None,
    active_profiles: dict[int, Any] | None = None,
    scene_state: SceneState | str | None = None,
    game_type: str = "doubles",
    is_metric_valid: bool = False,
    config: CourtEnvelopeConfig | None = None,
) -> PlayerEligibility:
    """
    Evaluate whether a single detection qualifies as an eligible player candidate.
    Combines foot evidence, envelope zone, aspect ratio, player history, and scene state.
    """
    cfg = config or CourtEnvelopeConfig()
    reasons: list[str] = []

    det_conf = float(detection.get("conf", detection.get("confidence", 0.5)))
    track_id = detection.get("track_id")

    # 1. Check known player history
    is_known_player = False
    known_pid = None
    if active_profiles and track_id is not None:
        for pid, p in active_profiles.items():
            if p.track_id is not None and p.track_id == track_id and p.missed_frames < 30:
                is_known_player = True
                known_pid = pid
                break

    # 2. Check scene state constraints
    # Non-gameplay scenes must not promote new unknown detections into players
    scene_str = scene_state.value if isinstance(scene_state, SceneState) else str(scene_state or "UNKNOWN")
    is_non_gameplay_scene = scene_str in (
        SceneState.CLOSE_UP.value,
        SceneState.REPLAY.value,
        SceneState.CAMERA_TRANSITION.value,
    )

    if is_non_gameplay_scene and not is_known_player:
        reasons.append(f"scene_state_{scene_str}_blocks_new_player")
        return PlayerEligibility(
            status=EligibilityStatus.CANDIDATE,
            envelope_zone=envelope_zone,
            envelope_distance_m=envelope_dist_m,
            envelope_distance_px=envelope_dist_px,
            confidence=det_conf * 0.5,
            reasons=reasons,
            is_eligible_for_profile=False,
            provenance={
                "sceneState": scene_str,
                "isKnownPlayer": False,
                "groundProvenance": ground_point.provenance,
            },
        )

    # 3. Geometry and Envelope Evaluation
    bbox = detection.get("bbox", [0, 0, 100, 100])
    bw = max(1.0, float(bbox[2] - bbox[0]))
    bh = max(1.0, float(bbox[3] - bbox[1]))
    aspect_ratio = bw / bh

    # An extreme aspect ratio (e.g. seated person in chair, w/h > 0.95) outside court is spectator/official
    is_seated_spectator_shape = (aspect_ratio > 0.95 and envelope_zone != CourtEnvelopeZone.IN_COURT)

    if envelope_zone == CourtEnvelopeZone.FAR_OUTSIDE:
        if is_known_player:
            # Known player made an extreme excursion (e.g. retrieving deep smash)
            reasons.append("known_player_excursion_far_outside")
            return PlayerEligibility(
                status=EligibilityStatus.CANDIDATE,
                envelope_zone=envelope_zone,
                envelope_distance_m=envelope_dist_m,
                envelope_distance_px=envelope_dist_px,
                confidence=det_conf * 0.7,
                reasons=reasons,
                is_eligible_for_profile=True,
                provenance={
                    "knownPlayerId": known_pid,
                    "isKnownPlayer": True,
                    "groundProvenance": ground_point.provenance,
                },
            )
        else:
            # Non-player outside playing envelope (umpire, linesman, coach, spectator)
            reasons.append("detection_far_outside_court_envelope")
            reasons.append("no_prior_player_history")
            return PlayerEligibility(
                status=EligibilityStatus.SPECTATOR_OR_OFFICIAL,
                envelope_zone=envelope_zone,
                envelope_distance_m=envelope_dist_m,
                envelope_distance_px=envelope_dist_px,
                confidence=det_conf,
                reasons=reasons,
                is_eligible_for_profile=False,
                provenance={
                    "isKnownPlayer": False,
                    "groundProvenance": ground_point.provenance,
                },
            )

    if is_seated_spectator_shape and not is_known_player:
        reasons.append("abnormal_aspect_ratio_near_court")
        return PlayerEligibility(
            status=EligibilityStatus.SPECTATOR_OR_OFFICIAL,
            envelope_zone=envelope_zone,
            envelope_distance_m=envelope_dist_m,
            envelope_distance_px=envelope_dist_px,
            confidence=det_conf,
            reasons=reasons,
            is_eligible_for_profile=False,
            provenance={
                "aspectRatio": round(aspect_ratio, 2),
                "isKnownPlayer": False,
            },
        )

    # 4. In-Court or Near-Court evaluation
    if envelope_zone == CourtEnvelopeZone.IN_COURT:
        reasons.append("player_in_court")
        final_conf = min(1.0, max(0.2, (det_conf * 0.6) + (ground_point.confidence * 0.4)))
        return PlayerEligibility(
            status=EligibilityStatus.ELIGIBLE,
            envelope_zone=envelope_zone,
            envelope_distance_m=envelope_dist_m,
            envelope_distance_px=envelope_dist_px,
            confidence=final_conf,
            reasons=reasons,
            is_eligible_for_profile=True,
            provenance={
                "isKnownPlayer": is_known_player,
                "groundProvenance": ground_point.provenance,
                "poseSource": ground_point.pose_source,
                "isPoseStale": ground_point.is_stale,
            },
        )
    else:  # NEAR_COURT
        reasons.append("player_near_court_excursion")
        status = EligibilityStatus.ELIGIBLE if (is_known_player or det_conf >= 0.35) else EligibilityStatus.CANDIDATE
        final_conf = min(1.0, max(0.2, (det_conf * 0.5) + (ground_point.confidence * 0.4)))
        return PlayerEligibility(
            status=status,
            envelope_zone=envelope_zone,
            envelope_distance_m=envelope_dist_m,
            envelope_distance_px=envelope_dist_px,
            confidence=final_conf,
            reasons=reasons,
            is_eligible_for_profile=True,
            provenance={
                "isKnownPlayer": is_known_player,
                "groundProvenance": ground_point.provenance,
                "poseSource": ground_point.pose_source,
                "isPoseStale": ground_point.is_stale,
            },
        )


def select_eligible_player_candidates(
    detections: list[dict[str, Any]],
    eligibilities: list[PlayerEligibility],
    max_players: int = 4,
    active_profiles: dict[int, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Filter and rank detections into player candidates bounded by max_players.

    Invariants:
    - Never promote SPECTATOR_OR_OFFICIAL.
    - Never force-fill: if only 1 player is eligible in singles, return 1 candidate!
      If only 2 are eligible in doubles, return 2 candidates!
    - Unobserved profiles remain UNRESOLVED without force-filling.
    """
    eligible_pairs = [
        (d, e) for d, e in zip(detections, eligibilities)
        if e.is_eligible_for_profile
        and e.status != EligibilityStatus.SPECTATOR_OR_OFFICIAL
    ]

    if not eligible_pairs:
        return []

    # If eligible count is <= max_players, return all eligible candidates directly without force-filling
    if len(eligible_pairs) <= max_players:
        candidates = []
        for d, e in eligible_pairs:
            det_copy = dict(d)
            det_copy["eligibility"] = e
            candidates.append(det_copy)
        return candidates

    # If more detections qualify than allowed player budget, rank by priority
    def candidate_score(pair: tuple[dict[str, Any], PlayerEligibility]) -> float:
        det, elig = pair
        score = 0.0
        # Priority 1: Known active player track ID
        if elig.provenance.get("isKnownPlayer"):
            score += 10.0
        # Priority 2: Envelope zone (IN_COURT > NEAR_COURT)
        if elig.envelope_zone == CourtEnvelopeZone.IN_COURT:
            score += 5.0
        elif elig.envelope_zone == CourtEnvelopeZone.NEAR_COURT:
            score += 2.0
        # Priority 3: Non-stale pose with ankles
        if not elig.provenance.get("isPoseStale", False) and elig.provenance.get("groundProvenance") != CANONICAL_PROVENANCE_BBOX:
            score += 3.0
        # Priority 4: Ground confidence & detection confidence
        score += elig.confidence * 2.0
        return score

    sorted_pairs = sorted(eligible_pairs, key=candidate_score, reverse=True)
    selected = sorted_pairs[:max_players]

    candidates = []
    for d, e in selected:
        det_copy = dict(d)
        det_copy["eligibility"] = e
        candidates.append(det_copy)
    return candidates
