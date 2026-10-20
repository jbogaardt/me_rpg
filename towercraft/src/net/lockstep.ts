// Online play for towercraft: two pages run the SAME deterministic match and swap only what each player does.
//
// The sim (src/sim, no randomness, exact arithmetic) is a pure function of its starting point and the commands applied to it, so
// nothing about the world crosses the wire: a player's click becomes a `Command`, is scheduled `DELAY` ticks ahead and sent to the
// other page; every tick both pages apply the same commands, player 0's first, then player 1's, then step. A tick cannot run until
// the other player's commands for it have arrived (a stall, shown as "waiting"), so the pages never drift. Every `SUM_EVERY` ticks
// each side sends a checksum of the match; a mismatch (a rule that is not deterministic across browsers) ends the game loudly
// instead of letting two different games go on.
//
// A match may have more seats than the two people playing it (co-op: the two are on one side, computers hold the other camps and
// maybe a third ally's). The computers are deterministic too (seeded, reading only the match), so BOTH pages run all of them
// from the same seed and nothing about them crosses the wire; only `snap` (a rejoin) carries their memory (`AiState`).
//
// The cost of this design: both pages hold the whole match (fog of war is drawn, not enforced, so a player who reads the match in
// developer tools sees through it). The channel must be reliable and ordered (`duel.ts` asks for one).
//
// Pixi-free and tested (lockstep.test.ts).

import { createAi, type Ai, type AiState } from '../sim/ai';
import { BOARDS } from '../sim/board';
import {
  newMatch,
  buildTower,
  buyUpgrade,
  garrisonUnits,
  loadBunker,
  repairTower,
  setFocus,
  setLane,
  setOrder,
  setRoute,
  trainUnits,
  upgradeCastle,
  type Focus,
  type Match,
  type Owner,
  type Player,
} from '../sim/sim';

/** What a player can ask of the match, as it travels: everything `main.ts` used to call on the sim directly. */
export type Command =
  | { k: 'build'; id: string; col: number; row: number }
  | { k: 'train'; id: string; n: number }
  | { k: 'bunker'; tower: number; unit: string }
  | { k: 'garrison'; tower: number; ids: number[] }
  | { k: 'order'; what: 'towers' | 'units'; to: 'attack' | 'bypass' }
  | { k: 'focus'; ids: number[]; at?: Focus }
  | { k: 'castle' }
  | { k: 'upgrade'; id: string }
  | { k: 'repair'; tower: number }
  | { k: 'lane'; lane: number }
  | { k: 'route'; ids: number[]; lane: number };

/** Do a command for a player. The sim itself refuses anything the player may not do (money, area, ownership). */
export function apply(m: Match, owner: Owner, c: Command): void {
  switch (c.k) {
    case 'build':
      buildTower(m, owner, c.id, c.col, c.row);
      break;
    case 'train':
      trainUnits(m, owner, c.id, c.n);
      break;
    case 'bunker':
      loadBunker(m, owner, c.tower, c.unit);
      break;
    case 'garrison':
      garrisonUnits(m, owner, c.tower, c.ids);
      break;
    case 'order':
      setOrder(m, owner, c.what, c.to);
      break;
    case 'focus':
      setFocus(m, owner, c.ids, c.at);
      break;
    case 'castle':
      upgradeCastle(m, owner);
      break;
    case 'upgrade':
      buyUpgrade(m, owner, c.id);
      break;
    case 'repair':
      repairTower(m, owner, c.tower);
      break;
    case 'lane':
      setLane(m, owner, c.lane);
      break;
    case 'route':
      setRoute(m, owner, c.ids, c.lane);
      break;
  }
}

/** Ticks between a click and its effect, on both pages (the sim steps 20 times a second: this hides about 200 ms of lag). */
export const DELAY = 4;
/** Ticks between checksums. */
export const SUM_EVERY = 40;
/** The most commands one tick may carry, and how far ahead a message may be (a flood guard, not a game rule). */
const MAX_PER_TICK = 64;
const MAX_AHEAD = 400;

