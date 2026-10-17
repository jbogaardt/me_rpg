// A world built as it is played: a story arc's regions joined one step at a time, from a log of choices. Pixi-free and
// tested.
//
// The log is the world. Its first entry (`begin`) names the arc, the keeper who tells it and the hub it starts in; each
// `step` adds the story's next region, `side` a region beside the story (a side region or a dead end) and `join` a
// door between two regions that ended up side by side; the DM's `cast`, `npc`, `voice` and `sign` entries bring in and
// speak for people and rewrite signposts (`signOverride`). Every entry is fully resolved (the region, the ports, the
// pairing crossed and the mob picked for each foe role), so replaying a log needs no random numbers and gives the same
// world in every browser and in every later version of the solver. `apply` checks an entry against the packs' rules
// (pairings, ports on opposite edges, a free grid cell whose neighbours all pair with it, the arc's slots) before
// taking it, so no log can make a broken world.
//
// Who writes the log: `assemble` (packs.ts) writes a whole random world at once, as an automatic Dungeon Master; a
// live world (`?campaign=live`) is written during play by its Dungeon Master, who chooses the story and leaves the maps
// to the solver: `options()` offers the next step as story cues (the kind of land, the kind of crossing), only those
// after which the rest of the arc can still be told, and `choose(cue)` picks a region and ports that fit. `files()`
// writes the campaign as it stands, so the engine and every check see an ordinary campaign: a story not yet finished
// carries the quests whose regions are already placed.

import { CONTENT_VERSION, type ContentFile } from './schema';
import type { PortBinding } from './ports';
import { depthBand } from './depth';
import {
  AssemblyError,
  arcNeeds,
  candidates,
  checkPacks,
  eligibleFor,
  Grid,
  keepersFor,
  mergePacks,
  nextPlacements,
  OPPOSITE,
  pairedPort,
  pairingsBetween,
  partnersOf,
  rng,
  roomMaps,
  roomsOf,
  STEP,
  storyFor,
  type ArcDef,
  type Catalog,
  type RegionDef,
  type Assembly,
  MAX_SIDE_REGIONS,
  type Pack,
  entityJson,
  goodsFile,
  type Placement,
  type Side,
  type Story,
} from './packs';

/** One entry of a world's log (see the top of the file). `foes` is the mob picked for each foe role of the region. */
export type LogEntry =
  | { t: 'begin'; arc: string; keeper: string; region: string; foes: Record<string, string> }
  | { t: 'step'; region: string; pairing: string; from: string; to: string; foes: Record<string, string> }
  | {
      t: 'side';
      region: string;
      host: string;
      pairing: string;
      from: string;
      to: string;
      foes: Record<string, string>;
    }
  | { t: 'join'; a: string; b: string; portA: string; portB: string; pairing: string }
  /** The Dungeon Master brought someone into a region: a foe or a person, standing on a cell of its map. */
  | { t: 'cast'; region: string; entity: string; x: number; y: number }
  /** The Dungeon Master made a new person: their name, the look of an npc of the packs they wear, and what they say. */
  | { t: 'npc'; id: string; name: string; look: string; lines: string[] }
  /** The Dungeon Master's person now says something else (the tale moved on): their new lines, replacing the old. */
  | { t: 'voice'; id: string; lines: string[] }
  /**
   * The Dungeon Master rewrote the signpost standing at map cell (col, row) of a region: it now says `lines` (a page
   * each) instead of what the layout gives. Empty `lines` restore it (the log only grows: the later entry wins).
   */
  | { t: 'sign'; region: string; col: number; row: number; lines: string[] };

/** What a Dungeon Master may make: an id of their own kind, a short name, and a few lines to say. */
export const NPC_ID = /^dm_[a-z0-9_]{1,24}$/;
export const MAX_NPC_NAME = 32;
/** What makes two names the same person: case and spacing do not. */
export const personKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();
export const MAX_NPC_LINES = 4;
export const MAX_NPC_LINE = 140;
/** The largest map cell a cast may stand on. */
const MAX_CELL = 1023;

/** Who a Dungeon Master may bring into a region: its foes (and the packs' other mobs of its themes) and people. */
export interface Castable {
  foes: { id: string; name: string; role?: string }[];
  people: { id: string; name: string }[];
}

/** A next step of the story as its Dungeon Master is offered it: what kind of land, over what kind of crossing. */
export interface StoryOption {
  /** Stable while the world does not change: what `choose` is given. */
  cue: string;
  /** "Into frost, over a thaw crossing". */
  label: string;
  theme: string;
  tags: string[];
}

/** A log that cannot be applied: what is wrong with it. */
/** How many side lands a live world opens with beside its start and its town (`World.wanderEntry`). */
export const WANDER_LANDS = 2;

