import type { Sprites, Zone } from '../assets';
import { Camera } from '../core/camera';
import { Ambient } from '../entities/ambient';
import { Character } from '../entities/Character';
import { Chest } from '../entities/Chest';
import { Crop, type CropMemory } from '../entities/Crop';
import { Effects } from '../entities/effects';
import type { GroundItem } from '../entities/GroundItem';
import { Pet } from '../entities/Pet';
import { QuestSite } from '../entities/QuestSite';
import { Mob, type MobWorld } from '../entities/Mob';
import { WeatherLayer } from '../entities/WeatherLayer';
import { CLIMATES, DEFAULT_CLIMATE, isClimate, Weather } from '../systems/weather';
import { sheetGrid } from '../core/textures';
import { mapBox } from '../map/bounds';
import { MapView } from '../map/MapView';
import { CELL, type MapData } from '../map/types';
import { cellFeet } from '../map/doors';
import { MOB_KINDS, type Item } from '../systems/combat';
import type { Population } from '../content/populate';
import { CHEST_LOOTS } from '../systems/chests';
import { CROP_KINDS, CROP_STAGES } from '../systems/crops';
import { Collision } from '../systems/collision';
import { npcLook, OVERWORLD_NPC } from '../systems/looks';
import { PET_KINDS } from '../systems/pets';
import { GIVERS } from '../systems/quests';
import { SHOPS } from '../systems/shops';
import { isTrialZone } from '../systems/skills';
import { PondLevels, type PondState } from '../systems/needs';
import { PondBeds } from '../entities/PondBeds';

/** What a zone remembers while it is unloaded (Arena.memory); its mobs simply start afresh. */
export interface ZoneMemory {
  opened: number[]; // indices of opened chests
  crops: CropMemory[]; // each crop plot: its phase, progress and whether it is watered
  ground: { item: Item; x: number; y: number; id: number; age: number }[];
  ponds?: PondState[]; // each drained pond: its id, how far it is drained, whether refilling (only rain fills it)
}

export interface QuestGiver {
  giver: string; // a key of GIVERS
  body: Character;
}

/** A person a scenario placed here (content/schema.ts `EntityDef`, type npc): stands, blocks, and talks. */
export interface Folk {
  entity: string;
  name: string;
  lines: string[];
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
  /** The enemies, from the content (`populate`): the scenario node's placements and the biome's roamers. */
  readonly mobs: Mob[] = [];
  /** People the scenario node placed (the map's own NPC is `npc`). */
  readonly folk: Folk[] = [];
  readonly chests: Chest[];
  readonly crops: Crop[];
  readonly ground: GroundItem[] = [];
  /** The bodies of the players here, which mobs hunt and which block others. The scene keeps it in step. */
  readonly heroBodies: Character[] = [];
  /** How far each pond here is drained (solo and host decide; kept in the zone's memory while it is unloaded). */
  readonly ponds = new PondLevels();
  /** Draws the drained part of each pond (the shown zone's, each frame: `showPonds`). */
  readonly pondBeds: PondBeds;
  /** Set by the scene, which owns the combat rules mobs call back into. */
  mobWorld!: MobWorld;

