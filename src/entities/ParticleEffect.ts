import { Container, Particle, ParticleContainer, Texture } from 'pixi.js';
import { PARTICLE_EFFECTS, type ParticleEffectName } from '../systems/particleEffects';
import { Emitter, type EffectDef, type ParticleVisual, type Shape } from '../systems/particles';
import type { Effect } from './effects';

/** Particle textures are white and generated once on first use (the tint comes from the effect's colours). */
const SHAPES: Record<Shape, { w: number; h: number; draw: (ctx: CanvasRenderingContext2D) => void }> = {
  // A 4x4 pixel with the corners cut.
  dot: {
    w: 4,
    h: 4,
    draw(ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(1, 0, 2, 4);
      ctx.fillRect(0, 1, 4, 2);
    },
  },
  // A soft round glow; use with additive blending.
  glow: {
    w: 16,
    h: 16,
    draw(ctx) {
      const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 16);
    },
  },
  // 4:1, fading in towards the head (+x, the direction of travel when `align` is set).
  streak: {
    w: 8,
    h: 2,
    draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, 8, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 8, 2);
    },
  },
};

const textures = new Map<Shape, Texture>();

function shapeTexture(shape: Shape): Texture {
  let texture = textures.get(shape);
  if (!texture) {
    const { w, h, draw } = SHAPES[shape];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('A 2D canvas is needed to generate particle textures');
    draw(ctx);
    texture = Texture.from(canvas);
    textures.set(shape, texture);
  }
  return texture;
}

interface Layer {
  emitter: Emitter;
  particles: Particle[];
  texture: Texture;
}

export interface ParticleEffectOptions {
  /** Direction in radians the effect points (0 = right, π/2 = down); emitters' `angle` is relative to it. */
  dir?: number;
  /** For `sort: 'world'` effects: added to y when y-sorting (e.g. to sort by the ground under a flying thing). */
  sortOffset?: number;
}

/**
 * Plays an `EffectDef` in the world: one `Emitter` (simulation) plus one `ParticleContainer` (one draw call,
 * a pre-allocated particle per pool slot) per emitter. Add it to `Effects`; it finishes when all its emitters do.
 */
export class ParticleEffect implements Effect {
  readonly view = new Container();
  private layers: Layer[];
  private sortOffset: number;
  private top: boolean;
  private scratch: ParticleVisual = { x: 0, y: 0, rotation: 0, size: 0, alpha: 0, color: 0 };

  constructor(def: EffectDef, x: number, y: number, { dir = 0, sortOffset = 0 }: ParticleEffectOptions = {}) {
    this.top = (def.sort ?? 'top') === 'top';
    this.sortOffset = sortOffset;
    this.layers = def.emitters.map((e) => {
      const emitter = new Emitter(e, x, y, dir);
      const texture = shapeTexture(e.shape);
      const particles = Array.from(
        { length: emitter.capacity },
        () => new Particle({ texture, anchorX: 0.5, anchorY: 0.5, scaleX: 0, scaleY: 0 }),
      );
      const container = new ParticleContainer({
        texture,
        particles,
        blendMode: e.blend === 'add' ? 'add' : 'normal',
        // Everything but texture coordinates changes every frame.
        dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: false },
      });
      container.update(); // uploads the static buffers (UVs) on first render; the pool never changes after this
      this.view.addChild(container);
      return { emitter, particles, texture };
    });
    this.view.zIndex = this.top ? 1e9 : y + sortOffset;
    this.draw();
  }

  /** Move the emission point, e.g. to trail a projectile. Particles already in the air stay where they are. */
  moveTo(x: number, y: number) {
    for (const { emitter } of this.layers) {
      emitter.x = x;
      emitter.y = y;
    }
    if (!this.top) this.view.zIndex = y + this.sortOffset;
  }

  /** Stop continuous emission (a trail); live particles finish their lives and the effect then ends. */
  stop() {
    for (const { emitter } of this.layers) emitter.stop();
  }

  update(dt: number): boolean {
    let alive = false;
    for (const { emitter } of this.layers) {
      emitter.update(dt);
      if (!emitter.done) alive = true;
    }
    this.draw();
    return alive;
  }

  private draw() {
    const v = this.scratch;
    for (const { emitter, particles, texture } of this.layers) {
      const live = emitter.count;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p) continue;
        if (i >= live) {
          p.scaleX = p.scaleY = 0; // dead slot: invisible until reused
          continue;
        }
        emitter.visual(i, v);
        p.x = v.x;
        p.y = v.y;
        p.rotation = v.rotation;
        p.scaleX = p.scaleY = v.size / texture.width;
        p.alpha = v.alpha;
        p.tint = v.color;
      }
    }
  }
}

/** Start a named effect (see `PARTICLE_EFFECTS`) at a world position; pass it to `Effects.add`. */
export function particleEffect(
  name: ParticleEffectName,
  x: number,
  y: number,
  options?: ParticleEffectOptions,
): ParticleEffect {
  return new ParticleEffect(PARTICLE_EFFECTS[name], x, y, options);
}
