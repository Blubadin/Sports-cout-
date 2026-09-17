import unittest
import numpy as np
from ai_service.pose_detector import (
    YoloPoseDetector,
    calculate_2d_angle,
    KPT_NOSE,
    KPT_L_SHOULDER,
    KPT_R_SHOULDER,
    KPT_L_ELBOW,
    KPT_R_ELBOW,
    KPT_L_WRIST,
    KPT_R_WRIST,
    KPT_L_HIP,
    KPT_R_HIP,
    KPT_L_KNEE,
    KPT_R_KNEE,
    KPT_L_ANKLE,
    KPT_R_ANKLE,
)


class TestYoloPoseDetector(unittest.TestCase):
    def setUp(self):
        self.detector = YoloPoseDetector()

    def test_calculate_2d_angle_right_angle(self):
        # A=(0, 1), B=(0, 0), C=(1, 0) => 90 degrees
        angle = calculate_2d_angle((0.0, 1.0), (0.0, 0.0), (1.0, 0.0))
        self.assertAlmostEqual(angle, 90.0, places=1)

    def test_calculate_2d_angle_straight_line(self):
        # A=(-1, 0), B=(0, 0), C=(1, 0) => 180 degrees
        angle = calculate_2d_angle((-1.0, 0.0), (0.0, 0.0), (1.0, 0.0))
        self.assertAlmostEqual(angle, 180.0, places=1)

    def test_joint_confidence_filtering(self):
        """PDF §82: Low confidence joints must NOT be used for angle calculations."""
        # 17 keypoints with low confidence on right knee
        kpts = [[0.0, 0.0, 0.8] for _ in range(17)]
        kpts[KPT_R_HIP] = [100.0, 200.0, 0.9]
        kpts[KPT_R_KNEE] = [100.0, 250.0, 0.2]  # LOW CONFIDENCE (0.2 < 0.4)
        kpts[KPT_R_ANKLE] = [100.0, 300.0, 0.9]

        metrics = self.detector.compute_2d_body_metrics(kpts, conf_threshold=0.4)
        # Since knee confidence is 0.2, right_knee_angle_deg must not be calculated
        self.assertNotIn("right_knee_angle_deg", metrics)

    def test_valid_knee_and_elbow_angles(self):
        """PDF §83: Knee flexion angle and elbow angle computation."""
        kpts = [[0.0, 0.0, 0.8] for _ in range(17)]
        # Right leg forming a 90 degree bent knee
        kpts[KPT_R_HIP] = [100.0, 200.0, 0.9]
        kpts[KPT_R_KNEE] = [100.0, 250.0, 0.9]
        kpts[KPT_R_ANKLE] = [150.0, 250.0, 0.9]

        # Left arm straight
        kpts[KPT_L_SHOULDER] = [80.0, 150.0, 0.9]
        kpts[KPT_L_ELBOW] = [80.0, 180.0, 0.9]
        kpts[KPT_L_WRIST] = [80.0, 210.0, 0.9]

        metrics = self.detector.compute_2d_body_metrics(kpts, conf_threshold=0.4)
        self.assertIn("right_knee_angle_deg", metrics)
        self.assertAlmostEqual(metrics["right_knee_angle_deg"], 90.0, places=1)

        self.assertIn("left_elbow_angle_deg", metrics)
        self.assertAlmostEqual(metrics["left_elbow_angle_deg"], 180.0, places=1)

    def test_overhead_arm_detection(self):
        """PDF §83: Overhead arm position."""
        kpts = [[100.0, 200.0, 0.8] for _ in range(17)]
        kpts[KPT_NOSE] = [100.0, 100.0, 0.9]
        # Right wrist high above head (y = 50 < nose_y = 100)
        kpts[KPT_R_WRIST] = [110.0, 50.0, 0.9]

        metrics = self.detector.compute_2d_body_metrics(kpts)
        self.assertTrue(metrics.get("overhead_arm_detected"))

    def test_airborne_candidate_and_no_jump_height(self):
        """PDF §84-85: Must NOT claim jump height, but may label airborne candidate."""
        kpts = [[100.0, 200.0, 0.8] for _ in range(17)]
        # Ankles are at y=250, while bbox bottom is at y=300 (elevated by 50px)
        kpts[KPT_R_ANKLE] = [90.0, 250.0, 0.9]
        kpts[KPT_L_ANKLE] = [110.0, 250.0, 0.9]

        bbox = [50.0, 50.0, 150.0, 300.0]
        metrics = self.detector.compute_2d_body_metrics(kpts, bbox=bbox)

        # Must report airborne_candidate
        self.assertTrue(metrics.get("airborne_candidate"))

        # Must NOT claim ungrounded "jump_height" or "jump_height_cm"
        self.assertNotIn("jump_height", metrics)
        self.assertNotIn("jump_height_cm", metrics)


if __name__ == "__main__":
    unittest.main()
