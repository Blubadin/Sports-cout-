/**
 * src/types/domain.ts — Parallel Architecture Domain Models & Repository Boundaries
 *
 * Defines the core business entities for SportsScout:
 * - Athlete (uses stable athleteId as primary key, NEVER player name!)
 * - Match
 * - Rally
 * - Hit
 * - Skill
 * - Video
 * - AnalysisRun
 * - TrackingSession
 * - ModelRun
 * - ReviewCorrection
 *
 * Future AI Training Lifecycle Flow (Cloud / Training unimplemented):
 *   capture / correction
 *     ↓
 *   datasetVersion (e.g. DVC commit / manifest)
 *     ↓
 *   train local / cloud (future ML pipeline)
 *     ↓
 *   checkpoint
 *     ↓
 *   benchmark (automated harness on holdout / blind splits)
 *     ↓
 *   quality gate (frozen baseline thresholds & zero regressions)
 *     ↓
 *   deployment artifact (e.g. ONNX, TensorRT, TorchScript)
 *     ↓
 *   modelVersion (verified runtime artifact hash)
 *     ↓
 *   production (SportsScout workstation tracking engine)
 */

// ============================================================================
// Core Entities
// ============================================================================

/**
 * Stable, permanent athlete record.
 * RULE: athleteId is the unique primary key; athlete name must NEVER be used as PK.
 */
