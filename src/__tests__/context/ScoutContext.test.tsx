import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScoutProvider, useScoutContext } from '../../context/ScoutContext';

type ScoutHandle = ReturnType<typeof useScoutContext>;

function Harness({ onReady }: { onReady: (ctx: ScoutHandle) => void }) {
  const ctx = useScoutContext();
  React.useEffect(() => {
    onReady(ctx);
  }, [ctx, onReady]);
  return null;
}

describe('ScoutContext StrictMode pure state updates', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('appends exactly one input history item per selectFoul / clearFoul / commitSkillSelection in React.StrictMode', () => {
    let latestCtx: ScoutHandle | null = null;
    render(
      <React.StrictMode>
        <ScoutProvider>
          <Harness onReady={(ctx) => { latestCtx = ctx; }} />
        </ScoutProvider>
      </React.StrictMode>,
    );

    expect(latestCtx).not.toBeNull();

    act(() => {
      latestCtx!.commitSkillSelection({ skillCode: 'SV' });
    });
    expect(latestCtx!.currentAction.skillCode).toBe('SV');
    expect(latestCtx!.currentInputHistory).toHaveLength(1);
    expect(latestCtx!.currentInputHistory[0]).toMatchObject({ type: 'field', category: 'skillCode', value: 'SV' });

    act(() => {
      latestCtx!.selectFoul({ code: 'NET_TOUCH', label: 'Net Touch', labelTh: 'แตะเน็ต', role: 'violation', severity: 'normal' });
    });
    expect(latestCtx!.currentAction.foulCode).toBe('NET_TOUCH');
    expect(latestCtx!.currentInputHistory).toHaveLength(2);
    expect(latestCtx!.currentInputHistory[1]).toMatchObject({ type: 'field', category: 'foulCode', value: 'NET_TOUCH' });

    act(() => {
      latestCtx!.clearFoul();
    });
    expect(latestCtx!.currentAction.foulCode).toBeUndefined();
    expect(latestCtx!.currentInputHistory).toHaveLength(3);
    expect(latestCtx!.currentInputHistory[2]).toMatchObject({
      type: 'field',
      category: 'foulCode',
      previousValue: 'NET_TOUCH',
      value: undefined,
    });

    act(() => {
      latestCtx!.undoLastAction();
    });
    expect(latestCtx!.currentAction.foulCode).toBe('NET_TOUCH');
    expect(latestCtx!.currentInputHistory).toHaveLength(2);
  });
});
