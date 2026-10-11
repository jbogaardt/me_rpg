import { Container, Graphics, Sprite, type Renderer, type Texture } from 'pixi.js';
import { CELL, DECAL_Z, type MapData, type MapObject } from '../map/types';
import type { Character } from './Character';

// Passive background life: footprints that fade on sand and snow, and leaves that drop when the hero
// walks behind canopies or swings at them. Driven by body movement and map metadata (surface, tags),
// so it needs no hooks into collision. Everything is pooled and capped so phones stay smooth.

const PRINT_POOL = 96;
const PRINT_STRIDE = 13; // pixels walked between prints
const PRINT_SIDE = 3; // left/right offset from the path
const LEAF_POOL = 64;
const TELEPORT = 40; // a one-frame jump bigger than this (respawn) is not walking

/** Which surfaces keep prints, and how. */
const PRINTS: Record<string, { tint: number; alpha: number; life: number }> = {
  sand: { tint: 0x7a5c2c, alpha: 0.5, life: 10 },
  snow: { tint: 0x6f86ab, alpha: 0.7, life: 16 },
};

/** Leaf colours by the sheet a canopy was cut from (recoloured sheets drop snow-dust or withered leaves). */
const PALETTES: Record<string, number[]> = {
  frost: [0x5f95a3, 0x4a7a8a, 0x8fbcc8],
  dry: [0x8a5a1a, 0x6b4414, 0xb07a24],
  green: [0x3f7a2a, 0x2f6a24, 0x578f2c, 0xc9a23a],
};

interface Walker {
  x: number;
  y: number;
  accum: number;
  side: 1 | -1;
  moving: boolean; // moved this frame (not a respawn jump)
}

interface Print {
  sprite: Sprite;
  age: number; // seconds; -1 = idle
  life: number;
  alpha: number;
}

