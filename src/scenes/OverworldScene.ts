import type { Container, Renderer } from 'pixi.js';
import type { Sprites, Zone } from '../assets';
import type { Aim } from '../core/aim';
import { ComboReader } from '../core/combo';
import { actionDown, actionPressed, mapPressed, menuPressed, pointerAim } from '../core/controls';
import { directionToward } from '../core/direction';
import type { Scene } from '../core/Scene';
import type { TouchControls } from '../core/touch';
import type { Character } from '../entities/Character';
import type { Chest } from '../entities/Chest';
import type { Mob } from '../entities/Mob';
import type { Command, Player } from '../entities/Player';
import { NO_COMMAND } from '../entities/Player';
import type { Dialog } from '../hud/Dialog';
import type { Hud } from '../hud/Hud';
import { MapOverlay } from '../hud/MapOverlay';
import type { Menu } from '../hud/Menu';
import type { ShopCounter } from '../hud/ShopCounter';
import type { TradeUi } from '../hud/Trade';
import { CELL } from '../map/types';
import { packKeys } from '../net/protocol';
import type { Role, Session } from '../net/session';
import { CHEST_LOOTS, collect } from '../systems/chests';
import type { Hero, Item } from '../systems/combat';
import { equip } from '../systems/items';
import { petSound } from '../systems/pets';
import { SHOPS } from '../systems/shops';
import type { ComboKey } from '../systems/spells';
import type { Precip } from '../systems/weather';
import { Arena } from './overworld/Arena';
import { CHEST_REACH, KEEPER_REACH, PICKUP_REACH } from './overworld/constants';
import { Ground } from './overworld/Ground';
import { GuestLink } from './overworld/GuestLink';
import { HostLink } from './overworld/HostLink';
import { PackSync } from './overworld/PackSync';
import { Simulation } from './overworld/Simulation';
import { Trading } from './overworld/Trading';
import { Visuals } from './overworld/Visuals';
import { Zones, type ZoneLoader, type ZoneUnloader } from './overworld/Zones';

export type { ZoneLoader, ZoneUnloader };

const aimOf = (aim: Aim | null) => (aim ? { aim } : {});

/** The direction presses a combo is made of, in the order a frame with several is read. */
const COMBO_PRESSES: readonly (readonly [ComboKey, 'up' | 'down' | 'left' | 'right'])[] = [
  ['u', 'up'],
  ['d', 'down'],
  ['l', 'left'],
  ['r', 'right'],
];

const NPC_LINES = [
  'Greetings, traveler. This world is still being drawn.',
  'Soon there will be a story here. Come back later!',
];

/** The HTML overlays shared by every scene. They are created once in main.ts. */
export interface Ui {
  hud: Hud;
  menu: Menu;
  shop: ShopCounter;
  trade: TradeUi;
  dialog: Dialog;
  touch: TouchControls;
  session: Session;
}

/**
 * The overworld: a world of zones with the hero, NPCs, shopkeepers and mobs. This class is the conductor: it owns the frame
 * loop, the HTML overlays (menu, dialog, shop counter, trade window, map) and what the action key does on the spot (talk,
 * open a chest, pick up, attack). The rest lives in `scenes/overworld/`, one concern per file:
 *  - `Arena`: who is in the game (the local player and the friends), the loaded zones, the role, the clock, the weather,
 *    and the "current zone" the rules work in.
 *  - `Zones`: loading zones, taking players through doors, showing the local player's zone.
 *  - `Simulation`: the rules (moving, attacking, damage, lightning, XP, gold, defeat). Solo and host only.
 *  - `Visuals`: drawing what happens (also what a guest is told).
 *  - `Ground`: items lying on the ground. `PackSync`: gold, pack and gear, and a guest's requests to the host.
 *    `Trading`: player-to-player trades.
 *  - `HostLink` / `GuestLink`: the two sides of a co-op game (see net/protocol.ts).
 * It runs in one of three roles (`Session.role`): solo, host (the simulation plus up to three friends' players), or client
 * (no simulation: it sends the local controls to the host and draws the host's snapshots). `arena.local` is the player at
 * this keyboard in every role; `arena.remotes` are the others by player number. Player 0 is the host.
 */
export class OverworldScene implements Scene {
  private arena: Arena;
  private zones: Zones;
  private sim: Simulation;
  private ground: Ground;
  private pack: PackSync;
  private trading: Trading;
  private host: HostLink;
  private guest: GuestLink;
  private overlay: MapOverlay;
  private combos = new ComboReader();
  private comboSet: Item | null = null; // the weapon the reader is following (a different one starts it afresh)

