// People the Dungeon Master brings into a tale (Pixi-free, tested; core engine). Where a stranger may stand, and which
// of the world's looks they wear. Nothing here names a content id: it reads cells and the looks a world offers.

import { CELL } from '../map/types';

/** Distance (cells) from the party within which a new person stands: close enough to find, not on top of anyone. */
export const NEAR = { min: 3, max: 8 };

/** A cell's worth of ground a person needs: this cell and its eight neighbours open. */
const roomy = (collision: { isBlocked(col: number, row: number): boolean }, col: number, row: number): boolean =>
  [-1, 0, 1].every((a) => [-1, 0, 1].every((b) => !collision.isBlocked(col + a, row + b)));

/**
 * A free cell `NEAR.min` to `NEAR.max` cells from the nearest hero (nearest ring first), or null. `heroes` are bodies in
 * px; the last is the one the search is centred on (the DM, who stands with the party). Open ground only.
 */
export function openGroundNear(
  collision: { isBlocked(col: number, row: number): boolean },
  heroes: { body: { x: number; y: number } }[],
): { col: number; row: number } | null {
  const lead = heroes[heroes.length - 1];
  if (!lead) return null;
  const home = { col: Math.floor(lead.body.x / CELL), row: Math.floor(lead.body.y / CELL) };
  const apart = (col: number, row: number) =>
    Math.min(
      ...heroes.map((h) =>
        Math.max(Math.abs(col - Math.floor(h.body.x / CELL)), Math.abs(row - Math.floor(h.body.y / CELL))),
      ),
    );
  for (let r = NEAR.min; r <= NEAR.max; r++)
    for (let d = -r; d <= r; d++)
      for (const [col, row] of [
        [home.col + d, home.row - r],
        [home.col + d, home.row + r],
        [home.col - r, home.row + d],
        [home.col + r, home.row + d],
      ] as const)
        if (roomy(collision, col, row) && apart(col, row) >= NEAR.min) return { col, row };
  return null;
}

/**
 * The look a person wears: the first of `looks` whose name contains `hint` (a word like "monk" or "smith", any case),
 * else the `n`th in turn, so strangers do not all look alike. Null when the world offers no look.
 */
export function pickLook(looks: { id: string; name: string }[], hint: string | undefined, n: number): string | null {
  const word = hint?.trim().toLowerCase();
  const found = word ? looks.find((l) => l.name.toLowerCase().includes(word)) : undefined;
  return (found ?? looks[n % Math.max(1, looks.length)])?.id ?? null;
}
