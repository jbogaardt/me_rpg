import { describe, expect, it } from 'vitest';
import { ContentManager, type ContentSource } from '../../src/content/ContentManager';
import { ContentError } from '../../src/content/schema';
import { readContentFile } from './disk';
import { MOB_KINDS } from '../../src/systems/combat';
import { NPC_LOOKS } from '../../src/systems/looks';

/** The shipped files, through a source that counts its fetches (as a database would be asked). */
function source(change?: (file: string, json: unknown) => unknown) {
  const asked: string[] = [];
  const src: ContentSource = {
    fetch(file) {
      asked.push(file);
      const json = readContentFile(file);
      return Promise.resolve(change ? change(file, json) : json);
    },
  };
  return { src, asked };
}

describe('ContentManager', () => {
  it('fetches each file once and answers by id', async () => {
    const { src, asked } = source();
    const content = await ContentManager.load(src);
    expect(asked.sort()).toEqual(['biomes', 'entities', 'quests', 'scenarios']);
    expect(content.startNode.node_id).toBe('greenwood');
    expect(content.getScenario('greenwood').biome_type).toBe('greenwood');
    expect(content.getBiomeInfo('greenwood').climate).toBe('temperate');
    expect(content.getEntityBaseStats('goblin').stats?.hp).toBeGreaterThan(0);
    expect(content.mobKind('goblin').name).toBe(content.getEntityBaseStats('goblin').name);
    expect(() => content.getScenario('nowhere')).toThrow(/No scenario node "nowhere"/);
  });

  it('refuses broken content with every problem listed', async () => {
    const { src } = source((file, json) => (file === 'scenarios' ? { ...(json as object), start: 'nowhere' } : json));
    await expect(ContentManager.load(src)).rejects.toBeInstanceOf(ContentError);
  });

  it('installs its entities where the rules look them up', async () => {
    const content = await ContentManager.load(source().src);
    content.install();
    const record = MOB_KINDS;
    expect(MOB_KINDS.goblin).toEqual(content.mobKind('goblin'));
    expect(MOB_KINDS).toBe(record); // the same record, refilled
    expect(NPC_LOOKS.elder).toEqual(content.getEntityBaseStats('elder').sprite);
  });
});
