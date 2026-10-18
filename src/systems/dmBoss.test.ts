import { describe, expect, it } from 'vitest';
import { MOB_KINDS, type MobKind } from './combat';
import {
  BOSS_SCALE,
  bossBase,
  bossKind,
  bossName,
  bossShell,
  bossStats,
  bossTitle,
  bossWhat,
  heroModel,
  nameOfBossTitle,
  parseBossWhat,
} from './dmBoss';

const goblin = (): MobKind => ({ ...MOB_KINDS.goblin!, name: 'Goblin' });

describe('boss', () => {
  it('is the toughest foe of the land by what it is worth', () => {
    const mobs = [
      { key: 'a', xp: 5 },
      { key: 'b', xp: 40 },
      { key: 'c', xp: 12 },
    ];
    expect(bossBase(mobs)?.key).toBe('b');
    expect(bossBase([])).toBeUndefined();
  });

  it('is named from the kind’s own name, the same each time, and varies by kind and land', () => {
    expect(bossName('Goblin', 'fen')).toBe(bossName('Goblin', 'fen'));
    expect(bossName('Goblin', 'fen')).toContain('Goblin');
    const kinds = ['Goblin', 'Troll', 'Wolfkin', 'Orc', 'Shade', 'Zombie'];
    const names = new Set(kinds.flatMap((k) => [bossName(k, 'a'), bossName(k, 'b')]));
    expect(names.size).toBeGreaterThan(8);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(44);
    expect(nameOfBossTitle(bossTitle('the Hollow Goblin King'))).toBe('the Hollow Goblin King');
  });

  it('carries its kind and health in the quest’s what', () => {
    expect(bossWhat('goblin', 480)).toBe('goblin:480');
    expect(parseBossWhat('goblin:480')).toEqual({ key: 'goblin', maxHp: 480 });
    for (const bad of ['goblin', 'goblin:', ':5', 'goblin:x', 'goblin:1234567']) expect(parseBossWhat(bad)).toBeNull();
  });

  it('is the kind drawn as a giant with a level-made body; a friend’s shell agrees on look, size and health', () => {
    const base = goblin();
    const k = bossKind(base, 5, 2, 'the Hollow Goblin King');
    expect(k).toMatchObject({ boss: true, name: 'the Hollow Goblin King', look: base.look, scale: BOSS_SCALE });
    expect(k.maxHp).toBe(bossStats(5, 2).maxHp);
    expect(k.windup!).toBeGreaterThan(base.windup ?? 0.5); // a readable telegraph
    const shell = bossShell(base, k.maxHp, k.name);
    expect(shell).toMatchObject({ boss: true, scale: k.scale, maxHp: k.maxHp, look: k.look });
    expect(bossKind({ ...base, scale: 1.5 }, 5, 2, 'x').scale).toBeCloseTo(1.5 * BOSS_SCALE);
  });

  it('grows with the party’s level and size (a bigger party faces a bigger boss, though not by much more than its numbers)', () => {
    for (let level = 1; level < 14; level++) {
      expect(bossStats(level + 1, 2).maxHp).toBeGreaterThan(bossStats(level, 2).maxHp);
      expect(bossStats(level + 1, 2).xp).toBeGreaterThan(bossStats(level, 2).xp);
      expect(bossStats(level, 3).maxHp).toBeGreaterThan(bossStats(level, 2).maxHp);
      expect(bossStats(level, 3).maxHp).toBeLessThan(bossStats(level, 1).maxHp * 3 ** 2);
    }
    expect(heroModel(1).hp).toBe(30);
    expect(heroModel(8).power).toBeGreaterThan(heroModel(3).power);
  });
});