// --- The wire ---

export const NET_VERSION = 4;

export type Message =
  /** The joiner, once connected: who they play. */
  | { t: 'hi'; v: number; race: string }
  /** The host's answer: the map, a race for every seat of it (the host's, the joiner's, then the computers') and the seed the computers play by. Both pages start the match from it at once. */
  | { t: 'go'; v: number; map: string; races: string[]; seed: number }
  /** A player's commands for tick `n` (possibly none: it is also the promise that nothing more is coming for it). */
  | { t: 'tick'; n: number; c: Command[] }
  /** Checksum of the match after `n` ticks. */
  | { t: 'sum'; n: number; h: number }
  /** A rejoining player's way back in: the match as it stands at tick `n`, and the host's commands already settled for the ticks `n`..`c`-1. */
  | { t: 'snap'; n: number; c: number; mine: Command[][]; state: Packed };

const isInt = (v: unknown, min = 0, max = 1_000_000): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 40;
const isIds = (v: unknown): v is number[] => Array.isArray(v) && v.length <= 200 && v.every((x) => isInt(x));

function parseFocus(v: unknown): Focus | undefined | null {
  if (v === undefined) return undefined;
  const o = (v ?? {}) as { kind?: unknown; id?: unknown; owner?: unknown };
  if (o.kind === 'castle') {
    if (o.owner === undefined) return { kind: 'castle' };
    return isInt(o.owner, 0, 3) ? { kind: 'castle', owner: o.owner } : null;
  }
  if (o.kind === 'tower' && isInt(o.id)) return { kind: 'tower', id: o.id };
  return null;
}

export function parseCommand(v: unknown): Command | null {
  const c = (v ?? {}) as Record<string, unknown>;
  switch (c.k) {
    case 'build':
      return isId(c.id) && isInt(c.col, 0, 1000) && isInt(c.row, 0, 1000)
        ? { k: 'build', id: c.id, col: c.col, row: c.row }
        : null;
    case 'train':
      return isId(c.id) && isInt(c.n, 1, 200) ? { k: 'train', id: c.id, n: c.n } : null;
    case 'bunker':
      return isInt(c.tower) && isId(c.unit) ? { k: 'bunker', tower: c.tower, unit: c.unit } : null;
    case 'garrison':
      return isInt(c.tower) && isIds(c.ids) ? { k: 'garrison', tower: c.tower, ids: c.ids } : null;
    case 'order':
      return (c.what === 'towers' || c.what === 'units') && (c.to === 'attack' || c.to === 'bypass')
        ? { k: 'order', what: c.what, to: c.to }
        : null;
    case 'focus': {
      const at = parseFocus(c.at);
      return isIds(c.ids) && at !== null ? (at ? { k: 'focus', ids: c.ids, at } : { k: 'focus', ids: c.ids }) : null;
    }
    case 'castle':
      return { k: 'castle' };
    case 'upgrade':
      return isId(c.id) ? { k: 'upgrade', id: c.id } : null;
    case 'repair':
      return isInt(c.tower) ? { k: 'repair', tower: c.tower } : null;
    case 'lane':
      return isInt(c.lane, 0, 63) ? { k: 'lane', lane: c.lane } : null;
    case 'route':
      return isIds(c.ids) && isInt(c.lane, 0, 63) ? { k: 'route', ids: c.ids, lane: c.lane } : null;
    default:
      return null;
  }
}

