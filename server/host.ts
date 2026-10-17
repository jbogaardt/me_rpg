// The autonomous Dungeon Master: run it on any machine with Node and it hosts a game of the deployed page in a headless
// browser, prints the two-word code for the players, and runs the DM's whole job from then on. All WebRTC stays in the
// browser; this script only reads the page's state, decides (router.ts, turn.ts) and taps the DM's controls through the
// page's bot handle (src/scenes/overworld/DmBot.ts, switched on by `?dmbot`). See server/README.md.
//
//   npm run dm-bot                                   # the live site, a new live world
//   npm run dm-bot -- 'http://localhost:4173/?campaign=live&seed=7'
//
// Env: PW_CHROMIUM (a local Chromium), DM_BOT_HEADED=1 to watch, DM_BOT_START=n to begin once n players are in,
// TYPESAFE_API_KEY to route with Jev (jev.ts; without it a mock decides), DM_BOT_CLAUDE=1 to word replies, narration
// and new people with a headless Claude Code session (claude.ts; your own login, no key).
// Type `help` in the terminal for the operator's commands.

import { createInterface } from 'node:readline';
import { chromium, type Page } from '@playwright/test';
import { JevReader, JevRouter, JevScene } from './jev';
import { MockFallback, MockRouter } from './mocks';
import { ClaudeArcWriter, ClaudeConjurer, ClaudeFallback, ClaudeNarrator, ClaudeEpicWriter } from './claude';
import {
  MockArcWriter,
  advance,
  arcBrief,
  stepFinale,
  watchFinale,
  type ArcPlace,
  type ArcWriter,
  type Finale,
} from './arc';
import { MockConjurer, shouldConjure, type Conjurer } from './conjure';
import { MockNarrator, beatFor, type Memory, type Narrator } from './narrate';
import { RuleJudge, factsFor, resolveScene, type SceneJudge } from './scene';
import { PULSE_MS, RetryingReader, fresh, pulseState, type Pulse, type TableReader } from './pulse';
import { decideCard, type Card, type Move } from './router';
import { MockEpicWriter, tellEpic, type StockTale, type EpicWriter } from './epics';
import { SETTLE_MS, followLine, heldCard, nextStep, type Clock, type PageState, type Pressure } from './turn';

