import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { canSee, visionOf, type Match, type Owner, type Shot } from './sim/sim';

/**
 * Battle effects, all cosmetic (the rules never read them; a page reads the tick's `shots` and `deaths` and the castles' health
 * to make them): a missile that flies from the shooter to its target (a thin streak for arrows and bolts, a lobbed stone for
 * splash), a quick slash on a melee hit, a ring where a missile lands, a blast ring with a scorch that fades on the ground, a
 * short camera shake when a castle falls, and soft shadows for units and buildings.
 *
 * Everything is a pooled sprite from a few shared textures (no Graphics per shot, nothing allocated in a steady fight), and
 * the count is capped. What the player cannot see (fog) is never made. Quiet on purpose: soft shapes, no sparkles.
 */

const CELL = 40;
/** Most live effects and scorch marks at once (a crowd stops adding rather than slowing the page). */
const ITEMS_MAX = 220;
const DECALS_MAX = 24;
const DECAL_LIFE = 10;

/** Flight time (s) of a missile over `px` pixels: a tenth to a fifth of a second. */
export const flightTime = (px: number) => Math.max(0.1, Math.min(0.2, 0.08 + px / 2200));

const canvasTexture = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  return Texture.from(canvas);
};

/** A soft ellipse, flat in the middle and fading out: shadows and the team-colour pools under things. Tint it. */
export const softEllipse = (() => {
  let tex: Texture | undefined;
  return () =>
    (tex ??= canvasTexture(64, 32, (c) => {
      c.scale(1, 0.5);
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    }));
})();

type Kind = 'missile' | 'lob' | 'ring' | 'slash' | 'blast';

interface Item {
  s: Sprite;
  kind: Kind;
  age: number;
  life: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Height (px) a missile arcs over its path. */
  arc: number;
  /** A ring's final radius, or a missile's length (px). */
  size: number;
  /** A missile carries what to do on landing. */
  shot?: Shot;
  alpha: number;
}

interface Decal {
  s: Sprite;
  x: number;
  y: number;
  age: number;
}

