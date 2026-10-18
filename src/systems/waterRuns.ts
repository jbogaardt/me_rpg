/**
 * Where the water is (Pixi-free, tested; `entities/Atmosphere.ts` lays shimmer over it). Core engine and visual only: it
 * reads the map's surfaces, never a content id beyond the names of the water grounds, so every page finds the same
 * pools in its own copy of the map and a guest needs nothing from the host.
 */

/** The grounds that are standing water underground (`tools/map/catalog.ts`). */
export const WATER_SURFACES: ReadonlySet<string> = new Set(['sewerWater', 'caveWater']);

/** A block of water cells (cell units). */
export interface WaterRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

interface Scan {
  width: number;
  height: number;
  surface: ArrayLike<number>;
  surfaces: readonly string[];
}

/**
 * The water of a map as few rectangles as it takes: each row's runs of water, merged downwards when the next row has a
 * run of exactly the same extent (a channel is one rectangle, a round pool a few).
 */
export function waterRects(data: Scan): WaterRect[] {
  const water = data.surfaces.map((name) => WATER_SURFACES.has(name));
  const isWater = (col: number, row: number) => water[data.surface[row * data.width + col] ?? -1] === true;
  const done: WaterRect[] = [];
  let open: WaterRect[] = [];
  for (let row = 0; row < data.height; row++) {
    const runs: WaterRect[] = [];
    for (let col = 0; col < data.width; col++) {
      if (!isWater(col, row)) continue;
      let w = 1;
      while (col + w < data.width && isWater(col + w, row)) w++;
      runs.push({ col, row, w, h: 1 });
      col += w - 1;
    }
    const next: WaterRect[] = [];
    for (const run of runs) {
      const above = open.find((r) => r.col === run.col && r.w === run.w && r.row + r.h === row);
      if (above) {
        above.h++;
        next.push(above);
      } else next.push(run);
    }
    for (const r of open) if (!next.includes(r)) done.push(r);
    open = next;
  }
  return [...done, ...open];
}

/** Where a light's reflection falls: the water straight below it (world px column and the span of water, top to bottom). */
export interface Reflection {
  x: number;
  top: number;
  bottom: number;
}

/** The reflection of a light at world (x, y) in the first water below it within `reach` px, or null. */
export function reflectionOf(
  x: number,
  y: number,
  rects: readonly WaterRect[],
  cell = 32,
  reach = 224,
): Reflection | null {
  const col = Math.floor(x / cell);
  let best: Reflection | null = null;
  for (const r of rects) {
    if (col < r.col || col >= r.col + r.w) continue;
    const top = r.row * cell;
    if (top < y - cell || top - y > reach) continue;
    if (!best || top < best.top) best = { x, top, bottom: (r.row + r.h) * cell };
  }
  return best;
}
