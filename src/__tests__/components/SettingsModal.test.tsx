import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsModal from '../../components/SettingsModal';

const mockState = vi.hoisted(() => ({
  settings: {
    uiLanguage: 'th' as 'th' | 'en',
    theme: 'dark' as 'light' | 'dark' | 'contrast',
    enableScoutHUDMode: true,
  },
  teams: [
    { id: 't1', code: 'THA', name: 'Thailand', thaiName: 'ไทย' },
    { id: 't2', code: 'JPN', name: 'Japan', thaiName: 'ญี่ปุ่น' },
  ],
  matchInfo: {
    sportType: 'volleyball',
    matchName: 'Test Match',
  },
}));

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    settings: mockState.settings,
    setSettings: vi.fn(),
    teams: mockState.teams,
    setTeams: vi.fn(),
    matchInfo: mockState.matchInfo,
    setMatchInfo: vi.fn(),
    changeSportType: vi.fn(),
    events: [],
    saveEventsWithHistory: vi.fn(),
    clearCurrentEvent: vi.fn(),
    showToast: vi.fn(),
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    projects: [],
    activeProjectId: 'proj-1',
    saveStatus: 'saved',
  }),
}));

describe('SettingsModal UX & Body Scroll Lock', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('locks body scroll when opened and restores it when unmounted', () => {
    expect(document.body.style.overflow).toBe('');

    const { unmount } = render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores body scroll when isOpen changes to false', () => {
    const { rerender } = render(<SettingsModal isOpen={true} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<SettingsModal isOpen={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('renders settings categories and allows switching tabs', () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/ภาษาและรูปแบบภาพ/i)).toBeDefined();

    // Click on Video tab
    const videoTab = screen.getByRole('button', { name: /วิดีโอ/i });
    fireEvent.click(videoTab);

    expect(screen.getByText(/ปัดบนวิดีโอ/i)).toBeDefined();
  });
});
