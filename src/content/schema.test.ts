import { describe, expect, it } from 'vitest';
import { ContentError, meets, parseContent, requirementText, toMobKind, type ContentFile } from './schema';

const files = (): Record<ContentFile, unknown> => ({
  entities: {
    version: 1,
    entities: {
      goblin: {
        type: 'mob',
        name: 'Goblin',
        sprite: { body: 'body.goblin' },
        stats: { hp: 20, attack: 4, defense: 0, speed: 70, sight: 160, xp: 5, gold: 3 },
        behavior: { windup: 0.4, shot: { range: 100, speed: 90, color: '#ff8800' } },
      },
      elder: { type: 'npc', name: 'Elder', sprite: { body: 'body.light' }, lines: ['Hello.'] },
    },
  },
  biomes: {
    version: 1,
    biomes: {
      forest: {
        name: 'The Forest',
        tint: '#88cc44',
        links: [],
        map: 'greenwood',
        climate: 'temperate',
        music: null,
        tilesets: ['a.png'],
        generation: { roam: [{ kinds: ['goblin'], count: 2, seed: 1, apart: 5, avoid: [] }] },
      },
    },
  },
  quests: {
    version: 1,
    giver: 'elder',
    givers: { elder: { name: 'The Elder', look: 'elder', tag: 'Elder', zone: 'greenwood' } },
    sites: { stone: { name: 'Stone', shape: 'stone', color: '#aabbcc', glow: '#ffffff', notes: [['It hums.']] } },
    chapters: [{ title: 'One', intro: ['Listen.'] }],
    quests: [
      {
        id: 'cull',
        chapter: 0,
        learned: 'Goblins fear the dark.',
        fieldNote: ['Done.'],
        title: 'Cull',
        goal: 'Drive off 2 goblins',
        hint: 'In The Forest.',
        where: { zones: ['greenwood'] },
        unit: 'goblins',
        objective: { t: 'kill', kind: 'goblin', count: 2 },
        reward: { gold: 5, xp: 5, items: ['potion'] },
        offer: ['Go.'],
        remind: ['Still?'],
        done: ['Thanks.'],
      },
    ],
    epilogue: ['The end.'],
  },
  scenarios: {
    version: 1,
    start: 'woods',
    nodes: [
      {
        node_id: 'woods',
        biome_type: 'forest',
        entities: [{ entity: 'goblin', x: 3, y: 4 }],
        choices: [{ text: 'Go on', next: 'woods', requires: { stat: 'level', min: 3 } }],
      },
    ],
  },
});

const problems = (f: Record<ContentFile, unknown>) => {
  try {
    parseContent(f);
    return [];
  } catch (err) {
    if (err instanceof ContentError) return err.problems;
    throw err;
  }
};

