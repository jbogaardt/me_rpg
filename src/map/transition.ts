// How the screen changes when the local player goes through a door, Pixi-free (the drawing is
// entities/ZoneTransition.ts). One look for every trip, whatever the zones: a shop door, a gap into the next biome, a
// wake-up after a defeat. A circle closes on the hero in the old view, there is a beat of black, then it opens round
// them in the new zone while the new zone settles in from a slightly closer shot. The circle's rim glows in the
// colour of the zone being entered.

export const IRIS_CLOSE = 0.35; // seconds for the circle to close on the old view
export const IRIS_DARK = 0.1; // seconds of black between the two views
export const IRIS_OPEN = 0.45; // seconds for the circle to open on the new view
/** How much closer than normal the new zone starts (1.12 = 12% bigger), easing to its normal size as the circle opens. */
export const SETTLE = 0.12;

/** How long a transition takes, start to finish (an iris held shut by a zone still loading takes longer). */
export const TRANSITION_LENGTH = IRIS_CLOSE + IRIS_DARK + IRIS_OPEN;

/** Smoothstep: slow out, slow in. */
export function ease(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * The iris `t` seconds in: the circle's radius as a fraction of one that uncovers the whole screen (1 = fully open),
 * and whether it is still closing on the old view. `hold` keeps it shut after closing (the next zone is still loading).
 */
export function irisAt(t: number, hold = false): { open: number; closing: boolean } {
  if (t < IRIS_CLOSE) return { open: 1 - ease(t / IRIS_CLOSE), closing: true };
  if (hold || t < IRIS_CLOSE + IRIS_DARK) return { open: 0, closing: false };
  return { open: ease((t - IRIS_CLOSE - IRIS_DARK) / IRIS_OPEN), closing: false };
}

/** The extra zoom of the live world `t` seconds in (1 = none): it starts closer and settles as the circle opens. */
export function settleAt(t: number, hold = false): number {
  if (hold) return 1 + SETTLE;
  return 1 + SETTLE * (1 - ease((t - IRIS_CLOSE - IRIS_DARK) / IRIS_OPEN));
}

/** How strongly the coloured rim shows with the circle `open` (0..1): full while it is mostly shut, gone as it clears the screen. */
export function rimAlpha(open: number): number {
  return Math.min(1, (1 - open) * 4);
}

/** Radius of a circle centred on (x, y) that covers the whole `w` x `h` screen. */
export function coverRadius(x: number, y: number, w: number, h: number): number {
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
}
