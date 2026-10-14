import { describe, expect, it } from 'vitest';
import { populate, roam, ROAM_BORDER } from './populate';
import type { EntityDef, RoamRule } from './schema';

/** An open field `size` cells square ringed by `edge` cells of the neighbouring biome, with some blocked cells. */
function field(size: number, edge = 0, blocked: number[] = []) {
  const surface: number[] = [];
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++)
      surface.push(col < edge || row < edge || col >= size - edge || row >= size - edge ? 1 : 0);
  return { width: size, height: size, collision: blocked, surface, surfaces: ['grass', 'beyond'] };
}

const rule = (over: Partial<RoamRule> = {}): RoamRule => ({
  kinds: ['goblin', 'wolf'],
  count: 4,
  seed: 7,
  apart: 6,
  avoid: [],
  ...over,
});

describe('roam', () => {
  it('is deterministic, cycles the kinds and keeps them apart and inland', () => {
    const map = field(60, 5);
    const a = roam(map, rule());
    expect(a).toEqual(roam(map, rule()));
    expect(a.map((m) => m.kind)).toEqual(['goblin', 'wolf', 'goblin', 'wolf']);
    for (const m of a) {
      expect(Math.min(m.col, m.row, 59 - m.col, 59 - m.row)).toBeGreaterThanOrEqual(5 + ROAM_BORDER);
      for (const n of a) if (n !== m) expect(Math.hypot(m.col - n.col, m.row - n.row)).toBeGreaterThanOrEqual(6);
    }
    expect(roam(map, rule({ seed: 8 }))).not.toEqual(a);
  });

  it('keeps out of the avoid circles and off blocked ground', () => {
    const blocked = Array.from({ length: 60 * 30 }, (_, i) => i); // the top half is solid
    const map = field(60, 0, blocked);
    const out = roam(map, rule({ count: 10, apart: 3, avoid: [{ x: 30, y: 45, radius: 8 }] }));
    expect(out.length).toBeGreaterThan(0);
    for (const m of out) {
      expect(m.row).toBeGreaterThan(30);
      expect(Math.hypot(m.col - 30, m.row - 45)).toBeGreaterThanOrEqual(8);
    }
  });

  it('places fewer when there is no room', () => {
    expect(roam(field(12), rule({ count: 3 }))).toEqual([]);
  });
});

describe('populate', () => {
  const entities: Record<string, EntityDef> = {
    goblin: { type: 'mob', name: 'Goblin', sprite: { body: 'b' } },
    wolf: { type: 'mob', name: 'Wolf', sprite: { body: 'b' } },
    elder: { type: 'npc', name: 'Elder', sprite: { body: 'b' } },
  };
  const biome = {
    name: 'M',
    links: [],
    map: 'm',
    climate: null,
    music: null,
    tilesets: [],
    generation: { roam: [rule({ count: 2 })] },
  };
  const node = {
    node_id: 'n',
    biome_type: 'm',
    entities: [
      { entity: 'elder', x: 2, y: 3 },
      { entity: 'goblin', x: 4.4, y: 5.6 },
    ],
    choices: [],
  };

  it('puts the node’s mobs first, then the roamers; people apart', () => {
    const pop = populate(field(60), biome, node, entities);
    expect(pop.mobs[0]).toEqual({ kind: 'goblin', col: 4, row: 6 });
    expect(pop.mobs).toHaveLength(3);
    expect(pop.folk).toEqual([{ entity: 'elder', def: entities.elder, col: 2, row: 3 }]);
  });

  it('with no node, only the roamers', () => {
    expect(populate(field(60), biome, undefined, entities).mobs).toHaveLength(2);
  });
});
