import { describe, expect, it } from 'vitest';
import { parseMap } from '../map/types';
import { doorArrival, portArrival, wireDoors } from './ports';

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
