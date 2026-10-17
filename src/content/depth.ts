// How dangerous a region of a random or live world is, from how far it lies from the start (Pixi-free, tested; content, a
// pure function of the world's shape). A world is a chain of regions, so the start is depth 0, the region beyond it depth 1,
// and a side land or dead end hangs one deeper than the region it opens from (`World.depthOf`). The level a region is made
// for rises about one level per region at first and flattens gently (a long world is never walled by its own far end), up
// to `MAX_BAND`. The assembler writes it into each biome (`levels`) and its roam groups and placements (`level`, which
// `systems/bands.ts` turns into foes of that level), so the same pack kind is a tougher fight deeper in. Nothing here is
// sent to a co-op guest: every peer derives it from the same log.

import { MAX_BAND } from '../systems/bands';
import type { Band } from '../systems/levels';

/** The level of the start region, and the level every region climbs from. */
const START = 2;
/** Where the climb would end if it never flattened further (it is capped at `MAX_BAND`); larger is gentler. */
const REACH = MAX_BAND - START;

/** The level a region `depth` steps from the start is made for (a whole level, 2 at the start). */
export function depthLevel(depth: number): number {
  const d = Math.max(0, Math.floor(depth));
  return Math.min(MAX_BAND, Math.max(1, Math.round(START + REACH * (1 - Math.exp(-d / REACH)))));
}

/** What a region at `depth` declares: its band (a level each side of `level`, 1 to 3 at the start), the level its roamers are made for and the level of its boss, at the band's top. */
export function depthBand(depth: number): { levels: Band; level: number; top: number } {
  const level = depthLevel(depth);
  const levels: Band = [Math.max(1, level - 1), Math.min(MAX_BAND, level + 1)];
  return { levels, level, top: levels[1] };
}
