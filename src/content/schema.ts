// The game's content as data: what lives in public/content/*.json (entities, biomes, scenarios), the shapes it must
// have, and the checks that read it. Pixi-free and tested. The engine never trusts the files: everything is validated
// here when it loads (`parseContent`), and a broken file stops the game with a list of every problem, not a crash later.
// The source of the JSON (static files today, a database later) is ContentManager's business, not this file's.

import type { MobKind } from '../systems/combat';
import { MAX_BAND } from '../systems/bands';
import { MAX_ROAM_CELLS } from '../systems/roam';
import { isClimate } from '../systems/weather';
import type { Band } from '../systems/levels';
import { SKILL_IDS, SKILLS } from '../systems/skills';
import { CapabilityTable, checkCapabilities, DIALS, type CapabilitySpec, type Dial } from '../systems/capabilities';
import { BONUS_KEYS, isGem, type Bonus, type BonusKey } from '../systems/gems';
import { onlyFeeds } from '../systems/needs';
import { MOB_DEATHS, type MobDeath } from '../systems/particleEffects';
import { CROPS } from '../systems/crops';
import { SLOTS, type Outfit } from '../sprites/doll';
import { GEAR_SLOTS, type GearSlot, type Item } from '../systems/combat';
import { iconKind } from '../systems/inventory';
import { ITEM_VARIANTS } from '../systems/itemArt';
import type { ItemId, StartGear } from '../systems/items';
import { TRADE_KINDS, type Shop } from '../systems/shops';
import { COMBO_KEYS, SPELL_IDS, type Combo, type SpellId } from '../systems/spells';
import { parseEpics, type EpicTemplate } from '../systems/dmEpics';
import type { PortBinding } from './ports';
import { splitStory } from './story';
import type { Chapter, Giver, Objective, Quest, QuestContent, Reward, SiteKind } from '../systems/quests';

/** The files of a campaign's content, by name: `public/content/<campaign>/<name>.json` when served statically. */
export const CONTENT_FILES = ['entities', 'biomes', 'scenarios', 'quests', 'items'] as const;
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
  windup?: number; // seconds of telegraph before a blow (default 0.5)
  recover?: number; // seconds busy after attacking (default 0.7)
  stagger?: number; // seconds a hit stuns it (default 0.3)
  telegraph?: { color?: string; ground?: boolean }; // windup cue: flash colour "#rrggbb", ground warning
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
  /** A named boss (mobs only): placed once in its zone, a `boss` objective's target; see `systems/bosses.ts`. */
  boss?: boolean;
  /** How a mob goes when it dies (`MOB_DEATHS` in systems/particleEffects.ts); absent: the plain poof. */
  death?: MobDeath;
  stats?: EntityStats; // mobs only (required for them)
  behavior?: EntityBehavior; // mobs only
  /** What an NPC placed by a scenario says when the player talks to it. */
  lines?: string[];
  /**
   * An NPC a scenario places strolls about their post within this many cells (1 to `MAX_ROAM_CELLS`), stopping to face
   * whoever talks to them; absent: stands still. Needs the `roaming` capability (systems/roam.ts).
   */
  roam?: number;
}

// --- biomes.json ----------------------------------------------------------------------------------------------------

/** Enemies spread over a biome's open ground when it loads, deterministically (the same seed, the same places). */
export interface RoamRule {
  kinds: string[]; // entity ids, cycled through
  count: number;
  seed: number;
  apart: number; // cells between any two of them
  avoid: { x: number; y: number; radius: number }[]; // cells (the map's own) to keep clear of, e.g. the spawn
  /** Only inside these circles (cells of the map): the deep end of a zone. Absent: anywhere inland. */
  within?: { x: number; y: number; radius: number }[];
  /** The hero level this group is made for (`systems/bands.ts` re-bands its foes); absent: the kinds as the entities have them. */
  level?: number;
}

export interface BiomeDef {
  /** What the area is called on screen (the banner on arriving, the map's heading, quest hints). */
  name: string;
  /** The colour the door transition's rim glows on arriving (`#rrggbb`); a default for rooms and others. */
  tint?: string;
  /** The zones (maps) a player can walk to from here, through a door or a gap: the quest guide finds its way with them. */
  links: string[];
  /** The map file it is drawn from: public/maps/<map>.json (built from maps/<map>.ts). */
  map: string;
  /** Where its map's ports (`z.port`) lead, by port name: another biome's map and port (src/content/ports.ts). Unbound ports are walled up. */
  ports: Record<string, PortBinding>;
  /** Its weather (a key of CLIMATES, systems/weather.ts); null for a room, which has none. */
  climate: string | null;
  /** Background music: not played yet (the game has no audio), kept for when it does. */
  music: string | null;
  /** The tilesets its map draws with (public/tilesets/), loaded alongside the map. `npm run map -- build` keeps it in step. */
  tilesets: string[];
  /** What is generated when it loads: for now, the enemies that roam it. */
  generation: { roam?: RoamRule[] };
  /** Its zone's own word on the capabilities whose scope is a zone (no map in this cave, double hunger in this swamp). */
  capabilities?: CapabilitySpec;
  /** The hero levels it is made for, lowest and highest (systems/levels.ts): advice on the banner, a gate with `levelGates`, and a check on its foes. */
  levels?: Band;
}

// --- scenarios.json -------------------------------------------------------------------------------------------------

/** What a choice asks of the hero: a stat at least `min`, or a learned skill. */
export type Requirement = { stat: 'level' | 'attack' | 'defense' | 'magic'; min: number } | { skill: string };
export const REQUIREMENT_STATS = ['level', 'attack', 'defense', 'magic'] as const;

export interface Choice {
  text: string;
  next: string; // the node it leads to
  requires?: Requirement;
  /** Why the way is shut while `requires` is unmet (the story's words, shown under the choice and said when it is tried). */
  hint?: string;
}

