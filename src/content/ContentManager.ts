// The game's content at runtime: fetched once at boot from a `ContentSource`, validated (schema.ts), cached, and asked
// for by id. The engine depends on this class, never on where the JSON comes from: today the static files in
// public/content/ (assets.ts `staticContent`); a database later is another `ContentSource` with the same one method.
// Pixi-free.

import { setMobKinds, type MobKind } from '../systems/combat';
import { setNpcLooks } from '../systems/looks';
import { setCapabilities } from '../systems/capabilities';
import { setPlaces } from '../systems/places';
import { setQuestContent } from '../systems/quests';
import { itemOf, setItems } from '../systems/items';
import { setShops } from '../systems/shops';
import { setLoots, type ChestLoot } from '../systems/chests';
import type { Outfit } from '../sprites/doll';
import type { MapData } from '../map/types';
import { populate, type Population } from './populate';
import { wireDoors } from './ports';
import {
  capabilityTable,
  CONTENT_FILES,
  parseContent,
  toMobKind,
  type BiomeDef,
  type Content,
  type ContentFile,
  type EntityDef,
  type ScenarioNode,
} from './schema';

/**
 * Where the content files come from: one JSON document per name. Swap this to change the backend, e.g. a REST
 * endpoint returning `{ version, entities }` for `fetch('entities')`.
 */
export interface ContentSource {
  fetch(file: ContentFile): Promise<unknown>;
}

/** A source that reads each file from a URL (a static file, or a REST endpoint that serves the same JSON). */
export class UrlContentSource implements ContentSource {
  constructor(
    private url: (file: ContentFile) => string,
    private init?: RequestInit,
  ) {}
  async fetch(file: ContentFile): Promise<unknown> {
    const res = await fetch(this.url(file), this.init);
    if (!res.ok) throw new Error(`Could not load content "${file}" (${res.status})`);
    return res.json();
  }
}

export class ContentManager {
  private mobKinds: Record<string, MobKind> = {};

  constructor(readonly content: Content) {
    for (const [id, def] of Object.entries(content.entities))
      if (def.type === 'mob') this.mobKinds[id] = toMobKind(def);
  }

  /** Fetch every file from `source` (in parallel) and check them. Throws a `ContentError` listing every problem. */
  static async load(source: ContentSource): Promise<ContentManager> {
    const files = await Promise.all(CONTENT_FILES.map((f) => source.fetch(f)));
    const byName = Object.fromEntries(CONTENT_FILES.map((f, i) => [f, files[i]])) as Record<ContentFile, unknown>;
    return new ContentManager(parseContent(byName));
  }

  /**
   * Hand the content to the rule modules that look it up by id: `MOB_KINDS` (systems/combat.ts), `NPC_LOOKS`
   * (systems/looks.ts), the places (`ZONE_NAMES`, `ZONE_LINKS`, `ZONE_TINTS`, systems/places.ts) and the quests
   * (`QUESTS`, `GIVERS`, `SITE_KINDS`..., systems/quests.ts), the goods (`ITEMS`, `SHOPS`, `CHEST_LOOTS`) and the capabilities (systems/capabilities.ts). Call once after loading, before anything spawns or
   * preloads art.
   */
  install() {
    setMobKinds(this.mobKinds);
    const looks: Record<string, Outfit> = {};
    for (const [id, def] of Object.entries(this.content.entities)) if (def.type === 'npc') looks[id] = def.sprite;
    setNpcLooks(looks);
    const names: Record<string, string> = {};
    const tints: Record<string, number> = {};
    const links: Record<string, string[]> = {};
    for (const b of Object.values(this.content.biomes)) {
      names[b.map] = b.name;
      if (b.tint) tints[b.map] = parseInt(b.tint.slice(1), 16);
      links[b.map] = b.links;
    }
    setPlaces(names, links, tints);
    const goods = this.content.items;
    setItems(goods.items, goods.start);
    setShops(goods.shops);
    const loots: Record<string, ChestLoot> = {};
    for (const [id, loot] of Object.entries(goods.loots))
      loots[id] = 'item' in loot ? { item: itemOf(loot.item) } : loot;
    setLoots(loots);
    setQuestContent(this.content.quests);
    const caps = capabilityTable(this.content);
    setCapabilities(caps.campaign, caps.zones);
  }

  /** The node the game starts in. */
  get startNode(): ScenarioNode {
    return this.getScenario(this.content.scenarios.start);
  }

  hasScenario(id: string): boolean {
    return this.content.scenarios.nodes.has(id);
  }

  getScenario(id: string): ScenarioNode {
    const node = this.content.scenarios.nodes.get(id);
    if (!node) throw new Error(`No scenario node "${id}"`);
    return node;
  }

  getBiomeInfo(type: string): BiomeDef {
    const biome = this.content.biomes[type];
    if (!biome) throw new Error(`No biome "${type}"`);
    return biome;
  }

  /** The biome drawn from a map, if any names it (a zone's name is its map's). */
  biomeOfMap(map: string): [type: string, biome: BiomeDef] | undefined {
    return Object.entries(this.content.biomes).find(([, b]) => b.map === map);
  }

  /** A map as the game uses it in this campaign: its ports wired to the maps the biome binds them to (src/content/ports.ts). */
  wire(map: string, data: MapData): MapData {
    return wireDoors(data, this.biomeOfMap(map)?.[1].ports);
  }

  getEntityBaseStats(id: string): EntityDef {
    const def = this.content.entities[id];
    if (!def) throw new Error(`No entity "${id}"`);
    return def;
  }

  /** The engine's `MobKind` for a mob entity. */
  mobKind(id: string): MobKind {
    const kind = this.mobKinds[id];
    if (!kind) throw new Error(`No mob "${id}"`);
    return kind;
  }

  /**
   * Who a zone (named after its map) starts with when it is built: the node `nodeId` (default: the node with the
   * biome's own name, if there is one), then the biome's generated roamers.
   */
  populate(map: string, data: MapData, nodeId?: string): Population {
    const found = this.biomeOfMap(map);
    const id = nodeId ?? found?.[0] ?? map;
    const node = this.content.scenarios.nodes.get(id);
    return populate(data, found?.[1], node, this.content.entities);
  }
}
