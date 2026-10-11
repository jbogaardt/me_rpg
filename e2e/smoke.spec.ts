import { expect, test, type Page } from '@playwright/test';

/** Open the game and wait until the loading overlay is gone. Collects anything that looks like a crash. */
async function boot(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('canvas')).toBeVisible();
  return problems;
}

test('boots into the overworld without errors', async ({ page }) => {
  const problems = await boot(page);
  await expect(page.locator('#hud-hp .label')).toHaveText('30 / 30');
  await expect(page.locator('#hud-mp .label')).toHaveText('20 / 20');
  expect(problems).toEqual([]);
});

test('casting spends MP', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('KeyK');
  await expect(page.locator('#hud-mp .label')).not.toHaveText('20 / 20');
});

test('the pause menu opens and closes', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menu-status')).toContainText('Level 1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
});

test.describe('hi-dpi', () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 640, height: 480 } });

  test('the canvas renders at device pixel density', async ({ page }) => {
    await boot(page);
    const size = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height, c.clientWidth]);
    expect(size).toEqual([1280, 960, 640]);
  });
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

  test('shows the on-screen controls on a phone', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#touch-controls')).toBeVisible();
    await expect(page.locator('#dpad')).toBeVisible();
  });
});
