// The messages two players exchange once the data channel is open. Pure data and validation, no Pixi or WebRTC.
//
// The channel is unordered and unreliable ({ ordered: false, maxRetransmits: 0 }), so every message is built
// to survive loss and reordering:
//  - The guest sends its *state* (keys held) plus monotonically increasing counters for one-shot presses
//    (attack, combo casts). A lost packet is corrected by the next one; a counter can't be missed, only delayed.
//  - The host sends a snapshot each time: every player, but only the mobs near that guest (and a still mob only now and
//    then, see feed.ts). Recent one-shot world events near that guest (hit numbers, slashes...) ride in consecutive
//    snapshots with ids so the guest can show each exactly once; the guest's input messages carry the newest id it has
//    seen (`ack`), so the host stops repeating what has arrived. Events are flat tuples (`EventWire`) and as many as fit
//    a size budget, so a snapshot stays one packet (a bigger one is split, and losing any piece loses all of it).
//  - Both sides drop anything whose sequence number isn't newer than the last one seen.
// Everything from the peer is untrusted input: parseMessage() validates the shape and ranges, never throws.

import { validBarrelsWire } from '../systems/barrels';
import { validFolkWire } from '../systems/roam';
import { AIM_STEPS } from '../core/aim';
import { DIRS } from '../core/direction';
import { GEAR_SLOTS, MOB_STATES } from '../systems/combat';
import { cropFromCode, MAX_CROPS } from '../systems/crops';
import type { PondState } from '../systems/needs';
import { NEED_MAX } from '../systems/needs';
import { questFromWire } from '../systems/quests';
import { loadoutFromCode, MAX_HERO_COMBOS, MAX_LOADOUT_CODE, MAX_SKILL_MASK } from '../systems/skills';
import { GROUND_LIFETIME, itemCount, MAX_GROUND, type InvOpWire } from '../systems/inventory';
import type { Note, SideWire, TradeCommand, TradeViewWire } from '../systems/trade';
import { MAX_GUESTS } from './relayApi';
import type { ParticleEffectName } from '../systems/particleEffects';
import { PRECIPS, type WeatherSnap } from '../systems/weather';
import { DIALS } from '../systems/capabilities';
import { MAX_SAY_CUED } from '../systems/cues';
import { MAX_ASK, REQUESTS as DM_REQUESTS } from '../systems/dmRequests';

const MAX_REQUESTS = DM_REQUESTS.length;
import { taskFromWire, type TaskWire } from '../systems/dmTasks';

