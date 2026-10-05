import { expect, test } from '@playwright/test';

test('Chromium renders player and shuttle overlays without connecting camera segments', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default;
    const reactDomClient = await import('/node_modules/.vite/deps/react-dom_client.js');
    const createRoot = reactDomClient.createRoot ?? reactDomClient.default?.createRoot;
    const { default: TrackingVideoOverlay } = await import('/src/components/labs/TrackingVideoOverlay.tsx');
    const { ShuttleOverlay } = await import('/src/components/labs/ShuttleOverlay.tsx');

    const frame = (frameIndex: number, timestampSec: number, cameraSegmentId: string, x: number) => ({
      schemaVersion: 1 as const,
      analysisId: 'browser-run',
      pipelineRunId: 'browser-run',
      frameIndex,
      timestampSec,
      cameraSegmentId,
      players: [{
        playerId: 'P1',
        state: 'observed' as const,
        detectionConfidence: 0.9,
        courtPosition: null,
        bboxPct: { x, y: 20, width: 10, height: 20 },
      }],
      shuttle: {
        frameIndex,
        timestampSec,
        positionPx: { x, y: 80 },
        confidence: 0.9,
        state: 'observed' as const,
        source: 'temporal_tracker' as const,
        trajectoryId: 'browser-trajectory',
      },
    });
    const frames = [
      frame(10, 1, 'segment-old', 10),
      frame(11, 1.04, 'segment-old', 20),
      frame(12, 1.08, 'segment-new', 70),
      frame(13, 1.12, 'segment-new', 80),
    ];
    document.body.innerHTML = '';
    const fixture = document.createElement('main');
    fixture.style.cssText = 'position:fixed;inset:24px auto auto 24px;width:640px;height:360px;background:#0b1219;z-index:9999;';
    document.body.append(fixture);
    createRoot(fixture).render(React.createElement(React.Fragment, null,
      React.createElement(TrackingVideoOverlay, { frames, time: 1.04, mode: 'box' }),
      React.createElement('div', { 'data-testid': 'cross-cut-gap' },
        React.createElement(TrackingVideoOverlay, { frames, time: 1.06, mode: 'box' })),
      React.createElement(ShuttleOverlay, { frames, time: 1.12, mode: 'trail', width: 640, height: 360 }),
    ));
  });

  await expect(page.getByTestId('player-overlay-P1')).toHaveAttribute('data-overlay-state', 'observed');
  await expect(page.locator('[data-testid="player-bbox"]')).toHaveAttribute('x', '20');
  await expect(page.getByTestId('cross-cut-gap').locator('svg')).toHaveCount(1);
  await expect(page.getByTestId('cross-cut-gap').getByTestId('player-bbox')).toHaveCount(0);
  const shuttleTrail = page.getByTestId('shuttle-trail');
  await expect(shuttleTrail).toHaveCount(1);
  await expect(shuttleTrail).toHaveAttribute('cx', '70');
  await page.screenshot({ path: 'test-results/r04-overlay-camera-segment.png' });
});