describe('parseContent', () => {
  it('reads valid content', () => {
    const c = parseContent(files());
    expect(c.entities.goblin?.stats?.hp).toBe(20);
    expect(c.biomes.forest?.generation.roam?.[0]?.kinds).toEqual(['goblin']);
    expect(c.scenarios.nodes.get('woods')?.choices[0]?.requires).toEqual({ stat: 'level', min: 3 });
    expect(c.biomes.forest?.name).toBe('The Forest');
    expect(c.quests.quests[0]?.objective).toEqual({ t: 'kill', kind: 'goblin', count: 2 });
    expect(c.quests.sites.stone?.color).toBe(0xaabbcc);
  });

  it('reads the capabilities a campaign switches off, and refuses ones that are not', () => {
    const f = files();
    (f.scenarios as { capabilities: unknown }).capabilities = { map: false, needs: false };
    expect(parseContent(f).scenarios.capabilities).toEqual({ map: false, needs: false });
    (f.scenarios as { capabilities: unknown }).capabilities = { jetpack: false, map: 'no' };
    const p = problems(f).join('\n');
    expect(p).toMatch(/scenarios\.json\.capabilities\.jetpack: is not a capability/);
    expect(p).toMatch(/scenarios\.json\.capabilities\.map: must be true or false/);
  });

  it('checks the quests against the rest of the content', () => {
    const f = files();
    const q = f.quests as {
      giver: string;
      givers: Record<string, { look: string; zone: string }>;
      quests: { chapter: number; objective: object; reward: { items: string[] }; where: { zones: string[] } }[];
    };
    q.giver = 'nobody';
    q.givers.elder!.look = 'goblin';
    q.quests[0]!.chapter = 4;
    q.quests[0]!.objective = { t: 'gather', site: 'tree', zone: 'greenwood', count: 2 };
    q.quests[0]!.reward.items = ['crown'];
    q.quests[0]!.where.zones = ['moon'];
    const p = problems(f).join('\n');
    expect(p).toMatch(/quests\.json\.giver: "nobody" is not in givers/);
    expect(p).toMatch(/givers\.elder\.look: "goblin" is not an npc/);
    expect(p).toMatch(/quests\.cull\.chapter: no chapter 4/);
    expect(p).toMatch(/"tree" is not in sites/);
    expect(p).toMatch(/"crown" is not an item/);
    expect(p).toMatch(/"moon" is not the map of any biome/);
  });

  it('lists every problem with where it is', () => {
    const f = files();
    const e = (f.entities as { entities: Record<string, Record<string, unknown>> }).entities;
    e.goblin!.stats = { hp: 'lots' };
    e.troll = { type: 'beast', name: '', sprite: { wings: 'x' } };
    const s = f.scenarios as { start: string; nodes: { entities: unknown[]; choices: unknown[] }[] };
    s.start = 'nowhere';
    s.nodes[0]!.entities.push({ entity: 'dragon', x: 1, y: 1 });
    s.nodes[0]!.choices.push({ text: 'Fly', next: 'sky' }, { text: 'Cast', next: 'woods', requires: { skill: 'fly' } });
    const p = problems(f).join('\n');
    expect(p).toMatch(/entities\.goblin\.stats\.hp: must be a number/);
    expect(p).toMatch(/entities\.troll\.type: must be "mob" or "npc"/);
    expect(p).toMatch(/entities\.troll\.sprite\.wings: is not a slot/);
    expect(p).toMatch(/scenarios\.json\.start: no node "nowhere"/);
    expect(p).toMatch(/"dragon" is not in entities\.json/);
    expect(p).toMatch(/choices\[1\]\.next: no node "sky"/);
    expect(p).toMatch(/"fly" is not a skill/);
  });

  it('wants the version it reads', () => {
    const f = files();
    (f.biomes as { version: number }).version = 2;
    expect(problems(f).join()).toMatch(/biomes\.json\.version: must be 1/);
  });

  it('refuses a roam rule naming a person, and a duplicate node', () => {
    const f = files();
    (
      f.biomes as { biomes: { forest: { generation: { roam: { kinds: string[] }[] } } } }
    ).biomes.forest.generation.roam[0]!.kinds = ['elder'];
    const s = f.scenarios as { nodes: unknown[] };
    s.nodes.push(s.nodes[0]);
    const p = problems(f).join('\n');
    expect(p).toMatch(/"elder" is not a mob/);
    expect(p).toMatch(/node_id is used twice/);
  });
});

describe('port bindings', () => {
  it('must lead back the way they came', () => {
    const f = files();
    const biomes = (f.biomes as { biomes: Record<string, Record<string, unknown>> }).biomes;
    const cave = { ...biomes.forest, name: 'The Cave', map: 'cave', links: [] };
    biomes.cave = { ...cave, ports: { up: { map: 'greenwood', port: 'down' } } };
    biomes.forest!.ports = { down: { map: 'cave', port: 'up' } };
    expect(problems(f)).toEqual([]);
    biomes.forest!.ports = { down: { map: 'cave', port: 'left' }, side: { map: 'moon', port: 'x' } };
    const p = problems(f).join('\n');
    expect(p).toMatch(/biomes\.forest\.ports\.down: cave's port "left" does not lead back to it/);
    expect(p).toMatch(/biomes\.forest\.ports\.side: "moon" is not the map of any biome/);
    expect(p).toMatch(/biomes\.cave\.ports\.up: greenwood's port "down" does not lead back to it/);
  });
});

describe('toMobKind', () => {
  it('turns an entity into the engine’s MobKind, colours as numbers', () => {
    const kind = toMobKind(parseContent(files()).entities.goblin!);
    expect(kind).toMatchObject({ name: 'Goblin', maxHp: 20, speed: 70, sight: 160, windup: 0.4 });
    expect(kind.shot).toEqual({ range: 100, speed: 90, color: 0xff8800 });
    expect(kind.recover).toBeUndefined();
  });
});

describe('requirements', () => {
  const hero = { stats: { level: 4, attack: 6, defense: 2, magic: 9 }, skills: ['ironSkin'] };
  it('check a stat or a skill', () => {
    expect(meets(hero, undefined)).toBe(true);
    expect(meets(hero, { stat: 'level', min: 4 })).toBe(true);
    expect(meets(hero, { stat: 'magic', min: 10 })).toBe(false);
    expect(meets(hero, { skill: 'ironSkin' })).toBe(true);
    expect(meets(hero, { skill: 'spiritMark' })).toBe(false);
  });
  it('read as text', () => {
    expect(requirementText({ stat: 'level', min: 4 })).toBe('Level 4');
    expect(requirementText({ skill: 'ironSkin' }, () => 'Iron Skin')).toBe('Knows Iron Skin');
  });
});
