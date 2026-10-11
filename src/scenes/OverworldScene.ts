import type { Container } from 'pixi.js';
import type { Sprites, Zone } from '../assets';
import { Camera } from '../core/camera';
import { actionDown, actionPressed, mapPressed, menuPressed } from '../core/controls';
import { DIR_VEC, directionToward } from '../core/direction';
import type { Scene } from '../core/Scene';
import { sheetGrid } from '../core/textures';
import type { TouchControls } from '../core/touch';
import { Ambient } from '../entities/ambient';
import { Character } from '../entities/Character';
import { Chest } from '../entities/Chest';
import { Effects, floatText } from '../entities/effects';
import { GroundItem } from '../entities/GroundItem';
import { Mob } from '../entities/Mob';
import { Player, type Command } from '../entities/Player';
import { WeatherLayer } from '../entities/WeatherLayer';
import type { Dialog } from '../hud/Dialog';
import type { Hud } from '../hud/Hud';
import { MapOverlay } from '../hud/MapOverlay';
import type { Menu } from '../hud/Menu';
import type { ShopCounter } from '../hud/ShopCounter';
import { MapView } from '../map/MapView';
import { CELL } from '../map/types';
import { packKeys } from '../net/protocol';
import type { Role, Session } from '../net/session';
import { CHEST_LOOTS, collect } from '../systems/chests';
import { Collision } from '../systems/collision';
import { MOB_KINDS, newHero, type Hero, type Item } from '../systems/combat';
import { addToPack } from '../systems/inventory';
import { equip } from '../systems/items';
import { heroOutfit, npcLook, OVERWORLD_NPC, playerOutfit } from '../systems/looks';
import { SHOPS } from '../systems/shops';
import { sampleBiome, Weather, type WeatherKind } from '../systems/weather';
import { Arena } from './overworld/Arena';
import { GuestLink } from './overworld/GuestLink';
import { HostLink } from './overworld/HostLink';
import { Simulation } from './overworld/Simulation';
import { Visuals } from './overworld/Visuals';

const NPC_LINES = [
  'Greetings, traveler. This world is still being drawn.',
  'Soon there will be a story here. Come back later!',
];

const PICKUP_REACH = 26; // how close the action key must be to an item on the ground
const CHEST_REACH = CELL * 1.4; // how close the action key must be to a chest (feet to the chest's cell centre)

/** The HTML overlays shared by every scene. They are created once in main.ts. */
export interface Ui {
  hud: Hud;
  menu: Menu;
  shop: ShopCounter;
  dialog: Dialog;
  touch: TouchControls;
  session: Session;
}

/**
 * The overworld: one zone with the hero, an NPC, shopkeepers and mobs. This class is the conductor: it owns the frame
 * loop, the HTML overlays (menu, dialog, shop counter, map) and what the action key does on the spot (talk, open a chest,
 * pick up, attack). The rest lives in `scenes/overworld/`:
 *  - `Arena`: the world's inhabitants, the roster of players and the role.
 *  - `Simulation`: the rules (moving, attacking, damage, XP, defeat). Solo and host only.
 *  - `Visuals`: drawing what happens (also what a guest is told).
 *  - `HostLink` / `GuestLink`: the two sides of a co-op game (see net/protocol.ts).
 * It runs in one of three roles (`Session.role`): solo, host (the simulation plus up to three friends' players), or
 * client (no simulation: it sends the local controls to the host and draws the host's snapshots). `arena.local` is the
 * player at this keyboard in every role; `arena.remotes` are the others by player number. Player 0 is the host.
 */
export class OverworldScene implements Scene {
  private world: MapView;
  private camera: Camera;
  private arena: Arena;
  private sim: Simulation;
  private host: HostLink;
  private guest: GuestLink;
  private npc: Character;
  private keepers: { shop: string; body: Character }[]; // shopkeepers, by the shop they run (systems/shops.ts)
  private ground: GroundItem[] = []; // items dropped from the pack (solo and host only: guests do not see them)
  private weather = new Weather(); // local atmosphere only: not synced in co-op
  private weatherLayer: WeatherLayer;
  private overlay: MapOverlay;
  private screen = { width: 0, height: 0 };

