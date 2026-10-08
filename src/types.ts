export type SportType = 'volleyball' | 'football' | 'badminton' | 'basketball';

export type VideoSourceType = 'local' | 'youtube' | 'none';

export type Team = {
  id: string;
  code: string;
  name: string;
  thaiName: string;
  teamType?: 'country' | 'club';
  icon?: string;
};

export type AreaRequirement = "always" | "optional" | "never" | "optionalWhenOut";

export type AreaPrecisionMode = 'normal' | 'detailed' | 'point';
export type AreaCourtViewMode = 'auto' | 'full' | 'half';
export type WorkspaceExperience = 'classic' | 'workstation';

export type OutZoneType =
  | 'side_left_near'
  | 'side_left_far'
  | 'side_right_near'
  | 'side_right_far'
  | 'back_left'
  | 'back_right'
  | 'net_error'
  | 'unknown'
  | 'left_touchline_def'
  | 'left_touchline_mid'
  | 'left_touchline_att'
  | 'right_touchline_def'
  | 'right_touchline_mid'
  | 'right_touchline_att'
  | 'own_endline'
  | 'opp_endline'
  | 'corner_left'
  | 'corner_right'
  | 'goal_kick'
  | 'left_sideline'
  | 'right_sideline'
  | 'baseline_left'
  | 'baseline_right'
  | 'endline'
  | 'opp_back_left'
  | 'opp_back_right'
  | 'net_err'
  | 'opp_back_out'
  | 'own_back_out'
  | 'side_left'
  | 'side_right';

export type AreaSelectionPayload = {
  areaCode?: string;
  areaLabel?: string;
  areaMode?: AreaPrecisionMode;
  courtSide?: 'teamA' | 'teamB' | 'neutral';
  gridX?: number;
  gridY?: number;
  pointX?: number;
  pointY?: number;
  outZone?: OutZoneType;
  areaResolution?: string;
  courtViewMode?: AreaCourtViewMode;
};

export type AreaLayoutConfig = {
  type: 'grid' | 'zones' | 'point' | 'out';
  resolution?: string;
  zones?: Array<{ id: string; label: string; code?: string; gridX?: number; gridY?: number; width?: number; height?: number }>;
  rows?: number;
  cols?: number;
  outZones?: OutZoneType[];
};

export type Skill = {
  id: string;
  code: string;
  name: string;
  thaiName: string;
  areaRequirement?: AreaRequirement;
};

export type Area = {
  id: string;
  code: string;
  thaiName: string;
  type?: 'court' | 'error';
  shortcutKey?: string;
};

export type ResultType = {
  id: string;
  code: 'Yes' | 'Out' | 'Pass';
  score: 1 | -1 | 0;
  thaiName: string;
};

export type DescriptorOption = {
  code: string;
  label: string;
  thaiLabel: string;
};

export type DescriptorGroup = {
  id: string;
  label: string;
  thaiLabel: string;
  required: boolean;
  options: DescriptorOption[];
};

export type FoulRole = 'committed' | 'drawn' | 'violation' | 'technical';

export type FoulSeverity = 'normal' | 'warning' | 'card' | 'technical';

export interface FoulOption {
  code: string;
  label: string;
  labelTh?: string;
  role?: FoulRole;
  severity?: FoulSeverity;
}

export type SportTemplate = {
  id: SportType;
  name: string;
  thaiName: string;
  teamsEnabled: boolean;
  playersEnabled: boolean;
  areas: Area[];
  areaLayouts?: {
    normal: AreaLayoutConfig;
    detailed?: AreaLayoutConfig;
    point?: AreaLayoutConfig;
    outOfBounds?: AreaLayoutConfig;
  };
  skills: Skill[];
  results: ResultType[];
  descriptors?: Record<string, DescriptorGroup[]>; // Keyed by skill code or "ALL"
  fouls?: FoulOption[];
};

