"""
pose_detector.py — Ultralytics YOLO Pose Detector for Badminton Analytics
(Refactored from alphapose_detector.py per Specification §80-86)

Pipeline (PDF §81):
  Frame -> Person Detector / MOT -> Player Identity -> Player ROI -> Pose Detector

Rules (PDF §82-85):
  - Every joint must have a confidence score.
  - Low-confidence joints (< threshold) must NOT be used for angle calculations.
  - Computes 2D estimates: Knee angle, Elbow angle, Trunk lean, Stance width,
    Lunge detection, Overhead arm position, Airborne candidate.
  - NEVER claims Ground Reaction Force, Joint Torque, True Center of Mass,
    True 3D joint angles, or Jump Height (PDF §84, §85).
"""

from __future__ import annotations
import math
from typing import Any
import cv2
import numpy as np

# 17 COCO Keypoint Indices
KPT_NOSE = 0
KPT_L_EYE = 1
KPT_R_EYE = 2
KPT_L_EAR = 3
KPT_R_EAR = 4
KPT_L_SHOULDER = 5
KPT_R_SHOULDER = 6
KPT_L_ELBOW = 7
KPT_R_ELBOW = 8
KPT_L_WRIST = 9
KPT_R_WRIST = 10
KPT_L_HIP = 11
KPT_R_HIP = 12
KPT_L_KNEE = 13
KPT_R_KNEE = 14
KPT_L_ANKLE = 15
KPT_R_ANKLE = 16

SKELETON_PAIRS = [
    (KPT_NOSE, KPT_L_EYE), (KPT_NOSE, KPT_R_EYE),
    (KPT_L_EYE, KPT_L_EAR), (KPT_R_EYE, KPT_R_EAR),
    (KPT_L_SHOULDER, KPT_R_SHOULDER),
    (KPT_L_SHOULDER, KPT_L_ELBOW), (KPT_L_ELBOW, KPT_L_WRIST),
    (KPT_R_SHOULDER, KPT_R_ELBOW), (KPT_R_ELBOW, KPT_R_WRIST),
    (KPT_L_SHOULDER, KPT_L_HIP), (KPT_R_SHOULDER, KPT_R_HIP),
    (KPT_L_HIP, KPT_R_HIP),
    (KPT_L_HIP, KPT_L_KNEE), (KPT_L_KNEE, KPT_L_ANKLE),
    (KPT_R_HIP, KPT_R_KNEE), (KPT_R_KNEE, KPT_R_ANKLE),
]


def calculate_2d_angle(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
) -> float:
    """Calculate 2D angle in degrees at vertex B formed by segments BA and BC."""
    v_ba = (a[0] - b[0], a[1] - b[1])
    v_bc = (c[0] - b[0], c[1] - b[1])

    mag_ba = math.hypot(v_ba[0], v_ba[1])
    mag_bc = math.hypot(v_bc[0], v_bc[1])
    if mag_ba < 1e-5 or mag_bc < 1e-5:
        return 0.0

    dot = v_ba[0] * v_bc[0] + v_ba[1] * v_bc[1]
    cos_angle = max(-1.0, min(1.0, dot / (mag_ba * mag_bc)))
    return round(math.degrees(math.acos(cos_angle)), 1)


