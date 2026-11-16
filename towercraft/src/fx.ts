import { Container, Sprite, Texture } from 'pixi.js';
import { canSee, visionOf, type Match, type Owner, type Shot } from './sim/sim';
import type { FxArt } from './fxArt';
import { MISSILES, frameAt, impactFor, lobSize, missileFor, type MissileId, type Shooter } from './fxKinds';

/**
 * Battle effects, all cosmetic (the rules never read them; a page reads the tick's `shots` and `deaths` and the castles' health
 * to make them), drawn from Wyrmsun's sheets (`fxArt.ts`, `fxKinds.ts` says what fires what): each missile is its own picture
 * turned to its heading (arrows and bolts fly flat, balls, rocks and slime are lobbed with a shadow on the ground) and ends in an
 * animated impact (a dust puff, the siege impact, a fireball with a scorch that fades); a melee blow is a crescent cut and a puff;
 * flame throwers and sweeping blades throw small flames. A short camera shake when a castle falls.
 *
 * Everything is a pooled sprite from shared textures (nothing allocated in a steady fight) and the count is capped. What the
 * player cannot see (fog) is never made. Until `setArt` has been called nothing is drawn.
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

/** A soft ring with a faint pool inside it: the team mark under a unit or tower (tint it). Thin and translucent, so sides tell apart without a disc. */
export const softRing = (() => {
  let tex: Texture | undefined;
  return () =>
    (tex ??= canvasTexture(96, 48, (c) => {
      c.scale(1, 0.5);
      const g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
      g.addColorStop(0, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.8)');
      g.addColorStop(0.9, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 96, 96);
    }));
})();

