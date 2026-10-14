// Packs and the assembler: content in mix-and-match pieces, and a seeded assembler that turns a pick of them into an
// ordinary campaign (the four files of public/content/<campaign>/, as JSON), so the engine and every check see nothing
// new. Pixi-free and tested.
//
// A pack (public/content/packs/<id>.json, listed in packs/index.json) holds any of:
// - `entities`: mobs and people, as in entities.json, a mob with `tags` (its roles: common, hunter, ranged, brute,
//   boss; and themes: fire, frost, swamp, undead, beast...) and a `level` band [min, max];
// - `keepers`: people who can give a story's quests (an npc entity, the name and the tag over their head);
// - `regions`: a biome (its map has `z.port`s and, for a hub, a `keeper` spot) with a level band, themes, its ports,
//   the roles of the foes that live there (`foes`, picked from every pack's mobs by role, band and theme), how many of
//   each roam and stand where (`roam`, `encounters`) and its quest sites;
// - `arcs`: a story, quests written against roles instead of ids: `"@r2.boss"` is the mob picked for region 2's boss
//   role, `"@r1"` region 1's map, `"@r1.site"` its site kind; in text `{r1}` is the region's name, `{r1.common}`
//   the mob's (`.plural`, or `.lower` for the plural in lower case), `{r1.site}` the site's, `{keeper}` the keeper's.
//
// `assemble(seed, packs)` picks an arc and the regions it needs (r1 a hub, the rest in rising level, each able to fill
// the roles the arc names), may add side regions, joins them port to port, picks a keeper and the mobs for each role,
// and writes the files. The same seed and packs always give the same campaign (co-op relies on it).

import { CONTENT_VERSION, type ContentFile } from './schema';
import type { PortBinding } from './ports';

