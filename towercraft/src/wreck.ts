import { Container, Graphics, Sprite, Texture } from 'pixi.js';

/**
 * How buildings are hurt and lost, all cosmetic (the rules never read it): a building near death smoulders (smoke, then small
 * flames), and when it falls it shakes, sinks into the ground behind a clip at its feet, and throws up dust and rubble that
 * lies about until it fades. Castles use the same sequence, only bigger and slower (`collapse`).
 */

type Kind = 'smoke' | 'dust' | 'flame' | 'chunk';

interface Bit {
  s: Sprite;
  kind: Kind;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** A chunk lands at this y (world px). */
  floor: number;
  spin: number;
  landed: boolean;
}

interface Ruin {
  container: Container;
  sprite: Sprite;
  clip: Graphics;
  /** The tower's container is ours to destroy when it is gone; a castle's belongs to the scene. */
  owned: boolean;
  age: number;
  life: number;
  /** Half the width and the height (px) of what sinks, and whether it is a castle. */
  w: number;
  h: number;
  big: boolean;
  dust: number;
  fire: number;
  rock: number;
}

const BITS_MAX = 700;
const GRAVITY = 900;
const STONE = [0x8a8478, 0x6f6a60, 0x9c9486, 0x5f5a52];
const TIMBER = [0x7a5a36, 0x5b4026, 0x8a6a40];
const FLAMES = [0xffc65a, 0xff9a3c, 0xff6a1f];
const CHAR = 0x6e655c;

const between = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const smooth = (p: number) => p * p * (3 - 2 * p);
/** `base` darkened towards `CHAR` by `k` (0..1), as a tint. */
const charred = (k: number) => {
  const c = (shift: number) => Math.round(255 + (((CHAR >> shift) & 255) - 255) * k);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};

export class Wreck {
  /** Smoke, flames, dust and rubble in the air: over the buildings. */
  readonly air = new Container();
  /** Rubble that has landed: under the buildings and units, on the ground. */
  readonly ground = new Container();
  private bits: Bit[] = [];
  private ruins: Ruin[] = [];
  private burn = new Map<number, { smoke: number; fire: number }>();

  constructor(private readonly glow: Texture) {}

  /** Buildings still falling. */
  get falling() {
    return this.ruins.length;
  }
  /** Is this container (a castle's) being brought down? */
  has(container: Container) {
    return this.ruins.some((r) => r.container === container);
  }

  /** Drop everything (a new match). Castle containers are the scene's; tower ones are ours. */
  clear() {
    for (const b of this.bits) b.s.destroy();
    for (const r of this.ruins) if (r.owned) r.container.destroy({ children: true });
    this.bits = [];
    this.ruins = [];
    this.burn.clear();
  }

  private add(kind: Kind, x: number, y: number, o: Partial<Bit> & { life: number; size: number }) {
    if (this.bits.length >= BITS_MAX) return;
    const flat = kind === 'chunk';
    const s = new Sprite(flat ? Texture.WHITE : this.glow);
    s.anchor.set(0.5);
    s.position.set(x, y);
    if (kind === 'flame') s.blendMode = 'add';
    this.air.addChild(s);
    this.bits.push({ s, kind, vx: 0, vy: 0, age: 0, floor: y, spin: 0, landed: false, ...o });
  }

