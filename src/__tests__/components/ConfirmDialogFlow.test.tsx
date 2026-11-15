import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, useConfirmDialog } from '../../context/ConfirmContext';
import { ScoutProvider, useScoutContext } from '../../context/ScoutContext';
import ScoutingTable from '../../components/ScoutingTable';
import type { EventRow } from '../../types';

function ConfirmHarness({
  language,
  onResult,
}: {
  language: 'th' | 'en';
  onResult: (value: boolean) => void;
}) {
  const { confirm } = useConfirmDialog();
  return (
    <button
      type="button"
      onClick={async () => {
        const confirmed = await confirm({
          title: language === 'th' ? 'ยืนยัน' : 'Confirm',
          message: language === 'th' ? 'ต้องการดำเนินการต่อ?' : 'Proceed with action?',
          tone: 'danger',
          language,
        });
        onResult(confirmed);
      }}
    >
      Trigger Confirm
    </button>
  );
}

function SportChangeHarness() {
  const { matchInfo, settings, setSettings, updateActionField, changeSportType } = useScoutContext();
  return (
    <div>
      <span data-testid="sport-value">{matchInfo.sportType}</span>
      <button type="button" onClick={() => setSettings(prev => ({ ...prev, uiLanguage: 'en' }))}>
        Set EN
      </button>
      <button type="button" onClick={() => updateActionField('skillCode', 'SV')}>
        Select Skill
      </button>
      <button type="button" onClick={() => void changeSportType('badminton')}>
        Switch Sport
      </button>
      <span data-testid="lang-value">{settings.uiLanguage}</span>
    </div>
  );
}

function TableHarness() {
  const { setEvents, setSettings } = useScoutContext();
  React.useEffect(() => {
    setSettings(prev => ({ ...prev, uiLanguage: 'en' }));
    const seeded: EventRow = {
      id: 'ev-delete-1',
      no: 1,
      point: 1,
      eventText: 'THA / SV / 1 / Yes',
      resultText: '+1',
      actions: [{ id: 'a1', teamCode: 'THA', skillCode: 'SV', areaCode: '1', resultCode: 'Yes' }],
      sportType: 'volleyball',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    setEvents([seeded]);
  }, [setEvents, setSettings]);

  return <ScoutingTable />;
}

describe('Non-blocking React confirmation dialog flows', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('supports TH and EN labels, resolves true on confirm and false on Escape without window.confirm', async () => {
    const windowConfirmSpy = vi.spyOn(window, 'confirm');
    const results: boolean[] = [];

    const { rerender } = render(
      <ConfirmProvider>
        <ConfirmHarness language="th" onResult={(v) => results.push(v)} />
      </ConfirmProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Confirm' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ยืนยัน' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(results).toEqual([true]));

    rerender(
      <ConfirmProvider>
        <ConfirmHarness language="en" onResult={(v) => results.push(v)} />
      </ConfirmProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Confirm' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(results).toEqual([true, false]));
    expect(windowConfirmSpy).not.toHaveBeenCalled();
  });

  it('uses React ConfirmDialog inside ScoutContext.changeSportType when draft action is pending', async () => {
    const windowConfirmSpy = vi.spyOn(window, 'confirm');

    render(
      <ConfirmProvider>
        <ScoutProvider>
          <SportChangeHarness />
        </ScoutProvider>
      </ConfirmProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set EN' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Skill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch Sport' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/may clear your current action/i)).toBeInTheDocument();
    expect(screen.getByTestId('sport-value')).toHaveTextContent('volleyball');

    // Cancel keeps original sport
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('sport-value')).toHaveTextContent('volleyball');

    // Confirm switches sport
    fireEvent.click(screen.getByRole('button', { name: 'Switch Sport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change Sport' }));
    await waitFor(() => expect(screen.getByTestId('sport-value')).toHaveTextContent('badminton'));
    expect(windowConfirmSpy).not.toHaveBeenCalled();
  });

  it('uses React ConfirmDialog instead of window.confirm when deleting an event row in ScoutingTable', async () => {
    const windowConfirmSpy = vi.spyOn(window, 'confirm');

    render(
      <ConfirmProvider>
        <ScoutProvider>
          <TableHarness />
        </ScoutProvider>
      </ConfirmProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('THA / SV / 1 / Yes').length).toBeGreaterThan(0));

    await act(async () => {
      fireEvent.click(screen.getAllByTitle('Delete')[0]);
    });

    const alertDialog = screen.getByRole('alertdialog');
    fireEvent.click(within(alertDialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryAllByText('THA / SV / 1 / Yes')).toHaveLength(0));
    expect(windowConfirmSpy).not.toHaveBeenCalled();
  });
});
