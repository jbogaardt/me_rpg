import { Container, Graphics } from 'pixi.js';
import { CELL, type WellSpawn } from '../map/types';

/**
 * A stone well with a little roof, standing in one map cell (solid: its cell blocks). Drawn with a few shapes, like the
 * quest sites, since there is no art for it; the water in it shimmers a little. Origin is its feet, so it y-sorts with
 * the characters. Drinking from it is the action key beside it (scenes/overworld/Drinking.ts); it has no state.
 */
export class Well extends Container {
  readonly col: number;
  readonly row: number;
  private readonly water = new Graphics();
  private t = Math.random() * 6;

  constructor(spawn: WellSpawn) {
    super();
    [this.col, this.row] = [spawn.col, spawn.row];
    this.position.set((spawn.col + 0.5) * CELL, (spawn.row + 1) * CELL - 2);
    this.zIndex = this.y;
    this.addChild(this.draw(), this.water, this.roof());
    this.shimmer();
  }

  /** Let the light play on the water (a couple of shapes redrawn each frame; the well is only updated where someone is looking). */
  update(dt: number) {
    this.t += dt;
    this.shimmer();
  }

  private shimmer() {
    const glint = (Math.sin(this.t * 2.4) + 1) / 2;
    this.water
      .clear()
      .ellipse(0, -15, 11, 5)
      .fill(0x2a6aa6)
      .ellipse(-3 + glint * 4, -16, 4, 1.6)
      .fill({ color: 0xbfe6ff, alpha: 0.35 + glint * 0.4 });
  }

  /** The stone ring and the two posts. */
  private draw(): Graphics {
    const g = new Graphics();
    g.ellipse(0, -2, 15, 6).fill({ color: 0x000000, alpha: 0.2 }); // shadow
    g.rect(-14, -16, 28, 15).fill(0x8f8f96).stroke({ color: 0x4a4a52, width: 1.5 }); // the ring's wall
    for (const [x, y] of [
      [-9, -11],
      [1, -6],
      [8, -12],
      [-4, -3],
    ] as const)
      g.rect(x, y, 6, 3).fill(0x77777e); // a few darker stones
    g.ellipse(0, -16, 14, 6).fill(0xb4b4bb).stroke({ color: 0x4a4a52, width: 1.5 }); // the rim
    g.rect(-13, -40, 3, 26).fill(0x6b4423).rect(10, -40, 3, 26).fill(0x6b4423); // posts
    g.rect(-1, -36, 2, 9).fill(0x8a6a3a).rect(-2, -28, 4, 4).fill(0x5a3a1a); // rope and bucket
    return g;
  }

  /** The little roof on top of the posts (drawn over the water so it hides nothing of the hero walking in front). */
  private roof(): Graphics {
    return new Graphics()
      .poly([-19, -37, 0, -52, 19, -37])
      .fill(0xa23f30)
      .stroke({ color: 0x5a1f18, width: 1.5 })
      .rect(-19, -38, 38, 3)
      .fill(0x7a2c22);
  }
}
