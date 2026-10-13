import type { Container, Renderer } from 'pixi.js';
import type { Sprites, Zone } from '../assets';
import type { Aim } from '../core/aim';
import { ComboReader } from '../core/combo';
import { actionDown, actionPressed, mapPressed, menuPressed, pointerAim } from '../core/controls';
import { directionToward } from '../core/direction';
import type { ZoneState } from './ZoneState';
import type { Scene } from '../core/Scene';
import type { TouchControls } from '../core/touch';
import type { Character } from '../entities/Character';
import type { Chest } from '../entities/Chest';
import type { Mob } from '../entities/Mob';
import type { Command, Player } from '../entities/Player';
import { NO_COMMAND } from '../entities/Player';
import type { Dialog } from '../hud/Dialog';
import type { Hud } from '../hud/Hud';
import { Atlas } from '../map/explored';
import { MapOverlay } from '../hud/MapOverlay';
import { AreaBanner } from '../hud/AreaBanner';
import { GuideArrow } from '../entities/GuideArrow';
import { guideFor } from '../systems/guide';
import { zoneName } from '../systems/places';
import type { Menu } from '../hud/Menu';
import type { ShopCounter } from '../hud/ShopCounter';
import type { TradeUi } from '../hud/Trade';
import { CELL } from '../map/types';
import { packKeys } from '../net/protocol';
import type { Role, Session } from '../net/session';
import { CHEST_LOOTS, collect } from '../systems/chests';
import type { Hero, Item } from '../systems/combat';
import type { QuestSite } from '../entities/QuestSite';
import { equip } from '../systems/items';
import { lecternIn, lecternPages } from '../systems/lectern';
import { signLines, signNear } from '../systems/signs';
import { heroCombos, TRAINER, trainerTalk, type Skill } from '../systems/skills';
import { petSound } from '../systems/pets';
import { QUEST_GIVER, GIVERS, giverMark, mobKey, progressOf, recordSite, siteNote, siteOpen } from '../systems/quests';
import { SHOPS } from '../systems/shops';
import type { ComboKey } from '../systems/spells';
import type { Precip } from '../systems/weather';
import { DayClock } from '../systems/daynight';
import { NightLayer } from '../entities/NightLayer';
import { Arena } from './overworld/Arena';
import { CHEST_REACH, KEEPER_REACH, PICKUP_REACH, SIGN_REACH, SITE_REACH } from './overworld/constants';
import { Drinking } from './overworld/Drinking';
import { Farming } from './overworld/Farming';
import { Ground } from './overworld/Ground';
import { GuestLink } from './overworld/GuestLink';
import { HostLink } from './overworld/HostLink';
import { PackSync } from './overworld/PackSync';
import { Simulation } from './overworld/Simulation';
import { Trading } from './overworld/Trading';
import { Training } from './overworld/Training';
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
  'Greetings, traveler. Something is wrong with the Vale: the clocks stopped, and the dead walk.',
  'Follow the road south to Lanternrest. Warden Maren keeps its lamp lit, and she has been waiting for a stranger like you.',
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
  private farming: Farming;
  private drinking: Drinking;
  private pack: PackSync;
  private trading: Trading;
  private training: Training;
  private host: HostLink;
  private guest: GuestLink;
  private overlay: MapOverlay;
  private banner = new AreaBanner();
  private announced = ''; // the zone the banner last named
  private visited = new Set<string>(); // zones the local player has been in (the banner says "new area" the first time)
  private arrow = new GuideArrow(); // the quest arrow, over the world and under the door transition
  private marked = new WeakMap<Character, string>(); // the tag last put over each quest giver
  private combos = new ComboReader();
  private comboSet = ''; // the combos the reader is following (a different set starts it afresh)
  private atlas = new Atlas(); // what the players have seen of each zone, for the map
  private dayClock = new DayClock(); // the hour comes from the wall clock, so co-op players agree with nothing sent
  private night = new NightLayer();

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
    this.farming = new Farming(arena, this.sim);
    this.drinking = new Drinking(arena, this.sim);
    this.pack = new PackSync(arena, ui.session, ui, this.ground);
    this.trading = new Trading(arena, ui.session, ui);
    this.host = new HostLink(arena, ui.session, this.sim, this.pack, this.trading);
    this.guest = new GuestLink(arena, ui.session, visuals, this.zones, this.ground, this.pack, this.trading, ui, say);
    this.pack.sendSoon = () => this.guest.sendSoon();
    this.training = new Training(arena, this.zones, this.sim, say);
    this.sim.trialDefeat = (p) => this.training.fail(p);
    this.pack.startTrial = (p, skill) => this.training.start(p, skill);
    this.pack.levelUp = (p) => this.sim.levelUp(p);

    this.zones.addHome(zone);
    this.zones.root.addChildAt(this.arrow, 1);
    this.zones.root.addChildAt(this.night, 1); // over the world, under the quest arrow and the door transition
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

  /** Jump to an hour of the day, 0 to 24 (playtest scripts; this client only, the clock otherwise follows real time). */
  setHour(hour: number) {
    this.dayClock.setHour(hour);
  }

  enter() {
    this.ui.menu.inventory.attach({ apply: (op) => this.pack.localOp(op) });
    this.ui.menu.magic.attach({ equip: (wanted) => this.pack.setLoadout(wanted), zone: () => this.arena.zone.name });
    // Opened from a join link (#join=...): show the Online tab with the game code already filled in.
    if (this.ui.session.urlCode) this.ui.menu.toggle(this.hero, 'online');
  }

  exit() {
    this.ui.menu.inventory.attach(null);
    this.ui.menu.magic.attach(null);
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
    arena.zone.follow(width, height, this.player.x, this.player.y, 0, true);
  }

  update(dt: number) {
    const { menu, shop, dialog, hud, session, trade } = this.ui;
    const { arena } = this;
    this.syncRole(session.role);
    arena.clock += dt;
    const online = arena.role !== 'solo';
    // The map shows the open-air zone you are in, as far as it has been explored; rooms have none.
    const outdoors = !arena.zone.data.indoor;
    this.overlay.setAvailable(outdoors);
    if (outdoors) {
      const seen = this.atlas.of(arena.zone.name, arena.zone.data);
      // Everyone in this zone uncovers the map around them (a guest only knows the players in its own zone).
      for (const p of arena.players()) if (p.body.visible) seen.reveal(p.body.x, p.body.y);
      this.overlay.setZone(arena.zone.data, seen, arena.zone.name);
    }
    menu.setOnline(online);
    this.trading.sync(dt, online);
    if (outdoors && !menu.open && !dialog.active && mapPressed()) this.overlay.toggle();
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
      hud.setPrompt(null);
      if (!online) return; // solo: the world is paused. Online it keeps running behind the menu (the other player can't be paused).
    }

    if (arena.role === 'client') this.updateClient(dt);
    else this.updateSimulation(dt);
    this.zones.prefetch(dt);
    this.zones.retire(dt);

    // What the local player sees: the zone they are in (a door above may just have changed it).
    const z = arena.zone;
    z.effects.update(dt);
    this.night.update(this.dayClock.time(), !z.data.indoor, arena.screen.width, arena.screen.height);
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
    this.updateQuests(z, dt);
    for (const w of z.wells) w.update(dt);
    this.announceArea();
    this.pointTheWay(z, dt);
    for (const k of z.keepers) k.body.animate(dt * 1000, false);
    for (const pet of z.pets) {
      pet.update(dt);
      pet.zIndex = pet.y;
    }
    for (const item of z.ground) {
      item.update(dt, Math.hypot(this.player.x - item.x, this.player.y - item.y) < PICKUP_REACH);
    }
    for (const body of arena.bodies()) body.zIndex = body.y;
    hud.update(this.hero, this.combos.typed, this.arena.zone.name);
    hud.setPrompt(
      !this.ui.dialog.active && !this.zones.transition.busy && this.player.visible
        ? (this.farming.prompt(arena.local) ?? this.drinking.prompt(arena.local))
        : null,
    );
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
    z.follow(arena.screen.width, arena.screen.height, this.player.x, this.player.y, dt);
    // The new zone settles in from a closer shot as the iris opens (each biome has its own weather), about the hero.
    const punch = this.zones.transition.update(dt, arena.screen, this.zones.heroOnScreen());
    if (punch.scale !== 1 || punch.x !== 0 || punch.y !== 0)
      z.camera.punch(punch.scale, this.player.x, this.player.y, punch.x, punch.y);
    z.world.update(z.camera.view(arena.screen.width, arena.screen.height)); // build the map around the view
    this.zones.update(dt); // the zones beside it, and the drawing of a player who has just crossed a border
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
          this.farming.update();
          for (const p of present) {
            const combo = commandOf(p).combo;
            if (combo !== undefined) sim.combo(p, combo);
          }
          if (z !== here) z.effects.update(dt); // the local zone's effects are updated with the rest of what is drawn
        });
      }
      // The zones drawn beside this one keep their mobs wandering, so nothing looks frozen across the border.
      const occupied = new Set(arena.occupiedZones());
      for (const z of this.zones.lookouts()) {
        if (occupied.has(z)) continue;
        arena.inZone(z, () => {
          for (const mob of z.mobs) mob.update(dt, z.mobWorld);
        });
      }
      this.training.update(dt);
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
    const combos = heroCombos(this.hero, this.arena.zone.name).map((c) => c.keys); // the wand or tome in hand, then the skills ready
    const set = combos.join();
    if (reading || this.comboSet !== set) {
      this.combos.reset();
      this.comboSet = set;
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
    const stand = lecternIn(arena.zone.name);
    const lectern = stand && near({ x: stand.x, y: stand.y - CELL / 2 }, CELL * 1.5);
    const sign = signNear(arena.zone.data.signs, this.player.x, this.player.y, SIGN_REACH);
    const keeper = arena.keepers.find((k) => near(k.body, KEEPER_REACH));
    const npc = arena.npc;
    const giver = arena.givers.find((g) => near(g.body, KEEPER_REACH));
    const site = arena.sites.find((s) => s.visible && near(s, SITE_REACH));
    const pet = arena.pets.find((p) => near(p));
    if (dialog.active) {
      dialog.advance();
    } else if (lectern) {
      dialog.say(lecternPages());
    } else if (sign) {
      // Read like talking to an NPC: close enough is enough, and the hero turns to face the board.
      this.player.face(
        directionToward((sign.col + 0.5) * CELL - this.player.x, (sign.row + 0.5) * CELL - this.player.y),
      );
      dialog.say(signLines(sign.ways));
    } else if (keeper) {
      this.talkToKeeper(keeper);
    } else if (giver) {
      giver.body.face(directionToward(this.player.x - giver.body.x, this.player.y - giver.body.y));
      if (giver.giver === TRAINER) this.talkToTrainer();
      else this.pack.talkToGiver(giver.giver);
    } else if (site) {
      // Touching a site the quest wants: read what it says, and let the action count it (the host decides, for a guest).
      dialog.say(siteNote(site.kind, progressOf(this.hero)));
      attack();
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

  /**
   * The training wizard tells the player what they know and what is next; when a trial follows, it begins once the last line
   * is dismissed (solo and the host send the player there; a guest asks the host).
   */
  private talkToTrainer() {
    const { lines, trial } = trainerTalk(this.hero);
    this.ui.dialog.say(lines, trial ? () => this.beginTrial(trial) : undefined);
  }

  private beginTrial(skill: Skill) {
    const { arena } = this;
    if (arena.role === 'client') {
      this.pack.askTrial(TRAINER);
      return;
    }
    const refused = this.training.start(arena.local, skill);
    if (refused) this.ui.dialog.say([refused]);
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
    if (this.farming.tend(p)) return;
    if (this.drinking.well(p)) return;
    const site = this.arena.sites.find(
      (s) =>
        Math.hypot(p.body.x - s.x, p.body.y - s.y) < SITE_REACH &&
        siteOpen(p.hero, s.kind, this.arena.zone.name, s.index),
    );
    if (site) return this.touchSite(p, site);
    const loose = this.ground.nearest(p);
    if (loose) this.ground.pickUp(p, loose);
    else if (!this.drinking.water(p)) this.sim.attack(p);
  }

  /** A player touches a quest site that their quest wants: it counts once for them, and the world sees the sparkle. */
  private touchSite(p: Player, site: QuestSite) {
    const progress = recordSite(p.hero, site.kind, this.arena.zone.name, site.index);
    if (!progress) return;
    this.sim.fx('levelUp', site.x, site.y - 6);
    this.sim.questNote(p, progress);
  }

  /** The quest markers for the local player: "!" over the giver with a task to hand out, "?" when one can be handed in; sites show only while wanted. */
  private updateQuests(z: ZoneState, dt: number) {
    const hero = this.hero;
    const quest = giverMark(hero);
    for (const g of z.givers) {
      const mark = g.giver === QUEST_GIVER ? quest : ''; // only the warden has tasks to hand out
      const text = mark ? `${mark} ${GIVERS[g.giver]?.tag ?? ''}` : (GIVERS[g.giver]?.tag ?? '');
      if (this.marked.get(g.body) === text) continue;
      this.marked.set(g.body, text);
      g.body.setTag(text, mark ? 0xffd34d : 0xffffff);
    }
    for (const s of z.sites) {
      s.setOpen(siteOpen(hero, s.kind, z.name, s.index));
      s.update(dt);
    }
    for (const g of z.givers) g.body.animate(dt * 1000, false);
  }

  /** The big area name in the top middle, when the local player arrives somewhere (once the door transition is over). */
  private announceArea() {
    const name = this.arena.zone.name;
    if (name === this.announced || this.zones.transition.busy) return;
    this.announced = name;
    const fresh = !this.visited.has(name);
    this.visited.add(name);
    this.banner.show(zoneName(name), fresh && !this.arena.zone.data.indoor ? 'New area discovered' : '');
  }

  /** The quest arrow: points from the hero at where the quest leads (a thing in this zone, or the door towards it). */
  private pointTheWay(z: ZoneState, dt: number) {
    const hide = this.zones.transition.busy || !this.player.visible;
    const warden = z.givers.find((g) => g.giver === QUEST_GIVER);
    const world = {
      zone: z.name,
      doors: z.data.doors,
      sites: z.sites.map((s) => ({ kind: s.kind, index: s.index, x: s.x, y: s.y })),
      mobs: z.mobs.flatMap((m) => {
        const key = m.alive ? mobKey(m.kind) : undefined;
        return key ? [{ key, x: m.body.x, y: m.body.y }] : [];
      }),
      giver: warden ? { x: warden.body.x, y: warden.body.y } : null,
    };
    const guide = hide ? null : guideFor(this.hero, world, this.player);
    const { camera } = z;
    const at = (x: number, y: number) => ({ x: z.world.x + x * camera.zoom, y: z.world.y + y * camera.zoom });
    // A person or a door gets the arrow; something to be found is only an area on the map (M).
    const known = guide && guide.radius === undefined ? guide : null;
    this.arrow.update(
      dt,
      at(this.player.x, this.player.y - 20),
      known && at(known.x, known.y - 12),
      known?.label ?? '',
    );
    this.overlay.setGuide(guide);
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
