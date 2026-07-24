import { describe, it, expect } from 'vitest';
import { BadmintonRally, calculateBadmintonMetrics } from '../../badminton/badmintonDomain';

describe('Badminton Domain', () => {
  it('should calculate badminton metrics correctly', () => {
    const rallies: BadmintonRally[] = [
      {
        rallyId: '1',
        server: 'P1',
        receiver: 'P2',
        strokeSequence: ['serve', 'clear', 'smash'],
        winningPlayer: 'P1',
        errorType: 'winner'
      },
      {
        rallyId: '2',
        server: 'P2',
        receiver: 'P1',
        strokeSequence: ['serve', 'drop', 'net_kill'],
        winningPlayer: 'P2',
        errorType: 'forced_error'
      },
      {
        rallyId: '3',
        server: 'P1',
        receiver: 'P2',
        strokeSequence: ['serve', 'smash', 'block', 'smash'],
        winningPlayer: 'P2',
        errorType: 'unforced_error'
      }
    ];

    const metrics = calculateBadmintonMetrics(rallies, 'P1');
    expect(metrics.totalRallies).toBe(3);
    expect(metrics.serveWinPercentage).toBe(50); // 2 serves by P1, 1 win = 50%
    expect(metrics.smashKillPercentage).toBe(50); // 2 rallies with smash, P1 won 1 with a winner = 50%
    expect(metrics.errorDistribution.winner).toBe(1);
    expect(metrics.errorDistribution.forced_error).toBe(1); // P2 won with forced error
    expect(metrics.errorDistribution.unforced_error).toBe(1); // P2 won with unforced error
  });
  
  it('should handle empty rallies', () => {
    const metrics = calculateBadmintonMetrics([], 'P1');
    expect(metrics.totalRallies).toBe(0);
    expect(metrics.serveWinPercentage).toBe(0);
    expect(metrics.smashKillPercentage).toBe(0);
    expect(metrics.errorDistribution.winner).toBe(0);
  });
});
