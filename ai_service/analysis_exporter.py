"""Phase 3.5E Analysis Export Foundation.

Deterministic offline export pipeline producing:
- Overlay MP4 video with exact canonical frame alignment
- SportsScout_Report.pdf (executive summary, coverage, metrics, embedded heatmaps)
- Tactical court heatmaps (continuous 2D Gaussian density on canonical court plane)
- Structured data: analysis_summary.json and export_manifest.json
- README.txt
- Bundled into a safe, validated ZIP archive: SportsScout_<match>_<date>_Analysis.zip
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import datetime
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
import uuid
from uuid import uuid4
import zipfile

import cv2
import matplotlib
matplotlib.use("Agg")
from matplotlib.backends.backend_pdf import PdfPages
import matplotlib.pyplot as plt
import numpy as np
from scipy.ndimage import gaussian_filter
try:
    from ai_service.shuttle_shots import collect_shots, shot_analytics, point
except ImportError:
    from shuttle_shots import collect_shots, shot_analytics, point

try:
    from ai_service.analysis_job_store import AnalysisJobStore, JobStoreError
except ImportError:
    from analysis_job_store import AnalysisJobStore, JobStoreError


# --- Error Model ---

class ExportError(Exception):
    """Base class for all export errors."""
    code: str = "EXPORT_FAILED"

    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        if code:
            self.code = code


class SourceVideoMissingError(ExportError):
    code = "SOURCE_VIDEO_MISSING"


class AnalysisResultsMissingError(ExportError):
    code = "ANALYSIS_RESULTS_MISSING"


class InvalidAnalysisRevisionError(ExportError):
    code = "INVALID_ANALYSIS_REVISION"


class EncoderUnavailableError(ExportError):
    code = "ENCODER_UNAVAILABLE"


class VideoRenderFailedError(ExportError):
    code = "VIDEO_RENDER_FAILED"


class PdfGenerationFailedError(ExportError):
    code = "PDF_GENERATION_FAILED"


class ArchiveFailedError(ExportError):
    code = "ARCHIVE_FAILED"


class InsufficientStorageError(ExportError):
    code = "INSUFFICIENT_STORAGE"


class ExportCancelledError(ExportError):
    code = "EXPORT_CANCELLED"


# --- Overlay Configuration & Presets ---

@dataclass
class ExportOptions:
    # Analysis Overlays
    court: bool = True
    player_detection: bool = True
    pose: bool = True
    ground_points: bool = True
    shuttle: bool = True

    # Identity Overlays
    player_labels: bool = True
    track_ids: bool = False

    # Shuttle Overlays
    shuttle_trail: bool = True

    # Advanced / Debug Overlays (Off by default)
    debug_info: bool = False
    confidences: bool = False
    calibration_confidence: bool = False
    camera_segment: bool = False
    detection_confidence: bool = False
    pose_confidence: bool = False
    shuttle_confidence: bool = False

    # Preset label
    preset: str = "ANALYSIS"

    def __post_init__(self):
        if self.confidences:
            self.detection_confidence = True
            self.pose_confidence = True
            self.shuttle_confidence = True
            self.calibration_confidence = True

    @classmethod
    def from_preset(cls, preset: str, overrides: Optional[Dict[str, Any]] = None) -> "ExportOptions":
        normalized = preset.upper()
        if normalized == "CLEAN":
            opts = cls(
                court=False,
                player_detection=False,
                pose=False,
                ground_points=False,
                shuttle=False,
                player_labels=False,
                track_ids=False,
                shuttle_trail=False,
                debug_info=False,
                calibration_confidence=False,
                camera_segment=False,
                detection_confidence=False,
                pose_confidence=False,
                shuttle_confidence=False,
                preset="CLEAN",
            )
        elif normalized == "DEBUG":
            opts = cls(
                court=True,
                player_detection=True,
                pose=True,
                ground_points=True,
                shuttle=True,
                player_labels=True,
                track_ids=True,
                shuttle_trail=True,
                debug_info=True,
                calibration_confidence=True,
                camera_segment=True,
                detection_confidence=True,
                pose_confidence=True,
                shuttle_confidence=True,
                preset="DEBUG",
            )
        elif normalized == "ANALYSIS":
            opts = cls(preset="ANALYSIS")
        else:  # CUSTOM or other
            opts = cls(preset="CUSTOM")

        if overrides:
            for k, v in overrides.items():
                if hasattr(opts, k):
                    setattr(opts, k, bool(v) if k != "preset" else str(v))
        return opts

    @classmethod
    def preset_clean(cls) -> "ExportOptions":
        return cls.from_preset("CLEAN")

    @classmethod
    def preset_analysis(cls) -> "ExportOptions":
        return cls.from_preset("ANALYSIS")

    @classmethod
    def preset_debug(cls) -> "ExportOptions":
        return cls.from_preset("DEBUG")

    @classmethod
    def preset_custom(cls, **kwargs) -> "ExportOptions":
        return cls.from_preset("CUSTOM", overrides=kwargs)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Colors in BGR for OpenCV rendering
COLOR_CYAN = (248, 189, 56)
COLOR_EMERALD = (100, 220, 80)
COLOR_AMBER = (40, 180, 245)
COLOR_SKY = (245, 180, 50)
COLOR_VIOLET = (220, 100, 200)
COLOR_YELLOW = (0, 255, 255)
COLOR_ORANGE = (30, 140, 255)
COLOR_WHITE = (255, 255, 255)
COLOR_GRAY = (128, 128, 128)
COLOR_RED = (60, 60, 240)

PLAYER_COLORS = {
    "P1": COLOR_EMERALD,
    "P2": COLOR_AMBER,
    "P3": COLOR_SKY,
    "P4": COLOR_VIOLET,
}

PDF_PLAYER_COLORS = {
    "P1": "#34d399",
    "P2": "#fbbf24",
    "P3": "#38bdf8",
    "P4": "#c084fc",
}

COCO_SKELETON_PAIRS = [
    (0, 1), (0, 2), (1, 3), (2, 4),  # Facial keypoints
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),  # Upper limbs
    (5, 11), (6, 12), (11, 12),  # Torso
    (11, 13), (13, 15), (12, 14), (14, 16),  # Lower limbs
]


class ExportProgressState:
    """Thread-safe progress and lifecycle state for an export job."""
    def __init__(self, export_id: str, session_id: str):
        self.export_id = export_id
        self.session_id = session_id
        self.stage = "preparing"
        self.stage_label = "Preparing export..."
        self.progress_pct = 0.0
        self.status = "PROCESSING"  # PROCESSING, COMPLETED, FAILED, CANCELLED
        self.error: Optional[str] = None
        self.error_code: Optional[str] = None
        self.output_archive_path: Optional[str] = None
        self.archive_filename: Optional[str] = None
        self.archive_size_bytes: int = 0
        self.created_at = time.time()
        self.completed_at: Optional[float] = None
        self.cancel_event = threading.Event()
        self._lock = threading.Lock()

    def update(self, stage: str, stage_label: str, progress_pct: float) -> None:
        with self._lock:
            self.stage = stage
            self.stage_label = stage_label
            self.progress_pct = round(max(0.0, min(100.0, progress_pct)), 1)

    def complete(self, archive_path: Path) -> None:
        with self._lock:
            self.stage = "finalizing"
            self.stage_label = "Export completed successfully"
            self.progress_pct = 100.0
            self.status = "COMPLETED"
            self.output_archive_path = str(archive_path.resolve())
            self.archive_filename = archive_path.name
            self.archive_size_bytes = archive_path.stat().st_size if archive_path.exists() else 0
            self.completed_at = time.time()

    def fail(self, error: str, code: str = "EXPORT_FAILED") -> None:
        with self._lock:
            self.status = "FAILED"
            self.error = error
            self.error_code = code
            self.stage = "failed"
            self.stage_label = f"Export failed: {error}"
            self.completed_at = time.time()

    def cancel(self) -> None:
        with self._lock:
            self.cancel_event.set()
            self.status = "CANCELLED"
            self.error = "Export was cancelled by user"
            self.error_code = "EXPORT_CANCELLED"
            self.stage = "cancelled"
            self.stage_label = "Export cancelled"
            self.completed_at = time.time()

    def is_cancelled(self) -> bool:
        return self.cancel_event.is_set()

    @property
    def progress(self) -> float:
        return self.progress_pct

    @property
    def detail(self) -> str:
        return self.stage_label

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            public_stage = {
                "preparing": "PREPARING",
                "rendering_video": "RENDERING_VIDEO",
                "generating_heatmaps": "GENERATING_HEATMAPS",
                "generating_pdf": "GENERATING_REPORT",
                "creating_archive": "CREATING_ARCHIVE",
                "finalizing": "COMPLETED",
                "failed": "FAILED",
                "cancelled": "CANCELLED",
            }.get(self.stage, "PREPARING")
            return {
                "exportId": self.export_id,
                "sessionId": self.session_id,
                "stage": public_stage,
                "stageLabel": self.stage_label,
                "detail": self.stage_label,
                "progress": self.progress_pct,
                "progressPct": self.progress_pct,
                "status": self.status,
                "error": self.error,
                "errorCode": self.error_code,
                "outputArchivePath": self.output_archive_path,
                "archiveFilename": self.archive_filename,
                "archiveSizeBytes": self.archive_size_bytes,
                "createdAt": self.created_at,
                "completedAt": self.completed_at,
            }


def probe_video_encoder(
    temp_dir: Optional[Path] = None,
    codecs: Tuple[str, ...] = ("mp4v", "avc1"),
) -> str:
    """Probes OpenCV VideoWriter capability to ensure a working MP4 encoder is present.

    Verifies:
    1. VideoWriter opens
    2. Small test frames can be written
    3. Resulting file is non-zero
    4. Output can be reopened and read by cv2.VideoCapture
    """
    target_dir = Path(temp_dir) if temp_dir else Path(tempfile.gettempdir())
    target_dir.mkdir(parents=True, exist_ok=True)

    test_frame = np.zeros((64, 64, 3), dtype=np.uint8)
    cv2.circle(test_frame, (32, 32), 10, (255, 255, 255), -1)

    errors: List[str] = []
    for codec_name in codecs:
        probe_path = target_dir / f"probe_{uuid4().hex[:8]}_{codec_name}.mp4"
        writer = None
        cap = None
        try:
            fourcc = cv2.VideoWriter_fourcc(*codec_name)
            writer = cv2.VideoWriter(str(probe_path), fourcc, 30.0, (64, 64))
            if not writer.isOpened():
                errors.append(f"{codec_name}: VideoWriter failed to open")
                continue

            writer.write(test_frame)
            writer.write(test_frame)
            writer.release()
            writer = None

            if not probe_path.exists() or probe_path.stat().st_size == 0:
                errors.append(f"{codec_name}: Output file is missing or zero-sized")
                continue

            cap = cv2.VideoCapture(str(probe_path))
            if not cap.isOpened():
                errors.append(f"{codec_name}: Output video could not be reopened")
                continue

            ret, read_frame = cap.read()
            if not ret or read_frame is None:
                errors.append(f"{codec_name}: Output video could not be decoded")
                continue

            cap.release()
            cap = None
            return codec_name
        except Exception as e:
            errors.append(f"{codec_name}: {e}")
        finally:
            if writer is not None:
                try:
                    writer.release()
                except Exception:
                    pass
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass
            if probe_path.exists():
                try:
                    probe_path.unlink()
                except Exception:
                    pass

    error_summary = "; ".join(errors) if errors else "No codecs tested"
    raise EncoderUnavailableError(
        f"No functional MP4 video encoder available via OpenCV ({error_summary}). Please ensure OpenCV video codecs are installed."
    )


def _get_git_commit_sha() -> Optional[str]:
    """Resolves real git commit SHA or returns None if unavailable."""
    sha = os.getenv("GIT_COMMIT_SHA") or os.getenv("SPORTSCOUT_GIT_SHA")
    if sha:
        return sha.strip()
    try:
        import subprocess
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(Path(__file__).resolve().parent),
            capture_output=True,
            text=True,
            timeout=2.0,
            check=False,
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass
    return None


def normalize_export_frame(row: Dict[str, Any]) -> Dict[str, Any]:
    """Single boundary for canonical telemetry and controlled legacy aliases."""
    result = dict(row)
    cal = dict(row.get("calibration") or {})
    cal["courtCornersPx"] = cal.get("corners") or cal.get("courtCornersPx") or row.get("courtCornersPx")
    result["calibration"] = cal
    result["rawPlayerDetections"] = [dict(d, trackId=d.get("trackId", d.get("track_id")), bboxPx=d.get("bboxPx", d.get("bbox"))) for d in row.get("rawPlayerDetections", [])]
    players = []
    for original in row.get("players", []):
        player = dict(original)
        if isinstance(player.get("pose"), dict):
            pose = dict(player["pose"])
            pose["keypoints"] = [dict(kp) if isinstance(kp, dict) else {"x": kp[0], "y": kp[1], "score": kp[2] if len(kp) > 2 else 1.0} for kp in pose.get("keypoints", [])]
            player["pose"] = pose
        players.append(player)
    result["players"] = players
    return result


def _get_repository_dirty() -> Optional[bool]:
    """Export-time checkout state; analysis-time state may be unknown."""
    try:
        import subprocess
        result = subprocess.run(["git", "status", "--porcelain"], cwd=str(Path(__file__).resolve().parent),
                                capture_output=True, text=True, timeout=2.0, check=False)
        return bool(result.stdout.strip()) if result.returncode == 0 else None
    except Exception:
        return None


class AnalysisExporter:
    """Production export engine that generates a complete SportsScout analysis bundle."""

    def __init__(self, job_store: AnalysisJobStore, export_root: Optional[Path] = None):
        self.job_store = job_store
        if export_root:
            self.export_root = Path(export_root).resolve()
        else:
            configured = os.getenv("SPORTSCOUT_EXPORT_DIR")
            if configured:
                self.export_root = Path(configured).resolve()
            elif os.getenv("LOCALAPPDATA"):
                self.export_root = Path(os.environ["LOCALAPPDATA"]) / "SportsScout" / "exports"
            else:
                self.export_root = Path.home() / ".local" / "share" / "sportscout" / "exports"
        self.export_root.mkdir(parents=True, exist_ok=True)
        self.temp_root = self.export_root / "tmp"
        self.temp_root.mkdir(parents=True, exist_ok=True)

    def export(
        self,
        session_id: str,
        options: Optional[ExportOptions] = None,
        export_id: Optional[str] = None,
        progress: Optional[ExportProgressState] = None,
        target_zip_path: Optional[Path] = None,
    ) -> Dict[str, Any]:
        if options is None:
            options = ExportOptions.from_preset("ANALYSIS")
        if export_id is None:
            export_id = f"exp_{uuid4().hex[:12]}"
        if progress is None:
            progress = ExportProgressState(export_id, session_id)

        job_dir = self.temp_root / export_id
        job_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Stage 1: Preparing export & validation
            progress.update("preparing", "Preparing export and validating analysis data...", 2.0)
            if progress.is_cancelled():
                raise ExportCancelledError("Export cancelled before start")

            job, analysis_frames, source_media_path = self._prepare_data(session_id)
            self._check_storage(source_media_path, job_dir)

            progress.update("preparing", "Validating video encoder capability...", 4.0)
            verified_codec = probe_video_encoder(self.temp_root)

            progress.update("preparing", "Analysis data validated, setting up workspace...", 5.0)

            video_dir = job_dir / "video"
            report_dir = job_dir / "report"
            heatmaps_dir = job_dir / "heatmaps"
            data_dir = job_dir / "data"
            for d in (video_dir, report_dir, heatmaps_dir, data_dir):
                d.mkdir(parents=True, exist_ok=True)

            # Stage 2: Render video with overlays
            progress.update("rendering_video", "Rendering video overlays against source timeline...", 10.0)
            output_video_path = video_dir / "analysis_overlay.mp4"
            render_facts = self._render_video(
                source_media_path,
                analysis_frames,
                output_video_path,
                options,
                progress,
                progress_start=10.0,
                progress_end=60.0,
                codec=verified_codec,
            )

            if progress.is_cancelled():
                raise ExportCancelledError("Export cancelled during video render")

            # Stage 3: Generate Heatmaps
            progress.update("generating_heatmaps", "Generating tactical court heatmaps...", 62.0)
            heatmap_artifacts = self._generate_heatmaps(analysis_frames, heatmaps_dir, options, progress)

            if progress.is_cancelled():
                raise ExportCancelledError("Export cancelled during heatmap generation")

            # Stage 4: Generate PDF Report
            progress.update("generating_pdf", "Compiling SportsScout PDF report...", 75.0)
            output_pdf_path = report_dir / "SportsScout_Report.pdf"
            self._generate_pdf_report(
                job,
                analysis_frames,
                heatmap_artifacts,
                output_pdf_path,
                options,
                progress,
            )

            if progress.is_cancelled():
                raise ExportCancelledError("Export cancelled during PDF generation")

            # Stage 5: Generate Summary JSON, Manifest & README
            progress.update("creating_archive", "Writing data manifests and summary...", 85.0)
            summary_path = data_dir / "analysis_summary.json"
            manifest_path = data_dir / "export_manifest.json"
            readme_path = job_dir / "README.txt"

            self._generate_summary_json(job, analysis_frames, summary_path)
            (data_dir / "shuttle_shots.json").write_text(json.dumps({"shots": collect_shots(analysis_frames), "analytics": shot_analytics(collect_shots(analysis_frames))}, indent=2), encoding="utf-8")

            all_artifacts = [
                "video/analysis_overlay.mp4",
                "report/SportsScout_Report.pdf",
                *(f"heatmaps/{p.name}" for p in heatmap_artifacts),
                "data/analysis_summary.json",
                "data/shuttle_shots.json",
                "data/export_manifest.json",
                "README.txt",
            ]

            self._generate_manifest(job, analysis_frames, options, all_artifacts, manifest_path, source_media_path, render_facts=render_facts)
            self._generate_readme(job, options, all_artifacts, readme_path)

            # Stage 6: Create ZIP Archive
            progress.update("creating_archive", "Building compressed ZIP package...", 90.0)
            if target_zip_path is not None:
                final_zip_path = Path(target_zip_path)
            else:
                clean_match_name = self._sanitize_filename(
                    job.get("metadata", {}).get("session", {}).get("videoMetadata", {}).get("filename", session_id)
                )
                date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                archive_name = f"SportsScout_{clean_match_name}_{date_str}_Analysis.zip"
                final_zip_path = self.export_root / archive_name

            self._create_zip(job_dir, final_zip_path, progress)

            # Finalize
            progress.complete(final_zip_path)
            return {
                "archivePath": final_zip_path,
                "archiveSizeBytes": final_zip_path.stat().st_size if final_zip_path.exists() else 0,
                "totalSamples": len(analysis_frames),
                "videoOverlays": asdict(options),
                "exportId": export_id,
                "status": "COMPLETED",
            }

        except ExportCancelledError as e:
            progress.cancel()
            self._cleanup_temp(job_dir)
            raise
        except ExportError as e:
            progress.fail(str(e), e.code)
            self._cleanup_temp(job_dir)
            raise
        except Exception as e:
            progress.fail(str(e), "EXPORT_FAILED")
            self._cleanup_temp(job_dir)
            raise ExportError(f"Unexpected export failure: {e}", "EXPORT_FAILED") from e
        finally:
            # Clean up intermediate render directory after bundling
            if progress.status in ("COMPLETED", "CANCELLED", "FAILED"):
                self._cleanup_temp(job_dir)

    def _prepare_data(self, session_id: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]], Path]:
        try:
            job = self.job_store.get_job(session_id)
        except Exception as err:
            raise AnalysisResultsMissingError(f"Analysis results missing or corrupted for session '{session_id}': {err}")

        # Locate source media
        media_path_str = (
            job.get("identity", {}).get("mediaSource")
            or job.get("metadata", {}).get("session", {}).get("videoSource")
        )
        if not media_path_str or not Path(media_path_str).exists():
            raise SourceVideoMissingError(f"Source video media is missing at path: {media_path_str}")

        source_media_path = Path(media_path_str).resolve()

        # Collect canonical frames from chunks
        frames: List[Dict[str, Any]] = []
        try:
            for chunk_items in self.job_store.iter_chunks(session_id):
                frames.extend(chunk_items)
        except Exception as err:
            raise AnalysisResultsMissingError(f"Failed to read committed analysis chunks: {err}")

        if not frames:
            raise AnalysisResultsMissingError(f"No canonical analysis frames found in session '{session_id}'")

        checkpoint = job.get("checkpoint", {})
        expected_cursor = checkpoint.get("committedCursor")
        if expected_cursor is not None and expected_cursor != len(frames):
            raise InvalidAnalysisRevisionError(
                f"Analysis revision mismatch: job checkpoint specifies {expected_cursor} committed frames, "
                f"but found {len(frames)} frames in stored chunks"
            )

        return job, [normalize_export_frame(row) for row in frames], source_media_path

    def _check_storage(self, source_media_path: Path, temp_dir: Path) -> None:
        try:
            source_size = source_media_path.stat().st_size
            estimated_required = int(source_size * 1.5) + 50 * 1024 * 1024
            usage = shutil.disk_usage(temp_dir)
            free_bytes = getattr(usage, "free", usage[2] if isinstance(usage, (tuple, list)) and len(usage) > 2 else 0)
            if free_bytes < estimated_required:
                raise InsufficientStorageError(
                    f"Free disk space ({free_bytes // (1024 * 1024)} MB) is insufficient "
                    f"for estimated export size ({estimated_required // (1024 * 1024)} MB)"
                )
        except InsufficientStorageError:
            raise
        except OSError:
            pass  # Fall through if stat/disk_usage unsupported on path

    def _render_video(
        self,
        source_media_path: Path,
        analysis_frames: List[Dict[str, Any]],
        output_video_path: Path,
        options: ExportOptions,
        progress: ExportProgressState,
        progress_start: float,
        progress_end: float,
        codec: Optional[str] = None,
    ) -> Dict[str, Any]:
        cap = cv2.VideoCapture(str(source_media_path))
        if not cap.isOpened():
            raise SourceVideoMissingError(f"OpenCV could not open source video: {source_media_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if not math.isfinite(fps) or fps <= 0:
            fps = 30.0

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_source_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Check if telemetry frame indices are 0-based or 1-based to ensure exact source alignment
        raw_indices = [row.get("frameIndex") for row in analysis_frames if "sourceFrame" not in row and isinstance(row.get("frameIndex"), int)]
        is_zero_indexed = len(raw_indices) > 0 and min(raw_indices) == 0 and (total_source_frames <= 0 or max(raw_indices) < total_source_frames)

        # Index canonical frames by 1-based source frame index for O(1) alignment
        frame_map: Dict[int, Dict[str, Any]] = {}
        for row in analysis_frames:
            f_idx = row.get("sourceFrame") if "sourceFrame" in row else row.get("frameIndex")
            if isinstance(f_idx, int):
                canonical_idx = f_idx + 1 if "sourceFrame" not in row and is_zero_indexed else f_idx
                if canonical_idx > 0:
                    frame_map[canonical_idx] = row

        # Initialize VideoWriter using verified encoder
        selected_codec = codec or probe_video_encoder(output_video_path.parent)
        fourcc = cv2.VideoWriter_fourcc(*selected_codec)
        writer = cv2.VideoWriter(str(output_video_path), fourcc, fps, (width, height))
        if not writer.isOpened():
            # Try fallback to opposite codec (mp4v <-> avc1)
            alt_codec = "avc1" if selected_codec == "mp4v" else "mp4v"
            fourcc = cv2.VideoWriter_fourcc(*alt_codec)
            writer = cv2.VideoWriter(str(output_video_path), fourcc, fps, (width, height))
            selected_codec = alt_codec
            if not writer.isOpened():
                cap.release()
                raise EncoderUnavailableError("No compatible MP4 video encoder (mp4v/avc1) available via OpenCV")

        # Overlay render state
        current_data: Optional[Dict[str, Any]] = None
        shuttle_trail_pts: List[Tuple[int, int]] = []
        last_camera_segment: Optional[str] = None
        # Bounded freshness window: ~0.25 seconds or at least 3 frames

        current_source_frame = 0
        try:
            while True:
                if progress.is_cancelled():
                    raise ExportCancelledError("Export cancelled during video render loop")

                ret, frame_img = cap.read()
                if not ret or frame_img is None:
                    break

                current_source_frame += 1

                # Update canonical frame data if an observation exists on this frame
                if current_source_frame in frame_map:
                    current_data = frame_map[current_source_frame]
                elif current_data is not None:
                    # Clear stale telemetry if outside freshness tolerance
                    current_data = None

                # Invalidate overlay on camera cut, transition, replay, close-up
                if current_data is not None:
                    cam_seg = current_data.get("cameraSegmentId")
                    scene_st = current_data.get("sceneState")

                    if scene_st in ("REPLAY", "CAMERA_TRANSITION", "CLOSE_UP", "UNKNOWN"):
                        current_data = None
                        shuttle_trail_pts.clear()
                        last_camera_segment = cam_seg
                    elif cam_seg != last_camera_segment:
                        shuttle_trail_pts.clear()
                        last_camera_segment = cam_seg

                # Render overlays if we have aligned canonical data
                if current_data is not None:
                    self._render_overlays_on_frame(
                        frame_img,
                        current_data,
                        current_source_frame,
                        options,
                        width,
                        height,
                        shuttle_trail_pts,
                    )

                writer.write(frame_img)

                if current_source_frame % 30 == 0:
                    fraction = min(1.0, current_source_frame / max(1, total_source_frames))
                    pct = progress_start + fraction * (progress_end - progress_start)
                    progress.update(
                        "rendering_video",
                        f"Rendering overlay video ({current_source_frame}/{total_source_frames} frames)...",
                        pct,
                    )
        finally:
            cap.release()
            writer.release()

        if not output_video_path.exists() or output_video_path.stat().st_size == 0:
            raise VideoRenderFailedError("Video rendering produced an empty or missing output file")
        return {"videoCodec": selected_codec, "resolution": [width, height], "fps": fps,
                "legacyFrameIndexFallbackCount": sum("sourceFrame" not in row for row in analysis_frames)}

    def _render_overlays_on_frame(
        self,
        img: np.ndarray,
        data: Dict[str, Any],
        source_frame_num: int,
        options: ExportOptions,
        img_w: int,
        img_h: int,
        shuttle_trail_pts: List[Tuple[int, int]],
    ) -> None:
        # 1. Court Overlay
        data = normalize_export_frame(data)
        if options.court:
            # Check calibration validity: only render if valid and scene is COURT/RALLY
            is_valid = data.get("isMetricValid") is True or data.get("canUseCourtMetric") is True
            scene = data.get("sceneState", "")
            if is_valid and scene not in ("REPLAY", "CAMERA_TRANSITION", "UNKNOWN", "CLOSE_UP"):
                cal = data.get("calibration", {})
                corners = cal.get("courtCornersPx") or data.get("courtCornersPx")
                if corners and len(corners) == 4:
                    try:
                        poly_pts = np.array(corners, np.int32).reshape((-1, 1, 2))
                        cv2.polylines(img, [poly_pts], isClosed=True, color=COLOR_CYAN, thickness=2, lineType=cv2.LINE_AA)
                    except Exception:
                        pass

        # 2. Player Detections, Pose & Ground Points
        players = data.get("players", [])
        for p in players:
            p_state = p.get("state")
            if p_state not in ("observed", "predicted"):
                continue

            pid = p.get("playerId", "Player")
            track_id = p.get("trackId")
            p_color = PLAYER_COLORS.get(pid, COLOR_WHITE)
            is_pred = (p_state == "predicted")

            # Bounding box
            bbox = p.get("bboxPx")
            if not bbox and p.get("bboxPct"):
                bp = p["bboxPct"]
                bbox = [
                    bp["x"] * img_w / 100.0,
                    bp["y"] * img_h / 100.0,
                    (bp["x"] + bp["width"]) * img_w / 100.0,
                    (bp["y"] + bp["height"]) * img_h / 100.0,
                ]

            if bbox and len(bbox) == 4 and options.player_detection:
                x1, y1, x2, y2 = [int(round(c)) for c in bbox]
                # Draw box
                cv2.rectangle(img, (x1, y1), (x2, y2), p_color, 2 if not is_pred else 1, cv2.LINE_AA)

                # Label
                if options.player_labels:
                    label_parts = [pid]
                    if is_pred:
                        label_parts.append("[PRED]")
                    if options.track_ids and track_id is not None:
                        label_parts.append(f"Track ID: {track_id}")
                    if options.detection_confidence and p.get("detectionConfidence") is not None:
                        label_parts.append(f"{p['detectionConfidence']:.2f}")

                    label_text = " ".join(label_parts)
                    (lw, lh), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                    cv2.rectangle(img, (x1, max(0, y1 - lh - 6)), (x1 + lw + 6, y1), p_color, -1)
                    cv2.putText(
                        img, label_text, (x1 + 3, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA
                    )

            # Pose Skeleton Overlay
            if options.pose:
                pose = p.get("pose")
                if isinstance(pose, dict) and not pose.get("isStale", False):
                    kps = pose.get("keypoints", [])
                    coord_space = pose.get("keypointCoordinateSpace", "normalized_percent")
                    kp_coords: Dict[int, Tuple[int, int]] = {}

                    for idx, kp in enumerate(kps):
                        score = kp.get("score", 1.0)
                        if score < 0.25:
                            continue
                        kx, ky = kp.get("x", 0.0), kp.get("y", 0.0)
                        if coord_space == "normalized_percent":
                            px = int(round(kx * img_w / 100.0))
                            py = int(round(ky * img_h / 100.0))
                        else:  # pixel
                            px, py = int(round(kx)), int(round(ky))

                        if 0 <= px < img_w and 0 <= py < img_h:
                            kp_coords[idx] = (px, py)
                            cv2.circle(img, (px, py), 3, p_color, -1, cv2.LINE_AA)

                    # Draw skeleton bones
                    for i1, i2 in COCO_SKELETON_PAIRS:
                        if i1 in kp_coords and i2 in kp_coords:
                            cv2.line(img, kp_coords[i1], kp_coords[i2], p_color, 2, cv2.LINE_AA)

            # Ground Points Overlay
            if options.ground_points:
                gp = p.get("groundPointPx")
                if not gp and p.get("groundPointPct"):
                    g_pct = p["groundPointPct"]
                    gp = {"x": g_pct["x"] * img_w / 100.0, "y": g_pct["y"] * img_h / 100.0}

                if gp and isinstance(gp.get("x"), (int, float)) and isinstance(gp.get("y"), (int, float)):
                    gx, gy = int(round(gp["x"])), int(round(gp["y"]))
                    if 0 <= gx < img_w and 0 <= gy < img_h and (gx != 0 or gy != 0):
                        prov = str(p.get("groundPointProvenance") or "FEET")
                        prov_tag = "FEET"
                        if "left" in prov.lower():
                            prov_tag = "L"
                        elif "right" in prov.lower():
                            prov_tag = "R"
                        elif "bbox" in prov.lower():
                            prov_tag = "BBOX"

                        # Draw ground crosshair marker
                        cv2.circle(img, (gx, gy), 5, COLOR_YELLOW, -1, cv2.LINE_AA)
                        cv2.line(img, (gx - 8, gy), (gx + 8, gy), COLOR_YELLOW, 1, cv2.LINE_AA)
                        cv2.line(img, (gx, gy - 8), (gx, gy + 8), COLOR_YELLOW, 1, cv2.LINE_AA)
                        cv2.putText(
                            img, prov_tag, (gx + 7, gy + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35, COLOR_YELLOW, 1, cv2.LINE_AA
                        )

        # 3. Shuttle Overlay & Trail
        shuttle = data.get("shuttle")
        shuttle_pos = None
        if isinstance(shuttle, dict) and options.shuttle:
            s_state = str(shuttle.get("state", "")).lower()
            if s_state in ("observed", "predicted"):
                sp = shuttle.get("positionPx")
                if sp and isinstance(sp.get("x"), (int, float)) and isinstance(sp.get("y"), (int, float)):
                    sx, sy = int(round(sp["x"])), int(round(sp["y"]))
                    if 0 <= sx < img_w and 0 <= sy < img_h:
                        shuttle_pos = (sx, sy)
                        is_shuttle_pred = (s_state == "predicted")
                        s_color = COLOR_YELLOW if not is_shuttle_pred else COLOR_ORANGE

                        # Render shuttle marker
                        if not is_shuttle_pred:
                            cv2.circle(img, (sx, sy), 6, s_color, -1, cv2.LINE_AA)
                            cv2.circle(img, (sx, sy), 9, (0, 0, 0), 1, cv2.LINE_AA)
                        else:
                            # Distinct hollow circle for predicted state
                            cv2.circle(img, (sx, sy), 7, s_color, 2, cv2.LINE_AA)
                            cv2.putText(
                                img, "[PRED]", (sx + 8, sy - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.35, s_color, 1, cv2.LINE_AA
                            )

                        if options.shuttle_confidence and shuttle.get("confidence") is not None:
                            conf_text = f"{shuttle['confidence']:.2f}"
                            cv2.putText(
                                img, conf_text, (sx + 8, sy + 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.35, s_color, 1, cv2.LINE_AA
                            )

        # Shuttle Trail (Bounded history)
        if options.shuttle_trail:
            if shuttle_pos is not None:
                shuttle_trail_pts.append(shuttle_pos)
                if len(shuttle_trail_pts) > 15:
                    shuttle_trail_pts.pop(0)

            # Draw fading trail
            t_len = len(shuttle_trail_pts)
            for i in range(1, t_len):
                p1 = shuttle_trail_pts[i - 1]
                p2 = shuttle_trail_pts[i]
                alpha = (i / t_len)
                thickness = 1 if i < t_len // 2 else 2
                cv2.line(img, p1, p2, COLOR_YELLOW, thickness, cv2.LINE_AA)

        # 4. Tracking Debug HUD
        if options.debug_info:
            time_sec = data.get("timestampSec", 0.0)
            scene = data.get("sceneState", "UNKNOWN")
            seg = data.get("cameraSegmentId", "seg-?")
            cal_st = "CAL" if data.get("isMetricValid") else "UNCAL"

            hud_text = f"F:{source_frame_num} | T:{time_sec:.2f}s | {scene} | {seg} | {cal_st}"
            (tw, th), _ = cv2.getTextSize(hud_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)

            cv2.rectangle(img, (10, 10), (16 + tw, 18 + th), (20, 25, 32), -1)
            cv2.rectangle(img, (10, 10), (16 + tw, 18 + th), (60, 70, 85), 1)
            cv2.putText(img, hud_text, (13, 14 + th), cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_WHITE, 1, cv2.LINE_AA)

            # Raw detections diagnostic overlay (Debug mode only)
            raw_dets = data.get("rawPlayerDetections") or []
            confirmed_track_ids = {p.get("trackId") for p in players if p.get("state") in ("observed", "predicted")}
            for rd in raw_dets:
                rd_track = rd.get("trackId")
                if rd_track is not None and rd_track in confirmed_track_ids:
                    continue
                r_bbox = rd.get("bboxPx")
                if r_bbox and len(r_bbox) == 4:
                    rx1, ry1, rx2, ry2 = [int(round(c)) for c in r_bbox]
                    cv2.rectangle(img, (rx1, ry1), (rx2, ry2), (120, 120, 120), 1, cv2.LINE_AA)
                    cv2.putText(
                        img, f"[RAW {rd_track or '?'}]", (rx1 + 2, max(12, ry1 - 2)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (160, 160, 160), 1, cv2.LINE_AA
                    )

    def _generate_heatmaps(
        self,
        analysis_frames: List[Dict[str, Any]],
        output_dir: Path,
        options: ExportOptions,
        progress: ExportProgressState,
    ) -> List[Path]:
        generated: List[Path] = []

        # Collect valid court positions in meters (Court X: 0..6.1m, Court Y: 0..13.4m)
        all_court_pts: List[Tuple[float, float]] = []
        player_court_pts: Dict[str, List[Tuple[float, float]]] = {"P1": [], "P2": [], "P3": [], "P4": []}
        shuttle_pts: List[Tuple[float, float]] = []

        for row in analysis_frames:
            # Strictly enforce calibration validity: only calibrated observations enter tactical heatmaps
            if row.get("isMetricValid", row.get("canUseCourtMetric")) is not True:
                continue
            if row.get("sceneState") not in ("COURT_PLAY", "COURT_IDLE"):
                continue
            shuttle = row.get("shuttle") or {}
            shuttle_metric = point(shuttle.get("courtPositionM") or shuttle.get("positionM"))
            if shuttle.get("state") == "observed" and shuttle_metric and shuttle.get("metricEligible") is True:
                shuttle_pts.append(shuttle_metric)

            for p in row.get("players", []):
                if p.get("state") != "observed" or p.get("groundPointProvenance") == "bbox_bottom_center" or (p.get("rawGroundPoint") or {}).get("metricEligible") is False:
                    continue
                pid = p.get("playerId")
                cp = p.get("filteredGroundPoint") or p.get("courtPosition") or p.get("courtPositionM")
                if cp:
                    if isinstance(cp, dict) and "xM" in cp and "yM" in cp:
                        xm, ym = float(cp["xM"]), float(cp["yM"])
                    elif isinstance(cp, (list, tuple)) and len(cp) >= 2:
                        xm, ym = float(cp[0]), float(cp[1])
                    else:
                        continue

                    if math.isfinite(xm) and math.isfinite(ym) and -1.0 <= xm <= 7.1 and -1.0 <= ym <= 14.4:
                        all_court_pts.append((xm, ym))
                        if pid in player_court_pts:
                            player_court_pts[pid].append((xm, ym))

        # 1. Combined Player Movement Heatmap
        combined_path = output_dir / "player_movement_heatmap.png"
        self._plot_court_heatmap(all_court_pts, "Overall Player Movement Heatmap", combined_path)
        generated.append(combined_path)

        # 2. Individual Player Heatmaps
        p1_path = output_dir / "player_1_heatmap.png"
        self._plot_court_heatmap(player_court_pts["P1"], "Player 1 (P1) Tactical Heatmap", p1_path)
        generated.append(p1_path)

        p2_path = output_dir / "player_2_heatmap.png"
        self._plot_court_heatmap(player_court_pts["P2"], "Player 2 (P2) Tactical Heatmap", p2_path)
        generated.append(p2_path)

        # 3. Shuttle Heatmap (rendered only if valid shuttle observations exist)
        shuttle_path = output_dir / "shuttle_trajectory_heatmap.png"
        self._plot_court_heatmap(shuttle_pts, "Shuttle Trajectory" if shuttle_pts else "INSUFFICIENT_SHUTTLE_METRIC_DATA", shuttle_path)
        generated.append(shuttle_path)
        landing_pts = [point(s["landingPositionM"]) for s in collect_shots(analysis_frames) if s.get("outcome") == "CONFIRMED_LANDING" and point(s.get("landingPositionM"))]
        landing_path = output_dir / "shuttle_landing_heatmap.png"
        self._plot_court_heatmap(landing_pts, "Confirmed Shuttle Landings" if landing_pts else "INSUFFICIENT_SHUTTLE_METRIC_DATA", landing_path)
        generated.append(landing_path)

        return generated

    def _plot_court_heatmap(self, points: List[Tuple[float, float]], title: str, output_path: Path) -> None:
        fig, ax = plt.subplots(figsize=(6, 10), facecolor="#0b1219")
        ax.set_facecolor("#0d281a")

        # Court Lines in Meters
        # Outer boundary: 6.1m wide, 13.4m long
        ax.plot([0, 6.1, 6.1, 0, 0], [0, 0, 13.4, 13.4, 0], color="white", lw=2)
        # Net at Y = 6.7m
        ax.plot([0, 6.1], [6.7, 6.7], color="white", lw=2, ls="--")
        # Short service lines (1.98m from net)
        ax.plot([0, 6.1], [4.72, 4.72], color="white", lw=1.5)
        ax.plot([0, 6.1], [8.68, 8.68], color="white", lw=1.5)
        # Singles sidelines (0.46m inside)
        ax.plot([0.46, 0.46], [0, 13.4], color="white", lw=1.5)
        ax.plot([5.64, 5.64], [0, 13.4], color="white", lw=1.5)
        # Center line
        ax.plot([3.05, 3.05], [0, 4.72], color="white", lw=1.5)
        ax.plot([3.05, 3.05], [8.68, 13.4], color="white", lw=1.5)
        # Doubles long service line (0.76m inside baselines)
        ax.plot([0, 6.1], [0.76, 0.76], color="white", lw=1.2, ls=":")
        ax.plot([0, 6.1], [12.64, 12.64], color="white", lw=1.2, ls=":")

        ax.set_xlim(-0.5, 6.6)
        ax.set_ylim(-0.5, 13.9)
        ax.set_aspect("equal")

        if len(points) >= 5:
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            h, _, _ = np.histogram2d(xs, ys, bins=[48, 96], range=[[0, 6.1], [0, 13.4]])
            h_smooth = gaussian_filter(h, sigma=2.0)
            if h_smooth.max() > 0:
                h_smooth /= h_smooth.max()
            ax.imshow(h_smooth.T, origin="lower", extent=[0, 6.1, 0, 13.4], cmap="plasma", alpha=0.65)
        else:
            # Clean badge for insufficient data (prevents misleading blank heatmaps)
            ax.text(
                3.05, 6.7,
                "INSUFFICIENT VALID DATA\n(Calibration or tracking unconfirmed)",
                ha="center", va="center",
                color="#f87171", fontsize=11, fontweight="bold",
                bbox=dict(boxstyle="round,pad=0.6", facecolor="#1e293b", edgecolor="#475569", alpha=0.9),
            )

        ax.set_title(title, color="#e2e8f0", fontsize=12, pad=12, fontweight="bold")
        ax.tick_params(colors="#94a3b8", labelsize=8)
        ax.set_xlabel("Court Width (m)", color="#94a3b8", fontsize=9)
        ax.set_ylabel("Court Length (m)", color="#94a3b8", fontsize=9)
        for spine in ax.spines.values():
            spine.set_color("#334155")

        fig.savefig(output_path, dpi=150, bbox_inches="tight")
        plt.close(fig)

    def _generate_pdf_report(
        self,
        job: Dict[str, Any],
        analysis_frames: List[Dict[str, Any]],
        heatmap_paths: List[Path],
        output_pdf_path: Path,
        options: ExportOptions,
        progress: ExportProgressState,
    ) -> None:
        try:
            with PdfPages(output_pdf_path) as pdf:
                # Page 1: Executive Summary & Match Information
                fig1 = self._build_pdf_page_summary(job, analysis_frames, options)
                pdf.savefig(fig1)
                plt.close(fig1)

                # Page 2: Player Summary & Tactical Heatmaps
                fig2 = self._build_pdf_page_players(job, analysis_frames, heatmap_paths)
                pdf.savefig(fig2)
                plt.close(fig2)

                # Page 3: Quality Diagnostics & Export Configuration
                fig3 = self._build_pdf_page_diagnostics(job, analysis_frames, options)
                pdf.savefig(fig3)
                plt.close(fig3)
                fig4 = self._build_pdf_page_shuttle(analysis_frames)
                pdf.savefig(fig4)
                plt.close(fig4)
                fig5 = self._build_pdf_page_ground_quality(analysis_frames)
                pdf.savefig(fig5)
                plt.close(fig5)
        except Exception as e:
            raise PdfGenerationFailedError(f"Failed to generate PDF report: {e}") from e

    def _build_pdf_page_summary(
        self, job: Dict[str, Any], analysis_frames: List[Dict[str, Any]], options: ExportOptions
    ) -> plt.Figure:
        fig = plt.figure(figsize=(8.5, 11), facecolor="#0b1219")
        ax = fig.add_axes([0, 0, 1, 1])
        ax.axis("off")

        meta = job.get("metadata", {}).get("session", {})
        vid_meta = meta.get("videoMetadata", {})
        match_name = vid_meta.get("filename", "Badminton Match Analysis")
        date_str = datetime.datetime.now().strftime("%B %d, %Y - %H:%M")

        # Header Title
        ax.text(0.08, 0.92, "SPORTSSCOUT MATCH ANALYSIS REPORT", color="#38bdf8", fontsize=18, fontweight="bold")
        ax.text(0.08, 0.89, f"Generated: {date_str} | SportsScout Tactical Workstation", color="#94a3b8", fontsize=10)

        # Match Info Card
        ax.add_patch(plt.Rectangle((0.08, 0.665), 0.84, 0.195, facecolor="#111c26", edgecolor="#1e293b", lw=1.5))
        ax.text(0.10, 0.83, "1. MATCH & ANALYSIS INFORMATION", color="#38bdf8", fontsize=12, fontweight="bold")

        info_items = [
            ("Match / File Name:", str(match_name)),
            ("Sport / Game Type:", f"Badminton ({str(meta.get('gameType') or 'unknown').capitalize()})"),
            ("Duration:", f"{vid_meta.get('durationSec', 'unknown')} s ({len(analysis_frames)} analyzed frames)"),
            ("Source Resolution:", f"{vid_meta.get('width', 'unknown')} x {vid_meta.get('height', 'unknown')} @ {vid_meta.get('nominalFps', 'unknown')} FPS"),
            ("Analysis Session ID:", str(job.get("sessionId") or meta.get("sessionId") or "unknown")),
            ("Processing Profile:", str(meta.get("processingConfig", {}).get("profile") or "unknown")),
            ("Audio Track Status:", "Not included in video overlay (visual analysis export)"),
        ]

        y_pos = 0.80
        for label, val in info_items:
            ax.text(0.11, y_pos, label, color="#94a3b8", fontsize=9, fontweight="bold")
            ax.text(0.36, y_pos, val, color="#f1f5f9", fontsize=9)
            y_pos -= 0.021

        # Capability Coverage Card
        ax.add_patch(plt.Rectangle((0.08, 0.38), 0.84, 0.27, facecolor="#111c26", edgecolor="#1e293b", lw=1.5))
        ax.text(0.10, 0.61, "2. ANALYSIS CAPABILITY COVERAGE", color="#38bdf8", fontsize=12, fontweight="bold")

        # Compute coverage stats
        total_frames = max(1, len(analysis_frames))
        cal_frames = sum(1 for r in analysis_frames if r.get("isMetricValid", r.get("canUseCourtMetric")) is True)
        player_frames = sum(1 for r in analysis_frames if any(p.get("state") == "observed" for p in r.get("players", [])))
        pose_frames = sum(1 for r in analysis_frames if any(p.get("pose") and not p["pose"].get("isStale") for p in r.get("players", [])))
        shuttle_frames = sum(1 for r in analysis_frames if r.get("shuttle") and r["shuttle"].get("state") == "observed")

        caps = [
            ("COURT CALIBRATION", "PARTIAL" if cal_frames > 0 else "NOT AVAILABLE", f"{cal_frames}/{total_frames} valid frames ({cal_frames*100/total_frames:.1f}%)"),
            ("PLAYER TRACKING", "AVAILABLE" if player_frames > 0 else "NOT AVAILABLE", f"{player_frames}/{total_frames} frames with players ({player_frames*100/total_frames:.1f}%)"),
            ("POSE ESTIMATION", "AVAILABLE" if pose_frames > 0 else "NOT AVAILABLE", f"{pose_frames}/{total_frames} fresh pose observations ({pose_frames*100/total_frames:.1f}%)"),
            ("GROUND POINTS", "AVAILABLE" if player_frames > 0 else "NOT AVAILABLE", "Observed anchors with explicit provenance; bbox is visual only"),
            ("SEMANTIC IDENTITY", "AVAILABLE", "Semantic slots are distinct from raw MOT tracks"),
            ("SHUTTLE TRACKING", "PARTIAL" if shuttle_frames > 0 else "NOT VALIDATED", f"{shuttle_frames}/{total_frames} observed shuttle locations"),
        ]

        y_pos = 0.57
        for cap_name, status, detail in caps:
            st_color = "#34d399" if status == "AVAILABLE" else ("#fbbf24" if status == "PARTIAL" else "#f87171")
            ax.text(0.11, y_pos, cap_name, color="#f1f5f9", fontsize=9, fontweight="bold")
            ax.text(0.38, y_pos, status, color=st_color, fontsize=9, fontweight="bold")
            ax.text(0.55, y_pos, detail, color="#94a3b8", fontsize=8.5)
            y_pos -= 0.028

        # Footer note
        ax.text(
            0.08, 0.12,
            "SPORTSCOUT TRUST & INTEGRITY STATEMENT:\n"
            "Model observations are estimates; execution does not certify tracking or physical accuracy.\n"
            "Missing observations stay unknown. See ground quality and shuttle evidence before using metrics.",
            color="#64748b", fontsize=8, style="italic"
        )
        return fig

    def _build_pdf_page_ground_quality(self, frames):
        fig, ax = plt.subplots(figsize=(8.5, 11), facecolor="#0b1219")
        ax.axis("off")
        latest = {}
        for row in frames:
            for player in row.get("players", []):
                if player.get("distanceMetrics"):
                    latest[player["playerId"]] = player["distanceMetrics"]
        lines = ["GROUND POINT & DISTANCE QUALITY", "Metric estimates require valid calibration and fresh ankle evidence."]
        for pid, metrics in sorted(latest.items()):
            coverage = metrics.get("metricDistanceCoverage")
            coverage_label = f"{coverage:.1%}" if isinstance(coverage, (int, float)) else "unknown"
            lines += [f"{pid}: total {metrics.get('totalTrackedDistanceM')} m; active {metrics.get('distanceDuringActivePlayM')} m",
                      f"  Metric ground coverage: {coverage_label}; valid movements: {metrics.get('validMovementSamples')}",
                      f"  Raw / filtered / rejected: {metrics.get('rawMovementM')} / {metrics.get('filteredMovementM')} / {metrics.get('jitterRejectedDistanceM')} m",
                      f"  Ground quality: {metrics.get('groundPointQuality')}"]
        if not latest:
            lines.append("Ground metric quality unavailable for this legacy session.")
        lines += ["", "Coverage is eligible ground observations / counted ground observations.",
                  "BBox fallback and stale pose are visual only; they add no metric travel.",
                  "COURT_IDLE contributes to total travel, but not active-play travel.",
                  "Replay, invalid calibration and identity gaps contribute no travel.",
                  "Rejected movement is diagnostic, not confirmed noise.",
                  "Uncertainty assumptions and filtering can undercount small motion.",
                  "Physical accuracy has not been validated against held-out ground truth."]
        ax.text(.02, .97, "\n".join(lines), va="top", color="white", fontsize=9, linespacing=1.5)
        return fig

    def _build_pdf_page_shuttle(self, frames):
        analytics = shot_analytics(collect_shots(frames))
        fig, ax = plt.subplots(figsize=(8.5, 11), facecolor="#0b1219")
        ax.axis("off")
        lines = ["SHUTTLE SHOTS & LANDING EVIDENCE", analytics["status"],
                 f"Detected Shots: {analytics['detectedShots']}",
                 f"Valid Landing Events: {analytics['confirmedLandings']}",
                 f"Landing Analytics Coverage: {analytics['landingAnalyticsCoverage']:.1%}",
                 f"Most Targeted Zone: {analytics['MostTargetedZone'] or 'unknown'}",
                 f"Out of frame / reacquired: {analytics['outOfFrameShots']} / {analytics['reacquiredShots']}",
                 "Front / Mid / Rear Distribution:"]
        for depth in ("FRONT", "MID", "REAR"):
            lines.append(f"  {depth}: {sum(n for z, n in analytics['landingCountByZone'].items() if z.startswith(depth))}")
        lines += ["3x3 Zone Distribution:"] + [f"  {z}: {n} ({analytics['landingPercentageByZone'][z]:.1f}%)" for z, n in analytics['landingCountByZone'].items()]
        lines += ["IN / OUT / NET / RETURNED:"] + [f"  {k}: {v}" for k, v in analytics['outcomes'].items()]
        lines += ["Tracking loss is UNKNOWN, never a landing.", "Airborne 2D detections do not provide physical flight positions."]
        ax.text(.03, .98, "\n".join(lines), va="top", color="white", fontsize=10, linespacing=1.5)
        return fig

    def _build_pdf_page_players(
        self, job: Dict[str, Any], analysis_frames: List[Dict[str, Any]], heatmap_paths: List[Path]
    ) -> plt.Figure:
        fig = plt.figure(figsize=(8.5, 11), facecolor="#0b1219")
        ax = fig.add_axes([0, 0, 1, 1])
        ax.axis("off")

        ax.text(0.08, 0.92, "PLAYER MOVEMENT & TACTICAL METRICS", color="#38bdf8", fontsize=16, fontweight="bold")
        ax.text(0.08, 0.89, "Observed player kinematics and tactical court distribution", color="#94a3b8", fontsize=10)

        # Player Summary Table
        ax.add_patch(plt.Rectangle((0.08, 0.62), 0.84, 0.24, facecolor="#111c26", edgecolor="#1e293b", lw=1.5))
        ax.text(0.10, 0.82, "3. INDIVIDUAL ATHLETE SUMMARY", color="#38bdf8", fontsize=12, fontweight="bold")

        # Table headers
        headers = ["Player", "Slot", "Observations", "Coverage", "Total Distance (m)", "Status"]
        col_x = [0.11, 0.22, 0.32, 0.48, 0.65, 0.80]
        for x, h in zip(col_x, headers):
            ax.text(x, 0.78, h, color="#38bdf8", fontsize=8.5, fontweight="bold")

        total_frames = max(1, len(analysis_frames))
        p_counts: Dict[str, int] = {"P1": 0, "P2": 0, "P3": 0, "P4": 0}
        p_dist: Dict[str, Optional[float]] = {"P1": None, "P2": None, "P3": None, "P4": None}

        for r in analysis_frames:
            for p in r.get("players", []):
                pid = p.get("playerId")
                if pid in p_counts and p.get("state") == "observed":
                    p_counts[pid] += 1
                    dist = p.get("totalDistanceM")
                    if isinstance(dist, (int, float)) and math.isfinite(dist):
                        p_dist[pid] = max(p_dist[pid] or 0.0, float(dist))

        y_pos = 0.74
        for pid in ("P1", "P2", "P3", "P4"):
            obs = p_counts[pid]
            cov_pct = obs * 100.0 / total_frames
            dist_val = f"{p_dist[pid]:.1f} m" if p_dist[pid] is not None else "N/A"
            status = "Tracked" if obs > 0 else "Unobserved"

            ax.text(col_x[0], y_pos, f"Player {pid[-1]}", color="#f1f5f9", fontsize=8.5, fontweight="bold")
            ax.text(col_x[1], y_pos, pid, color=PDF_PLAYER_COLORS.get(pid, "#ffffff"), fontsize=8.5, fontweight="bold")
            ax.text(col_x[2], y_pos, f"{obs} frames", color="#cbd5e1", fontsize=8.5)
            ax.text(col_x[3], y_pos, f"{cov_pct:.1f}%", color="#cbd5e1", fontsize=8.5)
            ax.text(col_x[4], y_pos, dist_val, color="#cbd5e1", fontsize=8.5)
            ax.text(col_x[5], y_pos, status, color="#34d399" if obs > 0 else "#64748b", fontsize=8.5)
            y_pos -= 0.026

        # Heatmap Section
        ax.add_patch(plt.Rectangle((0.08, 0.08), 0.84, 0.51, facecolor="#111c26", edgecolor="#1e293b", lw=1.5))
        ax.text(0.10, 0.55, "4. TACTICAL COURT HEATMAPS", color="#38bdf8", fontsize=12, fontweight="bold")

        # Embed first two available heatmaps if present
        if heatmap_paths:
            try:
                for idx, hp in enumerate(heatmap_paths[:2]):
                    if hp.exists():
                        img_arr = plt.imread(str(hp))
                        im_x = 0.12 + idx * 0.40
                        im_ax = fig.add_axes([im_x, 0.12, 0.36, 0.38])
                        im_ax.imshow(img_arr)
                        im_ax.axis("off")
            except Exception:
                ax.text(0.12, 0.35, "Heatmap graphics generated and stored in package heatmaps/ folder.", color="#94a3b8")
        else:
            ax.text(0.12, 0.35, "Heatmaps available in export package directory.", color="#94a3b8")

        return fig

    def _build_pdf_page_diagnostics(
        self, job: Dict[str, Any], analysis_frames: List[Dict[str, Any]], options: ExportOptions
    ) -> plt.Figure:
        fig = plt.figure(figsize=(8.5, 11), facecolor="#0b1219")
        ax = fig.add_axes([0, 0, 1, 1])
        ax.axis("off")

        ax.text(0.08, 0.92, "TRACKING QUALITY & EXPORT SPECIFICATION", color="#38bdf8", fontsize=16, fontweight="bold")
        ax.text(0.08, 0.89, "Verification metrics, scene segment counts, and overlay configuration", color="#94a3b8", fontsize=10)

        # Quality Card
        ax.add_patch(plt.Rectangle((0.08, 0.54), 0.84, 0.32, facecolor="#111c26", edgecolor="#1e293b", lw=1.5))
        ax.text(0.10, 0.82, "5. TRACKING & SCENE QUALITY DIAGNOSTICS", color="#38bdf8", fontsize=12, fontweight="bold")

        scenes = set(r.get("sceneState", "UNKNOWN") for r in analysis_frames)
        camera_segs = set(r.get("cameraSegmentId", "unknown") for r in analysis_frames)

        diag_items = [
            ("Total Evaluated Frames:", str(len(analysis_frames))),
            ("Camera Segments Detected:", f"{len(camera_segs)} discrete camera segments"),
            ("Scene Classifications Observed:", ", ".join(sorted(scenes))),
            ("Court Calibration Frames:", f"{sum(bool(r.get('isMetricValid')) for r in analysis_frames)}/{len(analysis_frames)} marked valid; accuracy unreviewed"),
            ("Feet Contact Evidence:", "See recorded ground quality; bbox is visual only"),
            ("Semantic Identity:", "Raw tracks separated; accuracy not certified"),
        ]

        y_pos = 0.77
        for label, val in diag_items:
            ax.text(0.11, y_pos, label, color="#94a3b8", fontsize=9, fontweight="bold")
            ax.text(0.42, y_pos, val, color="#f1f5f9", fontsize=9)
            y_pos -= 0.034

        # Export Configuration Card
        ax.add_patch(plt.Rectangle((0.08, 0.16), 0.84, 0.34, facecolor="#111c26", edgecolor="#1e293b", lw=1.5))
        ax.text(0.10, 0.46, "6. APPLIED EXPORT CONFIGURATION", color="#38bdf8", fontsize=12, fontweight="bold")

        opts_dict = options.to_dict()
        cfg_items = [
            ("Selected Export Preset:", options.preset),
            ("Court / Calibration Wireframe:", "ENABLED" if options.court else "DISABLED"),
            ("Player Bounding Boxes:", "ENABLED" if options.player_detection else "DISABLED"),
            ("Pose Skeleton Bones:", "ENABLED" if options.pose else "DISABLED"),
            ("Player Identity Labels:", "ENABLED (P1..P4)" if options.player_labels else "DISABLED"),
            ("MOT Track IDs:", "ENABLED" if options.track_ids else "DISABLED"),
            ("Ground Contact Points:", "ENABLED" if options.ground_points else "DISABLED"),
            ("Shuttle Detection / Trail:", f"{'ENABLED' if options.shuttle else 'DISABLED'} / {'ENABLED' if options.shuttle_trail else 'DISABLED'}"),
            ("Debug Overlay HUD:", "ENABLED" if options.debug_info else "DISABLED"),
        ]

        y_pos = 0.42
        for label, val in cfg_items:
            val_col = "#38bdf8" if val.startswith("ENABLED") else ("#34d399" if label.startswith("Selected") else "#94a3b8")
            ax.text(0.11, y_pos, label, color="#94a3b8", fontsize=8.5, fontweight="bold")
            ax.text(0.42, y_pos, val, color=val_col, fontsize=8.5, fontweight="bold")
            y_pos -= 0.026

        return fig

    def _generate_summary_json(self, job: Dict[str, Any], analysis_frames: List[Dict[str, Any]], output_path: Path) -> None:
        total_frames = len(analysis_frames)
        cal_frames = sum(1 for r in analysis_frames if r.get("isMetricValid", r.get("canUseCourtMetric")) is True)

        players_summary: Dict[str, Any] = {}
        for pid in ("P1", "P2", "P3", "P4"):
            obs_count = sum(1 for r in analysis_frames if any(p.get("playerId") == pid and p.get("state") == "observed" for p in r.get("players", [])))
            players_summary[pid] = {
                "observedFrames": obs_count,
                "coverageFraction": round(obs_count / max(1, total_frames), 3),
                "distanceMetrics": next((p.get("distanceMetrics") for r in reversed(analysis_frames) for p in r.get("players", []) if p.get("playerId") == pid and p.get("distanceMetrics")), None),
            }

        session_id = job.get("sessionId") or job.get("metadata", {}).get("session", {}).get("sessionId")
        summary = {
            "sessionId": session_id,
            "analysisJobId": job.get("id") or job.get("sessionId"),
            "exportedAt": datetime.datetime.now().isoformat(),
            "frameCount": total_frames,
            "totalSamples": total_frames,
            "calibratedFrameCount": cal_frames,
            "calibratedFraction": round(cal_frames / max(1, total_frames), 3),
            "cameraSegmentCount": len(set(r.get("cameraSegmentId", "seg-0") for r in analysis_frames)),
            "players": players_summary,
            "shuttleObservedCount": sum(1 for r in analysis_frames if r.get("shuttle") and r["shuttle"].get("state") == "observed"),
            "shuttleAnalytics": shot_analytics(collect_shots(analysis_frames)),
        }

        output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    def _generate_manifest(
        self,
        job: Dict[str, Any],
        analysis_frames: List[Dict[str, Any]],
        options: ExportOptions,
        artifact_list: List[str],
        output_path: Path,
        source_media_path: Path,
        render_facts: Optional[Dict[str, Any]] = None,
    ) -> None:
        meta = job.get("metadata", {}).get("session", {})
        vid_meta = meta.get("videoMetadata", {})

        git_sha = _get_git_commit_sha()
        engine = job.get("metadata", {}).get("engine") or {}
        facts = render_facts or {}
        session_id = job.get("sessionId") or meta.get("sessionId")
        effective_device = engine.get("effectiveDevice") if "effectiveDevice" in engine else engine.get("device")

        manifest = {
            "exportVersion": "1.0.0",
            "phase": "3.5E",
            "createdAt": datetime.datetime.now().isoformat(),
            "sportsScoutVersion": "0.11.0-pilot.1",
            "repositorySha": git_sha,
            "repositoryDirty": _get_repository_dirty(),
            "analysisRepositorySha": engine.get("repositorySha"),
            "analysisRepositoryDirty": engine.get("repositoryDirty"),
            "analysisPostprocessing": engine.get("postprocessing"),
            "provenance": {
                "pipelineVersion": "3.5E",
                "detectorModel": engine.get("detectorModel"),
                "poseModel": engine.get("poseModel"),
                "shuttleModel": engine.get("shuttleModel") or (engine.get("shuttle") or {}).get("model"),
                "requestedDevice": engine.get("requestedDevice") or meta.get("device"),
                "effectiveDevice": effective_device,
                "device": effective_device,
                "runtime": engine.get("runtime"),
                "precision": None if engine.get("runtime") == "recorded" else engine.get("precision"),
                "executionValidated": engine.get("executionValidated"),
                "fallbackReason": engine.get("fallbackReason") or ((engine.get("inferenceProviders") or {}).get("detector") or {}).get("fallbackReason"),
                "detectorDevice": engine.get("detectorDevice"),
                "poseDevice": engine.get("poseDevice"),
                "shuttleDevice": engine.get("shuttleDevice"),
                "inferenceProviders": {**(engine.get("inferenceProviders") or {}), "shuttle": engine.get("shuttle")} if engine else None,
                "analysisSessionId": session_id,
            },
            "analysisJobId": job.get("id") or job.get("sessionId"),
            "sourceMediaSha256": job.get("identity", {}).get("mediaHash"),
            "sourceFilename": vid_meta.get("filename", source_media_path.name),
            "projectId": meta.get("projectId"),
            "analysisSessionId": session_id,
            "sourceResolution": [vid_meta.get("width"), vid_meta.get("height")],
            "sourceFps": vid_meta.get("nominalFps"),
            "sourceDurationSec": vid_meta.get("durationSec"),
            "analysisResultRevision": int(job.get("checkpoint", {}).get("committedSequence", 1)),
            "selectedOverlays": options.to_dict(),
            "exportPreset": options.preset,
            "videoEncoder": "opencv_videowriter",
            "videoCodec": facts.get("videoCodec"),
            "legacyFrameIndexFallbackCount": facts.get("legacyFrameIndexFallbackCount", sum("sourceFrame" not in row for row in analysis_frames)),
            "outputResolution": facts.get("resolution"),
            "outputFps": facts.get("fps"),
            "hasAudio": False,
            "audioNote": "Source audio was not multiplexed into the overlay render.",
            "calibrationCoverage": round(sum(1 for r in analysis_frames if r.get("isMetricValid")) / max(1, len(analysis_frames)), 3),
            "cameraSegmentCount": len(set(r.get("cameraSegmentId", "") for r in analysis_frames)),
            "warnings": [
                "2D body keypoints and angles are monocular camera pixel estimates.",
                "Source audio was not included in visual overlay video.",
            ],
            "generatedArtifacts": artifact_list,
        }

        output_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    def _generate_readme(
        self, job: Dict[str, Any], options: ExportOptions, artifact_list: List[str], output_path: Path
    ) -> None:
        content = f"""SportsScout Match Analysis Export Package