export type VolleyballDomainPayload = {
  type: 'volleyball';
  rotation?: 1 | 2 | 3 | 4 | 5 | 6;
  server?: 'teamA' | 'teamB';
  rallyPhase?: 'serve' | 'reception' | 'set' | 'attack' | 'block' | 'dig';
  attackGrade?: string;
  receptionGrade?: string;
  startArea?: AreaSelectionPayload;
  targetArea?: AreaSelectionPayload;
  systemContext?: 'in_system' | 'out_of_system';
};

export type FootballDomainPayload = {
  type: 'football';
  possessionTeam?: string;
  phase?: 'build_up' | 'attack' | 'transition' | 'set_piece' | 'dead_ball';
  startCoord?: { x: number; y: number };
  endCoord?: { x: number; y: number };
  passSequenceIndex?: number;
};

export type BadmintonDomainPayload = {
  type: 'badminton';
  strokeType?: string;
  contactZone?: string;
  landingZone?: string;
  rallyStrokeIndex?: number;
};

export type BasketballDomainPayload = {
  type: 'basketball';
  possessionTeam?: string;
  shotClockRemaining?: number;
  periodType?: string;
  pointValue?: 1 | 2 | 3;
  reboundType?: 'offensive' | 'defensive';
};

export type SportDomainPayload =
  | VolleyballDomainPayload
  | FootballDomainPayload
  | BadmintonDomainPayload
  | BasketballDomainPayload;

export type Action = {
  id?: string;
  teamCode?: string;
  skillCode?: string;
  areaCode?: string;
  areaLabel?: string;
  areaMode?: AreaPrecisionMode;
  courtSide?: 'teamA' | 'teamB' | 'neutral';
  gridX?: number;
  gridY?: number;
  pointX?: number; // normalized 0-1
  pointY?: number; // normalized 0-1
  outZone?: OutZoneType;
  areaResolution?: string; // e.g. '6-zone', '9-zone', '4x6', 'shot-14'
  courtViewMode?: AreaCourtViewMode;
  resultCode?: string;
  resultDetailCode?: string;
  foulCode?: string;
  foulRole?: FoulRole;
  foulSeverity?: FoulSeverity;
  descriptors?: Record<string, string>;
  playerNumber?: string;
  playerName?: string;
  videoTime?: number;
  videoTimeEnd?: number;
  duration?: number;
  realTime?: number;
  outcomeStatus?: 'success' | 'error' | 'neutral' | 'continued';
  scoreDelta?: number;
  actionCategory?: 'attack' | 'defense' | 'transition' | 'set_piece' | 'violation';
  domainPayload?: SportDomainPayload;
};

export type EventRow = {
  id: string;
  no: number;
  point: number;
  actions: Action[];
  eventText: string;
  thaiMeaningText?: string;
  extendedEventText?: string;
  resultText: '+1' | '-1' | '0';
  videoSourceType?: VideoSourceType;
  youtubeVideoId?: string;
  videoId?: string;
  videoUrl?: string;
  localFileName?: string;
  videoTime?: number;
  sequenceStartTime?: number;
  sequenceEndTime?: number;
  sequenceDuration?: number;
  duration?: number;
  clipStartTime?: number;
  clipEndTime?: number;
  previewStartTime?: number;
  previewEndTime?: number;
  isBookmarked?: boolean;
  bookmarkNote?: string;
  bookmarkedAt?: string;
  sportType?: SportType;
  note?: string;
  createdAt: string;
  scoreDelta?: number;
  outcomeStatus?: 'success' | 'error' | 'neutral' | 'continued';
  rallyId?: string;
  phaseType?: string;
  annotations?: TelestrationShape[];
};

export type MatchInfo = {
  scouterName: string;
  nickname: string;
  matchName: string;
  matchType: 'Single' | 'Team';
  setOrGame: string;
  currentPoint: number;
  sportType: SportType;
  courtConfig?: string;
  gameFormat?: string;
};

