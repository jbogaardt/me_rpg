// The sword's input buffer (core engine, Pixi-free). An attack pressed shortly before the cooldown ends is not lost: it
// waits, and fires on the first tick the cooldown allows. Holding the attack key in a fight refreshes it every tick, so
// the swings chain at the weapon's own rate. One pending press at most, per player; the HOST owns it (a guest's presses
// arrive as the `act` count and are buffered there, so nothing new goes over the wire). Cooldowns are never changed here.

/**
 * How long a pending attack press waits for the cooldown (seconds). Long enough that two taps 0.2 s apart both swing
 * (the second lands 0.15 s before the 0.35 s cooldown ends), forgiving a press a few frames early
 * (the bar is "within about 100 ms"), short enough that a press made mid-recovery does not swing a moment later by surprise.
 */
export const ATTACK_BUFFER_S = 0.16;

/** One player's pending attack press. `place` is where it was made (a zone): a press does not follow the hero through a door. */
export class AttackBuffer {
  private left = 0;
  private place = '';

  /** An attack was asked for (or held): remember it, replacing any older one. */
  press(place: string) {
    this.left = ATTACK_BUFFER_S;
    this.place = place;
  }

  get pending(): boolean {
    return this.left > 0;
  }

  /** Forget it (a dialog or menu opened, the hero fell). */
  clear() {
    this.left = 0;
  }

  /**
   * One tick, after the cooldown has been counted down to `cooldown`: true when the pending press fires now (it is then
   * cleared). A press that outlived its window, or was made in another zone, is dropped.
   */
  step(dt: number, cooldown: number, place: string): boolean {
    if (this.left <= 0) return false;
    if (place !== this.place) {
      this.left = 0;
      return false;
    }
    if (cooldown <= 0) {
      this.left = 0;
      return true;
    }
    this.left = Math.max(0, this.left - dt);
    return false;
  }
}