export interface Athlete {
  /** Stable primary key (UUID, slug, or registry ID) */
  athleteId: string;
  /** Primary display name */
  displayName: string;
  /** Official tournament name / passport name */
  officialName?: string;
  givenName?: string;
  familyName?: string;
  gender?: 'men' | 'women' | 'mixed';
  nationality?: string; // ISO 3166-1 alpha-3 (e.g. 'THA', 'JPN', 'DEN')
  dominantHand?: 'left' | 'right' | 'ambidextrous';
  playStyle?: string; // e.g. 'attacking', 'all-round', 'counter-attacking'
  birthDate?: string; // ISO date 'YYYY-MM-DD'
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface MatchParticipantTeam {
  teamId: string;
  name: string;
  /** Stable athlete IDs participating in this team (1 for singles, 2 for doubles) */
  athleteIds: string[];
}

/**
 * Competitive or recorded match session.
 */
export interface Match {
  matchId: string;
  tournamentName?: string;
  stage?: string; // e.g. 'Final', 'Semi-Final', 'Group A'
  venue?: string;
  courtNumber?: number;
  matchDate: string; // ISO date 'YYYY-MM-DD'
  gameType: 'singles' | 'doubles';
  sport: 'badminton' | string;
  team1: MatchParticipantTeam;
  team2: MatchParticipantTeam;
  winningTeam?: 1 | 2;
  scoreSummary?: string; // e.g. '21-18, 19-21, 21-15'
  status: 'scheduled' | 'live' | 'completed' | 'abandoned';
  metadata?: Record<string, unknown>;
}

/**
 * Continuous play segment from serve until shuttlecock is dead.
 */
export interface Rally {
  rallyId: string;
  matchId: string;
  setIndex: number; // 1, 2, 3
  rallyIndex: number; // 1, 2, ...
  servingTeam: 1 | 2;
  servingAthleteId?: string;
  receivingAthleteId?: string;
  scoreBefore: { team1: number; team2: number };
  scoreAfter: { team1: number; team2: number };
  startTimeSec?: number;
  endTimeSec?: number;
  durationSec?: number;
  startFrame?: number;
  endFrame?: number;
  shuttleHitCount?: number;
  resultType?: 'winner' | 'unforced_error' | 'forced_error' | 'service_fault' | 'let' | string;
  winningTeam?: 1 | 2;
  notes?: string;
}

/**
 * Discrete racket contact event during a rally.
 */
export interface Hit {
  hitId: string;
  rallyId: string;
  hitIndex: number;
  /** Stable athlete ID executing the hit (NEVER name) */
  athleteId: string;
  team: 1 | 2;
  timestampSec: number;
  frameIndex: number;
  skillId?: string;
  strokeType: string; // e.g. 'smash', 'drop', 'clear', 'lift', 'net_shot', 'drive', 'serve'
  hand?: 'forehand' | 'backhand';
  contactZone?: string;
  landingZone?: string;
  shuttleSpeedMps?: number;
  courtPosition?: { xM: number; yM: number };
  poseAction?: string;
  confidence?: number;
}

/**
 * Domain taxonomy of technical sports skills.
 */
export interface Skill {
  skillId: string;
  code: string; // e.g. 'SMASH', 'CLEAR', 'NET_DROP'
  name: string;
  category: 'attack' | 'defense' | 'serve' | 'net' | 'transition';
  sport: string;
  description?: string;
}

/**
 * Physical or digital video asset representation.
 */
export interface Video {
  videoId: string;
  videoReference: string;
  matchId?: string;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  checksumHash?: string;
  venueId?: string;
  cameraId?: string;
  cameraType?: string;
  cameraMotion?: string;
  sourceUrl?: string;
  localPath?: string;
  recordedAt?: string;
}

/**
 * A discrete tracking or vision execution pipeline run.
 */
export interface AnalysisRun {
  analysisId: string;
  videoId: string;
  pipelineRunId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  supersededBy?: string | null;
  runtimeProvenance?: Record<string, unknown>;
  qualitySummary?: Record<string, unknown>;
}

/**
 * Tracking session container holding timeline samples and metadata.
 */
export interface TrackingSession {
  sessionId: string;
  analysisId: string;
  matchId?: string;
  trackingMode: 'singles' | 'doubles';
  trackedPlayerCount: number;
  sampleCount: number;
  summaryQuality?: Record<string, unknown>;
}

/**
 * Model configuration and deployment provenance record.
 */
export interface ModelRun {
  modelRunId: string;
  pipelineRunId: string;
  modelVersion: string;
  modelArtifactHash?: string | null;
  detectorModel: string;
  poseModel?: string;
  trackerModel: string;
  runtime: string;
  device: string;
  precision: string;
  hyperparameters?: Record<string, unknown>;
}

/**
 * Explicit human scout or analyst correction.
 * RULE: Human corrections have distinct provenance and are protected from automatic eviction.
 */
export interface ReviewCorrection {
  correctionId: string;
  analysisId: string;
  targetType:
    | 'athlete_identity'
    | 'court_position'
    | 'box'
    | 'keypoint'
    | 'rally_boundary'
    | 'calibration'
    | 'hit';
  targetRef: string; // e.g. frameIndex, trackId, hitId
  athleteId?: string;
  originalValue: Record<string, unknown> | string | number | null;
  correctedValue: Record<string, unknown> | string | number;
  correctedBy: string;
  correctedAt: string;
  isConfirmed: boolean;
  notes?: string;
}

// ============================================================================
// Repository Boundaries (Interfaces)
// ============================================================================

export interface AthleteRepository {
  getById(athleteId: string): Promise<Athlete | null>;
  save(athlete: Athlete): Promise<void>;
  list(query?: { nationality?: string; playStyle?: string }): Promise<Athlete[]>;
  delete(athleteId: string): Promise<void>;
}

export interface MatchRepository {
  getById(matchId: string): Promise<Match | null>;
  save(match: Match): Promise<void>;
  list(query?: { sport?: string; date?: string; venue?: string }): Promise<Match[]>;
  delete(matchId: string): Promise<void>;
}

export interface RallyRepository {
  getById(rallyId: string): Promise<Rally | null>;
  listByMatch(matchId: string): Promise<Rally[]>;
  save(rally: Rally): Promise<void>;
  delete(rallyId: string): Promise<void>;
}

export interface VideoRepository {
  getById(videoId: string): Promise<Video | null>;
  save(video: Video): Promise<void>;
  listByMatch(matchId: string): Promise<Video[]>;
}

export interface AnalysisRunRepository {
  getById(analysisId: string): Promise<AnalysisRun | null>;
  save(run: AnalysisRun): Promise<void>;
  markSuperseded(oldAnalysisId: string, newPipelineRunId: string): Promise<void>;
}

export interface ReviewCorrectionRepository {
  getById(correctionId: string): Promise<ReviewCorrection | null>;
  listByAnalysis(analysisId: string): Promise<ReviewCorrection[]>;
  save(correction: ReviewCorrection): Promise<void>;
  confirm(correctionId: string, confirmedBy: string): Promise<void>;
}
