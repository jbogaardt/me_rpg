import { DIRS, DIR_VEC, type Direction } from '../../core/direction';
import { arrowEffect, boltEffect, floatText, slashEffect } from '../../entities/effects';
import type { Mob } from '../../entities/Mob';
import { particleEffect } from '../../entities/ParticleEffect';
import { CELL } from '../../map/types';
import type { WorldEvent } from '../../net/protocol';
import { playGame } from '../../hud/gameSfx';
import { soundForFx, soundForText } from '../../systems/gameSounds';
import { effectColor } from '../../systems/looks';
import { FX_SHAKE } from '../../systems/feel';
import type { ParticleEffectName } from '../../systems/particleEffects';
import type { Arena } from './Arena';
import { BOLT_HEIGHT, BOLT_RANGE, MELEE_REACH } from './constants';

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
    const sound = soundForText(text);
    if (sound) playGame(sound);
  }

  /** A one-shot particle effect. `dir` is an angle in radians. */
  particles(name: ParticleEffectName, x: number, y: number, dir?: number, p?: number) {
    this.arena.effects.add(particleEffect(name, x, y, { dir }));
    const sound = soundForFx(name);
    if (sound) playGame(sound);
    if (name === 'cheer') this.arena.playerNumbered(p)?.body.celebrate();
    if (name === 'fall') this.arena.playerNumbered(p)?.body.play('hurt');
    const shake = FX_SHAKE[name];
    if (shake && (!shake.own || p === this.arena.local.slot))
      this.arena.zone.camera.shake(shake.strength, shake.seconds);
  }

  /** A sword swing by a player standing at (x, y) facing `dir`: the arc, and leaves shaken from any canopy it reaches. */
  swing(x: number, y: number, dir: Direction, p?: number) {
    const [vx, vy] = DIR_VEC[dir];
    playGame('swing');
    this.arena.effects.add(slashEffect(x + vx * 6, y - 12 + vy * 6, dir, effectColor(p)));
    this.arena.zone.ambient?.shake(x + vx * 16, y + vy * 16 - 6, MELEE_REACH);
  }

  /** A player's bolt (wand, tome or spell) in flight. `onHit` applies the damage (the host). */
  bolt(x: number, y: number, vx: number, vy: number, onHit?: (mob: Mob) => void, p?: number) {
    const { effects } = this.arena;
    playGame('bolt');
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
          if (hit) {
            effects.add(particleEffect('boltImpact', bx, by));
            playGame('boltHit');
          }
        },
        effectColor(p),
      ),
    );
  }

  /** A player's arrow in flight. `onHit` applies the damage (the host). */
  arrow(x: number, y: number, vx: number, vy: number, range: number, onHit?: (mob: Mob) => void, p?: number) {
    playGame('arrow');
    this.arena.effects.add(
      arrowEffect(
        x,
        y,
        vx,
        vy,
        range,
        (ax, ay) => this.projectileStep(ax, ay, onHit),
        undefined,
        p === undefined ? undefined : effectColor(p),
      ),
    );
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
        (bx, by, hit) => {
          if (!hit) return;
          effects.add(particleEffect('hitSpark', bx, by));
          playGame('clack'); // a shot against a hero's gear or a wall: the hard sound, not the flesh one
        },
        color,
      ),
    );
  }

  /** Did a player's projectile at (x, y) run into a wall or an enemy? An enemy it hits is handed to `onHit`. */
  private projectileStep(x: number, y: number, onHit?: (mob: Mob) => void): boolean {
    const { collision, mobs } = this.arena;
    if (collision.isBlocked(Math.floor(x / CELL), Math.floor((y + BOLT_HEIGHT) / CELL))) return true;
    const mob = mobs.find(
      (m) =>
        m.alive && Math.abs(x - m.body.x) < 12 * m.body.size && Math.abs(y + BOLT_HEIGHT - m.body.y) < 16 * m.body.size,
    );
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
        this.swing(e.x, e.y, DIRS[e.dir] ?? 'down', e.p);
        arena.playerNumbered(e.p)?.body.play('slash');
        break;
      case 'draw':
        arena.playerNumbered(e.p)?.body.play('shoot');
        break;
      case 'arrow':
        this.arrow(e.x, e.y, e.vx, e.vy, e.range, undefined, e.p);
        break;
      case 'bolt':
        if (e.color === undefined) {
          this.bolt(e.x, e.y, e.vx, e.vy, undefined, e.p);
          arena.playerNumbered(e.p)?.body.play('cast');
        } else {
          this.foeBolt(e.x, e.y, e.vx, e.vy, e.color); // an enemy's shot: only drawn here, the host decides what it hits
        }
        break;
      case 'text':
        this.text(e.x, e.y, e.text, e.color);
        break;
      case 'fx':
        this.particles(e.name, e.x, e.y, e.dir, e.p);
        if (e.name === 'heroHurt') arena.playerNumbered(e.p)?.body.play('hurt');
        if (e.name === 'castGlow') arena.playerNumbered(e.p)?.body.play('cast'); // a combo went off
        break;
      case 'defeat':
        break;
    }
  }
}
