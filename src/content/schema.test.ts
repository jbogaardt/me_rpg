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
        map: 'greenwood',
        climate: 'temperate',
        music: null,
        tilesets: ['a.png'],
        generation: { roam: [{ kinds: ['goblin'], count: 2, seed: 1, apart: 5, avoid: [] }] },
      },
    },
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
