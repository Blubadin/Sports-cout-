import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Bookmark,
  Contrast,
  FileText,
  FolderOpen,
  Gamepad2,
  Keyboard,
  Moon,
  Redo2,
  Settings,
  Sun,
  Table2,
  Undo2,
  MousePointer2,
  Crosshair,
  Pencil,
  Grid,
  Activity,
  ListVideo,
  Plus,
  Trash2,
  FastForward,
  CheckCircle2,
  Wifi,
  WifiOff,
  HardDrive,
  Maximize2,
} from 'lucide-react';
import type { MatchInfo, Team } from '../../types';
import type { ProjectSaveStatus } from '../../context/WorkspaceContext';
import { formatWorkstationTimecode, type WorkbenchPresetId } from '../../workstation/workstationModel';
import { SPORTSCOUT_APP_VERSION } from '../../appMetadata';
import WorkspaceMenu from '../WorkspaceMenu';

export type Language = 'th' | 'en';

export type WorkstationLeftTool =
  | 'select'
  | 'scout'
  | 'annotate'
  | 'court'
  | 'clips'
  | 'draw'
  | 'zone'
  | 'track'
  | 'measure'
  | 'text'
  | 'playlist'
  | 'camera'
  | 'reports';

const PRESETS: Array<{
  id: WorkbenchPresetId;
  icon: typeof Gamepad2;
  label: Record<Language, string>;
}> = [
  { id: 'scout', icon: Gamepad2, label: { th: 'Scout', en: 'Scout' } },
  { id: 'review', icon: Table2, label: { th: 'Review', en: 'Review' } },
  { id: 'analysis', icon: BarChart3, label: { th: 'Analyze', en: 'Analyze' } },
  { id: 'report', icon: FileText, label: { th: 'Report', en: 'Report' } },
  { id: 'lab', icon: Activity, label: { th: 'Labs', en: 'Labs' } },
];

export interface ToolItem {
  id: WorkstationLeftTool;
  icon: React.ElementType;
  labelTh: string;
  labelEn: string;
  shortcut?: string;
}

export const WORKSTATION_LEFT_TOOLS: ToolItem[] = [
  { id: 'select', icon: MousePointer2, labelTh: 'เลือก / พอยน์เตอร์', labelEn: 'Select', shortcut: 'V' },
  { id: 'scout', icon: Crosshair, labelTh: 'บันทึกสถิติ', labelEn: 'Scout', shortcut: 'S' },
  { id: 'annotate', icon: Pencil, labelTh: 'วาด Telestration / คำอธิบาย', labelEn: 'Annotate', shortcut: 'A' },
  { id: 'court', icon: Grid, labelTh: 'โซนสนาม / Calibrate', labelEn: 'Court', shortcut: 'C' },
  { id: 'clips', icon: ListVideo, labelTh: 'คลิปและช่วงสำคัญ (Key Moments)', labelEn: 'Clips', shortcut: 'K' },
];

/* -------------------------------------------------------------------------- */
/* LEFT TOOL RAIL COMPONENT                                                   */
/* -------------------------------------------------------------------------- */
export interface WorkstationLeftRailProps {
  activeTool: WorkstationLeftTool;
  onSelectTool: (tool: WorkstationLeftTool) => void;
  onToggleFullscreen?: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  language?: Language;
}

function useNetworkOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function WorkstationLeftRail({
  activeTool,
  onSelectTool,
  onToggleFullscreen,
  language = 'th',
}: WorkstationLeftRailProps) {
  const isThai = language === 'th';

  return (
    <aside
      className="w-full md:w-14 shrink-0 bg-[#09121a] border-b md:border-b-0 md:border-r border-[#263642] flex flex-row md:flex-col items-center justify-between px-2 py-1.5 md:px-0 md:py-2 select-none z-30 overflow-x-auto"
      aria-label="Workstation Tool Rail"
    >
      {/* Top / Main Tools Rail */}
      <div className="flex flex-row md:flex-col items-center gap-1.5 md:w-full md:px-1.5">
        {WORKSTATION_LEFT_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelectTool(tool.id)}
              title={`${isThai ? tool.labelTh : tool.labelEn}${tool.shortcut ? ` [${tool.shortcut}]` : ''}`}
              className={`w-11 h-10 md:h-11 shrink-0 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-150 relative group cursor-pointer ${
                isActive
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500 shadow-sm shadow-sky-500/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#132332] border border-transparent'
              }`}
            >
              <Icon size={17} className={isActive ? 'text-sky-400' : 'text-gray-400 group-hover:text-gray-200'} />
              <span className="text-[8.5px] font-black uppercase tracking-tighter leading-none scale-90">
                {tool.labelEn}
              </span>

              {/* Active Indicator Bar */}
              {isActive && (
                <span className="absolute left-2 right-2 bottom-0 h-0.5 md:left-0 md:right-auto md:top-2 md:bottom-2 md:h-auto md:w-1 bg-sky-400 rounded-full md:rounded-r-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Actions: Fullscreen */}
      <div className="flex flex-row md:flex-col items-center gap-1.5 pl-2 md:pl-0 md:w-full md:px-1.5 md:pt-2 border-l md:border-l-0 md:border-t border-[#263642]/60 shrink-0">
        <button
          type="button"
          onClick={onToggleFullscreen}
          title={isThai ? 'เต็มจอ (Fullscreen)' : 'Toggle Fullscreen'}
          className="w-11 h-10 md:h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-sky-400 hover:bg-[#132332] border border-transparent transition-all cursor-pointer"
        >
          <Maximize2 size={16} />
          <span className="text-[8.5px] font-black uppercase tracking-tighter leading-none scale-90">
            FS
          </span>
        </button>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* TOP BAR COMPONENT                                                          */
/* -------------------------------------------------------------------------- */
interface WorkstationTopBarProps {
  language: Language;
  activePreset: WorkbenchPresetId;
  onPresetChange: (preset: WorkbenchPresetId) => void;
  teams: Team[];
  matchInfo: MatchInfo;
  saveStatus: ProjectSaveStatus;
  onEditMatch: () => void;
}

export function WorkstationTopBar({
  language,
  activePreset,
  onPresetChange,
  teams,
  matchInfo,
  saveStatus,
  onEditMatch,
}: WorkstationTopBarProps) {
  const isOnline = useNetworkOnlineStatus();
  const isThai = language === 'th';

  const saveLabel: Record<ProjectSaveStatus, Record<Language, string>> = {
    loading: { th: 'กำลังเตรียมข้อมูล', en: 'Preparing' },
    pending: { th: 'รอบันทึก', en: 'Pending' },
    saving: { th: 'กำลังบันทึก...', en: 'Saving...' },
    saved: { th: 'บันทึกอัตโนมัติ', en: 'Auto-saved' },
    failed: { th: 'บันทึกไม่สำเร็จ', en: 'Save failed' },
  };

  return (
    <header className="workstation-topbar">
      <div className="workstation-brand" aria-label="SPORTSCOUT Workstation Pro">
        <img src="/icons/SP_logo_black_white_transparent_512.png" alt="" />
        <div>
          <strong>SPORTSCOUT</strong>
          <span>Workstation Pro</span>
        </div>
      </div>

      <nav className="workstation-mode-nav" aria-label="Workstation modes">
        {PRESETS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={activePreset === id ? 'page' : undefined}
            onClick={() => onPresetChange(id)}
            className={activePreset === id ? 'is-active' : ''}
          >
            {label[language]}
          </button>
        ))}
      </nav>

      <button type="button" className="workstation-match" onClick={onEditMatch} title="Edit Match Info">
        <span>{teams[0]?.code || 'T1'}</span>
        <small>vs</small>
        <span>{teams[1]?.code || 'T2'}</span>
        <i />
        <span>{isThai ? `เซต ${matchInfo.setOrGame || 1}` : `Set ${matchInfo.setOrGame || 1}`}</span>
      </button>

      <div className="workstation-topbar-actions">
        <div className={`workstation-save-state is-${saveStatus}`} role="status">
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
          <span>{saveLabel[saveStatus][language]}</span>
        </div>

        <div
          data-network-status={isOnline ? 'online' : 'offline'}
          className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border shrink-0 ${
            isOnline
              ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60'
              : 'text-amber-300 bg-amber-950/50 border-amber-700/70'
          }`}
          title={isOnline
            ? (isThai ? 'เชื่อมต่อเครือข่ายปกติ' : 'Network online')
            : (isThai ? 'ออฟไลน์ — ข้อมูลยังบันทึกในเครื่อง' : 'Offline — saving locally')}
        >
          {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span>{isOnline ? (isThai ? 'ออนไลน์' : 'Online') : (isThai ? 'ออฟไลน์' : 'Offline')}</span>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* COMMAND BAR COMPONENT                                                      */
/* -------------------------------------------------------------------------- */
interface WorkstationCommandBarProps {
  language: Language;
  theme?: 'light' | 'dark' | 'monochrome';
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNewEvent?: () => void;
  onDeleteEvent?: () => void;
  onJumpToTime?: () => void;
  onToggleHUD?: () => void;
  onOpenKeyMoments: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onToggleTheme?: () => void;
  onToggleLanguage?: () => void;
}

export function WorkstationCommandBar({
  language,
  theme = 'dark',
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNewEvent,
  onDeleteEvent,
  onJumpToTime,
  onToggleHUD,
  onOpenKeyMoments,
  onOpenShortcuts,
  onOpenSettings,
  onToggleTheme,
  onToggleLanguage,
}: WorkstationCommandBarProps) {
  const isThai = language === 'th';

  return (
    <div className="workstation-commandbar" aria-label={isThai ? 'แถบคำสั่งด่วน' : 'Command bar'}>
      <div className="workstation-project-command">
        <WorkspaceMenu />
        <span><FolderOpen size={14} /> {isThai ? 'โปรเจกต์' : 'Project'}</span>
      </div>

      <span className="workstation-rule" />

      {onNewEvent && (
        <button type="button" onClick={onNewEvent} title="New Event (N)" className="text-sky-400 font-bold">
          <Plus size={14} /> {isThai ? 'เพิ่มเหตุการณ์' : 'New Event'} <span className="hidden sm:inline opacity-50 text-[10px]">N</span>
        </button>
      )}

      {onDeleteEvent && (
        <button type="button" onClick={onDeleteEvent} title="Delete Selected Event (Del)" className="text-rose-400">
          <Trash2 size={14} /> {isThai ? 'ลบ' : 'Delete'} <span className="hidden sm:inline opacity-50 text-[10px]">Del</span>
        </button>
      )}

      <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 size={14} /> {isThai ? 'ย้อนกลับ' : 'Undo'} <span className="hidden sm:inline opacity-50 text-[10px]">Ctrl+Z</span>
      </button>

      <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        <Redo2 size={14} /> {isThai ? 'ทำซ้ำ' : 'Redo'} <span className="hidden sm:inline opacity-50 text-[10px]">Ctrl+Y</span>
      </button>

      {onJumpToTime && (
        <button type="button" onClick={onJumpToTime} title="Jump to Time (J)">
          <FastForward size={14} /> {isThai ? 'กระโดด' : 'Jump'} <span className="hidden sm:inline opacity-50 text-[10px]">J</span>
        </button>
      )}

      {onToggleHUD && (
        <button
          type="button"
          onClick={onToggleHUD}
          title={isThai ? 'เปิดโหมด HUD สเกาต์' : 'Toggle Scout HUD Mode'}
          className="text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 cursor-pointer"
        >
          <Gamepad2 size={14} /> {isThai ? 'โหมด HUD' : 'HUD Mode'}
        </button>
      )}

      <span className="workstation-rule" />

      <button type="button" onClick={onOpenKeyMoments} title="Key Moments / Bookmarks">
        <Bookmark size={14} /> {isThai ? 'ช็อตสำคัญ' : 'Bookmarks'}
      </button>

      <div className="workstation-commandbar-spacer" />

      {onToggleLanguage && (
        <button
          type="button"
          onClick={onToggleLanguage}
          aria-label={isThai ? 'สลับภาษา' : 'Toggle language'}
          className="font-bold text-xs px-2"
          title="Toggle Language"
        >
          {isThai ? 'TH' : 'EN'}
        </button>
      )}

      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isThai ? 'เปลี่ยนธีม' : 'Toggle theme'}
          title={theme === 'light' ? 'Light Theme' : theme === 'dark' ? 'Dark Theme' : 'Monochrome'}
        >
          {theme === 'light' && <Sun size={15} className="text-amber-400" />}
          {theme === 'dark' && <Moon size={15} className="text-sky-300" />}
          {theme === 'monochrome' && <Contrast size={15} className="text-gray-300" />}
        </button>
      )}

      <button type="button" onClick={onOpenShortcuts} aria-label={isThai ? 'ปุ่มลัด' : 'Keyboard shortcuts'} title="Keyboard Shortcuts">
        <Keyboard size={15} />
      </button>

      <button type="button" onClick={onOpenSettings} aria-label={isThai ? 'ตั้งค่า' : 'Settings'} title="Settings">
        <Settings size={15} />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* STATUS BAR COMPONENT                                                       */
/* -------------------------------------------------------------------------- */
interface WorkstationStatusBarProps {
  language: Language;
  projectTitle: string;
  sport: string;
  eventCount: number;
  videoTime: number;
  matchName?: string;
  setOrGame?: string | number;
  selectedCount?: number;
}

export function WorkstationStatusBar({
  language,
  projectTitle,
  sport,
  eventCount,
  videoTime,
  matchName,
  setOrGame = 1,
  selectedCount = 0,
}: WorkstationStatusBarProps) {
  const isOnline = useNetworkOnlineStatus();
  const isThai = language === 'th';

  const timecode = formatWorkstationTimecode(videoTime);

  return (
    <footer className="workstation-statusbar flex flex-wrap items-center justify-between gap-2 text-[11px] px-3 py-1.5 bg-[#09121a] border-t border-[#263642] select-none">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        <span className="truncate max-w-[200px] sm:max-w-none"><b>Project:</b> <span className="text-sky-400">{projectTitle}</span></span>
        {matchName && <span><b>Match:</b> {matchName}</span>}
        <span><b>Set:</b> {setOrGame}</span>
        <span><b>Sport:</b> {sport}</span>
        <span><b>Events:</b> <span className="font-bold text-gray-200">{eventCount}</span></span>
        {selectedCount > 0 && <span><b>Selected:</b> <span className="text-sky-300">{selectedCount}</span></span>}
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0 font-mono">
        <span><b>Time:</b> <code className="text-sky-300">{timecode}</code></span>
        <span className="flex items-center gap-1 text-gray-400">
          <HardDrive size={12} />
          <span>Storage: Ready</span>
        </span>
        <span
          className={`flex items-center gap-1 ${isOnline ? 'text-emerald-400' : 'text-amber-300'}`}
          title={isOnline ? (isThai ? 'ออนไลน์' : 'Online') : (isThai ? 'ออฟไลน์' : 'Offline')}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span>v{SPORTSCOUT_APP_VERSION}</span>
        </span>
      </div>
    </footer>
  );
}

