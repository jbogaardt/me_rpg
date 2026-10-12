import { describe, expect, it } from 'vitest';
import { checkSeams } from './check';
import { TREES } from './catalog';
import { buildWorld, defineBiome, World, type BiomeSpec, type WorldLayout } from './world';

/** Two biomes side by side, 14x21 cells each, joined by one gap halfway down. */
const LAYOUT: WorldLayout = {
  square: 7,
  rows: ['AABB', 'AABB', 'AABB'],
  key: { A: 'west', B: 'east' },
  gaps: [{ at: [1, 1], side: 'e' }],
  wobble: 0, // squares exactly, so the cells below are known
};
const field = (name: string, spawn: [number, number], extra?: BiomeSpec['build']): BiomeSpec =>
  defineBiome({
    name,
    climate: 'temperate',
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

  it('lets borders wander when asked, but keeps each biome in one piece and the border straight across a gap', () => {
    const big: WorldLayout = {
      square: 10,
      rows: ['AAABBB', 'AAABBB', 'AABBBB', 'AAABBB'],
      key: LAYOUT.key,
      gaps: [{ at: [2, 1], side: 'e' }],
    };
    const w = new World({ ...big, wobble: 0.7, seed: 3 });
    const straight = new World({ ...big, wobble: 0 });
    let moved = 0;
    for (let i = 0; i < w.owner.length; i++) if (w.owner[i] !== straight.owner[i]) moved++;
    expect(moved).toBeGreaterThan(30); // the border is carved, not stepped
    for (let k = 0; k < 2; k++) {
      // One piece: a flood from any of its cells reaches all of them.
      const cells = [...w.owner.keys()].filter((i) => w.owner[i] === k);
      const seen = new Set([cells[0]]);
      const stack = [cells[0]];
      while (stack.length) {
        const i = stack.pop()!;
        for (const j of [i - 1, i + 1, i - w.width, i + w.width])
          if (w.owner[j] === k && !seen.has(j) && Math.abs((j % w.width) - (i % w.width)) <= 1) {
            seen.add(j);
            stack.push(j);
          }
      }
      expect(seen.size).toBe(cells.length);
    }
    // Across the gap (rows 13-15 of the border at column 30): west on one side, east on the other, for its whole depth.
    for (let row = 13; row <= 15; row++)
      for (let d = 0; d < 3; d++) {
        expect(w.names[w.ownerAt(29 - d, row)]).toBe('west');
        expect(w.names[w.ownerAt(30 + d, row)]).toBe('east');
      }
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

describe('buildWorld', () => {
  it('cuts one map per biome whose borders match, with a door straight across on each side of the gap', () => {
    const built = maps(SPECS);
    expect(checkSeams(new World(LAYOUT), built)).toEqual([]);
    const west = built.get('west')!;
    const east = built.get('east')!;
    const toEast = west.doors.filter((d) => d.to.zone === 'east');
    expect(toEast.map((d) => [d.col, d.row, d.to.col, d.to.row, d.dir])).toEqual([
      [13, 9, 15, 9, 'right'],
      [13, 10, 15, 10, 'right'],
      [13, 11, 15, 11, 'right'],
    ]);
    expect(east.doors.filter((d) => d.to.zone === 'west').every((d) => d.col === 14 && d.to.col === 12)).toBe(true);
    // The neighbour's cells are drawn but blocked, and marked as beyond.
    const i = 5 * west.width + 20;
    expect(west.collision).toContain(i);
    expect(west.surfaces[west.surface[i]]).toBe('beyond');
    expect(west.ground[i]).not.toBeNull();
  });

  it('notices a border that is open on one side only', () => {
    const leaky = [SPECS[0], field('east', [21, 10], (z) => z.unblock({ col: 14, row: 15, w: 4, h: 1 }))];
    expect(checkSeams(new World(LAYOUT), maps(leaky)).join('\n')).toMatch(/west\|east: the walls don't match/);
  });

  it('notices an opening without doors, and a way off the world', () => {
    const open = [
      field('west', [6, 10], (z) => z.unblock({ col: 10, row: 15, w: 4, h: 1 })),
      field('east', [21, 10], (z) => z.unblock({ col: 14, row: 15, w: 4, h: 1 })),
    ];
    expect(checkSeams(new World(LAYOUT), maps(open)).join('\n')).toMatch(/without a pair of doors/);
    const edge = [field('west', [6, 10], (z) => z.unblock({ col: 0, row: 10, w: 4, h: 1 })), SPECS[1]];
    expect(checkSeams(new World(LAYOUT), maps(edge)).join('\n')).toMatch(/west: open on the edge of the world/);
  });

  it('keeps points on their own biome', () => {
    expect(() => maps([field('west', [20, 10]), SPECS[1]])).toThrow(/outside its own cells/);
    expect(() => maps([SPECS[0]])).toThrow(/maps\/east.ts is missing/);
  });
});
