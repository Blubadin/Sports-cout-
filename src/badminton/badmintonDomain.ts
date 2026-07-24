export interface BadmintonRally {
  rallyId: string;
  server: string;
  receiver: string;
  strokeSequence: string[];
  winningPlayer?: string;
  winningTeam?: string;
  errorType?: 'winner' | 'forced_error' | 'unforced_error';
}

export interface BadmintonMetrics {
  totalRallies: number;
  serveWinPercentage: number;
  smashKillPercentage: number;
  errorDistribution: {
    winner: number;
    forced_error: number;
    unforced_error: number;
  };
}

export function calculateBadmintonMetrics(rallies: BadmintonRally[], playerId: string): BadmintonMetrics {
  let serves = 0;
  let serveWins = 0;
  
  let smashes = 0;
  let smashKills = 0;
  
  let winner = 0;
  let forced_error = 0;
  let unforced_error = 0;

  for (const rally of rallies) {
    if (rally.server === playerId) {
      serves++;
      if (rally.winningPlayer === playerId || rally.winningTeam === playerId) {
        serveWins++;
      }
    }

    const hasSmash = rally.strokeSequence.includes('smash');
    if (hasSmash) {
      smashes++;
      if ((rally.winningPlayer === playerId || rally.winningTeam === playerId) && rally.errorType === 'winner') {
        smashKills++;
      }
    }

    if (rally.winningPlayer === playerId || rally.winningTeam === playerId) {
      if (rally.errorType === 'winner') winner++;
    } else if ((rally.winningPlayer && rally.winningPlayer !== playerId) || (rally.winningTeam && rally.winningTeam !== playerId)) {
      if (rally.errorType === 'forced_error') forced_error++;
      if (rally.errorType === 'unforced_error') unforced_error++;
    }
  }

  const serveWinPercentage = serves > 0 ? (serveWins / serves) * 100 : 0;
  const smashKillPercentage = smashes > 0 ? (smashKills / smashes) * 100 : 0;

  return {
    totalRallies: rallies.length,
    serveWinPercentage: Number(serveWinPercentage.toFixed(2)),
    smashKillPercentage: Number(smashKillPercentage.toFixed(2)),
    errorDistribution: {
      winner,
      forced_error,
      unforced_error
    }
  };
}