  constructor(
    zone: Zone,
    sprites: Sprites,
    private ui: Ui,
    loadZone: ZoneLoader,
    unloadZone: ZoneUnloader,
    renderer: Renderer,
  ) {
    const arena = (this.arena = new Arena(sprites.wardrobe));
    this.zones = new Zones(arena, sprites, loadZone, unloadZone, ui, renderer);
    const visuals = new Visuals(arena);
    const say = (lines: string[]) => ui.dialog.say(lines);
    // The simulation reports what a friend should see through the host link (which only records it while hosting).
    this.sim = new Simulation(arena, visuals, this.zones, (e) => this.host.emit(e), say);
    this.zones.makeMobWorld = (z) => this.sim.mobWorldFor(z);
    this.ground = new Ground(arena, this.sim);
    this.pack = new PackSync(arena, ui.session, ui, this.ground);
    this.trading = new Trading(arena, ui.session, ui);
    this.host = new HostLink(arena, ui.session, this.sim, this.pack, this.trading);
    this.guest = new GuestLink(arena, ui.session, visuals, this.zones, this.ground, this.pack, this.trading, ui, say);
    this.pack.sendSoon = () => this.guest.sendSoon();

    this.zones.addHome(zone);
    this.overlay = new MapOverlay();
    ui.shop.onGearChange = () => arena.refreshLook();
    ui.shop.trader = () => this.pack.trader();
  }

  get root(): Container {
    return this.zones.root;
  }

  // What playtest scripts poke at (see .claude/skills/playtest): the local player's body and hero, the zone's mobs and NPC,
  // the role and the friends.
  get player(): Character {
    return this.arena.player;
  }

  get hero(): Hero {
    return this.arena.hero;
  }

  get mobs(): Mob[] {
    return this.arena.mobs;
  }

  get npc(): Character | null {
    return this.arena.npc;
  }

  get role(): Role {
    return this.arena.role;
  }

  get remotes(): Map<number, Player> {
    return this.arena.remotes;
  }

  /** Start some weather in the zone you are in right now (playtest scripts); otherwise it changes at random. */
  setWeather(precip: Precip | null, windLevel = 0) {
    this.arena.zone.weather?.force(precip, windLevel);
  }

  enter() {
    this.ui.menu.inventory.attach({ apply: (op) => this.pack.localOp(op) });
    // Opened from a join link (#join=...): show the Online tab with the game code already filled in.
    if (this.ui.session.urlCode) this.ui.menu.toggle(this.hero, 'online');
  }

  exit() {
    this.ui.menu.inventory.attach(null);
    this.overlay.setAvailable(false);
    this.ui.dialog.close();
    this.ui.shop.close();
    if (this.ui.menu.open) this.ui.menu.toggle(this.hero);
    this.zones.dispose();
  }

  resize(width: number, height: number) {
    const { arena } = this;
    arena.screen = { width, height };
    arena.camera.resize(width, height);
    this.ui.dialog.layout(arena.screen, this.ui.touch.rects());
    arena.zone.follow(width, height, this.player.x, this.player.y);
  }

