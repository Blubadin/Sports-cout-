import { describe, it, expect } from 'vitest';
import { resolveBadmintonPointSelection } from '../../components/badminton/BadmintonTouchCourt';

describe('Badminton Touch Court Point Resolution', () => {
  it('resolves in-court landing point in front court (FL)', () => {
    // Top-left area (Opponent front left)
    const result = resolveBadmintonPointSelection({
      normX: 0.25, // Left side
      normY: 0.42, // Close to net on top half
      flipCourtSide: false,
      isDoubles: true,
      uiLanguage: 'th',
    });

    expect(result.isIn).toBe(true);
    expect(result.areaCode).toContain('F');
    expect(result.courtSide).toBe('teamB');
    expect(result.pointX).toBe(0.25);
    expect(result.pointY).toBe(0.42);
  });

  it('resolves in-court landing point in our back court (BR)', () => {
    // Bottom-right area (Our back right)
    const result = resolveBadmintonPointSelection({
      normX: 0.75, // Right side
      normY: 0.88, // Deep in back court
      flipCourtSide: false,
      isDoubles: true,
      uiLanguage: 'th',
    });

    expect(result.isIn).toBe(true);
    expect(result.areaCode).toBe('BR');
    expect(result.courtSide).toBe('teamA');
  });

  it('detects Side Out when ball lands outside singles sideline during singles match', () => {
    // Single sideline is at ~14.3% margin
    const result = resolveBadmintonPointSelection({
      normX: 0.10, // Outside singles sideline (< 0.143)
      normY: 0.70,
      flipCourtSide: false,
      isDoubles: false, // Singles match
      uiLanguage: 'th',
    });

    expect(result.isIn).toBe(false);
    expect(result.areaCode).toBe('SIDE_OUT');
    expect(result.outZone).toBe('side_left_near');
  });

  it('detects Back Out (Long Out) when ball lands beyond back boundary line', () => {
    const result = resolveBadmintonPointSelection({
      normX: 0.50,
      normY: 0.98, // Past back line (> 0.94)
      flipCourtSide: false,
      isDoubles: true,
      uiLanguage: 'th',
    });

    expect(result.isIn).toBe(false);
    expect(result.areaCode).toBe('LONG_OUT');
    expect(result.outZone).toBe('own_back_out');
  });

  it('detects Net Error when point is right on the net band', () => {
    const result = resolveBadmintonPointSelection({
      normX: 0.50,
      normY: 0.50, // Exactly at net (Y = 0.50)
      flipCourtSide: false,
      isDoubles: true,
      uiLanguage: 'th',
    });

    expect(result.isIn).toBe(false);
    expect(result.areaCode).toBe('NET_ERR');
    expect(result.outZone).toBe('net_error');
  });

  it('correctly swaps court sides when flipCourtSide is enabled', () => {
    const normal = resolveBadmintonPointSelection({
      normX: 0.50,
      normY: 0.30, // Opponent side
      flipCourtSide: false,
    });
    const flipped = resolveBadmintonPointSelection({
      normX: 0.50,
      normY: 0.30,
      flipCourtSide: true,
    });

    expect(normal.courtSide).toBe('teamB');
    expect(flipped.courtSide).toBe('teamA');
  });

  it('maps center-mid tactical court zone (MC) accurately', () => {
    const result = resolveBadmintonPointSelection({
      normX: 0.50,
      normY: 0.75, // Mid court center
      flipCourtSide: false,
      isDoubles: true,
      uiLanguage: 'th',
    });

    expect(result.isIn).toBe(true);
    expect(result.areaCode).toBe('MC');
    expect(result.pointX).toBe(0.50);
    expect(result.pointY).toBe(0.75);
    expect(result.detailLabel).toContain('MC');
  });

  it('preserves exact pointX and pointY coordinates across boundary checks', () => {
    const points = [
      { x: 0.15, y: 0.20 },
      { x: 0.85, y: 0.80 },
      { x: 0.05, y: 0.50 }, // Side out
      { x: 0.50, y: 0.02 }, // Back out
    ];

    points.forEach(({ x, y }) => {
      const res = resolveBadmintonPointSelection({
        normX: x,
        normY: y,
        isDoubles: true,
      });
      expect(res.pointX).toBe(x);
      expect(res.pointY).toBe(y);
    });
  });
});