type Kind = 'missile' | 'lob' | 'anim' | 'flame' | 'glow' | 'dust';

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
  /** A missile's id, an animation's frames, a picture's size (px) and a ground shadow that follows a lobbed one. */
  id?: MissileId;
  frames?: Texture[];
  size: number;
  shadow?: Sprite;
  /** A missile carries what to do on landing. */
  shot?: Shot;
  alpha: number;
  /** Seconds before it appears (a flame in a spray). */
  delay: number;
  /** Spin (rad/s) of a tumbling rock. */
  spin: number;
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
  /** Scorch marks and missile shadows on the ground: under the units. */
  readonly under = new Container();
  /** Missiles, impacts and blasts: over the units. */
  readonly over = new Container();
  private items: Item[] = [];
  private pool: Sprite[] = [];
  private decals: Decal[] = [];
  private alive: boolean[] = [];
  private shakeLeft = 0;
  private shakeAmp = 0;
  private clock = 0;
  private art: FxArt | undefined;
  /** Who fired, by id, this tick (filled lazily): a unit's sheet or a tower's picture. */
  private who = new Map<number, Shooter>();
  private whoTick: Match | undefined;

  constructor(private readonly glow: Texture) {}

  /** The pictures (loaded with the match's art). */
  setArt(art: FxArt) {
    this.art = art;
  }

  /** Drop everything (a new match). */
  clear() {
    for (const i of this.items) {
      this.release(i.s);
      if (i.shadow) this.release(i.shadow);
    }
    this.items = [];
    for (const d of this.decals) d.s.destroy();
    this.decals = [];
    this.alive = [];
    this.shakeLeft = 0;
  }

  private take(tex: Texture, layer: Container): Sprite {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = tex;
    s.anchor.set(0.5);
    s.rotation = 0;
    s.scale.set(1);
    s.alpha = 1;
    s.tint = 0xffffff;
    s.blendMode = 'normal';
    s.visible = true;
    layer.addChild(s);
    return s;
  }

  private release(s: Sprite) {
    s.removeFromParent();
    this.pool.push(s);
  }

  private add(kind: Kind, s: Sprite, life: number, o: Partial<Item> = {}) {
    this.items.push({
      s,
      kind,
      age: 0,
      life,
      x0: 0,
      y0: 0,
      x1: 0,
      y1: 0,
      arc: 0,
      size: 0,
      alpha: 1,
      delay: 0,
      spin: 0,
      ...o,
    });
  }

  /** Fit a sprite's longer side to `px`. */
  private fit(s: Sprite, px: number) {
    s.scale.set(px / Math.max(s.texture.width, s.texture.height));
  }

  private shooter(m: Match, by: Shot['by']): Shooter | undefined {
    if (this.whoTick !== m) {
      this.whoTick = m;
      this.who.clear();
    }
    if (by.kind === 'castle') return { kind: 'castle' };
    const key = by.kind === 'unit' ? by.id : -by.id - 1;
    let w = this.who.get(key);
    if (!w) {
      if (by.kind === 'unit') {
        const u = m.units.find((x) => x.id === by.id);
        if (u) w = { kind: 'unit', sheet: u.def.sheet };
      } else {
        const t = m.towers.find((x) => x.id === by.id);
        if (t) w = { kind: 'tower', art: t.def.art };
      }
      if (w) this.who.set(key, w);
    }
    return w;
  }

  /** What this tick (after `step`) looks like: call once per tick, with the player's seat. */
  collect(m: Match, you: Owner) {
    if (this.alive.length !== m.players.length) this.alive = m.players.map((p) => p.castle.hp > 0);
    const fell = m.players.some((p, o) => this.alive[o] && p.castle.hp <= 0);
    if (!fell && m.shots.length === 0 && !m.deaths.some((d) => d.boom)) return;
    const vision = visionOf(m);
    const seen = (at: readonly [number, number]) => canSee(m, you, at, 0, vision);
    if (this.art)
      for (const shot of m.shots) {
        if (this.items.length >= ITEMS_MAX) break;
        if (seen(shot.from) || seen(shot.to)) this.shoot(shot, this.shooter(m, shot.by));
      }
    for (const d of m.deaths)
      if (d.boom && seen(d.at)) this.blast(d.at[0] * CELL, d.at[1] * CELL - (d.def.air ? 52 : 8), d.boom * CELL, true);
    m.players.forEach((p, o) => {
      if (this.alive[o] && p.castle.hp <= 0 && seen(m.board.castles[o]!)) this.shake(7, 0.7);
      this.alive[o] = p.castle.hp > 0;
    });
  }

  private shoot(shot: Shot, who: Shooter | undefined) {
    const art = this.art!;
    const lift = shot.by.kind === 'tower' ? 44 : shot.by.kind === 'castle' ? 90 : 22;
    const [x0, y0] = [shot.from[0] * CELL, shot.from[1] * CELL - lift];
    const [x1, y1] = [shot.to[0] * CELL, shot.to[1] * CELL - 22];
    if (shot.multi) {
      this.spray(x0, y0, x1, y1);
      return;
    }
    if (shot.melee) {
      this.strike(x0, y0, x1, y1, shot.splash);
      return;
    }
    const id = missileFor(who, shot.splash);
    const spec = MISSILES[id];
    const px = Math.hypot(x1 - x0, y1 - y0);
    const life = flightTime(px) * (spec.lob ? 1.5 : 1);
    const s = this.take(art.missiles[id][0]!, this.over);
    const arc = Math.min(spec.arcMax, px * spec.arc);
    const o: Partial<Item> = { x0, y0, x1, y1, arc, shot, id, size: spec.size };
    if (spec.lob) {
      const sh = this.take(softEllipse(), this.under);
      sh.tint = 0;
      sh.alpha = 0.3;
      o.shadow = sh;
    }
    this.add(spec.lob ? 'lob' : 'missile', s, life, o);
  }

  /** A pale crescent cut across the victim (turned to the blow) and a small puff: a melee hit. */
  private strike(x0: number, y0: number, x1: number, y1: number, splash: number) {
    const art = this.art!;
    const a = Math.atan2(y1 - y0, x1 - x0);
    const s = this.take(art.slash[0]!, this.over);
    s.position.set(x1, y1);
    s.rotation = a + (Math.random() - 0.5) * 0.5;
    s.tint = 0xfff1d2;
    this.fit(s, 34);
    s.scale.x *= 0.62; // a slim cut, not a fat crescent
    this.add('anim', s, 0.14, { frames: art.slash, x1, y1, size: 34, alpha: 0.7 });
    if (this.items.length < ITEMS_MAX) this.puff(x1 - Math.cos(a) * 4, y1 + 8, 28);
    if (splash > 0) this.impact(x1, y1 + 14, splash * CELL, 'impact', false);
  }

  /** A small puff of dust where a missile lands or a blow connects: a soft smoke picture, tinted, that rises and thins. */
  private puff(x: number, y: number, px: number) {
    const art = this.art!;
    const s = this.take(art.smoke[Math.floor(Math.random() * art.smoke.length)]!, this.over);
    s.position.set(x, y);
    s.rotation = (Math.random() - 0.5) * 0.8;
    s.tint = Math.random() < 0.5 ? 0xcdbfa6 : 0xb5aa96;
    this.fit(s, px * 0.4);
    this.add('dust', s, 0.45, { x1: x, y1: y, size: px, alpha: 0.3 });
  }

  /** Flames thrown from the attacker towards a victim: a few small fires that fly out and burn down. */
  private spray(x0: number, y0: number, x1: number, y1: number) {
    const art = this.art!;
    for (let i = 0; i < 4; i++) {
      if (this.items.length >= ITEMS_MAX) return;
      const s = this.take(art.smallFire[0]!, this.over);
      s.visible = false;
      this.fit(s, 16);
      const j = (Math.random() - 0.5) * 16;
      this.add('flame', s, 0.32, {
        frames: art.smallFire,
        x0,
        y0,
        x1: x1 + j,
        y1: y1 + j * 0.6,
        delay: i * 0.035,
        size: 30 + Math.random() * 12,
      });
    }
  }

  /** An impact of radius `r` px: the siege impact or the fireball, with a warm glow under it (and on the ground a scorch). */
  private impact(x: number, y: number, r: number, kind: 'impact' | 'explosion' | 'splash', scorch: boolean) {
    const art = this.art;
    if (!art || this.items.length >= ITEMS_MAX - 1) return;
    const frames = kind === 'explosion' ? art.explosion : art.impact;
    const s = this.take(frames[0]!, this.over);
    s.position.set(x, y);
    const px = Math.max(34, r * (kind === 'explosion' ? 2.9 : 2.5));
    this.fit(s, px);
    if (kind === 'splash') s.tint = 0x86e070;
    this.add('anim', s, kind === 'explosion' ? 0.75 : 0.5, { frames, x1: x, y1: y, size: px });
    const g = this.take(this.glow, this.over);
    g.tint = kind === 'splash' ? 0x6ad94a : 0xff8a30;
    g.blendMode = 'add';
    g.position.set(x, y);
    this.add('glow', g, 0.3, { x1: x, y1: y, x0: r, alpha: 0.22 });
    if (scorch && kind !== 'splash') this.scorch(x, y + 6, r);
  }

  /** A blast of radius `r` px (a bomb, or a ball landing): a fireball and, on the ground, a scorch that stays a while and fades. */
  private blast(x: number, y: number, r: number, scorch: boolean) {
    this.impact(x, y, r, 'explosion', scorch);
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

  private finish(i: number) {
    const it = this.items[i]!;
    this.release(it.s);
    if (it.shadow) this.release(it.shadow);
    this.items[i] = this.items[this.items.length - 1]!;
    this.items.pop();
  }

  /** Age and draw everything. `spotted` says whether the player can see a cell (for the marks that outlast the moment). */
  update(dt: number, spotted: (at: readonly [number, number]) => boolean, world: Container) {
    this.clock += dt;
    const art = this.art;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.age += dt;
      const s = it.s;
      if (it.age < 0 || it.age < it.delay) continue;
      const f = Math.min(1, (it.age - it.delay) / it.life);
      if (it.kind === 'missile' || it.kind === 'lob') {
        const at = (t: number): [number, number] => [
          it.x0 + (it.x1 - it.x0) * t,
          it.y0 + (it.y1 - it.y0) * t - Math.sin(Math.PI * t) * it.arc,
        ];
        const [x, y] = at(f);
        s.position.set(x, y);
        const spec = MISSILES[it.id!];
        if (it.kind === 'missile') {
          const [px, py] = at(Math.min(1, f + 0.04));
          s.rotation = Math.atan2(py - y, px - x);
          this.fit(s, it.size * Math.min(1, f * 5 + 0.3));
        } else if (art) {
          const k = lobSize(f);
          s.texture = art.missiles[it.id!][k]!;
          s.rotation += (it.spin || (it.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6))) * dt;
          this.fit(s, it.size * (0.7 + 0.5 * Math.sin(Math.PI * f)));
          const sh = it.shadow!;
          const [gx, gy] = [it.x0 + (it.x1 - it.x0) * f, it.y0 + (it.y1 - it.y0) * f + 22 + 4];
          sh.position.set(gx, gy);
          const k2 = 1 - 0.35 * Math.sin(Math.PI * f);
          sh.width = 22 * k2;
          sh.height = 10 * k2;
          sh.alpha = 0.32 * k2;
        }
        if (f >= 1) {
          const shot = it.shot;
          if (shot && art) {
            const kind = impactFor(it.id!, shot.splash);
            if (kind === 'puff') this.puff(it.x1, it.y1 + 4, spec.size > 50 ? 44 : 32);
            else this.impact(it.x1, it.y1 + 18, Math.max(shot.splash, 0.6) * CELL, kind, true);
          }
          this.finish(i);
        }
        continue;
      }
      if (f >= 1) {
        this.finish(i);
        continue;
      }
      if (it.kind === 'anim' || it.kind === 'flame') {
        if (it.kind === 'flame') {
          s.visible = true;
          const e = 1 - (1 - f) * (1 - f);
          s.position.set(it.x0 + (it.x1 - it.x0) * e, it.y0 + (it.y1 - it.y0) * e - Math.sin(Math.PI * f) * 6);
          this.fit(s, it.size * (0.45 + 0.55 * e));
          s.alpha = 1 - f * f;
        } else s.alpha = it.alpha * (f > 0.7 ? (1 - f) / 0.3 : 1);
        s.texture = it.frames![frameAt(it.frames!.length, f, 1)]!;
      } else if (it.kind === 'dust') {
        s.y = it.y1 - 14 * f;
        this.fit(s, it.size * (0.55 + 0.9 * f));
        s.alpha = it.alpha * Math.min(1, f * 8) * (1 - f);
      } else if (it.kind === 'glow') {
        const r = it.x0 * (0.9 + 0.5 * f);
        s.width = s.height = r * 2.4;
        s.alpha = it.alpha * (1 - f) * (1 - f);
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
