// The messages two players exchange once the data channel is open. Pure data and validation, no Pixi or WebRTC.
//
// The channel is unordered and unreliable ({ ordered: false, maxRetransmits: 0 }), so every message is built
// to survive loss and reordering:
//  - The guest sends its *state* (keys held) plus monotonically increasing counters for one-shot presses
//    (attack, magic). A lost packet is corrected by the next one; a counter can't be missed, only delayed.
//  - The host sends a snapshot each time: every player, but only the mobs near that guest (and a still mob only now and
//    then, see feed.ts). Recent one-shot world events (hit numbers, slashes...) ride in consecutive snapshots with ids so
//    the guest can show each exactly once; the guest's input messages carry the newest id it has seen (`ack`), so the host
//    stops repeating what has arrived.
//  - Both sides drop anything whose sequence number isn't newer than the last one seen.
// Everything from the peer is untrusted input: parseMessage() validates the shape and ranges, never throws.

import { DIRS } from '../core/direction';
import { GEAR_SLOTS, MOB_STATES } from '../systems/combat';
import { GROUND_LIFETIME, ITEM_COUNT, MAX_GROUND, type InvOpWire } from '../systems/inventory';
import type { Note, SideWire, TradeCommand, TradeViewWire } from '../systems/trade';
import { MAX_GUESTS } from './relayApi';
import type { ParticleEffectName } from '../systems/particleEffects';

/** Bump when a message changes shape; peers on different versions refuse to play together. */
export const PROTOCOL_VERSION = 10;

/** Held-key bits in InputMsg.keys. */
export const KEY = { up: 1, down: 2, left: 4, right: 8 } as const;

export function packKeys(dx: number, dy: number): number {
  return (dy < 0 ? KEY.up : 0) | (dy > 0 ? KEY.down : 0) | (dx < 0 ? KEY.left : 0) | (dx > 0 ? KEY.right : 0);
}

export function unpackKeys(keys: number): { dx: number; dy: number } {
  return {
    dx: (keys & KEY.right ? 1 : 0) - (keys & KEY.left ? 1 : 0),
    dy: (keys & KEY.down ? 1 : 0) - (keys & KEY.up ? 1 : 0),
  };
}

/** Players in a game: the host (player 0) and up to MAX_GUESTS friends (players 1 to MAX_GUESTS). */
export const MAX_PLAYERS = MAX_GUESTS + 1;

/** PlayerSnap flag bits. */
export const FLAG = { moving: 1, invuln: 2, swing: 4 } as const;

/** [player number, x, y, direction index, FLAG bits] */
export type PlayerSnap = [number, number, number, number, number];
/** [x, y, direction index, MOB_STATES index, hp, windup/recover/respawn timer ms (0 in other states), moving 0|1] */
export type MobFields = [number, number, number, number, number, number, number];
/** A mob's state tagged with its index in the map's mob list (a snapshot lists only some of the mobs). */
export type MobSnap = [index: number, ...state: MobFields];
/** [level, xp, hp, maxHp, mp, maxMp, attack, defense, magic] */
export type StatsSnap = [number, number, number, number, number, number, number, number, number];

/** One-shot particle effects a host may ask a guest to play (continuous ones, like the bolt trail, are local). */
export const FX_NAMES = ['hitSpark', 'mobPoof', 'levelUp', 'heroHurt'] as const satisfies readonly ParticleEffectName[];
export type FxName = (typeof FX_NAMES)[number];

/** Something that happened this tick and is only shown, never simulated, on the guest. */
export type WorldEvent =
  | { type: 'slash'; x: number; y: number; dir: number; p: number } // `p`: the player (number) who swung
  | { type: 'bolt'; x: number; y: number; vx: number; vy: number; p?: number; color?: number } // `p`: the player who cast it; `color` set instead: an enemy's shot (the guest only draws it)
  | { type: 'draw'; x: number; y: number; p: number } // player `p` begins drawing a bow (the arrow comes later, as `arrow`)
  | { type: 'arrow'; x: number; y: number; vx: number; vy: number; range: number } // a player's arrow (the guest only draws it)
  | { type: 'text'; x: number; y: number; text: string; color: number }
  | { type: 'fx'; name: FxName; x: number; y: number; dir?: number; p?: number } // `p`: the player it happened to (heroHurt)
  | { type: 'defeat'; player: number }; // this player (0 is the host) was knocked out and sent back to spawn

