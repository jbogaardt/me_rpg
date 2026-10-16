import { Graphics, type Texture } from 'pixi.js';
import { CELL } from '../map/types';
import { DIR_VEC, directionToward, type Direction } from '../core/direction';
import { glide } from '../core/interp';
import { mobTimings, type MobKind, type MobState, type MobView } from '../systems/combat';
import { Character } from './Character';

/** What a mob needs from the game each tick. */
export interface MobWorld {
  /** Every hero a mob might go after (one, or two in co-op); it picks the nearest. */
  /** The players in the mob's zone: none while it is only being looked at from the next zone over (it just wanders). */
  heroes: readonly Character[];
  /** Move a body by (mx, my) with collision, one axis at a time. Returns true if it moved at all. */
  slide(body: Character, mx: number, my: number): boolean;
  /** The mob's melee attack connected with `target`. */
  strike(mob: Mob, target: Character): void;
  /** A ranged mob fires along the unit vector (ux, uy); the scene flies the projectile and decides what it hits. */
  shoot(mob: Mob, ux: number, uy: number): void;
  /** One burn of a held ray on `target`. Returns false when the beam cannot reach them (a wall): it then ends. */
  ray(mob: Mob, target: Character): boolean;
}

/** What a mob does to a hero `dist` px away: melee when close, otherwise its ray or shot if it has one in range. */
export type MobAttack = 'melee' | 'shot' | 'ray';

export function mobAttack(kind: MobKind, dist: number, rayReady = true): MobAttack | null {
  if (kind.shot) return dist <= kind.shot.range ? 'shot' : null;
  if (dist < REACH * (kind.scale ?? 1)) return 'melee';
  if (kind.ray && rayReady && dist <= kind.ray.range) return 'ray';
  return null;
}

type State = MobState;

/**
 * A melee mob starts its windup from this close (feet to feet). It is more than the sword's own reach (its hit circle
 * ends about 38 px ahead of the hero), so a hero close enough to land a blow is close enough to be swung at.
 */
export const REACH = 32;
/** The held pose of a ray caster: the sceptre thrust out (`slash` frame 3), and where its head is from the feet (left; mirrored for right). */
const RAY_POSE = { anim: 'slash', col: 3, headX: 21, headY: -30 } as const;
// Windup (telegraph before the blow lands, so the hero can dodge), recover and stagger (the pause after being hit,
// which interrupts a windup) are per kind: see `mobTimings` in systems/combat.ts.
// The blow: as the windup ends the mob lunges along the way it was aiming (it tracks the hero only until the windup is
// COMMITTED, then the aim is locked) and hits whoever is in front of it during the lunge. Stepping straight back has to
// beat the windup and the lunge together; stepping aside once the aim is locked is the clean dodge.
const LUNGE = 0.12; // seconds the lunge takes
/** How far a kind lunges: quick kinds leap further, the slow ones barely step in. */
export const lungeOf = (kind: MobKind) => Math.min(34, Math.max(14, kind.speed * 0.35)) * (kind.scale ?? 1);
const HIT_AHEAD = 10; // the blow's hit circle is centred this far in front of the mob (times its scale)...
const HIT_RADIUS = 22; // ...with this radius (times its scale)
const CONTACT = 14; // the lunge stops this close to the hero (times its scale)
const WINDUP_SPREAD = 0.2; // each windup is ±20% of the kind's, so the rhythm cannot be learned by heart
const WHIFF_RECOVER = 0.4; // a blow that misses leaves it busy only this share of its recover before it presses in
const MEND = 0.25; // share of its max HP a mob mends per second once it has lost the hero (no chip-and-run)
// Stagger rules, so a hero cannot juggle a mob forever: after one stagger the mob shrugs off the next hits for POISE
// seconds (the damage still lands, it is only pushed a little), and once COMMITTED of its windup has passed the blow
// cannot be interrupted. It always gets to swing back.
const POISE = 0.9;
const COMMITTED = 0.5;
const SHOVE = 40; // knockback speed (px/s) while it is not staggered; a staggering hit pushes 180
const KEEP_AWAY = 0.4; // a shooter backs off when the hero is closer than this fraction of its range
const RESPAWN = 60; // an adventure, not a grind: a foe that falls stays down for a minute
const FADE = 0.4;
const LEASH = 4 * CELL; // wanders no further than this from home

const sideToward = (dx: number): Direction => (dx < 0 ? 'left' : 'right');

