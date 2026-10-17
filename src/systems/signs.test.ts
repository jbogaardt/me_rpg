import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SIGN_NOWHERE_WORDS } from './dmVoice';
import { ZONE_NAMES } from './places';
import { exitsOf, liveWays, signKey, signLines, signNear, waysText, type SignMap } from './signs';

describe('signposts', () => {
  const door = (dir: 'up' | 'down' | 'left' | 'right' | undefined, zone: string) => ({
    col: 0,
    row: 0,
    w: 1,
    to: { zone, col: 1, row: 1 },
    ...(dir ? { dir } : {}),
  });
  const place = (name: string) => ({ col: 5, row: 5, name });
  const map = (doors: SignMap['doors'], places: string[] = [], indoor = false): SignMap => ({
    doors,
    indoor,
    places: places.map(place),
  });
  const saved = { ...ZONE_NAMES };
  beforeEach(() => {
    Object.assign(ZONE_NAMES, { town: 'Lanternrest', eastwood: 'The Eastwood', undead: 'The Barrow Lands' });
  });
  afterEach(() => {
    for (const k of Object.keys(ZONE_NAMES)) delete ZONE_NAMES[k];
    Object.assign(ZONE_NAMES, saved);
  });

  it('names each way with its arrow, north, west, east then south', () => {
    const data = map(
      [door('down', 'town'), door('right', 'eastwood'), door('up', 'undead'), door('left', 'town')],
      ['The Crossroads'],
    );
    const ways = { down: 'town', right: 'eastwood', up: 'undead', left: 'The Crossroads' };
    expect(signLines(ways, data)).toEqual([
      '↑ North: The Barrow Lands\n← West: The Crossroads\n→ East: The Eastwood\n↓ South: Lanternrest',
    ]);
  });

  it('says the zone actually reached that way, not the one the map was authored with', () => {
    const data = map([door('right', 'town')]);
    expect(liveWays({ right: 'eastwood' }, data)).toEqual({ right: 'town' });
  });

  it('keeps a place of this map, and drops a way with nothing beyond it', () => {
    const data = map([door('up', 'undead')], ['The Crossroads']);
    expect(liveWays({ up: 'town', left: 'The Crossroads', down: 'town', right: 'eastwood' }, data)).toEqual({
      up: 'undead',
      left: 'The Crossroads',
    });
  });

  it('drops a way whose port is sealed (no door on that side), and ignores doors that name no way', () => {
    const data = map([door(undefined, 'town'), door('up', 'undead')]);
    expect(exitsOf(data)).toEqual({ up: 'undead' });
    expect(liveWays({ down: 'town', up: 'undead' }, data)).toEqual({ up: 'undead' });
  });

  it('a room has no exits', () => {
    expect(exitsOf(map([door('up', 'undead')], [], true))).toEqual({});
  });

  it('falls back to the zone key when it has no name', () => {
    expect(waysText({ up: 'unknown_zone' })).toBe('↑ North: unknown_zone');
  });

  it('with no way left, says the road goes nowhere, in the DM’s voice', () => {
    const data = map([]);
    for (const i of [0, 1, 2])
      expect(signLines({ up: 'town' }, data, undefined, () => i)).toEqual([SIGN_NOWHERE_WORDS[i]]);
    expect(SIGN_NOWHERE_WORDS.length).toBeGreaterThanOrEqual(2);
  });

  it('a rewrite by the Dungeon Master wins, a page per line', () => {
    const data = map([door('up', 'undead')]);
    expect(signLines({ up: 'town' }, data, ['Beware the goat.', 'Seriously.'])).toEqual([
      'Beware the goat.',
      'Seriously.',
    ]);
    expect(signLines({ up: 'town' }, data, [])).toEqual(['↑ North: The Barrow Lands']);
    expect(signKey(3, 7)).toBe('3,7');
  });

  it('finds the nearest sign within reach, whichever way the player faces', () => {
    const signs = [
      { col: 2, row: 2, ways: {} },
      { col: 4, row: 2, ways: {} },
    ];
    expect(signNear(signs, 3.8 * 32, 2.5 * 32, 48)).toBe(signs[1]);
    expect(signNear(signs, 2.5 * 32, 3.9 * 32, 48)).toBe(signs[0]);
    expect(signNear(signs, 10 * 32, 10 * 32, 48)).toBeUndefined();
  });
});
