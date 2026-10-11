import { expect, test, type Browser, type Page } from '@playwright/test';

// Two real browser contexts play a 2-player game: the host creates a game and reads out its short code, the friend
// types it (or opens a join link), the two swap connection details through the relay (a local copy of the Cloudflare
// one, see playwright.config.ts), and the WebRTC data channel then opens directly between them.

// Each page runs the game on a software renderer and a game setup waits for ICE gathering (up to 10 s per side when
// the STUN server is unreachable), so these need more than Playwright's 30 s default, especially in parallel.
test.describe.configure({ timeout: 120_000 });

async function open(browser: Browser, url: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 480 } })).newPage();
  await page.goto(url);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  return page;
}

async function openOnlineTab(page: Page, mode: 'host' | 'join') {
  await page.keyboard.press('Escape');
  await page.locator('#menu [data-tab="online"]').click();
  await page.locator(`#mp-mode [data-mode="${mode}"]`).click();
}

/** The host creates a game and returns its code. */
async function createGame(host: Page): Promise<string> {
  await openOnlineTab(host, 'host');
  await expect(host.locator('#mp-status .label')).toHaveText('Idle');
  await host.locator('#mp-create').click();
  await expect(host.locator('#mp-code')).toHaveText(/^[a-z]+-[a-z]+$/, { timeout: 30_000 });
  await expect(host.locator('#mp-status .label')).toHaveText('Awaiting Client');
  return (await host.locator('#mp-code').textContent())!;
}

test('two players connect with a game code, play, and disconnect', async ({ browser }) => {
  const host = await open(browser, '/');
  await expect(host.locator('#map-btn')).toBeHidden(); // the map is for co-op only
  const code = await createGame(host);

  // The friend types the code the way people do on a phone: capitals and a space instead of the hyphen.
  const join = await open(browser, '/');
  await openOnlineTab(join, 'join');
  await expect(join.locator('#mp-join-go')).toBeDisabled();
  await join.locator('#mp-code-in').fill(code.toUpperCase().replace('-', ' '));
  await join.locator('#mp-join-go').click();

  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2', { timeout: 30_000 });
  await expect(join.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 1 (host)', {
    timeout: 30_000,
  });
  await expect(host.locator('#mp-status .label')).toHaveText('Connected');
  await expect(join.locator('#mp-status .label')).toHaveText('Connected');

  // A game code works once: a third player with the same code finds nothing there.
  const stranger = await open(browser, '/');
  await openOnlineTab(stranger, 'join');
  await stranger.locator('#mp-code-in').fill(code);
  await stranger.locator('#mp-join-go').click();
  await expect(stranger.locator('#mp-note')).toContainText(/isn.t open/);

  // The game runs behind the open menu: the guest's input reaches the host, and the host's world (here the guest's
  // own MP, which only the host tracks) comes back in snapshots.
  await join.keyboard.press('Escape'); // close the menu
  await expect(join.locator('#menu')).toBeHidden();
  await expect(join.locator('#hud-mp .label')).toHaveText('20 / 20');
  await join.keyboard.press('KeyK');
  await expect(join.locator('#hud-mp .label')).not.toHaveText('20 / 20');

  // The co-op map: toggled with M, semi-transparent, with a pin for the friend once the host's snapshot arrives.
  await expect(join.locator('#map-btn')).toBeVisible();
  await join.keyboard.press('KeyM');
  await expect(join.locator('#map-overlay')).toBeVisible();
  await expect(join.locator('#map-overlay .pin.friend')).toBeVisible();
  await join.keyboard.press('KeyM');
  await expect(join.locator('#map-overlay')).toBeHidden();
  await join.keyboard.press('KeyM'); // open again: leaving the game must close it
  await expect(join.locator('#map-overlay')).toBeVisible();

  // Disconnect from the host's side: both ends report it and carry on solo.
  await host.locator('#mp-disconnect').click();
  await expect(host.locator('#mp-status .label')).toHaveText('Disconnected');
  await expect(join.locator('#mp-status .label')).toHaveText('Disconnected', { timeout: 15_000 });
  await expect(join.locator('#map-overlay')).toBeHidden();
  await expect(join.locator('#map-btn')).toBeHidden();
  await join.keyboard.press('Escape');
  await expect(join.locator('#menu-online')).toBeVisible();
  await expect(join.locator('#mp-note')).toContainText('disconnected');
  await join.keyboard.press('Escape');
  await join.keyboard.press('KeyK'); // solo again: the player's own simulation casts and spends MP
  await expect(join.locator('#hud-mp .label')).not.toHaveText('20 / 20');
});

test('a join link opens the game ready to join, and the code is not left in the address bar', async ({ browser }) => {
  const host = await open(browser, '/');
  const code = await createGame(host);

  const join = await open(browser, `/#join=${code}`);
  await expect(join.locator('#menu')).toBeVisible();
  await expect(join.locator('#menu-online')).toBeVisible();
  await expect(join.locator('#mp-code-in')).toHaveValue(code);
  expect(new URL(join.url()).hash).toBe('');
  await join.locator('#mp-join-go').click();

  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2', { timeout: 30_000 });
  await expect(join.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 1 (host)', {
    timeout: 30_000,
  });
});

test('a host can start over: a new game gets a new code and the old one stops working', async ({ browser }) => {
  const host = await open(browser, '/');
  const first = await createGame(host);
  await host.locator('#mp-mode [data-mode="off"]').click(); // leave online play, which cancels the game
  await expect(host.locator('#mp-note')).toContainText('solo');
  await host.locator('#mp-mode [data-mode="host"]').click();
  await host.locator('#mp-create').click();
  await expect(host.locator('#mp-code')).toHaveText(/^[a-z]+-[a-z]+$/, { timeout: 30_000 });

  const join = await open(browser, '/');
  await openOnlineTab(join, 'join');
  await join.locator('#mp-code-in').fill(first);
  await join.locator('#mp-join-go').click();
  await expect(join.locator('#mp-note')).toContainText(/isn.t open/);
});

test('typing in the code box does not drive the game', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await openOnlineTab(page, 'join');
  // Letters that are game keys (A/D switch tabs, I closes the menu, K casts, Q casts).
  await page.locator('#mp-code-in').click();
  await page.keyboard.type('adikq aaddii');
  await expect(page.locator('#mp-code-in')).toHaveValue('adikq aaddii');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menu-online')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#hud-mp .label')).toHaveText('20 / 20'); // nothing was cast
});

test('a bad game code is explained, not fatal', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await openOnlineTab(page, 'join');
  await expect(page.locator('#mp-join-go')).toBeDisabled();

  await page.locator('#mp-code-in').fill('this is not a code');
  await page.locator('#mp-join-go').click();
  await expect(page.locator('#mp-note')).toContainText('two words');
  await expect(page.locator('#mp-status .label')).toHaveText('Idle');

  // Two real words, but no such game: the same calm answer, and the player can simply try again.
  await page.locator('#mp-code-in').fill('able-acorns');
  await page.locator('#mp-join-go').click();
  await expect(page.locator('#mp-note')).toContainText(/isn.t open/);
  await expect(page.locator('#mp-status .label')).toHaveText('Idle');
  await expect(page.locator('#mp-join-go')).toBeEnabled();
});
