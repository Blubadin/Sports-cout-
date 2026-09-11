import { describe, it, expect } from 'vitest';
import { generateMatchReportData, printMatchReportHTML } from '../../utils/reportGenerator';
import type { ScoutProject } from '../../types';

describe('Coach Reports Generator (Checkpoint 15)', () => {
  const mockProject: ScoutProject = {
    id: 'proj-1',
    title: 'Thailand vs Japan Championship',
    sportType: 'volleyball',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    matchInfo: {
      scouterName: 'Coach A',
      nickname: 'Head Coach',
      matchName: 'Finals',
      matchType: 'Team',
      setOrGame: '1',
      currentPoint: 25,
      sportType: 'volleyball',
    },
    teams: [
      { id: 't1', code: 'THA', name: 'Thailand', thaiName: 'ทีมชาติไทย' },
      { id: 't2', code: 'JPN', name: 'Japan', thaiName: 'ทีมชาติญี่ปุ่น' },
    ],
    events: [
      {
        id: 'e1',
        no: 1,
        point: 1,
        sportType: 'volleyball',
        eventText: 'THA / Spike / Yes',
        resultText: '+1',
        createdAt: new Date().toISOString(),
        isBookmarked: true,
        actions: [{ id: 'a1', teamCode: 'THA', skillCode: 'Spike', resultCode: 'Yes' }],
      },
    ],
  };

  it('generates match report data correctly from project events and teams', () => {
    const reportData = generateMatchReportData(mockProject);
    expect(reportData.projectTitle).toBe('Thailand vs Japan Championship');
    expect(reportData.sportType).toBe('volleyball');
    expect(reportData.totalEvents).toBe(1);
    expect(reportData.teamAName).toBe('Thailand');
    expect(reportData.teamAScore).toBe(1);
    expect(reportData.teamBScore).toBe(0);
    expect(reportData.earnedPointsTeamA).toBe(1);
    expect(reportData.keyMomentsCount).toBe(1);
  });

  it('generates print-friendly HTML report output', () => {
    const reportData = generateMatchReportData(mockProject);
    const html = printMatchReportHTML(reportData);
    expect(html).toContain('Thailand vs Japan Championship');
    expect(html).toContain('Thailand');
    expect(html).toContain('SPORTSCOUT Match Summary Report');
  });

  it('escapes untrusted report fields before embedding them in HTML', () => {
    const reportData = generateMatchReportData(mockProject);
    const html = printMatchReportHTML({
      ...reportData,
      projectTitle: '<img src=x onerror=alert(1)>',
      sportType: 'volley<script>alert(1)</script>',
      teamAName: '<script>alert(1)</script>',
      teamBName: 'O\'Brien & Sons',
      earnedPointsTeamA: Number.NaN,
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('O&#39;Brien &amp; Sons');
    expect(html).toContain('Earned Points: 0');
    expect(html).not.toContain('Earned Points: NaN');
  });
});
