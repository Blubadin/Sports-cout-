import { describe, it, expect } from 'vitest';
import { calculateHomography, homographyToMatrix3d } from '../../utils/areaGeometry';

describe('Court Homography Math', () => {
  it('should return null for invalid number of points', () => {
    const src: [number, number][] = [[0, 0], [1, 0]];
    const dst: [number, number][] = [[0, 0], [1, 0]];
    expect(calculateHomography(src, dst)).toBeNull();
  });

  it('should calculate identity matrix when src and dst are identical', () => {
    const src: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const dst: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    
    const h = calculateHomography(src, dst);
    expect(h).not.toBeNull();
    if (h) {
      // Identity check (approximate due to float math)
      expect(h[0]).toBeCloseTo(1);
      expect(h[1]).toBeCloseTo(0);
      expect(h[2]).toBeCloseTo(0);
      expect(h[3]).toBeCloseTo(0);
      expect(h[4]).toBeCloseTo(1);
      expect(h[5]).toBeCloseTo(0);
      expect(h[6]).toBeCloseTo(0);
      expect(h[7]).toBeCloseTo(0);
      expect(h[8]).toBeCloseTo(1);
    }
  });

  it('should calculate correct homography for simple scale and translation', () => {
    const src: [number, number][] = [[0, 0], [10, 0], [0, 10], [10, 10]];
    const dst: [number, number][] = [[100, 100], [200, 100], [100, 200], [200, 200]];
    // This is essentially scale by 10 and translate by 100
    // h = [10, 0, 100, 0, 10, 100, 0, 0, 1] normalized so h[8]=1
    
    const h = calculateHomography(src, dst);
    expect(h).not.toBeNull();
    if (h) {
      expect(h[0]).toBeCloseTo(10);
      expect(h[4]).toBeCloseTo(10);
      expect(h[2]).toBeCloseTo(100);
      expect(h[5]).toBeCloseTo(100);
      expect(h[8]).toBeCloseTo(1);
    }
  });

  it('should format CSS matrix3d correctly', () => {
    const h = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const str = homographyToMatrix3d(h);
    expect(str).toContain('matrix3d(');
    // Remember column-major layout:
    // [h0, h3, 0, h6, h1, h4, 0, h7, 0, 0, 1, 0, h2, h5, 0, h8]
    expect(str.replace(/\s+/g, '')).toBe('matrix3d(1,4,0,7,2,5,0,8,0,0,1,0,3,6,0,9)');
  });
});
