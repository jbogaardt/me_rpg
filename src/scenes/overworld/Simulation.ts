import { DIR_VEC, dirIndex } from '../../core/direction';
import type { Character } from '../../entities/Character';
import type { Mob, MobWorld } from '../../entities/Mob';
import type { Command, Player } from '../../entities/Player';
import { cellFeet } from '../../map/doors';
import { round1, type FxName, type WorldEvent } from '../../net/protocol';
import { attackPower, defensePower, gainXp, rollDamage, rollGold, spellPower, type Ranged } from '../../systems/combat';
import { isIce, stepVelocity } from '../../systems/ice';
import { SHOOT_RELEASE_MS } from '../../sprites/doll';
import type { Strike } from '../../entities/WeatherLayer';
import type { ZoneState } from '../ZoneState';
import type { Arena } from './Arena';
import {
  ATTACK_COOLDOWN,
  BOLT_HEIGHT,
  BOLT_SPEED,
  CAST_COOLDOWN,
  DEFEAT_LINES,
  HP_REGEN,
  HP_REGEN_DELAY,
  INVULN_TIME,
  LIGHTNING_DAMAGE,
  LIGHTNING_RADIUS,
  MELEE_REACH,
  MP_REGEN,
  SPEED,
} from './constants';
import type { Visuals } from './Visuals';
import type { Zones } from './Zones';

/**
 * The authoritative game rules for the people and mobs in the arena: moving, swinging, shooting, casting, taking damage
 * (from mobs and from lightning), winning XP and gold, being knocked out. It runs in solo and on a co-op host only; a guest
 * never simulates (it draws what the host reports, see Visuals.show). Everything that happens that a friend should also see
 * goes through `emit` (a no-op unless this game is a host) as well as being drawn here. Like everything in the overworld it
 * works in the arena's current zone (`Arena.inZone`).
 */
export class Simulation {
  constructor(
    private arena: Arena,
    private visuals: Visuals,
    private zones: Zones,
    /** Record something for the friends to see (only a host sends it anywhere). */
    private emit: (e: WorldEvent) => void,
    /** Say something to the player at this keyboard (a dialog). */
    private announce: (lines: string[]) => void,
  ) {}

  /** What a zone's mobs may ask of the world each tick. */
  mobWorldFor(z: ZoneState): MobWorld {
    const { arena } = this;
    return {
      heroes: z.heroBodies as unknown as MobWorld['heroes'],
      slide: (body, mx, my) =>
        z.collision.slide(
          body,
          mx,
          my,
          arena.inZone(z, () => arena.bodies()),
        ),
      strike: (mob, target) => arena.inZone(z, () => this.hurtHero(mob, target)),
      shoot: (mob, ux, uy) => arena.inZone(z, () => this.mobShoot(mob, ux, uy)),
    };
  }

  // --- Drawn here and also shown to the friends ---

  /** A floating number or word, also shown to the guest. */
  text(x: number, y: number, text: string, color: number) {
    this.visuals.text(x, y, text, color);
    this.emit({ type: 'text', x: round1(x), y: round1(y), text, color });
  }

  /** A one-shot particle effect, also shown to the guest. `dir` is an angle in radians; `p` the player it happened to. */
  fx(name: FxName, x: number, y: number, dir?: number, p?: number) {
    this.visuals.particles(name, x, y, dir);
    this.emit({
      type: 'fx',
      name,
      x: round1(x),
      y: round1(y),
      ...(dir === undefined ? {} : { dir: round1(dir) }),
      ...(p === undefined ? {} : { p }),
    });
  }

  // --- A player ---