/** A pack file, as written. Everything is optional: a pack can be only mobs, only a region, only a story. */
export interface Pack {
  version: number;
  id: string;
  entities?: Record<string, PackEntity>;
  keepers?: Record<string, KeeperDef>;
  regions?: Record<string, RegionDef>;
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

export interface ArcDef {
  title: string;
  /** How many regions the story runs through: r1 (a hub) to rN. */
  regions: number;
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
    arcs: {} as Record<string, ArcDef>,
  };
  for (const p of packs) {
    if (p.version !== CONTENT_VERSION) throw new AssemblyError(`pack "${p.id}" has version ${p.version}`);
    Object.assign(all.entities, p.entities);
    Object.assign(all.keepers, p.keepers);
    Object.assign(all.regions, p.regions);
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

const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];

/** The mobs that could fill `role` in `region`: carrying the role and the role's tags, in the region's band; those of its themes when there are any. */
export function candidates(cat: Catalog, region: RegionDef, role: string): string[] {
  const want = [role, ...(region.foes[role]?.tags ?? [])];
  const fit = Object.entries(cat.entities)
    .filter(([, e]) => e.type === 'mob' && want.every((t) => e.tags?.includes(t)))
    .filter(([, e]) => overlaps(e.level ?? [1, 99], region.level))
    .map(([id]) => id)
    .sort();
  const themed = fit.filter((id) => cat.entities[id]!.tags!.some((t) => region.themes.includes(t)));
  return themed.length ? themed : fit;
}

/** Can a region fill these roles (its own `foes` must list them, and some mob must fit each) and site? */
function fills(cat: Catalog, region: RegionDef, need: { roles: Set<string>; site: boolean }) {
  if (need.site && !Object.keys(region.sites ?? {}).length) return false;
  return [...need.roles].every((role) => region.foes[role] && candidates(cat, region, role).length > 0);
}

/** Pick the story's regions in order (r1 a hub, then non-hubs in rising level with a port to go on from), or null. */
function storyRegions(cat: Catalog, arc: ArcDef, rand: () => number): string[] | null {
  const needs = arcNeeds(arc);
  const chosen: string[] = [];
  const go = (i: number): boolean => {
    if (i === needs.length) return true;
    const prev = chosen.length ? cat.regions[chosen[chosen.length - 1]!]! : null;
    const last = i === needs.length - 1;
    const options = Object.entries(cat.regions).filter(([id, r]) => {
      if (chosen.includes(id) || (i === 0) !== !!r.hub) return false;
      if (prev && r.level[0] < prev.level[0]) return false;
      const portsNeeded = (i > 0 ? 1 : 0) + (last ? 0 : 1);
      return r.ports.length >= portsNeeded && fills(cat, r, needs[i]!);
    });
    for (const [id] of shuffled(
      rand,
      options.sort(([a], [b]) => a.localeCompare(b)),
    )) {
      chosen.push(id);
      if (go(i + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  return go(0) ? chosen : null;
}

/** Fill `{...}` text tokens and `"@..."` ids in an arc's JSON. */
function resolveArc(value: unknown, ids: (token: string) => string, text: (token: string) => string): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('@')) return ids(value.slice(1));
    return value.replace(/\{([\w.]+)\}/g, (_, token: string) => text(token));
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
 * Assemble a campaign from packs with a seed. Throws an `AssemblyError` when no arc can be told with the regions there
 * are. The files still go through `parseContent` (ContentManager.load), so a bad pack fails like a bad campaign file.
 */
export function assemble(seed: number, packs: readonly Pack[]): Assembly {
  const cat = mergePacks(packs);
  const rand = rng(seed);
  let arcId = '';
  let story: string[] | null = null;
  for (const id of shuffled(rand, Object.keys(cat.arcs).sort())) {
    story = storyRegions(cat, cat.arcs[id]!, rand);
    if (story) {
      arcId = id;
      break;
    }
  }
  if (!story) throw new AssemblyError('no story arc can be told with these regions');
  const arc = cat.arcs[arcId]!;
  const keeperIds = Object.keys(cat.keepers).sort();
  if (!keeperIds.length) throw new AssemblyError('no keeper to give the quests');
  const keeperId = pick(rand, keeperIds);
  const keeper = cat.keepers[keeperId]!;

  // Side regions: any other non-hub region, sometimes, if a port is free on both sides.
  const regions = [...story];
  const free = new Map(regions.map((id) => [id, [...cat.regions[id]!.ports]]));
  const bindings = new Map<string, Record<string, PortBinding>>(regions.map((id) => [id, {}]));
  const join = (a: string, b: string) => {
    const pa = free.get(a)!;
    const pb = free.get(b)!;
    const portA = pa.splice(Math.floor(rand() * pa.length), 1)[0]!;
    const portB = pb.splice(Math.floor(rand() * pb.length), 1)[0]!;
    bindings.get(a)![portA] = { map: cat.regions[b]!.biome.map, port: portB };
    bindings.get(b)![portB] = { map: cat.regions[a]!.biome.map, port: portA };
  };
  for (let i = 1; i < story.length; i++) {
    // The story's way on leaves r(i-1) by a port other than the one it came in by, so keep one free for each step.
    join(story[i - 1]!, story[i]!);
  }
  for (const id of Object.keys(cat.regions).sort()) {
    const r = cat.regions[id]!;
    if (regions.includes(id) || r.hub || rand() < 0.5) continue;
    const hosts = regions.filter((h) => free.get(h)!.length > 0);
    if (!hosts.length || !r.ports.length) continue;
    regions.push(id);
    free.set(id, [...r.ports]);
    bindings.set(id, {});
    join(pick(rand, hosts), id);
  }

  // The foes of each region, by role.
  const foes: Record<string, Record<string, string>> = {};
  for (const id of regions) {
    const r = cat.regions[id]!;
    foes[id] = {};
    for (const role of Object.keys(r.foes).sort()) {
      const options = candidates(cat, r, role);
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

  // The story, its roles filled in.
  const regionAt = (token: string) => {
    const m = /^r(\d+)$/.exec(token);
    const id = m && story[Number(m[1]) - 1];
    if (!id) throw new AssemblyError(`arc "${arcId}" names "${token}"`);
    return id;
  };
  const siteOf = (region: string) => Object.keys(cat.regions[region]!.sites ?? {})[0] ?? '';
  const ids = (token: string) => {
    const [r, what] = token.split('.');
    const region = regionAt(r!);
    if (!what) return cat.regions[region]!.biome.map;
    if (what === 'site') return siteOf(region);
    return foes[region]![what] ?? '';
  };
  const text = (token: string) => {
    const [head, what, form] = token.split('.');
    if (head === 'keeper') return what === 'tag' ? keeper.tag : keeper.name;
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
      chapters: resolveArc(arc.chapters, ids, text),
      quests: resolveArc(arc.quests, ids, text),
      epilogue: resolveArc(arc.epilogue ?? [], ids, text),
    },
  };
  return { seed, arc: arcId, keeper: keeperId, regions, foes, files };
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
