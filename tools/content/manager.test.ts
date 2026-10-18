import { describe, expect, it } from 'vitest';
import { ContentManager, type ContentSource } from '../../src/content/ContentManager';
import { ContentError } from '../../src/content/schema';
import { installContentFromDisk, readContentFile } from './disk';
import { ITEMS } from '../../src/systems/items';
import { itemCount, itemFromCode } from '../../src/systems/inventory';
import { SHOPS } from '../../src/systems/shops';
import { CHEST_LOOTS } from '../../src/systems/chests';
import { MOB_KINDS, newHero } from '../../src/systems/combat';
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
    expect(asked.sort()).toEqual(['biomes', 'entities', 'items', 'quests', 'scenarios']);
    expect(content.startNode.node_id).toBe('greenwood');
    expect(content.getScenario('greenwood').biome_type).toBe('greenwood');
    expect(content.getBiomeInfo('greenwood').climate).toBe('temperate');
    expect(content.getEntityBaseStats('goblin').stats?.hp).toBeGreaterThan(0);
    expect(content.mobKind('goblin').name).toBe(content.getEntityBaseStats('goblin').name);
    expect(() => content.getScenario('nowhere')).toThrow(/No scenario node "nowhere"/);
  });

  describe('home (where a solo hero wakes after a fall or a reload)', () => {
    const withHome = (home: string | undefined) =>
      source((file, json) => {
        if (file !== 'scenarios') return json;
        const { home: _own, ...rest } = json as { home?: string };
        return home === undefined ? rest : { ...rest, home };
      }).src;

    it('is the town in campaign 1, the start node where the content names none', async () => {
      expect((await ContentManager.load(source().src)).homeNode.node_id).toBe('town');
      const none = await ContentManager.load(withHome(undefined));
      expect(none.homeNode.node_id).toBe(none.startNode.node_id);
    });

    it('is refused when it names a node the campaign lacks', async () => {
      await expect(ContentManager.load(withHome('nowhere'))).rejects.toThrow(/scenarios.json.home.*no node "nowhere"/);
    });
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

  it('installs a campaign’s own goods: its items (and their codes), shops, loots and starting gear', () => {
    try {
      installContentFromDisk('campaign2');
      expect(ITEMS.silverSword).toBeUndefined(); // campaign 2 has a short list of its own
      expect(itemCount()).toBe(Object.keys(ITEMS).length);
      expect(itemFromCode(1)).toBe(ITEMS.rustySword);
      expect(newHero().weapon).toBe(ITEMS.rustySword);
      expect(Object.keys(SHOPS)).toEqual([]);
      expect(CHEST_LOOTS.elixir).toEqual({ hp: 40, mp: 40 });
      expect(CHEST_LOOTS.bandageKit).toEqual({ item: ITEMS.bandageKit });
    } finally {
      installContentFromDisk();
    }
    expect(ITEMS.silverSword).toBeDefined();
    expect(Object.keys(SHOPS)).toContain('wizard');
  });
});
