import { describe, expect, it } from 'vitest';
import { attackPower, gainXp, MOB_KINDS, newHero, spellPower, xpToNext, type Hero, type Item } from './combat';
import { itemOf } from './items';
import { lungeOf, REACH } from '../entities/Mob';

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
  const swords = [itemOf('rustySword'), itemOf('bronzeSword'), itemOf('steelSword'), itemOf('silverSword')];
  const bows = [itemOf('shortBow'), itemOf('recurveBow'), itemOf('greatBow')];
  const wands = [itemOf('apprenticeWand'), itemOf('stormcallerWand')];
  const tomes = [itemOf('noviceTome'), itemOf('arcaneGrimoire')];

  it('keeps a bow at 60-90% of the sword that costs about as much', () => {
    const pairs = [
      [itemOf('shortBow'), itemOf('bronzeSword')],
      [itemOf('recurveBow'), itemOf('steelSword')],
      [itemOf('greatBow'), itemOf('silverSword')],
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
      const sword = dps(heroAt(level, itemOf('steelSword')));
      for (const wand of wands) expect(dps(heroAt(level, wand)), wand.name).toBeLessThan(sword);
      for (const tome of tomes)
        expect(dps(heroAt(level, tome)), tome.name).toBeLessThan(dps(heroAt(level, itemOf('apprenticeWand'))));
    }
  });

  it('keeps every damage combo within 2.5 times a plain bolt (a spell is a burst for mana, not a better sword)', () => {
    for (const item of [...wands, ...tomes])
      for (const level of [1, 5, 10]) {
        const hero = heroAt(level, item);
        for (const c of item.focus!.combos) {
          if (c.spell === 'heal' || c.spell === 'ward') continue;
          const each = spellPower(hero) * c.power;
          expect(each, `${item.name} ${c.spell} at ${level}`).toBeLessThan(attackPower(hero) * 2.5);
        }
      }
  });

  it('keeps a ward under a third of the time it can be recast, and swords stepping up each tier', () => {
    for (const item of [...wands, ...tomes]) {
      const ward = item.focus!.combos.find((c) => c.spell === 'ward');
      if (!ward) continue; // only the Novice Tome has one: no spell is on two weapons
      // seconds of immunity per second of mana regeneration (1.5 MP/s)
      expect(ward.power / (ward.cost / 1.5), item.name).toBeLessThan(0.34);
    }
    for (let i = 1; i < swords.length; i++) expect(swords[i]!.attack!).toBeGreaterThan(swords[i - 1]!.attack!);
    for (let i = 1; i < bows.length; i++) expect(bows[i]!.attack!).toBeGreaterThan(bows[i - 1]!.attack!);
  });
});

describe('enemy balance', () => {
  const open = ['goblin', 'wolfkin', 'shade', 'raider', 'skeleton', 'zombie', 'orc', 'frostbound', 'troll'];
  const deep = ['hexer', 'bogGhoul', 'warg', 'tuskGuard', 'frostWarden', 'snowman'];

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
      ['snowman', 8, 14],
    ] as const;
    for (const [key, level, armour] of cases) {
      const kind = MOB_KINDS[key]!;
      const hero = heroAt(level, itemOf('steelSword'));
      const blow = kind.attack - (hero.stats.defense + armour);
      expect(blow / hero.stats.maxHp, `${kind.name} hit on a level ${level} hero`).toBeGreaterThan(0.05);
      expect(blow / hero.stats.maxHp, `${kind.name} hit on a level ${level} hero`).toBeLessThan(0.3);
    }
  });

  it('keeps the deep kinds out of reach of a fresh hero with the starting sword', () => {
    const hero = newHero();
    for (const key of ['troll', 'bogGhoul', 'tuskGuard', 'frostWarden', 'snowman']) {
      const kind = MOB_KINDS[key]!;
      const blow = kind.attack - hero.stats.defense;
      expect(blow / hero.stats.maxHp, `${kind.name} on a level 1 hero`).toBeGreaterThan(0.8); // a mistake ends it
      const swings = kind.maxHp / Math.max(1, attackPower(hero) - kind.defense);
      expect(swings, `${kind.name}: sword blows at level 1`).toBeGreaterThan(60);
    }
  });

  it('lunges a melee blow past where the sword reaches, quick kinds furthest', () => {
    // The blow's circle reaches 32 px ahead of where the lunge ends; the hero's sword reaches about 38 px. A hero who
    // pokes from the edge of their reach and only steps straight back as the blow comes is still caught.
    const melee = Object.values(MOB_KINDS).filter((k) => !k.shot);
    for (const kind of melee) expect(lungeOf(kind) + 32, kind.name).toBeGreaterThan(38 + 6);
    expect(lungeOf(MOB_KINDS.warg!)).toBeGreaterThan(lungeOf(MOB_KINDS.zombie!));
    expect(REACH).toBeGreaterThan(30);
  });
});
