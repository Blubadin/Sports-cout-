import { describe, it, expect } from 'vitest';
import { 
  getPitchZoneFromPoint, 
  calculatePossessionSequenceLines, 
  getCornerKickCoordinate, 
  getGoalKickCoordinate,
  FootballAction
} from '../../football/footballDomain';

describe('Football Domain', () => {
  describe('getPitchZoneFromPoint', () => {
    it('maps {x:0.1, y:0.1} to Left Flank Defensive', () => {
      const zone = getPitchZoneFromPoint({ x: 0.1, y: 0.1 });
      expect(zone.name).toBe('Left Flank Defensive');
      expect(zone.id).toBe('defensive-left-flank');
    });

    it('maps {x:0.5, y:0.5} to Center Middle', () => {
      const zone = getPitchZoneFromPoint({ x: 0.5, y: 0.5 });
      expect(zone.name).toBe('Center Middle');
      expect(zone.id).toBe('middle-center');
    });

    it('maps {x:0.9, y:0.9} to Right Flank Attacking', () => {
      const zone = getPitchZoneFromPoint({ x: 0.9, y: 0.9 });
      expect(zone.name).toBe('Right Flank Attacking');
    });
  });

  describe('calculatePossessionSequenceLines', () => {
    it('returns lines for Pass and Dribble actions with coordinates', () => {
      const actions: FootballAction[] = [
        { id: '1', type: 'Pass', startCoord: { x: 0.1, y: 0.1 }, endCoord: { x: 0.3, y: 0.3 }, teamId: 'A' },
        { id: '2', type: 'Dribble', startCoord: { x: 0.3, y: 0.3 }, endCoord: { x: 0.5, y: 0.5 }, teamId: 'A' },
        { id: '3', type: 'Shot', startCoord: { x: 0.5, y: 0.5 }, teamId: 'A' }
      ];
      
      const lines = calculatePossessionSequenceLines(actions);
      expect(lines.length).toBe(2);
      expect(lines[0].start).toEqual({ x: 0.1, y: 0.1 });
      expect(lines[1].type).toBe('Dribble');
    });

    it('ignores actions without both start and end coords', () => {
      const actions: FootballAction[] = [
        { id: '1', type: 'Pass', startCoord: { x: 0.1, y: 0.1 }, teamId: 'A' }
      ];
      const lines = calculatePossessionSequenceLines(actions);
      expect(lines.length).toBe(0);
    });
  });

  describe('corner/goal kick coordinates', () => {
    it('returns explicit coordinate for top-left corner kick', () => {
      const coord = getCornerKickCoordinate('top-left');
      expect(coord).toEqual({ x: 0, y: 0 });
    });

    it('returns explicit coordinate for left goal kick', () => {
      const coord = getGoalKickCoordinate('left');
      expect(coord.x).toBeCloseTo(0.05);
      expect(coord.y).toBeCloseTo(0.5);
    });
  });
});
