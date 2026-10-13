import { BlurFilter, Graphics } from 'pixi.js';
import type { MapView } from '../map/MapView';
import { cellsOutline } from '../map/outline';
import { CELL, type MapData } from '../map/types';
import { drainedLayers, pondCells, pondId, pondLayers, type PondState } from '../systems/needs';

const SHALLOW = 0x2f88b4; // the ponds' own blue (0x156c99), a shade lighter: water gone shallow
const SHALLOW_ALPHA = 0.55;
const BANK = 0xd2a575; // the dry bed's edge: the tan of the ponds' sandy banks, so the ground runs on into it
const DEEP = 0x7a5232; // laid thinly over each deeper ring, so the bed darkens towards the middle
const DEEP_ALPHA = 0.16;
const DEEP_RINGS = 4; // at most this many darker rings
/** How far the empty bed's edge lies from the pond's corners toward the land's (0.5: halfway, where the bank tiles draw it). */
const BED_REACH = 0.7;
const STEPS = 4; // redraws per cell's worth of water drained: a layer fades out in that many steps per cell of it

/**
 * How low every drained pond in a zone is, drawn over its water. A pond is layers of water, rings from the shore in
 * (`pondLayers`): drinking makes the outer layer slowly fade away, then the layer inside it. A layer gone leaves shallow
 * water (a wash of the same blue, a shade lighter, kept off the bank), so the deep water shrinks ring by ring towards the
 * middle; only when the last layer goes does the pond turn to an earthen bed, fading in with it, shaped like the shore
 * and in the banks' tan at its edge, darker towards the middle; what floats on it (lily pads) fades out with the last
 * of the water (`MapView.setObjectAlpha`).
 * Flat on the ground, under every object, with a blurred soft edge. Redrawn (and cached as a texture) only when a level
 * changes enough to show.
 */
export class PondBeds extends Graphics {
  private drawn = '';
  /** The map objects standing in each pond's water (lily pads), by pond id: each object's index and its cell. */
  private props = new Map<number, [index: number, cell: number][]>();
  private faded = new Set<number>(); // ponds whose props are drawn faded now

  constructor(
    private data: MapData,
    private view: MapView,
  ) {
    super();
    for (const [i, o] of data.objects.entries()) {
      const cell = Math.floor((o.py + o.h / 2) / CELL) * data.width + Math.floor((o.px + o.w / 2) / CELL);
      if (data.surfaces[data.surface[cell] ?? -1] !== 'water') continue;
      const id = pondId(data, cell);
      this.props.set(id, [...(this.props.get(id) ?? []), [i, cell]]);
    }
    this.zIndex = -1e9; // ground level: under every prop and character in the y-sorted layer
    // A soft edge, so the bed melts into the water and the bank; drawn once into a texture each time it changes.
    this.filters = [new BlurFilter({ strength: 3, quality: 2 })];
  }

  /** Show these ponds (how far each is drained, 0 full .. 1 dry, and whether it is refilling; ponds not listed are full). */
  show(states: readonly PondState[]) {
    const steps = states.map(
      ([id, level, refilling]) => [id, Math.round(level * pondCells(this.data, id).length * STEPS), refilling] as const,
    );
    const sig = steps.map(([id, n, r]) => `${id}:${n}${r ? 'r' : ''}`).join(',');
    if (sig === this.drawn) return;
    this.drawn = sig;
    this.clear();
    const faded = new Set<number>();
    for (const [id, n, refilling] of steps) {
      const layers = pondLayers(this.data, id);
      const level = n / STEPS / pondCells(this.data, id).length;
      // What floats on the water (lily pads) goes with the last of it, and comes back as the water reaches it.
      const shown = refilling ? this.drawRefill(layers, level) : this.drawPond(layers, level);
      for (const [i, cell] of this.props.get(id) ?? []) this.view.setObjectAlpha(i, shown(cell));
      faded.add(id);
    }
    for (const id of this.faded) {
      if (!faded.has(id)) for (const [i] of this.props.get(id) ?? []) this.view.setObjectAlpha(i, 1);
    }
    this.faded = faded;
    if (steps.length) this.cacheAsTexture(true);
    else this.cacheAsTexture(false);
    this.updateCacheTexture();
  }

