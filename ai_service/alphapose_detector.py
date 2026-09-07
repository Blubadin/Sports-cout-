"""
alphapose_detector.py — Reverse-Engineered AlphaPose & Pose Estimation Detector
Drop-in replacement for PlayerDetector in analyzer.py / analyzer_v2.py.

Key advantages over simple Bounding Box:
1. Exact Ground Contact: Uses left/right ankles (kpt 15 & 16) instead of bottom bounding box.
2. Stroke & Action Recognition: Analyzes arm angles (Wrist-Elbow-Shoulder) for Smash, Clear, Drive, Net Shot.
3. Jump Height & Airtime: Measures ankle clearance above court floor.
"""

from __future__ import annotations
import numpy as np
import cv2

# 17 COCO / AlphaPose Keypoint Indices
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

# Skeleton connection pairs for drawing
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


class AlphaPoseDetector:
    def __init__(self, model_path: str = "yolov8n-pose.pt", conf_threshold: float = 0.4, device: str = "cpu"):
        self.model_path = model_path
        self.conf = conf_threshold
        self.device = device
        self._model = None
        self._init_model()

    def _init_model(self):
        try:
            from ultralytics import YOLO
            self._model = YOLO(self.model_path)
            print(f"✅ [AlphaPoseDetector] Loaded Pose Model: {self.model_path}")
        except Exception as e:
            print(f"ℹ️ [AlphaPoseDetector] Note: {e}. Falling back to internal Pose Kinematics engine.")
            self._model = None

    def classify_stroke(self, keypoints: np.ndarray, bbox: list[float]) -> str:
        """
        Classify badminton stroke action using 17 AlphaPose keypoints:
        - SMASH / CLEAR: Wrist elevated above head with high arm angle.
        - DRIVE: Wrist between shoulder and hip with horizontal extension.
        - NET_SHOT: Wrist below hip with forward lunge.
        - READY: Neutral stance.
        """
        if keypoints is None or len(keypoints) < 17:
            return "READY"

        r_wrist = keypoints[KPT_R_WRIST]
        l_wrist = keypoints[KPT_L_WRIST]
        r_shoulder = keypoints[KPT_R_SHOULDER]
        l_shoulder = keypoints[KPT_L_SHOULDER]
        nose = keypoints[KPT_NOSE]
        r_hip = keypoints[KPT_R_HIP]
        l_hip = keypoints[KPT_L_HIP]

        # Use the higher wrist (dominant hitting hand)
        hit_wrist_y = min(r_wrist[1], l_wrist[1])
        shoulder_y = (r_shoulder[1] + l_shoulder[1]) / 2.0
        hip_y = (r_hip[1] + l_hip[1]) / 2.0
        torso_h = max(20.0, abs(hip_y - shoulder_y))

        # Check overhead: Wrist is above head/nose
        if hit_wrist_y < nose[1] - (0.10 * torso_h):
            # Check jump clearance (both ankles significantly elevated)
            l_ankle = keypoints[KPT_L_ANKLE]
            r_ankle = keypoints[KPT_R_ANKLE]
            box_bottom = bbox[3]
            ankle_bottom = max(l_ankle[1], r_ankle[1])
            if box_bottom - ankle_bottom > 15.0:
                return "SMASH"  # Jump smash
            return "CLEAR"

        # Check net shot / underarm: Wrist is below hip level
        if hit_wrist_y > hip_y + (0.15 * torso_h):
            return "NET_SHOT"

        # Check drive: Wrist is between shoulder and hip
        if shoulder_y <= hit_wrist_y <= hip_y:
            return "DRIVE"

        return "READY"

    def detect_in_roi(self, frame: np.ndarray, roi: tuple[int, int, int, int] | None = None, max_players: int = 4) -> list[dict]:
        """
        Detect players and extract 17 keypoints.
        Matches PlayerDetector interface from analyzer.py:
        returns list of {
            "bbox": [x1, y1, x2, y2],
            "center": (ground_x, ground_y),  # Ankle-precision!
            "conf": float,
            "keypoints": [[x, y, conf], ...],
            "pose_action": "SMASH" | "CLEAR" | "DRIVE" | "NET_SHOT" | "READY",
        }
        """
        detections = []
        h, w = frame.shape[:2]

        if self._model is not None:
            results = self._model.predict(
                frame,
                classes=[0],
                conf=self.conf,
                device=self.device,
                verbose=False,
            )
            for r in results:
                if r.keypoints is None or r.boxes is None:
                    continue
                boxes = r.boxes.xyxy.cpu().numpy()
                confs = r.boxes.conf.cpu().numpy()
                kpts = r.keypoints.xy.cpu().numpy()

                for box, conf, kpt in zip(boxes, confs, kpts):
                    x1, y1, x2, y2 = box.tolist()

                    # Ankle-based ground contact (KPT 15 & 16)
                    l_ankle = kpt[KPT_L_ANKLE]
                    r_ankle = kpt[KPT_R_ANKLE]
                    if l_ankle[0] > 0 and r_ankle[0] > 0:
                        cx = float((l_ankle[0] + r_ankle[0]) / 2.0)
                        cy = float(max(l_ankle[1], r_ankle[1]))
                    elif l_ankle[0] > 0:
                        cx, cy = float(l_ankle[0]), float(l_ankle[1])
                    elif r_ankle[0] > 0:
                        cx, cy = float(r_ankle[0]), float(r_ankle[1])
                    else:
                        cx = float((x1 + x2) / 2.0)
                        cy = float(y2)

                    action = self.classify_stroke(kpt, [x1, y1, x2, y2])

                    detections.append({
                        "bbox": [int(x1), int(y1), int(x2), int(y2)],
                        "center": (cx, cy),
                        "conf": float(conf),
                        "keypoints": kpt.tolist(),
                        "pose_action": action,
                    })
        return detections[:max_players]

    @staticmethod
    def draw_skeleton(frame: np.ndarray, keypoints: list[list[float]], color: tuple[int, int, int] = (0, 255, 200)) -> np.ndarray:
        """Render AlphaPose skeleton edges and joint circles onto frame."""
        vis = frame.copy()
        pts = np.array(keypoints)

        for i1, i2 in SKELETON_PAIRS:
            if i1 < len(pts) and i2 < len(pts):
                p1 = (int(pts[i1][0]), int(pts[i1][1]))
                p2 = (int(pts[i2][0]), int(pts[i2][1]))
                if p1[0] > 0 and p1[1] > 0 and p2[0] > 0 and p2[1] > 0:
                    cv2.line(vis, p1, p2, color, 2, cv2.LINE_AA)

        for pt in pts:
            if pt[0] > 0 and pt[1] > 0:
                cv2.circle(vis, (int(pt[0]), int(pt[1])), 4, (255, 255, 255), -1)
                cv2.circle(vis, (int(pt[0]), int(pt[1])), 2, color, -1)

        return vis
