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
    expect(hero.bag.map((i) => i.name)).toEqual(['Rusty Sword', 'Bronze Sword']); // the replaced and the unused, both kept
  });

  it('puts each piece of gear in its own slot', () => {
    const hero = newHero();
    collect(hero, CHEST_LOOTS.leatherArmor!);
    collect(hero, CHEST_LOOTS.greatHelm!);
    collect(hero, CHEST_LOOTS.steelGreaves!);
    collect(hero, CHEST_LOOTS.ironBoots!);
    collect(hero, CHEST_LOOTS.kiteShield!);
    expect([hero.chest, hero.head, hero.legs, hero.feet, hero.offhand].map((i) => i?.name)).toEqual([
      'Leather Armor',
      'Great Helm',
      'Steel Greaves',
      'Iron Boots',
      'Kite Shield',
    ]);
    expect(hero.weapon.name).toBe('Rusty Sword'); // none of that touched the weapon
    expect(hero.cape?.name).toBe("Traveler's Cloak");
  });

  it('takes anything for an empty slot but only upgrades for a filled one', () => {
    const hero = newHero();
    expect(collect(hero, CHEST_LOOTS.clothHood!).gear?.name).toBe('Cloth Hood'); // the head starts bare
    expect(collect(hero, CHEST_LOOTS.legionHelm!).gear?.name).toBe('Legion Helm');
    expect(collect(hero, CHEST_LOOTS.nasalHelm!).gear).toBeUndefined();
    expect(hero.head?.name).toBe('Legion Helm');
  });

  it('wields a bow in place of a sword', () => {
    const hero = newHero();
    expect(collect(hero, CHEST_LOOTS.recurveBow!).gear?.ranged).toBeDefined();
    expect(hero.weapon.name).toBe('Recurve Bow');
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

  it('holds gold', () => {
    const hero = newHero();
    expect(collect(hero, CHEST_LOOTS.purse!).text).toBe('+90 gold');
    expect(hero.gold).toBe(90);
  });

  it('awards XP and reports level-ups', () => {
    const hero = newHero();
    expect(collect(hero, CHEST_LOOTS.relic!).levels).toBeGreaterThanOrEqual(1);
  });
});
