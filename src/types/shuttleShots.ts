export interface ShuttleShot {
  shotId: string;
  rallyId: string | null;
  hitterPlayerId: string | null;
  contactFrame: number | null;
  contactTimestampSec: number | null;
  contactPositionPx: { x: number; y: number } | null;
  contactPositionM: { xM: number; yM: number } | null;
  endFrame: number | null;
  endTimestampSec: number | null;
  landingPositionPx: { x: number; y: number } | null;
  landingPositionM: { xM: number; yM: number } | null;
  landingZone: string | null;
  outcome: 'CONFIRMED_LANDING' | 'PROBABLE_LANDING' | 'RETURNED' | 'OUT_SIDE' | 'OUT_LONG' | 'NET' | 'UNKNOWN';
  confidence: number | null;
  outOfFrame?: boolean;
  reacquired?: boolean;
  landingConfirmed?: boolean;
}

export interface ShuttleShotEvents {
  visibility: 'OBSERVED' | 'EXITING_FRAME' | 'OUT_OF_FRAME' | 'REACQUIRED' | 'LOST';
  measuredPositionPx: { x: number; y: number } | null;
  continuity: {
    edge: string; timestampSec: number; cameraSegmentId: string | null;
    positionPx: { x: number; y: number }; velocityPxPerSec: [number, number];
    shotId: string | null; rallyId: string | null;
  } | null;
  shots: ShuttleShot[];
}
