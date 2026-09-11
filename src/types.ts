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
  aiTrackingEnabled?: boolean;
  aiTrackingMode?: 'browser' | 'server';
  aiTrackingServerUrl?: string;
  aiShowSkeleton?: boolean;
  badmintonGameType?: 'singles' | 'doubles';
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
  };
  createdAt: string;
  updatedAt: string;
};

export interface AIPoseKeypoint {
  x: number; // 0..100 or pixel
  y: number;
  score?: number;
  name?: string;
}

export interface AITrackingPlayer {
  id: number;
  team: 1 | 2;
  name: string;
  court_pos_pct: { x: number; y: number };
  court_pos_m?: { x: number; y: number };
  zone: string;
  speed_ms: number;
  total_dist_m: number;
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

export interface AITelemetryFrame {
  timestamp: number;
  frame_idx: number;
  game_type?: 'singles' | 'doubles';
  players: AITrackingPlayer[];
  source?: string;
}
