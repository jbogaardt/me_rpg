import { expect, test, type CDPSession, type Page } from '@playwright/test';

// The quick-item button (src/hud/ItemButton.ts): tap uses, swipe cycles and never uses; keys 1-3, Q/E, F and the wheel on a
// keyboard. Also the split action keys (core/contextKey.ts): a reloaded hero stands beside Maren (home), and there A swings
// and only Interact (the round button, R) talks, until the Controls tab switches the old contextual key on. The production build has no `__game`, so the hero is given a Potion x2 and an Elixir by editing the solo save
// (the page saves on `pagehide`, an init script puts the edited save back before the next boot reads it).

async function boot(page: Page) {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#hud-mp .label')).toHaveText('20 / 20');
}

/** Reload with the hero carrying 2 Potions and an Elixir, at 5 HP and no quick slots chosen. */
async function giveItems(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const entry = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('me_rpg.save.'))!;
    return [key, localStorage.getItem(key)!] as const;
  });
  const save = JSON.parse(entry[1]) as { hero: { pack: string[]; stats: { hp: number } } };
  save.hero.pack = ['potion', 'potion', 'elixir'];
  save.hero.stats.hp = 5;
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
      localStorage.removeItem('me_rpg.hotbar');
    },
    [entry[0], JSON.stringify(save)] as const,
  );
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#item-btn .ib-icon > *')).toHaveCount(1); // the first consumable filled a quick slot
}

const centre = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), b };
};

const send = (cdp: CDPSession, type: string, pts: [number, number, number][]) =>
  cdp.send('Input.dispatchTouchEvent', {
    type: type as 'touchStart',
    touchPoints: pts.map(([x, y, id]) => ({ x, y, id })),
  });

async function swipe(cdp: CDPSession, x: number, y: number, dx: number, dy: number, id: number) {
  await send(cdp, 'touchStart', [[x, y, id]]);
  for (let i = 1; i <= 6; i++) await send(cdp, 'touchMove', [[x + (dx * i) / 6, y + (dy * i) / 6, id]]);
  await send(cdp, 'touchEnd', []);
}

const tap = (cdp: CDPSession, x: number, y: number, id: number) =>
  Promise.all([send(cdp, 'touchStart', [[x, y, id]]), send(cdp, 'touchEnd', [])]);

