"""Video and optical research metadata extraction for SportsScout Tracking Lab.

Extracts container, stream, and optical metadata with optional ffprobe support.
If ffprobe is not installed, falls back to OpenCV header properties.
Never automatically installs OS packages.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import shutil
import subprocess
from typing import Any

import cv2


def _parse_fraction(val: Any) -> float | None:
    """Safely parse numbers or fractions (e.g. '30000/1001', '1/500', 0.002)."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if not math.isnan(val) and val > 0 else None
    s = str(val).strip()
    if not s:
        return None
    try:
        if "/" in s:
            num, den = s.split("/", 1)
            num_f, den_f = float(num), float(den)
            return (num_f / den_f) if den_f != 0 else None
        return float(s)
    except (ValueError, ZeroDivisionError):
        return None


def _calculate_aspect_ratio(width: int | None, height: int | None) -> str | None:
    """Derive human-readable aspect ratio from width and height."""
    if not width or not height or width <= 0 or height <= 0:
        return None
    divisor = math.gcd(width, height)
    aspect_w = width // divisor
    aspect_h = height // divisor

    # Standard common aspect ratio buckets (16:9, 4:3, 1:1, 21:9, 9:16)
    ratio = width / height
    if abs(ratio - 16 / 9) < 0.02:
        return "16:9"
    if abs(ratio - 4 / 3) < 0.02:
        return "4:3"
    if abs(ratio - 1.0) < 0.02:
        return "1:1"
    if abs(ratio - 21 / 9) < 0.03:
        return "21:9"
    if abs(ratio - 9 / 16) < 0.02:
        return "9:16"

    if aspect_w <= 32 and aspect_h <= 32:
        return f"{aspect_w}:{aspect_h}"
    return f"{ratio:.2f}:1"


def _extract_tag_value(tags: dict[str, Any], candidate_keys: list[str]) -> Any | None:
    """Case-insensitive search for optical or metadata tags."""
    if not tags or not isinstance(tags, dict):
        return None
    lower_map = {k.lower(): v for k, v in tags.items()}
    for key in candidate_keys:
        val = lower_map.get(key.lower())
        if val is not None and str(val).strip():
            return val
    return None


