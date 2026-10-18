import { directionToward } from '../../core/direction';
import type { Player } from '../../entities/Player';
import { CELL } from '../../map/types';
import { round1, type WorldEvent } from '../../net/protocol';
import { attackPower, rollDamage, spellPower } from '../../systems/combat';
import {
  EDGE_CHARGES,
  EDGE_SECONDS,
  GUARD_SECONDS,
  heroCombos,
  MARK_BONUS,
  MARK_REACH_CELLS,
  MARK_SECONDS,
  MARK_STING,
  SKILLS,
  VOLLEY_BOLTS,
  VOLLEY_POWER,
  type SkillCombo,
} from '../../systems/skills';
import { SPELLS, type Combo, type Focus } from '../../systems/spells';
import { recordCast } from '../../systems/quests';
import type { Mob } from '../../entities/Mob';
import type { Arena } from './Arena';
import {
  BLAST_RADIUS,
  BLAST_REACH,
  BOLT_HEIGHT,
  BOLT_SPEED,
  CHAIN_RANGE,
  COMBO_COOLDOWN,
  DASH_DISTANCE,
  DASH_GRACE,
  DRAIN_RADIUS,
  DRAIN_SHARE,
  FAN_STEP,
  FREEZE_RADIUS,
  GALE_COS,
  GALE_RANGE,
  HELP_RADIUS,
  LANCE_RANGE,
  LANCE_WIDTH,
  NOVA_RADIUS,
  SMITE_RANGE,
  SPELL_SPEED,
  VORTEX_RADIUS,
} from './constants';
import type { Simulation } from './Simulation';
import type { Visuals } from './Visuals';

/** Did the spell go off? A spell that cannot do anything (nobody to hit, nobody hurt) costs no mana. */
type Cast = boolean;

/**
 * What a wand or tome does: its plain bolt, and the spells its combos cast. Solo and host only, like the rest of the
 * rules (a guest sends the finished combo's index and watches the result). A spell is drawn here and told to the
 * friends through the simulation's `text`/`fx` and the `bolt` event, so a guest needs no spell code, only the effects.
 * Damage and healing come from `spellPower` (the magic stat plus the weapon's power) times the combo's `power`.
 */
export class Casting {
  constructor(
    private arena: Arena,
    private visuals: Visuals,
    private sim: Simulation,
    private emit: (e: WorldEvent) => void,
  ) {}

  /** Foes marked by Spirit Mark, and until when (the arena's clock). */
  private marks = new WeakMap<Mob, number>();

  /** How much more a foe takes right now: 1, or more while Spirit Mark is on it. */
  markFactor(mob: Mob): number {
    return (this.marks.get(mob) ?? 0) > this.arena.clock ? 1 + MARK_BONUS : 1;
  }

  /** A wand's or tome's plain attack: a free bolt along the aim, as strong as the weapon's attack. */
  basic(p: Player, focus: Focus) {
    p.attackCooldown = focus.cooldown;
    p.body.play('cast');
    this.bolt(p, p.aim.x, p.aim.y, attackPower(p.hero) + this.sim.takeEdge(p), BOLT_SPEED); // Arcane Edge adds to it
  }

  /** The player finished combo `index` of what they can cast (the wand or tome in hand, then their skills): cast it if there is mana. */
  combo(p: Player, index: number) {
    const combo = heroCombos(p.hero, p.zone)[index];
    if (!combo || p.castCooldown > 0) return;
    const { stats } = p.hero;
    const { x, y } = p.body;
    if (stats.mp < combo.cost) {
      p.castCooldown = COMBO_COOLDOWN;
      this.sim.text(x, y - 54, 'No MP', 0x8fb3ff);
      return;
    }
    if (p.mouseAim) p.body.face(directionToward(p.aim.x, p.aim.y));
    p.body.play('cast');
    if (!(combo.skill ? this.skill(p, combo) : this.cast(p, combo))) return;
    stats.mp -= combo.cost;
    p.castCooldown = COMBO_COOLDOWN;
    this.sim.fx('castGlow', x, y - 22, undefined, p.slot);
    this.sim.text(x, y - 66, combo.skill ? SKILLS[combo.skill].name : SPELLS[combo.spell].name, 0xcfe8ff);
    this.sim.onCast(p, p.zone, combo.skill ?? combo.spell);
    this.sim.questNote(p, recordCast(p.hero, p.zone)); // a quest of spells counts it
  }

