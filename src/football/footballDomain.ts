export type PitchLane = 'Left Flank' | 'Left Half-Space' | 'Center' | 'Right Half-Space' | 'Right Flank';
export type PitchThird = 'Defensive' | 'Middle' | 'Attacking';

export interface FootballPitchZone {
  id: string;
  name: string;
  lane: PitchLane;
  third: PitchThird;
}

export const LANES: PitchLane[] = ['Left Flank', 'Left Half-Space', 'Center', 'Right Half-Space', 'Right Flank'];
export const THIRDS: PitchThird[] = ['Defensive', 'Middle', 'Attacking'];

export const ZONES: FootballPitchZone[] = THIRDS.flatMap((third) =>
  LANES.map((lane) => ({
    id: `${third.toLowerCase()}-${lane.toLowerCase().replace(' ', '-')}`,
    name: `${lane} ${third}`,
    lane,
    third,
  }))
);

export interface Point {
  x: number; // 0 to 1
  y: number; // 0 to 1
}

export function getPitchZoneFromPoint(point: Point): FootballPitchZone {
  // x: 0 to 1 (left to right -> Left Flank to Right Flank)
  // y: 0 to 1 (top to bottom or bottom to top? Let's say y=0 is Defensive, y=1 is Attacking, for simplicity we can assume y=0 is Attacking and y=1 is Defensive, but usually y=0 is top. Let's assume x=0..1 is length and y=0..1 is width. Wait, standard pitch:
  // Let's assume x (0-1) is the length of the pitch (Defensive to Attacking)
  // y (0-1) is the width of the pitch (Left to Right)

  // x: 0.0 - 0.33: Defensive, 0.33 - 0.67: Middle, 0.67 - 1.0: Attacking
  // y: 0.0 - 0.2: Left Flank, 0.2 - 0.4: Left Half-Space, 0.4 - 0.6: Center, 0.6 - 0.8: Right Half-Space, 0.8 - 1.0: Right Flank
  
  let third: PitchThird = 'Defensive';
  if (point.x > 0.666) {
    third = 'Attacking';
  } else if (point.x > 0.333) {
    third = 'Middle';
  }

  let lane: PitchLane = 'Left Flank';
  if (point.y >= 0.8) {
    lane = 'Right Flank';
  } else if (point.y >= 0.6) {
    lane = 'Right Half-Space';
  } else if (point.y >= 0.4) {
    lane = 'Center';
  } else if (point.y >= 0.2) {
    lane = 'Left Half-Space';
  }

  return ZONES.find((z) => z.lane === lane && z.third === third) || ZONES[0];
}

export type ActionType = 'Pass' | 'Cross' | 'Dribble' | 'Shot' | 'Corner' | 'Goal Kick' | 'Tackle' | 'Interception' | 'Other';

export interface FootballAction {
  id: string;
  type: ActionType;
  startCoord?: Point;
  endCoord?: Point;
  teamId: string;
  isSuccessful?: boolean;
}

export interface SequenceLine {
  start: Point;
  end: Point;
  actionId: string;
  type: ActionType;
}

export function calculatePossessionSequenceLines(actions: FootballAction[]): SequenceLine[] {
  const lines: SequenceLine[] = [];
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (['Pass', 'Cross', 'Dribble'].includes(action.type) && action.startCoord && action.endCoord) {
      lines.push({
        start: action.startCoord,
        end: action.endCoord,
        actionId: action.id,
        type: action.type,
      });
    }
  }

  return lines;
}

export function getCornerKickCoordinate(side: 'top-left' | 'bottom-left' | 'top-right' | 'bottom-right'): Point {
  switch (side) {
    case 'top-left': return { x: 0, y: 0 };
    case 'bottom-left': return { x: 0, y: 1 };
    case 'top-right': return { x: 1, y: 0 };
    case 'bottom-right': return { x: 1, y: 1 };
  }
}

export function getGoalKickCoordinate(side: 'left' | 'right'): Point {
  switch (side) {
    case 'left': return { x: 0.05, y: 0.5 };
    case 'right': return { x: 0.95, y: 0.5 };
  }
}
