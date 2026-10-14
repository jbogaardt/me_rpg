// The game's content as data: what lives in public/content/*.json (entities, biomes, scenarios), the shapes it must
// have, and the checks that read it. Pixi-free and tested. The engine never trusts the files: everything is validated
// here when it loads (`parseContent`), and a broken file stops the game with a list of every problem, not a crash later.
// The source of the JSON (static files today, a database later) is ContentManager's business, not this file's.

import type { MobKind } from '../systems/combat';
import { isClimate } from '../systems/weather';
import { SKILL_IDS } from '../systems/skills';
import { SLOTS, type Outfit } from '../sprites/doll';

/** The files of the content, by name: `public/content/<name>.json` when served statically. */
export const CONTENT_FILES = ['entities', 'biomes', 'scenarios'] as const;
export type ContentFile = (typeof CONTENT_FILES)[number];

/** The version of the content files' format this code reads. */
export const CONTENT_VERSION = 1;

// --- entities.json --------------------------------------------------------------------------------------------------

/** A mob's numbers. Distances are world pixels (a cell is 32), speeds pixels per second (the hero walks at 120). */
export interface EntityStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number; // while chasing
  sight: number; // starts chasing inside this range
  xp: number; // awarded on kill
  gold: number; // dropped on kill, give or take 30%
}

/** How a mob fights. Everything is optional: a plain melee brute has no behaviour beyond the defaults. */
export interface EntityBehavior {
  windup?: number; // seconds of telegraph before a blow (default 0.45)
  recover?: number; // seconds busy after attacking (default 0.7)
  stagger?: number; // seconds a hit stuns it (default 0.3)
  shot?: { range: number; speed: number; color: string }; // a ranged attacker (color "#rrggbb")
  ray?: { range: number; color: string; tick: number; power: number; duration: number; rest: number }; // a held beam
}

/** One thing a scenario can place: an enemy (`mob`) or a person to talk to (`npc`). */
export interface EntityDef {
  type: 'mob' | 'npc';
  name: string;
  /** Designer's notes (what it is for, its level band); not shown in the game. */
  notes?: string;
  /** The paper-doll outfit: a sprite part id per slot (src/sprites/parts.ts). */
  sprite: Outfit;
  /** Drawn this much bigger than a person (mobs only, default 1); its body, reach and hit area grow with it. */
  scale?: number;
  stats?: EntityStats; // mobs only (required for them)
  behavior?: EntityBehavior; // mobs only
  /** What an NPC placed by a scenario says when the player talks to it. */
  lines?: string[];
}

// --- biomes.json ----------------------------------------------------------------------------------------------------

/** Enemies spread over a biome's open ground when it loads, deterministically (the same seed, the same places). */
export interface RoamRule {
  kinds: string[]; // entity ids, cycled through
  count: number;
  seed: number;
  apart: number; // cells between any two of them
  avoid: { x: number; y: number; radius: number }[]; // cells (the map's own) to keep clear of, e.g. the spawn
}

export interface BiomeDef {
  /** The map file it is drawn from: public/maps/<map>.json (built from maps/<map>.ts). */
  map: string;
  /** Its weather (a key of CLIMATES, systems/weather.ts); null for a room, which has none. */
  climate: string | null;
  /** Background music: not played yet (the game has no audio), kept for when it does. */
  music: string | null;
  /** The tilesets its map draws with (public/tilesets/), loaded alongside the map. `npm run map -- build` keeps it in step. */
  tilesets: string[];
  /** What is generated when it loads: for now, the enemies that roam it. */
  generation: { roam?: RoamRule[] };
}

// --- scenarios.json -------------------------------------------------------------------------------------------------

/** What a choice asks of the hero: a stat at least `min`, or a learned skill. */
export type Requirement = { stat: 'level' | 'attack' | 'defense' | 'magic'; min: number } | { skill: string };
export const REQUIREMENT_STATS = ['level', 'attack', 'defense', 'magic'] as const;

