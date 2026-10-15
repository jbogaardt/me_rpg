// Tasks the Dungeon Master calls for the whole party, anchored where they stand (Pixi-free, tested; core engine, co-op).
// They sit beside the story's quest chain: the chain is the spine of the tale, a task is the DM's moment-to-moment
// tool: "follow me", "defend this ground", "hunt here". One at a time; the host owns it, friends are told.

export const TASK_KINDS = ['follow', 'defend', 'hunt'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_STATES = ['active', 'done', 'failed'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const TASK_LABEL: Record<TaskKind, string> = {
  follow: 'Follow me',
  defend: 'Defend this ground',
  hunt: 'Hunt here',
};

/** How close (px) the party must be to the DM to count as gathered round them. */
export const FOLLOW_RADIUS = 224;
/** How far (px) the DM must walk before "follow me" can end, and how long (s) they must then stand still. */
export const FOLLOW_TRAVEL = 480;
export const FOLLOW_STILL = 3;
/** How close (px) someone must stand to hold the ground, how long it takes (s), and how long they may all be away (s). */
export const DEFEND_RADIUS = 320;
export const DEFEND_GOAL = 60;
export const DEFEND_AWAY = 20;
/** How many foes a hunt asks for. */
export const HUNT_GOAL = 5;
/** A task nobody finishes ends after this many seconds. */
export const TASK_TIMEOUT = 900;
/** How long the result ("Done!") stays up for everyone. */
export const TASK_LINGER = 5;

/** Where someone is: the zone's name and a world position (px). */
export interface Presence {
  zone: string;
  x: number;
  y: number;
}

export interface Task {
  kind: TaskKind;
  state: TaskState;
  /** Where it is anchored (follow: where the DM stands now). */
  zone: string;
  x: number;
  y: number;
  progress: number;
  goal: number;
  /** Follow: how far the DM has walked since the call, and how long they have stood still since. */
  travelled: number;
  still: number;
  /** Defend: how long nobody has been on the ground. */
  away: number;
  age: number;
}

export interface TaskInput {
  dm: Presence;
  /** The party (never the DM). */
  party: Presence[];
  /** Foes the party killed since the last tick, in the task's zone. */
  kills: number;
}

export class TaskBook {
  task: Task | null = null;

  /** Call a task where the DM stands. False if one is already running. */
  call(kind: TaskKind, at: Presence): boolean {
    if (this.task?.state === 'active') return false;
    const goal = kind === 'follow' ? FOLLOW_STILL : kind === 'defend' ? DEFEND_GOAL : HUNT_GOAL;
    this.task = {
      kind,
      state: 'active',
      zone: at.zone,
      x: at.x,
      y: at.y,
      progress: 0,
      goal,
      travelled: 0,
      still: 0,
      away: 0,
      age: 0,
    };
    return true;
  }

  /** The DM calls it off. */
  cancel() {
    this.task = null;
  }

  /** Move on `dt` seconds; the state afterwards ('done' and 'failed' are returned once, on the tick they happen). */
  tick(dt: number, input: TaskInput): TaskState | null {
    const t = this.task;
    if (!t || t.state !== 'active') return null;
    t.age += dt;
    if (t.kind === 'follow') this.follow(t, dt, input);
    else if (t.kind === 'defend') this.defend(t, dt, input);
    else t.progress = Math.min(t.goal, t.progress + input.kills); // the caller counts only kills in the task's zone
    if (t.progress >= t.goal) t.state = 'done';
    else if (t.age >= TASK_TIMEOUT || t.away >= DEFEND_AWAY) t.state = 'failed';
    return t.state === 'active' ? null : t.state;
  }

  private follow(t: Task, dt: number, { dm, party }: TaskInput) {
    const moved = dm.zone === t.zone ? Math.hypot(dm.x - t.x, dm.y - t.y) : 0;
    t.zone = dm.zone;
    [t.x, t.y] = [dm.x, dm.y];
    t.travelled += moved;
    t.still = moved <= 0.5 ? t.still + dt : 0;
    const gathered =
      party.length > 0 && party.every((p) => p.zone === dm.zone && Math.hypot(p.x - dm.x, p.y - dm.y) <= FOLLOW_RADIUS);
    if (!gathered || t.travelled < FOLLOW_TRAVEL) {
      t.progress = 0;
      if (!gathered) t.still = 0;
    } else t.progress = Math.min(t.goal, t.still);
  }

  private defend(t: Task, dt: number, { party }: TaskInput) {
    const here = party.some((p) => p.zone === t.zone && Math.hypot(p.x - t.x, p.y - t.y) <= DEFEND_RADIUS);
    if (here) {
      t.progress = Math.min(t.goal, t.progress + dt);
      t.away = 0;
    } else t.away += dt;
  }
}

/** What a task pays each player for finishing it. */
export function taskReward(kind: TaskKind): { xp: number; gold: number } {
  return kind === 'defend' ? { xp: 40, gold: 20 } : kind === 'hunt' ? { xp: 50, gold: 25 } : { xp: 15, gold: 5 };
}

/** A task as the party sees it (and as it travels). */
export interface TaskView {
  kind: TaskKind;
  state: TaskState;
  progress: number;
  goal: number;
  zone: string;
  x: number;
  y: number;
}

export const viewOf = (t: Task): TaskView => ({
  kind: t.kind,
  state: t.state,
  progress: Math.floor(t.progress),
  goal: t.goal,
  zone: t.zone,
  x: Math.round(t.x),
  y: Math.round(t.y),
});

/** The tracker line: what the DM asked and how it stands. */
export function taskText(v: TaskView): string {
  if (v.state === 'done') return `${TASK_LABEL[v.kind]}: done!`;
  if (v.state === 'failed') return `${TASK_LABEL[v.kind]}: failed`;
  if (v.kind === 'follow') return v.progress > 0 ? 'The DM calls: hold here…' : 'The DM calls: follow me';
  if (v.kind === 'defend') return `The DM calls: defend this ground (${v.progress}/${v.goal} s)`;
  return `The DM calls: hunt here (${v.progress}/${v.goal})`;
}

/** [kind, state, progress, goal, zone, x, y]: how a task travels in a `dm` message. */
export type TaskWire = [number, number, number, number, string, number, number];

export const taskWire = (v: TaskView): TaskWire => [
  TASK_KINDS.indexOf(v.kind),
  TASK_STATES.indexOf(v.state),
  v.progress,
  v.goal,
  v.zone,
  v.x,
  v.y,
];

const MAX_ZONE = 48;
const MAX_COORD = 100_000;

/** A task from a message, or null if it is not one. */
export function taskFromWire(w: unknown): TaskView | null {
  if (!Array.isArray(w) || w.length !== 7) return null;
  const [k, s, progress, goal, zone, x, y] = w as unknown[];
  const kind = typeof k === 'number' ? TASK_KINDS[k] : undefined;
  const state = typeof s === 'number' ? TASK_STATES[s] : undefined;
  const whole = (n: unknown, max: number): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
  if (
    !kind ||
    !state ||
    !whole(progress, 10_000) ||
    !whole(goal, 10_000) ||
    !whole(x, MAX_COORD) ||
    !whole(y, MAX_COORD)
  )
    return null;
  if (typeof zone !== 'string' || !zone || zone.length > MAX_ZONE) return null;
  return { kind, state, progress, goal, zone, x, y };
}
