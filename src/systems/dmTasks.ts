// The quests the Dungeon Master gives the whole party (Pixi-free, tested; core engine, co-op). They are real quests, written
// from the land the party stands in and left to the party to work out: hunt five of a foe that lives here, gather the local
// plants or stones, find a relic hidden somewhere in the land, reach a named place. The party is told in words, with nothing
// on the map, until the DM notices they are lost and offers a compass, which points toward the place and then at it (`HINT_AREA`, `HINT_ARROW`). One at a time; the host owns it, friends are told.
// They sit beside the story's quest chain: the chain is the spine of the tale, these are the DM's tool.

import { CELL } from '../map/types';
import { MAX_NOTE } from './dmBrief';
import { offerReward, partyLog, questOf } from './dmQuests';
import type { QuestLog } from './combat';
import { VISIT_RADIUS, castIn, haulIn, killIn, progressIn, siteIn, visitIn, type Quest } from './quests';

/** A quest's kind; its place in this list is how it travels, so the list is append-only. */
export const TASK_KINDS = ['hunt', 'gather', 'find', 'visit', 'cast', 'haul'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_STATES = ['active', 'done', 'failed'] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** How close (px) someone must come to a named place to have reached it (the campaign's own radius: one rule). */
export const VISIT_REACH = VISIT_RADIUS * CELL;
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
  /** The party's level when it was written: what it pays is scaled to it (`dmQuests.ts` `levelScale`). */
  level?: number;
}

export interface Task {
  /** The quest it is, and the log it is tracked in: the same rules as a hero's own quest (`quests.ts`) count it. */
  quest: Quest;
  log: QuestLog;
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
  /** How much of the compass the DM has offered (`HINT_AREA`, `HINT_ARROW`; 0 nothing but the telling). */
  hint: number;
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
  return kind === 'hunt'
    ? goal * 35
    : kind === 'gather'
      ? goal * 50
      : kind === 'cast'
        ? goal * 15
        : kind === 'haul'
          ? goal * 45
          : kind === 'find'
            ? 180
            : 120;
}

/**
 * How much of the way the party is shown. A quest is told in words only: the map is the party's own (explored ground, never
 * marked for a quest) and they read the land. Only when the DM notices they are lost (the director's card, or a player
 * asking) is a compass offered: first its needle leans toward the place to search (and the door toward another land), and
 * the second time it points straight at the goal.
 */
export const HINT_AREA = 1;
export const HINT_ARROW = 2;

export class TaskBook {
  task: Task | null = null;
  /** How the last quest to end went. */
  result: TaskResult | null = null;

  /** Give the quest. False if one is running. */
  call(offer: QuestOffer): boolean {
    if (this.task?.state === 'active') return false;
    this.result = null;
    this.task = {
      quest: questOf(offer),
      log: partyLog(),
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
      hint: 0,
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

  /** The DM gives a little more of the compass: first toward the area to search (and the door toward it), then at the goal. */
  giveHint() {
    if (this.task?.state === 'active') this.task.hint = Math.min(HINT_ARROW, this.task.hint + 1);
  }

  /** A foe of kind `key` fell in `zone` (anyone's kill): counts if the quest wants it. */
  kill(key: string, zone: string): boolean {
    const t = this.task;
    if (!t || t.state !== 'active' || !killIn(t.log, t.quest, key, zone)) return false;
    this.count(t);
    return true;
  }

  /** The party touched a site of `kind` (the relic of a find is one) in `zone`: counts if the quest wants it and it is new. */
  touch(kind: string, zone: string, index: number): boolean {
    const t = this.task;
    if (!t || t.state !== 'active' || !siteIn(t.log, t.quest, kind, zone, index)) return false;
    this.count(t);
    return true;
  }

  /** Someone cast a spell in `zone`: counts if the quest wants one. */
  cast(zone: string): boolean {
    const t = this.task;
    if (!t || t.state !== 'active' || !castIn(t.log, t.quest, zone)) return false;
    this.count(t);
    return true;
  }

  /** Barrel `index` of `zone` was set down at (x, y): counts if it is a new one by the haul quest's place (t.x, t.y). */
  haul(zone: string, index: number, x: number, y: number): boolean {
    const t = this.task;
    const place = t && { col: t.x / CELL - 0.5, row: t.y / CELL - 0.5 };
    if (!t || t.state !== 'active' || !haulIn(t.log, t.quest, zone, place ?? undefined, index, x, y)) return false;
    this.count(t);
    return true;
  }

  /** The quest as the log now stands: what the tracker and the wire read. */
  private count(t: Task) {
    const before = t.progress;
    t.progress = progressIn(t.log, t.quest);
    t.bits = t.kind === 'gather' || t.kind === 'haul' ? t.log.progress : 0;
    if (t.progress > before) t.sinceProgress = 0;
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
    const { quest, log } = t;
    if (quest.objective.t === 'visit') {
      const place = { col: t.x / CELL - 0.5, row: t.y / CELL - 0.5 };
      for (const p of input.party) if (visitIn(log, quest, p.zone, place, p.x, p.y)) break;
    }
    this.count(t);
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
export const taskReward = offerReward;

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
  hint: number;
  /** The DM's own instructions for it, when they wrote some (they replace the usual telling). */
  note?: string;
  /** The saga it is a step of, when it is one (systems/dmEpics.ts): its name, which step this is (1-based) and how many. */
  epic?: { title: string; step: number; total: number };
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
  const saga = v.epic ? `${v.epic.title} ${v.epic.step}/${v.epic.total}: ` : '';
  if (v.state === 'done') return `${saga}${v.title}: done!`;
  if (v.state === 'failed') return `${saga}${v.title}: failed`;
  return `${saga}${v.goal > 1 ? `${v.title} (${v.progress}/${v.goal})` : v.title}`;
}

/**
 * [kind, state, progress, goal, zone, x, y, title, bits, hint, what, note?, epic?]: how a quest travels in a `dm` message
 * (the note, '' for none, only when the DM wrote instructions or it is a saga's step; the saga as "step/total title").
 */
export type TaskWire =
  | [number, number, number, number, string, number, number, string, number, number, string]
  | [number, number, number, number, string, number, number, string, number, number, string, string]
  | [number, number, number, number, string, number, number, string, number, number, string, string, string];

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
    v.hint,
    v.what,
    ...(v.note || v.epic ? [v.note ?? ''] : []),
    ...(v.epic ? [`${v.epic.step}/${v.epic.total} ${v.epic.title}`] : []),
  ] as TaskWire;

const MAX_ZONE = 48;
const MAX_TITLE = 64;
const MAX_WHAT = 48;
const MAX_COORD = 100_000;

/** A quest from a message, or null if it is not one. */
export function taskFromWire(w: unknown): TaskView | null {
  if (!Array.isArray(w) || w.length < 11 || w.length > 13) return null;
  const [k, s, progress, goal, zone, x, y, title, bits, hint, what, note, saga] = w as unknown[];
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
  if (!whole(bits, 0x7fffffff) || !whole(hint, HINT_ARROW)) return null;
  if (note !== undefined && !text(note, MAX_NOTE)) return null;
  let epic: TaskView['epic'];
  if (saga !== undefined) {
    const m = typeof saga === 'string' ? /^(\d{1,3})\/(\d{1,3}) (.{1,48})$/.exec(saga) : null;
    if (!m) return null;
    epic = { step: Number(m[1]), total: Number(m[2]), title: m[3]! };
    if (epic.step < 1 || epic.step > epic.total) return null;
  }
  return {
    kind,
    state,
    progress,
    goal,
    zone,
    x,
    y,
    title,
    what,
    bits,
    hint,
    ...(note ? { note } : {}),
    ...(epic ? { epic } : {}),
  };
}
