import { describe, expect, it } from 'vitest';
import { CELL, type DoorSpawn } from '../../map/types';
import { readFriend } from './DmBot';

const gap: DoorSpawn = { col: 99, row: 50, w: 1, dir: 'right', to: { zone: 'east', col: 0, row: 50 } };
const dm = { name: 'west', data: { doors: [gap], indoor: false }, x: 97 * CELL, y: 50 * CELL };
const friend = (zone: string, col: number, row: number) => ({ slot: 3, zone, x: col * CELL, y: row * CELL, hp: 1 });

describe('how the DM bot reads a friend (it went to a player who stood beside it, 11 times in one run)', () => {
  it('is near a friend a few steps past the gap, though their zone has another name', () => {
    const f = readFriend(dm, friend('east', 3, 50)); // 104 cells over in this zone's reckoning: 7 cells from the DM
    expect(f.near).toBe(true);
    expect(f.cells).toBeCloseTo(7, 0);
    expect(f.toward).toBeUndefined(); // the stroll does not walk through a gap
  });
  it('is not near a friend far into the next zone, nor one in a zone not next door', () => {
    expect(readFriend(dm, friend('east', 60, 50)).near).toBe(false);
    const far = readFriend(dm, friend('shop', 3, 3));
    expect(far.near).toBe(false);
    expect(far.cells).toBeNull();
  });
  it('leads on a friend in the same zone', () => {
    const f = readFriend(dm, friend('west', 90, 50));
    expect(f.near).toBe(true);
    expect(f.toward?.cells).toBeCloseTo(7, 0);
  });
});
