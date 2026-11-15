import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SportSpecificKPIs from '../../components/charts/SportSpecificKPIs';
import type { EventRow, MatchInfo, Team } from '../../types';

const mockTeams: Team[] = [
  { id: 't1', code: 'HOME', name: 'Home Team', thaiName: 'เจ้าบ้าน', teamType: 'club' },
  { id: 't2', code: 'AWAY', name: 'Away Team', thaiName: 'ทีมเยือน', teamType: 'club' },
];

const testReportState = {
  events: [] as EventRow[],
  teams: mockTeams,
  sportType: 'volleyball' as MatchInfo['sportType'],
};

vi.mock('../../context/ScoutContext', () => ({
  useScoutContext: () => ({
    events: testReportState.events,
    teams: testReportState.teams,
    matchInfo: {
      scouterName: 'Analyst',
      nickname: 'A',
      matchName: 'Report Match',
      matchType: 'Team',
      setOrGame: '1',
      currentPoint: 10,
      sportType: testReportState.sportType,
    },
    settings: {
      uiLanguage: 'en',
      theme: 'dark',
      darkMode: true,
    },
  }),
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ activeProjectId: 'report-proj-1' }),
}));

vi.mock('../../services/storage/trackingStorage', () => ({
  loadBadmintonTrackingAnalysis: async () => null,
}));

import FullCoachReport from '../../components/report/FullCoachReport';

afterEach(() => {
  cleanup();
});

