// The autonomous Dungeon Master: a headless browser that hosts a game of the deployed page, hears each friend's request
// to the DM and answers it through the page's bot handle (src/scenes/overworld/DmBot.ts, switched on by `?dmbot`). All
// WebRTC stays in the browser; Node only decides (router.ts) and calls back into the page. See server/README.md.
//
//   npm run dm-bot                                   # the live site, a new live world
//   npm run dm-bot -- 'http://localhost:4173/?campaign=live&seed=7'
//
// Env: PW_CHROMIUM (a local Chromium, e.g. /opt/pw-browsers/chromium-*/chrome-linux/chrome), DM_BOT_HEADED=1 to watch.

import { chromium, type Page } from '@playwright/test';
import { MockFallback, MockRouter } from './mocks';
import { evaluateAction, type TableState } from './router';

const DEFAULT_URL = 'https://jbogaardt.github.io/me_rpg/?campaign=live';
/** How often the bot checks that its game code still works (the relay forgets an idle code after ten minutes). */
const WATCH_MS = 30_000;

/** The page's bot handle (DmBot.ts's DmBotApi), as far as this script calls it. */
interface PageBot {
  host(): Promise<string | null>;
  state(): TableState & { role: string; code: string | null };
  choose(cue: string): { ok: boolean; note: string };
  reply(slot: number, text: string): boolean;
}
// Runs in the page: `page.evaluate` sends only a function's source, so each one names the handle itself.
type InPage = { dmBot: PageBot };

function botUrl(given: string | undefined): string {
  const url = new URL(given ?? DEFAULT_URL);
  url.searchParams.set('dmbot', '1');
  return url.toString();
}

const roadsOf = (state: TableState) => state.story?.options ?? [];

async function main() {
  const url = botUrl(process.argv[2]);
  const browser = await chromium.launch({
    headless: !process.env.DM_BOT_HEADED,
    executablePath: process.env.PW_CHROMIUM || undefined,
    // As playwright.config.ts: software WebGL for the game, and plain-IP WebRTC candidates.
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', (err) => console.error('page error:', err.message));

  // One action at a time, in the order they came: a decision may change the roads the next one is weighed against.
  let latest: TableState | null = null;
  const services = {
    router: new MockRouter(() => roadsOf(latest ?? { area: '', friends: [], story: null })),
    fallback: new MockFallback(),
  };
  let queue = Promise.resolve();
  await page.exposeBinding('onPlayerAction', (_source, slot: number, text: string, state: TableState) => {
    queue = queue
      .then(() => act(page, slot, text, state))
      .catch((err: unknown) => console.error('action failed:', err));
    async function act(page: Page, slot: number, text: string, state: TableState) {
      latest = state;
      const decision = await evaluateAction(state, text, services);
      console.log(`player ${slot + 1}: “${text}” → ${decision.source}`, decision.cue ?? '', decision.confidence ?? '');
      if (decision.cue) {
        const chosen = await page.evaluate((cue) => (globalThis as unknown as InPage).dmBot.choose(cue), decision.cue);
        if (!chosen.ok) console.warn('the page refused the road:', chosen.note);
      }
      await page.evaluate(([s, words]) => (globalThis as unknown as InPage).dmBot.reply(s, words), [
        slot,
        decision.reply,
      ] as const);
    }
  });

  console.log('opening', url);
  await page.goto(url);
  // A live world without a seed reloads once with one, so wait for the handle rather than for the first load.
  await page.waitForFunction(() => 'dmBot' in globalThis, null, { timeout: 120_000 });

  const host = async () => {
    const code = await page.evaluate(() => (globalThis as unknown as InPage).dmBot.host());
    console.log(code ? `game code: ${code}` : 'could not open a game (relay unreachable?)');
  };
  await host();
  // A friend can only join while the code works: open a new one when it lapses and nobody is at the table.
  setInterval(() => {
    void page
      .evaluate(() => (globalThis as unknown as InPage).dmBot.state())
      .then((state) => (!state.code && state.friends.length === 0 ? host() : undefined))
      .catch((err: unknown) => console.error('watch failed:', err));
  }, WATCH_MS);

  const stop = () => void browser.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
