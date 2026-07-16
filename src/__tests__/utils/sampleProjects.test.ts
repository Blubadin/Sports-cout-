import { describe, expect, it } from 'vitest';
import { createPilotSampleProjects } from '../../utils/sampleProjects';

describe('pilot sample projects', () => {
  it('creates a valid, independent sample for all four supported sports', () => {
    const projects = createPilotSampleProjects();
    expect(projects.map((project) => project.sportType)).toEqual([
      'volleyball', 'football', 'badminton', 'basketball',
    ]);
    expect(projects.every((project) => project.events.length >= 5)).toBe(true);
    expect(new Set(projects.flatMap((project) => project.events.map((event) => event.id))).size)
      .toBe(projects.reduce((total, project) => total + project.events.length, 0));
  });
});