/**
 * Bump when a message changes shape (or what one means); peers on different versions refuse to play together. v29: the
 * host is the Dungeon Master, not a party member (player 0 in a snapshot is drawn as the DM). v30: `world`, a live
 * world's log. v31: `dm` (the Dungeon Master's dials, time of day and vote) and the guest's vote `InputMsg.vt`. v32: the
 * log's `cast` and `npc` entries, and longer entries. v33: `DmMsg.say`, what the Dungeon Master says to the party.
 * v34: `DmMsg.hold`, time stopped by the Dungeon Master. v35: `DmMsg.task`, a task the DM called for the party.
 * v36: `FLAG.hidden`, the DM out of sight while they possess a foe. v37: `DmMsg.task` carries a real quest (title, what, bits, hint).
 * v38: `DmMsg.task` may carry the DM's own instructions for it (a note); `DmMsg.say` may be up to 240 letters.
 * v39: the guest's request to the DM, `InputMsg.rq`. v40: `rq` may carry words of the guest's own and `DmMsg.reply` the
 * DM's private answer; `DmMsg.task` may be a saga's step (a note '' and the saga's name and place in it).
 * v41: `SnapMsg.barrels`, the barrels players have moved or are carrying. v42: the world log's `voice` entry (a person the
 * DM made says something else); a page that does not know it cannot follow the host's world. v43: `InputMsg.rd`, the
 * guest is reading a quest conversation (the host holds foes still while anyone is). v44: a `DmMsg.task`'s hint is how
 * much of the way is shown (0 nothing, 1 the area, 2 an arrow), not a yes or no, and its kind may be `cast` or `haul`.
 * v45: `DmMsg.say` and `reply` may carry director cues (`<cue:.../>`, systems/cues.ts), so they may be up to `MAX_SAY_CUED`
 * letters; an old page would show the tags and refuse the longer words.
 * v46: a `DmMsg.task`'s kind may be `boss` (the guest builds the giant from the quest's `what`, "kind:health") or `master`.
 * v47: the `fuse` Inventory action (kind 5: set the gem at a pack index in a pack index or, negative, a worn slot), a
 * `DmMsg.task`'s kind may be `forge` (index 8), and the item codes run on past the authored list through the pieces gems make.
 * v48: the world log's `sign` entry (the DM rewrote a signpost); an older page cannot follow the host's world.
 * v49: an `arrow` event may carry `p`, the player who shot it, so a guest tints it like the swings and bolts.
 * v50: `SnapMsg.ia`, the newest input number the host has applied for the recipient (client-side prediction).
 * v51: `SnapMsg.folk`, where the people who stroll about their post (content `roam`) stand.
 * v52: `HelloMsg.id`, a friend's own lasting id, so the host can give a rejoiner their hero back.
 * v56: eight more `fx` names (foe deaths, a boss finale, sparkle, coins, a cheer, a fall; appended, so old indices hold). v55: `rq` may be a one-tap note (a mood face, "stuck"), written in the host's report and never put in the DM's inbox. v54: the DM's words (`DmMsg.say`/`reply`) may be up to 360 letters, not 240. v53: `InputMsg.px/py`, where the friend's own hero stands: the host moves it there when believable (core/claim.ts).
 * Older: v28 made a negative `SnapMsg.ponds` level mean refilling after running dry; v27 made `drink` start (item
 * 1) or stop (item 0) a steady drink and added `SnapMsg.ponds`; v26 added the `drink` op of `do`; v25 added the
 * mob state `channel` (the Mummy's held ray); v24 added the `frost` fx of Stasis; v23 made `SnapMsg.crops` a state
 * code per plot (phase, dry or ripe); v22 and v21 added the crop plots' state; v20 added `PackMsg.needs`, food and
 * water; v19 swapped Swift Surge for Spark Volley, so `FLAG.guard` moved to 32 and `FLAG.haste` is gone; v18 added
 * `PackMsg.loadout` and the `loadout` op; v17 added `PackMsg.skills`, the `train` op and `FLAG.edge`; v16 added
 * the charm slot (every worn/looks array is one longer), `PackMsg.quests` and `say.story`, and the `talk` op of
 * `do`; v15 replaced the magic counter `mag` with the combo counter `cb` and index `ci`, added `FLAG.ward` and the
 * spell fx; v14 made the weather per zone: precipitation, wind level, intensity and direction in `SnapMsg.w`; v13
 * added the optional mouse aim `am` to inputs; v6 added `do`, `pack` and `looks`, v7 the per-zone snapshot, v8
 * added `tr` and `trade`, v9 Inventory actions, ground items and `pack.ack`; v10 sends only the mobs near a
 * friend, the ground only when it changes, event acks and player numbers on events; v11 added the host's weather
 * `w` and `lightning` events; v12 sends events as tuples, only those near a friend (a defeat or lightning always),
 * within a size budget.
 */
export const PROTOCOL_VERSION = 56;

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
export const FLAG = { moving: 1, invuln: 2, swing: 4, ward: 8, edge: 16, guard: 32, hidden: 64 } as const;

/** [player number, x, y, direction index, FLAG bits] */
export type PlayerSnap = [number, number, number, number, number];
/** [x, y, direction index, MOB_STATES index, hp, windup/recover/respawn timer ms (0 in other states), moving 0|1] */
export type MobFields = [number, number, number, number, number, number, number];
/** A mob's state tagged with its index in the map's mob list (a snapshot lists only some of the mobs). */
export type MobSnap = [index: number, ...state: MobFields];
/** [level, xp, hp, maxHp, mp, maxMp, attack, defense, magic] */
export type StatsSnap = [number, number, number, number, number, number, number, number, number];

/** One-shot particle effects a host may ask a guest to play (continuous ones, like the bolt trail, are local). */
export const FX_NAMES = [
  'hitSpark',
  'mobPoof',
  'levelUp',
  'heroHurt',
  'castGlow',
  'nova',
  'blast',
  'zap',
  'heal',
  'ward',
  'blink',
  'frost',
  'mobDust',
  'mobSplat',
  'mobWisp',
  'bossFinale',
  'sparkle',
  'coinPop',
  'cheer',
  'fall',
] as const satisfies readonly ParticleEffectName[];
export type FxName = (typeof FX_NAMES)[number];

