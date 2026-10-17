import { describe, expect, it } from 'vitest';
import { bandKind, bandedKind, rankName } from './bands';
import { killShare, MOB_KINDS, mobLevel } from './combat';
import { heroModel } from './dmBoss';
import { mobKey } from './quests';

const plain = () => Object.entries(MOB_KINDS).filter(([k, m]) => !k.includes('@') && !m.boss && !m.named);

describe('level bands', () => {
  it('make a kind a fair foe at the level asked, keeping what it is', () => {
    for (const [key, base] of plain())
      for (const level of [1, 5, 10, 20, 30, 40]) {
        const k = bandKind(base, level);
        const hero = heroModel(level);
        expect(k.look, key).toBe(base.look);
        expect(k.speed, key).toBe(base.speed);
        expect(k.shot, key).toEqual(base.shot);
        const blow = (k.attack - hero.defense) / hero.hp;
        expect(blow, `${key} at ${level}: a blow`).toBeGreaterThanOrEqual(0.06);
        expect(blow, `${key} at ${level}: a blow`).toBeLessThanOrEqual(0.31);
        const seconds = k.maxHp / Math.max(1, hero.power - k.defense); // blows to kill it
        expect(seconds, `${key} at ${level}: blows to kill`).toBeGreaterThan(1.5); // never a one-shot
        expect(seconds, `${key} at ${level}: blows to kill`).toBeLessThan(80);
      }
  });

  it('grows pay with the level and makes the foe a match for it (full XP, not a faded kill)', () => {
    const orc = MOB_KINDS.orc!;
    const deep = bandKind(orc, 20);
    expect(deep.xp).toBeGreaterThan(orc.xp * 5);
    expect(deep.gold).toBeGreaterThan(orc.gold);
    expect(deep.gold).toBeLessThan(orc.gold * 4); // gold follows the shops, not the XP curve
    expect(mobLevel(deep)).toBe(20);
    expect(killShare(20, deep)).toBe(1);
    expect(killShare(30, deep)).toBeLessThan(1);
  });

  it('is the same kind for the same level, counted under its own key, and left alone at its own level', () => {
    const k = bandedKind('orc', 14)!;
    expect(bandedKind('orc', 14)).toBe(k);
    expect(mobKey(k)).toBe('orc');
    expect(bandedKind('orc')).toBe(MOB_KINDS.orc);
    expect(bandedKind('nothing', 3)).toBeUndefined();
    expect(bandKind(MOB_KINDS.orc!, mobLevel(MOB_KINDS.orc!))).toBe(MOB_KINDS.orc);
  });

  it('never re-bands an authored boss', () => {
    const boss = MOB_KINDS.stillheart!;
    expect(bandKind({ ...boss, named: true }, 30)).toEqual({ ...boss, named: true });
  });

  it('names a foe far past its start by its rank', () => {
    expect(rankName('Orc', 0)).toBe('Orc');
    expect(rankName('Orc', 7)).toBe('Veteran Orc');
    expect(rankName('Orc', 20)).toBe('Ancient Orc');
  });
});
