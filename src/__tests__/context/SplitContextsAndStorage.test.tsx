import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ScoutProvider,
  useActionDraft,
  useEventHistory,
  useScoutContext,
  useVideoTime,
} from '../../context/ScoutContext';

type ScoutHandle = ReturnType<typeof useScoutContext>;
type VideoHandle = ReturnType<typeof useVideoTime>;
type EventHistoryHandle = ReturnType<typeof useEventHistory>;
type ActionDraftHandle = ReturnType<typeof useActionDraft>;

function SplitHarness({
  onReady,
}: {
  onReady: (handles: {
    scout: ScoutHandle;
    video: VideoHandle;
    history: EventHistoryHandle;
    draft: ActionDraftHandle;
  }) => void;
}) {
  const scout = useScoutContext();
  const video = useVideoTime();
  const history = useEventHistory();
  const draft = useActionDraft();

  React.useEffect(() => {
    onReady({ scout, video, history, draft });
  }, [scout, video, history, draft, onReady]);

  return null;
}

describe('Incremental core state split and IndexedDB storage clarity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('exposes VideoTime, EventHistory, and ActionDraft hooks while keeping useScoutContext facade synchronized', () => {
    let handles: {
      scout: ScoutHandle;
      video: VideoHandle;
      history: EventHistoryHandle;
      draft: ActionDraftHandle;
    } | null = null;

    render(
      <ScoutProvider>
        <SplitHarness onReady={(next) => { handles = next; }} />
      </ScoutProvider>,
    );

    expect(handles).not.toBeNull();

    act(() => {
      handles!.video.setVideoTime(42.5);
    });
    expect(handles!.scout.videoTime).toBe(42.5);
    expect(handles!.video.getCurrentTimeRef.current()).toBe(42.5);

    act(() => {
      handles!.draft.updateActionPatch({
        teamCode: 'THA',
        skillCode: 'SV',
        areaCode: '1',
        resultCode: 'Yes',
      });
    });
    expect(handles!.scout.currentAction.skillCode).toBe('SV');

    act(() => {
      handles!.scout.saveEvent();
    });
    expect(handles!.history.events).toHaveLength(1);
    expect(handles!.scout.events).toHaveLength(1);
    expect(handles!.history.canUndoEventAction).toBe(true);

    act(() => {
      handles!.history.undoEventAction();
    });
    expect(handles!.scout.events).toHaveLength(0);
    expect(handles!.history.canRedoEventAction).toBe(true);

    act(() => {
      handles!.history.redoEventAction();
    });
    expect(handles!.scout.events).toHaveLength(1);
  });

  it('persists only scout_settings in localStorage without continuously writing events, matchInfo, or teams', () => {
    window.localStorage.setItem('scout_events', JSON.stringify([{ id: '1', no: 1, point: 1, eventText: 'THA / SV / 1 / Yes', resultText: '+1' }]));

    let handles: {
      scout: ScoutHandle;
      video: VideoHandle;
      history: EventHistoryHandle;
      draft: ActionDraftHandle;
    } | null = null;

    render(
      <ScoutProvider>
        <SplitHarness onReady={(next) => { handles = next; }} />
      </ScoutProvider>,
    );

    // One-time startup recovery migrates legacy numeric IDs in memory without re-writing scout_events.
    expect(handles!.scout.events).toHaveLength(1);
    expect(handles!.scout.events[0].id).not.toBe('1');
    expect(handles!.scout.events[0].actions).toHaveLength(1);
    expect(window.localStorage.getItem('scout_teams')).toBeNull();
    expect(window.localStorage.getItem('scout_match_info')).toBeNull();

    act(() => {
      handles!.scout.saveEventsWithHistory([]);
      handles!.scout.setTeams([{ id: 't1', code: 'A', name: 'Alpha', thaiName: 'เอ', teamType: 'club' }]);
      handles!.scout.setMatchInfo(prev => ({ ...prev, currentPoint: 9 }));
    });

    // Neither events, teams, nor matchInfo write back to localStorage.
    expect(JSON.parse(window.localStorage.getItem('scout_events') || '[]')).toHaveLength(1);
    expect(window.localStorage.getItem('scout_teams')).toBeNull();
    expect(window.localStorage.getItem('scout_match_info')).toBeNull();

    // Settings continue persisting to localStorage.
    act(() => {
      handles!.scout.setSettings(prev => ({ ...prev, uiLanguage: 'en' }));
    });
    expect(JSON.parse(window.localStorage.getItem('scout_settings') || '{}').uiLanguage).toBe('en');
  });
});