/**
 * A WorldEvent on the wire: `[id, kind index in EVENT_KINDS, ...fields]`, positions and speeds in whole pixels.
 *   slash  [id, 0, x, y, dir, p]
 *   bolt   [id, 1, x, y, vx, vy, p (-1: none), color?]
 *   draw   [id, 2, x, y, p]
 *   arrow  [id, 3, x, y, vx, vy, range, p?]
 *   text   [id, 4, x, y, text, color]
 *   fx     [id, 5, FX_NAMES index, x, y, dir (null: none)?, p?]
 *   defeat [id, 6, player]
 *   lightning [id, 7, x, y, seed]
 */
export type EventWire = (number | string | null)[];

export const EVENT_KINDS = [
  'slash',
  'bolt',
  'draw',
  'arrow',
  'text',
  'fx',
  'defeat',
  'lightning',
] as const satisfies readonly WorldEvent['type'][];

/** Something that happened this tick and is only shown, never simulated, on the guest. */
export type WorldEvent =
  | { type: 'slash'; x: number; y: number; dir: number; p: number } // `p`: the player (number) who swung
  | { type: 'bolt'; x: number; y: number; vx: number; vy: number; p?: number; color?: number } // `p`: the player who cast it; `color` set instead: an enemy's shot (the guest only draws it)
  | { type: 'draw'; x: number; y: number; p: number } // player `p` begins drawing a bow (the arrow comes later, as `arrow`)
  | { type: 'arrow'; x: number; y: number; vx: number; vy: number; range: number; p?: number } // a player's arrow (the guest only draws it); `p`: who shot it
  | { type: 'text'; x: number; y: number; text: string; color: number }
  | { type: 'fx'; name: FxName; x: number; y: number; dir?: number; p?: number } // `p`: the player it happened to (heroHurt)
  | { type: 'lightning'; x: number; y: number; seed: number } // a bolt lands here (the seed shapes it the same everywhere)
  | { type: 'defeat'; player: number }; // this player (0 is the host) was knocked out and sent back to spawn

export interface HelloMsg {
  k: 'hello';
  v: number;
  build: string;
  /** A friend's lasting id (letters, digits, `_`, `-`; see `HELLO_ID`): the same on every visit, so the host knows who is back. */
  id?: string;
}

export const HELLO_ID = /^[\w-]{8,32}$/;

/** Guest -> host: what the guest's player is doing. */
export interface InputMsg {
  k: 'in';
  n: number; // sequence
  keys: number; // KEY bits held
  act: number; // times the action button was pressed
  cb: number; // combos cast so far (a counter, like `act`)
  ci: number; // which of the weapon's combos the latest one was (an index into its `focus.combos`)
  ack: number; // id of the newest world event this guest has shown (0: none yet)
  vr: number; // how far the guest can see, in world px from its player: the host sends it the mobs within this
  /** Where the guest's own hero stands (whole px) as it sent this input: the host adopts it when believable (`core/claim.ts`). */
  px?: number;
  py?: number;
  am?: number; // mouse aiming only: where the guest points, 1..AIM_STEPS (core/aim.ts); absent: aim by walking
  /**
   * The oldest Inventory action the host has not confirmed yet: [number, ...InvOpWire]. Numbered 1, 2, 3...; the host
   * does each once and in order, and says how far it got in PackMsg.ack, so a lost packet only delays it.
   */
  inv?: [number, ...InvOpWire];
  /** The guest's vote in the Dungeon Master's open vote: [the vote's id, the option's index]. Repeated like the keys. */
  vt?: [number, number];
  /** The guest's latest request to the Dungeon Master: [a counter that grows with each, which canned request]. Repeated like the keys. */
  rq?: [number, number] | [number, number, string];
  /** 1 while the guest has a quest conversation open (a state, repeated like the keys): the host holds the world still for it. */
  rd?: 1;
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
  /** The newest `InputMsg.n` the host has received from the recipient, so it can reconcile its predicted hero (core/prediction.ts). Absent: none yet. */
  ia?: number;
  chests: number; // bit i set: chest i of the map is open
  crops: number[]; // the state of each crop plot of the map (systems/crops.ts `cropCode`)
  /**
   * Drained ponds of that zone, flat: pond id, then how far drained in thousandths (1..1000), negative while the pond is
   * filling up again after running dry. Absent: every pond full.
   */
  ponds?: number[];
  /** Barrels of that zone away from home (systems/barrels.ts `barrelsWire`: number, x, y, 0 or 1 + the carrier's facing, flat). Absent: all at home. */
  barrels?: number[];
  /** The roaming people of that zone (systems/roam.ts `folkWire`: x, y, facing index, flat, in the zone's folk order). Absent: nobody roams there. */
  folk?: number[];
  w: WeatherSnap; // the host's weather, so everyone sees the same sky
  /** Items lying on the ground in that zone. Left out when unchanged since the last snapshot that listed them (the host lists them again at least once a second, in case one was lost). */
  ground?: GroundSnap[];
  events: EventWire[]; // oldest first; see encodeEvent / decodeEvent
}