export type AppSettings = {
  workspaceExperience?: WorkspaceExperience;
  workbenchPreset?: 'scout' | 'review' | 'analysis' | 'report' | 'lab';
  autoNextPoint: boolean;
  theme?: 'light' | 'dark' | 'monochrome';
  darkMode: boolean; // keep for backwards compatibility
  maxPoints: number;
  fastMode: boolean;
  advancedDetailMode: boolean;
  videoSkipStep: number;
  defaultPlaybackSpeed: number;
  enableRadialMenu?: boolean;
  autoPlayAfterSeek?: boolean;
  enableVideoGestures?: boolean;
  swipeSensitivity?: number;
  doubleTapSeekStep?: number;
  liveScrub?: boolean;
  showGestureOverlay?: boolean;
  flipCourtSide?: boolean;
  
  // Area Precision
  areaPrecisionMode?: AreaPrecisionMode;
  enableOutOfBoundsZones?: boolean;
  autoCollapseAreaSelector?: boolean;
  enableArrowAreaNavigation?: boolean;
  areaAutoSelectOnArrow?: boolean;
  showDetailedAreaInDashboard?: boolean;
  areaCourtViewMode?: AreaCourtViewMode;
  
  // Screen Marking Mode
  enableScreenMarkingMode?: boolean;
  screenMarkingKey?: string;
  skillInputLayout?: 'wheel' | 'grid' | 'compact';
  uiLanguage?: 'th' | 'en';
  
  // HUD Mode settings
  enableScoutHUDMode?: boolean;
  hudDefaultMode?: 'classic' | 'pro';
  hudOverlayOpacity?: number;
  hudShowTopStats?: boolean;
  hudShowActionStatus?: boolean;
  hudShowVideoControls?: boolean;
  hudShowVideoTime?: boolean;
  hudAutoHideControls?: boolean;
  hudMobileLargeButtons?: boolean;
  hudEnableGameFeedback?: boolean;
  hudEnableSoundFeedback?: boolean;
  hudEnableHapticFeedback?: boolean;
  hudInteractionStyle?: 'hold' | 'click';
  hudExperienceMode?: 'auto' | 'pro' | 'phone';
  phoneScoutDensity?: 'compact' | 'comfortable';
  controllerV1Enabled?: boolean;
  /** @deprecated Legacy HUD AI tracking setting — removed in Phase 2 */
  aiTrackingEnabled?: boolean;
  /** @deprecated Legacy HUD AI tracking setting — removed in Phase 2 */
  aiTrackingMode?: 'browser' | 'server';
  /** @deprecated Legacy HUD AI tracking setting — removed in Phase 2 */
  aiTrackingServerUrl?: string;
  /** @deprecated Legacy HUD AI tracking setting — removed in Phase 2 */
  aiShowSkeleton?: boolean;
  badmintonGameType?: 'singles' | 'doubles';
  /** @deprecated Legacy HUD AI tracking setting — removed in Phase 2 */
  aiShowVideoOverlay?: boolean;
};

export type TelestrationTool = 'pen' | 'arrow' | 'circle' | 'box' | 'spotlight' | 'text' | 'measure';

export interface TelestrationPoint {
  x: number;
  y: number;
}

export interface TelestrationShape {
  id: string;
  type: TelestrationTool;
  color: string;
  lineWidth: number;
  points: TelestrationPoint[];
  text?: string;
  timestamp: number;
  duration: number;
  endTime?: number;
  eventId?: string;
  label?: string;
}

export type ScoutProject = {
  id: string;
  title: string;
  folderName?: string;
  sportType: SportType;
  matchInfo: MatchInfo;
  teams: Team[];
  events: EventRow[];
  settingsSnapshot?: AppSettings;
  videoMeta?: {
    sourceType: 'youtube' | 'local' | 'none';
    youtubeUrl?: string;
    youtubeVideoId?: string;
    localFileName?: string;
    lastVideoTime?: number;
    duration?: number;
    annotations?: TelestrationShape[];
    courtCalibration?: {
      tl: [number, number]; // Top-left [x,y] 0-1
      tr: [number, number]; // Top-right [x,y] 0-1
      bl: [number, number]; // Bottom-left [x,y] 0-1
      br: [number, number]; // Bottom-right [x,y] 0-1
    };
    aiSuggestions?: AISuggestion[];
  };
  createdAt: string;
  updatedAt: string;
};

