import { expect, test, type Browser, type Page } from '@playwright/test';

// Real browser contexts play together: the host (the game's Dungeon Master) creates a game and reads out its short code, a friend
// types it (or opens a join link), the two swap connection details through the relay (a local copy of the Cloudflare
// one, see playwright.config.ts), and the WebRTC data channel then opens directly between them.

// Each page runs the game on a software renderer and a game setup waits for ICE gathering (up to 10 s per side when
// the STUN server is unreachable), so these need more than Playwright's 30 s default, especially in parallel.
// They also run one after another rather than in parallel: the four-player test alone keeps five of these pages busy.
test.describe.configure({ mode: 'default', timeout: 120_000 });

/** A phone: a narrow touch screen, so the on-screen pad and buttons show and the DM's tools lay out for a thumb. */
async function openPhone(browser: Browser, url: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
  ).newPage();
  await page.goto(url);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90_000 });
  return page;
}

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

/** Start recording every line the dialog box says on this page (it shows each for only a few seconds). */
async function watchDialog(page: Page) {
  await page.evaluate(() => {
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    for (const id of ['dialog-text', 'dm-caption-text']) {
      const text = document.getElementById(id)!;
      new MutationObserver(() => {
        if (text.textContent) said.push(text.textContent);
      }).observe(text, { childList: true, characterData: true, subtree: true });
    }
  });
}

/** The DM's words reached this page: a conversation in the way (a defeat, a brief) is read through first, as a player would. */
async function asideSays(page: Page, words: string) {
  await expect
    .poll(
      async () => {
        if ((await page.locator('#dialog:not([hidden])').count()) > 0) await page.keyboard.press('KeyJ');
        return page.evaluate(() => (window as unknown as { __said: string[] }).__said.join('\n'));
      },
      { timeout: 45_000, intervals: [200] },
    )
    .toContain(words);
}

