// The Dungeon Master's director (Pixi-free, tested; core engine, co-op): it watches the party and decides WHEN to put a
// card in front of the DM, so they steer by reacting rather than by digging through controls. A card appears on its own:
// the party is struggling, the party is breezing through, a task is half done and could use a twist, nothing has been
// asked of the party for a while, the party reached a new land, someone fell, the story has a next road. Each card has
// two or three buttons, answered with one tap or left alone (the game carries on). What each card says and does is
// scenes/overworld/DmPrompts.ts.

export type Suggestion =
  | 'revive' // someone fell: raise them?
  | 'story' // the party finished what was told: where next?
  | 'struggle' // the party is hurting: ease off, or stay the course?
  | 'easy' // the party is breezing through: turn up the heat, or stay the course?
  | 'twist' // a task is half done and the party is neither: make it interesting
  | 'next' // nothing asked of the party for a while: what now?
  | 'land'; // the party reached a new land: how does the sky look?

/** What the director sees each frame. */
export interface DirectorState {
  /** Something else has the screen (a card, a dialog, the menu, a door): nothing new now. */
  busy: boolean;
  /** A player has fallen and the DM has not been asked. */
  fallen: boolean;
  /** The party has told every quest placed so far and there is a road to take. */
  storyReady: boolean;
  /** The DM's task, if one is running; `id` changes with each call. */
  task: { id: number; kind: 'follow' | 'defend' | 'hunt'; active: boolean; progress: number; goal: number } | null;
  /** The party's health as fractions (0..1), or null with nobody to watch. */
  health: { avg: number; min: number } | null;
  /** The name of the area the party is in. */
  area: string;
}

/** Seconds of quiet (no task) before "what now?", and between such nudges. */
export const IDLE_BEFORE_NEXT = 20;
/** Seconds between cards that are only colour; the urgent ones (a fallen player, the story) wait much less. */
export const CARD_GAP = 10;
const URGENT_GAP = 3;
/** A task this far along is "part way": time for a twist. */
export const MIDWAY = 0.4;
/** Healthy enough to be bored, hurt enough to worry. */
export const EASY_AT = 0.8;
export const STRUGGLE_AT = 0.35;
/** Seconds before the DM is told again that the party is struggling during one task. */
const STRUGGLE_AGAIN = 45;

export class Director {
  private since = CARD_GAP; // the first card may come at once
  private idle = 0;
  private area: string | null = null;
  private taskId = -1;
  private midway = false;
  private struggled = -Infinity;
  private clock = 0;
  private newLand = false;
  private wasActive = false;

  /** Advance `dt` seconds; the card to offer now, if any. */
  tick(dt: number, s: DirectorState): Suggestion | null {
    this.since += dt;
    this.clock += dt;
    if (this.area !== null && s.area !== this.area) this.newLand = true;
    this.area = s.area;
    const active = s.task?.active === true;
    if (s.task && s.task.id !== this.taskId) {
      this.taskId = s.task.id;
      this.midway = false;
      this.struggled = -Infinity;
    }
    if (this.wasActive && !active) this.idle = IDLE_BEFORE_NEXT - 8; // the task just ended: a nudge in a few seconds
    this.wasActive = active;
    if (active) this.idle = 0;
    else this.idle += dt;
    if (s.busy) return null;

    if (s.fallen && this.since >= URGENT_GAP) return this.fire();
    if (s.storyReady && this.since >= URGENT_GAP) return this.fire('story');
    if (this.since < CARD_GAP) return null;

    const t = s.task;
    if (t?.active && s.health) {
      if (s.health.min < STRUGGLE_AT && this.clock - this.struggled >= STRUGGLE_AGAIN) {
        this.struggled = this.clock;
        return this.fire('struggle');
      }
      if (t.kind !== 'follow' && !this.midway && t.goal > 0 && t.progress / t.goal >= MIDWAY) {
        this.midway = true;
        return this.fire(s.health.avg >= EASY_AT ? 'easy' : s.health.avg <= 0.5 ? 'struggle' : 'twist');
      }
    }
    if (!active && this.newLand) {
      this.newLand = false;
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
    this.newLand = false;
    this.wasActive = false;
  }
}
