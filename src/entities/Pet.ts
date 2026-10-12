import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { directionToward, type Direction } from '../core/direction';
import { makeFrame } from '../core/textures';
import { petFrame, petPose, type PetKind, type PetPose } from '../systems/pets';

/** How long a pet stays up after being spoken to, in seconds. */
const AWAKE = 4;

/**
 * A town pet: one still sprite that stands, and lies down for a while now and then. Its container origin is the feet, like
 * a `Character`, so it y-sorts the same way. Purely local scenery (not synced in co-op, like the NPC); it does not block.
 */
export class Pet extends Container {
  private sprite: Sprite;
  private direction: Direction;
  private time: number;
  private awake = 0;
  private shown = '';
  private frames = new Map<string, Texture>();
  /** How many times it has been spoken to (picks its next sound). */
  talks = 0;

  constructor(
    readonly kind: PetKind,
    private sheet: Texture,
    private seed: number,
  ) {
    super();
    this.direction = seed % 2 ? 'left' : 'right';
    this.time = seed * 2.3;
    const shadow = new Graphics().ellipse(0, -1, 9, 3.5).fill({ color: 0x000000, alpha: 0.22 });
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 0.9);
    this.addChild(shadow, this.sprite);
    this.draw('stand');
  }

  /** Turn toward (x, y) and stay up for a few seconds: it was spoken to. */
  attend(x: number, y: number) {
    const d = directionToward(x - this.x, y - this.y);
    this.direction = d === 'up' ? 'right' : d; // there is no back view worth showing for a friendly turn
    this.awake = AWAKE;
    this.draw('stand');
  }

  update(dt: number) {
    this.time += dt;
    this.awake = Math.max(0, this.awake - dt);
    this.draw(this.awake > 0 ? 'stand' : petPose(this.time, this.seed));
  }

  private draw(pose: PetPose) {
    const key = `${pose}:${this.direction}`;
    if (key === this.shown) return;
    this.shown = key;
    let tex = this.frames.get(key);
    if (!tex) {
      const f = petFrame(this.kind, pose, this.direction);
      const made = makeFrame(this.sheet, f.x, f.y, f.w, f.h);
      if (!made) throw new Error('Pet sheet is too small for its frame');
      this.frames.set(key, (tex = made));
    }
    this.sprite.texture = tex;
  }
}
