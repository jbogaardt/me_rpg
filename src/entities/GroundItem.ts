import { BitmapText, Container, Graphics } from 'pixi.js';
import type { Item } from '../systems/combat';
import { groundFading, groundRemaining, iconKind, itemTier } from '../systems/inventory';
import { itemSprite } from './itemArt';

/** Glow colour by tier (matches the pack's slot borders). */
const TIER_COLORS = [0xb08968, 0xb08968, 0x9fb8a0, 0x6fb3d9, 0xe0c068];

/** An item lying on the ground (dropped from the pack): a small bundle that bobs, with its name shown when close. */
export class GroundItem extends Container {
  private bundle: Container;
  private nameTag: BitmapText;
  private t = Math.random() * Math.PI * 2;
  /** Seconds it has lain here. */
  age = 0;

  /** Origin is the feet, so it y-sorts with characters. */
  constructor(
    readonly item: Item,
    x: number,
    y: number,
    /** Names this item in co-op snapshots (the host numbers them). */
    readonly id = 0,
    age = 0,
  ) {
    super();
    this.age = age;
    const color = TIER_COLORS[itemTier(item)] ?? TIER_COLORS[1]!;
    const art = itemSprite(iconKind(item)); // the pack's picture of it, or the bundle for a kind it has none for
    this.addChild(
      new Graphics().ellipse(0, -1, 8, 3).fill({ color: 0x000000, alpha: 0.3 }),
      new Graphics().circle(0, -8, 9).fill({ color, alpha: 0.28 }),
    );
    if (art) {
      art.scale.set(0.75);
      art.position.set(0, -2);
      this.bundle = art;
    } else {
      this.bundle = new Graphics()
        .roundRect(-5, -12, 10, 9, 3)
        .fill(0x8b6b3e)
        .stroke({ width: 1, color: 0x3b2a14 })
        .rect(-5, -9, 10, 2)
        .fill(color);
    }
    this.addChild(this.bundle);
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

  /** Seconds before it crumbles away. */
  get remaining(): number {
    return groundRemaining(this.age);
  }

  /** Take the host's word for how long it has left (a co-op guest's clock drifts from the host's). */
  setRemaining(seconds: number) {
    this.age = groundRemaining(0) - seconds;
  }

  /** Let time pass (the host and solo only: a co-op guest is told how long is left). */
  tick(dt: number) {
    this.age += dt;
  }

  /** Bob a little (and blink when it is nearly gone); the name shows while a player is `near`. */
  update(dt: number, near: boolean) {
    this.alpha = groundFading(this.remaining) && Math.floor(this.age * 4) % 2 === 0 ? 0.35 : 1;
    this.t += dt * 3;
    this.bundle.y = Math.sin(this.t) * 1.5;
    this.nameTag.visible = near;
  }
}
