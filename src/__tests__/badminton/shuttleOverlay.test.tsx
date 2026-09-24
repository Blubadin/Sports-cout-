import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShuttleOverlay, ShuttleControls, ShuttleDiagnostics } from '../../components/labs/ShuttleOverlay';
import type { TrackingTelemetryV1 } from '../../types';

function frame(time: number, state = 'observed'): TrackingTelemetryV1 {
  return { schemaVersion: 1, analysisId: 'test', timestampSec: time, frameIndex: Math.round(time * 30), players: [],
    shuttle: { timestampSec: time, frameIndex: Math.round(time * 30), state: state as 'observed',
      positionPx: state === 'lost' ? null : { x: 50, y: 30 }, confidence: 0.8, source: 'temporal_tracker', trajectoryId: null } };
}
describe('shuttle overlay', () => {
  it('renders observed shuttle with explicit provenance', () => {
    render(<ShuttleOverlay frames={[frame(1, 'observed')]} time={1} mode="point" width={100} height={100} />);
    expect(screen.getByTestId('shuttle-current')).toHaveAttribute('data-state', 'observed');
  });

  it.each(['predicted', 'interpolated'])('does not render %s shuttle in point overlay', state => {
    render(<ShuttleOverlay frames={[frame(1, state)]} time={1} mode="point" width={100} height={100} />);
    expect(screen.queryByTestId('shuttle-current')).toBeNull();
  });

  it('excludes non-observed positions from trail history', () => {
    render(
      <ShuttleOverlay
        frames={[frame(0.7, 'predicted'), frame(0.8, 'interpolated'), frame(0.9, 'observed'), frame(1, 'observed')]}
        time={1}
        mode="trail"
        width={100}
        height={100}
      />
    );
    const trails = screen.getAllByTestId('shuttle-trail');
    expect(trails).toHaveLength(1);
    expect(trails[0]).toHaveAttribute('data-state', 'observed');
  });
  it.each([1.3, 0.9])('hides stale or future observations at %s', time => {
    render(<ShuttleOverlay frames={[frame(1)]} time={time} mode="point" width={100} height={100} />);
    expect(screen.queryByTestId('shuttle-current')).toBeNull();
  });
  it('lost suppresses old current point', () => {
    render(<ShuttleOverlay frames={[frame(0.9), frame(1, 'lost')]} time={1} mode="trail" width={100} height={100} />);
    expect(screen.queryByTestId('shuttle-current')).toBeNull();
  });
  it('bounds trail by time and count', () => {
    render(<ShuttleOverlay frames={Array.from({ length: 100 }, (_, i) => frame(i / 30))} time={3} mode="trail" width={100} height={100} />);
    expect(screen.getAllByTestId('shuttle-trail').length).toBeLessThanOrEqual(18);
  });
  it('handles old sessions and missing data', () => {
    const old = { ...frame(1), shuttle: undefined };
    render(<><ShuttleOverlay frames={[old]} time={1} mode="point" width={100} height={100} /><ShuttleDiagnostics frames={[old]} time={1} /></>);
    expect(screen.queryByTestId('shuttle-current')).toBeNull();
    expect(screen.getByLabelText('Shuttle diagnostics')).not.toHaveTextContent('0.0%');
  });
  it('has accessible separate controls', () => {
    const change = vi.fn();
    render(<ShuttleControls mode="off" onChange={change} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Shuttle overlay mode' }), { target: { value: 'debug' } });
    expect(change).toHaveBeenCalledWith('debug');
  });
});
