import type { Action, EventRow } from '../types';

export type VolleyballRally = {
  rallyId: string;
  servingTeam: string;
  receivingTeam: string;
  serverRotation: 1 | 2 | 3 | 4 | 5 | 6;
  events: EventRow[];
  winningTeam?: string;
  endingReason?: 'kill' | 'error' | 'blocked' | 'out' | 'foul' | 'continued';
};

export type VolleyballMetrics = {
  totalRallies: number;
  totalPoints: number;
  sideOuts: number;
  sideOutPercentage: number;
  breakPoints: number;
  breakPointPercentage: number;
  receptionStats: {
    pass3: number;
    pass2: number;
    pass1: number;
    pass0: number;
    total: number;
    efficiencyPercentage: number;
  };
  attackStats: {
    kills: number;
    errors: number;
    blocks: number;
    continued: number;
    total: number;
    efficiencyPercentage: number;
  };
};

export function calculateVolleyballMetrics(
  rallies: VolleyballRally[],
  teamCode: string,
): VolleyballMetrics {
  let sideOuts = 0;
  let opponentServes = 0;
  let breakPoints = 0;
  let ownServes = 0;

  let pass3 = 0;
  let pass2 = 0;
  let pass1 = 0;
  let pass0 = 0;

  let kills = 0;
  let errors = 0;
  let blocks = 0;
  let continued = 0;

  for (const rally of rallies) {
    const isOwnServe = rally.servingTeam === teamCode;
    const isOwnReceive = rally.receivingTeam === teamCode;
    const wonRally = rally.winningTeam === teamCode;

    if (isOwnReceive) {
      opponentServes++;
      if (wonRally) sideOuts++;
    }

    if (isOwnServe) {
      ownServes++;
      if (wonRally) breakPoints++;
    }

    for (const event of rally.events) {
      for (const action of event.actions) {
        if (action.teamCode !== teamCode) continue;

        // Reception grading
        const isReception = action.skillCode === 'REC' || action.skillCode === 'Receive' || (action.domainPayload?.type === 'volleyball' && action.domainPayload.rallyPhase === 'reception');
        if (isReception) {
          const grade = action.domainPayload?.type === 'volleyball' ? action.domainPayload.receptionGrade : action.resultCode;
          if (grade === '#' || grade === 'Pass' || grade === '3') pass3++;
          else if (grade === '+' || grade === '2') pass2++;
          else if (grade === '!' || grade === '1') pass1++;
          else if (grade === '=' || grade === 'Out' || grade === '0') pass0++;
        }

        // Attack grading
        const isAttack = action.skillCode === 'SPK' || action.skillCode === 'Spike' || (action.domainPayload?.type === 'volleyball' && action.domainPayload.rallyPhase === 'attack');
        if (isAttack) {
          if (action.resultCode === 'Yes' || (action.domainPayload?.type === 'volleyball' && action.domainPayload.attackGrade === 'kill')) {
            kills++;
          } else if (action.resultCode === 'Out' || (action.domainPayload?.type === 'volleyball' && action.domainPayload.attackGrade === 'error')) {
            errors++;
          } else if (action.foulCode === 'NET_TOUCH' || action.foulCode === 'Net Touch' || (action.domainPayload?.type === 'volleyball' && action.domainPayload.attackGrade === 'blocked')) {
            blocks++;
          } else {
            continued++;
          }
        }
      }
    }
  }

  const sideOutPercentage = opponentServes > 0 ? (sideOuts / opponentServes) * 100 : 0;
  const breakPointPercentage = ownServes > 0 ? (breakPoints / ownServes) * 100 : 0;

  const totalPasses = pass3 + pass2 + pass1 + pass0;
  const receptionEfficiencyPercentage =
    totalPasses > 0 ? ((3 * pass3 + 2 * pass2 + 1 * pass1) / (3 * totalPasses)) * 100 : 0;

  const totalAttacks = kills + errors + blocks + continued;
  const attackEfficiencyPercentage =
    totalAttacks > 0 ? ((kills - errors - blocks) / totalAttacks) * 100 : 0;

  return {
    totalRallies: rallies.length,
    totalPoints: sideOuts + breakPoints,
    sideOuts,
    sideOutPercentage: Number.parseFloat(sideOutPercentage.toFixed(2)),
    breakPoints,
    breakPointPercentage: Number.parseFloat(breakPointPercentage.toFixed(2)),
    receptionStats: {
      pass3,
      pass2,
      pass1,
      pass0,
      total: totalPasses,
      efficiencyPercentage: Number.parseFloat(receptionEfficiencyPercentage.toFixed(2)),
    },
    attackStats: {
      kills,
      errors,
      blocks,
      continued,
      total: totalAttacks,
      efficiencyPercentage: Number.parseFloat(attackEfficiencyPercentage.toFixed(2)),
    },
  };
}
