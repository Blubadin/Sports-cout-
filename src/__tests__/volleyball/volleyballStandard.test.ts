import { describe, it, expect } from 'vitest';
import { calculateVolleyballMetrics } from '../../volleyball/volleyballDomain';
import { GOLDEN_VOLLEYBALL_RALLIES } from '../../data/goldenVolleyballDataset';

describe('Volleyball Pilot Standard (Checkpoint 10)', () => {
  it('has a valid Golden Dataset with exactly 50 rallies', () => {
    expect(GOLDEN_VOLLEYBALL_RALLIES).toHaveLength(50);
  });

  it('calculates side-out %, break-point %, reception efficiency %, and attack efficiency % with 100% mathematical precision', () => {
    const metrics = calculateVolleyballMetrics(GOLDEN_VOLLEYBALL_RALLIES, 'THA');

    expect(metrics.totalRallies).toBe(50);
    expect(metrics.sideOuts).toBe(20);
    expect(metrics.sideOutPercentage).toBe(80); // 20 / 25 * 100

    expect(metrics.breakPoints).toBe(13);
    expect(metrics.breakPointPercentage).toBe(52); // 13 / 25 * 100

    // Reception: 0 pass3 (#), 13 pass2 (+), 7 pass1 (!), 5 pass0 (=) (25 total passes)
    // Formula: (3*0 + 2*13 + 1*7) / (3*25) = (26 + 7) / 75 = 33 / 75 = 44%
    expect(metrics.receptionStats.total).toBe(25);
    expect(metrics.receptionStats.pass3).toBe(0);
    expect(metrics.receptionStats.pass2).toBe(13);
    expect(metrics.receptionStats.pass1).toBe(7);
    expect(metrics.receptionStats.pass0).toBe(5);
    expect(metrics.receptionStats.efficiencyPercentage).toBe(44);

    // Attack: 33 Kills, 2 Errors, 1 Block, 14 Continued (50 total attacks)
    // Formula: (33 - 2 - 1) / 50 = 30 / 50 = 60%
    expect(metrics.attackStats.total).toBe(50);
    expect(metrics.attackStats.kills).toBe(33);
    expect(metrics.attackStats.errors).toBe(2);
    expect(metrics.attackStats.blocks).toBe(1);
    expect(metrics.attackStats.continued).toBe(14);
    expect(metrics.attackStats.efficiencyPercentage).toBe(60);
  });

  it('proves that fouls do not automatically convert to lost points without explicit outcome status', () => {
    const sampleRally = {
      rallyId: 'r-foul-test',
      servingTeam: 'THA',
      receivingTeam: 'JPN',
      serverRotation: 1 as const,
      winningTeam: 'THA',
      endingReason: 'continued' as const,
      events: [
        {
          id: 'ev-foul',
          no: 1,
          point: 1,
          sportType: 'volleyball' as const,
          eventText: 'THA / Foul / Foot Fault',
          resultText: '0' as const, // Neutral - does not award point to JPN automatically
          createdAt: new Date().toISOString(),
          actions: [
            {
              id: 'act-foul',
              teamCode: 'THA',
              foulCode: 'Foot Fault',
              outcomeStatus: 'neutral' as const,
            },
          ],
        },
      ],
    };

    const metrics = calculateVolleyballMetrics([sampleRally], 'THA');
    expect(metrics.attackStats.errors).toBe(0);
    expect(metrics.attackStats.blocks).toBe(0);
  });
});