class YoloPoseDetector:
    """
    Ultralytics YOLO Pose Detector (YOLOv8n-pose / YOLOv11n-pose).
    Operates after player detection and tracking on athlete ROI crops (PDF §81).
    """

    def __init__(
        self,
        model_path: str = "yolov8n-pose.pt",
        conf_threshold: float = 0.4,
        device: str = "cpu",
    ):
        self.model_path = model_path
        self.conf = conf_threshold
        self.device = device
        self._model = None


    def _init_model(self):
        from ultralytics import YOLO
        self._model = YOLO(self.model_path)

    def estimate_pose_in_roi(
        self,
        frame: np.ndarray,
        player_bbox: list[float] | tuple[float, float, float, float],
    ) -> dict[str, Any]:
        """
        Estimate 17 keypoints for a specific tracked athlete ROI (PDF §81).
        player_bbox: [x1, y1, x2, y2] in full frame coordinates.
        """
        if self._model is None:
            self._init_model()
        h, w = frame.shape[:2]
        x1 = max(0, int(player_bbox[0]))
        y1 = max(0, int(player_bbox[1]))
        x2 = min(w, int(player_bbox[2]))
        y2 = min(h, int(player_bbox[3]))

        if x2 <= x1 or y2 <= y1:
            return {"keypoints": [], "metrics": {}}

        roi = frame[y1:y2, x1:x2]
        if roi.size == 0:
            return {"keypoints": [], "metrics": {}}

        keypoints: list[list[float]] = []

        if self._model is not None:
            results = self._model.predict(
                roi,
                conf=self.conf,
                device=self.device,
                verbose=False,
            )
            for r in results:
                if r.keypoints is None or len(r.keypoints) == 0:
                    continue
                kpts_xy = r.keypoints.xy.cpu().numpy()
                kpts_conf = (
                    r.keypoints.conf.cpu().numpy()
                    if r.keypoints.conf is not None
                    else np.zeros((len(kpts_xy), 17))
                )

                if len(kpts_xy) > 0:
                    person_kpts = kpts_xy[0]
                    person_conf = kpts_conf[0]
                    for idx in range(min(17, len(person_kpts))):
                        kx, ky = person_kpts[idx]
                        kconf = float(person_conf[idx])
                        # Map back to full frame coordinates
                        keypoints.append([
                            round(float(kx + x1), 1),
                            round(float(ky + y1), 1),
                            round(kconf, 2),
                        ])
                    break

        # If model is unavailable or no person detected in ROI, return empty
        if len(keypoints) < 17:
            return {"keypoints": keypoints, "metrics": {}}

        # Compute 2D body metrics according to PDF §82-85
        metrics = self.compute_2d_body_metrics(keypoints, [x1, y1, x2, y2])
        return {"keypoints": keypoints, "metrics": metrics}

    def compute_2d_body_metrics(
        self,
        keypoints: list[list[float]],
        bbox: list[float] | None = None,
        conf_threshold: float = 0.4,
    ) -> dict[str, Any]:
        """
        Compute valid 2D biomechanical estimates from 17 keypoints (PDF §82, §83, §85).
        Joints below conf_threshold are rejected to avoid spurious kinematics.
        """
        if not keypoints or len(keypoints) < 17:
            return {}

        def get_kpt(idx: int) -> tuple[float, float] | None:
            if idx >= len(keypoints):
                return None
            x, y, conf = keypoints[idx]
            if conf < conf_threshold or (x == 0 and y == 0):
                return None
            return (x, y)

        r_hip = get_kpt(KPT_R_HIP)
        r_knee = get_kpt(KPT_R_KNEE)
        r_ankle = get_kpt(KPT_R_ANKLE)

        l_hip = get_kpt(KPT_L_HIP)
        l_knee = get_kpt(KPT_L_KNEE)
        l_ankle = get_kpt(KPT_L_ANKLE)

        r_shoulder = get_kpt(KPT_R_SHOULDER)
        r_elbow = get_kpt(KPT_R_ELBOW)
        r_wrist = get_kpt(KPT_R_WRIST)

        l_shoulder = get_kpt(KPT_L_SHOULDER)
        l_elbow = get_kpt(KPT_L_ELBOW)
        l_wrist = get_kpt(KPT_L_WRIST)

        nose = get_kpt(KPT_NOSE)

        metrics: dict[str, Any] = {}

        # 1. Right & Left Knee angles
        if r_hip and r_knee and r_ankle:
            metrics["right_knee_angle_deg"] = calculate_2d_angle(r_hip, r_knee, r_ankle)
        if l_hip and l_knee and l_ankle:
            metrics["left_knee_angle_deg"] = calculate_2d_angle(l_hip, l_knee, l_ankle)

        # 2. Right & Left Elbow angles
        if r_shoulder and r_elbow and r_wrist:
            metrics["right_elbow_angle_deg"] = calculate_2d_angle(r_shoulder, r_elbow, r_wrist)
        if l_shoulder and l_elbow and l_wrist:
            metrics["left_elbow_angle_deg"] = calculate_2d_angle(l_shoulder, l_elbow, l_wrist)

        # 3. Trunk lean (angle of spine vector relative to vertical)
        hip_center = None
        if r_hip and l_hip:
            hip_center = ((r_hip[0] + l_hip[0]) / 2.0, (r_hip[1] + l_hip[1]) / 2.0)
        elif r_hip:
            hip_center = r_hip
        elif l_hip:
            hip_center = l_hip

        shoulder_center = None
        if r_shoulder and l_shoulder:
            shoulder_center = ((r_shoulder[0] + l_shoulder[0]) / 2.0, (r_shoulder[1] + l_shoulder[1]) / 2.0)
        elif r_shoulder:
            shoulder_center = r_shoulder
        elif l_shoulder:
            shoulder_center = l_shoulder

        if hip_center and shoulder_center:
            dx = shoulder_center[0] - hip_center[0]
            dy = shoulder_center[1] - hip_center[1]
            # Lean angle relative to vertical (0 deg = upright, 90 deg = horizontal)
            lean_deg = abs(math.degrees(math.atan2(dx, -dy)))
            metrics["trunk_lean_deg"] = round(lean_deg, 1)

        # 4. Stance width (horizontal distance between ankles)
        if r_ankle and l_ankle:
            metrics["stance_width_px"] = round(abs(r_ankle[0] - l_ankle[0]), 1)

        # 5. Lunge detection (one knee flexed < 130 deg while ankles wide)
        lunge_detected = False
        if metrics.get("stance_width_px", 0) > 40:
            rk = metrics.get("right_knee_angle_deg")
            lk = metrics.get("left_knee_angle_deg")
            if (rk is not None and rk < 130.0) or (lk is not None and lk < 130.0):
                lunge_detected = True
        metrics["lunge_detected"] = lunge_detected

        # 6. Overhead arm position
        overhead_arm = False
        head_y = nose[1] if nose else (shoulder_center[1] if shoulder_center else None)
        if head_y is not None:
            if (r_wrist and r_wrist[1] < head_y) or (l_wrist and l_wrist[1] < head_y):
                overhead_arm = True
        metrics["overhead_arm_detected"] = overhead_arm

        # 7. Airborne candidate (PDF §85 — NOT called jump height)
        airborne_candidate = False
        if bbox is not None and len(bbox) >= 4 and r_ankle and l_ankle:
            box_bottom = bbox[3]
            lowest_ankle = max(r_ankle[1], l_ankle[1])
            # If both ankles are noticeably above the bounding box bottom
            if box_bottom - lowest_ankle > 25.0:
                airborne_candidate = True
        metrics["airborne_candidate"] = airborne_candidate

        return metrics

    @staticmethod
    def draw_skeleton(
        frame: np.ndarray,
        keypoints: list[list[float]],
        color: tuple[int, int, int] = (0, 255, 200),
        conf_threshold: float = 0.4,
    ) -> np.ndarray:
        """Render skeleton onto frame with confidence filtering (PDF §86)."""
        vis = frame.copy()
        pts = keypoints

        for i1, i2 in SKELETON_PAIRS:
            if i1 < len(pts) and i2 < len(pts):
                p1, p2 = pts[i1], pts[i2]
                if len(p1) >= 3 and len(p2) >= 3:
                    if p1[2] >= conf_threshold and p2[2] >= conf_threshold:
                        pt1 = (int(p1[0]), int(p1[1]))
                        pt2 = (int(p2[0]), int(p2[1]))
                        cv2.line(vis, pt1, pt2, color, 2, cv2.LINE_AA)

        for pt in pts:
            if len(pt) >= 3 and pt[2] >= conf_threshold:
                pos = (int(pt[0]), int(pt[1]))
                cv2.circle(vis, pos, 4, (255, 255, 255), -1)
                cv2.circle(vis, pos, 2, color, -1)

        return vis


# Backward-compatible alias
AlphaPoseDetector = YoloPoseDetector