export interface AISuggestion {
  id: string;
  time: number;
  duration?: number;
  label: string;
  confidence?: number;
  type?: 'rally' | 'skill' | 'touch';
  skillCode?: string;
  playerId?: string;
  teamCode?: string;
  courtLocation?: { x: number; y: number };
  status?: 'pending' | 'accepted' | 'rejected';
}

export interface AIPoseKeypoint {
  x: number; // 0..100 or pixel
  y: number;
  score?: number;
  name?: string;
}

/**
 * 2D Pose Estimates derived from monocular camera video.
 * NOTE: These are strictly 2D planar pixel estimates and MUST NOT be
 * represented as true 3D kinematics, ground reaction forces, joint torques,
 * or absolute vertical jump heights.
 */
export interface PoseMetrics2D {
  rightKneeAngleDeg?: number;
  leftKneeAngleDeg?: number;
  rightElbowAngleDeg?: number;
  leftElbowAngleDeg?: number;
  trunkLeanDeg?: number;
  stanceWidthPx?: number;
  lungeDetected?: boolean;
  overheadArmDetected?: boolean;
  airborneCandidate?: boolean;
  // Python snake_case compatibility
  right_knee_angle_deg?: number;
  left_knee_angle_deg?: number;
  right_elbow_angle_deg?: number;
  left_elbow_angle_deg?: number;
  trunk_lean_deg?: number;
  stance_width_px?: number;
  lunge_detected?: boolean;
  overhead_arm_detected?: boolean;
  airborne_candidate?: boolean;
}

export interface TrackingPoseV1 {
  keypoints: {
    x: number;
    y: number;
    score: number;
    name?: string;
    isReused?: boolean;
    ageFrames?: number;
  }[];
  /**
   * Coordinate units for x/y. `pixel` means source-video-frame pixels (not ROI
   * crop pixels); `normalized_percent` means 0..100 relative to the source frame.
   * Unmarked legacy poses are accepted only from the known schemaVersion 1 API.
   */
  keypointCoordinateSpace?: 'normalized_percent' | 'pixel';
  metrics?: PoseMetrics2D;
  action?: string;
  confidence?: number | null;
  isReused?: boolean;
  ageFrames?: number;
}

export type GroundPointProvenance =
  | 'pose_both_ankles'
  | 'pose_left_ankle'
  | 'pose_right_ankle'
  | 'bbox_bottom_center';

export interface FootTelemetryV1 {
  /** Source-frame pixel coordinates. */
  positionPx?: { x: number; y: number } | null;
  /** Position normalized to 0..100 relative to the source frame. */
  positionPct?: { x: number; y: number } | null;
  confidence?: number | null;
  courtPositionM?: { xM: number; yM: number } | null;
  source?: string;
  ageFrames?: number;
  ageSec?: number;
  isStale?: boolean;
  staleReason?: string | null;
}

