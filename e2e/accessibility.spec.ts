import { expect, test } from '@playwright/test';

async function openPilotWorkspace(page: import('@playwright/test').Page) {
  await page.goto('/');
  const toggle = page.getByTestId('workspace-menu-toggle');
  await expect(toggle).toBeEnabled({ timeout: 10_000 });
  const canLoadPilot = await page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i }).count();
  if (canLoadPilot) {
    const pilotBtn = page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i });
    await expect(pilotBtn).toBeEnabled();
    await pilotBtn.click();
    await expect(page.getByText(/เพิ่มโปรเจกต์ตัวอย่าง|Added.*samples/i)).toBeVisible();
  }
  await toggle.click();
  const vballBtn = page.getByRole('button', { name: 'SPORTSCOUT Pilot - Volleyball', exact: true });
  await expect(vballBtn).toBeVisible();
  await vballBtn.click();
  await expect(toggle).toContainText('SPORTSCOUT Pilot - Volleyball');
}

test('uses offline Noto typography and preserves native Tab navigation', async ({ page }) => {
  await openPilotWorkspace(page);

  const scoutTab = page.getByRole('tab').nth(0);
  const dashboardTab = page.getByRole('tab').nth(1);
  await scoutTab.focus();
  await page.keyboard.press('Tab');

  await expect(dashboardTab).toBeFocused();
  await expect(scoutTab).toHaveAttribute('aria-selected', 'true');

  const fontFamily = await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontFamily).toContain('Noto Sans Thai');
});

test('switches analysis views with scoped Ctrl+Tab and arrow keys', async ({ page }) => {
  await openPilotWorkspace(page);

  const tabs = page.getByRole('tab');
  await tabs.nth(0).focus();
  await page.keyboard.press('Control+Tab');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toBeFocused();

  await page.keyboard.press('End');
  const reportTab = page.getByRole('tab', { name: /report|รายงาน/i });
  await expect(reportTab).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
  await expect(reportTab).toBeFocused();
});

test('keeps primary navigation usable at 200% browser zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openPilotWorkspace(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });

  const tabs = page.getByRole('tab');
  await expect(tabs.nth(0)).toBeVisible();
  await tabs.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(tabs.nth(1)).toBeFocused();

  const minimumImportantFontSize = await tabs.evaluateAll((elements) => Math.min(
    ...elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ));
  expect(minimumImportantFontSize).toBeGreaterThanOrEqual(12);
});
