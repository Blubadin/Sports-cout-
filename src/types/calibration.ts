/** Validity of the existing court homography for one camera segment. */
export const CALIBRATION_STATES = [
  'UNCALIBRATED', 'CALIBRATED', 'CALIBRATION_LOST', 'RECALIBRATING',
] as const;
export type CalibrationState = typeof CALIBRATION_STATES[number];
export type CalibrationSource = 'manual' | 'automatic' | 'corrected';

export interface CalibrationProvenance {
  calibrationId: string;
  cameraSegmentId: string;
  state: CalibrationState;
  source: CalibrationSource;
  createdAtFrame: number;
  createdAtTimestampSec: number;
  confidence?: number | null;
  reprojectionErrorPx?: number | null;
  corners?: number[][] | null;
  hMatrix?: number[][] | null;
  hInvMatrix?: number[][] | null;
}

export function isCalibrationState(value: unknown): value is CalibrationState {
  return typeof value === 'string' && (CALIBRATION_STATES as readonly string[]).includes(value);
}

export function parseCalibrationProvenance(value: unknown): CalibrationProvenance | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.calibrationId !== 'string' || !p.calibrationId ||
    typeof p.cameraSegmentId !== 'string' || !p.cameraSegmentId ||
    !isCalibrationState(p.state) ||
    !['manual', 'automatic', 'corrected'].includes(String(p.source)) ||
    !Number.isInteger(p.createdAtFrame) || Number(p.createdAtFrame) < 0 ||
    typeof p.createdAtTimestampSec !== 'number' ||
    !Number.isFinite(p.createdAtTimestampSec) || p.createdAtTimestampSec < 0 ||
    (p.confidence != null && (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1)) ||
    (p.reprojectionErrorPx != null && (typeof p.reprojectionErrorPx !== 'number' || !Number.isFinite(p.reprojectionErrorPx) || p.reprojectionErrorPx < 0))
  ) return null;
  return p as unknown as CalibrationProvenance;
}

export function isMetricCalibrationValid(frame: {
  calibrationState?: CalibrationState;
  cameraSegmentId?: string;
  calibrationId?: string | null;
  calibration?: CalibrationProvenance | null;
}): boolean {
  // V1 records without temporal fields retain their existing interpretation.
  if (frame.calibrationState === undefined) return true;
  return frame.calibrationState === 'CALIBRATED' &&
    !!frame.cameraSegmentId && !!frame.calibrationId &&
    !!frame.calibration && frame.calibration.state === 'CALIBRATED' &&
    frame.calibration.cameraSegmentId === frame.cameraSegmentId &&
    frame.calibration.calibrationId === frame.calibrationId;
}
