import { BitmapText, Container, Sprite, type Texture } from 'pixi.js';
import { CELL, type CropSpawn } from '../map/types';
import {
  CROP_KINDS,
  CROP_PHASES,
  CROP_STAGES,
  CROPS,
  cropCode,
  cropFromCode,
  cropStage,
  phaseTime,
  type CropName,
  type CropState,
} from '../systems/crops';

/** What a zone remembers of a plot while it is unloaded. */
export interface CropMemory extends CropState {
  progress: number;
  watered: boolean;
}

/**
 * One crop plot standing in a map cell. Origin is its feet, like a Chest, so it y-sorts with the characters.
 * It grows in phases (systems/crops.ts): watered, it grows for one phase, then dries out and waits for the next watering.
 */
export class Crop extends Container {
  readonly col: number;
  readonly row: number;
  readonly kind: CropName;
  private readonly phaseLength: number;
  private sprite: Sprite;
  private frames: Texture[];
  private hint: BitmapText;
  private bob = 0;
  private done: boolean;
  /** 0..CROP_PHASES-1 while growing: the stage drawn, and how many waterings it has had. */
  private phase = 0;
  /** Seconds grown in this phase. */
  private progress = 0;
  /** Is it watered for the current phase? Only a watered plot grows. */
  private wet: boolean;

  /** `grid` is `sheetGrid(sheet, CROP_STAGES, CROP_KINDS.length, 32, 64)`: a row per crop (CROP_KINDS), a column per stage. */
  constructor(spawn: CropSpawn, grid: Texture[][]) {
    super();
    const kind = CROP_KINDS.find((k) => k === spawn.kind);
    if (!kind) throw new Error(`Unknown crop "${spawn.kind}"`);
    this.kind = kind;
    this.phaseLength = phaseTime(CROPS[kind].grow);
    const frames = grid[CROP_KINDS.indexOf(kind)];
    if (!frames || frames.length < CROP_STAGES) throw new Error('Crop sheet is missing frames');
    this.frames = frames;
    this.sprite = new Sprite(frames[0]);
    this.sprite.anchor.set(0.5, 1);
    this.addChild(this.sprite);
    [this.col, this.row] = [spawn.col, spawn.row];
    this.position.set((spawn.col + 0.5) * CELL, (spawn.row + 1) * CELL);
    this.zIndex = this.y;
    this.done = true; // a world starts with its crops ripe
    this.wet = false;
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
    return this.done;
  }

  /** Dry and not yet ripe: it is waiting for water. */
  get thirsty() {
    return !this.done && !this.wet;
  }

  private get state(): CropState {
    return { ripe: this.done, phase: this.phase, dry: this.thirsty };
  }

  /** What a guest is sent (systems/crops.ts `cropCode`). */
  code() {
    return cropCode(this.state);
  }

  /**
   * Time passes. Only a watered plot grows; at the end of a phase it dries out (or, after the last, ripens). A guest
   * passes `mayRipen = false`: the host decides when a phase ends (see `setCode`).
   */
  grow(dt: number, mayRipen = true) {
    this.bob += dt;
    if (this.thirsty) this.hint.y = -CELL * 2 - 4 + Math.sin(this.bob * 4) * 1.5;
    if (this.done || !this.wet) return;
    this.progress += dt;
    if (this.progress < this.phaseLength) return;
    if (!mayRipen) {
      this.progress = this.phaseLength - 0.01;
      return;
    }
    this.progress = 0;
    this.wet = false;
    if (++this.phase >= CROP_PHASES) {
      this.done = true;
      this.phase = 0;
    }
    this.refresh();
  }

  /** Put back what a zone remembered while it was unloaded. */
  restore(m: CropMemory) {
    [this.done, this.phase, this.progress, this.wet] = [m.ripe, m.phase, m.progress, m.watered];
    this.refresh();
  }

  remember(): CropMemory {
    return { ...this.state, progress: this.progress, watered: this.wet };
  }

  /** Picked: back to a dry sprout. */
  pick() {
    [this.done, this.phase, this.progress, this.wet] = [false, 0, 0, false];
    this.refresh();
  }

  /** Watered: it grows for one more phase. */
  water() {
    this.wet = true;
    this.refresh();
  }

  /** A guest is told the plot's state: it keeps its own guess at how far along a watered phase is. */
  setCode(code: number) {
    const s = cropFromCode(code);
    if (!s) return;
    if (s.phase !== this.phase || s.ripe !== this.done) this.progress = 0;
    [this.done, this.phase, this.wet] = [s.ripe, s.phase, !s.dry];
    this.refresh();
  }

  private refresh() {
    const frame = this.frames[cropStage(this.state)];
    if (frame) this.sprite.texture = frame;
    this.hint.visible = this.thirsty;
  }
}