/** Read a message off the wire; null for anything that is not one (it never throws). */
export function parseMessage(data: string): Message | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  const m = (raw ?? {}) as Record<string, unknown>;
  switch (m.t) {
    case 'hi':
      return isInt(m.v) && isId(m.race) ? { t: 'hi', v: m.v, race: m.race } : null;
    case 'go': {
      const r = m.races;
      return isInt(m.v) &&
        isId(m.map) &&
        isInt(m.seed, 0, 0x7fffffff) &&
        Array.isArray(r) &&
        r.length >= 2 &&
        r.length <= 4 &&
        r.every(isId)
        ? { t: 'go', v: m.v, map: m.map, races: r, seed: m.seed }
        : null;
    }
    case 'tick': {
      if (!isInt(m.n) || !Array.isArray(m.c) || m.c.length > MAX_PER_TICK) return null;
      const c: Command[] = [];
      for (const x of m.c as unknown[]) {
        const cmd = parseCommand(x);
        if (!cmd) return null;
        c.push(cmd);
      }
      return { t: 'tick', n: m.n, c };
    }
    case 'snap': {
      const mine = m.mine;
      if (
        !isInt(m.n) ||
        !isInt(m.c) ||
        m.c < m.n ||
        m.c - m.n > 64 ||
        !Array.isArray(mine) ||
        mine.length !== m.c - m.n
      )
        return null;
      const settled: Command[][] = [];
      for (const slot of mine as unknown[]) {
        if (!Array.isArray(slot) || slot.length > MAX_PER_TICK) return null;
        const cmds: Command[] = [];
        for (const x of slot as unknown[]) {
          const cmd = parseCommand(x);
          if (!cmd) return null;
          cmds.push(cmd);
        }
        settled.push(cmds);
      }
      const state = parsePacked(m.state);
      return state ? { t: 'snap', n: m.n, c: m.c, mine: settled, state } : null;
    }
    case 'sum':
      return isInt(m.n) && isInt(m.h, 0, 0xffffffff) ? { t: 'sum', n: m.n, h: m.h } : null;
    default:
      return null;
  }
}

export const encode = (m: Message) => JSON.stringify(m);

/** The seed a seat's computer plays by, from the match's (neighbouring seats get unrelated styles: `createAi` scrambles it). */
export const aiSeed = (seed: number, seat: number) => (seed + seat * 1013) | 0;

/** The computers of a match: one for every seat past the people (`people` seats, from seat 0), the same on every page. */
export const makeAis = (m: Match, seed: number, people: number): Ai[] =>
  m.players.flatMap((_, seat) => (seat >= people ? [createAi(seat, aiSeed(seed, seat))] : []));

// --- The match on the wire (a rejoining player) ---

/** The match as plain data: units and towers name their kind by id (the kinds are the game's own tables, the same on both pages). */
export interface Packed {
  board: string;
  time: number;
  payTimer: number;
  nextId: number;
  /** The seed the computers play by and what each remembers (one per seat that is not a person, in seat order). */
  seed: number;
  ai: AiState[];
  players: Player[];
  units: (Omit<Match['units'][number], 'def'> & { def: string })[];
  towers: (Omit<Match['towers'][number], 'def' | 'garrison'> & {
    def: string;
    garrison: { def: string; cooldown: number }[];
  })[];
}

export function packMatch(m: Match, seed = 0, ais: readonly Ai[] = []): Packed {
  return {
    board: m.board.id,
    time: m.time,
    payTimer: m.payTimer,
    nextId: m.nextId,
    seed,
    ai: ais.map((ai) => ai.save()),
    players: JSON.parse(JSON.stringify(m.players)) as Player[],
    units: m.units.map((u) => ({ ...u, def: u.def.id })),
    towers: m.towers.map((t) => ({
      ...t,
      def: t.def.id,
      garrison: t.garrison.map((g) => ({ def: g.def.id, cooldown: g.cooldown })),
    })),
  };
}

