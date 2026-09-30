"""
ai_service/passive_capture.py — Local Passive Capture for Failure and Low-Confidence Cases

Provides local capture of model failures, edge cases, and low-confidence predictions:
- Captures predictions, uncertainty/failure reasons, clip/frame references, and runtime provenance.
- Enforces strict quota bounds to prevent disk exhaustion.
- Implements deduplication window to prevent flood of identical failures in neighboring frames.
- Reports all capture/storage errors explicitly (never swallows errors).
- Protects confirmed human corrections from quota eviction (confirmed corrections are never pruned).
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import uuid

try:
    from .path_utils import sanitize_path_reference
except ImportError:
    try:
        from path_utils import sanitize_path_reference
    except ImportError:
        def sanitize_path_reference(path_or_str: Any) -> Optional[str]:
            if path_or_str is None or isinstance(path_or_str, (bool, dict, list, set, tuple)):
                return None
            raw = str(path_or_str).strip()
            if not raw:
                return None
            return Path(raw).name if raw else None


class CaptureStatus:
    STORED = "STORED"
    DEDUP_SUPPRESSED = "DEDUP_SUPPRESSED"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    STORAGE_ERROR = "STORAGE_ERROR"


@dataclass
class CaptureResult:
    status: str
    record_id: Optional[str] = None
    reason: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "recordId": self.record_id,
            "reason": self.reason,
            "error": self.error,
        }


@dataclass
class PassiveCaptureRecord:
    record_id: str
    created_at: str
    analysis_id: str
    pipeline_run_id: str
    camera_segment_id: str
    frame_index: int
    timestamp_sec: float
    failure_reason: str
    uncertainty_score: Optional[float] = None
    prediction_data: dict[str, Any] = field(default_factory=dict)
    clip_id: Optional[str] = None
    video_reference: Optional[str] = None
    target_id: Optional[str] = None
    model_version: Optional[str] = None
    model_artifact_hash: Optional[str] = None
    runtime: Optional[str] = None
    device: Optional[str] = None
    precision: Optional[str] = None
    is_confirmed_correction: bool = False
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[str] = None
    notes: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "recordId": self.record_id,
            "createdAt": self.created_at,
            "analysisId": self.analysis_id,
            "pipelineRunId": self.pipeline_run_id,
            "cameraSegmentId": self.camera_segment_id,
            "frameIndex": self.frame_index,
            "timestampSec": self.timestamp_sec,
            "failureReason": self.failure_reason,
            "uncertaintyScore": self.uncertainty_score,
            "predictionData": self.prediction_data,
            "clipId": self.clip_id,
            "videoReference": sanitize_path_reference(self.video_reference),
            "targetId": self.target_id,
            "modelVersion": self.model_version,
            "modelArtifactHash": self.model_artifact_hash,
            "runtime": self.runtime,
            "device": self.device,
            "precision": self.precision,
            "isConfirmedCorrection": self.is_confirmed_correction,
            "confirmedBy": self.confirmed_by,
            "confirmedAt": self.confirmed_at,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PassiveCaptureRecord:
        return cls(
            record_id=data["recordId"],
            created_at=data["createdAt"],
            analysis_id=data["analysisId"],
            pipeline_run_id=data.get("pipelineRunId") or data["analysisId"],
            camera_segment_id=data.get("cameraSegmentId", "segment-0"),
            frame_index=int(data["frameIndex"]),
            timestamp_sec=float(data["timestampSec"]),
            failure_reason=data["failureReason"],
            uncertainty_score=float(data["uncertaintyScore"]) if data.get("uncertaintyScore") is not None else None,
            prediction_data=data.get("predictionData", {}),
            clip_id=data.get("clipId"),
            video_reference=data.get("videoReference"),
            target_id=data.get("targetId"),
            model_version=data.get("modelVersion"),
            model_artifact_hash=data.get("modelArtifactHash"),
            runtime=data.get("runtime"),
            device=data.get("device"),
            precision=data.get("precision"),
            is_confirmed_correction=data.get("isConfirmedCorrection") is True,
            confirmed_by=data.get("confirmedBy"),
            confirmed_at=data.get("confirmedAt"),
            notes=data.get("notes"),
        )


class PassiveCaptureManager:
    """
    Manages local capture of failure and low-confidence events with quota control,
    deduplication window, and protected confirmed human corrections.
    """

    def __init__(
        self,
        storage_dir: str | Path,
        max_records: int = 100,
        max_storage_bytes: int = 10_000_000,  # 10 MB
        dedup_window_frames: int = 15,
        dedup_window_sec: float = 0.5,
    ) -> None:
        self.storage_dir = Path(storage_dir)
        self.max_records = max(1, max_records)
        self.max_storage_bytes = max(1024, max_storage_bytes)
        self.dedup_window_frames = max(0, dedup_window_frames)
        self.dedup_window_sec = max(0.0, dedup_window_sec)

        # In-memory deduplication tracking: (analysis_id, failure_reason, target_id) -> (frame_index, timestamp_sec)
        self._recent_captures: dict[Tuple[str, str, Optional[str]], Tuple[int, float]] = {}

        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def is_dedup_suppressed(
        self,
        analysis_id: str,
        failure_reason: str,
        target_id: Optional[str],
        frame_index: int,
        timestamp_sec: float,
    ) -> bool:
        """Checks if an event falls inside the deduplication window."""
        key = (analysis_id, failure_reason, target_id)
        if key in self._recent_captures:
            last_frame, last_time = self._recent_captures[key]
            if (
                abs(frame_index - last_frame) <= self.dedup_window_frames
                or abs(timestamp_sec - last_time) <= self.dedup_window_sec
            ):
                return True
        return False

    def capture(self, record: PassiveCaptureRecord) -> CaptureResult:
        """
        Attempts to store a passive capture record.
        Enforces deduplication, quota bounds, and human correction protection.
        Reports errors explicitly (never swallows errors).
        """
        # 1. Deduplication Check (only for non-confirmed automated captures)
        if not record.is_confirmed_correction:
            if self.is_dedup_suppressed(
                record.analysis_id,
                record.failure_reason,
                record.target_id,
                record.frame_index,
                record.timestamp_sec,
            ):
                return CaptureResult(
                    status=CaptureStatus.DEDUP_SUPPRESSED,
                    record_id=record.record_id,
                    reason=f"Suppressed within deduplication window ({self.dedup_window_frames} frames / {self.dedup_window_sec}s)",
                )

        # 2. Quota Management
        quota_ok, quota_reason = self._enforce_quota_before_write()
        if not quota_ok:
            return CaptureResult(
                status=CaptureStatus.QUOTA_EXCEEDED,
                record_id=record.record_id,
                reason=quota_reason,
            )

        # 3. Serialize and Write
        target_file = self.storage_dir / f"{record.record_id}.json"
        try:
            payload = json.dumps(record.to_dict(), indent=2)
            # Check size before write
            payload_bytes = len(payload.encode("utf-8"))
            current_bytes = self._compute_total_bytes()
            if current_bytes + payload_bytes > self.max_storage_bytes:
                evicted = self._evict_unconfirmed_bytes(payload_bytes)
                if not evicted:
                    return CaptureResult(
                        status=CaptureStatus.QUOTA_EXCEEDED,
                        record_id=record.record_id,
                        reason="Disk quota exceeded: cannot fit record even after evicting unconfirmed records",
                    )

            target_file.write_text(payload, encoding="utf-8")
        except OSError as e:
            return CaptureResult(
                status=CaptureStatus.STORAGE_ERROR,
                record_id=record.record_id,
                reason="Failed to write capture record to storage",
                error=str(e),
            )

        # 4. Update in-memory dedup tracking
        key = (record.analysis_id, record.failure_reason, record.target_id)
        self._recent_captures[key] = (record.frame_index, record.timestamp_sec)

        return CaptureResult(
            status=CaptureStatus.STORED,
            record_id=record.record_id,
            reason="Capture record successfully stored",
        )

    def confirm_correction(
        self,
        record_id: str,
        confirmed_by: str,
        notes: Optional[str] = None,
    ) -> bool:
        """
        Marks an existing capture record as a confirmed human correction.
        Once confirmed, it will NEVER be deleted or evicted by quota cleanup.
        """
        rec = self.get_record(record_id)
        if rec is None:
            return False

        rec.is_confirmed_correction = True
        rec.confirmed_by = confirmed_by
        rec.confirmed_at = datetime.now(timezone.utc).isoformat()
        if notes:
            rec.notes = notes

        target_file = self.storage_dir / f"{record_id}.json"
        try:
            target_file.write_text(json.dumps(rec.to_dict(), indent=2), encoding="utf-8")
            return True
        except OSError:
            return False

    def get_record(self, record_id: str) -> Optional[PassiveCaptureRecord]:
        """Retrieves a single capture record by its identifier."""
        target_file = self.storage_dir / f"{record_id}.json"
        if not target_file.is_file():
            return None
        try:
            data = json.loads(target_file.read_text(encoding="utf-8"))
            return PassiveCaptureRecord.from_dict(data)
        except (OSError, json.JSONDecodeError, KeyError, ValueError):
            return None

    def list_records(self, analysis_id: Optional[str] = None) -> list[PassiveCaptureRecord]:
        """Lists all stored capture records, optionally filtered by analysis_id."""
        records: list[PassiveCaptureRecord] = []
        for p in self.storage_dir.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                rec = PassiveCaptureRecord.from_dict(data)
                if analysis_id is None or rec.analysis_id == analysis_id:
                    records.append(rec)
            except Exception:
                continue
        records.sort(key=lambda r: (r.timestamp_sec, r.frame_index))
        return records

    def clear_unconfirmed(self) -> int:
        """
        Deletes all unconfirmed candidate records.
        CRITICAL: Confirmed human corrections are NEVER deleted.
        Returns the number of deleted records.
        """
        deleted = 0
        for p in self.storage_dir.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                if not data.get("isConfirmedCorrection", False):
                    p.unlink(missing_ok=True)
                    deleted += 1
            except Exception:
                continue
        return deleted

    def get_stats(self) -> dict[str, Any]:
        """Returns storage utilization statistics and quota status."""
        total_records = 0
        confirmed_count = 0
        unconfirmed_count = 0
        total_bytes = 0

        for p in self.storage_dir.glob("*.json"):
            total_records += 1
            try:
                size = p.stat().st_size
                total_bytes += size
                data = json.loads(p.read_text(encoding="utf-8"))
                if data.get("isConfirmedCorrection", False):
                    confirmed_count += 1
                else:
                    unconfirmed_count += 1
            except Exception:
                continue

        return {
            "totalRecords": total_records,
            "confirmedCount": confirmed_count,
            "unconfirmedCount": unconfirmed_count,
            "totalStorageBytes": total_bytes,
            "maxRecords": self.max_records,
            "maxStorageBytes": self.max_storage_bytes,
            "quotaUsedPercent": round((total_bytes / self.max_storage_bytes) * 100.0, 2),
        }

    # ------------------------------------------------------------------
    # Internal Quota Helpers
    # ------------------------------------------------------------------

    def _compute_total_bytes(self) -> int:
        total = 0
        for p in self.storage_dir.glob("*.json"):
            try:
                total += p.stat().st_size
            except OSError:
                pass
        return total

    def _enforce_quota_before_write(self) -> Tuple[bool, Optional[str]]:
        """
        Ensures record count quota is satisfied by evicting oldest unconfirmed records.
        If all existing records are confirmed human corrections and limit is hit, denies write.
        """
        files = list(self.storage_dir.glob("*.json"))
        if len(files) < self.max_records:
            return True, None

        # Need to evict unconfirmed records
        unconfirmed_files: list[Tuple[Path, float]] = []
        for p in files:
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                if not data.get("isConfirmedCorrection", False):
                    unconfirmed_files.append((p, p.stat().st_mtime))
            except Exception:
                # Corrupt or unreadable files can be treated as evictable
                unconfirmed_files.append((p, 0.0))

        if not unconfirmed_files:
            return False, "Quota exceeded: all stored records are protected confirmed human corrections"

        # Sort by mtime ascending (oldest first)
        unconfirmed_files.sort(key=lambda t: t[1])
        needed_evictions = (len(files) - self.max_records) + 1
        for i in range(min(needed_evictions, len(unconfirmed_files))):
            try:
                unconfirmed_files[i][0].unlink(missing_ok=True)
            except OSError:
                pass

        # Re-check count
        current_count = len(list(self.storage_dir.glob("*.json")))
        if current_count >= self.max_records:
            return False, "Quota exceeded: unable to evict sufficient unconfirmed records"
        return True, None

    def _evict_unconfirmed_bytes(self, bytes_needed: int) -> bool:
        """Evicts oldest unconfirmed records until bytes_needed can fit."""
        unconfirmed_files: list[Tuple[Path, int, float]] = []
        for p in self.storage_dir.glob("*.json"):
            try:
                size = p.stat().st_size
                data = json.loads(p.read_text(encoding="utf-8"))
                if not data.get("isConfirmedCorrection", False):
                    unconfirmed_files.append((p, size, p.stat().st_mtime))
            except Exception:
                unconfirmed_files.append((p, 0, 0.0))

        unconfirmed_files.sort(key=lambda t: t[2])  # oldest first
        freed = 0
        for p, size, _ in unconfirmed_files:
            try:
                p.unlink(missing_ok=True)
                freed += size
                if self._compute_total_bytes() + bytes_needed <= self.max_storage_bytes:
                    return True
            except OSError:
                pass
        return self._compute_total_bytes() + bytes_needed <= self.max_storage_bytes
