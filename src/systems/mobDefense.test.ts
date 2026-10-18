import { describe, expect, it } from 'vitest';
import { bossKind, BOSS_POISE } from './dmBoss';
import { attackPower, gainXp, MOB_KINDS, newHero, rollDamage, xpToNext, type MobKind } from './combat';
import {
  afterArmor,
  blockedDamage,
  CHARGE_DEFAULTS,
  frontal,
  furyFactor,
  gapArmor,
  GAP_START,
  GUARD_DEFAULTS,
  levelGap,
  Poise,
  POISE_HEAVY,
  POISE_LIGHT,
  POISE_REGEN,
  poiseCost,
  resolveCharge,
  resolveSprint,
  spreadAngles,
  SPRINT_DEFAULTS,
  resolveGuard,
  stunFactor,
  respawnWait,
  RESPAWN_CAP,
} from './mobDefense';

const kind = (over: Partial<MobKind> = {}): MobKind => ({ ...MOB_KINDS.troll!, ...over });

describe('poise', () => {
  it('breaks only once the blows add up, light ones costing 1 and spells 2', () => {
    const p = new Poise(4);
    expect(p.take(poiseCost(false))).toBe(false); // 3 left
    expect(p.take(poiseCost(true))).toBe(false); // 1 left
    expect(p.take(POISE_LIGHT)).toBe(true);
    expect(poiseCost(true)).toBe(POISE_HEAVY);
  });

  it('is no poise at all when the max is 0: every blow breaks it', () => {
    const p = new Poise(0);
    expect(p.armed).toBe(false);
    expect(p.take(1)).toBe(true);
    p.tick(10);
    expect(p.current).toBe(0);
  });

  it('mends fully after the regen time unhurt, but not before, and a blow restarts the count', () => {
    const p = new Poise(5);
    p.take(3);
    p.tick(POISE_REGEN - 0.1);
    expect(p.current).toBe(2);
    p.take(1); // hurt again: the wait starts over
    p.tick(POISE_REGEN - 0.1);
    expect(p.current).toBe(1);
    p.tick(0.2);
    expect(p.current).toBe(5);
  });

  it('takes a kind-specific regen time', () => {
    const p = new Poise(3, 0.5);
    p.take(2);
    p.tick(0.6);
    expect(p.current).toBe(3);
  });
});

describe('level gap', () => {
  it('is nothing for a boss or a named foe (made for the party, not read from its body)', () => {
    expect(levelGap(kind({ boss: true }), 1)).toBe(0);
    expect(levelGap(kind({ named: true }), 1)).toBe(0);
    expect(levelGap(kind({ level: 10 }), 4)).toBe(6);
  });

  it('changes nothing until the foe is GAP_START levels over the hero', () => {
    for (const gap of [-5, 0, 1, GAP_START - 1]) {
      expect(stunFactor(gap)).toBe(1);
      expect(furyFactor(gap)).toBe(1);
      expect(gapArmor(gap)).toBe(0);
    }
  });

  it('then cuts the stun sharply, raises its damage (to at most double) and adds armor', () => {
    let [stun, fury, armor] = [1, 1, 0];
    for (const gap of [GAP_START, GAP_START + 1, GAP_START + 2, GAP_START + 3]) {
      expect(stunFactor(gap)).toBeLessThan(stun);
      expect(furyFactor(gap)).toBeGreaterThan(fury);
      expect(gapArmor(gap)).toBeGreaterThan(armor);
      [stun, fury, armor] = [stunFactor(gap), furyFactor(gap), gapArmor(gap)];
    }
    expect(stunFactor(GAP_START)).toBe(0.5);
    expect(stunFactor(40)).toBe(0.1);
    expect(furyFactor(40)).toBe(2);
  });
});