export interface HelloMsg {
  k: 'hello';
  v: number;
  build: string;
}

/** Guest -> host: what the guest's player is doing. */
export interface InputMsg {
  k: 'in';
  n: number; // sequence
  keys: number; // KEY bits held
  act: number; // times the action button was pressed
  mag: number; // times the magic button was pressed
  ack: number; // id of the newest world event this guest has shown (0: none yet)
  vr: number; // how far the guest can see, in world px from its player: the host sends it the mobs within this
  /**
   * The oldest Inventory action the host has not confirmed yet: [number, ...InvOpWire]. Numbered 1, 2, 3...; the host
   * does each once and in order, and says how far it got in PackMsg.ack, so a lost packet only delays it.
   */
  inv?: [number, ...InvOpWire];
}

/**
 * Host -> guest: the world the guest is standing in. `players` lists everyone in that zone, the host included, each
 * tagged with their player number; `me` is the recipient's own stats.
 */
/** [id, x, y, item code, seconds before it crumbles away] of an item lying on the ground. */
export type GroundSnap = [number, number, number, number, number];

export interface SnapMsg {
  k: 'snap';
  n: number;
  /** The zone the recipient is in. Everything below is about that zone only (players elsewhere are just in `away`). */
  zone: string;
  /** Players in the game who are in other zones right now (so the recipient does not think they left). */
  away: number[];
  players: PlayerSnap[];
  mobs: MobSnap[]; // only the mobs near the recipient, and a still one only now and then
  me: StatsSnap;
  chests: number; // bit i set: chest i of the map is open
  /** Items lying on the ground in that zone. Left out when unchanged since the last snapshot that listed them (the host lists them again at least once a second, in case one was lost). */
  ground?: GroundSnap[];
  events: { id: number; e: WorldEvent }[];
}

/** What a guest may ask the host to do with its own hero. The host checks every one (the guest only sends a wish). */
export const TRADE_OPS = ['buy', 'sell', 'wear', 'use'] as const;
export type TradeOp = (typeof TRADE_OPS)[number];

/**
 * Guest -> host: do something with my gold and pack. `item` is an item code (systems/inventory.ts); `shop` names the
 * shop for `buy` and `sell` (the guest must be standing at its keeper). Lost messages are simply asked again by the player.
 */
export interface DoMsg {
  k: 'do';
  n: number; // sequence: only a newer one than the last seen counts
  op: TradeOp;
  item: number;
  shop: string;
}

/**
 * Host -> guest: the guest's own purse and pack, sent when it changes and now and then in case a packet is lost.
 * `say` is the host's answer to the guest's last `do` (shown once; its id is that message's `n`).
 */
export interface PackMsg {
  k: 'pack';
  n: number;
  gold: number;
  worn: number[]; // an item code per GEAR_SLOTS slot
  items: number[]; // the pack, as item codes
  ack: number; // how many of this guest's Inventory actions (InputMsg.inv) the host has done
  say?: { id: number; text: string; ok: boolean };
}

/** Host -> guest: what every player wears, `[player number, ...one item code per GEAR_SLOTS slot]`, so everyone's look is right. */
export interface LooksMsg {
  k: 'looks';
  n: number;
  players: number[][];
}

/**
 * Guest -> host: one step of a player-to-player trade (systems/trade.ts). Unlike the rest, these are reliable by
 * hand: commands are numbered 1, 2, 3...; the host takes only the next number and the guest repeats every command
 * the host's `ack` has not yet covered, so a lost packet only delays a click.
 */
export interface TrMsg {
  k: 'tr';
  n: number;
  cmd: TradeCommand;
}

/** Host -> guest: this player's trade (null when none), the newest note for them, and `ack`: the last `tr` the host took in order. */
export interface TradeMsg {
  k: 'trade';
  n: number;
  ack: number;
  view: TradeViewWire | null;
  note?: Note;
}

export type Message = HelloMsg | InputMsg | SnapMsg | DoMsg | PackMsg | LooksMsg | TrMsg | TradeMsg;

