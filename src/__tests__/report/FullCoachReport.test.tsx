import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FullCoachReport from '../../components/report/FullCoachReport';
import type { EventRow, Team, MatchInfo } from '../../types';

function createMockEvent(overrides: Partial<EventRow>): EventRow {
  return {
    id: 'ev-test',
    no: 1,
    point: 1,
    resultText: '0',
    eventText: 'mock event',
    createdAt: new Date().toISOString(),
    actions: [],
    ...overrides,
  };
}

function createMockMatchInfo(overrides: Partial<MatchInfo>): MatchInfo {
  return {
    sportType: 'volleyball',
    matchName: 'Thailand vs Japan',
    scouterName: 'Coach Somchai',
    nickname: 'THAvsJPN',
    matchType: 'Team',
    currentPoint: 0,
    setOrGame: '1',
    ...overrides,
  };
}

const mockState = vi.hoisted(() => ({
  events: [] as EventRow[],
  teams: [
    { id: 't1', code: 'THA', name: 'Thailand', thaiName: 'ไทย' },
    { id: 't2', code: 'JPN', name: 'Japan', thaiName: 'ญี่ปุ่น' },
  ] as Team[],
  matchInfo: {
    sportType: 'volleyball',
    matchName: 'Thailand vs Japan',
    scouterName: 'Coach Somchai',
    nickname: 'THAvsJPN',
    matchType: 'Team' as const,
    currentPoint: 0,
    setOrGame: '1',
  } as MatchInfo,
  settings: {
    uiLanguage: 'th' as 'th' | 'en',
  },
  activeProjectId: 'project-test-123',
}));

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    events: mockState.events,
    teams: mockState.teams,
    matchInfo: mockState.matchInfo,
    settings: mockState.settings,
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeProjectId: mockState.activeProjectId,
  }),
}));

vi.mock('../../services/storage/trackingStorage', () => ({
  loadBadmintonTrackingAnalysis: vi.fn(async () => null),
}));