  update(dt: number) {
    const { menu, shop, dialog, hud, session, trade } = this.ui;
    const { arena } = this;
    this.syncRole(session.role);
    arena.clock += dt;
    const online = arena.role !== 'solo';
    // The map shows the open-air zone you are in; rooms have none.
    this.overlay.setAvailable(online && !arena.zone.data.indoor);
    if (!arena.zone.data.indoor) this.overlay.setZone(arena.zone.data);
    menu.setOnline(online);
    this.trading.sync(dt, online);
    if (online && !menu.open && !dialog.active && mapPressed()) this.overlay.toggle();
    if (!dialog.active && menuPressed()) {
      if (trade.open) this.trading.command({ c: 'cancel' });
      else if (shop.open) shop.close();
      else menu.toggle(this.hero);
    }
    if (!dialog.active && actionPressed('inventory') && !trade.open) {
      if (shop.open) shop.close();
      else menu.toggleInventory(this.hero);
    }
    if (menu.open || shop.open || trade.open) {
      if (menu.open) menu.update();
      else if (shop.open) shop.update();
      hud.update(this.hero); // gold changes at the counter
      if (!online) return; // solo: the world is paused. Online it keeps running behind the menu (the other player can't be paused).
    }

    if (arena.role === 'client') this.updateClient(dt);
    else this.updateSimulation(dt);
    this.zones.prefetch(dt);
    this.zones.retire(dt);

    // What the local player sees: the zone they are in (a door above may just have changed it).
    const z = arena.zone;
    z.effects.update(dt);
    if (z.weatherLayer && z.ambient && z.weather) {
      // This biome's weather (the simulation rolls it, in every zone someone is in; a guest is told by the host).
      z.ambient.wind = z.weather.wind;
      z.weatherLayer.update(dt, z.weather, z.camera.view(arena.screen.width, arena.screen.height));
      z.ambient.update(dt, this.player, [
        ...arena.players().map((p) => p.body),
        ...z.mobs.filter((m) => m.alive).map((m) => m.body),
      ]);
    }

    z.npc?.animate(dt * 1000, false);
    for (const k of z.keepers) k.body.animate(dt * 1000, false);
    for (const pet of z.pets) {
      pet.update(dt);
      pet.zIndex = pet.y;
    }
    for (const item of z.ground) {
      item.update(dt, Math.hypot(this.player.x - item.x, this.player.y - item.y) < PICKUP_REACH);
    }
    for (const body of arena.bodies()) body.zIndex = body.y;
    hud.update(this.hero, this.combos.typed);
    if (this.overlay.open) {
      const pin = (p: Player) => ({ slot: p.slot, x: p.body.x, y: p.body.y });
      // A player the host has not yet placed (their body is still hidden) has no position to show.
      this.overlay.update(
        pin(arena.local),
        arena
          .players()
          .filter((p) => p !== arena.local && p.body.visible && p.zone === arena.zone.name)
          .map(pin),
      );
    }
    z.follow(arena.screen.width, arena.screen.height, this.player.x, this.player.y);
    // A slide shifts the whole new zone in, its sky with it (each biome has its own weather).
    const shift = this.zones.transition.update(dt, arena.screen, this.zones.heroOnScreen());
    z.camera.shift(shift.x, shift.y);
    z.world.update(z.camera.view(arena.screen.width, arena.screen.height)); // build the map around the view
  }

  /**
   * Solo and host: the authoritative game. The host additionally runs its friends' players and sends them snapshots.
   * Only zones with a player in them are simulated; the rest stand still until someone walks in.
   */
  private updateSimulation(dt: number) {
    const { menu, shop, dialog, trade } = this.ui;
    const { arena, sim } = this;
    const host = arena.role === 'host';
    if (host) {
      this.host.reconcile();
      this.pack.handleRequests();
      this.trading.handleSteps(dt);
    }
    // Reading a dialog or the menu: the player stands still. So do they while a door transition plays, and only take the
    // next door once it is over.
    const busy = this.zones.transition.busy;
    const reading = menu.open || shop.open || trade.open || dialog.active || busy;
    const raw = this.readCommand(dt, reading);
    const cmd = reading ? { ...raw, dx: 0, dy: 0 } : raw;
    const guests = [...arena.remotes.values()].map((p) => ({ p, cmd: this.host.command(p) }));
    const commandOf = (p: Player) => (p === arena.local ? cmd : (guests.find((g) => g.p === p)?.cmd ?? NO_COMMAND));
    const here = arena.zone;

    if (host || !dialog.active) {
      for (const z of arena.occupiedZones()) {
        arena.inZone(z, () => {
          const present = arena.players();
          for (const p of present) sim.updatePlayer(p, commandOf(p), dt);
          for (const mob of z.mobs) mob.update(dt, z.mobWorld);
          this.ground.age(dt);
          sim.weather(dt);
          for (const p of present) {
            const combo = commandOf(p).combo;
            if (combo !== undefined) sim.combo(p, combo);
          }
          if (z !== here) z.effects.update(dt); // the local zone's effects are updated with the rest of what is drawn
        });
      }
    } else {
      this.player.animate(dt * 1000, false); // the world is frozen while talking
    }
    if (!menu.open && !shop.open && !trade.open && !busy) this.handleAction(cmd.act, () => this.act(arena.local));
    for (const g of guests) if (g.cmd.act) arena.inZone(arena.zoneOf(g.p), () => this.act(g.p));
    if (!reading) this.zones.checkDoors(arena.local);
    for (const g of guests) this.zones.checkDoors(g.p);
    if (host) {
      this.host.broadcast(dt);
      this.pack.send(dt);
      this.trading.send(dt);
    }
  }