def extract_video_metadata(
    video_source: str,
    original_filename: str | None = None,
    ffprobe_override: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Extract source video stream metadata and optical research metadata.

    Returns:
        (video_metadata, research_metadata) as dictionary pairs.
    """
    if video_source == "demo":
        video_meta = {
            "filename": original_filename or "demo_simulation.mp4",
            "durationSec": 2.0,
            "width": 1280,
            "height": 720,
            "aspectRatio": "16:9",
            "nominalFps": 30.0,
            "reportedFrameCount": 60,
            "frameCountProvenance": "synthetic_generator",
            "frameIntervalMs": 33.33,
            "codec": "synthetic_rgb",
            "bitrateKbps": None,
            "pixelFormat": "bgr24",
            "frameRateType": "CFR",
        }
        research_meta = {
            "cameraMake": None,
            "cameraModel": None,
            "exposureSec": None,
            "iso": None,
            "aperture": None,
            "focalLengthMm": None,
            "derivedShutterAngleDeg": None,
        }
        return video_meta, research_meta

    source_path = Path(video_source)
    resolved_filename = original_filename or source_path.name

    ffprobe_bin = ffprobe_override if ffprobe_override is not None else shutil.which("ffprobe")

    if ffprobe_bin and source_path.exists():
        try:
            cmd = [
                ffprobe_bin,
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(source_path),
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
            if res.returncode == 0 and res.stdout.strip():
                data = json.loads(res.stdout)
                streams = data.get("streams", [])
                video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
                format_info = data.get("format", {})

                if video_stream is not None:
                    return _build_ffprobe_metadata(
                        video_stream, format_info, resolved_filename
                    )
        except Exception:
            # Fall through to OpenCV fallback on any ffprobe execution error
            pass

    # OpenCV fallback
    return _extract_opencv_metadata(source_path, resolved_filename)


def _build_ffprobe_metadata(
    stream: dict[str, Any],
    format_info: dict[str, Any],
    filename: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build metadata from ffprobe JSON payload."""
    width = int(stream["width"]) if "width" in stream and str(stream["width"]).isdigit() else None
    height = int(stream["height"]) if "height" in stream and str(stream["height"]).isdigit() else None
    aspect_ratio = _calculate_aspect_ratio(width, height)

    r_fps = _parse_fraction(stream.get("r_frame_rate"))
    avg_fps = _parse_fraction(stream.get("avg_frame_rate"))
    nominal_fps = avg_fps or r_fps or 30.0

    frame_rate_type = "Unknown"
    if r_fps is not None and avg_fps is not None:
        frame_rate_type = "CFR" if abs(r_fps - avg_fps) < 0.05 else "VFR"

    # Frame count & provenance
    reported_frame_count = None
    frame_count_provenance = "unknown"
    if "nb_frames" in stream and str(stream["nb_frames"]).isdigit() and int(stream["nb_frames"]) > 0:
        reported_frame_count = int(stream["nb_frames"])
        frame_count_provenance = "ffprobe_stream_count"

    # Duration
    duration_sec = None
    stream_dur = _parse_fraction(stream.get("duration"))
    fmt_dur = _parse_fraction(format_info.get("duration"))
    if stream_dur:
        duration_sec = round(stream_dur, 2)
    elif fmt_dur:
        duration_sec = round(fmt_dur, 2)
    elif reported_frame_count and nominal_fps > 0:
        duration_sec = round(reported_frame_count / nominal_fps, 2)

    if reported_frame_count is None and duration_sec and nominal_fps > 0:
        reported_frame_count = int(round(duration_sec * nominal_fps))
        frame_count_provenance = "ffprobe_duration_estimate"

    frame_interval_ms = round(1000.0 / nominal_fps, 2) if nominal_fps and nominal_fps > 0 else None

    # Bitrate
    bitrate_raw = stream.get("bit_rate") or format_info.get("bit_rate")
    bitrate_kbps = round(int(bitrate_raw) / 1000) if bitrate_raw and str(bitrate_raw).isdigit() else None

    video_meta = {
        "filename": filename,
        "durationSec": duration_sec,
        "width": width,
        "height": height,
        "aspectRatio": aspect_ratio,
        "nominalFps": round(nominal_fps, 2) if nominal_fps else None,
        "reportedFrameCount": reported_frame_count,
        "frameCountProvenance": frame_count_provenance,
        "frameIntervalMs": frame_interval_ms,
        "codec": stream.get("codec_name"),
        "bitrateKbps": bitrate_kbps,
        "pixelFormat": stream.get("pix_fmt"),
        "frameRateType": frame_rate_type,
    }

    # Optical / Research tags from format and stream
    all_tags = {}
    if isinstance(format_info.get("tags"), dict):
        all_tags.update(format_info["tags"])
    if isinstance(stream.get("tags"), dict):
        all_tags.update(stream["tags"])

    camera_make = _extract_tag_value(all_tags, ["com.apple.quicktime.make", "make", "manufacturer"])
    camera_model = _extract_tag_value(all_tags, ["com.apple.quicktime.model", "model", "camera"])

    exposure_val = _extract_tag_value(all_tags, ["com.apple.quicktime.exposure", "exposure_time", "shutter_speed", "exposure"])
    exposure_sec = _parse_fraction(exposure_val)

    iso_val = _extract_tag_value(all_tags, ["com.apple.quicktime.iso", "iso", "iso_speed_ratings"])
    iso = int(iso_val) if iso_val is not None and str(iso_val).isdigit() else None

    aperture_val = _extract_tag_value(all_tags, ["com.apple.quicktime.aperture", "aperture", "fnumber", "f_number"])
    aperture = _parse_fraction(aperture_val)
    if aperture:
        aperture = round(aperture, 2)

    focal_val = _extract_tag_value(all_tags, ["com.apple.quicktime.focal_length", "focal_length"])
    focal_length_mm = _parse_fraction(focal_val)
    if focal_length_mm:
        focal_length_mm = round(focal_length_mm, 1)

    # Derived Shutter Angle:
    # Rule: FPS does NOT equal shutter.
    # Only calculate when actual exposure seconds + FPS are available:
    # angle = exposureSeconds * fps * 360
    # clearly marked as Derived.
    derived_shutter_angle = None
    if exposure_sec is not None and exposure_sec > 0 and nominal_fps and nominal_fps > 0:
        derived_shutter_angle = round(exposure_sec * nominal_fps * 360.0, 1)

    research_meta = {
        "cameraMake": str(camera_make) if camera_make else None,
        "cameraModel": str(camera_model) if camera_model else None,
        "exposureSec": exposure_sec,
        "iso": iso,
        "aperture": aperture,
        "focalLengthMm": focal_length_mm,
        "derivedShutterAngleDeg": derived_shutter_angle,
    }

    return video_meta, research_meta


def _extract_opencv_metadata(
    source_path: Path,
    filename: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """OpenCV fallback when ffprobe is not available or fails."""
    width = None
    height = None
    nominal_fps = None
    reported_frame_count = None
    duration_sec = None
    frame_interval_ms = None
    aspect_ratio = None

    if source_path.exists():
        cap = cv2.VideoCapture(str(source_path))
        try:
            if cap.isOpened():
                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fps = cap.get(cv2.CAP_PROP_FPS)
                count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

                if w > 0:
                    width = w
                if h > 0:
                    height = h
                if width and height:
                    aspect_ratio = _calculate_aspect_ratio(width, height)
                if fps and fps > 0:
                    nominal_fps = round(fps, 2)
                    frame_interval_ms = round(1000.0 / nominal_fps, 2)
                if count > 0:
                    reported_frame_count = count
                if reported_frame_count and nominal_fps and nominal_fps > 0:
                    duration_sec = round(reported_frame_count / nominal_fps, 2)
        finally:
            cap.release()

    video_meta = {
        "filename": filename,
        "durationSec": duration_sec,
        "width": width,
        "height": height,
        "aspectRatio": aspect_ratio,
        "nominalFps": nominal_fps,
        "reportedFrameCount": reported_frame_count,
        "frameCountProvenance": "opencv_header_estimate",
        "frameIntervalMs": frame_interval_ms,
        "codec": None,
        "bitrateKbps": None,
        "pixelFormat": None,
        "frameRateType": "Unknown",
    }

    research_meta = {
        "cameraMake": None,
        "cameraModel": None,
        "exposureSec": None,
        "iso": None,
        "aperture": None,
        "focalLengthMm": None,
        "derivedShutterAngleDeg": None,
    }

    return video_meta, research_meta
