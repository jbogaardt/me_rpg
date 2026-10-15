// The quests the Dungeon Master gives the whole party (Pixi-free, tested; core engine, co-op). They are real quests, written
// from the land the party stands in and left to the party to work out: hunt five of a foe that lives here, gather the local
// plants or stones, find a relic hidden somewhere in the land, reach a named place. The party gets a search area on the
// map, never an arrow (the DM can hand out a hint when they are lost). One at a time; the host owns it, friends are told.
// They sit beside the story's quest chain: the chain is the spine of the tale, these are the DM's tool.

import { MAX_NOTE } from './dmBrief';

export const TASK_KINDS = ['hunt', 'gather', 'find', 'visit'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_STATES = ['active', 'done', 'failed'] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** How close (px) someone must come to a named place to have reached it. */
export const VISIT_REACH = 6 * 32;
/** A quest nobody finishes ends after this many seconds. */
export const TASK_TIMEOUT = 1500;
/** How long the result ("Done!") stays up for everyone. */
export const TASK_LINGER = 5;
/** Seconds without progress before the party counts as lost. */
export const STALL_AFTER = 90;

/** Where someone is: the zone's name and a world position (px). */
export interface Presence {
  zone: string;
  x: number;
  y: number;
}

/** A quest the DM may give, written from a land (systems/dmQuests.ts). */
export interface QuestOffer {
  kind: TaskKind;
  /** What it asks, in a few words ("Hunt 5 Goblins", "Find the Wayfarer's Charm"). */
  title: string;
  zone: string;
  goal: number;
  /** Hunt: the foe's kind key; gather: the site kind; find: the item id; visit: the place's name. */
  what: string;
  /** Where it leads (the area the party is shown): the foes, the nearest site, the relic, the place. */
  x: number;
  y: number;
}

export interface Task {
  kind: TaskKind;
  state: TaskState;
  title: string;
  zone: string;
  x: number;
  y: number;
  progress: number;
  goal: number;
  what: string;
  /** Gather: which sites of the kind have been touched (a bit per site index). */
  bits: number;
  /** The DM has pointed the way: an arrow, not only a search area. */
  hint: boolean;
  age: number;
  /** Seconds since progress last grew. */
  sinceProgress: number;
  /** The lowest the party's health has been (0..1) and how many times someone fell, since it was given. */
  minHealth: number;
  falls: number;
}

export interface TaskInput {
  /** The party (never the DM). */
  party: Presence[];
  /** Foes of the quest's kind the party killed in its zone since the last tick. */
  kills: number;
  /** Gather: indexes of the sites touched since the last tick. */
  touched: number[];
  /** Find: the relic was found. */
  found: boolean;
  /** Where the quest leads now (foes move, the nearest site changes), when it is known. */
  at?: { x: number; y: number };
  /** The party's lowest health now (0..1) and how many fell this tick. */
  health: number;
  falls: number;
}

/** How a finished (or failed) quest went: what the director reads to choose its nudge. */
export interface TaskResult {
  kind: TaskKind;
  state: TaskState;
  elapsed: number;
  minHealth: number;
  falls: number;
  /** About how long it should take (seconds). */
  par: number;
}

/** About how long a quest takes (seconds): the yardstick for "that was quick". */
export function parOf(kind: TaskKind, goal: number): number {
  return kind === 'hunt' ? goal * 35 : kind === 'gather' ? goal * 50 : kind === 'find' ? 180 : 120;
}

export class TaskBook {
  task: Task | null = null;
  /** How the last quest to end went. */
  result: TaskResult | null = null;

  /** Give the quest. False if one is running. */
  call(offer: QuestOffer): boolean {
    if (this.task?.state === 'active') return false;
    this.result = null;
    this.task = {
      kind: offer.kind,
      state: 'active',
      title: offer.title,
      zone: offer.zone,
      x: offer.x,
      y: offer.y,
      progress: 0,
      goal: offer.goal,
      what: offer.what,
      bits: 0,
      hint: false,
      age: 0,
      sinceProgress: 0,
      minHealth: 1,
      falls: 0,
    };
    return true;
  }

  /** The DM calls it off. */
  cancel() {
    this.task = null;
  }

  /** The DM points the way: the party is shown an arrow too. */
  giveHint() {
    if (this.task?.state === 'active') this.task.hint = true;
  }

  /** Move on `dt` seconds; the state afterwards ('done' and 'failed' are returned once, on the tick they happen). */
  tick(dt: number, input: TaskInput): TaskState | null {
    const t = this.task;
    if (!t || t.state !== 'active') return null;
    t.age += dt;
    t.sinceProgress += dt;
    t.minHealth = Math.min(t.minHealth, input.health);
    t.falls += input.falls;
    if (input.at) [t.x, t.y] = [input.at.x, input.at.y];
    const before = t.progress;
    if (t.kind === 'hunt') t.progress = Math.min(t.goal, t.progress + input.kills);
    else if (t.kind === 'gather') {
      for (const i of input.touched) {
        if (i < 0 || i > 30 || t.bits & (1 << i)) continue;
        t.bits |= 1 << i;
        t.progress = Math.min(t.goal, t.progress + 1);
      }
    } else if (t.kind === 'find') {
      if (input.found) t.progress = t.goal;
    } else if (input.party.some((p) => p.zone === t.zone && Math.hypot(p.x - t.x, p.y - t.y) <= VISIT_REACH))
      t.progress = t.goal;
    if (t.progress > before) t.sinceProgress = 0;
    if (t.progress >= t.goal) t.state = 'done';
    else if (t.age >= TASK_TIMEOUT) t.state = 'failed';
    if (t.state === 'active') return null;
    this.result = {
      kind: t.kind,
      state: t.state,
      elapsed: t.age,
      minHealth: t.minHealth,
      falls: t.falls,
      par: parOf(t.kind, t.goal),
    };
    return t.state;
  }
}

/** How a finished quest went, for the DM's nudge: quick and unhurt, hard-won, or neither. */
export function classify(r: TaskResult): 'smooth' | 'rough' | 'plain' {
  if (r.state !== 'done') return 'plain';
  if (r.falls > 0 || r.minHealth < 0.3) return 'rough';
  if (r.elapsed < r.par * 0.6 && r.minHealth >= 0.7) return 'smooth';
  return 'plain';
}

/** What a quest pays each player for finishing it (a relic pays its item too: see DmTasks). */
export function taskReward(kind: TaskKind, goal: number): { xp: number; gold: number } {
  return kind === 'hunt'
    ? { xp: 14 * goal, gold: 5 * goal }
    : kind === 'gather'
      ? { xp: 12 * goal, gold: 4 * goal }
      : kind === 'find'
        ? { xp: 70, gold: 30 }
        : { xp: 40, gold: 15 };
}

/** A quest as the party sees it (and as it travels). */
export interface TaskView {
  kind: TaskKind;
  state: TaskState;
  title: string;
  progress: number;
  goal: number;
  zone: string;
  x: number;
  y: number;
  what: string;
  bits: number;
  hint: boolean;
  /** The DM's own instructions for it, when they wrote some (they replace the usual telling). */
  note?: string;
}

export const viewOf = (t: Task): TaskView => ({
  kind: t.kind,
  state: t.state,
  title: t.title,
  progress: Math.floor(t.progress),
  goal: t.goal,
  zone: t.zone,
  x: Math.round(t.x),
  y: Math.round(t.y),
  what: t.what,
  bits: t.bits,
  hint: t.hint,
});

/** The tracker line: what was asked and how it stands. */
export function taskText(v: TaskView): string {
  if (v.state === 'done') return `${v.title}: done!`;
  if (v.state === 'failed') return `${v.title}: failed`;
  return v.goal > 1 ? `${v.title} (${v.progress}/${v.goal})` : v.title;
}

/**
 * [kind, state, progress, goal, zone, x, y, title, bits, hint, what, note?]: how a quest travels in a `dm` message (the
 * note only when the DM wrote instructions).
 */
export type TaskWire =
  | [number, number, number, number, string, number, number, string, number, number, string]
  | [number, number, number, number, string, number, number, string, number, number, string, string];

export const taskWire = (v: TaskView): TaskWire =>
  [
    TASK_KINDS.indexOf(v.kind),
    TASK_STATES.indexOf(v.state),
    v.progress,
    v.goal,
    v.zone,
    v.x,
    v.y,
    v.title,
    v.bits,
    v.hint ? 1 : 0,
    v.what,
    ...(v.note ? [v.note] : []),
  ] as TaskWire;

const MAX_ZONE = 48;
const MAX_TITLE = 64;
const MAX_WHAT = 48;
const MAX_COORD = 100_000;

/** A quest from a message, or null if it is not one. */
export function taskFromWire(w: unknown): TaskView | null {
  if (!Array.isArray(w) || (w.length !== 11 && w.length !== 12)) return null;
  const [k, s, progress, goal, zone, x, y, title, bits, hint, what, note] = w as unknown[];
  const kind = typeof k === 'number' ? TASK_KINDS[k] : undefined;
  const state = typeof s === 'number' ? TASK_STATES[s] : undefined;
  const whole = (n: unknown, max: number): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
  const text = (v: unknown, max: number, min = 0): v is string =>
    typeof v === 'string' && v.length >= min && v.length <= max;
  if (
    !kind ||
    !state ||
    !whole(progress, 10_000) ||
    !whole(goal, 10_000) ||
    !whole(x, MAX_COORD) ||
    !whole(y, MAX_COORD)
  )
    return null;
  if (!text(zone, MAX_ZONE, 1) || !text(title, MAX_TITLE, 1) || !text(what, MAX_WHAT)) return null;
  if (!whole(bits, 0x7fffffff) || (hint !== 0 && hint !== 1)) return null;
  if (note !== undefined && !text(note, MAX_NOTE, 1)) return null;
  return { kind, state, progress, goal, zone, x, y, title, what, bits, hint: hint === 1, ...(note ? { note } : {}) };
}
