// How the screen changes when the local player goes through a door, Pixi-free (the drawing is
// entities/ZoneTransition.ts). Two looks:
//  - an iris, for a room or a cave or a wake-up after a defeat: the old view is closed off by a shrinking circle round
//    the hero and the new one opens round them;
//  - a warp, for walking from one open-air zone into the next: the old view rushes past the hero (zooming in and
//    dissolving in a trail of echoes, drifting the way they went) while the new zone settles in from a closer shot,
//    under a flash of that zone's colour.

import { DIR_VEC, type Direction } from '../core/direction';
import type { MapData } from './types';

export type TransitionKind = 'iris' | 'warp';

export const IRIS_CLOSE = 0.35; // seconds for the circle to close on the old view
export const IRIS_DARK = 0.1; // seconds of black between the two views
export const IRIS_OPEN = 0.45; // seconds for the circle to open on the new view
export const WARP_TIME = 0.7; // seconds for the old view to dissolve and the new one to settle

/** How long a transition of `kind` takes, start to finish (an iris held shut by a zone still loading takes longer). */
export function transitionLength(kind: TransitionKind): number {
  return kind === 'iris' ? IRIS_CLOSE + IRIS_DARK + IRIS_OPEN : WARP_TIME;
}

/** Smoothstep: slow out, slow in. */
export function ease(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Fast at first, then settling: how a push-in should feel. */
export function easeOut(x: number): number {
  const t = 1 - Math.min(1, Math.max(0, x));
  return 1 - t * t * t;
}

/**
 * The transition for a trip from `from` to `to`: an iris when either zone is a room (or the trip is not through a door
 * that leads across the world, e.g. waking at the spawn after a defeat), otherwise a warp. `through` is the way the
 * door taken goes across the world, when it says (a gap between two biomes).
 */
export function pickTransition(
  from: Pick<MapData, 'indoor'>,
  to: Pick<MapData, 'indoor'>,
  through?: Direction,
): { kind: TransitionKind; dir: Direction } {
  if (through && !from.indoor && !to.indoor) return { kind: 'warp', dir: through };
  return { kind: 'iris', dir: through ?? 'down' };
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

/** Radius of a circle centred on (x, y) that covers the whole `w` x `h` screen. */
export function coverRadius(x: number, y: number, w: number, h: number): number {
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
}

/** One frame of a warp. */
export interface Warp {
  /** The old view: a still picture and its echoes. Scale is about the hero; alpha is 0..1; (x, y) is a drift in screen px. */
  old: { scale: number; alpha: number; x: number; y: number };
  /** The new view: the extra zoom the live world has (1 = none) and its drift, settling to nothing. */
  fresh: { scale: number; x: number; y: number };
  /** The flash of the new zone's colour over everything: 0..1. */
  flash: number;
}

const px = (n: number) => Math.round(n) + 0; // whole pixels, and never -0

/** The warp `t` seconds in, toward `dir`, on a `w` x `h` screen. */
export function warpAt(t: number, dir: Direction, w: number, h: number): Warp {
  const k = Math.min(1, Math.max(0, t / WARP_TIME));
  const [dx, dy] = DIR_VEC[dir];
  const rush = easeOut(k / 0.7); // the old view is gone by 70% of the way
  const settle = easeOut(k);
  const flash = k < 0.2 ? ease(k / 0.2) : 1 - ease((k - 0.2) / 0.8);
  return {
    old: {
      scale: 1 + 0.35 * rush,
      alpha: 1 - ease(k / 0.7),
      x: px(-dx * 0.08 * w * rush),
      y: px(-dy * 0.08 * h * rush),
    },
    fresh: {
      scale: 1 + 0.14 * (1 - settle),
      x: px(dx * 0.05 * w * (1 - settle)),
      y: px(dy * 0.05 * h * (1 - settle)),
    },
    flash: 0.5 * flash,
  };
}
