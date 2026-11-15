import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRow } from '../../types';

const mocks = vi.hoisted(() => ({
  events: [] as EventRow[],
  updateEventRow: vi.fn(),
  saveEventsWithHistory: vi.fn(),
  deleteEventRow: vi.fn(),
  setSeekRequest: vi.fn(),
  setPreviewState: vi.fn(),
  showToast: vi.fn(),
  undoEventAction: vi.fn(),
  redoEventAction: vi.fn(),
  toggleEventBookmark: vi.fn(),
}));

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    events: mocks.events,
    saveEventsWithHistory: mocks.saveEventsWithHistory,
    deleteEventRow: mocks.deleteEventRow,
    updateEventRow: mocks.updateEventRow,
    setSeekRequest: mocks.setSeekRequest,
    setPreviewState: mocks.setPreviewState,
    settings: {
      uiLanguage: 'en' as const,
      enableKeyMoments: true,
    },
    showToast: mocks.showToast,
    canUndoEventAction: false,
    canRedoEventAction: false,
    undoEventAction: mocks.undoEventAction,
    redoEventAction: mocks.redoEventAction,
    toggleEventBookmark: mocks.toggleEventBookmark,
  }),
}));

vi.mock('../../components/EditEventModal', () => ({
  default: () => null,
}));

import ScoutingTable from '../../components/ScoutingTable';

const sampleEvent: EventRow = {
  id: 'evt-1',
  no: 1,
  point: 5,
  actions: [
    {
      id: 'act-1',
      teamCode: 'THA',
      skillCode: 'SV',
      areaCode: '1',
      resultCode: 'Yes',
      outcomeStatus: 'success',
      videoTime: 12.5,
    },
  ],
  eventText: 'THA SV 1 +1',
  thaiMeaningText: 'ไทย เสิร์ฟ โซน 1 ได้แต้ม',
  resultText: '+1',
  sportType: 'volleyball',
  videoTime: 12.5,
  note: 'Initial note',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ScoutingTable point and note editing (Phase 0 regression)', () => {
  beforeEach(() => {
    mocks.events = [sampleEvent];
    mocks.updateEventRow.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('updates row.point as a number when editing the point input without corrupting other fields', () => {
    render(<ScoutingTable />);

    const pointInput = screen.getByDisplayValue('5') as HTMLInputElement;
    expect(pointInput.type).toBe('number');

    fireEvent.change(pointInput, { target: { value: '14' } });

    expect(mocks.updateEventRow).toHaveBeenCalledTimes(1);
    expect(mocks.updateEventRow).toHaveBeenCalledWith('evt-1', {
      ...sampleEvent,
      point: 14,
    });
  });

  it('updates row.note as a string when editing the note input', () => {
    render(<ScoutingTable />);

    const noteInput = screen.getByPlaceholderText('Add note...') as HTMLInputElement;
    expect(noteInput.value).toBe('Initial note');

    fireEvent.change(noteInput, { target: { value: 'Strong float serve' } });

    expect(mocks.updateEventRow).toHaveBeenCalledTimes(1);
    expect(mocks.updateEventRow).toHaveBeenCalledWith('evt-1', {
      ...sampleEvent,
      note: 'Strong float serve',
    });
  });
});
