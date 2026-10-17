// Every campaign's content is held to the rules campaign 1's enemies, people and items are (systems/combat.test.ts and
// tools/sprites/parts.test.ts check campaign 1, which the other tests run on): playable, readable enemies, real art.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WHOLE_BODIES } from '../../sprites/parts';
import { outfitLayers, type Outfit, type PartManifest } from '../../src/sprites/doll';
import { mobLevel, mobTimings } from '../../src/systems/combat';
import { heroModel } from '../../src/systems/dmBoss';
import { ROOT } from '../map/image';
import { campaigns, loadContentFromDisk, PACKS } from './disk';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/sprites/lpc/parts.json'), 'utf8')) as PartManifest;
const HERO_SPEED = 120;

// The packs (every region and mob of them at once) are held to the same rules: any seed can put any of them in a game.
describe.each([...campaigns(), PACKS])('%s', (campaign) => {
  const content = loadContentFromDisk(campaign);
  const { entities, quests, scenarios, items } = content.content;
  const mobs = Object.entries(entities).filter(([, e]) => e.type === 'mob');

  it('has enemies, people and a story', () => {
    expect(mobs.length).toBeGreaterThan(0);
    if (campaign !== PACKS) expect(quests.quests.length).toBeGreaterThan(0); // the packs' stories are their arcs
    expect(scenarios.nodes.has(scenarios.start)).toBe(true);
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
    expect(windup).toBeGreaterThanOrEqual(0.25);
    expect(stagger).toBeLessThan(windup + recover);
    expect(heroModel(mobLevel(kind)).power - kind.defense).toBeGreaterThan(0); // a hero of its own level can always hurt it
    if (kind.shot) {
      expect(kind.shot.range).toBeLessThanOrEqual(kind.sight);
      expect(kind.shot.speed).toBeLessThan(HERO_SPEED * 1.6);
      expect(windup).toBeGreaterThanOrEqual(0.5);
    }
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
