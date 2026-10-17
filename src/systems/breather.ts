// The breather (Pixi-free, tested; core engine, co-op): the pause after a quest ends, said out loud. The Dungeon Master's
// director has always left a quiet minute before the next quest (`dmDirector.ts`); this makes it a named moment the
// player sees (a badge with a clock, hud/BreatherBadge.ts) and the DM speaks (`BREATHER_WORDS`), so a lull reads as time to
// shop, mend and talk, never as the game having stalled. It is local to each page and nothing is sent: every page
// watches the same quest end (`arena.task`, or the story chain in solo) and starts its own clock.

/** Seconds of breather after a quest ends (the director waits this long before it offers the next). */
export const BREATHER_SECONDS = 45;

/** "0:42": seconds as a clock. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Breather {
  private left = 0;

  /** Seconds still to run (0 when none). */
  get seconds(): number {
    return this.left;
  }

  get active(): boolean {
    return this.left > 0;
  }

  /** Begin (or restart) a breather. */
  start(seconds = BREATHER_SECONDS) {
    this.left = seconds;
  }

  /** The next quest began, or the player moved on: the breather is over. */
  end() {
    this.left = 0;
  }

  /** Advance `dt` seconds; true on the frame it runs out. */
  tick(dt: number): boolean {
    if (this.left <= 0) return false;
    this.left = Math.max(0, this.left - dt);
    return this.left === 0;
  }
}

/** How a player says it is going. */
export const MOODS = ['good', 'ok', 'bad'] as const;
export type Mood = (typeof MOODS)[number];
export const MOOD_FACES: Record<Mood, string> = { good: '\u{1F600}', ok: '\u{1F610}', bad: '\u{1F61E}' };
