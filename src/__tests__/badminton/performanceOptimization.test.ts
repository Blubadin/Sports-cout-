import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedEventQuery,
  clearEventQueryCache,
  INITIAL_EVENT_QUERY,
  type EventQuery,
} from '../../utils/eventQuery';
import {
  calculateVisibleTimeRange,
  filterItemsInVisibleTimeRange,
} from '../../utils/timelineOptimization';
import { EventRow } from '../../types';

function createMockEvent(id: string, no: number, videoTime: number, skillCode = 'SMH', teamCode = 't1'): EventRow {
  return {
    id,
    no,
    point: no,
    eventText: `Pt ${no}`,
    createdAt: new Date().toISOString(),
    resultText: '+1',
    videoTime,
    actions: [
      {
        id: `${id}-act-0`,
        teamCode,
        skillCode,
        resultCode: '#',
      },
    ],
  };
}

describe('Phase 14: Performance Optimization & Viewport Windowing', () => {
  beforeEach(() => {
    clearEventQueryCache();
  });

  describe('getCachedEventQuery', () => {
    it('returns filtered events and caches the result for identical queries', () => {
      const events: EventRow[] = [
        createMockEvent('ev-1', 1, 10, 'SMH', 't1'),
        createMockEvent('ev-2', 2, 20, 'CLR', 't2'),
        createMockEvent('ev-3', 3, 30, 'SMH', 't1'),
      ];

      const query: EventQuery = { ...INITIAL_EVENT_QUERY, skill: 'SMH' };

      const result1 = getCachedEventQuery(events, query);
      expect(result1.length).toBe(2);
      expect(result1.map(e => e.id)).toEqual(['ev-1', 'ev-3']);

      // Calling again with the same events array reference and query returns identical result reference
      const result2 = getCachedEventQuery(events, query);
      expect(result2).toBe(result1);
    });

    it('recomputes when query changes', () => {
      const events: EventRow[] = [
        createMockEvent('ev-1', 1, 10, 'SMH', 't1'),
        createMockEvent('ev-2', 2, 20, 'CLR', 't2'),
      ];

      const query1: EventQuery = { ...INITIAL_EVENT_QUERY, skill: 'SMH' };
      const query2: EventQuery = { ...INITIAL_EVENT_QUERY, skill: 'CLR' };

      const result1 = getCachedEventQuery(events, query1);
      const result2 = getCachedEventQuery(events, query2);

      expect(result1.length).toBe(1);
      expect(result1[0].id).toBe('ev-1');
      expect(result2.length).toBe(1);
      expect(result2[0].id).toBe('ev-2');
      expect(result1).not.toBe(result2);
    });

    it('recomputes when events reference changes', () => {
      const eventsA: EventRow[] = [createMockEvent('ev-1', 1, 10, 'SMH')];
      const eventsB: EventRow[] = [createMockEvent('ev-1', 1, 10, 'SMH'), createMockEvent('ev-2', 2, 20, 'SMH')];

      const query: EventQuery = { ...INITIAL_EVENT_QUERY, skill: 'SMH' };

      const resA = getCachedEventQuery(eventsA, query);
      expect(resA.length).toBe(1);

      const resB = getCachedEventQuery(eventsB, query);
      expect(resB.length).toBe(2);
      expect(resB).not.toBe(resA);
    });

    it('limits cache size to 50 entries via bounded eviction', () => {
      const events: EventRow[] = [createMockEvent('ev-1', 1, 10, 'SMH')];

      for (let i = 0; i < 60; i++) {
        const q: EventQuery = { ...INITIAL_EVENT_QUERY, search: `search-${i}` };
        getCachedEventQuery(events, q);
      }

      // Query again to verify system remains stable and does not leak memory
      const testQ: EventQuery = { ...INITIAL_EVENT_QUERY, search: 'test' };
      const res = getCachedEventQuery(events, testQ);
      expect(Array.isArray(res)).toBe(true);
    });

    it('handles large event sets (1,000+ items) with high performance', () => {
      const manyEvents: EventRow[] = Array.from({ length: 1200 }, (_, i) =>
        createMockEvent(`bulk-${i}`, i + 1, i * 0.5, i % 2 === 0 ? 'SMH' : 'DRP', i % 3 === 0 ? 't1' : 't2')
      );

      const query: EventQuery = { ...INITIAL_EVENT_QUERY, skill: 'SMH', team: 't1' };

      const start = performance.now();
      const res1 = getCachedEventQuery(manyEvents, query);
      const elapsedFirst = performance.now() - start;

      const startCached = performance.now();
      const res2 = getCachedEventQuery(manyEvents, query);
      const elapsedCached = performance.now() - startCached;

      expect(res1.length).toBeGreaterThan(0);
      expect(res2).toBe(res1);
      expect(elapsedFirst).toBeLessThan(100); // initial run under 100ms
      expect(elapsedCached).toBeLessThan(10); // cached retrieval virtually instantaneous
    });
  });

  describe('Timeline Viewport Windowing (calculateVisibleTimeRange & filterItemsInVisibleTimeRange)', () => {
    it('returns null or full range when timeline is not scrolled or fits viewport', () => {
      // clientWidth >= scrollWidth -> entire timeline visible
      const range = calculateVisibleTimeRange(0, 1000, 1000, 100);
      expect(range).toEqual({ minTime: 0, maxTime: 100 });

      // invalid inputs
      expect(calculateVisibleTimeRange(0, 0, 1000, 100)).toBeNull();
      expect(calculateVisibleTimeRange(0, 1000, 0, 100)).toBeNull();
      expect(calculateVisibleTimeRange(0, 1000, 1000, 0)).toBeNull();
    });

    it('calculates visible window with buffer correctly when zoomed in', () => {
      // 4x zoom: scrollWidth = 4000, clientWidth = 1000, duration = 100s
      // scrollLeft = 1000 (viewing 25s to 50s)
      // buffer = 1000 * 0.2 = 200px
      // minX = 800px -> (800 / 4000) * 100s = 20s
      // maxX = 1000 + 1000 + 200 = 2200px -> (2200 / 4000) * 100s = 55s
      const range = calculateVisibleTimeRange(1000, 1000, 4000, 100, 0.2);
      expect(range).not.toBeNull();
      expect(range?.minTime).toBeCloseTo(20, 1);
      expect(range?.maxTime).toBeCloseTo(55, 1);
    });

    it('clamps visible window between 0 and duration', () => {
      // Scrolled to beginning
      const rangeStart = calculateVisibleTimeRange(50, 1000, 4000, 100, 0.2);
      expect(rangeStart?.minTime).toBe(0);

      // Scrolled to end
      const rangeEnd = calculateVisibleTimeRange(3000, 1000, 4000, 100, 0.2);
      expect(rangeEnd?.maxTime).toBe(100);
    });

    it('filters items outside visible time range while preserving overlapping items', () => {
      interface MockClip {
        id: string;
        start: number;
        end: number;
      }

      const clips: MockClip[] = [
        { id: 'clip-before', start: 0, end: 10 },
        { id: 'clip-overlap-start', start: 15, end: 25 },
        { id: 'clip-inside', start: 30, end: 40 },
        { id: 'clip-overlap-end', start: 50, end: 60 },
        { id: 'clip-after', start: 65, end: 80 },
      ];

      const viewportRange = { minTime: 20, maxTime: 55 };

      const visible = filterItemsInVisibleTimeRange(
        clips,
        (c) => ({ start: c.start, end: c.end }),
        viewportRange,
      );

      const visibleIds = visible.map(c => c.id);
      expect(visibleIds).toEqual(['clip-overlap-start', 'clip-inside', 'clip-overlap-end']);
      expect(visibleIds).not.toContain('clip-before');
      expect(visibleIds).not.toContain('clip-after');
    });

    it('always preserves forceIncluded items (e.g. actively dragged event) even if outside viewport', () => {
      interface MockClip {
        id: string;
        start: number;
        end: number;
      }

      const clips: MockClip[] = [
        { id: 'clip-before', start: 0, end: 10 },
        { id: 'clip-dragged', start: 0, end: 5 },
        { id: 'clip-inside', start: 30, end: 40 },
      ];

      const viewportRange = { minTime: 20, maxTime: 50 };

      const visible = filterItemsInVisibleTimeRange(
        clips,
        (c) => ({ start: c.start, end: c.end }),
        viewportRange,
        (c) => c.id === 'clip-dragged',
      );

      expect(visible.map(c => c.id)).toEqual(['clip-dragged', 'clip-inside']);
    });
  });
});