export interface Choice {
  text: string;
  next: string; // the node it leads to
  requires?: Requirement;
}

/** An entity placed by a scenario, at a cell (x = column, y = row) of the biome's map. */
export interface Placement {
  entity: string;
  x: number;
  y: number;
}

export interface ScenarioNode {
  node_id: string;
  biome_type: string;
  /** Where the player arrives when the node is loaded (a cell of the map); default the map's own spawn. */
  spawn?: { x: number; y: number };
  entities: Placement[];
  choices: Choice[];
}

export interface Scenarios {
  /** The node the game starts in. */
  start: string;
  nodes: Map<string, ScenarioNode>;
}

/** Everything the content files hold, validated. */
export interface Content {
  entities: Record<string, EntityDef>;
  biomes: Record<string, BiomeDef>;
  scenarios: Scenarios;
}

/** A content file that does not have the shape it must: every problem found, one per line. */
export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`The game content is not valid:\n  ${problems.join('\n  ')}`);
    this.name = 'ContentError';
  }
}

// --- reading --------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Collects problems with paths ("entities.goblin.stats.hp: ...") while a file is read. */
class Reader {
  problems: string[] = [];
  fail(path: string, what: string) {
    this.problems.push(`${path}: ${what}`);
  }
  object(v: unknown, path: string): Json | null {
    if (isObject(v)) return v;
    this.fail(path, 'must be an object');
    return null;
  }
  string(v: unknown, path: string): string {
    if (typeof v === 'string' && v.length > 0) return v;
    this.fail(path, 'must be a non-empty string');
    return '';
  }
  number(v: unknown, path: string, min = -Infinity): number {
    if (isNumber(v) && v >= min) return v;
    this.fail(path, min > -Infinity ? `must be a number of at least ${min}` : 'must be a number');
    return 0;
  }
  optionalNumber(v: unknown, path: string, min = -Infinity): number | undefined {
    return v === undefined ? undefined : this.number(v, path, min);
  }
  color(v: unknown, path: string): string {
    if (isColor(v)) return v;
    this.fail(path, 'must be a colour like "#a0ff40"');
    return '#ffffff';
  }
  array(v: unknown, path: string): unknown[] {
    if (Array.isArray(v)) return v;
    this.fail(path, 'must be an array');
    return [];
  }
  strings(v: unknown, path: string): string[] {
    return this.array(v, path).map((s, i) => this.string(s, `${path}[${i}]`));
  }
  version(file: Json, path: string) {
    if (file.version !== CONTENT_VERSION) this.fail(`${path}.version`, `must be ${CONTENT_VERSION}`);
  }
}

function readOutfit(r: Reader, v: unknown, path: string): Outfit {
  const o = r.object(v, path);
  if (!o) return {};
  const outfit: Outfit = {};
  for (const [slot, part] of Object.entries(o)) {
    if (!(SLOTS as readonly string[]).includes(slot)) r.fail(`${path}.${slot}`, `is not a slot (${SLOTS.join(', ')})`);
    else outfit[slot as (typeof SLOTS)[number]] = r.string(part, `${path}.${slot}`);
  }
  if (!outfit.body) r.fail(path, 'needs a body part');
  return outfit;
}