  /**
   * `population` is who stands here (content/populate.ts, from the scenario node and the biome); `climate` the biome's
   * weather from the content (null for a room; the map's own is used when the content names none).
   */
  constructor(
    zone: Zone,
    private sprites: Sprites,
    population: Population,
    climate: string | null = zone.data.indoor ? null : zone.data.climate,
  ) {
    const { data } = zone;
    this.name = zone.name;
    this.data = data;
    this.source = zone;
    this.world = new MapView(data, zone.textures);
    this.camera = new Camera(this.world);
    this.collision = new Collision(data.width, data.height, data.collision);
    this.effects = new Effects(this.world.layer);
    this.pondBeds = new PondBeds(data, this.world);
    this.world.layer.addChild(this.pondBeds);
    this.ambient = data.indoor ? null : new Ambient(this.world.layer, data);
    this.weatherLayer = data.indoor ? null : new WeatherLayer(this.world.layer);
    this.weather =
      data.indoor || climate === null ? null : new Weather(CLIMATES[isClimate(climate) ? climate : DEFAULT_CLIMATE]);

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
    const chestFrames = sheetGrid(sprites.chests, 2, 4, CELL, CELL);
    this.chests = data.chests.map((c) => {
      if (!CHEST_LOOTS[c.loot]) throw new Error(`Zone "${zone.name}" has a chest with unknown loot "${c.loot}"`);
      return new Chest(c, chestFrames);
    });
    const cropFrames = sheetGrid(sprites.crops, CROP_STAGES, CROP_KINDS.length, CELL, CELL * 2);
    this.crops = data.crops.map((c) => new Crop(c, cropFrames));
    const bodies = [
      ...(this.npc ? [this.npc] : []),
      ...this.keepers.map((k) => k.body),
      ...this.givers.map((g) => g.body),
      ...this.sites,
      ...this.pets,
      ...this.chests,
      ...this.crops,
    ];
    if (bodies.length) this.world.layer.addChild(...bodies); // Pixi's addChild() with nothing to add throws
    this.populate(population);
  }

  /**
   * Put the zone's enemies and scenario folk in, replacing any that are here (a scenario loaded over it): the old ones
   * are destroyed, their sheets given back to the wardrobe. The order of `population.mobs` is the mobs' order, which a
   * co-op snapshot refers to by index.
   */
  populate(population: Population) {
    for (const m of this.mobs) m.body.destroy({ children: true });
    for (const f of this.folk) f.body.destroy({ children: true });
    const { wardrobe } = this.sprites;
    const mobs = population.mobs.map((m) => {
      const kind = MOB_KINDS[m.kind];
      if (!kind) throw new Error(`Zone "${this.name}" spawns unknown mob kind "${m.kind}"`);
      const mob = new Mob(kind, wardrobe.sheet(kind.look), ...cellFeet(m));
      mob.respawns = !isTrialZone(this.name);
      return mob;
    });
    const folk = population.folk.map((f): Folk => {
      const body = new Character(wardrobe.sheet(f.def.sprite));
      body.position.set(...cellFeet(f));
      body.setTag(f.def.name, 0xffffff);
      return { entity: f.entity, name: f.def.name, lines: f.def.lines ?? [`${f.def.name} nods.`], body };
    });
    this.mobs.splice(0, this.mobs.length, ...mobs);
    this.folk.splice(0, this.folk.length, ...folk);
    const bodies = [...mobs.map((m) => m.body), ...folk.map((f) => f.body)];
    if (bodies.length) this.world.layer.addChild(...bodies);
  }

  /** Follow (x, y) with the camera, inside the map (`dt` eases after the player; `snap` puts the view there at once). */
  follow(screenW: number, screenH: number, x: number, y: number, dt = 0, snap = false) {
    this.camera.follow(screenW, screenH, x, y, mapBox(this.data), dt, snap);
  }

  /**
   * Is this zone only being looked at from the next one over (its map drawn beside the player's, which they will walk
   * into)? Then its weather stays out of the picture. Its mobs are drawn too (the scene keeps them wandering) unless
   * `hideMobs`, as for a co-op guest, who is not told what they are doing.
   */
  setLookout(on: boolean, hideMobs = on) {
    for (const m of this.mobs) m.body.visible = !(on && hideMobs) && m.body.alpha > 0;
    if (this.weatherLayer) {
      this.weatherLayer.view.visible = !on;
      this.weatherLayer.view.alpha = 1;
    }
  }

  /** What must outlive the zone being unloaded: the chests opened and the items lying on the ground. */
  remember(): ZoneMemory {
    return {
      opened: this.chests.flatMap((c, i) => (c.opened ? [i] : [])),
      crops: this.crops.map((c) => c.remember()),
      ground: this.ground.map((g) => ({ item: g.item, x: g.x, y: g.y, id: g.id, age: g.age })),
      ponds: this.ponds.levels(),
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
