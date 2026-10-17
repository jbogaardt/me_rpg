// The Dungeon Master's director (Pixi-free, tested; core engine, co-op): it watches the party and decides WHEN to put a
// card in front of the DM, so they steer by reacting rather than by digging through controls. A card appears on its own:
// the party is struggling, the party is breezing through, a task is half done and could use a twist, nothing has been
// asked of the party for a while, the party reached a new land, someone fell, the story has a next road. Each card has
// two or three buttons, answered with one tap or left alone (the game carries on). What each card says and does is
// scenes/overworld/DmPrompts.ts.

import { HINT_ARROW } from './dmTasks';

export type Suggestion =
  | 'revive' // someone fell: raise them?
  | 'story' // the party finished what was told: where next?
  | 'struggle' // the party is hurting: ease off, or stay the course?
  | 'easy' // the party is breezing through: turn up the heat, or stay the course?
  | 'twist' // a quest is part way and the party is neither: make it interesting
  | 'lost' // the party has made no progress for a long while: point the way, or let them wander?
  | 'done' // a quest ended quick and easy, or hard-won: raise the stakes, or give them a breather?
  | 'next' // nothing asked of the party for a while: which quest?
  | 'land'; // the party reached a new land: how does the sky look?

/** What the director sees each frame. */
export interface DirectorState {
  /** Something else has the screen (a card, a dialog, the menu, a door): nothing new now. */
  busy: boolean;
  /** A player has fallen and the DM has not been asked. */
  fallen: boolean;
  /** The party has told every quest placed so far and there is a road to take. */
  storyReady: boolean;
  /** The DM's quest, if there is one; `id` changes with each one given. */
  task: {
    id: number;
    active: boolean;
    progress: number;
    goal: number;
    /** Seconds since it was given, and since progress last grew. */
    age: number;
    sinceProgress: number;
    /** How much of the way the DM has shown (`dmTasks.ts` `HINT_ARROW` is all of it). */
    hint: number;
    /** How it ended, once it has: quick and unhurt, hard-won, or neither. */
    finished: 'smooth' | 'rough' | 'plain' | null;
  } | null;
  /** The party's health as fractions (0..1), or null with nobody to watch. */
  health: { avg: number; min: number } | null;
  /** The name of the area the party is in. */
  area: string;
}

/** Seconds of quiet (no task) before "what now?", and between such nudges. */
export const IDLE_BEFORE_NEXT = 90;
/** Seconds after a quest ends before the next is suggested: time to wander, shop and talk. */
const BREATHER = 45;
/** Seconds between cards that are only colour; the urgent ones (a fallen player, the story) wait much less. */
export const CARD_GAP = 10;
const URGENT_GAP = 3;
/** A quest this far along is "part way": time for a twist. A one-step quest (find, reach) is part way after this long (s). */
export const MIDWAY = 0.4;
export const HALF_TIME = 75;
/** Seconds without progress before the party counts as lost, and before the DM is asked about it again. */
export const LOST_AFTER = 90;
const LOST_AGAIN = 120;
/** Healthy enough to be bored, hurt enough to worry. */
export const EASY_AT = 0.8;
export const STRUGGLE_AT = 0.35;
/** Seconds before the DM is told again that the party is struggling during one task. */
const STRUGGLE_AGAIN = 45;
/** Seconds between "a new land" cards, however fast the party reaches new areas. */
export const LAND_GAP = 60;

export class Director {
  private since = CARD_GAP; // the first card may come at once
  private idle = 0;
  private area: string | null = null;
  private taskId = -1;
  private midway = false;
  private struggled = -Infinity;
  private lost = -Infinity;
  private clock = 0;
  private newLand = false;
  private visited = new Set<string>();
  private landed = -Infinity;
  private wasActive = false;
  private finishedSaid = false;

  /** Advance `dt` seconds; the card to offer now, if any. */
  tick(dt: number, s: DirectorState): Suggestion | null {
    this.since += dt;
    this.clock += dt;
    // `area` is the local player's zone, and open-air zones are laid out as one map, so walking along a seam flips it
    // back and forth: only an area never visited before is a new land.
    if (this.area !== null && s.area !== this.area && !this.visited.has(s.area)) this.newLand = true;
    this.area = s.area;
    this.visited.add(s.area);
    const active = s.task?.active === true;
    if (s.task && s.task.id !== this.taskId) {
      this.taskId = s.task.id;
      this.midway = false;
      this.struggled = -Infinity;
      this.lost = -Infinity;
      this.finishedSaid = false;
    }
    if (this.wasActive && !active) this.idle = IDLE_BEFORE_NEXT - BREATHER; // the quest just ended: a breather, then the next
    this.wasActive = active;
    if (active) this.idle = 0;
    else this.idle += dt;
    if (s.busy) return null;

    if (s.fallen && this.since >= URGENT_GAP) return this.fire();
    if (s.storyReady && this.since >= URGENT_GAP) return this.fire('story');
    const t = s.task;
    if (t && !t.active && t.finished && t.finished !== 'plain' && !this.finishedSaid && this.since >= URGENT_GAP) {
      this.finishedSaid = true;
      return this.fire('done'); // it went quick, or hard: a nudge before the next quest
    }
    if (this.since < CARD_GAP) return null;

    if (t?.active && s.health) {
      if (s.health.min < STRUGGLE_AT && this.clock - this.struggled >= STRUGGLE_AGAIN) {
        this.struggled = this.clock;
        return this.fire('struggle');
      }
      if (t.hint < HINT_ARROW && t.sinceProgress >= LOST_AFTER && this.clock - this.lost >= LOST_AGAIN) {
        this.lost = this.clock;
        return this.fire('lost');
      }
      const half = t.goal > 1 ? t.progress / t.goal >= MIDWAY : t.age >= HALF_TIME;
      if (!this.midway && t.goal > 0 && half) {
        this.midway = true;
        return this.fire(s.health.avg >= EASY_AT ? 'easy' : s.health.avg <= 0.5 ? 'struggle' : 'twist');
      }
    }
    if (!active && this.newLand && this.clock - this.landed >= LAND_GAP) {
      this.newLand = false;
      this.landed = this.clock;
      return this.fire('land');
    }
    if (!active && this.idle >= IDLE_BEFORE_NEXT) {
      this.idle = 0;
      return this.fire('next');
    }
    return null;
  }

  private fire(kind?: Suggestion): Suggestion {
    this.since = 0;
    return kind ?? 'revive';
  }

  /** The DM did something by hand that answers a card: do not ask again about it right away. */
  settled() {
    this.since = 0;
    this.idle = 0;
  }

  /** The DM said "not now" to a card: a longer breather before the next. */
  snooze(seconds: number) {
    this.since = Math.min(this.since, CARD_GAP - seconds);
  }

  reset() {
    this.since = CARD_GAP;
    this.idle = 0;
    this.area = null;
    this.taskId = -1;
    this.midway = false;
    this.struggled = -Infinity;
    this.lost = -Infinity;
    this.newLand = false;
    this.visited.clear();
    this.landed = -Infinity;
    this.wasActive = false;
    this.finishedSaid = false;
  }
}