/** What a guest may ask the host to do with its own hero. The host checks every one (the guest only sends a wish). */
export const TRADE_OPS = ['buy', 'sell', 'wear', 'use', 'talk', 'train', 'loadout', 'drink'] as const;
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
// A `talk` (item 0) is a wish to speak to the quest giver named in `shop` (a key of GIVERS); the host checks the guest is
// beside them and answers with `say.story`. A `train` (item 0) asks the training wizard (`shop` = TRAINER) to send the guest to
// the trial for their next skill; the host checks the guest is beside the trainer and ready, and moves them there (or says why not). A `loadout` (`item` =
// `loadoutCode`) chooses which two skills are ready; the host checks they are known and says the result in the next `pack`.
// A `drink` (shop '') starts (item 1) or stops (item 0) the guest drinking from the pond beside them; the host checks
// there is one, lets the water flow in each tick and floats the total when they stop.

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
  /** `story` names the quest lines to read (systems/quests.ts `linesFor`), for the answer to a `talk`. */
  say?: { id: number; text: string; ok: boolean; story?: string };
  /** The guest's place in the quest chain (systems/quests.ts `questWire`): [stage, taken, progress]. */
  quests: number[];
  /** The skills the guest has learned (systems/skills.ts `skillMask`), and which two are ready (`loadoutCode`). */
  skills: number;
  loadout: number;
  /** Food and water, whole points (systems/needs.ts). */
  needs: [number, number];
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

/**
 * Host -> guest: a stretch of a live world's log (content/world.ts `LogEntry`), entries `from`, `from + 1`... of the
 * `total` the host has. The host cycles through the log a few entries at a time, newest first when one is added, so a
 * guest that joined late or lost a packet catches up with nothing acknowledged; the guest's own World checks every
 * entry (`World.apply`), so this only checks the shape.
 */
export interface WorldMsg {
  k: 'world';
  n: number;
  total: number;
  from: number;
  entries: Record<string, unknown>[];
}

/**
 * The most log entries one `world` message carries, the longest one may be (as JSON: a person the DM made, with their
 * lines, is the longest), and how much a host puts in one message (a stretch stops short of it, keeping each message
 * whole on the lossy channel).
 */
export const WORLD_CHUNK = 3;
export const MAX_ENTRY = 800;
export const WORLD_BUDGET = 900;
const MAX_LOG = 500;

/** The most choices a vote offers. */
export const MAX_VOTE_OPTIONS = 6;
const MAX_VOTE_LABEL = 80;

/** A vote the Dungeon Master opened, as one friend is told it: the choices, how many chose each, and their own choice. */
export interface VoteWire {
  id: number;
  options: string[];
  tally: number[];
  /** This friend's choice (-1: none yet). */
  yours: number;
}

/**
 * Host -> guest: what the Dungeon Master has set for everyone. `shift` moves the time of day (a fraction of a day, as
 * systems/daynight.ts `DayClock.shift`); `dials` are the capabilities the DM switched (systems/capabilities.ts `DIALS`,
 * each true or false); `vote` is the open vote, if any. Sent when it changes and once a second.
 */
export interface DmMsg {
  k: 'dm';
  n: number;
  shift: number;
  dials: Record<string, boolean>;
  vote: VoteWire | null;
  /**
   * What the DM just said: [a number that changes with each saying, the words]; repeated for a few seconds, then absent.
   * The words may carry director cues (`<cue:.../>`, systems/cues.ts), already checked by the host; each page cuts them out
   * of what it shows and plays them as the reading reaches them.
   */
  say?: [number, string];
  /** The DM's private answer to this friend: [a number that changes with each, the words]; repeated for a few seconds. */
  reply?: [number, string];
  /** 1 while the DM has stopped time (everyone but them stands still); absent otherwise. */
  hold?: 1;
  /** The task the DM has called for the party (systems/dmTasks.ts `taskWire`); absent when there is none. */
  task?: TaskWire;
}

export type Message = HelloMsg | InputMsg | SnapMsg | DoMsg | PackMsg | LooksMsg | TrMsg | TradeMsg | WorldMsg | DmMsg;

export const encodeMessage = (m: Message): string => JSON.stringify(m);

