import type { SportType } from '../types';

export type PilotCaseStatus = 'pending' | 'pass' | 'fail';
export type PilotDeviceFamily = 'ps4' | 'ps5' | 'xbox';
export type PilotConnection = 'usb' | 'bluetooth';
export type PilotBrowser = 'chrome' | 'edge';
export type PilotInputMode = 'normal' | 'hud' | 'controller';
export type PilotVideoSource = 'local' | 'youtube';

export type HardwareEvidence = {
  device: PilotDeviceFamily;
  connection: PilotConnection;
  browser: PilotBrowser;
  status: PilotCaseStatus;
};

export type WorkflowEvidence = {
  sport: SportType;
  inputMode: PilotInputMode;
  videoSource: PilotVideoSource;
  status: PilotCaseStatus;
};

export type ViewportEvidence = {
  name: 'laptop' | 'desktop' | 'tablet-landscape' | 'phone-landscape';
  width: number;
  height: number;
  status: PilotCaseStatus;
};

export type PilotSessionObservation = {
  participantCode: string;
  sport: SportType;
  sessionSucceeded: boolean;
  unrecoverableDataLoss: number;
  totalEvents: number;
  incompleteEvents: number;
  projectReopenSucceeded: boolean;
  firstEventSeconds: number;
  controllerTasksAttempted: number;
  controllerTasksCompletedWithoutMouse: number;
};

export type PilotEvidence = {
  schemaVersion: '1.0';
  hardware: HardwareEvidence[];
  workflows: WorkflowEvidence[];
  viewports: ViewportEvidence[];
  endurance: {
    status: PilotCaseStatus;
    minutes: number;
    duplicateEvents: number;
    missedReleases: number;
    severeFatigue: boolean;
  };
  pilotSessions: PilotSessionObservation[];
};

export type PilotReadinessReport = {
  status: 'blocked' | 'pilot-ready';
  pendingCount: number;
  failedGates: Array<'evidence-schema' | 'hardware' | 'workflows' | 'viewports' | 'endurance' | 'pilot-metrics'>;
  metrics: {
    participantCount: number;
    sessionCount: number;
    volleyballSessionCount: number;
    sessionSuccessRate: number;
    unrecoverableDataLoss: number;
    incompleteEventRate: number;
    projectReopenRate: number;
    firstEventUnderTenMinutesRate: number;
    controllerCompletionRate: number;
  };
};

const SPORTS: SportType[] = ['volleyball', 'football', 'badminton', 'basketball'];
const DEVICES: PilotDeviceFamily[] = ['ps4', 'ps5', 'xbox'];
const CONNECTIONS: PilotConnection[] = ['usb', 'bluetooth'];
const BROWSERS: PilotBrowser[] = ['chrome', 'edge'];
const INPUT_MODES: PilotInputMode[] = ['normal', 'hud', 'controller'];
const VIDEO_SOURCES: PilotVideoSource[] = ['local', 'youtube'];

const REQUIRED_VIEWPORTS: ViewportEvidence[] = [
  { name: 'laptop', width: 1366, height: 768, status: 'pending' },
  { name: 'desktop', width: 1920, height: 1080, status: 'pending' },
  { name: 'tablet-landscape', width: 1024, height: 768, status: 'pending' },
  { name: 'phone-landscape', width: 844, height: 390, status: 'pending' },
];

export function createPilotEvidenceTemplate(): PilotEvidence {
  return {
    schemaVersion: '1.0',
    hardware: DEVICES.flatMap((device) =>
      CONNECTIONS.flatMap((connection) =>
        BROWSERS.map((browser) => ({ device, connection, browser, status: 'pending' as const })),
      ),
    ),
    workflows: SPORTS.flatMap((sport) =>
      INPUT_MODES.flatMap((inputMode) =>
        VIDEO_SOURCES.map((videoSource) => ({ sport, inputMode, videoSource, status: 'pending' as const })),
      ),
    ),
    viewports: REQUIRED_VIEWPORTS.map((entry) => ({ ...entry })),
    endurance: {
      status: 'pending',
      minutes: 0,
      duplicateEvents: 0,
      missedReleases: 0,
      severeFatigue: false,
    },
    pilotSessions: [],
  };
}

const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
const hardwareKey = (entry: HardwareEvidence) => `${entry.device}:${entry.connection}:${entry.browser}`;
const workflowKey = (entry: WorkflowEvidence) => `${entry.sport}:${entry.inputMode}:${entry.videoSource}`;
const viewportKey = (entry: ViewportEvidence) => `${entry.name}:${entry.width}x${entry.height}`;

