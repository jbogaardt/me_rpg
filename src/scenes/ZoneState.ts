import type { Sprites, Zone } from '../assets';
import { Camera } from '../core/camera';
import { Ambient } from '../entities/ambient';
import { Character } from '../entities/Character';
import { Chest } from '../entities/Chest';
import { Plot } from '../entities/Plot';
import { Well } from '../entities/Well';
import { Effects } from '../entities/effects';
import type { GroundItem } from '../entities/GroundItem';
import { Pet } from '../entities/Pet';
import { QuestSite } from '../entities/QuestSite';
import { Mob, type MobWorld } from '../entities/Mob';
import { WeatherLayer } from '../entities/WeatherLayer';
import { CLIMATES, DEFAULT_CLIMATE, isClimate, Weather } from '../systems/weather';
import { sheetGrid } from '../core/textures';
import { zoneBounds } from '../map/bounds';
import { MapView } from '../map/MapView';
import { CELL, type MapData } from '../map/types';
import { cellFeet } from '../map/doors';
import { MOB_KINDS, type Item } from '../systems/combat';
import { CHEST_LOOTS } from '../systems/chests';
import type { CropId } from '../systems/crops';
import { Collision } from '../systems/collision';
import { npcLook, OVERWORLD_NPC } from '../systems/looks';
import { PET_KINDS } from '../systems/pets';
import { GIVERS } from '../systems/quests';
import { SHOPS } from '../systems/shops';
import { isTrialZone } from '../systems/skills';

/** What a zone remembers while it is unloaded (Arena.memory); its mobs simply start afresh. */
export interface ZoneMemory {
  opened: number[]; // indices of opened chests
  plots: { crop: CropId | null; grown: number; last: number; wetUntil: number }[]; // what grows in each plot, how far, and until when it is wet
  ground: { item: Item; x: number; y: number; id: number; age: number }[];
}

export interface QuestGiver {
  giver: string; // a key of GIVERS
  body: Character;
}

export interface Keeper {
  shop: string; // a key of SHOPS
  body: Character;
}

/**
 * Everything that belongs to one zone while the game runs: its drawn map, collision, mobs, chests, shopkeepers, items on
 * the ground and the effects flying in it. The scene keeps one per loaded zone, simulates only the ones with players in
 * them, and draws only the local player's. Players are not part of it: each `Player` names the zone it is in.
 */
export class ZoneState {
  readonly name: string;
  readonly data: MapData;
  /** What was loaded for it (map and tilesets), handed back when the zone is unloaded. */
  readonly source: Zone;
  readonly world: MapView;
  readonly camera: Camera;
  readonly collision: Collision;
  readonly effects: Effects;
  /** Footprints and falling leaves: only in the open air, and only worth updating where someone is looking. */
  readonly ambient: Ambient | null;
  readonly weatherLayer: WeatherLayer | null;
  /** This biome's own weather (precipitation and wind by its climate); rooms have none. Host and solo roll it, a guest is told. */
  readonly weather: Weather | null;
  readonly npc: Character | null;
  readonly keepers: Keeper[];
  /** Who hands out the story quests here, and the places gather quests send players (shown per player). */
  readonly givers: QuestGiver[];
  readonly sites: QuestSite[];
  /** Dogs and cats lying about: scenery you can talk to (local only, not synced). */
  readonly pets: Pet[];
  readonly mobs: Mob[];
  readonly chests: Chest[];
  /** Soil for crops: wild plants and bare farm plots (systems/crops.ts). The host and solo grow them; a guest only shows them. */
  readonly plots: Plot[];
  /** Wells to drink from (solid; the action key beside one, see systems/water.ts). They have no state to remember or sync. */
  readonly wells: Well[];
  readonly ground: GroundItem[] = [];
  /** The bodies of the players here, which mobs hunt and which block others. The scene keeps it in step. */
  readonly heroBodies: Character[] = [];
  /** Set by the scene, which owns the combat rules mobs call back into. */
  mobWorld!: MobWorld;

