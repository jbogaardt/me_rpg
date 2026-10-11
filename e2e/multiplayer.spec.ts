import { expect, test, type Browser, type Page } from '@playwright/test';

// Two real browser contexts play a 2-player P2P game: the host's offer code goes to the joiner as a join link
// (#offer=...), the joiner's answer code is pasted back, and the WebRTC data channel opens, all with no server.

async function open(browser: Browser, url: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 480 } })).newPage();
  await page.goto(url);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  return page;
}

test('two players connect by exchanging codes, play, and disconnect', async ({ browser }) => {
  test.setTimeout(120_000); // ICE gathering waits up to 10 s per side if the STUN server is unreachable

  // Host: Menu > Online > Host > Generate Host Code
  const host = await open(browser, '/');
  await host.keyboard.press('Escape');
  await host.locator('#menu [data-tab="online"]').click();
  await host.locator('#mp-mode [data-mode="host"]').click();
  await expect(host.locator('#mp-status .label')).toHaveText('Idle');
  await host.locator('#mp-gen-host').click();
  await expect(host.locator('#mp-offer')).not.toHaveValue('', { timeout: 30_000 });
  await expect(host.locator('#mp-status .label')).toHaveText('Awaiting Client');
  const offer = await host.locator('#mp-offer').inputValue();
  expect(offer).toMatch(/^[A-Za-z0-9_-]+$/);

  // Joiner opens the join link: the Online tab is up with the code filled in.
  const join = await open(browser, `/#offer=${offer}`);
  await expect(join.locator('#menu')).toBeVisible();
  await expect(join.locator('#menu-online')).toBeVisible();
  await expect(join.locator('#mp-offer-in')).toHaveValue(offer);
  expect(new URL(join.url()).hash).toBe(''); // the single-use offer is not left in the address bar
  await join.locator('#mp-gen-answer').click();
  await expect(join.locator('#mp-answer')).not.toHaveValue('', { timeout: 30_000 });
  await expect(join.locator('#mp-status .label')).toHaveText('Ready to Share Answer');

  // Host pastes the answer and establishes the connection.
  await host.locator('#mp-answer-in').fill(await join.locator('#mp-answer').inputValue());
  await host.locator('#mp-establish').click();
  await expect(host.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 2', { timeout: 30_000 });
  await expect(join.locator('#mp-active .mp-connected')).toHaveText('Connected to Player 1 (host)', {
    timeout: 30_000,
  });
  await expect(host.locator('#mp-status .label')).toHaveText('Connected');
  await expect(join.locator('#mp-status .label')).toHaveText('Connected');

  // The game runs behind the open menu: the guest's input reaches the host, and the host's world (here the guest's
  // own MP, which only the host tracks) comes back in snapshots.
  await join.keyboard.press('Escape'); // close the menu
  await expect(join.locator('#menu')).toBeHidden();
  await expect(join.locator('#hud-mp .label')).toHaveText('20 / 20');
  await join.keyboard.press('KeyK');
  await expect(join.locator('#hud-mp .label')).not.toHaveText('20 / 20');

  // Disconnect from the host's side: both ends report it and carry on solo.
  await host.locator('#mp-disconnect').click();
  await expect(host.locator('#mp-status .label')).toHaveText('Disconnected');
  await expect(join.locator('#mp-status .label')).toHaveText('Disconnected', { timeout: 15_000 });
  await join.keyboard.press('Escape');
  await expect(join.locator('#menu-online')).toBeVisible();
  await expect(join.locator('#mp-note')).toContainText('disconnected');
  await join.keyboard.press('Escape');
  await join.keyboard.press('KeyK'); // solo again: the player's own simulation casts and spends MP
  await expect(join.locator('#hud-mp .label')).not.toHaveText('20 / 20');
});

test('typing in the code boxes does not drive the game', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.locator('#menu [data-tab="online"]').click();
  await page.locator('#mp-mode [data-mode="join"]').click();
  // Letters that are game keys (A/D switch tabs, I closes the menu, K casts, Q casts).
  await page.locator('#mp-offer-in').click();
  await page.keyboard.type('adikq aaddii');
  await expect(page.locator('#mp-offer-in')).toHaveValue('adikq aaddii');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menu-online')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#hud-mp .label')).toHaveText('20 / 20'); // nothing was cast
});

test('a bad pasted code is explained, not fatal', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.locator('#menu [data-tab="online"]').click();
  await page.locator('#mp-mode [data-mode="join"]').click();
  await expect(page.locator('#mp-gen-answer')).toBeDisabled();
  await page.locator('#mp-offer-in').fill('this is not a code');
  await page.locator('#mp-gen-answer').click();
  await expect(page.locator('#mp-note')).toContainText('not a valid code');
  await expect(page.locator('#mp-status .label')).toHaveText('Idle');
});
