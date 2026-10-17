// The long arcs of the packs (public/content/packs/marches.json: 7, 8 and 9 regions) and the regions that make them
// possible: assembled over many seeds, the long arcs are really chosen, tell a story of 7 to 9 regions that never reuses
// a land and rises in depth, every quest of it is doable and paid as a share of a level, and the same seed is the same world.
import { describe, expect, it } from 'vitest';
import { ContentManager } from '../../src/content/ContentManager';
import { depthBand, depthLevel } from '../../src/content/depth';
import { mergePacks, rng, storyFor, STORY_BUDGET, partnersOf } from '../../src/content/packs';
import { parseContent } from '../../src/content/schema';
import { xpToNext } from '../../src/systems/combat';
import { assembleFromDisk, readPacks } from './disk';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const cat = mergePacks(readPacks());
const LONG = Object.entries(cat.arcs).filter(([, a]) => a.regions >= 7);
const LONG_IDS = LONG.map(([id]) => id);
const made = SEEDS.map(assembleFromDisk);
const told = made.filter((a) => LONG_IDS.includes(a.arc));
/** The regions a campaign's story runs through (r1 to rN), in order. */
const storyOf = (a: (typeof made)[number]) => a.regions.slice(0, cat.arcs[a.arc].regions);

describe('long arcs', () => {
  it('there are at least two arcs of 7 or more regions, with a 9-region one', () => {
    expect(LONG.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...LONG.map(([, a]) => a.regions))).toBeGreaterThanOrEqual(9);
  });

  it('are chosen over many seeds, and tell stories of 7 or more regions', () => {
    for (const id of LONG_IDS) expect(made.filter((a) => a.arc === id).length, `${id} is chosen`).toBeGreaterThan(10);
    const lengths = told.map((a) => storyOf(a).length);
    expect(Math.max(...lengths)).toBeGreaterThanOrEqual(9);
    expect(new Set(lengths).size).toBeGreaterThanOrEqual(2);
    // Varied: many different chains, from more than one hub.
    expect(new Set(told.map((a) => storyOf(a).join('>'))).size).toBeGreaterThan(40);
    expect(new Set(told.map((a) => a.regions[0])).size).toBeGreaterThan(1);
  });

  it('are found within the search budget, for every seed, however winding', () => {
    for (const [id, arc] of LONG)
      for (let seed = 1; seed <= 100; seed++) {
        const story = storyFor(cat, arc, rng(seed));
        expect(story, `${id}, seed ${seed}`).not.toBeNull();
        expect(story!.regions).toHaveLength(arc.regions);
      }
    expect(STORY_BUDGET).toBeGreaterThanOrEqual(5000);
  });

  it('never use a land twice, and rise in depth along the chain', () => {
    for (const a of told) {
      const story = storyOf(a);
      expect(new Set(a.regions).size, `seed ${a.seed}: no region twice`).toBe(a.regions.length);
      expect(new Set(story).size).toBe(story.length);
      const { biomes } = parseContent(a.files);
      let before = 0;
      story.forEach((id, i) => {
        expect(cat.regions[id].terminal || cat.regions[id].haven, `${id} is a story step`).toBeFalsy();
        const band = biomes[id].levels!;
        expect(band, `seed ${a.seed}: ${id} at step ${i}`).toEqual(depthBand(i).levels);
        expect(band[0]).toBeGreaterThanOrEqual(before);
        before = band[0];
        if (i) expect(cat.regions[id].level[0]).toBeGreaterThanOrEqual(cat.regions[story[i - 1]].level[0]);
      });
      // The last step is deeper than the first by a few levels, never flat.
      expect(depthBand(story.length - 1).levels[1]).toBeGreaterThan(depthBand(0).levels[1] + 3);
    }
  });

  it('curl round the grid without a door from the start into the far end: doors join neighbours in depth', () => {
    for (const a of told) {
      const story = storyOf(a);
      const { biomes } = parseContent(a.files);
      for (const [id, b] of Object.entries(biomes))
        for (const to of Object.values(b.ports)) {
          const other = Object.keys(biomes).find((k) => biomes[k].map === to.map)!;
          const [i, j] = [story.indexOf(id), story.indexOf(other)];
          if (i >= 0 && j >= 0) expect(Math.abs(i - j), `seed ${a.seed}: ${id} to ${other}`).toBeLessThanOrEqual(1);
        }
    }
  });

  it('assemble into campaigns the game loads, every quest doable and paid as a share of a level', () => {
    for (const a of told) {
      const content = new ContentManager(parseContent(a.files)); // the game's own checks: sites, mobs and zones exist
      const { quests, biomes } = content.content;
      const story = storyOf(a);
      expect(quests.quests.length, `seed ${a.seed}`).toBeGreaterThanOrEqual(story.length);
      expect(JSON.stringify(quests)).not.toMatch(/\{[\w.~]+\}|"@/);
      let chapter = 0;
      for (const q of quests.quests) {
        expect(q.chapter, q.id).toBeGreaterThanOrEqual(chapter);
        chapter = q.chapter;
        const step = story.findIndex((id) => biomes[id].map === q.where.zones[0]);
        expect(step, `${q.id} is told in a story region`).toBeGreaterThanOrEqual(0);
        expect(q.chapter, `${q.id}: its chapter is its region's leg`).toBe(step);
        // A share of the level it is told at (a boss at most one level's half), never thousands.
        const need = xpToNext(depthLevel(step));
        expect(q.reward.xp, `${q.id} xp`).toBeLessThanOrEqual(Math.ceil(need * 0.55));
        expect(q.reward.gold, `${q.id} gold`).toBeLessThanOrEqual(120);
      }
      expect(quests.chapters).toHaveLength(story.length);
      expect(quests.epilogue.length).toBeGreaterThan(0);
    }
  });

  it('are paced: quiet legs (a gather) and fights alternate, and the last leg ends on its boss', () => {
    for (const [id, arc] of LONG) {
      const kinds = new Map<number, Set<string>>();
      for (const q of arc.quests as { objective: { t: string; kind?: string; site?: string } }[]) {
        const o = q.objective;
        const m = /^@r(\d+)\./.exec(o.kind ?? o.site ?? '');
        const step = Number(m![1]);
        kinds.set(step, (kinds.get(step) ?? new Set()).add(o.t));
      }
      for (let i = 2; i < arc.regions; i++) {
        const [here, next] = [kinds.get(i)!, kinds.get(i + 1)!];
        expect(here, `${id} r${i}`).toBeDefined();
        // consecutive middle legs differ: one is only a gather, the next a fight
        if (i + 1 <= arc.regions)
          expect(here.has('gather'), `${id}: r${i} and r${i + 1} alternate`).not.toBe(next.has('gather'));
      }
      const last = (arc.quests as { objective: { kind?: string } }[]).at(-1)!;
      expect(last.objective.kind, id).toBe(`@r${arc.regions}.boss`);
      expect((arc.epilogue ?? []).length).toBeGreaterThan(0);
      expect(arc.chapters).toHaveLength(arc.regions);
    }
  });

  it('give each new land several pairings, so many chains can run through it', () => {
    const marches = readPacks().find((p) => p.id === 'marches')!;
    expect(Object.keys(marches.regions ?? {}).length).toBeGreaterThanOrEqual(5);
    for (const [id, region] of Object.entries(marches.regions!)) {
      expect(Object.keys(region.ports).length, `${id} ports`).toBeGreaterThanOrEqual(2);
      expect(region.terminal || region.haven || region.hub).toBeFalsy();
      const partners = partnersOf(cat, id).filter((p) => !cat.regions[p].terminal);
      expect(partners.length, `${id} partners`).toBeGreaterThanOrEqual(3);
    }
    // Every pairing a story may cross says what the way looks like and what each side sees.
    for (const [id, p] of Object.entries(cat.pairings)) {
      if (p.tags?.includes('dead-end')) continue;
      const lore = p.lore as Record<string, unknown> | undefined;
      expect(typeof lore?.way, `${id} way`).toBe('string');
      for (const r of p.regions)
        expect((lore?.sign as Record<string, string>)?.[r], `${id} sign seen from ${r}`).toBeTruthy();
    }
  });

  it('are the same world for the same seed', () => {
    for (const seed of told.slice(0, 5).map((a) => a.seed))
      expect(assembleFromDisk(seed)).toEqual(assembleFromDisk(seed));
  });

  it('tell their legs by the pairing crossed', () => {
    // A variant of a chapter fires for the tag of the crossing: over the seeds, more than one line is told for one leg.
    const lines = new Set<string>();
    for (const a of told.filter((x) => x.arc === 'pilgrims_bell')) {
      const { chapters } = parseContent(a.files).quests;
      lines.add(chapters[2].intro.join('|'));
    }
    expect(lines.size).toBeGreaterThan(3);
  });
});
