import { mobAttack, REACH } from '../entities/Mob';
import { itemOf } from './items';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attackPower,
  defensePower,
  gainXp,
  levelGains,
  MOB_KINDS,
  mobTimings,
  newHero,
  rollDamage,
  spellPower,
  xpToNext,
  type MobKind,
} from './combat';

afterEach(() => vi.restoreAllMocks());

describe('rollDamage', () => {
  it('spreads power by ±15% and subtracts defense', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // low roll: 0.85x
    expect(rollDamage(20, 0)).toBe(17);
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // high roll: ~1.15x
    expect(rollDamage(20, 0)).toBe(23);
    expect(rollDamage(20, 5)).toBe(18);
  });

  it('never deals less than 1', () => {
    expect(rollDamage(1, 50)).toBe(1);
    expect(rollDamage(0, 0)).toBe(1);
  });
});

describe('gainXp', () => {
  it('accumulates XP below the threshold without levelling', () => {
    const { stats } = newHero();
    expect(gainXp(stats, 5)).toBe(0);
    expect(stats).toMatchObject({ level: 1, xp: 5, maxHp: 30 });
  });

  it('levels up, carries the remainder and restores HP/MP', () => {
    const { stats } = newHero();
    stats.hp = 3;
    stats.mp = 0;
    expect(gainXp(stats, xpToNext(1) + 4)).toBe(1);
    expect(stats).toMatchObject({ level: 2, xp: 4, maxHp: 36, maxMp: 24, attack: 7, defense: 2, magic: 10 });
    expect(stats.hp).toBe(36);
    expect(stats.mp).toBe(24);
  });

  it('can gain several levels from one big reward', () => {
    const { stats } = newHero();
    expect(gainXp(stats, xpToNext(1) + xpToNext(2) + xpToNext(3))).toBe(3);
    expect(stats.level).toBe(4);
    expect(stats.xp).toBe(0);
  });

  it('needs more XP at higher levels, and the step between levels grows too', () => {
    expect([1, 2, 5, 10].map(xpToNext)).toEqual([20, 57, 224, 632]);
    for (let level = 1; level < 30; level++) {
      const step = xpToNext(level + 1) - xpToNext(level);
      expect(step).toBeGreaterThan(xpToNext(level) - xpToNext(Math.max(1, level - 1)));
    }
  });

  it('gives bigger stat gains as levels go up', () => {
    expect(levelGains(2)).toEqual({ maxHp: 6, maxMp: 4, attack: 2, defense: 1, magic: 2 });
    expect(levelGains(4)).toEqual({ maxHp: 8, maxMp: 5, attack: 3, defense: 1, magic: 3 });
    expect(levelGains(8)).toEqual({ maxHp: 10, maxMp: 6, attack: 4, defense: 2, magic: 4 });
  });

  it('applies the gains of each level it passes through', () => {
    const { stats } = newHero();
    gainXp(
      stats,
      [1, 2, 3].reduce((sum, level) => sum + xpToNext(level), 0),
    ); // 1 -> 4
    expect(stats).toMatchObject({ level: 4, maxHp: 30 + 6 + 6 + 8, attack: 5 + 2 + 2 + 3, defense: 1 + 1 + 1 + 1 });
  });
});

describe('power helpers', () => {
  it('add gear and weapon bonuses to the base stats', () => {
    const hero = newHero();
    expect(attackPower(hero)).toBe(hero.stats.attack + (hero.weapon.attack ?? 0));
    expect(defensePower(hero)).toBe(hero.stats.defense + (hero.cape?.defense ?? 0));
    expect(spellPower(hero)).toBe(hero.stats.magic); // a sword adds nothing to spells
    hero.weapon = itemOf('apprenticeWand');
    expect(spellPower(hero)).toBe(hero.stats.magic + itemOf('apprenticeWand').focus!.power);
  });

  it('count every piece of gear: armor and shields add defense, a second blade adds attack', () => {
    const hero = newHero();
    const [attack, defense] = [attackPower(hero), defensePower(hero)];
    Object.assign(hero, {
      head: itemOf('greatHelm'),
      chest: itemOf('plateArmor'),
      legs: itemOf('steelGreaves'),
      feet: itemOf('steelBoots'),
      offhand: itemOf('parryingDagger'),
    });
    expect(defensePower(hero)).toBe(defense + 3 + 4 + 2 + 2);
    expect(attackPower(hero)).toBe(attack + 2);
    hero.offhand = itemOf('kiteShield');
    expect(attackPower(hero)).toBe(attack);
    expect(defensePower(hero)).toBe(defense + 3 + 4 + 2 + 2 + 3);
  });
});

