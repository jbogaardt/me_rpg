import { describe, expect, it } from 'vitest';
import { newHero } from '../systems/combat';
import { gainText } from './LevelSplash';

describe('gainText', () => {
  it('lists only what grew', () => {
    const a = newHero().stats;
    const b = { ...a, level: a.level + 1, maxHp: a.maxHp + 6, maxMp: a.maxMp, attack: a.attack + 2 };
    expect(gainText(a, b)).toBe('+6 HP · +2 Attack');
  });

  it('is empty when nothing grew', () => {
    const a = newHero().stats;
    expect(gainText(a, { ...a })).toBe('');
  });
});
