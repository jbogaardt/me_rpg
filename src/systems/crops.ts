import type { Hero, Item } from './combat';
import { addToPack, packFree, takeFromPack } from './inventory';
import { ITEMS } from './items';

// Crops: plants that grow in a plot of soil, ripen over a few minutes and give food when picked. Pixi-free rules; the
// plot you see and walk up to is entities/Plot.ts, and the host's loop that grows and tends them is
// scenes/overworld/Farming.ts. The art is the LPC crops sheet (public/tilesets/crops.png): a column of 32x64 frames per
// plant, one per stage (see `cropFrame`).
//
// Two kinds of plot (`PlotSpawn` in map/types.ts, `z.plot(col, row, crop?)` in a map spec): a *wild* one comes ripe and
// grows back by itself after it is picked; a *farm* one starts bare, and a seed from the pack is planted in it and gives
// a better harvest.

/** The stages a plant shows: sprout, small, growing, ripe. */
export const STAGES = 4;
export const RIPE = STAGES - 1;

export interface CropKind {
  name: string;
  /** Seconds from planting (or from the last pick, for a wild one) to ripe. */
  grow: number;
  /** Key of the produce item in ITEMS, and of the seed item. */
  produce: string;
  seed: string;
  /** Column of the crops sheet (32px wide) and the y of the block of frames it is in (0 or 320). */
  col: number;
  base: number;
  /** Which 32px-tall window of the ripe frame is the produce's icon in the pack (0 = top of the frame). */
  icon: number;
}

export const CROPS = {
  potato: { name: 'Potato', grow: 210, produce: 'potato', seed: 'potatoSeeds', col: 0, base: 0, icon: 32 },
  carrot: { name: 'Carrot', grow: 180, produce: 'carrot', seed: 'carrotSeeds', col: 6, base: 0, icon: 32 },
  radish: { name: 'Radish', grow: 120, produce: 'radish', seed: 'radishSeeds', col: 8, base: 0, icon: 32 },
  cabbage: { name: 'Cabbage', grow: 240, produce: 'cabbage', seed: 'cabbageSeeds', col: 6, base: 320, icon: 32 },
  tomato: { name: 'Tomato', grow: 240, produce: 'tomato', seed: 'tomatoSeeds', col: 28, base: 320, icon: 16 },
  pumpkin: { name: 'Pumpkin', grow: 360, produce: 'pumpkin', seed: 'pumpkinSeeds', col: 27, base: 0, icon: 32 },
  corn: { name: 'Corn', grow: 300, produce: 'corn', seed: 'cornSeeds', col: 31, base: 0, icon: 0 },
  strawberry: {
    name: 'Strawberry',
    grow: 180,
    produce: 'strawberry',
    seed: 'strawberrySeeds',
    col: 22,
    base: 320,
    icon: 16,
  },
} satisfies Record<string, CropKind>;

export type CropId = keyof typeof CROPS;
/** In wire order: a crop's index here (plus one) is its code in a snapshot. */
export const CROP_IDS = Object.keys(CROPS) as CropId[];

export const isCrop = (id: string): id is CropId => Object.hasOwn(CROPS, id);

/** A zone holds at most this many plots (a snapshot lists one small number for each). */
export const MAX_PLOTS = 24;

/** What a seed or a wild plot gives per pick: a planted plot rewards the work. */
export const FARM_YIELD = 2;
export const WILD_YIELD = 1;

/** The frame of the crops sheet to draw: `stage` 0..3 grows, `STAGES` (4) is the bare soil of a picked plot. */
export function cropFrame(id: CropId, stage: number) {
  const k = CROPS[id];
  return { x: k.col * 32, y: k.base + stage * 64, w: 32, h: 64 };
}

/** The soil of an empty plot (the sheet's potato column ends on a bare mound). */
export const SOIL_FRAME = cropFrame('potato', STAGES);

/** What a plot holds right now. `since` is the arena clock (seconds) when it was planted or last picked. */
export interface PlotState {
  crop: CropId | null;
  since: number;
  /** A wild plot grows back by itself; a farm one is bare after a pick. */
  wild: boolean;
}

/** A new plot: wild ones start ripe, farm ones bare. */
export function newPlot(crop: CropId | null, clock: number): PlotState {
  return { crop, since: crop ? clock - CROPS[crop].grow : clock, wild: crop !== null };
}

/** How grown the plant is, 0 (just planted) to 1 (ripe). */
export const growth = (p: PlotState, clock: number): number =>
  p.crop ? Math.max(0, Math.min(1, (clock - p.since) / CROPS[p.crop].grow)) : 0;

/** The stage to show: -1 for bare soil, 0..2 while growing, `RIPE` once it is. */
export function plotStage(p: PlotState, clock: number): number {
  if (!p.crop) return -1;
  const g = growth(p, clock);
  return g >= 1 ? RIPE : Math.min(RIPE - 1, Math.floor(g * (STAGES - 1)));
}

export const isRipe = (p: PlotState, clock: number): boolean => plotStage(p, clock) === RIPE;

/** The seed in the pack that would be planted (the first one), if any. */
export function seedInPack(hero: Hero): { item: Item; crop: CropId } | null {
  for (const item of hero.pack) if (item.seed && isCrop(item.seed)) return { item, crop: item.seed };
  return null;
}

export type Tended = { ok: true; text: string } | { ok: false; text: string };

/** Plant the first seed in the pack in a bare plot. */
export function plant(hero: Hero, p: PlotState, clock: number): Tended {
  if (p.crop) return { ok: false, text: '' };
  const seed = seedInPack(hero);
  if (!seed) return { ok: false, text: 'Needs seeds' };
  takeFromPack(hero, seed.item);
  p.crop = seed.crop;
  p.since = clock;
  return { ok: true, text: `Planted ${CROPS[seed.crop].name}` };
}

/** Pick a ripe plant into the pack: as many as fit (at least one), or nothing when the pack is full. */
export function harvest(hero: Hero, p: PlotState, clock: number): Tended {
  if (!p.crop || !isRipe(p, clock)) return { ok: false, text: '' };
  const kind = CROPS[p.crop];
  const item = (ITEMS as Record<string, Item>)[kind.produce];
  if (!item) throw new Error(`Crop "${kind.name}" gives unknown produce "${kind.produce}"`);
  const free = packFree(hero);
  if (free < 1) return { ok: false, text: 'Pack full' };
  const n = Math.min(free, p.wild ? WILD_YIELD : FARM_YIELD);
  for (let i = 0; i < n; i++) addToPack(hero, item);
  if (p.wild)
    p.since = clock; // grows back
  else p.crop = null;
  return { ok: true, text: `+${n} ${kind.name}` };
}

// --- The network: a plot is one small number in a snapshot (the stage is all a guest needs to draw it).

/** 0 for bare soil, else 1 + crop index * STAGES + stage. */
export function plotCode(p: PlotState, clock: number): number {
  return p.crop ? 1 + CROP_IDS.indexOf(p.crop) * STAGES + plotStage(p, clock) : 0;
}

/** Every code a snapshot may carry is below this. */
export const PLOT_CODES = 1 + CROP_IDS.length * STAGES;

export function decodePlot(code: number): { crop: CropId; stage: number } | null {
  const crop = CROP_IDS[Math.floor((code - 1) / STAGES)];
  return code >= 1 && crop ? { crop, stage: (code - 1) % STAGES } : null;
}