  /** Guest: no simulation. Show what the host last said, and tell it what this player is doing. */
  private updateClient(dt: number) {
    const { menu, shop, dialog, trade } = this.ui;
    this.guest.update(dt);
    const busy = this.zones.transition.busy;
    const reading = menu.open || shop.open || trade.open || dialog.active || busy;
    const cmd = this.readCommand(dt, reading);
    if (!menu.open && !shop.open && !trade.open && !busy) this.handleAction(cmd.act, () => this.guest.pressAction());
    if (cmd.combo !== undefined) this.guest.castCombo(cmd.combo);
    this.guest.sendInput(dt, reading ? 0 : packKeys(cmd.dx, cmd.dy), cmd.aim);
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

  /** The local player's controls this frame. While `reading` (a menu, a dialog) nothing typed counts toward a combo. */
  private readCommand(dt: number, reading: boolean): Command {
    const combo = this.readCombo(dt, reading);
    return {
      dx: (actionDown('right') ? 1 : 0) - (actionDown('left') ? 1 : 0),
      dy: (actionDown('down') ? 1 : 0) - (actionDown('up') ? 1 : 0),
      act: actionPressed('attack'),
      ...(combo === undefined ? {} : { combo }),
      ...aimOf(pointerAim(this.zones.heroOnScreen())),
    };
  }

  /**
   * Feed the direction presses of this frame to the combo reader and say which combo of the wand or tome in hand was
   * just finished, if any. Presses are the move actions as bound, and the on-screen pad (the D-pad also moves the hero).
   */
  private readCombo(dt: number, reading: boolean): number | undefined {
    const combos = this.hero.weapon.focus?.combos.map((c) => c.keys) ?? [];
    if (reading || this.comboSet !== this.hero.weapon) {
      this.combos.reset();
      this.comboSet = this.hero.weapon;
    }
    if (reading) return undefined;
    this.combos.tick(dt);
    let done: number | undefined;
    for (const [key, action] of COMBO_PRESSES) {
      if (!actionPressed(action)) continue;
      const i = this.combos.press(key, combos);
      if (i >= 0) done = i;
    }
    return done;
  }

  /** The local player's action button: advance the dialog, talk when next to the NPC or a shopkeeper, otherwise `attack`. */
  private handleAction(pressed: boolean, attack: () => void) {
    if (!pressed) return;
    const { dialog } = this.ui;
    const { arena } = this;
    const near = (body: { x: number; y: number }, reach = CELL * 1.5) =>
      Math.hypot(this.player.x - body.x, this.player.y - body.y) < reach;
    const keeper = arena.keepers.find((k) => near(k.body, KEEPER_REACH));
    const npc = arena.npc;
    const pet = arena.pets.find((p) => near(p));
    if (dialog.active) {
      dialog.advance();
    } else if (keeper) {
      this.talkToKeeper(keeper);
    } else if (pet) {
      pet.attend(this.player.x, this.player.y);
      dialog.say([petSound(pet.kind, pet.talks++)]);
    } else if (npc?.visible && near(npc)) {
      npc.face(directionToward(this.player.x - npc.x, this.player.y - npc.y));
      dialog.say(NPC_LINES);
    } else {
      attack();
    }
  }

  /** A shopkeeper greets the player, then the counter opens (for a guest the host settles each trade). */
  private talkToKeeper({ shop: id, body }: { shop: string; body: Character }) {
    const shop = SHOPS[id];
    if (!shop) return;
    body.face(directionToward(this.player.x - body.x, this.player.y - body.y));
    this.ui.dialog.say(shop.greeting, () => this.ui.shop.show(shop, this.hero));
  }

  /** A player's action button (host and solo): open a chest within reach, pick something up, otherwise attack. */
  private act(p: Player) {
    const chest = this.arena.chests.find(
      (c) => !c.opened && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CHEST_REACH,
    );
    if (chest) return this.openChest(p, chest);
    const loose = this.ground.nearest(p);
    if (loose) this.ground.pickUp(p, loose);
    else this.sim.attack(p);
  }

  private openChest(p: Player, chest: Chest) {
    const { sim, arena } = this;
    const loot = CHEST_LOOTS[chest.loot];
    if (!loot) return;
    const found = collect(p.hero, loot);
    const [x, y] = [chest.x, chest.y - CELL];
    if (found.refused) {
      sim.text(x, y - 14, found.text, 0xff8a7a);
      return;
    }
    chest.setOpen(true);
    sim.fx('levelUp', x, y + 6);
    sim.text(x, y - 14, found.text, 0xffd34d);
    if (found.gear) arena.refreshLook(p);
    if (found.levels) {
      sim.text(p.body.x, p.body.y - 62, 'LEVEL UP!', 0xffb13f);
      sim.fx('levelUp', p.body.x, p.body.y - 14);
    }
  }

  /** Put gear on the hero: stats follow the item and the sprite is recomposed with its parts. */
  equip(item: Item) {
    equip(this.hero, item);
    this.arena.refreshLook();
  }
}
