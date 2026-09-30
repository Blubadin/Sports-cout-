"""Coarse scene and state logic with camera segment lifecycle management.

Follows the zero-heavy-classifier requirement: utilizes lightweight heuristics,
deterministic motion signals (OpenCV optical flow and geometry),
camera cut detection, player visibility, and court geometry to maintain
strict segment boundaries, replay protection, and metric validity.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Callable, Sequence
from uuid import uuid4

import cv2
import numpy as np

from calibration_contract import CalibrationContext, CalibrationState
from camera_cut_detector import CameraCutDetector


class SceneState(str, Enum):
    """Canonical coarse scene states for SportsScout tracking workstation."""
    COURT_PLAY = "COURT_PLAY"
    COURT_IDLE = "COURT_IDLE"
    SIDE_PLAY = "SIDE_PLAY"
    CLOSE_UP = "CLOSE_UP"
    REPLAY = "REPLAY"
    CAMERA_TRANSITION = "CAMERA_TRANSITION"
    UNKNOWN = "UNKNOWN"


@dataclass
class SceneEvidence:
    """Verifiable signals and heuristic outputs supporting a scene state."""
    camera_cut_detected: bool = False
    court_visible: bool = False
    court_edge_coverage: float = 0.0
    calibration_state: str = "UNCALIBRATED"
    calibration_confidence: float | None = None
    player_count: int = 0
    max_player_box_area_ratio: float = 0.0
    global_motion_magnitude: float = 0.0
    is_pan_tilt_zoom: bool = False
    is_replay_cue: bool = False
    manual_override: bool = False
    manual_override_by: str | None = None
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CapabilityGate:
    """Explicit capability gate evaluated from scene, calibration, and observation quality."""
    enabled: bool
    reason: str
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "reason": self.reason,
            "confidence": round(float(self.confidence), 3),
        }


@dataclass
class SegmentCapabilities:
    """Canonical 6 consumer capability gates per camera segment/frame."""
    can_track_player: CapabilityGate
    can_track_shuttle: CapabilityGate
    can_use_court_metric: CapabilityGate
    can_build_heatmap: CapabilityGate
    can_estimate_hit: CapabilityGate
    can_write_canonical_match_data: CapabilityGate

    def to_dict(self) -> dict[str, Any]:
        return {
            "canTrackPlayer": self.can_track_player.to_dict(),
            "canTrackShuttle": self.can_track_shuttle.to_dict(),
            "canUseCourtMetric": self.can_use_court_metric.to_dict(),
            "canBuildHeatmap": self.can_build_heatmap.to_dict(),
            "canEstimateHit": self.can_estimate_hit.to_dict(),
            "canWriteCanonicalMatchData": self.can_write_canonical_match_data.to_dict(),
        }


def compute_capabilities(
    target_state: SceneState,
    calibration_context: CalibrationContext,
    evidence: SceneEvidence,
    has_valid_ground_measurement: bool = True,
) -> SegmentCapabilities:
    """Unified source of truth deriving the 6 consumer capability gates.

    Never concludes capability from scene state name alone. Evaluates calibration validity,
    visual observation feasibility, optical flow/motion continuity, and canonical write rules.
    """
    # 1. canTrackPlayer: 2D player and pose tracking
    # Rule: calibration invalid != disable player/shuttle/pose.
    # Player tracking is active across court play, court idle, side play, close-up, and replay.
    # It is suspended only during camera cut / transition or empty frames.
    if target_state is SceneState.CAMERA_TRANSITION or evidence.camera_cut_detected:
        can_track_player = CapabilityGate(
            enabled=False,
            reason="Camera cut or transition active; 2D athlete tracking temporarily suspended",
            confidence=0.0,
        )
    elif target_state is SceneState.UNKNOWN and evidence.player_count == 0:
        can_track_player = CapabilityGate(
            enabled=False,
            reason="Ambiguous non-court scene without detected athletes",
            confidence=0.30,
        )
    else:
        player_conf = 0.95 if evidence.player_count > 0 else 0.85
        can_track_player = CapabilityGate(
            enabled=True,
            reason="2D player detection and pose tracking active in camera view",
            confidence=player_conf,
        )

    # 2. canTrackShuttle: 2D shuttle detection and trajectory tracking
    # Feasible when wide court or playing field is visible (court play, idle, side play, replay).
    # In close-up, field of view is too narrow to observe shuttle trajectory.
    if target_state is SceneState.CLOSE_UP:
        can_track_shuttle = CapabilityGate(
            enabled=False,
            reason="Close-up athlete view: field of play too narrow for shuttle trajectory",
            confidence=0.0,
        )
    elif target_state is SceneState.CAMERA_TRANSITION or evidence.camera_cut_detected:
        can_track_shuttle = CapabilityGate(
            enabled=False,
            reason="Camera cut or transition active: visual discontinuity across frame",
            confidence=0.0,
        )
    elif target_state is SceneState.UNKNOWN:
        can_track_shuttle = CapabilityGate(
            enabled=False,
            reason="Ambiguous or non-court scene: shuttle tracking unavailable",
            confidence=0.0,
        )
    else:
        can_track_shuttle = CapabilityGate(
            enabled=True,
            reason="Court field in view for shuttle detection and trajectory tracking",
            confidence=0.90,
        )

    # 3. canUseCourtMetric: physical metric court coordinates (meters/zones/speeds)
    # Strictly requires:
    #   - calibration_context.is_metric_valid
    #   - scene state in (COURT_PLAY, COURT_IDLE)
    #   - not pan/tilt/zoom drift
    #   - not camera cut
    #   - not side play, close up, replay, transition, unknown
    if target_state is SceneState.CAMERA_TRANSITION or evidence.camera_cut_detected:
        can_use_court_metric = CapabilityGate(
            enabled=False,
            reason="Camera cut or transition in progress: metric coordinates unavailable",
            confidence=0.0,
        )
    elif evidence.is_pan_tilt_zoom:
        can_use_court_metric = CapabilityGate(
            enabled=False,
            reason="Camera motion drift detected: metric homography suspended",
            confidence=0.0,
        )
    elif target_state is SceneState.CLOSE_UP:
        can_use_court_metric = CapabilityGate(
            enabled=False,
            reason="Close-up perspective: court surface obscured or zoomed; metric mapping disabled",
            confidence=0.0,
        )
    elif target_state is SceneState.SIDE_PLAY:
        can_use_court_metric = CapabilityGate(
            enabled=False,
            reason="Unsupported side view: court homography not calibrated for side angle",
            confidence=0.0,
        )
    elif target_state is SceneState.REPLAY:
        can_use_court_metric = CapabilityGate(
            enabled=False,
            reason="Replay footage: metric court tracking suspended for review footage",
            confidence=0.0,
        )
    elif target_state is SceneState.UNKNOWN:
        can_use_court_metric = CapabilityGate(
            enabled=False,
            reason="Unknown scene state: metric coordinates unavailable",
            confidence=0.0,
        )
    elif not calibration_context.is_metric_valid:
        cal_state = calibration_context.state
        if cal_state is CalibrationState.RECALIBRATING:
            reason = "Court recalibration in progress: metric coordinates suspended"
        elif cal_state is CalibrationState.CALIBRATION_LOST:
            reason = "Court calibration lost: metric coordinates suspended awaiting recovery"
        else:
            reason = "Court uncalibrated: metric coordinates suspended"
        can_use_court_metric = CapabilityGate(
            enabled=False,
            reason=reason,
            confidence=0.0,
        )
    else:
        metric_conf = evidence.calibration_confidence if evidence.calibration_confidence is not None else 0.95
        can_use_court_metric = CapabilityGate(
            enabled=True,
            reason="Calibrated court view with locked homography and valid physical projection",
            confidence=metric_conf,
        )

    # 4. canBuildHeatmap: occupancy density accumulation
    # Requires valid court metric AND actual valid ground measurement.
    # Strictly prohibited from backfilling (0, 0) or repeating last-known position.
    if not can_use_court_metric.enabled:
        can_build_heatmap = CapabilityGate(
            enabled=False,
            reason="Heatmap accumulation requires locked court metric calibration (zero/last-known fill prohibited)",
            confidence=0.0,
        )
    elif not has_valid_ground_measurement:
        can_build_heatmap = CapabilityGate(
            enabled=False,
            reason="Ground point projection unresolved; skipping heatmap binning to prevent zero-coordinate artifact",
            confidence=0.0,
        )
    else:
        can_build_heatmap = CapabilityGate(
            enabled=True,
            reason="Locked court calibration with valid ground position mapping for heatmap binning",
            confidence=can_use_court_metric.confidence,
        )

    # 5. canEstimateHit: Contract readiness gate for downstream hit/stroke engine
    # Contract readiness only: verifies player, shuttle, and court metrics are all available.
    if can_track_player.enabled and can_track_shuttle.enabled and can_use_court_metric.enabled:
        hit_conf = min(can_track_player.confidence, can_track_shuttle.confidence, can_use_court_metric.confidence)
        can_estimate_hit = CapabilityGate(
            enabled=True,
            reason="Hit estimation contract ready (player, shuttle, and court metrics available)",
            confidence=round(hit_conf, 3),
        )
    else:
        missing = []
        if not can_track_player.enabled:
            missing.append("player tracking")
        if not can_track_shuttle.enabled:
            missing.append("shuttle tracking")
        if not can_use_court_metric.enabled:
            missing.append("court metric calibration")
        can_estimate_hit = CapabilityGate(
            enabled=False,
            reason=f"Hit estimation contract unavailable: requires {', '.join(missing)}",
            confidence=0.0,
        )

    # 6. canWriteCanonicalMatchData: authority to commit permanent match statistics
    # Strictly separated from raw/image-space observation storage.
    # Allowed ONLY during live COURT_PLAY on a calibrated court without replay/cut/drift.
    if target_state is SceneState.REPLAY or evidence.is_replay_cue:
        can_write_canonical_match_data = CapabilityGate(
            enabled=False,
            reason="Replay segment: canonical match writes prohibited to prevent duplicate statistics",
            confidence=0.0,
        )
    elif target_state is SceneState.COURT_IDLE:
        can_write_canonical_match_data = CapabilityGate(
            enabled=False,
            reason="Court idle interval: excluded from live canonical match rally statistics",
            confidence=0.0,
        )
    elif not can_use_court_metric.enabled:
        can_write_canonical_match_data = CapabilityGate(
            enabled=False,
            reason=f"Canonical match writes suspended: {can_use_court_metric.reason}",
            confidence=0.0,
        )
    elif target_state is not SceneState.COURT_PLAY:
        can_write_canonical_match_data = CapabilityGate(
            enabled=False,
            reason=f"Canonical match writes prohibited in {target_state.value} scene state",
            confidence=0.0,
        )
    else:
        can_write_canonical_match_data = CapabilityGate(
            enabled=True,
            reason="Live match play on calibrated court: authorized for canonical match statistics",
            confidence=0.95,
        )

    return SegmentCapabilities(
        can_track_player=can_track_player,
        can_track_shuttle=can_track_shuttle,
        can_use_court_metric=can_use_court_metric,
        can_build_heatmap=can_build_heatmap,
        can_estimate_hit=can_estimate_hit,
        can_write_canonical_match_data=can_write_canonical_match_data,
    )


@dataclass
class SceneStateTransition:
    """State transition contract with explicit metric validity and write permissions."""
    transition_id: str
    camera_segment_id: str
    frame_index: int
    timestamp_sec: float
    from_state: SceneState
    to_state: SceneState
    confidence: float
    reason: str
    evidence: SceneEvidence
    is_metric_valid: bool
    allow_canonical_writes: bool
    capabilities: SegmentCapabilities | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "transitionId": self.transition_id,
            "cameraSegmentId": self.camera_segment_id,
            "frameIndex": self.frame_index,
            "timestampSec": round(self.timestamp_sec, 3),
            "fromState": self.from_state.value,
            "toState": self.to_state.value,
            "confidence": round(self.confidence, 3),
            "reason": self.reason,
            "evidence": self.evidence.to_dict(),
            "isMetricValid": self.is_metric_valid,
            "allowCanonicalWrites": self.allow_canonical_writes,
        }
        if self.capabilities is not None:
            d["capabilities"] = self.capabilities.to_dict()
            d["canTrackPlayer"] = self.capabilities.can_track_player.enabled
            d["canTrackShuttle"] = self.capabilities.can_track_shuttle.enabled
            d["canUseCourtMetric"] = self.capabilities.can_use_court_metric.enabled
            d["canBuildHeatmap"] = self.capabilities.can_build_heatmap.enabled
            d["canEstimateHit"] = self.capabilities.can_estimate_hit.enabled
            d["canWriteCanonicalMatchData"] = self.capabilities.can_write_canonical_match_data.enabled
        return d


class PanTiltZoomDetector:
    """Lightweight deterministic camera motion detector using sparse optical flow.

    Estimates dominant camera motion (pan/tilt) and zoom drift across downsampled frames.
    The median flow vector isolates camera translation from localized athlete movement.
    """

    def __init__(
        self,
        pan_threshold_px: float = 1.75,
        zoom_threshold_ratio: float = 0.035,
        downsample_size: tuple[int, int] = (160, 120),
    ) -> None:
        self.pan_threshold_px = pan_threshold_px
        self.zoom_threshold_ratio = zoom_threshold_ratio
        self.downsample_size = downsample_size
        self._prev_gray: np.ndarray | None = None

        # Fixed sampling grid across the central area (20% to 80% span)
        y, x = np.mgrid[24:96:6j, 32:128:8j].reshape(2, -1)
        self._grid_pts = np.stack([x, y], axis=1).astype(np.float32).reshape(-1, 1, 2)

    def reset(self) -> None:
        """Clear temporal motion history on segment boundary or external reset."""
        self._prev_gray = None

    def observe(self, frame: np.ndarray) -> tuple[float, bool, str]:
        """Estimate global motion magnitude and pan/tilt/zoom flag.

        Returns:
            (motion_magnitude, is_pan_tilt_zoom, reason)
        """
        if frame is None or frame.size == 0:
            return 0.0, False, "Empty frame"

        gray = cv2.cvtColor(
            cv2.resize(frame, self.downsample_size, interpolation=cv2.INTER_AREA),
            cv2.COLOR_BGR2GRAY,
        )

        if self._prev_gray is None:
            self._prev_gray = gray
            return 0.0, False, "Initial frame"

        prev_gray = self._prev_gray
        self._prev_gray = gray

        p1, status, _ = cv2.calcOpticalFlowPyrLK(
            prev_gray,
            gray,
            self._grid_pts,
            None,
            winSize=(15, 15),
            maxLevel=2,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03),
        )

        if p1 is None or status is None:
            return 0.0, False, "Optical flow tracking failed"

        valid = status.flatten() == 1
        if np.count_nonzero(valid) < 8:
            return 0.0, False, "Insufficient tracked features"

        p0_valid = self._grid_pts[valid].reshape(-1, 2)
        p1_valid = p1[valid].reshape(-1, 2)

        shifts = p1_valid - p0_valid
        median_shift = np.median(shifts, axis=0)
        pan_tilt_mag = float(np.linalg.norm(median_shift))

        is_pan_tilt = pan_tilt_mag >= self.pan_threshold_px

        is_zoom = False
        zoom_drift = 0.0
        try:
            affine, _ = cv2.estimateAffinePartial2D(p0_valid, p1_valid)
            if affine is not None:
                scale = float(np.sqrt(affine[0, 0] ** 2 + affine[1, 0] ** 2))
                zoom_drift = abs(scale - 1.0)
                is_zoom = zoom_drift >= self.zoom_threshold_ratio
        except Exception:
            pass

        if is_pan_tilt:
            return pan_tilt_mag, True, f"Camera pan/tilt detected: {pan_tilt_mag:.2f}px shift"
        if is_zoom:
            return zoom_drift * 100.0, True, f"Camera zoom detected: {zoom_drift * 100.0:.1f}% scale change"

        return pan_tilt_mag, False, "Static camera"


class CameraSegmentLifecycleManager:
    """Manages scene state transitions, camera segments, and metric validity.

    Coordinates camera cut detection, motion drift, close-ups, replays, and side views.
    Ensures that scene state name alone is NEVER the sole evidence of metric validity.
    """

    def __init__(
        self,
        calibration_context: CalibrationContext | None = None,
        camera_cut_detector: CameraCutDetector | None = None,
        motion_detector: PanTiltZoomDetector | None = None,
        on_cut_callback: Callable[[], None] | None = None,
        close_up_area_ratio_threshold: float = 0.20,
    ) -> None:
        self.calibration_context = calibration_context or CalibrationContext()
        self.camera_cut_detector = camera_cut_detector or CameraCutDetector()
        self.motion_detector = motion_detector or PanTiltZoomDetector()
        self.on_cut_callback = on_cut_callback
        self.close_up_area_ratio_threshold = close_up_area_ratio_threshold

        self.current_state = SceneState.UNKNOWN
        self.current_segment_id = self.calibration_context.camera_segment_id
        self.transition_history: list[SceneStateTransition] = []
        self.last_transition: SceneStateTransition | None = None

        # Manual override state with strict provenance
        self._manual_override_state: SceneState | None = None
        self._manual_override_by: str | None = None
        self._manual_override_reason: str | None = None
        self._manual_override_timestamp: float | None = None

        # Quality and latency metrics
        self.false_valid_calibration_count = 0
        self.transition_latency_frames = 0
        self.relock_latency_frames = 0
        self._frames_since_court_return: int | None = None

    @property
    def camera_segment_id(self) -> str:
        return self.calibration_context.camera_segment_id

    def is_observation_accepted(self, observation_camera_segment_id: str | None) -> bool:
        """Reject late or stale observations from older camera segments."""
        if not observation_camera_segment_id:
            return False
        return observation_camera_segment_id == self.camera_segment_id

    def set_manual_override(
        self,
        state: SceneState,
        override_by: str,
        reason: str,
        timestamp_sec: float | None = None,
    ) -> None:
        """Set a manual scene state override with recorded provenance."""
        if not override_by or not reason:
            raise ValueError("Manual scene override requires explicit override_by and reason")
        self._manual_override_state = state
        self._manual_override_by = override_by
        self._manual_override_reason = reason
        self._manual_override_timestamp = timestamp_sec

    def clear_manual_override(self) -> None:
        """Clear manual override and return to automated heuristic classification."""
        self._manual_override_state = None
        self._manual_override_by = None
        self._manual_override_reason = None
        self._manual_override_timestamp = None

    def notify_cut(self, frame_index: int = 0, timestamp_sec: float = 0.0) -> None:
        """Handle hard camera cut: reset motion signals and advance segment index."""
        self.motion_detector.reset()
        self._frames_since_court_return = None
        if self.calibration_context.camera_segment_id == self.current_segment_id:
            self.calibration_context.start_camera_segment()
        self.current_segment_id = self.calibration_context.camera_segment_id

    def evaluate_frame(
        self,
        frame: np.ndarray,
        frame_index: int,
        timestamp_sec: float,
        player_bboxes: Sequence[Sequence[float]] | None = None,
        is_side_view_cue: bool = False,
        is_replay_cue: bool = False,
        cut_detected: bool | None = None,
    ) -> SceneStateTransition:
        """Process incoming frame signals and evaluate the canonical state transition."""
        h, w = frame.shape[:2] if frame is not None and frame.size > 0 else (720, 1280)
        frame_area = float(w * h)

        # 1. Compute visual cues
        if cut_detected is None:
            cut_detected = self.camera_cut_detector.observe(frame)
            if cut_detected:
                self.notify_cut(frame_index=frame_index, timestamp_sec=timestamp_sec)
                if self.on_cut_callback is not None:
                    self.on_cut_callback()
        motion_mag, is_pan_tilt_zoom, motion_reason = self.motion_detector.observe(frame)

        # Player bbox area ratio
        max_box_area_ratio = 0.0
        player_count = 0
        if player_bboxes:
            player_count = len(player_bboxes)
            for box in player_bboxes:
                if len(box) >= 4:
                    bw = max(0.0, float(box[2]) - float(box[0]))
                    bh = max(0.0, float(box[3]) - float(box[1]))
                    ratio = (bw * bh) / frame_area if frame_area > 0 else 0.0
                    if ratio > max_box_area_ratio:
                        max_box_area_ratio = ratio

        # Court edge coverage
        small_gray = cv2.cvtColor(
            cv2.resize(frame, (96, 72), interpolation=cv2.INTER_AREA),
            cv2.COLOR_BGR2GRAY,
        )
        edges = cv2.Canny(small_gray, 35, 90) > 0
        court_edge_coverage = float(np.mean(edges))
        court_visible = (
            court_edge_coverage >= 0.018
            or self.calibration_context.state is CalibrationState.CALIBRATED
        )

        cal_state_str = self.calibration_context.state.value
        cal_confidence = (
            self.calibration_context.provenance.confidence
            if self.calibration_context.provenance
            else None
        )

        # Build evidence
        evidence = SceneEvidence(
            camera_cut_detected=cut_detected,
            court_visible=court_visible,
            court_edge_coverage=court_edge_coverage,
            calibration_state=cal_state_str,
            calibration_confidence=cal_confidence,
            player_count=player_count,
            max_player_box_area_ratio=max_box_area_ratio,
            global_motion_magnitude=motion_mag,
            is_pan_tilt_zoom=is_pan_tilt_zoom,
            is_replay_cue=is_replay_cue,
            manual_override=self._manual_override_state is not None,
            manual_override_by=self._manual_override_by,
            notes=self._manual_override_reason,
        )

        # 2. Determine target state, reason, and confidence
        target_state: SceneState
        reason: str
        confidence: float

        if self._manual_override_state is not None:
            target_state = self._manual_override_state
            reason = f"Manual override: {self._manual_override_reason} (by {self._manual_override_by})"
            confidence = 1.0

        elif cut_detected:
            # Action: handle hard cut
            self.notify_cut(frame_index=frame_index, timestamp_sec=timestamp_sec)
            target_state = SceneState.CAMERA_TRANSITION
            reason = "Hard camera cut detected: visual discontinuity across frame"
            confidence = 0.95
            evidence.calibration_state = self.calibration_context.state.value

        elif is_pan_tilt_zoom:
            # Action: motion drift invalidates court homography
            if self.calibration_context.state is CalibrationState.CALIBRATED:
                self.calibration_context.lose()
            target_state = SceneState.CAMERA_TRANSITION
            reason = motion_reason
            confidence = 0.90
            evidence.calibration_state = self.calibration_context.state.value

        elif is_replay_cue:
            target_state = SceneState.REPLAY
            reason = "Replay cue flagged"
            confidence = 0.90

        elif max_box_area_ratio >= self.close_up_area_ratio_threshold:
            target_state = SceneState.CLOSE_UP
            reason = f"Close-up detected: player box area ratio {max_box_area_ratio:.2f} >= {self.close_up_area_ratio_threshold:.2f}"
            confidence = 0.92

        elif is_side_view_cue:
            target_state = SceneState.SIDE_PLAY
            reason = "Side-angle / non-calibrated court view"
            confidence = 0.88

        elif self.calibration_context.is_metric_valid:
            if player_count >= 1:
                target_state = SceneState.COURT_PLAY
                reason = "Calibrated court view with active players"
                confidence = 0.95
            else:
                target_state = SceneState.COURT_IDLE
                reason = "Calibrated court view without active players"
                confidence = 0.85

        elif court_visible:
            # Court lines visible but not yet calibrated
            target_state = SceneState.COURT_IDLE
            reason = "Court visible, calibration not locked"
            confidence = 0.70

        else:
            # Uncertain / ambiguous scene defaults to UNKNOWN
            target_state = SceneState.UNKNOWN
            reason = "Ambiguous scene: neither calibrated court nor clear feature"
            confidence = 0.50

        # 3. Calculate explicit consumer capability gates
        capabilities = compute_capabilities(
            target_state=target_state,
            calibration_context=self.calibration_context,
            evidence=evidence,
            has_valid_ground_measurement=True,
        )
        is_metric_valid = capabilities.can_use_court_metric.enabled
        allow_canonical_writes = capabilities.can_write_canonical_match_data.enabled

        # 4. Latency and False-Valid Diagnostics
        if is_metric_valid and target_state not in (SceneState.COURT_PLAY, SceneState.COURT_IDLE):
            self.false_valid_calibration_count += 1

        if target_state is SceneState.CAMERA_TRANSITION:
            self.transition_latency_frames = 1
            self._frames_since_court_return = None
        elif target_state is SceneState.COURT_PLAY:
            if self._frames_since_court_return is not None and not is_metric_valid:
                self._frames_since_court_return += 1
            elif is_metric_valid and self._frames_since_court_return is not None:
                self.relock_latency_frames = self._frames_since_court_return
                self._frames_since_court_return = None

        # Build transition
        transition = SceneStateTransition(
            transition_id=f"st-{uuid4().hex[:12]}",
            camera_segment_id=self.camera_segment_id,
            frame_index=frame_index,
            timestamp_sec=timestamp_sec,
            from_state=self.current_state,
            to_state=target_state,
            confidence=confidence,
            reason=reason,
            evidence=evidence,
            is_metric_valid=is_metric_valid,
            allow_canonical_writes=allow_canonical_writes,
            capabilities=capabilities,
        )

        self.current_state = target_state
        self.last_transition = transition
        self.transition_history.append(transition)
        return transition
