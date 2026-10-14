// Packs and the assembler: content in mix-and-match pieces, and a seeded assembler that turns a pick of them into an
// ordinary campaign (the four files of public/content/<campaign>/, as JSON), so the engine and every check see nothing
// new. Pixi-free and tested.
//
// A pack (public/content/packs/<id>.json, listed in packs/index.json) holds any of:
// - `entities`: mobs and people, as in entities.json, a mob with `tags` (its roles: common, hunter, ranged, brute,
//   boss; and themes: fire, frost, swamp, undead, beast...) and a `level` band [min, max];
// - `keepers`: people who can give a story's quests (an npc entity, the name, the tag over their head, and the hub
//   regions they live in, `homes`);
// - `regions`: a biome (its map has `z.port`s and, for a hub, a `keeper` spot) with a level band, themes, its ports,
//   the roles of the foes that live there (`foes`, picked from every pack's mobs by role, band and theme), how many of
//   each roam and stand where (`roam`, `encounters`) and its quest sites;
// - `pairings`: how two regions meet. **Two regions are only ever joined where a pairing says they can**: it names the
//   two, its `tags` (what kind of meeting: thaw, restless-dead...), optionally the `ports` that join them, and its
//   `lore`, lines a story can quote, written for this pair (a line may differ by the region it is seen from:
//   `{ "<region id>": "..." }`);
// - `arcs`: a story, quests written against roles instead of ids: `"@r2.boss"` is the mob picked for region 2's boss
//   role, `"@r1"` region 1's map, `"@r1.site"` its site kind; in text `{r1}` is the region's name, `{r1.common}`
//   the mob's (`.plural`, or `.lower` for the plural in lower case), `{r1.site}` the site's, `{keeper}` the keeper's,
//   and `{r1~r2.sign}` a line of the pairing the story crosses from r1 to r2 (seen from r1). An arc constrains what
//   may fill it: `slots` (per region: ids or themes it must be, extra tags for its foes), `crossings` (tags the pairing
//   between two of its regions must carry), `keepers`; and a quest or chapter may carry `variants`, each with a `when`
//   (`"r1": "<region id>"` or `"theme:fire"`, `"r1~r2": "<pairing id or tag>"`, `"keeper": "<id>"`) whose fields
//   replace the quest's when it matches: detailed quests for particular meetings of biomes.
//
// `assemble(seed, packs)` picks an arc and the regions it needs (r1 a hub, the rest in rising level, each meeting its
// slot, able to fill the roles the arc names, and paired with the one before it as the arc asks), a keeper at home in
// r1, may add side regions (each paired with a region it joins), joins them port to port, picks the mobs for each
// role, and writes the files. The same seed and packs always give the same campaign (co-op relies on it).
// `checkPacks` lists what is wrong with a set of packs (dangling ids, unknown ports, a region nothing pairs with).

import { CONTENT_VERSION, type ContentFile } from './schema';
import type { PortBinding } from './ports';

/** A pack file, as written. Everything is optional: a pack can be only mobs, only a region, only a story. */
export interface Pack {
  version: number;
  id: string;
  entities?: Record<string, PackEntity>;
  keepers?: Record<string, KeeperDef>;
  regions?: Record<string, RegionDef>;
  pairings?: Record<string, PairingDef>;
  arcs?: Record<string, ArcDef>;
}

/** An entity as in entities.json, plus what the assembler reads. */
export interface PackEntity {
  type: 'mob' | 'npc';
  name: string;
  /** Roles and themes (mobs). */
  tags?: string[];
  /** The hero levels it suits (mobs). */
  level?: [number, number];
  /** Its name in the plural, for quest text ("ash hounds"); default the name with an "s". */
  plural?: string;
  [key: string]: unknown;
}

export interface KeeperDef {
  /** An npc entity: how they look. */
  npc: string;
  name: string;
  /** Floats over their head. */
  tag: string;
  /** The hub regions they live in (default: any). */
  homes?: string[];
}

