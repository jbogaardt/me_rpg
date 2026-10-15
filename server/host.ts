// The autonomous Dungeon Master: run it on any machine with Node and it hosts a game of the deployed page in a headless
// browser, prints the two-word code for the players, and runs the DM's whole job from then on. All WebRTC stays in the
// browser; this script only reads the page's state, decides (router.ts, turn.ts) and taps the DM's controls through the
// page's bot handle (src/scenes/overworld/DmBot.ts, switched on by `?dmbot`). See server/README.md.
//
//   npm run dm-bot                                   # the live site, a new live world
//   npm run dm-bot -- 'http://localhost:4173/?campaign=live&seed=7'
//
// Env: PW_CHROMIUM (a local Chromium), DM_BOT_HEADED=1 to watch, DM_BOT_START=n to begin once n players are in,
// TYPESAFE_API_KEY to route with Jev (jev.ts; without it a mock decides).
// Type `help` in the terminal for the operator's commands.

import { createInterface } from 'node:readline';
import { chromium, type Page } from '@playwright/test';
import { JevRouter } from './jev';
import { MockFallback, MockRouter } from './mocks';
import { MockConjurer, shouldConjure } from './conjure';
import { MockNarrator, beatFor, type Memory } from './narrate';
import { decideCard, type Card, type Move } from './router';
import { SETTLE_MS, nextStep, type Clock, type PageState } from './turn';

const DEFAULT_URL = 'https://jbogaardt.github.io/me_rpg/?campaign=live';
const TICK_MS = 1500;

/** The page's bot handle (DmBot.ts's DmBotApi), as far as this script calls it. */
interface PageBot {
  host(): Promise<string | null>;
  start(): void;
  state(): PageState;
  openInbox(): Card | null;
  open(kind: string): Card | null;
  pick(id: string): boolean;
  dismiss(): void;
  choose(cue: string): { ok: boolean; note: string };
  reply(text: string): boolean;
  say(text: string): boolean;
  looks(): { id: string; name: string }[];
  spawn(person: { name: string; look: string; lines: string[] }): { ok: boolean; note: string };
  goTo(slot: number): void;
}
// `page.evaluate` sends only a function's source, so each call below names the handle itself.
type InPage = { dmBot: PageBot };

const playerName = (slot: number) => `Player ${slot + 1}`;
const log = (...parts: unknown[]) => console.log(new Date().toLocaleTimeString(), ...parts);

function botUrl(given: string | undefined): string {
  const url = new URL(given ?? DEFAULT_URL);
  url.searchParams.set('dmbot', '1');
  return url.toString();
}

/** The DM's job, one step at a time. */
class Dm {
  private clock: Clock = { now: 0, lastHost: -Infinity, lastFollow: -Infinity, lastQuest: 0, settled: 0 };
  /** When each friend at the table connected, and whether they have been announced as in. */
  private friends = new Map<number, { at: number; in: boolean }>();
  private lastCode: string | null = null;
  /** The card last answered: met again unchanged, the answer did nothing, so it is sent away. */
  private answered = '';
  private latest: PageState | null = null;
  private narrator = new MockNarrator();
  private conjurer = new MockConjurer();
  /** People made so far, and when the last was (ms). */
  private made = 0;
  private lastMade = -Infinity;
  private memory: Memory = { prev: null, spoke: 0 };
  private services = {
    router: process.env.TYPESAFE_API_KEY ? new JevRouter() : new MockRouter(() => this.latest?.story?.options ?? []),
    fallback: new MockFallback(),
  };

  constructor(
    private page: Page,
    private startAt: number,
  ) {}

  /** Call the page's handle by name (`page.evaluate` sends only a function's source and plain values). */
  private call<K extends keyof PageBot>(
    name: K,
    ...args: Parameters<PageBot[K]>
  ): Promise<Awaited<ReturnType<PageBot[K]>>> {
    return this.page.evaluate(
      ([n, a]) => {
        const bot = (globalThis as unknown as InPage).dmBot as unknown as Record<string, (...x: unknown[]) => unknown>;
        return bot[n]?.(...a);
      },
      [name, args] as [string, unknown[]],
    ) as Promise<Awaited<ReturnType<PageBot[K]>>>;
  }

  state = () => this.call('state');
  start = () => this.call('start');
  say = (text: string) => this.call('say', text);

  async tick() {
    const s = await this.state();
    this.latest = s;
    this.clock.now = Date.now();
    this.report(s);
    if (await this.narrate(s)) return;
    const step = nextStep(s, this.clock, this.startAt);
    switch (step.kind) {
      case 'host': {
        this.clock.lastHost = this.clock.now;
        const code = await this.call('host');
        if (!code) log('could not open a game (is the relay reachable?); trying again soon');
        return;
      }
      case 'start':
        log('beginning the game');
        await this.start();
        return;
      case 'follow':
        this.clock.lastFollow = this.clock.now;
        log(`going to ${playerName(step.slot)}`);
        await this.call('goTo', step.slot);
        return;
      case 'card':
        if (s.card) await this.answer(s.card, s);
        return;
      case 'inbox': {
        const card = await this.call('openInbox');
        if (card) await this.answer(card, s);
        return;
      }
      case 'quest': {
        this.clock.lastQuest = this.clock.now;
        const card = await this.call('open', 'next');
        if (card) await this.answer(card, s);
        return;
      }
      case 'idle':
        return;
    }
  }

