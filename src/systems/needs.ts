// Food and water: two meters (0..NEED_MAX) that drain with time and are refilled by eating and drinking supplies.
// Pixi-free so the rules are unit-tested. A fed and watered hero mends a little faster, a hungry or thirsty one mends
// more slowly, one with an empty meter stops mending, and one with both empty loses health (never the last point).
// Standing at the edge of a pond, a hero can also drink from it (`drinkableNear`, `sipWater`): the water flows in steadily
// and the pond drains as it does, drying up from the shore inwards, until it is dry; left alone it fills up again
// (`PondLevels`, `pondCells`).

import { CELL, type MapData } from '../map/types';

export const NEED_MAX = 100;

/** Meter points lost per second: food lasts about 20 minutes, water about 14 (a day is 12 minutes). */
export const FOOD_DRAIN = NEED_MAX / (20 * 60);
export const WATER_DRAIN = NEED_MAX / (14 * 60);

export interface Needs {
  food: number; // fractional while draining; show Math.ceil
  water: number;
}

export type NeedLevel = 'full' | 'ok' | 'low' | 'empty';

export const newNeeds = (): Needs => ({ food: NEED_MAX, water: NEED_MAX });

/** How a meter reads: full from 60, fine from 20, low above 0, empty at 0. */
export function needLevel(value: number): NeedLevel {
  if (value >= 60) return 'full';
  if (value >= 20) return 'ok';
  return value > 0 ? 'low' : 'empty';
}

const REGEN_FACTOR: Record<NeedLevel, number> = { full: 1.25, ok: 1, low: 0.5, empty: 0 };

/** Multiplier on the natural HP and MP regeneration (gear that mends is not affected): the worse of the two meters decides. */
export function needsRegen(n: Needs): number {
  const f = REGEN_FACTOR[needLevel(n.food)];
  const w = REGEN_FACTOR[needLevel(n.water)];
  return Math.min(f, w);
}

/** Let time pass. */
export function drainNeeds(n: Needs, dt: number): void {
  n.food = Math.max(0, n.food - FOOD_DRAIN * dt);
  n.water = Math.max(0, n.water - WATER_DRAIN * dt);
}

/** Refill the meters (never past full). Returns false when it would change nothing. */
export function refill(n: Needs, food: number, water: number): boolean {
  if ((food <= 0 || n.food >= NEED_MAX) && (water <= 0 || n.water >= NEED_MAX)) return false;
  n.food = Math.min(NEED_MAX, n.food + Math.max(0, food));
  n.water = Math.min(NEED_MAX, n.water + Math.max(0, water));
  return true;
}

/** A short word for the HUD tooltip and the Status tab. */
export const needWord = (kind: 'food' | 'water', value: number): string => {
  const level = needLevel(value);
  if (kind === 'food') return { full: 'Well fed', ok: 'Fed', low: 'Hungry', empty: 'Starving' }[level];
  return { full: 'Hydrated', ok: 'Fine', low: 'Thirsty', empty: 'Parched' }[level];
};

/** What the meters mean for mending, in a line ("" when all is well). */
export function needsNote(n: Needs): string {
  const k = needsRegen(n);
  if (k === 0) return starveRate(n, 1) > 0 ? 'Losing health to hunger and thirst' : 'Too weak to mend on your own';
  if (k < 1) return 'Mending slowly';
  if (k > 1) return 'Mending faster';
  return '';
}

/** Share of max HP lost per second while food and water are both empty. The hero is left on 1 HP, never killed. */
export const STARVE_SHARE = 0.03;

/** HP lost per second to hunger and thirst: only when both meters are empty. */
export function starveRate(n: Needs, maxHp: number): number {
  return n.food <= 0 && n.water <= 0 ? STARVE_SHARE * maxHp : 0;
}

/** An item whose only use is to feed or water (bread, a waterskin, a crop's produce): no use where nobody hungers. */
export function onlyFeeds(item: { use?: { hp?: number; mp?: number; food?: number; water?: number } }): boolean {
  const use = item.use;
  return !!use && !use.hp && !use.mp && !!(use.food || use.water);
}

/** Water per second while drinking from a pond: an empty meter takes about twelve seconds to fill. */
export const POND_FLOW = 8;
/** Water each cell of a pond holds: the Greenwood's small pond (71 cells) has about one thirsty hero's worth. */
export const WATER_PER_CELL = 1.5;
/** Seconds of steady rain that fill a dry pond (a storm fills it twice as fast; nothing else does). */
export const RAIN_FILL_TIME = 120;

