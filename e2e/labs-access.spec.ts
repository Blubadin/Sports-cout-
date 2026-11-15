import { expect, test } from '@playwright/test';

test('Workstation exposes Labs on desktop and narrow screens without Classic UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header.workstation-topbar').filter({ visible: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('header.coach-header')).toHaveCount(0);
  await page.getByRole('button', { name: /Draft/ }).click();
  await expect(page.getByRole('button', { name: /บันทึกโปรเจกต์ตอนนี้/ })).toBeEnabled();
  const nav = page.getByRole('navigation', { name: 'Workstation modes' });
  const labs = nav.getByRole('button', { name: 'Labs', exact: true });
  await expect(labs).toBeVisible();
  await labs.click();
  await expect(labs).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('tabpanel', { name: 'Labs' })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(labs).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);
});