export const encodeMessage = (m: Message): string => JSON.stringify(m);

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** A map may hold up to 30 chests (one bit each in SnapMsg.chests). */
export const MAX_CHESTS = 30;
const MAX_CHEST_MASK = 2 ** MAX_CHESTS - 1;
const MAX_MOBS = 256;
const MAX_EVENTS = 64;
const MAX_TEXT = 32;
const MAX_PACK = 200;
const MAX_SHOP_ID = 24;
const MAX_NOTE = 80;
const MAX_ZONE_NAME = 32;
const MAX_COORD = 1e6;
/** The largest view radius a guest may ask for (world px): a 4K window at zoom 1 is about 2300. */
export const MAX_VIEW = 4096;
const MAX_PACK_ACTIONS = 64; // an Inventory action's pack index or slot

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCoord = (v: unknown): v is number => isNum(v) && Math.abs(v) <= MAX_COORD;
const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const isIndex = (v: unknown, length: number): v is number => isCount(v) && v < length;
const numbers = (v: unknown, length: number): v is number[] =>
  Array.isArray(v) && v.length === length && v.every(isNum);

function parseEvent(raw: unknown): WorldEvent | null {
  const e = raw as Record<string, unknown> | null;
  if (!e || typeof e !== 'object') return null;
  switch (e.type) {
    case 'slash':
      return isCoord(e.x) && isCoord(e.y) && isIndex(e.dir, DIRS.length) && isIndex(e.p, MAX_PLAYERS)
        ? { type: 'slash', x: e.x, y: e.y, dir: e.dir, p: e.p }
        : null;
    case 'bolt':
      return isCoord(e.x) &&
        isCoord(e.y) &&
        isCoord(e.vx) &&
        isCoord(e.vy) &&
        (e.color === undefined || (isCount(e.color) && e.color <= 0xffffff)) &&
        (e.p === undefined || isIndex(e.p, MAX_PLAYERS))
        ? {
            type: 'bolt',
            x: e.x,
            y: e.y,
            vx: e.vx,
            vy: e.vy,
            ...(e.color === undefined ? {} : { color: e.color }),
            ...(e.p === undefined ? {} : { p: e.p }),
          }
        : null;
    case 'draw':
      return isCoord(e.x) && isCoord(e.y) && isIndex(e.p, MAX_PLAYERS)
        ? { type: 'draw', x: e.x, y: e.y, p: e.p }
        : null;
    case 'arrow':
      return isCoord(e.x) && isCoord(e.y) && isCoord(e.vx) && isCoord(e.vy) && isCoord(e.range) && e.range >= 0
        ? { type: 'arrow', x: e.x, y: e.y, vx: e.vx, vy: e.vy, range: e.range }
        : null;
    case 'text':
      return isCoord(e.x) &&
        isCoord(e.y) &&
        typeof e.text === 'string' &&
        e.text.length <= MAX_TEXT &&
        isCount(e.color) &&
        e.color <= 0xffffff
        ? { type: 'text', x: e.x, y: e.y, text: e.text, color: e.color }
        : null;
    case 'fx':
      return FX_NAMES.includes(e.name as FxName) &&
        isCoord(e.x) &&
        isCoord(e.y) &&
        (e.dir === undefined || isCoord(e.dir)) &&
        (e.p === undefined || isIndex(e.p, MAX_PLAYERS))
        ? { type: 'fx', name: e.name as FxName, x: e.x, y: e.y, dir: e.dir, ...(e.p === undefined ? {} : { p: e.p }) }
        : null;
    case 'defeat':
      return isIndex(e.player, MAX_PLAYERS) ? { type: 'defeat', player: e.player } : null;
    default:
      return null;
  }
}

const MAX_OFFER = 12;
const MAX_GOLD = Number.MAX_SAFE_INTEGER;

function parseTradeCommand(raw: unknown): TradeCommand | null {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return null;
  switch (c.c) {
    case 'ask':
      return isIndex(c.with, MAX_PLAYERS) ? { c: 'ask', with: c.with } : null;
    case 'yes':
    case 'no':
    case 'cancel':
      return { c: c.c };
    case 'offer':
      return Array.isArray(c.items) &&
        c.items.length <= MAX_OFFER &&
        c.items.every(isCode) &&
        isCount(c.gold) &&
        c.gold <= MAX_GOLD
        ? { c: 'offer', items: c.items, gold: c.gold }
        : null;
    case 'ready':
      return typeof c.on === 'boolean' ? { c: 'ready', on: c.on } : null;
    default:
      return null;
  }
}