/** How two regions meet (see the top of the file). */
export interface PairingDef {
  regions: [string, string];
  tags?: string[];
  /** The ports that join them, in the order of `regions` (default: any free ones). */
  ports?: [string, string];
  /** Lines a story quotes as `{rA~rB.key}`: one line, or one per region it is seen from. */
  lore?: Record<string, string | Record<string, string>>;
}

export interface RegionDef {
  /** The biome, as in biomes.json, without links, ports or generation (the assembler writes those). */
  biome: { name: string; tint?: string; map: string; climate: string | null; music: string | null; tilesets: string[] };
  level: [number, number];
  themes: string[];
  /** It has a `keeper` spot and can start a story. */
  hub?: boolean;
  /** The ports of its map (`z.port` names). */
  ports: string[];
  /** The roles of the foes that live here, each with tags the mob must also carry. */
  foes: Record<string, { tags?: string[] }>;
  roam: {
    role: string;
    count: number;
    seed: number;
    apart?: number;
    avoid?: { x: number; y: number; radius: number }[];
  }[];
  /** Who stands where (cells of the map): a foe by role, or an entity by id. */
  encounters?: ({ role: string; x: number; y: number } | { entity: string; x: number; y: number })[];
  /** Its gather sites (as quests.json `sites`; the map places them with `z.site`). */
  sites?: Record<string, { name: string; plural?: string; [key: string]: unknown }>;
}

/** What an arc asks of one of its regions. */
export interface ArcSlot {
  /** It must be one of these regions. */
  regions?: string[];
  /** It must have one of these themes. */
  themes?: string[];
  /** Extra tags its foes must carry, by role (the story's boss of fire...). */
  foes?: Record<string, { tags?: string[] }>;
}

export interface ArcDef {
  title: string;
  /** How many regions the story runs through: r1 (a hub) to rN. */
  regions: number;
  /** Per region (index 0 is r1): what it must be. */
  slots?: ArcSlot[];
  /** Per step of the story (`"r1~r2"`): tags the pairing crossed there must carry. */
  crossings?: Record<string, { tags?: string[] }>;
  /** The keepers who may tell it (default: any). */
  keepers?: string[];
  chapters: unknown[];
  quests: unknown[];
  epilogue?: string[];
}

/** What a seed made: for the log and the dev handle. */
export interface Assembly {
  seed: number;
  arc: string;
  keeper: string;
  /** Region ids, story regions first (r1, r2...), then side regions. */
  regions: string[];
  /** Region id -> role -> mob id. */
  foes: Record<string, Record<string, string>>;
  /** The pairing crossed at each step of the story (`"r1~r2"`) and at each side region's joint (`"<a>~<b>"`). */
  crossings: Record<string, string>;
  files: Record<ContentFile, unknown>;
}

/** Packs that cannot make a campaign: what is missing. */
export class AssemblyError extends Error {
  constructor(message: string) {
    super(`Could not assemble a campaign: ${message}`);
    this.name = 'AssemblyError';
  }
}

/** A small seeded random generator (mulberry32): the same seed, the same numbers, in every browser. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, list: readonly T[]): T => {
  const item = list[Math.floor(rand() * list.length)];
  if (item === undefined) throw new AssemblyError('nothing to pick from');
  return item;
};

function shuffled<T>(rand: () => number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Every pack's sections merged into one catalog (a later pack's id wins over an earlier one's). */
export function mergePacks(packs: readonly Pack[]) {
  const all = {
    entities: {} as Record<string, PackEntity>,
    keepers: {} as Record<string, KeeperDef>,
    regions: {} as Record<string, RegionDef>,
    pairings: {} as Record<string, PairingDef>,
    arcs: {} as Record<string, ArcDef>,
  };
  for (const p of packs) {
    if (p.version !== CONTENT_VERSION) throw new AssemblyError(`pack "${p.id}" has version ${p.version}`);
    Object.assign(all.entities, p.entities);
    Object.assign(all.keepers, p.keepers);
    Object.assign(all.regions, p.regions);
    Object.assign(all.pairings, p.pairings);
    Object.assign(all.arcs, p.arcs);
  }
  return all;
}
type Catalog = ReturnType<typeof mergePacks>;

