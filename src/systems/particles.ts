/**
 * Particle simulation. Pixi-free: an `Emitter` owns a fixed-size pool of particles (struct-of-arrays, no
 * per-particle allocation) and advances them; `entities/ParticleEffect.ts` draws one. Effects are data
 * (`EmitterDef`s, see `particleEffects.ts`), so new visuals need no new engine code.
 */

/** A number, or [min, max] picked uniformly per particle. */
export type Range = number | readonly [number, number];
/** A value over a particle's life: a constant, or evenly spaced keyframes (t = 0 → 1) interpolated linearly. */
export type Curve = number | readonly number[];
/** Like `Curve`, for 0xRRGGBB colours (interpolated per channel). */
export type ColorRamp = number | readonly number[];
/** The texture each particle is drawn with (generated in `ParticleEffect.ts`): a pixel dot, a soft glow, a streak. */
export type Shape = 'dot' | 'glow' | 'streak';
export type Rng = () => number;

export interface EmitterDef {
  shape: Shape;
  /** 'add' brightens what is behind (sparks, magic, glows); 'normal' is plain alpha (smoke, dust). Default 'normal'. */
  blend?: 'normal' | 'add';

  /** Particles spawned at once when the emitter is created. */
  burst?: Range;
  /** Particles per second spawned continuously, for `duration` seconds (forever until `stop()` if omitted). */
  rate?: number;
  duration?: number;

  /** Seconds a particle lives. */
  life: Range;
  /** Initial speed in px/s. Default 0. */
  speed?: Range;
  /** Launch angle in radians, added to the emitter's `dir`. 0 = right, π/2 = down. Default: a full circle. */
  angle?: Range;
  /** Spawn distance from the origin, in a random direction (px). Default 0. */
  radius?: Range;
  /** Initial size in px (the sprite's width; `streak`s are 4x longer than thick). */
  size: Range;
  /** Multiplies `size` over the particle's life. Default 1. */
  sizeOverLife?: Curve;
  /** Opacity over the particle's life. Default 1. */
  alphaOverLife?: Curve;
  /** Tint over the particle's life. Default white. */
  colorOverLife?: ColorRamp;
  /** Added to vy each second (px/s²; positive falls, negative rises). Default 0. */
  gravity?: number;
  /** Velocity decay per second (0 = none; 5 = loses ~99% in a second). Default 0. */
  drag?: number;
  /** Rotation speed in rad/s. Default 0. */
  spin?: Range;
  /** Rotate to face the direction of travel (for streaks). Default false. */
  align?: boolean;
  /** Pool size override. Default: enough for the burst plus the rate's steady state, capped at MAX_CAPACITY. */
  max?: number;
}

/** A visual effect: one or more emitters started together. */
export interface EffectDef {
  emitters: readonly EmitterDef[];
  /** 'top' draws over everything (default); 'world' y-sorts with characters by the spawn point. */
  sort?: 'top' | 'world';
}

export const TAU = Math.PI * 2;
export const MAX_CAPACITY = 512;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const rangeMax = (r: Range) => (typeof r === 'number' ? r : Math.max(r[0], r[1]));

/** A small seedable generator (mulberry32), for reproducible tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(range: Range, rng: Rng): number {
  return typeof range === 'number' ? range : range[0] + (range[1] - range[0]) * rng();
}

export function sampleCurve(curve: Curve, t: number): number {
  if (typeof curve === 'number') return curve;
  const last = curve.length - 1;
  if (last < 0) return 1;
  if (last === 0) return curve[0] ?? 1;
  const f = clamp01(t) * last;
  const i = Math.min(Math.floor(f), last - 1);
  const a = curve[i] ?? 0;
  const b = curve[i + 1] ?? a;
  return a + (b - a) * (f - i);
}

export function sampleColor(ramp: ColorRamp, t: number): number {
  if (typeof ramp === 'number') return ramp;
  const last = ramp.length - 1;
  if (last < 0) return 0xffffff;
  const f = clamp01(t) * last;
  const i = Math.min(Math.floor(f), Math.max(0, last - 1));
  const a = ramp[i] ?? 0xffffff;
  const b = ramp[i + 1] ?? a;
  const k = f - i;
  const ch = (shift: number) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** How many particles a def can have alive at once (the pool size). */
export function capacityFor(def: EmitterDef): number {
  if (def.max !== undefined) return Math.max(1, Math.min(MAX_CAPACITY, Math.floor(def.max)));
  const burst = def.burst === undefined ? 0 : Math.ceil(rangeMax(def.burst));
  const steady = def.rate ? Math.ceil(def.rate * rangeMax(def.life)) + 1 : 0;
  return Math.max(1, Math.min(MAX_CAPACITY, burst + steady));
}

