import { describe, expect, it } from 'vitest';
import { Phrasebook, hashOf, seeded } from './phrases';

describe('several ways of saying the same thing', () => {
  it('says every line once before any comes back, and never the same twice running', () => {
    const book = new Phrasebook();
    const lines = ['a', 'b', 'c', 'd'];
    const first = Array.from({ length: 4 }, () => book.pick('k', lines));
    expect([...first].sort()).toEqual(lines);
    let last = first[3];
    for (let i = 0; i < 40; i++) {
      const next = book.pick('k', lines);
      expect(next).not.toBe(last);
      last = next;
    }
  });

  it('keeps each moment apart and copes with one line or none', () => {
    const book = new Phrasebook(() => 0);
    expect(book.pick('a', ['x', 'y'])).toBe('x');
    expect(book.pick('b', ['x', 'y'])).toBe('x');
    expect(book.pick('a', ['x', 'y'])).toBe('y');
    expect(book.pick('c', ['only'])).toBe('only');
    expect(book.pick('c', ['only'])).toBe('only');
    expect(book.pick('d', [])).toBe('');
  });

  it('picks the same line from the same seed on every page', () => {
    expect(seeded(['a', 'b', 'c'], hashOf('hunt goblin'))).toBe(seeded(['a', 'b', 'c'], hashOf('hunt goblin')));
  });
});
