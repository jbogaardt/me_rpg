import { CELL, type MapData } from './types';

// Pixi-free pieces of the map overlay (src/hud/MapOverlay.ts): one pixel per map cell, and where a world
// position lands on it.

type Rgb = readonly [number, number, number];

/** Overlay colour of each ground surface (the names in MapData.surfaces). */
const SURFACE_COLORS: Record<string, Rgb> = {
  grass: [96, 158, 74],
  sand: [222, 196, 122],
  snow: [238, 243, 248],
  ice: [168, 212, 238],
  water: [56, 108, 178],
  stone: [138, 142, 148],
  sea: [40, 96, 150],
  cobble: [128, 130, 140],
  flagstone: [210, 204, 170],
  crackedStone: [126, 118, 110],
  mud: [110, 78, 46],
  dirt: [176, 140, 92],
  clay: [150, 82, 58], // the desert's red dirt
  ash: [92, 88, 96],
  bog: [52, 58, 30],
  lava: [226, 92, 30],
  pit: [40, 30, 26],
  caveFloor: [128, 98, 74], // caves and sewers (tools/map/delve.ts); a roof or wall reads dark, as an obstacle
  caveRubble: [120, 92, 70],
  caveWater: [34, 52, 58],
  caveLava: [226, 92, 30],
  sewerFloor: [120, 124, 134],
  sewerWater: [38, 64, 52],
  beyond: [26, 26, 46], // a neighbouring biome: seen from here but not part of this zone
};
const UNKNOWN: Rgb = [120, 120, 120];
/** Blocked cells (trees, rocks, cliffs, walls) are drawn darker so the shape of the land shows. Water is blocked everywhere. */
const OBSTACLE_SHADE = 0.55;

/**
 * RGBA pixels, one per map cell, row-major: `data.width` x `data.height`. With `explored` (1 = seen, one per cell)
 * only the seen cells are drawn and the rest are left transparent; a neighbouring biome (`beyond`) always shows as
 * the dark background.
 */
export function minimapPixels(data: MapData, explored?: ArrayLike<number>): Uint8ClampedArray {
  const cells = data.width * data.height;
  const blocked = new Set(data.collision);
  const out = new Uint8ClampedArray(cells * 4);
  for (let i = 0; i < cells; i++) {
    const name = data.surfaces[data.surface[i] ?? 0] ?? 'grass';
    if (explored && !explored[i] && name !== 'beyond') continue; // fog: stays transparent
    const [r, g, b] = SURFACE_COLORS[name] ?? UNKNOWN;
    const shade = blocked.has(i) && name !== 'water' ? OBSTACLE_SHADE : 1;
    out[i * 4] = r * shade;
    out[i * 4 + 1] = g * shade;
    out[i * 4 + 2] = b * shade;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** A world position (pixels) as percentages of the map's width and height, clamped to the map. */
export function mapPercent(data: MapData, x: number, y: number): { left: number; top: number } {
  const pct = (v: number, cells: number) => Math.max(0, Math.min(100, (v / (cells * CELL)) * 100));
  return { left: pct(x, data.width), top: pct(y, data.height) };
}
