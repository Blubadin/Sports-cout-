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
  hudAutoHideControls?: boolean;
  hudMobileLargeButtons?: boolean;
  hudEnableGameFeedback?: boolean;
  hudEnableSoundFeedback?: boolean;
  hudEnableHapticFeedback?: boolean;
  hudInteractionStyle?: 'hold' | 'click';
  hudExperienceMode?: 'auto' | 'pro' | 'phone';
  phoneScoutDensity?: 'compact' | 'comfortable';
  controllerV1Enabled?: boolean;
};

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
  };
  createdAt: string;
  updatedAt: string;
};
