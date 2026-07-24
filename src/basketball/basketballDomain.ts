export interface BasketballPossession {
  possessionId: string;
  teamCode: string;
  period: number;
  shotClockStart: number;
  pointsScored?: 1 | 2 | 3;
  reboundType?: 'offensive' | 'defensive';
  turnoverType?: string;
  fga?: number;
  fta?: number;
}

export interface BasketballMetrics {
  trueShootingPercentage: number;
  offensiveRating: number;
  defensiveRating: number;
  reboundPercentage: {
    offensive: number;
    defensive: number;
  };
}

export function calculateBasketballMetrics(possessions: BasketballPossession[], teamCode: string): BasketballMetrics {
  let pts = 0;
  let fga = 0;
  let fta = 0;
  let offPoss = 0;
  let defPoss = 0;
  let offReb = 0;
  let defReb = 0;
  let oppOffReb = 0;
  let oppDefReb = 0;
  let oppPts = 0;
  
  for (const poss of possessions) {
    if (poss.teamCode === teamCode) {
      offPoss++;
      if (poss.pointsScored) pts += poss.pointsScored;
      if (poss.fga) fga += poss.fga;
      if (poss.fta) fta += poss.fta;
      if (poss.reboundType === 'offensive') offReb++;
      if (poss.reboundType === 'defensive') oppDefReb++; 
    } else {
      defPoss++;
      if (poss.pointsScored) oppPts += poss.pointsScored;
      if (poss.reboundType === 'defensive') defReb++; 
      if (poss.reboundType === 'offensive') oppOffReb++; 
    }
  }

  const tsDenom = 2 * (fga + 0.44 * fta);
  const trueShootingPercentage = tsDenom > 0 ? (pts / tsDenom) * 100 : 0;
  
  const offensiveRating = offPoss > 0 ? (pts / offPoss) * 100 : 0;
  const defensiveRating = defPoss > 0 ? (oppPts / defPoss) * 100 : 0;
  
  const orbDenom = offReb + oppDefReb;
  const orb = orbDenom > 0 ? (offReb / orbDenom) * 100 : 0;
  
  const drbDenom = defReb + oppOffReb;
  const drb = drbDenom > 0 ? (defReb / drbDenom) * 100 : 0;

  return {
    trueShootingPercentage: Number(trueShootingPercentage.toFixed(2)),
    offensiveRating: Number(offensiveRating.toFixed(2)),
    defensiveRating: Number(defensiveRating.toFixed(2)),
    reboundPercentage: {
      offensive: Number(orb.toFixed(2)),
      defensive: Number(drb.toFixed(2))
    }
  };
}
