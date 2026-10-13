import { DIRS, DIR_VEC, type Direction } from '../../core/direction';
import { arrowEffect, boltEffect, floatText, rayEffect, slashEffect } from '../../entities/effects';
import type { Mob } from '../../entities/Mob';
import { particleEffect } from '../../entities/ParticleEffect';
import { CELL } from '../../map/types';
import type { WorldEvent } from '../../net/protocol';
import type { ParticleEffectName } from '../../systems/particleEffects';
import type { Arena } from './Arena';
import { BOLT_HEIGHT, BOLT_RANGE, MELEE_REACH, RAY_LENGTH, RAY_SPEED } from './constants';

/**
 * Draws what happens in the world: sword arcs, bolts and arrows in flight, floating numbers, particle bursts, a player's
 * pose, lightning. Both the simulation (which decides what happens and also tells the friends) and a co-op guest (which
 * only draws what the host reports, `show`) go through here, so a slash looks the same wherever it is seen.
 *
 * Projectiles take an optional `onHit`/`onStep`: the host passes one to apply damage; the guest leaves it out and the
 * projectile is only for show (it still stops at walls). Everything draws into the zone the arena is working in.
 */
export class Visuals {
  constructor(private arena: Arena) {}

  /** A floating number or word. */
  text(x: number, y: number, text: string, color: number) {
    this.arena.effects.add(floatText(x, y, text, color));
  }

  /** A one-shot particle effect. `dir` is an angle in radians. */
  particles(name: ParticleEffectName, x: number, y: number, dir?: number) {
    this.arena.effects.add(particleEffect(name, x, y, { dir }));
  }

  /** A sword swing by a player standing at (x, y) facing `dir`: the arc, and leaves shaken from any canopy it reaches. */
  swing(x: number, y: number, dir: Direction) {
    const [vx, vy] = DIR_VEC[dir];
    this.arena.effects.add(slashEffect(x + vx * 6, y - 12 + vy * 6, dir));
    this.arena.zone.ambient?.shake(x + vx * 16, y + vy * 16 - 6, MELEE_REACH);
  }

  /** A player's bolt (wand, tome or spell) in flight. `onHit` applies the damage (the host). */
  bolt(x: number, y: number, vx: number, vy: number, onHit?: (mob: Mob) => void) {
    const { effects } = this.arena;
    const trail = particleEffect('boltTrail', x, y);
    effects.add(trail);
    effects.add(
      boltEffect(
        x,
        y,
        vx,
        vy,
        BOLT_RANGE,
        (bx, by) => {
          trail.moveTo(bx, by);
          return this.projectileStep(bx, by, onHit);
        },
        (bx, by, hit) => {
          trail.stop();
          if (hit) effects.add(particleEffect('boltImpact', bx, by));
        },
      ),
    );
  }

  /** A player's arrow in flight. `onHit` applies the damage (the host). */
  arrow(x: number, y: number, vx: number, vy: number, range: number, onHit?: (mob: Mob) => void) {
    this.arena.effects.add(arrowEffect(x, y, vx, vy, range, (ax, ay) => this.projectileStep(ax, ay, onHit)));
  }

  /**
   * An enemy projectile. `onStep` decides whether it hit a player (the host); without it the bolt is only for show
   * (the guest, which draws what the host reports). It always stops at walls.
   */
  foeBolt(x: number, y: number, vx: number, vy: number, color: number, onStep?: (x: number, y: number) => boolean) {
    const { effects, collision } = this.arena;
    effects.add(
      boltEffect(
        x,
        y,
        vx,
        vy,
        BOLT_RANGE,
        (bx, by) =>
          collision.isBlocked(Math.floor(bx / CELL), Math.floor((by + BOLT_HEIGHT) / CELL)) ||
          (onStep?.(bx, by) ?? false),
        (bx, by, hit) => hit && effects.add(particleEffect('hitSpark', bx, by)),
        color,
      ),
    );
  }

  /**
   * How far a ray fired from (x, y) (chest height, like a bolt) along the unit vector (ux, uy) reaches: its full length,
   * or up to the first wall. The host and a guest both ask, so they draw the same beam.
   */
  rayReach(x: number, y: number, ux: number, uy: number): number {
    const { collision } = this.arena;
    for (let d = 0; d < RAY_LENGTH; d += 8) {
      const [gx, gy] = [x + ux * d, y + BOLT_HEIGHT + uy * d];
      if (collision.isBlocked(Math.floor(gx / CELL), Math.floor(gy / CELL))) return d;
    }
    return RAY_LENGTH;
  }

  /** An enemy's ray, for show: the host decides who it burns (`Simulation.mobRay`). */
  foeRay(x: number, y: number, ux: number, uy: number, color: number) {
    const length = this.rayReach(x, y, ux, uy);
    this.arena.effects.add(rayEffect(x, y, ux, uy, length, color));
    const end = particleEffect('hitSpark', x + ux * length, y + uy * length);
    this.arena.effects.add(end);
  }

  /** Did a player's projectile at (x, y) run into a wall or an enemy? An enemy it hits is handed to `onHit`. */
  private projectileStep(x: number, y: number, onHit?: (mob: Mob) => void): boolean {
    const { collision, mobs } = this.arena;
    if (collision.isBlocked(Math.floor(x / CELL), Math.floor((y + BOLT_HEIGHT) / CELL))) return true;
    const mob = mobs.find((m) => m.alive && Math.abs(x - m.body.x) < 12 && Math.abs(y + BOLT_HEIGHT - m.body.y) < 16);
    if (!mob) return false;
    onHit?.(mob);
    return true;
  }

  /**
   * Show something the host reported (co-op guest). Nothing here is simulated: the host decides what a bolt hits and
   * who is hurt. A `defeat` is the caller's to answer (it says something to the player), so it is ignored here.
   */
  show(e: WorldEvent) {
    const { arena } = this;
    switch (e.type) {
      case 'lightning':
        arena.view.weatherLayer?.strike(e);
        break;
      case 'slash':
        this.swing(e.x, e.y, DIRS[e.dir] ?? 'down');
        arena.playerNumbered(e.p)?.body.play('slash');
        break;
      case 'draw':
        arena.playerNumbered(e.p)?.body.play('shoot');
        break;
      case 'arrow':
        this.arrow(e.x, e.y, e.vx, e.vy, e.range);
        break;
      case 'bolt':
        if (e.color === undefined) {
          this.bolt(e.x, e.y, e.vx, e.vy);
          arena.playerNumbered(e.p)?.body.play('cast');
        } else {
          const speed = Math.hypot(e.vx, e.vy);
          if (speed >= RAY_SPEED * 0.9)
            this.foeRay(e.x, e.y, e.vx / speed, e.vy / speed, e.color); // a mob's ray
          else this.foeBolt(e.x, e.y, e.vx, e.vy, e.color); // an enemy's shot: only drawn here, the host decides what it hits
        }
        break;
      case 'text':
        this.text(e.x, e.y, e.text, e.color);
        break;
      case 'fx':
        this.particles(e.name, e.x, e.y, e.dir);
        if (e.name === 'heroHurt') arena.playerNumbered(e.p)?.body.play('hurt');
        if (e.name === 'castGlow') arena.playerNumbered(e.p)?.body.play('cast'); // a combo went off
        break;
      case 'defeat':
        break;
    }
  }
}
