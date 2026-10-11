import { describe, expect, it } from 'vitest';
import { ADJECTIVES, NOUNS, codeFromHash, joinLink, normalizeCode, randomCode } from './roomCode';

describe('word lists', () => {
  it('are 256 distinct, plain lowercase words each, with no word in both lists', () => {
    for (const list of [ADJECTIVES, NOUNS]) {
      expect(list).toHaveLength(256);
      expect(new Set(list).size).toBe(256);
      for (const word of list) expect(word).toMatch(/^[a-z]{3,11}$/);
    }
    expect(ADJECTIVES.filter((word) => NOUNS.includes(word))).toEqual([]);
  });
});

describe('randomCode', () => {
  it('joins an adjective and a noun, and reaches the ends of both lists', () => {
    expect(randomCode(() => 0)).toBe(`${ADJECTIVES[0]}-${NOUNS[0]}`);
    expect(randomCode((n) => n - 1)).toBe(`${ADJECTIVES[255]}-${NOUNS[255]}`);
  });

  it('only ever makes codes that normalizeCode accepts', () => {
    for (let i = 0; i < 500; i++) {
      const code = randomCode((n) => Math.floor(Math.random() * n));
      expect(normalizeCode(code)).toBe(code);
    }
  });
});

describe('normalizeCode', () => {
  const [adjective, noun] = ['mighty', 'apples'];

  it('accepts a code however it was typed', () => {
    for (const typed of [
      'mighty-apples',
      'Mighty-Apples',
      'MIGHTY APPLES',
      '  mighty   apples ',
      'mighty_apples',
      'mighty.apples',
      'mighty–apples', // an autocorrected en dash
      'mighty-apples.', // punctuation picked up from a chat message
      '"mighty-apples"',
    ]) {
      expect(normalizeCode(typed)).toBe(`${adjective}-${noun}`);
    }
  });

  it('rejects anything that is not exactly an adjective then a noun from the lists', () => {
    for (const bad of [
      '',
      '   ',
      'mighty',
      'apples-mighty', // wrong order
      'mighty-apples-extra',
      'mighty-applez', // a typo
      'mighty-mighty',
      'able-able',
      '12-34',
      '../etc/passwd',
    ]) {
      expect(normalizeCode(bad)).toBeNull();
    }
  });
});

describe('join links', () => {
  it('builds a link and reads the code back from the hash', () => {
    const link = joinLink('https://example.com/me_rpg/', 'mighty-apples');
    expect(link).toBe('https://example.com/me_rpg/#join=mighty-apples');
    expect(codeFromHash(new URL(link).hash)).toBe('mighty-apples');
  });

  it('copes with encoded and messy hashes, and ignores everything else', () => {
    expect(codeFromHash('#join=Mighty%20Apples')).toBe('mighty-apples');
    expect(codeFromHash('#join=%E0%A4%A')).toBeNull(); // malformed escape
    expect(codeFromHash('#join=nonsense')).toBeNull();
    expect(codeFromHash('#offer=zABC')).toBeNull(); // the old manual-code links are gone
    expect(codeFromHash('')).toBeNull();
  });
});
