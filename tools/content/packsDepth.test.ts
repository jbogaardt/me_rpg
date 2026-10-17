// Random worlds rise in danger with depth (src/content/depth.ts): assembled over many seeds, a region's band follows its
// distance from the start, its foes are banded to it, and each banded foe is a fair fight at its own band.
import { describe, expect, it } from 'vitest';
import { ContentManager } from '../../src/content/ContentManager';
import { parseContent } from '../../src/content/schema';
import { bandKind } from '../../src/systems/bands';
import { foeProblem } from '../../src/systems/levels';
import { depthBand } from '../../src/content/depth';
import { World } from '../../src/content/world';
import { assembleFromDisk, readPacks } from './disk';

const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

const made = SEEDS.map((seed) => {
  const a = assembleFromDisk(seed);
  const content = new ContentManager(parseContent(a.files));
  const { biomes, scenarios } = content.content;
  // graph distance from the start along the doors
  const byMap = new Map(Object.entries(biomes).map(([id, b]) => [b.map, id]));
  const depth = new Map([[scenarios.start, 0]]);
  for (const id of depth.keys())
    for (const to of Object.values(biomes[id].ports)) {
      const next = byMap.get(to.map)!;
      if (!depth.has(next)) depth.set(next, depth.get(id)! + 1);
    }
  return { seed, content, depth };
});

describe('depth bands of live worlds', () => {
  it('gives each region its band as the story grows it, and a replayed log agrees', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const world = new World(seed, readPacks());
      world.open();
      const bandsOf = (w: World) =>
        Object.fromEntries(
          Object.entries(parseContent(w.files()).biomes).map(([id, b]) => [id, b.levels?.join('-') ?? '']),
        );
      let before = bandsOf(world);
      expect(world.depthOf(world.storyRegions[0])).toBe(0);
      while (!world.complete) {
        const options = world.options();
        world.apply(world.choose(options[seed % options.length].cue));
        const now = bandsOf(world);
        const fresh = world.storyRegions[world.storyRegions.length - 1];
        expect(world.depthOf(fresh), `seed ${seed}`).toBe(world.storyRegions.length - 1);
        for (const [id, band] of Object.entries(before))
          expect(now[id], `seed ${seed}: ${id} keeps its band`).toBe(band);
        expect(now[fresh]).toBe(depthBand(world.depthOf(fresh)).levels.join('-'));
        before = now;
      }
      const again = new World(seed, readPacks());
      again.replay(world.log);
      expect(bandsOf(again)).toEqual(bandsOf(world));
    }
  });
});

describe('depth bands of random worlds', () => {
  it('starts gentle: the start region is for levels 1 to 3', () => {
    for (const { seed, content } of made) {
      const { biomes, scenarios } = content.content;
      const [lo, hi] = biomes[scenarios.start].levels!;
      expect(lo, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(hi, `seed ${seed}`).toBeLessThanOrEqual(3);
    }
  });

  it('rises with depth: a region lies no lower than any region nearer the start', () => {
    let deepest = 0;
    for (const { seed, content, depth } of made) {
      const { biomes } = content.content;
      for (const [id, d] of depth) {
        const band = biomes[id].levels;
        if (!band) continue; // a town has no foes, so no band
        deepest = Math.max(deepest, band[0]);
        for (const [other, e] of depth) {
          const there = biomes[other].levels;
          // doors can join regions the chain put at different depths, so only the shortest way is held to account
          if (there && e < d - 1)
            expect(band[0], `seed ${seed}: ${id} (${d}) vs ${other} (${e})`).toBeGreaterThanOrEqual(there[0]);
        }
      }
    }
    expect(deepest).toBeGreaterThan(3); // some world goes well past its start
  });

  it('bands every roamer and placed foe, and none is deadly or a slog at its own band', () => {
    for (const { seed, content } of made) {
      const { biomes, scenarios, entities } = content.content;
      for (const [id, b] of Object.entries(biomes)) {
        if (!b.levels) continue;
        const placed = (scenarios.nodes.get(id)?.entities ?? []).map((p) => ({ kind: p.entity, level: p.level }));
        const roamers = (b.generation.roam ?? []).flatMap((r) => r.kinds.map((kind) => ({ kind, level: r.level })));
        for (const { kind, level } of [...placed, ...roamers]) {
          if (entities[kind]?.type !== 'mob') continue;
          const at = `seed ${seed}: ${id} ${kind}`;
          expect(level, at).toBeDefined();
          expect(level!, at).toBeGreaterThanOrEqual(b.levels[0]);
          expect(level!, at).toBeLessThanOrEqual(b.levels[1]);
          const foe = bandKind(content.mobKind(kind), level!);
          const problem = foeProblem({ hp: foe.maxHp, attack: foe.attack, defense: foe.defense }, [level!, level!]);
          expect(problem?.kind === 'trivial' ? null : problem, at).toBeNull(); // trivial is only a warning in the check
        }
      }
    }
  });

  it('makes one kind harder the deeper it is met', () => {
    const seen = new Map<string, Set<number>>();
    for (const { content } of made)
      for (const b of Object.values(content.content.biomes))
        for (const r of b.generation.roam ?? [])
          for (const kind of r.kinds) (seen.get(kind) ?? seen.set(kind, new Set()).get(kind)!).add(r.level ?? 0);
    expect([...seen.values()].some((levels) => levels.size >= 3)).toBe(true);
  });
});
