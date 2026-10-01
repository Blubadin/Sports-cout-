"""Durable, local-file storage for analysis job journals and committed telemetry chunks."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import struct
import tempfile
import threading
import time
from uuid import uuid4
from pathlib import Path
from typing import Any, Iterable


DEFAULT_PAGE_SIZE = 250
MAX_PAGE_SIZE = 1000
MAX_CHUNK_ITEMS = 256
_INDEX_RECORD = struct.Struct(">QQQ")  # start cursor, end cursor, sequence
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class JobStoreError(RuntimeError):
    """Base class for durable job storage errors."""


class JobStoreCorruptionError(JobStoreError):
    """The durable journal or a committed result chunk failed integrity checks."""


class JobStoreSequenceError(JobStoreError):
    """A result write would skip or change an already committed sequence."""


class AnalysisJobStore:
    """Filesystem journal where only checksum-verified, journal-committed chunks are visible."""

    def __init__(self, root: str | Path, page_limit: int = DEFAULT_PAGE_SIZE):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.maximum_page_size = max(1, min(int(page_limit), MAX_PAGE_SIZE))
        self._lock = threading.RLock()
        self.recovery_report: dict[str, list[str]] = {"interrupted": [], "deleted": [], "issues": []}
        self.recover()

    @classmethod
    def from_environment(cls) -> "AnalysisJobStore":
        configured = os.getenv("SPORTSCOUT_ANALYSIS_STORE_DIR")
        if configured:
            root = Path(configured)
        elif os.getenv("LOCALAPPDATA"):
            root = Path(os.environ["LOCALAPPDATA"]) / "SportsScout" / "analysis-jobs"
        else:
            root = Path.home() / ".local" / "share" / "sportscout" / "analysis-jobs"
        return cls(root)

    def _job_dir(self, session_id: str) -> Path:
        if not isinstance(session_id, str) or not _SAFE_ID.fullmatch(session_id):
            raise ValueError("Invalid analysis session id")
        return self.root / session_id

    def job_path(self, session_id: str) -> Path:
        return self._job_dir(session_id)

    def list_job_ids(self) -> list[str]:
        return sorted(
            path.name for path in self.root.iterdir()
            if path.is_dir() and _SAFE_ID.fullmatch(path.name) and (path / "job.json").is_file()
        )

    def media_path(self, session_id: str, suffix: str = ".video") -> Path:
        safe_suffix = suffix.lower() if re.fullmatch(r"\.[a-z0-9]{1,8}", suffix.lower()) else ".video"
        return self._job_dir(session_id) / f"source_{uuid4().hex}{safe_suffix}"

    @staticmethod
    def hash_file(path: str | Path, block_size: int = 1024 * 1024) -> str:
        digest = hashlib.sha256()
        with Path(path).open("rb") as source:
            for block in iter(lambda: source.read(block_size), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _canonical_bytes(value: Any) -> bytes:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")

    @classmethod
    def _checksum(cls, value: Any) -> str:
        return hashlib.sha256(cls._canonical_bytes(value)).hexdigest()

    @staticmethod
    def _atomic_write(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_path, path)
            try:
                dir_fd = os.open(path.parent, os.O_RDONLY)
                try:
                    os.fsync(dir_fd)
                finally:
                    os.close(dir_fd)
            except OSError:
                # Windows does not allow opening directories for fsync. The file itself was flushed.
                pass
        except Exception:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise

    def _write_job(self, session_id: str, job: dict[str, Any]) -> dict[str, Any]:
        body = {key: value for key, value in job.items() if key != "integrityMarker"}
        body["integrityMarker"] = self._checksum(body)
        self._atomic_write(self._job_dir(session_id) / "job.json", self._canonical_bytes(body))
        return body

    def create_job(self, session_id: str, identity: dict[str, Any], metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        with self._lock:
            folder = self._job_dir(session_id)
            if folder.exists():
                if (folder / "job.json").exists() or (folder / "delete.json").exists():
                    raise FileExistsError(f"Analysis job already exists: {session_id}")
                raise JobStoreCorruptionError("Analysis job directory exists without a valid journal")
            (folder / "chunks").mkdir(parents=True, exist_ok=True)
            now = time.time()
            return self._write_job(session_id, {
                "schemaVersion": 1,
                "sessionId": session_id,
                "status": "CREATED",
                "createdAt": now,
                "updatedAt": now,
                "identity": identity,
                "metadata": metadata or {},
                "progress": {"progressPct": 0.0, "lastProcessedFrame": 0},
                "error": None,
                "checkpoint": {
                    "committedSequence": 0,
                    "committedCursor": 0,
                    "lastCommittedFrame": 0,
                    "segmentCalibrationState": None,
                    "temporalState": {"mode": "WARM_UP_REQUIRED", "restored": False},
                    "integrityMarker": "empty-run",
                },
                "resume": {"available": False, "mode": None, "reason": None},
            })

    def get_job(self, session_id: str) -> dict[str, Any]:
        with self._lock:
            path = self._job_dir(session_id) / "job.json"
            if (path.parent / "delete.json").exists() or (self.root / f"{session_id}.delete.json").exists():
                raise JobStoreError("Analysis job deletion is pending repair")
            try:
                job = json.loads(path.read_text(encoding="utf-8"))
            except FileNotFoundError:
                raise
            except (OSError, UnicodeError, json.JSONDecodeError) as error:
                raise JobStoreCorruptionError("Analysis job journal is unreadable") from error
            if not isinstance(job, dict):
                raise JobStoreCorruptionError("Analysis job journal must be an object")
            marker = job.get("integrityMarker")
            body = {key: value for key, value in job.items() if key != "integrityMarker"}
            if not isinstance(marker, str) or marker != self._checksum(body):
                raise JobStoreCorruptionError("Analysis job journal checksum mismatch")
            checkpoint = job.get("checkpoint")
            if not isinstance(checkpoint, dict) or any(type(checkpoint.get(key)) is not int or checkpoint[key] < 0 for key in ("committedSequence", "committedCursor")):
                raise JobStoreCorruptionError("Analysis job checkpoint is invalid")
            if not checkpoint["committedSequence"] <= checkpoint["committedCursor"] <= checkpoint["committedSequence"] * MAX_CHUNK_ITEMS:
                raise JobStoreCorruptionError("Analysis job checkpoint cursor/sequence is inconsistent")
            return job

    def update_job(self, session_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            job = self.get_job(session_id)
            for key, value in patch.items():
                if key == "checkpoint":
                    checkpoint = dict(job.get("checkpoint", {}))
                    checkpoint.update(value)
                    job[key] = checkpoint
                elif key == "progress":
                    progress = dict(job.get("progress", {}))
                    progress.update(value)
                    job[key] = progress
                elif key == "metadata":
                    metadata = dict(job.get("metadata", {}))
                    metadata.update(value)
                    job[key] = metadata
                elif key != "integrityMarker":
                    job[key] = value
            job["updatedAt"] = time.time()
            return self._write_job(session_id, job)

    def record_resume(self, session_id: str, resume: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            job = self.get_job(session_id)
            sequence = int(job.get("resumeSequence", 0)) + 1
            body = {"sequence": sequence, "at": time.time(), "resume": resume, "committedCursor": job["checkpoint"]["committedCursor"], "committedSequence": job["checkpoint"]["committedSequence"], "identity": job["identity"], "supersession": None, "canonicalDataReplaced": False}
            event = {**body, "integrityMarker": self._checksum(body)}
            self._atomic_write(self._job_dir(session_id) / "resume-events" / f"{sequence:012d}.json", self._canonical_bytes(event))
            return self.update_job(session_id, {"resumeSequence": sequence, "resume": {**resume, "sequence": sequence}})

    def _chunk_path(self, session_id: str, sequence: int) -> Path:
        return self._job_dir(session_id) / "chunks" / f"{sequence:012d}.json"

    def _read_chunk(self, session_id: str, sequence: int) -> dict[str, Any]:
        path = self._chunk_path(session_id, sequence)
        try:
            chunk = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise JobStoreCorruptionError(f"Committed result chunk {sequence} is unreadable") from error
        if not isinstance(chunk, dict):
            raise JobStoreCorruptionError(f"Committed result chunk {sequence} must be an object")
        body = {key: value for key, value in chunk.items() if key != "checksum"}
        if chunk.get("checksum") != self._checksum(body):
            raise JobStoreCorruptionError(f"Committed result chunk {sequence} checksum mismatch")
        if (
            chunk.get("sequence") != sequence
            or not isinstance(chunk.get("items"), list)
            or not 1 <= len(chunk["items"]) <= MAX_CHUNK_ITEMS
            or any(type(chunk.get(key)) is not int or chunk[key] < 0 for key in ("startCursor", "endCursor"))
            or chunk["endCursor"] - chunk["startCursor"] != len(chunk["items"])
        ):
            raise JobStoreCorruptionError(f"Committed result chunk {sequence} metadata is invalid")
        return chunk

    def _write_chunk_file(self, session_id: str, sequence: int, start_cursor: int, items: list[dict[str, Any]]) -> dict[str, Any]:
        body = {
            "sequence": sequence,
            "startCursor": start_cursor,
            "endCursor": start_cursor + len(items),
            "items": items,
        }
        chunk = {**body, "checksum": self._checksum(body)}
        self._atomic_write(self._chunk_path(session_id, sequence), self._canonical_bytes(chunk))
        return chunk

    def _index_path(self, session_id: str) -> Path:
        return self._job_dir(session_id) / "chunks.index"

    def _index_record(self, session_id: str, sequence: int) -> tuple[int, int, int] | None:
        path = self._index_path(session_id)
        try:
            with path.open("rb") as stream:
                stream.seek((sequence - 1) * _INDEX_RECORD.size)
                raw = stream.read(_INDEX_RECORD.size)
        except FileNotFoundError:
            return None
        if len(raw) != _INDEX_RECORD.size:
            return None
        return _INDEX_RECORD.unpack(raw)

    def _ensure_index_record(self, session_id: str, sequence: int, chunk: dict[str, Any]) -> None:
        existing = self._index_record(session_id, sequence)
        expected = (chunk["startCursor"], chunk["endCursor"], sequence)
        path = self._index_path(session_id)
        if existing == expected:
            return
        if existing is not None:
            raise JobStoreCorruptionError(f"Result chunk index mismatch at sequence {sequence}")
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("ab") as stream:
            # The index can only be extended in sequence order.
            if stream.tell() != (sequence - 1) * _INDEX_RECORD.size:
                raise JobStoreCorruptionError("Result chunk index has a sequence gap")
            stream.write(_INDEX_RECORD.pack(*expected))
            stream.flush()
            os.fsync(stream.fileno())

    def append_result_chunk(
        self,
        session_id: str,
        sequence: int,
        items: list[dict[str, Any]],
        checkpoint: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if (
            not isinstance(sequence, int)
            or sequence < 1
            or not isinstance(items, list)
            or not items
            or len(items) > MAX_CHUNK_ITEMS
        ):
            raise ValueError(f"A result chunk requires 1..{MAX_CHUNK_ITEMS} items and a positive sequence")
        with self._lock:
            job = self.get_job(session_id)
            committed_sequence = job["checkpoint"]["committedSequence"]
            committed_cursor = job["checkpoint"]["committedCursor"]
            chunk_path = self._chunk_path(session_id, sequence)
            if sequence <= committed_sequence:
                existing = self._read_chunk(session_id, sequence)
                proposed_checksum = self._checksum({
                    "sequence": sequence,
                    "startCursor": existing["startCursor"],
                    "endCursor": existing["startCursor"] + len(items),
                    "items": items,
                })
                if existing.get("checksum") != proposed_checksum:
                    raise JobStoreSequenceError(f"Committed result chunk {sequence} cannot be changed")
                return job
            if sequence != committed_sequence + 1:
                raise JobStoreSequenceError(f"Expected result chunk {committed_sequence + 1}, got {sequence}")
            frame_indexes = [item.get("frameIndex") for item in items if isinstance(item, dict)]
            if len(frame_indexes) != len(items) or any(type(index) is not int or index < 0 for index in frame_indexes):
                raise JobStoreSequenceError("Canonical result frames require non-negative integer indexes")
            previous_frame = job["checkpoint"].get("lastCommittedFrame", -1) if committed_sequence else -1
            for frame_index in frame_indexes:
                if frame_index <= previous_frame:
                    raise JobStoreSequenceError("Canonical result frame would duplicate or reorder committed observations")
                previous_frame = frame_index

            if chunk_path.exists():
                chunk = self._read_chunk(session_id, sequence)
                expected_body = {
                    "sequence": sequence,
                    "startCursor": committed_cursor,
                    "endCursor": committed_cursor + len(items),
                    "items": items,
                }
                if any(chunk.get(key) != value for key, value in expected_body.items()):
                    raise JobStoreSequenceError(f"Uncommitted result chunk {sequence} differs from retried write")
            else:
                chunk = self._write_chunk_file(session_id, sequence, committed_cursor, items)

            # A chunk is visible only after its flushed file, durable index, and journal checkpoint agree.
            self._ensure_index_record(session_id, sequence, chunk)
            next_checkpoint = dict(job["checkpoint"])
            next_checkpoint.update({
                "committedSequence": sequence,
                "committedCursor": chunk["endCursor"],
                "lastCommittedFrame": max(
                    (int(item.get("frameIndex", 0)) for item in items if isinstance(item, dict)),
                    default=next_checkpoint.get("lastCommittedFrame", 0),
                ),
                "integrityMarker": chunk["checksum"],
            })
            if checkpoint:
                next_checkpoint.update(checkpoint)
                # Commit fields are store-owned and cannot be supplied by callers.
                next_checkpoint["committedSequence"] = sequence
                next_checkpoint["committedCursor"] = chunk["endCursor"]
                next_checkpoint["integrityMarker"] = chunk["checksum"]
            job["checkpoint"] = next_checkpoint
            return self._write_job(session_id, job)

    def page_results(self, session_id: str, after_cursor: int = 0, limit: int = DEFAULT_PAGE_SIZE) -> dict[str, Any]:
        if not isinstance(after_cursor, int) or after_cursor < 0:
            raise ValueError("Result cursor must be a non-negative integer")
        page_size = max(1, min(int(limit), self.maximum_page_size))
        with self._lock:
            job = self.get_job(session_id)
            checkpoint = job["checkpoint"]
            committed_cursor = checkpoint["committedCursor"]
            if after_cursor > committed_cursor:
                raise ValueError("Result cursor is ahead of committed data")
            sequence_count = checkpoint["committedSequence"]
            low, high = 1, sequence_count
            first_sequence = sequence_count + 1
            while low <= high:
                middle = (low + high) // 2
                record = self._index_record(session_id, middle)
                if record is None or record[2] != middle:
                    raise JobStoreCorruptionError(f"Missing result chunk index record {middle}")
                if record[1] <= after_cursor:
                    low = middle + 1
                else:
                    first_sequence = middle
                    high = middle - 1

            items: list[dict[str, Any]] = []
            next_cursor = after_cursor
            for sequence in range(first_sequence, sequence_count + 1):
                chunk = self._read_chunk(session_id, sequence)
                record = self._index_record(session_id, sequence)
                if record != (chunk["startCursor"], chunk["endCursor"], sequence):
                    raise JobStoreCorruptionError(f"Committed result chunk {sequence} index mismatch")
                offset = max(0, after_cursor - chunk["startCursor"])
                available = chunk["items"][offset:]
                take = page_size - len(items)
                items.extend(available[:take])
                next_cursor = chunk["startCursor"] + offset + min(len(available), take)
                if len(items) >= page_size:
                    break
            return {
                "items": items,
                "nextCursor": next_cursor,
                "totalCount": committed_cursor,
                "maximumPageSize": self.maximum_page_size,
                "committedSequence": sequence_count,
            }

    def iter_chunks(self, session_id: str) -> Iterable[list[dict[str, Any]]]:
        job = self.get_job(session_id)
        for sequence in range(1, job["checkpoint"]["committedSequence"] + 1):
            yield self._read_chunk(session_id, sequence)["items"]

    def validate_committed(self, session_id: str) -> None:
        """Verify the entire commit chain with at most one chunk in memory."""
        with self._lock:
            checkpoint = self.get_job(session_id)["checkpoint"]
            cursor = 0
            marker = "empty-run"
            for sequence in range(1, checkpoint["committedSequence"] + 1):
                chunk = self._read_chunk(session_id, sequence)
                if chunk["startCursor"] != cursor or self._index_record(session_id, sequence) != (cursor, chunk["endCursor"], sequence):
                    raise JobStoreCorruptionError(f"Committed result sequence mismatch at {sequence}")
                cursor = chunk["endCursor"]
                marker = chunk["checksum"]
            if cursor != checkpoint["committedCursor"] or marker != checkpoint["integrityMarker"]:
                raise JobStoreCorruptionError("Committed checkpoint does not match result chain")

    def _remove_tree(self, path: Path) -> None:
        shutil.rmtree(path)

    def delete_job(self, session_id: str) -> None:
        with self._lock:
            folder = self._job_dir(session_id)
            if not folder.exists():
                return
            tombstone_body = {"sessionId": session_id, "status": "DELETING", "requestedAt": time.time()}
            tombstone = {**tombstone_body, "integrityMarker": self._checksum(tombstone_body)}
            # Keep the repair marker outside the tree being removed: a partial
            # recursive delete may already have removed the inner marker.
            external_marker = self.root / f"{session_id}.delete.json"
            self._atomic_write(external_marker, self._canonical_bytes(tombstone))
            self._atomic_write(folder / "delete.json", self._canonical_bytes(tombstone))
            self._remove_tree(folder)
            external_marker.unlink()

    def recover(self) -> dict[str, list[str]]:
        report: dict[str, list[str]] = {"interrupted": [], "deleted": [], "issues": []}
        for marker in self.root.glob("*.delete.json"):
            session_id = marker.name.removesuffix(".delete.json")
            try:
                tombstone = json.loads(marker.read_text(encoding="utf-8"))
                body = {key: value for key, value in tombstone.items() if key != "integrityMarker"}
                if tombstone.get("integrityMarker") != self._checksum(body) or body.get("sessionId") != session_id:
                    raise JobStoreCorruptionError("Delete tombstone checksum mismatch")
                folder = self._job_dir(session_id)
                if folder.exists():
                    self._remove_tree(folder)
                marker.unlink()
                report["deleted"].append(session_id)
            except (OSError, UnicodeError, json.JSONDecodeError, JobStoreError, ValueError) as error:
                report["issues"].append(f"{session_id}: interrupted delete ({type(error).__name__})")
        for folder in list(self.root.iterdir()):
            if not folder.is_dir() or not _SAFE_ID.fullmatch(folder.name):
                continue
            if (folder / "delete.json").exists():
                try:
                    tombstone = json.loads((folder / "delete.json").read_text(encoding="utf-8"))
                    body = {key: value for key, value in tombstone.items() if key != "integrityMarker"}
                    if tombstone.get("integrityMarker") != self._checksum(body) or body.get("sessionId") != folder.name:
                        raise JobStoreCorruptionError("Delete tombstone checksum mismatch")
                    self._remove_tree(folder)
                    report["deleted"].append(folder.name)
                except (OSError, UnicodeError, json.JSONDecodeError, JobStoreCorruptionError) as error:
                    report["issues"].append(f"{folder.name}: interrupted delete ({type(error).__name__})")
                continue
            manifest = folder / "job.json"
            if not manifest.exists():
                report["issues"].append(f"{folder.name}: orphan job directory")
                continue
            try:
                job = self.get_job(folder.name)
                self.validate_committed(folder.name)
                committed = job["checkpoint"]["committedSequence"]
                index_path = folder / "chunks.index"
                if index_path.exists():
                    with index_path.open("r+b") as index_stream:
                        expected_size = committed * _INDEX_RECORD.size
                        if index_stream.seek(0, os.SEEK_END) > expected_size:
                            index_stream.truncate(expected_size)
                            index_stream.flush()
                            os.fsync(index_stream.fileno())
                media_source = (job.get("metadata", {}).get("session") or {}).get("videoSource")
                referenced_media = Path(media_source).resolve() if media_source and media_source != "demo" else None
                for media in list(folder.glob("upload_*")) + list(folder.glob("source_*")):
                    if media.is_file() and media.resolve() != referenced_media:
                        media.unlink()
                # Uncommitted chunks are orphans. The journal remains the commit authority.
                for chunk_path in (folder / "chunks").glob("*.json"):
                    match = re.fullmatch(r"(\d+)\.json", chunk_path.name)
                    if match and int(match.group(1)) > committed:
                        chunk_path.unlink()
                if job.get("status") in {"PROCESSING", "CANCEL_REQUESTED"}:
                    self.update_job(folder.name, {
                        "status": "INTERRUPTED",
                        "interruptedAt": time.time(),
                        "resume": {
                            "available": True,
                            "mode": "SAFE_BOUNDARY_REPROCESS",
                            "reason": "The analyzer temporal state is not durably restorable; resume requires warm-up and reprocessing from a recorded safe boundary.",
                        },
                    })
                    report["interrupted"].append(folder.name)
            except (OSError, JobStoreError, ValueError) as error:
                report["issues"].append(f"{folder.name}: recovery failed ({type(error).__name__})")
                try:
                    self.update_job(folder.name, {"status": "ERROR", "error": "Durable checkpoint/result integrity failed during recovery", "resume": {"available": False, "reason": "Committed result integrity must be repaired before resume"}})
                except (OSError, JobStoreError, ValueError):
                    pass
        self.recovery_report = report
        return report


def default_analysis_store() -> AnalysisJobStore:
    return AnalysisJobStore.from_environment()
