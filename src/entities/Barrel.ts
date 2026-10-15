import { Container, Sprite, type Texture } from 'pixi.js';
import type { Direction } from '../core/direction';
import { BARREL_SIZE, CARRY_LIFT, type BarrelSpot } from '../systems/barrels';

/**
 * A barrel that can be carried (systems/barrels.ts). Origin is its feet, like a Character, so it y-sorts with them;
 * while it is loose it blocks as a body, while someone carries it it rides over their head and blocks nobody.
 */
export class Barrel extends Container {
  /** How many people wide it blocks (collision `Body.size`). */
  readonly size = BARREL_SIZE;
  readonly home: { x: number; y: number };
  /** The map object it was made from (that drawn copy is hidden). */
  readonly object: number;
  /** The player number carrying it (host and solo), or null when it stands on the ground. A guest only draws it. */
  carrier: number | null = null;
  /** The way its carrier faces while it is carried (sets which side of them it is drawn). */
  facing: Direction = 'down';
  private sprite: Sprite;

  constructor(spot: BarrelSpot, texture: Texture) {
    super();
    this.object = spot.object;
    this.home = { x: spot.x, y: spot.y };
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1);
    this.addChild(this.sprite);
    this.position.set(spot.x, spot.y);
    this.zIndex = spot.y;
  }

  get carried(): boolean {
    return this.carrier !== null;
  }

  /** Stand it on the ground at (x, y). */
  setDown(x: number, y: number) {
    this.carrier = null;
    this.position.set(x, y);
    this.sprite.y = 0;
    this.zIndex = y;
  }

  /**
   * Be held out in front of a carrier facing `facing`, with its feet at (x, y) (`heldSpot`): drawn over the carrier,
   * or behind them when they face away from the screen.
   */
  hold(x: number, y: number, facing: Direction) {
    this.facing = facing;
    this.position.set(x, y);
    this.sprite.y = -CARRY_LIFT;
    this.zIndex = facing === 'up' ? y - 24 : y + 1;
  }
}
