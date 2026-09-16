import { expect, test } from '@playwright/test';

test('Classic exposes Labs on desktop and narrow screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header.coach-header').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: /Draft/ }).click();
  await expect(page.getByRole('button', { name: /บันทึกโปรเจกต์ตอนนี้/ })).toBeEnabled();
  const labs = page.getByRole('tab', { name: 'Labs', exact: true });
  await expect(labs).toBeVisible();
  await labs.click();
  await expect(labs).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Labs' })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(labs).toBeVisible();
});
