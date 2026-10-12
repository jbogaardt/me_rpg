import { Container, Sprite, type Texture } from 'pixi.js';
import { makeFrame } from '../core/textures';
import { CELL, type PlotSpawn } from '../map/types';
import {
  cropFrame,
  decodePlot,
  isCrop,
  newPlot,
  plotCode,
  plotStage,
  SOIL_FRAME,
  type CropId,
  type PlotState,
} from '../systems/crops';

const frames = new WeakMap<Texture, Map<string, Texture>>();

/** A frame of the crops sheet as a texture, made once per sheet. */
function frame(sheet: Texture, f: { x: number; y: number; w: number; h: number }): Texture {
  let byRect = frames.get(sheet);
  if (!byRect) frames.set(sheet, (byRect = new Map<string, Texture>()));
  const key = `${f.x},${f.y}`;
  let texture = byRect.get(key);
  if (!texture) {
    texture = makeFrame(sheet, f.x, f.y, f.w, f.h) ?? undefined;
    if (!texture) throw new Error('The crops sheet is missing a frame');
    byRect.set(key, texture);
  }
  return texture;
}

/**
 * A plot of soil in one map cell, with whatever grows in it: bare earth, a sprout, a half-grown plant or a ripe one.
 * It does not block, and its origin is its feet (so it y-sorts with the characters). The host (and a solo game) keeps the
 * real `state` and calls `tend(clock)` each frame; a guest only shows what a snapshot says (`show`).
 */
export class Plot extends Container {
  readonly col: number;
  readonly row: number;
  readonly state: PlotState;
  /** What is drawn now. */
  crop: CropId | null = null;
  stage = -1;
  private readonly sprite = new Sprite();
  private drawn = '';

  constructor(
    spawn: PlotSpawn,
    private readonly sheet: Texture,
    clock: number,
  ) {
    super();
    const crop = spawn.crop && isCrop(spawn.crop) ? spawn.crop : null;
    this.state = newPlot(crop, clock);
    [this.col, this.row] = [spawn.col, spawn.row];
    this.sprite.anchor.set(0.5, 1);
    this.sprite.position.set(0, -2); // the soil sits a little above the cell's bottom edge
    this.addChild(this.sprite);
    this.position.set((spawn.col + 0.5) * CELL, (spawn.row + 1) * CELL);
    this.zIndex = this.y;
    this.draw();
  }

  /** The number a snapshot carries for it (bare soil is 0). */
  code(clock: number): number {
    return plotCode(this.state, clock);
  }

  /** Host and solo: show what the state says at this time. */
  tend(clock: number) {
    this.crop = this.state.crop;
    this.stage = plotStage(this.state, clock);
    this.draw();
  }

  /** A guest: show what the host sent. */
  show(code: number) {
    const plant = decodePlot(code);
    this.crop = plant?.crop ?? null;
    this.stage = plant?.stage ?? -1;
    this.draw();
  }

  private draw() {
    const key = `${this.crop}:${this.stage}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.sprite.texture = frame(this.sheet, this.crop ? cropFrame(this.crop, this.stage) : SOIL_FRAME);
  }
}
