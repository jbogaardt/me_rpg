import { describe, expect, it } from 'vitest';
import { cleanSay, Cooldown, MAX_SAY, smitePlan } from './dmPowers';

const counter = () => {
  let n = 0;
  return () => ((n = (n * 7 + 3) % 10) + 0.5) / 10;
};

describe('cleanSay', () => {
  it('trims, joins lines and caps the length', () => {
    expect(cleanSay('  hello\n  there  ')).toBe('hello there');
    expect(cleanSay('x'.repeat(MAX_SAY + 50))).toHaveLength(MAX_SAY);
    expect(cleanSay('  \n ')).toBe('');
  });
});

describe('smitePlan', () => {
  it('does nothing when there are no foes', () => {
    expect(smitePlan([], counter())).toEqual([]);
  });

  it('kills every foe exactly once, in a storm that does not drag on', () => {
    const foes = Array.from({ length: 40 }, (_, i) => ({ x: i * 30, y: (i % 5) * 20 }));
    const bolts = smitePlan(foes, counter());
    const kills = bolts.flatMap((b) => (b.kill === null ? [] : [b.kill]));
    expect([...kills].sort((a, b) => a - b)).toEqual(foes.map((_, i) => i));
    expect(Math.max(...bolts.map((b) => b.at))).toBeLessThan(2.6);
    expect(bolts.some((b) => b.kill === null)).toBe(true); // a few for show
    for (const b of bolts) if (b.kill !== null) expect([b.x, b.y]).toEqual([foes[b.kill]!.x, foes[b.kill]!.y]);
  });

  it('spreads a few foes out rather than striking all at once', () => {
    const bolts = smitePlan(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      counter(),
    );
    const times = bolts.filter((b) => b.kill !== null).map((b) => b.at);
    expect(times[1]! - times[0]!).toBeGreaterThan(0);
  });
});

describe('Cooldown', () => {
  it('blocks a second use until it has run out', () => {
    const c = new Cooldown(10);
    expect(c.use()).toBe(true);
    expect(c.use()).toBe(false);
    expect(c.wait).toBe(10);
    c.tick(9.5);
    expect(c.ready).toBe(false);
    expect(c.wait).toBe(1);
    c.tick(1);
    expect(c.use()).toBe(true);
  });
});
