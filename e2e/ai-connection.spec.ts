import { expect, test } from '@playwright/test';

async function openTrackingLab(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('header.workstation-topbar').filter({ visible: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('header.coach-header')).toHaveCount(0);
  await page.getByRole('button', { name: /Draft/ }).click();
  await page.getByRole('navigation', { name: 'Workstation modes' }).getByRole('button', { name: 'Labs', exact: true }).click();
  const status = page.getByRole('tabpanel', { name: 'Labs' }).getByRole('status');
  await expect(status).toBeVisible({ timeout: 15_000 });
  return status;
}

test('Tracking Lab shows connected when the protected capability probe succeeds', async ({ page }) => {
  await page.route('http://127.0.0.1:8000/api/capabilities', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ selectedDevice: 'cpu', cudaAvailable: false, mpsAvailable: false }),
  }));
  await expect(await openTrackingLab(page)).toContainText(/Connected|เชื่อมต่อ Local AI/);
});

test('Tracking Lab surfaces backend authentication requirement', async ({ page }) => {
  await page.route('http://127.0.0.1:8000/api/capabilities', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ detail: 'Authentication required' }),
  }));
  await expect(await openTrackingLab(page)).toContainText(/Authentication required|ต้องยืนยันตัวตน/);
});
