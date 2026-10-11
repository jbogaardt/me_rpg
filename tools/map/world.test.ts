import { describe, expect, it } from 'vitest';
import { checkSeams } from './check';
import { TREES } from './catalog';
import { buildWorld, coverRects, defineBiome, World, type BiomeSpec, type WorldLayout } from './world';

/** Two biomes side by side, 14x21 cells each, joined by one gap halfway down. */
const LAYOUT: WorldLayout = {
  square: 7,
  rows: ['AABB', 'AABB', 'AABB'],
  key: { A: 'west', B: 'east' },
  gaps: [{ at: [1, 1], side: 'e' }],
};
const field = (name: string, spawn: [number, number], extra?: BiomeSpec['build']): BiomeSpec =>
  defineBiome({
    name,
    walls: { trees: TREES },
    build(z) {
      z.fill('grass');
      z.spawn(...spawn);
      extra?.(z);
    },
  });
const SPECS = [field('west', [6, 10]), field('east', [21, 10])];
const maps = (specs: BiomeSpec[]) => new Map([...buildWorld(LAYOUT, specs)].map(([n, z]) => [n, z.data]));

describe('World', () => {
  it('reads the layout: owners, crops and gaps', () => {
    const w = new World(LAYOUT);
    expect([w.width, w.height]).toEqual([28, 21]);
    expect(w.names[w.ownerAt(13, 0)]).toBe('west');
    expect(w.names[w.ownerAt(14, 0)]).toBe('east');
    expect(w.ownerAt(-1, 0)).toBe(-1);
    expect(w.crop('west')).toEqual({ col: 0, row: 0, w: 28, h: 21 }); // the margin reaches past the whole world
    // The gap's corridor on each side: three cells wide (centred in the square's edge), WALL deep.
    expect(w.gap('west', 'east')).toEqual({ col: 11, row: 9, w: 3, h: 3 });
    expect(w.gap('east', 'west')).toEqual({ col: 14, row: 9, w: 3, h: 3 });
    expect(() => w.gap('west', 'nowhere')).toThrow(/no gap/);
  });

  it('refuses a broken layout', () => {
    expect(() => new World({ ...LAYOUT, rows: ['AAB', 'AABB'] })).toThrow(/squares wide/);
    expect(() => new World({ ...LAYOUT, rows: ['AAXB'] })).toThrow(/not in the key/);
    expect(() => new World({ ...LAYOUT, gaps: [{ at: [0, 0], side: 'e' }] }).gaps()).toThrow(/inside west/);
    expect(() => new World({ ...LAYOUT, gaps: [{ at: [3, 0], side: 'e' }] }).gaps()).toThrow(/off the world/);
  });

  it('walls each biome WALL cells in from every border, except its gaps', () => {
    const w = new World(LAYOUT);
    const { corridor } = w.gaps();
    const walls = w.wall(0, true, corridor);
    const at = (c: number, r: number) => walls[r * w.width + c];
    expect([at(11, 5), at(12, 5), at(13, 5)]).toEqual([1, 1, 1]); // along the border with the east
    expect(at(10, 5)).toBe(0);
    expect([at(11, 10), at(13, 10)]).toEqual([0, 0]); // the gap's corridor
    expect([at(0, 10), at(2, 10), at(5, 0), at(5, 20)]).toEqual([1, 1, 1, 1]); // the world's edge
    expect(at(14, 5)).toBe(0); // not its own cell
  });
});

describe('coverRects', () => {
  it('covers exactly the mask with a few large rects', () => {
    // An L: a 6x2 bar and a 2x4 leg.
    const W = 8,
      H = 6;
    const mask = new Uint8Array(W * H);
    for (let c = 0; c < 6; c++) for (let r = 0; r < 2; r++) mask[r * W + c] = 1;
    for (let c = 0; c < 2; c++) for (let r = 2; r < 6; r++) mask[r * W + c] = 1;
    const rects = coverRects(mask, W, H);
    expect(rects.length).toBe(2);
    const covered = new Uint8Array(W * H);
    for (const r of rects)
      for (let y = r.row; y < r.row + r.h; y++)
        for (let x = r.col; x < r.col + r.w; x++) {
          expect(mask[y * W + x]).toBe(1);
          covered[y * W + x] = 1;
        }
    expect([...covered]).toEqual([...mask]);
  });
});

describe('buildWorld', () => {
  it('cuts one map per biome whose borders match, with a door straight across on each side of the gap', () => {
    const built = maps(SPECS);
    expect(checkSeams(new World(LAYOUT), built)).toEqual([]);
    const west = built.get('west')!;
    const east = built.get('east')!;
    const toEast = west.doors.filter((d) => d.to.zone === 'east');
    expect(toEast.map((d) => [d.col, d.row, d.to.col, d.to.row, d.dir])).toEqual([
      [13, 9, 16, 9, 'right'],
      [13, 10, 16, 10, 'right'],
      [13, 11, 16, 11, 'right'],
    ]);
    expect(east.doors.filter((d) => d.to.zone === 'west').every((d) => d.col === 14 && d.to.col === 11)).toBe(true);
    // The neighbour's cells are drawn but blocked, and marked as beyond.
    const i = 5 * west.width + 20;
    expect(west.collision).toContain(i);
    expect(west.surfaces[west.surface[i]]).toBe('beyond');
    expect(west.ground[i]).not.toBeNull();
  });

  it('notices a border that is open on one side only', () => {
    const leaky = [SPECS[0], field('east', [21, 10], (z) => z.unblock({ col: 14, row: 15, w: 1, h: 1 }))];
    expect(checkSeams(new World(LAYOUT), maps(leaky)).join('\n')).toMatch(/west\|east: the walls don't match/);
  });

  it('notices an opening without doors, and a way off the world', () => {
    const open = [
      field('west', [6, 10], (z) => z.unblock({ col: 13, row: 15, w: 1, h: 1 })),
      field('east', [21, 10], (z) => z.unblock({ col: 14, row: 15, w: 1, h: 1 })),
    ];
    expect(checkSeams(new World(LAYOUT), maps(open)).join('\n')).toMatch(/without a pair of doors/);
    const edge = [field('west', [6, 10], (z) => z.unblock({ col: 0, row: 10, w: 1, h: 1 })), SPECS[1]];
    expect(checkSeams(new World(LAYOUT), maps(edge)).join('\n')).toMatch(/west: open on the edge of the world/);
  });

  it('keeps points on their own biome', () => {
    expect(() => maps([field('west', [20, 10]), SPECS[1]])).toThrow(/outside its own cells/);
    expect(() => maps([SPECS[0]])).toThrow(/maps\/east.ts is missing/);
  });
});
