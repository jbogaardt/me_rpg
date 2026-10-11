import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { CHEST_LOOTS, collect } from './chests';

describe('collect', () => {
  it('wears gear that beats what the hero has', () => {
    const hero = newHero();
    const found = collect(hero, CHEST_LOOTS.steelSword!);
    expect(hero.weapon.name).toBe('Steel Sword');
    expect(found.gear).toBe(hero.weapon);
  });

  it('keeps better gear', () => {
    const hero = newHero();
    collect(hero, CHEST_LOOTS.silverSword!);
    const found = collect(hero, CHEST_LOOTS.bronzeSword!);
    expect(hero.weapon.name).toBe('Silver Sword');
    expect(found.gear).toBeUndefined();
  });

  it('puts armor in the armor slot', () => {
    const hero = newHero();
    collect(hero, CHEST_LOOTS.leatherArmor!);
    expect(hero.armor.name).toBe('Leather Armor');
  });

  it('restores HP and MP without going over the maximum', () => {
    const hero = newHero();
    hero.stats.hp = 5;
    hero.stats.mp = 0;
    collect(hero, CHEST_LOOTS.potion!);
    expect(hero.stats.hp).toBe(25);
    collect(hero, CHEST_LOOTS.elixir!);
    expect(hero.stats.hp).toBe(hero.stats.maxHp);
    expect(hero.stats.mp).toBe(20);
  });

  it('awards XP and reports level-ups', () => {
    const hero = newHero();
    expect(collect(hero, CHEST_LOOTS.relic!).levels).toBeGreaterThanOrEqual(1);
  });
});