export interface TrackingPlayerV1 {
  playerId: string;
  athleteId?: string | null;
  trackId?: number | null;
  teamCode?: string;
  bboxPct?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  /** Ground point normalized to 0..100 relative to the source frame. */
  groundPointPct?: {
    x: number;
    y: number;
  } | null;
  groundPointProvenance?: GroundPointProvenance | null;
  rawGroundPoint?: {
    groundPx: { x: number; y: number };
    groundPct: { x: number; y: number };
    provenance: GroundPointProvenance;
    confidence: number;
    poseSource: string;
    poseAgeFrames: number;
    poseAgeSec: number;
    validity: string;
    metricEligible: boolean;
    metricQuality: string;
  } | null;
  filteredGroundPoint?: { xM: number; yM: number } | null;
  distanceMetrics?: {
    totalTrackedDistanceM?: number | null;
    distanceDuringActivePlayM?: number | null;
    metricDistanceCoverage?: number | null;
    groundPointQuality?: string | null;
    rawMovementM?: number | null;
    filteredMovementM?: number | null;
    jitterRejectedDistanceM?: number | null;
    validMovementSamples?: number | null;
    provenanceDistribution?: Record<string, number>;
    measurementUncertaintyM?: number | null;
  } | null;
  groundPositionM?: { xM: number; yM: number } | null;
  courtPositionM?: { xM: number; yM: number } | null;
  /** Source-frame pixel coordinates. */
  leftFootPx?: { x: number; y: number } | null;
  /** Source-frame pixel coordinates. */
  rightFootPx?: { x: number; y: number } | null;
  leftFootConfidence?: number | null;
  rightFootConfidence?: number | null;
  leftFootCourtM?: { xM: number; yM: number } | null;
  rightFootCourtM?: { xM: number; yM: number } | null;
  leftFoot?: FootTelemetryV1 | null;
  rightFoot?: FootTelemetryV1 | null;
  envelopeZone?: 'IN_COURT' | 'NEAR_COURT' | 'FAR_OUTSIDE' | null;
  eligibilityStatus?: 'ELIGIBLE' | 'CANDIDATE' | 'SPECTATOR_OR_OFFICIAL' | 'UNRESOLVED' | null;
  poseSource?: string | null;
  poseAgeFrames?: number | null;
  poseAgeSec?: number | null;
  isPoseStale?: boolean | null;
  staleReason?: string | null;
  courtPosition?: {
    xM: number;
    yM: number;
    xPct: number;
    yPct: number;
  } | null;
  absoluteZone?: string | null;
  playerRelativeZone?: string | null;
  speedMps?: number | null;
  totalDistanceM?: number | null;
  detectionConfidence?: number | null;
  confidence?: number | null;
  state: 'observed' | 'predicted' | 'lost';
  observationState?: 'observed' | 'predicted' | 'interpolated' | 'manual' | null;
  reviewState?: 'unreviewed' | 'reviewed' | 'corrected';
  pose?: TrackingPoseV1 | null;
}

/** Fresh detector output retained independently from semantic P1–P4 profiles. */
export interface RawPlayerDetectionV1 {
  trackId: number | null;
  bboxPx: [number, number, number, number];
  confidence: number | null;
  pose: TrackingPoseV1 | null;
  eligibility?: {
    status: 'ELIGIBLE' | 'CANDIDATE' | 'SPECTATOR_OR_OFFICIAL' | 'UNRESOLVED';
    isEligibleForProfile: boolean;
    reasons?: string[];
    [key: string]: unknown;
  } | null;
}

export interface TrackingTelemetryV1 {
  schemaVersion: 1;
  analysisId: string;
  pipelineRunId?: string;
  timestampSec: number;
  frameIndex: number;
  sourceFrame?: number;
  shuttleShotEvents?: import('./types/shuttleShots').ShuttleShotEvents | null;
  timebase?: string | null;
  sceneState?: import('./types/scene').SceneState | string | null;
  sceneTransition?: import('./types/scene').SceneStateTransition | null;
  sceneEvidence?: import('./types/scene').SceneEvidence | null;
  capabilities?: import('./types/capabilities').SegmentCapabilities | null;
  canTrackPlayer?: boolean;
  canTrackShuttle?: boolean;
  canUseCourtMetric?: boolean;
  canBuildHeatmap?: boolean;
  /** Fresh image-space input readiness only; not evidence that a hit/contact occurred. */
  canEstimateHit?: boolean;
  canWriteCanonicalMatchData?: boolean;
  isMetricValid?: boolean;
  allowCanonicalWrites?: boolean;
  calibrationUnavailableReason?: string | null;
  engineVersion?: string;
  modelVersion?: string;
  modelArtifactHash?: string | null;
  runtime?: string | null;
  requestedDevice?: string | null;
  effectiveDevice?: string | null;
  precision?: string | null;
  /** Additive V1 temporal calibration identity. Absent on legacy saved frames. */
  cameraSegmentId?: string;
  calibrationId?: string | null;
  calibrationVersion?: string | null;
  calibrationState?: import('./types/calibration').CalibrationState;
  calibrationConfidence?: number | null;
  calibration?: import('./types/calibration').CalibrationProvenance | null;
  confidence?: number | null;
  observationState?: 'observed' | 'predicted' | 'interpolated' | 'manual' | null;
  reviewState?: 'unreviewed' | 'reviewed' | 'corrected';
  supersededBy?: string | null;
  isSynthetic?: boolean;
  source?: 'real_tracking' | 'synthetic_demo' | string;
  trackedPlayerCount?: number;
  players: TrackingPlayerV1[];
  /** Raw MOT detections/poses are separate from semantic player profiles. */
  rawPlayerDetections?: RawPlayerDetectionV1[];
  /** Canonical separate shuttlecock observation stream (Phase 2.1) */
  shuttle?: import('./types/shuttleTelemetry').ShuttleObservation | null;
}

