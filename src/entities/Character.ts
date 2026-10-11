import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { sheetGrid } from '../core/textures';

export type Direction = 'down' | 'up' | 'left' | 'right';

/** Unit vector for each facing. */
export const DIR_VEC: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** The facing that best points along (dx, dy). */
export function directionToward(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// Character sheet layout (e.g. public/sprites/healer_f.png): 3 columns x 4 rows of 32x36 frames.
// Columns are walk-A, standing, walk-B. Rows are back, right, front, left.
const FRAME_W = 32;
const FRAME_H = 36;
const ROW: Record<Direction, number> = { up: 0, left: 3, down: 2, right: 1 };
const WALK_CYCLE = [0, 1, 2, 1]; // columns
const STAND = 1;
const WALK_FRAME_MS = 140;

/**
 * An animated character (the hero, NPCs). The container's position is the point between the feet, so it can be
 * used directly for collision and depth sorting.
 */
export class Character extends Container {
  private frames: Texture[][]; // [direction row][column]
  private sprite: Sprite;
  private aura = new Graphics();
  private direction: Direction = 'down';
  private walkTime = 0;
  private auraTime = 0;

  /** `aura` adds the hero's pulsing time-ring; NPCs just get a plain shadow. */
  constructor(
    sheet: Texture,
    private withAura = false,
  ) {
    super();
    this.frames = sheetGrid(sheet, 3, 4, FRAME_W, FRAME_H);
    this.sprite = new Sprite(this.frame('down', STAND));
    this.sprite.anchor.set(0.5, 1);
    this.sprite.y = 2; // the art leaves ~2px under the feet in each frame
    this.addChild(this.aura, this.sprite);
    this.drawAura(0);
  }

  /** Swap the look (another sheet of the same layout). */
  setSheet(sheet: Texture) {
    this.frames = sheetGrid(sheet, 3, 4, FRAME_W, FRAME_H);
    this.sprite.texture = this.frame(this.direction, STAND);
  }

  face(direction: Direction) {
    this.direction = direction;
  }

  get facing(): Direction {
    return this.direction;
  }

  /** Colour the body (not the shadow), e.g. to flash on a hit. 0xffffff is untinted. */
  setTint(color: number) {
    this.sprite.tint = color;
  }

  /** Nudge the body off its feet point, e.g. to lunge into an attack. */
  setOffset(dx: number, dy: number) {
    this.sprite.position.set(dx, 2 + dy);
  }

  /** Advance animation; `moving` selects the walk cycle over the standing pose. */
  animate(dtMs: number, moving: boolean) {
    this.auraTime += dtMs;
    if (this.withAura) this.drawAura(this.auraTime);

    let col = STAND;
    if (moving) {
      this.walkTime += dtMs;
      col = WALK_CYCLE[Math.floor(this.walkTime / WALK_FRAME_MS) % WALK_CYCLE.length] ?? STAND;
    } else {
      this.walkTime = 0;
    }
    this.sprite.texture = this.frame(this.direction, col);
  }

  private frame(direction: Direction, col: number): Texture {
    const texture = this.frames[ROW[direction]]?.[col];
    if (!texture) throw new Error(`Missing character frame ${direction}/${col}`);
    return texture;
  }

  /** Shadow, plus (for the hero) a pulsing ring of time-energy underfoot. */
  private drawAura(timeMs: number) {
    const pulse = (Math.sin(timeMs / 400) + 1) / 2;
    this.aura.clear().ellipse(0, 0, 10, 4).fill({ color: 0x000000, alpha: 0.35 });
    if (!this.withAura) return;
    this.aura
      .ellipse(0, 0, 13 + pulse * 3, 5 + pulse * 1.5)
      .stroke({ color: 0x4de3ff, alpha: 0.15 + pulse * 0.35, width: 1 });
  }
}
