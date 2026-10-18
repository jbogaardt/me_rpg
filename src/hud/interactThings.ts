// What the hero could interact with, and how brightly each thing should glint (Pixi-free, allocation-free, tested). The
// drawing is in InteractMarks.ts; `Interactions.things` fills the list from the zone. A thing is "in reach" exactly when
// the interact key would act on it, so the on-screen button and the glint never promise what a press cannot do.

import { CELL } from '../map/types';

/** The glyph on the interact button for the nearest thing in reach: a speech bubble, a hand or a chest. */
export type MarkKind = 'talk' | 'hand' | 'chest';

export interface Thing {
  /** Where the glint floats (world px, a little above the thing). */
  x: number;
  y: number;
  kind: MarkKind;
  /** How close the hero must be (px, measured the way the action measures it) and how close they are. */
  reach: number;
  dist: number;
  /** False for things that already show themselves (a ripe plot's Harvest button, a pond's Drink button, a carried barrel). */
  mark: boolean;
}

export const newThing = (): Thing => ({ x: 0, y: 0, kind: 'hand', reach: 0, dist: Infinity, mark: true });

/** At most this many glints at once, the nearest to the hero (the cost on a phone stays flat in a crowded square). */
export const MAX_MARKS = 8;

/** How far out a glint starts to show: two tiles, or a little past the reach when that is longer. */
export const glintRange = (reach: number): number => Math.max(2 * CELL, reach + CELL * 0.75);

/** Brightness 0..1: nothing beyond the range, a faint glint at its edge, full once in reach. */
export function glow(dist: number, reach: number): number {
  if (dist <= reach) return 1;
  const range = glintRange(reach);
  if (dist >= range) return 0;
  return 0.25 + 0.6 * (1 - (dist - reach) / (range - reach));
}

/** Put the (up to `max`) things that glint into `out`, nearest first; returns how many. `out` must be at least `max` long. */
export function pickMarks(things: readonly Thing[], count: number, out: Thing[], max = MAX_MARKS): number {
  let n = 0;
  const cap = Math.min(max, out.length);
  for (let i = 0; i < count; i++) {
    const t = things[i]!;
    if (!t.mark || glow(t.dist, t.reach) === 0) continue;
    let at = n;
    while (at > 0 && out[at - 1]!.dist > t.dist) at--;
    if (at >= cap) continue;
    for (let j = Math.min(n, cap - 1); j > at; j--) out[j] = out[j - 1]!;
    out[at] = t;
    if (n < cap) n++;
  }
  return n;
}

/** The kind of the nearest thing in reach (the button's glyph), or null when there is none (the button hides). */
export function nearestInReach(things: readonly Thing[], count: number): MarkKind | null {
  let best: Thing | null = null;
  for (let i = 0; i < count; i++) {
    const t = things[i]!;
    if (t.dist <= t.reach && (!best || t.dist < best.dist)) best = t;
  }
  return best ? best.kind : null;
}
