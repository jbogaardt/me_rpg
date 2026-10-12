import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { makeFrame } from '../core/textures';
import { petFrame, PetBrain, type PetKind } from '../systems/pets';

/**
 * A pet: a sprite driven by a `PetBrain`, which stands about, lies down and ambles round its home. Its container origin is
 * the feet, like a `Character`, so it y-sorts the same way. Purely local scenery (not synced in co-op, like the NPC: each
 * player sees their own wandering); it does not block anyone.
 */
export class Pet extends Container {
  private sprite: Sprite;
  private brain: PetBrain;
  private time = 0;
  private shown = '';
  private frames = new Map<string, Texture>();
  /** How many times it has been spoken to (picks its next sound). */
  talks = 0;

  constructor(
    readonly kind: PetKind,
    private sheet: Texture,
    home: { x: number; y: number },
    free: (x: number, y: number) => boolean,
    seed: number,
  ) {
    super();
    // Everyone gets a different (but repeatable) wander.
    let state = seed * 2654435761;
    const rng = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
    this.brain = new PetBrain(kind, home, free, rng);
    const shadow = new Graphics().ellipse(0, -1, 9, 3.5).fill({ color: 0x000000, alpha: 0.22 });
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 0.9);
    this.addChild(shadow, this.sprite);
    this.position.set(home.x, home.y);
    this.draw();
  }

  /** Turn toward (x, y) and stay up for a few seconds: it was spoken to. */
  attend(x: number, y: number) {
    this.brain.attend(x, y);
    this.draw();
  }

  update(dt: number) {
    this.time += dt;
    this.brain.update(dt);
    this.position.set(this.brain.x, this.brain.y);
    this.draw();
  }

  private draw() {
    const { pose, dir, step } = this.brain;
    const idle = Math.floor(this.time * 3);
    const frame = pose === 'walk' ? step : this.kind.idleFrames > 1 ? idle % this.kind.idleFrames : 0;
    const key = `${pose}:${dir}:${frame}`;
    if (key === this.shown) return;
    this.shown = key;
    let tex = this.frames.get(key);
    if (!tex) {
      const f = petFrame(this.kind, pose, dir, frame);
      const made = makeFrame(this.sheet, f.x, f.y, f.w, f.h);
      if (!made) throw new Error('Pet sheet is too small for its frame');
      this.frames.set(key, (tex = made));
    }
    this.sprite.texture = tex;
  }
}
