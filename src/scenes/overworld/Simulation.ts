import { DIR_VEC, dirIndex, directionToward } from '../../core/direction';
import { enabled, setting } from '../../systems/capabilities';
import { PRESSURE_FACTOR } from '../../systems/dmPowers';
import { mobKey } from '../../systems/quests';
import type { Character } from '../../entities/Character';
import type { Mob, MobWorld } from '../../entities/Mob';
import type { Command, Player } from '../../entities/Player';
import { cellFeet } from '../../map/doors';
import { CELL } from '../../map/types';
import { round1, type FxName, type WorldEvent } from '../../net/protocol';
import {
  attackPower,
  defensePower,
  gainXp,
  gearMpRegen,
  gearRegen,
  goldFor,
  rollDamage,
  rollGold,
  spellPower,
  speedFactor,
  xpFor,
  type Ranged,
} from '../../systems/combat';
import { isIce, stepVelocity } from '../../systems/ice';
import { assistFacing } from '../../systems/meleeAssist';
import {
  drainNeeds,
  drinkableNear,
  needsRegen,
  pondCapacity,
  pondId,
  POND_FLOW,
  rainFill,
  sipWater,
  STILL_FILL,
  starveRate,
  thirsty,
} from '../../systems/needs';
import { bossMends } from '../../systems/bosses';
import { GIVERS, QUEST_GIVER, recordKill, recordVisit, type Progress } from '../../systems/quests';
import { SHOOT_RELEASE_MS } from '../../sprites/doll';
import { EDGE_SHARE, GUARD_TAKEN } from '../../systems/skills';
import { blinkAlpha } from '../../systems/hitPause';
import type { Strike } from '../../entities/WeatherLayer';
import type { ZoneState } from '../ZoneState';

/** Seconds of no input after which mobs leave a player alone, online. */
const AFK_S = 10;
import type { Arena } from './Arena';
import { Casting } from './Casting';
import {
  ATTACK_COOLDOWN,
  BOLT_HEIGHT,
  DEFEAT_LINES,
  HP_REGEN,
  HP_REGEN_DELAY,
  INVULN_TIME,
  LIGHTNING_DAMAGE,
  LIGHTNING_RADIUS,
  MELEE_REACH,
  MP_REGEN,
  SPEED,
  DM_SPEED,
  auraTint,
} from './constants';
import type { Visuals } from './Visuals';
import type { Zones } from './Zones';

/** Is this player thirsty and beside a pond in `z` that is not empty? (What the A button and the Drink button both ask.) */
/** How close (px) an enemy must be for the A button to fight rather than drink by a pond: about six cells. */
export const FOE_NEAR = CELL * 6;

/** Is an enemy within `FOE_NEAR` of this player in `z`? Then A by a pond attacks instead of drinking. */
export function foeNear(z: ZoneState, p: Player): boolean {
  return z.mobs.some((m) => m.alive && Math.hypot(m.body.x - p.body.x, m.body.y - p.body.y) < FOE_NEAR);
}

export function canDrink(z: ZoneState, p: Player): boolean {
  if (!enabled('needs', z.name) || !thirsty(p.hero.needs)) return false;
  const water = drinkableNear(z.data, p.body.x, p.body.y);
  return !!water && z.ponds.level(pondId(z.data, water.cell)) < 1;
}

/**
 * The authoritative game rules for the people and mobs in the arena: moving, swinging, shooting, casting, taking damage
 * (from mobs and from lightning), winning XP and gold, being knocked out. It runs in solo and on a co-op host only; a guest
 * never simulates (it draws what the host reports, see Visuals.show). Everything that happens that a friend should also see
 * goes through `emit` (a no-op unless this game is a host) as well as being drawn here. Like everything in the overworld it
 * works in the arena's current zone (`Arena.inZone`).
 */
