import { describe, expect, it } from 'vitest';
import { RefCache } from './sheetCache';

function cache(spares: number) {
  const made: string[] = [];
  const evicted: string[] = [];
  const c = new RefCache<{ key: string }>(spares, (v) => evicted.push(v.key));
  const get = (key: string) =>
    c.acquire(key, () => {
      made.push(key);
      return { key };
    });
  return { c, get, made, evicted };
}

describe('RefCache', () => {
  it('shares one value per key while it is in use', () => {
    const { c, get, made } = cache(0);
    const a = get('a');
    expect(get('a')).toBe(a);
    expect(made).toEqual(['a']);
    expect(c.refs('a')).toBe(2);
  });

  it('frees a value once its last user lets go, when there is no room for spares', () => {
    const { c, get, evicted } = cache(0);
    const a = get('a');
    get('a');
    c.release(a);
    expect(evicted).toEqual([]);
    c.release(a);
    expect(evicted).toEqual(['a']);
    expect(c.size).toBe(0);
  });

  it('keeps the most recently released values as spares and reuses them', () => {
    const { c, get, made, evicted } = cache(2);
    const [a, b, d] = [get('a'), get('b'), get('d')];
    c.release(a);
    c.release(b);
    expect(evicted).toEqual([]);
    expect(get('a')).toBe(a); // a spare comes back without being made again
    expect(made).toEqual(['a', 'b', 'd']);
    c.release(d);
    c.release(a);
    expect(evicted).toEqual(['b']); // the oldest spare goes first
    expect(c.size).toBe(2);
  });

  it('swapping to the same value keeps it (acquire before release)', () => {
    const { c, get, evicted } = cache(0);
    const a = get('a');
    const again = get('a');
    c.release(a);
    expect(again).toBe(a);
    expect(evicted).toEqual([]);
    expect(c.refs('a')).toBe(1);
  });

  it('ignores values it did not make and extra releases', () => {
    const { c, get, evicted } = cache(0);
    c.release({ key: 'stranger' });
    const a = get('a');
    c.release(a);
    c.release(a);
    expect(evicted).toEqual(['a']);
  });
});