/** How much of a pond the weather fills per second: rain and storms only, as hard as they are falling. */
export function rainFill(precip: string | null, intensity: number): number {
  if (precip !== 'rain' && precip !== 'storm') return 0;
  return ((precip === 'storm' ? 2 : 1) * Math.max(0, intensity)) / RAIN_FILL_TIME;
}

/** Where there is no weather (a campaign without the capability), a dry pond fills from below in about eight minutes. */
export const STILL_FILL = 1 / (RAIN_FILL_TIME * 4);

/** How far (px) from a hero's feet to the edge of the water they may drink from: the bank cell beside it. */
export const DRINK_REACH = CELL * 0.9;

/** Ground a hero may drink: a pond's clear water (the sea is salt, swamp water foul, ice frozen). */
const DRINKABLE = 'water';

/**
 * The middle of the nearest drinkable water cell whose edge is within `reach` of (x, y), or null. A pond's water cells
 * are solid, so the hero stands on the bank and the nearest edge is what counts, not the middle.
 */
export function drinkableNear(
  data: Pick<MapData, 'width' | 'height' | 'surfaces' | 'surface'>,
  x: number,
  y: number,
  reach = DRINK_REACH,
): { x: number; y: number; cell: number } | null {
  const id = data.surfaces.indexOf(DRINKABLE);
  if (id < 0) return null;
  const c0 = Math.max(0, Math.floor((x - reach) / CELL));
  const c1 = Math.min(data.width - 1, Math.floor((x + reach) / CELL));
  const r0 = Math.max(0, Math.floor((y - reach) / CELL));
  const r1 = Math.min(data.height - 1, Math.floor((y + reach) / CELL));
  let best: { x: number; y: number; cell: number } | null = null;
  let bestDist = reach;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (data.surface[r * data.width + c] !== id) continue;
      const dx = Math.max(c * CELL - x, 0, x - (c + 1) * CELL);
      const dy = Math.max(r * CELL - y, 0, y - (r + 1) * CELL);
      const d = Math.hypot(dx, dy);
      if (d > bestDist) continue;
      bestDist = d;
      best = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, cell: r * data.width + c };
    }
  }
  return best;
}

/** Is there anything to drink for? (The Drink button only shows when there is.) */
export const thirsty = (n: Needs): boolean => Math.ceil(n.water) < NEED_MAX;

/** Drink for `dt` seconds at `flow` water per second (never past full). Returns the water gained. */
export function sipWater(n: Needs, flow: number, dt: number): number {
  const before = n.water;
  n.water = Math.min(NEED_MAX, n.water + Math.max(0, flow * dt));
  return n.water - before;
}

type PondMap = Pick<MapData, 'width' | 'height' | 'surfaces' | 'surface'>;
interface PondShapes {
  labels: Int32Array; // each cell: its pond's id, -1 not looked at yet, -2 not water
  cells: Map<number, number[]>; // each pond's cells, those along the shore first, the middle last
  layers: Map<number, number[][]>; // each pond's rings of water: the cells along the shore, then the ring inside, ...
}
const shapes = new WeakMap<PondMap, PondShapes>();

/** Find the pond that `cell` is in (a flood fill of the water joined side by side) and order its cells shore first. */
function shapeOf(data: PondMap, cell: number): PondShapes {
  let s = shapes.get(data);
  if (!s) {
    s = { labels: new Int32Array(data.width * data.height).fill(-1), cells: new Map(), layers: new Map() };
    shapes.set(data, s);
  }
  const { labels } = s;
  if (labels[cell] !== -1 || cell < 0 || cell >= labels.length) return s;
  const water = data.surface[cell];
  const around = (i: number) => {
    const c = i % data.width;
    return [c > 0 ? i - 1 : -1, c < data.width - 1 ? i + 1 : -1, i - data.width, i + data.width];
  };
  const inPond = (j: number) => j >= 0 && j < labels.length && data.surface[j] === water;
  const cells = [cell];
  labels[cell] = cell;
  for (let k = 0; k < cells.length; k++) {
    for (const j of around(cells[k]!)) {
      if (!inPond(j) || labels[j] !== -1) continue;
      labels[j] = cell;
      cells.push(j);
    }
  }
  // Distance from the shore, by a walk inwards from every cell that touches land.
  const depth = new Map<number, number>();
  let ring = cells.filter((i) => around(i).some((j) => !inPond(j)));
  for (const i of ring) depth.set(i, 0);
  for (let d = 1; ring.length; d++) {
    const next: number[] = [];
    for (const i of ring) {
      for (const j of around(i)) {
        if (!inPond(j) || depth.has(j)) continue;
        depth.set(j, d);
        next.push(j);
      }
    }
    ring = next;
  }
  cells.sort((x, y) => (depth.get(x) ?? 0) - (depth.get(y) ?? 0) || x - y);
  s.cells.set(cell, cells);
  const layers: number[][] = [];
  for (const i of cells) (layers[depth.get(i) ?? 0] ??= []).push(i);
  s.layers.set(cell, layers);
  return s;
}

