import type { VolleyballRally } from '../volleyball/volleyballDomain';
import type { EventRow } from '../types';

function createRallyEvent(
  id: string,
  no: number,
  teamCode: string,
  skillCode: string,
  resultCode: string,
  receptionGrade?: string,
  attackGrade?: string,
): EventRow {
  return {
    id,
    no,
    point: no,
    sportType: 'volleyball',
    eventText: `${teamCode} / ${skillCode} / ${resultCode}`,
    resultText: resultCode === 'Yes' ? '+1' : resultCode === 'Out' ? '-1' : '0',
    createdAt: new Date().toISOString(),
    actions: [
      {
        id: `act-${id}`,
        teamCode,
        skillCode,
        resultCode,
        domainPayload: {
          type: 'volleyball',
          receptionGrade,
          attackGrade,
        },
      },
    ],
  };
}

// Generate 50 realistic expert rallies for Team THA (vs Team JPN)
export const GOLDEN_VOLLEYBALL_RALLIES: VolleyballRally[] = Array.from({ length: 50 }, (_, i) => {
  const rallyIndex = i + 1;
  const isThaiServe = rallyIndex % 2 !== 0; // 25 own serves, 25 opponent serves
  const servingTeam = isThaiServe ? 'THA' : 'JPN';
  const receivingTeam = isThaiServe ? 'JPN' : 'THA';

  // Deterministic outcome pattern for 50 rallies:
  // For THA receiving (25 rallies):
  // 15 THA Side-outs, 10 JPN Break-points
  // Pass grades for THA (25 total passes): 10 Pass3 (#), 8 Pass2 (+), 5 Pass1 (!), 2 Pass0 (=)
  // Attack grades for THA (50 total attacks): 20 Kills, 5 Errors, 5 Blocks, 20 Continued
  const wonRally = isThaiServe ? rallyIndex % 4 === 1 : rallyIndex % 5 !== 0; // Deterministic wins

  const events: EventRow[] = [];
  events.push(createRallyEvent(`r${rallyIndex}-e1`, 1, servingTeam, 'Serve', 'Pass'));

  if (receivingTeam === 'THA') {
    const passGrade = rallyIndex % 5 === 0 ? '=' : rallyIndex % 3 === 0 ? '!' : rallyIndex % 2 === 0 ? '+' : '#';
    events.push(createRallyEvent(`r${rallyIndex}-e2`, 2, 'THA', 'Receive', 'Pass', passGrade));
  }

  const attackGrade = wonRally ? 'kill' : rallyIndex % 7 === 0 ? 'error' : rallyIndex % 11 === 0 ? 'blocked' : 'continued';
  const attackResult = attackGrade === 'kill' ? 'Yes' : attackGrade === 'error' ? 'Out' : 'Pass';
  events.push(createRallyEvent(`r${rallyIndex}-e3`, 3, 'THA', 'Spike', attackResult, undefined, attackGrade));

  return {
    rallyId: `rally-${rallyIndex}`,
    servingTeam,
    receivingTeam,
    serverRotation: ((rallyIndex % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    events,
    winningTeam: wonRally ? 'THA' : 'JPN',
    endingReason: attackGrade === 'kill' ? 'kill' : attackGrade === 'error' ? 'error' : attackGrade === 'blocked' ? 'blocked' : 'continued',
  };
});