describe('flat armor', () => {
  it('subtracts and never goes below 1', () => {
    expect(afterArmor(10, 4)).toBe(6);
    expect(afterArmor(3, 9)).toBe(1);
  });

  it('keeps an early-game hero from chipping down an elite: every blow is the floor of 1', () => {
    const hero = newHero(); // level 1 with the starting kit
    const elite = MOB_KINDS.tuskGuard!;
    const gap = levelGap(elite, hero.stats.level);
    expect(gap).toBeGreaterThanOrEqual(GAP_START);
    for (let i = 0; i < 50; i++) {
      const dealt = afterArmor(rollDamage(attackPower(hero), elite.defense), gapArmor(gap));
      expect(dealt).toBe(1);
    }
    // 176 hp at 1 damage a swing is 176 swings (a minute of it, under its blows): no attrition
    expect(elite.maxHp / 1).toBeGreaterThan(100);
  });

  it('lets a hero of the foe’s own level hurt it properly', () => {
    const hero = newHero();
    const elite = MOB_KINDS.tuskGuard!;
    while (hero.stats.level < 9) gainXp(hero.stats, xpToNext(hero.stats.level));
    expect(gapArmor(levelGap(elite, hero.stats.level))).toBe(0);
    expect(attackPower(hero) - elite.defense).toBeGreaterThan(5);
  });
});

describe('guard', () => {
  it('turns a blow aside when it comes at the face and not when it comes from behind or beside', () => {
    // the foe looks right (+x); a bolt flying left (-x) comes at its face
    expect(frontal(1, 0, -1, 0, 120)).toBe(true);
    expect(frontal(1, 0, -1, -0.5, 120)).toBe(true); // off-centre but inside the arc
    expect(frontal(1, 0, 1, 0, 120)).toBe(false); // from behind
    expect(frontal(1, 0, 0, 1, 120)).toBe(false); // from the side (90 degrees, past the 60 half-arc)
    expect(frontal(1, 0, 0, 0, 120)).toBe(false); // no direction: not frontal
  });

  it('lets only the kind’s chip through a block (nothing by default)', () => {
    expect(blockedDamage(20, resolveGuard())).toBe(0);
    expect(blockedDamage(20, resolveGuard({ chip: 0.25 }))).toBe(5);
    expect(resolveGuard()).toEqual(GUARD_DEFAULTS);
  });
});

describe('charge', () => {
  it('starts from sensible defaults the content may override one field at a time', () => {
    expect(resolveCharge()).toEqual(CHARGE_DEFAULTS);
    expect(resolveCharge({ after: 2 })).toEqual({ ...CHARGE_DEFAULTS, after: 2 });
    expect(CHARGE_DEFAULTS.range).toBe(96); // three cells
    expect(CHARGE_DEFAULTS.after).toBe(1.5);
    expect(CHARGE_DEFAULTS.speed).toBeGreaterThan(120); // faster than the hero walks, or it is no gap-closer
  });
});

describe('sprint', () => {
  it('outruns the hero for a medium burst, one field at a time', () => {
    expect(resolveSprint()).toEqual(SPRINT_DEFAULTS);
    expect(resolveSprint({ duration: 0.8 })).toEqual({ ...SPRINT_DEFAULTS, duration: 0.8 });
    expect(SPRINT_DEFAULTS.speed).toBeGreaterThan(120);
  });
});

describe('spread', () => {
  it('fans bolts evenly around the aim', () => {
    expect(spreadAngles(0.5, { count: 1, arc: 40 })).toEqual([0.5]);
    const a = spreadAngles(0, { count: 3, arc: 60 });
    expect(a[1]).toBeCloseTo(0);
    expect(a[2]! - a[1]!).toBeCloseTo(Math.PI / 6);
    expect(a[0]).toBeCloseTo(-a[2]!);
    expect(spreadAngles(0, { count: 4, arc: 90 })).toHaveLength(4);
  });
});

describe('a Dungeon Master boss', () => {
  it('is poised and made for the party, so the level gap never touches it', () => {
    const boss = bossKind(MOB_KINDS.goblin!, 12, 2, 'the Goblin King');
    expect(boss.poiseMax).toBeGreaterThanOrEqual(BOSS_POISE);
    expect(levelGap(boss, 1)).toBe(0);
    expect(boss.level).toBe(12);
  });
});

describe('respawn (farming)', () => {
  it('keeps a foe down longer each time it falls, to a cap', () => {
    expect(respawnWait(0)).toBe(60);
    expect(respawnWait(1)).toBe(90);
    expect(respawnWait(2)).toBe(135);
    expect(respawnWait(50)).toBe(RESPAWN_CAP);
  });
});
