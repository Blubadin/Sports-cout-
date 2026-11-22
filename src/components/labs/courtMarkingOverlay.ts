// Court dimensions and marking positions match the calibrated doubles court in ai_service/court_mapper.py.
const COURT_WIDTH_M = 6.10;
const COURT_LENGTH_M = 13.40;
const SINGLES_ALLEY_M = 0.46;
const SHORT_SERVICE_TOP_M = 4.72;
const SHORT_SERVICE_BOTTOM_M = 8.68;
const DOUBLES_LONG_SERVICE_M = 0.76;
const NET_Y_M = COURT_LENGTH_M / 2;

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
  const lines: ProjectedCourtMarking[] = [];
  for (const marking of MARKINGS) {
    const line = projectCourtLine(hInvMatrix, width, height, marking.id, marking.from, marking.to);
    if (line) lines.push(line);
  }
  return lines;
}

/** Projects the net plane at mid-court as a separate orientation guide, not a floor marking. */
export function projectCourtNetGuide(
  hInvMatrix: number[][] | null | undefined,
  width: number,
  height: number,
): ProjectedCourtMarking[] {
  const line = projectCourtLine(
    hInvMatrix, width, height, 'net-guide', [0, NET_Y_M], [COURT_WIDTH_M, NET_Y_M],
  );
  return line ? [line] : [];
}

/** Projects floor markings from manually selected outer corners for calibration review. */
export function projectCourtMarkingsFromCorners(
  corners: number[][] | null | undefined,
  width: number,
  height: number,
): ProjectedCourtMarking[] {
  const hInvMatrix = courtImageHomographyFromCorners(corners, width, height);
  return hInvMatrix ? projectCourtMarkings(hInvMatrix, width, height) : [];
}

/** Projects the separate net orientation guide from manually selected corners. */
export function projectCourtNetGuideFromCorners(
  corners: number[][] | null | undefined,
  width: number,
  height: number,
): ProjectedCourtMarking[] {
  const hInvMatrix = courtImageHomographyFromCorners(corners, width, height);
  return hInvMatrix ? projectCourtNetGuide(hInvMatrix, width, height) : [];
}

function courtImageHomographyFromCorners(
  corners: number[][] | null | undefined,
  width: number,
  height: number,
): number[][] | null {
  if (!Array.isArray(corners) || corners.length !== 4 ||
    !corners.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) ||
    !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const real: CourtPoint[] = [[0, 0], [COURT_WIDTH_M, 0], [COURT_WIDTH_M, COURT_LENGTH_M], [0, COURT_LENGTH_M]];
  const rows: number[][] = [];
  const values: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const [x, y] = real[index];
    const [u, v] = corners[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }

  const solution = solveLinearSystem(rows, values);
  if (!solution) return null;
  return [
    solution.slice(0, 3),
    solution.slice(3, 6),
    [...solution.slice(6, 8), 1],
  ];
}

function projectCourtLine(
  hInvMatrix: number[][] | null | undefined,
  width: number,
  height: number,
  id: string,
  fromCourt: CourtPoint,
  toCourt: CourtPoint,
): ProjectedCourtMarking | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
    !Array.isArray(hInvMatrix) || hInvMatrix.length !== 3 ||
    !hInvMatrix.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) return null;
  const project = ([x, y]: CourtPoint): CourtPoint | null => {
    const [r0, r1, r2] = hInvMatrix;
    const scale = r2[0] * x + r2[1] * y + r2[2];
    if (!Number.isFinite(scale) || Math.abs(scale) < 1e-9) return null;
    const px = (r0[0] * x + r0[1] * y + r0[2]) / scale;
    const py = (r1[0] * x + r1[1] * y + r1[2]) / scale;
    if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || px >= width || py < 0 || py >= height) return null;
    return [px, py];
  };
  const from = project(fromCourt);
  const to = project(toCourt);
  return from && to ? { id, from, to } : null;
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] | null {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (!Number.isFinite(augmented[pivot][column]) || Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) augmented[row][entry] -= factor * augmented[column][entry];
    }
  }
  const result = augmented.map(row => row[size]);
  return result.every(Number.isFinite) ? result : null;
}