describe('MOB_KINDS', () => {
  it.each(Object.entries(MOB_KINDS))('%s is a playable enemy', (_key, kind) => {
    expect(kind.maxHp).toBeGreaterThan(0);
    expect(kind.speed).toBeGreaterThan(0);
    expect(kind.sight).toBeGreaterThan(0);
    expect(kind.look.body).toBeTruthy(); // every kind needs at least a body to be drawn
  });

  it.each(Object.entries(MOB_KINDS))('%s has sane pacing', (_key, kind) => {
    const { windup, recover, stagger } = mobTimings(kind);
    // The telegraph must stay readable: a hero needs about a third of a second to see it and step away.
    expect(windup).toBeGreaterThanOrEqual(0.25);
    expect(recover).toBeGreaterThan(0);
    expect(stagger).toBeGreaterThanOrEqual(0);
    expect(stagger).toBeLessThan(windup + recover); // a stun never outlasts a whole attack cycle
  });

  it.each(Object.entries(MOB_KINDS).filter(([, k]) => k.ray))(
    '%s fires a ray only from beyond melee reach and within sight',
    (_name, kind) => {
      const ray = kind.ray!;
      expect(kind.shot).toBeUndefined();
      expect(ray.range).toBeGreaterThan(REACH);
      expect(ray.range).toBeLessThanOrEqual(kind.sight);
      expect(ray.tick).toBeGreaterThan(0);
      expect(ray.duration).toBeGreaterThan(ray.tick);
      expect(ray.rest).toBeGreaterThan(0);
      // held for its full duration it burns less than the kind's melee would in the same time (one blow per second)
      expect((kind.attack * ray.power * ray.duration) / ray.tick).toBeLessThan(kind.attack * ray.duration);
      expect(mobAttack(kind, ray.range - 1, false)).toBeNull(); // resting: it closes in instead
      expect(mobAttack(kind, REACH - 1)).toBe('melee');
      expect(mobAttack(kind, ray.range - 1)).toBe('ray');
      expect(mobAttack(kind, ray.range + 1)).toBeNull();
      expect(kind.windup ?? 0.45).toBeGreaterThanOrEqual(0.5); // time to leave before it connects
    },
  );

  it.each(Object.entries(MOB_KINDS).filter(([, k]) => k.shot))(
    '%s fires dodgeable shots from within sight',
    (_key, kind) => {
      const shot = kind.shot!;
      const HERO_SPEED = 120; // OverworldScene SPEED
      expect(shot.range).toBeGreaterThan(0);
      expect(shot.range).toBeLessThanOrEqual(kind.sight); // it must be able to start shooting once it sees the hero
      expect(shot.speed).toBeGreaterThan(0);
      expect(shot.speed).toBeLessThan(HERO_SPEED * 1.6); // a sidestep after release still works
      expect(shot.color).toBeLessThanOrEqual(0xffffff);
      expect(kind.windup ?? 0.45).toBeGreaterThanOrEqual(0.5); // ranged attacks telegraph longer than a swing
    },
  );

  it('mobTimings falls back to the shared defaults', () => {
    const plain: MobKind = {
      name: 'x',
      look: { body: 'body.light' },
      maxHp: 1,
      attack: 1,
      defense: 0,
      xp: 1,
      gold: 1,
      speed: 1,
      sight: 1,
    };
    expect(mobTimings(plain)).toEqual({ windup: 0.45, recover: 0.7, stagger: 0.3 });
    expect(mobTimings({ ...plain, windup: 0.3, stagger: 0 })).toEqual({
      windup: 0.3,
      recover: 0.7,
      stagger: 0,
    });
  });

  it('the starter hero can always hurt a starter mob', () => {
    const hero = newHero();
    for (const kind of Object.values(MOB_KINDS)) expect(attackPower(hero) - kind.defense).toBeGreaterThan(0);
  });
});
