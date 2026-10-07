// Court dimensions and marking positions match the calibrated doubles court in ai_service/court_mapper.py.
const COURT_WIDTH_M = 6.10;
const COURT_LENGTH_M = 13.40;
const SINGLES_ALLEY_M = 0.46;
const SHORT_SERVICE_TOP_M = 4.72;
const SHORT_SERVICE_BOTTOM_M = 8.68;
const DOUBLES_LONG_SERVICE_M = 0.76;

type CourtPoint = [number, number];

const MARKINGS: { id: string; from: CourtPoint; to: CourtPoint }[] = [
  { id: 'singles-left', from: [SINGLES_ALLEY_M, 0], to: [SINGLES_ALLEY_M, COURT_LENGTH_M] },
  { id: 'singles-right', from: [COURT_WIDTH_M - SINGLES_ALLEY_M, 0], to: [COURT_WIDTH_M - SINGLES_ALLEY_M, COURT_LENGTH_M] },
  { id: 'doubles-service-top', from: [0, DOUBLES_LONG_SERVICE_M], to: [COURT_WIDTH_M, DOUBLES_LONG_SERVICE_M] },
  { id: 'doubles-service-bottom', from: [0, COURT_LENGTH_M - DOUBLES_LONG_SERVICE_M], to: [COURT_WIDTH_M, COURT_LENGTH_M - DOUBLES_LONG_SERVICE_M] },
  { id: 'short-service-top', from: [0, SHORT_SERVICE_TOP_M], to: [COURT_WIDTH_M, SHORT_SERVICE_TOP_M] },
  { id: 'short-service-bottom', from: [0, SHORT_SERVICE_BOTTOM_M], to: [COURT_WIDTH_M, SHORT_SERVICE_BOTTOM_M] },
  { id: 'center-service-top', from: [COURT_WIDTH_M / 2, 0], to: [COURT_WIDTH_M / 2, SHORT_SERVICE_TOP_M] },
  { id: 'center-service-bottom', from: [COURT_WIDTH_M / 2, SHORT_SERVICE_BOTTOM_M], to: [COURT_WIDTH_M / 2, COURT_LENGTH_M] },
];

export interface ProjectedCourtMarking {
  id: string;
  from: CourtPoint;
  to: CourtPoint;
}

/** Projects painted court markings into the video using the accepted real-to-image homography. */
export function projectCourtMarkings(hInvMatrix: number[][] | null | undefined, width: number, height: number): ProjectedCourtMarking[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
    !Array.isArray(hInvMatrix) || hInvMatrix.length !== 3 ||
    !hInvMatrix.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) return [];

  const project = ([x, y]: CourtPoint): CourtPoint | null => {
    const [r0, r1, r2] = hInvMatrix;
    const scale = r2[0] * x + r2[1] * y + r2[2];
    if (!Number.isFinite(scale) || Math.abs(scale) < 1e-9) return null;
    const px = (r0[0] * x + r0[1] * y + r0[2]) / scale;
    const py = (r1[0] * x + r1[1] * y + r1[2]) / scale;
    if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || px >= width || py < 0 || py >= height) return null;
    return [px, py];
  };

  const lines: ProjectedCourtMarking[] = [];
  for (const marking of MARKINGS) {
    const from = project(marking.from);
    const to = project(marking.to);
    if (from && to) lines.push({ id: marking.id, from, to });
  }
  return lines;
}