const rectsApart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test.describe(`touch ${viewport.width}x${viewport.height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport });

    test('one 60 px round button sits up-left of A, clear of the stick half and the screen edge', async ({ page }) => {
      await boot(page);
      await expect(page.locator('#hotbar')).toHaveCount(0);
      const item = await centre(page, '#item-btn');
      const a = await centre(page, '#btn-a');
      expect(item.b.width).toBeGreaterThanOrEqual(48);
      expect(item.b.height).toBeGreaterThanOrEqual(48);
      expect(Math.hypot(item.x - a.x, item.y - a.y)).toBeGreaterThan(item.b.width / 2 + a.b.width / 2);
      expect(item.b.x).toBeGreaterThanOrEqual(viewport.width / 2); // the floating stick owns the left half
      expect(item.b.x + item.b.width).toBeLessThanOrEqual(viewport.width);
      expect(item.y).toBeLessThan(a.y); // up from A
      expect(item.x).toBeLessThan(a.x); // and left of it
    });

    test('the dodge roll button sits left of A, clear of the item button and the stick half, and takes a tap', async ({
      page,
    }) => {
      await boot(page);
      const roll = await centre(page, '#btn-roll');
      const a = await centre(page, '#btn-a');
      const item = await centre(page, '#item-btn');
      expect(roll.b.width).toBeGreaterThanOrEqual(48);
      expect(roll.b.height).toBeGreaterThanOrEqual(48);
      for (const other of [a, item]) {
        const apart =
          roll.b.x + roll.b.width <= other.b.x ||
          other.b.x + other.b.width <= roll.b.x ||
          roll.b.y + roll.b.height <= other.b.y ||
          other.b.y + other.b.height <= roll.b.y;
        expect(apart).toBe(true);
      }
      expect(roll.b.x).toBeGreaterThanOrEqual(viewport.width / 2); // the floating stick owns the left half
      expect(roll.x).toBeLessThan(a.x);
      expect(roll.b.y + roll.b.height).toBeLessThanOrEqual(viewport.height);
      // A tap goes through the same touch layer as A (the roll itself is driven in the dev playtest, not here: no `__game`).
      const cdp = await page.context().newCDPSession(page);
      await tap(cdp, roll.x, roll.y, 4);
      await expect(page.locator('#btn-roll')).toBeVisible();
    });

    test('A swings beside Maren and the Interact button, which appears only near something, talks', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await boot(page);
      await giveItems(page); // a reload puts the hero at home, beside Maren
      const cdp = await page.context().newCDPSession(page);
      const use = page.locator('#btn-use');
      await expect(use).toBeVisible(); // Maren is within reach
      const u = await centre(page, '#btn-use');
      expect(u.b.width).toBeGreaterThanOrEqual(48);
      expect(u.b.height).toBeGreaterThanOrEqual(48);
      for (const sel of ['#btn-a', '#btn-roll', '#item-btn']) {
        const other = await centre(page, sel);
        expect(rectsApart(u.b, other.b), `interact clear of ${sel}`).toBe(true);
      }
      expect(u.b.x).toBeGreaterThanOrEqual(viewport.width / 2); // the floating stick owns the left half
      expect(u.b.x + u.b.width).toBeLessThanOrEqual(viewport.width);
      expect(u.b.y).toBeGreaterThanOrEqual(0);

      const a = await centre(page, '#btn-a');
      await tap(cdp, a.x, a.y, 1); // attack: a swing, never Maren's dialog
      await page.waitForTimeout(500);
      await expect(page.locator('#dialog')).toBeHidden();
      await tap(cdp, u.x, u.y, 2); // interact: the dialog opens
      await expect(page.locator('#dialog')).toBeVisible();
      await tap(cdp, a.x, a.y, 3); // A turns the pages like before
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/keysplit-${viewport.width}x${viewport.height}.png` });
    });

    test('tap uses, swipe cycles without using, a refusal says nothing, with the stick and A held', async ({
      page,
    }) => {
      test.setTimeout(120_000); // two boots on software GL
      await boot(page);
      await giveItems(page);
      const cdp = await page.context().newCDPSession(page);
      const { x, y } = await centre(page, '#item-btn');
      await expect(page.locator('#item-btn .ib-pips i')).toHaveCount(2);
      await expect(page.locator('#item-btn .ib-qty')).toHaveText('2');

      await swipe(cdp, x, y, 40, 0, 1); // next: the Elixir
      await expect(page.locator('#item-btn')).toHaveAttribute('title', 'Elixir');
      await expect(page.locator('#item-btn .ib-qty')).toBeHidden(); // one Elixir: no badge
      await swipe(cdp, x, y, -40, 0, 2); // previous: the Potion again
      await expect(page.locator('#item-btn')).toHaveAttribute('title', 'Potion');
      await swipe(cdp, x, y, 0, -40, 3); // up is reserved
      await expect(page.locator('#item-btn')).toHaveAttribute('title', 'Potion');
      await expect(page.locator('#item-btn .ib-qty')).toHaveText('2'); // nothing was used by any swipe

      await tap(cdp, x, y, 4);
      await expect(page.locator('#item-btn .ib-qty')).toBeHidden(); // one Potion left
      await expect(page.locator('#item-btn')).toHaveClass(/cooling/);
      // Regeneration soon tops the hero up; at full health the engine refuses the last Potion: the button shakes, keeps the
      // Potion and says nothing in words.
      await expect(page.locator('#hud-hp .label')).toHaveText('30 / 30', { timeout: 60_000 });
      await expect(page.locator('#item-btn')).not.toHaveClass(/cooling/);
      await tap(cdp, x, y, 5);
      await page.waitForTimeout(400);
      await expect(page.locator('#dm-caption')).not.toContainText('need that');
      await expect(page.locator('#item-btn')).not.toHaveClass(/empty/);
      await expect(page.locator('#item-btn')).toHaveAttribute('title', 'Potion');
      await expect(page.locator('#item-btn .ib-pips i')).toHaveCount(2); // the Potion is still carried

      // Stick (left half of the canvas), A and the item button at once.
      const a = await centre(page, '#btn-a');
      const sx = Math.round(viewport.width * 0.2);
      const sy = Math.round(viewport.height * 0.7);
      await send(cdp, 'touchStart', [[sx, sy, 10]]);
      await send(cdp, 'touchMove', [[sx + 50, sy, 10]]);
      await send(cdp, 'touchStart', [
        [sx + 50, sy, 10],
        [a.x, a.y, 11],
      ]);
      await expect(page.locator('#btn-a')).toHaveClass(/pressed/);
      await expect(page.locator('#dpad')).toHaveClass(/touched/);
      await send(cdp, 'touchStart', [
        [sx + 50, sy, 10],
        [a.x, a.y, 11],
        [x, y, 12],
      ]);
      await expect(page.locator('#item-btn')).toHaveClass(/pressed/);
      await send(cdp, 'touchEnd', []);
      await expect(page.locator('#btn-a')).not.toHaveClass(/pressed/);
      await expect(page.locator('#dpad')).not.toHaveClass(/touched/);
    });
  });
}