  constructor(
    zone: Zone,
    sprites: Sprites,
    private ui: Ui,
  ) {
    const { data } = zone;
    const { wardrobe } = sprites;
    this.world = new MapView(data, zone.textures);
    this.camera = new Camera(this.world, data.width * CELL, data.height * CELL);
    const effects = new Effects(this.world.layer);
    const ambient = new Ambient(this.world.layer, data);
    this.weatherLayer = new WeatherLayer(this.world.layer);
    this.overlay = new MapOverlay(data);

    const hero = newHero();
    const local = new Player(wardrobe.sheet(heroOutfit(hero)), hero);
    this.npc = new Character(wardrobe.sheet(npcLook(OVERWORLD_NPC)));
    const feet = (p: { col: number; row: number }): [number, number] => [(p.col + 0.5) * CELL, (p.row + 0.9) * CELL];

    // Entities are positioned by their feet so they y-sort with map objects.
    local.body.position.set(...feet(data.spawn));
    if (data.npc) this.npc.position.set(...feet(data.npc));
    else this.npc.visible = false;
    this.keepers = data.shops.map((spawn) => {
      const shop = SHOPS[spawn.shop];
      if (!shop) throw new Error(`Zone "${zone.name}" has a shopkeeper for unknown shop "${spawn.shop}"`);
      const body = new Character(wardrobe.sheet(npcLook(shop.keeper)));
      body.position.set(...feet(spawn));
      body.setTag(shop.tag, 0xffd34d);
      return { shop: spawn.shop, body };
    });
    const mobs = data.mobs.map((m) => {
      const kind = MOB_KINDS[m.kind];
      if (!kind) throw new Error(`Zone "${zone.name}" spawns unknown mob kind "${m.kind}"`);
      return new Mob(kind, wardrobe.sheet(kind.look), ...feet(m));
    });
    const chestFrames = sheetGrid(sprites.chests, 2, 4, CELL, CELL);
    const chests = data.chests.map((c) => {
      if (!CHEST_LOOTS[c.loot]) throw new Error(`Zone "${zone.name}" has a chest with unknown loot "${c.loot}"`);
      return new Chest(c, chestFrames);
    });

    const collision = new Collision(data.width, data.height, data.collision);
    const fixed = [this.npc, ...this.keepers.map((k) => k.body)];
    this.arena = new Arena(this.world, data, collision, effects, ambient, wardrobe, local, mobs, chests, fixed);
    const visuals = new Visuals(this.arena);
    const say = (lines: string[]) => this.ui.dialog.say(lines);
    // The simulation reports what a friend should see through the host link (which only records it while hosting).
    this.sim = new Simulation(this.arena, visuals, (e) => this.host.emit(e), say);
    this.host = new HostLink(this.arena, ui.session, this.sim);
    this.guest = new GuestLink(
      this.arena,
      ui.session,
      visuals,
      () => this.camera.view(this.screen.width, this.screen.height),
      say,
    );
    this.ui.shop.onGearChange = () => this.refreshLook();

    this.world.layer.addChild(
      this.npc,
      ...this.keepers.map((k) => k.body),
      local.body,
      ...chests,
      ...mobs.map((m) => m.body),
    );
  }

  get root(): Container {
    return this.world;
  }

  // What playtest scripts poke at (see .claude/skills/playtest): the local player's body and hero, the mobs, the role.
  private get player(): Character {
    return this.arena.local.body;
  }

  private get hero(): Hero {
    return this.arena.local.hero;
  }

  get mobs(): Mob[] {
    return this.arena.mobs;
  }

  private get role(): Role {
    return this.arena.role;
  }

  get remotes(): Map<number, Player> {
    return this.arena.remotes;
  }

  /** Start a kind of weather right now (playtest scripts); otherwise it changes at random. */
  setWeather(kind: WeatherKind) {
    this.weather.force(kind);
  }

  enter() {
    this.ui.menu.inventory.attach({
      locked: () => (this.role === 'client' ? 'In a co-op game your gear is kept by the host.' : null),
      noDrop: () => (this.role === 'solo' ? null : 'Items cannot be dropped in a co-op game yet.'),
      gearChanged: () => this.refreshLook(),
      used: (text) => this.sim.text(this.player.x, this.player.y - 54, text, 0x7be07b),
      drop: (item) => this.dropItem(item),
    });
    // Opened from a join link (#join=...): show the Online tab with the game code already filled in.
    if (this.ui.session.urlCode) this.ui.menu.toggle(this.hero, 'online');
  }

  exit() {
    this.ui.menu.inventory.attach(null);
    this.overlay.setAvailable(false);
    this.ui.dialog.close();
    this.ui.shop.close();
    if (this.ui.menu.open) this.ui.menu.toggle(this.hero);
  }

  resize(width: number, height: number) {
    this.screen = { width, height };
    this.camera.resize(width, height);
    this.ui.dialog.layout(this.screen, this.ui.touch.rects());
    this.camera.follow(width, height, this.player.x, this.player.y);
  }

