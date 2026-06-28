export type SportType = 'volleyball' | 'football' | 'badminton' | 'basketball';

export type VideoSourceType = 'local' | 'youtube';

export type Team = {
  id: string;
  code: string;
  name: string;
  thaiName: string;
};

export type AreaRequirement = "always" | "optional" | "never" | "optionalWhenOut";

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

export type SportTemplate = {
  id: SportType;
  name: string;
  thaiName: string;
  teamsEnabled: boolean;
  playersEnabled: boolean;
  areas: Area[];
  skills: Skill[];
  results: ResultType[];
  descriptors?: Record<string, DescriptorGroup[]>; // Keyed by skill code or "ALL"
};

export type Action = {
  id?: string;
  teamCode?: string;
  skillCode?: string;
  areaCode?: string;
  courtSide?: 'teamA' | 'teamB' | 'neutral';
  resultCode?: string;
  resultDetailCode?: string;
  descriptors?: Record<string, string>;
  playerNumber?: string;
  playerName?: string;
  videoTime?: number;
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
  videoUrl?: string;
  videoTime?: number;
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
};

export type AppSettings = {
  autoNextPoint: boolean;
  darkMode: boolean;
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
    sourceType: 'youtube' | 'local';
    youtubeUrl?: string;
    youtubeVideoId?: string;
    localFileName?: string;
  };
  createdAt: string;
  updatedAt: string;
};
