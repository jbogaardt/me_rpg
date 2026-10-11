import type { Sprites, Zone } from '../assets';
import { Camera } from '../core/camera';
import { Ambient } from '../entities/ambient';
import { Character } from '../entities/Character';
import { Chest } from '../entities/Chest';
import { Effects } from '../entities/effects';
import type { GroundItem } from '../entities/GroundItem';
import { Mob, type MobWorld } from '../entities/Mob';
import { WeatherLayer } from '../entities/WeatherLayer';
import { sheetGrid } from '../core/textures';
import { MapView } from '../map/MapView';
import { CELL, type MapData } from '../map/types';
import { cellFeet } from '../map/doors';
import { MOB_KINDS } from '../systems/combat';
import { CHEST_LOOTS } from '../systems/chests';
import { Collision } from '../systems/collision';
import { npcLook, OVERWORLD_NPC } from '../systems/looks';
import { SHOPS } from '../systems/shops';

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
  readonly world: MapView;
  readonly camera: Camera;
  readonly collision: Collision;
  readonly effects: Effects;
  /** Footprints and falling leaves: only in the open air, and only worth updating where someone is looking. */
  readonly ambient: Ambient | null;
  readonly weatherLayer: WeatherLayer | null;
  readonly npc: Character | null;
  readonly keepers: Keeper[];
  readonly mobs: Mob[];
  readonly chests: Chest[];
  readonly ground: GroundItem[] = [];
  /** The bodies of the players here, which mobs hunt and which block others. The scene keeps it in step. */
  readonly heroBodies: Character[] = [];
  /** Set by the scene, which owns the combat rules mobs call back into. */
  mobWorld!: MobWorld;

  constructor(zone: Zone, sprites: Sprites) {
    const { data } = zone;
    this.name = zone.name;
    this.data = data;
    this.world = new MapView(data, zone.textures);
    this.camera = new Camera(this.world, data.width * CELL, data.height * CELL);
    this.collision = new Collision(data.width, data.height, data.collision);
    this.effects = new Effects(this.world.layer);
    this.ambient = data.indoor ? null : new Ambient(this.world.layer, data);
    this.weatherLayer = data.indoor ? null : new WeatherLayer(this.world.layer);

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
    this.mobs = data.mobs.map((m) => {
      const kind = MOB_KINDS[m.kind];
      if (!kind) throw new Error(`Zone "${zone.name}" spawns unknown mob kind "${m.kind}"`);
      return new Mob(kind, sprites.wardrobe.sheet(kind.look), ...cellFeet(m));
    });
    const chestFrames = sheetGrid(sprites.chests, 2, 4, CELL, CELL);
    this.chests = data.chests.map((c) => {
      if (!CHEST_LOOTS[c.loot]) throw new Error(`Zone "${zone.name}" has a chest with unknown loot "${c.loot}"`);
      return new Chest(c, chestFrames);
    });
    this.world.layer.addChild(
      ...(this.npc ? [this.npc] : []),
      ...this.keepers.map((k) => k.body),
      ...this.chests,
      ...this.mobs.map((m) => m.body),
    );
  }

  /** Free the zone's drawn world (the scene does this when it ends; the loaded tilesets stay in the asset cache). */
  dispose() {
    this.world.destroy({ children: true });
  }
}