/** An entity placed by a scenario, at a cell (x = column, y = row) of the biome's map. */
export interface Placement {
  entity: string;
  x: number;
  y: number;
  /** For a mob: the hero level it is made for (`systems/bands.ts`); absent: as its entity has it. */
  level?: number;
}

export interface ScenarioNode {
  node_id: string;
  biome_type: string;
  /** Where the player arrives when the node is loaded (a cell of the map); default the map's own spawn. */
  spawn?: { x: number; y: number };
  entities: Placement[];
  choices: Choice[];
  /**
   * Who a Dungeon Master brought in during play (a live world's `cast`, content/world.ts): placed after the biome's
   * roamers, so a zone already built and one built later agree on the order of its mobs.
   */
  cast?: Placement[];
}

export interface Scenarios {
  /** The node the game starts in. */
  start: string;
  /** The engine's features this campaign switches off or tunes (systems/capabilities.ts); any not named are on. */
  capabilities: CapabilitySpec;
  nodes: Map<string, ScenarioNode>;
}

// --- items.json -----------------------------------------------------------------------------------------------------

/** What a chest holds, as content: an item by id, or a restorative, XP or gold (systems/chests.ts `ChestLoot`). */
export type LootDef = { item: ItemId } | { hp: number; mp?: number } | { xp: number } | { gold: number };

/** The campaign's goods: what a hero starts with, every item (in code order), the shops and the chests' contents. */
export interface ItemContent {
  start: StartGear;
  items: Record<string, Item>;
  shops: Record<string, Shop>;
  loots: Record<string, LootDef>;
}

/** Everything the content files hold, validated. */
export interface Content {
  entities: Record<string, EntityDef>;
  biomes: Record<string, BiomeDef>;
  scenarios: Scenarios;
  quests: QuestContent;
  /** The party epics the campaign's quests.json holds (the Dungeon Master's, beside its own story). */
  epics: EpicTemplate[];
  items: ItemContent;
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
  if (e.roam !== undefined) {
    if (def.type !== 'npc') r.fail(`${path}.roam`, 'only an npc roams (a mob has its own behavior)');
    else {
      def.roam = r.number(e.roam, `${path}.roam`, 1);
      if (def.roam > MAX_ROAM_CELLS) r.fail(`${path}.roam`, `must be at most ${MAX_ROAM_CELLS} cells`);
    }
  }
  if (e.death !== undefined) {
    if (def.type === 'npc') r.fail(`${path}.death`, 'only a mob dies');
    else if (typeof e.death !== 'string' || !(MOB_DEATHS as readonly string[]).includes(e.death))
      r.fail(`${path}.death`, `must be one of ${MOB_DEATHS.join(', ')}`);
    else def.death = e.death as MobDeath;
  }
  if (e.boss !== undefined) {
    if (e.boss !== true || e.type === 'npc') r.fail(`${path}.boss`, 'is true on a mob, or left out');
    else def.boss = true;
  }
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
    if (b.telegraph !== undefined) {
      const tg = r.object(b.telegraph, `${p}.telegraph`);
      if (tg) {
        const t: NonNullable<EntityBehavior['telegraph']> = {};
        if (tg.color !== undefined) t.color = r.color(tg.color, `${p}.telegraph.color`);
        if (tg.ground !== undefined) {
          if (typeof tg.ground !== 'boolean') r.fail(`${p}.telegraph.ground`, 'must be true or false');
          else t.ground = tg.ground;
        }
        behavior.telegraph = t;
      }
    }
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

function readCircles(r: Reader, v: unknown, path: string): { x: number; y: number; radius: number }[] {
  return r.array(v, path).flatMap((a, i) => {
    const p = r.object(a, `${path}[${i}]`);
    if (!p) return [];
    const at = `${path}[${i}]`;
    return [
      { x: r.number(p.x, `${at}.x`), y: r.number(p.y, `${at}.y`), radius: r.number(p.radius, `${at}.radius`, 0) },
    ];
  });
}

/** An optional band: a whole hero level from 1 to `MAX_BAND`. */
function readLevel(r: Reader, v: unknown, path: string): number | undefined {
  if (v === undefined) return undefined;
  const level = r.number(v, path, 1);
  if (!Number.isInteger(level) || level > MAX_BAND) r.fail(path, `must be a whole hero level from 1 to ${MAX_BAND}`);
  return level;
}

function readRoam(r: Reader, v: unknown, path: string): RoamRule | null {
  const o = r.object(v, path);
  if (!o) return null;
  const level = readLevel(r, o.level, `${path}.level`);
  return {
    kinds: r.strings(o.kinds, `${path}.kinds`),
    count: r.number(o.count, `${path}.count`, 0),
    seed: r.number(o.seed, `${path}.seed`),
    apart: r.number(o.apart ?? 12, `${path}.apart`, 0),
    avoid: readCircles(r, o.avoid ?? [], `${path}.avoid`),
    ...(o.within !== undefined ? { within: readCircles(r, o.within, `${path}.within`) } : {}),
    ...(level !== undefined ? { level } : {}),
  };
}

function readPorts(r: Reader, v: unknown, path: string): Record<string, PortBinding> {
  const out: Record<string, PortBinding> = {};
  if (v === undefined) return out;
  for (const [name, b] of Object.entries(r.object(v, path) ?? {})) {
    const o = r.object(b, `${path}.${name}`);
    if (o) out[name] = { map: r.string(o.map, `${path}.${name}.map`), port: r.string(o.port, `${path}.${name}.port`) };
  }
  return out;
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
      name: r.string(b.name, `${path}.name`),
      ...(b.tint === undefined ? {} : { tint: r.color(b.tint, `${path}.tint`) }),
      links: r.strings(b.links ?? [], `${path}.links`),
      map: r.string(b.map, `${path}.map`),
      ports: readPorts(r, b.ports, `${path}.ports`),
      climate,
      music,
      tilesets: r.strings(b.tilesets ?? [], `${path}.tilesets`),
      generation: roam ? { roam: roam.flatMap((v, i) => readRoam(r, v, `${path}.generation.roam[${i}]`) ?? []) } : {},
    };
    if (b.capabilities !== undefined)
      out[type].capabilities = readCapabilities(r, b.capabilities, `${path}.capabilities`, 'zone');
    if (b.levels !== undefined) {
      const [lo, hi] = r.array(b.levels, `${path}.levels`).map((n, i) => r.number(n, `${path}.levels[${i}]`, 1));
      if (lo === undefined || hi === undefined || lo > hi)
        r.fail(`${path}.levels`, 'is [lowest, highest] level, lowest first');
      else out[type].levels = [lo, hi];
    }
  }
  return out;
}