/** What the renderer needs to draw one particle. Reused: `Emitter.visual` fills it in. */
export interface ParticleVisual {
  x: number;
  y: number;
  rotation: number;
  size: number;
  alpha: number;
  color: number;
}

export class Emitter {
  /** Where new particles appear, and the direction `angle` is measured from. Move them freely, e.g. to trail a projectile. */
  x: number;
  y: number;
  dir: number;

  readonly capacity: number;
  /** Live particles are indices 0..count-1. */
  count = 0;

  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;

  private emitting: boolean;
  private clock = 0;
  private carry = 0;

  constructor(
    readonly def: EmitterDef,
    x = 0,
    y = 0,
    dir = 0,
    private rng: Rng = Math.random,
  ) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.capacity = capacityFor(def);
    const n = this.capacity;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.size = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.emitting = !!def.rate && def.rate > 0 && (def.duration === undefined || def.duration > 0);
    if (def.burst !== undefined) {
      const count = Math.round(pick(def.burst, rng));
      for (let i = 0; i < count; i++) this.spawn();
    }
  }

  /** True once nothing is left to draw and nothing more will be emitted. */
  get done(): boolean {
    return !this.emitting && this.count === 0;
  }

  /** Stop continuous emission; live particles finish their lives. */
  stop() {
    this.emitting = false;
  }

  update(dt: number) {
    const { def } = this;
    if (this.emitting && def.rate) {
      let step = dt;
      if (def.duration !== undefined && this.clock + dt >= def.duration) {
        step = Math.max(0, def.duration - this.clock);
        this.emitting = false;
      }
      this.clock += dt;
      this.carry += def.rate * step;
      const n = Math.floor(this.carry);
      this.carry -= n;
      for (let i = 0; i < n; i++) this.spawn();
    }

    const drag = Math.exp(-(def.drag ?? 0) * dt);
    const gravity = def.gravity ?? 0;
    // Backwards, so swap-removing (the last, already updated, particle fills the hole) is safe.
    for (let i = this.count - 1; i >= 0; i--) {
      const age = (this.age[i] ?? 0) + dt;
      if (age >= (this.life[i] ?? 0)) {
        this.remove(i);
        continue;
      }
      this.age[i] = age;
      const vx = (this.vx[i] ?? 0) * drag;
      const vy = (this.vy[i] ?? 0) * drag + gravity * dt;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.px[i] = (this.px[i] ?? 0) + vx * dt;
      this.py[i] = (this.py[i] ?? 0) + vy * dt;
    }
  }

  /** Fill `out` with how particle `i` (< `count`) looks right now. */
  visual(i: number, out: ParticleVisual): ParticleVisual {
    const { def } = this;
    const age = this.age[i] ?? 0;
    const t = age / (this.life[i] ?? 1);
    out.x = this.px[i] ?? 0;
    out.y = this.py[i] ?? 0;
    out.rotation = def.align
      ? Math.atan2(this.vy[i] ?? 0, this.vx[i] ?? 0)
      : (this.rot[i] ?? 0) + (this.spin[i] ?? 0) * age;
    out.size = (this.size[i] ?? 0) * sampleCurve(def.sizeOverLife ?? 1, t);
    out.alpha = clamp01(sampleCurve(def.alphaOverLife ?? 1, t));
    out.color = sampleColor(def.colorOverLife ?? 0xffffff, t);
    return out;
  }

  /** Emit one particle now (ignored when the pool is full). */
  spawn() {
    if (this.count >= this.capacity) return;
    const { def, rng } = this;
    const i = this.count++;
    const a = this.dir + pick(def.angle ?? [0, TAU], rng);
    const speed = pick(def.speed ?? 0, rng);
    const r = pick(def.radius ?? 0, rng);
    const ra = rng() * TAU;
    this.px[i] = this.x + Math.cos(ra) * r;
    this.py[i] = this.y + Math.sin(ra) * r;
    this.vx[i] = Math.cos(a) * speed;
    this.vy[i] = Math.sin(a) * speed;
    this.age[i] = 0;
    this.life[i] = Math.max(0.001, pick(def.life, rng));
    this.size[i] = pick(def.size, rng);
    this.rot[i] = rng() * TAU;
    this.spin[i] = pick(def.spin ?? 0, rng);
  }

  private remove(i: number) {
    const last = --this.count;
    if (i === last) return;
    for (const a of [this.px, this.py, this.vx, this.vy, this.age, this.life, this.size, this.rot, this.spin]) {
      a[i] = a[last] ?? 0;
    }
  }
}
