// Every campaign's content is held to the rules campaign 1's enemies and people are (systems/combat.test.ts and
// tools/sprites/parts.test.ts check campaign 1, which the other tests run on): playable, readable enemies, real art.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WHOLE_BODIES } from '../../sprites/parts';
import { outfitLayers, type Outfit, type PartManifest } from '../../src/sprites/doll';
import { attackPower, mobTimings, newHero } from '../../src/systems/combat';
import { ROOT } from '../map/image';
import { campaigns, loadContentFromDisk } from './disk';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/sprites/lpc/parts.json'), 'utf8')) as PartManifest;
const HERO_SPEED = 120;

describe.each(campaigns())('%s', (campaign) => {
  const content = loadContentFromDisk(campaign);
  const { entities, quests, scenarios } = content.content;
  const mobs = Object.entries(entities).filter(([, e]) => e.type === 'mob');

  it('has enemies, people and a story', () => {
    expect(mobs.length).toBeGreaterThan(0);
    expect(quests.quests.length).toBeGreaterThan(0);
    expect(scenarios.nodes.has(scenarios.start)).toBe(true);
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
    expect(attackPower(newHero()) - kind.defense).toBeGreaterThan(0);
    if (kind.shot) {
      expect(kind.shot.range).toBeLessThanOrEqual(kind.sight);
      expect(kind.shot.speed).toBeLessThan(HERO_SPEED * 1.6);
      expect(windup).toBeGreaterThanOrEqual(0.5);
    }
  });
});
