// The quests the DM may offer, written from the land the party stands in (Pixi-free, tested; core engine). Nothing here
// names a content id: it reads what the land holds (the foes alive in it, its quest sites, its named places, the gear a
// relic could be) and turns it into a few honest asks: "Hunt 5 Goblins", "Gather 3 Echostones", "Reach the Old Mill",
// "Find the Wayfarer's Charm". The party is left to work out how.

import type { QuestOffer } from './dmTasks';
import type { SiteKind } from './quests';

/** The site kind of a hidden relic: an engine kind with a look of its own, not content. */
export const RELIC_KIND = 'relic';
export const RELIC_LOOK: SiteKind = {
  name: 'Relic',
  shape: 'stone',
  color: 0xd9b45a,
  glow: 0xfff0a0,
  notes: [['Something old and glowing: this is what you were sent to find.']],
};

/** What a land holds, as the DM's quests need to know it. */
export interface Land {
  zone: string;
  /** The party's average level. */
  level: number;
  /** The foes alive in it, by kind key, with where one stands. */
  mobs: { key: string; name: string; xp: number; x: number; y: number }[];
  /** Its quest sites by kind: how many, the kind's name, and where the first stands. */
  sites: { kind: string; name: string; count: number; x: number; y: number }[];
  /** Its named places. */
  places: { name: string; x: number; y: number }[];
  /** Gear a relic could be (item ids and names), the best fits for the party first. */
  relics: { id: string; name: string }[];
  /** A spot to hide a relic: far enough from the party to be a search, on open ground. */
  spot: () => { x: number; y: number } | null;
}

/** A name in the plural for a title ("Goblin" → "Goblins"); a name that already ends in s keeps it. */
const plural = (name: string): string => (/s$/i.test(name) ? name : `${name}s`);

/** Every quest the land allows, in a fixed order. */
export function allOffers(land: Land): QuestOffer[] {
  const out: QuestOffer[] = [];
  const seen = new Set<string>();
  for (const m of land.mobs) {
    if (seen.has(m.key)) continue;
    seen.add(m.key);
    const goal = m.xp >= 40 ? 3 : 5;
    out.push({
      kind: 'hunt',
      title: `Hunt ${goal} ${plural(m.name)}`,
      zone: land.zone,
      goal,
      what: m.key,
      x: m.x,
      y: m.y,
    });
  }
  for (const s of land.sites) {
    if (s.count < 2) continue;
    const goal = Math.min(3, s.count);
    out.push({
      kind: 'gather',
      title: `Gather ${goal} ${plural(s.name)}`,
      zone: land.zone,
      goal,
      what: s.kind,
      x: s.x,
      y: s.y,
    });
  }
  for (const p of land.places)
    out.push({ kind: 'visit', title: `Reach ${p.name}`, zone: land.zone, goal: 1, what: p.name, x: p.x, y: p.y });
  const relic = land.relics[0];
  const at = relic ? land.spot() : null;
  if (relic && at)
    out.push({ kind: 'find', title: `Find ${relic.name}`, zone: land.zone, goal: 1, what: relic.id, x: at.x, y: at.y });
  return out;
}

/** The gear a relic could be, best fit for `level` first: pieces worth about what a hero of that level would have earned. */
export function relicsFor(
  items: Record<string, { name: string; value?: number; slot?: string; use?: unknown }>,
  level: number,
): { id: string; name: string }[] {
  const target = 30 + 25 * level;
  return Object.entries(items)
    .filter(([, it]) => it.slot !== undefined && it.use === undefined && (it.value ?? 0) > 0)
    .sort(([, a], [, b]) => Math.abs((a.value ?? 0) - target) - Math.abs((b.value ?? 0) - target))
    .map(([id, it]) => ({ id, name: `the ${it.name}` }));
}
