import { describe, expect, it } from 'vitest';
import { decompose, FULL, lpcTables, TERRAIN_NAMES, TERRAINS, tileTable } from './terrain';
import { Zone } from './zone';

describe('LPC terrain tables', () => {
  it('finds every terrain we use in Terrain.tsx, with a full tile and all four single corners', () => {
    for (const name of TERRAIN_NAMES) {
      const t = tileTable(name);
      expect(t.has(FULL), name).toBe(true);
      for (const corner of [1, 2, 4, 8]) expect(t.has(corner), `${name} corner ${corner}`).toBe(true);
    }
    expect(lpcTables().get('Grass')!.get(0b0011)).toEqual([
      [32, 256],
      [128, 256],
    ]); // grass along the bottom half: the north edge tiles
  });

  it('builds a mask the atlas lacks from tiles it has', () => {
    const t = tileTable('soot'); // Black Dirt has no inner corners
    expect(t.has(0b0111)).toBe(false);
    const parts = decompose(t, 0b0111);
    expect(parts.reduce((m, p) => m | p, 0)).toBe(0b0111);
    expect(parts.every((p) => t.has(p))).toBe(true);
    // Two opposite corners: no atlas has those, so two single corners.
    expect(decompose(tileTable('sand'), 0b1001).sort()).toEqual([1, 8]);
    expect(decompose(t, 0)).toEqual([]);
  });
});

describe('zone.paint', () => {
  it('covers the painted cells fully and fades half a cell past them', () => {
    const z = new Zone(5, 5);
    z.fill('grass');
    z.paint('sand', { col: 1, row: 1, w: 3, h: 3 });
    z.spawn(0, 0);
    const d = z.toMapData();
    const sheet = d.sheets.indexOf('lpc_terrain.png');
    const cell = (c: number, r: number) => d.ground[r * 5 + c]!;
    // Inside: one full sand tile (it hides the grass, so no layers under it).
    expect(cell(2, 2)).toHaveLength(3);
    expect(cell(2, 2)[0]).toBe(sheet);
    // A cell beside it: grass with a sand edge on top.
    expect(cell(0, 2)).toHaveLength(6);
    expect(cell(0, 2)[3]).toBe(sheet);
    // Far away: just grass.
    expect(cell(0, 0)).toHaveLength(6); // its bottom-right corner touches the patch
    expect(d.surfaces[d.surface[2 * 5 + 2]]).toBe(TERRAINS.sand.surface);
    expect(d.surfaces[d.surface[0]]).toBe('grass');
  });

  it('erases', () => {
    const z = new Zone(4, 4);
    z.fill('grass');
    z.paint('murk', { col: 0, row: 0, w: 4, h: 4 });
    z.paint('murk', { col: 0, row: 0, w: 4, h: 4 }, { erase: true });
    z.spawn(0, 0);
    expect(z.toMapData().ground.every((g) => g?.length === 3)).toBe(true);
  });
});