const reduced = () => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export class BattleFx {
  /** Scorch marks on the ground: under the units. */
  readonly under = new Container();
  /** Missiles, impacts and blasts: over the units. */
  readonly over = new Container();
  private readonly sprays = new Graphics();
  private items: Item[] = [];
  private pool: Sprite[] = [];
  private decals: Decal[] = [];
  private spraying: { shot: Shot; age: number }[] = [];
  private alive: boolean[] = [];
  private shakeLeft = 0;
  private shakeAmp = 0;
  private clock = 0;
  private readonly streak: Texture;
  private readonly ringTex: Texture;

  constructor(private readonly glow: Texture) {
    this.over.addChild(this.sprays);
    // A thin streak: faint at the tail, bright at the head, soft at the sides (its right end is the head).
    this.streak = canvasTexture(64, 8, (c) => {
      const along = c.createLinearGradient(0, 0, 64, 0);
      along.addColorStop(0, 'rgba(255,255,255,0)');
      along.addColorStop(0.7, 'rgba(255,255,255,0.7)');
      along.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = along;
      c.fillRect(0, 0, 64, 8);
      c.globalCompositeOperation = 'destination-in';
      const across = c.createLinearGradient(0, 0, 0, 8);
      across.addColorStop(0, 'rgba(0,0,0,0)');
      across.addColorStop(0.5, 'rgba(0,0,0,1)');
      across.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = across;
      c.fillRect(0, 0, 64, 8);
    });
    // A thin ring with soft edges (its width is a share of its radius, so it stays a line at any size).
    this.ringTex = canvasTexture(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.8, 'rgba(255,255,255,0)');
      g.addColorStop(0.92, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    });
  }

  /** Drop everything (a new match). */
  clear() {
    for (const i of this.items) this.release(i.s);
    this.items = [];
    for (const d of this.decals) d.s.destroy();
    this.decals = [];
    this.spraying = [];
    this.sprays.clear();
    this.alive = [];
    this.shakeLeft = 0;
  }

  private take(tex: Texture, layer: Container): Sprite {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = tex;
    s.anchor.set(0.5);
    s.rotation = 0;
    s.alpha = 1;
    s.tint = 0xffffff;
    s.visible = true;
    layer.addChild(s);
    return s;
  }

  private release(s: Sprite) {
    s.removeFromParent();
    this.pool.push(s);
  }

  private add(kind: Kind, s: Sprite, life: number, o: Partial<Item> = {}) {
    this.items.push({ s, kind, age: 0, life, x0: 0, y0: 0, x1: 0, y1: 0, arc: 0, size: 0, alpha: 1, ...o });
  }

  /** What this tick (after `step`) looks like: call once per tick, with the player's seat. */
  collect(m: Match, you: Owner) {
    if (this.alive.length !== m.players.length) this.alive = m.players.map((p) => p.castle.hp > 0);
    const fell = m.players.some((p, o) => this.alive[o] && p.castle.hp <= 0);
    if (!fell && m.shots.length === 0 && !m.deaths.some((d) => d.boom)) return;
    const vision = visionOf(m);
    const seen = (at: readonly [number, number]) => canSee(m, you, at, 0, vision);
    for (const shot of m.shots) {
      if (this.items.length >= ITEMS_MAX) break;
      if (seen(shot.from) || seen(shot.to)) this.shoot(shot);
    }
    for (const d of m.deaths)
      if (d.boom && seen(d.at)) this.blast(d.at[0] * CELL, d.at[1] * CELL - (d.def.air ? 52 : 8), d.boom * CELL, true);
    m.players.forEach((p, o) => {
      if (this.alive[o] && p.castle.hp <= 0 && seen(m.board.castles[o]!)) this.shake(7, 0.7);
      this.alive[o] = p.castle.hp > 0;
    });
  }

  private shoot(shot: Shot) {
    const lift = shot.by.kind === 'tower' ? 44 : shot.by.kind === 'castle' ? 90 : 22;
    const [x0, y0] = [shot.from[0] * CELL, shot.from[1] * CELL - lift];
    const [x1, y1] = [shot.to[0] * CELL, shot.to[1] * CELL - 22];
    if (shot.multi) {
      if (this.spraying.length < 40) this.spraying.push({ shot, age: 0 });
      return;
    }
    if (shot.melee) {
      this.slash(x1, y1);
      if (shot.splash > 0) this.ring(x1, y1 + 18, shot.splash * CELL * 0.5, shot.splash * CELL, 0xffd9a0, 0.25, 0.45);
      return;
    }
    const px = Math.hypot(x1 - x0, y1 - y0);
    const life = flightTime(px);
    if (shot.splash > 0) {
      const s = this.take(this.glow, this.over);
      s.tint = 0x3a2f24;
      s.width = s.height = 17;
      this.add('lob', s, life, { x0, y0, x1, y1, arc: Math.min(90, 18 + px * 0.28), shot, size: 0 });
    } else {
      const big = shot.by.kind !== 'unit';
      const s = this.take(this.streak, this.over);
      s.anchor.set(1, 0.5);
      s.tint = big ? 0xffc15a : 0xf6ead0;
      s.height = big ? 6 : 4;
      this.add('missile', s, life, { x0, y0, x1, y1, arc: Math.min(28, px * 0.07), shot, size: big ? 46 : 32 });
    }
  }

  /** A quick pale cut across the victim, and a small ring: a melee hit. */
  private slash(x: number, y: number) {
    const s = this.take(this.streak, this.over);
    s.anchor.set(0.5);
    s.tint = 0xffffff;
    s.position.set(x, y);
    s.rotation = -0.9 + Math.random() * 0.5;
    s.width = 34;
    s.height = 5;
    this.add('slash', s, 0.16, { x1: x, y1: y });
    this.ring(x, y, 7, 17, 0xffffff, 0.16, 0.55);
  }

  private ring(x: number, y: number, r0: number, r1: number, color: number, life: number, alpha: number) {
    if (this.items.length >= ITEMS_MAX) return;
    const s = this.take(this.ringTex, this.over);
    s.tint = color;
    s.position.set(x, y);
    this.add('ring', s, life, { x1: x, y1: y, x0: r0, y0: r1, alpha });
  }

  /** A blast of radius `r` px: a spreading ring, a soft glow, and (on the ground) a scorch that stays a while and fades. */
  private blast(x: number, y: number, r: number, scorch: boolean) {
    if (this.items.length < ITEMS_MAX - 1) {
      const g = this.take(this.glow, this.over);
      g.tint = 0xffa24a;
      g.position.set(x, y);
      this.add('blast', g, 0.34, { x1: x, y1: y, x0: r, alpha: 0.4 });
    }
    this.ring(x, y, r * 0.35, r, 0xffd9a0, 0.34, 0.75);
    if (scorch) this.scorch(x, y + 6, r);
  }

  private scorch(x: number, y: number, r: number) {
    if (this.decals.length >= DECALS_MAX) {
      const old = this.decals.shift()!;
      old.s.destroy();
    }
    const s = new Sprite(softEllipse());
    s.anchor.set(0.5);
    s.tint = 0x120d08;
    s.width = r * 1.7;
    s.height = r * 1.0;
    s.position.set(x, y);
    this.under.addChild(s);
    this.decals.push({ s, x: x / CELL, y: y / CELL, age: 0 });
  }

  /** Shake the view for `seconds` (`amp` px at the start, dying away), unless the player asked for less motion. */
  shake(amp: number, seconds: number) {
    if (reduced()) return;
    this.shakeAmp = amp;
    this.shakeLeft = Math.max(this.shakeLeft, seconds);
  }

  /** Age and draw everything. `spotted` says whether the player can see a cell (for the marks that outlast the moment). */
  update(dt: number, spotted: (at: readonly [number, number]) => boolean, world: Container) {
    this.clock += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.age += dt;
      const f = Math.min(1, it.age / it.life);
      const s = it.s;
      if (it.kind === 'missile' || it.kind === 'lob') {
        const [x, y] = [it.x0 + (it.x1 - it.x0) * f, it.y0 + (it.y1 - it.y0) * f - Math.sin(Math.PI * f) * it.arc];
        const ahead = Math.min(1, f + 0.04);
        if (it.kind === 'missile') {
          const [px, py] = [
            it.x0 + (it.x1 - it.x0) * ahead,
            it.y0 + (it.y1 - it.y0) * ahead - Math.sin(Math.PI * ahead) * it.arc,
          ];
          s.rotation = Math.atan2(py - y, px - x);
          s.width = it.size * Math.min(1, f * 4 + 0.2);
          s.alpha = f > 0.85 ? (1 - f) / 0.15 : 1;
        }
        s.position.set(x, y);
        if (f >= 1) {
          if (it.kind === 'lob' && it.shot) this.blast(it.x1, it.y1 + 18, it.shot.splash * CELL, true);
          else if (it.shot) {
            this.ring(it.x1, it.y1, 4, 14, 0xf6ead0, 0.16, 0.6);
          }
          this.release(s);
          this.items[i] = this.items[this.items.length - 1]!;
          this.items.pop();
        }
        continue;
      }
      if (f >= 1) {
        this.release(s);
        this.items[i] = this.items[this.items.length - 1]!;
        this.items.pop();
        continue;
      }
      const out = 1 - (1 - f) * (1 - f);
      if (it.kind === 'ring') {
        const r = it.x0 + (it.y0 - it.x0) * out;
        s.width = s.height = r * 2;
        s.alpha = it.alpha * (1 - f);
      } else if (it.kind === 'blast') {
        const r = it.x0 * (0.5 + 0.5 * out);
        s.width = s.height = r * 2.2;
        s.alpha = it.alpha * (1 - f) * (1 - f);
      } else s.alpha = 1 - f; // slash
    }

    // A flame or a sweeping blade: a soft arc bowing from the attacker to the target (a few pooled-free strokes at most).
    const g = this.sprays;
    g.clear();
    for (let i = this.spraying.length - 1; i >= 0; i--) {
      const e = this.spraying[i]!;
      e.age += dt;
      if (e.age > 0.26) {
        this.spraying[i] = this.spraying[this.spraying.length - 1]!;
        this.spraying.pop();
        continue;
      }
      const a = 1 - e.age / 0.26;
      const lift = e.shot.by.kind === 'tower' ? 44 : e.shot.by.kind === 'castle' ? 90 : 22;
      const f = Math.min(1, e.age / (0.26 * 0.6));
      const [sx, sy, ex, ey] = [
        e.shot.from[0] * CELL,
        e.shot.from[1] * CELL - lift,
        e.shot.to[0] * CELL,
        e.shot.to[1] * CELL - 22,
      ];
      const [mx, my] = [(sx + ex) / 2 - (ey - sy) * 0.3, (sy + ey) / 2 + (ex - sx) * 0.3];
      const at = (t: number): [number, number] => [
        (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex,
        (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey,
      ];
      const [t0, t1] = [Math.max(0, f - 0.6), f];
      for (const [w, al] of [
        [14, 0.22],
        [5, 0.65],
      ] as const) {
        const [px, py] = at(t0);
        g.moveTo(px, py);
        for (let k = 1; k <= 6; k++) g.lineTo(...at(t0 + ((t1 - t0) * k) / 6));
        g.stroke({ color: 0xff9a3c, width: w, alpha: al * a, cap: 'round', join: 'round' });
      }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]!;
      d.age += dt;
      if (d.age >= DECAL_LIFE) {
        d.s.destroy();
        this.decals.splice(i, 1);
        continue;
      }
      d.s.visible = spotted([d.x, d.y]);
      d.s.alpha = 0.4 * Math.min(1, ((DECAL_LIFE - d.age) / DECAL_LIFE) * 2.2) * Math.min(1, d.age / 0.12);
    }

    // The shake: a small quick wobble of the view that dies away (the pivot, so the camera's own position is untouched).
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      const k = Math.min(1, this.shakeLeft / 0.7) ** 2;
      const z = world.scale.x || 1;
      world.pivot.set(
        (Math.sin(this.clock * 57) * this.shakeAmp * k) / z,
        (Math.cos(this.clock * 71) * this.shakeAmp * k) / z,
      );
      if (this.shakeLeft === 0) world.pivot.set(0, 0);
    }
  }
}
