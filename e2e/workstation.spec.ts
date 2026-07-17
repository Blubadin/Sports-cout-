import { expect, test } from '@playwright/test';

test('enables the opt-in Workstation and switches functional presets', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i }).click();
  await page.getByTestId('workspace-menu-toggle').click();
  await page.getByRole('button', { name: 'SPORTSCOUT Pilot - Football', exact: true }).click();

  await page.getByTitle('Settings').click();
  await page.getByRole('button', { name: /Workstation Beta/i }).click();
  await page.getByRole('button', { name: /ปิดการตั้งค่า|Close settings/i }).click();

  await expect(page.getByRole('navigation', { name: /Workstation modes/i })).toBeVisible();
  await page.getByRole('button', { name: /Review|ทบทวน/i }).first().click();
  await expect(page.getByRole('tab', { name: /ตารางเหตุการณ์|Events Table/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Workstation Beta/i).first()).toBeVisible();
});

test('keeps the Classic interface on phone landscape', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: /Workstation modes/i })).toHaveCount(0);
});