/**
 * Two snapshots the guest received in one frame, as one. A snapshot leaves out mobs and ground that did not change, so
 * taking only the newer would lose what the older one said: the older one's mobs the newer does not list are kept,
 * its ground list stands if the newer has none, and its events are kept (each id once). A zone change starts afresh.
 */
export function mergeSnapshots(older: SnapMsg, newer: SnapMsg): SnapMsg {
  if (older.zone !== newer.zone) return newer;
  const listed = new Set(newer.mobs.map((m) => m[0]));
  const ids = new Set(newer.events.map((w) => w[0]));
  const ground = newer.ground ?? older.ground;
  return {
    ...newer,
    mobs: [...older.mobs.filter((m) => !listed.has(m[0])), ...newer.mobs],
    events: [...older.events.filter((w) => !ids.has(w[0])), ...newer.events],
    ...(ground ? { ground } : {}),
  };
}

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
/** The most combos a wand or tome may have, for checking a guest's `ci`. */
const MAX_COMBOS = MAX_HERO_COMBOS;
const MAX_PACK_ACTIONS = 64; // an Inventory action's pack index or slot

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCoord = (v: unknown): v is number => isNum(v) && Math.abs(v) <= MAX_COORD;
const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const isIndex = (v: unknown, length: number): v is number => isCount(v) && v < length;
const numbers = (v: unknown, length: number): v is number[] =>
  Array.isArray(v) && v.length === length && v.every(isNum);

const isWeather = (v: unknown): v is WeatherSnap =>
  numbers(v, 4) &&
  isIndex(v[0], PRECIPS.length + 1) && // 0 is clear sky
  isCount(v[1]) &&
  v[1] <= 100 &&
  isCount(v[2]) &&
  v[2] <= 100 &&
  (v[3] === 0 || v[3] === 1);

/** An event as it travels in a snapshot (see EventWire). */
export function encodeEvent(id: number, e: WorldEvent): EventWire {
  const r = Math.round;
  switch (e.type) {
    case 'slash':
      return [id, 0, r(e.x), r(e.y), e.dir, e.p];
    case 'bolt':
      return [id, 1, r(e.x), r(e.y), r(e.vx), r(e.vy), e.p ?? -1, ...(e.color === undefined ? [] : [e.color])];
    case 'draw':
      return [id, 2, r(e.x), r(e.y), e.p];
    case 'arrow':
      return [id, 3, r(e.x), r(e.y), r(e.vx), r(e.vy), r(e.range), ...(e.p === undefined ? [] : [e.p])];
    case 'text':
      return [id, 4, r(e.x), r(e.y), e.text, e.color];
    case 'fx': {
      const tail =
        e.p !== undefined
          ? [e.dir === undefined ? null : round1(e.dir), e.p]
          : e.dir !== undefined
            ? [round1(e.dir)]
            : [];
      return [id, 5, FX_NAMES.indexOf(e.name), r(e.x), r(e.y), ...tail];
    }
    case 'defeat':
      return [id, 6, e.player];
    case 'lightning':
      return [id, 7, r(e.x), r(e.y), e.seed];
  }
}

