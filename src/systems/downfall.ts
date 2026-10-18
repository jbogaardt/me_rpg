/**
 * The hero's fall (Pixi-free, tested). Out of HP is no longer an instant teleport: the hero collapses (`FALL_S`), lies
 * there while the screen goes dark and the card is read (`LIE_S`), and only then wakes at the start of the world, as
 * `Simulation.defeat` always did. Core engine; solo and host run the clock (`Player.down`, seconds since falling), a guest
 * is told by `FLAG.down` and keeps its own copy of the clock for the same fade. Nothing here changes what a defeat costs.
 */
export const FALL_S = 0.9;
export const LIE_S = 1.5;
/** Seconds from the fatal blow to waking. */
export const DOWN_TOTAL = FALL_S + LIE_S;
/** How long the screen takes to come back after waking (the overlay's own clock). */
export const WAKE_S = 0.9;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** How dark the screen is `t` seconds after the blow: clear while collapsing, black by the time of waking. */
export function downDark(t: number): number {
  return smooth(clamp01((t - FALL_S * 0.4) / (DOWN_TOTAL - FALL_S * 0.4 - 0.1)));
}

/** How far the "You fell" card has come in (0 to 1): it fades in once the hero is down. */
export function downCard(t: number): number {
  return smooth(clamp01((t - FALL_S) / 0.5));
}

/** The darkness `s` seconds after waking (1 at once, clear after `WAKE_S`). */
export const wakeDark = (s: number): number => 1 - smooth(clamp01(s / WAKE_S));

/** How strong the low-HP vignette is for this share of HP (nothing above a third, full near death). */
export function lowHealth(hp: number, maxHp: number): number {
  if (maxHp <= 0 || hp <= 0) return 0;
  return clamp01((0.34 - hp / maxHp) / 0.24);
}
