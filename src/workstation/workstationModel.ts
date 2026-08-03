import type { WorkspaceExperience } from '../types';

export type WorkbenchPresetId = 'scout' | 'review' | 'analysis' | 'report';
export type WorkstationAnalysisTab = 'input' | 'dashboard' | 'table' | 'bookmarks' | 'report';

export function resolveWorkspaceExperience(_options: {
  featureEnabled: boolean;
  preferredExperience?: WorkspaceExperience;
  viewportWidth: number;
}): WorkspaceExperience {
  if (!_options.featureEnabled || _options.viewportWidth < 1024) return 'classic';
  return _options.preferredExperience === 'workstation' ? 'workstation' : 'classic';
}

const PRESET_TO_TAB: Record<WorkbenchPresetId, WorkstationAnalysisTab> = {
  scout: 'input',
  review: 'table',
  analysis: 'dashboard',
  report: 'report',
};

export function getAnalysisTabForPreset(preset: WorkbenchPresetId): WorkstationAnalysisTab {
  return PRESET_TO_TAB[preset];
}

export function getPresetForAnalysisTab(tab: WorkstationAnalysisTab): WorkbenchPresetId {
  if (tab === 'table' || tab === 'bookmarks') return 'review';
  if (tab === 'report') return 'report';
  return tab === 'dashboard' ? 'analysis' : 'scout';
}

export function formatWorkstationTimecode(videoTime: number): string {
  const safeVideoTime = Number.isFinite(videoTime) && videoTime >= 0 ? videoTime : 0;
  const minutes = Math.floor(safeVideoTime / 60);
  const seconds = Math.floor(safeVideoTime % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
