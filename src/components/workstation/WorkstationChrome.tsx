import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Bookmark,
  FileText,
  FolderOpen,
  Gamepad2,
  Keyboard,
  Redo2,
  Settings,
  Table2,
  Undo2,
} from 'lucide-react';
import type { MatchInfo, Team } from '../../types';
import type { ProjectSaveStatus } from '../../context/WorkspaceContext';
import { formatWorkstationTimecode, type WorkbenchPresetId } from '../../workstation/workstationModel';
import WorkspaceMenu from '../WorkspaceMenu';

type Language = 'th' | 'en';

const PRESETS: Array<{
  id: WorkbenchPresetId;
  icon: typeof Gamepad2;
  label: Record<Language, string>;
}> = [
  { id: 'scout', icon: Gamepad2, label: { th: 'บันทึก', en: 'Scout' } },
  { id: 'review', icon: Table2, label: { th: 'ทบทวน', en: 'Review' } },
  { id: 'analysis', icon: BarChart3, label: { th: 'วิเคราะห์', en: 'Analysis' } },
  { id: 'report', icon: FileText, label: { th: 'รายงาน', en: 'Report' } },
];

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
    saving: { th: 'กำลังบันทึก', en: 'Saving' },
    saved: { th: 'บันทึกแล้ว', en: 'Saved' },
    failed: { th: 'บันทึกไม่สำเร็จ', en: 'Save failed' },
  };

  return (
    <header className="workstation-topbar">
      <div className="workstation-brand" aria-label="SPORTSCOUT Workstation Beta">
        <img src="/icons/SP_logo_black_white_transparent_512.png" alt="" />
        <div>
          <strong>SPORTSCOUT</strong>
          <span>Workstation Beta</span>
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

      <button type="button" className="workstation-match" onClick={onEditMatch}>
        <span>{teams[0]?.code || 'T1'}</span>
        <small>vs</small>
        <span>{teams[1]?.code || 'T2'}</span>
        <i />
        <span>{language === 'th' ? `เซต ${matchInfo.setOrGame}` : `Set ${matchInfo.setOrGame}`}</span>
      </button>

      <div className={`workstation-save-state is-${saveStatus}`} role="status">
        <span />
        {saveLabel[saveStatus][language]}
      </div>
    </header>
  );
}

interface WorkstationCommandBarProps {
  language: Language;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenKeyMoments: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

export function WorkstationCommandBar({
  language,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenKeyMoments,
  onOpenShortcuts,
  onOpenSettings,
}: WorkstationCommandBarProps) {
  return (
    <div className="workstation-commandbar" aria-label={language === 'th' ? 'แถบคำสั่ง' : 'Command bar'}>
      <div className="workstation-project-command">
        <WorkspaceMenu />
        <span><FolderOpen size={15} /> {language === 'th' ? 'โปรเจกต์' : 'Project'}</span>
      </div>
      <span className="workstation-rule" />
      <button type="button" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
        <Undo2 size={16} /> {language === 'th' ? 'ย้อนกลับ' : 'Undo'}
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y">
        <Redo2 size={16} /> {language === 'th' ? 'ทำซ้ำ' : 'Redo'}
      </button>
      <span className="workstation-rule" />
      <button type="button" onClick={onOpenKeyMoments}>
        <Bookmark size={16} /> {language === 'th' ? 'เหตุการณ์สำคัญ' : 'Key Moments'}
      </button>
      <div className="workstation-commandbar-spacer" />
      <button type="button" onClick={onOpenShortcuts} aria-label={language === 'th' ? 'ปุ่มลัด' : 'Keyboard shortcuts'}>
        <Keyboard size={16} />
      </button>
      <button type="button" onClick={onOpenSettings} aria-label={language === 'th' ? 'ตั้งค่า' : 'Settings'}>
        <Settings size={16} />
      </button>
    </div>
  );
}

interface WorkstationToolRailProps {
  language: Language;
  activePreset: WorkbenchPresetId;
  onPresetChange: (preset: WorkbenchPresetId) => void;
}

export function WorkstationToolRail({ language, activePreset, onPresetChange }: WorkstationToolRailProps) {
  return (
    <aside className="workstation-toolrail" aria-label={language === 'th' ? 'เครื่องมือหลัก' : 'Primary tools'}>
      {PRESETS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          className={activePreset === id ? 'is-active' : ''}
          onClick={() => onPresetChange(id)}
          aria-label={label[language]}
          title={label[language]}
        >
          <Icon size={19} />
          <span>{label[language]}</span>
        </button>
      ))}
    </aside>
  );
}

interface WorkstationStatusBarProps {
  language: Language;
  projectTitle: string;
  sport: string;
  eventCount: number;
  videoTime: number;
}

export function WorkstationStatusBar({ language, projectTitle, sport, eventCount, videoTime }: WorkstationStatusBarProps) {
  const [isOnline, setIsOnline] = React.useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  React.useEffect(() => {
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
    <footer className="workstation-statusbar">
      <span><b>{language === 'th' ? 'โปรเจกต์' : 'Project'}:</b> {projectTitle}</span>
      <span><b>{language === 'th' ? 'กีฬา' : 'Sport'}:</b> {sport}</span>
      <span><b>{language === 'th' ? 'เวลา' : 'Time'}:</b> <code>{timecode}</code></span>
      <span><b>{language === 'th' ? 'เหตุการณ์' : 'Events'}:</b> {eventCount}</span>
      <span className={isOnline ? "workstation-offline" : "workstation-offline text-amber-400"}>
        <i className={isOnline ? "bg-emerald-400" : "bg-amber-400"} /> 
        {isOnline 
          ? (language === 'th' ? 'เชื่อมต่อออนไลน์' : 'Online connected') 
          : (language === 'th' ? 'โหมดออฟไลน์' : 'Offline mode')}
      </span>
    </footer>
  );
}