  update(dt: number) {
    const { menu, shop, dialog, hud, session } = this.ui;
    const { arena } = this;
    this.syncRole(session.role);
    arena.clock += dt;
    const online = arena.role !== 'solo';
    this.overlay.setAvailable(online);
    if (online && !menu.open && !dialog.active && mapPressed()) this.overlay.toggle();
    if (!dialog.active && menuPressed()) {
      if (shop.open) shop.close();
      else menu.toggle(this.hero);
    }
    if (!dialog.active && !shop.open && actionPressed('inventory')) menu.toggleInventory(this.hero);
    if (menu.open || shop.open) {
      if (menu.open) menu.update();
      else shop.update();
      hud.update(this.hero, arena.role !== 'client'); // gold changes at the counter
      if (!online) return; // solo: the world is paused. Online it keeps running behind the menu (the other player can't be paused).
    }

    if (arena.role === 'client') this.updateClient(dt);
    else this.updateSimulation(dt);

    arena.effects.update(dt);
    this.weather.update(dt, sampleBiome(arena.data, this.player.x, this.player.y - 1));
    arena.ambient.wind = this.weather.wind;
    this.weatherLayer.update(dt, this.weather, this.camera.view(this.screen.width, this.screen.height));
    arena.ambient.update(dt, this.player, [
      ...arena.players().map((p) => p.body),
      ...arena.mobs.filter((m) => m.alive).map((m) => m.body),
    ]);

    this.npc.animate(dt * 1000, false);
    for (const k of this.keepers) k.body.animate(dt * 1000, false);
    for (const item of this.ground) {
      item.update(dt, Math.hypot(this.player.x - item.x, this.player.y - item.y) < PICKUP_REACH);
    }
    arena.refreshBodies(); // after this frame's joins, leaves and deaths
    for (const body of arena.bodies()) body.zIndex = body.y;
    hud.update(this.hero, arena.role !== 'client');
    if (this.overlay.open) {
      const pin = (p: Player) => ({ slot: p.slot, x: p.body.x, y: p.body.y });
      // A player the host has not yet placed (their body is still hidden) has no position to show.
      this.overlay.update(pin(arena.local), [...arena.remotes.values()].filter((p) => p.body.visible).map(pin));
    }
    this.camera.follow(this.screen.width, this.screen.height, this.player.x, this.player.y);
  }

  /** Solo and host: the authoritative game. The host additionally runs its friends' players and sends them snapshots. */
  private updateSimulation(dt: number) {
    const { menu, shop, dialog } = this.ui;
    const { arena, sim } = this;
    const host = arena.role === 'host';
    if (host) this.host.reconcile();
    arena.refreshBodies();
    const raw = this.readCommand();
    // Reading a dialog or the menu: the player stands still (a solo dialog freezes the whole world instead).
    const reading = menu.open || shop.open || dialog.active;
    const cmd = reading ? { ...raw, dx: 0, dy: 0, mag: false } : raw;
    const guests = [...arena.remotes.values()].map((p) => ({ p, cmd: this.host.command(p) }));

    if (host || !dialog.active) {
      sim.updatePlayer(arena.local, cmd, dt);
      for (const g of guests) sim.updatePlayer(g.p, g.cmd, dt);
      sim.updateMobs(dt);
      if (cmd.mag) sim.cast(arena.local);
      for (const g of guests) if (g.cmd.mag) sim.cast(g.p);
    } else {
      this.player.animate(dt * 1000, false); // the world is frozen while talking
    }
    if (!menu.open && !shop.open) this.handleAction(cmd.act, () => this.act(arena.local));
    for (const g of guests) if (g.cmd.act) this.act(g.p);
    if (host) this.host.broadcast(dt);
  }

  /** Guest: no simulation. Show what the host last said, and tell it what this player is doing. */
  private updateClient(dt: number) {
    const { menu, shop, dialog } = this.ui;
    this.guest.update(dt);
    const cmd = this.readCommand();
    const reading = menu.open || shop.open || dialog.active;
    if (!menu.open && !shop.open) this.handleAction(cmd.act, () => this.guest.pressAction());
    if (!reading && cmd.mag) this.guest.pressMagic();
    this.guest.sendInput(dt, reading ? 0 : packKeys(cmd.dx, cmd.dy));
  }

  /** Switch to `role` (a friend connected or everyone dropped), setting the world up for it. */
  private syncRole(role: Role) {
    const { arena } = this;
    if (role === arena.role) return;
    if (arena.role === 'host') this.host.leave();
    else if (arena.role === 'client') this.guest.leave();
    arena.role = 'solo'; // so nothing from here on is recorded for friends until the new role is set
    if (role === 'host') this.host.enter();
    else if (role === 'client') this.guest.enter();
    arena.role = role;
  }

  // --- What the action key does ---

  private readCommand(): Command {
    return {
      dx: (actionDown('right') ? 1 : 0) - (actionDown('left') ? 1 : 0),
      dy: (actionDown('down') ? 1 : 0) - (actionDown('up') ? 1 : 0),
      act: actionPressed('attack'),
      mag: actionPressed('magic'),
    };
  }