describe('FullCoachReport (Multi-Sport & Print-Ready Workstation)', () => {
  beforeEach(() => {
    mockState.events = [];
    mockState.matchInfo = createMockMatchInfo({
      sportType: 'volleyball',
      matchName: 'Thailand vs Japan',
      scouterName: 'Coach Somchai',
      setOrGame: '1',
    });
    mockState.settings = { uiLanguage: 'th' };
  });

  it('renders Volleyball report with 5Ws overview, volleyball court map, and pyramid', () => {
    mockState.events = [
      createMockEvent({
        id: 'ev-1',
        no: 1,
        point: 1,
        resultText: '+1',
        actions: [{ teamCode: 'THA', skillCode: 'SPK', areaCode: '4' }],
        videoTime: 12.5,
      }),
    ];

    render(<FullCoachReport />);

    expect(screen.getByText(/Volleyball · 5Ws Standard Report/i)).toBeDefined();
    expect(screen.getByText('Thailand vs Japan')).toBeDefined();
    expect(screen.getAllByText(/โซน 4/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/พีระมิดประสิทธิภาพทักษะ/i)).toBeDefined();
  });

  it('adapts cleanly to Badminton: displays badminton metadata, court zones, and skill breakdown', () => {
    mockState.matchInfo = createMockMatchInfo({
      sportType: 'badminton',
      matchName: 'Kunlavut vs Axelsen',
      scouterName: 'Coach Art',
      setOrGame: '2',
    });
    mockState.events = [
      createMockEvent({
        id: 'ev-bm-1',
        no: 1,
        point: 1,
        resultText: '+1',
        actions: [{ teamCode: 'THA', skillCode: 'SMH', areaCode: 'BL' }],
        videoTime: 45.0,
      }),
    ];

    render(<FullCoachReport />);

    expect(screen.getByText(/Badminton · 5Ws Standard Report/i)).toBeDefined();
    expect(screen.getByText('Kunlavut vs Axelsen')).toBeDefined();
    expect(screen.getByText(/เกม 2/i)).toBeDefined();
    expect(screen.getByText(/แผนผังสนาม \(แบดมินตัน\)/i)).toBeDefined();
    expect(screen.getByText(/สถิติทักษะรายประเภท \(แบดมินตัน\)/i)).toBeDefined();
  });

  it('adapts cleanly to Football: displays tactical thirds pitch, goals, and play breakdown', () => {
    mockState.matchInfo = createMockMatchInfo({
      sportType: 'football',
      matchName: 'Liverpool vs Arsenal',
      scouterName: 'Analyst Klopp',
      setOrGame: '1',
    });
    mockState.events = [
      createMockEvent({
        id: 'ev-fb-1',
        no: 1,
        point: 1,
        resultText: '+1',
        actions: [{ teamCode: 'THA', skillCode: 'SHT', areaCode: 'BOX' }],
        videoTime: 88.0,
      }),
    ];

    render(<FullCoachReport />);

    expect(screen.getByText(/Football · 5Ws Standard Report/i)).toBeDefined();
    expect(screen.getByText(/ครึ่งที่ 1/i)).toBeDefined();
    expect(screen.getByText(/ประตูรวมที่บันทึก/i)).toBeDefined();
    expect(screen.getByText(/แผนผังสนาม \(ฟุตบอล\)/i)).toBeDefined();
    expect(screen.getByText(/สถิติทักษะรายประเภท \(ฟุตบอล\)/i)).toBeDefined();
  });

  it('adapts cleanly to Basketball: displays floor shot zones (paint, 3pt) and quarters', () => {
    mockState.matchInfo = createMockMatchInfo({
      sportType: 'basketball',
      matchName: 'Lakers vs Warriors',
      scouterName: 'Analyst Phil',
      setOrGame: '4',
    });
    mockState.events = [
      createMockEvent({
        id: 'ev-bb-1',
        no: 1,
        point: 2,
        resultText: '+1',
        actions: [{ teamCode: 'THA', skillCode: 'SHT', areaCode: 'PAINT' }],
        videoTime: 120.0,
      }),
    ];

    render(<FullCoachReport />);

    expect(screen.getByText(/Basketball · 5Ws Standard Report/i)).toBeDefined();
    expect(screen.getByText(/ควอเตอร์ 4/i)).toBeDefined();
    expect(screen.getByText(/แผนผังสนาม \(บาสเกตบอล\)/i)).toBeDefined();
    expect(screen.getByText(/สถิติทักษะรายประเภท \(บาสเกตบอล\)/i)).toBeDefined();
  });

  it('provides print-friendly controls and triggers window.print when clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(<FullCoachReport />);

    const printButton = screen.getByRole('button', { name: /พิมพ์รายงานโค้ช/i });
    expect(printButton).toBeDefined();
    expect(printButton.className).toContain('print:hidden');

    fireEvent.click(printButton);
    expect(printSpy).toHaveBeenCalledTimes(1);

    printSpy.mockRestore();
  });

  it('renders video key moments and handles clip selection modal trigger', () => {
    mockState.events = [
      createMockEvent({
        id: 'ev-clip-1',
        no: 1,
        point: 21,
        resultText: '+1',
        thaiMeaningText: 'ตบทำแต้มหัวเสา',
        videoTime: 120,
      }),
    ];

    render(<FullCoachReport />);

    expect(screen.getByText('Pt #21 (+1)')).toBeDefined();
    expect(screen.getByText('02:00.00')).toBeDefined();

    const watchBtn = screen.getByRole('button', { name: /ดูคลิป/i });
    expect(watchBtn).toBeDefined();
    expect(watchBtn.className).toContain('print:hidden');

    fireEvent.click(watchBtn);
    expect(screen.getByText(/Point 21: ตบทำแต้มหัวเสา/i)).toBeDefined();
  });
});