test('two players connect with a game code, play, and disconnect', async ({ browser }) => {
  const host = await open(browser, '/');
  await expect(host.locator('#map-btn')).toBeVisible(); // the map works in solo too (cbd2cf0)
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
  await expect(join.locator('#mp-active .mp-connected')).toHaveText('Connected to the Dungeon Master (host)', {
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
  // Hosting is running the world as its Dungeon Master: no bars of their own, and a Party tab instead of the hero's.
  await expect(host.locator('#hud-dm')).toBeVisible();
  await expect(host.locator('#hud-stats')).toBeHidden();
  await host.keyboard.press('Escape');
  await expect(host.locator('#menu [data-tab="inventory"]')).toBeHidden();
  await expect(host.locator('#menu [data-tab="party"]')).toBeVisible();
  await expect(host.locator('#mp-share')).toBeVisible(); // the code stays up: a dropped friend rejoins with it
  await expect(host.locator('#mp-start')).toBeHidden();
  await host.locator('#menu [data-tab="party"]').click();
  await expect(host.locator('#menu-party li[data-slot="1"]')).toContainText('Player 2', { timeout: 15_000 });
  await host.locator('#menu [data-tab="online"]').click();

  // A third player with the same code finds the game closed.
  const stranger = await open(browser, '/');
  await joinWithCode(stranger, code);
  await expect(stranger.locator('#mp-note')).toContainText(/isn.t open/);
  await stranger.context().close(); // free the machine for the rest of the test

  // The game runs behind the open menu.
  await join.keyboard.press('Escape'); // close the menu
  await expect(join.locator('#menu')).toBeHidden();
  await expect(join.locator('#hud-mp .label')).toHaveText('20 / 20');

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
  // The map works solo too, so it stays; the friend's pin goes.
  await expect(join.locator('#map-btn')).toBeVisible();
  await expect(join.locator('#map-overlay .pin.friend')).toHaveCount(0);
  await join.keyboard.press('Escape');
  await expect(join.locator('#menu-online')).toBeVisible();
  await expect(join.locator('#mp-note')).toContainText('disconnected');
  await join.keyboard.press('Escape');
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

/** The host creates a game, two friends join it, and the host starts it: the three pages, the menus closed. */
async function threeAtTheTable(browser: Browser): Promise<[Page, Page, Page]> {
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
  await host.locator('#mp-start').click();
  await expect(host.locator('#menu')).toBeHidden();
  for (const friend of [first, second]) {
    await friend.keyboard.press('Escape');
    await expect(friend.locator('#menu')).toBeHidden();
  }
  return [host, first, second];
}

test('players can drop items and pick them up, and the host decides what is on the ground', async ({ browser }) => {
  test.setTimeout(300_000); // three pages
  const [host, first, second] = await threeAtTheTable(browser);

  // A friend drops their cloak: it is gone from their body (the host did it, and the guest agrees)...
  await dropCloak(first);
  // ...and lying a step ahead of them, so the action key puts it in their pack.
  await first.keyboard.press('Space');
  await first.keyboard.press('KeyI');
  await expect(carried(first)).toHaveCount(1, { timeout: 15_000 });
  await first.keyboard.press('KeyI');

  // The other friend drops theirs; the first, standing close by, can pick that up too.
  await dropCloak(second);
  await first.keyboard.press('Space');
  await first.keyboard.press('KeyI');
  await expect(carried(first)).toHaveCount(2, { timeout: 15_000 });
  await expect(first.locator('#menu-inventory .inv-col h3 small').last()).toHaveText('2 / 10');
  await second.keyboard.press('KeyI');
  await expect(carried(second)).toHaveCount(0); // the second friend's pack never got it

  // The Dungeon Master carries nothing: the inventory key opens nothing for them.
  await host.keyboard.press('KeyI');
  await expect(host.locator('#menu')).toBeHidden();
});

test('players next to each other can trade: ask, accept or deny, a shared window, cancel', async ({ browser }) => {
  test.setTimeout(360_000); // three browsers, and the suite runs two workers at once
  const solo = await open(browser, '/');
  await solo.keyboard.press('Escape');
  await expect(solo.locator('#menu [data-tab="trade"]')).toBeHidden(); // trading is for co-op only
  await solo.context().close();
  const [host, friend, other] = await threeAtTheTable(browser);
  await host.keyboard.press('Escape');
  await expect(host.locator('#menu [data-tab="trade"]')).toBeHidden(); // the Dungeon Master does not trade
  await host.keyboard.press('Escape');
  await other.keyboard.press('Escape');
  await expect(other.locator('#menu [data-tab="trade"]')).toBeVisible();
  await other.keyboard.press('Escape');

  // A friend asks from the Trade tab (both stand at the spawn, so they are close enough); the DM is not on the list.
  await friend.keyboard.press('Escape');
  await friend.locator('#menu [data-tab="trade"]').click();
  await expect(friend.locator('#menu-trade button[data-with="0"]')).toHaveCount(0);
  const ask = friend.locator('#menu-trade button[data-with="2"]');
  await expect(ask).toBeEnabled({ timeout: 15_000 });
  await ask.click();
  await expect(friend.locator('#menu')).toBeHidden(); // the menu gets out of the way
  await expect(friend.locator('#trade-request')).toContainText('Waiting for Player 3');
  await expect(other.locator('#trade-request')).toContainText('Player 2 wants to trade', { timeout: 15_000 });

  // Denied: both prompts go away and the asker is told.
  await other.locator('#trade-request [data-reply="no"]').click();
  await expect(friend.locator('#trade-request')).toBeHidden({ timeout: 15_000 });
  await expect(friend.locator('#trade-toast')).toContainText('said no');
  await expect(other.locator('#trade-request')).toBeHidden({ timeout: 15_000 });

  // Asked again and accepted: the trade window opens for both, each seeing the other's offer area.
  await friend.keyboard.press('Escape');
  await friend.locator('#menu [data-tab="trade"]').click();
  await friend.locator('#menu-trade button[data-with="2"]').click();
  await other.locator('#trade-request [data-reply="yes"]').click();
  await expect(other.locator('#trade')).toBeVisible({ timeout: 15_000 });
  await expect(friend.locator('#trade')).toBeVisible({ timeout: 15_000 });
  await expect(other.locator('#trade-title')).toHaveText('Trading with Player 2');
  await expect(friend.locator('#trade-title')).toHaveText('Trading with Player 3');

  // One side accepting is not enough, and the other sees the mark.
  await friend.locator('#trade-accept').click();
  await expect(other.locator('#trade-their-state')).toHaveText('✓ accepted', { timeout: 15_000 });
  await expect(other.locator('#trade')).toBeVisible();

  // Either side can cancel; the window closes for both.
  await other.keyboard.press('Escape');
  await expect(other.locator('#trade')).toBeHidden({ timeout: 15_000 });
  await expect(friend.locator('#trade')).toBeHidden({ timeout: 15_000 });
  await expect(friend.locator('#trade-toast')).toContainText('cancelled');
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
  await expect(second.locator('#mp-active .mp-connected')).toHaveText('Connected to the Dungeon Master (host)', {
    timeout: 30_000,
  });
  // Each friend sits in their own seat, and the host sees all three players at the table.
  await expect(seat(first, 1)).toHaveAttribute('data-state', 'you');
  await expect(seat(second, 2)).toHaveAttribute('data-state', 'you');
  await expect(seat(host, 1)).toHaveAttribute('data-state', 'connected');
  await expect(seat(host, 2)).toHaveAttribute('data-state', 'connected');
  await expect(seat(host, 3)).toHaveAttribute('data-state', 'waiting');
  await expect(host.locator('#mp-code')).toHaveText(code); // still open: one seat left

  await first.keyboard.press('Escape');
  await second.keyboard.press('Escape');

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

  // Fill the last seat: the code closes by itself.
  const last = await open(browser, '/');
  await joinWithCode(last, code);
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2, Player 3 and Player 4', {
    timeout: 30_000,
  });
  await expect(host.locator('#mp-code')).toHaveText(code); // full, but the code stays: a seat that empties is offered again
  await expect(host.locator('#mp-start')).toBeHidden();
  await expect(seat(last, 3)).toHaveAttribute('data-state', 'you');

  // The co-op map shows a pin for every other player, each in their own colour, and a legend naming them.
  await last.keyboard.press('Escape'); // close the menu
  // The M button only shows once this page is really in the game; pressing M earlier (a slow machine) does nothing.
  await expect(last.locator('#map-btn')).toBeVisible({ timeout: 30_000 });
  await last.keyboard.press('KeyM');
  await expect(last.locator('#map-overlay')).toBeVisible();
  await expect(last.locator('#map-overlay .pin.friend')).toHaveCount(3, { timeout: 30_000 });
  await expect(last.locator('#map-overlay .legend')).toContainText('You');
  await expect(last.locator('#map-overlay .legend')).toContainText('Dungeon Master');
  await last.keyboard.press('KeyM');

  // The host leaves: the game ends for everyone.
  await host.locator('#mp-disconnect').click();
  for (const friend of [second, newcomer, last]) {
    await expect(friend.locator('#mp-status .label')).toHaveText('Disconnected', { timeout: 20_000 });
  }
});

test('in a live world the Dungeon Master chooses where the story goes, and the friend’s world grows with it', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const world = '/?campaign=live&seed=4';
  const host = await open(browser, world);
  const code = await createGame(host);
  const friend = await open(browser, world);
  await watchDialog(friend);
  await joinWithCode(friend, code);
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2', { timeout: 30_000 });
  await host.locator('#mp-start').click();
  await friend.keyboard.press('Escape');
  await expect(friend.locator('#dm-bar')).toBeHidden(); // only the DM steers the story and the world

  // The DM opens the game with the story's own welcome, to every screen.
  await asideSays(friend, 'Welcome');

  // The DM has a bar that is always there: no menu to dig through.
  await expect(host.locator('#menu')).toBeHidden();
  await expect(host.locator('#dm-bar')).toBeVisible();
  await expect(host.locator('#dm-bar input')).toBeHidden(); // the tools are folded away: they would cover the action

  // Nothing pops up: a suggestion (the director's, or a friend's request) waits behind a Requests button, and a click on
  // the game sends the card it opens away (nobody hunts for a close button).
  if (await friend.locator('#menu').isVisible()) await friend.keyboard.press('Escape'); // the friend's menu is in the way
  await friend.locator('#req-btn').click();
  await friend.locator('#request input').fill('we are lost');
  await friend.locator('#request input').press('Enter');
  const inbox = host.locator('#dm-hot [data-power="inbox"]');
  await expect(inbox).toBeVisible({ timeout: 30_000 });
  await expect(host.locator('#dm-card')).toBeHidden();
  await inbox.click();
  await expect(host.locator('#dm-card')).toBeVisible();
  expect(await host.locator('#dm-card [data-opt]').count()).toBeGreaterThanOrEqual(2);
  // The DM answers the friend privately, and the card stays up: answering is not deciding.
  await host.locator('#dm-card [data-opt="r:0"]').click();
  await asideSays(friend, 'On my way.');
  await expect(host.locator('#dm-card')).toBeVisible();
  await host.locator('canvas').click({ position: { x: 20, y: 20 } });
  await expect(host.locator('#dm-card')).toBeHidden();

  await host.locator('#dm-bar .handle').click();
  await expect(host.locator('#dm-bar input')).toBeVisible();

  // The DM speaks and the friend reads it.
  await host.locator('#dm-bar input').fill('Beware the fen.');
  await host.locator('#dm-bar form button[type="submit"]').click();
  await asideSays(friend, 'Beware the fen.');

  // The DM stops time with the hotkey, so everyone is told, and starts it again.
  await host.keyboard.press('KeyT');
  await expect(friend.locator('#dm-hold')).toBeVisible({ timeout: 15_000 });
  await host.keyboard.press('KeyT');
  await expect(friend.locator('#dm-hold')).toBeHidden({ timeout: 15_000 });

  // The Story button offers the roads the story may take next, as cues rather than maps (a vote needs two roads to
  // choose between: this world's first step has one, so there is nothing to ask the party).
  await host.locator('#dm-bar [data-power="story"]').click();
  await expect(host.locator('#dm-card .title')).toHaveText('Where does the story go next?');
  const road = host.locator('#dm-card [data-opt]').first();
  await expect(road).toContainText(/^Into \w+ lands/);
  await expect(host.locator('#dm-card [data-opt]')).toHaveCount(1);
  await road.click();
  await expect(host.locator('#dm-card')).toBeHidden();
  await expect(friend.locator('#vote')).toBeHidden();
  // Both pages grow their world to match: the new land is named on each.
  await expect(host.locator('#area-banner .title')).not.toHaveText('', { timeout: 15_000 });
  const land = (await host.locator('#area-banner .title').textContent())!;
  await expect(friend.locator('#area-banner .title')).toHaveText(land, { timeout: 30_000 });

  // The DM begins an epic quest, written onto the land: the friend sees its first step in their tracker (and works out the rest themselves).
  await host.locator('#dm-bar [data-power="epic"]').click();
  await expect(host.locator('#dm-card .title')).toHaveText('Choose an epic quest');
  await host.locator('#dm-card [data-opt^="e:"]').first().click();
  await expect(friend.locator('#quest-tracker')).toContainText(/Hunt|Gather|Reach|Find/, { timeout: 15_000 });
  await expect(host.locator('#hud-dm')).toContainText(/Hunt|Gather|Reach|Find/);

  // The pressure is one dial on the bar, set from a card.
  await host.locator('#dm-bar [data-power="pressure"]').click();
  await host.locator('#dm-card [data-opt="fierce"]').click();
  await expect(host.locator('#dm-bar [data-power="pressure"]')).toHaveText('Pressure: Turn it up');
});

test('the Dungeon Master can run the game from a phone: folded tools, thumb-sized cards, clear of the pad', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const world = '/?campaign=live&seed=4';
  const host = await openPhone(browser, world);
  const code = await createGame(host);
  const friend = await open(browser, world);
  await joinWithCode(friend, code);
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2', { timeout: 30_000 });
  await host.locator('#mp-start').click();
  // A physical key (the menu was opened with one) hides the touch controls; a touch brings them back.
  await host.touchscreen.tap(195, 400);
  await expect(host.locator('#touch-controls')).toBeVisible();
  await expect(host.locator('body')).toHaveClass(/touch-ui/);

  // The nudges start folded away so the screen stays clear (the handle opens them); the big tools are hot buttons, always there.
  const bar = host.locator('#dm-bar');
  const hot = host.locator('#dm-hot');
  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-power="epic"]')).toBeHidden();
  await expect(hot.locator('[data-power="smite"]')).toBeVisible();
  await expect(hot.locator('[data-power="freeze"]')).toBeVisible();
  await expect(host.locator('#inv-btn')).toBeHidden(); // the DM has no inventory
  await expect(host.locator('#btn-a')).toBeHidden(); // and no attack, until they hold a foe
  await bar.locator('.handle').tap();
  await expect(bar.locator('[data-power="epic"]')).toBeVisible();
  await expect(bar.locator('.hint')).toHaveText('Tap a foe to possess it.');
  await expect(hot.locator('[data-power="stop"]')).toContainText('Stop time'); // no key to name on a phone

  // The bar and the pad never cover each other.
  const overlaps = async (a: string, b: string) =>
    host.evaluate(
      ([x, y]) => {
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const [p, q] = [r(x!), r(y!)];
        return p.left < q.right && p.right > q.left && p.top < q.bottom && p.bottom > q.top;
      },
      [a, b],
    );
  expect(await overlaps('#dm-bar', '#dpad')).toBe(false);
  expect(await overlaps('#dm-bar', '#buttons')).toBe(false);
  expect(await overlaps('#dm-hot', '#dpad')).toBe(false);
  expect(await overlaps('#dm-hot', '#buttons')).toBe(false);

  // Time stops from a button (there is no T on a phone), and the friend is told.
  await hot.locator('[data-power="stop"]').tap();
  await expect(host.locator('#dm-hold')).toContainText('Tap Resume time');
  await expect(friend.locator('#dm-hold')).toBeVisible({ timeout: 15_000 });
  await hot.locator('[data-power="stop"]').tap();
  await expect(friend.locator('#dm-hold')).toBeHidden({ timeout: 15_000 });

  // A card is large enough for a thumb, clear of the pad, and the pick works: the friend sees the task.
  await bar.locator('[data-power="epic"]').tap();
  const card = host.locator('#dm-card');
  await expect(card).toBeVisible();
  expect(await overlaps('#dm-card', '#dpad')).toBe(false);
  expect(await overlaps('#dm-card', '#buttons')).toBe(false);
  const first = card.locator('[data-opt^="e:"]').first();
  const height = await first.evaluate((b) => b.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);
  await first.tap();
  await expect(friend.locator('#quest-tracker')).toContainText(/Hunt|Gather|Reach|Find/, { timeout: 15_000 });
});