/**
 * Which pond a water cell belongs to: every cell of one body of water (joined side by side) gets the same id, the index
 * of the first of its cells found. Worked out once per pond and kept with the map.
 */
export function pondId(data: PondMap, cell: number): number {
  return shapeOf(data, cell).labels[cell] ?? -1;
}

/** A pond's cells (by its id), those along the shore first: the order it dries up in. */
export function pondCells(data: PondMap, id: number): readonly number[] {
  return shapeOf(data, id).cells.get(id) ?? [];
}

/** A pond's layers of water (by its id): the ring along the shore first, then each ring inside it, the middle last. */
export function pondLayers(data: PondMap, id: number): readonly (readonly number[])[] {
  return shapeOf(data, id).layers.get(id) ?? [];
}

/**
 * How a pond drained `level` (0..1) looks: how many of its layers are gone (from the shore in), and how far the next one
 * has faded (0..1). Each cell holds the same water, so a wide outer ring takes longer to go than a small middle.
 */
export function drainedLayers(layers: readonly (readonly number[])[], level: number): { gone: number; fading: number } {
  const total = layers.reduce((n, l) => n + l.length, 0);
  let left = Math.max(0, Math.min(1, level)) * total;
  for (let k = 0; k < layers.length; k++) {
    const n = layers[k]!.length;
    if (left < n) return { gone: k, fading: left / n };
    left -= n;
  }
  return { gone: layers.length, fading: 0 };
}

/** How much water a pond holds when full. */
export const pondCapacity = (data: PondMap, id: number): number => pondCells(data, id).length * WATER_PER_CELL;

/** One pond's state: its id, how far it is drained (0 full .. 1 dry), and whether it is filling up again after running dry. */
export type PondState = [id: number, level: number, refilling: boolean];

/**
 * How far each pond of a zone is drained (0 full .. 1 dry). Drinking drains it and only rain fills it again (`rain`). A
 * pond drunk dry is `refilling` until it is full again: it then fills from the middle out (`PondBeds` draws it so), where
 * one only part drunk goes back the way it went. A co-op guest is told the states by the host instead (`setLevels`).
 */
export class PondLevels {
  private drained = new Map<number, { level: number; refilling: boolean }>();

  /** How far this pond is drained. */
  level(id: number): number {
    return this.drained.get(id)?.level ?? 0;
  }

  /** Is this pond filling up again after running dry? */
  refilling(id: number): boolean {
    return this.drained.get(id)?.refilling ?? false;
  }

  /** Drink up to `amount` water from a pond that holds `capacity`: returns what it had to give. */
  drink(id: number, amount: number, capacity: number): number {
    if (capacity <= 0) return 0;
    const level = this.level(id);
    const got = Math.max(0, Math.min(amount, (1 - level) * capacity));
    const now = Math.min(1, level + got / capacity);
    this.drained.set(id, { level: now, refilling: this.refilling(id) || now >= 1 });
    return got;
  }

  /** Rain falls for `dt` seconds, filling every pond by `fill` (of a whole pond) per second (`rainFill`). */
  rain(fill: number, dt: number) {
    if (fill <= 0) return;
    for (const [id, pond] of this.drained) {
      pond.level -= fill * dt;
      if (pond.level <= 0) this.drained.delete(id); // full again
    }
  }

  /** Every pond not full: how far it is drained, and whether it is refilling after running dry. */
  levels(): PondState[] {
    return [...this.drained].map(([id, { level, refilling }]) => [id, level, refilling]);
  }

  /** Set the states: the host's word to a guest, or a zone's memory when it loads again (any pond not listed is full). */
  setLevels(states: readonly (readonly [number, number, boolean?])[]) {
    this.drained = new Map(
      states.filter(([, level]) => level > 0).map(([id, level, refilling]) => [id, { level, refilling: !!refilling }]),
    );
  }
}
