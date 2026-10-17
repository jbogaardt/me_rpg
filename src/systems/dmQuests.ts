// The quests the DM may offer, written from the land the party stands in (Pixi-free, tested; core engine). Nothing here
// names a content id: it reads what the land holds (the foes alive in it, its quest sites, its named places, the gear a
// relic could be) and turns it into a few honest asks: "Hunt 5 Goblins", "Gather 3 Echostones", "Reach the Old Mill",
// "Find the Wayfarer's Charm". The party is left to work out how.

import { xpToNext, type Hero, type Item, type QuestLog } from './combat';
import { upgrade } from './inventory';
import type { BoundObjective } from './dmEpics';
import type { Quest, SiteKind } from './quests';
import type { QuestOffer } from './dmTasks';

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
  /** Can the party cast spells here (the `combos` capability is on and one of them has a spell to cast)? */
  casters: boolean;
  /** How many loose barrels the land has to carry (0 when the `carrying` capability is off here). */
  barrels: number;
  /** Gear a relic could be (item ids and names), the best fits for the party first. */
  relics: { id: string; name: string }[];
  /** A spot to hide a relic: far enough from the party to be a search, on open ground. */
  spot: () => { x: number; y: number } | null;
}

/**
 * The offer for a task a saga names outright (its step's `objective`): the land says where the foe, the sites or the place
 * are, and how they are called. A land that has none of it just now (the foe was all killed) still gives the offer, led to
 * the land's own spot, so a named step never stalls on what the world happens to hold.
 */
export function offerFor(land: Land, o: BoundObjective): QuestOffer {
  return { ...boundOffer(land, o), level: land.level };
}

function boundOffer(land: Land, o: BoundObjective): QuestOffer {
  const lost = land.spot() ?? { x: 0, y: 0 };
  if (o.t === 'kill') {
    const m = land.mobs.find((x) => x.key === o.kind);
    return {
      kind: 'hunt',
      title: `Hunt ${o.count} ${plural(m?.name ?? o.kind)}`,
      zone: land.zone,
      goal: o.count,
      what: o.kind,
      ...(m ? { x: m.x, y: m.y } : lost),
    };
  }
  if (o.t === 'gather') {
    const s = land.sites.find((x) => x.kind === o.site);
    return {
      kind: 'gather',
      title: `Gather ${o.count} ${plural(s?.name ?? o.site)}`,
      zone: land.zone,
      goal: o.count,
      what: o.site,
      ...(s ? { x: s.x, y: s.y } : lost),
    };
  }
  const p = land.places.find((x) => x.name === o.place);
  return { kind: 'visit', title: `Reach ${o.place}`, zone: land.zone, goal: o.count, what: o.place, ...(p ?? lost) };
}

/**
 * How much more a quest pays at the party's `level` than at the start: it follows the XP a level needs, so a quest is
 * worth about as much of a level at level 8 as at level 1 (levelling is superlinear, `xpToNext`).
 */
export const levelScale = (level: number): number => Math.max(1, xpToNext(Math.max(1, level)) / xpToNext(2));

/**
 * How many of a foe worth `xp` a hunt asks of a party at `level`: few of a foe that is a match for them, more of one they
 * have outgrown (3 to 8), so a hunt is about as long a job whatever the level.
 */
export function huntGoal(xp: number, level: number): number {
  const kills = xpToNext(Math.max(1, level)) / Math.max(1, xp); // kills of it to make a level
  return Math.max(3, Math.min(8, Math.round(kills / 3)));
}

/**
 * What a quest pays each player (xp and gold) by its kind, its size and the party's level (`levelScale`); a relic pays
 * its item to whoever found it, too.
 */
export function offerReward(kind: QuestOffer['kind'], goal: number, level = 1): { xp: number; gold: number } {
  const base = baseReward(kind, goal);
  const m = levelScale(level);
  return { xp: Math.round(base.xp * m), gold: Math.round(base.gold * m) };
}

function baseReward(kind: QuestOffer['kind'], goal: number): { xp: number; gold: number } {
  return kind === 'hunt'
    ? { xp: 14 * goal, gold: 5 * goal }
    : kind === 'gather'
      ? { xp: 12 * goal, gold: 4 * goal }
      : kind === 'cast'
        ? { xp: 8 * goal, gold: 3 * goal }
        : kind === 'haul'
          ? { xp: 15 * goal, gold: 6 * goal }
          : kind === 'find'
            ? { xp: 70, gold: 30 }
            : { xp: 40, gold: 15 };
}

/**
 * An offer as the quest it is, in the same terms as the campaign's own (`quests.ts`), so one set of rules counts both: a
 * hunt is a `kill`, a gather a `gather`, a find a `gather` of the one relic there is to touch, and reaching a place a `visit`.
 * Nothing it says is spoken by a giver (the DM tells it), so its words are empty.
 */