describe('Canonical skill codes and KPI calculation', () => {
  it('uses canonical SV, REC, and SPK codes for volleyball KPIs and ignores legacy aliases', () => {
    const volleyballEvents: EventRow[] = [
      {
        id: 'vb-1',
        no: 1,
        point: 1,
        sportType: 'volleyball',
        resultText: '+1',
        eventText: 'HOME / SV / 1 / Yes',
        actions: [{ id: 'a1', teamCode: 'HOME', skillCode: 'SV', areaCode: '1', resultCode: 'Yes' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'vb-2',
        no: 2,
        point: 2,
        sportType: 'volleyball',
        resultText: '+1',
        eventText: 'HOME / REC / 6 / Yes',
        actions: [{ id: 'a2', teamCode: 'HOME', skillCode: 'REC', areaCode: '6', resultCode: 'Yes' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'vb-3',
        no: 3,
        point: 3,
        sportType: 'volleyball',
        resultText: '-1',
        eventText: 'HOME / SPK / 4 / Out',
        actions: [{ id: 'a3', teamCode: 'HOME', skillCode: 'SPK', areaCode: '4', resultCode: 'Out' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'vb-legacy',
        no: 4,
        point: 4,
        sportType: 'volleyball',
        resultText: '-1',
        eventText: 'HOME / SRV / 1 / Out',
        actions: [{ id: 'a4', teamCode: 'HOME', skillCode: 'SRV', areaCode: '1', resultCode: 'Out' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(
      <SportSpecificKPIs
        events={volleyballEvents}
        teams={mockTeams}
        matchInfo={{
          scouterName: '',
          nickname: '',
          matchName: '',
          matchType: 'Team',
          setOrGame: '1',
          currentPoint: 1,
          sportType: 'volleyball',
        }}
        teamFilter="ALL"
        uiLanguage="en"
      />,
    );

    expect(screen.getByText('Serve Efficiency').nextSibling).toHaveTextContent('100.0%');
    expect(screen.getByText('Receive Efficiency').nextSibling).toHaveTextContent('100.0%');
    expect(screen.getByText('Attack Errors').nextSibling).toHaveTextContent('1');
  });

  it('computes Basketball Field Goal % from SportRuleEngine / scoreDelta / outcomeStatus rather than resultText === "+1"', () => {
    const basketballEvents: EventRow[] = [
      {
        id: 'bb-1',
        no: 1,
        point: 2,
        sportType: 'basketball',
        // Simulate legacy/ambiguous resultText where 2PT shot only exists cleanly via outcomeStatus/rule engine
        resultText: '0',
        eventText: 'HOME / SHT / P2 / Yes',
        actions: [
          {
            id: 'b1',
            teamCode: 'HOME',
            skillCode: 'SHT',
            descriptors: { shot_type: '2PT' },
            areaCode: 'P2',
            resultCode: 'Yes',
            scoreDelta: 2,
            outcomeStatus: 'success',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'bb-2',
        no: 2,
        point: 5,
        sportType: 'basketball',
        resultText: '+1',
        eventText: 'HOME / LAY / P3 / Yes',
        actions: [
          {
            id: 'b2',
            teamCode: 'HOME',
            skillCode: 'LAY',
            descriptors: { shot_type: '2PT' },
            areaCode: 'P3',
            resultCode: 'Yes',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'bb-3',
        no: 3,
        point: 5,
        sportType: 'basketball',
        resultText: '+1', // deliberate mismatch vs Out action to verify engine/outcome evaluation
        eventText: 'HOME / SHT / P1 / Out',
        actions: [
          {
            id: 'b3',
            teamCode: 'HOME',
            skillCode: 'SHT',
            descriptors: { shot_type: '3PT' },
            areaCode: 'P1',
            resultCode: 'Out',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'bb-4',
        no: 4,
        point: 5,
        sportType: 'basketball',
        resultText: '0',
        eventText: 'HOME / SHT / P2 / Out',
        actions: [
          {
            id: 'b4',
            teamCode: 'HOME',
            skillCode: 'SHT',
            areaCode: 'P2',
            resultCode: 'Out',
            scoreDelta: 0,
            outcomeStatus: 'error',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(
      <SportSpecificKPIs
        events={basketballEvents}
        teams={mockTeams}
        matchInfo={{
          scouterName: '',
          nickname: '',
          matchName: '',
          matchType: 'Team',
          setOrGame: '1',
          currentPoint: 1,
          sportType: 'basketball',
        }}
        teamFilter="ALL"
        uiLanguage="en"
      />,
    );

    // 2 made shots out of 4 attempts = 50.0%
    expect(screen.getByText('Field Goal %').nextSibling).toHaveTextContent('50.0%');
  });

  it('uses canonical SV and SPK in FullCoachReport zone analysis', () => {
    testReportState.sportType = 'volleyball';
    testReportState.events = [
      {
        id: 'rep-1',
        no: 1,
        point: 1,
        sportType: 'volleyball',
        resultText: '+1',
        eventText: 'HOME / SPK / 2 / Yes',
        actions: [{ id: 'r1', teamCode: 'HOME', skillCode: 'SPK', areaCode: '2', resultCode: 'Yes' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'rep-2',
        no: 2,
        point: 2,
        sportType: 'volleyball',
        resultText: '+1',
        eventText: 'HOME / SPK / 2 / Yes',
        actions: [{ id: 'r2', teamCode: 'HOME', skillCode: 'SPK', areaCode: '2', resultCode: 'Yes' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'rep-legacy',
        no: 3,
        point: 3,
        sportType: 'volleyball',
        resultText: '+1',
        eventText: 'HOME / ATK / 9 / Yes',
        actions: [{ id: 'r3', teamCode: 'HOME', skillCode: 'ATK', areaCode: '9', resultCode: 'Yes' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'rep-serve',
        no: 4,
        point: 4,
        sportType: 'volleyball',
        resultText: '+1',
        eventText: 'HOME / SV / 1 / Yes',
        actions: [{ id: 'r4', teamCode: 'HOME', skillCode: 'SV', areaCode: '1', resultCode: 'Yes' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(<FullCoachReport />);
    expect(screen.getByText(/Zone 2 received the highest attacking volume \(2 attacks\)/i)).toBeInTheDocument();
  });
});