interface Leaf {
  sprite: Sprite;
  t: number;
  fall: number; // seconds until it lands
  life: number;
  x0: number;
  ground: number; // y where it lands (also its sort key)
  h0: number; // starting height above the ground
  phase: number;
  sway: number;
  alive: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export class Ambient {
  private decals = new Container();
  private prints: Print[] = [];
  private nextPrint = 0;
  private leaves: Leaf[] = [];
  private nextLeaf = 0;
  private walkers = new Map<Character, Walker>();
  private canopies = new Map<number, MapObject[]>(); // spatial hash: cell -> canopy sprites (tagged tree/bush)
  private cooldown = new Map<MapObject, number>(); // per-canopy time until it can drop leaves again
  private clock = 0;
  private printTex: Texture;
  private leafTex: Texture;

  constructor(
    world: Container,
    private data: MapData,
    renderer: Renderer,
  ) {
    const foot = new Graphics().ellipse(0, -2, 2.6, 3.4).fill(0xffffff).ellipse(0, 3.2, 1.8, 1.9).fill(0xffffff);
    this.printTex = renderer.generateTexture(foot);
    const leaf = new Graphics().ellipse(0, 0, 3.4, 2.2).fill(0xffffff);
    this.leafTex = renderer.generateTexture(leaf);
    foot.destroy();
    leaf.destroy();

    this.decals.zIndex = DECAL_Z;
    world.addChild(this.decals);
    for (let i = 0; i < PRINT_POOL; i++) {
      const sprite = new Sprite(this.printTex);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.decals.addChild(sprite);
      this.prints.push({ sprite, age: -1, life: 1, alpha: 1 });
    }
    for (let i = 0; i < LEAF_POOL; i++) {
      const sprite = new Sprite(this.leafTex);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      world.addChild(sprite);
      this.leaves.push({ sprite, t: 0, fall: 0, life: 0, x0: 0, ground: 0, h0: 0, phase: 0, sway: 0, alive: false });
    }

    for (const o of data.objects) {
      if (o.tag !== 'tree' && o.tag !== 'bush') continue;
      const c0 = Math.floor(o.px / CELL), c1 = Math.floor((o.px + o.w - 1) / CELL);
      const r0 = Math.floor(o.py / CELL), r1 = Math.floor((o.py + o.h - 1) / CELL);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = r * data.width + c;
          this.canopies.set(key, [...(this.canopies.get(key) ?? []), o]);
        }
      }
    }
  }

  /** Advance by dt seconds. `hero` rustles canopies; every body in `walkers` (the hero too) leaves prints. */
  update(dt: number, hero: Character, walkers: Character[]) {
    this.clock += dt;
    for (const body of walkers) this.walk(body);
    this.rustle(hero);
    this.fadePrints(dt);
    this.fallLeaves(dt);
  }

  /** A swing or impact at (x, y): every canopy within `radius` drops a shower of leaves. */
  shake(x: number, y: number, radius: number) {
    for (const o of this.near(x - radius, y - radius, x + radius, y + radius)) {
      const dx = Math.max(o.px - x, 0, x - (o.px + o.w));
      const dy = Math.max(o.py - y, 0, y - (o.py + o.h));
      if (Math.hypot(dx, dy) > radius || !this.ready(o, 0.3)) continue;
      const n = o.tag === 'tree' ? 9 : 5;
      for (let i = 0; i < n; i++) {
        this.dropLeaf(o, rand(o.px + 8, o.px + o.w - 8), o.py + o.h + rand(0, 10), rand(18, 46));
      }
    }
  }

  private surfaceAt(x: number, y: number): string {
    const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
    if (col < 0 || row < 0 || col >= this.data.width || row >= this.data.height) return '';
    return this.data.surfaces[this.data.surface[row * this.data.width + col]] ?? '';
  }

  // --- Footprints ---

  private walk(body: Character) {
    let w = this.walkers.get(body);
    if (!w) this.walkers.set(body, (w = { x: body.x, y: body.y, accum: 0, side: 1, moving: false }));
    const dx = body.x - w.x, dy = body.y - w.y;
    const dist = Math.hypot(dx, dy);
    w.x = body.x;
    w.y = body.y;
    w.moving = dist >= 0.05 && dist <= TELEPORT;
    if (dist < 0.05 || dist > TELEPORT) {
      if (dist > TELEPORT) w.accum = 0;
      return;
    }
    w.accum += dist;
    if (w.accum < PRINT_STRIDE) return;
    w.accum -= PRINT_STRIDE;
    const kind = PRINTS[this.surfaceAt(body.x, body.y - 1)];
    if (!kind) return;
    const nx = dx / dist, ny = dy / dist;
    w.side = w.side === 1 ? -1 : 1;
    const p = this.prints[this.nextPrint++ % PRINT_POOL];
    p.age = 0;
    p.life = kind.life;
    p.alpha = kind.alpha;
    p.sprite.tint = kind.tint;
    p.sprite.alpha = kind.alpha;
    p.sprite.scale.set(1);
    p.sprite.rotation = Math.atan2(nx, -ny); // the art's "up" points along the walk
    p.sprite.position.set(body.x - ny * PRINT_SIDE * w.side, body.y - 1 + nx * PRINT_SIDE * w.side);
    p.sprite.visible = true;
  }

  private fadePrints(dt: number) {
    for (const p of this.prints) {
      if (p.age < 0) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.age = -1;
        p.sprite.visible = false;
        continue;
      }
      p.sprite.alpha = p.alpha * (1 - t * t); // holds, then fades
      p.sprite.scale.set(1 + 0.3 * t); // and softens as the wind smooths it
    }
  }

  // --- Leaves ---

  private near(x0: number, y0: number, x1: number, y1: number): Set<MapObject> {
    const found = new Set<MapObject>();
    const c0 = Math.floor(x0 / CELL), c1 = Math.floor(x1 / CELL);
    const r0 = Math.floor(y0 / CELL), r1 = Math.floor(y1 / CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) for (const o of this.canopies.get(r * this.data.width + c) ?? []) found.add(o);
    }
    return found;
  }

  private ready(o: MapObject, cooldown: number): boolean {
    if ((this.cooldown.get(o) ?? 0) > this.clock) return false;
    this.cooldown.set(o, this.clock + cooldown);
    return true;
  }

  /** The hero is moving behind a canopy (drawn over them): the branches shake and drop leaves. */
  private rustle(hero: Character) {
    const w = this.walkers.get(hero);
    if (!w?.moving) return;
    const x0 = hero.x - 9, x1 = hero.x + 9, y0 = hero.y - 34, y1 = hero.y - 4;
    for (const o of this.near(x0, y0, x1, y1)) {
      const behind = o.py + o.h > hero.y; // sorted in front of the hero
      if (!behind || o.px > x1 || o.px + o.w < x0 || o.py > y1 || o.py + o.h < y0) continue;
      if (!this.ready(o, 0.5)) continue;
      const n = o.tag === 'tree' ? 4 : 2;
      for (let i = 0; i < n; i++) this.dropLeaf(o, hero.x + rand(-14, 14), hero.y + rand(-2, 8), rand(16, 38));
    }
  }

  private dropLeaf(o: MapObject, x: number, ground: number, height: number) {
    const sheet = this.data.sheets[o.s] ?? '';
    const palette = sheet.includes('frost') ? PALETTES.frost : sheet.includes('dry') ? PALETTES.dry : PALETTES.green;
    const l = this.leaves[this.nextLeaf++ % LEAF_POOL];
    l.alive = true;
    l.t = 0;
    l.x0 = x;
    l.ground = ground;
    l.h0 = height;
    l.fall = height / 26; // ~26 px/s: a slow drift
    l.life = l.fall + 0.9;
    l.phase = rand(0, Math.PI * 2);
    l.sway = rand(3, 8);
    l.sprite.tint = pick(palette);
    l.sprite.visible = true;
    l.sprite.zIndex = ground;
    this.placeLeaf(l);
  }

  private placeLeaf(l: Leaf) {
    const falling = Math.min(l.t, l.fall);
    const h = Math.max(0, l.h0 - 26 * falling);
    l.sprite.position.set(l.x0 + Math.sin(l.phase + falling * 4.5) * l.sway, l.ground - h);
    l.sprite.rotation = Math.sin(l.phase + falling * 3) * 0.9;
    l.sprite.scale.set(l.t < l.fall ? Math.cos(l.phase + l.t * 9) : 1, 1); // tumbles while falling, lies flat after
    l.sprite.alpha = Math.min(1, (l.life - l.t) / 0.5);
  }

  private fallLeaves(dt: number) {
    for (const l of this.leaves) {
      if (!l.alive) continue;
      l.t += dt;
      if (l.t >= l.life) {
        l.alive = false;
        l.sprite.visible = false;
        continue;
      }
      this.placeLeaf(l);
    }
  }
}