const DEFAULT_URL = 'https://jbogaardt.github.io/me_rpg/?campaign=live';
const TICK_MS = 1500;
/** The creative tier through a headless Claude Code session (claude.ts) instead of the mocks. */
/** Lands a world should have grown to before a saga is told in it (a saga sets its steps in lands away from the start). */
const MIN_LANDS = 3;
const CLAUDE = Boolean(process.env.DM_BOT_CLAUDE);
/** Unprompted remarks (the DM talking over the saga) are off unless asked for: a player can ask when they want the story again. */
const CHATTER = Boolean(process.env.DM_BOT_CHATTER);

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
  say(text: string, near?: boolean, slots?: number[]): boolean;
  looks(): { id: string; name: string }[];
  stockEpics(): StockTale[];
  epic(raw: unknown): { ok: boolean; note: string };
  spawn(person: { name: string; look: string; lines: string[] }): { ok: boolean; note: string };
  /** Write on the signpost beside the DM (a page per line; none restores it). Live worlds only. */
  sign(lines: string[]): { ok: boolean; note: string };
  goTo(slot: number): void;
  walk(dx: number, dy: number, seconds: number): void;
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
  /** The DM's last words to players (replies and narration), so the writer does not repeat itself. */
  private said: string[] = [];
  private latest: PageState | null = null;
  /** The last pressure the DM set (turn up the heat / ease off), so the opposite card is not answered straight away. */
  private pressure: Pressure | null = null;
  private narrator: Narrator = CLAUDE ? new ClaudeNarrator() : new MockNarrator();
  private conjurer: Conjurer = CLAUDE ? new ClaudeConjurer() : new MockConjurer();
  /** People made so far, and when the last was (ms). */
  private writer: EpicWriter = CLAUDE ? new ClaudeEpicWriter() : new MockEpicWriter();
  /** Ids of the epics told so far. */
  private told: string[] = [];
  /** The saga last told, for the next to build on. */
  private lastSaga: { title: string; ending: string } | null = null;
  /** The evening's tale and the chapter the next saga tells (arc.ts); written when the first saga is. */
  private arcWriter: ArcWriter = CLAUDE ? new ClaudeArcWriter() : new MockArcWriter();
  private arc: ArcPlace | null = null;
  /** The last chapter's saga being watched, so the tale gets its closing words when it is won (arc.ts). */
  private finale: Finale | null = null;
  private made = 0;
  private lastMade = -Infinity;
  private memory: Memory = { prev: null, spoke: 0 };
  /** The fast model's read of the table, now and then (pulse.ts); null without a key, and the timers decide. */
  private reader: TableReader | null = process.env.TYPESAFE_API_KEY ? new RetryingReader(new JevReader()) : null;
  private pulse: Pulse | null = null;
  private reading = false;
  /** Jev's read of a moment's drama (scene.ts) with a key; the rules' own without one. */
  private judge: SceneJudge = process.env.TYPESAFE_API_KEY ? new JevScene() : new RuleJudge();
  private lastRead = -Infinity;
  private services = {
    router: process.env.TYPESAFE_API_KEY ? new JevRouter() : new MockRouter(() => this.latest?.story?.options ?? []),
    fallback: CLAUDE ? new ClaudeFallback() : new MockFallback(),
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
  say = (text: string, near = false, slots?: number[]) => this.call('say', text, near, slots);

  async tick() {
    const s = await this.state();
    this.latest = s;
    this.clock.now = Date.now();
    this.report(s);
    this.refresh(s);
    this.clock.pulse = fresh(this.pulse, this.clock.now);
    if (this.finale) {
      const end = stepFinale(this.finale, { epic: s.epic, epicsDone: s.epicsDone ?? 0 });
      this.finale = end.next;
      if (end.say) {
        log('the tale ends:', end.say);
        await this.say(end.say);
      }
    }
    const prev = this.memory.prev;
    if (prev && (prev.epic || prev.questing) && !s.epic && !s.questing) this.clock.lastEnded = this.clock.now;
    if (!CHATTER) this.memory.prev = s; // narrate() keeps it otherwise
    if (CHATTER && (await this.narrate(s))) return; // unprompted remarks are off: the sagas speak, and a player can ask
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
        log(followLine(s, step.slot, playerName));
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
        await this.tell(s); // an epic of people and places; when none can be told here, the party is left to explore
        return;
      }
      case 'stroll':
        await this.call('walk', step.dx, step.dy, 2); // held past the next tick, so the walk is unbroken
        return;
      case 'idle':
        return;
    }
  }

  /** Read the table in the background (never makes a tick wait); a failed read leaves the timers in charge. */
  private refresh(s: PageState) {
    const now = this.clock.now;
    if (!this.reader || this.reading || !s.dm || !s.friends.length || s.lobbyOpen || now - this.lastRead < PULSE_MS)
      return;
    this.reading = true;
    this.lastRead = now;
    const state = pulseState(s, this.memory.spoke, this.clock.lastQuest, now);
    void this.reader
      .read(state)
      .then((read) => {
        this.pulse = { ...read, at: Date.now() };
        const pct = (n: number) => `${Math.round(n * 100)}%`;
        log(
          `table: pressure ${pct(read.pressure)}, stalled ${pct(read.stalled)}, word ${pct(read.wantsWord)}, quest ${pct(read.needsQuest)}`,
        );
      })
      .catch((err: unknown) => console.warn('table read failed', err instanceof Error ? err.message : err))
      .finally(() => (this.reading = false));
  }

  /** Speak up on a moment worth a word (narrate.ts); true when it did. */
  private async narrate(s: PageState): Promise<boolean> {
    const m = this.memory;
    // The clock starts when the table does, and the game's own welcome counts as the DM's first word.
    if (!m.spoke || s.lobbyOpen) m.spoke = this.clock.now;
    const beat = beatFor(s, m, this.clock.now, this.clock.pulse ?? null);
    m.prev = s;
    if (!beat) return false;
    const hp = beat.kind === 'hurt' ? s.friends.find((f) => f.slot === beat.slot)?.hp : undefined;
    const facts = factsFor(beat, hp);
    const verdict = facts ? await resolveScene(facts, this.judge) : undefined;
    if (verdict)
      log(`scene: ${verdict.dramatic_tension}, ${verdict.environmental_twist}, ${verdict.npc_reaction_state}`);
    const line = await this.narrator.line(beat, verdict);
    if (!line) return false;
    m.spoke = this.clock.now;
    log(`narrating (${beat.kind}):`, line);
    this.said = [...this.said, line].slice(-RECENT);
    // What the DM remarks on is about where a friend stands: said to that friend and whoever stands in the same land.
    const who = 'slot' in beat ? s.friends.find((f) => f.slot === beat.slot) : undefined;
    const slots = who ? s.friends.filter((f) => f.zone === who.zone).map((f) => f.slot) : undefined;
    await this.say(line, !who, slots);
    if (shouldConjure(beat, this.made, this.clock.now - this.lastMade)) await this.conjure(s);
    return true;
  }

  /** Begin an epic (epics.ts); false when none could be told here (the caller offers a plain quest). */
  private async tell(s: PageState): Promise<boolean> {
    // A saga travels, so the world must have somewhere to go: open the next road of the story first while it is small.
    if (s.story && !s.story.complete && s.story.placed.length < MIN_LANDS && s.story.options.length) {
      const card = await this.call('open', 'story');
      if (card) await this.answer(card, s);
      s = await this.state();
    }
    const page = {
      teller: { epic: (raw: unknown) => this.call('epic', raw) },
      looks: await this.call('looks'),
      stock: await this.call('stockEpics'),
    };
    if (!this.arc) {
      const arc = await this.arcWriter.write({
        area: s.area,
        ...(this.lastSaga ? { after: this.lastSaga.ending } : {}),
      });
      if (arc) {
        this.arc = { arc, chapter: 0 };
        log(`the evening's tale: “${arc.title}” (${arc.chapters.length} chapters)`);
      }
    }
    const brief = this.arc ? arcBrief(this.arc) : undefined;
    const told = await tellEpic(this.writer, page, s.area, this.told, this.lastSaga ?? undefined, brief);
    if (!told) return false;
    this.told.push(told.id);
    this.lastSaga = { title: told.title, ending: told.ending };
    this.narrator.setSaga?.(`${brief ? `${brief} ` : ''}The saga now: ${told.title}. ${told.opening}`);
    log(
      `telling “${told.title}”${this.arc ? ` (chapter ${this.arc.chapter + 1} of ${this.arc.arc.chapters.length})` : ''}`,
    );
    if (this.arc) {
      const next = advance(this.arc);
      // the tale is told: the next saga begins a new one, grown from this; the DM closes this one when the saga is won
      if (next === 'done' && this.arc) this.finale = watchFinale(this.arc.arc, s.epicsDone ?? 0);
      this.arc = next === 'done' ? null : next;
    }
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
    await this.say(`Hm, someone is near. Seek out ${person.name}; I think they have been waiting for you.`, true);
  }

  private async answer(card: Card, s: PageState) {
    const key = JSON.stringify(card);
    if (key === this.answered) {
      await this.call('dismiss');
      this.answered = '';
      return;
    }
    if (heldCard(card, this.pressure, this.clock.now)) {
      log(`card “${card.title}” → held (the opposite was answered a moment ago)`);
      await this.call('dismiss');
      return;
    }
    const move = await decideCard(card, s, this.services, this.said);
    log(`card “${card.title}”${card.note ? ` (${card.note})` : ''} →`, describe(move, card));
    if (move.reply) {
      this.said = [...this.said, move.reply].slice(-RECENT);
      await this.call('reply', move.reply);
    }
    if (move.road) {
      const chosen = await this.call('choose', move.road);
      if (!chosen.ok) log('the page refused the road:', chosen.note);
    }
    if (move.pick) await this.call('pick', move.pick);
    if (move.road || !move.pick) await this.call('dismiss');
    this.answered = move.pick ? key : '';
    if (move.pick === 'heat' || move.pick === 'ease') this.pressure = { id: move.pick, at: this.clock.now };
  }

  /** Say what changed at the table. */
  private report(s: PageState) {
    if (s.code !== this.lastCode) {
      if (s.code) log(`GAME CODE: ${s.code}   (players: Menu > Online > Join, and type it)`);
      else if (this.lastCode)
        log('the game code is gone (the relay forgot it); friends already in carry on, no one new can join with it');
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

/** How many of the DM's last words the writer is shown (and refused to repeat). */
const RECENT = 8;

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
  // The window was closed (or crashed): there is no table to run any more, so stop rather than fail every tick.
  browser.on('disconnected', () => {
    log('the browser closed: stopping');
    process.exit(0);
  });
  page.on('close', () => {
    log('the page closed: stopping');
    void browser.close().finally(() => process.exit(0));
  });

  log(CLAUDE ? 'wording with headless Claude Code' : 'wording with stock lines (DM_BOT_CLAUDE=1 for Claude)');
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
