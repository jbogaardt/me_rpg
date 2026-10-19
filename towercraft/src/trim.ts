// How a building's picture grows with its upgrades (cosmetic; the rules never read it). A castle gains size and pennants with each
// castle level; a smithy gains them as its owner buys upgrades. Kept Pixi-free so the steps are unit-tested; `main.ts` draws them.

import { MAX_LEVEL } from './sim/races';

export interface Trim {
  /** Multiplies the building's drawn size. */
  scale: number;
  /** Pennants (race-coloured flags) on its roof line. */
  pennants: number;
  /** A race-coloured foot ring round the base. */
  ring: boolean;
}

/** A castle at `level` (1..MAX_LEVEL): +8% size per level, a pair of pennants more per level, and a ring at the top. */
export const castleTrim = (level: number): Trim => {
  const up = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  return { scale: 1 + 0.08 * up, pennants: up * 2, ring: level >= MAX_LEVEL };
};

/** Upgrade levels bought per smithy step: three steps (0..3) across a race's lines. */
export const SMITHY_STEP = 3;
export const SMITHY_MAX_TIER = 3;

/** A smithy after its owner bought `bought` upgrade levels in total: +5% size and a pennant per step, a ring at the top. */
export const smithyTrim = (bought: number): Trim => {
  const tier = Math.min(SMITHY_MAX_TIER, Math.floor(Math.max(0, bought) / SMITHY_STEP));
  return { scale: 1 + 0.05 * tier, pennants: tier, ring: tier >= SMITHY_MAX_TIER };
};

/** A change key: redraw the trim only when this string changes. */
export const trimKey = (t: Trim) => `${t.scale}|${t.pennants}|${t.ring}`;
