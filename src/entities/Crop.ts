import { Container, Sprite, type Texture } from 'pixi.js';
import { CELL, type CropSpawn } from '../map/types';
import { CROP_KINDS, CROP_STAGES, CROPS, cropStage, type CropName } from '../systems/crops';

/** One crop plot standing in a map cell. Origin is its feet, like a Chest, so it y-sorts with the characters. */
export class Crop extends Container {
  readonly col: number;
  readonly row: number;
  readonly kind: CropName;
  readonly growTime: number;
  private sprite: Sprite;
  private frames: Texture[];
  /** Seconds since it was last picked (or since it was planted); ripe once this reaches `growTime`. */
  age: number;

  /** `grid` is `sheetGrid(sheet, CROP_STAGES, CROP_KINDS.length, 32, 64)`: a row per crop (CROP_KINDS), a column per stage. */
  constructor(spawn: CropSpawn, grid: Texture[][], age?: number) {
    super();
    const kind = CROP_KINDS.find((k) => k === spawn.kind);
    if (!kind) throw new Error(`Unknown crop "${spawn.kind}"`);
    this.kind = kind;
    this.growTime = CROPS[kind].grow;
    const frames = grid[CROP_KINDS.indexOf(kind)];
    if (!frames || frames.length < CROP_STAGES) throw new Error('Crop sheet is missing frames');
    this.frames = frames;
    this.sprite = new Sprite(frames[0]);
    this.sprite.anchor.set(0.5, 1);
    this.addChild(this.sprite);
    [this.col, this.row] = [spawn.col, spawn.row];
    this.position.set((spawn.col + 0.5) * CELL, (spawn.row + 1) * CELL);
    this.zIndex = this.y;
    this.age = age ?? this.growTime; // a world starts with its crops ripe
    this.refresh();
  }

  get ripe() {
    return this.age >= this.growTime;
  }

  /** Time passes. A guest passes `mayRipen = false`: the host decides when a plot is ripe (see `setRipe`). */
  grow(dt: number, mayRipen = true) {
    if (this.ripe) return;
    this.age = mayRipen ? this.age + dt : Math.min(this.age + dt, this.growTime - 0.01);
    this.refresh();
  }

  /** Picked: back to a sprout. */
  pick() {
    this.age = 0;
    this.refresh();
  }

  /** A guest is told whether the plot is ripe: it keeps its own guess at how far along an unripe one is. */
  setRipe(ripe: boolean) {
    if (ripe) this.age = this.growTime;
    else if (this.ripe) this.age = 0;
    this.refresh();
  }

  private refresh() {
    const frame = this.frames[cropStage(this.age, this.growTime)];
    if (frame) this.sprite.texture = frame;
  }
}