function readEntity(r: Reader, v: unknown, path: string): EntityDef | null {
  const e = r.object(v, path);
  if (!e) return null;
  if (e.type !== 'mob' && e.type !== 'npc') r.fail(`${path}.type`, 'must be "mob" or "npc"');
  const def: EntityDef = {
    type: e.type === 'npc' ? 'npc' : 'mob',
    name: r.string(e.name, `${path}.name`),
    sprite: readOutfit(r, e.sprite, `${path}.sprite`),
  };
  if (e.notes !== undefined) def.notes = r.string(e.notes, `${path}.notes`);
  if (e.scale !== undefined) def.scale = r.number(e.scale, `${path}.scale`, 0.5);
  if (e.lines !== undefined) def.lines = r.strings(e.lines, `${path}.lines`);
  if (def.type === 'npc') {
    if (e.stats !== undefined || e.behavior !== undefined) r.fail(path, 'an npc has no stats or behavior');
    return def;
  }
  const s = r.object(e.stats, `${path}.stats`);
  if (s) {
    const n = (key: keyof EntityStats, min: number) => r.number(s[key], `${path}.stats.${key}`, min);
    def.stats = {
      hp: n('hp', 1),
      attack: n('attack', 0),
      defense: n('defense', 0),
      speed: n('speed', 0),
      sight: n('sight', 0),
      xp: n('xp', 0),
      gold: n('gold', 0),
    };
  }
  const b = e.behavior === undefined ? {} : r.object(e.behavior, `${path}.behavior`);
  if (b) {
    const p = `${path}.behavior`;
    const behavior: EntityBehavior = {};
    const windup = r.optionalNumber(b.windup, `${p}.windup`, 0);
    const recover = r.optionalNumber(b.recover, `${p}.recover`, 0);
    const stagger = r.optionalNumber(b.stagger, `${p}.stagger`, 0);
    if (windup !== undefined) behavior.windup = windup;
    if (recover !== undefined) behavior.recover = recover;
    if (stagger !== undefined) behavior.stagger = stagger;
    if (b.shot !== undefined) {
      const shot = r.object(b.shot, `${p}.shot`);
      if (shot)
        behavior.shot = {
          range: r.number(shot.range, `${p}.shot.range`, 1),
          speed: r.number(shot.speed, `${p}.shot.speed`, 1),
          color: r.color(shot.color, `${p}.shot.color`),
        };
    }
    if (b.ray !== undefined) {
      const ray = r.object(b.ray, `${p}.ray`);
      if (ray)
        behavior.ray = {
          range: r.number(ray.range, `${p}.ray.range`, 1),
          color: r.color(ray.color, `${p}.ray.color`),
          tick: r.number(ray.tick, `${p}.ray.tick`, 0.01),
          power: r.number(ray.power, `${p}.ray.power`, 0),
          duration: r.number(ray.duration, `${p}.ray.duration`, 0),
          rest: r.number(ray.rest, `${p}.ray.rest`, 0),
        };
    }
    def.behavior = behavior;
  }
  return def;
}

/** Read entities.json. */
export function parseEntities(json: unknown, r = new Reader()): Record<string, EntityDef> {
  const file = r.object(json, 'entities.json');
  const out: Record<string, EntityDef> = {};
  if (!file) return out;
  r.version(file, 'entities.json');
  const all = r.object(file.entities, 'entities.json.entities') ?? {};
  for (const [id, v] of Object.entries(all)) {
    const def = readEntity(r, v, `entities.${id}`);
    if (def) out[id] = def;
  }
  return out;
}

function readRoam(r: Reader, v: unknown, path: string): RoamRule | null {
  const o = r.object(v, path);
  if (!o) return null;
  return {
    kinds: r.strings(o.kinds, `${path}.kinds`),
    count: r.number(o.count, `${path}.count`, 0),
    seed: r.number(o.seed, `${path}.seed`),
    apart: r.number(o.apart ?? 12, `${path}.apart`, 0),
    avoid: r.array(o.avoid ?? [], `${path}.avoid`).flatMap((a, i) => {
      const p = r.object(a, `${path}.avoid[${i}]`);
      if (!p) return [];
      const at = `${path}.avoid[${i}]`;
      return [
        { x: r.number(p.x, `${at}.x`), y: r.number(p.y, `${at}.y`), radius: r.number(p.radius, `${at}.radius`, 0) },
      ];
    }),
  };
}

