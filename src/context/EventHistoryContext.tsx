import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Action, EventRow } from '../types';
import { readLegacyLocalStorageJson } from '../utils/legacyStorage';

/**
 * Normalizes legacy event arrays (numeric IDs, duplicate IDs, missing sportType, or text-only actions).
 */
export function normalizeMigratedEvents(rawEvents: unknown): EventRow[] {
  if (!Array.isArray(rawEvents)) {
    return [];
  }

  const seenIds = new Set<string>();
  return (rawEvents as EventRow[]).map((row, index) => {
    const newRow = { ...row };

    if (!newRow.id) {
      newRow.id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`;
    } else if (/^\d+$/.test(String(newRow.id)) || seenIds.has(String(newRow.id))) {
      newRow.id = `${newRow.id}-${index}-${Math.random().toString(36).slice(2, 11)}`;
    }
    seenIds.add(String(newRow.id));

    if (!newRow.sportType) {
      newRow.sportType = 'volleyball';
    }

    if (newRow.actions) {
      const seenActionIds = new Set<string>();
      newRow.actions = newRow.actions.map((act, actionIndex) => {
        const newAct = { ...act };
        if (!newAct.id) {
          newAct.id = `${Date.now()}-${index}-${actionIndex}-${Math.random().toString(36).slice(2, 11)}`;
        } else if (/^\d+$/.test(String(newAct.id)) || seenActionIds.has(String(newAct.id))) {
          newAct.id = `${newAct.id}-${actionIndex}-${Math.random().toString(36).slice(2, 11)}`;
        }
        seenActionIds.add(String(newAct.id));
        return newAct;
      });
    } else {
      newRow.actions = [];
      if (newRow.eventText) {
        const parts = newRow.eventText.split(' / ').map(part => part.trim()).filter(Boolean);
        const actions: Action[] = [];

        for (let i = 0; i + 3 < parts.length; i += 4) {
          let resultCode = parts[i + 3];
          if (!['Yes', 'Out', 'Pass', '0', '+1', '-1'].includes(resultCode)) {
            continue;
          }

          if (resultCode === '+1') resultCode = 'Yes';
          else if (resultCode === '-1') resultCode = 'Out';
          else if (resultCode === '0') resultCode = 'Pass';

          actions.push({
            id: `${Date.now()}-${index}-${i}-${Math.random().toString(36).slice(2, 11)}`,
            teamCode: parts[i],
            skillCode: parts[i + 1],
            areaCode: parts[i + 2],
            resultCode,
          });
        }
        newRow.actions = actions;
      }
    }

    return newRow;
  });
}

export interface EventHistoryContextType {
  events: EventRow[];
  setEvents: React.Dispatch<React.SetStateAction<EventRow[]>>;
  eventsRef: React.MutableRefObject<EventRow[]>;
  saveEventsWithHistory: (updater: React.SetStateAction<EventRow[]>) => void;
  clearEventHistory: () => void;
  canUndoEventAction: boolean;
  canRedoEventAction: boolean;
  undoEventAction: () => void;
  redoEventAction: () => void;
  deleteEventRow: (id: string) => void;
  updateEventRow: (id: string, updatedRow: EventRow) => void;
  toggleEventBookmark: (id: string) => void;
  updateEventBookmarkNote: (id: string, note: string) => void;
  editingEvent: EventRow | null;
  setEditingEvent: React.Dispatch<React.SetStateAction<EventRow | null>>;
}

const EventHistoryContext = createContext<EventHistoryContextType | undefined>(undefined);

/**
 * Manages recorded events, undo/redo history stacks, bookmark state, and row editing.
 * Reads legacy `scout_events` at startup for IndexedDB recovery, never writing events back to localStorage.
 */
export function EventHistoryProvider({ children }: { children: ReactNode }) {
  const [events, setEventsState] = useState<EventRow[]>(() =>
    normalizeMigratedEvents(readLegacyLocalStorageJson<unknown>('scout_events', [])),
  );
  const eventsRef = useRef<EventRow[]>(events);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const setEvents: React.Dispatch<React.SetStateAction<EventRow[]>> = useCallback((updaterOrValue) => {
    if (typeof updaterOrValue === 'function') {
      const next = updaterOrValue(eventsRef.current);
      eventsRef.current = next;
      setEventsState(next);
      return;
    }
    eventsRef.current = updaterOrValue;
    setEventsState(updaterOrValue);
  }, []);

  const [pastEvents, setPastEvents] = useState<EventRow[][]>([]);
  const [futureEvents, setFutureEvents] = useState<EventRow[][]>([]);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const canUndoEventAction = pastEvents.length > 0;
  const canRedoEventAction = futureEvents.length > 0;

  const undoEventAction = useCallback(() => {
    if (pastEvents.length === 0) return;
    const previous = pastEvents[pastEvents.length - 1];
    setPastEvents(prev => prev.slice(0, -1));
    setFutureEvents(prev => [events, ...prev]);
    setEvents(previous);
  }, [pastEvents, events, setEvents]);

  const redoEventAction = useCallback(() => {
    if (futureEvents.length === 0) return;
    const next = futureEvents[0];
    setFutureEvents(prev => prev.slice(1));
    setPastEvents(prev => [...prev, events]);
    setEvents(next);
  }, [futureEvents, events, setEvents]);

  const clearEventHistory = useCallback(() => {
    setPastEvents([]);
    setFutureEvents([]);
  }, []);

  const saveEventsWithHistory = useCallback((newEventsUpdater: React.SetStateAction<EventRow[]>) => {
    const prev = eventsRef.current;
    const next = typeof newEventsUpdater === 'function' ? newEventsUpdater(prev) : newEventsUpdater;
    const renumbered = next.map((row: EventRow, index: number) => ({ ...row, no: index + 1 }));
    setPastEvents(stack => [...stack, prev].slice(-20));
    setFutureEvents([]);
    setEvents(renumbered);
  }, [setEvents]);

  const deleteEventRow = useCallback((id: string) => {
    saveEventsWithHistory(prev => prev.filter(row => row.id !== id));
  }, [saveEventsWithHistory]);

  const updateEventRow = useCallback((id: string, updatedRow: EventRow) => {
    saveEventsWithHistory(prev => prev.map(row => (row.id === id ? updatedRow : row)));
  }, [saveEventsWithHistory]);

  const toggleEventBookmark = useCallback((id: string) => {
    saveEventsWithHistory(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        if (row.isBookmarked) {
          const { isBookmarked, bookmarkNote, bookmarkedAt, ...rest } = row;
          void isBookmarked;
          void bookmarkNote;
          void bookmarkedAt;
          return rest;
        }
        return {
          ...row,
          isBookmarked: true,
          bookmarkedAt: new Date().toISOString(),
        };
      }),
    );
  }, [saveEventsWithHistory]);

  const updateEventBookmarkNote = useCallback((id: string, note: string) => {
    saveEventsWithHistory(prev =>
      prev.map(row =>
        row.id === id
          ? {
              ...row,
              isBookmarked: true,
              bookmarkNote: note,
              bookmarkedAt: row.bookmarkedAt || new Date().toISOString(),
            }
          : row,
      ),
    );
  }, [saveEventsWithHistory]);

  return (
    <EventHistoryContext.Provider
      value={{
        events,
        setEvents,
        eventsRef,
        saveEventsWithHistory,
        clearEventHistory,
        canUndoEventAction,
        canRedoEventAction,
        undoEventAction,
        redoEventAction,
        deleteEventRow,
        updateEventRow,
        toggleEventBookmark,
        updateEventBookmarkNote,
        editingEvent,
        setEditingEvent,
      }}
    >
      {children}
    </EventHistoryContext.Provider>
  );
}

export function useEventHistory(): EventHistoryContextType {
  const ctx = useContext(EventHistoryContext);
  if (!ctx) {
    throw new Error('useEventHistory must be used within EventHistoryProvider');
  }
  return ctx;
}
