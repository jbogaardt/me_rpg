// Where things are (Pixi-free): what each zone is called on screen, and how the zones connect, so the game can announce an
// area, label it on the map, and point the way to a quest's goal. Quest text (systems/quests.ts) uses these names.

/** What a zone is called: the big title on arriving, and the map's heading. Keys are zone names (maps/<name>.ts). */
export const ZONE_NAMES: Record<string, string> = {
  greenwood: 'The Greenwood',
  town: 'Lanternrest',
  eastwood: 'The Eastwood',
  desert: 'The Sunscar Desert',
  beach: 'Hourglass Shore',
  undead: 'The Barrow Lands',
  jungle: 'The Tuskwood Jungle',
  wetlands: 'The Mirewater',
  marsh: 'Gloamfen Marsh',
  frostlands: 'The Frostlands',
  shop_smithy: "The Smith's Forge",
  shop_armory: "The Armorer's Hall",
  shop_apothecary: "The Apothecary's Shop",
  shop_ranger: "The Ranger's Lodge",
  shop_wizard: "The Wizard's Sanctum",
};

/** The name of a zone, or the zone's own key for one with no name. */
export const zoneName = (zone: string): string => ZONE_NAMES[zone] ?? zone;

/** Which open-air zones touch (a gap in the border between them, maps/world.ts). A shop room joins only the town. */
export const ZONE_LINKS: readonly (readonly [string, string])[] = [
  ['town', 'greenwood'],
  ['town', 'frostlands'],
  ['desert', 'greenwood'],
  ['undead', 'greenwood'],
  ['greenwood', 'eastwood'],
  ['eastwood', 'frostlands'],
  ['jungle', 'eastwood'],
  ['desert', 'beach'],
  ['beach', 'undead'],
  ['beach', 'jungle'],
  ['undead', 'jungle'],
  ['jungle', 'wetlands'],
  ['jungle', 'marsh'],
  ['wetlands', 'marsh'],
  ['marsh', 'frostlands'],
  ...['shop_smithy', 'shop_armory', 'shop_apothecary', 'shop_ranger', 'shop_wizard'].map(
    (shop) => [shop, 'town'] as const,
  ),
];

/** The zones next to `zone`. */
export const neighbours = (zone: string): string[] =>
  ZONE_LINKS.flatMap(([a, b]) => (a === zone ? [b] : b === zone ? [a] : []));

/**
 * The first zone to walk into to get from `from` to the nearest of `goals` (fewest zones crossed), or null when already in
 * one of them or there is no way. Ties go to the goal listed first.
 */
export function nextZone(from: string, goals: readonly string[]): string | null {
  if (goals.includes(from)) return null;
  const first = new Map<string, string>(); // zone reached -> the first step that leads to it
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const here = queue.shift()!;
    for (const next of neighbours(here)) {
      if (seen.has(next)) continue;
      seen.add(next);
      first.set(next, here === from ? next : first.get(here)!);
      queue.push(next);
    }
  }
  const reached = goals.filter((g) => first.has(g));
  // The nearest goal is the one found first; BFS order is distance order, so pick the earliest reached.
  let best: string | null = null;
  let bestRank = Infinity;
  for (const g of reached) {
    const rank = [...first.keys()].indexOf(g);
    if (rank < bestRank) [best, bestRank] = [first.get(g)!, rank];
  }
  return best;
}
