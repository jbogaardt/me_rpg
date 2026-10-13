import { BitmapText, Container, Sprite, type Texture } from 'pixi.js';
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
  private hint: BitmapText;
  /** Seconds since it was last picked (or since it was planted); ripe once this reaches `growTime`. */
  age: number;
  /** Has it been watered since it was last picked? Only a watered plot grows. */
  watered: boolean;
  private bob = 0;

  /** `grid` is `sheetGrid(sheet, CROP_STAGES, CROP_KINDS.length, 32, 64)`: a row per crop (CROP_KINDS), a column per stage. */
  constructor(spawn: CropSpawn, grid: Texture[][], age?: number, watered = true) {
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
    this.watered = watered;
    // Uses the 'FloatText' bitmap font installed in main.ts, like the damage numbers.
    this.hint = new BitmapText({
      text: 'Needs water',
      anchor: 0.5,
      tint: 0x8fc8ff,
      style: { fontFamily: 'FloatText', fontSize: 10 },
    });
    this.hint.position.set(0, -CELL * 2 - 4);
    this.hint.visible = false;
    this.addChild(this.hint);
    this.refresh();
  }

  get ripe() {
    return this.age >= this.growTime;
  }

  /** Dry and not yet ripe: it is waiting for water. */
  get thirsty() {
    return !this.ripe && !this.watered;
  }

  /** Time passes. Only a watered plot grows. A guest passes `mayRipen = false`: the host decides when a plot is ripe (see `setState`). */
  grow(dt: number, mayRipen = true) {
    this.bob += dt;
    if (this.thirsty) this.hint.y = -CELL * 2 - 4 + Math.sin(this.bob * 4) * 1.5;
    if (this.ripe || !this.watered) return;
    this.age = mayRipen ? this.age + dt : Math.min(this.age + dt, this.growTime - 0.01);
    this.refresh();
  }

  /** Put back what a zone remembered while it was unloaded. */
  restore(age: number, watered: boolean) {
    this.age = age;
    this.watered = watered;
    this.refresh();
  }

  /** Picked: back to a dry sprout. */
  pick() {
    this.age = 0;
    this.watered = false;
    this.refresh();
  }

  /** Watered: it starts to grow. */
  water() {
    this.watered = true;
    this.refresh();
  }

  /** A guest is told whether the plot is ripe and whether it is dry: it keeps its own guess at how far along a growing one is. */
  setState(ripe: boolean, dry: boolean) {
    if (ripe) this.age = this.growTime;
    else if (this.ripe) this.age = 0;
    this.watered = !dry;
    this.refresh();
  }

  private refresh() {
    const frame = this.frames[cropStage(this.age, this.growTime)];
    if (frame) this.sprite.texture = frame;
    this.hint.visible = this.thirsty;
  }
}