/** Rebuild a match from `packMatch`. Throws on anything that does not fit the game's tables (the caller reports it). */
export function unpackMatch(p: Packed): Match {
  const board = BOARDS[p.board];
  if (!board) throw new Error('unknown map');
  if (p.players.length !== board.seats) throw new Error('wrong number of seats');
  const m = newMatch(
    p.players.map((q) => q.race),
    board,
  );
  m.time = p.time;
  m.payTimer = p.payTimer;
  m.nextId = p.nextId;
  m.players = p.players as Match['players'];
  const found = <T extends { id: string }>(list: T[], id: string): T => {
    const x = list.find((y) => y.id === id);
    if (!x) throw new Error(`unknown kind ${id}`);
    return x;
  };
  m.units = p.units.map((u) => ({ ...u, def: found(m.races[m.players[u.owner]!.race].units, u.def) }));
  m.towers = p.towers.map((t) => {
    const race = m.races[m.players[t.owner]!.race];
    return {
      ...t,
      def: found(race.towers, t.def),
      garrison: t.garrison.map((g) => ({ def: found(race.units, g.def), cooldown: g.cooldown })),
    };
  });
  return m;
}

function isAiState(v: unknown): v is AiState {
  const a = (v ?? {}) as Partial<AiState>;
  return (
    typeof a.timer === 'number' &&
    typeof a.lastWave === 'number' &&
    isInt(a.bought, 0, 1e6) &&
    isInt(a.waves, 0, 1e6) &&
    isInt(a.rng, 0, 0xffffffff)
  );
}

function parsePacked(v: unknown): Packed | null {
  const p = (v ?? {}) as Partial<Packed>;
  const ok =
    typeof p.board === 'string' &&
    typeof p.time === 'number' &&
    typeof p.payTimer === 'number' &&
    isInt(p.nextId, 0, 1e9) &&
    isInt(p.seed, 0, 0x7fffffff) &&
    Array.isArray(p.ai) &&
    p.ai.length <= 2 &&
    p.ai.every(isAiState) &&
    Array.isArray(p.players) &&
    p.players.length >= 2 &&
    p.players.length <= 4 &&
    Array.isArray(p.units) &&
    p.units.length <= 1000 &&
    Array.isArray(p.towers) &&
    p.towers.length <= 1000;
  return ok ? (p as Packed) : null;
}

// --- The checksum ---

/** A 32-bit fingerprint of everything that decides the match. Both pages must get the same number at the same tick. */
export function checksum(m: Match): number {
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const mix = (x: number) => {
    buf.setFloat64(0, x);
    for (let i = 0; i < 8; i += 2) h = Math.imul(h ^ buf.getUint16(i), 0x01000193);
  };
  mix(m.time);
  mix(m.payTimer);
  mix(m.nextId);
  mix(m.winner);
  for (const p of m.players)
    for (const x of [p.wood, p.stone, p.castle.hp, p.castle.level, p.lane, p.out ? 1 : 0]) mix(x);
  for (const u of m.units) for (const x of [u.id, u.hp, u.s, u.lane ?? -1, u.off?.d ?? -1]) mix(x);
  for (const t of m.towers) for (const x of [t.id, t.hp, t.col, t.row]) mix(x);
  return h >>> 0;
}

// --- The clock ---

export interface Link {
  send(message: Message): void;
}

/** The two people at the table: the host (seat 0) and the one who joined (seat 1). Computers hold any seats past them. */
export type Person = 0 | 1;

/** One page's half of the shared clock. `you` is this page's player. */
export class Lockstep {
  /** The next tick to run (ticks run so far). */
  tick = 0;
  /** True once the two pages' checksums disagreed. */
  desync = false;
  /** The other player is gone (their connection dropped): their side plays on with no commands, and nothing waits for them. */
  away = false;
  private slots: [Map<number, Command[]>, Map<number, Command[]>] = [
    new Map<number, Command[]>(),
    new Map<number, Command[]>(),
  ];
  private pending: Command[] = [];
  private committed = DELAY; // ticks before this are already settled (empty on both pages: nobody can click before tick 0)
  private mine = new Map<number, number>();
  private theirs = new Map<number, number>();