  // --- Skills (learned from the trainer; any weapon) ---

  private skill(p: Player, { skill }: SkillCombo): Cast {
    switch (skill) {
      case 'arcaneEdge':
        return this.edge(p);
      case 'sparkVolley':
        return this.fan(p, { keys: '', spell: 'fan', cost: 0, power: VOLLEY_POWER, count: VOLLEY_BOLTS });
      case 'ironSkin':
        return this.guard(p);
      case 'spiritMark':
        return this.mark(p);
    }
  }

  /** Arcane Edge: the next few attacks, with whatever is in hand, carry extra magic. */
  private edge(p: Player): Cast {
    p.edge = { charges: EDGE_CHARGES, timer: EDGE_SECONDS };
    this.sim.fx('ward', p.body.x, p.body.y - 14);
    return true;
  }

  /** Iron Skin: for a few seconds blows do less (Simulation reads `Player.guard` when it hurts the hero). */
  private guard(p: Player): Cast {
    p.guard = GUARD_SECONDS;
    this.sim.fx('ward', p.body.x, p.body.y - 14);
    return true;
  }

  /** Spirit Mark: a pulse that stings the foes near you and marks them to take more from everything for a while. */
  private mark(p: Player): Cast {
    const reach = MARK_REACH_CELLS * CELL;
    const near = this.arena.mobs.filter((m) => m.alive && dist(m.body, p.body) <= reach);
    if (!near.length) {
      this.sim.text(p.body.x, p.body.y - 54, 'No target', 0x8fb3ff);
      return false;
    }
    this.sim.fx('nova', p.body.x, p.body.y - 14);
    const sting = spellPower(p.hero) * MARK_STING;
    for (const mob of near) {
      const [ux, uy] = unit(mob.body.x - p.body.x, mob.body.y - p.body.y);
      this.hit(p, mob, rollDamage(sting, mob.kind.defense), ux, uy, true); // before the mark: only later hits take more
      if (!mob.alive) continue;
      this.marks.set(mob, this.arena.clock + MARK_SECONDS);
      this.sim.fx('blink', mob.body.x, mob.body.y - 18);
      this.sim.text(mob.body.x, mob.body.y - 66, 'Marked', 0xd9a8ff);
    }
    return true;
  }

  // --- The spells ---

  private cast(p: Player, combo: Combo): Cast {
    switch (combo.spell) {
      case 'bolt':
        return this.bolt(p, p.aim.x, p.aim.y, spellPower(p.hero) * combo.power, SPELL_SPEED);
      case 'fan':
        return this.fan(p, combo);
      case 'chain':
        return this.chain(p, combo);
      case 'dash':
        return this.dash(p, combo);
      case 'nova':
        return this.nova(p, combo);
      case 'blast':
        return this.blast(p, combo);
      case 'heal':
        return this.heal(p, combo);
      case 'ward':
        return this.ward(p, combo);
      case 'lance':
        return this.lance(p, combo);
      case 'smite':
        return this.smite(p, combo);
      case 'gale':
        return this.gale(p, combo);
      case 'drain':
        return this.drain(p, combo);
      case 'freeze':
        return this.freeze(p, combo);
      case 'vortex':
        return this.vortex(p, combo);
    }
  }

  /** A bolt from the caster's hands along (ux, uy): `damage` is the power before the foe's defense. */
  private bolt(p: Player, ux: number, uy: number, damage: number, speed: number): Cast {
    const x = p.body.x + ux * 10;
    const y = p.body.y - BOLT_HEIGHT + uy * 8;
    const [vx, vy] = [ux * speed, uy * speed];
    this.visuals.bolt(
      x,
      y,
      vx,
      vy,
      (mob) => this.hit(p, mob, rollDamage(damage, mob.kind.defense), ux, uy, true),
      p.slot,
    );
    this.emit({ type: 'bolt', x: round1(x), y: round1(y), vx: round1(vx), vy: round1(vy), p: p.slot });
    return true;
  }

