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
  items: {
    version: 1,
    start: { weapon: 'stick' },
    items: {
      stick: { name: 'Stick', value: 1, slot: 'weapon', attack: 1, look: { weapon: 'weapon.arming_iron' } },
      potion: { name: 'Potion', value: 15, use: { hp: 20 } },
      bread: { name: 'Bread', value: 5, use: { hp: 0, food: 30 } },
      potato: { name: 'Potato', value: 3, use: { hp: 0, food: 22 } },
    },
    shops: {
      stall: {
        name: 'Stall',
        tag: 'Grocer',
        keeper: 'elder',
        greeting: ['Fresh.'],
        stock: ['potion'],
        buys: ['supply'],
      },
    },
    loots: { coins: { gold: 30 }, stick: { item: 'stick' } },
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
  it('reads a choice hint, and refuses one with no requirement', () => {
    const f = files();
    const choice = (f.scenarios as { nodes: { choices: Record<string, unknown>[] }[] }).nodes[0]!.choices[0]!;
    choice.hint = 'Too strong for you yet.';
    expect(parseContent(f).scenarios.nodes.get('woods')?.choices[0]?.hint).toBe('Too strong for you yet.');
    delete choice.requires;
    expect(problems(f).join('\n')).toMatch(/choices\[0\]\.hint: explains a requirement/);
  });

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
    (f.scenarios as { capabilities: unknown }).capabilities = { guide: false, needs: false };
    expect(parseContent(f).scenarios.capabilities).toEqual({ guide: false, needs: false });
    (f.scenarios as { capabilities: unknown }).capabilities = { jetpack: false, guide: 'no' };
    const p = problems(f).join('\n');
    expect(p).toMatch(/scenarios\.json\.capabilities\.jetpack: is not a capability/);
    expect(p).toMatch(/scenarios\.json\.capabilities\.guide: must be true, false or an object of settings/);
  });

  it('reads a biome’s own capabilities for its zone, but not campaign-wide ones', () => {
    const f = files();
    const biome = (f.biomes as { biomes: Record<string, { capabilities?: unknown }> }).biomes.forest!;
    biome.capabilities = { guide: false, needs: { drain: 2 } };
    expect(parseContent(f).biomes.forest?.capabilities).toEqual({ guide: false, needs: { drain: 2 } });
    biome.capabilities = { coop: false, needs: { drain: 99, thirst: 1 } };
    const p = problems(f).join('\n');
    expect(p).toMatch(/biomes\.forest\.capabilities\.coop: is set for the whole campaign, not per zone/);
    expect(p).toMatch(/biomes\.forest\.capabilities\.needs\.drain: must be a number from 0 to 10/);
    expect(p).toMatch(/biomes\.forest\.capabilities\.needs\.thirst: is not a setting of needs \(drain\)/);
  });

  it('refuses content asking for what its own capabilities switch off', () => {
    const f = files();
    const s = f.scenarios as { capabilities: unknown; nodes: { choices: { requires?: unknown }[] }[] };
    const q = f.quests as { quests: { objective: object; reward: { items: string[] } }[] };
    s.capabilities = { skills: false, needs: false, farming: false, trading: true, coop: false };
    s.nodes[0]!.choices[0]!.requires = { skill: 'arcaneEdge' };
    q.quests[0]!.objective = { t: 'bring', item: 'bread', count: 2 };
    q.quests[0]!.reward.items = ['potato'];
    const p = problems(f).join('\n');
    expect(p).toMatch(/nodes\.woods\.choices\[0\]\.requires: needs a skill, and this campaign has no skills/);
    expect(p).toMatch(/quests\.cull\.objective\.item: "bread" only feeds/);
    expect(p).toMatch(/quests\.cull\.reward\.items\[0\]: "potato" only feeds/);
    expect(p).toMatch(/scenarios\.json\.capabilities\.trading: needs coop, which is switched off/);
    // A zone that does feed its heroes makes bread worth asking for again.
    s.capabilities = { needs: false };
    s.nodes[0]!.choices[0]!.requires = undefined;
    q.quests[0]!.reward.items = [];
    (f.biomes as { biomes: Record<string, { capabilities?: unknown }> }).biomes.forest!.capabilities = { needs: true };
    expect(problems(f)).toEqual([]);
  });

  it('reads a person’s roam radius, refuses a bad one, and refuses it where roaming is off', () => {
    const f = files();
    const e = (f.entities as { entities: Record<string, Record<string, unknown>> }).entities;
    e.elder!.roam = 4;
    expect(parseContent(f).entities.elder?.roam).toBe(4);
    e.elder!.roam = 0;
    expect(problems(f).join('\n')).toMatch(/entities\.elder\.roam: must be a number of at least 1/);
    e.elder!.roam = 99;
    expect(problems(f).join('\n')).toMatch(/entities\.elder\.roam: must be at most 8 cells/);
    e.elder!.roam = 3;
    e.goblin!.roam = 3;
    expect(problems(f).join('\n')).toMatch(/entities\.goblin\.roam: only an npc roams/);
    delete e.goblin!.roam;
    (f.scenarios as { capabilities?: unknown }).capabilities = { roaming: false };
    expect(problems(f).join('\n')).toMatch(/entities\.elder\.roam: people stand still in this campaign/);
  });

  it('reads quests of spells and barrels, and refuses them where combos or carrying is off', () => {
    const f = files();
    const s = f.scenarios as { capabilities: unknown };
    const q = f.quests as { quests: { objective: object }[] };
    q.quests[0]!.objective = { t: 'cast', count: 5, zone: 'greenwood' };
    expect(parseContent(f).quests.quests[0]?.objective).toEqual({ t: 'cast', count: 5, zone: 'greenwood' });
    q.quests[0]!.objective = { t: 'haul', place: 'the Old Mill', zone: 'greenwood', count: 2 };
    expect(problems(f)).toEqual([]);
    s.capabilities = { carrying: false };
    expect(problems(f).join('\n')).toMatch(/quests\.cull\.objective\.t: a "haul" quest needs carrying/);
    q.quests[0]!.objective = { t: 'cast', count: 5 };
    s.capabilities = { combos: false };
    expect(problems(f).join('\n')).toMatch(/a "cast" quest needs combos/);
    q.quests[0]!.objective = { t: 'haul', place: 'x', zone: 'nowhere', count: 1 };
    s.capabilities = {};
    expect(problems(f).join('\n')).toMatch(/"nowhere" is not the map of any biome/);
  });

  it('reads what a quest switches while it is taken, and refuses what is not a dial', () => {
    const f = files();
    const q = f.quests as { quests: { capabilities?: unknown }[] };
    q.quests[0]!.capabilities = { guide: false, needs: true };
    expect(parseContent(f).quests.quests[0]?.capabilities).toEqual({ guide: false, needs: true });
    q.quests[0]!.capabilities = { coop: false, guide: 'off', farming: true };
    const p = problems(f).join('\n');
    expect(p).toMatch(/quests\.cull\.capabilities\.coop: must be one of/);
    expect(p).toMatch(/quests\.cull\.capabilities\.guide: must be true or false/);
  });

  it('lets a quest that switches food and water on ask for food', () => {
    const f = files();
    const s = f.scenarios as { capabilities: unknown };
    const q = f.quests as { quests: { objective: object; capabilities?: unknown }[] };
    s.capabilities = { needs: false };
    q.quests[0]!.objective = { t: 'bring', item: 'bread', count: 2 };
    expect(problems(f).join('\n')).toMatch(/only feeds/);
    q.quests[0]!.capabilities = { needs: true };
    expect(problems(f)).toEqual([]);
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

describe('items.json', () => {
  type Goods = {
    start: Record<string, string>;
    items: Record<string, Record<string, unknown>>;
    shops: Record<string, Record<string, unknown>>;
    loots: Record<string, unknown>;
  };
  const goods = (f: Record<ContentFile, unknown>) => f.items as Goods;

  it('reads items, shops and loots, in the order the codes follow', () => {
    const c = parseContent(files()).items;
    expect(Object.keys(c.items)).toEqual(['stick', 'potion', 'bread', 'potato']);
    expect(c.items.stick).toEqual({
      name: 'Stick',
      value: 1,
      slot: 'weapon',
      attack: 1,
      look: { weapon: 'weapon.arming_iron' },
    });
    expect(c.shops.stall).toMatchObject({ id: 'stall', keeper: 'elder', stock: ['potion'], buys: ['supply'] });
    expect(c.loots).toEqual({ coins: { gold: 30 }, stick: { item: 'stick' } });
    expect(c.start).toEqual({ weapon: 'stick' });
  });

  it('refuses an item that is not one', () => {
    const f = files();
    const g = goods(f);
    g.items.wand = {
      name: 'Wand',
      value: 9,
      slot: 'head',
      focus: { kind: 'staff', power: 1, cooldown: 0.5, combos: [{ keys: 'uuld', spell: 'boom', cost: 0, power: 1 }] },
    };
    g.items.rock = { name: 'Rock', value: 1, colour: 'grey' };
    g.items.both = { name: 'Both', value: 1, slot: 'cape', use: { hp: 1 }, look: { cape: 'cape.maroon' } };
    g.items.inner = {
      name: 'Inner',
      value: 1,
      slot: 'weapon',
      focus: {
        kind: 'wand',
        power: 1,
        cooldown: 0.5,
        combos: [
          { keys: 'urul', spell: 'bolt', cost: 5, power: 1 },
          { keys: 'urulr', spell: 'fan', cost: 5, power: 1 },
        ],
      },
    };
    const p = problems(f).join('\n');
    expect(p).toMatch(/items\.wand: a bow, wand or tome is a weapon/);
    expect(p).toMatch(/items\.wand\.focus\.kind: must be "wand" or "tome"/);
    expect(p).toMatch(/items\.wand\.focus\.combos\[0\]\.keys: repeats a direction/);
    expect(p).toMatch(/items\.wand\.focus\.combos\[0\]\.spell: must be a spell/);
    expect(p).toMatch(/items\.wand\.focus\.combos\[0\]\.cost: must be a number of at least 1/);
    expect(p).toMatch(/items\.rock\.colour: is not a field of an item/);
    expect(p).toMatch(/items\.rock: needs a gear `slot`, a `use` \(a supply\) or a `gem`/);
    expect(p).toMatch(/items\.both: is worn \(`slot`\) or used \(`use`\), not both/);
    expect(p).toMatch(/items\.inner\.focus\.combos\[0\]\.keys: is inside "urulr"/);
  });

  it('checks every item named, the start, the shops and the loots', () => {
    const f = files();
    const g = goods(f);
    g.start = { weapon: 'potion', cape: 'cloak' };
    g.shops.stall = { ...g.shops.stall, keeper: 'goblin', stock: ['potion', 'crown'], buys: ['supply', 'hats'] };
    g.loots.crate = { item: 'crown' };
    g.loots.empty = {};
    (f.quests as { quests: { reward: { items: string[] } }[] }).quests[0]!.reward.items = ['crown'];
    const p = problems(f).join('\n');
    expect(p).toMatch(/items\.json\.start\.weapon: "potion" is not worn there/);
    expect(p).toMatch(/items\.json\.start\.cape: "cloak" is not an item/);
    expect(p).toMatch(/shops\.stall\.keeper: "goblin" is not an npc/);
    expect(p).toMatch(/shops\.stall\.stock\[1\]: "crown" is not an item/);
    expect(p).toMatch(/shops\.stall\.buys\[1\]: must be a gear slot or blade, bow, caster, supply/);
    expect(p).toMatch(/loots\.crate\.item: "crown" is not an item/);
    expect(p).toMatch(/loots\.empty: needs "item", "gold", "xp" or "hp"/);
    expect(p).toMatch(/quests\.cull\.reward\.items\[0\]: "crown" is not an item in items\.json/);
  });

  it('keeps rare items out of the shops', () => {
    const f = files();
    goods(f).items.potion!.rare = true;
    expect(problems(f).join('\n')).toMatch(/shops\.stall\.stock\[0\]: "potion" is rare/);
  });
});

describe('gems', () => {
  const goods = (f: Record<ContentFile, unknown>) =>
    f.items as {
      items: Record<string, unknown>;
      shops: Record<string, { stock: string[] }>;
      loots: Record<string, unknown>;
    };
  const gem = { name: 'Opal', value: 50, gem: { arms: { attack: 1 }, worn: { defense: 1 } } };

  it('reads a gem (no slot, no use) with what it adds to a weapon and to other gear', () => {
    const f = files();
    goods(f).items.opal = { ...gem };
    expect(parseContent(f).items.items.opal).toEqual(gem);
  });

  it('refuses a gem that adds nothing, adds what a gem cannot, is worn or used, or an id that holds "+"', () => {
    const f = files();
    const g = goods(f);
    g.items.empty = { name: 'Empty', value: 1, gem: { arms: {}, worn: { defense: 1 } } };
    g.items.odd = { name: 'Odd', value: 1, gem: { arms: { luck: 3 }, worn: { defense: 0 } } };
    g.items.worn = { ...gem, slot: 'charm', look: {} };
    g.items['a+b'] = { ...gem };
    const p = problems(f).join('\n');
    expect(p).toMatch(/items\.empty\.gem\.arms: must add something/);
    expect(p).toMatch(/items\.odd\.gem\.arms\.luck: is not something a gem adds/);
    expect(p).toMatch(/items\.odd\.gem\.worn\.defense: must be a number of at least 0\.01/);
    expect(p).toMatch(/items\.worn\.gem: a gem is kept in the pack/);
    expect(p).toMatch(/items\.a\+b: an item id cannot hold "\+"/);
  });

  it('refuses a shop that sells one, or a chest that holds one, where the campaign cannot set gems', () => {
    const f = files();
    const g = goods(f);
    g.items.opal = { ...gem };
    g.shops.stall!.stock = ['potion', 'opal'];
    g.loots.crate = { item: 'opal' };
    expect(problems(f).join('\n')).not.toMatch(/capabilities\.forge/);
    (f.scenarios as { capabilities: unknown }).capabilities = { forge: false };
    const p = problems(f).join('\n');
    expect(p).toMatch(/shops\.stall\.stock\[1\]: "opal" is a gem, and this campaign cannot set gems/);
    expect(p).toMatch(/loots\.crate\.item: "opal" is a gem/);
  });
});

describe('toMobKind', () => {
  it('turns an entity into the engine’s MobKind, colours as numbers', () => {
    const kind = toMobKind(parseContent(files()).entities.goblin!);
    expect(kind).toMatchObject({ name: 'Goblin', maxHp: 20, speed: 70, sight: 160, windup: 0.4 });
    expect(kind.shot).toEqual({ range: 100, speed: 90, color: 0xff8800 });
    expect(kind.recover).toBeUndefined();
  });

  describe('a fan (shot.spread)', () => {
    const spread = { count: 3, arc: 60, power: 0.4, every: 3, recover: 1.5 };
    const withSpread = (over: Record<string, unknown>) => {
      const f = files();
      const goblin = (f.entities as { entities: { goblin: { behavior: { shot: Record<string, unknown> } } } }).entities
        .goblin;
      goblin.behavior.shot.spread = { ...spread, ...over };
      return f;
    };
    it('is read into the kind', () => {
      expect(toMobKind(parseContent(withSpread({})).entities.goblin!).shot?.spread).toEqual(spread);
    });
    it.each([
      [{ arc: 50 }, /under 30 degrees between lanes/],
      [{ count: 6, arc: 200 }, /whole number from 2 to 5/],
      [{ count: 5, arc: 170 }, /at most 160 degrees/],
      [{ every: 2 }, /every/],
      [{ every: 3.5 }, /whole number/],
      [{ power: 0.9 }, /at most 0.6/],
      [{ recover: 0.5 }, /at least 1 second/],
    ])('refuses %j', (over, message) => {
      expect(() => parseContent(withSpread(over))).toThrow(message);
    });
  });

  it('reads a telegraph tuning; a legacy colour is accepted and unread', () => {
    const f = files();
    (f.entities as { entities: { goblin: { behavior: object } } }).entities.goblin.behavior = {
      telegraph: { color: '#ff0000', ground: true },
    };
    expect(toMobKind(parseContent(f).entities.goblin!).telegraph).toEqual({ ground: true });
  });
});

describe('named bosses', () => {
  const withBoss = () => {
    const f = files();
    const entities = (f.entities as { entities: Record<string, Record<string, unknown>> }).entities;
    entities.goblin!.boss = true;
    const quest = (f.quests as { quests: { objective: unknown }[] }).quests[0]!;
    quest.objective = { t: 'boss', boss: 'goblin', zone: 'greenwood', count: 1 };
    return { f, entities, quest };
  };

  it('are a mob flag and a boss objective that names one', () => {
    const { f } = withBoss();
    const c = parseContent(f);
    expect(toMobKind(c.entities.goblin!).named).toBe(true);
    expect(c.quests.quests[0]?.objective).toEqual({ t: 'boss', boss: 'goblin', zone: 'greenwood', count: 1 });
  });

  it('are refused when the objective names a mob that is no boss, or an npc is flagged', () => {
    const { f, entities, quest } = withBoss();
    delete entities.goblin!.boss;
    expect(problems(f).join('\n')).toMatch(/quests\.cull\.objective\.boss: "goblin" is not a mob with "boss": true/);
    entities.elder!.boss = true;
    quest.objective = { t: 'boss', boss: 'goblin', zone: 'nowhere', count: 1 };
    const p = problems(f).join('\n');
    expect(p).toMatch(/entities\.elder\.boss: is true on a mob/);
    expect(p).toMatch(/quests\.cull\.objective\.zone: "nowhere" is not the map of any biome/);
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
