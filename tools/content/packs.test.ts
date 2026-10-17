// The packs on disk (public/content/packs/) and the assembler (src/content/packs.ts) together: every seed makes a
// campaign the game can load, whose story can be walked from the start, and the seeds differ.
import { describe, expect, it } from 'vitest';
import { ContentManager } from '../../src/content/ContentManager';
import {
  arcNeeds,
  AssemblyError,
  candidates,
  checkPacks,
  crossingNeeds,
  eligibleFor,
  MAX_SIDE_REGIONS,
  mergePacks,
  OPPOSITE,
  rng,
  pairingsBetween,
  STEP,
  type Pack,
} from '../../src/content/packs';
import { wireDoors } from '../../src/content/ports';
import { assemble } from '../../src/content/world';
import { parseMap, type MapData } from '../../src/map/types';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../map/image';
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
    // The world is one grid: no two regions on a cell; every door leads to the next cell its way, onto the facing edge
    // (leave north, arrive in the south), so any walk that comes back to a cell comes back to the same region.
    const cells = new Set(Object.values(a.layout).map(([x, y]) => `${x},${y}`));
    expect(cells.size).toBe(a.regions.length);
    for (const [id, b] of Object.entries(biomes))
      for (const [port, to] of Object.entries(b.ports)) {
        const other = Object.keys(biomes).find((k) => biomes[k].map === to.map)!;
        const side = cat.regions[id].ports[port];
        const [x, y] = a.layout[id];
        expect(a.layout[other], `${id}.${port}`).toEqual([x + STEP[side][0], y + STEP[side][1]]);
        expect(cat.regions[other].ports[to.port]).toBe(OPPOSITE[side]);
      }
    // Regions side by side are paired (a dead end only has to suit the region it hangs off).
    for (const [p, [x, y]] of Object.entries(a.layout))
      for (const [q, [u, v]] of Object.entries(a.layout))
        if (p < q && Math.abs(x - u) + Math.abs(y - v) === 1 && !cat.regions[p].terminal && !cat.regions[q].terminal)
          expect(pairingsBetween(cat, p, q), `${p} beside ${q}`).not.toEqual([]);
    // A dead end hangs off exactly one region.
    for (const id of a.regions.filter((r) => cat.regions[r].terminal))
      expect(Object.keys(biomes[id].ports)).toHaveLength(1);
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

  it('walks back to where it started: north, east, south and west through any doors come home', () => {
    for (const seed of SEEDS) {
      const a = assembleFromDisk(seed);
      const biomes = (
        a.files.biomes as { biomes: Record<string, { map: string; ports: Record<string, { map: string }> }> }
      ).biomes;
      const byMap = new Map(Object.entries(biomes).map(([id, b]) => [b.map, id]));
      // Wander through doors at random, keeping count of the steps taken: wherever the walk is, the steps add up to
      // where that region stands, so returning to a region always means returning to the same spot.
      let here = a.regions[0];
      let pos: [number, number] = [0, 0];
      for (let i = 0; i < 60; i++) {
        const doors = Object.entries(biomes[here].ports);
        if (!doors.length) break;
        const [port, to] = doors[(seed * 7 + i * 13) % doors.length];
        const [dx, dy] = STEP[cat.regions[here].ports[port]];
        pos = [pos[0] + dx, pos[1] + dy];
        here = byMap.get(to.map)!;
        expect(pos).toEqual(a.layout[here]);
      }
    }
  });

  it('bolts dead ends onto open ports, and seals the ports left open', () => {
    const made = SEEDS.map(assembleFromDisk);
    const ends = Object.keys(cat.regions).filter((id) => cat.regions[id].terminal);
    for (const id of ends)
      expect(
        made.some((a) => a.regions.includes(id)),
        id,
      ).toBe(true);
    const map = (name: string): MapData =>
      parseMap(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/maps', `${name}.json`), 'utf8')));
    for (const a of made.slice(0, 20)) {
      const biomes = (a.files.biomes as { biomes: Record<string, { map: string; ports: Record<string, unknown> }> })
        .biomes;
      for (const b of Object.values(biomes)) {
        const raw = map(b.map);
        const wired = wireDoors(raw, b.ports as never);
        const open = raw.ports.filter((p) => !b.ports[p.name]);
        const sealed = open.reduce((n, p) => n + (p.seal?.length ?? 0), 0);
        expect(sealed, `${b.map}: every open port is sealed`).toBeGreaterThanOrEqual(open.length);
        expect(wired.objects.length - raw.objects.length).toBe(sealed);
        expect(wired.doors.length - raw.doors.length).toBe(raw.ports.length - open.length);
      }
    }
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
        nowhere: { regions: ['mirewood', 'atlantis'], ports: ['northwest', 'north'] },
        askew: { regions: ['mirewood', 'frostfen'], ports: ['north', 'north'] },
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
    expect(p).toMatch(/pairings\.nowhere\.ports: "mirewood" has no port "northwest"/);
    expect(p).toMatch(/pairings\.askew\.ports: "north" \(north\) and "north" \(north\) are not on opposite edges/);
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

  it('keeps a haven a safe harbour: no foes, no hub, never a story region', () => {
    const armed = packs.map((p): Pack =>
      p.regions?.hearthmere ? { ...p, regions: { hearthmere: { ...p.regions.hearthmere, foes: { common: {} } } } } : p,
    );
    expect(checkPacks(mergePacks(armed))).toContain(
      'regions.hearthmere: a haven is no hub or dead end, and no foes live in it',
    );
    for (const arc of Object.values(cat.arcs))
      for (const slot of eligibleFor(cat, arc)) expect(slot.has('hearthmere')).toBe(false);
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

  it('plays each story with the capabilities its arc switches off', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const a = assembleFromDisk(seed);
      const scenarios = a.files.scenarios as { capabilities: unknown };
      expect(scenarios.capabilities).toEqual(cat.arcs[a.arc].capabilities ?? {});
    }
    expect(cat.arcs.lost_lanterns.capabilities).toEqual({ guide: false, compass: false });
  });

  it('gives a region’s own capabilities to its zone, and refuses a region switching a campaign-wide one', () => {
    const a = SEEDS.map(assembleFromDisk).find((x) => x.regions.includes('bog_hollow'))!;
    const biomes = (a.files.biomes as { biomes: Record<string, { capabilities?: unknown }> }).biomes;
    expect(biomes.bog_hollow.capabilities).toEqual({ guide: false, compass: false, needs: { drain: 2 } });
    const odd: Pack = {
      version: 1,
      id: 'odd',
      regions: {
        oddity: {
          ...cat.regions.barrow,
          biome: { ...cat.regions.barrow.biome, map: 'odd_map' },
          sites: {},
          capabilities: { coop: false },
        },
      },
      pairings: { odd_way: { regions: ['oddity', 'barrow'] } },
    };
    expect(checkPacks(mergePacks([...packs, odd])).join()).toMatch(
      /regions\.oddity\.capabilities\.coop: is set for the whole campaign, not per zone/,
    );
  });

  it('gives every story the packs’ goods, and lets an arc choose the starting gear', () => {
    const a = assembleFromDisk(SEEDS[0]);
    const goods = a.files.items as { start: unknown; items: Record<string, unknown>; loots: Record<string, unknown> };
    expect(Object.keys(goods.items)).toEqual(Object.keys(cat.items));
    expect(goods.loots).toEqual(cat.loots);
    expect(goods.start).toEqual(cat.start);
    const wizardly: Pack[] = packs.map((p) => ({
      ...p,
      arcs: Object.fromEntries(
        Object.entries(p.arcs ?? {}).map(([id, arc]) => [id, { ...arc, start: { weapon: 'apprenticeWand' } }]),
      ),
    }));
    const b = assemble(SEEDS[0], wizardly);
    expect((b.files.items as { start: unknown }).start).toEqual({ weapon: 'apprenticeWand' });
    expect(() => parseContent(b.files)).not.toThrow();
  });

  it('refuses two packs saying what a hero starts with, and a shop whose keeper is nobody', () => {
    const odd: Pack = {
      version: 1,
      id: 'odd',
      start: { weapon: 'rustySword' },
      shops: { stall: { name: 'Stall', tag: 'Grocer', keeper: 'nobody', greeting: [], stock: [], buys: [] } },
    };
    expect(checkPacks(mergePacks([...packs, odd])).join()).toMatch(/start: set by both "outfitters" and "odd"/);
    expect(checkPacks(mergePacks([...packs, odd])).join()).toMatch(/shops\.stall\.keeper: "nobody" is not an npc/);
  });

  it('refuses an arc switching a capability that does not exist', () => {
    const odd: Pack = {
      version: 1,
      id: 'odd',
      arcs: { odd: { ...cat.arcs.ember_trail, capabilities: { jetpack: false } as never } },
    };
    expect(checkPacks(mergePacks([...packs, odd])).join()).toMatch(
      /arcs\.odd\.capabilities\.jetpack: is not a capability/,
    );
  });

  it('refuses two packs defining one id, a map drawn by two regions, or a site in two', () => {
    const copy: Pack = {
      version: 1,
      id: 'copycat',
      entities: { goblin: packs.flatMap((p) => Object.values(p.entities ?? {}))[0] },
      regions: { twin: { ...cat.regions.barrow, sites: cat.regions.mirewood.sites } },
      pairings: { twin_road: { regions: ['twin', 'barrow'] } },
    };
    const p = checkPacks(mergePacks([...packs, copy])).join('\n');
    expect(p).toMatch(/entities\.goblin: defined by both "wilds" and "copycat"/);
    expect(p).toMatch(/regions\.twin: its map ".*" is also region "barrow"'s/);
    expect(p).toMatch(/regions\.twin: its site ".*" is also region "mirewood"'s/);
  });
});

/**
 * A made-up catalog of `n` regions (every tenth a dead end, every seventh a hub), each paired with `per` others at
 * random, and mobs of every role and theme: what thousands of packs would look like to the assembler.
 */
function synthetic(n: number, per: number): Pack[] {
  const THEMES = ['fire', 'frost', 'swamp', 'undead', 'beast'];
  const SIDES = ['north', 'south', 'east', 'west'] as const;
  const rand = rng(7);
  const entities: Pack['entities'] = { kp: { type: 'npc', name: 'K', sprite: { body: 'body.male' } } };
  for (const t of THEMES)
    for (const role of ['common', 'boss'])
      for (let i = 0; i < 4; i++)
        entities[`${t}_${role}_${i}`] = {
          type: 'mob',
          name: `${t} ${role}`,
          tags: [role, t],
          level: [1 + i * 3, 4 + i * 3],
          sprite: { body: 'body.male' },
        };
  const regions: Pack['regions'] = {};
  for (let i = 0; i < n; i++) {
    const terminal = i % 10 === 9;
    const side = SIDES[i % 4];
    regions[`r${i}`] = {
      biome: { name: `Region ${i}`, map: `map${i}`, climate: null, music: null, tilesets: [] },
      level: [1 + (i % 4) * 3, 4 + (i % 4) * 3],
      themes: [THEMES[i % 5]],
      hub: !terminal && i % 7 === 0,
      terminal,
      ports: terminal ? { [side]: side } : { north: 'north', south: 'south', east: 'east', west: 'west' },
      foes: { common: {}, boss: {} },
      roam: [],
    };
  }
  const pairings: Pack['pairings'] = {};
  for (let i = 0; i < n; i++)
    for (let k = 0; k < per; k++) {
      const j = Math.floor(rand() * n);
      if (j !== i) pairings[`p${i}_${k}`] = { regions: [`r${i}`, `r${j}`], tags: [THEMES[Math.floor(rand() * 5)]] };
    }
  const quest = (kind: string) => ({ id: kind, objective: { t: 'kill', kind, count: 1 } });
  const arcs: Pack['arcs'] = {
    // Cannot be told: its last region must be of a theme no region has. Found out at once, not by searching.
    never: { title: 'Never', regions: 6, slots: [{}, {}, {}, {}, {}, { themes: ['void'] }], chapters: [], quests: [] },
    plain: { title: 'Plain', regions: 3, chapters: [], quests: [quest('@r3.boss')] },
    // Hard to tell: a winding chain of themes and a tagged crossing.
    winding: {
      title: 'Winding',
      regions: 5,
      slots: [{}, { themes: ['frost'] }, { themes: ['undead'] }, {}, { themes: ['fire'] }],
      crossings: { 'r2~r3': { tags: ['swamp'] } },
      chapters: [],
      quests: [quest('@r5.boss'), quest('@r3.common')],
    },
  };
  return [
    {
      version: 1,
      id: 'synthetic',
      entities,
      keepers: { k: { npc: 'kp', name: 'K', tag: 'k' } },
      regions,
      pairings,
      arcs,
      start: { weapon: 'stick' },
      items: { stick: { name: 'Stick', value: 1, slot: 'weapon', attack: 1, look: {} } },
    },
  ];
}

describe('the assembler at scale', () => {
  it('builds a world from thousands of regions quickly, and its size does not grow with the catalog', () => {
    for (const n of [200, 3000]) {
      const packs = synthetic(n, 3);
      expect(checkPacks(mergePacks(packs))).toEqual([]);
      for (const seed of [1, 2, 3, 4]) {
        const start = performance.now();
        const a = assemble(seed, packs);
        expect(performance.now() - start, `${n} regions, seed ${seed}`).toBeLessThan(2000);
        const story = a.regions.filter((id) => !packs[0].regions![id].terminal);
        expect(story.length).toBeLessThanOrEqual(cat_story(a) + MAX_SIDE_REGIONS);
        expect(a.regions.length).toBeLessThan(5 + MAX_SIDE_REGIONS + 4 * (5 + MAX_SIDE_REGIONS));
      }
    }
  });

  it('gives up on an arc that cannot be told without searching every region', () => {
    const packs = synthetic(3000, 3);
    const only = packs.map((p): Pack => ({ ...p, arcs: { never: p.arcs!.never } }));
    const start = performance.now();
    expect(() => assemble(1, only)).toThrow(AssemblyError);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

/** How many regions the assembly's story runs through. */
const cat_story = (a: { crossings: Record<string, string> }) =>
  Object.keys(a.crossings).filter((k) => /^r\d+~r\d+$/.test(k)).length + 1;
