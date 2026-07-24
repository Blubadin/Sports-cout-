import { describe, expect, it } from 'vitest';
import { decodeAction, decodeEventRow } from '../../utils/eventDecoder';
import { Action, EventRow } from '../../types';

describe('eventDecoder', () => {
  describe('decodeAction', () => {
    it('accepts valid Action unchanged', () => {
      const input = {
        id: 'action-1',
        teamCode: 'A',
        skillCode: 'SERVE',
        resultCode: 'Yes',
        pointX: 0.5,
        pointY: 0.5,
        videoTime: 10,
        outcomeStatus: 'success',
        actionCategory: 'attack',
      };
      const { action, status, warnings } = decodeAction(input);
      expect(status).toBe('accepted');
      expect(warnings.length).toBe(0);
      expect(action).toMatchObject(input);
    });

    it('repairs missing id', () => {
      const input = { teamCode: 'A' };
      const { action, status, warnings } = decodeAction(input);
      expect(status).toBe('repaired');
      expect(action.id).toBeDefined();
      expect(warnings).toContain('Generated missing action ID');
    });

    it('rejects completely invalid input', () => {
      const { status } = decodeAction(null);
      expect(status).toBe('rejected');
    });

    it('keeps legacy Unknown result', () => {
      const input = { id: 'action-1', resultCode: 'Unknown' };
      const { action, status } = decodeAction(input);
      expect(status).toBe('accepted');
      expect(action.resultCode).toBe('Unknown');
    });

    it('strips unknown fields', () => {
      const input = { id: 'action-1', extraField: 'invalid' };
      const { action, status } = decodeAction(input);
      expect(status).toBe('accepted'); // Extra fields are just ignored, doesn't cause repair
      expect((action as any).extraField).toBeUndefined();
    });

    it('clamps numeric values', () => {
      const input = { id: 'action-1', scoreDelta: 100, pointX: 1.5, videoTime: -5 };
      const { action, status, warnings } = decodeAction(input);
      expect(status).toBe('repaired');
      expect(action.scoreDelta).toBe(99);
      expect(action.pointX).toBe(1);
      expect(action.videoTime).toBe(0);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('decodes domain payloads correctly', () => {
      const input = {
        id: 'action-1',
        domainPayload: {
          type: 'volleyball',
          rotation: 7, // invalid, should be clamped to 6
          server: 'teamA'
        }
      };
      const { action, status } = decodeAction(input);
      expect(status).toBe('repaired');
      expect(action.domainPayload).toEqual({ type: 'volleyball', rotation: 6, server: 'teamA' });
    });
  });

  describe('decodeEventRow', () => {
    it('accepts valid EventRow unchanged', () => {
      const input = {
        id: 'event-1',
        no: 1,
        point: 1,
        eventText: 'text',
        resultText: '+1',
        sportType: 'volleyball',
        createdAt: '2023-01-01T00:00:00.000Z',
        actions: [],
      };
      const { event, status, warnings } = decodeEventRow(input);
      expect(status).toBe('accepted');
      expect(warnings.length).toBe(0);
      expect(event).toMatchObject(input);
    });

    it('repairs missing actions', () => {
      const input = { id: 'event-1', no: 1, point: 1, eventText: 'text' };
      const { event, status } = decodeEventRow(input);
      expect(status).toBe('repaired');
      expect(event.actions).toEqual([]);
    });

    it('repairs invalid resultText', () => {
      const input = { id: 'event-1', eventText: 'text', resultText: 'invalid', actions: [] };
      const { event, status } = decodeEventRow(input);
      expect(status).toBe('repaired');
      expect(event.resultText).toBe('0');
    });

    it('rejects missing core properties', () => {
      const input = { extra: 'stuff' };
      const { status } = decodeEventRow(input);
      expect(status).toBe('rejected');
    });
  });
});