  /** The local player's action button: advance the dialog, talk when next to the NPC or a shopkeeper, otherwise `attack`. */
  private handleAction(pressed: boolean, attack: () => void) {
    if (!pressed) return;
    const { dialog } = this.ui;
    const near = (body: Character) => Math.hypot(this.player.x - body.x, this.player.y - body.y) < CELL * 1.5;
    const keeper = this.keepers.find((k) => near(k.body));
    if (dialog.active) {
      dialog.advance();
    } else if (keeper) {
      this.talkToKeeper(keeper);
    } else if (this.npc.visible && near(this.npc)) {
      this.npc.face(directionToward(this.player.x - this.npc.x, this.player.y - this.npc.y));
      dialog.say(NPC_LINES);
    } else {
      attack();
    }
  }

  /** A shopkeeper greets the player, then the counter opens. A guest's gold lives on the host, so guests only chat for now. */
  private talkToKeeper({ shop: id, body }: { shop: string; body: Character }) {
    const shop = SHOPS[id];
    if (!shop) return;
    body.face(directionToward(this.player.x - body.x, this.player.y - body.y));
    if (this.role === 'client') {
      this.ui.dialog.say([shop.greeting[0] ?? '', 'The counter is only open to whoever is hosting the game, for now.']);
      return;
    }
    this.ui.dialog.say(shop.greeting, () => this.ui.shop.show(shop, this.hero));
  }

  /** A player's action button (host and solo): open a chest within reach, pick something up, otherwise attack. */
  private act(p: Player) {
    const { arena } = this;
    const chest = arena.chests.find(
      (c) => !c.opened && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CHEST_REACH,
    );
    if (chest) return this.openChest(p, chest);
    const loose = p === arena.local && this.nearestGround(p);
    if (loose) this.pickUp(p, loose);
    else this.sim.attack(p);
  }

  private nearestGround(p: Player): GroundItem | undefined {
    let best: GroundItem | undefined;
    let bestDist = PICKUP_REACH;
    for (const g of this.ground) {
      const d = Math.hypot(p.body.x - g.x, p.body.y - g.y);
      if (d < bestDist) [best, bestDist] = [g, d];
    }
    return best;
  }

  /** Pick an item up off the ground into the pack (it stays put if the pack is full). */
  private pickUp(p: Player, g: GroundItem) {
    const { effects } = this.arena;
    if (!addToPack(p.hero, g.item)) return effects.add(floatText(g.x, g.y - 22, 'Pack full', 0xff8a7a));
    const [x, y, name] = [g.x, g.y, g.item.name];
    this.ground.splice(this.ground.indexOf(g), 1);
    g.destroy({ children: true }); // also takes it off the world layer
    effects.add(floatText(x, y - 22, name, 0xffd34d));
  }

  /** Put an item on the ground a step ahead of the local hero (or at their feet if something is in the way). */
  private dropItem(item: Item) {
    const { x, y, facing } = this.player;
    const [vx, vy] = DIR_VEC[facing];
    const fits = this.arena.collision.fitsMap(x + vx * 20, y + vy * 20);
    const g = new GroundItem(item, fits ? x + vx * 20 : x, fits ? y + vy * 20 : y);
    this.ground.push(g);
    this.world.layer.addChild(g);
  }

  private openChest(p: Player, chest: Chest) {
    const { sim, arena } = this;
    const loot = CHEST_LOOTS[chest.loot];
    if (!loot) return;
    const found = collect(p.hero, loot, p === arena.local); // only the local player has a pack screen
    const [x, y] = [chest.x, chest.y - CELL];
    if (found.refused) {
      sim.text(x, y - 14, found.text, 0xff8a7a);
      return;
    }
    chest.setOpen(true);
    sim.fx('levelUp', x, y + 6);
    sim.text(x, y - 14, found.text, 0xffd34d);
    if (found.gear) p.body.setSheet(arena.wardrobe.sheet(playerOutfit(p.slot, p.hero)));
    if (found.levels) {
      sim.text(p.body.x, p.body.y - 62, 'LEVEL UP!', 0xffb13f);
      sim.fx('levelUp', p.body.x, p.body.y - 14);
    }
  }

  /** Redraw the local hero for what it now wears (after the pack or a shop changed it). */
  private refreshLook() {
    const { local, wardrobe } = this.arena;
    this.player.setSheet(wardrobe.sheet(playerOutfit(local.slot, this.hero)));
  }

  /** Put gear on the hero: stats follow the item and the sprite is recomposed with its parts. */
  equip(item: Item) {
    equip(this.hero, item);
    this.refreshLook();
  }
}