/** What an arc asks of each of its regions: the foe roles it names, and whether it needs a site. Index 0 is r1. */
export function arcNeeds(arc: ArcDef): { roles: Set<string>; site: boolean }[] {
  const needs = Array.from({ length: arc.regions }, () => ({ roles: new Set<string>(), site: false }));
  const text = JSON.stringify([arc.chapters, arc.quests, arc.epilogue ?? []]);
  for (const m of text.matchAll(/[@{]r(\d+)\.(\w+)/g)) {
    const need = needs[Number(m[1]) - 1];
    if (!need) throw new AssemblyError(`an arc names r${m[1]}, but runs through ${arc.regions} regions`);
    if (m[2] === 'site') need.site = true;
    else need.roles.add(m[2]!);
  }
  return needs;
}

/**
 * What an arc asks of each step of its story (index 0 is r1 to r2): the lore keys its text quotes there, and the tags
 * its `crossings` want. A story quotes only the pairings it crosses, between neighbours in its order.
 */
export function crossingNeeds(arc: ArcDef): { lore: Set<string>; tags: string[] }[] {
  const steps = Array.from({ length: Math.max(0, arc.regions - 1) }, () => ({
    lore: new Set<string>(),
    tags: [] as string[],
  }));
  const step = (a: number, b: number, where: string) => {
    const s = steps[Math.min(a, b) - 1];
    if (Math.abs(a - b) !== 1 || !s)
      throw new AssemblyError(`an arc's ${where} r${a}~r${b} is not a step of its story`);
    return s;
  };
  const text = JSON.stringify([arc.chapters, arc.quests, arc.epilogue ?? []]);
  for (const m of text.matchAll(/\{r(\d+)~r(\d+)\.(\w+)\}/g))
    step(Number(m[1]), Number(m[2]), 'text quotes').lore.add(m[3]!);
  for (const [key, c] of Object.entries(arc.crossings ?? {})) {
    const m = /^r(\d+)~r(\d+)$/.exec(key);
    if (!m) throw new AssemblyError(`an arc's crossing "${key}" is not "rA~rB"`);
    step(Number(m[1]), Number(m[2]), 'crossing').tags.push(...(c.tags ?? []));
  }
  return steps;
}

/** The pairings between two regions (either way round), by id. */
export function pairingsBetween(cat: Catalog, a: string, b: string): string[] {
  return Object.entries(cat.pairings)
    .filter(([, p]) => (p.regions[0] === a && p.regions[1] === b) || (p.regions[0] === b && p.regions[1] === a))
    .map(([id]) => id)
    .sort();
}

/** The port a pairing joins `region` by, if it names one. */
const pairedPort = (p: PairingDef, region: string): string | undefined => p.ports?.[p.regions[0] === region ? 0 : 1];

const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];

/** The mobs that could fill `role` in `region`: carrying the role, the role's (and `extra`) tags and one of the region's themes, in its band. */
export function candidates(cat: Catalog, region: RegionDef, role: string, extra: string[] = []): string[] {
  const want = [role, ...(region.foes[role]?.tags ?? []), ...extra];
  const fit = Object.entries(cat.entities)
    .filter(([, e]) => e.type === 'mob' && want.every((t) => e.tags?.includes(t)))
    .filter(([, e]) => overlaps(e.level ?? [1, 99], region.level))
    .map(([id]) => id)
    .sort();
  // Only mobs of one of the region's themes: no fire brutes in the snow.
  return fit.filter((id) => cat.entities[id]!.tags!.some((t) => region.themes.includes(t)));
}

/** Can a region fill these roles (its own `foes` must list them, and some mob must fit each) and site? */
function fills(cat: Catalog, region: RegionDef, need: { roles: Set<string>; site: boolean }, slot: ArcSlot = {}) {
  if (need.site && !Object.keys(region.sites ?? {}).length) return false;
  return [...need.roles].every(
    (role) => region.foes[role] && candidates(cat, region, role, slot.foes?.[role]?.tags).length > 0,
  );
}

