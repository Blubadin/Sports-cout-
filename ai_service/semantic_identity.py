"""
semantic_identity.py — Explicit, testable semantic identity association with ReID support.

Implements the explicit 5-component cost model:
totalCost = spatialCost + courtSidePenalty + rawTrackContinuityBonus + hsvAppearanceCost + reidAppearanceCost

Invariants:
- Preserves spatial, court-side, raw track ID, and HSV signals.
- ReID is an evidence source, never unquestioned identity truth.
- Ambiguous ReID signals never force a semantic identity switch.
- Distinguishes rawTrackerIdSwitch (raw MOT recovery) from semanticPlayerIdSwitch (true player swap).
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Sequence
import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment

from court_mapper import CourtMapper, COURT_LENGTH_M
from reid_adapter import BaseReIDAdapter, DisabledReIDAdapter
from player_eligibility import CourtEnvelopeZone


def jersey_histogram(frame, bbox):
    """Central upper torso; exclude court background, head and lower body."""
    if frame is None or not frame.size or bbox is None:
        return None
    x1, y1, x2, y2 = [int(v) for v in bbox]
    width, height = x2-x1, y2-y1
    x1, x2 = x1+int(width*.3), x1+int(width*.7)
    y1, y2 = y1+int(height*.2), y1+int(height*.5)
    h, w = frame.shape[:2]
    crop = frame[max(0,y1):min(h,y2), max(0,x1):min(w,x2)]
    if not crop.size:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    # Hue is undefined for white/gray jerseys, and red wraps around hue zero.
    # Canonicalize achromatic pixels and use a circular red-centered hue bin.
    hsv[:, :, 0] = (hsv[:, :, 0].astype(np.uint16) + 11) % 180
    hsv[:, :, 0][hsv[:, :, 1] < 64] = 0
    hsv[:, :, 1] = np.where(hsv[:, :, 1] < 64, 0, 255)
    counts = cv2.calcHist([hsv], [0, 1], None, [8, 2], [0, 180, 0, 256])
    peak = np.unravel_index(np.argmax(counts), counts.shape)
    # Only an actual majority jersey color is identity evidence. Background,
    # skin and folds can vary without adapting an athlete into somebody else.
    if counts[peak] / counts.sum() < .55:
        return None
    hist = np.zeros_like(counts)
    hist[peak] = 1
    return hist


@dataclass(frozen=True)
class SemanticIdentityCosts:
    """Explicit decomposition of identity association cost components."""

    spatial_cost: float
    court_side_penalty: float
    raw_track_continuity_bonus: float
    hsv_appearance_cost: float
    reid_appearance_cost: float
    total_cost: float
    reid_similarity: float | None = None
    is_ambiguous: bool = False
    hsv_distance: float | None = None
    quarantine_penalty: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "spatialCost": round(self.spatial_cost, 4),
            "courtSidePenalty": round(self.court_side_penalty, 4),
            "rawTrackContinuityBonus": round(self.raw_track_continuity_bonus, 4),
            "hsvAppearanceCost": round(self.hsv_appearance_cost, 4),
            "reidAppearanceCost": round(self.reid_appearance_cost, 4),
            "quarantinePenalty": round(self.quarantine_penalty, 4),
            "totalCost": round(self.total_cost, 4),
            "reidSimilarity": round(self.reid_similarity, 4) if self.reid_similarity is not None else None,
            "isAmbiguous": self.is_ambiguous,
            "hsvDistance": self.hsv_distance,
        }


def compute_identity_association_cost(
    profile: Any,
    detection: dict[str, Any],
    frame: np.ndarray | None = None,
    reid_adapter: BaseReIDAdapter | None = None,
    reid_weight: float = 8.0,
    hsv_weight: float = 8.0,
    side_penalty_val: float = 15.0,
    raw_track_bonus_val: float = -4.0,
) -> SemanticIdentityCosts:
    """
    Compute explicit, testable 5-component cost between a PlayerProfile and a detection.
    """
    d_real = detection.get("real_pos")

    # 1. Spatial Distance Cost (meters on calibrated court plane)
    net_y = COURT_LENGTH_M / 2.0
    previous_bbox = getattr(profile, "last_bbox", None)
    current_bbox = detection.get("bbox")
    if previous_bbox is not None and current_bbox is not None and (
            d_real is None or profile.last_real_pos is None):
        # Use image continuity while calibration is invalid and on its first recovered frame.
        prev_center = ((previous_bbox[0] + previous_bbox[2]) / 2, (previous_bbox[1] + previous_bbox[3]) / 2)
        current_center = ((current_bbox[0] + current_bbox[2]) / 2, (current_bbox[1] + current_bbox[3]) / 2)
        spatial_cost = float(CourtMapper.euclidean_distance(prev_center, current_center) / 50.0)
    elif d_real is None:
        spatial_cost = 0.0
    elif profile.last_real_pos is not None:
        spatial_cost = float(CourtMapper.euclidean_distance(profile.last_real_pos, d_real))
    else:
        expected_y = 3.0 if profile.team == 1 else (10.0 if profile.team == 2 else net_y)
        spatial_cost = float(abs(d_real[1] - expected_y))

    # 2. Court-Side Penalty: severe penalty for jumping across the net once side is established
    d_team = 1 if d_real is not None and d_real[1] < net_y else 2
    if d_real is not None and profile.team in (1, 2) and d_team != profile.team:
        court_side_penalty = float(side_penalty_val)
    else:
        court_side_penalty = 0.0

    # 3. Raw Track Continuity Bonus: rewards continuity with observed MOT track ID
    det_track_id = detection.get("track_id")
    if profile.track_id is not None and det_track_id is not None and profile.track_id == det_track_id:
        raw_track_continuity_bonus = float(raw_track_bonus_val)
    else:
        raw_track_continuity_bonus = 0.0

    # 4. HSV Appearance Cost (Bhattacharyya distance scaled by hsv_weight)
    hsv_appearance_cost = 0.0
    hsv_distance = None
    if profile.color_hist is not None and frame is not None and frame.size > 0:
        det_hist = jersey_histogram(frame, detection.get("bbox"))
        if det_hist is not None:
            reference = getattr(profile, "identity_color_hist", None)
            reference = reference if reference is not None else profile.color_hist
            bhatt_dist = float(cv2.compareHist(reference, det_hist, cv2.HISTCMP_BHATTACHARYYA))
            hsv_distance = bhatt_dist
            hsv_appearance_cost = float(bhatt_dist * hsv_weight)

    # 5. ReID Appearance Cost (Cosine distance scaled by reid_weight)
    reid_appearance_cost = 0.0
    reid_sim = None
    is_ambiguous = False

    det_reid_emb = detection.get("reid_embedding")
    if det_reid_emb is None and reid_adapter is not None and reid_adapter.is_enabled and frame is not None and frame.size > 0:
        bbox = detection.get("bbox")
        if bbox is not None:
            det_reid_emb = reid_adapter.extract(frame, bbox)
            detection["reid_embedding"] = det_reid_emb

    prof_reid_emb = getattr(profile, "reid_embedding", None)
    if (
        reid_adapter is not None
        and reid_adapter.is_enabled
        and prof_reid_emb is not None
        and det_reid_emb is not None
    ):
        reid_sim = reid_adapter.compute_similarity(prof_reid_emb, det_reid_emb)
        if reid_sim is not None:
            # Ambiguity guard: If similarity is uncertain (e.g. around 0.35..0.55),
            # mark ambiguous and do not let ReID overpower spatial continuity
            if 0.35 <= reid_sim <= 0.55:
                is_ambiguous = True
                effective_sim = max(0.0, reid_sim * 0.5)
            else:
                effective_sim = max(0.0, reid_sim)
            cos_dist = float(1.0 - effective_sim)
            reid_appearance_cost = float(cos_dist * reid_weight)

    # 6. Semantic Identity Quarantine Penalty (Part 11)
    # A known active player's profile must NEVER jump to an outsider track that is outside court.
    quarantine_penalty = 0.0
    det_track_id = detection.get("track_id")
    if profile.track_id is not None and det_track_id is not None and profile.track_id != det_track_id:
        env_zone = detection.get("envelope_zone")
        if env_zone is None and "eligibility" in detection and detection["eligibility"] is not None:
            env_zone = getattr(detection["eligibility"], "envelope_zone", None)
        zone_val = getattr(env_zone, "value", str(env_zone)) if env_zone is not None else None
        if zone_val in ("FAR_OUTSIDE", "NEAR_COURT"):
            quarantine_penalty = 50.0

    total_cost = (
        spatial_cost
        + court_side_penalty
        + raw_track_continuity_bonus
        + hsv_appearance_cost
        + reid_appearance_cost
        + quarantine_penalty
    )

    return SemanticIdentityCosts(
        spatial_cost=spatial_cost,
        court_side_penalty=court_side_penalty,
        raw_track_continuity_bonus=raw_track_continuity_bonus,
        hsv_appearance_cost=hsv_appearance_cost,
        reid_appearance_cost=reid_appearance_cost,
        quarantine_penalty=quarantine_penalty,
        total_cost=total_cost,
        reid_similarity=reid_sim,
        is_ambiguous=is_ambiguous,
        hsv_distance=hsv_distance,
    )


def match_tracks_to_profiles_with_reid(
    profiles: dict[int, Any],
    detections: list[dict[str, Any]],
    frame: np.ndarray,
    dist_tracker: Any,
    reid_adapter: BaseReIDAdapter | None = None,
    timestamp_sec: float | None = None,
    last_known_track_owners: dict[int, int] | None = None,
    reid_weight: float = 8.0,
    hsv_weight: float = 8.0,
    raw_track_bonus_val: float = -4.0,
) -> tuple[dict[int, dict[str, Any]], dict[int, SemanticIdentityCosts], int, int]:
    """
    Perform global Hungarian bipartite matching using the explicit 5-component cost model.
    Tracks raw MOT track changes and semantic identity switches distinctly.

    Returns:
    - matched: dict mapping pid -> detection dict
    - cost_breakdowns: dict mapping pid -> SemanticIdentityCosts
    - raw_tracker_id_switches: count of raw MOT track changes for existing players
    - semantic_player_id_switches: count of semantic identity swaps
    """
    # Defense at the identity boundary: an unavailable court cannot seed a profile,
    # even if an upstream caller incorrectly passes an otherwise eligible person.
    any_established = any(p.color_hist is not None or getattr(p, "reid_embedding", None) is not None for p in profiles.values())
    if not any_established:
        detections = [d for d in detections if not (d.get("eligibility") and d["eligibility"].provenance.get("courtEligibilityUnavailable"))]
    if not detections:
        for p in profiles.values():
            p.missed_frames += 1
            p.identity_confirmation_frames = 0
            p.identity_confirmation_track = None
        return {}, {}, 0, 0

    active_pids = list(profiles.keys())
    net_y = COURT_LENGTH_M / 2.0

    raw_tracker_id_switches = 0
    semantic_player_id_switches = 0

    # Auto-seeding on first observation if all profiles are unassigned
    if all(p.last_real_pos is None and p.last_bbox is None
           and not getattr(p, "identity_needs_reacquisition", False)
           and p.color_hist is None and getattr(p, "reid_embedding", None) is None
           for p in profiles.values()):
        sorted_detections = sorted(
            detections,
            key=lambda det: (
                (0 if det["real_pos"][1] < net_y else 1) if det.get("real_pos") is not None else det["center"][1],
                det["real_pos"][0] if det.get("real_pos") is not None else det["center"][0],
            ),
        )
        matched: dict[int, dict[str, Any]] = {}
        cost_breakdowns: dict[int, SemanticIdentityCosts] = {}
        matched_pids = set()

        for idx, pid in enumerate(active_pids):
            if idx < len(sorted_detections):
                d = sorted_detections[idx]
                p = profiles[pid]
                p.track_id = d.get("track_id")
                p.detection_confidence = d.get("conf")
                p.last_real_pos = d["real_pos"]
                p.last_bbox = d["bbox"]
                p.missed_frames = 0
                if "ground_pt" in d:
                    p.last_ground_pt = d["ground_pt"]
                if "envelope_zone" in d:
                    p.last_envelope_zone = d["envelope_zone"].value if hasattr(d["envelope_zone"], "value") else str(d["envelope_zone"])
                if "eligibility" in d:
                    p.last_eligibility_status = d["eligibility"].status.value if hasattr(d["eligibility"].status, "value") else str(d["eligibility"].status)
                if "pose_obj" in d and d["pose_obj"] is not None:
                    p.last_pose = d["pose_obj"]
                    p.last_pose_age = 0
                if d["real_pos"] is not None:
                    p.team = 1 if d["real_pos"][1] < net_y else 2
                p.update_appearance(frame, d["bbox"])

                # Extract initial ReID embedding if available
                if reid_adapter is not None and reid_adapter.is_enabled:
                    emb = reid_adapter.extract(frame, d["bbox"])
                    if emb is not None:
                        p.reid_embedding = emb
                        d["reid_embedding"] = emb

                cx, cy = d["center"]
                if dist_tracker is not None and d["real_pos"] is not None:
                    try:
                        dist_tracker.update(pid, (cx, cy), timestamp_sec=timestamp_sec)
                    except Exception:
                        pass
                matched[pid] = d
                matched_pids.add(pid)

                if last_known_track_owners is not None and p.track_id is not None:
                    last_known_track_owners[p.track_id] = pid

                costs = compute_identity_association_cost(
                    p,
                    d,
                    frame=frame,
                    reid_adapter=reid_adapter,
                    reid_weight=reid_weight,
                    hsv_weight=hsv_weight,
                    raw_track_bonus_val=raw_track_bonus_val,
                )
                cost_breakdowns[pid] = costs
            else:
                profiles[pid].missed_frames += 1

        return matched, cost_breakdowns, 0, 0

    # Pre-extract ReID embeddings for all candidate detections once per frame
    if reid_adapter is not None and reid_adapter.is_enabled:
        for d in detections:
            if "reid_embedding" not in d:
                bbox = d.get("bbox")
                if bbox is not None:
                    d["reid_embedding"] = reid_adapter.extract(frame, bbox)

    n_profiles = len(active_pids)
    n_detections = len(detections)
    cost_matrix = np.zeros((n_profiles, n_detections), dtype=np.float32)
    costs_grid: list[list[SemanticIdentityCosts]] = []

    for i, pid in enumerate(active_pids):
        row_costs: list[SemanticIdentityCosts] = []
        p = profiles[pid]
        for j, d in enumerate(detections):
            c = compute_identity_association_cost(
                p,
                d,
                frame=frame,
                reid_adapter=reid_adapter,
                reid_weight=reid_weight,
                hsv_weight=hsv_weight,
                raw_track_bonus_val=raw_track_bonus_val,
            )
            cost_matrix[i, j] = c.total_cost
            eligibility = d.get("eligibility")
            if eligibility is not None and eligibility.provenance.get("courtEligibilityUnavailable"):
                established = (p.color_hist is not None or getattr(p, "reid_embedding", None) is not None)
                if not established:
                    cost_matrix[i, j] = 1e6
            row_costs.append(c)
        costs_grid.append(row_costs)

    # Cut/resume removes spatial continuity. Retained appearance is evidence,
    # never a license to seed identities again or to fill unseen player slots.
    reacquiring = [getattr(profiles[pid], "identity_needs_reacquisition", False)
                   or (profiles[pid].last_bbox is None and profiles[pid].last_real_pos is None
                       and (profiles[pid].color_hist is not None
                            or getattr(profiles[pid], "reid_embedding", None) is not None))
                   for pid in active_pids]
    # A court-side prior or recycled MOT id cannot override a distinctive
    # appearance belonging to the other established athlete (change of ends).
    appearance_reassociation_pairs = set()
    for i, row in enumerate(costs_grid):
        for j, evidence in enumerate(row):
            if profiles[active_pids[i]].last_bbox is None and profiles[active_pids[i]].track_id is None and any(
                    other_pid != active_pids[i] and other_profile.last_bbox is not None
                    and other_profile.track_id == detections[j].get("track_id")
                    for other_pid, other_profile in profiles.items()):
                # An empty slot cannot take an established athlete's live MOT
                # track merely because only one athlete was visible at seeding.
                cost_matrix[i, j] = 1e6
            other = [grid[j] for k, grid in enumerate(costs_grid) if k != i]
            distinctive = (evidence.hsv_distance is not None and evidence.hsv_distance <= .2
                           and all(c.hsv_distance is None or c.hsv_distance >= evidence.hsv_distance + .1 for c in other))
            if distinctive and profiles[active_pids[i]].track_id != detections[j].get("track_id"):
                appearance_reassociation_pairs.add((i, j))
            if getattr(profiles[active_pids[i]], "identity_color_hist", None) is not None and evidence.hsv_distance is not None and evidence.hsv_distance >= .5:
                cost_matrix[i, j] = 1e6
            if evidence.hsv_distance is not None and evidence.hsv_distance >= .5 and any(
                    c.hsv_distance is not None and c.hsv_distance <= evidence.hsv_distance - .1 for c in other):
                cost_matrix[i, j] = 1e6

    for i, needs_evidence in enumerate(reacquiring):
        for j, evidence in enumerate(costs_grid[i]):
            eligibility = detections[j].get("eligibility")
            uncalibrated_new_track = bool(eligibility and eligibility.provenance.get("courtEligibilityUnavailable") and profiles[active_pids[i]].track_id != detections[j].get("track_id"))
            if not needs_evidence and not uncalibrated_new_track and (i, j) not in appearance_reassociation_pairs:
                continue
            other = [row[j] for k, row in enumerate(costs_grid) if k != i]
            hsv_supported = (evidence.hsv_distance is not None and evidence.hsv_distance <= .2
                             and all(c.hsv_distance is None or
                                     c.hsv_distance >= evidence.hsv_distance + .1 for c in other))
            reid_supported = (evidence.reid_similarity is not None and evidence.reid_similarity >= .75
                              and all(c.reid_similarity is None or
                                      c.reid_similarity <= evidence.reid_similarity - .1 for c in other))
            conflicting_reid = evidence.reid_similarity is not None and evidence.reid_similarity < .55
            if evidence.is_ambiguous or conflicting_reid or not (hsv_supported or reid_supported):
                cost_matrix[i, j] = 1e6

    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    matched = {}
    cost_breakdowns = {}
    matched_pids = set()

    for r, c in zip(row_ind, col_ind):
        pid = active_pids[r]
        cost = cost_matrix[r, c]
        p = profiles[pid]

        gate = 100.0 if p.last_real_pos is None or (r, c) in appearance_reassociation_pairs else 25.0
        if cost < gate:
            d = detections[c]
            new_track_id = d.get("track_id")
            eligibility = d.get("eligibility")
            uncalibrated_new_track = bool(eligibility and eligibility.provenance.get("courtEligibilityUnavailable") and p.track_id != new_track_id)
            if reacquiring[r] or uncalibrated_new_track or (r, c) in appearance_reassociation_pairs:
                # Require three consecutive eligible frames on the same raw MOT
                # track, each with independently checked, distinctive appearance.
                if new_track_id is None:
                    p.identity_confirmation_track = None
                    p.identity_confirmation_frames = 0
                    continue
                if getattr(p, "identity_confirmation_track", None) == new_track_id:
                    p.identity_confirmation_frames += 1
                else:
                    p.identity_confirmation_track = new_track_id
                    p.identity_confirmation_frames = 1
                if p.identity_confirmation_frames < 3:
                    continue
                p.identity_needs_reacquisition = False
                p.identity_confirmation_frames = 0
                p.identity_confirmation_track = None

            # 1. Check rawTrackerIdSwitch: player's raw MOT ID changed
            if (
                p.track_id is not None
                and new_track_id is not None
                and p.track_id != new_track_id
            ):
                raw_tracker_id_switches += 1

            # 2. Check semanticPlayerIdSwitch: track ID was previously owned by a DIFFERENT active player
            if (
                last_known_track_owners is not None
                and new_track_id is not None
                and new_track_id in last_known_track_owners
            ):
                prior_owner = last_known_track_owners[new_track_id]
                if prior_owner != pid and profiles[prior_owner].missed_frames < 30 and (r, c) not in appearance_reassociation_pairs:
                    semantic_player_id_switches += 1

            if last_known_track_owners is not None and new_track_id is not None:
                last_known_track_owners[new_track_id] = pid

            p.track_id = new_track_id
            p.detection_confidence = d.get("conf")
            p.last_real_pos = d["real_pos"]
            p.last_bbox = d["bbox"]
            p.missed_frames = 0
            if "ground_pt" in d:
                p.last_ground_pt = d["ground_pt"]
            if "envelope_zone" in d:
                p.last_envelope_zone = d["envelope_zone"].value if hasattr(d["envelope_zone"], "value") else str(d["envelope_zone"])
            if "eligibility" in d:
                p.last_eligibility_status = d["eligibility"].status.value if hasattr(d["eligibility"].status, "value") else str(d["eligibility"].status)
            if "pose_obj" in d and d["pose_obj"] is not None:
                p.last_pose = d["pose_obj"]
                p.last_pose_age = 0
            if (p.team == 0 or p.color_hist is None) and d["real_pos"] is not None:
                p.team = 1 if d["real_pos"][1] < net_y else 2
            p.update_appearance(frame, d["bbox"])

            # Update ReID appearance embedding using exponential moving average
            new_emb = d.get("reid_embedding")
            if new_emb is not None:
                if getattr(p, "reid_embedding", None) is None:
                    p.reid_embedding = new_emb
                else:
                    # 80% prior momentum + 20% fresh observation
                    updated = 0.8 * p.reid_embedding + 0.2 * new_emb
                    norm = float(np.linalg.norm(updated))
                    if norm > 1e-6:
                        p.reid_embedding = updated / norm

            cx, cy = d["center"]
            if dist_tracker is not None and d["real_pos"] is not None:
                try:
                    dist_tracker.update(pid, (cx, cy), timestamp_sec=timestamp_sec)
                except Exception:
                    pass
            matched[pid] = d
            cost_breakdowns[pid] = costs_grid[r][c]
            matched_pids.add(pid)

    for pid, p in profiles.items():
        if pid not in matched_pids:
            p.missed_frames += 1
            # A failed evidence frame breaks confirmation (a pending accepted
            # assignment above deliberately keeps its counter).
            row = active_pids.index(pid)
            assigned = next((c for r, c in zip(row_ind, col_ind) if r == row), None)
            if assigned is None or cost_matrix[row, assigned] >= 100:
                p.identity_confirmation_frames = 0
                p.identity_confirmation_track = None

    return matched, cost_breakdowns, raw_tracker_id_switches, semantic_player_id_switches