  /** One tick for a player: cooldowns and regeneration, knockback, walking (or sliding on ice), and the poses. */
  updatePlayer(p: Player, cmd: Command, dt: number) {
    const s = p.hero.stats;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.castCooldown = Math.max(0, p.castCooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.sinceHit += dt;
    if (p.pendingShot && (p.pendingShot.timer -= dt) <= 0) this.release(p);
    s.mp = Math.min(s.maxMp, s.mp + MP_REGEN * dt);
    if (p.sinceHit > HP_REGEN_DELAY) s.hp = Math.min(s.maxHp, s.hp + HP_REGEN * dt);

    if (p.knock.x || p.knock.y) {
      this.arena.collision.slide(p.body, p.knock.x * dt, p.knock.y * dt, this.arena.bodies());
      const decay = Math.exp(-12 * dt);
      p.knock.x *= decay;
      p.knock.y *= decay;
      if (Math.hypot(p.knock.x, p.knock.y) < 5) p.knock = { x: 0, y: 0 };
    }

    p.moving = this.move(p, cmd, dt);
    // Lunge into a swing; blink while invulnerable.
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = this.isSwinging(p);
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.alpha = p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0 ? 0.35 : 1;
    p.body.animate(dt * 1000, p.moving);
  }

  /** Returns true if the player is trying to move. On ice the velocity lags behind the keys, so they slide. */
  private move(p: Player, { dx, dy }: Command, dt: number): boolean {
    const { collision, data } = this.arena;
    const len = Math.hypot(dx, dy);
    const wish = len ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
    if (len) {
      if (dx) p.body.face(dx > 0 ? 'right' : 'left');
      else p.body.face(dy > 0 ? 'down' : 'up');
      p.aim = wish;
    }
    p.vel = stepVelocity(p.vel, wish, SPEED, dt, isIce(data, p.body.x, p.body.y - 1));
    if (p.vel.x || p.vel.y) {
      const [x, y] = [p.body.x, p.body.y];
      collision.slide(p.body, p.vel.x * dt, p.vel.y * dt, this.arena.bodies());
      // Running into something stops the slide on that axis.
      if (p.body.x === x) p.vel.x = 0;
      if (p.body.y === y) p.vel.y = 0;
    }
    return len > 0;
  }

  /** In the first moments of a sword swing, which lunges the body forward (a bow does not). */
  isSwinging(p: Player): boolean {
    return !p.hero.weapon.ranged && p.attackCooldown > ATTACK_COOLDOWN - 0.1;
  }

  // --- Attacks ---

  /** The action button's attack: swing the sword, or start drawing the bow. */
  attack(p: Player) {
    if (p.attackCooldown > 0) return;
    const bow = p.hero.weapon.ranged;
    if (bow) {
      this.draw(p, bow);
      return;
    }
    p.attackCooldown = ATTACK_COOLDOWN;
    p.body.play('slash');
    const dir = p.body.facing;
    const [vx, vy] = DIR_VEC[dir];
    this.visuals.swing(p.body.x, p.body.y, dir);
    this.emit({ type: 'slash', x: round1(p.body.x), y: round1(p.body.y), dir: dirIndex(dir), p: p.slot });
    const cx = p.body.x + vx * 16;
    const cy = p.body.y + vy * 16;
    for (const mob of this.arena.mobs) {
      if (mob.alive && Math.hypot(mob.body.x - cx, mob.body.y - cy) < MELEE_REACH) {
        this.hitMob(mob, rollDamage(attackPower(p.hero), mob.kind.defense), vx, vy);
      }
    }
  }

  /** Start drawing a bow: the arrow flies when the string is let go (`release`), a moment into the animation. */
  private draw(p: Player, bow: Ranged) {
    if (p.pendingShot) return;
    p.attackCooldown = bow.cooldown;
    p.pendingShot = { timer: SHOOT_RELEASE_MS / 1000, bow, damage: attackPower(p.hero) };
    p.body.play('shoot');
    this.emit({ type: 'draw', x: round1(p.body.x), y: round1(p.body.y), p: p.slot });
  }

  /** The bow's string is let go: the arrow leaves along the player's aim, at chest height. */
  private release(p: Player) {
    const shot = p.pendingShot;
    p.pendingShot = null;
    if (!shot) return;
    const { x: ux, y: uy } = p.aim;
    const x = p.body.x + ux * 10;
    const y = p.body.y - BOLT_HEIGHT + uy * 8;
    const [vx, vy] = [ux * shot.bow.speed, uy * shot.bow.speed];
    this.visuals.arrow(x, y, vx, vy, shot.bow.range, (mob) => {
      this.hitMob(mob, rollDamage(shot.damage, mob.kind.defense), ux, uy);
    });
    this.emit({ type: 'arrow', x: round1(x), y: round1(y), vx: round1(vx), vy: round1(vy), range: shot.bow.range });
  }

  /** The magic button: a Time Bolt for MP, along the player's aim. */
  cast(p: Player) {
    if (p.castCooldown > 0) return;
    p.castCooldown = CAST_COOLDOWN;
    const { spell, stats } = p.hero;
    const { x, y } = p.body;
    if (stats.mp < spell.cost) {
      this.text(x, y - 54, 'No MP', 0x8fb3ff);
      return;
    }
    stats.mp -= spell.cost;
    p.body.play('cast');
    const { x: vx, y: vy } = p.aim;
    const [bx, by] = [x + vx * 10, y - BOLT_HEIGHT + vy * 8];
    this.visuals.bolt(bx, by, vx * BOLT_SPEED, vy * BOLT_SPEED, (mob) =>
      this.hitMob(mob, rollDamage(spellPower(p.hero), mob.kind.defense), vx, vy, true),
    );
    this.emit({ type: 'bolt', x: round1(bx), y: round1(by), vx: vx * BOLT_SPEED, vy: vy * BOLT_SPEED, p: p.slot });
  }

  /** A ranged mob lets go of a shot along (ux, uy), from its hands at chest height. */
  private mobShoot(mob: Mob, ux: number, uy: number) {
    const { shot } = mob.kind;
    if (!shot) return;
    const x = mob.body.x + ux * 10;
    const y = mob.body.y - BOLT_HEIGHT + uy * 8;
    this.visuals.foeBolt(x, y, ux * shot.speed, uy * shot.speed, shot.color, (bx, by) => {
      // Hits the first player it touches (one blinking with invulnerability lets it pass), stops at walls. The players
      // are looked up each step: someone may have joined or left while it flies.
      const hit = this.arena
        .players()
        .find((p) => p.invuln <= 0 && Math.abs(bx - p.body.x) < 11 && Math.abs(by + BOLT_HEIGHT - p.body.y) < 14);
      if (hit) this.hurtHero(mob, hit.body);
      return hit !== undefined;
    });
    this.emit({
      type: 'bolt',
      x: round1(x),
      y: round1(y),
      vx: round1(ux * shot.speed),
      vy: round1(uy * shot.speed),
      color: shot.color,
    });
  }

  // --- Weather ---

  /** Where the next lightning bolt lands: anywhere in a wide area around a random player, so it is unpredictable. */
  strikeTarget() {
    const all = this.arena.players(); // the zone the weather is drawn in
    const p = all[Math.floor(Math.random() * all.length)] ?? this.arena.local;
    return { x: p.body.x + (Math.random() - 0.5) * 840, y: p.body.y + (Math.random() - 0.5) * 600 };
  }

  /** A bolt landed (only the host or a solo game decides this): friends see it, and it burns whoever stands there. */
  lightning(strike: Strike) {
    this.emit({ type: 'lightning', ...strike });
    const { x, y } = strike;
    this.fx('hitSpark', x, y);
    for (const p of this.arena.players()) {
      if (p.invuln > 0 || Math.hypot(p.body.x - x, p.body.y - y) > LIGHTNING_RADIUS) continue;
      this.harm(p, Math.max(1, Math.round(p.hero.stats.maxHp * LIGHTNING_DAMAGE)), x, y);
    }
  }

  // --- Damage ---

  /** Every player takes the kill's XP and gold (in solo, just the one). */
  private hitMob(mob: Mob, damage: number, vx: number, vy: number, bolt = false) {
    const killed = mob.hit(damage, vx, vy);
    // Sparks fly on from the blow (the bolt has its own impact burst), at chest height.
    if (!bolt) this.fx('hitSpark', mob.body.x, mob.body.y - 14, Math.atan2(vy, vx));
    this.text(mob.body.x, mob.body.y - 54, String(damage), 0xffffff);
    if (!killed) return;
    this.fx('mobPoof', mob.body.x, mob.body.y - 12);
    this.text(mob.body.x, mob.body.y - 66, `+${mob.kind.xp} XP`, 0xffb13f);
    const gold = rollGold(mob.kind); // everyone gets the same purse, like the XP
    this.text(mob.body.x, mob.body.y - 78, `+${gold}g`, 0xffd34d);
    for (const p of this.arena.players()) {
      p.hero.gold += gold;
      if (!gainXp(p.hero.stats, mob.kind.xp)) continue;
      this.text(p.body.x, p.body.y - 62, 'LEVEL UP!', 0xffb13f);
      this.fx('levelUp', p.body.x, p.body.y - 14);
    }
  }

  private hurtHero(mob: Mob, victim: Character) {
    const p = this.arena.players().find((q) => q.body === victim);
    if (!p || p.invuln > 0) return;
    this.harm(p, rollDamage(mob.kind.attack, defensePower(p.hero)), mob.body.x, mob.body.y);
  }

  /** Damage a player and knock them away from (fromX, fromY): the shared tail of a mob's hit and a lightning strike. */
  private harm(p: Player, damage: number, fromX: number, fromY: number) {
    const s = p.hero.stats;
    s.hp -= damage;
    p.invuln = INVULN_TIME;
    p.sinceHit = 0;
    p.pendingShot = null; // a hit spoils the shot
    p.body.play('hurt');
    this.text(p.body.x, p.body.y - 54, String(damage), 0xff5a5a);
    this.fx('heroHurt', p.body.x, p.body.y - 14, undefined, p.slot);
    const dx = p.body.x - fromX;
    const dy = p.body.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    p.knock = { x: (dx / len) * 220, y: (dy / len) * 220 };
    if (s.hp <= 0) this.defeat(p);
  }

  /** Out of HP: back to the spawn point, fully restored (XP and levels are kept). */
  private defeat(p: Player) {
    const { arena } = this;
    const { home } = arena;
    const s = p.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    if (p.zone === home.name) {
      p.body.position.set(...cellFeet(home.data.spawn));
      p.body.face('down');
    } else {
      this.zones.travel(p, home, home.data.spawn); // wake at the start of the world, whatever zone it was in
    }
    p.aim = { x: 0, y: 1 };
    p.knock = { x: 0, y: 0 };
    p.vel = { x: 0, y: 0 };
    p.invuln = 0;
    p.pendingShot = null;
    if (arena.role === 'solo') for (const z of arena.zones.values()) z.mobs.forEach((m) => m.reset()); // in co-op the other player is still fighting them
    if (p === arena.local) this.announce(DEFEAT_LINES);
    else this.emit({ type: 'defeat', player: p.slot });
  }
}
