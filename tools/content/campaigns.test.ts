// Every campaign's content is held to the rules campaign 1's enemies, people and items are (systems/combat.test.ts and
// tools/sprites/parts.test.ts check campaign 1, which the other tests run on): playable, readable enemies, real art.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WHOLE_BODIES } from '../../sprites/parts';
import { outfitLayers, type Outfit, type PartManifest } from '../../src/sprites/doll';
import { mobLevel, mobTimings } from '../../src/systems/combat';
import { POISE_CAP } from '../../src/systems/mobDefense';
import { heroModel } from '../../src/systems/dmBoss';
import { ROOT } from '../map/image';
import { capabilityTable } from '../../src/content/schema';
import { gated } from '../../src/systems/levels';
import { campaigns, loadContentFromDisk, PACKS } from './disk';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/sprites/lpc/parts.json'), 'utf8')) as PartManifest;
const HERO_SPEED = 120;
// Hero levels: a foe at or over ELITE_LEVEL has poise and keeps up or charges; one under LOW_TIER has none (it staggers on every blow).
const ELITE_LEVEL = 7;
const LOW_TIER = 5;
const MELEE_REACH = 44; // `REACH` in src/entities/Mob.ts (the tools project has no DOM, so it cannot import that file)
// A kind that may attack without a windup/tell: none today (every attack must warn the hero). A new entry is a
// deliberate, documented exception ("<kind id>: why a blow without warning is fair"), reviewed by combat-and-controls.
const NO_TELL = new Set<string>();

// The packs (every region and mob of them at once) are held to the same rules: any seed can put any of them in a game.
describe.each([...campaigns(), PACKS])('%s', (campaign) => {
  const content = loadContentFromDisk(campaign);
  const { entities, quests, scenarios, items } = content.content;
  const mobs = Object.entries(entities).filter(([, e]) => e.type === 'mob');

  it('has enemies, people and a story', () => {
    expect(mobs.length).toBeGreaterThan(0);
    if (campaign !== PACKS) expect(quests.quests.length).toBeGreaterThan(0); // the packs' stories are their arcs
    expect(scenarios.nodes.has(scenarios.start)).toBe(true);
    if (scenarios.home) expect(scenarios.nodes.has(scenarios.home)).toBe(true); // where a solo hero wakes; the map check proves the spot is walkable
  });

  it('has no two people with the same name (a story would meet them twice)', () => {
    const seen = new Map<string, string>();
    for (const [id, e] of Object.entries(entities)) {
      if (e.type !== 'npc') continue;
      const key = e.name.trim().replace(/\s+/g, ' ').toLowerCase();
      expect(seen.get(key), `${id} and ${seen.get(key)} are both "${e.name}"`).toBeUndefined();
      seen.set(key, id);
    }
  });

  it.each(Object.entries(entities))('%s is drawn with real parts, each in its own slot', (_id, e) => {
    const outfit: Outfit = e.sprite;
    for (const [slot, part] of Object.entries(outfit)) {
      expect(manifest[part], `${slot}: ${part}`).toBeDefined();
      expect(part.startsWith(`${slot}.`), `${part} is not a ${slot} part`).toBe(true);
    }
    if (!WHOLE_BODIES.has(outfit.body ?? '')) expect(outfit.head).toBeDefined();
    expect(outfitLayers(outfit, manifest).length).toBeGreaterThan(0);
  });

  it.each(mobs)('%s is a fair enemy for a hero who can reach it', (id) => {
    const kind = content.mobKind(id);
    const { windup, recover, stagger } = mobTimings(kind);
    expect(windup * 0.8).toBeGreaterThanOrEqual(0.4); // even the shortest spread windup (-20%) outlasts a reaction
    expect(stagger).toBeLessThan(windup + recover);
    expect(heroModel(mobLevel(kind)).power - kind.defense).toBeGreaterThan(0); // a hero of its own level can always hurt it
    if (kind.shot) {
      expect(kind.shot.range).toBeLessThanOrEqual(kind.sight);
      expect(kind.shot.speed).toBeLessThan(HERO_SPEED * 1.6);
      expect(windup).toBeGreaterThanOrEqual(0.5);
    }
  });

  // Tough foes (systems/mobDefense.ts): the elites hold their ground, and a foe that hits that hard cannot simply be walked away from.
  it.each(mobs)('%s has the poise, speed and gap-closer its tier calls for', (id) => {
    const kind = content.mobKind(id);
    const melee = !kind.shot && !kind.ray;
    const elite = !!kind.named || mobLevel(kind) >= ELITE_LEVEL;
    if (kind.poiseMax) {
      expect(kind.poiseMax, `${id} poise`).toBeGreaterThanOrEqual(3);
      expect(kind.poiseMax, `${id} poise`).toBeLessThanOrEqual(POISE_CAP);
      expect(mobTimings(kind).stagger, `${id}: a poise break must stagger it for a real moment`).toBeGreaterThanOrEqual(
        0.25,
      );
    }
    if (mobLevel(kind) < LOW_TIER && !kind.named) expect(kind.poiseMax ?? 0, `${id} is low tier`).toBe(0);
    if (elite && melee) {
      expect(kind.poiseMax ?? 0, `${id} is an elite`).toBeGreaterThanOrEqual(3);
      // it keeps up with a walking hero, or it closes the gap itself
      expect(kind.speed >= HERO_SPEED || !!kind.charge, `${id} is slow and has no charge`).toBe(true);
    }
    if (kind.guard) expect(kind.poiseMax ?? 0, `${id}: a shield breaks with its poise`).toBeGreaterThan(0);
    if (kind.charge) {
      expect(melee, `${id}: a shooter does not charge`).toBe(true);
      expect(kind.charge.windup * 0.8, `${id}: a charge must be readable`).toBeGreaterThanOrEqual(0.4);
      expect(kind.charge.speed).toBeGreaterThan(HERO_SPEED);
      expect(kind.charge.range).toBeLessThan(kind.sight);
      expect(kind.charge.range, `${id}: it must not charge from inside its own reach`).toBeGreaterThan(
        MELEE_REACH * (kind.scale ?? 1),
      );
    }
  });

  it.each(mobs)('%s warns before it attacks (a windup) unless listed in NO_TELL', (id) => {
    if (NO_TELL.has(id)) return;
    const kind = content.mobKind(id);
    expect(mobTimings(kind).windup, `${id} has no windup`).toBeGreaterThan(0);
  });

  it.each(Object.entries(items.items))(
    'item %s is priced and drawn with real parts, each in its own slot',
    (_id, item) => {
      expect(item.value ?? 0).toBeGreaterThan(0);
      for (const [slot, part] of Object.entries(item.look ?? {})) {
        expect(manifest[part], `${slot}: ${part}`).toBeDefined();
        expect(part.startsWith(`${slot}.`), `${part} is not a ${slot} part`).toBe(true);
      }
    },
  );

  it('gives every wand and tome its own spells and strings (no spell or combo on two weapons)', () => {
    const combos = Object.values(items.items).flatMap((i) => i.focus?.combos ?? []);
    expect(new Set(combos.map((c) => c.spell)).size).toBe(combos.length);
    expect(new Set(combos.map((c) => c.keys)).size).toBe(combos.length);
  });

  it('never sells one item in two shops', () => {
    const sold = Object.values(items.shops).flatMap((s) => s.stock);
    expect(new Set(sold).size).toBe(sold.length);
  });
});