/** The event in a wire tuple, or null for anything malformed (it comes from the peer). */
export function decodeEvent(raw: unknown): { id: number; e: WorldEvent } | null {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 8) return null;
  const w = raw as unknown[];
  const [id, kind] = w;
  if (!isCount(id)) return null;
  const at = (i: number) => w[i];
  const len = (n: number, max = n) => w.length >= n && w.length <= max;
  const xy = () => isCoord(at(2)) && isCoord(at(3));
  const player = (v: unknown): v is number => isIndex(v, MAX_PLAYERS);
  const colour = (v: unknown): v is number => isCount(v) && v <= 0xffffff;
  const n = (i: number) => w[i] as number;
  let e: WorldEvent | null = null;
  switch (kind) {
    case 0:
      if (len(6) && xy() && isIndex(at(4), DIRS.length) && player(at(5)))
        e = { type: 'slash', x: n(2), y: n(3), dir: n(4), p: n(5) };
      break;
    case 1: {
      const [p, color] = [at(6), at(7)];
      if (
        len(7, 8) &&
        xy() &&
        isCoord(at(4)) &&
        isCoord(at(5)) &&
        (p === -1 || player(p)) &&
        (color === undefined || colour(color))
      )
        e = {
          type: 'bolt',
          x: n(2),
          y: n(3),
          vx: n(4),
          vy: n(5),
          ...(p === -1 ? {} : { p }),
          ...(color === undefined ? {} : { color }),
        };
      break;
    }
    case 2:
      if (len(5) && xy() && player(at(4))) e = { type: 'draw', x: n(2), y: n(3), p: n(4) };
      break;
    case 3:
      if (
        len(7, 8) &&
        xy() &&
        isCoord(at(4)) &&
        isCoord(at(5)) &&
        isCoord(at(6)) &&
        n(6) >= 0 &&
        (at(7) === undefined || player(at(7)))
      )
        e = {
          type: 'arrow',
          x: n(2),
          y: n(3),
          vx: n(4),
          vy: n(5),
          range: n(6),
          ...(at(7) === undefined ? {} : { p: n(7) }),
        };
      break;
    case 4: {
      const text = at(4);
      if (len(6) && xy() && typeof text === 'string' && text.length <= MAX_TEXT && colour(at(5)))
        e = { type: 'text', x: n(2), y: n(3), text, color: n(5) };
      break;
    }
    case 5: {
      const [name, dir, p] = [FX_NAMES[n(2)], at(5), at(6)];
      if (
        len(5, 7) &&
        isIndex(at(2), FX_NAMES.length) &&
        name &&
        isCoord(at(3)) &&
        isCoord(at(4)) &&
        (dir === undefined || dir === null || isCoord(dir)) &&
        (p === undefined || player(p))
      )
        e = {
          type: 'fx',
          name,
          x: n(3),
          y: n(4),
          ...(dir === undefined || dir === null ? {} : { dir }),
          ...(p === undefined ? {} : { p }),
        };
      break;
    }
    case 6:
      if (len(3) && player(at(2))) e = { type: 'defeat', player: n(2) };
      break;
    case 7:
      if (len(5) && xy() && isCount(at(4)) && n(4) <= 0xffffffff)
        e = { type: 'lightning', x: n(2), y: n(3), seed: n(4) };
      break;
  }
  return e ? { id, e } : null;
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
  return isIndex(slot, MAX_PLAYERS) && isIndex(dir, DIRS.length) && flags <= 127 ? [slot, x, y, dir, flags] : null;
}

function parseGround(raw: unknown): GroundSnap | null {
  if (!numbers(raw, 5)) return null;
  const [id, x, y, code, left] = raw as GroundSnap;
  const ok = isCount(id) && isCoord(x) && isCoord(y) && isIndex(code, itemCount() + 1) && code > 0;
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

const isCode = (v: unknown): v is number => isCount(v) && v <= itemCount();
const codes = (v: unknown, length: number): v is number[] => numbers(v, length) && v.every(isCode);

/** Parse and validate a raw channel message. Returns null for anything malformed. */
/** At most this many drained ponds go in a snapshot (a zone has a handful). */
export const MAX_PONDS = 16;
const MAX_POND_ID = 1 << 20; // a cell index of the map

/** `[id, thousandths drained, ...]`: whole numbers, ids in range, levels 1..1000 (or -1000..-1 while refilling). */
function isPonds(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length % 2 === 0 &&
    v.length <= MAX_PONDS * 2 &&
    v.every((x: unknown, i) => {
      if (!Number.isInteger(x)) return false;
      const n = x as number;
      return i % 2 ? n !== 0 && Math.abs(n) <= 1000 : n >= 0 && n <= MAX_POND_ID;
    })
  );
}

/** Pond states (systems/needs.ts `PondLevels.levels`) as a snapshot's `ponds`, or undefined when every pond is full. */
export function pondsWire(states: readonly PondState[]): number[] | undefined {
  const out = states.slice(0, MAX_PONDS).flatMap(([id, level, refilling]) => {
    const t = Math.min(1000, Math.max(1, Math.round(level * 1000)));
    return [id, refilling ? -t : t];
  });
  return out.length ? out : undefined;
}