  /** `clock` is the arena's, so a wild plot starts ripe and a planted one keeps counting. */
  constructor(zone: Zone, sprites: Sprites, clock = 0) {
    const { data } = zone;
    this.name = zone.name;
    this.data = data;
    this.source = zone;
    this.world = new MapView(data, zone.textures);
    this.camera = new Camera(this.world);
    this.collision = new Collision(data.width, data.height, data.collision);
    this.effects = new Effects(this.world.layer);
    this.ambient = data.indoor ? null : new Ambient(this.world.layer, data);
    this.weatherLayer = data.indoor ? null : new WeatherLayer(this.world.layer);
    this.weather = data.indoor ? null : new Weather(CLIMATES[isClimate(data.climate) ? data.climate : DEFAULT_CLIMATE]);

    this.npc = data.npc ? new Character(sprites.wardrobe.sheet(npcLook(OVERWORLD_NPC))) : null;
    this.npc?.position.set(...cellFeet(data.npc!));
    this.keepers = data.shops.map((spawn) => {
      const shop = SHOPS[spawn.shop];
      if (!shop) throw new Error(`Zone "${zone.name}" has a shopkeeper for unknown shop "${spawn.shop}"`);
      const body = new Character(sprites.wardrobe.sheet(npcLook(shop.keeper)));
      body.position.set(...cellFeet(spawn));
      body.setTag(shop.tag, 0xffd34d);
      return { shop: spawn.shop, body };
    });
    this.givers = data.givers.map((spawn) => {
      const giver = GIVERS[spawn.giver];
      if (!giver) throw new Error(`Zone "${zone.name}" has an unknown quest giver "${spawn.giver}"`);
      const body = new Character(sprites.wardrobe.sheet(npcLook(giver.look)));
      body.position.set(...cellFeet(spawn));
      body.setTag(giver.tag, 0xffffff);
      return { giver: spawn.giver, body };
    });
    const perKind = new Map<string, number>();
    this.sites = data.sites.map((spawn) => {
      const index = perKind.get(spawn.kind) ?? 0;
      perKind.set(spawn.kind, index + 1);
      return new QuestSite(spawn, index);
    });
    this.pets = data.pets.map((spawn, i) => {
      const kind = PET_KINDS[spawn.kind];
      if (!kind) throw new Error(`Zone "${zone.name}" has an unknown pet "${spawn.kind}"`);
      const [x, y] = cellFeet(spawn);
      const free = (px: number, py: number) => this.collision.fitsMap(px, py);
      return new Pet(kind, sprites.pets[kind.sheet], { x, y }, free, i + 1);
    });
    this.mobs = data.mobs.map((m) => {
      const kind = MOB_KINDS[m.kind];
      if (!kind) throw new Error(`Zone "${zone.name}" spawns unknown mob kind "${m.kind}"`);
      const mob = new Mob(kind, sprites.wardrobe.sheet(kind.look), ...cellFeet(m));
      mob.respawns = !isTrialZone(zone.name);
      return mob;
    });
    const chestFrames = sheetGrid(sprites.chests, 2, 4, CELL, CELL);
    this.chests = data.chests.map((c) => {
      if (!CHEST_LOOTS[c.loot]) throw new Error(`Zone "${zone.name}" has a chest with unknown loot "${c.loot}"`);
      return new Chest(c, chestFrames);
    });
    this.wells = data.wells.map((spawn) => new Well(spawn));
    this.plots = data.plots.map((spawn) => new Plot(spawn, sprites.crops, clock));
    const bodies = [
      ...(this.npc ? [this.npc] : []),
      ...this.keepers.map((k) => k.body),
      ...this.givers.map((g) => g.body),
      ...this.sites,
      ...this.pets,
      ...this.chests,
      ...this.plots,
      ...this.wells,
      ...this.mobs.map((m) => m.body),
    ];
    if (bodies.length) this.world.layer.addChild(...bodies); // Pixi's addChild() with nothing to add throws
  }

  /** Follow (x, y) with the camera, inside the zone's own cells (`dt` eases after the player; `snap` puts the view there at once). */
  follow(screenW: number, screenH: number, x: number, y: number, dt = 0, snap = false) {
    this.camera.follow(screenW, screenH, x, y, zoneBounds(this.data), dt, snap);
  }

  /** What must outlive the zone being unloaded: the chests opened, what grows in the plots and the items lying on the ground. */
  remember(): ZoneMemory {
    return {
      opened: this.chests.flatMap((c, i) => (c.opened ? [i] : [])),
      plots: this.plots.map((p) => ({
        crop: p.state.crop,
        grown: p.state.grown,
        last: p.state.last,
        wetUntil: p.state.wetUntil,
      })),
      ground: this.ground.map((g) => ({ item: g.item, x: g.x, y: g.y, id: g.id, age: g.age })),
    };
  }

  /**
   * Free the zone's drawn world and everything in it: mobs, characters, effects (their sheets go back to the wardrobe).
   * The tilesets are the asset cache's (assets.ts `unloadZone`).
   */
  dispose() {
    this.world.destroy({ children: true });
  }
}