  /** Speak up on a moment worth a word (narrate.ts); true when it did. */
  private async narrate(s: PageState): Promise<boolean> {
    const m = this.memory;
    // The clock starts when the table does, and the game's own welcome counts as the DM's first word.
    if (!m.spoke || s.lobbyOpen) m.spoke = this.clock.now;
    const beat = beatFor(s, m, this.clock.now);
    m.prev = s;
    if (!beat) return false;
    const line = await this.narrator.line(beat);
    if (!line) return false;
    m.spoke = this.clock.now;
    log(`narrating (${beat.kind}):`, line);
    await this.say(line);
    if (shouldConjure(beat, this.made, this.clock.now - this.lastMade)) await this.conjure(s);
    return true;
  }

  /** Bring a stranger into the story, near the party. */
  private async conjure(s: PageState) {
    this.lastMade = this.clock.now;
    const looks = await this.call('looks');
    const person = await this.conjurer.person({ area: s.area, looks, made: this.made });
    if (!person) return;
    const result = await this.call('spawn', person);
    if (!result.ok) return log('could not bring in', person.name + ':', result.note);
    this.made++;
    log(`brought in ${person.name} (${looks.find((l) => l.id === person.look)?.name ?? person.look})`);
    await this.say(`Hm, someone is near. Seek out ${person.name}; I think they have been waiting for you.`);
  }

  private async answer(card: Card, s: PageState) {
    const key = JSON.stringify(card);
    if (key === this.answered) {
      await this.call('dismiss');
      this.answered = '';
      return;
    }
    const move = await decideCard(card, s, this.services);
    log(`card “${card.title}”${card.note ? ` (${card.note})` : ''} →`, describe(move, card));
    if (move.reply) await this.call('reply', move.reply);
    if (move.road) {
      const chosen = await this.call('choose', move.road);
      if (!chosen.ok) log('the page refused the road:', chosen.note);
    }
    if (move.pick) await this.call('pick', move.pick);
    if (move.road || !move.pick) await this.call('dismiss');
    this.answered = move.pick ? key : '';
  }

  /** Say what changed at the table. */
  private report(s: PageState) {
    if (s.code !== this.lastCode) {
      if (s.code) log(`GAME CODE: ${s.code}   (players: Menu > Online > Join, and type it)`);
      else if (this.lastCode) log('the code is closed');
      this.lastCode = s.code;
    }
    const here = new Set(s.friends.map((f) => f.slot));
    for (const slot of here) if (!this.friends.has(slot)) this.friends.set(slot, { at: this.clock.now, in: false });
    for (const [slot, f] of this.friends) {
      if (!here.has(slot)) {
        this.friends.delete(slot);
        if (f.in) log(`${playerName(slot)} left`);
      } else if (!f.in && this.clock.now - f.at >= SETTLE_MS) {
        f.in = true;
        log(`${playerName(slot)} is in`);
      }
    }
    this.clock.settled = [...this.friends.values()].filter((f) => f.in).length;
  }
}

function describe(move: Move, card: Card): string {
  const label = card.options.find((o) => o.id === move.pick)?.label;
  const what = move.road ? `road ${move.road}` : label ? `“${label}”` : 'nothing';
  const sure = move.confidence === null ? '' : ` ${(move.confidence * 100).toFixed(0)}%`;
  return `${what} [${move.source}${sure}]${move.reply ? ` reply: ${move.reply}` : ''}`;
}

/** The operator's terminal: begin the game, speak as the DM, look at the table. */
function console_(dm: Dm, stop: () => void) {
  const help = 'commands: start | say <words> | status | quit';
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const [command = '', ...rest] = line.trim().split(/\s+/);
    const run = async () => {
      if (command === 'start') await dm.start();
      else if (command === 'say') await dm.say(rest.join(' '));
      else if (command === 'status') {
        const s = await dm.state();
        const friends = s.friends.map((f) => `${playerName(f.slot)} in ${f.area} (${Math.round(f.hp * 100)}%)`);
        log(
          `${s.lobbyOpen ? `lobby open, code ${s.code}` : 'playing'}; DM in ${s.area}; ${friends.join(', ') || 'nobody'}`,
        );
        log(`inbox ${s.waiting}, quest ${s.questing ? 'running' : 'none'}, story ${s.story?.title ?? 'none'}`);
      } else if (command === 'quit') stop();
      else if (command) log(help);
    };
    run().catch((err: unknown) => log('command failed:', err));
  });
  log(help);
}

async function main() {
  const url = botUrl(process.argv[2]);
  const startAt = Number(process.env.DM_BOT_START ?? 0) || 0;
  const browser = await chromium.launch({
    headless: !process.env.DM_BOT_HEADED,
    executablePath: process.env.PW_CHROMIUM || undefined,
    // As playwright.config.ts: software WebGL for the game, and plain-IP WebRTC candidates.
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', (err) => log('page error:', err.message));

  log(process.env.TYPESAFE_API_KEY ? 'deciding with Jev' : 'no TYPESAFE_API_KEY: deciding with the mock router');
  log('opening', url);
  await page.goto(url);
  // A live world without a seed reloads once with one, so wait for the handle rather than for the first load.
  await page.waitForFunction(() => 'dmBot' in globalThis, null, { timeout: 120_000 });

  const dm = new Dm(page, startAt);
  let stopped = false;
  const stop = () => {
    stopped = true;
    void browser.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console_(dm, stop);
  log(startAt ? `the game begins once ${startAt} player(s) are in` : 'type `start` once your players are in');

  // One step at a time: each waits for the last, so two decisions never race on the same card.
  while (!stopped) {
    await dm.tick().catch((err: unknown) => log('tick failed:', err));
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