test('a host picks a story in the lobby and a friend joins with only the code, landing in the same world', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const host = await open(browser, '/');
  await openOnlineTab(host, 'host');
  await host.locator('#mp-story').selectOption('live');
  await host.locator('#mp-pressure').selectOption('fierce');
  await host.locator('#mp-create').click();
  // The page moves to the world they chose and creates the game by itself: nobody types an address.
  await expect(host.locator('#mp-code')).toHaveText(/^[a-z]+-[a-z]+$/, { timeout: 120_000 });
  const hostUrl = new URL(host.url());
  expect(hostUrl.searchParams.get('campaign')).toBe('live');
  const code = (await host.locator('#mp-code').textContent())!;

  // The friend opens the plain game and types the code: they are moved to the host's world and join again there.
  const friend = await open(browser, '/');
  await joinWithCode(friend, code);
  await expect(friend.locator('#mp-active .mp-connected')).toHaveText('Connected to the Dungeon Master (host)', {
    timeout: 180_000,
  });
  const friendUrl = new URL(friend.url());
  expect(friendUrl.searchParams.get('campaign')).toBe('live');
  expect(friendUrl.searchParams.get('seed')).toBe(hostUrl.searchParams.get('seed'));
  expect(friendUrl.hash).toBe('');
  // The friend's first join (from the wrong world) held a seat for a few seconds after it left, so the move may land them
  // in the next seat: either way they are at the table. (Known: the seat number can skip; the join itself must work.)
  await expect(host.locator('#mp-active .mp-connected')).toHaveText(/^Connected to Player [23]$/, { timeout: 60_000 });
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
  await expect(join.locator('#mp-active .mp-connected')).toHaveText('Connected to the Dungeon Master (host)', {
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
