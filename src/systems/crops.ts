import type { Hero, Item } from './combat';
import { addToPack, packFree, takeFromPack } from './inventory';
import { ITEMS } from './items';
import { hasCan } from './water';

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
  potato: { name: 'Potato', grow: 60, produce: 'potato', seed: 'potatoSeeds', col: 0, base: 0, icon: 32 },
  carrot: { name: 'Carrot', grow: 55, produce: 'carrot', seed: 'carrotSeeds', col: 6, base: 0, icon: 32 },
  radish: { name: 'Radish', grow: 45, produce: 'radish', seed: 'radishSeeds', col: 8, base: 0, icon: 32 },
  cabbage: { name: 'Cabbage', grow: 65, produce: 'cabbage', seed: 'cabbageSeeds', col: 6, base: 320, icon: 32 },
  tomato: { name: 'Tomato', grow: 65, produce: 'tomato', seed: 'tomatoSeeds', col: 28, base: 320, icon: 16 },
  pumpkin: { name: 'Pumpkin', grow: 75, produce: 'pumpkin', seed: 'pumpkinSeeds', col: 27, base: 0, icon: 32 },
  corn: { name: 'Corn', grow: 70, produce: 'corn', seed: 'cornSeeds', col: 31, base: 0, icon: 0 },
  strawberry: {
    name: 'Strawberry',
    grow: 55,
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

/** A plant has to be watered this many times to ripen: each watering (a can's charge) makes it grow for a third of its time. */
export const WATERINGS = 3;
/** How long one watering keeps a plant of this kind growing, in seconds. */
export const wetTime = (crop: CropId): number => CROPS[crop].grow / WATERINGS;
/** Rain keeps the plots of a zone wet for this long after it last fell on them. */
export const RAIN_WET = 60;

/**
 * What a plot holds right now. A plant only grows while it is wet: `grown` counts the seconds it has been watered (up to the
 * crop's `grow`), `wetUntil` is the arena clock (seconds) the water lasts till, and `last` the clock at the last `advance`.
 */
export interface PlotState {
  crop: CropId | null;
  grown: number;
  last: number;
  wetUntil: number;
  /** A wild plot grows back by itself (when watered); a farm one is bare after a pick. */
  wild: boolean;
}

/** A new plot: wild ones start ripe (and dry), farm ones bare. */
export function newPlot(crop: CropId | null, clock: number): PlotState {
  return { crop, grown: crop ? CROPS[crop].grow : 0, last: clock, wetUntil: 0, wild: crop !== null };
}

export const isWet = (p: PlotState, clock: number): boolean => clock < p.wetUntil;

/**
 * Bring the plot up to `clock`: the time since the last call that it was wet counts as growth (a zone nobody was in catches up
 * on the water it had, no more). Call it before reading the stage.
 */
export function advance(p: PlotState, clock: number) {
  if (p.crop) {
    const wet = Math.min(clock, p.wetUntil) - p.last;
    if (wet > 0) {
      const grow = CROPS[p.crop].grow;
      p.grown = p.grown + wet > grow - 1e-6 ? grow : p.grown + wet; // three thirds must make a whole
    }
  }
  p.last = Math.max(p.last, clock);
}

/** The rain falls on the plot: it stays wet a while longer. */
export function rain(p: PlotState, clock: number) {
  advance(p, clock); // the dry time before the rain does not count
  p.wetUntil = Math.max(p.wetUntil, clock + RAIN_WET);
}

/** How grown the plant is, 0 (just planted) to 1 (ripe). */
export const growth = (p: PlotState): number => (p.crop ? Math.min(1, p.grown / CROPS[p.crop].grow) : 0);

/** The stage to show: -1 for bare soil, 0..2 while growing, `RIPE` once it is. */
export function plotStage(p: PlotState): number {
  if (!p.crop) return -1;
  const g = growth(p);
  return g >= 1 ? RIPE : Math.min(RIPE - 1, Math.floor(g * (STAGES - 1)));
}

export const isRipe = (p: PlotState): boolean => plotStage(p) === RIPE;

/** A plant that is not ripe and has no water: it is not growing, and the plot says so. */
export const needsWater = (p: PlotState, clock: number): boolean => p.crop !== null && !isRipe(p) && !isWet(p, clock);

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
  p.grown = 0;
  p.last = clock;
  p.wetUntil = 0; // it needs watering to grow
  return { ok: true, text: `Planted ${CROPS[seed.crop].name}` };
}

/** Pick a ripe plant into the pack: as many as fit (at least one), or nothing when the pack is full. */
export function harvest(hero: Hero, p: PlotState, clock: number): Tended {
  if (!p.crop || !isRipe(p)) return { ok: false, text: '' };
  const kind = CROPS[p.crop];
  const item = (ITEMS as Record<string, Item>)[kind.produce];
  if (!item) throw new Error(`Crop "${kind.name}" gives unknown produce "${kind.produce}"`);
  const free = packFree(hero);
  if (free < 1) return { ok: false, text: 'Pack full' };
  const n = Math.min(free, p.wild ? WILD_YIELD : FARM_YIELD);
  for (let i = 0; i < n; i++) addToPack(hero, item);
  if (p.wild) {
    p.grown = 0; // grows back, once it is watered
    p.last = clock;
    p.wetUntil = 0;
  } else p.crop = null;
  return { ok: true, text: `+${n} ${kind.name}` };
}

/**
 * Water a growing plant from the can: one charge, and the plant grows for a third of its time, then is dry and asks again
 * (three waterings in all). A plant that is still wet has no use for more.
 */
export function water(hero: Hero, p: PlotState, clock: number): Tended {
  advance(p, clock); // bring it up to date first: the dry time so far does not count as wet
  if (!p.crop || isRipe(p)) return { ok: false, text: '' };
  if (isWet(p, clock)) return { ok: false, text: 'Already watered' };
  if (!hasCan(hero)) return { ok: false, text: 'Needs a watering can' };
  if (hero.stats.can < 1) return { ok: false, text: 'The can is empty' };
  hero.stats.can -= 1;
  const seg = wetTime(p.crop);
  p.wetUntil = clock + seg;
  return { ok: true, text: `Watered ${Math.min(WATERINGS, Math.round(p.grown / seg) + 1)}/${WATERINGS}` };
}

// --- The network: a plot is one small number in a snapshot (the stage is all a guest needs to draw it).

/** 0 for bare soil, else 1 + (crop index * STAGES + stage) * 2, plus 1 when the plant is wet. */
export function plotCode(p: PlotState, clock: number): number {
  return p.crop ? 1 + (CROP_IDS.indexOf(p.crop) * STAGES + plotStage(p)) * 2 + (isWet(p, clock) ? 1 : 0) : 0;
}

/** Every code a snapshot may carry is below this. */
export const PLOT_CODES = 1 + CROP_IDS.length * STAGES * 2;

export function decodePlot(code: number): { crop: CropId; stage: number; wet: boolean } | null {
  const n = Math.floor((code - 1) / 2);
  const crop = CROP_IDS[Math.floor(n / STAGES)];
  return code >= 1 && crop ? { crop, stage: n % STAGES, wet: (code - 1) % 2 === 1 } : null;
}