/** A snapshot's `ponds` back as states. */
export function pondsFromWire(wire: readonly number[] | undefined): PondState[] {
  const out: PondState[] = [];
  for (let i = 0; wire && i + 1 < wire.length; i += 2)
    out.push([wire[i]!, Math.abs(wire[i + 1]!) / 1000, wire[i + 1]! < 0]);
  return out;
}

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
      return isCount(m.v) &&
        typeof m.build === 'string' &&
        m.build.length <= 64 &&
        (m.id === undefined || (typeof m.id === 'string' && HELLO_ID.test(m.id)))
        ? { k: 'hello', v: m.v, build: m.build, ...(typeof m.id === 'string' ? { id: m.id } : {}) }
        : null;
    case 'in': {
      if (!(
        isCount(m.n) &&
        isCount(m.keys) &&
        m.keys <= 15 &&
        isCount(m.act) &&
        isCount(m.cb) &&
        isCount(m.ci) &&
        m.ci < MAX_COMBOS &&
        isCount(m.ack) &&
        isCount(m.vr) &&
        m.vr <= MAX_VIEW &&
        (m.am === undefined || (isCount(m.am) && m.am >= 1 && m.am <= AIM_STEPS)) &&
        ((m.px === undefined && m.py === undefined) ||
          (isCount(m.px) && isCount(m.py) && m.px <= MAX_COORD && m.py <= MAX_COORD)) &&
        (m.rd === undefined || m.rd === 1)
      )) {
        return null;
      }
      const vt = m.vt;
      if (vt !== undefined && !(numbers(vt, 2) && isCount(vt[0]) && isIndex(vt[1], MAX_VOTE_OPTIONS))) return null;
      const rq = m.rq;
      if (rq !== undefined) {
        const ok =
          Array.isArray(rq) &&
          (rq.length === 2 || rq.length === 3) &&
          isCount(rq[0]) &&
          rq[0] > 0 &&
          isIndex(rq[1], MAX_REQUESTS + 2) &&
          (rq.length === 2
            ? rq[1] < MAX_REQUESTS
            : (rq[1] === MAX_REQUESTS || rq[1] === MAX_REQUESTS + 1) && // words of their own, or a one-tap note
              typeof rq[2] === 'string' &&
              rq[2].length >= 1 &&
              rq[2].length <= MAX_ASK);
        if (!ok) return null;
      }
      const base = {
        k: 'in',
        n: m.n,
        keys: m.keys,
        act: m.act,
        cb: m.cb,
        ci: m.ci,
        ack: m.ack,
        vr: m.vr,
        ...(m.am === undefined ? {} : { am: m.am }),
        ...(m.px === undefined ? {} : { px: m.px, py: m.py }),
        ...(m.rd === 1 ? { rd: 1 as const } : {}),
        ...(vt === undefined ? {} : { vt: [vt[0], vt[1]] as [number, number] }),
        ...(rq === undefined
          ? {}
          : { rq: (rq.length === 2 ? [rq[0], rq[1]] : [rq[0], rq[1], rq[2]]) as InputMsg['rq'] }),
      } as const;
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
      // Kept as tuples, re-encoded from what was checked so the scene's decodeEvent can't meet anything unexpected.
      const events = (rawEvents ?? []).map((raw: unknown) => {
        const ev = decodeEvent(raw);
        return ev ? encodeEvent(ev.id, ev.e) : null;
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
        (m.ia !== undefined && !isCount(m.ia)) ||
        !isWeather(m.w) ||
        !isCount(m.chests) ||
        m.chests > MAX_CHEST_MASK ||
        !Array.isArray(m.crops) ||
        m.crops.length > MAX_CROPS ||
        !m.crops.every((c: unknown) => cropFromCode(c) !== null) ||
        (m.ponds !== undefined && !isPonds(m.ponds)) ||
        (m.barrels !== undefined && !validBarrelsWire(m.barrels)) ||
        (m.folk !== undefined && !validFolkWire(m.folk))
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
        ...(m.ia === undefined ? {} : { ia: m.ia }),
        chests: m.chests,
        crops: m.crops as number[],
        ...(m.ponds === undefined ? {} : { ponds: m.ponds as number[] }),
        ...(m.barrels === undefined ? {} : { barrels: m.barrels as number[] }),
        ...(m.folk === undefined ? {} : { folk: m.folk as number[] }),
        w: m.w,
        ...(m.ground === undefined ? {} : { ground: ground as GroundSnap[] }),
        events: events as EventWire[],
      };
    }
    case 'do':
      return isCount(m.n) &&
        TRADE_OPS.includes(m.op as TradeOp) &&
        isCount(m.item) &&
        m.item <= Math.max(itemCount(), MAX_LOADOUT_CODE) && // an item code, or a loadout code (the `loadout` op)
        typeof m.shop === 'string' &&
        m.shop.length <= MAX_SHOP_ID
        ? { k: 'do', n: m.n, op: m.op as TradeOp, item: m.item, shop: m.shop }
        : null;
    case 'pack': {
      const say = m.say as { id?: unknown; text?: unknown; ok?: unknown; story?: unknown } | undefined;
      const sayOk =
        say === undefined ||
        (typeof say === 'object' &&
          say !== null &&
          isCount(say.id) &&
          typeof say.text === 'string' &&
          say.text.length <= 64 &&
          typeof say.ok === 'boolean' &&
          (say.story === undefined ||
            (typeof say.story === 'string' && /^[a-z0-9]{1,16}(\.[a-z]{1,8})?$/.test(say.story))));
      return isCount(m.n) &&
        isCount(m.gold) &&
        codes(m.worn, GEAR_SLOTS.length) &&
        Array.isArray(m.items) &&
        m.items.length <= MAX_PACK &&
        m.items.every(isCode) &&
        isCount(m.ack) &&
        questFromWire(m.quests) !== null &&
        isCount(m.skills) &&
        m.skills <= MAX_SKILL_MASK &&
        isCount(m.loadout) &&
        loadoutFromCode(m.loadout) !== null &&
        numbers(m.needs, 2) &&
        m.needs.every((v: number) => Number.isInteger(v) && v >= 0 && v <= NEED_MAX) &&
        sayOk
        ? {
            k: 'pack',
            n: m.n,
            gold: m.gold,
            worn: m.worn,
            items: m.items,
            ack: m.ack,
            quests: m.quests as number[],
            skills: m.skills,
            loadout: m.loadout,
            needs: [m.needs[0] ?? 0, m.needs[1] ?? 0],
            ...(say === undefined ? {} : { say: say as { id: number; text: string; ok: boolean; story?: string } }),
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
    case 'dm': {
      const dials = m.dials;
      const dialsOk =
        !!dials &&
        typeof dials === 'object' &&
        !Array.isArray(dials) &&
        Object.entries(dials).every(([id, on]) => (DIALS as readonly string[]).includes(id) && typeof on === 'boolean');
      const v = m.vote as Partial<VoteWire> | null | undefined;
      const voteOk =
        v === null ||
        (!!v &&
          typeof v === 'object' &&
          isCount(v.id) &&
          Array.isArray(v.options) &&
          v.options.length >= 1 &&
          v.options.length <= MAX_VOTE_OPTIONS &&
          v.options.every((o) => typeof o === 'string' && o.length <= MAX_VOTE_LABEL) &&
          numbers(v.tally, v.options.length) &&
          v.tally.every(isCount) &&
          typeof v.yours === 'number' &&
          Number.isInteger(v.yours) &&
          v.yours >= -1 &&
          v.yours < v.options.length);
      const s = m.say;
      const sayOk =
        s === undefined ||
        (Array.isArray(s) &&
          s.length === 2 &&
          isCount(s[0]) &&
          typeof s[1] === 'string' &&
          s[1].length >= 1 &&
          s[1].length <= MAX_SAY_CUED);
      const holdOk = m.hold === undefined || m.hold === 1;
      const replyOk =
        m.reply === undefined ||
        (Array.isArray(m.reply) &&
          m.reply.length === 2 &&
          isCount(m.reply[0]) &&
          typeof m.reply[1] === 'string' &&
          m.reply[1].length >= 1 &&
          m.reply[1].length <= MAX_SAY_CUED);
      const taskOk = m.task === undefined || taskFromWire(m.task) !== null;
      return isCount(m.n) &&
        isNum(m.shift) &&
        Math.abs(m.shift) <= 1 &&
        dialsOk &&
        voteOk &&
        sayOk &&
        holdOk &&
        replyOk &&
        taskOk
        ? {
            k: 'dm',
            n: m.n,
            shift: m.shift,
            dials: dials as Record<string, boolean>,
            vote: v === null ? null : (v as VoteWire),
            ...(s === undefined ? {} : { say: s as [number, string] }),
            ...(m.hold === 1 ? { hold: 1 as const } : {}),
            ...(m.task === undefined ? {} : { task: m.task as TaskWire }),
            ...(m.reply === undefined ? {} : { reply: m.reply as [number, string] }),
          }
        : null;
    }
    case 'world': {
      const entries = m.entries;
      const ok =
        isCount(m.n) &&
        isCount(m.total) &&
        m.total <= MAX_LOG &&
        isCount(m.from) &&
        Array.isArray(entries) &&
        entries.length >= 1 &&
        entries.length <= WORLD_CHUNK &&
        m.from + entries.length <= m.total &&
        entries.every(
          (e: unknown) =>
            !!e &&
            typeof e === 'object' &&
            !Array.isArray(e) &&
            typeof (e as { t?: unknown }).t === 'string' &&
            JSON.stringify(e).length <= MAX_ENTRY,
        );
      return ok
        ? {
            k: 'world',
            n: m.n as number,
            total: m.total as number,
            from: m.from as number,
            entries: entries as Record<string, unknown>[],
          }
        : null;
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
