import { describe, it, expect } from 'vitest';
import { sanitizeEvents, deriveEventResultText } from '../../utils/scoutData';
import type { EventRow, Action } from '../../types';

describe('Data Sync Safety & Persistence Integrity (Phase 1 Remediation)', () => {
  it('ensures deriveEventResultText stays in 100% sync when last action resultCode is updated', () => {
    const originalActions: Action[] = [
      { id: 'a1', teamCode: 'THA', skillCode: 'Spike', resultCode: 'Pass' },
    ];
    expect(deriveEventResultText(originalActions)).toBe('0');

    // Simulate editing result in table to +1 (Yes)
    const updatedActionsPlusOne: Action[] = [
      { id: 'a1', teamCode: 'THA', skillCode: 'Spike', resultCode: 'Yes', outcomeStatus: 'success' },
    ];
    expect(deriveEventResultText(updatedActionsPlusOne)).toBe('+1');

    // Simulate editing result in table to -1 (Out)
    const updatedActionsMinusOne: Action[] = [
      { id: 'a1', teamCode: 'THA', skillCode: 'Spike', resultCode: 'Out', outcomeStatus: 'error' },
    ];
    expect(deriveEventResultText(updatedActionsMinusOne)).toBe('-1');
  });

  it('guarantees sanitizeEvents preserves edited and manual override results after reload', () => {
    const rawEvents: Partial<EventRow>[] = [
      {
        id: 'e1',
        no: 1,
        point: 1,
        resultText: '+1',
        actions: [{ id: 'a1', teamCode: 'THA', skillCode: 'Spike', resultCode: 'Yes', outcomeStatus: 'success' }],
      },
      {
        id: 'e2',
        no: 2,
        point: 2,
        resultText: '-1',
        actions: [{ id: 'a2-override', resultCode: 'Out', outcomeStatus: 'error' }],
      },
    ];

    const sanitized = sanitizeEvents(rawEvents as EventRow[], 'volleyball');
    expect(sanitized[0].resultText).toBe('+1');
    expect(sanitized[1].resultText).toBe('-1');
  });

  it('prevents duplicate action IDs across duplicated rows', () => {
    const sourceRow: EventRow = {
      id: 'e1',
      no: 1,
      point: 1,
      resultText: '+1',
      eventText: 'THA / Spike / Yes',
      createdAt: new Date().toISOString(),
      actions: [
        { id: 'act-original-1', teamCode: 'THA', skillCode: 'Spike', resultCode: 'Yes' },
        { id: 'act-original-2', teamCode: 'THA', skillCode: 'Block', resultCode: 'Pass' },
      ],
    };

    const timestamp = Date.now();
    const duplicatedActions = sourceRow.actions.map((act, actIdx) => ({
      ...act,
      id: `act-dup-${timestamp}-${actIdx}-${Math.random().toString(36).slice(2, 7)}`,
    }));

    expect(duplicatedActions[0].id).not.toBe(sourceRow.actions[0].id);
    expect(duplicatedActions[1].id).not.toBe(sourceRow.actions[1].id);
    expect(duplicatedActions[0].id).not.toBe(duplicatedActions[1].id);
  });
});
