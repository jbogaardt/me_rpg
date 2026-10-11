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
};
const UNKNOWN: Rgb = [120, 120, 120];
/** Blocked cells (trees, rocks, cliffs, walls) are drawn darker so the shape of the land shows. Water is blocked everywhere. */
const OBSTACLE_SHADE = 0.55;

/** RGBA pixels, one per map cell, row-major: `data.width` x `data.height`. */
export function minimapPixels(data: MapData): Uint8ClampedArray {
  const cells = data.width * data.height;
  const blocked = new Set(data.collision);
  const out = new Uint8ClampedArray(cells * 4);
  for (let i = 0; i < cells; i++) {
    const name = data.surfaces[data.surface[i] ?? 0] ?? 'grass';
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
