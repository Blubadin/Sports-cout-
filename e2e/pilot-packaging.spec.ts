import { expect, test } from '@playwright/test';

const sampleSports = ['Volleyball', 'Football', 'Badminton', 'Basketball'];

test('opens all four pilot sports and keeps Controller V1 opt-in', async ({ page }) => {
  await page.goto('/');

  const toggle = page.getByTestId('workspace-menu-toggle');
  await expect(toggle).toBeEnabled({ timeout: 10_000 });
  const canLoadPilot = await page.getByRole('button', { name: 'โหลดตัวอย่าง Pilot ครบ 4 กีฬา' }).count();
  if (canLoadPilot) {
    await expect(page.getByRole('heading', { name: 'ยังไม่มีโครงการ' })).toBeVisible();
    await page.getByRole('button', { name: 'โหลดตัวอย่าง Pilot ครบ 4 กีฬา' }).click();
    await expect(page.getByText(/เพิ่มโปรเจกต์ตัวอย่าง|Added.*samples/i)).toBeVisible();
  }
  await toggle.click();

  for (const sport of sampleSports) {
    const projectName = `SPORTSCOUT Pilot - ${sport}`;
    const isToggleMenuOpen = await page.getByText(/คลังโครงการ|Workspace Library/i).isVisible();
    if (!isToggleMenuOpen) {
      await toggle.click();
    }
    await expect(page.getByRole('button', { name: projectName, exact: true })).toBeVisible();
    await page.getByRole('button', { name: projectName, exact: true }).click();
    await expect(page.getByRole('tab', { name: 'แผงบันทึก (Scout)' })).toBeVisible();
    await expect(page.getByTestId('workspace-menu-toggle')).toContainText(projectName);

    const courtSurface = page.locator(`[data-sport-surface="${sport.toLowerCase()}"]`);
    // Vite compiles the lazy VideoPlayer/InputPanel chunks on first use in the
    // development server, which can exceed the default 5s under parallel E2E load.
    await expect(courtSurface).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('court-team-near')).toBeVisible();
    await expect(page.getByTestId('court-team-far')).toBeVisible();
    expect(await courtSurface.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const parentRect = element.parentElement?.getBoundingClientRect();
      return Boolean(parentRect)
        && rect.left >= parentRect.left - 1
        && rect.right <= parentRect.right + 1;
    })).toBe(true);

    if (sport !== sampleSports.at(-1)) await page.getByTestId('workspace-menu-toggle').click();
  }

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'ตั้งค่าระบบ' })).toBeVisible();
  await page.getByRole('button', { name: /ขั้นสูง & คอนโทรลเลอร์|Advanced/i }).click();
  await expect(page.getByTestId('controller-v1-toggle')).not.toBeChecked();

  await page.getByRole('button', { name: /ข้อมูล & สำรอง|Data/i }).click();
  await expect(page.getByRole('button', { name: /ส่งออกข้อมูลวินิจฉัยเพื่อการสนับสนุน|Diagnostic Export/i })).toBeVisible();
  await expect(page.getByText('SPORTSCOUT 0.11.0-pilot.1')).toBeVisible();
});

const viewportCases = [
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'phone landscape', width: 844, height: 390 },
];

for (const viewport of viewportCases) {
  test(`contains the workspace and Settings at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(horizontalOverflow).toBe(false);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'ตั้งค่าระบบ' })).toBeVisible();
    const modalFits = await page.locator('#settings-modal > div').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0
        && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
    });
    expect(modalFits).toBe(true);
  });
}
