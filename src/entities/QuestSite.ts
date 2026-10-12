import { Container, Graphics } from 'pixi.js';
import { CELL, type SiteSpawn } from '../map/types';
import { SITE_KINDS, type SiteKind } from '../systems/quests';

/**
 * A place a gather quest sends the player to: a glowing mushroom, an echo stone or a mound of hourglass sand, drawn with
 * a few shapes (it has no art of its own). Origin is its feet, so it y-sorts with the characters. It is only shown to a
 * player whose current quest wants it (`setOpen`), and that is decided locally from their own quest log.
 */
export class QuestSite extends Container {
  readonly kind: string;
  /** Which site of its kind it is in its zone (placement order): the bit it sets in a quest's progress. */
  readonly index: number;
  private readonly look: SiteKind;
  private readonly glow = new Graphics();
  private t = Math.random() * 6;

  constructor(spawn: SiteSpawn, index: number) {
    super();
    const look = SITE_KINDS[spawn.kind];
    if (!look) throw new Error(`Unknown quest site kind "${spawn.kind}"`);
    [this.kind, this.index, this.look] = [spawn.kind, index, look];
    this.position.set((spawn.col + 0.5) * CELL, (spawn.row + 1) * CELL - 4);
    this.zIndex = this.y;
    this.addChild(this.glow, this.draw(look));
    this.visible = false;
  }

  setOpen(open: boolean) {
    this.visible = open;
  }

  /** Pulse the glow (a few circles redrawn each frame, only while shown). */
  update(dt: number) {
    if (!this.visible) return;
    this.t += dt;
    const pulse = (Math.sin(this.t * 3) + 1) / 2;
    this.glow
      .clear()
      .circle(0, -8, 15 + pulse * 4)
      .fill({ color: this.look.glow, alpha: 0.12 + pulse * 0.12 })
      .circle(0, -8, 8 + pulse * 2)
      .fill({ color: this.look.glow, alpha: 0.18 + pulse * 0.14 });
  }

  private draw({ shape, color }: SiteKind): Graphics {
    const g = new Graphics();
    if (shape === 'mushroom') {
      g.rect(-2, -8, 4, 8).fill(0xe8e0d0).ellipse(0, -9, 8, 6).fill(color).circle(-3, -10, 1.5).fill(0xffffff);
    } else if (shape === 'stone') {
      g.poly([-8, 0, -6, -22, 0, -26, 6, -22, 8, 0])
        .fill(color)
        .poly([-3, -6, 0, -18, 3, -6])
        .stroke({ color: this.look.glow, width: 1.5, alpha: 0.9 });
    } else {
      g.ellipse(0, -3, 11, 6).fill(0xd9b45a).ellipse(0, -6, 7, 4).fill(color).circle(-3, -8, 1.2).fill(0xffffff);
    }
    return g;
  }
}
