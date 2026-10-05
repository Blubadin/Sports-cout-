"""
ai_service/domain_models.py — Parallel Architecture Entity Models & Repository Boundaries

Provides canonical entity models for SportsScout:
- Athlete (uses stable athlete_id as primary identifier, NEVER athlete name!)
- Match
- Rally
- Hit
- Skill
- Video
- AnalysisRun
- TrackingSession
- ModelRun
- ReviewCorrection

Future ML / Training Lifecycle Architecture:
--------------------------------------------
1. Capture / Correction:
   Passive failure captures and verified human corrections are recorded locally.
2. Dataset Versioning:
   Annotated subsets are bundled into immutable dataset versions (e.g. DVC commit, manifest vX).
3. Train Local / Cloud (Future - not implemented in workstation):
   Model training pipelines fine-tune or train detector, pose, and shuttle models.
4. Checkpoint:
   Trained weights are serialized with full training hyperparameter provenance.
5. Benchmark:
   Candidates run through the automated Quality Harness across the 14 scenario buckets.
6. Quality Gate:
   Evaluated against frozen baseline thresholds. No individual scenario bucket failures allowed.
7. Deployment Artifact:
   Target-optimized runtime exports (e.g., ONNX, TensorRT, TorchScript) with cryptographic SHA256 hashes.
8. Model Version:
   Artifact registered in model registry with exact modelArtifactHash and runtime compatibility constraints.
9. Production:
   Loaded into SportsScout / Badminton Tracking Lab workstation for real match analysis.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Athlete:
    """
    Stable athlete entity.
    RULE: athlete_id is the unique primary key; athlete name must NEVER be used as PK.
    """
    athlete_id: str
    display_name: str
    official_name: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    gender: Optional[str] = None  # 'men' | 'women' | 'mixed'
    nationality: Optional[str] = None  # ISO 3166-1 alpha-3 (e.g. 'THA', 'JPN')
    dominant_hand: Optional[str] = None  # 'left' | 'right' | 'ambidextrous'
    play_style: Optional[str] = None
    birth_date: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "athleteId": self.athlete_id,
            "displayName": self.display_name,
            "officialName": self.official_name,
            "givenName": self.given_name,
            "familyName": self.family_name,
            "gender": self.gender,
            "nationality": self.nationality,
            "dominantHand": self.dominant_hand,
            "playStyle": self.play_style,
            "birthDate": self.birth_date,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Athlete:
        return cls(
            athlete_id=data["athleteId"],
            display_name=data["displayName"],
            official_name=data.get("officialName"),
            given_name=data.get("givenName"),
            family_name=data.get("familyName"),
            gender=data.get("gender"),
            nationality=data.get("nationality"),
            dominant_hand=data.get("dominantHand"),
            play_style=data.get("playStyle"),
            birth_date=data.get("birthDate"),
            created_at=data.get("createdAt", datetime.now(timezone.utc).isoformat()),
            updated_at=data.get("updatedAt", datetime.now(timezone.utc).isoformat()),
            metadata=data.get("metadata", {}),
        )


@dataclass
class MatchTeam:
    team_id: str
    name: str
    athlete_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "teamId": self.team_id,
            "name": self.name,
            "athleteIds": list(self.athlete_ids),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MatchTeam:
        return cls(
            team_id=data["teamId"],
            name=data["name"],
            athlete_ids=list(data.get("athleteIds", [])),
        )


@dataclass
class Match:
    match_id: str
    match_date: str
    game_type: str  # 'singles' | 'doubles'
    team1: MatchTeam
    team2: MatchTeam
    sport: str = "badminton"
    tournament_name: Optional[str] = None
    stage: Optional[str] = None
    venue: Optional[str] = None
    court_number: Optional[int] = None
    winning_team: Optional[int] = None
    score_summary: Optional[str] = None
    status: str = "completed"  # 'scheduled' | 'live' | 'completed' | 'abandoned'
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "matchId": self.match_id,
            "matchDate": self.match_date,
            "gameType": self.game_type,
            "sport": self.sport,
            "team1": self.team1.to_dict(),
            "team2": self.team2.to_dict(),
            "tournamentName": self.tournament_name,
            "stage": self.stage,
            "venue": self.venue,
            "courtNumber": self.court_number,
            "winningTeam": self.winning_team,
            "scoreSummary": self.score_summary,
            "status": self.status,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Match:
        return cls(
            match_id=data["matchId"],
            match_date=data["matchDate"],
            game_type=data.get("gameType", "singles"),
            sport=data.get("sport", "badminton"),
            team1=MatchTeam.from_dict(data["team1"]),
            team2=MatchTeam.from_dict(data["team2"]),
            tournament_name=data.get("tournamentName"),
            stage=data.get("stage"),
            venue=data.get("venue"),
            court_number=data.get("courtNumber"),
            winning_team=data.get("winningTeam"),
            score_summary=data.get("scoreSummary"),
            status=data.get("status", "completed"),
            metadata=data.get("metadata", {}),
        )


@dataclass
class Rally:
    rally_id: str
    match_id: str
    set_index: int
    rally_index: int
    serving_team: int  # 1 | 2
    serving_athlete_id: Optional[str] = None
    receiving_athlete_id: Optional[str] = None
    score_before: dict[str, int] = field(default_factory=lambda: {"team1": 0, "team2": 0})
    score_after: dict[str, int] = field(default_factory=lambda: {"team1": 0, "team2": 0})
    start_time_sec: Optional[float] = None
    end_time_sec: Optional[float] = None
    duration_sec: Optional[float] = None
    start_frame: Optional[int] = None
    end_frame: Optional[int] = None
    shuttle_hit_count: Optional[int] = None
    result_type: Optional[str] = None
    winning_team: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "rallyId": self.rally_id,
            "matchId": self.match_id,
            "setIndex": self.set_index,
            "rallyIndex": self.rally_index,
            "servingTeam": self.serving_team,
            "servingAthleteId": self.serving_athlete_id,
            "receivingAthleteId": self.receiving_athlete_id,
            "scoreBefore": self.score_before,
            "scoreAfter": self.score_after,
            "startTimeSec": self.start_time_sec,
            "endTimeSec": self.end_time_sec,
            "durationSec": self.duration_sec,
            "startFrame": self.start_frame,
            "endFrame": self.end_frame,
            "shuttleHitCount": self.shuttle_hit_count,
            "resultType": self.result_type,
            "winningTeam": self.winning_team,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Rally:
        return cls(
            rally_id=data["rallyId"],
            match_id=data["matchId"],
            set_index=int(data["setIndex"]),
            rally_index=int(data["rallyIndex"]),
            serving_team=int(data["servingTeam"]),
            serving_athlete_id=data.get("servingAthleteId"),
            receiving_athlete_id=data.get("receivingAthleteId"),
            score_before=data.get("scoreBefore", {"team1": 0, "team2": 0}),
            score_after=data.get("scoreAfter", {"team1": 0, "team2": 0}),
            start_time_sec=data.get("startTimeSec"),
            end_time_sec=data.get("endTimeSec"),
            duration_sec=data.get("durationSec"),
            start_frame=data.get("startFrame"),
            end_frame=data.get("endFrame"),
            shuttle_hit_count=data.get("shuttleHitCount"),
            result_type=data.get("resultType"),
            winning_team=data.get("winningTeam"),
        )


@dataclass
class Hit:
    hit_id: str
    rally_id: str
    hit_index: int
    athlete_id: str  # Foreign key to Athlete, NEVER name!
    team: int  # 1 | 2
    timestamp_sec: float
    frame_index: int
    stroke_type: str
    skill_id: Optional[str] = None
    hand: Optional[str] = None
    contact_zone: Optional[str] = None
    landing_zone: Optional[str] = None
    shuttle_speed_mps: Optional[float] = None
    court_position: Optional[dict[str, float]] = None
    pose_action: Optional[str] = None
    confidence: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "hitId": self.hit_id,
            "rallyId": self.rally_id,
            "hitIndex": self.hit_index,
            "athleteId": self.athlete_id,
            "team": self.team,
            "timestampSec": self.timestamp_sec,
            "frameIndex": self.frame_index,
            "skillId": self.skill_id,
            "strokeType": self.stroke_type,
            "hand": self.hand,
            "contactZone": self.contact_zone,
            "landingZone": self.landing_zone,
            "shuttleSpeedMps": self.shuttle_speed_mps,
            "courtPosition": self.court_position,
            "poseAction": self.pose_action,
            "confidence": self.confidence,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Hit:
        return cls(
            hit_id=data["hitId"],
            rally_id=data["rallyId"],
            hit_index=int(data["hitIndex"]),
            athlete_id=data["athleteId"],
            team=int(data["team"]),
            timestamp_sec=float(data["timestampSec"]),
            frame_index=int(data["frameIndex"]),
            stroke_type=data["strokeType"],
            skill_id=data.get("skillId"),
            hand=data.get("hand"),
            contact_zone=data.get("contactZone"),
            landing_zone=data.get("landingZone"),
            shuttle_speed_mps=data.get("shuttleSpeedMps"),
            court_position=data.get("courtPosition"),
            pose_action=data.get("poseAction"),
            confidence=data.get("confidence"),
        )


@dataclass
class Skill:
    skill_id: str
    code: str
    name: str
    category: str
    sport: str = "badminton"
    description: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "skillId": self.skill_id,
            "code": self.code,
            "name": self.name,
            "category": self.category,
            "sport": self.sport,
            "description": self.description,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Skill:
        return cls(
            skill_id=data["skillId"],
            code=data["code"],
            name=data["name"],
            category=data["category"],
            sport=data.get("sport", "badminton"),
            description=data.get("description"),
        )


@dataclass
class Video:
    video_id: str
    video_reference: str
    duration_sec: float
    fps: float
    width: int
    height: int
    match_id: Optional[str] = None
    checksum_hash: Optional[str] = None
    venue_id: Optional[str] = None
    camera_id: Optional[str] = None
    camera_type: Optional[str] = None
    camera_motion: Optional[str] = None
    source_url: Optional[str] = None
    local_path: Optional[str] = None
    recorded_at: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "videoId": self.video_id,
            "videoReference": self.video_reference,
            "matchId": self.match_id,
            "durationSec": self.duration_sec,
            "fps": self.fps,
            "width": self.width,
            "height": self.height,
            "checksumHash": self.checksum_hash,
            "venueId": self.venue_id,
            "cameraId": self.camera_id,
            "cameraType": self.camera_type,
            "cameraMotion": self.camera_motion,
            "sourceUrl": self.source_url,
            "localPath": self.local_path,
            "recordedAt": self.recorded_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Video:
        return cls(
            video_id=data["videoId"],
            video_reference=data["videoReference"],
            duration_sec=float(data["durationSec"]),
            fps=float(data["fps"]),
            width=int(data["width"]),
            height=int(data["height"]),
            match_id=data.get("matchId"),
            checksum_hash=data.get("checksumHash"),
            venue_id=data.get("venueId"),
            camera_id=data.get("cameraId"),
            camera_type=data.get("cameraType"),
            camera_motion=data.get("cameraMotion"),
            source_url=data.get("sourceUrl"),
            local_path=data.get("localPath"),
            recorded_at=data.get("recordedAt"),
        )


@dataclass
class AnalysisRun:
    analysis_id: str
    video_id: str
    pipeline_run_id: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    superseded_by: Optional[str] = None
    runtime_provenance: dict[str, Any] = field(default_factory=dict)
    quality_summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysisId": self.analysis_id,
            "videoId": self.video_id,
            "pipelineRunId": self.pipeline_run_id,
            "status": self.status,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
            "supersededBy": self.superseded_by,
            "runtimeProvenance": self.runtime_provenance,
            "qualitySummary": self.quality_summary,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AnalysisRun:
        return cls(
            analysis_id=data["analysisId"],
            video_id=data["videoId"],
            pipeline_run_id=data["pipelineRunId"],
            status=data["status"],
            started_at=data["startedAt"],
            completed_at=data.get("completedAt"),
            superseded_by=data.get("supersededBy"),
            runtime_provenance=data.get("runtimeProvenance", {}),
            quality_summary=data.get("qualitySummary", {}),
        )


@dataclass
class TrackingSession:
    session_id: str
    analysis_id: str
    tracking_mode: str  # 'singles' | 'doubles'
    tracked_player_count: int
    sample_count: int
    match_id: Optional[str] = None
    summary_quality: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "analysisId": self.analysis_id,
            "matchId": self.match_id,
            "trackingMode": self.tracking_mode,
            "trackedPlayerCount": self.tracked_player_count,
            "sampleCount": self.sample_count,
            "summaryQuality": self.summary_quality,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TrackingSession:
        return cls(
            session_id=data["sessionId"],
            analysis_id=data["analysisId"],
            match_id=data.get("matchId"),
            tracking_mode=data["trackingMode"],
            tracked_player_count=int(data["trackedPlayerCount"]),
            sample_count=int(data["sampleCount"]),
            summary_quality=data.get("summaryQuality", {}),
        )


@dataclass
class ModelRun:
    model_run_id: str
    pipeline_run_id: str
    model_version: str
    detector_model: str
    tracker_model: str
    runtime: str
    device: str
    precision: str
    pose_model: Optional[str] = None
    model_artifact_hash: Optional[str] = None
    hyperparameters: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "modelRunId": self.model_run_id,
            "pipelineRunId": self.pipeline_run_id,
            "modelVersion": self.model_version,
            "modelArtifactHash": self.model_artifact_hash,
            "detectorModel": self.detector_model,
            "poseModel": self.pose_model,
            "trackerModel": self.tracker_model,
            "runtime": self.runtime,
            "device": self.device,
            "precision": self.precision,
            "hyperparameters": self.hyperparameters,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ModelRun:
        return cls(
            model_run_id=data["modelRunId"],
            pipeline_run_id=data["pipelineRunId"],
            model_version=data["modelVersion"],
            model_artifact_hash=data.get("modelArtifactHash"),
            detector_model=data["detectorModel"],
            pose_model=data.get("poseModel"),
            tracker_model=data["trackerModel"],
            runtime=data["runtime"],
            device=data["device"],
            precision=data["precision"],
            hyperparameters=data.get("hyperparameters", {}),
        )


@dataclass
class ReviewCorrection:
    """
    Explicit human scout or analyst correction.
    RULE: Human corrections have distinct provenance and are protected from automatic eviction.
    """
    correction_id: str
    analysis_id: str
    target_type: str  # 'athlete_identity' | 'court_position' | 'box' | 'keypoint' | 'rally_boundary' | 'calibration' | 'hit'
    target_ref: str
    original_value: Any
    corrected_value: Any
    corrected_by: str
    corrected_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_confirmed: bool = False
    athlete_id: Optional[str] = None
    notes: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "correctionId": self.correction_id,
            "analysisId": self.analysis_id,
            "targetType": self.target_type,
            "targetRef": self.target_ref,
            "athleteId": self.athlete_id,
            "originalValue": self.original_value,
            "correctedValue": self.corrected_value,
            "correctedBy": self.corrected_by,
            "correctedAt": self.corrected_at,
            "isConfirmed": self.is_confirmed,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ReviewCorrection:
        return cls(
            correction_id=data["correctionId"],
            analysis_id=data["analysisId"],
            target_type=data["targetType"],
            target_ref=str(data["targetRef"]),
            original_value=data.get("originalValue"),
            corrected_value=data["correctedValue"],
            corrected_by=data["correctedBy"],
            corrected_at=data.get("correctedAt", datetime.now(timezone.utc).isoformat()),
            is_confirmed=data.get("isConfirmed") is True,
            athlete_id=data.get("athleteId"),
            notes=data.get("notes"),
        )


# ============================================================================
# Abstract Repository Boundaries
# ============================================================================

class AthleteRepository(ABC):
    @abstractmethod
    def get_by_id(self, athlete_id: str) -> Optional[Athlete]:
        """Fetch athlete by stable ID."""

    @abstractmethod
    def save(self, athlete: Athlete) -> None:
        """Persist or update an athlete."""

    @abstractmethod
    def list(self, query: Optional[dict[str, Any]] = None) -> list[Athlete]:
        """Query athletes by criteria."""


class MatchRepository(ABC):
    @abstractmethod
    def get_by_id(self, match_id: str) -> Optional[Match]:
        """Fetch match by ID."""

    @abstractmethod
    def save(self, match: Match) -> None:
        """Persist or update match."""


class ReviewCorrectionRepository(ABC):
    @abstractmethod
    def get_by_id(self, correction_id: str) -> Optional[ReviewCorrection]:
        """Fetch human correction by ID."""

    @abstractmethod
    def list_by_analysis(self, analysis_id: str) -> list[ReviewCorrection]:
        """List all human corrections for an analysis."""

    @abstractmethod
    def save(self, correction: ReviewCorrection) -> None:
        """Persist human correction."""

    @abstractmethod
    def confirm(self, correction_id: str, confirmed_by: str) -> bool:
        """Confirm human review."""