function parseSide(raw: unknown): SideWire | null {
  const s = raw as Record<string, unknown> | null;
  if (!s || typeof s !== 'object') return null;
  return Array.isArray(s.items) &&
    s.items.length <= MAX_OFFER &&
    s.items.every(isCode) &&
    isCount(s.gold) &&
    typeof s.ready === 'boolean'
    ? { items: s.items, gold: s.gold, ready: s.ready }
    : null;
}

/** The view, or null for a malformed one (a `view: null` message is handled by the caller before this). */
function parseTradeView(raw: unknown): TradeViewWire | null {
  const v = raw as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return null;
  const mine = parseSide(v.mine);
  const theirs = parseSide(v.theirs);
  return (v.phase === 'asking' || v.phase === 'incoming' || v.phase === 'open') &&
    isIndex(v.with, MAX_PLAYERS) &&
    mine &&
    theirs
    ? { phase: v.phase, with: v.with, mine, theirs }
    : null;
}

function parsePlayer(raw: unknown): PlayerSnap | null {
  if (!numbers(raw, 5) || !raw.every((v, i) => (i === 1 || i === 2 ? isCoord(v) : isCount(v)))) return null;
  const [slot, x, y, dir, flags] = raw as PlayerSnap;
  return isIndex(slot, MAX_PLAYERS) && isIndex(dir, DIRS.length) && flags <= 7 ? [slot, x, y, dir, flags] : null;
}

function parseGround(raw: unknown): GroundSnap | null {
  if (!numbers(raw, 5)) return null;
  const [id, x, y, code, left] = raw as GroundSnap;
  const ok = isCount(id) && isCoord(x) && isCoord(y) && isIndex(code, ITEM_COUNT + 1) && code > 0;
  return ok && left >= 0 && left <= GROUND_LIFETIME ? [id, x, y, code, left] : null;
}

function parseMob(raw: unknown): MobSnap | null {
  if (!numbers(raw, 8)) return null;
  const [index, x, y, dir, state, hp, timer, moving] = raw as MobSnap;
  const ok =
    isIndex(index, MAX_MOBS) &&
    isCoord(x) &&
    isCoord(y) &&
    isIndex(dir, DIRS.length) &&
    isIndex(state, MOB_STATES.length) &&
    isCount(hp) &&
    isCount(timer) &&
    (moving === 0 || moving === 1);
  return ok ? [index, x, y, dir, state, hp, timer, moving] : null;
}

const isCode = (v: unknown): v is number => isCount(v) && v <= ITEM_COUNT;
const codes = (v: unknown, length: number): v is number[] => numbers(v, length) && v.every(isCode);

