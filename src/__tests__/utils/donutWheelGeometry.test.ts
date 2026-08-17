import { describe, expect, it } from 'vitest';
import { resolveDonutWheelBand } from '../../utils/donutWheelGeometry';

describe('resolveDonutWheelBand', () => {
  it('separates dead zone, inner ring, outer ring, and outside', () => {
    expect(resolveDonutWheelBand(44, true)).toBe('dead');
    expect(resolveDonutWheelBand(45, true)).toBe('inner');
    expect(resolveDonutWheelBand(110, true)).toBe('inner');
    expect(resolveDonutWheelBand(111, true)).toBe('outer');
    expect(resolveDonutWheelBand(155, true)).toBe('outer');
    expect(resolveDonutWheelBand(156, true)).toBe('outside');
  });

  it('keeps the normal result wheel on the inner ring only', () => {
    expect(resolveDonutWheelBand(120, false)).toBe('outside');
  });
});