export interface AITrackingPlayer extends Partial<TrackingPlayerV1> {
  id: number;
  team: 1 | 2;
  name: string;
  court_pos_pct: { x: number; y: number } | null;
  court_pos_m?: { x: number; y: number } | null;
  zone: string | null;
  speed_ms: number | null;
  total_dist_m: number | null;
  is_active?: boolean;
  bbox?: [number, number, number, number] | null;
  // AlphaPose Body & Action Tracking additions
  pose_action?: 'READY' | 'SMASH' | 'CLEAR' | 'DROP' | 'DRIVE' | 'NET_SHOT' | 'LIFT';
  pose_confidence?: number;
  keypoints?: AIPoseKeypoint[]; // 17 AlphaPose / COCO Keypoints
  // Video Frame Overlay Coords (Percentages 0..100% on Video Screen)
  video_bbox_pct?: { x: number; y: number; width: number; height: number };
  video_keypoints_pct?: { x: number; y: number }[];
}

export interface AITelemetryFrame extends Partial<Omit<TrackingTelemetryV1, 'players'>> {
  timestamp: number;
  frame_idx: number;
  game_type?: 'singles' | 'doubles';
  tracked_player_count?: number;
  players: AITrackingPlayer[];
  source?: string;
}

export type TrackingOverlayMode = 'skeleton' | 'center' | 'feet' | 'box' | 'off';

export interface BodyCenterProxy {
  xPct: number;
  yPct: number;
  provenance: 'pose' | 'bbox';
}

export interface FeetPositionProxy {
  xPct: number;
  yPct: number;
  provenance: 'pose_ankles' | 'pose_single_ankle' | 'bbox_ground' | GroundPointProvenance;
}

export interface TrackingLivePlayerStatus {
  playerId: string;
  trackId: number | null;
  totalDistanceM: number | null;
  currentSpeedMps: number | null;
  trackingState: 'observed' | 'predicted' | 'lost';
  detectionConfidence?: number | null;
  courtPosition?: {
    xM: number;
    yM: number;
    xPct: number;
    yPct: number;
  } | null;
}

/** Canonical backend session statuses. */
export type BackendSessionStatus =
  | 'READY'
  | 'VIDEO_READY'
  | 'READY_TO_ANALYZE'
  | 'PROCESSING'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'COMPLETED'
  | 'ERROR';

export interface TrackingSessionStatus {
  sessionId: string;
  status: BackendSessionStatus;
  progressPct: number;
  currentFrame: number;
  lastProcessedFrame?: number;
  durableCheckpointFrame?: number;
  checkpointSequence?: number;
  committedResultCursor?: number;
  resumable?: boolean;
  resume?: { available?: boolean; mode?: string | null; reason?: string | null; temporalStateRestoredExactly?: boolean } | null;
  totalFrames: number;
  analyzedFrames: number;
  frameStride: number;
  elapsedSec: number | null;
  videoDurationSec: number | null;
  lastTelemetryTimestampSec: number | null;
  sourceFps: number | null;
  samplingFps: number | null;
  analysisFps: number | null;
  trackedPlayerCount: number;
  device: string;
  requestedDevice?: string;
  effectiveDevice?: string;
  processingConfig?: ProcessingConfig;
  effectiveProcessingConfig?: ProcessingConfig;
  runtimeProvenance?: TrackingRuntimeProvenance;
  provenance?: TrackingRuntimeProvenance;
  performance?: TrackingPerformanceStats;
  quality?: TrackingQualityStats;
  videoMetadata?: SourceVideoMetadata;
  researchMetadata?: CameraResearchMetadata;
  players: TrackingLivePlayerStatus[];
  cameraSegmentId?: string;
  calibrationId?: string | null;
  calibrationState?: import('./types/calibration').CalibrationState;
  calibrationConfidence?: number | null;
  reprojectionErrorPx?: number | null;
  calibration?: import('./types/calibration').CalibrationProvenance | null;
  shuttle?: ShuttleProvenance | null;
  error: string | null;
}

