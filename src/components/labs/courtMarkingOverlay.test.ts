import { expect, it } from 'vitest';
import {
  projectCourtMarkings,
  projectCourtMarkingsFromCorners,
  projectCourtNetGuide,
  projectCourtNetGuideFromCorners,
} from './courtMarkingOverlay';

it('projects the painted badminton lines from accepted court metres into video pixels', () => {
  const lines = projectCourtMarkings([[100, 0, 100], [0, 20, 100], [0, 0, 1]], 1000, 500);
  expect(lines).toHaveLength(8);
  expect(lines.find(line => line.id === 'singles-left')).toEqual({
    id: 'singles-left', from: [146, 100], to: [146, 368],
  });
  expect(lines.find(line => line.id === 'short-service-top')?.from[0]).toBe(100);
  expect(lines.find(line => line.id === 'short-service-top')?.from[1]).toBeCloseTo(194.4);
  expect(lines.some(line => line.id === 'net')).toBe(false);
});

it('does not draw guides from an invalid or out-of-frame homography', () => {
  expect(projectCourtMarkings([[1, 0, 0], [0, 1, 0]], 1000, 500)).toEqual([]);
  expect(projectCourtMarkings([[1, 0, NaN], [0, 1, 0], [0, 0, 1]], 1000, 500)).toEqual([]);
  expect(projectCourtMarkings([[1000, 0, 0], [0, 1000, 0], [0, 0, 1]], 1000, 500)).toEqual([]);
});

it('previews all painted court lines from four manually selected outer corners', () => {
  const corners: [number, number][] = [[100, 100], [710, 100], [710, 368], [100, 368]];
  const lines = projectCourtMarkingsFromCorners(corners, 1000, 500);

  expect(lines).toHaveLength(8);
  expect(lines.find(line => line.id === 'singles-left')?.from[0]).toBeCloseTo(146);
  expect(lines.find(line => line.id === 'short-service-top')?.from[1]).toBeCloseTo(194.4);
  expect(lines.some(line => line.id === 'net')).toBe(false);
});

it('projects a separate net plane guide from calibrated court dimensions', () => {
  const guide = projectCourtNetGuide([[100, 0, 100], [0, 20, 100], [0, 0, 1]], 1000, 500);
  expect(guide).toHaveLength(1);
  expect(guide[0].id).toBe('net-guide');
  expect(guide[0].from[1]).toBeCloseTo(234);
  expect(guide[0].to[1]).toBeCloseTo(234);
});

it('previews the net guidance line separately from painted floor markings', () => {
  const corners: [number, number][] = [[100, 100], [710, 100], [710, 368], [100, 368]];
  const guide = projectCourtNetGuideFromCorners(corners, 1000, 500);

  expect(guide).toHaveLength(1);
  expect(guide[0].id).toBe('net-guide');
  expect(guide[0].from[1]).toBeCloseTo(234);
  expect(guide[0].to[1]).toBeCloseTo(234);
});
