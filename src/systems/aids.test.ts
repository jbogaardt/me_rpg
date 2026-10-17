import { afterEach, describe, expect, it } from 'vitest';
import { compassOn, DEFAULT_AIDS, hintsOn, loadAids, saveAids } from './aids';
import { setCapabilities } from './capabilities';

afterEach(() => setCapabilities({}));

const store = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

describe('the map’s aids', () => {
  it('are on by default and survive a save and load', () => {
    const s = store();
    expect(loadAids(s)).toEqual(DEFAULT_AIDS);
    saveAids({ hints: false, compass: true }, s);
    expect(loadAids(s)).toEqual({ hints: false, compass: true });
    saveAids(DEFAULT_AIDS, s);
    expect(s.m.size).toBe(0);
  });

  it('read junk or missing storage as the defaults', () => {
    const s = store();
    s.setItem('me_rpg.aids', '{"hints":3}');
    expect(loadAids(s)).toEqual(DEFAULT_AIDS);
    s.setItem('me_rpg.aids', 'not json');
    expect(loadAids(s)).toEqual(DEFAULT_AIDS);
    expect(loadAids(undefined)).toEqual(DEFAULT_AIDS);
  });

  it('show only when the story and the player both allow them', () => {
    const on = { hints: true, compass: true };
    expect(hintsOn('town', on)).toBe(true);
    expect(hintsOn('town', { ...on, hints: false })).toBe(false);
    setCapabilities({ guide: false, compass: true }, { swamp: { guide: true } });
    expect(hintsOn('town', on)).toBe(false);
    expect(hintsOn('swamp', on)).toBe(true);
    expect(compassOn('town', on)).toBe(true);
    expect(compassOn('town', { ...on, compass: false })).toBe(false);
    setCapabilities({ compass: false });
    expect(compassOn('town', on)).toBe(false);
    expect(hintsOn('town', on)).toBe(true); // the compass and the hints are switched apart
  });
});
