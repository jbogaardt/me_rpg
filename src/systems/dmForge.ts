// The DM's forge quests (Pixi-free, tested; core engine behind the `forge` capability): "Set an Emerald in a Steel Sword". The
// recipe is read from what the party actually has: a gem and a piece of gear they could set it in, both in one hero's keeping
// (the gem is spent, the piece is changed, in one pack), or a gem a shop sells that the hero can pay for. Nothing names an item
// id: the pieces and gems are whatever the campaign holds (systems/gems.ts derives the result of every pair).

import type { Hero, Item } from './combat';
import { canSet, fusedId, isGem } from './gems';
import { FUSED, ITEMS, fusedOf, idOfItem } from './items';

/** One thing to make: set `gem` in `base`, and the id of what that makes (the quest's `what`). */
export interface Recipe {
  base: string;
  gem: string;
  made: string;
  /** The gem is not in the pack yet: a shop sells it (and the hero has the gold). */
  buy: boolean;
}

/** Most recipes the DM is offered at a time. */
export const MAX_RECIPES = 4;

/** Everything a hero could set a gem in, the pieces they wear before those they carry, dearer pieces first. */
function bases(hero: Hero): Item[] {
  const worn = [hero.weapon, hero.offhand, hero.head, hero.chest, hero.legs, hero.feet, hero.cape, hero.charm].flatMap(
    (i) => i ?? [],
  );
  const carried = [...hero.pack].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return [...worn.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)), ...carried];
}

/**
 * The recipes the party could make, best first: a gem already carried before one to buy, and a piece worn before one carried.
 * `sold` is the ids of the gems a shop sells. At most `MAX_RECIPES`, each a different gem and piece, so the DM has a choice
 * and one party is not sent to forge the same thing twice.
 */
export function recipesFor(party: readonly Hero[], sold: ReadonlySet<string> = new Set()): Recipe[] {
  const out: Recipe[] = [];
  for (const buy of [false, true])
    for (const hero of party) {
      const have = hero.pack.filter(isGem);
      const gems = buy
        ? [...sold].flatMap((id) => {
            const g = ITEMS[id];
            return g && isGem(g) && !have.includes(g) && hero.gold >= (g.value ?? 0) ? [g] : [];
          })
        : have;
      for (const gem of gems) {
        const gemId = idOfItem(gem);
        if (gemId === undefined || out.some((r) => r.gem === gemId)) continue;
        const base = bases(hero).find((b) => canSet(gem, b) && !out.some((r) => r.base === idOfItem(b)));
        const baseId = base && idOfItem(base);
        if (base && baseId !== undefined && fusedOf(base, gem))
          out.push({ base: baseId, gem: gemId, made: fusedId(baseId, gemId), buy });
      }
    }
  return out.slice(0, MAX_RECIPES);
}

/** What a recipe's pieces are called, and what it makes (for the title and the telling). */
export function recipeNames(made: string): { base: string; gem: string; made: string } | null {
  const item = FUSED[made];
  const base = item?.fused && ITEMS[item.fused.base];
  const gem = item?.fused && ITEMS[item.fused.gem];
  return item && base && gem ? { base: base.name, gem: gem.name, made: item.name } : null;
}