/** Read biomes.json. */
export function parseBiomes(json: unknown, r = new Reader()): Record<string, BiomeDef> {
  const file = r.object(json, 'biomes.json');
  const out: Record<string, BiomeDef> = {};
  if (!file) return out;
  r.version(file, 'biomes.json');
  const all = r.object(file.biomes, 'biomes.json.biomes') ?? {};
  for (const [type, v] of Object.entries(all)) {
    const path = `biomes.${type}`;
    const b = r.object(v, path);
    if (!b) continue;
    const climate = b.climate === null || b.climate === undefined ? null : r.string(b.climate, `${path}.climate`);
    if (climate !== null && !isClimate(climate)) r.fail(`${path}.climate`, `"${climate}" is not a climate`);
    const music = b.music === null || b.music === undefined ? null : r.string(b.music, `${path}.music`);
    const gen = b.generation === undefined ? {} : r.object(b.generation, `${path}.generation`);
    const roam = gen?.roam === undefined ? undefined : r.array(gen.roam, `${path}.generation.roam`);
    out[type] = {
      map: r.string(b.map, `${path}.map`),
      climate,
      music,
      tilesets: r.strings(b.tilesets ?? [], `${path}.tilesets`),
      generation: roam ? { roam: roam.flatMap((v, i) => readRoam(r, v, `${path}.generation.roam[${i}]`) ?? []) } : {},
    };
  }
  return out;
}

function readRequirement(r: Reader, v: unknown, path: string): Requirement | undefined {
  const o = r.object(v, path);
  if (!o) return undefined;
  if (typeof o.skill === 'string') return { skill: o.skill };
  if (!(REQUIREMENT_STATS as readonly unknown[]).includes(o.stat)) {
    r.fail(path, `needs "skill", or "stat" (${REQUIREMENT_STATS.join(', ')}) and "min"`);
    return undefined;
  }
  return { stat: o.stat as (typeof REQUIREMENT_STATS)[number], min: r.number(o.min, `${path}.min`) };
}

/** Read scenarios.json. */
export function parseScenarios(json: unknown, r = new Reader()): Scenarios {
  const file = r.object(json, 'scenarios.json');
  const nodes = new Map<string, ScenarioNode>();
  if (!file) return { start: '', nodes };
  r.version(file, 'scenarios.json');
  const start = r.string(file.start, 'scenarios.json.start');
  r.array(file.nodes, 'scenarios.json.nodes').forEach((v, i) => {
    const o = r.object(v, `nodes[${i}]`);
    if (!o) return;
    const id = r.string(o.node_id, `nodes[${i}].node_id`);
    const path = `nodes.${id || i}`;
    if (nodes.has(id)) r.fail(path, 'node_id is used twice');
    const node: ScenarioNode = {
      node_id: id,
      biome_type: r.string(o.biome_type, `${path}.biome_type`),
      entities: r.array(o.entities ?? [], `${path}.entities`).flatMap((e, j) => {
        const p = r.object(e, `${path}.entities[${j}]`);
        if (!p) return [];
        const at = `${path}.entities[${j}]`;
        return [
          {
            entity: r.string(p.entity, `${at}.entity`),
            x: r.number(p.x, `${at}.x`, 0),
            y: r.number(p.y, `${at}.y`, 0),
          },
        ];
      }),
      choices: r.array(o.choices ?? [], `${path}.choices`).flatMap((c, j) => {
        const p = r.object(c, `${path}.choices[${j}]`);
        if (!p) return [];
        const at = `${path}.choices[${j}]`;
        const choice: Choice = { text: r.string(p.text, `${at}.text`), next: r.string(p.next, `${at}.next`) };
        if (p.requires !== undefined) {
          const req = readRequirement(r, p.requires, `${at}.requires`);
          if (req) choice.requires = req;
        }
        return [choice];
      }),
    };
    if (o.spawn !== undefined) {
      const s = r.object(o.spawn, `${path}.spawn`);
      if (s) node.spawn = { x: r.number(s.x, `${path}.spawn.x`, 0), y: r.number(s.y, `${path}.spawn.y`, 0) };
    }
    nodes.set(id, node);
  });
  return { start, nodes };
}

