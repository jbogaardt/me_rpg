import { DIR_VEC, dirIndex, directionToward } from '../../core/direction';
import { enabled, setting } from '../../systems/capabilities';
import { PRESSURE_FACTOR } from '../../systems/dmPowers';
import { DOWN_TOTAL } from '../../systems/downfall';
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
  killShare,
  rollDamage,
  rollGold,
  spellPower,
  speedFactor,
  xpFor,
  type Ranged,
} from '../../systems/combat';
import { isIce, stepVelocity } from '../../systems/ice';
import { canRoll, moveRoll, rollDirection, rollWaitFor, startRoll } from '../../systems/roll';
import { assistFacing } from '../../systems/meleeAssist';
import {
  afterArmor,
  blockedDamage,
  furyFactor,
  gapArmor,
  levelGap,
  mendAmount,
  pickPatient,
  poiseCost,
  spreadAngles,
  stunFactor,
} from '../../systems/mobDefense';
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
import { recordKill, recordVisit, type Progress } from '../../systems/quests';
import { HIT_FX, hitTier, hurtFx, refusalFx, type Refusal } from '../../systems/cueRules';
import { ANIMS, SHOOT_RELEASE_MS } from '../../sprites/doll';
import { SWORD_SWING, contactHits, startSwing, stepSwing, swingAnimMs, type PendingSwing } from '../../systems/swing';
import { EDGE_SHARE, GUARD_TAKEN } from '../../systems/skills';
import { blinkAlpha, heroPauseFor, HERO_HURT_PAUSE, tickPause } from '../../systems/hitPause';
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
  /** A foe hurt a hero: `kind` is the foe's content id, `damage` what landed (armour and the DM's pressure counted). The host's report reads it. */
  onHurt: (p: Player, kind: string, damage: number) => void = () => {};
  /** The party hurt a foe (`damage` as it landed, `killed` when that finished it). */
  onDealt: (kind: string, damage: number, killed: boolean) => void = () => {};
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
      strike: (mob, target, power) => arena.inZone(z, () => this.hurtHero(mob, target, power)),
      shoot: (mob, ux, uy, fan) => arena.inZone(z, () => this.mobShoot(mob, ux, uy, fan)),
      ray: (mob, target) => arena.inZone(z, () => this.mobRay(mob, target)),
      heal: (mob) => arena.inZone(z, () => this.mobHeal(z, mob)),
    };
  }

  // --- Drawn here and also shown to the friends ---

  /** A damage number: the debug setting's, drawn on this page only (never sent: the game shows weight, not numbers). */
  number(x: number, y: number, n: number, color: number) {
    this.visuals.number(x, y, n, color);
  }

  /** A refusal as a cue, shown to everyone (`systems/cueRules.ts`): a red puff, the actor's head-shake and the dull thud. */
  refuse(p: Player | undefined, x: number, y: number, why: Refusal, line?: string) {
    this.fx(refusalFx(why), x, y, undefined, p?.slot);
    // Only where the player cannot see the reason for themselves: one short passive line, never a popup (this page's hero only).
    if (line && p && p === this.arena.local) this.announce([line]);
  }

  /** A one-shot particle effect, also shown to the guest. `dir` is an angle in radians; `p` the player it happened to. */
  fx(name: FxName, x: number, y: number, dir?: number, p?: number) {
    this.visuals.particles(name, x, y, dir, p);
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
    if (!thirsty(p.hero.needs) || z.ponds.level(pondId(z.data, water.cell)) >= 1) {
      this.refuse(p, x, y - 14, 'nothingToDo'); // full, or the pond is dry (it shows as bare ground)
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

  /** The player stops drinking (the water bar and the pond's level show how much it did them good). */
  stopDrinking(p: Player) {
    p.drinking = null;
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
    if (z.ponds.level(pond) >= 1) this.stopDrinking(p); // the pond shows as bare ground
  }

  /** One tick for a player: cooldowns and regeneration, knockback, walking (or sliding on ice), and the poses. */
  updatePlayer(p: Player, cmd: Command, dt: number) {
    if (p.dm) return this.updateDm(p, cmd, dt);
    if (p.down !== null) {
      p.attackBuffer.clear();
      p.rollBuffer.clear();
      p.roll = null;
      p.swing = null;
      return this.downTick(p, dt);
    }
    const s = p.hero.stats;
    p.idle = cmd.dx || cmd.dy || cmd.act || cmd.use || cmd.roll || cmd.combo !== undefined ? 0 : p.idle + dt;
    if (p.idle >= AFK_S) this.away.add(p.body);
    else this.away.delete(p.body);
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.rollSince += dt;
    if (cmd.roll) p.rollBuffer.press(p.zone); // kept for a moment if the roll is not legal yet (`rollGate`)
    // A press made just before the cooldown ended swings now (systems/inputBuffer.ts).
    if (p.attackBuffer.step(dt, p.attackCooldown, p.zone)) this.attack(p);
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

    if (p.hitstop > 0) {
      // Hit-pause: the hero holds mid-blow (no walking, the pose and swing hold) while cooldowns and i-frames run on.
      p.hitstop = tickPause(p.hitstop, dt);
      if (!p.roll) {
        // (A roll in progress is not held by a pause of its own blow: its clock, and so its i-frame window, must run on.)
        p.moving = false;
        p.body.alpha = blinkAlpha(p.invuln);
        return;
      }
    }
    // The dodge roll (systems/roll.ts): a buffered press starts it the first tick it is legal; it then replaces walking.
    if (p.rollBuffer.step(dt, this.rollWait(p, cmd), p.zone)) this.beginRoll(p, cmd);
    if (p.roll) p.moving = this.rollTick(p, dt);
    else p.moving = this.move(p, cmd, dt);
    if (p.swing && p.mouseAim) p.body.face(p.swingDir);
    this.drinkTick(p, dt);
    // The blade is out: the blow lands now, on the frame the body shows it (before `animate` below, so the hit-stop it
    // causes holds the hero on that frame). A hero who changed zone since the press swings at nothing.
    const swing = p.swing;
    if (swing && stepSwing(swing, dt)) {
      if (swing.zone === p.zone) this.strike(p, swing);
      else p.swing = null;
    }
    // Lunge into a swing; blink while invulnerable.
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = this.isSwinging(p);
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.alpha = blinkAlpha(p.invuln);
    p.body.setTint(auraTint({ ward: p.ward > 0, edge: p.edge.charges > 0, guard: p.guard > 0 }));
    p.body.animate(dt * 1000, p.moving);
    p.rollLook.step(p.body, p.roll !== null, p === this.arena.local, dt, this.arena.effects);
  }

  /** The way a roll pressed now would go: the walk keys, else the aim, else the facing. */
  private rollAim(p: Player, cmd: Command): { x: number; y: number } {
    const [fx, fy] = DIR_VEC[p.body.facing];
    return rollDirection(cmd.dx, cmd.dy, p.aim, [fx, fy]);
  }

  /** 0 when a roll may start now, else a positive number (the buffer holds the press while it is positive). */
  private rollWait(p: Player, cmd: Command): number {
    const stunned = p.hitstop > 0 || p.knock.x !== 0 || p.knock.y !== 0;
    const cooldown = rollWaitFor(p.rollSince, p.rollDir, this.rollAim(p, cmd));
    return canRoll({ cooldown, rolling: p.roll !== null, down: p.down !== null, stunned, dm: p.dm }) ? 0 : 1;
  }

  /**
   * Start a roll: toward the walk keys (else the aim, else the facing). It cancels a swing in its startup or recovery and
   * a bow being drawn (not hit-stun or knock: `rollWait` refuses those), and pays the cooldown from now.
   */
  private beginRoll(p: Player, cmd: Command) {
    const dir = this.rollAim(p, cmd);
    p.roll = startRoll(dir.x, dir.y);
    p.rollSince = 0;
    p.rollDir = dir;
    p.swing = null;
    p.pendingShot = null;
    p.vel = { x: 0, y: 0 };
    p.drinking = null;
    p.body.cancelAction();
    p.body.release();
    p.body.face(directionToward(dir.x, dir.y));
    p.aim = dir;
  }

  /** One tick of a roll: slide along the way it goes (in small steps, so a wall is slid along and never tunnelled). */
  private rollTick(p: Player, dt: number): boolean {
    const r = p.roll;
    if (!r) return false;
    const done = moveRoll(r, dt, (mx, my) => this.arena.collision.slide(p.body, mx, my, this.arena.bodies()));
    if (done) p.roll = null;
    return true;
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
    if (p.attackCooldown > 0 || p.roll) {
      p.attackBuffer.press(p.zone); // too soon: keep the press for the first tick the cooldown allows
      return;
    }
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
    // The body starts swinging on the next tick, sped up so the blade is fully out at contact (systems/swing.ts); the
    // blow, the arc and the hit-stop wait for that tick (`strike`).
    p.body.play('slash', swingAnimMs(SWORD_SWING, ANIMS.slash.cycle.length));
    p.swing = startSwing(SWORD_SWING, p.zone);
    p.swingDir = p.body.facing;
  }

  /** The tick a swing's blade is out: the arc, the sound and the hits, from where the hero and the foes stand now. */
  private strike(p: Player, swing: PendingSwing) {
    p.swing = null;
    if (p.mouseAim) p.body.face(p.swingDir); // the mouse chose this swing's direction; walking must not turn it
    const dir = p.body.facing;
    const [vx, vy] = DIR_VEC[dir];
    this.visuals.swing(p.body.x, p.body.y, dir, p.slot);
    this.emit({ type: 'slash', x: round1(p.body.x), y: round1(p.body.y), dir: dirIndex(dir), p: p.slot });
    const edge = this.takeEdge(p); // Arcane Edge: this swing carries extra magic
    const foes = this.arena.mobs
      .filter((m) => m.alive)
      .map((mob) => ({ mob, x: mob.body.x, y: mob.body.y, allowance: (mob.body.size - 1) * 14 }));
    for (const { mob } of contactHits(p.body.x, p.body.y, dir, foes, MELEE_REACH, swing.hit)) {
      this.hitMob(mob, rollDamage(attackPower(p.hero) + edge, mob.kind.defense), vx, vy, false, p);
      if (edge) this.fx('zap', mob.body.x, mob.body.y - 16);
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
        this.hitMob(mob, rollDamage(shot.damage + edge, mob.kind.defense), ux, uy, false, p, { arrow: true });
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
    if (p.dm || p.roll) return; // the Dungeon Master casts nothing at the party's foes; a roll is no free cast
    this.casting.combo(p, index);
  }

  /** A healer mends the most wounded ally in its zone that it can see (host and solo): green motes rise on the ally, and its bar fills. */
  private mobHeal(z: ZoneState, healer: Mob): boolean {
    const { heal } = healer.kind;
    if (!heal) return false;
    const others = z.mobs.filter((m) => m !== healer && m.alive);
    const seen = (m: Mob) => z.collision.hasLineOfSight(healer.body.x, healer.body.y, m.body.x, m.body.y);
    const i = pickPatient(
      healer.body.x,
      healer.body.y,
      others.map((m) => ({
        x: m.body.x,
        y: m.body.y,
        hp: m.hp,
        maxHp: m.kind.maxHp,
        mendable: !m.kind.boss && !m.kind.named && seen(m),
      })),
      heal,
    );
    const ally = others[i];
    if (!ally) return false;
    ally.mend(mendAmount(ally.hp, ally.kind.maxHp, heal));
    this.fx('heal', ally.body.x, ally.body.y);
    return true;
  }

  /** A ranged mob lets go of a shot along (ux, uy), from its hands at chest height: one bolt, or (`fan`, the mob's counter says so) a fan of them (`shot.spread`),
   * each an ordinary `bolt` event, so a guest draws them with no new message. */
  private mobShoot(mob: Mob, ux: number, uy: number, fan = false) {
    const { shot } = mob.kind;
    if (!shot) return;
    const lanes = fan ? shot.spread : undefined;
    const angles = lanes ? spreadAngles(Math.atan2(uy, ux), lanes) : [Math.atan2(uy, ux)];
    const power = lanes?.power ?? 1;
    for (const a of angles) {
      const [vx, vy] = [Math.cos(a), Math.sin(a)];
      const x = mob.body.x + vx * 10;
      const y = mob.body.y - BOLT_HEIGHT + vy * 8;
      this.visuals.foeBolt(x, y, vx * shot.speed, vy * shot.speed, shot.color, (bx, by) => {
        // Hits the first player it touches (one blinking with invulnerability lets it pass), stops at walls. The players
        // are looked up each step: someone may have joined or left while it flies.
        const hit = this.arena
          .party()
          .find((p) => !p.safe && Math.abs(bx - p.body.x) < 11 && Math.abs(by + BOLT_HEIGHT - p.body.y) < 14);
        if (hit) this.hurtHero(mob, hit.body, power, lanes !== undefined);
        return hit !== undefined;
      });
      this.emit({
        type: 'bolt',
        x: round1(x),
        y: round1(y),
        vx: round1(vx * shot.speed),
        vy: round1(vy * shot.speed),
        color: shot.color,
      });
    }
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
    const burn = this.pressed(
      this.furious(mob, p, rollDamage(Math.max(1, mob.kind.attack * ray.power), defensePower(p.hero))),
    );
    this.onHurt(p, mobKey(mob.kind) ?? '', burn);
    this.harm(p, burn, mob.body.x, mob.body.y, true);
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

  /**
   * Every player takes the kill's XP and gold (in solo, just the one). `by` is the striker of a sword blow or an arrow: it
   * holds a beat with the blow (hit-pause), and its screen alone gets the kick (the effects carry it as `p`). `opts.from`
   * names the caster of a spell (who has no `by`), `opts.arrow` marks an arrow (a projectile, like a spell, that a shield turns).
   *
   * What a foe does with the blow is its kind's (systems/mobDefense.ts): a hero well under it does less (flat armor
   * on top of its defense) and stuns it for less; a shield turns a frontal arrow or spell aside (it still costs the foe poise,
   * so enough of them break its guard); a foe with poise is only staggered once the blows empty it.
   */
  hitMob(
    mob: Mob,
    rawDamage: number,
    vx: number,
    vy: number,
    bolt = false,
    by?: Player,
    opts: { from?: Player; arrow?: boolean } = {},
  ) {
    const attacker = by ?? opts.from;
    const gap = attacker ? levelGap(mob.kind, attacker.hero.stats.level) : 0;
    // a foe marked by Spirit Mark takes more; the DM's pressure makes the world harder or gentler to hurt
    const armored = afterArmor(rawDamage, gapArmor(gap));
    let damage = Math.max(1, Math.round((armored * this.casting.markFactor(mob)) / this.pressure()));
    const guard = bolt || opts.arrow ? mob.guards(vx, vy) : null;
    if (guard) damage = blockedDamage(damage, guard);
    const boss = !!(mob.kind.named || mob.kind.boss);
    // A kill's death effect waits out the foe's hold (it plays from the mob's own update, in its zone).
    const killed = mob.hit(
      damage,
      vx,
      vy,
      () => {
        this.fx(mob.kind.death ?? 'mobPoof', mob.body.x, mob.body.y - 12, undefined, by?.slot);
        if (boss) this.fx('bossFinale', mob.body.x, mob.body.y - 14 * mob.body.size);
      },
      { poise: poiseCost(bolt), stun: stunFactor(gap) },
    );
    if (by && !bolt && !guard) by.hitstop = Math.max(by.hitstop, heroPauseFor(damage, mob.kind.maxHp, killed, boss));
    this.onDealt(mobKey(mob.kind) ?? '', damage, killed);
    // Sparks fly on from the blow (the bolt has its own impact burst), at chest height; how big and what colour says how
    // hard. A blow the shield turned aside does nothing, so it reads as the faintest spark (a graze), spell or not.
    const tier = HIT_FX[hitTier(damage, mob.kind.maxHp, killed)];
    if (!bolt || guard) this.fx(tier, mob.body.x, mob.body.y - 14 * mob.body.size, Math.atan2(vy, vx), by?.slot);
    this.number(mob.body.x, mob.body.y - 54 * mob.body.size, damage, guard ? 0x9fb4c8 : 0xffffff);
    if (!killed) return;
    this.onKill(this.arena.zone.name, mobKey(mob.kind) ?? '');
    const earned = (p: Player) => Math.round(mob.kind.xp * killShare(p.hero.stats.level, mob.kind));
    const gold = rollGold(mob.kind); // everyone gets the same purse, like the XP
    for (const p of this.arena.party()) {
      this.fx('gainMotes', mob.body.x, mob.body.y - 14 * mob.body.size, undefined, p.slot); // the pay flies to each who earns it
      if (boss) this.cheer(p);
      p.hero.gold += goldFor(p.hero, gold); // gear can add to the purse and the XP, so each player gets their own share
      if (gainXp(p.hero.stats, xpFor(p.hero, earned(p)))) this.levelUp(p);
      this.questNote(p, recordKill(p.hero, mob.kind, this.arena.zone.name)); // a quest counts the kill for everyone here
    }
  }

  /** Pay `p` for something the party did together (a DM's task): XP and gold, with the usual gear bonuses and level-ups. */
  reward(p: Player, xp: number, gold: number) {
    this.arena.inZone(this.arena.zoneOf(p), () => {
      p.hero.gold += goldFor(p.hero, gold);
      this.fx('gainMotes', p.body.x, p.body.y - 30, undefined, p.slot);
      if (gainXp(p.hero.stats, xpFor(p.hero, xp))) this.levelUp(p);
      else this.cheer(p);
    });
  }

  /**
   * A quest moved on (the journal and the tracker hold the words): a ring of pale sparks round the hero and, on the hero's
   * own page, a tick on the HUD tracker (`Visuals.onQuestTick`). A quest that can now be handed in also shimmers.
   */
  questNote(p: Player, progress: Progress | null) {
    if (!progress) return;
    this.fx('questTick', p.body.x, p.body.y - 20, undefined, p.slot);
    if (progress.ready) this.fx('shimmer', p.body.x, p.body.y - 8, undefined, p.slot);
  }

  /** A victory pose and a shower of confetti for something good (a level, a boss, a finished task). */
  cheer(p: Player) {
    if (p.down !== null || p.dm) return;
    this.fx('cheer', p.body.x, p.body.y - 30, undefined, p.slot);
  }

  /** A player gained a level (from a kill or a quest reward). */
  levelUp(p: Player) {
    this.fx('levelRing', p.body.x, p.body.y - 4, undefined, p.slot); // the chime, a ring of light, the body's glow
    this.fx('levelUp', p.body.x, p.body.y - 14);
    this.cheer(p);
  }

  private hurtHero(mob: Mob, victim: Character, power = 1, afterArmor = false) {
    const p = this.arena.party().find((q) => q.body === victim);
    if (!p || p.safe) return;
    // `afterArmor`: the power is a share of the blow that gets through (a fan's bolt is 0.4 of a plain shot at every
    // level), not of the attack before the hero's flat defense, which would leave a bolt at 1 damage in good armour.
    const blow = afterArmor
      ? Math.max(1, Math.round(rollDamage(mob.kind.attack, defensePower(p.hero)) * power))
      : rollDamage(mob.kind.attack * power, defensePower(p.hero));
    const damage = this.pressed(this.furious(mob, p, blow));
    this.onHurt(p, mobKey(mob.kind) ?? '', damage);
    this.harm(p, damage, mob.body.x, mob.body.y);
  }

  /** A foe well over the hero's level hits harder (`furyFactor`, systems/mobDefense.ts): a mistake in its reach is punished. */
  private furious(mob: Mob, p: Player, damage: number): number {
    return Math.round(damage * furyFactor(levelGap(mob.kind, p.hero.stats.level)));
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
    this.number(p.body.x, p.body.y - 54, damage, burn ? 0xff7fd0 : 0xff5a5a);
    const away = Math.atan2(p.body.y - fromY, p.body.x - fromX); // the blow's direction, for the kick on this screen
    this.fx(hurtFx(damage, s.maxHp), p.body.x, p.body.y - 14, burn ? undefined : away, p.slot);
    if (burn) {
      // damage over time: no knockback, no stun, no blinking immunity (the next burn must land), the shot still goes
      if (s.hp <= 0) this.fall(p);
      return;
    }
    p.invuln = INVULN_TIME;
    p.roll = null; // a blow that landed outside the window ends the roll (the knock below wins)
    p.hitstop = Math.max(p.hitstop, HERO_HURT_PAUSE);
    p.pendingShot = null; // a hit spoils the shot
    p.swing = null; // and the swing: a struck hero lands no ghost blow
    p.body.play('hurt');
    const dx = p.body.x - fromX;
    const dy = p.body.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    p.knock = { x: (dx / len) * 220, y: (dy / len) * 220 };
    if (s.hp <= 0) this.fall(p);
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

  /**
   * Out of HP: the hero collapses first (`systems/downfall.ts`) and wakes at the start of the world a moment later
   * (`defeat`). A trial's defeat has its own, instant way out. The DM is never harmed, so never falls.
   */
  private fall(p: Player) {
    if (p.down !== null || p.dm) return;
    if (p.trial !== null) return this.defeat(p);
    p.down = 0;
    p.hitstop = 0;
    p.pendingShot = null;
    p.swing = null;
    p.vel = { x: 0, y: 0 };
    p.body.play('hurt');
    this.fx('fall', p.body.x, p.body.y - 18, undefined, p.slot);
  }

  /** One tick of a hero who is down: lies still and safe (the foes lose interest), and wakes when the time is up. */
  private downTick(p: Player, dt: number) {
    p.down = (p.down ?? 0) + dt;
    p.grace = 1; // nothing can hurt a hero on the ground (and no blink: the pose says it)
    p.moving = false;
    p.sinceHit = 0;
    if (p.knock.x || p.knock.y) {
      this.arena.collision.slide(p.body, p.knock.x * dt, p.knock.y * dt, this.arena.bodies());
      const decay = Math.exp(-12 * dt);
      p.knock = { x: p.knock.x * decay, y: p.knock.y * decay };
      if (Math.hypot(p.knock.x, p.knock.y) < 5) p.knock = { x: 0, y: 0 };
    }
    if (!p.body.acting) p.body.hold('hurt', 5); // the last frame of the fall: flat on the ground
    p.body.alpha = 1;
    p.body.animate(dt * 1000, false);
    if (p.down < DOWN_TOTAL) return;
    p.down = null;
    p.body.release();
    this.defeat(p);
  }

  /** Out of HP, the fall is over: back to the spawn point, fully restored (XP and levels are kept). */
  private defeat(p: Player) {
    if (this.trialDefeat(p)) return;
    const { arena } = this;
    if (!p.dm) this.onDefeat(p, p.zone, p.body.x, p.body.y);
    const home = p === arena.local ? arena.wake() : { zone: arena.home, spot: arena.home.data.spawn };
    const s = p.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    if (p.zone === home.zone.name) {
      p.body.position.set(...cellFeet(home.spot));
      p.body.face('down');
    } else {
      this.zones.travel(p, home.zone, home.spot); // wake at home (the town, else the start of the world), whatever zone it was in
    }
    p.aim = { x: 0, y: 1 };
    p.knock = { x: 0, y: 0 };
    p.vel = { x: 0, y: 0 };
    p.invuln = 0;
    p.pendingShot = null;
    p.swing = null;
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