test.describe('keyboard and mouse', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('E and Q cycle, F and 1-3 use, the wheel cycles outside the menu, and the pop-up setting is saved', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await boot(page);
    await giveItems(page);
    await page.locator('canvas').hover({ position: { x: 400, y: 300 } });
    const btn = page.locator('#item-btn');
    await expect(btn).toHaveAttribute('title', 'Potion');
    // Split keys: beside Maren the attack key swings (no dialog) and the interact key (R) talks.
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    await expect(page.locator('#dialog')).toBeHidden();
    await page.keyboard.press('KeyR');
    await expect(page.locator('#dialog')).toBeVisible();
    await page.keyboard.press('Space'); // either key turns the pages; hold the last page's close off until it ends
    for (let i = 0; i < 12 && (await page.locator('#dialog').isVisible()); i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
    }
    await expect(page.locator('#dialog')).toBeHidden();
    await page.keyboard.press('KeyE');
    await expect(btn).toHaveAttribute('title', 'Elixir');
    await page.keyboard.press('KeyQ');
    await expect(btn).toHaveAttribute('title', 'Potion');
    await page.mouse.wheel(0, 100);
    await expect(btn).toHaveAttribute('title', 'Elixir');

    await page.keyboard.press('KeyF'); // uses the selected Elixir
    await expect(btn).toHaveClass(/empty/); // the only Elixir was drunk
    await page.waitForTimeout(900);

    await page.keyboard.press('Escape');
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(300);
    await expect(btn).toHaveAttribute('title', 'Elixir'); // the wheel is not the game's while the menu is open (the Elixir's slot stays selected)
    await page.locator('#menu [data-tab="controls"]').click();
    const popup = page.locator('#item-setting [data-item="popup"]');
    await expect(popup).toHaveAttribute('aria-checked', 'true');
    await popup.click();
    await expect(popup).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => localStorage.getItem('me_rpg.itempopup'))).toBe('off');
  });
});

test.describe('the contextual action key setting', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('is off by default, saved when switched on, and then the attack key talks beside Maren again', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await boot(page);
    await giveItems(page);
    await page.locator('canvas').hover({ position: { x: 400, y: 300 } });
    await page.keyboard.press('Escape');
    await page.locator('#menu [data-tab="controls"]').click();
    const toggle = page.locator('#context-setting #context-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#keybinds')).toBeAttached();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('me_rpg.contextkey'))).toBe('on');
    await page.keyboard.press('Escape');
    await page.locator('canvas').hover({ position: { x: 400, y: 300 } });
    await page.keyboard.press('Space'); // the one key: beside Maren it talks
    await expect(page.locator('#dialog')).toBeVisible();
  });
});
