import { describe, it, expect } from 'vitest';
import { BasketballPossession, calculateBasketballMetrics } from '../../basketball/basketballDomain';

describe('Basketball Domain', () => {
  it('should calculate basketball metrics correctly', () => {
    const possessions: BasketballPossession[] = [
      {
        possessionId: '1',
        teamCode: 'TEAM_A',
        period: 1,
        shotClockStart: 24,
        pointsScored: 2,
        fga: 1,
        fta: 0
      },
      {
        possessionId: '2',
        teamCode: 'TEAM_A',
        period: 1,
        shotClockStart: 24,
        reboundType: 'offensive',
        fga: 1,
        fta: 0
      },
      {
        possessionId: '3',
        teamCode: 'TEAM_B',
        period: 1,
        shotClockStart: 24,
        pointsScored: 3,
        fga: 1,
        fta: 0
      },
      {
        possessionId: '4',
        teamCode: 'TEAM_B',
        period: 1,
        shotClockStart: 24,
        reboundType: 'defensive' // TEAM_B defensive rebound (on TEAM_A miss)
      }
    ];

    const metrics = calculateBasketballMetrics(possessions, 'TEAM_A');
    
    // TEAM_A has 2 possessions:
    // P1: 2 points, 1 fga
    // P2: 0 points, 1 fga, 1 offensive rebound
    // Total PTS = 2, FGA = 2, FTA = 0.
    // TS% = 2 / (2 * (2 + 0)) = 50%
    expect(metrics.trueShootingPercentage).toBe(50);
    
    // Offensive Rating = (PTS / Possessions) * 100 = (2 / 2) * 100 = 100
    expect(metrics.offensiveRating).toBe(100);
    
    // TEAM_B has 2 possessions (TEAM_A defense):
    // P3: 3 points
    // P4: defensive rebound (by TEAM_B)
    // TEAM_A defensive rating = (Opp PTS / Def Possessions) * 100 = (3 / 2) * 100 = 150
    expect(metrics.defensiveRating).toBe(150);
  });
  
  it('should calculate rebound percentages correctly', () => {
    const possessions: BasketballPossession[] = [
      { possessionId: '1', teamCode: 'TEAM_A', period: 1, shotClockStart: 24, reboundType: 'offensive' }, // A ORB = 1
      { possessionId: '2', teamCode: 'TEAM_A', period: 1, shotClockStart: 24, reboundType: 'defensive' }, // B DefReb on A miss = 1
      { possessionId: '3', teamCode: 'TEAM_B', period: 1, shotClockStart: 24, reboundType: 'defensive' }, // A DefReb on B miss = 1
      { possessionId: '4', teamCode: 'TEAM_B', period: 1, shotClockStart: 24, reboundType: 'offensive' }, // B ORB = 1
    ];
    
    const metrics = calculateBasketballMetrics(possessions, 'TEAM_A');
    // ORB% = ORB / (ORB + Opp DRB) = 1 / (1 + 1) = 50%
    expect(metrics.reboundPercentage.offensive).toBe(50);
    // DRB% = DRB / (DRB + Opp ORB) = 1 / (1 + 1) = 50%
    expect(metrics.reboundPercentage.defensive).toBe(50);
  });
  
  it('should handle empty possessions', () => {
    const metrics = calculateBasketballMetrics([], 'TEAM_A');
    expect(metrics.trueShootingPercentage).toBe(0);
    expect(metrics.offensiveRating).toBe(0);
    expect(metrics.defensiveRating).toBe(0);
    expect(metrics.reboundPercentage.offensive).toBe(0);
    expect(metrics.reboundPercentage.defensive).toBe(0);
  });
});