  /** Several bolts spread evenly round the aim. */
  private fan(p: Player, c: Combo): Cast {
    const n = c.count ?? 3;
    const damage = spellPower(p.hero) * c.power;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * FAN_STEP;
      const [cos, sin] = [Math.cos(a), Math.sin(a)];
      this.bolt(p, p.aim.x * cos - p.aim.y * sin, p.aim.x * sin + p.aim.y * cos, damage, SPELL_SPEED);
    }
    return true;
  }

  /** Lightning leaps to the nearest foes in range, at once. With nobody to hit it does nothing. */
  private chain(p: Player, c: Combo): Cast {
    const near = this.arena.mobs
      .filter((m) => m.alive && dist(m.body, p.body) <= CHAIN_RANGE)
      .sort((a, b) => dist(a.body, p.body) - dist(b.body, p.body))
      .slice(0, c.count ?? 3);
    if (!near.length) {
      this.sim.text(p.body.x, p.body.y - 54, 'No target', 0x8fb3ff);
      return false;
    }
    const damage = spellPower(p.hero) * c.power;
    for (const mob of near) {
      this.sim.fx('zap', mob.body.x, mob.body.y - 16);
      const [ux, uy] = unit(mob.body.x - p.body.x, mob.body.y - p.body.y);
      this.hit(p, mob, rollDamage(damage, mob.kind.defense), ux, uy, true);
    }
    return true;
  }

  /** Move forward up to DASH_DISTANCE (stopping at walls), hurting every foe along the way and shrugging off hits a moment. */
  private dash(p: Player, c: Combo): Cast {
    const { collision } = this.arena;
    const { x: ux, y: uy } = p.aim;
    const [x0, y0] = [p.body.x, p.body.y];
    for (let moved = 0; moved < DASH_DISTANCE; moved += 6) {
      const [x, y] = [p.body.x, p.body.y];
      collision.slide(p.body, ux * 6, uy * 6, this.arena.bodies());
      if (p.body.x === x && p.body.y === y) break;
    }
    p.vel = { x: 0, y: 0 };
    p.grace = Math.max(p.grace, DASH_GRACE);
    const damage = spellPower(p.hero) * c.power;
    for (const mob of this.arena.mobs) {
      if (!mob.alive || distToSegment(mob.body, x0, y0, p.body.x, p.body.y) > 22) continue;
      this.hit(p, mob, rollDamage(damage, mob.kind.defense), ux, uy);
    }
    this.sim.fx('blink', x0, y0 - 14);
    this.sim.fx('blink', p.body.x, p.body.y - 14);
    return true;
  }

  /** A burst of force round the caster. */
  private nova(p: Player, c: Combo): Cast {
    const damage = spellPower(p.hero) * c.power;
    this.sim.fx('nova', p.body.x, p.body.y - 14);
    this.hitAround(p, p.body, NOVA_RADIUS, damage);
    return true;
  }

  /** A crash of fire where the caster aims, as far as the way ahead is open. */
  private blast(p: Player, c: Combo): Cast {
    const { collision } = this.arena;
    const { x: ux, y: uy } = p.aim;
    let reach = 0;
    while (reach < BLAST_REACH) {
      const next = reach + 8;
      if (collision.isBlocked(Math.floor((p.body.x + ux * next) / CELL), Math.floor((p.body.y + uy * next) / CELL)))
        break;
      reach = next;
    }
    const at = { x: p.body.x + ux * reach, y: p.body.y + uy * reach };
    this.sim.fx('blast', at.x, at.y - 8);
    this.hitAround(p, at, BLAST_RADIUS, spellPower(p.hero) * c.power);
    return true;
  }

  /** Heal the caster and the friends close by. Nothing happens when nobody is hurt. */
  private heal(p: Player, c: Combo): Cast {
    const amount = Math.max(1, Math.round(spellPower(p.hero) * c.power));
    const hurt = this.friends(p).filter((q) => q.hero.stats.hp < q.hero.stats.maxHp);
    if (!hurt.length) {
      this.sim.text(p.body.x, p.body.y - 54, 'Full HP', 0x8fb3ff);
      return false;
    }
    for (const q of hurt) {
      const s = q.hero.stats;
      const gained = Math.min(amount, Math.ceil(s.maxHp - s.hp));
      s.hp = Math.min(s.maxHp, s.hp + amount);
      this.sim.fx('heal', q.body.x, q.body.y - 10);
      this.sim.text(q.body.x, q.body.y - 54, `+${gained}`, 0x7dff8f);
    }
    return true;
  }

  /** The caster and friends close by take no damage for `power` seconds. */
  private ward(p: Player, c: Combo): Cast {
    for (const q of this.friends(p)) {
      q.ward = Math.max(q.ward, c.power);
      this.sim.fx('ward', q.body.x, q.body.y - 14);
    }
    return true;
  }

  /** Lightning along the aim: every foe on a long line takes the hit (the line stops at a wall). */
  private lance(p: Player, c: Combo): Cast {
    const { collision } = this.arena;
    const { x: ux, y: uy } = p.aim;
    let reach = 0;
    while (reach < LANCE_RANGE) {
      const next = reach + 8;
      if (collision.isBlocked(Math.floor((p.body.x + ux * next) / CELL), Math.floor((p.body.y + uy * next) / CELL)))
        break;
      reach = next;
    }
    const end = { x: p.body.x + ux * reach, y: p.body.y + uy * reach };
    for (let d = CELL * 2; d <= reach; d += CELL * 3) this.sim.fx('zap', p.body.x + ux * d, p.body.y + uy * d - 14);
    const damage = spellPower(p.hero) * c.power;
    for (const mob of this.arena.mobs) {
      if (!mob.alive || distToSegment(mob.body, p.body.x, p.body.y, end.x, end.y) > LANCE_WIDTH) continue;
      this.hit(p, mob, rollDamage(damage, mob.kind.defense), ux, uy, true);
    }
    return true;
  }

  /** A heavy strike on the nearest foe in range. With nobody to hit it does nothing. */
  private smite(p: Player, c: Combo): Cast {
    const target = this.nearest(p, SMITE_RANGE);
    if (!target) return this.noTarget(p);
    this.sim.fx('blast', target.body.x, target.body.y - 8);
    this.sim.fx('zap', target.body.x, target.body.y - 16);
    const [ux, uy] = unit(target.body.x - p.body.x, target.body.y - p.body.y);
    this.hit(p, target, rollDamage(spellPower(p.hero) * c.power, target.kind.defense), ux, uy, true);
    return true;
  }

  /** A gust in a cone ahead: foes in it are hurt and blown back. */
  private gale(p: Player, c: Combo): Cast {
    const { x: ux, y: uy } = p.aim;
    const near = this.arena.mobs.filter((m) => {
      if (!m.alive) return false;
      const d = dist(m.body, p.body);
      if (d > GALE_RANGE) return false;
      const [mx, my] = unit(m.body.x - p.body.x, m.body.y - p.body.y);
      return d < 12 || mx * ux + my * uy >= GALE_COS;
    });
    if (!near.length) return this.noTarget(p);
    for (const d of [1.2, 2.6, 4]) this.sim.fx('blink', p.body.x + ux * d * CELL, p.body.y + uy * d * CELL - 14);
    const damage = spellPower(p.hero) * c.power;
    for (const mob of near) this.hit(p, mob, rollDamage(damage, mob.kind.defense), ux * 2.4, uy * 2.4, true);
    return true;
  }

  /** Hurt the foes close round the caster and take back a share of the damage as health. */
  private drain(p: Player, c: Combo): Cast {
    const near = this.arena.mobs.filter((m) => m.alive && dist(m.body, p.body) <= DRAIN_RADIUS);
    if (!near.length) return this.noTarget(p);
    const damage = spellPower(p.hero) * c.power;
    let dealt = 0;
    for (const mob of near) {
      const hit = rollDamage(damage, mob.kind.defense);
      dealt += hit;
      this.sim.fx('zap', mob.body.x, mob.body.y - 16);
      const [ux, uy] = unit(mob.body.x - p.body.x, mob.body.y - p.body.y);
      this.hit(p, mob, hit, ux, uy, true);
    }
    const s = p.hero.stats;
    const gained = Math.min(Math.round(dealt * DRAIN_SHARE), Math.ceil(s.maxHp - s.hp));
    if (gained > 0) {
      s.hp = Math.min(s.maxHp, s.hp + gained);
      this.sim.fx('heal', p.body.x, p.body.y - 10);
      this.sim.text(p.body.x, p.body.y - 54, `+${gained}`, 0x7dff8f);
    }
    return true;
  }

  /** Freeze the foes round the caster still for `count` seconds, with a little damage. */
  private freeze(p: Player, c: Combo): Cast {
    const near = this.arena.mobs.filter((m) => m.alive && dist(m.body, p.body) <= FREEZE_RADIUS);
    if (!near.length) return this.noTarget(p);
    this.sim.fx('frost', p.body.x, p.body.y - 12);
    const damage = spellPower(p.hero) * c.power;
    for (const mob of near) {
      const [ux, uy] = unit(mob.body.x - p.body.x, mob.body.y - p.body.y);
      this.hit(p, mob, rollDamage(damage, mob.kind.defense), ux * 0.2, uy * 0.2, true);
      if (!mob.alive) continue;
      mob.freeze(c.count ?? 2);
      this.sim.fx('frost', mob.body.x, mob.body.y - 14);
    }
    return true;
  }

  /** Drag the foes near the caster in toward them, hurting them on the way. */
  private vortex(p: Player, c: Combo): Cast {
    const near = this.arena.mobs.filter((m) => m.alive && dist(m.body, p.body) <= VORTEX_RADIUS);
    if (!near.length) return this.noTarget(p);
    this.sim.fx('nova', p.body.x, p.body.y - 14);
    const damage = spellPower(p.hero) * c.power;
    for (const mob of near) {
      const [ux, uy] = unit(p.body.x - mob.body.x, p.body.y - mob.body.y); // toward the caster
      this.sim.fx('blink', mob.body.x, mob.body.y - 16);
      this.hit(p, mob, rollDamage(damage, mob.kind.defense), ux * 2.6, uy * 2.6, true);
    }
    return true;
  }

  // --- Helpers ---

  /** A spell's blow on a foe: the simulation is told who cast it (their level sets how a high-level foe takes it). */
  private hit(p: Player, mob: Mob, damage: number, vx: number, vy: number, bolt = false) {
    this.sim.hitMob(mob, damage, vx, vy, bolt, undefined, { from: p });
  }

  /** The nearest living foe within `range` of the caster. */
  private nearest(p: Player, range: number): Mob | undefined {
    return this.arena.mobs
      .filter((m) => m.alive && dist(m.body, p.body) <= range)
      .sort((a, b) => dist(a.body, p.body) - dist(b.body, p.body))[0];
  }

  /** Say there was nobody to hit: the spell costs no mana. */
  private noTarget(p: Player): Cast {
    this.sim.text(p.body.x, p.body.y - 54, 'No target', 0x8fb3ff);
    return false;
  }

  /** The caster and the other players within Mend/Ward range (this zone). */
  private friends(p: Player): Player[] {
    return this.arena.players().filter((q) => !q.dm && (q === p || dist(q.body, p.body) <= HELP_RADIUS));
  }

  /** Hit every foe within `radius` of `at`, knocking it away from the centre. */
  private hitAround(p: Player, at: { x: number; y: number }, radius: number, power: number) {
    for (const mob of this.arena.mobs) {
      if (!mob.alive || dist(mob.body, at) > radius) continue;
      const [ux, uy] = unit(mob.body.x - at.x, mob.body.y - at.y);
      this.hit(p, mob, rollDamage(power, mob.kind.defense), ux, uy, true);
    }
  }
}

type Pos = { x: number; y: number };
const dist = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.y - b.y);

/** The unit vector along (dx, dy); straight down when both are 0. */
function unit(dx: number, dy: number): [number, number] {
  const len = Math.hypot(dx, dy);
  return len ? [dx / len, dy / len] : [0, 1];
}

/** How far `p` is from the segment (x0, y0)-(x1, y1). */
function distToSegment(p: Pos, x0: number, y0: number, x1: number, y1: number): number {
  const [sx, sy] = [x1 - x0, y1 - y0];
  const len2 = sx * sx + sy * sy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - x0) * sx + (p.y - y0) * sy) / len2)) : 0;
  return Math.hypot(p.x - (x0 + t * sx), p.y - (y0 + t * sy));
}
