// Where things are (Pixi-free): what each zone is called on screen, and how the zones connect, so the game can announce an
// area, label it on the map, and point the way to a quest's goal. Quest text (systems/quests.ts) uses these names.

/** What a zone is called: the big title on arriving, and the map's heading. Keys are zone names (maps/<name>.ts); the campaign's biomes.json `name`s. */
export const ZONE_NAMES: Record<string, string> = {};

/** The name of a zone, or the zone's own key for one with no name. */
export const zoneName = (zone: string): string => ZONE_NAMES[zone] ?? zone;

/** Which zones a player can walk between (biomes.json `links`, checked against the maps' doors by `npm run map -- check`; the training halls are reached by the trainer's magic, so nothing links to them). */
export const ZONE_LINKS: (readonly [string, string])[] = [];

/** Each zone's neighbours, in its own `links` order first (the guide prefers the earlier of two equally short ways). */
const NEIGHBOURS = new Map<string, string[]>();

/** The zones next to `zone`. */
export const neighbours = (zone: string): string[] => NEIGHBOURS.get(zone) ?? [];

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

/** The colour a zone flashes when you walk into it (the rim of the door transition's circle, entities/ZoneTransition.ts). */
export const ZONE_TINTS: Record<string, number> = {};

/**
 * Install a campaign's places (ContentManager.install, from biomes.json, keyed by each biome's map): `names`, `tints`,
 * and `links`, each zone's neighbours in order. A link goes both ways and is kept once in ZONE_LINKS.
 */
export function setPlaces(
  names: Record<string, string>,
  links: Record<string, string[]>,
  tints: Record<string, number>,
) {
  for (const key of Object.keys(ZONE_NAMES)) delete ZONE_NAMES[key];
  Object.assign(ZONE_NAMES, names);
  for (const key of Object.keys(ZONE_TINTS)) delete ZONE_TINTS[key];
  Object.assign(ZONE_TINTS, tints);
  ZONE_LINKS.splice(0, ZONE_LINKS.length);
  NEIGHBOURS.clear();
  const add = (a: string, b: string) => {
    const list = NEIGHBOURS.get(a) ?? [];
    if (!list.includes(b)) list.push(b);
    NEIGHBOURS.set(a, list);
  };
  const seen = new Set<string>();
  for (const [a, tos] of Object.entries(links)) for (const b of tos) add(a, b);
  for (const [a, tos] of Object.entries(links))
    for (const b of tos) {
      if (a === b) continue;
      add(b, a);
      const key = [a, b].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      ZONE_LINKS.push([a, b]);
    }
}

export const zoneTint = (zone: string): number =>
  ZONE_TINTS[zone] ?? (zone.startsWith('shop_') ? 0xffdc9a : zone.startsWith('training_') ? 0xb394d6 : 0xffffff);
