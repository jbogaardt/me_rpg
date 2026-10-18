import { describe, expect, it } from 'vitest';
import {
  attackPower,
  gainXp,
  MOB_KINDS,
  mobLevel,
  mobTimings,
  newHero,
  spellPower,
  xpToNext,
  type Hero,
  type Item,
} from './combat';
import { FAN_WINDUP, spreadGap } from './mobDefense';
import { itemOf } from './items';
import { lungeOf, REACH } from '../entities/Mob';
import { bossKind, fightOdds, heroModel } from './dmBoss';

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

describe("fan balance (a caster's spread shot)", () => {
  const fans = Object.entries(MOB_KINDS).filter(([, k]) => k.shot?.spread);
  const HIT_X = 11; // the bolt's hit box around a hero (Simulation.mobShoot): half its width and height
  const HIT_Y = 14;
  /** Seconds and damage of one plain-shot cycle and of the fan cycle, against a typical hero of the kind's own level. */
  const cost = (key: string) => {
    const kind = MOB_KINDS[key]!;
    const { shot } = kind;
    const spread = shot!.spread!;
    const hero = heroModel(mobLevel(kind));
    const t = mobTimings(kind);
    const plain = Math.max(1, kind.attack - hero.defense);
    const bolt = Math.max(1, Math.round(plain * spread.power)); // a share of the blow that gets through (`Simulation.hurtHero`)
    const plainTime = t.windup + t.recover;
    const fanTime = t.windup * FAN_WINDUP + spread.recover;
    // Worst case: the hero stands still in the lanes and every bolt lands (the i-frames only ever make it less).
    const mixed = ((spread.every - 1) * plain + spread.count * bolt) / ((spread.every - 1) * plainTime + fanTime);
    return { kind, spread, hero, plain, bolt, plainDps: plain / plainTime, mixedDps: mixed, fanTime, plainTime };
  };

  it("exists on one caster only: the fan is a special, not a trash mob's shot", () => {
    expect(fans.map(([k]) => k)).toEqual(['wraith']);
  });

  it.each(fans.map(([k]) => k))(
    '%s costs at most 1.25x its plain shots in damage per second, all bolts landing',
    (key) => {
      const c = cost(key);
      expect(c.mixedDps / c.plainDps).toBeLessThanOrEqual(1.25);
      expect(c.mixedDps / c.plainDps).toBeGreaterThan(0.5); // and it is not a punishment to fight either
    },
  );

  it.each(fans.map(([k]) => k))('%s: a whole fan landing is a fraction of the hero, a bolt is a scratch', (key) => {
    const c = cost(key);
    expect((c.spread.count * c.bolt) / c.hero.hp).toBeLessThan(0.35);
    expect(c.bolt / c.plain).toBeGreaterThan(0.3); // about 0.4 of a plain shot, in any armour
    expect(c.bolt / c.plain).toBeLessThan(0.5);
    expect(c.spread.recover).toBeGreaterThanOrEqual(1.4);
    expect(c.spread.recover).toBeLessThanOrEqual(1.6);
  });

  it.each(fans.map(([k]) => k))('%s: a lane-free gap exists at every range the caster shoots from', (key) => {
    const { kind, spread } = cost(key);
    expect(spreadGap(spread)).toBeGreaterThanOrEqual(30);
    const tan = Math.tan((spreadGap(spread) * Math.PI) / 180);
    // From 40 px (the caster's cornered) a hero fits between two lanes (22 px wide)...
    for (let d = 40; d <= kind.shot!.range; d += 8) expect(d * tan - 2 * HIT_X, `gap at ${d} px`).toBeGreaterThan(0);
    // ...and from where it holds off (a 0.4 share of its range) with room to spare, the tallest way (28 px).
    for (let d = kind.shot!.range * 0.4; d <= kind.shot!.range; d += 8)
      expect(d * tan - 2 * HIT_Y, `gap at ${d} px`).toBeGreaterThan(0);
  });

  it.each(fans.map(([k]) => k))(
    '%s: its bolts are slow enough to step out of and its windup long enough to read',
    (key) => {
      const c = cost(key);
      expect(c.kind.shot!.speed).toBeGreaterThanOrEqual(110);
      expect(c.kind.shot!.speed).toBeLessThanOrEqual(140);
      expect(c.kind.windup! * FAN_WINDUP * 0.8).toBeGreaterThanOrEqual(0.6); // even the shortest jittered fan windup
      expect(c.spread.every).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('boss balance', () => {
  // A boss (dmBoss.ts) is made for the party's level and size, whatever kind it is drawn from: a real fight, not a walk-over.
  const base = () => MOB_KINDS.goblin!;
  const levels = Array.from({ length: 14 }, (_, i) => i + 1);

  it('is beatable by a party of its level and size, and not trivial: they last 1.15 to 2.5 times as long as it takes to kill it', () => {
    for (const level of levels)
      for (const size of [1, 2, 3, 4]) {
        const odds = fightOdds(level, size, bossKind(base(), level, size, 'the Boss'));
        const ratio = odds.last / odds.kill;
        expect(ratio, `level ${level}, party of ${size}`).toBeGreaterThan(1.15);
        expect(ratio, `level ${level}, party of ${size}`).toBeLessThan(2.5);
      }
  });

  it('takes a real while to kill, and a blow of it is felt (a fifth to a third of a hero) at every level', () => {
    for (const level of levels) {
      const kind = bossKind(base(), level, 1, 'the Boss');
      const hero = heroModel(level);
      expect(kind.maxHp / (hero.power - kind.defense), `blows at level ${level}`).toBeGreaterThan(8);
      const blow = (kind.attack - hero.defense) / hero.hp;
      expect(blow, `a blow at level ${level}`).toBeGreaterThan(0.18);
      expect(blow, `a blow at level ${level}`).toBeLessThan(0.4);
    }
  });

  it('is out of reach of a party that is far under its level, and an easy kill for one far over it', () => {
    const boss = bossKind(base(), 8, 2, 'the Boss');
    const under = fightOdds(3, 2, boss);
    expect(under.last / under.kill).toBeLessThan(1);
    const over = fightOdds(14, 2, boss);
    expect(over.last / over.kill).toBeGreaterThan(2.5);
  });

  it('pays a fifth of a level for its kill (the quest pays the rest, richer than a hunt)', () => {
    for (const level of [1, 5, 10])
      expect(bossKind(base(), level, 2, 'the Boss').xp).toBe(Math.round(xpToNext(level) * 0.2));
  });
});
