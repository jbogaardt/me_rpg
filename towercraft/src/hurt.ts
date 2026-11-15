// Hit feedback maths (cosmetic, Pixi-free): which things were just hurt, how strong the flash still is, and the eased health bar.
// The rules say only what a thing's health is now, so a drop between two frames is how a page tells it was hit.

/** How long (s) a hit tints its victim. */
export const FLASH_TIME = 0.2;
/** How fast (per second) a bar's shown share closes on the true one, and its lagging "damage" chip follows after a pause. */
const EASE = 9;
const CHIP_EASE = 2.2;
const CHIP_HOLD = 0.35;

export interface BarState {
  /** The share drawn as the bar's fill: eases toward the true one. */
  shown: number;
  /** The share the pale chip shows (what was just lost): holds a moment, then drains. */
  chip: number;
  hold: number;
  hp: number;
  hitAt: number;
  seen: number;
}

/** Strength of a hit flash `age` seconds on: 1 at the blow, 0 when it is over. */
export const flashOf = (age: number) => (age >= FLASH_TIME || age < 0 ? 0 : (1 - age / FLASH_TIME) ** 2);

/** Mix two 0xRRGGBB colours (`k` 0 is `a`, 1 is `b`). */
export function mixColor(a: number, b: number, k: number): number {
  const m = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** Remembers each thing's health from frame to frame (keyed by any number, kept apart by the caller) to find hits and ease bars. */
export class HurtTracker {
  private states = new Map<number, BarState>();
  private frame = 0;

  /** Start a frame: things not `touch`ed in it are forgotten at its end (`end`). */
  begin() {
    this.frame++;
  }

  /** Note a thing's health `hp` of `max` at time `now` and ease its bar by `dt`; returns its state. */
  touch(id: number, hp: number, max: number, now: number, dt: number): BarState {
    const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    let s = this.states.get(id);
    if (!s) this.states.set(id, (s = { shown: frac, chip: frac, hold: 0, hp, hitAt: -99, seen: this.frame }));
    s.seen = this.frame;
    if (hp < s.hp - 1e-6) {
      s.hitAt = now;
      s.hold = CHIP_HOLD;
    }
    s.hp = hp;
    s.shown += (frac - s.shown) * Math.min(1, EASE * dt);
    if (frac > s.chip) s.chip = frac;
    else if (s.hold > 0) s.hold -= dt;
    else s.chip += (frac - s.chip) * Math.min(1, CHIP_EASE * dt);
    return s;
  }

  /** The hit flash of a thing touched this frame (0 when never hit). */
  flash(id: number, now: number) {
    const s = this.states.get(id);
    return s ? flashOf(now - s.hitAt) : 0;
  }

  /** End a frame: forget what was not touched. */
  end() {
    for (const [id, s] of this.states) if (s.seen !== this.frame) this.states.delete(id);
  }

  clear() {
    this.states.clear();
  }
}

/** How much to enlarge a unit so it stays readable when the view is zoomed far out (1 up close, never more than 2). */
export const readableScale = (zoom: number) => Math.max(1, Math.min(2, (0.45 / Math.max(zoom, 0.01)) ** 0.7));
