import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FxArt } from './fxArt';
import { frameAt } from './fxKinds';

/**
 * How buildings are hurt and lost, all cosmetic (the rules never read it), from Wyrmsun's pictures (`fxArt.ts`): a building near
 * death smoulders (smoke puffs, then animated small and big flames with a warm glow), and when it falls it shakes, burns and
 * bursts, shows its half-wrecked second frame, sinks into the ground behind a clip at its feet and leaves a scar and rubble that fade.
 * Castles use the same sequence, bigger and slower (`collapse`). New buildings throw up dust as they rise (`rise`).
 */

type Kind = 'smoke' | 'dust' | 'chunk' | 'boom' | 'scar';

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
  /** A scar's cell (for the fog rule). */
  at?: [number, number];
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
  boom: number;
  rock: number;
  /** The half-wrecked frame it shows from a third of the way down (a building sheet's second frame). */
  alt?: Texture;
  burst: boolean;
}

/** The fires on one burning building. */
interface Burn {
  smoke: number;
  fires: { s: Sprite; glow: Sprite; ox: number; oy: number; phase: number }[];
  seen: number;
}

const BITS_MAX = 600;
const FIRES_MAX = 40;
const GRAVITY = 900;
const TIMBER = [0x7a5a36, 0x5b4026, 0x8a6a40];
const SOOT = 0x4a443e;
const DUSTS = [0xd2c7b0, 0xbdb29b, 0xa59a85];
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
  /** Rubble and scars that have landed: under the buildings and units, on the ground. */
  readonly ground = new Container();
  private bits: Bit[] = [];
  private ruins: Ruin[] = [];
  private burn = new Map<number, Burn>();
  private frame = 0;
  private clock = 0;
  private art: FxArt | undefined;

  constructor(private readonly glow: Texture) {}

  setArt(art: FxArt) {
    this.art = art;
  }

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
    for (const b of this.burn.values()) this.putOut(b);
    this.bits = [];
    this.ruins = [];
    this.burn.clear();
  }

  private putOut(b: Burn) {
    for (const f of b.fires) {
      f.s.destroy();
      f.glow.destroy();
    }
    b.fires.length = 0;
  }

  private add(kind: Kind, x: number, y: number, o: Partial<Bit> & { life: number; size: number }, tex?: Texture) {
    const art = this.art;
    if (!art || this.bits.length >= BITS_MAX) return undefined;
    const s = new Sprite(tex ?? (kind === 'chunk' ? Texture.WHITE : pick(art.smoke)));
    s.anchor.set(0.5);
    s.position.set(x, y);
    (kind === 'scar' ? this.ground : this.air).addChild(s);
    const b: Bit = { s, kind, vx: 0, vy: 0, age: 0, floor: y, spin: 0, landed: false, ...o };
    this.bits.push(b);
    return b;
  }

  /**
   * A hurt building's smoke and flames. `hurt` is the share of its health gone (0..1): smoke from half, flames from 70%, both
   * thickening as it nears death. `(x, top)`..`(x, foot)` is its height in world px and `w` half its width; `key` tells buildings apart.
   */
  smoulder(key: number, x: number, top: number, foot: number, w: number, hurt: number, dt: number) {
    const art = this.art;
    if (!art || hurt < 0.5) return;
    let acc = this.burn.get(key);
    if (!acc) this.burn.set(key, (acc = { smoke: 0, fires: [], seen: 0 }));
    acc.seen = this.frame;
    const scale = w / 25;
    acc.smoke += (1.2 + 4 * ((hurt - 0.5) / 0.5)) * Math.sqrt(scale) * dt;
    const h = foot - top;
    while (acc.smoke >= 1) {
      acc.smoke--;
      const b = this.add('smoke', x + between(-0.5, 0.5) * w, top + between(0, 0.3) * h, {
        vx: between(-3, 9),
        vy: between(-24, -14),
        life: between(1.8, 2.8),
        size: between(0.2, 0.3) * Math.sqrt(scale),
        spin: 0.4,
      });
      if (b) b.s.tint = SOOT;
    }
    // Flames: more of them, and bigger ones, as it nears the end. Each keeps its spot on the building.
    const want = hurt > 0.7 ? Math.min(6, 1 + Math.floor(((hurt - 0.7) / 0.3) * 5 * Math.sqrt(scale) * 0.8)) : 0;
    const total = this.fireCount();
    while (acc.fires.length < want && total + acc.fires.length < FIRES_MAX) {
      const s = new Sprite(art.smallFire[0]);
      s.anchor.set(0.5, 0.88);
      const glow = new Sprite(this.glow);
      glow.anchor.set(0.5);
      glow.tint = 0xff8a30;
      glow.blendMode = 'add';
      this.air.addChild(glow, s);
      acc.fires.push({ s, glow, ox: between(-0.75, 0.75), oy: between(0.2, 0.62), phase: Math.random() * 10 });
    }
    const big = hurt > 0.88;
    const frames = big ? art.bigFire : art.smallFire;
    const k = (big ? 0.95 + 0.4 * scale : 0.7 + 0.32 * scale) * (0.75 + 0.5 * hurt);
    for (const f of acc.fires) {
      f.s.texture = frames[Math.floor((this.clock * 9 + f.phase) % frames.length)]!;
      f.s.position.set(x + f.ox * w, top + f.oy * h);
      f.s.scale.set(k * (0.85 + 0.15 * Math.sin(this.clock * 7 + f.phase)));
      f.glow.position.set(f.s.x, f.s.y - 10 * k);
      f.glow.scale.set(k * 1.5);
      f.glow.alpha = 0.3 + 0.1 * Math.sin(this.clock * 11 + f.phase);
    }
  }

  private fireCount() {
    let n = 0;
    for (const b of this.burn.values()) n += b.fires.length;
    return n;
  }

  /** A new building rising: a puff of dust at its feet (call a few times over its rise). `w` is half its width. */
  rise(x: number, y: number, w: number) {
    for (let i = 0; i < 2; i++) {
      const b = this.add('dust', x + between(-1, 1) * w, y + between(-6, 4), {
        vx: between(-1, 1) * 26,
        vy: between(-14, -4),
        life: between(0.6, 1),
        size: between(0.22, 0.34) * (w / 30),
        spin: 1,
      });
      if (b) b.s.tint = pick(DUSTS);
    }
  }

  /**
   * Bring a building down: it shakes and chars, burns and bursts, then (a third of the way) shows `alt`, its half-wrecked frame,
   * sinking into the ground over `life` seconds (clipped at its feet so it goes under, not through), with dust along its base,
   * rubble thrown out and a scar left where it stood. `container`'s origin is its foot and `sprite` is the building's picture
   * (anchored 0.78 down). `owned` containers are destroyed when it is gone.
   */
  collapse(container: Container, sprite: Sprite, life: number, big: boolean, owned: boolean, alt?: Texture) {
    const w = sprite.width * 0.45;
    const h = sprite.height;
    const clip = new Graphics().rect(-sprite.width, -h * 1.6, sprite.width * 2, h * 1.6 + h * 0.12).fill(0xffffff);
    container.addChild(clip);
    sprite.mask = clip;
    // Everything but the picture and its owner-coloured shadow is gone at once (lamps, badges).
    container.children.forEach((c, i) => {
      if (c !== sprite && c !== clip && i !== 0) c.visible = false;
    });
    const r: Ruin = {
      container,
      sprite,
      clip,
      owned,
      age: 0,
      life,
      w,
      h,
      big,
      dust: 0,
      boom: 0,
      rock: 0,
      alt,
      burst: false,
    };
    this.ruins.push(r);
    for (let i = 0; i < (big ? 22 : 9); i++) this.throwRock(r, 0);
    for (let i = 0; i < (big ? 12 : 5); i++) this.puff(r, true);
    this.boom(r, 0.55);
  }

  /** A fireball somewhere on the falling building. */
  private boom(r: Ruin, at: number) {
    const art = this.art;
    if (!art) return;
    const { container: c } = r;
    const px = between(0.8, 1.15) * r.w * (r.big ? 1.5 : 1.7);
    const b = this.add(
      'boom',
      c.x + between(-0.6, 0.6) * r.w,
      c.y - r.h * between(0.1, 0.55) * (1 - at * 0.5),
      { life: between(0.6, 0.8), size: px },
      art.explosion[0],
    );
    if (b) b.s.scale.set(px / 64);
  }

  private puff(r: Ruin, burst: boolean) {
    const { container: c } = r;
    const b = this.add('dust', c.x + between(-1, 1) * r.w, c.y + between(-4, 6), {
      vx: between(-1, 1) * (burst ? 46 : 22),
      vy: between(-16, -5) * (burst ? 1.6 : 1),
      life: between(0.9, 1.6),
      size: between(0.3, 0.5) * (r.big ? 1.5 : 1),
      spin: 1,
    });
    if (b) b.s.tint = pick(DUSTS);
  }

  private throwRock(r: Ruin, sunk: number) {
    const art = this.art;
    if (!art) return;
    const { container: c } = r;
    const side = Math.random() < 0.5 ? -1 : 1;
    const wood = Math.random() < 0.3;
    const w = wood ? between(9, 16) : between(7, 12);
    const x = c.x + between(-0.6, 0.6) * r.w;
    const y = c.y - between(0.1, 0.85) * r.h * (1 - sunk);
    const b = this.add(
      'chunk',
      x,
      y,
      {
        vx: side * between(25, 120) * (r.big ? 1.4 : 1),
        vy: between(-190, -60),
        floor: c.y + between(0, 18),
        life: between(5, 7.5),
        size: w,
        spin: between(-6, 6),
      },
      wood ? Texture.WHITE : pick(art.shards),
    );
    if (b) {
      if (wood) {
        b.s.width = w;
        b.s.height = between(2.5, 4);
        b.s.tint = pick(TIMBER);
      } else {
        b.s.scale.set(w / 12);
        b.s.tint = pick([0xffffff, 0xcfc8bb, 0xa8a196]);
      }
      b.s.rotation = between(0, Math.PI);
    }
  }

  /** Age everything. `spotted` hides what lingers (scars) in ground the player cannot see. */
  update(dt: number, spotted?: (at: readonly [number, number]) => boolean) {
    this.frame++;
    this.clock += dt;
    const art = this.art;
    for (const [k, b] of this.burn)
      if (b.seen !== this.frame - 1 && b.seen !== this.frame) {
        this.putOut(b);
        this.burn.delete(k);
      }
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
      if (!r.burst && p > 0.3) {
        // The second stage: the roof goes in a big burst and the half-wrecked frame shows.
        r.burst = true;
        if (r.alt) r.sprite.texture = r.alt;
        for (let k = 0; k < (r.big ? 3 : 2); k++) this.boom(r, 0.2);
        for (let k = 0; k < (r.big ? 10 : 5); k++) this.puff(r, true);
        for (let k = 0; k < (r.big ? 10 : 4); k++) this.throwRock(r, e);
      }
      if (r.container.visible) {
        const n = r.big ? 1.7 : 1;
        r.dust += (14 * n + 10 * n * (1 - p)) * dt;
        while (r.dust >= 1) {
          r.dust--;
          this.puff(r, false);
        }
        if (p < 0.65) {
          r.boom += (r.big ? 3.2 : 2.2) * (1 - p / 0.65) * dt;
          while (r.boom >= 1) {
            r.boom--;
            this.boom(r, p);
          }
        }
        if (p < 0.75) {
          r.rock += (r.big ? 12 : 7) * dt;
          while (r.rock >= 1) {
            r.rock--;
            this.throwRock(r, e);
          }
        }
      }
      if (p >= 1) {
        if (art) {
          const scar = this.add(
            'scar',
            r.container.x,
            r.container.y - 4,
            { life: 16, size: r.w * 2.6, at: [r.container.x / 40, r.container.y / 40] },
            art.destroyed[r.big ? 0 : 1],
          );
          if (scar) scar.s.scale.set((r.big ? r.w * 2.6 : r.w * 2.4) / 64);
        }
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
      if (b.kind === 'scar') {
        b.s.alpha = 0.95 * Math.min(1, b.age / 1.2) * Math.min(1, (1 - p) / 0.4);
        b.s.visible = !spotted || !b.at || spotted(b.at);
        continue;
      }
      if (b.kind === 'boom') {
        if (art) b.s.texture = art.explosion[frameAt(art.explosion.length, p, 1)]!;
        b.s.alpha = p > 0.8 ? (1 - p) / 0.2 : 1;
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
      b.s.rotation += b.spin * dt * 0.3;
      b.s.scale.set(b.size * (1 + p * 1.8));
      b.s.alpha = Math.min(p * 8, 1) * (1 - p) * (b.kind === 'smoke' ? 0.62 : 0.55);
      if (b.kind === 'smoke') b.s.tint = charred(0.75 + 0.25 * p) & 0xffffff;
      b.vx *= 1 - 0.8 * dt;
    }
  }
}