// A named boss (entities.json `boss`, systems/bosses.ts) is a mob that a `boss` objective names, nothing else is.
describe.each(campaigns())('%s bosses', (campaign) => {
  const content = loadContentFromDisk(campaign);
  const { entities, quests } = content.content;

  it('are mobs, and every boss objective names one', () => {
    for (const [id, e] of Object.entries(entities)) if (e.boss) expect(e.type, id).toBe('mob');
    for (const q of quests.quests)
      if (q.objective.t === 'boss') expect(entities[q.objective.boss]?.boss, q.id).toBe(true);
  });

  it('are installed as named kinds', () => {
    for (const [id, e] of Object.entries(entities))
      if (e.type === 'mob') expect(!!content.mobKind(id).named, id).toBe(!!e.boss);
  });
});

it('campaign 1 ends its story on a named boss, so the epilogue follows its reward', () => {
  const { quests, entities } = loadContentFromDisk('campaign1').content;
  expect(quests.quests[quests.quests.length - 1]?.objective.t).toBe('boss');
  expect(entities.stillheart?.boss).toBe(true);
});

describe('campaign 1 level bands', () => {
  const content = loadContentFromDisk('campaign1');
  const { biomes } = content.content;
  const table = capabilityTable(content.content);

  it('gives a band only to zones with foes, and gates the two underground rooms alone', () => {
    const gated = Object.values(biomes)
      .filter((b) => b.levels && table.enabled('levelGates', b.map))
      .map((b) => b.map)
      .sort();
    expect(gated).toEqual(['cave_sunscar', 'sewer_lanternrest']);
  });

  it('keeps the first town’s sewer open to a new hero and the cave shut to a level-1 one', () => {
    const [cave, sewer] = [biomes.cave_sunscar, biomes.sewer_lanternrest];
    const slack = (zone: string) => table.setting('levelGates', 'slack', zone) as number;
    expect(gated(1, sewer.levels!, slack(sewer.map))).toBe(false);
    expect(gated(1, cave.levels!, slack(cave.map))).toBe(true);
    expect(gated(3, cave.levels!, slack(cave.map))).toBe(false);
  });
});