  constructor(
    readonly you: Person,
    private link: Link,
    private delay = DELAY,
  ) {
    this.committed = delay;
    for (let n = 0; n < delay; n++) {
      this.slots[0].set(n, []);
      this.slots[1].set(n, []);
    }
  }

  /** The player did something: it takes effect `delay` ticks from now on both pages. */
  issue(c: Command) {
    this.pending.push(c);
  }

  /** The other page's commands for tick `n`. Late, repeated or absurd ones are ignored. */
  receive(n: number, commands: Command[]) {
    const slot = this.slots[this.other];
    if (n < this.tick || n > this.tick + MAX_AHEAD || slot.has(n)) return;
    slot.set(n, commands);
  }

  /** The other page's checksum after `n` ticks. */
  receiveSum(n: number, h: number) {
    this.theirs.set(n, h);
    this.compare(n);
  }

  /** The rival dropped (or came back, see `rejoin`). Nothing is compared while they are away. */
  setAway(on: boolean) {
    this.away = on;
    this.mine.clear();
    this.theirs.clear();
  }

  /** The state a rejoining page needs to take the other player's place: the tick, and this player's settled commands from it on. */
  snapshot(): { n: number; c: number; mine: Command[][] } {
    const mine: Command[][] = [];
    for (let n = this.tick; n < this.committed; n++) mine.push(this.slots[this.you].get(n) ?? []);
    return { n: this.tick, c: this.committed, mine };
  }

  /** The rival is back (their page was just sent `snapshot`): they have no commands yet for the settled ticks. */
  rejoin() {
    for (let n = this.tick; n < this.committed; n++)
      if (!this.slots[this.other].has(n)) this.slots[this.other].set(n, []);
    this.setAway(false);
  }

  /** The rejoining page's side of `snapshot`: take up the clock where the other page is (`theirs` are its settled commands). */
  resume(n: number, c: number, theirs: Command[][]) {
    this.tick = n;
    this.committed = c;
    for (const slot of this.slots) slot.clear();
    theirs.forEach((cmds, i) => {
      this.slots[this.other].set(n + i, cmds);
      this.slots[this.you].set(n + i, []);
    });
    this.pending = [];
    this.setAway(false);
  }

  private get other(): Person {
    return this.you === 0 ? 1 : 0;
  }

  /** Whether the next tick can run: the other player's commands for it are in. */
  ready(): boolean {
    return this.away || this.slots[this.other].has(this.tick);
  }

  /** Run one tick if it can: apply both players' commands, then `step` the match. False when waiting for the other page. */
  run(m: Match, step: () => void): boolean {
    this.commit();
    if (this.desync || !this.ready()) return false;
    if (this.away && !this.slots[this.other].has(this.tick)) this.slots[this.other].set(this.tick, []);
    for (const owner of [0, 1] as const) {
      for (const c of this.slots[owner].get(this.tick) ?? []) apply(m, owner, c);
      this.slots[owner].delete(this.tick);
    }
    step();
    this.tick++;
    if (!this.away && this.tick % SUM_EVERY === 0) {
      const h = checksum(m);
      this.mine.set(this.tick, h);
      this.link.send({ t: 'sum', n: this.tick, h });
      this.compare(this.tick);
    }
    return true;
  }

  /** Settle this player's commands for the tick `delay` ahead and send them (even if there are none: it is the other page's cue). */
  private commit() {
    while (this.committed <= this.tick + this.delay) {
      const c = this.pending.splice(0, this.pending.length);
      this.slots[this.you].set(this.committed, c);
      this.link.send({ t: 'tick', n: this.committed, c });
      this.committed++;
    }
  }

  private compare(n: number) {
    const [a, b] = [this.mine.get(n), this.theirs.get(n)];
    if (a === undefined || b === undefined) return;
    if (a !== b) this.desync = true;
    this.mine.delete(n);
    this.theirs.delete(n);
  }
}
