import { describe, it, expect } from 'vitest';
import { calculateDashboardStats } from '../../utils/dashboardStats';
import { createMockEventList, createMockEvent, createMockAction, mockTeams } from '../fixtures';
import { createGoldenSportEvents, goldenTeams } from '../fixtures/goldenAnalytics';

describe('calculateDashboardStats', () => {
  it('should handle empty events', () => {
    const stats = calculateDashboardStats([], 'ALL', mockTeams);
    expect(stats.total).toBe(0);
    expect(stats.yes).toBe(0);
    expect(stats.out).toBe(0);
    expect(stats.pass).toBe(0);
  });

  it('should count totals correctly', () => {
    const events = createMockEventList(6);
    const stats = calculateDashboardStats(events, 'ALL', mockTeams);
    expect(stats.total).toBe(6);
    expect(stats.yes + stats.out + stats.pass).toBe(6);
  });

  it('should filter by sport type', () => {
    const events = [
      createMockEvent({ sportType: 'volleyball', resultText: '+1' }),
      createMockEvent({ sportType: 'volleyball', resultText: '-1' }),
      createMockEvent({ sportType: 'football', resultText: '+1' }),
    ];
    const stats = calculateDashboardStats(events, 'volleyball', mockTeams);
    expect(stats.total).toBe(2);
  });

  it('should include all sports when filter is ALL', () => {
    const events = [
      createMockEvent({ sportType: 'volleyball' }),
      createMockEvent({ sportType: 'football' }),
      createMockEvent({ sportType: 'badminton' }),
    ];
    const stats = calculateDashboardStats(events, 'ALL', mockTeams);
    expect(stats.total).toBe(3);
  });

  it('should track team counts', () => {
    const events = [
      createMockEvent({ actions: [createMockAction({ teamCode: 'THA' })] }),
      createMockEvent({ actions: [createMockAction({ teamCode: 'THA' })] }),
      createMockEvent({ actions: [createMockAction({ teamCode: 'JPN' })] }),
    ];
    const stats = calculateDashboardStats(events, 'ALL', mockTeams);
    expect(stats.teamCounts['THA']).toBe(2);
    expect(stats.teamCounts['JPN']).toBe(1);
  });

  it('should track skill counts per team', () => {
    const events = [
      createMockEvent({ actions: [createMockAction({ teamCode: 'THA', skillCode: 'SV' })] }),
      createMockEvent({ actions: [createMockAction({ teamCode: 'JPN', skillCode: 'SV' })] }),
    ];
    const stats = calculateDashboardStats(events, 'ALL', mockTeams);
    expect(stats.skillCounts['SV']).toBeDefined();
    expect(stats.skillCounts['SV'].teamA).toBe(1);
    expect(stats.skillCounts['SV'].teamB).toBe(1);
  });

  it('should generate radar, bar, and pie chart data', () => {
    const events = createMockEventList(5);
    const stats = calculateDashboardStats(events, 'ALL', mockTeams);
    expect(stats.radarDataGlobal).toBeDefined();
    expect(Array.isArray(stats.radarDataGlobal)).toBe(true);
    expect(stats.barDataGlobal).toBeDefined();
    expect(Array.isArray(stats.barDataGlobal)).toBe(true);
    expect(stats.pieDataGlobal).toBeDefined();
    expect(Array.isArray(stats.pieDataGlobal)).toBe(true);
  });

  it('exposes the unified analytics summary used by dashboard totals', () => {
    const stats = calculateDashboardStats(
      createGoldenSportEvents('volleyball'),
      'volleyball',
      goldenTeams,
    );

    expect(stats.analyticsSummary.totalEvents).toBe(20);
    expect(stats.total).toBe(stats.analyticsSummary.totalEvents);
    expect(stats.totalActions).toBe(stats.analyticsSummary.totalActions);
    expect(stats.yes).toBe(stats.analyticsSummary.eventResultCounts.Yes);
    expect(stats.teamAScore).toBe(2);
    expect(stats.teamBScore).toBe(7);
  });
});
