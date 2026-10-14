// The packs on disk (public/content/packs/) and the assembler (src/content/packs.ts) together: every seed makes a
// campaign the game can load, whose story can be walked from the start, and the seeds differ.
import { describe, expect, it } from 'vitest';
import { ContentManager } from '../../src/content/ContentManager';
import {
  arcNeeds,
  assemble,
  AssemblyError,
  candidates,
  checkPacks,
  crossingNeeds,
  mergePacks,
  pairingsBetween,
  type Pack,
} from '../../src/content/packs';
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
    // Regions are joined only where a pairing says they may be, and the story crosses the pairings its arc asks for.
    for (const [id, b] of Object.entries(biomes))
      for (const to of Object.values(b.ports)) {
        const other = Object.keys(biomes).find((k) => biomes[k].map === to.map)!;
        expect(pairingsBetween(cat, id, other), `${id}~${other}`).not.toEqual([]);
      }
    const arc = cat.arcs[a.arc];
    crossingNeeds(arc).forEach((need, i) => {
      const pairing = cat.pairings[a.crossings[`r${i + 1}~r${i + 2}`]];
      expect([...pairing.regions].sort()).toEqual([story[i], story[i + 1]].sort());
      for (const t of need.tags) expect(pairing.tags).toContain(t);
    });
    // Its slots and keepers are honoured.
    arc.slots?.forEach((slot, i) => {
      const region = cat.regions[story[i]];
      if (slot.regions) expect(slot.regions).toContain(story[i]);
      if (slot.themes) expect(slot.themes.some((t) => region.themes.includes(t))).toBe(true);
      for (const [role, { tags = [] }] of Object.entries(slot.foes ?? {}))
        for (const t of tags) expect(cat.entities[a.foes[story[i]][role]].tags).toContain(t);
    });
    if (arc.keepers) expect(arc.keepers).toContain(a.keeper);
    const homes = cat.keepers[a.keeper].homes;
    if (homes) expect(homes).toContain(story[0]);
    // Every role and name in the story was filled in.
    expect(JSON.stringify(quests)).not.toMatch(/\{[\w.]+\}|"@/);
    expect(quests.givers[quests.giver].zone).toBe(biomes[scenarios.start].map);
  });

  it('tells a cross-biome quest by the pairing it crosses', () => {
    const told = SEEDS.map(assembleFromDisk).filter((a) => a.arc === 'long_thaw');
    const by = (pairing: string) => {
      const a = told.find((t) => t.crossings['r1~r2'] === pairing);
      expect(a, pairing).toBeDefined();
      return JSON.stringify(a!.files.quests);
    };
    const thaw = by('steam_pass'); // fire of the coast meets the ice
    expect(thaw).toContain('The fire of The Cinder Coast is eating into the ice of The Frostfen');
    expect(thaw).toContain('Snow is falling on hot ash'); // the pairing's own line, seen from the coast
    const creep = by('rime_bog'); // the cold reaches into the bog
    expect(creep).toContain('The Mirewood will freeze solid by midwinter');
    expect(creep).toContain('the reeds snap like glass');
    expect(creep).not.toContain('eating into the ice');
  });

  it('finds what is wrong with packs', () => {
    expect(checkPacks(cat)).toEqual([]);
    const broken: Pack = {
      version: 1,
      id: 'broken',
      keepers: { ghost: { npc: 'nobody', name: 'Ghost', tag: 'Ghost', homes: ['frostfen'] } },
      pairings: {
        nowhere: { regions: ['mirewood', 'atlantis'], ports: ['east', 'north'] },
        mirror: { regions: ['barrow', 'barrow'], lore: { sign: { moon: 'x' } } },
      },
      arcs: {
        leap: {
          title: 'Leap',
          regions: 3,
          slots: [{}, { regions: ['atlantis'] }],
          keepers: ['nobody'],
          chapters: [{ title: 'x', intro: ['{r1~r3.way}'] }],
          quests: [],
        },
      },
    };
    const p = checkPacks(mergePacks([...packs, broken])).join('\n');
    expect(p).toMatch(/keepers\.ghost\.npc: "nobody" is not an npc/);
    expect(p).toMatch(/keepers\.ghost\.homes: "frostfen" is not a hub region/);
    expect(p).toMatch(/pairings\.nowhere: no region "atlantis"/);
    expect(p).toMatch(/pairings\.nowhere\.ports: "mirewood" has no port "east"/);
    expect(p).toMatch(/pairings\.mirror: pairs "barrow" with itself/);
    expect(p).toMatch(/pairings\.mirror\.lore\.sign: "moon" is not one of its regions/);
    expect(p).toMatch(/arcs\.leap\.slots\[1\]: no region "atlantis"/);
    expect(p).toMatch(/arcs\.leap\.keepers: no keeper "nobody"/);
    expect(p).toMatch(/arcs\.leap: .*r1~r3 is not a step of its story/);
    expect(() => assemble(1, [...packs, broken])).toThrow(AssemblyError);
  });

  it('never joins regions no pairing joins', () => {
    const lonely = packs.map((p): Pack => ({ ...p, pairings: {} }));
    expect(checkPacks(mergePacks(lonely))).toContain('regions.mirewood: no pairing joins it to anything');
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
    // Strictly of the region's themes: the Frostfen's brute is frost, never a magma brute.
    expect(candidates(cat, cat.regions.frostfen, 'brute')).toEqual(['rimebound']);
    expect(candidates(cat, cat.regions.ember_caldera, 'boss', ['undead'])).toEqual([]);
  });

  it('says so when no story fits the regions', () => {
    const noHubs = packs.map((p): Pack => ({
      ...p,
      regions: Object.fromEntries(Object.entries(p.regions ?? {}).map(([id, r]) => [id, { ...r, hub: false }])),
    }));
    expect(() => assemble(1, noHubs)).toThrow(AssemblyError);
  });
});
