import { expect, test, type Page } from '@playwright/test';

// Mouse buttons drive the hero by default, and the Controls tab rebinds keys.

async function boot(page: Page) {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#hud-mp .label')).toHaveText('20 / 20');
}

test('right click no longer casts anything', async ({ page }) => {
  await boot(page);
  await page.locator('canvas').click({ button: 'right' });
  await page.waitForTimeout(300);
  await expect(page.locator('#hud-mp .label')).toHaveText('20 / 20');
  await expect(page.locator('#combo-hud')).toBeHidden(); // a sword has no combos
});

test('a rebound key opens the inventory and the old one no longer does', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Escape');
  await page.locator('#menu [data-tab="controls"]').click();
  await expect(page.locator('#keybinds')).toBeVisible();
  const row = page.locator('#keybinds tbody tr', { hasText: 'Inventory' });
  await row.locator('button').nth(0).click(); // the I slot
  await page.keyboard.press('KeyF');
  await expect(row.locator('button').nth(0)).toHaveText('F');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();

  await page.keyboard.press('KeyI');
  await page.waitForTimeout(300);
  await expect(page.locator('#menu')).toBeHidden();
  await page.keyboard.press('KeyF');
  await expect(page.locator('#menu')).toBeVisible();
});

test('Esc cancels an edit without closing the menu, and reserved keys are refused', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Escape');
  await page.locator('#menu [data-tab="controls"]').click();
  const slot = page.locator('#keybinds tbody tr', { hasText: 'Attack' }).locator('button').nth(1);
  await slot.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(slot).toHaveText('Space');
  await slot.click();
  await page.keyboard.press('KeyM');
  await expect(page.locator('#keybinds-note')).toContainText('reserved');
  await expect(slot).toHaveText('Space');
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

  test('the key editor is not offered on a phone', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    await page.locator('#menu-btn').tap();
    await page.locator('#menu [data-tab="controls"]').tap();
    await expect(page.locator('#menu-controls')).toBeVisible();
    await expect(page.locator('#keybinds')).toBeHidden();
  });
});