/** Does a region meet an arc's slot (its ids and themes)? */
const meetsSlot = (id: string, region: RegionDef, slot: ArcSlot = {}) =>
  (!slot.regions || slot.regions.includes(id)) && (!slot.themes || slot.themes.some((t) => region.themes.includes(t)));

/** Can a pairing be the crossing of a step that quotes these lore keys and wants these tags? */
const serves = (p: PairingDef, need: { lore: Set<string>; tags: string[] }) =>
  need.tags.every((t) => p.tags?.includes(t)) && [...need.lore].every((k) => p.lore?.[k] !== undefined);

/** The keepers who may tell `arc` from the hub `r1`. */
const keepersFor = (cat: Catalog, arc: ArcDef, r1: string) =>
  Object.entries(cat.keepers)
    .filter(([id, k]) => (!arc.keepers || arc.keepers.includes(id)) && (!k.homes || k.homes.includes(r1)))
    .map(([id]) => id)
    .sort();

/** A story: its regions in order, and the pairing crossed at each step. */
interface Story {
  regions: string[];
  crossings: string[];
}

/**
 * Pick the story's regions in order (r1 a hub some keeper of the arc lives in, then non-hubs in rising level, each
 * meeting its slot and paired with the one before as the arc asks, with a port to go on from), or null.
 */
function storyFor(cat: Catalog, arc: ArcDef, rand: () => number): Story | null {
  const needs = arcNeeds(arc);
  const steps = crossingNeeds(arc);
  const chosen: string[] = [];
  const crossings: string[] = [];
  const used = new Map<string, Set<string>>(); // ports a pairing has claimed, by region
  const claim = (p: PairingDef, region: string): boolean => {
    const port = pairedPort(p, region);
    if (!port) return true;
    const taken = used.get(region) ?? new Set();
    if (taken.has(port) || !cat.regions[region]!.ports.includes(port)) return false;
    used.set(region, taken.add(port));
    return true;
  };
  const release = (p: PairingDef, region: string) => {
    const port = pairedPort(p, region);
    if (port) used.get(region)?.delete(port);
  };
  const go = (i: number): boolean => {
    if (i === needs.length) return true;
    const prevId = chosen[chosen.length - 1];
    const prev = prevId ? cat.regions[prevId]! : null;
    const last = i === needs.length - 1;
    const options = Object.entries(cat.regions).filter(([id, r]) => {
      if (chosen.includes(id) || (i === 0) !== !!r.hub) return false;
      if (i === 0 && !keepersFor(cat, arc, id).length) return false;
      if (prev && r.level[0] < prev.level[0]) return false;
      const portsNeeded = (i > 0 ? 1 : 0) + (last ? 0 : 1);
      return (
        r.ports.length >= portsNeeded && meetsSlot(id, r, arc.slots?.[i]) && fills(cat, r, needs[i]!, arc.slots?.[i])
      );
    });
    for (const [id] of shuffled(
      rand,
      options.sort(([a], [b]) => a.localeCompare(b)),
    )) {
      const ways = prevId
        ? pairingsBetween(cat, prevId, id).filter((p) => serves(cat.pairings[p]!, steps[i - 1]!))
        : [''];
      for (const way of shuffled(rand, ways)) {
        const p = way ? cat.pairings[way]! : null;
        if (p && !claim(p, prevId!)) continue;
        if (p && !claim(p, id)) {
          release(p, prevId!);
          continue;
        }
        chosen.push(id);
        if (p) crossings.push(way);
        if (go(i + 1)) return true;
        chosen.pop();
        if (p) {
          crossings.pop();
          release(p, prevId!);
          release(p, id);
        }
      }
    }
    return false;
  };
  return go(0) ? { regions: chosen, crossings } : null;
}