export function questOf(offer: QuestOffer): Quest {
  const where = { zones: [offer.zone] };
  const objective: Quest['objective'] =
    offer.kind === 'hunt'
      ? { t: 'kill', kind: offer.what, count: offer.goal, zone: offer.zone }
      : offer.kind === 'gather'
        ? { t: 'gather', site: offer.what, zone: offer.zone, count: offer.goal }
        : offer.kind === 'find'
          ? { t: 'gather', site: RELIC_KIND, zone: offer.zone, count: 1 }
          : offer.kind === 'cast'
            ? { t: 'cast', zone: offer.zone, count: offer.goal }
            : offer.kind === 'haul'
              ? { t: 'haul', place: offer.what, zone: offer.zone, count: offer.goal }
              : { t: 'visit', place: offer.what, zone: offer.zone, count: 1 };
  return {
    id: `dm_${offer.kind}`,
    chapter: 0,
    learned: '',
    fieldNote: [],
    title: offer.title,
    goal: offer.title,
    hint: '',
    where,
    unit: '',
    objective,
    reward: { ...offerReward(offer.kind, offer.goal, offer.level), items: [] },
    offer: [],
    remind: [],
    done: [],
  };
}

/** The log a party's quest is tracked in: taken from the start (the DM gave it), with nothing done. */
export const partyLog = (): QuestLog => ({ stage: 0, taken: true, progress: 0 });

/** A name in the plural for a title ("Goblin" → "Goblins"); a name that already ends in s keeps it. */
const plural = (name: string): string => (/s$/i.test(name) ? name : `${name}s`);

/**
 * The foes worth hunting at `level`, best match first: a foe the party has long outgrown (a level's worth would take
 * more than 40 of them) is left out when the land has a better one.
 */
function matched<T extends { xp: number }>(mobs: T[], level: number): T[] {
  const need = xpToNext(Math.max(1, level));
  const fit = (xp: number) => Math.abs(Math.log(need / Math.max(1, xp) / 10)); // about 10 kills a level is a match
  const worthy = mobs.filter((m) => need / Math.max(1, m.xp) <= 40);
  return [...(worthy.length ? worthy : mobs)].sort((a, b) => fit(a.xp) - fit(b.xp));
}

/** Every quest the land allows, in a fixed order. */
export function allOffers(land: Land): QuestOffer[] {
  const out: QuestOffer[] = [];
  const seen = new Set<string>();
  for (const m of matched(land.mobs, land.level)) {
    if (seen.has(m.key)) continue;
    seen.add(m.key);
    const goal = huntGoal(m.xp, land.level);
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
  if (land.casters) {
    const goal = 6;
    const at = land.spot() ?? { x: 0, y: 0 }; // cast anywhere in the land: the spot is only where its area is shown
    out.push({ kind: 'cast', title: `Cast ${goal} spells`, zone: land.zone, goal, what: '', ...at });
  }
  const place = land.places[0];
  if (land.barrels >= 2 && place) {
    const goal = Math.min(3, land.barrels);
    out.push({
      kind: 'haul',
      title: `Carry ${goal} barrels to ${place.name}`,
      zone: land.zone,
      goal,
      what: place.name,
      x: place.x,
      y: place.y,
    });
  }
  const relic = land.relics[0];
  const at = relic ? land.spot() : null;
  if (relic && at)
    out.push({ kind: 'find', title: `Find ${relic.name}`, zone: land.zone, goal: 1, what: relic.id, x: at.x, y: at.y });
  return out.map((o) => ({ ...o, level: land.level }));
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

/** A weapon's way of fighting: a gift never swaps a blade for a bow or a wand (the player chose how they fight). */
const style = (i: Item): string => (i.focus ? 'focus' : i.ranged ? 'ranged' : 'melee');

/**
 * The gear a saga hands a hero at its end, when there is any: something better than what they wear, of the way they
 * already fight, and worth no more than about twice what a hero of `level` would have earned (so it is a step, not a
 * leap), a weapon before armour, the biggest step first. Null when nothing is better (their gear is already fine).
 */
export function upgradeFor(hero: Hero, items: Record<string, Item>, level: number): string | null {
  const cap = 2 * (30 + 25 * level);
  const options = Object.entries(items).filter(
    ([, it]) =>
      it.slot !== undefined &&
      it.use === undefined &&
      (it.value ?? 0) > 0 &&
      (it.value ?? 0) <= cap &&
      upgrade(hero, it) > 0 &&
      (it.slot !== 'weapon' || style(it) === style(hero.weapon)),
  );
  options.sort(
    ([, a], [, b]) => Number(b.slot === 'weapon') - Number(a.slot === 'weapon') || upgrade(hero, b) - upgrade(hero, a),
  );
  return options[0]?.[0] ?? null;
}
