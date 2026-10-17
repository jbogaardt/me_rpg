import { describe, expect, it } from 'vitest';
import { bandNote, bandText, duel, foeProblem, gateWords, gated, setZoneLevels, standing, zoneLevels } from './levels';

const goblin = { hp: 22, attack: 8, defense: 0 };
const zombie = { hp: 68, attack: 16, defense: 1 };
const troll = { hp: 176, attack: 32, defense: 6 };

describe('level bands', () => {
  it('knows where a hero stands against a band', () => {
    expect(standing(2, [3, 5])).toBe('under');
    expect(standing(3, [3, 5])).toBe('fit');
    expect(standing(5, [3, 5])).toBe('fit');
    expect(standing(6, [3, 5])).toBe('over');
  });

  it('gates only a hero more than `slack` levels under the lowest', () => {
    expect(gated(2, [4, 5], 1)).toBe(true);
    expect(gated(3, [4, 5], 1)).toBe(false);
    expect(gated(1, [1, 2], 0)).toBe(false);
    expect(gated(3, [4, 5], 0)).toBe(true);
  });

  it('words the band and the hero’s standing', () => {
    expect(bandText([4, 5])).toBe('Levels 4–5');
    expect(bandText([3, 3])).toBe('Level 3');
    expect(bandNote(2, [4, 5])).toContain('tough for you');
    expect(bandNote(4, [4, 5])).toBe('Levels 4–5');
    expect(bandNote(9, [4, 5])).toContain('outgrown');
    expect(gateWords([4, 5])).toBe('Levels 4\u20135: come back stronger');
  });

  it('installs and clears the bands', () => {
    setZoneLevels({ cave: [4, 5] });
    expect(zoneLevels('cave')).toEqual([4, 5]);
    setZoneLevels({});
    expect(zoneLevels('cave')).toBeUndefined();
  });
});

describe('is a foe a fair fight', () => {
  it('a zombie kills a level-1 hero in two hits; a troll takes a hundred blows', () => {
    expect(duel(zombie, 1)).toEqual({ blows: 12, hits: 2 });
    expect(duel(troll, 1).blows).toBe(176);
  });

  it('flags a foe that is deadly or a slog at the band’s lowest level', () => {
    expect(foeProblem(zombie, [1, 2])?.kind).toBe('deadly');
    expect(foeProblem(troll, [4, 5])?.kind).toBe('slog');
    expect(foeProblem(zombie, [3, 4])).toBeNull();
  });

  it('flags a foe that is no fight at the top of the band', () => {
    expect(foeProblem(goblin, [1, 4])?.kind).toBe('trivial');
    expect(foeProblem(goblin, [1, 2])).toBeNull();
  });
});