export type FrameRateType = 'CFR' | 'VFR' | 'Unknown';

export interface SourceVideoMetadata {
  filename?: string;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  aspectRatio?: string | null;
  nominalFps?: number | null;
  reportedFrameCount?: number | null;
  frameCountProvenance?: string;
  frameIntervalMs?: number | null;
  codec?: string | null;
  bitrateKbps?: number | null;
  pixelFormat?: string | null;
  frameRateType?: FrameRateType;
}

export interface CameraResearchMetadata {
  cameraMake?: string | null;
  cameraModel?: string | null;
  exposureSec?: number | null;
  iso?: number | null;
  aperture?: number | null;
  focalLengthMm?: number | null;
  derivedShutterAngleDeg?: number | null;
}

export type ProcessingProfile = 'auto' | 'reference' | 'fast' | 'balanced' | 'quality' | 'custom';

export interface ProcessingConfig {
  fallbackReason?: string | null;
  profile?: ProcessingProfile;
  requestedProfile?: ProcessingProfile;
  effectiveProfile?: ProcessingProfile;
  device: 'auto' | 'cpu' | 'cuda' | 'mps';
  requestedDevice?: 'auto' | 'cpu' | 'cuda' | 'mps';
  effectiveDevice?: 'cpu' | 'cuda' | 'mps';
  detectorInputSize: number;
  useCourtRoi: boolean;
  courtRoiMarginPx: number;
  courtRoiMarginM?: number;
  frameStride: number;
  poseStride: number;
  detectorModel?: string;
  detectorFamily?: string;
  poseModel?: string | null;
  poseFamily?: string | null;
  poseArchitecture?: 'roi_pose' | 'full_frame_pose';
  trackerName?: string;
  trackerConfigPath?: string | null;
  trackerConfig?: string | null;
  reidEnabled?: boolean;
  reidModel?: string | null;
  runtime?: 'pytorch' | 'onnx' | 'tensorrt' | string;
  precision?: 'fp32' | 'fp16' | 'int8' | string;
  confidenceThreshold?: number;
  autoCourtCalibrationEnabled?: boolean;

  // Shuttle configuration fields (Phase 2.9A)
  shuttleEnabled?: boolean;
  shuttleProvider?: string;
  shuttleModelPath?: string | null;
  shuttleWindowSize?: number;
  shuttleInputWidth?: number;
  shuttleInputHeight?: number;
  shuttleConfidenceThreshold?: number;
  shuttleCentroidRelativeThreshold?: number;
  shuttleCandidateMode?: string;
  shuttleRecoveryEnabled?: boolean;
  shuttleDevice?: string;
  shuttleRuntime?: string;
  shuttlePrecision?: string;
  shuttleAuxiliaryDetector?: string | null;
  shuttleBuildTrajectory?: boolean;
}

export interface TrackingPerformanceStats {
  elapsedSec: number | null;
  processedVideoTimeSec?: number | null;
  videoDurationSec?: number | null;
  rtf: number | null;
  realtimeSpeed: number | null;
  analysisFps: number | null;
  samplingFps: number | null;
  isFinal?: boolean;
}

export interface PlayerTrackingCoverage {
  playerId: string;
  expectedFrames: number;
  observedFrames: number;
  predictedFrames: number;
  lostFrames: number;
  observedCoveragePct: number;
  predictedFramesPct: number;
  lostFramesPct: number;
  lostTimeSec: number;
}

