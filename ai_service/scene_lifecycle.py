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

    def to_dict(self) -> dict[str, Any]:
        return {
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

        # 3. Calculate explicit metric validity and write permissions
        # RULE: Scene state name alone must NEVER be used as the sole proof that metrics are valid!
        is_metric_valid = (
            target_state in (SceneState.COURT_PLAY, SceneState.COURT_IDLE)
            and self.calibration_context.is_metric_valid
            and not is_pan_tilt_zoom
            and not cut_detected
            and not (self._manual_override_state is not None and self._manual_override_state not in (SceneState.COURT_PLAY, SceneState.COURT_IDLE))
        )

        # Replay, transitions, side play, close-ups, and uncalibrated scenes must NEVER write canonical match statistics
        allow_canonical_writes = (
            target_state is SceneState.COURT_PLAY
            and is_metric_valid
            and not is_pan_tilt_zoom
            and not cut_detected
        )

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
        )

        self.current_state = target_state
        self.last_transition = transition
        self.transition_history.append(transition)
        return transition
