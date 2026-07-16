import { describe, expect, it } from 'vitest';
import { createPilotDiagnosticReport } from '../../utils/pilotDiagnostics';
import { createMockEvent } from '../fixtures';

describe('pilot diagnostic export', () => {
  it('exports operational counts without scouting content or device identity', () => {
    const report = createPilotDiagnosticReport({
      projects: [{
        id: 'private-project-id',
        title: 'Secret opponent analysis',
        sportType: 'volleyball',
        matchInfo: {
          scouterName: 'Coach Private', nickname: '', matchName: 'Private match',
          matchType: 'Team', setOrGame: '1', currentPoint: 1, sportType: 'volleyball',
        },
        teams: [],
        events: [createMockEvent({ note: 'Confidential tactical note' })],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      activeProjectId: 'private-project-id',
      saveStatus: 'saved',
      controllerFamily: 'ps5',
      rawDeviceId: 'DualSense serial 123',
      storageEstimate: { usage: 1024, quota: 2048 },
    });

    expect(report.projectCount).toBe(1);
    expect(report.eventCount).toBe(1);
    expect(report.eventsBySport.volleyball).toBe(1);
    expect(report.storage).toEqual({ usageBytes: 1024, quotaBytes: 2048 });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('Secret opponent');
    expect(serialized).not.toContain('Confidential');
    expect(serialized).not.toContain('Coach Private');
    expect(serialized).not.toContain('serial 123');
    expect(serialized).not.toContain('private-project-id');
  });
});
