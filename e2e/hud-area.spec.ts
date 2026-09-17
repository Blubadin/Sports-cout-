import { expect, test } from '@playwright/test';

async function openSportHud(page: import('@playwright/test').Page, sportName: string) {
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
  const sportBtn = page.getByRole('button', { name: `SPORTSCOUT Pilot - ${sportName}`, exact: true });
  await expect(sportBtn).toBeVisible();
  await sportBtn.click();
  await expect(toggle).toContainText(`SPORTSCOUT Pilot - ${sportName}`);
  await page.getByRole('button', { name: 'YouTube', exact: true }).click();
  await page.getByPlaceholder('YouTube URL...').fill('https://www.youtube.com/watch?v=kejGdB0Y2c4');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'HUD Mode', exact: true }).click();
}

const sportCases = [
  { name: 'Volleyball', outZoneCount: 8 },
  { name: 'Football', outZoneCount: 12 },
  { name: 'Basketball', outZoneCount: 5 },
] as const;

for (const sport of sportCases) {
  test(`keeps ${sport.name} Pro HUD out-of-court zones visible and usable`, async ({ page }) => {
    await openSportHud(page, sport.name);

    await page.keyboard.down('w');
    const areaPad = page.locator('[data-controller-wheel="area"]');
    await expect(areaPad).toBeVisible();
    await expect(areaPad).toHaveAttribute('data-out-lane-min-target', '44');

    const result = await areaPad.evaluate((element) => {
      const pad = element.getBoundingClientRect();
      const zones = Array.from(element.querySelectorAll<HTMLElement>('[data-scout-hover-out-zone]'));
      return {
        zoneCount: zones.length,
        layoutIds: zones.map((zone) => zone.dataset.proAreaLayoutId),
        allInside: zones.every((zone) => {
          const rect = zone.getBoundingClientRect();
          return rect.left >= pad.left - 1 && rect.right <= pad.right + 1
            && rect.top >= pad.top - 1 && rect.bottom <= pad.bottom + 1;
        }),
        targetSizing: zones.map((zone) => {
          const rect = zone.getBoundingClientRect();
          const edge = zone.dataset.proAreaEdge;
          const horizontal = edge === 'top' || edge === 'bottom';
          const vertical = edge === 'left' || edge === 'right';
          return {
            edge,
            width: rect.width,
            height: rect.height,
            valid: (horizontal && rect.width >= 44 && rect.height >= 44)
              || (vertical && rect.height >= 44 && rect.width >= 44),
          };
        }),
      };
    });

    expect(result.zoneCount).toBe(sport.outZoneCount);
    expect(result.layoutIds.every(Boolean)).toBe(true);
    expect(result.allInside).toBe(true);
    expect(result.targetSizing).toEqual(expect.arrayContaining([
      expect.objectContaining({ edge: expect.stringMatching(/^(top|bottom|left|right)$/) }),
    ]));
    expect(result.targetSizing.filter(target => !target.valid)).toEqual([]);
    await page.keyboard.up('w');
  });
}

test('keeps the Badminton touch court visible and usable in Pro HUD', async ({ page }) => {
  await openSportHud(page, 'Badminton');

  await page.keyboard.down('w');
  const areaPad = page.locator('[data-controller-wheel="area"]');
  const courtSurface = areaPad.locator('[data-sport-surface="badminton"]');
  await expect(areaPad).toBeVisible();
  await expect(courtSurface).toBeVisible();
  await expect(courtSurface.locator('svg.cursor-crosshair')).toBeVisible();

  const bounds = await courtSurface.locator('svg.cursor-crosshair').evaluate((element) => {
    const surface = element.getBoundingClientRect();
    const pad = element.closest('[data-controller-wheel="area"]')?.getBoundingClientRect();
    return {
      surface: { left: surface.left, right: surface.right, top: surface.top, bottom: surface.bottom },
      pad: pad ? { left: pad.left, right: pad.right, top: pad.top, bottom: pad.bottom } : null,
    };
  });
  expect(bounds.pad).not.toBeNull();
  expect(bounds.surface.left).toBeGreaterThanOrEqual(bounds.pad!.left - 1);
  expect(bounds.surface.right).toBeLessThanOrEqual(bounds.pad!.right + 1);
  expect(bounds.surface.top).toBeGreaterThanOrEqual(bounds.pad!.top - 1);
  expect(bounds.surface.bottom).toBeLessThanOrEqual(bounds.pad!.bottom + 1);
  await page.keyboard.up('w');
});

test('uses W hold, aim, and release to select an area and Escape to cancel', async ({ page }) => {
  await openSportHud(page, 'Volleyball');

  const areaPad = page.locator('[data-controller-wheel="area"]');
  const firstTarget = page.locator('[data-scout-hover-area="LB"][data-scout-hover-court-side="teamA"]');
  const secondTarget = page.locator('[data-scout-hover-area="RB"][data-scout-hover-court-side="teamB"]');
  const movePointer = (relativeX: number, relativeY: number) => areaPad.evaluate(
    (element, point) => {
      const rect = element.getBoundingClientRect();
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + rect.width * point.relativeX,
        clientY: rect.top + rect.height * point.relativeY,
      }));
    },
    { relativeX, relativeY },
  );
  const aimAt = async (relativeX: number, relativeY: number, target: typeof firstTarget) => {
    await expect.poll(async () => {
      await movePointer(0.5, 0.5);
      await movePointer(relativeX, relativeY);
      return target.evaluate(element => element.className.includes('bg-amber-500/25'));
    }).toBe(true);
  };
  const neutralizeAim = async () => {
    await expect.poll(async () => {
      await movePointer(0.5, 0.5);
      return areaPad.locator('[data-scout-hover-area]').evaluateAll(
        targets => targets.every(target => !target.className.includes('bg-red-500/20')
          && !target.className.includes('bg-amber-500/25')),
      );
    }).toBe(true);
  };

  await page.keyboard.down('w');
  await expect(areaPad).toBeVisible();
  await aimAt(0.18, 0.2, firstTarget);
  await expect(firstTarget).toHaveClass(/bg-amber-500\/25/);
  await page.keyboard.up('w');
  await expect(areaPad).toHaveCount(0);

  await page.keyboard.down('w');
  await expect(areaPad).toBeVisible();
  await neutralizeAim();
  await expect(firstTarget).toHaveClass(/bg-amber-500 border-amber-400/);
  await aimAt(0.82, 0.2, secondTarget);
  await expect(secondTarget).toHaveClass(/bg-amber-500\/25/);
  await page.keyboard.press('Escape');
  await page.keyboard.up('w');
  await expect(areaPad).toHaveCount(0);

  await page.keyboard.down('w');
  await expect(areaPad).toBeVisible();
  await neutralizeAim();
  await expect(firstTarget).toHaveClass(/bg-amber-500 border-amber-400/);
  await expect(secondTarget).not.toHaveClass(/bg-amber-500 border-amber-400/);
  await page.keyboard.up('w');
});
