import { describe, expect, it } from 'vitest';
import { attackPower, gainXp, MOB_KINDS, newHero, spellPower, xpToNext, type Hero, type Item } from './combat';
import { ITEMS } from './items';

// Keeps the weapon classes and the biomes' enemies in step: a bow or a wand is not a better sword, and the deeper
// a kind is meant to be fought, the harder it hits. The numbers are damage per second of plain attacks.

const heroAt = (level: number, weapon: Item): Hero => {
  const hero = newHero();
  while (hero.stats.level < level) gainXp(hero.stats, xpToNext(hero.stats.level));
  hero.weapon = weapon;
  return hero;
};
const dps = (hero: Hero): number => {
  const { weapon } = hero;
  return attackPower(hero) / (weapon.ranged?.cooldown ?? weapon.focus?.cooldown ?? 0.35);
};

describe('weapon balance', () => {
  const swords = [ITEMS.rustySword, ITEMS.bronzeSword, ITEMS.steelSword, ITEMS.silverSword];
  const bows = [ITEMS.shortBow, ITEMS.recurveBow, ITEMS.greatBow];
  const wands = [ITEMS.apprenticeWand, ITEMS.stormcallerWand];
  const tomes = [ITEMS.noviceTome, ITEMS.arcaneGrimoire];

  it('keeps a bow at 60-90% of the sword that costs about as much', () => {
    const pairs = [
      [ITEMS.shortBow, ITEMS.bronzeSword],
      [ITEMS.recurveBow, ITEMS.steelSword],
      [ITEMS.greatBow, ITEMS.silverSword],
    ] as const;
    for (const level of [1, 5, 10])
      for (const [bow, sword] of pairs) {
        const ratio = dps(heroAt(level, bow)) / dps(heroAt(level, sword));
        expect(ratio, `${bow.name} at ${level}`).toBeGreaterThan(0.6);
        expect(ratio, `${bow.name} at ${level}`).toBeLessThan(0.9);
      }
  });

  it('gives a wand or tome a plain bolt below a sword of the same price, and a tome the weakest', () => {
    for (const level of [1, 5, 10]) {
      const sword = dps(heroAt(level, ITEMS.steelSword));
      for (const wand of wands) expect(dps(heroAt(level, wand)), wand.name).toBeLessThan(sword);
      for (const tome of tomes)
        expect(dps(heroAt(level, tome)), tome.name).toBeLessThan(dps(heroAt(level, ITEMS.apprenticeWand)));
    }
  });

  it('keeps every damage combo within 2.5 times a plain bolt (a spell is a burst for mana, not a better sword)', () => {
    for (const item of [...wands, ...tomes])
      for (const level of [1, 5, 10]) {
        const hero = heroAt(level, item);
        for (const c of item.focus.combos) {
          if (c.spell === 'heal' || c.spell === 'ward') continue;
          const each = spellPower(hero) * c.power;
          expect(each, `${item.name} ${c.spell} at ${level}`).toBeLessThan(attackPower(hero) * 2.5);
        }
      }
  });

  it('keeps a ward under a third of the time it can be recast, and swords stepping up each tier', () => {
    for (const tome of tomes) {
      const ward = tome.focus.combos.find((c) => c.spell === 'ward');
      expect(ward).toBeDefined();
      // seconds of immunity per second of mana regeneration (1.5 MP/s)
      expect(ward!.power / (ward!.cost / 1.5), tome.name).toBeLessThan(0.34);
    }
    for (let i = 1; i < swords.length; i++) expect(swords[i]!.attack).toBeGreaterThan(swords[i - 1]!.attack);
    for (let i = 1; i < bows.length; i++) expect(bows[i]!.attack).toBeGreaterThan(bows[i - 1]!.attack);
  });
});

describe('enemy balance', () => {
  const open = ['goblin', 'wolfkin', 'shade', 'raider', 'skeleton', 'zombie', 'orc', 'frostbound', 'troll'];
  const deep = ['hexer', 'bogGhoul', 'warg', 'tuskGuard', 'frostWarden'];

  it('gives the deeper kinds more of everything than the greenwood fodder', () => {
    for (const key of deep) {
      const kind = MOB_KINDS[key]!;
      expect(kind, key).toBeDefined();
      for (const easy of ['goblin', 'wolfkin', 'shade'] as const) {
        expect(kind.maxHp).toBeGreaterThan(MOB_KINDS[easy]!.maxHp);
        expect(kind.attack).toBeGreaterThan(MOB_KINDS[easy]!.attack);
        expect(kind.xp).toBeGreaterThan(MOB_KINDS[easy]!.xp);
      }
    }
  });

  it('pays more XP and gold for more HP, whichever kind it is', () => {
    const kinds = [...open, ...deep].map((k) => MOB_KINDS[k]!);
    for (const a of kinds)
      for (const b of kinds)
        if (a.maxHp * a.attack > b.maxHp * b.attack * 1.5) {
          expect(a.xp, `${a.name} vs ${b.name}`).toBeGreaterThan(b.xp);
          expect(a.gold, `${a.name} vs ${b.name}`).toBeGreaterThan(b.gold);
        }
  });

  it('lets a mid-level hero in typical gear survive a handful of blows, but feel each one', () => {
    // [kind, hero level, typical armour defense for it]
    const cases = [
      ['goblin', 1, 0],
      ['skeleton', 3, 4],
      ['raider', 4, 6],
      ['orc', 5, 8],
      ['frostbound', 5, 8],
      ['troll', 7, 12],
      ['bogGhoul', 7, 12],
      ['tuskGuard', 8, 14],
      ['frostWarden', 8, 14],
    ] as const;
    for (const [key, level, armour] of cases) {
      const kind = MOB_KINDS[key]!;
      const hero = heroAt(level, ITEMS.steelSword);
      const blow = kind.attack - (hero.stats.defense + armour);
      expect(blow / hero.stats.maxHp, `${kind.name} hit on a level ${level} hero`).toBeGreaterThan(0.05);
      expect(blow / hero.stats.maxHp, `${kind.name} hit on a level ${level} hero`).toBeLessThan(0.3);
    }
  });
});