  /**
   * A hurt building's smoke and flames. `hurt` is the share of its health gone (0..1): smoke from half, flames from 70%, both
   * thickening as it nears death. `(x, top)`..`(x, foot)` is its height in world px and `w` half its width; `key` tells buildings apart.
   */
  smoulder(key: number, x: number, top: number, foot: number, w: number, hurt: number, dt: number) {
    if (hurt < 0.5) return;
    const acc = this.burn.get(key) ?? { smoke: 0, fire: 0 };
    this.burn.set(key, acc);
    const scale = w / 25;
    acc.smoke += (2 + 7 * ((hurt - 0.5) / 0.5)) * Math.sqrt(scale) * dt;
    if (hurt > 0.7) acc.fire += (2 + 6 * ((hurt - 0.7) / 0.3)) * Math.sqrt(scale) * dt;
    const h = foot - top;
    while (acc.smoke >= 1) {
      acc.smoke--;
      this.add('smoke', x + between(-0.7, 0.7) * w, top + between(0, 0.3) * h, {
        vx: between(-3, 9),
        vy: between(-22, -12),
        life: between(1.6, 2.6),
        size: between(0.36, 0.55) * Math.sqrt(scale),
        spin: 0.5,
      });
    }
    while (acc.fire >= 1) {
      acc.fire--;
      const f = between(0.1, 0.55);
      this.add('flame', x + between(-0.6, 0.6) * w, top + f * h, {
        vx: between(-4, 4),
        vy: between(-34, -18),
        life: between(0.35, 0.6),
        size: between(0.16, 0.26) * Math.sqrt(scale),
      });
      const k = this.bits[this.bits.length - 1];
      if (k?.kind === 'flame') k.s.tint = pick(FLAMES);
    }
  }

  /**
   * Bring a building down: it shakes and darkens, sinks into the ground over `life` seconds (clipped at its feet so it goes under,
   * not through), with dust along its base and rubble thrown out that stays after it has gone. `container`'s origin is its foot
   * and `sprite` is the building's picture (anchored 0.78 down). `owned` containers are destroyed when it is gone.
   */
  collapse(container: Container, sprite: Sprite, life: number, big: boolean, owned: boolean) {
    const w = sprite.width * 0.45;
    const h = sprite.height;
    const clip = new Graphics().rect(-sprite.width, -h * 1.6, sprite.width * 2, h * 1.6 + h * 0.12).fill(0xffffff);
    container.addChild(clip);
    sprite.mask = clip;
    // Everything but the picture and its owner-coloured shadow is gone at once (lamps, badges).
    container.children.forEach((c, i) => {
      if (c !== sprite && c !== clip && i !== 0) c.visible = false;
    });
    const r: Ruin = { container, sprite, clip, owned, age: 0, life, w, h, big, dust: 0, fire: 0, rock: 0 };
    this.ruins.push(r);
    for (let i = 0; i < (big ? 26 : 11); i++) this.throwRock(r, 0);
    for (let i = 0; i < (big ? 12 : 5); i++) this.puff(r, true);
  }

  private puff(r: Ruin, burst: boolean) {
    const { container: c } = r;
    this.add('dust', c.x + between(-1, 1) * r.w, c.y + between(-4, 6), {
      vx: between(-1, 1) * (burst ? 46 : 22),
      vy: between(-16, -5) * (burst ? 1.6 : 1),
      life: between(0.9, 1.6),
      size: between(0.3, 0.5) * (r.big ? 1.5 : 1),
      spin: 1,
    });
    const k = this.bits[this.bits.length - 1];
    if (k?.kind === 'dust') k.s.tint = pick([0xbfb49f, 0xa89d88, 0x8f8676]);
  }

  private throwRock(r: Ruin, sunk: number) {
    const { container: c } = r;
    const side = Math.random() < 0.5 ? -1 : 1;
    const wood = Math.random() < 0.3;
    const w = wood ? between(9, 16) : between(5, 10);
    const x = c.x + between(-0.6, 0.6) * r.w;
    const y = c.y - between(0.1, 0.85) * r.h * (1 - sunk);
    this.add('chunk', x, y, {
      vx: side * between(25, 120) * (r.big ? 1.4 : 1),
      vy: between(-190, -60),
      floor: c.y + between(0, 18),
      life: between(5, 7.5),
      size: w,
      spin: between(-6, 6),
    });
    const k = this.bits[this.bits.length - 1];
    if (k?.kind === 'chunk') {
      k.s.width = w;
      k.s.height = wood ? between(2.5, 4) : between(4, 7);
      k.s.rotation = between(0, Math.PI);
      k.s.tint = wood ? pick(TIMBER) : pick(STONE);
    }
  }

