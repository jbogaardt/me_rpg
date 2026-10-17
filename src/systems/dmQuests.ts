// The quests the DM may offer, written from the land the party stands in (Pixi-free, tested; core engine). Nothing here
// names a content id: it reads what the land holds (the foes alive in it, its quest sites, its named places, the gear a
// relic could be) and turns it into a few honest asks: "Hunt 5 Goblins", "Gather 3 Echostones", "Reach the Old Mill",
// "Find the Wayfarer's Charm". The party is left to work out how.

import { xpToNext, type GearSlot, type Hero, type Item, type QuestLog } from './combat';
import { giftFor } from './dmGear';
import type { BoundObjective } from './dmEpics';
import { an } from './dmBrief';
import { recipeNames, type Recipe } from './dmForge';
import type { Quest, SiteKind } from './quests';
import type { QuestOffer } from './dmTasks';
import { BOSS_KEY, bossBase, bossName, bossStats, bossTitle, bossWhat } from './dmBoss';

/** The site kind of a hidden relic: an engine kind with a look of its own, not content. */
export const RELIC_KIND = 'relic';
export const RELIC_LOOK: SiteKind = {
  name: 'Relic',
  shape: 'stone',
  color: 0xd9b45a,
  glow: 0xfff0a0,
  notes: [['Something old and glowing: this is what you were sent to find.']],
};

/**
 * A find quest's `what`: the item to be found, and (after an `@`) the kind of foe that carries it. With no carrier the item
 * lies in a chest the DM left (a site of `RELIC_KIND`, drawn as a chest); with one, the foe drops it when it falls.
 * Packed in `what` so the quest travels on the wire as it always did.
 */
export const relicWhat = (item: string, carrier?: string): string => (carrier ? `${item}@${carrier}` : item);

