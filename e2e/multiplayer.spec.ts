import { expect, test, type Browser, type Page } from '@playwright/test';

// Two real browser contexts play a 2-player game: the host creates a game and reads out its short code, the friend
// types it (or opens a join link), the two swap connection details through the relay (a local copy of the Cloudflare
// one, see playwright.config.ts), and the WebRTC data channel then opens directly between them.

// Each page runs the game on a software renderer and a game setup waits for ICE gathering (up to 10 s per side when
// the STUN server is unreachable), so these need more than Playwright's 30 s default, especially in parallel.
// They also run one after another rather than in parallel: the four-player test alone keeps five of these pages busy.
test.describe.configure({ mode: 'default', timeout: 120_000 });

async function open(browser: Browser, url: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 480 } })).newPage();
  await page.goto(url);
  // Generous: several pages (each on a software renderer) share one machine while the other tests run.
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90_000 });
  return page;
}

/** Menu > Online > the given mode (it opens the menu only if it is closed, so this is safe to repeat). */
async function openOnlineTab(page: Page, mode: 'host' | 'join') {
  if (await page.locator('#menu').isHidden()) await page.keyboard.press('Escape');
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

async function joinWithCode(page: Page, code: string, shout = false) {
  await openOnlineTab(page, 'join');
  await page.locator('#mp-code-in').fill(shout ? code.toUpperCase().replace('-', ' ') : code);
  await page.locator('#mp-join-go').click();
}

/** What the host's roster says about one player: "connected", "waiting"... */
const seat = (host: Page, slot: number) => host.locator(`#mp-roster li[data-slot="${slot}"]`);

test('two players connect with a game code, play, and disconnect', async ({ browser }) => {
  const host = await open(browser, '/');
  await expect(host.locator('#map-btn')).toBeHidden(); // the map is for co-op only
  const code = await createGame(host);
  // The host sees who can come: themselves and three empty seats.
  await expect(host.locator('#mp-roster li')).toHaveCount(4);
  await expect(seat(host, 0)).toHaveAttribute('data-state', 'you');
  await expect(seat(host, 1)).toHaveAttribute('data-state', 'waiting');

  // The friend types the code the way people do on a phone: capitals and a space instead of the hyphen.
  const join = await open(browser, '/');
  await openOnlineTab(join, 'join');
  await expect(join.locator('#mp-join-go')).toBeDisabled();
  await joinWithCode(join, code, true);

  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2', { timeout: 30_000 });
  await expect(join.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 1 (host)', {
    timeout: 30_000,
  });
  await expect(host.locator('#mp-status .label')).toHaveText('Connected');
  await expect(join.locator('#mp-status .label')).toHaveText('Connected');
  await expect(seat(host, 1)).toHaveAttribute('data-state', 'connected');
  await expect(seat(join, 1)).toHaveAttribute('data-state', 'you'); // the friend sits in seat 1: "Player 2"

  // The code stays open for more friends until the host starts the game.
  await expect(host.locator('#mp-code')).toHaveText(code);
  await expect(host.locator('#mp-start')).toBeVisible();
  await host.locator('#mp-start').click();
  await expect(host.locator('#menu')).toBeHidden(); // the menu closes and play begins
  await host.keyboard.press('Escape');
  await expect(host.locator('#mp-share')).toBeHidden(); // the code is gone
  await expect(host.locator('#mp-start')).toBeHidden();

  // A third player with the same code finds the game closed.
  const stranger = await open(browser, '/');
  await joinWithCode(stranger, code);
  await expect(stranger.locator('#mp-note')).toContainText(/isn.t open/);
  await stranger.context().close(); // free the machine for the rest of the test

  // The game runs behind the open menu: the friend's input reaches the host, and the host's world (here the
  // friend's own MP, which only the host tracks) comes back in snapshots.
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

/** The pack grid's filled slots, in the open inventory. */
const carried = (page: Page) => page.locator('#menu-inventory .inv-grid.pack .slot:not(.empty)');

/** Open the inventory, take off or drop the worn cloak, and close it again. */
async function dropCloak(page: Page) {
  await page.keyboard.press('KeyI');
  await expect(page.locator('#menu-inventory .inv-grid.worn [data-worn="cape"]:not(.empty)')).toBeVisible();
  await page.locator('#menu-inventory [data-worn="cape"]').click();
  await page.locator('#menu-inventory [data-action="drop"]').click();
  await expect(page.locator('#menu-inventory [data-worn="cape"].empty')).toBeVisible();
  await page.keyboard.press('KeyI');
  await expect(page.locator('#menu')).toBeHidden();
}

test('both players can drop items and pick them up, and the host decides what is on the ground', async ({
  browser,
}) => {
  const host = await open(browser, '/');
  const code = await createGame(host);
  const join = await open(browser, '/');
  await joinWithCode(join, code);
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2', { timeout: 30_000 });
  await host.locator('#mp-start').click();
  await expect(host.locator('#menu')).toBeHidden();
  await join.keyboard.press('Escape');
  await expect(join.locator('#menu')).toBeHidden();

  // The friend drops their cloak: it is gone from their body (the host did it, and the guest agrees)...
  await dropCloak(join);
  // ...and lying a step ahead of them, so the action key puts it in their pack.
  await join.keyboard.press('Space');
  await join.keyboard.press('KeyI');
  await expect(carried(join)).toHaveCount(1, { timeout: 15_000 });
  await join.keyboard.press('KeyI');

  // The host drops theirs; the friend, standing close by, can pick that up too.
  await dropCloak(host);
  await join.keyboard.press('Space');
  await join.keyboard.press('KeyI');
  await expect(carried(join)).toHaveCount(2, { timeout: 15_000 });
  await expect(join.locator('#menu-inventory .inv-col h3 small').last()).toHaveText('2 / 10');
  await host.keyboard.press('KeyI');
  await expect(carried(host)).toHaveCount(0); // the host's pack never got it
});

test('up to four players: friends join, leave, and a new friend takes the empty seat', async ({ browser }) => {
  test.setTimeout(420_000); // five browser pages, and ICE gathering waits up to 10 s per seat when the STUN server is unreachable
  const host = await open(browser, '/');
  const code = await createGame(host);

  const first = await open(browser, '/');
  await joinWithCode(first, code);
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2', { timeout: 30_000 });

  const second = await open(browser, '/');
  await joinWithCode(second, code);
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2 and Player 3', {
    timeout: 30_000,
  });
  await expect(second.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 1 (host)', {
    timeout: 30_000,
  });
  // Each friend sits in their own seat, and the host sees all three players at the table.
  await expect(seat(first, 1)).toHaveAttribute('data-state', 'you');
  await expect(seat(second, 2)).toHaveAttribute('data-state', 'you');
  await expect(seat(host, 1)).toHaveAttribute('data-state', 'connected');
  await expect(seat(host, 2)).toHaveAttribute('data-state', 'connected');
  await expect(seat(host, 3)).toHaveAttribute('data-state', 'waiting');
  await expect(host.locator('#mp-code')).toHaveText(code); // still open: one seat left

  // Each friend is a separate player on the host: the second friend's spells spend their own MP, not the first's.
  await first.keyboard.press('Escape');
  await second.keyboard.press('Escape');
  await expect(second.locator('#hud-mp .label')).toHaveText('20 / 20');
  await second.keyboard.press('KeyK');
  await expect(second.locator('#hud-mp .label')).not.toHaveText('20 / 20');
  await expect(first.locator('#hud-mp .label')).toHaveText('20 / 20');

  // The first friend leaves: the game goes on for everyone else, and the seat opens up again.
  await first.keyboard.press('Escape');
  await first.locator('#mp-disconnect').click();
  await expect(first.locator('#mp-status .label')).toHaveText('Disconnected');
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 3', { timeout: 30_000 });
  await expect(host.locator('#mp-status .label')).toHaveText('Connected');
  await expect(second.locator('#mp-status .label')).toHaveText('Connected'); // not disturbed
  await expect(seat(host, 1)).toHaveAttribute('data-state', 'waiting', { timeout: 30_000 });
  await first.context().close();

  // A newcomer with the same code takes the vacated seat (so they are Player 2 again), and becomes player 4 only when
  // the others are taken.
  const newcomer = await open(browser, '/');
  await joinWithCode(newcomer, code);
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2 and Player 3', {
    timeout: 30_000,
  });
  await expect(seat(newcomer, 1)).toHaveAttribute('data-state', 'you');
  await newcomer.keyboard.press('Escape');
  await newcomer.keyboard.press('KeyK');
  await expect(newcomer.locator('#hud-mp .label')).not.toHaveText('20 / 20');

  // Fill the last seat: the code closes by itself.
  const last = await open(browser, '/');
  await joinWithCode(last, code);
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2, Player 3 and Player 4', {
    timeout: 30_000,
  });
  await expect(host.locator('#mp-share')).toBeHidden(); // full: nobody else can come
  await expect(host.locator('#mp-start')).toBeHidden();
  await expect(seat(last, 3)).toHaveAttribute('data-state', 'you');

  // The co-op map shows a pin for every other player, each in their own colour, and a legend naming them.
  await last.keyboard.press('Escape'); // close the menu
  await last.keyboard.press('KeyM');
  await expect(last.locator('#map-overlay')).toBeVisible();
  await expect(last.locator('#map-overlay .pin.friend')).toHaveCount(3, { timeout: 30_000 });
  await expect(last.locator('#map-overlay .legend')).toContainText('You');
  await expect(last.locator('#map-overlay .legend')).toContainText('Player 1');
  await last.keyboard.press('KeyM');

  // The host leaves: the game ends for everyone.
  await host.locator('#mp-disconnect').click();
  for (const friend of [second, newcomer, last]) {
    await expect(friend.locator('#mp-status .label')).toHaveText('Disconnected', { timeout: 20_000 });
  }
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
  test.setTimeout(240_000); // two games, each waiting out ICE gathering when the STUN server is unreachable
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
