import { describe, expect, it } from 'vitest';
import { parseMap } from '../map/types';
import { doorArrival, openPort, portArrival, wireDoors } from './ports';

const map = (
  ports: {
    name: string;
    col: number;
    row: number;
    w: number;
    h?: number;
    arrive: { col: number; row: number };
    seal?: unknown[];
  }[],
) => parseMap({ version: 2, width: 10, height: 10, ground: new Array(100).fill(null), collision: [5], ports });

describe('ports', () => {
  const data = map([
    { name: 'north', col: 4, row: 0, w: 2, arrive: { col: 4, row: 2 } },
    { name: 'east', col: 9, row: 5, w: 1, arrive: { col: 7, row: 5 } },
  ]);

  it('makes a bound port a door to the other map’s port and walls up the rest', () => {
    const wired = wireDoors(data, { north: { map: 'b', port: 'south' } });
    expect(wired.doors).toEqual([{ col: 4, row: 0, w: 2, to: { zone: 'b', col: -1, row: -1, port: 'south' } }]);
    expect(wired.collision).toEqual([5, 59]); // east (9,5) is blocked
    expect(data.doors).toEqual([]); // the map itself is untouched
    expect(data.collision).toEqual([5]);
  });

  it('knows the edge each port is on, and draws a sealed one closed', () => {
    const rock = { s: 0, x: 0, y: 0, w: 32, h: 32, px: 288, py: 160 };
    const side = map([
      { name: 'east', col: 9, row: 4, w: 1, h: 3, arrive: { col: 7, row: 5 }, seal: [rock] },
      { name: 'south', col: 4, row: 9, w: 2, arrive: { col: 4, row: 7 } },
    ]);
    expect(side.ports.map((p) => [p.name, p.side, p.h])).toEqual([
      ['east', 'east', 3],
      ['south', 'south', 1],
    ]);
    const open = wireDoors(side, { south: { map: 'b', port: 'north' } });
    expect(open.collision).toEqual([5, 49, 59, 69]); // the east column, all three cells
    expect(open.objects).toEqual([rock]); // its rockfall is drawn
    expect(open.doors[0]).toMatchObject({ col: 4, row: 9, w: 2 });
    const both = wireDoors(side, { south: { map: 'b', port: 'north' }, east: { map: 'c', port: 'west' } });
    expect(both.objects).toEqual([]);
    expect(both.doors.find((d) => d.to.zone === 'c')).toMatchObject({ col: 9, row: 4, w: 1, h: 3 });
  });

  it('opens a sealed port of a zone already built: its door, the cells to clear and the seal to fade', () => {
    const rock = { s: 0, x: 0, y: 0, w: 32, h: 32, px: 288, py: 160 };
    const log = { s: 0, x: 32, y: 0, w: 32, h: 32, px: 128, py: 288 };
    const side = map([
      { name: 'east', col: 9, row: 4, w: 1, h: 3, arrive: { col: 7, row: 5 }, seal: [rock] },
      { name: 'south', col: 4, row: 9, w: 2, arrive: { col: 4, row: 7 }, seal: [log, log] },
    ]);
    const before = wireDoors(side, undefined); // both sealed: rock at 0, the two logs at 1 and 2
    const open = openPort(side, undefined, 'south', { map: 'b', port: 'north' })!;
    expect(open.door).toMatchObject({ col: 4, row: 9, w: 2, to: { zone: 'b', port: 'north' } });
    expect(open.cells).toEqual([94, 95]);
    expect(open.seal).toEqual([1, 2]);
    expect(open.seal.map((i) => before.objects[i])).toEqual([log, log]);
    // Opened once, it is a door: wiring the map again with the binding gives the same door and no seal for it.
    const after = wireDoors(side, { south: { map: 'b', port: 'north' } });
    expect(after.doors).toEqual([open.door]);
    expect(after.collision).not.toContain(94);
    expect(openPort(side, { south: { map: 'b', port: 'north' } }, 'south', { map: 'b', port: 'north' })).toBeNull();
    expect(openPort(side, undefined, 'west', { map: 'b', port: 'east' })).toBeNull();
    // With the south already open, the east's rock is still the first seal drawn.
    expect(openPort(side, { south: { map: 'b', port: 'north' } }, 'east', { map: 'c', port: 'west' })!.seal).toEqual([
      0,
    ]);
  });

  it('leaves a map with no ports as it is', () => {
    const plain = map([]);
    expect(wireDoors(plain, { north: { map: 'b', port: 'south' } })).toBe(plain);
  });

  it('puts a player coming in through a port at its arrival', () => {
    expect(portArrival(data, 'east')).toEqual({ col: 7, row: 5 });
    expect(portArrival(data, 'nowhere')).toEqual(data.spawn);
    const [door] = wireDoors(data, { north: { map: 'b', port: 'east' } }).doors;
    expect(doorArrival(door!, data)).toEqual({ col: 7, row: 5 });
    expect(doorArrival({ col: 0, row: 0, w: 1, to: { zone: 'b', col: 3, row: 4 } }, data)).toEqual({
      zone: 'b',
      col: 3,
      row: 4,
    });
  });
});