export class Simulation {
  private casting: Casting;
  /** Set by the scene: a training ground handles a defeat in a trial itself (returns true when it did). */
  trialDefeat: (p: Player) => boolean = () => false;
  /** A party member was knocked out (not in a trial) where they stood, before they wake at the start: the DM may raise them. */
  onDefeat: (p: Player, zone: string, x: number, y: number) => void = () => {};
  /** A foe fell to the party (the DM's tasks count the kills in their zone). */
  onKill: (zone: string, key: string) => void = () => {};
  /** Someone cast a spell (a combo, `spell` its id; a skill's own id for an innate skill) in `zone`: the DM's quest may count it. */
  onCast: (p: Player, zone: string, spell: string) => void = () => {};
  /** Someone set barrel `index` of `zone` down at (x, y): the DM's quest may count it. */
  onSetDown: (p: Player, zone: string, index: number, x: number, y: number) => void = () => {};

  constructor(
    private arena: Arena,
    private visuals: Visuals,
    private zones: Zones,
    /** Record something for the friends to see (only a host sends it anywhere). */
    private emit: (e: WorldEvent) => void,
    /** Say something to the player at this keyboard (a dialog). */
    private announce: (lines: string[]) => void,
  ) {
    this.casting = new Casting(arena, visuals, this, emit);
  }

  /** Players away from the keyboard (see `Player.idle`), whom mobs do not hunt online. */
  private away = new WeakSet<Character>();