/** Apply each object's first matching variant (`variants: [{ when, ...fields }]`) in place of its own fields. */
function applyVariants(list: unknown[], matches: (when: Record<string, string>) => boolean): unknown[] {
  return list.map((item) => {
    if (!item || typeof item !== 'object' || !('variants' in item)) return item;
    const { variants, ...base } = item as { variants: { when?: Record<string, string> }[] };
    const hit = variants.find((v) => matches(v.when ?? {}));
    if (!hit) return base;
    const { when: _w, ...fields } = hit;
    return { ...base, ...fields };
  });
}

/** Fill `{...}` text tokens and `"@..."` ids in an arc's JSON. */
function resolveArc(value: unknown, ids: (token: string) => string, text: (token: string) => string): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('@')) return ids(value.slice(1));
    return value.replace(/\{([\w.~]+)\}/g, (_, token: string) => text(token));
  }
  if (Array.isArray(value)) return value.map((v) => resolveArc(v, ids, text));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveArc(v, ids, text)]));
  return value;
}

/** A mob's or site's name as a story token asks for it: `{r1.common}` the name, `.plural`, `.lower` (plural, lower case). */
function named(thing: { name: string; plural?: string }, form: string | undefined): string {
  const plural = thing.plural ?? `${thing.name}s`;
  if (form === 'plural') return plural;
  if (form === 'lower') return plural.toLowerCase();
  return thing.name;
}

/** The entity fields entities.json has (a pack entity's extras are dropped). */
function entityJson(e: PackEntity): Record<string, unknown> {
  const { tags: _t, level: _l, plural: _p, ...rest } = e;
  return rest;
}

/**
 * Assemble a campaign from packs with a seed. Throws an `AssemblyError` when the packs have problems (`checkPacks`) or
 * no arc can be told with the regions and pairings there are. The files still go through `parseContent`
 * (ContentManager.load), so a bad pack fails like a bad campaign file.
 */
