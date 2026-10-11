// How the screen changes when the local player goes through a door, Pixi-free (the drawing is
// entities/ZoneTransition.ts). Into or out of a room or cave the old view is closed off by a shrinking circle around
// the hero and the new one opens around them (an iris); between two open-air zones, left at a map edge, the old view
// slides out and the new one slides in from the side the player walked off (the classic screen shift).

import { DIR_VEC, type Direction } from '../core/direction';
import { CELL, type MapData } from './types';

export type TransitionKind = 'iris' | 'slide';

export const IRIS_CLOSE = 0.35; // seconds for the circle to close on the old view
export const IRIS_DARK = 0.1; // seconds of black between the two views
export const IRIS_OPEN = 0.45; // seconds for the circle to open on the new view
export const SLIDE_TIME = 0.6; // seconds for one view to push the other off the screen
/**
 * A player this close to a map edge (px) who leaves for another open-air zone is walking off that edge: slide. Generous,
 * since an exit usually sits inside a border of trees or cliffs; a trip from further in (waking at the spawn) irises.
 */
export const EDGE_REACH = 8 * CELL;

/** How long a transition of `kind` takes, start to finish (an iris held shut by a zone still loading takes longer). */
export function transitionLength(kind: TransitionKind): number {
  return kind === 'iris' ? IRIS_CLOSE + IRIS_DARK + IRIS_OPEN : SLIDE_TIME;
}

/** Smoothstep: slow out, slow in. */
export function ease(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** The edge of a `w` x `h` map nearest (x, y), and how far away it is: the way a player leaving there is going. */
export function nearestEdge(w: number, h: number, x: number, y: number): { dir: Direction; distance: number } {
  const edges: [Direction, number][] = [
    ['left', x],
    ['right', w - x],
    ['up', y],
    ['down', h - y],
  ];
  let best = edges[0]!;
  for (const e of edges) if (e[1] < best[1]) best = e;
  return { dir: best[0], distance: best[1] };
}

/**
 * The transition for a trip from `from` (the player's feet at x, y) to `to`: an iris when either zone is a room (or
 * the trip does not start at a map edge, e.g. waking at the spawn after a defeat), otherwise a slide toward the edge.
 */
export function pickTransition(
  from: Pick<MapData, 'indoor' | 'width' | 'height'>,
  to: Pick<MapData, 'indoor'>,
  x: number,
  y: number,
): { kind: TransitionKind; dir: Direction } {
  const edge = nearestEdge(from.width * CELL, from.height * CELL, x, y);
  const slide = !from.indoor && !to.indoor && edge.distance <= EDGE_REACH;
  return { kind: slide ? 'slide' : 'iris', dir: edge.dir };
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

/**
 * The slide `t` seconds in, toward `dir` on a `w` x `h` screen: how far (screen px) to shift the frozen old view and
 * the live new one. They stay exactly a screen apart, so together they always fill it.
 */
export function slideAt(
  t: number,
  dir: Direction,
  w: number,
  h: number,
): { old: { x: number; y: number }; fresh: { x: number; y: number } } {
  const e = ease(t / SLIDE_TIME);
  const [dx, dy] = DIR_VEC[dir];
  const span = dx !== 0 ? w : h;
  const old = { x: Math.round(-dx * span * e) + 0, y: Math.round(-dy * span * e) + 0 }; // + 0: no -0
  return { old, fresh: { x: old.x + dx * span, y: old.y + dy * span } };
}
