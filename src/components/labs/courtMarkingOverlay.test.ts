import { expect, it } from 'vitest';
import { projectCourtMarkings } from './courtMarkingOverlay';

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
