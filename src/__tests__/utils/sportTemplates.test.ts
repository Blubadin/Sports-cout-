import { describe, it, expect } from 'vitest';
import { SPORT_TEMPLATES } from '../../sports';
import type { SportType } from '../../types';

const ALL_SPORT_TYPES: SportType[] = ['volleyball', 'football', 'badminton', 'basketball'];

describe('Sport Templates Validation', () => {
  it('should have all 4 sport types defined', () => {
    ALL_SPORT_TYPES.forEach((sport) => {
      expect(SPORT_TEMPLATES[sport]).toBeDefined();
    });
  });

  describe.each(ALL_SPORT_TYPES)('Template for %s', (sportType) => {
    const template = SPORT_TEMPLATES[sportType];

    it('should have required metadata fields', () => {
      expect(template.id).toBe(sportType);
      expect(template.name).toBeTruthy();
      expect(template.thaiName).toBeTruthy();
    });

    it('should have at least 1 skill', () => {
      expect(template.skills.length).toBeGreaterThan(0);
    });

    it('should have unique skill codes', () => {
      const codes = template.skills.map((s) => s.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('should have skills with both name and thaiName', () => {
      template.skills.forEach((skill) => {
        expect(skill.code).toBeTruthy();
        expect(skill.name).toBeTruthy();
        expect(skill.thaiName).toBeTruthy();
      });
    });

    it('should have at least 1 area', () => {
      expect(template.areas.length).toBeGreaterThan(0);
    });

    it('should have unique area codes', () => {
      const codes = template.areas.map((a) => a.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('should have results defined', () => {
      expect(template.results).toBeDefined();
      expect(template.results.length).toBeGreaterThan(0);
    });

    it('should have unique result codes', () => {
      const codes = template.results.map((r) => r.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('should have the standard result codes (Yes, Out, Pass)', () => {
      const codes = template.results.map((r) => r.code);
      expect(codes).toContain('Yes');
      expect(codes).toContain('Out');
      expect(codes).toContain('Pass');
    });

    it('should have area layouts defined', () => {
      expect(template.areaLayouts).toBeDefined();
      expect(template.areaLayouts.normal).toBeDefined();
    });

    if (template.fouls && template.fouls.length > 0) {
      it('should have unique foul codes', () => {
        const codes = template.fouls!.map((f) => f.code);
        expect(new Set(codes).size).toBe(codes.length);
      });

      it('should have fouls with labels', () => {
        template.fouls!.forEach((foul) => {
          expect(foul.code).toBeTruthy();
          expect(foul.label).toBeTruthy();
        });
      });
    }
  });
});
