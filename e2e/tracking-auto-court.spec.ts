import { expect, test } from '@playwright/test';

for (const language of ['th', 'en'] as const) {
  test(`Lab starts Auto Court without manual corners (${language}, keyboard, reduced motion)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((language) => {
      localStorage.setItem('scout_settings', JSON.stringify({ uiLanguage: language, theme: 'dark', workspaceExperience: 'classic' }));
      localStorage.setItem('scout_match_info', JSON.stringify({ sportType: 'badminton' }));
    }, language);
    const created: any[] = [];
    let calibrations = 0;
    let starts = 0;
    await page.route('http://127.0.0.1:8000/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let response: any = {};
      if (path === '/api/capabilities') response = { selectedDevice: 'cpu', cudaAvailable: false, mpsAvailable: false,
        shuttle: { provider: 'rallylens_tracknet', modelAvailable: true, configuredModel: 'rallylens-shuttle-tracknet.pth',
          windowSize: 9, requiredFrameStride: 1, runtime: 'pytorch', precision: 'fp32', device: 'cpu' } };
      else if (path === '/api/tracking/sessions' && request.method() === 'GET') response = { sessions: [], nextCursor: null };
      else if (path === '/api/tracking/sessions' && request.method() === 'POST') {
        created.push(request.postDataJSON());
        response = { sessionId: 'auto-browser-run', status: 'READY', trackedPlayerCount: 2 };
      } else if (path.endsWith('/video')) response = { width: 1280, height: 720 };
      else if (path.endsWith('/calibration')) { calibrations += 1; }
      else if (path.endsWith('/start')) { starts += 1; response = { status: 'started' }; }
      else if (path.endsWith('/status')) response = { sessionId: 'auto-browser-run', status: 'PROCESSING', progressPct: 0, players: [] };
      else if (path.endsWith('/results')) response = { sessionId: 'auto-browser-run', status: 'PROCESSING', telemetry: [], nextCursor: 0, sampleCount: 0 };
      await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(response) });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Draft/ }).click();
    await page.getByRole('button', { name: /Save project now|บันทึกโปรเจกต์ตอนนี้/ }).click();
    await page.getByRole('tab', { name: 'Labs', exact: true }).click();
    const lab = page.getByRole('tabpanel', { name: 'Labs' });
    await lab.getByLabel('Select video file').setInputFiles({ name: 'browser-fixture.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fixture bytes; decoder is mocked at API boundary') });
    const auto = lab.getByRole('checkbox', { name: language === 'th' ? 'ตรวจจับสนามอัตโนมัติ' : 'Automatic court calibration' });
    await auto.focus();
    await auto.press('Space');
    await expect(auto).toBeChecked();
    await lab.getByRole('button', { name: /Advanced|ขั้นสูง/ }).click();
    await lab.getByRole('checkbox', { name: 'Enable Shuttle Tracking' }).check();
    const run = lab.getByRole('button', { name: /Run Movement Analysis|เริ่มตรวจจับร่างกายและการเคลื่อนที่/ });
    await expect(run).toBeEnabled();
    await auto.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local-services/auto-court-${language}.png`, fullPage: true });
    await run.click({ clickCount: 2 });
    await expect.poll(() => starts).toBe(1);
    expect(calibrations).toBe(0);
    expect(created).toHaveLength(1);
    expect(created[0].processing_config).toMatchObject({ autoCourtCalibrationEnabled: true, shuttleEnabled: true,
      shuttleProvider: 'rallylens_tracknet', frameStride: 1, shuttleWindowSize: 9 });
    await expect(auto).toBeDisabled();
    await expect(lab.getByRole('button', { name: /Cancel analysis|ยกเลิก/ })).toBeVisible();
    await page.screenshot({ path: `.local-services/auto-court-${language}-started.png`, fullPage: true });
  });
}
