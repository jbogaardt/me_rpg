import type { ComboKey } from '../systems/spells';

// Reads a combo off the direction presses (Pixi-free). Each press of up/down/left/right (keyboard or the on-screen pad,
// the move keys as bound) is added to what was typed; a pause longer than COMBO_WINDOW starts over. The moment the end of
// what was typed is one of the weapon's combos, that combo is done.

/** Seconds allowed between two presses of one combo. */
export const COMBO_WINDOW = 0.7;

export class ComboReader {
  private buffer = '';
  private idle = 0;

  /** The directions typed so far, still within the window. */
  get typed(): string {
    return this.buffer;
  }

  /** Time passes: a long pause forgets what was typed. */
  tick(dt: number) {
    this.idle += dt;
    if (this.idle > COMBO_WINDOW) this.buffer = '';
  }

  reset() {
    this.buffer = '';
    this.idle = 0;
  }

  /**
   * A direction was pressed. `combos` are the key strings of the weapon in hand, in order. Returns the index of the combo
   * that is now complete (the longest, if several end here), or -1.
   */
  press(key: ComboKey, combos: readonly string[]): number {
    if (!combos.length) {
      this.reset();
      return -1;
    }
    const longest = Math.max(...combos.map((c) => c.length));
    this.buffer = (this.buffer + key).slice(-longest);
    this.idle = 0;
    let found = -1;
    for (const [i, keys] of combos.entries()) {
      if (this.buffer.endsWith(keys) && (found < 0 || keys.length > (combos[found]?.length ?? 0))) found = i;
    }
    if (found >= 0) this.buffer = '';
    return found;
  }
}
