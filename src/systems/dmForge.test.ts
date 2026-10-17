import { afterEach, describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { setCapabilities } from './capabilities';
import { briefing, objective, type BriefNames } from './dmBrief';
import { MAX_RECIPES, recipeNames, recipesFor } from './dmForge';
import { allOffers, offerReward, questOf, type Land } from './dmQuests';
import { TASK_KINDS, TaskBook, parOf, taskFromWire, taskText, taskWire, viewOf } from './dmTasks';
import { applyInvOp } from './inventory';
import { FUSED, itemOf } from './items';
import { SHOPS, stockOf } from './shops';

afterEach(() => setCapabilities({}));

const heroWith = (...ids: string[]) => {
  const hero = newHero();
  hero.pack = ids.map(itemOf);
  return hero;
};

describe('recipes the party could make', () => {
  it('pair a gem in the pack with a piece worn before one carried, both in one hero’s keeping', () => {
    const hero = heroWith('emerald', 'steelSword');
    hero.weapon = itemOf('bronzeSword');
    const [r] = recipesFor([hero]);
    expect(r).toEqual({ base: 'bronzeSword', gem: 'emerald', made: 'bronzeSword+emerald', buy: false });
    expect(FUSED[r!.made]).toBeDefined();
  });

  it('read the pieces from what the hero has: no gem, no recipe; no piece to fit, no recipe', () => {
    expect(recipesFor([heroWith('steelSword')])).toEqual([]);
    const hero = newHero(); // a rusty sword and a cloak: the dearer piece takes the stone
    hero.pack = [itemOf('ruby')];
    expect(recipesFor([hero]).map((r) => r.made)).toEqual(['travelerCloak+ruby']);
    delete hero.cape;
    expect(recipesFor([hero]).map((r) => r.made)).toEqual(['rustySword+ruby']);
  });

  it('offer a gem a shop sells when the hero can pay for it, after the ones already carried', () => {
    const hero = heroWith('ruby', 'steelSword', 'ironShield', 'kettleHat');
    hero.gold = 500;
    const sold = new Set(['emerald', 'ruby', 'sapphire']);
    const recipes = recipesFor([hero], sold);
    expect(recipes[0]).toMatchObject({ gem: 'ruby', buy: false });
    expect(recipes.slice(1).every((r) => r.buy && r.gem !== 'ruby')).toBe(true);
    expect(recipes.map((r) => r.gem)).toEqual(['ruby', 'emerald', 'sapphire']);
    hero.gold = 10; // cannot afford them
    expect(recipesFor([hero], sold).map((r) => r.gem)).toEqual(['ruby']);
  });

  it('ask for each gem and each piece once, and at most a few, so the DM has a choice', () => {
    const hero = heroWith('emerald', 'ruby', 'sapphire', 'topaz', 'steelSword', 'ironShield');
    hero.gold = 999;
    const recipes = recipesFor([hero], new Set(['emerald', 'ruby', 'sapphire', 'topaz']));
    expect(recipes.length).toBeLessThanOrEqual(MAX_RECIPES);
    expect(new Set(recipes.map((r) => r.gem)).size).toBe(recipes.length);
    expect(new Set(recipes.map((r) => r.base)).size).toBe(recipes.length);
  });

  it('name the pieces and what they make', () => {
    expect(recipeNames('steelSword+emerald')).toEqual({
      base: 'Steel Sword',
      gem: 'Emerald',
      made: 'Emerald-encrusted Steel Sword',
    });
    expect(recipeNames('nothing')).toBeNull();
  });
});

const land = (forge: Land['forge']): Land => ({
  zone: 'fen',
  level: 3,
  mobs: [],
  sites: [],
  places: [],
  relics: [],
  casters: false,
  barrels: 0,
  spot: () => ({ x: 900, y: 910 }),
  ...(forge ? { forge } : {}),
});

describe('the forge quest', () => {
  const recipe = { base: 'steelSword', gem: 'emerald', made: 'steelSword+emerald', buy: false };

  it('is offered from the recipes, named in words, and leads to the smith when there is one', () => {
    const [offer] = allOffers(land({ recipes: [recipe], smith: { x: 40, y: 50 } }));
    expect(offer).toMatchObject({
      kind: 'forge',
      title: 'Set an Emerald in a Steel Sword',
      what: 'steelSword+emerald',
      goal: 1,
      x: 40,
      y: 50,
      level: 3,
    });
    expect(allOffers(land({ recipes: [recipe] }))[0]).toMatchObject({ x: 900, y: 910 });
    expect(allOffers(land(undefined)).filter((o) => o.kind === 'forge')).toEqual([]); // `forge` off, or no recipe
    expect(allOffers(land({ recipes: [] }))).toEqual([]);
  });

  it('pays xp and gold scaled to the level, and counts as a quest of one', () => {
    expect(offerReward('forge', 1, 1)).toEqual({ xp: 3, gold: 10 });
    expect(offerReward('forge', 1, 5).xp).toBeGreaterThan(3);
    const offer = allOffers(land({ recipes: [recipe] }))[0]!;
    expect(questOf(offer).objective).toEqual({ t: 'cast', count: 1 }); // counted, not walked to
    expect(parOf('forge', 1)).toBe(150);
  });

  it('is done when anyone makes exactly the piece named, and not by another', () => {
    const book = new TaskBook();
    book.call(allOffers(land({ recipes: [recipe] }))[0]!);
    expect(book.forge('steelSword+ruby')).toBe(false);
    expect(book.forge('bronzeSword+emerald')).toBe(false);
    expect(book.task?.progress).toBe(0);
    expect(book.forge('steelSword+emerald')).toBe(true);
    expect(book.forge('steelSword+emerald')).toBe(false); // once
    expect(book.tick(0.1, { party: [], health: 1, falls: 0 })).toBe('done');
  });

  it('is not done by a fusion made when the quest is another kind or is over', () => {
    const book = new TaskBook();
    expect(book.forge('steelSword+emerald')).toBe(false); // no quest
    book.call({ kind: 'hunt', title: 'Hunt 3 Goblins', zone: 'fen', goal: 3, what: 'goblin', x: 0, y: 0 });
    expect(book.forge('goblin')).toBe(false);
  });

  it('is counted when the hero really sets the stone: the same item the quest names comes out of the action', () => {
    const hero = heroWith('emerald', 'steelSword');
    const result = applyInvOp(hero, { t: 'fuse', gem: 0, into: { pack: 1 } });
    expect(result.ok && result.made).toBe(FUSED['steelSword+emerald']);
    const book = new TaskBook();
    book.call(allOffers(land({ recipes: [recipe] }))[0]!);
    expect(book.forge('steelSword+emerald')).toBe(true);
  });

  it('travels to friends as a task and reads back, with its title in the tracker', () => {
    const book = new TaskBook();
    book.call(allOffers(land({ recipes: [recipe] }))[0]!);
    const view = viewOf(book.task!);
    expect(TASK_KINDS).toContain('forge');
    const back = taskFromWire(taskWire(view));
    expect(back).toMatchObject({ kind: 'forge', what: 'steelSword+emerald', title: 'Set an Emerald in a Steel Sword' });
    expect(taskText(back!)).toBe('Set an Emerald in a Steel Sword');
  });
});

describe('the telling of a forge quest', () => {
  const names: BriefNames = {
    foe: (k) => k,
    site: (k) => k,
    item: (id) => `the ${id}`,
    area: () => 'The Fen',
    recipe: recipeNames,
  };
  const view = (what: string, title = 'Set an Emerald in a Steel Sword') =>
    ({
      kind: 'forge',
      state: 'active',
      title,
      progress: 0,
      goal: 1,
      zone: 'fen',
      x: 0,
      y: 0,
      what,
      bits: 0,
      hint: 0,
    }) as const;

  it('tells three pages in the DM’s voice and names the recipe in words', () => {
    const pages = briefing(view('steelSword+emerald'), names);
    expect(pages).toHaveLength(3);
    for (const p of pages) expect(p.length).toBeGreaterThan(60);
    expect(pages.join(' ')).toMatch(/Emerald/);
    expect(pages.join(' ')).toMatch(/Steel Sword/);
    expect(objective(view('steelSword+emerald'), names)).toBe(
      'Set an Emerald in a Steel Sword, from the Inventory tab, and the Emerald-encrusted Steel Sword is yours.',
    );
  });

  it('is told differently for different recipes, and the same way twice for one', () => {
    const tellings = new Set<string>();
    for (const gem of ['emerald', 'ruby', 'sapphire', 'topaz'])
      for (const base of ['steelSword', 'ironShield', 'kettleHat', 'foldedBoots'])
        tellings.add(
          briefing(view(`${base}+${gem}`), names)[0]!.replace(/[A-Z][a-z]+(-encrusted)?( [A-Z][a-z]+)*/g, ''),
        );
    expect(tellings.size).toBeGreaterThan(2);
    expect(briefing(view('steelSword+ruby'), names)).toEqual(briefing(view('steelSword+ruby'), names));
  });

  it('still tells a recipe the page cannot name (it asks for the piece)', () => {
    const plain: BriefNames = { ...names, recipe: undefined };
    expect(objective(view('steelSword+ruby'), plain)).toContain('the steelSword+ruby');
    expect(briefing(view('steelSword+ruby'), plain)).toHaveLength(3);
  });
});

describe('the forge capability', () => {
  it('switches setting gems off: the action is refused and no shop sells a gem', () => {
    const hero = heroWith('emerald', 'steelSword');
    setCapabilities({ forge: false });
    expect(applyInvOp(hero, { t: 'fuse', gem: 0, into: { pack: 1 } }).ok).toBe(false);
    expect(hero.pack.map((i) => i.name)).toEqual(['Emerald', 'Steel Sword']);
    const smith = Object.values(SHOPS).find((s) => s.stock.includes('emerald'))!;
    expect(stockOf(smith)).not.toContain('emerald');
    setCapabilities({});
    expect(stockOf(smith)).toContain('emerald');
    expect(applyInvOp(hero, { t: 'fuse', gem: 0, into: { pack: 1 } }).ok).toBe(true);
  });

  it('is gated where the quest is written (Land.forge is left out by the scene when it is off) and the gems are for sale', () => {
    const smith = Object.values(SHOPS).find((s) => s.stock.includes('emerald'));
    expect(smith).toBeDefined();
  });
});
