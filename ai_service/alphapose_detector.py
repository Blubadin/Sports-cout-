"""
alphapose_detector.py — Deprecated alias forwarding to pose_detector.py
(Specification §80: Rename alphapose_detector to pose_detector.py)
"""

from ai_service.pose_detector import YoloPoseDetector, AlphaPoseDetector, SKELETON_PAIRS, calculate_2d_angle

__all__ = ["YoloPoseDetector", "AlphaPoseDetector", "SKELETON_PAIRS", "calculate_2d_angle"]
