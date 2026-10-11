import { describe, expect, it } from 'vitest';
import { parseMap } from './types';

const minimal = { version: 2, width: 2, height: 2, ground: [null, null, null, null] };

describe('parseMap', () => {
  it('fills defaults for optional fields', () => {
    expect(parseMap(minimal)).toEqual({
      version: 2,
      width: 2,
      height: 2,
      sheets: [],
      ground: [null, null, null, null],
      objects: [],
      collision: [],
      surfaces: ['grass'],
      surface: [0, 0, 0, 0],
      level: [0, 0, 0, 0],
      ramps: [],
      spawn: { col: 1, row: 1 },
      npc: null,
      mobs: [],
      chests: [],
    });
  });

  it('keeps what the file provides', () => {
    const data = parseMap({ ...minimal, spawn: { col: 0, row: 1 }, npc: { col: 1, row: 0 }, collision: [3] });
    expect(data.spawn).toEqual({ col: 0, row: 1 });
    expect(data.npc).toEqual({ col: 1, row: 0 });
    expect(data.collision).toEqual([3]);
  });

  it.each([
    ['null', null],
    ['an unknown version', { ...minimal, version: 1 }],
    ['no size', { version: 2, ground: [] }],
    ['no ground array', { version: 2, width: 1, height: 1 }],
  ])('rejects %s', (_name, json) => {
    expect(() => parseMap(json)).toThrow(/valid map/);
  });
});