/** The checks across files: every id one file names must exist in the file it names. */
function crossCheck(r: Reader, c: Content) {
  const mob = (id: string) => c.entities[id]?.type === 'mob';
  for (const [id, e] of Object.entries(c.entities))
    if (e.type === 'mob' && !e.stats) r.fail(`entities.${id}`, 'a mob needs stats');
  for (const [type, b] of Object.entries(c.biomes))
    b.generation.roam?.forEach((rule, i) => {
      for (const k of rule.kinds)
        if (!mob(k)) r.fail(`biomes.${type}.generation.roam[${i}]`, `"${k}" is not a mob in entities.json`);
      if (rule.count > 0 && rule.kinds.length === 0) r.fail(`biomes.${type}.generation.roam[${i}]`, 'has no kinds');
    });
  if (c.scenarios.start && !c.scenarios.nodes.has(c.scenarios.start))
    r.fail('scenarios.json.start', `no node "${c.scenarios.start}"`);
  for (const node of c.scenarios.nodes.values()) {
    const path = `nodes.${node.node_id}`;
    if (!c.biomes[node.biome_type]) r.fail(`${path}.biome_type`, `"${node.biome_type}" is not in biomes.json`);
    node.entities.forEach((p, i) => {
      if (!c.entities[p.entity]) r.fail(`${path}.entities[${i}]`, `"${p.entity}" is not in entities.json`);
    });
    node.choices.forEach((choice, i) => {
      if (!c.scenarios.nodes.has(choice.next)) r.fail(`${path}.choices[${i}].next`, `no node "${choice.next}"`);
      const req = choice.requires;
      if (req && 'skill' in req && !(SKILL_IDS as readonly string[]).includes(req.skill))
        r.fail(`${path}.choices[${i}].requires.skill`, `"${req.skill}" is not a skill (${SKILL_IDS.join(', ')})`);
    });
  }
}

/** Read and check all three files. Throws a `ContentError` listing every problem. */
export function parseContent(files: Record<ContentFile, unknown>): Content {
  const r = new Reader();
  const content: Content = {
    entities: parseEntities(files.entities, r),
    biomes: parseBiomes(files.biomes, r),
    scenarios: parseScenarios(files.scenarios, r),
  };
  crossCheck(r, content);
  if (r.problems.length) throw new ContentError(r.problems);
  return content;
}

// --- into the engine's own types ------------------------------------------------------------------------------------

const colorNumber = (hex: string) => parseInt(hex.slice(1), 16);

/** A mob entity as the engine's `MobKind` (systems/combat.ts). */
export function toMobKind(def: EntityDef): MobKind {
  const s = def.stats;
  if (def.type !== 'mob' || !s) throw new Error(`"${def.name}" is not a mob`);
  const b = def.behavior ?? {};
  const kind: MobKind = {
    name: def.name,
    look: def.sprite,
    maxHp: s.hp,
    attack: s.attack,
    defense: s.defense,
    xp: s.xp,
    gold: s.gold,
    speed: s.speed,
    sight: s.sight,
  };
  if (def.scale !== undefined) kind.scale = def.scale;
  if (b.windup !== undefined) kind.windup = b.windup;
  if (b.recover !== undefined) kind.recover = b.recover;
  if (b.stagger !== undefined) kind.stagger = b.stagger;
  if (b.shot) kind.shot = { ...b.shot, color: colorNumber(b.shot.color) };
  if (b.ray) kind.ray = { ...b.ray, color: colorNumber(b.ray.color) };
  return kind;
}

/** Does a hero meet a choice's requirement? */
export function meets(
  hero: { stats: Record<(typeof REQUIREMENT_STATS)[number], number>; skills: readonly string[] },
  req: Requirement | undefined,
): boolean {
  if (!req) return true;
  if ('skill' in req) return hero.skills.includes(req.skill);
  return hero.stats[req.stat] >= req.min;
}

/** How a requirement reads on a choice's button: "Level 4", "Magic 12", "Knows Iron Skin". */
export function requirementText(req: Requirement, skillName: (id: string) => string = (id) => id): string {
  if ('skill' in req) return `Knows ${skillName(req.skill)}`;
  return `${req.stat[0]!.toUpperCase()}${req.stat.slice(1)} ${req.min}`;
}
