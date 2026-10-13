import { BlurFilter, Graphics } from 'pixi.js';
import { CELL, type MapData } from '../map/types';
import { drainedLayers, pondCells, pondLayers } from '../systems/needs';

const SHALLOW = 0x2f88b4; // the ponds' own blue (0x156c99), a shade lighter: water gone shallow
const SHALLOW_ALPHA = 0.55;
const DRY = 0x9c7d55; // the dried-out bed, close to the ponds' earthy banks: only once the pond is empty
/** How far (cells) the empty bed reaches past each water cell: over the water half of every bank tile, corners too. */
const BED_REACH = 0.6;
const STEPS = 4; // redraws per cell's worth of water drained: a layer fades out in that many steps per cell of it

/**
 * How low every drained pond in a zone is, drawn over its water. A pond is layers of water, rings from the shore in
 * (`pondLayers`): drinking makes the outer layer slowly fade away, then the layer inside it. A layer gone leaves shallow
 * water (a wash of the same blue, a shade lighter, kept off the bank), so the deep water shrinks ring by ring towards the
 * middle; only when the last layer goes does the pond turn to a brown bed, fading in with it, and the bed reaches over
 * the water the bank tiles draw.
 * Flat on the ground, under every object, with a blurred soft edge. Redrawn (and cached as a texture) only when a level
 * changes enough to show.
 */
export class PondBeds extends Graphics {
  private drawn = '';

  constructor(private data: MapData) {
    super();
    this.zIndex = -1e9; // ground level: under every prop and character in the y-sorted layer
    // A soft edge, so the bed melts into the water and the bank; drawn once into a texture each time it changes.
    this.filters = [new BlurFilter({ strength: 3, quality: 2 })];
  }

  /** Show these levels (pond id → 0 full .. 1 dry; ponds not listed are full). */
  show(levels: readonly (readonly [number, number])[]) {
    const steps = levels.map(
      ([id, level]) => [id, Math.round(level * pondCells(this.data, id).length * STEPS)] as const,
    );
    const sig = steps.map(([id, n]) => `${id}:${n}`).join(',');
    if (sig === this.drawn) return;
    this.drawn = sig;
    this.clear();
    for (const [id, n] of steps) this.drawPond(pondLayers(this.data, id), n / STEPS / pondCells(this.data, id).length);
    if (steps.length) this.cacheAsTexture(true);
    else this.cacheAsTexture(false);
    this.updateCacheTexture();
  }

  private drawPond(layers: readonly (readonly number[])[], level: number) {
    const { gone, fading } = drainedLayers(layers, level);
    // The layers gone are shallow water and the one going now fades to it; the last layer going takes it to dry mud.
    this.drawLayers(layers.slice(0, gone), SHALLOW, SHALLOW_ALPHA, 0.8);
    this.drawLayers(layers.slice(gone, gone + 1), SHALLOW, SHALLOW_ALPHA * fading, 0.8);
    const empty = gone >= layers.length ? 1 : gone === layers.length - 1 ? fading : 0;
    this.drawLayers(layers, DRY, empty, BED_REACH, true);
  }

  /**
   * Patches over every cell of these layers. A wash is a round patch, a shore cell's `shore` cells across (it stays off the
   * sandy bank); the empty bed (`square`) is a rounded square reaching `shore` cells past each cell, so it also covers the
   * water the bank tiles draw round the pond's edges and in their corners, where round patches leave gaps.
   */
  private drawLayers(
    layers: readonly (readonly number[])[],
    color: number,
    alpha: number,
    shore: number,
    square = false,
  ) {
    if (alpha <= 0 || !layers.length) return;
    const { width, surface } = this.data;
    for (const layer of layers) {
      for (const i of layer) {
        const x = ((i % width) + 0.5) * CELL;
        const y = (Math.floor(i / width) + 0.5) * CELL;
        if (square) {
          const half = (0.5 + shore) * CELL;
          this.roundRect(x - half, y - half, half * 2, half * 2, shore * CELL);
          continue;
        }
        const edge = [i - 1, i + 1, i - width, i + width].some((j) => surface[j] !== surface[i]);
        this.circle(x, y, (edge ? shore : 0.9) * CELL);
      }
    }
    this.fill({ color, alpha });
  }
}
