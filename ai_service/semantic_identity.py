"""
semantic_identity.py — Explicit, testable semantic identity association with ReID support.

Implements a gated identity association cost model with a weak shoe-tone cue:
totalCost = spatialCost + courtSidePenalty + rawTrackContinuityBonus + hsvAppearanceCost + reidAppearanceCost + shoeColorCost

Invariants:
- Preserves spatial, court-side, raw track ID, and HSV signals.
- ReID is an evidence source, never unquestioned identity truth.
- Shoe tone is a secondary cue from repeated fresh ankle observations, not jersey evidence.
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
from pose_coordinate_space import POSE_COORDINATE_SPACE_NORMALIZED_PERCENT


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


def shoe_color_cue(frame, bbox, pose_obj):
    """Return DARK/LIGHT only when fresh ankle-local pixels clearly support it."""
    if frame is None or not frame.size or bbox is None or not isinstance(pose_obj, dict):
        return None
    if (pose_obj.get("keypointCoordinateSpace") != POSE_COORDINATE_SPACE_NORMALIZED_PERCENT
            or pose_obj.get("isReused", False)
            or pose_obj.get("isStale", False)
            or int(pose_obj.get("ageFrames", 0) or 0) != 0):
        return None
    keypoints = pose_obj.get("keypoints")
    if not isinstance(keypoints, (list, tuple)) or len(keypoints) <= 16:
        return None
    h, w = frame.shape[:2]
    try:
        x1, y1, x2, y2 = [float(v) for v in bbox]
    except (TypeError, ValueError):
        return None
    if not np.isfinite((x1, y1, x2, y2)).all():
        return None
    box_w, box_h = x2 - x1, y2 - y1
    if box_w < 20 or box_h < 40:
        return None
    detected = []
    for index in (15, 16):  # COCO left/right ankle keypoints.
        point = keypoints[index]
        if not isinstance(point, dict):
            continue
        try:
            score = float(point.get("score", 0.0) or 0.0)
            ankle_x = float(point.get("x", 0.0)) * w / 100.0
            ankle_y = float(point.get("y", 0.0)) * h / 100.0
        except (TypeError, ValueError):
            continue
        if not np.isfinite((score, ankle_x, ankle_y)).all() or score < 0.5:
            continue
        # Full player boxes include a lot of court at this camera distance;
        # keep the sample tight around each ankle so footwear remains visible.
        half_width = max(2, int(round(box_w * 0.07)))
        crop_x1 = max(0, int(round(ankle_x - half_width)))
        crop_x2 = min(w, int(round(ankle_x + half_width + 1)))
        crop_y1 = max(0, int(round(ankle_y - box_h * 0.02)))
        crop_y2 = min(h, int(round(ankle_y + box_h * 0.12)))
        # Keep the sample around the ankle inside this detection's own box.
        crop_x1, crop_x2 = max(crop_x1, int(x1)), min(crop_x2, int(x2))
        crop_y1, crop_y2 = max(crop_y1, int(y1)), min(crop_y2, int(y2))
        crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
        if crop.size == 0 or crop.shape[0] * crop.shape[1] < 24:
            continue
        # BGR luminance; mid-tone court pixels are deliberately neither cue.
        luminance = (0.114 * crop[:, :, 0] + 0.587 * crop[:, :, 1] + 0.299 * crop[:, :, 2])
        dark_fraction = float(np.mean(luminance < 75.0))
        light_fraction = float(np.mean(luminance > 205.0))
        if dark_fraction >= 0.35 and dark_fraction >= light_fraction + 0.15:
            detected.append("DARK")
        elif light_fraction >= 0.35 and light_fraction >= dark_fraction + 0.15:
            detected.append("LIGHT")
    # Conflicting feet or no sufficiently visible shoe remain unknown.
    return detected[0] if detected and all(color == detected[0] for color in detected) else None


def _has_observed_track_continuity(profile: Any, detection: dict[str, Any]) -> bool:
    """Recent overlapping boxes on the same real MOT track, within one segment."""
    if (profile.track_id is None or profile.track_id != detection.get("track_id")
            or profile.missed_frames > 15 or getattr(profile, "identity_needs_reacquisition", False)):
        return False
    previous, current = profile.last_bbox, detection.get("bbox")
    if previous is None or current is None:
        return False
    overlap = max(0, min(previous[2], current[2]) - max(previous[0], current[0])) * max(
        0, min(previous[3], current[3]) - max(previous[1], current[1]))
    previous_area = max(0, previous[2]-previous[0]) * max(0, previous[3]-previous[1])
    current_area = max(0, current[2]-current[0]) * max(0, current[3]-current[1])
    union = previous_area + current_area - overlap
    return union > 0 and overlap / union >= .3


def _has_identity_appearance(profile: Any) -> bool:
    return bool(
        profile.color_hist is not None
        or getattr(profile, "reid_embedding", None) is not None
        or getattr(profile, "shoe_color", None) in ("DARK", "LIGHT")
    )


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
    shoe_color_cost: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "spatialCost": round(self.spatial_cost, 4),
            "courtSidePenalty": round(self.court_side_penalty, 4),
            "rawTrackContinuityBonus": round(self.raw_track_continuity_bonus, 4),
            "hsvAppearanceCost": round(self.hsv_appearance_cost, 4),
            "reidAppearanceCost": round(self.reid_appearance_cost, 4),
            "quarantinePenalty": round(self.quarantine_penalty, 4),
            "shoeColorCost": round(self.shoe_color_cost, 4),
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
        # Check gallery exemplars if available for best view/pose match
        gallery = getattr(profile, "reid_gallery", None)
        if gallery:
            for g_emb in gallery:
                g_sim = reid_adapter.compute_similarity(g_emb, det_reid_emb)
                if g_sim is not None and (reid_sim is None or g_sim > reid_sim):
                    reid_sim = g_sim

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

    # Shoe tone is a weak, separate cue from the jersey histogram. It is only
    # scored from current, clear ankle evidence; identity gating stays elsewhere.
    if "_shoe_color_cue" not in detection:
        detection["_shoe_color_cue"] = shoe_color_cue(
            frame, detection.get("bbox"), detection.get("pose_obj")
        )
    observed_shoe = detection.get("_shoe_color_cue")
    profile_shoe = getattr(profile, "shoe_color", None)
    shoe_color_cost = 0.0
    if observed_shoe in ("DARK", "LIGHT") and profile_shoe in ("DARK", "LIGHT"):
        shoe_color_cost = -2.0 if observed_shoe == profile_shoe else 4.0

    total_cost = (
        spatial_cost
        + court_side_penalty
        + raw_track_continuity_bonus
        + hsv_appearance_cost
        + reid_appearance_cost
        + quarantine_penalty
        + shoe_color_cost
    )

    return SemanticIdentityCosts(
        spatial_cost=spatial_cost,
        court_side_penalty=court_side_penalty,
        raw_track_continuity_bonus=raw_track_continuity_bonus,
        hsv_appearance_cost=hsv_appearance_cost,
        reid_appearance_cost=reid_appearance_cost,
        quarantine_penalty=quarantine_penalty,
        shoe_color_cost=shoe_color_cost,
        total_cost=total_cost,
        reid_similarity=reid_sim,
        is_ambiguous=is_ambiguous,
        hsv_distance=hsv_distance,
    )


def _shoe_cue_supports_identity(
    profiles: dict[int, Any], player_id: int, detection: dict[str, Any], observed_shoe: str | None
) -> bool:
    """Use shoe tone only to distinguish a player from a known same-side peer."""
    if observed_shoe not in ("DARK", "LIGHT"):
        return False
    profile = profiles[player_id]
    real_pos = detection.get("real_pos")
    if real_pos is None:
        return False
    side = 1 if real_pos[1] < COURT_LENGTH_M / 2.0 else 2
    if profile.team != side or getattr(profile, "shoe_color", None) != observed_shoe:
        return False
    peers = [
        peer for peer_id, peer in profiles.items()
        if peer_id != player_id and getattr(peer, "team", 0) == side
    ]
    return bool(peers) and all(
        getattr(peer, "identity_established", False)
        and getattr(peer, "shoe_color", None) in ("DARK", "LIGHT")
        and peer.shoe_color != observed_shoe
        for peer in peers
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
    any_established = any(_has_identity_appearance(p) for p in profiles.values())
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
           and not _has_identity_appearance(p)
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
                p.update_appearance(
                    frame, d["bbox"], timestamp_sec=timestamp_sec, pose_obj=d.get("pose_obj")
                )

                # Extract initial ReID embedding if available
                if reid_adapter is not None and reid_adapter.is_enabled:
                    emb = reid_adapter.extract(frame, d["bbox"])
                    if emb is not None:
                        p.reid_embedding = emb
                        d["reid_embedding"] = emb
                        if hasattr(p, "update_reid_embedding"):
                            p.update_reid_embedding(emb, timestamp_sec=timestamp_sec)

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

    # Pre-extract ReID embeddings for all candidate detections in batch if supported
    if reid_adapter is not None and reid_adapter.is_enabled:
        unembedded = [(idx, d) for idx, d in enumerate(detections) if "reid_embedding" not in d and d.get("bbox") is not None]
        if unembedded:
            bboxes = [d.get("bbox") for _, d in unembedded]
            if hasattr(reid_adapter, "extract_batch"):
                batch_embs = reid_adapter.extract_batch(frame, bboxes)
                for (orig_idx, d), emb in zip(unembedded, batch_embs):
                    d["reid_embedding"] = emb
            else:
                for _, d in unembedded:
                    bbox = d.get("bbox")
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
                established = _has_identity_appearance(p)
                if not established:
                    cost_matrix[i, j] = 1e6
            row_costs.append(c)
        costs_grid.append(row_costs)

    # During partial initialization an empty slot cannot absorb a returning
    # athlete whose appearance belongs to an established (possibly cut) profile.
    for i, pid in enumerate(active_pids):
        p = profiles[pid]
        if getattr(p, "identity_established", False) or p.last_bbox is not None or _has_identity_appearance(p):
            continue
        for j in range(n_detections):
            if any(k != i and profiles[active_pids[k]].last_bbox is None and (
                (row[j].hsv_distance is not None and row[j].hsv_distance <= .2)
                or (row[j].reid_similarity is not None and row[j].reid_similarity >= .75)
            ) for k, row in enumerate(costs_grid)):
                cost_matrix[i, j] = 1e6

    # Cut/resume removes spatial continuity. Retained appearance is evidence,
    # never a license to seed identities again or to fill unseen player slots.
    reacquiring = [getattr(profiles[pid], "identity_needs_reacquisition", False)
                   or (profiles[pid].last_bbox is None and profiles[pid].last_real_pos is None
                       and _has_identity_appearance(profiles[pid]))
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
            distinctive_hsv = (evidence.hsv_distance is not None and evidence.hsv_distance <= .2
                           and all(c.hsv_distance is None or c.hsv_distance >= evidence.hsv_distance + .1 for c in other))
            distinctive_reid = (evidence.reid_similarity is not None and evidence.reid_similarity >= .65
                            and all(c.reid_similarity is None or c.reid_similarity <= evidence.reid_similarity - .1 for c in other))
            fused_distinctive = (evidence.hsv_distance is not None and evidence.hsv_distance <= .35
                            and evidence.reid_similarity is not None and evidence.reid_similarity >= .55
                            and all((c.hsv_distance is None or c.hsv_distance >= evidence.hsv_distance + .05) or
                                    (c.reid_similarity is None or c.reid_similarity <= evidence.reid_similarity - .05) for c in other))
            shoe_supported = _shoe_cue_supports_identity(
                profiles, active_pids[i], detections[j], detections[j].get("_shoe_color_cue")
            )
            if (distinctive_hsv or distinctive_reid or fused_distinctive or shoe_supported) and profiles[active_pids[i]].track_id != detections[j].get("track_id"):
                appearance_reassociation_pairs.add((i, j))

    for i, row in enumerate(costs_grid):
        p = profiles[active_pids[i]]
        for j, evidence in enumerate(row):
            continuous = _has_observed_track_continuity(p, detections[j]) and not any(
                k != i and (k, j) in appearance_reassociation_pairs for k in range(n_profiles)
            )
            other = [grid[j] for k, grid in enumerate(costs_grid) if k != i]
            owner = next((other_pid for other_pid, other_profile in profiles.items()
                          if other_profile.last_bbox is not None
                          and other_profile.track_id is not None
                          and other_profile.track_id == detections[j].get("track_id")), None)
            changed_mot_track = profiles[active_pids[i]].track_id != detections[j].get("track_id")
            if (changed_mot_track and evidence.shoe_color_cost > 0 and not continuous
                    and (i, j) not in appearance_reassociation_pairs):
                # A clear footwear contradiction cannot relabel a new MOT
                # track by proximity alone. Continuity or independent jersey/
                # ReID evidence may still override this secondary cue.
                cost_matrix[i, j] = 1e6
            if owner is not None and owner != active_pids[i] and (i, j) not in appearance_reassociation_pairs:
                cost_matrix[i, j] = 1e6
            prior_owner_id = (
                last_known_track_owners.get(detections[j].get("track_id"))
                if last_known_track_owners is not None else None
            )
            prior_owner = profiles.get(prior_owner_id) if prior_owner_id is not None else None
            if (prior_owner is not None and prior_owner_id != active_pids[i]
                    and (i, j) not in appearance_reassociation_pairs):
                # A MOT ID cannot change semantic owners by proximity alone.
                # Another profile needs independent appearance evidence before
                # inheriting a track that was previously assigned elsewhere.
                cost_matrix[i, j] = 1e6
            if any(k != i and (k, j) in appearance_reassociation_pairs for k in range(n_profiles)):
                cost_matrix[i, j] = 1e6
            if (i, j) in appearance_reassociation_pairs:
                cost_matrix[i, j] = max(0.0, cost_matrix[i, j] - evidence.court_side_penalty)
            if continuous:
                continue
            if evidence.reid_similarity is not None and evidence.reid_similarity < .40 and any(
                    c.reid_similarity is not None and c.reid_similarity >= .65 for c in other):
                cost_matrix[i, j] = 1e6
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
            hsv_supported = (evidence.hsv_distance is not None and evidence.hsv_distance <= .25
                             and all(c.hsv_distance is None or
                                     c.hsv_distance >= evidence.hsv_distance + .08 for c in other))
            reid_supported = (evidence.reid_similarity is not None and evidence.reid_similarity >= .65
                              and all(c.reid_similarity is None or
                                      c.reid_similarity <= evidence.reid_similarity - .08 for c in other))
            fused_supported = (evidence.hsv_distance is not None and evidence.hsv_distance <= .35
                               and evidence.reid_similarity is not None and evidence.reid_similarity >= .55
                               and all((c.hsv_distance is None or c.hsv_distance >= evidence.hsv_distance + .05) or
                                       (c.reid_similarity is None or c.reid_similarity <= evidence.reid_similarity - .05) for c in other))
            shoe_supported = _shoe_cue_supports_identity(
                profiles, active_pids[i], detections[j], detections[j].get("_shoe_color_cue")
            )
            conflicting_reid = evidence.reid_similarity is not None and evidence.reid_similarity < .40
            if evidence.is_ambiguous or conflicting_reid or not (hsv_supported or reid_supported or fused_supported or shoe_supported):
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
            other_active_owner = next(
                (other_pid for other_pid, other_profile in profiles.items()
                 if other_pid != pid and other_profile.track_id is not None
                 and other_profile.track_id == new_track_id and other_profile.last_bbox is not None),
                None
            )
            stealing_active_track = bool(other_active_owner is not None and (r, c) in appearance_reassociation_pairs)

            changed_mot_track = (
                p.track_id is not None
                and new_track_id is not None
                and p.track_id != new_track_id
            )
            if reacquiring[r] or uncalibrated_new_track or stealing_active_track or changed_mot_track:
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
            else:
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
            if (p.team == 0 or p.color_hist is None or (r, c) in appearance_reassociation_pairs) and d["real_pos"] is not None:
                p.team = 1 if d["real_pos"][1] < net_y else 2
            p.update_appearance(
                frame, d["bbox"], timestamp_sec=timestamp_sec, pose_obj=d.get("pose_obj")
            )

            # Update ReID appearance embedding using exponential moving average and gallery
            new_emb = d.get("reid_embedding")
            if new_emb is not None:
                if getattr(p, "reid_embedding", None) is None:
                    p.reid_embedding = new_emb
                else:
                    updated = 0.8 * p.reid_embedding + 0.2 * new_emb
                    norm = float(np.linalg.norm(updated))
                    if norm > 1e-6:
                        p.reid_embedding = updated / norm

                if not hasattr(p, "reid_gallery") or p.reid_gallery is None:
                    p.reid_gallery = []
                if len(p.reid_gallery) < 5:
                    p.reid_gallery.append(new_emb.copy())
                else:
                    p.reid_gallery.pop(0)
                    p.reid_gallery.append(new_emb.copy())

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
            row = active_pids.index(pid)
            assigned = next((c for r, c in zip(row_ind, col_ind) if r == row), None)
            gate = 100.0 if p.last_real_pos is None or (
                assigned is not None and (row, assigned) in appearance_reassociation_pairs
            ) else 25.0
            if p.track_id is not None and any(d.get("track_id") == p.track_id for d in matched.values()):
                p.track_id = None
                p.last_bbox = None
                p.last_real_pos = None
                p.last_ground_pt = None
                p.last_pose = None
                p.missed_frames = 30
                p.identity_needs_reacquisition = True
            p.missed_frames += 1
            if assigned is None or cost_matrix[row, assigned] >= gate:
                p.identity_confirmation_frames = 0
                p.identity_confirmation_track = None

    return matched, cost_breakdowns, raw_tracker_id_switches, semantic_player_id_switches
