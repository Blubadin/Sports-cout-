import { expect, test } from '@playwright/test';

async function enableWorkstation(page: import('@playwright/test').Page, language: 'th' | 'en' = 'th') {
  await page.goto('/');
  const topbar = page.locator('header.workstation-topbar').filter({ visible: true });
  await expect(topbar).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('header.coach-header')).toHaveCount(0);

  const toggle = page.getByTestId('workspace-menu-toggle');
  await expect(toggle).toBeEnabled({ timeout: 10_000 });
  const pilotBtn = page.getByRole('button', { name: /โหลดตัวอย่าง Pilot ครบ 4 กีฬา|Load four-sport pilot samples/i });
  if (await pilotBtn.count()) {
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
  // Wait for workspace dropdown to fully close before interacting with command bar buttons
  await expect(page.getByText(/คลังโครงการ|Workspace Library/i)).toBeHidden({ timeout: 5_000 });

  const langToggle = page.getByRole('button', { name: /สลับภาษา|Toggle language/i });
  await expect(langToggle).toBeVisible({ timeout: 10_000 });
  const currentLang = (await langToggle.textContent())?.trim();
  if (language === 'en' && currentLang === 'TH') {
    await langToggle.click();
    await expect(langToggle).toHaveText('EN');
  } else if (language === 'th' && currentLang === 'EN') {
    await langToggle.click();
    await expect(langToggle).toHaveText('TH');
  }
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
  await expect(page.getByRole('navigation', { name: /Workstation modes/i })
    .getByRole('button', { name: /Review|ทบทวน/i })).toHaveAttribute('aria-current', 'page');
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

test('keeps Workstation accessible and responsive on phone and narrow viewports (<1024px) without Classic switcher', async ({ page }) => {
  const viewports = [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 800, height: 900 },
  ];

  await page.setViewportSize(viewports[0]);
  await enableWorkstation(page, 'en');

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator('header.workstation-topbar')).toBeVisible();
    await expect(page.locator('header.coach-header')).toHaveCount(0);

    const nav = page.getByRole('navigation', { name: /Workstation modes/i });
    await expect(nav).toBeVisible();
    for (const label of ['Scout', 'Review', 'Analyze', 'Report', 'Labs']) {
      await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('navigation', { name: /Workstation modes/i }).getByRole('button', { name: 'Labs', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Labs' })).toBeVisible();
  await page.getByRole('navigation', { name: /Workstation modes/i }).getByRole('button', { name: 'Scout', exact: true }).click();

  await page.getByRole('button', { name: /Settings|ตั้งค่า/i }).click();
  const settingsModal = page.locator('#settings-modal');
  await expect(settingsModal).toBeVisible();
  await expect(settingsModal.getByRole('button', { name: 'Classic', exact: true })).toHaveCount(0);
  await expect(settingsModal.getByRole('button', { name: /Workstation Beta/i })).toHaveCount(0);
  const modalBox = await settingsModal.boundingBox();
  expect(modalBox).not.toBeNull();
  expect((modalBox?.x ?? -1) >= 0).toBe(true);
  expect((modalBox?.x ?? 0) + (modalBox?.width ?? 0)).toBeLessThanOrEqual(391);
  await settingsModal.getByRole('button', { name: /Close settings|ปิดการตั้งค่า/i }).click();
});
