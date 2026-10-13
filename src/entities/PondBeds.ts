import { BlurFilter, Graphics } from 'pixi.js';
import { CELL, type MapData } from '../map/types';
import { drainedLayers, pondCells, pondLayers } from '../systems/needs';

const SHALLOW = 0x2f88b4; // the ponds' own blue (0x156c99), a shade lighter: water gone shallow
const SHALLOW_ALPHA = 0.55;
const DRY = 0x9c7d55; // the dried-out bed, close to the ponds' earthy banks: only once the pond is empty
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
    this.drawLayers(layers, DRY, empty, 1.1);
  }

  /** `shore`: the radius (in cells) of a shore cell's patch: the wash stays off the sandy bank, the dry bed covers it all. */
  private drawLayers(layers: readonly (readonly number[])[], color: number, alpha: number, shore: number) {
    if (alpha <= 0 || !layers.length) return;
    const { width, surface } = this.data;
    for (const layer of layers) {
      for (const i of layer) {
        const edge = [i - 1, i + 1, i - width, i + width].some((j) => surface[j] !== surface[i]);
        this.circle(((i % width) + 0.5) * CELL, (Math.floor(i / width) + 0.5) * CELL, (edge ? shore : 0.9) * CELL);
      }
    }
    this.fill({ color, alpha });
  }
}