export interface TrackingQualityStats {
  observedCoveragePct: number | null;
  lostFramesPct: number | null;
  predictedFramesPct?: number | null;
  poseCoveragePct: number | null;
  meanTargetCoveragePct?: number | null;
  simultaneousCoveragePct?: number | null;
  playerCoverage?: Record<string, PlayerTrackingCoverage>;
}

export type ShuttleTrackingStatus =
  | 'ERROR'
  | 'DISABLED'
  | 'REQUESTED'
  | 'MODEL_UNAVAILABLE'
  | 'AVAILABLE'
  | 'RUNTIME_UNAVAILABLE'
  | 'INITIALIZATION_ERROR'
  | string;

export interface InferenceProviderProvenance {
  requestedDevice?: string;
  effectiveDevice?: string;
  backend?: string;
  provider?: string;
  runtime?: string;
  runtimeVersion?: string | null;
  providerVersion?: string | null;
  precision?: string;
  modelVersion?: string | null;
  modelSha256?: string | null;
  preprocessVersion?: string;
  postprocessVersion?: string;
  fallbackReason?: string | null;
  executionStatus?: 'PENDING' | 'READY' | 'ERROR';
}

export interface ShuttleProvenance extends InferenceProviderProvenance {
  enabled: boolean;
  requested: boolean;
  active: boolean;
  status: ShuttleTrackingStatus;
  trackingState?: import('./types/shuttleTelemetry').ShuttleTrackerState | null;
  provider: string;
  model: string | null;
  runtime: string;
  precision: string;
  device: string;
  windowSize: number;
  confidenceThreshold: number;
  recoveryEnabled: boolean;
  auxiliaryDetectorAvailable: boolean;
  failureReason?: string | null;
  lastFailure?: string | null;
  modelAvailable?: boolean;
  configuredModel?: string | null;
  probeStatus?: string;
  probeFailureReason?: string | null;
  inputWidth?: number;
  inputHeight?: number;
  requiredFrameStride?: number | null;
  modelName?: string;
  modelSha256?: string | null;
  modelLoaded?: boolean;
  framesReceived?: number | null;
  validFrames?: number | null;
  inferenceCalls?: number | null;
  meanInferenceMs?: number | null;
  observedCount?: number | null;
  predictedCount?: number | null;
  lostCount?: number | null;
  unknownCount?: number | null;
  candidateExtractionCalls?: number;
  outputTensorReceived?: boolean;
  lastOutputShape?: number[] | null;
  lastOutputRange?: number[] | null;
  inputContract?: Record<string, unknown>;
  outputContract?: Record<string, unknown>;
}

export interface TrackingRuntimeProvenance {
  fallbackReason?: string | null;
  inferenceProviders?: {
    detector?: InferenceProviderProvenance | null;
    pose?: InferenceProviderProvenance | null;
  };
  detectorModel: string;
  trackerModel: string;
  poseModel: string;
  device: string;
  requestedDevice: string;
  effectiveDevice: string;
  requestedProfile: string;
  effectiveProfile: string;
  detectorInputSize: number;
  frameStride: number;
  poseStride: number;
  poseArchitecture?: 'roi_pose' | 'full_frame_pose';
  useCourtRoi: boolean;
  courtRoiMarginPx: number;
  courtRoiMarginM?: number;
  detectorFamily?: string;
  trackerName?: string;
  trackerConfigPath?: string | null;
  trackerConfig?: string | null;
  reidEnabled?: boolean;
  reidModel?: string | null;
  poseFamily?: string;
  runtime?: string;
  precision?: string;
  confidenceThreshold?: number;
  autoCourtCalibrationEnabled?: boolean;
  shuttle?: ShuttleProvenance | null;
  calibration?: {
    autoCalibrationEnabled: boolean;
    cameraSegmentId: string;
    calibrationId?: string | null;
    calibrationVersion?: string | null;
    state: string;
    source?: string | null;
    confidence?: number | null;
    reprojectionErrorPx?: number | null;
    unavailableReason?: string | null;
    suggestedCorners?: number[][] | null;
    suggestedConfidence?: number | null;
  } | null;
}

export * from './types/benchmark';
export * from './types/shuttleTelemetry';
export * from './types/calibration';
export * from './types/scene';