/** Parse and validate a raw channel message. Returns null for anything malformed. */
export function parseMessage(raw: unknown): Message | null {
  if (typeof raw !== 'string' || raw.length > 64_000) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;

  switch (m.k) {
    case 'hello':
      return isCount(m.v) && typeof m.build === 'string' && m.build.length <= 64
        ? { k: 'hello', v: m.v, build: m.build }
        : null;
    case 'in': {
      if (!(
        isCount(m.n) &&
        isCount(m.keys) &&
        m.keys <= 15 &&
        isCount(m.act) &&
        isCount(m.mag) &&
        isCount(m.ack) &&
        isCount(m.vr) &&
        m.vr <= MAX_VIEW
      )) {
        return null;
      }
      const base = { k: 'in', n: m.n, keys: m.keys, act: m.act, mag: m.mag, ack: m.ack, vr: m.vr } as const;
      if (m.inv === undefined) return base;
      const inv = m.inv;
      return numbers(inv, 4) &&
        isCount(inv[0]) &&
        inv[0] > 0 &&
        inv.slice(1).every((v) => Math.abs(v) <= MAX_PACK_ACTIONS)
        ? { ...base, inv: [inv[0], inv[1] as number, inv[2] as number, inv[3] as number] }
        : null;
    }
    case 'snap': {
      const players =
        Array.isArray(m.players) && m.players.length >= 1 && m.players.length <= MAX_PLAYERS
          ? m.players.map(parsePlayer)
          : null;
      const mobs = Array.isArray(m.mobs) && m.mobs.length <= MAX_MOBS ? m.mobs.map(parseMob) : null;
      const ground =
        m.ground === undefined
          ? []
          : Array.isArray(m.ground) && m.ground.length <= MAX_GROUND
            ? (m.ground as unknown[]).map(parseGround)
            : null;
      const rawEvents = Array.isArray(m.events) && m.events.length <= MAX_EVENTS ? m.events : null;
      const events = (rawEvents ?? []).map((item: unknown) => {
        const { id, e } = (item ?? {}) as { id?: unknown; e?: unknown };
        const event = isCount(id) ? parseEvent(e) : null;
        return event && isCount(id) ? { id, e: event } : null;
      });
      if (
        !players ||
        players.includes(null) ||
        new Set(players.map((p) => p?.[0])).size !== players.length || // each player appears once
        !isCount(m.n) ||
        typeof m.zone !== 'string' ||
        m.zone.length < 1 ||
        m.zone.length > MAX_ZONE_NAME ||
        !Array.isArray(m.away) ||
        m.away.length >= MAX_PLAYERS ||
        !m.away.every((a: unknown) => isIndex(a, MAX_PLAYERS)) ||
        !mobs ||
        mobs.includes(null) ||
        !rawEvents ||
        events.includes(null) ||
        !ground ||
        ground.includes(null) ||
        !numbers(m.me, 9) ||
        !isCount(m.chests) ||
        m.chests > MAX_CHEST_MASK
      ) {
        return null;
      }
      return {
        k: 'snap',
        n: m.n,
        zone: m.zone,
        away: m.away,
        players: players as PlayerSnap[],
        mobs: mobs as MobSnap[],
        me: m.me as StatsSnap,
        chests: m.chests,
        ...(m.ground === undefined ? {} : { ground: ground as GroundSnap[] }),
        events: events as { id: number; e: WorldEvent }[],
      };
    }
    case 'do':
      return isCount(m.n) &&
        TRADE_OPS.includes(m.op as TradeOp) &&
        isCode(m.item) &&
        typeof m.shop === 'string' &&
        m.shop.length <= MAX_SHOP_ID
        ? { k: 'do', n: m.n, op: m.op as TradeOp, item: m.item, shop: m.shop }
        : null;
    case 'pack': {
      const say = m.say as { id?: unknown; text?: unknown; ok?: unknown } | undefined;
      const sayOk =
        say === undefined ||
        (typeof say === 'object' &&
          say !== null &&
          isCount(say.id) &&
          typeof say.text === 'string' &&
          say.text.length <= 64 &&
          typeof say.ok === 'boolean');
      return isCount(m.n) &&
        isCount(m.gold) &&
        codes(m.worn, GEAR_SLOTS.length) &&
        Array.isArray(m.items) &&
        m.items.length <= MAX_PACK &&
        m.items.every(isCode) &&
        isCount(m.ack) &&
        sayOk
        ? {
            k: 'pack',
            n: m.n,
            gold: m.gold,
            worn: m.worn,
            items: m.items,
            ack: m.ack,
            ...(say === undefined ? {} : { say: say as { id: number; text: string; ok: boolean } }),
          }
        : null;
    }
    case 'looks': {
      const players = m.players;
      const ok =
        isCount(m.n) &&
        Array.isArray(players) &&
        players.length >= 1 &&
        players.length <= MAX_PLAYERS &&
        players.every(
          (p: unknown) => numbers(p, 1 + GEAR_SLOTS.length) && isIndex(p[0], MAX_PLAYERS) && p.slice(1).every(isCode),
        );
      return ok && isCount(m.n) ? { k: 'looks', n: m.n, players: players as number[][] } : null;
    }
    case 'tr': {
      const cmd = parseTradeCommand(m.cmd);
      return isCount(m.n) && m.n >= 1 && cmd ? { k: 'tr', n: m.n, cmd } : null;
    }
    case 'trade': {
      const view = m.view === null ? null : parseTradeView(m.view);
      const viewOk = m.view === null || view !== null;
      const note = m.note as { id?: unknown; text?: unknown; ok?: unknown } | undefined;
      const noteOk =
        note === undefined ||
        (typeof note === 'object' &&
          note !== null &&
          isCount(note.id) &&
          typeof note.text === 'string' &&
          note.text.length <= MAX_NOTE &&
          typeof note.ok === 'boolean');
      return isCount(m.n) && isCount(m.ack) && viewOk && noteOk
        ? {
            k: 'trade',
            n: m.n,
            ack: m.ack,
            view,
            ...(note === undefined ? {} : { note: note as unknown as Note }),
          }
        : null;
    }
    default:
      return null;
  }
}
