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

test('tapping a combo without a wand or tome does nothing', async ({ page }) => {
  await boot(page);
  for (const key of ['KeyW', 'KeyW', 'KeyA', 'KeyD']) await page.keyboard.press(key);
  await page.waitForTimeout(200);
  await expect(page.locator('#hud-mp .label')).toHaveText('20 / 20');
});

test('there is an on-screen Attack button for keyboard and mouse, and pressing it attacks', async ({ page }) => {
  await boot(page);
  const button = page.locator('#atk-btn');
  await expect(button).toBeVisible();
  await expect(page.locator('#btn-a')).toBeHidden(); // the touch A button is for touch screens
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(button).toHaveClass(/pressed/);
  await page.mouse.up();
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
    await expect(page.locator('#btn-a')).toBeVisible();
    await expect(page.locator('#atk-btn')).toBeHidden(); // the A button is the attack button here
  });

  test('taps on the menu, shop, trade and choice screens keep their clicks (only game input is cancelled)', async ({
    page,
  }) => {
    await boot(page);
    const cancelled = (selector: string) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        const event = new Event('touchend', { bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      }, selector);
    expect(await cancelled('#dpad')).toBe(true); // game input: no zoom, no callout
    for (const screen of ['#menu', '#shop', '#trade', '#trade-request', '#choices']) {
      expect(await cancelled(screen), screen).toBe(false); // their buttons need the browser's click
    }
  });
});
