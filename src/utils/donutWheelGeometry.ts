export type DonutWheelBand = 'dead' | 'inner' | 'outer' | 'outside';

export function resolveDonutWheelBand(distance: number, hasOuterRing: boolean): DonutWheelBand {
  if (!Number.isFinite(distance) || distance < 45) return 'dead';
  if (distance <= 110) return 'inner';
  if (hasOuterRing && distance <= 155) return 'outer';
  return 'outside';
}

export function resolveDonutSectorIndex(angleFromUp: number, itemCount: number): number {
  if (itemCount <= 0 || !Number.isFinite(angleFromUp)) return -1;
  const normalized = ((angleFromUp % 360) + 360) % 360;
  return Math.floor(normalized / (360 / itemCount));
}
