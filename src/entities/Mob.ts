import { Graphics, type Texture } from 'pixi.js';
import { CELL } from '../map/types';
import { Character, DIR_VEC, directionToward } from './Character';
import type { MobKind } from '../systems/combat';

/** What a mob needs from the game each tick. */
export interface MobWorld {
  hero: Character;
  /** Move a body by (mx, my) with collision, one axis at a time. Returns true if it moved at all. */
  slide(body: Character, mx: number, my: number): boolean;
  /** The mob's attack connected with the hero. */
  strike(mob: Mob): void;
}

type State = 'idle' | 'wander' | 'chase' | 'windup' | 'recover' | 'dead';

const REACH = 20; // starts an attack when this close (feet to feet)
const WINDUP = 0.45; // seconds of telegraph before the hit lands, so the hero can dodge
const RECOVER = 0.7;
const STAGGER = 0.3; // pause after being hit (interrupts a windup)
const LUNGE = 0.12;
const RESPAWN = 6;
const FADE = 0.4;
const LEASH = 4 * CELL; // wanders no further than this from home

/** A hostile character: wanders near home, chases the hero on sight, and attacks with a telegraphed lunge. */
export class Mob {
  readonly body: Character;
  hp: number;
  private state: State = 'idle';
  private timer = 0;
  private dir = { x: 0, y: 0 };
  private knock = { x: 0, y: 0 };
  private flash = 0;
  private bar = new Graphics();

  constructor(
    readonly kind: MobKind,
    sheet: Texture,
    private homeX: number,
    private homeY: number,
  ) {
    this.body = new Character(sheet);
    this.body.addChild(this.bar);
    this.hp = kind.maxHp;
    this.reset();
  }

  get alive() {
    return this.state !== 'dead';
  }

  /** Back home at full health. */
  reset() {
    this.body.position.set(this.homeX, this.homeY);
    this.body.visible = true;
    this.body.alpha = 1;
    this.hp = this.kind.maxHp;
    this.state = 'idle';
    this.timer = 1;
    this.knock = { x: 0, y: 0 };
    this.drawBar();
  }

  /** Take a hit pushing along (vx, vy). Returns true if it was fatal. */
  hit(damage: number, vx: number, vy: number): boolean {
    this.hp = Math.max(0, this.hp - damage);
    this.knock = { x: vx * 180, y: vy * 180 };
    this.flash = 0.15;
    this.drawBar();
    if (this.hp <= 0) {
      this.state = 'dead';
      this.timer = RESPAWN;
      return true;
    }
    this.state = 'recover';
    this.timer = STAGGER;
    return false;
  }

  update(dt: number, world: MobWorld) {
    if (this.state === 'dead') {
      this.timer -= dt;
      this.body.alpha = Math.max(0, (this.timer - (RESPAWN - FADE)) / FADE);
      this.body.visible = this.body.alpha > 0;
      if (this.timer <= 0) this.reset();
      return;
    }

    this.flash = Math.max(0, this.flash - dt);
    if (this.knock.x || this.knock.y) {
      world.slide(this.body, this.knock.x * dt, this.knock.y * dt);
      const decay = Math.exp(-12 * dt);
      this.knock.x *= decay;
      this.knock.y *= decay;
      if (Math.hypot(this.knock.x, this.knock.y) < 5) this.knock = { x: 0, y: 0 };
    }

    const dx = world.hero.x - this.body.x;
    const dy = world.hero.y - this.body.y;
    const dist = Math.hypot(dx, dy);
    let moving = false;
    this.timer -= dt;
    switch (this.state) {
      case 'idle':
      case 'wander':
        if (dist < this.kind.sight) {
          this.state = 'chase';
          break;
        }
        if (this.state === 'wander') moving = this.walk(this.dir.x, this.dir.y, this.kind.speed * 0.5 * dt, world);
        if (this.timer <= 0) this.pickWander();
        break;
      case 'chase':
        if (dist > this.kind.sight * 1.5) {
          this.state = 'idle';
          this.timer = 1;
        } else if (dist < REACH) {
          this.state = 'windup';
          this.timer = WINDUP;
          this.body.face(directionToward(dx, dy));
        } else {
          moving = this.walk(dx / dist, dy / dist, this.kind.speed * dt, world);
        }
        break;
      case 'windup':
        if (this.timer <= 0) {
          if (dist < REACH + 8) world.strike(this);
          this.state = 'recover';
          this.timer = RECOVER;
        }
        break;
      case 'recover':
        if (this.timer <= 0) this.state = 'chase';
        break;
    }

    // Telegraph: blink yellow and draw back during the windup, then lunge forward as it strikes.
    const [fx, fy] = DIR_VEC[this.body.facing];
    const lunging = this.state === 'recover' && this.timer > RECOVER - LUNGE;
    if (this.state === 'windup') this.body.setOffset(-fx * 2, -fy * 2);
    else if (lunging) this.body.setOffset(fx * 5, fy * 5);
    else this.body.setOffset(0, 0);
    const blink = this.state === 'windup' && Math.floor(this.timer * 16) % 2 === 0;
    this.body.setTint(this.flash > 0 ? 0xff6060 : blink ? 0xffe080 : 0xffffff);
    this.body.animate(dt * 1000, moving);
  }

  private walk(ux: number, uy: number, step: number, world: MobWorld): boolean {
    this.body.face(directionToward(ux, uy));
    return world.slide(this.body, ux * step, uy * step);
  }

  private pickWander() {
    const hx = this.homeX - this.body.x;
    const hy = this.homeY - this.body.y;
    const away = Math.hypot(hx, hy);
    this.timer = 1 + Math.random();
    if (away > LEASH) {
      this.state = 'wander';
      this.dir = { x: hx / away, y: hy / away };
    } else if (Math.random() < 0.5) {
      this.state = 'idle';
    } else {
      const a = Math.random() * Math.PI * 2;
      this.state = 'wander';
      this.dir = { x: Math.cos(a), y: Math.sin(a) };
    }
  }

  /** Small health bar over the head, shown only once damaged. */
  private drawBar() {
    this.bar.clear();
    if (this.hp >= this.kind.maxHp || this.hp <= 0) return;
    const w = 20;
    this.bar
      .rect(-w / 2 - 1, -43, w + 2, 4)
      .fill(0x000000)
      .rect(-w / 2, -42, (w * this.hp) / this.kind.maxHp, 2)
      .fill(0xe7682f);
  }
}
