import { Container, Sprite, type Texture } from 'pixi.js';
import { CELL, type ChestSpawn } from '../map/types';
import { CHEST_KINDS, type ChestKind } from '../systems/chests';

/** A treasure chest standing in one map cell. Origin is its feet, like a Character, so it y-sorts with them. */
export class Chest extends Container {
  readonly col: number;
  readonly row: number;
  readonly loot: string;
  private sprite: Sprite;
  private frames: { open: Texture; closed: Texture };
  opened = false;

  /** `sheet` rows follow CHEST_KINDS; each row is the open frame, then the closed one (`sheetGrid(sheet, 2, 4, 32, 32)`). */
  constructor(spawn: ChestSpawn, grid: Texture[][]) {
    super();
    const row = grid[Math.max(0, CHEST_KINDS.indexOf(spawn.kind as ChestKind))];
    const [open, closed] = row ?? [];
    if (!open || !closed) throw new Error('Chest sheet is missing frames');
    this.frames = { open, closed };
    this.sprite = new Sprite(closed);
    this.sprite.anchor.set(0.5, 1);
    this.addChild(this.sprite);
    [this.col, this.row, this.loot] = [spawn.col, spawn.row, spawn.loot];
    this.position.set((spawn.col + 0.5) * CELL, (spawn.row + 1) * CELL);
    this.zIndex = this.y;
  }

  setOpen(opened: boolean) {
    this.opened = opened;
    this.sprite.texture = opened ? this.frames.open : this.frames.closed;
  }
}
