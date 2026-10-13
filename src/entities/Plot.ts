import { BitmapText, Container, Sprite, type Texture } from 'pixi.js';
import { makeFrame } from '../core/textures';
import { CELL, type PlotSpawn } from '../map/types';
import {
  advance,
  cropFrame,
  decodePlot,
  isCrop,
  isWet,
  newPlot,
  plotCode,
  plotStage,
  RIPE,
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
  /** Does the plant have water (a dry, unripe plant is not growing, and says so)? */
  wet = false;
  private readonly sprite = new Sprite();
  private readonly thirst = new BitmapText({
    text: 'Needs water',
    anchor: 0.5,
    style: { fontFamily: 'FloatText', fontSize: 8 },
  });
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
    this.thirst.tint = 0x8fd0ff;
    this.thirst.visible = false;
    this.addChild(this.sprite, this.thirst);
    this.position.set((spawn.col + 0.5) * CELL, (spawn.row + 1) * CELL);
    this.zIndex = this.y;
    this.draw();
  }

  /** The number a snapshot carries for it (bare soil is 0). */
  code(clock: number): number {
    return plotCode(this.state, clock);
  }

  /** Host and solo: catch the plant up to this time (it grows only while wet) and show what the state says. */
  tend(clock: number) {
    advance(this.state, clock);
    this.crop = this.state.crop;
    this.stage = plotStage(this.state);
    this.wet = isWet(this.state, clock);
    this.draw();
  }

  /** A guest: show what the host sent. */
  show(code: number) {
    const plant = decodePlot(code);
    this.crop = plant?.crop ?? null;
    this.stage = plant?.stage ?? -1;
    this.wet = plant?.wet ?? false;
    this.draw();
  }

  private draw() {
    const key = `${this.crop}:${this.stage}:${this.wet}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.sprite.texture = frame(this.sheet, this.crop ? cropFrame(this.crop, this.stage) : SOIL_FRAME);
    // "Needs water" floats over a growing plant that is dry, just above the plant (the young ones are short).
    this.thirst.visible = this.crop !== null && this.stage < RIPE && !this.wet;
    this.thirst.position.set(0, -30 - Math.max(0, this.stage) * 10);
  }
}