/** The item and the carrying foe (if any) a find quest's `what` names. */
export function parseRelicWhat(what: string): { item: string; carrier?: string } {
  const at = what.indexOf('@');
  return at < 0 ? { item: what } : { item: what.slice(0, at), carrier: what.slice(at + 1) };
}

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
  /** How many heroes are in the party (a boss is made for it; 1 when not said). */
  party?: number;
  /** The spells a wand or tome of the party teaches (a mastery quest asks for one): the spell's id and name, and the keys that cast it. Empty where `combos` is off. */
  combos?: { spell: string; name: string; keys: string }[];
  /** The pieces the party could set a gem in now (systems/dmForge.ts), and where a smith stands in the land, if one does; none when `forge` is off. */
  forge?: { recipes: Recipe[]; smith?: { x: number; y: number } };
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
 * How much more gold a quest pays at the party's `level` than at the start: a gentle climb (12% of the first level's pay
 * per level), because what gold buys (the shops' prices, tens to a few hundred) does not grow with the level. XP is the
 * opposite: it is a share of the level's own need (`offerReward`), never a multiplier of a fixed base.
 */
export const goldScale = (level: number): number => 1 + 0.12 * (Math.max(1, Math.round(level)) - 1);

/**
 * How many of a foe worth `xp` a hunt asks of a party at `level`: few of a foe that is a match for them, more of one they
 * have outgrown (3 to 8), so a hunt is about as long a job whatever the level.
 */
export function huntGoal(xp: number, level: number): number {
  const kills = xpToNext(Math.max(1, level)) / Math.max(1, xp); // kills of it to make a level
  return Math.max(3, Math.min(8, Math.round(kills / 3)));
}

/**
 * What a quest pays each player (xp and gold) by its kind, its size and the party's level; a relic pays its item to
 * whoever found it, too. **XP is a share of the level** (a hunt of five is a quarter of one, a boss half of one, whatever
 * the level), so a saga is worth about a level at any stage and the kills themselves still make most of the climb. Gold
 * follows the shops' prices (`goldScale`), not the XP curve.
 */
export function offerReward(kind: QuestOffer['kind'], goal: number, level = 1): { xp: number; gold: number } {
  const base = baseReward(kind, goal);
  const need = xpToNext(Math.max(1, Math.round(level)));
  return { xp: Math.max(1, Math.round(need * base.share)), gold: Math.round(base.gold * goldScale(level)) };
}

/** A quest's pay at the first level: the share of a level it earns, and its gold. */
function baseReward(kind: QuestOffer['kind'], goal: number): { share: number; gold: number } {
  return kind === 'hunt'
    ? { share: 0.05 * goal, gold: 5 * goal }
    : kind === 'gather'
      ? { share: 0.04 * goal, gold: 4 * goal }
      : kind === 'cast'
        ? { share: 0.02 * goal, gold: 3 * goal }
        : kind === 'haul'
          ? { share: 0.05 * goal, gold: 6 * goal }
          : kind === 'find'
            ? { share: 0.2, gold: 30 }
            : kind === 'boss'
              ? { share: 0.5, gold: 40 } // richer than a hunt; the boss's own kill pays on top, and a gear drop is a hook (see `DmTasks.finish`)
              : kind === 'master'
                ? { share: 0.03 * goal, gold: 6 * goal }
                : kind === 'forge'
                  ? { share: 0.15, gold: 10 }
                  : { share: 0.1, gold: 15 };
}

/** A find is a kill of the carrying foe, or a gather of the chest's one relic. */
function findObjective(offer: QuestOffer): Quest['objective'] {
  const { carrier } = parseRelicWhat(offer.what);
  return carrier
    ? { t: 'kill', kind: carrier, count: 1, zone: offer.zone }
    : { t: 'gather', site: RELIC_KIND, zone: offer.zone, count: 1 };
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
          ? findObjective(offer)
          : offer.kind === 'cast'
            ? { t: 'cast', zone: offer.zone, count: offer.goal }
            : offer.kind === 'haul'
              ? { t: 'haul', place: offer.what, zone: offer.zone, count: offer.goal }
              : offer.kind === 'boss'
                ? { t: 'kill', kind: BOSS_KEY, count: 1, zone: offer.zone }
                : offer.kind === 'master'
                  ? { t: 'cast', zone: offer.zone, count: offer.goal, spell: parseMastery(offer.what)?.spell ?? '' }
                  : offer.kind === 'forge'
                    ? { t: 'cast', count: 1 } // only a count of one is kept: `TaskBook.forge` sets it when the piece is made
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

/** A mastery quest's `what`: the spell's id and the keys that cast it ("bolt:uurl"). */
export const masteryWhat = (spell: string, keys: string): string => `${spell}:${keys}`;

/** The spell and keys of a mastery quest's `what`, or null if it is not one. */
export function parseMastery(what: string): { spell: string; keys: string } | null {
  const m = /^([a-z]+):([udlr]{1,12})$/.exec(what);
  return m ? { spell: m[1]!, keys: m[2]! } : null;
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
  // A boss: the toughest foe the land has, made a giant for this party (the spot is where it waits).
  const foe = bossBase(land.mobs);
  const lair = foe ? land.spot() : null;
  if (foe && lair) {
    const name = bossName(foe.name, land.zone);
    const { maxHp } = bossStats(land.level, land.party ?? 1);
    out.push({
      kind: 'boss',
      title: bossTitle(name),
      zone: land.zone,
      goal: 1,
      what: bossWhat(foe.key, maxHp),
      ...lair,
    });
  }
  // Mastery: cast one spell a tome or wand of the party teaches, a few times.
  for (const c of land.combos ?? []) {
    const goal = 3;
    const at = land.spot() ?? { x: 0, y: 0 }; // cast anywhere in the land, like a cast quest
    out.push({
      kind: 'master',
      title: `Master ${c.name}: cast it ${goal} times`,
      zone: land.zone,
      goal,
      what: masteryWhat(c.spell, c.keys),
      ...at,
    });
  }
  for (const r of land.forge?.recipes ?? []) {
    const n = recipeNames(r.made);
    const title = n && `Set ${an(n.gem)} in ${an(n.base)}`;
    if (!title || title.length > 64 || r.made.length > 48) continue;
    const at = land.forge?.smith ?? land.spot() ?? { x: 0, y: 0 };
    out.push({ kind: 'forge', title, zone: land.zone, goal: 1, what: r.made, ...at });
  }
  // A find is never an item on the ground: it is in a chest the DM left, or a foe carries it.
  const relic = land.relics[0];
  const at = relic ? land.spot() : null;
  if (relic && at) {
    const title = `Open the chest holding ${relic.name}`;
    out.push({
      kind: 'find',
      title: title.length <= 64 ? title : `Find ${relic.name}`,
      zone: land.zone,
      goal: 1,
      what: relic.id,
      x: at.x,
      y: at.y,
    });
    const carrier = matched(land.mobs, land.level)[0];
    if (carrier)
      out.push({
        kind: 'find',
        title: `Take ${relic.name} from ${an(carrier.name)}`.slice(0, 64),
        zone: land.zone,
        goal: 1,
        what: relicWhat(relic.id, carrier.key),
        x: carrier.x,
        y: carrier.y,
      });
  }
  return out.map((o) => ({ ...o, level: land.level }));
}

/** The gear a relic could be, best fit for `level` first: pieces worth about what a hero of that level would have earned. */
export function relicsFor(
  items: Record<string, { name: string; value?: number; slot?: string; use?: unknown; fused?: unknown }>,
  level: number,
): { id: string; name: string }[] {
  const target = 30 + 25 * level;
  return Object.entries(items)
    .filter(([, it]) => it.slot !== undefined && it.use === undefined && it.fused === undefined && (it.value ?? 0) > 0)
    .sort(([, a], [, b]) => Math.abs((a.value ?? 0) - target) - Math.abs((b.value ?? 0) - target))
    .map(([id, it]) => ({ id, name: `the ${it.name}` }));
}

/**
 * The gear a saga or a quest hands a hero, when there is any: the id of a piece better than what they wear, of the way they
 * already fight and in reach of their level (the rule is `giftFor`, systems/dmGear.ts: varied by slot, one per hero).
 * Null when nothing is better (their gear is already fine).
 */
export const upgradeFor = (
  hero: Hero,
  items: Record<string, Item>,
  level: number,
  recent: readonly GearSlot[] = [],
  seed = 0,
): string | null => giftFor(hero, items, level, recent, seed)?.id ?? null;