  /** What a zone's mobs may ask of the world each tick. */
  mobWorldFor(z: ZoneState): MobWorld {
    const { arena, away } = this;
    return {
      get heroes() {
        // Online, a player who has stepped away is left alone (AFK_S): an adventure, not a trap. Solo is as it was.
        return arena.role === 'solo' ? z.heroBodies : z.heroBodies.filter((b) => !away.has(b));
      },
      slide: (body, mx, my) =>
        z.collision.slide(
          body,
          mx,
          my,
          arena.inZone(z, () => arena.bodies()),
        ),
      sees: (x0, y0, x1, y1) => z.collision.hasLineOfSight(x0, y0, x1, y1),
      strike: (mob, target) => arena.inZone(z, () => this.hurtHero(mob, target)),
      shoot: (mob, ux, uy) => arena.inZone(z, () => this.mobShoot(mob, ux, uy)),
      ray: (mob, target) => arena.inZone(z, () => this.mobRay(mob, target)),
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

  /**
   * A player starts drinking from the pond beside them (call it in their zone): the water then flows in each tick
   * (`drinkTick`), draining the pond, until they are full, walk off, stop or the pond is dry. Says why not, or returns
   * false with no pond near.
   */
  startDrinking(p: Player): boolean {
    const z = this.arena.zone;
    const { x, y } = p.body;
    const water = drinkableNear(z.data, x, y);
    if (!water) return false;
    p.body.face(directionToward(water.x - x, water.y - y));
    const why = !thirsty(p.hero.needs)
      ? 'Not thirsty'
      : z.ponds.level(pondId(z.data, water.cell)) >= 1
        ? 'The pond is dry'
        : '';
    if (why) {
      this.text(x, y - 40, why, 0xff8a7a);
      return true;
    }
    if (!p.drinking) this.fx('levelUp', water.x, water.y);
    p.drinking ??= { gained: 0 };
    return true;
  }

  /**
   * The action key (A) by a pond: stops a player who is drinking, or starts one who is thirsty at a pond that is not empty,
   * but only while no enemy is near (`foeNear`): in a fight A always attacks (and a drink in progress stops). Returns
   * false when the key should do what it otherwise would. Call it in the player's zone.
   */
  pondAction(p: Player): boolean {
    if (foeNear(this.arena.zone, p)) {
      if (p.drinking) this.stopDrinking(p);
      return false;
    }
    if (p.drinking) {
      this.stopDrinking(p);
      return true;
    }
    if (!canDrink(this.arena.zone, p)) return false;
    return this.startDrinking(p);
  }

  /** The player stops drinking: how much it did them good floats over them. */
  stopDrinking(p: Player) {
    const gained = Math.round(p.drinking?.gained ?? 0);
    p.drinking = null;
    if (gained > 0) this.text(p.body.x, p.body.y - 40, `+${gained} water`, 0x8fc8ff);
  }

  /** A drinking player's tick: water flows from the pond into them; walking off, a full meter or a dry pond stops it. */
  private drinkTick(p: Player, dt: number) {
    const sip = p.drinking;
    if (!sip) return;
    const z = this.arena.zone;
    const water = p.moving ? null : drinkableNear(z.data, p.body.x, p.body.y);
    if (!water || !thirsty(p.hero.needs)) return this.stopDrinking(p);
    const pond = pondId(z.data, water.cell);
    const room = 100 - p.hero.needs.water;
    const got = z.ponds.drink(pond, Math.min(POND_FLOW * dt, room), pondCapacity(z.data, pond));
    sip.gained += sipWater(p.hero.needs, got, 1);
    if (z.ponds.level(pond) >= 1) {
      this.stopDrinking(p);
      this.text(p.body.x, p.body.y - 52, 'The pond is dry', 0xd8b080);
    }
  }

  /** One tick for a player: cooldowns and regeneration, knockback, walking (or sliding on ice), and the poses. */
  updatePlayer(p: Player, cmd: Command, dt: number) {
    if (p.dm) return this.updateDm(p, cmd, dt);
    const s = p.hero.stats;
    p.idle = cmd.dx || cmd.dy || cmd.act || cmd.combo !== undefined ? 0 : p.idle + dt;
    if (p.idle >= AFK_S) this.away.add(p.body);
    else this.away.delete(p.body);
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.castCooldown = Math.max(0, p.castCooldown - dt);
    p.ward = Math.max(0, p.ward - dt);
    p.guard = Math.max(0, p.guard - dt);
    p.edge.timer = Math.max(0, p.edge.timer - dt);
    if (p.edge.timer === 0) p.edge.charges = 0;
    p.invuln = Math.max(0, p.invuln - dt);
    p.grace = Math.max(0, p.grace - dt);
    p.sinceHit += dt;
    if (p.pendingShot && (p.pendingShot.timer -= dt) <= 0) this.release(p);
    // A campaign (or zone) without food and water: no hunger, plain mending, no starving; else as fast as it says.
    const zone = this.arena.zone.name;
    // A quest that sends the hero to a named place counts it on arriving (the host decides, for every player).
    this.questNote(p, recordVisit(p.hero, zone, this.arena.data.places, p.body.x, p.body.y));
    const needs = enabled('needs', zone);
    if (needs) drainNeeds(p.hero.needs, dt * setting('needs', 'drain', zone));
    const fed = needs ? needsRegen(p.hero.needs) : 1; // hungry or thirsty heroes mend more slowly (systems/needs.ts)
    s.mp = Math.min(s.maxMp, s.mp + (MP_REGEN * fed + gearMpRegen(p.hero)) * dt);
    // Gear that mends (a Warden's Mantle) works in the thick of a fight; the slow natural kind waits for a quiet spell.
    const mend = gearRegen(p.hero) + (p.sinceHit > HP_REGEN_DELAY ? HP_REGEN * fed : 0);
    if (mend) s.hp = Math.min(s.maxHp, s.hp + mend * dt);
    const starving = needs ? starveRate(p.hero.needs, s.maxHp) : 0;
    if (starving && s.hp > 1) s.hp = Math.max(1, s.hp - starving * dt); // empty meters wear you down, but never finish you

    if (p.knock.x || p.knock.y) {
      this.arena.collision.slide(p.body, p.knock.x * dt, p.knock.y * dt, this.arena.bodies());
      const decay = Math.exp(-12 * dt);
      p.knock.x *= decay;
      p.knock.y *= decay;
      if (Math.hypot(p.knock.x, p.knock.y) < 5) p.knock = { x: 0, y: 0 };
    }

    p.moving = this.move(p, cmd, dt);
    this.drinkTick(p, dt);
    // Lunge into a swing; blink while invulnerable.
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = this.isSwinging(p);
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.alpha = blinkAlpha(p.invuln);
    p.body.setTint(auraTint({ ward: p.ward > 0, edge: p.edge.charges > 0, guard: p.guard > 0 }));
    p.body.animate(dt * 1000, p.moving);
  }

  /**
   * The Dungeon Master's tick: they walk where they like, stopped by walls but by nobody else, never slip on ice, and
   * have no meters to run down.
   */
  private updateDm(p: Player, { dx, dy }: Command, dt: number) {
    const len = Math.hypot(dx, dy);
    if (len) {
      if (dx) p.body.face(dx > 0 ? 'right' : 'left');
      else p.body.face(dy > 0 ? 'down' : 'up');
      const step = (DM_SPEED * dt) / len;
      this.arena.collision.slide(p.body, dx * step, dy * step, []);
    }
    p.moving = len > 0;
    p.body.animate(dt * 1000, p.moving);
  }

  /** Returns true if the player is trying to move. On ice the velocity lags behind the keys, so they slide. */
  private move(p: Player, { dx, dy, aim, at }: Command, dt: number): boolean {
    const { collision, data } = this.arena;
    const len = Math.hypot(dx, dy);
    const wish = len ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
    p.mouseAim = aim !== undefined;
    if (aim) {
      // Aiming with the mouse: the hero keeps looking where they walk, and turns to it only to attack or cast.
      p.aim = aim;
      if (len) p.body.face(dx ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    } else if (len) {
      if (dx) p.body.face(dx > 0 ? 'right' : 'left');
      else p.body.face(dy > 0 ? 'down' : 'up');
      p.aim = wish;
    }
    const top = SPEED * speedFactor(p.hero);
    p.claim.tick(performance.now(), top);
    if (at && !p.knock.x && !p.knock.y) {
      // A friend walks its own hero (it moves smoothly on its own screen) and says where it stands: believe it when it
      // can be (core/claim.ts), so the friend is never tugged back; otherwise the host's walking below stands.
      const verdict = p.claim.judge(at.n, at.x, at.y, p.body, collision.fitsMap(at.x, at.y, p.body.size));
      if (verdict !== 'reject') {
        if (verdict === 'adopt') p.body.position.set(at.x, at.y);
        p.vel = { x: wish.x * top, y: wish.y * top };
        return len > 0;
      }
    }
    p.vel = stepVelocity(p.vel, wish, top, dt, isIce(data, p.body.x, p.body.y - 1));
    if (p.vel.x || p.vel.y) {
      const [x, y] = [p.body.x, p.body.y];
      collision.slide(p.body, p.vel.x * dt, p.vel.y * dt, this.arena.bodies());
      // Running into something stops the slide on that axis.
      if (p.body.x === x) p.vel.x = 0;
      if (p.body.y === y) p.vel.y = 0;
    }
    return len > 0;
  }

  /** In the first moments of a sword swing, which lunges the body forward (a bow, wand or tome does not). */
  isSwinging(p: Player): boolean {
    const { ranged, focus } = p.hero.weapon;
    return !ranged && !focus && p.attackCooldown > ATTACK_COOLDOWN - 0.1;
  }

  // --- Attacks ---

  /** With mouse aiming, turn toward the mouse for this attack or cast. */
  private faceAim(p: Player) {
    if (p.mouseAim) p.body.face(directionToward(p.aim.x, p.aim.y));
  }

  /** The action button's attack: swing the sword, or start drawing the bow. */
  attack(p: Player) {
    if (p.attackCooldown > 0) return;
    this.faceAim(p);
    const { ranged: bow, focus } = p.hero.weapon;
    if (focus) {
      this.casting.basic(p, focus);
      return;
    }
    if (bow) {
      this.draw(p, bow);
      return;
    }
    p.attackCooldown = ATTACK_COOLDOWN;
    // Aim assist (systems/meleeAssist.ts): turn toward a near foe the facing would miss (not while aiming by mouse/tap).
    if (!p.mouseAim) {
      const foes = this.arena.mobs
        .filter((m) => m.alive)
        .map((m) => ({ x: m.body.x, y: m.body.y, allowance: (m.body.size - 1) * 14 }));
      p.body.face(assistFacing(p.body.x, p.body.y, p.body.facing, foes, MELEE_REACH));
    }
    p.body.play('slash');
    const dir = p.body.facing;
    const [vx, vy] = DIR_VEC[dir];
    this.visuals.swing(p.body.x, p.body.y, dir, p.slot);
    this.emit({ type: 'slash', x: round1(p.body.x), y: round1(p.body.y), dir: dirIndex(dir), p: p.slot });
    const cx = p.body.x + vx * 16;
    const cy = p.body.y + vy * 16;
    const edge = this.takeEdge(p); // Arcane Edge: this swing carries extra magic
    for (const mob of this.arena.mobs) {
      if (mob.alive && Math.hypot(mob.body.x - cx, mob.body.y - cy) < MELEE_REACH + (mob.body.size - 1) * 14) {
        this.hitMob(mob, rollDamage(attackPower(p.hero) + edge, mob.kind.defense), vx, vy);
        if (edge) this.fx('zap', mob.body.x, mob.body.y - 16);
      }
    }
  }

  /**
   * Arcane Edge (systems/skills.ts): spend one charge on an attack and say how much magic damage it adds (0 with none left).
   * Used by every attack: a sword swing, an arrow's release and a wand's bolt.
   */
  takeEdge(p: Player): number {
    if (p.edge.charges <= 0) return 0;
    if (--p.edge.charges === 0) p.edge.timer = 0;
    return Math.max(1, Math.round(spellPower(p.hero) * EDGE_SHARE));
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
    const edge = this.takeEdge(p); // Arcane Edge: this arrow carries extra magic
    this.visuals.arrow(
      x,
      y,
      vx,
      vy,
      shot.bow.range,
      (mob) => {
        this.hitMob(mob, rollDamage(shot.damage + edge, mob.kind.defense), ux, uy);
        if (edge) this.fx('zap', mob.body.x, mob.body.y - 16);
      },
      p.slot,
    );
    this.emit({
      type: 'arrow',
      x: round1(x),
      y: round1(y),
      vx: round1(vx),
      vy: round1(vy),
      range: shot.bow.range,
      p: p.slot,
    });
  }

  /** The player tapped out combo `index` of their wand or tome: cast its spell if there is the mana for it. */
  combo(p: Player, index: number) {
    if (p.dm) return; // the Dungeon Master casts nothing at the party's foes
    this.casting.combo(p, index);
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
        .party()
        .find((p) => !p.safe && Math.abs(bx - p.body.x) < 11 && Math.abs(by + BOLT_HEIGHT - p.body.y) < 14);
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

  /**
   * One burn of a mob's held ray on `target` (the host and solo): false when the beam can no longer reach them (a wall
   * is in the way, or they are spared), which ends it. Every client draws the beam itself from the mob's `channel` state.
   */
  private mobRay(mob: Mob, target: Character): boolean {
    const { ray } = mob.kind;
    const p = this.arena.party().find((q) => q.body === target);
    if (!ray || !p) return false;
    const { collision } = this.arena;
    const [dx, dy] = [target.x - mob.body.x, target.y - mob.body.y];
    const steps = Math.ceil(Math.hypot(dx, dy) / 8);
    for (let i = 1; i < steps; i++)
      if (
        collision.isBlocked(
          Math.floor((mob.body.x + (dx * i) / steps) / CELL),
          Math.floor((mob.body.y + (dy * i) / steps) / CELL),
        )
      )
        return false;
    if (p.safe) return true; // warded or just arrived: the beam holds but does nothing
    this.harm(
      p,
      this.pressed(rollDamage(Math.max(1, mob.kind.attack * ray.power), defensePower(p.hero))),
      mob.body.x,
      mob.body.y,
      true,
    );
    return true;
  }

  // --- Weather ---

  /** Where the next lightning bolt lands: anywhere in a wide area around a random player, so it is unpredictable. */
  strikeTarget() {
    const all = this.arena.party(); // the zone the weather is drawn in
    const p = all[Math.floor(Math.random() * all.length)] ?? this.arena.local;
    return { x: p.body.x + (Math.random() - 0.5) * 840, y: p.body.y + (Math.random() - 0.5) * 600 };
  }

  /**
   * Let the weather of the zone being worked in pass `dt` seconds, and strike if it is a storm: the host or a solo game
   * rolls every occupied zone's weather (a guest is only told), and a storm picks where to strike in its own zone.
   */
  weather(dt: number) {
    const { weather, ponds, name } = this.arena.zone;
    this.arena.zone.syncBeds(); // a dried-out pond is ground to walk on
    if (weather && !enabled('weather', name)) weather.still(); // switched off: clear and still, here and for friends
    if (!weather || !enabled('weather', name)) return ponds.rain(STILL_FILL, dt); // no weather: ponds seep back
    weather.update(dt);
    ponds.rain(rainFill(weather.precip, weather.intensity), dt); // only rain fills a pond someone drank from
    if (weather.strikeDue(dt)) this.lightning({ ...this.strikeTarget(), seed: Math.floor(Math.random() * 1e9) });
  }

  /**
   * A bolt landed (only the host or a solo game decides this): friends see it, and it burns whoever stands there
   * (unless it is the Dungeon Master's, `harmless`).
   */
  lightning(strike: Strike, harmless = false) {
    this.arena.zone.weatherLayer?.strike(strike);
    this.emit({ type: 'lightning', ...strike });
    const { x, y } = strike;
    this.fx('hitSpark', x, y);
    if (harmless) return;
    for (const p of this.arena.party()) {
      if (p.safe || Math.hypot(p.body.x - x, p.body.y - y) > LIGHTNING_RADIUS) continue;
      this.harm(p, Math.max(1, Math.round(p.hero.stats.maxHp * LIGHTNING_DAMAGE)), x, y);
    }
  }

  // --- Damage ---

  /** Every player takes the kill's XP and gold (in solo, just the one). */
  hitMob(mob: Mob, rawDamage: number, vx: number, vy: number, bolt = false) {
    // a foe marked by Spirit Mark takes more; the DM's pressure makes the world harder or gentler to hurt
    const damage = Math.max(1, Math.round((rawDamage * this.casting.markFactor(mob)) / this.pressure()));
    const killed = mob.hit(damage, vx, vy);
    // Sparks fly on from the blow (the bolt has its own impact burst), at chest height.
    if (!bolt) this.fx('hitSpark', mob.body.x, mob.body.y - 14 * mob.body.size, Math.atan2(vy, vx));
    this.text(mob.body.x, mob.body.y - 54 * mob.body.size, String(damage), 0xffffff);
    if (!killed) return;
    this.onKill(this.arena.zone.name, mobKey(mob.kind) ?? '');
    this.fx('mobPoof', mob.body.x, mob.body.y - 12);
    this.text(mob.body.x, mob.body.y - 66 * mob.body.size, `+${mob.kind.xp} XP`, 0xffb13f);
    const gold = rollGold(mob.kind); // everyone gets the same purse, like the XP
    this.text(mob.body.x, mob.body.y - 78 * mob.body.size, `+${gold}g`, 0xffd34d);
    for (const p of this.arena.party()) {
      p.hero.gold += goldFor(p.hero, gold); // gear can add to the purse and the XP, so each player gets their own share
      if (gainXp(p.hero.stats, xpFor(p.hero, mob.kind.xp))) this.levelUp(p);
      this.questNote(p, recordKill(p.hero, mob.kind, this.arena.zone.name)); // a quest counts the kill for everyone here
    }
  }

  /** Pay `p` for something the party did together (a DM's task): XP and gold, with the usual gear bonuses and level-ups. */
  reward(p: Player, xp: number, gold: number) {
    this.arena.inZone(this.arena.zoneOf(p), () => {
      p.hero.gold += goldFor(p.hero, gold);
      this.text(p.body.x, p.body.y - 66, `+${xp} XP`, 0xffb13f);
      this.text(p.body.x, p.body.y - 78, `+${gold}g`, 0xffd34d);
      if (gainXp(p.hero.stats, xpFor(p.hero, xp))) this.levelUp(p);
    });
  }

  /** Float a quest's progress ("3/5 goblins") over the player, and a nudge once it can be handed in. */
  questNote(p: Player, progress: Progress | null) {
    if (!progress) return;
    this.text(p.body.x, p.body.y - 74, progress.text, 0x9fe8ff);
    if (progress.ready)
      this.text(p.body.x, p.body.y - 86, `Return to ${GIVERS[QUEST_GIVER]?.tag ?? 'the warden'}`, 0xffd34d);
  }

  /** A player gained a level (from a kill or a quest reward). */
  levelUp(p: Player) {
    this.text(p.body.x, p.body.y - 62, 'LEVEL UP!', 0xffb13f);
    this.fx('levelUp', p.body.x, p.body.y - 14);
  }

  private hurtHero(mob: Mob, victim: Character) {
    const p = this.arena.party().find((q) => q.body === victim);
    if (!p || p.safe) return;
    this.harm(p, this.pressed(rollDamage(mob.kind.attack, defensePower(p.hero))), mob.body.x, mob.body.y);
  }

  /** The DM's pressure as a factor: 0.7 gentle, 1 steady, 1.5 fierce (`systems/dmPowers.ts`). */
  private pressure(): number {
    return PRESSURE_FACTOR[this.arena.pressure];
  }

  /** What a foe's blow does under the DM's pressure (never less than 1). */
  private pressed(damage: number): number {
    return Math.max(1, Math.round(damage * this.pressure()));
  }

  /** Damage a player and knock them away from (fromX, fromY): the shared tail of a mob's hit and a lightning strike. */
  private harm(p: Player, damage: number, fromX: number, fromY: number, burn = false) {
    const s = p.hero.stats;
    if (p.guard > 0) damage = Math.max(1, Math.round(damage * GUARD_TAKEN)); // Iron Skin
    s.hp -= damage;
    p.sinceHit = 0;
    this.text(p.body.x, p.body.y - 54, String(damage), burn ? 0xff7fd0 : 0xff5a5a);
    this.fx('heroHurt', p.body.x, p.body.y - 14, undefined, p.slot);
    if (burn) {
      // damage over time: no knockback, no stun, no blinking immunity (the next burn must land), the shot still goes
      if (s.hp <= 0) this.defeat(p);
      return;
    }
    p.invuln = INVULN_TIME;
    p.pendingShot = null; // a hit spoils the shot
    p.body.play('hurt');
    const dx = p.body.x - fromX;
    const dy = p.body.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    p.knock = { x: (dx / len) * 220, y: (dy / len) * 220 };
    if (s.hp <= 0) this.defeat(p);
  }

  /** A wipe starts a named boss's fight again (`bosses.ts`): one in a zone no hero is in any more is back at full health. */
  private mendBosses() {
    const { arena } = this;
    const party = arena.party();
    for (const z of arena.zones.values()) {
      const here = party.filter((q) => arena.zoneOf(q) === z).length;
      for (const m of z.mobs)
        if (bossMends({ named: !!m.kind.named, alive: m.alive, hp: m.hp, maxHp: m.kind.maxHp }, here)) m.reset();
    }
  }

  /** Out of HP: back to the spawn point, fully restored (XP and levels are kept). */
  private defeat(p: Player) {
    if (this.trialDefeat(p)) return;
    const { arena } = this;
    if (!p.dm) this.onDefeat(p, p.zone, p.body.x, p.body.y);
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
    p.ward = 0;
    p.edge = { charges: 0, timer: 0 };
    p.guard = 0;
    if (arena.role === 'solo')
      for (const z of arena.zones.values()) z.mobs.forEach((m) => m.reset()); // in co-op the other player is still fighting them
    else this.mendBosses();
    if (p === arena.local) this.announce(DEFEAT_LINES);
    else this.emit({ type: 'defeat', player: p.slot });
  }
}
