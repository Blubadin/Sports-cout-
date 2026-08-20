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
  Ruler,
  Type,
  ListVideo,
  Video,
  HelpCircle,
  Plus,
  Trash2,
  FastForward,
  Filter,
  Download,
  CheckCircle2,
  Cloud,
  HardDrive,
  SlidersHorizontal,
} from 'lucide-react';
import type { MatchInfo, Team } from '../../types';
import type { ProjectSaveStatus } from '../../context/WorkspaceContext';
import { formatWorkstationTimecode, type WorkbenchPresetId } from '../../workstation/workstationModel';
import WorkspaceMenu from '../WorkspaceMenu';

export type Language = 'th' | 'en';

export type WorkstationLeftTool =
  | 'select'
  | 'scout'
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
  { id: 'scout', icon: Gamepad2, label: { th: 'Scout (บันทึก)', en: 'Scout' } },
  { id: 'review', icon: Table2, label: { th: 'Review (ทบทวน)', en: 'Review' } },
  { id: 'analysis', icon: BarChart3, label: { th: 'Analysis (สถิติ)', en: 'Analysis' } },
  { id: 'report', icon: FileText, label: { th: 'Report (รายงาน)', en: 'Report' } },
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
  { id: 'scout', icon: Crosshair, labelTh: 'บันทึกสถิติสด', labelEn: 'Scout', shortcut: 'S' },
  { id: 'draw', icon: Pencil, labelTh: 'วาดแผนภาพ', labelEn: 'Draw', shortcut: 'D' },
  { id: 'zone', icon: Grid, labelTh: 'พิกัดโซนสนาม', labelEn: 'Zone', shortcut: 'Z' },
  { id: 'track', icon: Activity, labelTh: 'ติดตามการเคลื่อนที่', labelEn: 'Track', shortcut: 'M' },
  { id: 'measure', icon: Ruler, labelTh: 'วัดระยะทาง / มุม', labelEn: 'Measure', shortcut: 'R' },
  { id: 'text', icon: Type, labelTh: 'บันทึกข้อความ', labelEn: 'Text', shortcut: 'T' },
  { id: 'playlist', icon: ListVideo, labelTh: 'ชุดคลิปสำคัญ', labelEn: 'Playlist', shortcut: 'P' },
  { id: 'camera', icon: Video, labelTh: 'สลับมุมกล้อง', labelEn: 'Camera', shortcut: 'C' },
  { id: 'reports', icon: FileText, labelTh: 'รายงาน 5Ws', labelEn: 'Reports', shortcut: 'F' },
];

/* -------------------------------------------------------------------------- */
/* LEFT TOOL RAIL COMPONENT                                                   */
/* -------------------------------------------------------------------------- */
export interface WorkstationLeftRailProps {
  activeTool: WorkstationLeftTool;
  onSelectTool: (tool: WorkstationLeftTool) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  language?: Language;
}

export function WorkstationLeftRail({
  activeTool,
  onSelectTool,
  onOpenSettings,
  onOpenHelp,
  language = 'th',
}: WorkstationLeftRailProps) {
  const isThai = language === 'th';

  return (
    <aside
      className="w-14 shrink-0 bg-[#09121a] border-r border-[#263642] flex flex-col items-center justify-between py-2 select-none z-30"
      aria-label="Workstation Tool Rail"
    >
      {/* Top / Main Tools Rail */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
        {WORKSTATION_LEFT_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelectTool(tool.id)}
              title={`${isThai ? tool.labelTh : tool.labelEn}${tool.shortcut ? ` [${tool.shortcut}]` : ''}`}
              className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-150 relative group cursor-pointer ${
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
                <span className="absolute left-0 top-2 bottom-2 w-1 bg-sky-400 rounded-r-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Actions: Settings & Help */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5 pt-2 border-t border-[#263642]/60">
        <button
          type="button"
          onClick={onOpenSettings}
          title={isThai ? 'การตั้งค่าระบบ' : 'Settings'}
          className="w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-gray-200 hover:bg-[#132332] border border-transparent transition-all cursor-pointer"
        >
          <Settings size={17} />
          <span className="text-[8.5px] font-black uppercase tracking-tighter leading-none scale-90">
            {isThai ? 'ตั้งค่า' : 'Setup'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenHelp}
          title={isThai ? 'คู่มือและคีย์ลัด' : 'Help & Shortcuts'}
          className="w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-gray-200 hover:bg-[#132332] border border-transparent transition-all cursor-pointer"
        >
          <HelpCircle size={17} />
          <span className="text-[8.5px] font-black uppercase tracking-tighter leading-none scale-90">
            {isThai ? 'ช่วยเหลือ' : 'Help'}
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
        <span>{language === 'th' ? `เซต ${matchInfo.setOrGame || 1}` : `Set ${matchInfo.setOrGame || 1}`}</span>
      </button>

      <div className={`workstation-save-state is-${saveStatus}`} role="status">
        <CheckCircle2 size={13} className="text-emerald-400" />
        <span>{saveLabel[saveStatus][language]}</span>
      </div>

      <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-1 rounded-lg">
        <Cloud size={13} />
        <span>Offline Ready</span>
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
          <Plus size={14} /> {isThai ? 'เพิ่มเหตุการณ์' : 'New Event'} <span className="opacity-50 text-[10px]">N</span>
        </button>
      )}

      {onDeleteEvent && (
        <button type="button" onClick={onDeleteEvent} title="Delete Selected Event (Del)" className="text-rose-400">
          <Trash2 size={14} /> {isThai ? 'ลบ' : 'Delete'} <span className="opacity-50 text-[10px]">Del</span>
        </button>
      )}

      <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 size={14} /> {isThai ? 'ย้อนกลับ' : 'Undo'} <span className="opacity-50 text-[10px]">Ctrl+Z</span>
      </button>

      <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        <Redo2 size={14} /> {isThai ? 'ทำซ้ำ' : 'Redo'} <span className="opacity-50 text-[10px]">Ctrl+Y</span>
      </button>

      {onJumpToTime && (
        <button type="button" onClick={onJumpToTime} title="Jump to Time (J)">
          <FastForward size={14} /> {isThai ? 'กระโดด' : 'Jump'} <span className="opacity-50 text-[10px]">J</span>
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

  const timecode = formatWorkstationTimecode(videoTime);

  return (
    <footer className="workstation-statusbar flex items-center justify-between text-[11px] px-3 py-1.5 bg-[#09121a] border-t border-[#263642] select-none">
      <div className="flex items-center gap-3 overflow-hidden text-ellipsis whitespace-nowrap">
        <span><b>Project:</b> <span className="text-sky-400">{projectTitle}</span></span>
        {matchName && <span><b>Match:</b> {matchName}</span>}
        <span><b>Set:</b> {setOrGame}</span>
        <span><b>Sport:</b> {sport}</span>
        <span><b>Events:</b> <span className="font-bold text-gray-200">{eventCount}</span></span>
        {selectedCount > 0 && <span><b>Selected:</b> <span className="text-sky-300">{selectedCount}</span></span>}
      </div>

      <div className="flex items-center gap-4 shrink-0 font-mono">
        <span><b>Time:</b> <code className="text-sky-300">{timecode}</code></span>
        <span className="flex items-center gap-1 text-gray-400">
          <HardDrive size={12} />
          <span>Storage: Ready</span>
        </span>
        <span className="flex items-center gap-1 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>v2.1.0</span>
        </span>
      </div>
    </footer>
  );
}

