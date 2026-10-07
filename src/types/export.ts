/**
 * Phase 3.5E — Analysis Export Types
 * Definitions for post-analysis export configuration, overlays, presets, and job tracking.
 */

export type ExportPreset = 'CLEAN' | 'ANALYSIS' | 'DEBUG' | 'CUSTOM';

export type ExportFormat = 'MP4';

export interface ExportOverlayConfig {
  // Analysis Overlays
  court: boolean;
  playerDetection: boolean;
  pose: boolean;
  groundPoints: boolean;
  shuttle: boolean;

  // Identity Overlays
  playerLabels: boolean;
  trackIds: boolean;

  // Debugging Overlays
  debugInfo: boolean;
  confidences: boolean;

  // Output options
  format: ExportFormat;
}

export const EXPORT_PRESETS: Record<Exclude<ExportPreset, 'CUSTOM'>, ExportOverlayConfig> = {
  CLEAN: {
    court: false,
    playerDetection: false,
    pose: false,
    groundPoints: false,
    shuttle: false,
    playerLabels: false,
    trackIds: false,
    debugInfo: false,
    confidences: false,
    format: 'MP4',
  },
  ANALYSIS: {
    court: true,
    playerDetection: true,
    pose: true,
    groundPoints: true,
    shuttle: true,
    playerLabels: true,
    trackIds: false,
    debugInfo: false,
    confidences: false,
    format: 'MP4',
  },
  DEBUG: {
    court: true,
    playerDetection: true,
    pose: true,
    groundPoints: true,
    shuttle: true,
    playerLabels: true,
    trackIds: true,
    debugInfo: true,
    confidences: true,
    format: 'MP4',
  },
};

export type ExportStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type ExportStage =
  | 'PREPARING'
  | 'RENDERING_VIDEO'
  | 'GENERATING_HEATMAPS'
  | 'GENERATING_REPORT'
  | 'CREATING_ARCHIVE'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ExportJobProgress {
  exportId: string;
  sessionId: string;
  status: ExportStatus;
  stage: ExportStage;
  stageLabel?: string;
  progress: number;
  detail: string;
  error?: string | null;
  outputArchivePath?: string | null;
  archiveFilename?: string | null;
  archiveSizeBytes?: number | null;
  createdAt?: string;
  completedAt?: string | null;
}

export interface StartExportRequest {
  preset?: ExportPreset;
  court?: boolean;
  playerDetection?: boolean;
  pose?: boolean;
  groundPoints?: boolean;
  shuttle?: boolean;
  playerLabels?: boolean;
  trackIds?: boolean;
  debugInfo?: boolean;
  confidences?: boolean;
  format?: ExportFormat;
}

export interface StartExportResponse {
  exportId: string;
  sessionId: string;
  status: ExportStatus;
  preset: string;
  options: Record<string, unknown>;
}
