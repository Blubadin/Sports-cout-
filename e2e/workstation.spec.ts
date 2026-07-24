import { expect, test } from '@playwright/test';

async function enableWorkstation(page: import('@playwright/test').Page, language: 'th' | 'en' = 'th') {
  await page.goto('/');
  if (await page.getByRole('navigation', { name: /Workstation modes/i }).count()) {
    await page.getByRole('button', { name: /Settings|ตั้งค่า/i }).first().click();
    await page.getByRole('button', { name: /Classic/i }).click();
    await page.getByRole('button', { name: /ปิดการตั้งค่า|Close settings/i }).click();
  }
  const toggle = page.getByTestId('workspace-menu-toggle').first();
  await expect(toggle).toBeEnabled({ timeout: 10_000 });
  const canLoadPilot = await page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i }).count();
  if (canLoadPilot) {
    const pilotBtn = page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i });
    await expect(pilotBtn).toBeEnabled();
    await pilotBtn.click();
    await expect(page.getByText(/เพิ่มโปรเจกต์ตัวอย่าง|Added.*samples/i)).toBeVisible({ timeout: 3_000 }).catch(() => {});
  }
  await toggle.click();
  await expect(page.getByText(/คลังโครงการ|Workspace Library/i)).toBeVisible();
  const footballBtn = page.getByRole('button', { name: 'SPORTSCOUT Pilot - Football', exact: true });
  await expect(footballBtn).toBeVisible();
  await footballBtn.click();
  await expect(toggle).toContainText('SPORTSCOUT Pilot - Football');
  // Wait for workspace dropdown to fully close before interacting with header buttons
  await expect(page.getByText(/คลังโครงการ|Workspace Library/i)).toBeHidden({ timeout: 5_000 });
  if (language === 'en') {
    const langToggle = page.getByTitle('Toggle Language').first();
    await expect(langToggle).toBeVisible({ timeout: 10_000 });
    await langToggle.click();
  }
  const settingsBtn = page.locator('button[title="Settings"], button[aria-label="Settings"], button[aria-label="ตั้งค่า"]').first();
  await expect(settingsBtn).toBeVisible({ timeout: 10_000 });
  await settingsBtn.click();
  await page.getByRole('button', { name: /Workstation Beta/i }).click();
  await page.getByRole('button', { name: /ปิดการตั้งค่า|Close settings/i }).click();
}

async function expectNoInspectorOverflow(
  page: import('@playwright/test').Page,
  inspector: import('@playwright/test').Locator,
) {
  await expect.poll(() => inspector.evaluate(
    element => element.scrollWidth <= element.clientWidth + 1,
  )).toBe(true);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  )).toBe(true);
}

test('enables the opt-in Workstation and switches functional presets', async ({ page }) => {
  await enableWorkstation(page);

  await expect(page.getByRole('navigation', { name: /Workstation modes/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Inspector|ตัวตรวจสอบ/i })).toBeVisible();
  await expect(page.getByText(/Waiting for input|รอเลือกข้อมูล/i)).toBeVisible();
  await page.getByRole('button', { name: /Review|ทบทวน/i }).first().click();
  await expect(page.getByRole('tab', { name: /ตารางเหตุการณ์|Events Table/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Workstation Beta/i).first()).toBeVisible();
});

test('shows the Inspector empty, incomplete, and valid states in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await enableWorkstation(page);

  const inspector = page.getByRole('complementary', { name: /Inspector|ตัวตรวจสอบ/i });
  await expect(inspector).toHaveAttribute('data-inspector-state', 'empty');
  await expect(inspector).toContainText(/Waiting for input|รอเลือกข้อมูล/i);

  await page.locator('[data-scout-group="team"]').first().click();
  const thaiPlayerNumber = '99-หมายเลขผู้เล่นยาวมากเพื่อทดสอบพื้นที่แคบ';
  const thaiPlayerName = 'ชื่อผู้เล่นภาษาไทยที่ยาวมากสำหรับการทดสอบ Inspector โดยไม่ให้เอกสารล้นแนวนอน';
  await page.getByPlaceholder(/e\.g\. 7/i).fill(thaiPlayerNumber);
  await page.getByPlaceholder(/ชื่อผู้เล่น|Player Name/i).fill(thaiPlayerName);
  await expect(inspector).toHaveAttribute('data-inspector-state', 'incomplete');

  await page.locator('[data-scout-group="skill"]').first().click();
  await page.locator('[data-scout-group="result"]').first().click();
  await page.locator('[data-scout-group="area"]').first().click();
  await expect(inspector).toHaveAttribute('data-inspector-state', 'valid');
  await expect(inspector).toContainText(thaiPlayerName);
  await expectNoInspectorOverflow(page, inspector);
  await expect(inspector).toContainText(/Ready to save this event|ข้อมูลพร้อมบันทึกเหตุการณ์/i);

  await enableWorkstation(page, 'en');
  const englishInspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(englishInspector).toHaveAttribute('data-inspector-state', 'empty');
  await expect(englishInspector).toContainText('Waiting for input');

  const englishPlayerNumber = '101-LONG-PLAYER-NUMBER-FOR-NARROW-INSPECTOR';
  const englishPlayerName = 'Extremely Long English Player Name Used To Verify Inspector And Document Horizontal Overflow';
  await page.locator('[data-scout-group="team"]').first().click();
  await page.getByPlaceholder(/e\.g\. 7/i).fill(englishPlayerNumber);
  await page.getByPlaceholder(/Player Name/i).fill(englishPlayerName);
  await page.locator('[data-scout-group="skill"]').first().click();
  await page.locator('[data-scout-group="result"]').first().click();
  await page.locator('[data-scout-group="area"]').first().click();
  await expect(englishInspector).toHaveAttribute('data-inspector-state', 'valid');
  await expect(englishInspector).toContainText(englishPlayerName);
  await expectNoInspectorOverflow(page, englishInspector);
});

test('keeps the Inspector desktop-only without changing the 7/5 Workstation layout', async ({ page }) => {
  await page.setViewportSize({ width: 1279, height: 768 });
  await enableWorkstation(page);

  await expect(page.getByRole('complementary', { name: /Inspector|ตัวตรวจสอบ/i })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: /Workstation modes/i })).toBeVisible();
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`keeps the Inspector Workstation free of horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enableWorkstation(page);

    await expect(page.getByRole('complementary', { name: /Inspector|ตัวตรวจสอบ/i })).toBeVisible();
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    )).toBe(true);
  });
}

test('keeps the Classic interface on phone landscape', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: /Workstation modes/i })).toHaveCount(0);
});
