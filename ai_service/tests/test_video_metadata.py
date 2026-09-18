import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import numpy as np
import cv2

from ai_service.video_metadata import (
    _parse_fraction,
    _calculate_aspect_ratio,
    _build_ffprobe_metadata,
    _extract_opencv_metadata,
    extract_video_metadata,
)


class TestVideoMetadata(unittest.TestCase):
    def test_parse_fraction(self):
        self.assertAlmostEqual(_parse_fraction("30000/1001"), 29.97002997, places=3)
        self.assertEqual(_parse_fraction("30/1"), 30.0)
        self.assertEqual(_parse_fraction("1/500"), 0.002)
        self.assertEqual(_parse_fraction("0.005"), 0.005)
        self.assertEqual(_parse_fraction(60), 60.0)
        self.assertIsNone(_parse_fraction("invalid"))
        self.assertIsNone(_parse_fraction(None))
        self.assertIsNone(_parse_fraction("1/0"))

    def test_calculate_aspect_ratio(self):
        self.assertEqual(_calculate_aspect_ratio(1920, 1080), "16:9")
        self.assertEqual(_calculate_aspect_ratio(1280, 720), "16:9")
        self.assertEqual(_calculate_aspect_ratio(640, 480), "4:3")
        self.assertEqual(_calculate_aspect_ratio(1080, 1080), "1:1")
        self.assertEqual(_calculate_aspect_ratio(1080, 1920), "9:16")
        self.assertIsNone(_calculate_aspect_ratio(0, 720))

    def test_demo_metadata(self):
        v_meta, r_meta = extract_video_metadata("demo")
        self.assertEqual(v_meta["filename"], "demo_simulation.mp4")
        self.assertEqual(v_meta["frameCountProvenance"], "synthetic_generator")
        self.assertEqual(v_meta["reportedFrameCount"], 60)
        self.assertEqual(v_meta["nominalFps"], 30.0)
        self.assertEqual(v_meta["durationSec"], 2.0)
        self.assertEqual(v_meta["aspectRatio"], "16:9")
        self.assertEqual(v_meta["frameRateType"], "CFR")
        self.assertIsNone(r_meta["exposureSec"])
        self.assertIsNone(r_meta["derivedShutterAngleDeg"])

    def test_build_ffprobe_metadata_with_optical_tags(self):
        stream = {
            "codec_type": "video",
            "codec_name": "h264",
            "width": 1920,
            "height": 1080,
            "pix_fmt": "yuv420p",
            "r_frame_rate": "30/1",
            "avg_frame_rate": "30/1",
            "nb_frames": "300",
            "duration": "10.0",
            "bit_rate": "5000000",
            "tags": {
                "com.apple.quicktime.make": "Sony",
                "com.apple.quicktime.model": "FX3",
                "com.apple.quicktime.exposure": "1/500",
                "com.apple.quicktime.iso": "400",
                "com.apple.quicktime.aperture": "2.8",
                "com.apple.quicktime.focal_length": "24",
            },
        }
        format_info = {"duration": "10.0", "bit_rate": "5200000"}

        v_meta, r_meta = _build_ffprobe_metadata(stream, format_info, "match.mp4")

        self.assertEqual(v_meta["filename"], "match.mp4")
        self.assertEqual(v_meta["width"], 1920)
        self.assertEqual(v_meta["height"], 1080)
        self.assertEqual(v_meta["aspectRatio"], "16:9")
        self.assertEqual(v_meta["nominalFps"], 30.0)
        self.assertEqual(v_meta["reportedFrameCount"], 300)
        self.assertEqual(v_meta["frameCountProvenance"], "ffprobe_stream_count")
        self.assertEqual(v_meta["frameIntervalMs"], 33.33)
        self.assertEqual(v_meta["codec"], "h264")
        self.assertEqual(v_meta["bitrateKbps"], 5000)
        self.assertEqual(v_meta["pixelFormat"], "yuv420p")
        self.assertEqual(v_meta["frameRateType"], "CFR")

        # Optical metadata
        self.assertEqual(r_meta["cameraMake"], "Sony")
        self.assertEqual(r_meta["cameraModel"], "FX3")
        self.assertAlmostEqual(r_meta["exposureSec"], 0.002, places=4)
        self.assertEqual(r_meta["iso"], 400)
        self.assertEqual(r_meta["aperture"], 2.8)
        self.assertEqual(r_meta["focalLengthMm"], 24.0)

        # Derived Shutter Angle:
        # angle = exposureSeconds * fps * 360 = 0.002 * 30 * 360 = 21.6 deg
        self.assertEqual(r_meta["derivedShutterAngleDeg"], 21.6)

    def test_build_ffprobe_metadata_missing_optical_tags(self):
        stream = {
            "codec_type": "video",
            "codec_name": "hevc",
            "width": 1280,
            "height": 720,
            "r_frame_rate": "60/1",
            "avg_frame_rate": "58.5/1",
            "duration": "5.0",
        }
        format_info = {}

        v_meta, r_meta = _build_ffprobe_metadata(stream, format_info, "clip.mp4")

        self.assertEqual(v_meta["frameRateType"], "VFR")
        self.assertEqual(v_meta["frameCountProvenance"], "ffprobe_duration_estimate")
        self.assertEqual(v_meta["reportedFrameCount"], 292)
        self.assertIsNone(r_meta["cameraMake"])
        self.assertIsNone(r_meta["cameraModel"])
        self.assertIsNone(r_meta["exposureSec"])
        # Derived shutter angle MUST be None if exposure is missing (FPS does not equal shutter)
        self.assertIsNone(r_meta["derivedShutterAngleDeg"])

    def test_opencv_fallback_on_generated_video(self):
        # Create a small temp video
        with tempfile.NamedTemporaryFile(suffix=".avi", delete=False) as tf:
            temp_file = Path(tf.name)

        try:
            fourcc = cv2.VideoWriter_fourcc(*"MJPG")
            out = cv2.VideoWriter(str(temp_file), fourcc, 25.0, (320, 240))
            for _ in range(10):
                frame = np.zeros((240, 320, 3), dtype=np.uint8)
                out.write(frame)
            out.release()

            # Force OpenCV fallback by passing nonexistent ffprobe path
            v_meta, r_meta = extract_video_metadata(
                str(temp_file),
                original_filename="user_test.avi",
                ffprobe_override="/nonexistent/ffprobe",
            )

            self.assertEqual(v_meta["filename"], "user_test.avi")
            self.assertEqual(v_meta["width"], 320)
            self.assertEqual(v_meta["height"], 240)
            self.assertEqual(v_meta["aspectRatio"], "4:3")
            self.assertEqual(v_meta["frameCountProvenance"], "opencv_header_estimate")
            self.assertEqual(v_meta["frameRateType"], "Unknown")
            self.assertIsNone(v_meta["codec"])
            self.assertIsNone(r_meta["cameraMake"])
            self.assertIsNone(r_meta["derivedShutterAngleDeg"])
        finally:
            temp_file.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
