import { describe, expect, it } from 'vitest';
import type { GateSpawn, MapData, MapObject } from '../map/types';
import { allDoors, gateAlphas, wireGates } from './gates';

const obj = (px: number): MapObject => ({ s: 0, x: 0, y: 0, w: 32, h: 32, px, py: 0 });
const map = (gates: GateSpawn[], collision: number[] = []): MapData =>
  ({ width: 10, height: 10, objects: [obj(0)], doors: [], collision, gates }) as unknown as MapData;
const lake: GateSpawn = {
  name: 'lake',
  col: 2,
  row: 3,
  w: 2,
  h: 1,
  reveal: [obj(64)],
  door: { zone: 'vault', col: 1, row: 1 },
};
const wall: GateSpawn = { name: 'wall', col: 5, row: 5, w: 1, h: 2, seal: [obj(160), obj(192)] };

describe('wireGates', () => {
  it('leaves a map without gates as it is', () => {
    const data = map([]);
    expect(wireGates(data, () => true).data).toBe(data);
  });

  it('blocks a shut gate and seals it, but makes no door yet', () => {
    const { data, layouts } = wireGates(map([lake, wall]), () => true);
    expect(data.collision).toEqual([32, 33, 55, 65]); // lake (2,3),(3,3), wall (5,5),(5,6)
    expect(data.doors).toEqual([]);
    expect(layouts.map((l) => l.open)).toEqual([false, false]);
  });

  it('makes an open gate a door and leaves its cells alone', () => {
    const { data, layouts } = wireGates(map([lake]), () => false);
    expect(data.collision).toEqual([]);
    expect(data.doors).toEqual([{ col: 2, row: 3, w: 2, to: { zone: 'vault', col: 1, row: 1 } }]);
    expect(layouts[0]?.open).toBe(true);
  });

  it('blocks only the cells the map leaves open, so opening never clears real terrain', () => {
    const { layouts } = wireGates(map([lake], [32]), () => true);
    expect(layouts[0]?.cells).toEqual([33]);
  });

  it('appends every seal and reveal object, shown by the gate state', () => {
    const shut = wireGates(map([wall, lake]), (name) => name === 'wall');
    expect(shut.data.objects).toHaveLength(4);
    expect(gateAlphas(shut.layouts)).toEqual([
      [1, 1], // the shut wall's seal is seen
      [2, 1],
      [3, 1], // the open lake's reveal is seen
    ]);
    const open = wireGates(map([wall, lake]), () => false);
    expect(gateAlphas(open.layouts)).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
    ]);
  });

  it('names the doors its gates make, for the map checks', () => {
    expect(allDoors(map([lake, wall]))).toHaveLength(1);
  });
});
