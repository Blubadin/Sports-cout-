import { describe, expect, it } from 'vitest';
import {
  createPilotEvidenceTemplate,
  evaluatePilotReadiness,
  type PilotEvidence,
} from '../../pilot/pilotReadiness';

function passAllEvidence(): PilotEvidence {
  const evidence = createPilotEvidenceTemplate();
  return {
    ...evidence,
    hardware: evidence.hardware.map((entry) => ({ ...entry, status: 'pass' })),
    workflows: evidence.workflows.map((entry) => ({ ...entry, status: 'pass' })),
    viewports: evidence.viewports.map((entry) => ({ ...entry, status: 'pass' })),
    endurance: {
      status: 'pass',
      minutes: 60,
      duplicateEvents: 0,
      missedReleases: 0,
      severeFatigue: false,
    },
    pilotSessions: Array.from({ length: 8 }, (_, index) => ({
      participantCode: `P${(index % 6) + 1}`,
      sport: index < 3 ? 'volleyball' : index % 2 ? 'football' : 'badminton',
      sessionSucceeded: true,
      unrecoverableDataLoss: 0,
      totalEvents: 100,
      incompleteEvents: index === 0 ? 1 : 0,
      projectReopenSucceeded: true,
      firstEventSeconds: 180,
      controllerTasksAttempted: 10,
      controllerTasksCompletedWithoutMouse: 9,
    })),
  };
}

describe('pilot readiness gate', () => {
  it('starts blocked with every required matrix represented explicitly', () => {
    const evidence = createPilotEvidenceTemplate();
    const report = evaluatePilotReadiness(evidence);

    expect(evidence.hardware).toHaveLength(12);
    expect(evidence.workflows).toHaveLength(24);
    expect(evidence.viewports).toHaveLength(4);
    expect(report.status).toBe('blocked');
    expect(report.pendingCount).toBeGreaterThan(0);
  });

  it('becomes pilot-ready only after matrices, endurance and pilot KPIs pass', () => {
    const report = evaluatePilotReadiness(passAllEvidence());

    expect(report.status).toBe('pilot-ready');
    expect(report.pendingCount).toBe(0);
    expect(report.failedGates).toEqual([]);
    expect(report.metrics.sessionSuccessRate).toBe(1);
    expect(report.metrics.controllerCompletionRate).toBe(0.9);
  });

  it('blocks release when one hardware case fails even if pilot metrics pass', () => {
    const evidence = passAllEvidence();
    evidence.hardware[0] = { ...evidence.hardware[0], status: 'fail' };
    const report = evaluatePilotReadiness(evidence);

    expect(report.status).toBe('blocked');
    expect(report.failedGates).toContain('hardware');
  });

  it('does not accept participant names or free-text notes in its public session type', () => {
    const session = passAllEvidence().pilotSessions[0];
    expect(Object.keys(session)).not.toContain('name');
    expect(Object.keys(session)).not.toContain('notes');
  });

  it('blocks malformed external evidence instead of throwing', () => {
    expect(() => evaluatePilotReadiness(null)).not.toThrow();
    const report = evaluatePilotReadiness({ schemaVersion: '9.9', hardware: 'invalid' });
    expect(report.status).toBe('blocked');
    expect(report.failedGates).toContain('evidence-schema');
  });
});