function nearest(from: Character, heroes: MobWorld['heroes']): Character | undefined {
  let best: Character | undefined;
  let bestDist = Infinity;
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
/** What the Dungeon Master asks of a mob they hold (see `Mob.setDrive`). */
export interface Drive {
  dx: number;
  dy: number;
  /** Strike now (a press). */
  attack: boolean;
  /** Which way to strike (unit vector) when they aim with the mouse; absent: the way it last walked. */
  aim?: { x: number; y: number };
}

export class Mob {
  readonly body: Character;
  hp: number;
  private state: State = 'idle';
  private timer = 0;
  private dir = { x: 0, y: 0 };
  private knock = { x: 0, y: 0 };
  private flash = 0;
  private poise = 0; // seconds left in which a hit cannot stagger it again
  private moving = false;
  private attack: MobAttack = 'melee'; // what the current windup leads to
  private windupLen = 0; // this windup's length (the kind's, give or take WINDUP_SPREAD)
  private aim = { x: 1, y: 0 }; // where the blow will land: follows the hero until the windup is committed
  private lunging = 0; // seconds of lunge left
  private swing = false; // the lunge has not hit anyone yet
  private rayTimer = 0; // seconds until the next burn of a held ray
  private rayRest = 0; // seconds before it may cast another ray (after a break)
  private beam = new Graphics(); // the held ray, drawn from the sceptre to the hero (every client draws its own)
  private heroes: MobWorld['heroes'] = []; // guest: who the beam can be on
  private remote: { x: number; y: number } | null = null; // guest only: where the host says this mob is
  private bar = new Graphics();
  private readonly t: ReturnType<typeof mobTimings>;

  constructor(
    readonly kind: MobKind,
    sheet: Texture,
    private homeX: number,
    private homeY: number,
  ) {
    this.t = mobTimings(kind);
    this.body = new Character(sheet);
    this.body.setScale(kind.scale ?? 1);
    this.body.addChild(this.bar, this.beam);
    this.hp = kind.maxHp;
    this.reset();
  }

  /** Comes back after a while when defeated. A training ground's enemies do not (the trial is over when they are all down). */
  respawns = true;

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
    this.frozen = 0;
    this.beckoned = null;
    this.driver = null;
    this.rayRest = 0;
    this.beam.clear();
    this.body.release();
    this.knock = { x: 0, y: 0 };
    this.poise = 0;
    this.lunging = 0;
    this.swing = false;
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
    this.beam.clear();
    this.body.release();
    this.body.setOffset(0, 0);
    this.body.setTint(0xffffff);
  }

  /** Take a hit pushing along (vx, vy). Returns true if it was fatal. */
  hit(damage: number, vx: number, vy: number): boolean {
    this.hp = Math.max(0, this.hp - damage);
    this.flash = 0.15;
    this.drawBar();
    if (this.hp <= 0) {
      this.lunging = 0;
      this.beam.clear();
      this.body.release();
      this.knock = { x: vx * 180, y: vy * 180 };
      this.body.play('hurt', this.t.stagger * 1000);
      this.state = 'dead';
      this.timer = RESPAWN;
      return true;
    }
    if (this.state === 'channel') {
      this.breakRay(); // any blow breaks the beam, however poised: it is stunned and then only fights up close
    }
    const committed = this.state === 'windup' && this.timer < this.windupLen * COMMITTED;
    if (this.poise > 0 || committed) {
      this.knock = { x: vx * SHOVE, y: vy * SHOVE }; // hurt, but not stopped
      return false;
    }
    this.knock = { x: vx * 180, y: vy * 180 };
    this.body.play('hurt', this.t.stagger * 1000);
    this.state = 'recover';
    this.lunging = 0; // a staggering hit stops a lunge; the blow (if it has not landed) is lost
    this.swing = false;
    this.timer = this.t.stagger;
    this.poise = this.t.stagger + POISE;
    return false;
  }

  /** The held ray ends (it ran out, was broken by a hit, or lost its target): a short rest, then it fights up close. */
  private breakRay() {
    if (this.state !== 'channel') return;
    this.state = 'recover';
    this.timer = this.t.recover;
    this.rayRest = this.kind.ray?.rest ?? 0;
    this.beam.clear();
    this.body.release();
  }

  /** Held still by a spell (Stasis) for this many seconds: it neither moves nor attacks (host and solo; a guest just sees it stand). */
  private frozen = 0;

  /** Called away to a spot by the Dungeon Master (a defended ground): an idle foe walks there until it sees a hero. */
  private beckoned: { x: number; y: number; left: number } | null = null;

  beckon(x: number, y: number, seconds: number) {
    if (this.state !== 'dead') this.beckoned = { x, y, left: seconds };
  }

  /**
   * The Dungeon Master is driving this mob (possession): where to walk, whether to strike, and which way to aim. Set every
   * frame by the host while they hold it; null and the mob's own mind takes over again where it stands.
   */
  private driver: Drive | null = null;
  private lastAim = { x: 0, y: 1 };

  setDrive(drive: Drive | null) {
    this.driver = drive;
  }

  get driven(): boolean {
    return this.driver !== null;
  }

  /** One frame of being driven: walk, or begin a blow (a shot for a shooter, a lunge for the rest). True if it moved. */
  private drive(d: Drive, dt: number, world: MobWorld): boolean {
    const len = Math.hypot(d.dx, d.dy);
    if (len > 0) this.lastAim = { x: d.dx / len, y: d.dy / len };
    if (d.attack) {
      const aim = d.aim ?? this.lastAim;
      this.state = 'windup';
      this.attack = this.kind.shot ? 'shot' : 'melee'; // a ray kind fights close when driven
      this.windupLen = this.t.windup;
      this.timer = this.windupLen;
      this.aim = { x: aim.x, y: aim.y };
      this.body.face(directionToward(aim.x, aim.y));
      this.body.play(this.attack === 'shot' ? 'cast' : 'slash', this.windupLen * 1000);
      return false;
    }
    return len > 0 ? this.walk(d.dx / len, d.dy / len, this.kind.speed * dt, world) : false;
  }

  /** Freeze the mob in place for `seconds` (a longer freeze already on it wins). */
  freeze(seconds: number) {
    if (this.state === 'dead') return;
    this.frozen = Math.max(this.frozen, seconds);
    this.knock = { x: 0, y: 0 };
  }

  update(dt: number, world: MobWorld) {
    if (this.state !== 'dead' && this.frozen > 0) {
      this.frozen = Math.max(0, this.frozen - dt);
      this.flash = Math.max(0, this.flash - dt);
      this.moving = false;
      this.present(dt, false);
      return;
    }
    if (this.state === 'dead') {
      this.timer = Math.max(0, this.timer - dt);
      this.fade();
      if (this.timer <= 0 && this.respawns) this.reset();
      return;
    }

    this.flash = Math.max(0, this.flash - dt);
    this.poise = Math.max(0, this.poise - dt);
    this.rayRest = Math.max(0, this.rayRest - dt);
    if (this.knock.x || this.knock.y) {
      world.slide(this.body, this.knock.x * dt, this.knock.y * dt);
      const decay = Math.exp(-12 * dt);
      this.knock.x *= decay;
      this.knock.y *= decay;
      if (Math.hypot(this.knock.x, this.knock.y) < 5) this.knock = { x: 0, y: 0 };
    }

    this.heroes = world.heroes;
    const target = nearest(this.body, world.heroes);
    const dx = target ? target.x - this.body.x : 0;
    const dy = target ? target.y - this.body.y : 0;
    const dist = target ? Math.hypot(dx, dy) : Infinity; // nobody here: nothing to chase
    let moving = false;
    this.timer -= dt;
    if (this.driver && (this.state === 'idle' || this.state === 'wander')) this.state = 'chase';
    switch (this.state) {
      case 'idle':
      case 'wander':
        if (dist < this.kind.sight) {
          this.state = 'chase';
          break;
        }
        if (this.hp < this.kind.maxHp) {
          this.hp = Math.min(this.kind.maxHp, this.hp + this.kind.maxHp * MEND * dt);
          this.drawBar();
        }
        if (this.beckoned) {
          const b = this.beckoned;
          const [bx, by] = [b.x - this.body.x, b.y - this.body.y];
          const far = Math.hypot(bx, by);
          b.left -= dt;
          if (b.left <= 0 || far < 64) this.beckoned = null;
          else {
            moving = this.walk(bx / far, by / far, this.kind.speed * 0.7 * dt, world);
            break; // on its way: it does not wander off
          }
        }
        if (this.state === 'wander') moving = this.walk(this.dir.x, this.dir.y, this.kind.speed * 0.5 * dt, world);
        if (this.timer <= 0) this.pickWander();
        break;
      case 'chase': {
        if (this.driver) {
          moving = this.drive(this.driver, dt, world);
          break;
        }
        const { shot } = this.kind;
        const attack = mobAttack(this.kind, dist, this.rayRest <= 0);
        if (dist > this.kind.sight * 1.5) {
          this.state = 'idle';
          this.timer = 1;
        } else if (attack) {
          // A shooter first backs away if the hero is on top of it (unless it is cornered, then it just shoots).
          if (
            shot &&
            dist < shot.range * KEEP_AWAY &&
            this.walk(-dx / dist, -dy / dist, this.kind.speed * 0.8 * dt, world)
          ) {
            this.body.face(directionToward(dx, dy));
            moving = true;
            break;
          }
          this.state = 'windup';
          this.windupLen = this.t.windup * (1 + WINDUP_SPREAD * (Math.random() * 2 - 1));
          this.timer = this.windupLen;
          this.attack = attack;
          this.aim = { x: dx / (dist || 1), y: dy / (dist || 1) };
          this.body.face(attack === 'ray' ? sideToward(dx) : directionToward(dx, dy)); // the sceptre is only drawn left or right
          this.body.play(attack === 'shot' ? 'cast' : 'slash', this.windupLen * 1000); // the pose is the telegraph; the blow lands as it ends
        } else {
          moving = this.walk(dx / dist, dy / dist, this.kind.speed * dt, world);
        }
        break;
      }
      case 'windup':
        if (this.attack === 'melee' && target && !this.driver && this.timer > this.windupLen * COMMITTED) {
          this.aim = { x: dx / (dist || 1), y: dy / (dist || 1) }; // still turning to follow; locked once committed
          this.body.face(directionToward(dx, dy));
        }
        if (this.timer <= 0) {
          if (this.attack === 'shot')
            world.shoot(this, this.driver ? this.aim.x : dx / (dist || 1), this.driver ? this.aim.y : dy / (dist || 1)); // aimed as it lets go
          else if (this.attack === 'ray' && this.kind.ray) {
            this.state = 'channel'; // hold the beam on the hero until it runs out or something breaks it
            this.body.hold(RAY_POSE.anim, RAY_POSE.col);
            this.timer = this.kind.ray.duration;
            this.rayTimer = this.kind.ray.tick * 0.5;
            break;
          } else {
            this.lunging = LUNGE;
            this.swing = true;
          }
          this.state = 'recover';
          this.timer = this.t.recover;
        }
        break;
      case 'channel': {
        const { ray } = this.kind;
        // It ends when it runs out, the hero gets away (or is gone), or a wall comes between them.
        let held = !!ray && !!target && dist <= ray.range * 1.4 && this.timer > 0;
        if (held && target) {
          this.body.face(sideToward(dx));
          this.rayTimer -= dt;
          if (this.rayTimer <= 0 && ray) {
            this.rayTimer += ray.tick;
            held = world.ray(this, target);
          }
        }
        if (!held) this.breakRay();
        break;
      }
      case 'recover':
        if (this.lunging > 0) this.lunge(dt, world, target);
        if (this.timer <= 0) this.state = 'chase';
        break;
    }

    this.moving = moving;
    this.present(dt, moving);
  }

  // --- Co-op ---

  /** This mob as a viewer sees it (a co-op host sends it to the guests, see net/mobWire.ts). */
  view(): MobView {
    return {
      x: this.body.x,
      y: this.body.y,
      facing: this.body.facing,
      state: this.state,
      hp: this.hp,
      timer: this.timer,
      moving: this.moving,
    };
  }

  /** Guest: take the host's latest word on this mob. The body glides there over the next frames (updateRemote). */
  setRemote({ x, y, facing, state: next, hp, timer, moving }: MobView, heroes: MobWorld['heroes'] = []) {
    this.heroes = heroes;
    const respawned = this.state === 'dead' && next !== 'dead';
    if (hp < this.hp) {
      this.flash = 0.15;
      if (hp > 0 && next !== 'windup') this.body.play('hurt', this.t.stagger * 1000); // a mob mid-windup was not stopped
    }
    if (next === 'windup' && this.state !== 'windup') {
      const near = nearest(this.body, heroes);
      const dist = near ? Math.hypot(near.x - this.body.x, near.y - this.body.y) : Infinity;
      this.attack = mobAttack(this.kind, dist) ?? (this.kind.shot ? 'shot' : this.kind.ray ? 'ray' : 'melee');
      this.body.play(this.attack === 'shot' ? 'cast' : 'slash', this.t.windup * 1000); // the pose is the telegraph
    }
    if (hp !== this.hp) {
      this.hp = hp;
      this.drawBar();
    }
    if (next === 'channel' && this.state !== 'channel') this.body.hold(RAY_POSE.anim, RAY_POSE.col);
    else if (next !== 'channel' && this.state === 'channel') this.body.release();
    this.state = next;
    this.timer = timer;
    this.moving = moving;
    this.body.face(facing);
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
    if (this.state === 'windup')
      this.body.setOffset(-fx * 3, -fy * 3); // draws back before the lunge
    else this.body.setOffset(0, 0);
    const blink = this.state === 'windup' && Math.floor(this.timer * 16) % 2 === 0;
    this.drawBeam();
    this.body.setTint(this.flash > 0 ? 0xff6060 : this.frozen > 0 ? 0xa8d8ff : blink ? 0xffe080 : 0xffffff);
    this.body.animate(dt * 1000, moving);
  }

  /** The held ray: a pink beam from the sceptre to the hero's chest, on every client (a guest picks the nearest hero). */
  private drawBeam() {
    this.beam.clear();
    if (this.state !== 'channel' || this.frozen > 0) return;
    const target = nearest(this.body, this.heroes);
    if (!target) return;
    const { color } = this.kind.ray ?? { color: 0xff5fc8 };
    const side = this.body.facing === 'left' ? -1 : 1;
    const [sx, sy] = [side * RAY_POSE.headX, RAY_POSE.headY]; // the sceptre's head in the held pose, relative to the feet
    const [ex, ey] = [target.x - this.body.x, target.y - this.body.y - 14];
    const flicker = 0.85 + 0.15 * Math.sin(performance.now() / 40);
    this.beam
      .moveTo(sx, sy)
      .lineTo(ex, ey)
      .stroke({ width: 9, color, alpha: 0.25 * flicker, cap: 'round' })
      .moveTo(sx, sy)
      .lineTo(ex, ey)
      .stroke({ width: 4, color, alpha: 0.75 * flicker, cap: 'round' })
      .moveTo(sx, sy)
      .lineTo(ex, ey)
      .stroke({ width: 1.5, color: 0xffffff, alpha: flicker, cap: 'round' })
      .circle(sx, sy, 9)
      .fill({ color, alpha: 0.3 * flicker })
      .circle(sx, sy, 5)
      .fill({ color, alpha: 0.8 })
      .circle(sx, sy, 2.2)
      .fill({ color: 0xffffff, alpha: flicker })
      .circle(ex, ey, 5)
      .fill({ color, alpha: 0.5 });
  }

  /** Fade out while dead; it comes back (reset) when the timer runs out. */
  private fade() {
    this.body.alpha = Math.max(0, (this.timer - (RESPAWN - FADE)) / FADE);
    this.body.visible = this.body.alpha > 0;
  }

  /** One frame of the lunge: dash along the locked aim and strike the first hero in front of it; a miss is punished less. */
  private lunge(dt: number, world: MobWorld, target: Character | undefined) {
    const scale = this.kind.scale ?? 1;
    const step = Math.min(dt, this.lunging);
    this.lunging -= step;
    const close = target && Math.hypot(target.x - this.body.x, target.y - this.body.y) < CONTACT * scale;
    if (!close)
      world.slide(
        this.body,
        this.aim.x * (lungeOf(this.kind) / LUNGE) * step,
        this.aim.y * (lungeOf(this.kind) / LUNGE) * step,
      );
    if (this.swing) {
      const cx = this.body.x + this.aim.x * HIT_AHEAD * scale;
      const cy = this.body.y + this.aim.y * HIT_AHEAD * scale;
      const hit = world.heroes.find((h) => Math.hypot(h.x - cx, h.y - cy) < HIT_RADIUS * scale);
      if (hit) {
        this.swing = false;
        world.strike(this, hit);
      }
    }
    if (this.lunging <= 0 && this.swing) {
      this.swing = false; // it missed: it is barely winded, and comes straight back
      this.timer = Math.min(this.timer, this.t.recover * WHIFF_RECOVER);
    }
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
    const top = -56 * (this.kind.scale ?? 1);
    this.bar
      .rect(-w / 2 - 1, top, w + 2, 4)
      .fill(0x000000)
      .rect(-w / 2, top + 1, (w * this.hp) / this.kind.maxHp, 2)
      .fill(0xe7682f);
  }
}
