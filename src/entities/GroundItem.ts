import { BitmapText, Container, Graphics } from 'pixi.js';
import type { Item } from '../systems/combat';
import { itemTier } from '../systems/inventory';

/** Glow colour by tier (matches the pack's slot borders). */
const TIER_COLORS = [0xb08968, 0xb08968, 0x9fb8a0, 0x6fb3d9, 0xe0c068];

/** An item lying on the ground (dropped from the pack): a small bundle that bobs, with its name shown when close. */
export class GroundItem extends Container {
  private bundle = new Graphics();
  private nameTag: BitmapText;
  private t = Math.random() * Math.PI * 2;

  /** Origin is the feet, so it y-sorts with characters. */
  constructor(
    readonly item: Item,
    x: number,
    y: number,
  ) {
    super();
    const color = TIER_COLORS[itemTier(item)] ?? TIER_COLORS[1]!;
    this.addChild(
      new Graphics().ellipse(0, -1, 8, 3).fill({ color: 0x000000, alpha: 0.3 }),
      new Graphics().circle(0, -8, 9).fill({ color, alpha: 0.28 }),
      this.bundle
        .roundRect(-5, -12, 10, 9, 3)
        .fill(0x8b6b3e)
        .stroke({ width: 1, color: 0x3b2a14 })
        .rect(-5, -9, 10, 2)
        .fill(color),
    );
    this.nameTag = new BitmapText({
      text: item.name,
      anchor: { x: 0.5, y: 1 },
      tint: 0xffffff,
      style: { fontFamily: 'FloatText', fontSize: 8 },
    });
    this.nameTag.position.set(0, -20);
    this.nameTag.visible = false;
    this.addChild(this.nameTag);
    this.position.set(x, y);
    this.zIndex = y;
  }

  /** Bob a little; the name shows while a player is `near`. */
  update(dt: number, near: boolean) {
    this.t += dt * 3;
    this.bundle.y = Math.sin(this.t) * 1.5;
    this.nameTag.visible = near;
  }
}
