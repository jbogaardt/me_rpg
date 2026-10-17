// A world built from a log (src/content/world.ts): a random campaign's log replays to the same campaign, a live world
// grows one story step at a time with every step a loadable campaign, and a log that breaks the packs' rules is refused.
import { describe, expect, it } from 'vitest';
import { parseContent } from '../../src/content/schema';
import { rng } from '../../src/content/packs';
import { assemble, World, WorldError, type LogEntry } from '../../src/content/world';
import { readPacks } from './disk';

const packs = readPacks();
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
type Files = Parameters<typeof parseContent>[0];

/** A live world grown to its end, its Dungeon Master picking a cue at random each step: the files after each step. */
function grow(seed: number): { world: World; stages: Files[] } {
  const world = new World(seed, packs);
  world.open();
  const stages = [world.files()];
  const rand = rng(seed + 1000);
  while (!world.complete) {
    const options = world.options();
    expect(
      options.length,
      `seed ${seed}: the story stalled after ${world.storyRegions.length} regions`,
    ).toBeGreaterThan(0);
    world.apply(world.choose(options[Math.floor(rand() * options.length)].cue));
    stages.push(world.files());
  }
  return { world, stages };
}

describe('a world from its log', () => {
  it.each(SEEDS)('replays a random campaign of seed %i to the same campaign', (seed) => {
    const a = assemble(seed, packs);
    const again = new World(seed, packs);
    again.replay(a.log);
    expect(again.files()).toEqual(a.files);
    expect(again.layout).toEqual(a.layout);
  });

  it.each(SEEDS.slice(0, 20))('grows a live world of seed %i step by step to the end of its story', (seed) => {
    const { world, stages } = grow(seed);
    expect(world.storyRegions.length).toBe(world.arc!.regions);
    let quests: unknown[] = [];
    for (const files of stages) {
      const content = parseContent(files); // every step is a campaign the game can load
      const told = (files.quests as { quests: unknown[] }).quests;
      // The story only grows: what was told before is told the same way after.
      expect(told.slice(0, quests.length)).toEqual(quests);
      quests = told;
      expect(Object.keys(content.biomes).length).toBeGreaterThan(0);
    }
    const last = stages[stages.length - 1].quests as { quests: unknown[]; epilogue: unknown[] };
    expect(last.quests.length).toBe(world.arc!.quests.length);
    expect(last.epilogue).toEqual(expect.any(Array));
  });

  it('offers the next step as story cues, never a map, and only those the rest of the story survives', () => {
    const world = new World(3, packs);
    world.open();
    const options = world.options();
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.label).toMatch(/^Into \w+ lands/);
      expect(Object.keys(world.cat.regions)).not.toContain(o.cue); // a cue is a kind of land and crossing, not a region
    }
    // A chosen step lands where its cue says.
    const o = options[0];
    const e = world.choose(o.cue);
    world.apply(e);
    expect(e.t).toBe('step');
    if (e.t === 'step') {
      expect(world.cat.regions[e.region].themes).toContain(o.theme);
      expect([...(world.cat.pairings[e.pairing].tags ?? [])].sort()).toEqual(o.tags);
    }
  });

  it('gives the same choices and steps for the same seed and log (every co-op player agrees)', () => {
    const [a, b] = [new World(9, packs), new World(9, packs)];
    for (const w of [a, b]) w.open();
    expect(a.options()).toEqual(b.options());
    const cue = a.options()[0].cue;
    expect(a.choose(cue)).toEqual(b.choose(cue));
  });

  it('refuses a log that breaks the rules, and is unchanged by it', () => {
    const a = assemble(5, packs);
    const world = new World(5, packs);
    const [begin, step] = a.log as [LogEntry, LogEntry];
    expect(() => world.apply(step)).toThrow(WorldError); // nothing before the beginning
    world.apply(begin);
    expect(() => world.apply(begin)).toThrow(/already begun/);
    if (step.t !== 'step') throw new Error('expected a step');
    const before = JSON.stringify(world.files());
    const elsewhere = Object.keys(world.cat.regions).find(
      (id) => id !== step.region && !world.regions.includes(id) && !world.cat.regions[id].hub,
    )!;
    expect(() => world.apply({ ...step, region: elsewhere })).toThrow(WorldError);
    expect(() => world.apply({ ...step, from: 'nowhere' })).toThrow(WorldError);
    expect(() => world.apply({ ...step, foes: {} })).toThrow(/cannot be the/);
    expect(JSON.stringify(world.files())).toBe(before);
    expect(world.log).toHaveLength(1);
    world.apply(step); // the real one still fits
    expect(world.storyRegions).toHaveLength(2);
  });

  it('tells a story only as far as its regions are placed', () => {
    // A world whose opening leaves some of its story untold.
    const world = SEEDS.map((seed) => {
      const w = new World(seed, packs);
      w.open();
      return w;
    }).find((w) => !w.complete)!;
    const quests = (world.files().quests as { quests: { where?: { zones?: string[] } }[] }).quests;
    const placed = world.storyRegions.map((id) => world.cat.regions[id].biome.map);
    expect(quests.length).toBeGreaterThan(0);
    expect(quests.length).toBeLessThan(world.arc!.quests.length);
    for (const q of quests) for (const z of q.where?.zones ?? []) expect(placed).toContain(z);
    expect((world.files().quests as { epilogue: unknown[] }).epilogue).toEqual([]);
  });

  it('lets its Dungeon Master bring foes in and make people, who are in the files after the roamers', () => {
    const world = new World(7, packs);
    world.open();
    const region = world.storyRegions[0];
    const { foes, people } = world.castable(region);
    expect(foes.length).toBeGreaterThan(0);
    expect(foes[0].role).toBeDefined(); // the land's own foes first
    const look = world.lookOptions()[0].id;
    const id = world.npcId('Old Wren');
    expect(id).toBe('dm_old_wren');
    world.apply({
      t: 'npc',
      id,
      name: 'Old Wren',
      look,
      lines: ['The lanterns went out one by one.', 'Ask the keeper.'],
    });
    world.apply({ t: 'cast', region, entity: foes[0].id, x: 10, y: 12 });
    world.apply({ t: 'cast', region, entity: id, x: 11, y: 12 });
    expect(world.castable(region).people[0]).toEqual({ id, name: 'Old Wren' });
    const files = world.files();
    const content = parseContent(files);
    expect(content.entities[id]).toMatchObject({
      type: 'npc',
      name: 'Old Wren',
      lines: ['The lanterns went out one by one.', 'Ask the keeper.'],
    });
    expect(content.scenarios.nodes.get(region)?.cast).toEqual([
      { entity: foes[0].id, x: 10, y: 12 },
      { entity: id, x: 11, y: 12 },
    ]);
    // The tale moves on: they say something else from now on, and a replay agrees.
    world.apply({ t: 'voice', id, lines: ['You found the keeper. Good.'] });
    expect(parseContent(world.files()).entities[id]).toMatchObject({ lines: ['You found the keeper. Good.'] });
    // A log with them replays to the same world.
    const again = new World(7, packs);
    again.replay(world.log);
    expect(again.files()).toEqual(world.files());
    expect(people.length).toBeGreaterThan(0);
  });

  it('refuses a new voice for nobody the DM made, or with lines that do not fit', () => {
    const world = new World(7, packs);
    world.open();
    const look = world.lookOptions()[0].id;
    world.apply({ t: 'npc', id: 'dm_x', name: 'X', look, lines: ['hi'] });
    const bad: LogEntry[] = [
      { t: 'voice', id: 'nobody', lines: ['hi'] },
      { t: 'voice', id: look, lines: ['hi'] },
      { t: 'voice', id: 'dm_x', lines: [] },
      { t: 'voice', id: 'dm_x', lines: ['x'.repeat(200)] },
    ];
    for (const e of bad) expect(() => world.apply(e), JSON.stringify(e)).toThrow(WorldError);
  });

  it('lets the DM rewrite a signpost and restore it, replays the same, and refuses what does not fit', () => {
    const world = new World(7, packs);
    world.open();
    const region = world.storyRegions[0];
    const map = world.cat.regions[region].biome.map;
    const stands = [{ col: 12, row: 40 }];
    world.signsOf = (m) => (m === map ? stands : undefined);
    const before = JSON.stringify(world.files());
    const base = world.log.length;
    const bad: LogEntry[] = [
      { t: 'sign', region: 'nowhere', col: 12, row: 40, lines: ['hi'] },
      { t: 'sign', region, col: 13, row: 40, lines: ['hi'] }, // no sign stands there
      { t: 'sign', region, col: -1, row: 40, lines: ['hi'] },
      { t: 'sign', region, col: 12.5, row: 40, lines: ['hi'] },
      { t: 'sign', region, col: 12, row: 40, lines: ['x'.repeat(200)] },
      { t: 'sign', region, col: 12, row: 40, lines: ['a', 'b', 'c', 'd', 'e'] },
      { t: 'sign', region, col: 12, row: 40, lines: [' '] },
    ];
    for (const e of bad) expect(() => world.apply(e), JSON.stringify(e)).toThrow(WorldError);
    expect(world.log).toHaveLength(base); // nothing was taken
    expect(world.signOverride(region, 12, 40)).toBeUndefined();
    world.apply({ t: 'sign', region, col: 12, row: 40, lines: ['Beware the goat.', 'Seriously.'] });
    expect(world.signOverride(region, 12, 40)).toEqual(['Beware the goat.', 'Seriously.']);
    expect(JSON.stringify(world.files())).toBe(before); // a sign is not content: only the log carries it
    const again = new World(7, packs);
    again.replay(world.log); // with no maps in hand every cell is accepted, and the replay agrees
    expect(again.signOverride(region, 12, 40)).toEqual(['Beware the goat.', 'Seriously.']);
    world.apply({ t: 'sign', region, col: 12, row: 40, lines: [] }); // the log only grows: this gives it back
    expect(world.signOverride(region, 12, 40)).toBeUndefined();
    expect(world.log).toHaveLength(base + 2);
  });

  it('sets a town beside the start in most worlds, where no foe lives and the story can still be told', () => {
    let towns = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const world = new World(seed, packs);
      world.open();
      for (let n = 0; !world.complete && n < 10; n++) world.apply(world.choose(world.options()[0].cue));
      expect(world.complete, `seed ${seed}`).toBe(true);
      const haven = world.regions.find((id) => world.cat.regions[id].haven);
      if (!haven) continue;
      towns++;
      expect(world.storyRegions).not.toContain(haven);
      expect(world.foesByRegion[haven] ?? {}).toEqual({});
      expect(() => parseContent(world.files())).not.toThrow();
    }
    expect(towns).toBeGreaterThan(20);
    const random = assemble(5, packs);
    expect(random.regions.some((id) => id === 'hearthmere')).toBe(true);
  });

  it('refuses a cast or a new person that breaks the rules', () => {
    const world = new World(7, packs);
    world.open();
    const region = world.storyRegions[0];
    const look = world.lookOptions()[0].id;
    const mob = world.castable(region).foes[0].id;
    const bad: LogEntry[] = [
      { t: 'cast', region: 'nowhere', entity: mob, x: 1, y: 1 },
      { t: 'cast', region, entity: 'nobody', x: 1, y: 1 },
      { t: 'cast', region, entity: mob, x: -1, y: 1 },
      { t: 'cast', region, entity: mob, x: 1.5, y: 1 },
      { t: 'npc', id: 'goblin', name: 'Gob', look, lines: ['hi'] },
      { t: 'npc', id: 'dm_x', name: '', look, lines: ['hi'] },
      { t: 'npc', id: 'dm_x', name: 'X', look: mob, lines: ['hi'] },
      { t: 'npc', id: 'dm_x', name: 'X', look, lines: [] },
      { t: 'npc', id: 'dm_x', name: 'X', look, lines: ['a', 'b', 'c', 'd', 'e'] },
      { t: 'npc', id: 'dm_x', name: 'X', look, lines: ['x'.repeat(200)] },
    ];
    for (const e of bad) expect(() => world.apply(e), JSON.stringify(e)).toThrow(WorldError);
    expect(world.log).toHaveLength(world.regions.length); // the story's regions and the town beside its start: nothing more
  });
});
