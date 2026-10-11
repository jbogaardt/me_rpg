import { Graphics, type Texture } from 'pixi.js';
import { CELL } from '../map/types';
import { glide } from '../net/interp';
import { DIRS, dirIndex, round1, type MobSnap } from '../net/protocol';
import { MOB_STATES, type MobKind, type MobState } from '../systems/combat';
import { Character, DIR_VEC, directionToward } from './Character';

/** What a mob needs from the game each tick. */
export interface MobWorld {
  /** Every hero a mob might go after (one, or two in co-op); it picks the nearest. */
  heroes: readonly [Character, ...Character[]];
  /** Move a body by (mx, my) with collision, one axis at a time. Returns true if it moved at all. */
  slide(body: Character, mx: number, my: number): boolean;
  /** The mob's attack connected with `target`. */
  strike(mob: Mob, target: Character): void;
}

type State = MobState;

const REACH = 20; // starts an attack when this close (feet to feet)
const WINDUP = 0.45; // seconds of telegraph before the hit lands, so the hero can dodge
const RECOVER = 0.7;
const STAGGER = 0.3; // pause after being hit (interrupts a windup)
const LUNGE = 0.12;
const RESPAWN = 6;
const FADE = 0.4;
const LEASH = 4 * CELL; // wanders no further than this from home

function nearest(from: Character, heroes: MobWorld['heroes']): Character {
  let best = heroes[0];
  let bestDist = Math.hypot(best.x - from.x, best.y - from.y);
  for (const hero of heroes) {
    const dist = Math.hypot(hero.x - from.x, hero.y - from.y);
    if (dist < bestDist) [best, bestDist] = [hero, dist];
  }
  return best;
}

/**
 * A hostile character: wanders near home, chases the nearest hero on sight, and attacks with a telegraphed lunge.
 * In a co-op game the guest's copy of a mob doesn't think: `setRemote` feeds it the host's state and
 * `updateRemote` just draws it.
 */
export class Mob {
  readonly body: Character;
  hp: number;
  private state: State = 'idle';
  private timer = 0;
  private dir = { x: 0, y: 0 };
  private knock = { x: 0, y: 0 };
  private flash = 0;
  private moving = false;
  private remote: { x: number; y: number } | null = null; // guest only: where the host says this mob is
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

  /** Stop following the host and carry on on its own from where it stands (a dead mob goes home). */
  release() {
    this.remote = null;
    if (this.state === 'dead') {
      this.reset();
      return;
    }
    this.state = 'idle';
    this.timer = 1;
    this.flash = 0;
    this.body.setOffset(0, 0);
    this.body.setTint(0xffffff);
  }

  /** Take a hit pushing along (vx, vy). Returns true if it was fatal. */
  hit(damage: number, vx: number, vy: number): boolean {
    this.hp = Math.max(0, this.hp - damage);
    this.knock = { x: vx * 180, y: vy * 180 };
    this.flash = 0.15;
    this.body.play('hurt', STAGGER * 1000);
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
      this.fade();
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

    const target = nearest(this.body, world.heroes);
    const dx = target.x - this.body.x;
    const dy = target.y - this.body.y;
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
          this.body.play('slash', WINDUP * 1000); // the swing is the telegraph; the blow lands as it ends
        } else {
          moving = this.walk(dx / dist, dy / dist, this.kind.speed * dt, world);
        }
        break;
      case 'windup':
        if (this.timer <= 0) {
          if (dist < REACH + 8) world.strike(this, target);
          this.state = 'recover';
          this.timer = RECOVER;
        }
        break;
      case 'recover':
        if (this.timer <= 0) this.state = 'chase';
        break;
    }

    this.moving = moving;
    this.present(dt, moving);
  }

  // --- Co-op ---

  /** Host: this mob's state for a snapshot. */
  snapshot(): MobSnap {
    const { x, y } = this.body;
    const timer = Math.max(0, Math.round(this.timer * 1000));
    return [
      round1(x),
      round1(y),
      dirIndex(this.body.facing),
      MOB_STATES.indexOf(this.state),
      this.hp,
      timer,
      this.moving ? 1 : 0,
    ];
  }

  /** Guest: take the host's latest word on this mob. The body glides there over the next frames (updateRemote). */
  setRemote([x, y, dir, state, hp, timer, moving]: MobSnap) {
    const next = MOB_STATES[state] ?? 'idle';
    const respawned = this.state === 'dead' && next !== 'dead';
    if (hp < this.hp) {
      this.flash = 0.15;
      if (hp > 0) this.body.play('hurt', 300); // matches STAGGER
    }
    if (next === 'windup' && this.state !== 'windup') this.body.play('slash', WINDUP * 1000); // the swing is the telegraph
    if (hp !== this.hp) {
      this.hp = hp;
      this.drawBar();
    }
    this.state = next;
    this.timer = timer / 1000;
    this.moving = moving === 1;
    this.body.face(DIRS[dir] ?? 'down');
    if (!this.remote || respawned) {
      this.body.position.set(x, y);
      this.body.visible = true;
      this.body.alpha = 1;
    }
    this.remote = { x, y };
  }

  /** Guest: advance the drawn copy by `dt` seconds (no AI, no collision). */
  updateRemote(dt: number) {
    this.flash = Math.max(0, this.flash - dt);
    this.timer = Math.max(0, this.timer - dt); // keeps the windup blink and the fade-out smooth between snapshots
    if (this.state === 'dead') {
      this.fade();
      return;
    }
    if (this.remote) glide(this.body, this.remote.x, this.remote.y, dt);
    this.present(dt, this.moving);
  }

  /** Draw the state: the windup telegraph, the hit flash, the walk cycle. Shared by the host's AI and the guest's copy. */
  private present(dt: number, moving: boolean) {
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

  /** Fade out while dead; it comes back (reset) when the timer runs out. */
  private fade() {
    this.body.alpha = Math.max(0, (this.timer - (RESPAWN - FADE)) / FADE);
    this.body.visible = this.body.alpha > 0;
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
      .rect(-w / 2 - 1, -56, w + 2, 4)
      .fill(0x000000)
      .rect(-w / 2, -55, (w * this.hp) / this.kind.maxHp, 2)
      .fill(0xe7682f);
  }
}
