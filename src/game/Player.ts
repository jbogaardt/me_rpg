import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { FRAME_H, FRAME_W, PALETTE, composeFrame, type Facing, type Pose } from './playerArt';

export type Direction = 'down' | 'up' | 'left' | 'right';

const PIXEL_SCALE = 2;
const WALK_FRAME_MS = 140;
const WALK_CYCLE: Pose[] = ['stepA', 'idle', 'stepB', 'idle'];

function toTexture(rows: string[]): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = PALETTE[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

const FACINGS: Facing[] = ['down', 'up', 'side'];
const POSES: Pose[] = ['idle', 'stepA', 'stepB'];

function buildTextures(): Record<Facing, Record<Pose, Texture>> {
  const out = {} as Record<Facing, Record<Pose, Texture>>;
  for (const f of FACINGS) {
    out[f] = {} as Record<Pose, Texture>;
    for (const p of POSES) out[f][p] = toTexture(composeFrame(f, p));
  }
  return out;
}

/**
 * The hero. The container's position is the point between the feet, so it can be
 * used directly for collision and depth sorting.
 */
export class Player extends Container {
  private textures = buildTextures();
  private sprite = new Sprite(this.textures.down.idle);
  private aura = new Graphics();
  private direction: Direction = 'down';
  private walkTime = 0;
  private auraTime = 0;

  constructor() {
    super();
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(PIXEL_SCALE);
    this.sprite.y = 2; // let the boots overlap the shadow slightly
    this.addChild(this.aura, this.sprite);
    this.drawAura(0);
  }

  face(direction: Direction) {
    this.direction = direction;
  }

  /** Advance animation; `moving` selects the walk cycle over the idle pose. */
  animate(dtMs: number, moving: boolean) {
    this.auraTime += dtMs;
    this.drawAura(this.auraTime);

    let pose: Pose = 'idle';
    let bob = 0;
    if (moving) {
      this.walkTime += dtMs;
      const step = Math.floor(this.walkTime / WALK_FRAME_MS) % WALK_CYCLE.length;
      pose = WALK_CYCLE[step];
      bob = pose === 'idle' ? 0 : 1;
    } else {
      this.walkTime = 0;
    }

    const facing: Facing = this.direction === 'left' || this.direction === 'right' ? 'side' : this.direction;
    this.sprite.texture = this.textures[facing][pose];
    this.sprite.scale.x = this.direction === 'left' ? -PIXEL_SCALE : PIXEL_SCALE;
    this.sprite.y = 2 + bob;
  }

  /** Shadow plus a pulsing ring of time-energy from the pendant. */
  private drawAura(timeMs: number) {
    const pulse = (Math.sin(timeMs / 400) + 1) / 2;
    this.aura
      .clear()
      .ellipse(0, 0, 11, 4)
      .fill({ color: 0x000000, alpha: 0.35 })
      .ellipse(0, 0, 14 + pulse * 3, 5 + pulse * 1.5)
      .stroke({ color: 0x4de3ff, alpha: 0.15 + pulse * 0.35, width: 1 });
  }
}