==========================================

Analysis Session: {job.get('id', 'N/A')}
Exported Date:    {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Export Preset:    {options.preset}
SportsScout:      v0.11.0-pilot.1 (Phase 3.5E Export Foundation)

Package Structure:
------------------
video/
  analysis_overlay.mp4          - MP4 video with selected tracking & calibration overlays
report/
  SportsScout_Report.pdf        - Comprehensive match summary, player metrics, and quality review
heatmaps/
  player_movement_heatmap.png   - Tactical court movement distribution
  player_1_heatmap.png          - Player 1 movement distribution
  player_2_heatmap.png          - Player 2 movement distribution
  shuttle_trajectory_heatmap.png - Measured metric trajectory, or explicit insufficient data
  shuttle_landing_heatmap.png    - Confirmed metric landings, or explicit insufficient data
data/
  shuttle_shots.json            - Evidence-gated shot events with null unknowns
  analysis_summary.json         - Machine-readable high-level metrics
  export_manifest.json          - Provenance, audit hashes, and export configuration
README.txt                      - Package overview (this file)

Important Notes:
----------------
- Every overlay follows canonical source frame indices and timestamps.
- Video overlays do not multiplex source audio.
- Missing or invalid observations are never coerced to zero.
"""
        output_path.write_text(content, encoding="utf-8")

    def _create_zip(self, temp_job_dir: Path, target_zip_path: Path, progress: ExportProgressState) -> None:
        target_zip_path.parent.mkdir(parents=True, exist_ok=True)
        temp_zip = target_zip_path.with_suffix(".tmp")

        try:
            with zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for root, _, files in os.walk(temp_job_dir):
                    for file_name in files:
                        if progress.is_cancelled():
                            raise ExportCancelledError("Export cancelled during ZIP creation")

                        abs_path = Path(root) / file_name
                        rel_path = abs_path.relative_to(temp_job_dir)
                        arcname = str(rel_path).replace("\\", "/")

                        # Enforce safe ZIP entry paths against traversal attacks
                        self._validate_archive_path(arcname)
                        zf.write(abs_path, arcname=arcname)

            # Atomic replacement of final ZIP
            if temp_zip.exists():
                os.replace(temp_zip, target_zip_path)
        except ExportCancelledError:
            if temp_zip.exists():
                temp_zip.unlink()
            raise
        except Exception as e:
            if temp_zip.exists():
                temp_zip.unlink()
            raise ArchiveFailedError(f"Failed to create ZIP package: {e}") from e

    def _validate_archive_path(self, arcname: str) -> None:
        """Protect against path traversal, absolute paths, drive letters, and UNC paths."""
        if not arcname or arcname.startswith(("/", "\\")):
            raise ArchiveFailedError(f"Unsafe absolute archive path: {arcname}")
        if ".." in arcname.split("/"):
            raise ArchiveFailedError(f"Path traversal detected in archive entry: {arcname}")
        if re.match(r"^[A-Za-z]:", arcname):
            raise ArchiveFailedError(f"Drive letter detected in archive entry: {arcname}")
        if "\0" in arcname:
            raise ArchiveFailedError("Null byte detected in archive entry")

    def _sanitize_filename(self, name: str) -> str:
        base = Path(name).stem
        sanitized = re.sub(r"[^A-Za-z0-9_-]", "_", base)
        return sanitized[:40] or "Match"

    def _cleanup_temp(self, temp_job_dir: Path) -> None:
        try:
            if temp_job_dir.exists():
                shutil.rmtree(temp_job_dir, ignore_errors=True)
        except Exception:
            pass


# --- Global Export Job Manager (Thread-Safe) ---

class ExportJobManager:
    def __init__(self, exporter: Optional[AnalysisExporter] = None):
        self._exporter = exporter
        self._jobs: Dict[str, ExportProgressState] = {}
        self._lock = threading.Lock()

    def set_exporter(self, exporter: AnalysisExporter) -> None:
        self._exporter = exporter

    @property
    def exporter(self) -> AnalysisExporter:
        if self._exporter is None:
            self._exporter = AnalysisExporter(AnalysisJobStore.from_environment())
        return self._exporter

    def start_export(self, session_id: str, options: Optional[ExportOptions] = None) -> str:
        export_id = f"exp_{uuid4().hex[:12]}"
        progress = ExportProgressState(export_id, session_id)
        with self._lock:
            self._jobs[export_id] = progress

        # Launch export in daemon thread so caller is never blocked
        def _worker():
            try:
                self.exporter.export(session_id, options=options, export_id=export_id, progress=progress)
            except Exception:
                pass  # State is recorded in progress object

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()
        return export_id

    def get_status(self, export_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(export_id)
            return job.snapshot() if job else None

    def cancel_export(self, export_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(export_id)
            if job:
                job.cancel()
                return True
            return False

    def get_archive_path(self, export_id: str) -> Optional[Path]:
        with self._lock:
            job = self._jobs.get(export_id)
            if job and job.output_archive_path:
                p = Path(job.output_archive_path)
                if p.exists():
                    return p
            return None


export_job_manager = ExportJobManager()
