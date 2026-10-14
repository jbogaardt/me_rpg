// The packs on disk (public/content/packs/) and the assembler (src/content/packs.ts) together: every seed makes a
// campaign the game can load, whose story can be walked from the start, and the seeds differ.
import { describe, expect, it } from 'vitest';
import { ContentManager } from '../../src/content/ContentManager';
import { arcNeeds, assemble, AssemblyError, candidates, mergePacks, type Pack } from '../../src/content/packs';
import { parseContent } from '../../src/content/schema';
import { assembleFromDisk, readPacks } from './disk';

const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

describe('random campaigns from the packs', () => {
  const packs = readPacks();
  const cat = mergePacks(packs);

  it('is the same campaign for the same seed', () => {
    expect(assembleFromDisk(42)).toEqual(assembleFromDisk(42));
  });

  it('mixes: the seeds tell different stories, with different keepers, regions and foes', () => {
    const made = SEEDS.map(assembleFromDisk);
    expect(new Set(made.map((a) => a.arc)).size).toBe(Object.keys(cat.arcs).length);
    expect(new Set(made.map((a) => a.keeper)).size).toBe(Object.keys(cat.keepers).length);
    expect(new Set(made.map((a) => a.regions[0])).size).toBeGreaterThan(1); // more than one place to start
    expect(new Set(made.map((a) => a.regions.join())).size).toBeGreaterThan(5);
    expect(new Set(made.map((a) => JSON.stringify(a.foes))).size).toBeGreaterThan(10);
    for (const id of Object.keys(cat.regions))
      expect(
        made.some((a) => a.regions.includes(id)),
        id,
      ).toBe(true);
  });

  it.each(SEEDS)('seed %i makes a campaign the game can load and finish', (seed) => {
    const a = assembleFromDisk(seed);
    const content = new ContentManager(parseContent(a.files)); // the game's own checks; throws on any problem
    const { biomes, quests, scenarios } = content.content;
    const story = a.regions.slice(0, cat.arcs[a.arc].regions);
    // It starts in a hub, and the story climbs in level.
    expect(scenarios.start).toBe(story[0]);
    expect(cat.regions[story[0]].hub).toBe(true);
    for (let i = 1; i < story.length; i++)
      expect(cat.regions[story[i]].level[0]).toBeGreaterThanOrEqual(cat.regions[story[i - 1]].level[0]);
    // Every region can be walked to from the start, port by port.
    const reached = new Set([biomes[scenarios.start].map]);
    for (const zone of reached) {
      const biome = Object.values(biomes).find((b) => b.map === zone)!;
      for (const to of Object.values(biome.ports)) reached.add(to.map);
    }
    expect(reached.size).toBe(a.regions.length);
    // Each role of a region is a different mob (the packs have enough of them), so no two quests ask for the same.
    for (const [id, roles] of Object.entries(a.foes))
      expect(new Set(Object.values(roles)).size, id).toBe(Object.keys(roles).length);
    // Every role and name in the story was filled in.
    expect(JSON.stringify(quests)).not.toMatch(/\{[\w.]+\}|"@/);
    expect(quests.givers[quests.giver].zone).toBe(biomes[scenarios.start].map);
  });

  it('reads what an arc needs of each region', () => {
    const needs = arcNeeds(cat.arcs.lost_lanterns);
    expect(needs.map((n) => [[...n.roles].sort(), n.site])).toEqual([
      [['common'], true],
      [['ranged'], true],
      [['boss', 'brute'], false],
    ]);
  });

  it('picks a foe by role, band and the region’s themes', () => {
    expect(candidates(cat, cat.regions.cinder_coast, 'common')).toEqual(['cinderImp']); // fire first
    expect(candidates(cat, cat.regions.barrow, 'boss')).toEqual(['barrowLord']);
    // Frostfen has no frost brute, so any brute of its band will do.
    expect(candidates(cat, cat.regions.frostfen, 'brute')).toEqual(['magmaBrute', 'zombie']);
  });

  it('says so when no story fits the regions', () => {
    const noHubs = packs.map((p): Pack => ({
      ...p,
      regions: Object.fromEntries(Object.entries(p.regions ?? {}).map(([id, r]) => [id, { ...r, hub: false }])),
    }));
    expect(() => assemble(1, noHubs)).toThrow(AssemblyError);
  });
});