/** A capability spec (systems/capabilities.ts `checkCapabilities` says what is wrong with it). */
function readCapabilities(r: Reader, v: unknown, path: string, scope: 'campaign' | 'zone'): CapabilitySpec {
  const problems = checkCapabilities(v, path, scope);
  for (const p of problems) r.problems.push(p);
  // Kept even when something in it is wrong (the problems stop the load anyway), so the other checks still see it.
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {};
}

/** The capabilities a campaign's content sets: the campaign's, and each biome's for its zone (map). */
export function capabilityTable(c: Pick<Content, 'scenarios' | 'biomes'>): CapabilityTable {
  const zones: Record<string, CapabilitySpec> = {};
  for (const b of Object.values(c.biomes)) if (b.capabilities) zones[b.map] = b.capabilities;
  return new CapabilityTable(c.scenarios.capabilities, zones);
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

/** A list of placements (`[{ entity, x, y }]`, cells of the map). */
function placements(r: Reader, v: unknown, path: string): Placement[] {
  return r.array(v ?? [], path).flatMap((e, j) => {
    const p = r.object(e, `${path}[${j}]`);
    if (!p) return [];
    const at = `${path}[${j}]`;
    const level = readLevel(r, p.level, `${at}.level`);
    return [
      {
        entity: r.string(p.entity, `${at}.entity`),
        x: r.number(p.x, `${at}.x`, 0),
        y: r.number(p.y, `${at}.y`, 0),
        ...(level !== undefined ? { level } : {}),
      },
    ];
  });
}

/** Read scenarios.json. */
export function parseScenarios(json: unknown, r = new Reader()): Scenarios {
  const file = r.object(json, 'scenarios.json');
  const nodes = new Map<string, ScenarioNode>();
  if (!file) return { start: '', capabilities: {}, nodes };
  r.version(file, 'scenarios.json');
  const start = r.string(file.start, 'scenarios.json.start');
  const capabilities = readCapabilities(r, file.capabilities, 'scenarios.json.capabilities', 'campaign');
  r.array(file.nodes, 'scenarios.json.nodes').forEach((v, i) => {
    const o = r.object(v, `nodes[${i}]`);
    if (!o) return;
    const id = r.string(o.node_id, `nodes[${i}].node_id`);
    const path = `nodes.${id || i}`;
    if (nodes.has(id)) r.fail(path, 'node_id is used twice');
    const node: ScenarioNode = {
      node_id: id,
      biome_type: r.string(o.biome_type, `${path}.biome_type`),
      entities: placements(r, o.entities, `${path}.entities`),
      choices: r.array(o.choices ?? [], `${path}.choices`).flatMap((c, j) => {
        const p = r.object(c, `${path}.choices[${j}]`);
        if (!p) return [];
        const at = `${path}.choices[${j}]`;
        const choice: Choice = { text: r.string(p.text, `${at}.text`), next: r.string(p.next, `${at}.next`) };
        if (p.requires !== undefined) {
          const req = readRequirement(r, p.requires, `${at}.requires`);
          if (req) choice.requires = req;
        }
        if (p.hint !== undefined) {
          choice.hint = r.string(p.hint, `${at}.hint`);
          if (p.requires === undefined) r.fail(`${at}.hint`, 'explains a requirement, and this choice has none');
        }
        return [choice];
      }),
    };
    if (o.cast !== undefined) node.cast = placements(r, o.cast, `${path}.cast`);
    if (o.spawn !== undefined) {
      const s = r.object(o.spawn, `${path}.spawn`);
      if (s) node.spawn = { x: r.number(s.x, `${path}.spawn.x`, 0), y: r.number(s.y, `${path}.spawn.y`, 0) };
    }
    nodes.set(id, node);
  });
  return { start, capabilities, nodes };
}

const SITE_SHAPES = ['mushroom', 'stone', 'sand'] as const;

function readObjective(r: Reader, v: unknown, path: string): Objective {
  const o = r.object(v, path) ?? {};
  const count = r.number(o.count, `${path}.count`, 1);
  if (o.t === 'kill') {
    const kill: Objective = { t: 'kill', kind: r.string(o.kind, `${path}.kind`), count };
    if (o.zone !== undefined) kill.zone = r.string(o.zone, `${path}.zone`);
    return kill;
  }
  if (o.t === 'boss')
    return { t: 'boss', boss: r.string(o.boss, `${path}.boss`), zone: r.string(o.zone, `${path}.zone`), count: 1 };
  if (o.t === 'gather')
    return { t: 'gather', site: r.string(o.site, `${path}.site`), zone: r.string(o.zone, `${path}.zone`), count };
  if (o.t === 'bring') {
    return { t: 'bring', item: r.string(o.item, `${path}.item`), count };
  }
  if (o.t === 'meet') return { t: 'meet', count: 1 };
  if (o.t === 'visit')
    return { t: 'visit', place: r.string(o.place, `${path}.place`), zone: r.string(o.zone, `${path}.zone`), count: 1 };
  if (o.t === 'cast') {
    const cast: Objective = { t: 'cast', count };
    if (o.zone !== undefined) cast.zone = r.string(o.zone, `${path}.zone`);
    return cast;
  }
  if (o.t === 'haul')
    return { t: 'haul', place: r.string(o.place, `${path}.place`), zone: r.string(o.zone, `${path}.zone`), count };
  r.fail(`${path}.t`, 'must be "kill", "boss", "gather", "bring", "meet", "visit", "cast" or "haul"');
  return { t: 'kill', kind: '', count };
}

function readReward(r: Reader, v: unknown, path: string): Reward {
  const o = r.object(v, path) ?? {};
  const reward: Reward = { gold: r.number(o.gold, `${path}.gold`, 0), xp: r.number(o.xp, `${path}.xp`, 0) };
  if (o.items !== undefined) reward.items = r.strings(o.items, `${path}.items`);
  return reward;
}

/** Read quests.json: the givers, site kinds, chapters, the chain in story order and the epilogue. */
export function parseQuests(json: unknown, r = new Reader()): QuestContent {
  const file = r.object(json, 'quests.json');
  const out: QuestContent = { giver: '', givers: {}, sites: {}, chapters: [], quests: [], epilogue: [], welcome: [] };
  if (!file) return out;
  r.version(file, 'quests.json');
  out.giver = r.string(file.giver, 'quests.json.giver');
  for (const [id, v] of Object.entries(r.object(file.givers, 'quests.json.givers') ?? {})) {
    const g = r.object(v, `givers.${id}`);
    if (!g) continue;
    const giver: Giver = {
      name: r.string(g.name, `givers.${id}.name`),
      look: r.string(g.look, `givers.${id}.look`),
      tag: r.string(g.tag, `givers.${id}.tag`),
      zone: r.string(g.zone, `givers.${id}.zone`),
    };
    if (g.idle !== undefined) giver.idle = r.strings(g.idle, `givers.${id}.idle`);
    out.givers[id] = giver;
  }
  for (const [id, v] of Object.entries(r.object(file.sites ?? {}, 'quests.json.sites') ?? {})) {
    const p = `sites.${id}`;
    const o = r.object(v, p);
    if (!o) continue;
    if (!(SITE_SHAPES as readonly unknown[]).includes(o.shape))
      r.fail(`${p}.shape`, `must be ${SITE_SHAPES.join(', ')}`);
    const site: SiteKind = {
      name: r.string(o.name, `${p}.name`),
      shape: SITE_SHAPES.includes(o.shape as (typeof SITE_SHAPES)[number]) ? (o.shape as SiteKind['shape']) : 'stone',
      color: parseInt(r.color(o.color, `${p}.color`).slice(1), 16),
      glow: parseInt(r.color(o.glow, `${p}.glow`).slice(1), 16),
      notes: r.array(o.notes, `${p}.notes`).map((n, i) => r.strings(n, `${p}.notes[${i}]`)),
    };
    out.sites[id] = site;
  }
  out.chapters = r.array(file.chapters, 'quests.json.chapters').map((v, i): Chapter => {
    const o = r.object(v, `chapters[${i}]`) ?? {};
    const chapter: Chapter = {
      title: r.string(o.title, `chapters[${i}].title`),
      intro: r.strings(o.intro, `chapters[${i}].intro`),
    };
    if (o.narration !== undefined) chapter.narration = r.strings(o.narration, `chapters[${i}].narration`);
    return chapter;
  });
  out.quests = r.array(file.quests, 'quests.json.quests').map((v, i): Quest => {
    const o = r.object(v, `quests[${i}]`) ?? {};
    const p = `quests.${typeof o.id === 'string' ? o.id : i}`;
    const where = r.object(o.where, `${p}.where`) ?? {};
    const q: Quest = {
      id: r.string(o.id, `${p}.id`),
      chapter: r.number(o.chapter, `${p}.chapter`, 0),
      learned: r.string(o.learned, `${p}.learned`),
      fieldNote: r.strings(o.fieldNote, `${p}.fieldNote`),
      title: r.string(o.title, `${p}.title`),
      goal: r.string(o.goal, `${p}.goal`),
      hint: r.string(o.hint, `${p}.hint`),
      where: { zones: r.strings(where.zones, `${p}.where.zones`) },
      unit: r.string(o.unit, `${p}.unit`),
      objective: readObjective(r, o.objective, `${p}.objective`),
      reward: readReward(r, o.reward, `${p}.reward`),
      offer: r.strings(o.offer, `${p}.offer`),
      remind: r.strings(o.remind, `${p}.remind`),
      done: r.strings(o.done, `${p}.done`),
    };
    if (where.door !== undefined) q.where.door = r.string(where.door, `${p}.where.door`);
    if (o.giver !== undefined) q.giver = r.string(o.giver, `${p}.giver`);
    if (o.turnIn !== undefined) q.turnIn = r.string(o.turnIn, `${p}.turnIn`);
    if (o.capabilities !== undefined) q.capabilities = readQuestDials(r, o.capabilities, `${p}.capabilities`);
    return q;
  });
  out.epilogue = r.strings(file.epilogue ?? [], 'quests.json.epilogue');
  out.welcome = r.strings(file.welcome ?? [], 'quests.json.welcome');
  return out;
}

/** What a quest switches while it is taken: only the capabilities a Dungeon Master may switch (`DIALS`), each true or false. */
function readQuestDials(r: Reader, v: unknown, path: string): Partial<Record<Dial, boolean>> {
  const out: Partial<Record<Dial, boolean>> = {};
  const o = r.object(v, path);
  if (!o) return out;
  for (const [id, on] of Object.entries(o)) {
    if (!(DIALS as readonly string[]).includes(id)) r.fail(`${path}.${id}`, `must be one of ${DIALS.join(', ')}`);
    else if (typeof on !== 'boolean') r.fail(`${path}.${id}`, 'must be true or false');
    else out[id as Dial] = on;
  }
  return out;
}

const MAX_SHOP_ID = 24; // the network carries a shop's id in a `do` message (src/net/protocol.ts)
const ITEM_NUMBERS = [
  'value',
  'attack',
  'defense',
  'speed',
  'magic',
  'regen',
  'mpRegen',
  'xpBonus',
  'goldBonus',
] as const;
const isSlot = (v: unknown): v is GearSlot => (GEAR_SLOTS as readonly unknown[]).includes(v);

function readCombo(r: Reader, v: unknown, path: string): Combo | null {
  const o = r.object(v, path);
  if (!o) return null;
  const keys = r.string(o.keys, `${path}.keys`);
  if (![...keys].every((k) => (COMBO_KEYS as readonly string[]).includes(k)))
    r.fail(`${path}.keys`, `must be made of ${COMBO_KEYS.join('')}`);
  if (/(.)\1/.test(keys)) r.fail(`${path}.keys`, 'repeats a direction (the reader ignores a repeated tap)');
  if (keys.length < 4) r.fail(`${path}.keys`, 'must be at least four taps');
  if (!(SPELL_IDS as readonly unknown[]).includes(o.spell))
    r.fail(`${path}.spell`, `must be a spell (${SPELL_IDS.join(', ')})`);
  const combo: Combo = {
    keys,
    spell: o.spell as SpellId,
    cost: r.number(o.cost, `${path}.cost`, 1),
    power: r.number(o.power, `${path}.power`, 0),
  };
  const count = r.optionalNumber(o.count, `${path}.count`, 1);
  if (count !== undefined) combo.count = count;
  return combo;
}

function readItem(r: Reader, v: unknown, path: string): Item | null {
  const o = r.object(v, path);
  if (!o) return null;
  const known = new Set<string>([
    ...ITEM_NUMBERS,
    'name',
    'slot',
    'rare',
    'waters',
    'ranged',
    'focus',
    'use',
    'capacity',
    'art',
    'look',
    'gem',
  ]);
  for (const key of Object.keys(o)) if (!known.has(key)) r.fail(`${path}.${key}`, 'is not a field of an item');
  const item: Item = { name: r.string(o.name, `${path}.name`) };
  for (const key of ITEM_NUMBERS) {
    const n = r.optionalNumber(o[key], `${path}.${key}`, key === 'value' ? 0 : -Infinity);
    if (n !== undefined) item[key] = n;
  }
  if (o.slot !== undefined) {
    if (isSlot(o.slot)) item.slot = o.slot;
    else r.fail(`${path}.slot`, `must be a gear slot (${GEAR_SLOTS.join(', ')})`);
  }
  if (o.rare !== undefined) item.rare = o.rare === true;
  if (o.waters !== undefined) item.waters = o.waters === true;
  if (o.look !== undefined) {
    const look = r.object(o.look, `${path}.look`) ?? {};
    item.look = {};
    for (const [slot, part] of Object.entries(look)) {
      if (!(SLOTS as readonly string[]).includes(slot))
        r.fail(`${path}.look.${slot}`, `is not a slot (${SLOTS.join(', ')})`);
      else item.look[slot as (typeof SLOTS)[number]] = r.string(part, `${path}.look.${slot}`);
    }
  }
  if (o.ranged !== undefined) {
    const g = r.object(o.ranged, `${path}.ranged`) ?? {};
    item.ranged = {
      speed: r.number(g.speed, `${path}.ranged.speed`, 1),
      range: r.number(g.range, `${path}.ranged.range`, 1),
      cooldown: r.number(g.cooldown, `${path}.ranged.cooldown`, 0.05),
    };
  }
  if (o.focus !== undefined) {
    const f = r.object(o.focus, `${path}.focus`) ?? {};
    if (f.kind !== 'wand' && f.kind !== 'tome') r.fail(`${path}.focus.kind`, 'must be "wand" or "tome"');
    const combos = r
      .array(f.combos, `${path}.focus.combos`)
      .flatMap((c, i) => readCombo(r, c, `${path}.focus.combos[${i}]`) ?? []);
    // The reader fires the first combo the typed taps end with, so one hidden inside another (or a skill's) never casts.
    const all = [...combos.map((c) => c.keys), ...SKILL_IDS.map((id) => SKILLS[id].keys)];
    combos.forEach((c, i) => {
      for (const other of all)
        if (other !== c.keys && other.includes(c.keys))
          r.fail(`${path}.focus.combos[${i}].keys`, `is inside "${other}"`);
        else if (other !== c.keys && c.keys.includes(other))
          r.fail(`${path}.focus.combos[${i}].keys`, `holds "${other}"`);
    });
    item.focus = {
      kind: f.kind === 'tome' ? 'tome' : 'wand',
      power: r.number(f.power, `${path}.focus.power`, 0),
      cooldown: r.number(f.cooldown, `${path}.focus.cooldown`, 0.05),
      combos,
    };
  }
  if (o.use !== undefined) {
    const u = r.object(o.use, `${path}.use`) ?? {};
    item.use = { hp: r.number(u.hp ?? 0, `${path}.use.hp`, 0) };
    for (const key of ['mp', 'food', 'water'] as const) {
      const n = r.optionalNumber(u[key], `${path}.use.${key}`, 0);
      if (n !== undefined) item.use[key] = n;
    }
  }
  const capacity = r.optionalNumber(o.capacity, `${path}.capacity`, 1);
  if (capacity !== undefined) item.capacity = capacity;
  if (o.gem !== undefined) {
    const g = r.object(o.gem, `${path}.gem`) ?? {};
    const bonus = (v: unknown, at: string): Bonus => {
      const b = r.object(v, at) ?? {};
      const out: Bonus = {};
      for (const [key, n] of Object.entries(b))
        if (!(BONUS_KEYS as readonly string[]).includes(key))
          r.fail(`${at}.${key}`, `is not something a gem adds (${BONUS_KEYS.join(', ')})`);
        else out[key as BonusKey] = r.number(n, `${at}.${key}`, 0.01);
      return out;
    };
    item.gem = { arms: bonus(g.arms, `${path}.gem.arms`), worn: bonus(g.worn, `${path}.gem.worn`) };
    for (const side of ['arms', 'worn'] as const)
      if (!Object.keys(item.gem[side]).length) r.fail(`${path}.gem.${side}`, 'must add something');
    if (item.slot !== undefined || item.use) r.fail(`${path}.gem`, 'a gem is kept in the pack: no `slot` and no `use`');
  }
  if (item.slot === undefined && !item.use && !item.gem)
    r.fail(path, 'needs a gear `slot`, a `use` (a supply) or a `gem`');
  if (item.slot !== undefined && item.use) r.fail(path, 'is worn (`slot`) or used (`use`), not both');
  if (item.slot !== undefined && !item.look) item.look = {};
  if ((item.ranged || item.focus) && item.slot !== 'weapon') r.fail(path, 'a bow, wand or tome is a weapon');
  if (item.ranged && item.focus) r.fail(path, 'is a bow or a wand/tome, not both');
  if (item.capacity !== undefined && item.slot !== 'bag') r.fail(`${path}.capacity`, 'only a bag has capacity');
  const art = r.optionalNumber(o.art, `${path}.art`, 0);
  if (art !== undefined) {
    const kind = iconKind(item);
    if (!Number.isInteger(art) || art >= ITEM_VARIANTS[kind])
      r.fail(`${path}.art`, `must be a whole number below ${ITEM_VARIANTS[kind]} (the pictures of a "${kind}" icon)`);
    else item.art = art;
  }
  return item;
}

function readLoot(r: Reader, v: unknown, path: string): LootDef | null {
  const o = r.object(v, path);
  if (!o) return null;
  if (o.item !== undefined) return { item: r.string(o.item, `${path}.item`) };
  if (o.gold !== undefined) return { gold: r.number(o.gold, `${path}.gold`, 1) };
  if (o.xp !== undefined) return { xp: r.number(o.xp, `${path}.xp`, 1) };
  if (o.hp !== undefined) {
    const loot: { hp: number; mp?: number } = { hp: r.number(o.hp, `${path}.hp`, 0) };
    const mp = r.optionalNumber(o.mp, `${path}.mp`, 0);
    if (mp !== undefined) loot.mp = mp;
    return loot;
  }
  r.fail(path, 'needs "item", "gold", "xp" or "hp"');
  return null;
}

/** Read items.json: the starting gear, the items (their order is their network codes), the shops and the loots. */
export function parseItems(json: unknown, r = new Reader()): ItemContent {
  const out: ItemContent = { start: { weapon: '' }, items: {}, shops: {}, loots: {} };
  const file = r.object(json, 'items.json');
  if (!file) return out;
  r.version(file, 'items.json');
  const start = r.object(file.start, 'items.json.start') ?? {};
  for (const [slot, id] of Object.entries(start)) {
    if (!isSlot(slot)) r.fail(`items.json.start.${slot}`, `is not a gear slot (${GEAR_SLOTS.join(', ')})`);
    else out.start[slot] = r.string(id, `items.json.start.${slot}`);
  }
  if (!out.start.weapon) r.fail('items.json.start.weapon', 'a hero always starts with a weapon');
  for (const [id, v] of Object.entries(r.object(file.items, 'items.json.items') ?? {})) {
    if (id.includes('+'))
      r.fail(`items.${id}`, 'an item id cannot hold "+" (that joins the ids of a piece and its gem)');
    const item = readItem(r, v, `items.${id}`);
    if (item) out.items[id] = item;
  }
  for (const [id, v] of Object.entries(r.object(file.shops ?? {}, 'items.json.shops') ?? {})) {
    const p = `shops.${id}`;
    const o = r.object(v, p);
    if (!o) continue;
    if (id.length > MAX_SHOP_ID) r.fail(p, `the id is longer than ${MAX_SHOP_ID} characters`);
    const buys = r.strings(o.buys, `${p}.buys`);
    buys.forEach((b, i) => {
      if (!isSlot(b) && !(TRADE_KINDS as readonly string[]).includes(b))
        r.fail(`${p}.buys[${i}]`, `must be a gear slot or ${TRADE_KINDS.join(', ')}`);
    });
    out.shops[id] = {
      id,
      name: r.string(o.name, `${p}.name`),
      tag: r.string(o.tag, `${p}.tag`),
      keeper: r.string(o.keeper, `${p}.keeper`),
      greeting: r.strings(o.greeting, `${p}.greeting`),
      stock: r.strings(o.stock, `${p}.stock`),
      buys,
    };
  }
  for (const [id, v] of Object.entries(r.object(file.loots ?? {}, 'items.json.loots') ?? {})) {
    const loot = readLoot(r, v, `loots.${id}`);
    if (loot) out.loots[id] = loot;
  }
  return out;
}

/** The checks of items.json against itself and the other files: every item named exists and fits where it is named. */
function checkItems(r: Reader, c: Content) {
  const { items, shops, loots, start } = c.items;
  const has = (id: string) => items[id] !== undefined;
  for (const [slot, id] of Object.entries(start)) {
    const item = items[id];
    if (!item) r.fail(`items.json.start.${slot}`, `"${id}" is not an item`);
    else if (item.slot !== slot) r.fail(`items.json.start.${slot}`, `"${id}" is not worn there`);
  }
  for (const [id, shop] of Object.entries(shops)) {
    if (c.entities[shop.keeper]?.type !== 'npc')
      r.fail(`shops.${id}.keeper`, `"${shop.keeper}" is not an npc in entities.json`);
    shop.stock.forEach((s, i) => {
      if (!has(s)) r.fail(`shops.${id}.stock[${i}]`, `"${s}" is not an item`);
      else if (items[s]!.rare) r.fail(`shops.${id}.stock[${i}]`, `"${s}" is rare: no shop sells it`);
    });
  }
  for (const [id, loot] of Object.entries(loots))
    if ('item' in loot && !has(loot.item)) r.fail(`loots.${id}.item`, `"${loot.item}" is not an item`);
  for (const quest of c.quests.quests) {
    const p = `quests.${quest.id}`;
    const o = quest.objective;
    if (o.t === 'bring' && !has(o.item)) r.fail(`${p}.objective.item`, `"${o.item}" is not an item in items.json`);
    (quest.reward.items ?? []).forEach((id, i) => {
      if (!has(id)) r.fail(`${p}.reward.items[${i}]`, `"${id}" is not an item in items.json`);
    });
  }
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
  const maps = new Set(Object.values(c.biomes).map((b) => b.map));
  for (const [type, b] of Object.entries(c.biomes))
    b.links.forEach((to, i) => {
      if (!maps.has(to)) r.fail(`biomes.${type}.links[${i}]`, `"${to}" is not the map of any biome`);
    });
  // A port binding goes both ways: a port leading to another map's port is led back to by it.
  const byMap = new Map(Object.values(c.biomes).map((b) => [b.map, b]));
  for (const [type, b] of Object.entries(c.biomes))
    for (const [name, to] of Object.entries(b.ports)) {
      const there = byMap.get(to.map);
      if (!there) r.fail(`biomes.${type}.ports.${name}`, `"${to.map}" is not the map of any biome`);
      else if (there.ports[to.port]?.map !== b.map || there.ports[to.port]?.port !== name)
        r.fail(`biomes.${type}.ports.${name}`, `${to.map}'s port "${to.port}" does not lead back to it`);
    }
  const q = c.quests;
  if (q.giver && !q.givers[q.giver]) r.fail('quests.json.giver', `"${q.giver}" is not in givers`);
  for (const [id, g] of Object.entries(q.givers)) {
    if (c.entities[g.look]?.type !== 'npc') r.fail(`givers.${id}.look`, `"${g.look}" is not an npc in entities.json`);
    if (!maps.has(g.zone)) r.fail(`givers.${id}.zone`, `"${g.zone}" is not the map of any biome`);
  }
  // A saga's step that names its task outright names this campaign's own content: it must exist.
  for (const epic of c.epics)
    epic.steps.forEach((step, i) => {
      const o = step.objective;
      const p = `epics.${epic.id}.steps[${i}].objective`;
      if (!o) return;
      if (!maps.has(o.zone)) r.fail(`${p}.zone`, `"${o.zone}" is not the map of any biome`);
      if (o.t === 'kill' && !mob(o.kind)) r.fail(`${p}.kind`, `"${o.kind}" is not a mob in entities.json`);
      if (o.t === 'gather' && !q.sites[o.site]) r.fail(`${p}.site`, `"${o.site}" is not in sites`);
    });
  const ids = new Set<string>();
  q.quests.forEach((quest) => {
    const p = `quests.${quest.id}`;
    if (ids.has(quest.id)) r.fail(p, 'id is used twice');
    ids.add(quest.id);
    if (!q.chapters[quest.chapter]) r.fail(`${p}.chapter`, `no chapter ${quest.chapter}`);
    for (const z of quest.where.zones)
      if (!maps.has(z)) r.fail(`${p}.where.zones`, `"${z}" is not the map of any biome`);
    if (quest.where.door && !maps.has(quest.where.door))
      r.fail(`${p}.where.door`, `"${quest.where.door}" is not the map of any biome`);
    const o = quest.objective;
    if (o.t === 'kill' && !mob(o.kind)) r.fail(`${p}.objective.kind`, `"${o.kind}" is not a mob in entities.json`);
    if (o.t === 'boss' && !c.entities[o.boss]?.boss)
      r.fail(`${p}.objective.boss`, `"${o.boss}" is not a mob with "boss": true in entities.json`);
    if (o.t === 'boss' && !maps.has(o.zone)) r.fail(`${p}.objective.zone`, `"${o.zone}" is not the map of any biome`);
    if ((o.t === 'kill' || o.t === 'gather' || o.t === 'cast') && o.zone !== undefined && !maps.has(o.zone))
      r.fail(`${p}.objective.zone`, `"${o.zone}" is not the map of any biome`);
    if (o.t === 'gather' && !q.sites[o.site]) r.fail(`${p}.objective.site`, `"${o.site}" is not in sites`);
    if ((o.t === 'visit' || o.t === 'haul') && !maps.has(o.zone))
      r.fail(`${p}.objective.zone`, `"${o.zone}" is not the map of any biome`);
    for (const key of ['giver', 'turnIn'] as const) {
      const who = quest[key];
      if (who !== undefined && !q.givers[who]) r.fail(`${p}.${key}`, `"${who}" is not in givers`);
    }
    if (o.t === 'meet' && !quest.turnIn) r.fail(`${p}.turnIn`, 'a "meet" quest must say who is to be met (turnIn)');
  });
  checkItems(r, c);
  checkAgainstCapabilities(r, c);
  if (c.scenarios.start && !c.scenarios.nodes.has(c.scenarios.start))
    r.fail('scenarios.json.start', `no node "${c.scenarios.start}"`);
  for (const node of c.scenarios.nodes.values()) {
    const path = `nodes.${node.node_id}`;
    if (!c.biomes[node.biome_type]) r.fail(`${path}.biome_type`, `"${node.biome_type}" is not in biomes.json`);
    node.entities.forEach((p, i) => {
      if (!c.entities[p.entity]) r.fail(`${path}.entities[${i}]`, `"${p.entity}" is not in entities.json`);
    });
    node.cast?.forEach((p, i) => {
      if (!c.entities[p.entity]) r.fail(`${path}.cast[${i}]`, `"${p.entity}" is not in entities.json`);
    });
    node.choices.forEach((choice, i) => {
      if (!c.scenarios.nodes.has(choice.next)) r.fail(`${path}.choices[${i}].next`, `no node "${choice.next}"`);
      const req = choice.requires;
      if (req && 'skill' in req && !(SKILL_IDS as readonly string[]).includes(req.skill))
        r.fail(`${path}.choices[${i}].requires.skill`, `"${req.skill}" is not a skill (${SKILL_IDS.join(', ')})`);
    });
  }
}

/**
 * Content that asks for what its own capabilities switch off: a choice needing a skill in a campaign without skills,
 * a quest that wants or pays food or water where nobody hungers, or a crop's produce where nothing is farmed.
 */
function checkAgainstCapabilities(r: Reader, c: Content) {
  const caps = capabilityTable(c);
  // a quest that switches food and water or farming on makes the goods it names fair, wherever it is told
  const quest = (id: Dial) => c.quests.quests.some((q) => q.capabilities?.[id] === true);
  const produce = new Set<string>(Object.values(CROPS).map((crop) => crop.item));
  const why = (id: string): string | null => {
    const item = c.items.items[id];
    if (!caps.anywhere('needs') && !quest('needs') && item && onlyFeeds(item))
      return `"${id}" only feeds, and this campaign has no food and water (capabilities.needs)`;
    if (!caps.anywhere('farming') && !quest('farming') && produce.has(id))
      return `"${id}" only grows on a farm, and this campaign has no farming (capabilities.farming)`;
    if (!caps.anywhere('forge') && item && isGem(item))
      return `"${id}" is a gem, and this campaign cannot set gems (capabilities.forge)`;
    return null;
  };
  const gemWhy = (id: string): string | null => {
    const item = c.items.items[id];
    return item && isGem(item) ? why(id) : null;
  };
  for (const [id, shop] of Object.entries(c.items.shops))
    shop.stock.forEach((s, i) => {
      const bad = gemWhy(s);
      if (bad) r.fail(`shops.${id}.stock[${i}]`, bad);
    });
  for (const [id, loot] of Object.entries(c.items.loots)) {
    const bad = 'item' in loot ? gemWhy(loot.item) : null;
    if (bad) r.fail(`loots.${id}.item`, bad);
  }
  for (const quest of c.quests.quests) {
    const p = `quests.${quest.id}`;
    const o = quest.objective;
    const wanted = o.t === 'bring' ? why(o.item) : null;
    if (wanted) r.fail(`${p}.objective.item`, wanted);
    // a quest of spells or barrels needs the system it is about, where it is set (or anywhere, for spells cast anywhere)
    const needs = o.t === 'cast' ? 'combos' : o.t === 'haul' ? 'carrying' : null;
    const zone = o.t === 'cast' || o.t === 'haul' ? o.zone : undefined;
    if (needs && !(zone ? caps.enabled(needs, zone) : caps.anywhere(needs)))
      r.fail(`${p}.objective.t`, `a "${o.t}" quest needs ${needs}, and it is off there (capabilities.${needs})`);
    for (const [i, item] of (quest.reward.items ?? []).entries()) {
      const paid = why(item);
      if (paid) r.fail(`${p}.reward.items[${i}]`, paid);
    }
  }
  if (!caps.anywhere('roaming'))
    for (const [id, def] of Object.entries(c.entities))
      if (def.roam !== undefined)
        r.fail(`entities.${id}.roam`, 'people stand still in this campaign (capabilities.roaming)');
  if (!caps.enabled('skills'))
    for (const node of c.scenarios.nodes.values())
      node.choices.forEach((choice, i) => {
        if (choice.requires && 'skill' in choice.requires)
          r.fail(
            `nodes.${node.node_id}.choices[${i}].requires`,
            'needs a skill, and this campaign has no skills (capabilities.skills)',
          );
      });
}

/** Read and check all the files. Throws a `ContentError` listing every problem. */
export function parseContent(files: Record<ContentFile, unknown>): Content {
  const r = new Reader();
  const story = splitStory(files.quests); // the epic form of quests.json, as the flat quests and the party epics
  for (const problem of story.problems) r.fail('quests.json', problem);
  const epics = parseEpics(story.epics);
  if (typeof epics === 'string') r.fail('quests.json.epics', epics);
  const content: Content = {
    entities: parseEntities(files.entities, r),
    biomes: parseBiomes(files.biomes, r),
    scenarios: parseScenarios(files.scenarios, r),
    quests: parseQuests(story.quests, r),
    epics: typeof epics === 'string' ? [] : epics,
    items: parseItems(files.items, r),
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
  if (def.boss) kind.named = true;
  if (def.death) kind.death = def.death;
  if (b.windup !== undefined) kind.windup = b.windup;
  if (b.recover !== undefined) kind.recover = b.recover;
  if (b.stagger !== undefined) kind.stagger = b.stagger;
  if (b.telegraph) {
    kind.telegraph = {};
    if (b.telegraph.color !== undefined) kind.telegraph.color = colorNumber(b.telegraph.color);
    if (b.telegraph.ground !== undefined) kind.telegraph.ground = b.telegraph.ground;
  }
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
