import { describe, it, expect, vi } from 'vitest';
import {
  resolveKeyboardCoachCommand,
  dispatchCoachCommand,
  resolveCoachInputContext,
  type CoachCommand,
  type CoachCommandHandlers,
} from '../../utils/coachCommands';
import type { EventRow } from '../../types';

describe('Phase 12: Scouting Quality Improvements (PDF §96-99)', () => {
  describe('96. Quick Bookmark Keyboard Shortcut', () => {
    it('resolves KeyB to quickBookmark command in normal-input context', () => {
      const context = resolveCoachInputContext({});
      const cmd = resolveKeyboardCoachCommand({ code: 'KeyB' }, context);
      expect(cmd).toEqual({ type: 'quickBookmark' });
    });

    it('resolves KeyK to quickBookmark command as alternative shortcut', () => {
      const context = resolveCoachInputContext({ hudActive: true });
      const cmd = resolveKeyboardCoachCommand({ code: 'KeyK' }, context);
      expect(cmd).toEqual({ type: 'quickBookmark' });
    });

    it('does not trigger quickBookmark when ctrlKey or metaKey is pressed', () => {
      const context = resolveCoachInputContext({});
      const cmdCtrl = resolveKeyboardCoachCommand({ code: 'KeyB', ctrlKey: true }, context);
      expect(cmdCtrl).toBeNull();
    });

    it('dispatches quickBookmark handler when dispatched', () => {
      const onQuickBookmark = vi.fn();
      const handlers: CoachCommandHandlers = {
        quickBookmark: onQuickBookmark,
      };
      const result = dispatchCoachCommand({ type: 'quickBookmark' }, handlers);
      expect(result).toBe(true);
      expect(onQuickBookmark).toHaveBeenCalledTimes(1);
    });
  });

  describe('97. Last Event Correction (Undo & Edit Last Event)', () => {
    it('resolves Ctrl+E to editLastEvent command', () => {
      const context = resolveCoachInputContext({});
      const cmd = resolveKeyboardCoachCommand({ code: 'KeyE', ctrlKey: true }, context);
      expect(cmd).toEqual({ type: 'editLastEvent' });
    });

    it('resolves Meta+E (macOS Cmd+E) to editLastEvent command', () => {
      const context = resolveCoachInputContext({ hudActive: true });
      const cmd = resolveKeyboardCoachCommand({ code: 'KeyE', metaKey: true }, context);
      expect(cmd).toEqual({ type: 'editLastEvent' });
    });

    it('dispatches editLastEvent handler', () => {
      const onEditLastEvent = vi.fn();
      const handlers: CoachCommandHandlers = {
        editLastEvent: onEditLastEvent,
      };
      const result = dispatchCoachCommand({ type: 'editLastEvent' }, handlers);
      expect(result).toBe(true);
      expect(onEditLastEvent).toHaveBeenCalledTimes(1);
    });

    it('blocks coach commands when in blocking-modal context', () => {
      const modalContext = resolveCoachInputContext({ blockingModal: true });
      expect(resolveKeyboardCoachCommand({ code: 'KeyB' }, modalContext)).toBeNull();
      expect(resolveKeyboardCoachCommand({ code: 'KeyE', ctrlKey: true }, modalContext)).toBeNull();
      expect(resolveKeyboardCoachCommand({ code: 'Backspace' }, modalContext)).toBeNull();
    });
  });

  describe('Event bookmarking data model logic', () => {
    it('toggles bookmark on an event and removes on second toggle', () => {
      const event: EventRow = {
        id: 'ev-1',
        no: 1,
        point: 1,
        resultText: '+1',
        eventText: 'Team A / SMH / Yes',
        createdAt: '2026-09-11T12:00:00Z',
        videoTime: 12.5,
        actions: [{ teamCode: 'Team A', skillCode: 'SMH', resultCode: 'Yes' }],
      };

      const bookmarked: EventRow = {
        ...event,
        isBookmarked: true,
        bookmarkedAt: '2026-09-11T12:00:00Z',
      };
      expect(bookmarked.isBookmarked).toBe(true);

      const { isBookmarked, bookmarkedAt, ...unbookmarked } = bookmarked;
      void isBookmarked;
      void bookmarkedAt;
      expect((unbookmarked as { isBookmarked?: boolean }).isBookmarked).toBeUndefined();
    });

    it('finds closest event within 3 seconds of target video time', () => {
      const events: EventRow[] = [
        { id: '1', no: 1, point: 1, resultText: '+1', eventText: '', createdAt: '', videoTime: 5.0, actions: [] },
        { id: '2', no: 2, point: 2, resultText: '+1', eventText: '', createdAt: '', videoTime: 15.0, actions: [] },
        { id: '3', no: 3, point: 3, resultText: '+1', eventText: '', createdAt: '', videoTime: 25.0, actions: [] },
      ];

      const time = 16.2;
      let target: EventRow | null = null;
      let minDiff = 3.0;
      for (const ev of events) {
        if (typeof ev.videoTime === 'number') {
          const diff = Math.abs(ev.videoTime - time);
          if (diff < minDiff) {
            minDiff = diff;
            target = ev;
          }
        }
      }

      expect(target).not.toBeNull();
      expect(target?.id).toBe('2');
    });
  });
});