export class WorldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldError';
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How far into an arc's story a value reaches: the highest region it names (r1 = 1), from `@r2.boss`, `{r2}`, `"r1~r2"`... */
function reach(value: unknown): number {
  let most = 0;
  for (const m of JSON.stringify(value ?? null).matchAll(/(?<![\w])r(\d+)(?=[.~}"])/g))
    most = Math.max(most, Number(m[1]));
  return most;
}

export class World {
  readonly cat: Catalog;
  readonly log: LogEntry[] = [];
  private arcId = '';
  private keeperId = '';
  private story: Story;
  /** Regions beside the story, in the order they came. */
  private sides: string[] = [];
  private foes: Record<string, Record<string, string>> = {};
  /** How far each region lies from the start along the chain (the start 0, a side land one deeper than its host). */
  private depths = new Map<string, number>();
  private bindings = new Map<string, Record<string, PortBinding>>();
  /** The pairing at each joint: `r1~r2` along the story, `<a>~<b>` elsewhere. */
  private joints: Record<string, string> = {};
  private eligible: Set<string>[] = [];
  /** Who the Dungeon Master cast into each region, in order. */
  private cast = new Map<string, { entity: string; x: number; y: number }[]>();
  /** The people the Dungeon Master made, by id. */
  private people: Record<string, { name: string; look: string; lines: string[] }> = {};
  /** What the Dungeon Master wrote on signposts, by region then cell: replacing what the layout says. */
  private signText = new Map<string, Map<string, string[]>>();
  /**
   * Which signs stand on a region's map (by the map's name), when this page knows: the game sets it from the zones it has
   * loaded. `undefined` means unknown, which accepts the entry (the host checked it where the map was loaded, and maps
   * are the same everywhere), so replaying a log with no maps in hand (tests, tools) still works.
   */
  signsOf: (map: string) => readonly { col: number; row: number }[] | undefined = () => undefined;

  /** `seed` names the world (its roamers' placings, the solver's picks); `packs` are what it is built from. */
  constructor(
    readonly seed: number,
    packs: readonly Pack[] | Catalog,
  ) {
    this.cat = Array.isArray(packs) ? mergePacks(packs) : (packs as Catalog);
    const problems = checkPacks(this.cat);
    if (problems.length) throw new AssemblyError(problems.join('; '));
    this.story = { regions: [], crossings: [], joints: [], grid: new Grid(this.cat) };
  }

  get begun(): boolean {
    return this.arcId !== '';
  }
  get arc(): ArcDef | undefined {
    return this.cat.arcs[this.arcId];
  }
  get arcName(): string {
    return this.arcId;
  }
  get keeper(): string {
    return this.keeperId;
  }
  /** The story's regions placed so far, r1 first. */
  get storyRegions(): readonly string[] {
    return this.story.regions;
  }
  /** Every region in the world: the story's, then the others. */
  get regions(): string[] {
    return [...this.story.regions, ...this.sides];
  }
  /** Has the story reached its last region? */
  get complete(): boolean {
    const arc = this.arc;
    return !!arc && this.story.regions.length === arc.regions;
  }
  get layout(): Record<string, [number, number]> {
    return Object.fromEntries(this.regions.map((id) => [id, this.story.grid.at.get(id)!]));
  }
  get crossings(): Record<string, string> {
    return { ...this.joints };
  }
  get foesByRegion(): Record<string, Record<string, string>> {
    return this.foes;
  }
  /** How many regions lie between the start and `region` along the chain (0 for the start and for regions not in the world). */
  depthOf(region: string): number {
    return this.depths.get(region) ?? 0;
  }

  /** The arcs that can be told from the packs (their whole story fits somewhere), sorted. */
  tellableArcs(): string[] {
    return Object.keys(this.cat.arcs)
      .sort()
      .filter((id) => storyFor(this.cat, this.cat.arcs[id]!, rng(this.seed)) !== null);
  }

  /**
   * The first entry of a world telling `arcId` (default: one the seed picks among those that can be told): a hub its
   * story can be told from, and a keeper at home there. Not applied.
   */
  beginning(arcId?: string): LogEntry {
    const rand = rng(this.seed);
    const arcs = arcId ? [arcId] : this.tellableArcs();
    const id = arcs[Math.floor(rand() * arcs.length)];
    const arc = id ? this.cat.arcs[id] : undefined;
    if (!id || !arc) throw new WorldError(arcId ? `no arc "${arcId}"` : 'no story arc can be told with these packs');
    const story = storyFor(this.cat, arc, rand);
    if (!story) throw new WorldError(`arc "${id}" cannot be told with these packs`);
    const region = story.regions[0]!;
    const keepers = keepersFor(this.cat, arc, region);
    const keeper = keepers[Math.floor(rand() * keepers.length)]!;
    return { t: 'begin', arc: id, keeper, region, foes: this.foesFor(region, 0, rand, arc) };
  }

  /** Apply one entry, or throw a `WorldError` saying why it does not fit (the world is then unchanged). */
  apply(e: LogEntry) {
    if (e.t === 'begin') this.applyBegin(e);
    else if (!this.begun) throw new WorldError('the log must begin with "begin"');
    else if (e.t === 'step') this.applyStep(e);
    else if (e.t === 'side') this.applySide(e);
    else if (e.t === 'join') this.applyJoin(e);
    else if (e.t === 'cast') this.applyCast(e);
    else if (e.t === 'npc') this.applyNpc(e);
    else if (e.t === 'sign') this.applySign(e);
    else this.applyVoice(e);
    this.log.push(e);
  }

  /** Apply a whole log (from an empty world). */
  replay(log: readonly LogEntry[]) {
    for (const e of log) this.apply(e);
  }

  /**
   * The story's next step, as cues for its Dungeon Master: each a kind of land and of crossing that some region fits,
   * and after which the rest of the arc can still be told. Empty when the story is complete (or not begun).
   */
  options(): StoryOption[] {
    const arc = this.arc;
    if (!arc || this.complete) return [];
    const byCue = new Map<string, { option: StoryOption; placements: Placement[] }>();
    for (const p of nextPlacements(this.cat, arc, this.story, this.eligible)) {
      const option = this.cueOf(p);
      const group = byCue.get(option.cue) ?? byCue.set(option.cue, { option, placements: [] }).get(option.cue)!;
      group.placements.push(p);
    }
    return [...byCue.values()]
      .filter((g) => g.placements.some((p) => this.leavesStory(p)))
      .map((g) => g.option)
      .sort((a, b) => a.cue.localeCompare(b.cue));
  }

  /** The step for cue `cue` (from `options`): a region, pairing and ports that fit it, and its foes. Not applied. */
  choose(cue: string): LogEntry {
    const arc = this.arc;
    if (!arc || this.complete) throw new WorldError('the story has no next step');
    const i = this.story.regions.length;
    const rand = rng(this.seed * 31 + i);
    const fits = nextPlacements(this.cat, arc, this.story, this.eligible).filter((p) => this.cueOf(p).cue === cue);
    for (const p of shuffle(rand, fits))
      if (this.leavesStory(p))
        return {
          t: 'step',
          region: p.region,
          pairing: p.pairing,
          from: p.from,
          to: p.to,
          foes: this.foesFor(p.region, i, rand),
        };
    throw new WorldError(`no region fits "${cue}" any more`);
  }

  /** The step of `story` (a whole story found by the search) that comes next: for an automatic Dungeon Master. */
  stepFrom(story: Story, rand: () => number): LogEntry {
    const i = this.story.regions.length;
    const region = story.regions[i];
    const pairing = story.crossings[i - 1];
    const joint = story.joints[i - 1];
    if (!region || !pairing || !joint) throw new WorldError('that story has no next step');
    return { t: 'step', region, pairing, from: joint[0], to: joint[1], foes: this.foesFor(region, i, rand) };
  }

  /**
   * A region beside the world (a side region, or a dead end when `deadEnd`) through a pairing with one already in it,
   * if one has room: for an automatic Dungeon Master (a live world keeps its open ports for the story). Not applied.
   */
  sideEntry(rand: () => number, deadEnd = false): LogEntry | null {
    const near = [...new Set(this.regions.flatMap((id) => partnersOf(this.cat, id)))]
      .filter(
        (id) =>
          !this.story.grid.at.has(id) &&
          !this.cat.regions[id]!.hub &&
          !this.cat.regions[id]!.haven &&
          !!this.cat.regions[id]!.terminal === deadEnd,
      )
      .sort();
    const pickFrom = deadEnd ? shuffle(rand, near) : near.length ? [near[Math.floor(rand() * near.length)]!] : [];
    for (const id of pickFrom) {
      const ways = this.regions.flatMap((host) =>
        pairingsBetween(this.cat, host, id).flatMap((pairing) =>
          this.story.grid.ways(host, id, pairing).map((w) => ({ ...w, host, pairing })),
        ),
      );
      if (!ways.length) continue;
      const w = ways[Math.floor(rand() * ways.length)]!;
      return {
        t: 'side',
        region: id,
        host: w.host,
        pairing: w.pairing,
        from: w.from,
        to: w.to,
        foes: this.foesFor(id, -1, rand),
      };
    }
    return null;
  }

  /**
   * A safe harbour (a `haven` region: a town with no foes) beside the land the story starts in, by a pairing between
   * them, placed only where the story can still be told around it (or is already told). Null when no haven pairs with
   * the start, or none fits. Not applied. Live and random worlds both take one, so most games have a town to come home to.
   */
  havenEntry(rand: () => number): LogEntry | null {
    const host = this.story.regions[0];
    if (!host || this.regions.some((id) => this.cat.regions[id]!.haven)) return null;
    return this.besideEntry(rand, [host], (r) => !!r.haven);
  }

  /**
   * A land beside the world for a live world to wander in, off the story (a side region: neither hub, haven nor dead
   * end), next to the start or the town, placed only where the story can still be told around it. Not applied.
   */
  wanderEntry(rand: () => number): LogEntry | null {
    const hosts = this.regions.filter((id) => id === this.story.regions[0] || this.cat.regions[id]!.haven);
    return this.besideEntry(rand, hosts, (r) => !r.hub && !r.haven && !r.terminal);
  }

  /** A region `fits` beside one of `hosts` by a pairing, where the story can still be told around it. */
  private besideEntry(rand: () => number, hosts: string[], fits: (r: RegionDef) => boolean): LogEntry | null {
    const arc = this.arc;
    if (!arc) return null;
    for (const host of hosts) {
      const near = partnersOf(this.cat, host)
        .filter((id) => fits(this.cat.regions[id]!) && !this.story.grid.at.has(id))
        .sort();
      for (const id of shuffle(rand, near)) {
        const ways = pairingsBetween(this.cat, host, id).flatMap((pairing) =>
          this.story.grid.ways(host, id, pairing).map((w) => ({ ...w, pairing })),
        );
        for (const w of shuffle(rand, ways)) {
          const grid = this.story.grid.clone();
          grid.place(id, w.x, w.y);
          grid.use(host, w.from);
          grid.use(id, w.to);
          if (this.complete || storyFor(this.cat, arc, rng(this.seed), { ...this.story, grid }) !== null)
            return {
              t: 'side',
              region: id,
              host,
              pairing: w.pairing,
              from: w.from,
              to: w.to,
              foes: this.foesFor(id, -1, rand),
            };
        }
      }
    }
    return null;
  }

  /** The doors between regions that ended up side by side and could be joined (both have a facing port and a pairing). */
  joinEntries(): LogEntry[] {
    const out: LogEntry[] = [];
    const grid = this.story.grid;
    const used = new Set<string>();
    for (const a of this.regions)
      for (const b of this.regions) {
        if (a >= b || this.joints[`${a}~${b}`] || this.joints[`${b}~${a}`]) continue;
        const [ax, ay] = grid.at.get(a)!;
        const [bx, by] = grid.at.get(b)!;
        const side = (Object.entries(STEP) as [Side, [number, number]][]).find(
          ([, [dx, dy]]) => ax + dx === bx && ay + dy === by,
        )?.[0];
        if (!side) continue;
        const portA = grid.free.get(a)!.find((p) => this.cat.regions[a]!.ports[p] === side && !used.has(`${a}.${p}`));
        const portB = grid.free
          .get(b)!
          .find((p) => this.cat.regions[b]!.ports[p] === OPPOSITE[side] && !used.has(`${b}.${p}`));
        if (!portA || !portB) continue;
        const pairing = pairingsBetween(this.cat, a, b).find((pid) => {
          const p = this.cat.pairings[pid]!;
          return [pairedPort(p, a) ?? portA, pairedPort(p, b) ?? portB].join() === [portA, portB].join();
        });
        if (!pairing) continue;
        used.add(`${a}.${portA}`).add(`${b}.${portB}`);
        out.push({ t: 'join', a, b, portA, portB, pairing });
      }
    return out;
  }

  /**
   * The arc's quests the world can tell so far: in story order, up to the first that names a region not yet placed (in
   * itself, its variants or its chapter's intro).
   */
  told(): { chapter?: number }[] {
    const arc = this.arc;
    if (!arc) return [];
    const placed = this.story.regions.length;
    const out: { chapter?: number }[] = [];
    for (const q of arc.quests as { chapter?: number }[]) {
      if (Math.max(reach(q), reach(arc.chapters[q.chapter ?? 0])) > placed) break;
      out.push(q);
    }
    return out;
  }

  /**
   * How a live world opens: its beginning (`arcId`, or one the seed picks), then as many story steps as it takes to
   * have something to tell (an arc whose first chapter already speaks of the road to region 2 needs region 2 placed),
   * each the first cue the solver offers. The Dungeon Master chooses every step after these. Applied.
   */
  open(arcId?: string): LogEntry[] {
    this.apply(this.beginning(arcId));
    const rand = rng(this.seed * 17);
    const haven = this.havenEntry(rand);
    if (haven) this.apply(haven);
    // A land or two to wander beside the start and the town, off the story, so the world is more than its road.
    for (let i = 0; i < WANDER_LANDS; i++) {
      const land = this.wanderEntry(rand);
      if (land) this.apply(land);
    }
    while (!this.complete && !this.told().length) {
      const first = this.options()[0];
      if (!first) throw new WorldError(`arc "${this.arcId}" cannot be told from here`);
      this.apply(this.choose(first.cue));
    }
    return [...this.log];
  }

  /** The campaign files of the world as it stands (schema.ts checks them like any campaign's). */
  files(): Record<ContentFile, unknown> {
    const arc = this.arc;
    if (!arc) throw new WorldError('the world has not begun');
    const { cat } = this;
    const story = this.story.regions;
    const keeper = cat.keepers[this.keeperId]!;
    const regions = this.regions;

    const used = new Set<string>([keeper.npc, ...Object.values(cat.shops).flatMap((s) => s.keeper ?? [])]);
    for (const id of regions) {
      for (const mob of Object.values(this.foes[id] ?? {})) used.add(mob);
      for (const e of cat.regions[id]!.encounters ?? []) if ('entity' in e) used.add(e.entity);
      for (const c of this.cast.get(id) ?? []) used.add(c.entity);
    }
    const entities: Record<string, unknown> = {};
    for (const id of [...used].sort()) {
      const person = this.people[id];
      if (person) {
        const look = cat.entities[person.look]!;
        entities[id] = { type: 'npc', name: person.name, sprite: look.sprite, lines: person.lines };
        continue;
      }
      const e = cat.entities[id];
      if (!e) throw new WorldError(`no entity "${id}" in any pack`);
      entities[id] = entityJson(e);
    }

    const biomes: Record<string, unknown> = {};
    const nodes: unknown[] = [];
    const sites: Record<string, unknown> = {};
    for (const id of regions) {
      const r = cat.regions[id]!;
      const foes = this.foes[id] ?? {};
      const ports = { ...(this.bindings.get(id) ?? {}) }; // a copy: later steps bind more of them
      const foeless = r.haven || (!r.roam.length && !(r.encounters ?? []).some((e) => 'role' in e));
      const depth = foeless ? undefined : depthBand(this.depthOf(id)); // the land's danger follows its distance from the start
      biomes[id] = {
        ...r.biome,
        ...(depth ? { levels: depth.levels } : {}),
        ...(r.capabilities ? { capabilities: r.capabilities } : {}),
        links: [...Object.values(ports).map((b) => b.map), ...roomMaps(r)],
        ports,
        generation: {
          roam: r.roam.map((rule) => ({
            kinds: [foes[rule.role] ?? rule.role],
            count: rule.count,
            seed: rule.seed + this.seed,
            apart: rule.apart ?? 8,
            avoid: rule.avoid ?? [],
            ...(depth ? { level: depth.level } : {}),
          })),
        },
      };
      nodes.push({
        node_id: id,
        biome_type: id,
        entities: (r.encounters ?? []).map((e) =>
          'entity' in e
            ? e
            : {
                entity: foes[e.role] ?? e.role,
                x: e.x,
                y: e.y,
                ...(depth ? { level: e.role === 'boss' ? depth.top : depth.level } : {}),
              },
        ),
        choices: [],
        ...(this.cast.get(id)?.length ? { cast: this.cast.get(id)!.map((c) => ({ ...c })) } : {}),
      });
      const rooms = roomsOf(r); // its shops and inns: a biome and node each, with nobody in them but the keeper
      Object.assign(biomes, rooms.biomes);
      nodes.push(...rooms.nodes);
      for (const [site, def] of Object.entries(r.sites ?? {})) {
        const { plural: _p, ...rest } = def;
        sites[site] = rest;
      }
    }

    // The story told so far: its quests up to the first that names a region not yet placed (with its chapter's), its
    // variants chosen and its roles filled in. The epilogue only once the story is complete.
    const quests = this.told();
    const lastChapter = Math.max(-1, ...quests.map((q) => q.chapter ?? 0));
    const chapters = this.complete ? arc.chapters : arc.chapters.slice(0, lastChapter + 1);

    const regionAt = (token: string) => {
      const m = /^r(\d+)$/.exec(token);
      const id = m && story[Number(m[1]) - 1];
      if (!id) throw new WorldError(`arc "${this.arcId}" names "${token}"`);
      return id;
    };
    const crossingOf = (a: string, b: string) => {
      const [i, j] = [Number(a.slice(1)), Number(b.slice(1))];
      const pairing = this.story.crossings[Math.min(i, j) - 1];
      if (!pairing) throw new WorldError(`arc "${this.arcId}" names "${a}~${b}"`);
      return pairing;
    };
    const matches = (when: Record<string, string>) =>
      Object.entries(when).every(([key, want]) => {
        if (key === 'keeper') return want === this.keeperId;
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
      return this.foes[region]![what] ?? '';
    };
    const text = (token: string): string => {
      const [head, what, form] = token.split('.');
      if (head === 'keeper') return what === 'tag' ? keeper.tag : keeper.name;
      const pair = /^(r\d+)~(r\d+)$/.exec(head!);
      if (pair) {
        const line = cat.pairings[crossingOf(pair[1]!, pair[2]!)]!.lore?.[what ?? ''];
        const seen = typeof line === 'string' ? line : line?.[regionAt(pair[1]!)];
        if (seen === undefined) throw new WorldError(`arc "${this.arcId}" quotes "${token}", which its pairing lacks`);
        return seen;
      }
      const region = regionAt(head!);
      if (!what) return cat.regions[region]!.biome.name;
      const thing =
        what === 'site' ? cat.regions[region]!.sites?.[siteOf(region)] : cat.entities[this.foes[region]![what] ?? ''];
      if (!thing) throw new WorldError(`arc "${this.arcId}" names "${token}", which region "${region}" does not have`);
      return named(thing, form);
    };
    const r1 = cat.regions[story[0]!]!;
    return {
      entities: { version: CONTENT_VERSION, entities },
      biomes: { version: CONTENT_VERSION, biomes },
      scenarios: { version: CONTENT_VERSION, start: story[0], capabilities: arc.capabilities ?? {}, nodes },
      items: goodsFile(cat, arc.start),
      quests: {
        version: CONTENT_VERSION,
        giver: 'keeper',
        givers: { keeper: { name: keeper.name, look: keeper.npc, tag: keeper.tag, zone: r1.biome.map } },
        sites,
        chapters: resolveArc(applyVariants(chapters, matches), ids, text),
        quests: resolveArc(applyVariants(quests, matches), ids, text),
        epilogue: this.complete ? resolveArc(arc.epilogue ?? [], ids, text) : [],
        welcome: resolveArc(arc.welcome ?? [], ids, text),
      },
    };
  }

  // --- applying ---

  private applyBegin(e: Extract<LogEntry, { t: 'begin' }>) {
    if (this.begun) throw new WorldError('the world has already begun');
    const arc = this.cat.arcs[e.arc];
    if (!arc) throw new WorldError(`no arc "${e.arc}"`);
    const eligible = eligibleFor(this.cat, arc);
    if (!eligible[0]?.has(e.region)) throw new WorldError(`"${e.region}" cannot begin arc "${e.arc}"`);
    if (!keepersFor(this.cat, arc, e.region).includes(e.keeper))
      throw new WorldError(`keeper "${e.keeper}" cannot tell arc "${e.arc}" from "${e.region}"`);
    this.checkFoes(e.region, 0, e.foes, arc);
    this.arcId = e.arc;
    this.keeperId = e.keeper;
    this.eligible = eligible;
    this.story.grid.place(e.region, 0, 0);
    this.story.regions.push(e.region);
    this.bindings.set(e.region, {});
    this.foes[e.region] = { ...e.foes };
    this.depths.set(e.region, 0);
  }

  private applyStep(e: Extract<LogEntry, { t: 'step' }>) {
    const arc = this.arc!;
    if (this.complete) throw new WorldError('the story is already complete');
    const i = this.story.regions.length;
    const fits = nextPlacements(this.cat, arc, this.story, this.eligible).some(
      (p) => p.region === e.region && p.pairing === e.pairing && p.from === e.from && p.to === e.to,
    );
    if (!fits) throw new WorldError(`"${e.region}" cannot be the story's region ${i + 1} that way`);
    this.checkFoes(e.region, i, e.foes, arc);
    const prev = this.story.regions[i - 1]!;
    const [x, y] = this.cellBy(prev, e.from);
    this.story.grid.place(e.region, x, y);
    this.story.grid.use(prev, e.from);
    this.story.grid.use(e.region, e.to);
    this.story.regions.push(e.region);
    this.story.crossings.push(e.pairing);
    this.story.joints.push([e.from, e.to]);
    this.bindings.set(e.region, {});
    this.bind(prev, e.region, e.from, e.to);
    this.joints[`r${i}~r${i + 1}`] = e.pairing;
    this.foes[e.region] = { ...e.foes };
    this.depths.set(e.region, i);
  }

  private applySide(e: Extract<LogEntry, { t: 'side' }>) {
    const { cat } = this;
    const grid = this.story.grid;
    if (!grid.at.has(e.host)) throw new WorldError(`"${e.host}" is not in the world`);
    if (grid.at.has(e.region) || !cat.regions[e.region] || cat.regions[e.region]!.hub)
      throw new WorldError(`"${e.region}" cannot stand beside the world`);
    if (!pairingsBetween(cat, e.host, e.region).includes(e.pairing))
      throw new WorldError(`pairing "${e.pairing}" does not join "${e.host}" and "${e.region}"`);
    const way = grid.ways(e.host, e.region, e.pairing).find((w) => w.from === e.from && w.to === e.to);
    if (!way) throw new WorldError(`"${e.region}" does not fit by port "${e.from}" of "${e.host}"`);
    this.checkFoes(e.region, -1, e.foes);
    grid.place(e.region, way.x, way.y);
    grid.use(e.host, e.from);
    grid.use(e.region, e.to);
    this.sides.push(e.region);
    this.bindings.set(e.region, {});
    this.bind(e.host, e.region, e.from, e.to);
    this.joints[`${e.host}~${e.region}`] = e.pairing;
    this.foes[e.region] = { ...e.foes };
    this.depths.set(e.region, this.depthOf(e.host) + 1);
  }

  private applyJoin(e: Extract<LogEntry, { t: 'join' }>) {
    const grid = this.story.grid;
    const [a, b] = [grid.at.get(e.a), grid.at.get(e.b)];
    if (!a || !b) throw new WorldError(`"${e.a}" and "${e.b}" are not both in the world`);
    const side = this.cat.regions[e.a]!.ports[e.portA];
    const facing = this.cat.regions[e.b]!.ports[e.portB];
    if (!side || facing !== OPPOSITE[side] || a[0] + STEP[side][0] !== b[0] || a[1] + STEP[side][1] !== b[1])
      throw new WorldError(`"${e.a}" and "${e.b}" do not face each other by those ports`);
    if (!grid.free.get(e.a)!.includes(e.portA) || !grid.free.get(e.b)!.includes(e.portB))
      throw new WorldError('a port of that join is already used');
    if (!pairingsBetween(this.cat, e.a, e.b).includes(e.pairing))
      throw new WorldError(`pairing "${e.pairing}" does not join "${e.a}" and "${e.b}"`);
    grid.use(e.a, e.portA);
    grid.use(e.b, e.portB);
    this.bind(e.a, e.b, e.portA, e.portB);
    this.joints[`${e.a}~${e.b}`] = e.pairing;
  }

  /** Who the Dungeon Master may bring into `region`: its foes and the packs' mobs of its themes, and people. */
  castable(region: string): Castable {
    const r = this.cat.regions[region];
    if (!r || !this.story.grid.at.has(region)) return { foes: [], people: [] };
    const own = this.foes[region] ?? {};
    const roleOf = new Map(Object.entries(own).map(([role, id]) => [id, role]));
    const foes = Object.entries(this.cat.entities)
      .filter(([id, e]) => e.type === 'mob' && (roleOf.has(id) || e.tags?.some((t) => r.themes.includes(t))))
      .map(([id, e]) => ({ id, name: e.name, ...(roleOf.has(id) ? { role: roleOf.get(id)! } : {}) }))
      .sort((a, b) => Number(!a.role) - Number(!b.role) || a.name.localeCompare(b.name));
    const people = [...Object.entries(this.people).map(([id, p]) => ({ id, name: p.name })), ...this.lookOptions()];
    return { foes, people };
  }

  /** The packs' people, whose looks a new person may wear (and who may be cast as they are). */
  lookOptions(): { id: string; name: string }[] {
    return Object.entries(this.cat.entities)
      .filter(([, e]) => e.type === 'npc')
      .map(([id, e]) => ({ id, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The id of the person (the DM's or a pack's) who already bears this name, ignoring case and spacing. */
  personNamed(name: string): string | undefined {
    const key = personKey(name);
    const all = [
      ...Object.entries(this.people).map(([id, p]) => [id, p.name] as const),
      ...Object.entries(this.cat.entities)
        .filter(([, e]) => e.type === 'npc')
        .map(([id, e]) => [id, e.name] as const),
    ];
    return all.find(([, n]) => personKey(n) === key)?.[0];
  }

  /** A fresh id for a person the Dungeon Master is making, from their name. */
  npcId(name: string): string {
    const base = `dm_${
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 16) || 'person'
    }`;
    let id = base;
    for (let n = 2; this.cat.entities[id] || this.people[id]; n++) id = `${base}_${n}`;
    return id;
  }

  private applyCast(e: Extract<LogEntry, { t: 'cast' }>) {
    if (!this.story.grid.at.has(e.region)) throw new WorldError(`"${e.region}" is not in the world`);
    if (!this.cat.entities[e.entity] && !this.people[e.entity])
      throw new WorldError(`nobody "${e.entity}" to bring in`);
    const cell = (v: number) => Number.isInteger(v) && v >= 0 && v <= MAX_CELL;
    if (!cell(e.x) || !cell(e.y)) throw new WorldError('a cast stands on a cell of the map');
    const list = this.cast.get(e.region) ?? this.cast.set(e.region, []).get(e.region)!;
    list.push({ entity: e.entity, x: e.x, y: e.y });
  }

  private applyNpc(e: Extract<LogEntry, { t: 'npc' }>) {
    if (!NPC_ID.test(e.id) || this.cat.entities[e.id] || this.people[e.id])
      throw new WorldError(`"${e.id}" cannot name a new person`);
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (!name || name.length > MAX_NPC_NAME) throw new WorldError(`a person's name is 1 to ${MAX_NPC_NAME} letters`);
    if (this.cat.entities[e.look]?.type !== 'npc')
      throw new WorldError(`"${e.look}" is not a person whose look to wear`);
    const same = this.personNamed(name);
    if (same)
      throw new WorldError(
        `"${name}" already lives in this world (${same}): do not make them again, bring them in with a cast or change their words with a voice`,
      );
    this.people[e.id] = { name, look: e.look, lines: this.checkLines(e.lines) };
  }

  private applyVoice(e: Extract<LogEntry, { t: 'voice' }>) {
    const person = this.people[e.id];
    if (!person) throw new WorldError(`"${e.id}" is not a person the Dungeon Master made`);
    person.lines = this.checkLines(e.lines);
  }

  private applySign(e: Extract<LogEntry, { t: 'sign' }>) {
    const map = this.cat.regions[e.region]?.biome.map;
    if (!map || !this.regions.includes(e.region)) throw new WorldError(`no region "${e.region}" in this world`);
    const cell = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_CELL;
    if (!cell(e.col) || !cell(e.row)) throw new WorldError('a sign stands on a cell of the map');
    const there = this.signsOf(map);
    if (there && !there.some((s) => s.col === e.col && s.row === e.row))
      throw new WorldError(`no signpost stands at ${e.col},${e.row} of "${e.region}"`);
    const lines = Array.isArray(e.lines) && e.lines.length === 0 ? [] : this.checkLines(e.lines);
    const region = this.signText.get(e.region) ?? this.signText.set(e.region, new Map()).get(e.region)!;
    const key = `${e.col},${e.row}`;
    if (lines.length) region.set(key, lines);
    else region.delete(key);
  }

  /** What the Dungeon Master wrote on the signpost at (col, row) of a region (a page per line), if they did. */
  signOverride(region: string, col: number, row: number): readonly string[] | undefined {
    return this.signText.get(region)?.get(`${col},${row}`);
  }

  /** What a person of the DM's says: 1 to `MAX_NPC_LINES` lines, each short. */
  private checkLines(raw: unknown): string[] {
    const lines = Array.isArray(raw) ? raw : [];
    if (
      !lines.length ||
      lines.length > MAX_NPC_LINES ||
      !lines.every((l) => typeof l === 'string' && l.trim() && l.length <= MAX_NPC_LINE)
    )
      throw new WorldError(`a person says 1 to ${MAX_NPC_LINES} lines of up to ${MAX_NPC_LINE} letters`);
    return [...(lines as string[])];
  }

  // --- helpers ---

  /** The cell a region's port leads to. */
  private cellBy(region: string, port: string): [number, number] {
    const [x, y] = this.story.grid.at.get(region)!;
    const side = this.cat.regions[region]!.ports[port]!;
    return [x + STEP[side][0], y + STEP[side][1]];
  }

  private bind(a: string, b: string, portA: string, portB: string) {
    this.bindings.get(a)![portA] = { map: this.cat.regions[b]!.biome.map, port: portB };
    this.bindings.get(b)![portB] = { map: this.cat.regions[a]!.biome.map, port: portA };
  }

  /** The cue a placement serves: the kind of land (its theme the arc's slot asks for, else its first) and of crossing. */
  private cueOf(p: Placement): StoryOption {
    const region = this.cat.regions[p.region]!;
    const slot = this.arc?.slots?.[this.story.regions.length];
    const theme = region.themes.find((t) => !slot?.themes || slot.themes.includes(t)) ?? region.themes[0] ?? 'wild';
    const tags = [...(this.cat.pairings[p.pairing]!.tags ?? [])].sort();
    const kind = tags.join(' and ');
    const label = `Into ${theme} lands${kind ? `, over ${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} crossing` : ''}`;
    return { cue: `${theme}|${tags.join(',')}`, label: cap(label), theme, tags };
  }

  /** Can the rest of the arc still be told once `p` is placed? (A bounded search; see STORY_BUDGET.) */
  private leavesStory(p: Placement): boolean {
    const story: Story = {
      regions: [...this.story.regions, p.region],
      crossings: [...this.story.crossings, p.pairing],
      joints: [...this.story.joints, [p.from, p.to]],
      grid: this.story.grid.clone(),
    };
    const prev = this.story.regions[this.story.regions.length - 1]!;
    story.grid.place(p.region, p.x, p.y);
    story.grid.use(prev, p.from);
    story.grid.use(p.region, p.to);
    return storyFor(this.cat, this.arc!, rng(this.seed), story) !== null;
  }

  /** A mob for each foe role of `region` (story slot `slot`, or -1 off the story): a different one per role where it can. Picked with `rand`. */
  foesFor(region: string, slot: number, rand: () => number, arc = this.arc): Record<string, string> {
    const r = this.cat.regions[region]!;
    const extra = slot >= 0 ? arc?.slots?.[slot]?.foes : undefined;
    const out: Record<string, string> = {};
    for (const role of Object.keys(r.foes).sort()) {
      const options = candidates(this.cat, r, role, extra?.[role]?.tags);
      if (!options.length) throw new AssemblyError(`no mob can be the ${role} of region "${region}"`);
      const fresh = options.filter((m) => !Object.values(out).includes(m));
      const from = fresh.length ? fresh : options;
      out[role] = from[Math.floor(rand() * from.length)]!;
    }
    return out;
  }

  /** Are these the foes a region may have (every role filled, each by a mob that fits it)? */
  private checkFoes(region: string, slot: number, foes: Record<string, string>, arc = this.arc) {
    const r = this.cat.regions[region];
    if (!r) throw new WorldError(`no region "${region}"`);
    const extra = slot >= 0 ? arc?.slots?.[slot]?.foes : undefined;
    for (const role of Object.keys(r.foes)) {
      const mob = foes[role];
      if (!mob || !candidates(this.cat, r, role, extra?.[role]?.tags).includes(mob))
        throw new WorldError(`"${mob ?? '(none)'}" cannot be the ${role} of "${region}"`);
    }
    // The arc's own needs of this slot: the roles it names must be among the region's (eligibleFor checked the region).
    if (arc && slot >= 0)
      for (const role of arcNeeds(arc)[slot]?.roles ?? [])
        if (!foes[role]) throw new WorldError(`"${region}" has no ${role}`);
  }
}

function shuffle<T>(rand: () => number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
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

/**
 * Assemble a whole random campaign from packs with a seed: an automatic Dungeon Master that picks an arc whose story
 * can be told (`storyFor`), writes its steps into a world's log, adds up to `MAX_SIDE_REGIONS` side regions, joins
 * regions that ended up side by side, and bolts a dead end onto every open port one suits. Throws an `AssemblyError`
 * when the packs have problems (`checkPacks`) or no arc can be told. The files still go through `parseContent`
 * (ContentManager.load), so a bad pack fails like a bad campaign file.
 */
export function assemble(seed: number, packs: readonly Pack[]): Assembly {
  const world = new World(seed, packs);
  const { cat } = world;
  const rand = rng(seed);
  let arcId = '';
  let found: Story | null = null;
  for (const id of shuffle(rand, Object.keys(cat.arcs).sort())) {
    found = storyFor(cat, cat.arcs[id]!, rand);
    if (found) {
      arcId = id;
      break;
    }
  }
  if (!found) throw new AssemblyError('no story arc can be told with these regions and pairings');
  const arc = cat.arcs[arcId]!;
  const r1 = found.regions[0]!;
  const keepers = keepersFor(cat, arc, r1);
  const keeper = keepers[Math.floor(rand() * keepers.length)]!;
  world.apply({ t: 'begin', arc: arcId, keeper, region: r1, foes: world.foesFor(r1, 0, rand, arc) });
  while (!world.complete) world.apply(world.stepFrom(found, rand));
  const haven = world.havenEntry(rand); // a town beside the start, where one pairs with it
  if (haven) world.apply(haven);
  // Side regions: up to `MAX_SIDE_REGIONS` others (neither hubs nor dead ends), each paired with a region already in.
  for (let added = 0, tries = 12; added < MAX_SIDE_REGIONS;) {
    if (rand() < 0.35 || --tries < 0) break;
    const side = world.sideEntry(rand);
    if (side) {
      world.apply(side);
      added++;
    }
  }
  for (const join of world.joinEntries()) world.apply(join);
  // Dead ends: one onto every port still open that one suits (each dead end once); the rest stay sealed.
  for (let end = world.sideEntry(rand, true); end; end = world.sideEntry(rand, true)) world.apply(end);
  return {
    seed,
    arc: arcId,
    keeper,
    regions: world.regions,
    foes: world.foesByRegion,
    crossings: world.crossings,
    layout: world.layout,
    files: world.files(),
    log: [...world.log],
  };
}