export function assemble(seed: number, packs: readonly Pack[]): Assembly {
  const cat = mergePacks(packs);
  const problems = checkPacks(cat);
  if (problems.length) throw new AssemblyError(problems.join('; '));
  const rand = rng(seed);
  let arcId = '';
  let found: Story | null = null;
  for (const id of shuffled(rand, Object.keys(cat.arcs).sort())) {
    found = storyFor(cat, cat.arcs[id]!, rand);
    if (found) {
      arcId = id;
      break;
    }
  }
  if (!found) throw new AssemblyError('no story arc can be told with these regions and pairings');
  const story = found.regions;
  const arc = cat.arcs[arcId]!;
  const keeperId = pick(rand, keepersFor(cat, arc, story[0]!));
  const keeper = cat.keepers[keeperId]!;

  // Join the story's regions by the pairings it crosses: their own ports first, then any free ones.
  const regions = [...story];
  const free = new Map(regions.map((id) => [id, [...cat.regions[id]!.ports]]));
  const bindings = new Map<string, Record<string, PortBinding>>(regions.map((id) => [id, {}]));
  const crossings: Record<string, string> = {};
  const take = (region: string, port: string | undefined) => {
    const list = free.get(region)!;
    const i = port ? list.indexOf(port) : Math.floor(rand() * list.length);
    if (i < 0 || !list.length) throw new AssemblyError(`region "${region}" has no free port ${port ?? ''}`);
    return list.splice(i, 1)[0]!;
  };
  const join = (a: string, b: string, pairing: string) => {
    const p = cat.pairings[pairing]!;
    const portA = take(a, pairedPort(p, a));
    const portB = take(b, pairedPort(p, b));
    bindings.get(a)![portA] = { map: cat.regions[b]!.biome.map, port: portB };
    bindings.get(b)![portB] = { map: cat.regions[a]!.biome.map, port: portA };
  };
  // Ports a story pairing names are claimed before any free port is handed out.
  for (const [i, pairing] of found.crossings.entries()) {
    const p = cat.pairings[pairing]!;
    for (const r of [story[i]!, story[i + 1]!]) {
      const port = pairedPort(p, r);
      if (port) free.get(r)!.splice(free.get(r)!.indexOf(port), 1);
    }
  }
  for (const [i, pairing] of found.crossings.entries()) {
    const [a, b] = [story[i]!, story[i + 1]!];
    const p = cat.pairings[pairing]!;
    for (const r of [a, b]) {
      const port = pairedPort(p, r);
      if (port) free.get(r)!.push(port); // given back just for this join
    }
    join(a, b, pairing);
    crossings[`r${i + 1}~r${i + 2}`] = pairing;
  }
  // Side regions: any other non-hub region, sometimes, where a pairing joins it to one already in, by free ports.
  for (const id of Object.keys(cat.regions).sort()) {
    const r = cat.regions[id]!;
    if (regions.includes(id) || r.hub || rand() < 0.5) continue;
    free.set(id, [...r.ports]);
    const joints = regions.flatMap((host) =>
      pairingsBetween(cat, host, id)
        .filter((pid) => {
          const p = cat.pairings[pid]!;
          const fits = (region: string) => {
            const port = pairedPort(p, region);
            return port ? free.get(region)!.includes(port) : free.get(region)!.length > 0;
          };
          return fits(host) && fits(id);
        })
        .map((pid) => [host, pid] as const),
    );
    if (!joints.length) {
      free.delete(id);
      continue;
    }
    const [host, pairing] = pick(rand, joints);
    regions.push(id);
    bindings.set(id, {});
    join(host, id, pairing);
    crossings[`${host}~${id}`] = pairing;
  }

  // The foes of each region, by role (a story region's slot may ask more of them).
  const foes: Record<string, Record<string, string>> = {};
  for (const id of regions) {
    const r = cat.regions[id]!;
    const slot = arc.slots?.[story.indexOf(id)];
    foes[id] = {};
    for (const role of Object.keys(r.foes).sort()) {
      const options = candidates(cat, r, role, slot?.foes?.[role]?.tags);
      if (!options.length) throw new AssemblyError(`no mob can be the ${role} of region "${id}"`);
      // A different mob for each role where there is one, so two quests of a region never ask for the same foe.
      const fresh = options.filter((m) => !Object.values(foes[id]!).includes(m));
      foes[id][role] = pick(rand, fresh.length ? fresh : options);
    }
  }

  // Entities: the mobs picked, the keeper, and whoever an encounter names.
  const used = new Set<string>([keeper.npc]);
  for (const id of regions) {
    for (const mob of Object.values(foes[id]!)) used.add(mob);
    for (const e of cat.regions[id]!.encounters ?? []) if ('entity' in e) used.add(e.entity);
  }
  const entities: Record<string, unknown> = {};
  for (const id of [...used].sort()) {
    const e = cat.entities[id];
    if (!e) throw new AssemblyError(`no entity "${id}" in any pack`);
    entities[id] = entityJson(e);
  }

  const biomes: Record<string, unknown> = {};
  const nodes: unknown[] = [];
  const sites: Record<string, unknown> = {};
  for (const id of regions) {
    const r = cat.regions[id]!;
    const ports = bindings.get(id)!;
    const links = Object.values(ports).map((b) => b.map);
    biomes[id] = {
      ...r.biome,
      links,
      ports,
      generation: {
        roam: r.roam.map((rule) => ({
          kinds: [foes[id]![rule.role] ?? rule.role],
          count: rule.count,
          seed: rule.seed + seed,
          apart: rule.apart ?? 8,
          avoid: rule.avoid ?? [],
        })),
      },
    };
    nodes.push({
      node_id: id,
      biome_type: id,
      entities: (r.encounters ?? []).map((e) =>
        'entity' in e ? e : { entity: foes[id]![e.role] ?? e.role, x: e.x, y: e.y },
      ),
      choices: [],
    });
    for (const [site, def] of Object.entries(r.sites ?? {})) {
      const { plural: _p, ...rest } = def;
      sites[site] = rest;
    }
  }

  // The story, its variants chosen and its roles filled in.
  const regionAt = (token: string) => {
    const m = /^r(\d+)$/.exec(token);
    const id = m && story[Number(m[1]) - 1];
    if (!id) throw new AssemblyError(`arc "${arcId}" names "${token}"`);
    return id;
  };
  const crossingOf = (a: string, b: string) => {
    const [i, j] = [Number(a.slice(1)), Number(b.slice(1))];
    const pairing = found.crossings[Math.min(i, j) - 1];
    if (!pairing) throw new AssemblyError(`arc "${arcId}" names "${a}~${b}"`);
    return pairing;
  };
  const matches = (when: Record<string, string>) =>
    Object.entries(when).every(([key, want]) => {
      if (key === 'keeper') return want === keeperId;
      const pair = /^(r\d+)~(r\d+)$/.exec(key);
      if (pair) {
        const id = crossingOf(pair[1]!, pair[2]!);
        return want === id || !!cat.pairings[id]!.tags?.includes(want);
      }
      const region = regionAt(key);
      return want.startsWith('theme:') ? cat.regions[region]!.themes.includes(want.slice(6)) : want === region;
    });
  const siteOf = (region: string) => Object.keys(cat.regions[region]!.sites ?? {})[0] ?? '';
  const ids = (token: string) => {
    const [r, what] = token.split('.');
    const region = regionAt(r!);
    if (!what) return cat.regions[region]!.biome.map;
    if (what === 'site') return siteOf(region);
    return foes[region]![what] ?? '';
  };
  const text = (token: string): string => {
    const [head, what, form] = token.split('.');
    if (head === 'keeper') return what === 'tag' ? keeper.tag : keeper.name;
    const pair = /^(r\d+)~(r\d+)$/.exec(head!);
    if (pair) {
      const line = cat.pairings[crossingOf(pair[1]!, pair[2]!)]!.lore?.[what ?? ''];
      const seen = typeof line === 'string' ? line : line?.[regionAt(pair[1]!)];
      if (seen === undefined) throw new AssemblyError(`arc "${arcId}" quotes "${token}", which its pairing lacks`);
      return seen;
    }
    const region = regionAt(head!);
    if (!what) return cat.regions[region]!.biome.name;
    const thing =
      what === 'site' ? cat.regions[region]!.sites?.[siteOf(region)] : cat.entities[foes[region]![what] ?? ''];
    if (!thing) throw new AssemblyError(`arc "${arcId}" names "${token}", which region "${region}" does not have`);
    return named(thing, form);
  };
  const r1 = cat.regions[story[0]!]!;
  const files: Record<ContentFile, unknown> = {
    entities: { version: CONTENT_VERSION, entities },
    biomes: { version: CONTENT_VERSION, biomes },
    scenarios: { version: CONTENT_VERSION, start: story[0], nodes },
    quests: {
      version: CONTENT_VERSION,
      giver: 'keeper',
      givers: { keeper: { name: keeper.name, look: keeper.npc, tag: keeper.tag, zone: r1.biome.map } },
      sites,
      chapters: resolveArc(applyVariants(arc.chapters, matches), ids, text),
      quests: resolveArc(applyVariants(arc.quests, matches), ids, text),
      epilogue: resolveArc(arc.epilogue ?? [], ids, text),
    },
  };
  return { seed, arc: arcId, keeper: keeperId, regions, foes, crossings, files };
}

