import type { ControllerDeviceFamily } from '../controller/types';
import type { ScoutProject, SportType } from '../types';
import {
  SPORTSCOUT_APP_NAME,
  SPORTSCOUT_APP_VERSION,
  SPORTSCOUT_EXPORT_SCHEMA_VERSION,
} from '../appMetadata';

type DiagnosticInput = {
  projects: ScoutProject[];
  activeProjectId: string | null;
  saveStatus: string;
  controllerFamily?: ControllerDeviceFamily | null;
  rawDeviceId?: string | null;
  storageEstimate?: { usage?: number; quota?: number } | null;
};

export type PilotDiagnosticReport = {
  type: 'sportscout-pilot-diagnostic';
  generatedAt: string;
  app: string;
  appVersion: string;
  exportSchemaVersion: string;
  projectCount: number;
  eventCount: number;
  actionCount: number;
  bookmarkedEventCount: number;
  eventsBySport: Record<SportType, number>;
  hasActiveProject: boolean;
  saveStatus: string;
  controllerFamily: ControllerDeviceFamily | null;
  storage: { usageBytes: number | null; quotaBytes: number | null };
};

const emptySportCounts = (): Record<SportType, number> => ({
  volleyball: 0,
  football: 0,
  badminton: 0,
  basketball: 0,
});

const safeByteCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

export function createPilotDiagnosticReport(input: DiagnosticInput): PilotDiagnosticReport {
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const eventsBySport = emptySportCounts();
  let eventCount = 0;
  let actionCount = 0;
  let bookmarkedEventCount = 0;

  projects.forEach((project) => {
    const events = Array.isArray(project.events) ? project.events : [];
    eventCount += events.length;
    if (project.sportType in eventsBySport) eventsBySport[project.sportType] += events.length;
    events.forEach((event) => {
      actionCount += Array.isArray(event.actions) ? event.actions.length : 0;
      if (event.isBookmarked) bookmarkedEventCount += 1;
    });
  });

  return {
    type: 'sportscout-pilot-diagnostic',
    generatedAt: new Date().toISOString(),
    app: SPORTSCOUT_APP_NAME,
    appVersion: SPORTSCOUT_APP_VERSION,
    exportSchemaVersion: SPORTSCOUT_EXPORT_SCHEMA_VERSION,
    projectCount: projects.length,
    eventCount,
    actionCount,
    bookmarkedEventCount,
    eventsBySport,
    hasActiveProject: Boolean(input.activeProjectId),
    saveStatus: input.saveStatus,
    controllerFamily: input.controllerFamily ?? null,
    storage: {
      usageBytes: safeByteCount(input.storageEstimate?.usage),
      quotaBytes: safeByteCount(input.storageEstimate?.quota),
    },
  };
}