  update(dt: number) {
    for (let i = this.ruins.length - 1; i >= 0; i--) {
      const r = this.ruins[i]!;
      r.age += dt;
      const p = Math.min(1, r.age / r.life);
      const e = smooth(Math.max(0, (p - 0.12) / 0.88)); // a beat of shaking first, then down
      r.sprite.y = e * r.h * 0.9;
      r.sprite.x = Math.sin(r.age * 62) * (r.big ? 3 : 2) * (1 - e) * Math.min(1, r.age * 4);
      r.sprite.rotation = Math.sin(r.age * 11) * 0.012 * (1 - e);
      r.sprite.tint = charred(Math.min(1, p * 3) * 0.55);
      const shadow = r.container.children[0];
      if (shadow) shadow.alpha = 1 - e;
      if (r.container.visible) {
        const n = r.big ? 1.7 : 1;
        r.dust += (30 * n + 20 * n * (1 - p)) * dt;
        while (r.dust >= 1) {
          r.dust--;
          this.puff(r, false);
        }
        if (p < 0.4) {
          r.fire += 16 * n * (1 - p / 0.4) * dt;
          while (r.fire >= 1) {
            r.fire--;
            this.add('flame', r.container.x + between(-0.6, 0.6) * r.w, r.container.y - between(0.05, 0.6) * r.h, {
              vx: between(-5, 5),
              vy: between(-40, -20),
              life: between(0.35, 0.65),
              size: between(0.2, 0.34) * n,
            });
            const k = this.bits[this.bits.length - 1];
            if (k?.kind === 'flame') k.s.tint = pick(FLAMES);
          }
        }
        if (p < 0.75) {
          r.rock += (r.big ? 14 : 8) * dt;
          while (r.rock >= 1) {
            r.rock--;
            this.throwRock(r, e);
          }
        }
      }
      if (p >= 1) {
        if (r.owned) r.container.destroy({ children: true });
        else {
          r.sprite.mask = null;
          r.clip.destroy();
          r.sprite.visible = false;
        }
        this.ruins.splice(i, 1);
      }
    }

    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]!;
      b.age += dt;
      const p = b.age / b.life;
      if (p >= 1) {
        b.s.destroy();
        this.bits.splice(i, 1);
        continue;
      }
      if (b.kind === 'chunk') {
        if (!b.landed) {
          b.vy += GRAVITY * dt;
          b.s.x += b.vx * dt;
          b.s.y += b.vy * dt;
          b.s.rotation += b.spin * dt;
          if (b.vy > 0 && b.s.y >= b.floor) {
            b.s.y = b.floor;
            if (b.vy > 120 && b.vx !== 0) {
              b.vy *= -0.3; // one small bounce
              b.vx *= 0.5;
              b.spin *= 0.4;
            } else {
              b.landed = true;
              this.ground.addChild(b.s); // under the buildings and units from here on
            }
          }
        }
        b.s.alpha = Math.min(1, (b.life - b.age) / 1.4); // it lies about, then fades
        continue;
      }
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      if (b.kind === 'flame') {
        const k = 1 - p;
        b.s.scale.set(b.size * (0.5 + k));
        b.s.alpha = 0.85 * k;
      } else {
        b.s.rotation += b.spin * dt * 0.3;
        b.s.scale.set(b.size * (1 + p * 1.8));
        b.s.alpha = Math.min(p * 8, 1) * (1 - p) * (b.kind === 'smoke' ? 0.6 : 0.55);
        if (b.kind === 'smoke') b.s.tint = charred(0.75 + 0.25 * p) & 0xffffff; // soot darkening to grey as it thins
        b.vx *= 1 - 0.8 * dt;
      }
    }
  }
}