function evaluateRequiredCases<T extends { status: PilotCaseStatus }>(
  required: T[],
  provided: T[],
  keyOf: (entry: T) => string,
) {
  const providedByKey = new Map(provided.map((entry) => [keyOf(entry), entry]));
  const statuses = required.map((entry) => providedByKey.get(keyOf(entry))?.status ?? 'pending');
  return {
    pass: statuses.every((status) => status === 'pass'),
    failed: statuses.some((status) => status === 'fail'),
    pending: statuses.filter((status) => status === 'pending').length,
  };
}

export function evaluatePilotReadiness(value: unknown): PilotReadinessReport {
  const evidence = value && typeof value === 'object' ? value as Partial<PilotEvidence> : {};
  const schemaValid = evidence.schemaVersion === '1.0'
    && Array.isArray(evidence.hardware)
    && Array.isArray(evidence.workflows)
    && Array.isArray(evidence.viewports)
    && Boolean(evidence.endurance && typeof evidence.endurance === 'object')
    && Array.isArray(evidence.pilotSessions);
  const template = createPilotEvidenceTemplate();
  const hardware = evaluateRequiredCases(template.hardware, Array.isArray(evidence.hardware) ? evidence.hardware : [], hardwareKey);
  const workflows = evaluateRequiredCases(template.workflows, Array.isArray(evidence.workflows) ? evidence.workflows : [], workflowKey);
  const viewports = evaluateRequiredCases(template.viewports, Array.isArray(evidence.viewports) ? evidence.viewports : [], viewportKey);
  const endurancePass = evidence.endurance?.status === 'pass'
    && evidence.endurance.minutes >= 60
    && evidence.endurance.duplicateEvents === 0
    && evidence.endurance.missedReleases === 0
    && !evidence.endurance.severeFatigue;

  const sessions = Array.isArray(evidence.pilotSessions) ? evidence.pilotSessions : [];
  const participantCount = new Set(sessions.map((session) => session.participantCode)).size;
  const totalEvents = sessions.reduce((sum, session) => sum + Math.max(0, session.totalEvents), 0);
  const incompleteEvents = sessions.reduce((sum, session) => sum + Math.max(0, session.incompleteEvents), 0);
  const controllerTasks = sessions.reduce((sum, session) => sum + Math.max(0, session.controllerTasksAttempted), 0);
  const controllerCompleted = sessions.reduce(
    (sum, session) => sum + Math.max(0, session.controllerTasksCompletedWithoutMouse),
    0,
  );
  const metrics = {
    participantCount,
    sessionCount: sessions.length,
    volleyballSessionCount: sessions.filter((session) => session.sport === 'volleyball').length,
    sessionSuccessRate: ratio(sessions.filter((session) => session.sessionSucceeded).length, sessions.length),
    unrecoverableDataLoss: sessions.reduce((sum, session) => sum + Math.max(0, session.unrecoverableDataLoss), 0),
    incompleteEventRate: ratio(incompleteEvents, totalEvents),
    projectReopenRate: ratio(sessions.filter((session) => session.projectReopenSucceeded).length, sessions.length),
    firstEventUnderTenMinutesRate: ratio(sessions.filter((session) => session.firstEventSeconds < 600).length, sessions.length),
    controllerCompletionRate: ratio(controllerCompleted, controllerTasks),
  };
  const pilotMetricsPass = participantCount >= 6
    && sessions.length >= 8
    && metrics.volleyballSessionCount >= 2
    && metrics.sessionSuccessRate >= 0.95
    && metrics.unrecoverableDataLoss === 0
    && metrics.incompleteEventRate < 0.02
    && metrics.projectReopenRate === 1
    && metrics.firstEventUnderTenMinutesRate === 1
    && metrics.controllerCompletionRate >= 0.9;

  const failedGates: PilotReadinessReport['failedGates'] = [];
  if (!schemaValid) failedGates.push('evidence-schema');
  if (hardware.failed) failedGates.push('hardware');
  if (workflows.failed) failedGates.push('workflows');
  if (viewports.failed) failedGates.push('viewports');
  if (evidence.endurance?.status === 'fail' || (evidence.endurance?.status === 'pass' && !endurancePass)) failedGates.push('endurance');
  if (sessions.length > 0 && !pilotMetricsPass) failedGates.push('pilot-metrics');

  const pendingCount = hardware.pending
    + workflows.pending
    + viewports.pending
    + (endurancePass ? 0 : 1)
    + (pilotMetricsPass ? 0 : 1);
  const allPass = schemaValid && hardware.pass && workflows.pass && viewports.pass && endurancePass && pilotMetricsPass;

  return {
    status: allPass ? 'pilot-ready' : 'blocked',
    pendingCount,
    failedGates,
    metrics,
  };
}
