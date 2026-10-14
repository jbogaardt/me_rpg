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
});