  /**
   * Draw one pond drained `level` by drinking: the outer layers go shallow first, and the bed comes only with the last of
   * the water. Returns how visible what floats on a cell should be (0..1).
   */
  private drawPond(layers: readonly (readonly number[])[], level: number): (cell: number) => number {
    const { gone, fading } = drainedLayers(layers, level);
    // The layers gone are shallow water and the one going now fades to it; the last layer going takes it to dry mud.
    this.drawLayers(layers.slice(0, gone), SHALLOW, SHALLOW_ALPHA, 0.8);
    this.drawLayers(layers.slice(gone, gone + 1), SHALLOW, SHALLOW_ALPHA * fading, 0.8);
    const empty = gone >= layers.length ? 1 : gone === layers.length - 1 ? fading : 0;
    if (empty > 0) this.drawBed(layers, layers.length, empty);
    return () => 1 - empty;
  }

  /**
   * Draw a pond filling up again after running dry: the rain gathers in the middle first, so the water comes back ring by
   * ring from the middle out, and the outer rings it has not reached yet are still the bed. Returns how visible what
   * floats on a cell should be (0..1): it comes back as the water reaches its ring.
   */
  private drawRefill(layers: readonly (readonly number[])[], level: number): (cell: number) => number {
    const { gone: filled, fading: rising } = drainedLayers([...layers].reverse(), 1 - level);
    const dry = layers.length - filled; // the outer rings still dry, the last of them filling now
    this.drawBed(layers, dry - 1, 1);
    if (dry > 0) this.drawBed(layers.slice(dry - 1, dry), 1, 1 - rising, true);
    const ring = new Map<number, number>();
    layers.forEach((layer, k) => layer.forEach((cell) => ring.set(cell, k)));
    return (cell) => {
      const k = ring.get(cell) ?? 0;
      return k >= dry ? 1 : k === dry - 1 ? rising : 0;
    };
  }

  /**
   * The empty bed. Its edge is the pond's own outline as the bank tiles draw it (`cellsOutline`: through the bank cells,
   * rounded), so it covers the water at the edges and corners and the ground flows on into it, in the banks' tan; each
   * ring further in is the same smooth shape a size smaller, a shade darker, so the bed deepens towards the middle.
   */
  private drawBed(layers: readonly (readonly number[])[], upto: number, alpha: number, plain = false) {
    const { width } = this.data;
    // The bed over the rings before `upto`: while the pond refills, the water in the middle is a hole in it.
    for (let k = 0; k <= Math.min(plain ? 0 : DEEP_RINGS, upto - 1); k++) {
      const loops = cellsOutline(layers.slice(k, upto).flat(), width, BED_REACH);
      const outer = loops.filter((l) => signedArea(l) > 0);
      const holes = loops.filter((l) => signedArea(l) < 0);
      for (const loop of outer) {
        this.poly(loop.flatMap(([x, y]) => [x * CELL, y * CELL]));
        this.fill(k === 0 ? { color: BANK, alpha } : { color: DEEP, alpha: DEEP_ALPHA * alpha });
        // The water in the middle (or an island, which then shows its own ground) is cut out of this piece of bed.
        for (const hole of holes) {
          if (!inside(loop, hole[0]!)) continue;
          this.poly(hole.flatMap(([x, y]) => [x * CELL, y * CELL]));
          this.cut();
        }
      }
    }
  }

  /** Round patches over every cell of these layers, a shore cell's `shore` cells across (the wash stays off the sandy bank). */
  private drawLayers(layers: readonly (readonly number[])[], color: number, alpha: number, shore: number) {
    if (alpha <= 0 || !layers.length) return;
    const { width, surface } = this.data;
    for (const layer of layers) {
      for (const i of layer) {
        const x = ((i % width) + 0.5) * CELL;
        const y = (Math.floor(i / width) + 0.5) * CELL;
        const edge = [i - 1, i + 1, i - width, i + width].some((j) => surface[j] !== surface[i]);
        this.circle(x, y, (edge ? shore : 0.9) * CELL);
      }
    }
    this.fill({ color, alpha });
  }
}

/** Twice the area inside a loop, positive when it runs clockwise on screen (y down), as `cellsOutline` traces a shape. */
function signedArea(loop: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i]!;
    const [x2, y2] = loop[(i + 1) % loop.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a;
}

/** Is point `p` inside the loop (even-odd)? */
function inside(loop: readonly (readonly [number, number])[], [px, py]: readonly [number, number]): boolean {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i]!;
    const [xj, yj] = loop[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