/** What is wrong with a set of packs, one problem per entry (empty when they can be assembled from). */
export function checkPacks(cat: Catalog): string[] {
  const out: string[] = [];
  const region = (id: string) => cat.regions[id];
  for (const [id, k] of Object.entries(cat.keepers)) {
    if (cat.entities[k.npc]?.type !== 'npc') out.push(`keepers.${id}.npc: "${k.npc}" is not an npc`);
    for (const h of k.homes ?? []) if (!region(h)?.hub) out.push(`keepers.${id}.homes: "${h}" is not a hub region`);
  }
  const paired = new Set<string>();
  for (const [id, p] of Object.entries(cat.pairings)) {
    const [a, b] = p.regions;
    if (a === b) out.push(`pairings.${id}: pairs "${a}" with itself`);
    p.regions.forEach((r, i) => {
      if (!region(r)) out.push(`pairings.${id}: no region "${r}"`);
      else if (p.ports && !region(r)!.ports.includes(p.ports[i]!))
        out.push(`pairings.${id}.ports: "${r}" has no port "${p.ports[i]}"`);
      paired.add(r);
    });
    for (const [key, line] of Object.entries(p.lore ?? {}))
      if (typeof line !== 'string')
        for (const seen of Object.keys(line))
          if (!p.regions.includes(seen)) out.push(`pairings.${id}.lore.${key}: "${seen}" is not one of its regions`);
  }
  for (const id of Object.keys(cat.regions))
    if (!paired.has(id)) out.push(`regions.${id}: no pairing joins it to anything`);
  for (const [id, arc] of Object.entries(cat.arcs)) {
    arc.slots?.forEach((slot, i) =>
      slot.regions?.forEach((r) => {
        if (!region(r)) out.push(`arcs.${id}.slots[${i}]: no region "${r}"`);
      }),
    );
    for (const k of arc.keepers ?? []) if (!cat.keepers[k]) out.push(`arcs.${id}.keepers: no keeper "${k}"`);
    try {
      arcNeeds(arc);
      crossingNeeds(arc);
    } catch (err) {
      out.push(`arcs.${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

/**
 * Every region of the packs as one campaign with no story and no ports joined (each foe role its first candidate),
 * for the tools: the map checks need a region's names, keeper spot and sites installed, and the content checks see
 * every region's placements and roam rules.
 */
export function catalogCampaign(packs: readonly Pack[]): Record<ContentFile, unknown> {
  const cat = mergePacks(packs);
  const ids = Object.keys(cat.regions).sort();
  const hub = ids.find((id) => cat.regions[id]!.hub);
  const keeper = Object.values(cat.keepers)[0];
  if (!hub || !keeper) throw new AssemblyError('the packs need a hub region and a keeper');
  const foeOf = (id: string, role: string) => candidates(cat, cat.regions[id]!, role)[0] ?? role;
  const sites: Record<string, unknown> = {};
  for (const id of ids)
    for (const [site, def] of Object.entries(cat.regions[id]!.sites ?? {})) {
      const { plural: _p, ...rest } = def;
      sites[site] = rest;
    }
  return {
    entities: {
      version: CONTENT_VERSION,
      entities: Object.fromEntries(Object.entries(cat.entities).map(([id, e]) => [id, entityJson(e)])),
    },
    biomes: {
      version: CONTENT_VERSION,
      biomes: Object.fromEntries(
        ids.map((id) => {
          const r = cat.regions[id]!;
          const roam = r.roam.map((rule) => ({
            kinds: [foeOf(id, rule.role)],
            count: rule.count,
            seed: rule.seed,
            apart: rule.apart ?? 8,
            avoid: rule.avoid ?? [],
          }));
          return [id, { ...r.biome, links: [], ports: {}, generation: { roam } }];
        }),
      ),
    },
    scenarios: {
      version: CONTENT_VERSION,
      start: hub,
      nodes: ids.map((id) => ({
        node_id: id,
        biome_type: id,
        entities: (cat.regions[id]!.encounters ?? []).map((e) =>
          'entity' in e ? e : { entity: foeOf(id, e.role), x: e.x, y: e.y },
        ),
        choices: [],
      })),
    },
    quests: {
      version: CONTENT_VERSION,
      giver: 'keeper',
      givers: { keeper: { name: keeper.name, look: keeper.npc, tag: keeper.tag, zone: cat.regions[hub]!.biome.map } },
      sites,
      chapters: [{ title: 'Every region', intro: ['(The tools’ view of the packs: no story.)'] }],
      quests: [],
      epilogue: [],
    },
  };
}
