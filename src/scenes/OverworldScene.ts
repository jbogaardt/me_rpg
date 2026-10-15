import type { Container, Renderer } from 'pixi.js';
import { enabled, flag } from '../systems/capabilities';
import type { Sprites, Zone } from '../assets';
import type { Aim } from '../core/aim';
import { COMBO_WINDOW, COMBO_WINDOW_TOUCH, ComboReader } from '../core/combo';
import {
  actionDown,
  actionPressed,
  actionTouchedOnly,
  clickedAt,
  mapPressed,
  menuPressed,
  pointerAim,
  stopPressed,
} from '../core/controls';
import { directionToward } from '../core/direction';
import type { ZoneState } from './ZoneState';
import type { Scene } from '../core/Scene';
import type { TouchControls } from '../core/touch';
import type { Character } from '../entities/Character';
import type { Chest } from '../entities/Chest';
import type { Crop } from '../entities/Crop';
import type { Mob } from '../entities/Mob';
import type { Command, Player } from '../entities/Player';
import { NO_COMMAND } from '../entities/Player';
import type { Dialog } from '../hud/Dialog';
import type { Choices } from '../hud/Choices';
import type { ContentManager } from '../content/ContentManager';
import type { Hud } from '../hud/Hud';
import { Atlas } from '../map/explored';
import { MapOverlay } from '../hud/MapOverlay';
import { AreaBanner } from '../hud/AreaBanner';
import { DRINK_KEY, HarvestButtons, type HarvestSpot } from '../hud/HarvestButtons';
import { GuideArrow } from '../entities/GuideArrow';
import { SEARCH_RADIUS, guideFor, searchMiddle, type Guide } from '../systems/guide';
import { zoneName } from '../systems/places';
import type { Menu } from '../hud/Menu';
import type { PartyRow } from '../hud/Party';
import { PLAYER_COLORS, playerName } from '../systems/looks';
import type { ShopCounter } from '../hud/ShopCounter';
import type { TradeUi } from '../hud/Trade';
import { CELL } from '../map/types';
import { packKeys } from '../net/protocol';
import type { Role, Session } from '../net/session';
import { CHEST_LOOTS, collect } from '../systems/chests';
import { harvest, rainWaters, waterWith } from '../systems/crops';
import { drinkableNear, thirsty } from '../systems/needs';
import type { Hero, Item } from '../systems/combat';
import type { QuestSite } from '../entities/QuestSite';
import { equip } from '../systems/items';
import { lecternIn, lecternPages } from '../systems/lectern';
import { signLines, signNear } from '../systems/signs';
import { heroCombos, TRAINER, trainerTalk, type Skill } from '../systems/skills';
import { petSound } from '../systems/pets';
import {
  CHAPTERS,
  GIVERS,
  QUESTS,
  currentQuest,
  giverMark,
  mobKey,
  progressOf,
  questStatus,
  recordSite,
  siteNote,
  siteOpen,
  startsChapter,
} from '../systems/quests';
import { SHOPS } from '../systems/shops';
import type { ComboKey } from '../systems/spells';
import type { Precip } from '../systems/weather';
import { DayClock } from '../systems/daynight';
import { NightLayer } from '../entities/NightLayer';
import { Arena } from './overworld/Arena';
import { CHEST_REACH, CROP_REACH, KEEPER_REACH, PICKUP_REACH, SIGN_REACH, SITE_REACH } from './overworld/constants';
import { Ground } from './overworld/Ground';
import { GuestLink } from './overworld/GuestLink';
import { HostLink } from './overworld/HostLink';
import { PackSync } from './overworld/PackSync';
import { canDrink, foeNear, Simulation } from './overworld/Simulation';
import { Trading } from './overworld/Trading';
import { Training } from './overworld/Training';
import { Visuals } from './overworld/Visuals';
import { Zones, type ZoneLoader, type ZoneUnloader } from './overworld/Zones';
import { Scenario } from './overworld/Scenario';
import { Story } from './overworld/Story';
import { DmDesk } from './overworld/DmDesk';
import { DmPowers } from './overworld/DmPowers';
import { DmBar } from '../hud/DmBar';
import { DmCard } from '../hud/DmCard';
import { DmPrompts } from './overworld/DmPrompts';
import { DmTasks } from './overworld/DmTasks';
import { DmRevive } from './overworld/DmRevive';
import { DmPossession } from './overworld/DmPossession';
import { DmNarration } from './overworld/DmNarration';
import { taskText } from '../systems/dmTasks';
import { RELIC_KIND } from '../systems/dmQuests';
import { VotePanel } from '../hud/VotePanel';
import type { World } from '../content/world';
import { particleEffect } from '../entities/ParticleEffect';
import { floatText } from '../entities/effects';

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
  choices: Choices;
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
  private training: Training;
  private scenario: Scenario;
  /** A live world's story, steered by its Dungeon Master (inert for every other world). */
  private liveStory: Story;
  /** The Dungeon Master's controls: weather, time of day, capabilities for everyone, votes. */
  private desk!: DmDesk;
  private votePanel = new VotePanel();
  private dmBar = new DmBar();
  private dmCard = new DmCard();
  private powers!: DmPowers;
  private prompts!: DmPrompts;
  private tasks!: DmTasks;
  private narration!: DmNarration;
  private revive!: DmRevive;
  private possession!: DmPossession;
  private host: HostLink;
  private guest: GuestLink;
  private overlay: MapOverlay;
  private banner = new AreaBanner();
  private harvestButtons = new HarvestButtons();
  private guestDrinking = false; // guest: asked the host to let it drink (see `drinking`)
  private announced = ''; // the zone the banner last named
  /** What the story last looked like for the local hero, to notice when it moves: a task done in the field, a chapter begun, the end. */
  private story = { stage: -1, ready: false, chapter: -1 };
  private fieldNote: string[] | null = null; // narration waiting for the dialog to be free
  private titleCard: { title: string; sub: string } | null = null; // a chapter banner waiting its turn
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
    content: ContentManager,
    /** A live world (`?campaign=live`), grown during play by its Dungeon Master; null for every other world. */
    world: World | null = null,
  ) {
    const arena = (this.arena = new Arena(sprites.wardrobe));
    this.zones = new Zones(arena, sprites, loadZone, unloadZone, ui, renderer, content);
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
    this.training = new Training(arena, this.zones, this.sim, say);
    this.sim.trialDefeat = (p) => this.training.fail(p);
    this.pack.startTrial = (p, skill) => this.training.start(p, skill);
    this.pack.levelUp = (p) => this.sim.levelUp(p);
    this.pack.drink = (p, on) => {
      if (on) return this.sim.startDrinking(p);
      this.sim.stopDrinking(p);
      return true;
    };

    // The game starts in the content's start node: its zone (`zone`, loaded by main.ts) shows that node's entities.
    const start = content.startNode;
    this.zones.assign(zone.name, start.node_id);
    this.zones.addHome(zone, start.spawn && { col: start.spawn.x, row: start.spawn.y });
    this.scenario = new Scenario(arena, this.zones, content, ui.choices, say);
    this.liveStory = new Story(arena, this.zones, content, ui.session, world);
    this.liveStory.onOpened = (zone, x, y) => {
      const z = arena.zones.get(zone);
      if (!z) return;
      z.effects.add(floatText(x, y - 24, 'The way opens', 0xffd34d));
      z.effects.add(particleEffect('levelUp', x, y));
    };
    this.liveStory.onGrew = (land) => this.banner.show(land, 'The story leads on to');
    this.liveStory.onCast = (zone, x, y, name) => {
      const z = arena.zones.get(zone);
      if (!z) return;
      z.effects.add(particleEffect('levelUp', x, y - 16));
      z.effects.add(floatText(x, y - 56, name, 0xffd34d));
    };
    this.desk = new DmDesk(arena, ui.session, content, this.dayClock);
    this.votePanel.onChoose = (i) => this.desk.castVote(i);
    this.powers = new DmPowers(arena, this.sim);
    this.tasks = new DmTasks(arena, this.sim, this.desk);
    this.narration = new DmNarration(arena, ui.session, this.desk);
    this.revive = new DmRevive(arena, this.sim, this.zones);
    this.possession = new DmPossession(arena, this.sim);
    this.prompts = new DmPrompts(arena, this.liveStory, this.desk, this.powers, this.dmCard, this.tasks, this.revive);
    this.desk.onSay = (text) => this.dmBar.speak(text, arena.clock); // the DM's words show on every screen
    this.zones.root.addChildAt(this.arrow, 1);
    this.zones.root.addChildAt(this.night, 1); // over the world, under the quest arrow and the door transition
    this.overlay = new MapOverlay();
    this.harvestButtons.onPick = (key) => this.harvestPressed(key);
    ui.shop.onGearChange = () => arena.refreshLook();
    ui.shop.trader = () => this.pack.trader();
  }

  get root(): Container {
    return this.zones.root;
  }

  /**
   * Load a scenario node (public/content/scenarios.json): its biome's zone with the node's entities, the local player
   * taken there, its choices shown. Solo only for now (it throws online).
   */
  loadScenario(nodeId: string): Promise<void> {
    return this.scenario.load(nodeId);
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
    this.ui.menu.party.attach({ rows: () => this.partyRows(), go: (slot) => this.dmGoTo(slot) });
    this.dmBar.attach({
      say: (text) => this.desk.say(text),
      smite: () => this.powers.smite(),
      freeze: () => this.powers.freeze(),
      stop: () => this.powers.toggleStop(),
      reset: () => this.powers.resetZone(),
      card: (kind) => this.prompts.open(kind),
      story: () => this.prompts.hasStory,
      fallen: () => this.revive.fallen.length,
      release: () => this.possession.release(),
      waits: () => this.powers.view(),
    });
    // Opened from a join link (#join=...): show the Online tab with the game code already filled in.
    const { session } = this.ui;
    if ((session.urlCode || session.autoCreate) && enabled('coop')) this.ui.menu.toggle(this.hero, 'online');
    // Moved here to join a host's world, or to host the world just chosen: carry on without another tap.
    if (session.autoJoin && session.urlCode && enabled('coop')) void session.joinGame(session.urlCode);
    else if (session.autoCreate && enabled('coop')) void session.createGame();
  }

  exit() {
    this.ui.menu.inventory.attach(null);
    this.ui.menu.magic.attach(null);
    this.ui.menu.party.attach(null);
    this.dmBar.attach(null);
    this.dmCard.hide();
    this.votePanel.sync(null);
    this.overlay.setAvailable(false);
    this.harvestButtons.clear();
    this.ui.dialog.close();
    this.ui.shop.close();
    if (this.ui.menu.open) this.ui.menu.toggle(this.hero);
    this.zones.dispose();
  }

  resize(width: number, height: number) {
    const { arena } = this;
    // A layout pass with the same window (the touch controls appearing, say) must not re-centre the camera: that
    // would jump it by however far it was still trailing the hero.
    const sameSize = arena.screen.width === width && arena.screen.height === height;
    arena.screen = { width, height };
    arena.camera.resize(width, height);
    this.ui.dialog.layout(arena.screen, this.ui.touch.rects());
    if (!sameSize) arena.zone.follow(width, height, this.player.x, this.player.y, 0, true);
  }

  update(dt: number) {
    const { menu, shop, dialog, hud, session, trade } = this.ui;
    const { arena } = this;
    this.syncRole(session.role);
    arena.clock += dt;
    this.liveStory.update(dt); // a live world: the host sends its log, a guest grows its own from it
    this.desk.update(dt); // the DM's dials, time of day and vote: the host tells its friends, a friend is told
    this.votePanel.sync(this.desk.openVoteForGuest);
    this.powers.update(dt); // the DM's storm in flight and cooldowns
    this.tasks.update(dt);
    this.syncRelic();
    this.revive.update(dt);
    this.narration.update(dt);
    if (arena.local.dm && !this.ui.dialog.active && !this.ui.menu.open && stopPressed()) this.powers.toggleStop();
    document.body.classList.toggle('touch-ui', this.ui.touch.active); // the DM's bar and cards lay out for a phone
    this.dmBar.update(arena.local.dm, arena.clock, arena.timeStopped, this.possession.name, this.ui.touch.active);
    this.prompts.update(dt, this.ui.dialog.active || this.ui.menu.open || this.zones.transition.busy);
    const online = arena.role !== 'solo';
    // The map shows the open-air zone you are in, as far as it has been explored; rooms have none, nor does a campaign
    // without the map capability (it is still explored, so nothing changes if one is played later).
    const outdoors = !arena.zone.data.indoor;
    const here = arena.zone.name;
    const mapShown = outdoors && enabled('map', here);
    this.overlay.setAvailable(mapShown);
    if (outdoors) {
      const seen = this.atlas.of(arena.zone.name, arena.zone.data);
      if (!flag('map', 'fog', here)) seen.revealAll(); // a map without fog shows the whole zone at once
      // Everyone in this zone uncovers the map around them (a guest only knows the players in its own zone).
      for (const p of arena.players()) if (p.body.visible) seen.reveal(p.body.x, p.body.y);
      this.overlay.setZone(arena.zone.data, seen, arena.zone.name);
    }
    menu.setOnline(online, arena.local.dm);
    this.trading.sync(dt, online);
    if (mapShown && !menu.open && !dialog.active && mapPressed()) this.overlay.toggle();
    this.possession.update();
    const click = clickedAt();
    const free = !menu.open && !shop.open && !trade.open && !dialog.active && !this.zones.transition.busy;
    if (click && free && !this.possession.active) this.possession.clickAt(click, this.ui.touch.active); // the DM clicks or taps a foe to possess it
    if (this.dmCard.open && menuPressed())
      this.dmCard.dismiss(); // Esc sends a card away first
    else if (this.possession.active && menuPressed())
      this.possession.release(); // then lets go of a foe, instead of opening the menu
    else if (!dialog.active && menuPressed()) {
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
      hud.update(this.hero, '', arena.zone.name, arena.local.dm, this.taskLine()); // gold changes at the counter
      if (!online) return; // solo: the world is paused. Online it keeps running behind the menu (the other player can't be paused).
    }

    if (arena.role === 'client') this.updateClient(dt);
    else this.updateSimulation(dt);
    this.zones.prefetch(dt);
    this.zones.retire(dt);

    // What the local player sees: the zone they are in (a door above may just have changed it).
    const z = arena.zone;
    z.effects.update(dt);
    this.night.update(
      this.dayClock.time(),
      !z.data.indoor && enabled('dayNight', z.name),
      arena.screen.width,
      arena.screen.height,
    );
    if (z.weatherLayer && z.ambient && z.weather) {
      // This biome's weather (the simulation rolls it, in every zone someone is in; a guest is told by the host).
      z.ambient.wind = z.weather.wind;
      z.weatherLayer.update(dt, z.weather, z.camera.view(arena.screen.width, arena.screen.height));
      z.ambient.update(dt, this.player, [
        ...arena.players().map((p) => p.body),
        ...z.mobs.filter((m) => m.alive).map((m) => m.body),
      ]);
    }

    z.pondBeds.show(z.ponds.levels()); // the ponds drained by drinking, until rain fills them
    z.npc?.animate(dt * 1000, false);
    for (const f of z.folk) f.body.animate(dt * 1000, false);
    this.scenario.update(menu.open || shop.open || trade.open || dialog.active || this.zones.transition.busy);
    this.updateQuests(z, dt);
    this.announceArea();
    this.tellStory();
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
    this.updateHarvestButtons(
      z,
      menu.open || shop.open || trade.open || dialog.active || this.zones.transition.busy || arena.local.dm,
    );
    hud.update(this.hero, this.combos.typed, this.arena.zone.name, this.arena.local.dm, this.taskLine());
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
    this.possession.drive(raw, reading); // a possessed foe takes the DM's keys; the DM's own body stands still
    const cmd = this.possession.active ? NO_COMMAND : reading ? { ...raw, dx: 0, dy: 0 } : raw;
    const guests = [...arena.remotes.values()].map((p) => ({ p, cmd: this.host.command(p) }));
    const commandOf = (p: Player) => (p === arena.local ? cmd : (guests.find((g) => g.p === p)?.cmd ?? NO_COMMAND));
    const here = arena.zone;

    // The Dungeon Master stopped time: only they move; players, foes, plots, weather and the clock on the ground stand still.
    const stopped = host && arena.timeStopped;
    if (host || !dialog.active) {
      for (const z of arena.occupiedZones()) {
        arena.inZone(z, () => {
          const present = arena.players();
          for (const p of present) if (!stopped || p.dm) sim.updatePlayer(p, commandOf(p), dt);
          if (!stopped) {
            for (const mob of z.mobs) mob.update(dt, z.mobWorld);
            // Rain waters every dry plot in the zone, as a Waterskin would (the snapshot tells a guest it is wet).
            const raining = !!z.weather && rainWaters(z.weather.precip, z.weather.intensity);
            for (const crop of z.crops) {
              if (raining && crop.thirsty) crop.water();
              crop.grow(dt);
            }
            this.ground.age(dt);
            sim.weather(dt);
            for (const p of present) {
              const combo = commandOf(p).combo;
              if (combo !== undefined) sim.combo(p, combo);
            }
          }
          if (z !== here) z.effects.update(dt); // the local zone's effects are updated with the rest of what is drawn
        });
      }
      // The zones drawn beside this one keep their mobs wandering, so nothing looks frozen across the border.
      const occupied = new Set(arena.occupiedZones());
      if (!stopped)
        for (const z of this.zones.lookouts()) {
          if (occupied.has(z)) continue;
          arena.inZone(z, () => {
            for (const mob of z.mobs) mob.update(dt, z.mobWorld);
          });
        }
      if (!stopped) this.training.update(dt);
    } else {
      this.player.animate(dt * 1000, false); // the world is frozen while talking
    }
    if (!menu.open && !shop.open && !trade.open && !busy) this.handleAction(cmd.act, () => this.act(arena.local));
    if (!stopped) for (const g of guests) if (g.cmd.act) arena.inZone(arena.zoneOf(g.p), () => this.act(g.p));
    if (!reading) this.zones.checkDoors(arena.local);
    if (!stopped) for (const g of guests) this.zones.checkDoors(g.p);
    this.possession.follow();
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
    for (const crop of this.arena.crops) crop.grow(dt, false); // only the host says when a plot is ripe
    const busy = this.zones.transition.busy;
    const reading = menu.open || shop.open || trade.open || dialog.active || busy;
    const cmd = this.readCommand(dt, reading);
    if (cmd.dx || cmd.dy)
      this.guestDrinking = false; // walking off stops the drink (the host sees it too)
    // A by a pond: the host starts or stops the drink (its `act`; with an enemy near it attacks and stops any drink);
    // keep this guest's button label in step.
    else if (cmd.act && foeNear(this.arena.zone, this.arena.local)) this.guestDrinking = false;
    else if (cmd.act && (this.guestDrinking || canDrink(this.arena.zone, this.arena.local))) {
      this.guestDrinking = !this.guestDrinking;
    }
    if (!menu.open && !shop.open && !trade.open && !busy) this.handleAction(cmd.act, () => this.guest.pressAction());
    if (cmd.combo !== undefined) this.guest.castCombo(cmd.combo);
    this.guest.sendInput(dt, reading ? 0 : packKeys(cmd.dx, cmd.dy), cmd.aim, this.desk.voteInput);
  }

  /** Switch to `role` (a friend connected or everyone dropped), setting the world up for it. */
  private syncRole(role: Role) {
    const { arena } = this;
    if (role === arena.role) return;
    if (arena.role === 'host') this.host.leave();
    else if (arena.role === 'client') this.guest.leave();
    arena.role = 'solo'; // so nothing from here on is recorded for friends until the new role is set
    this.desk.reset(); // what a DM set lasts for their game only
    arena.pressure = role === 'host' ? this.ui.session.hostPressure : 'steady'; // what the host chose in the lobby
    this.powers.reset();
    this.tasks.reset();
    this.revive.reset();
    this.possession.reset();
    this.narration.reset();
    this.prompts.reset();
    if (role === 'host') this.host.enter();
    else if (role === 'client') this.guest.enter();
    arena.role = role;
  }

  // --- The Dungeon Master ---

  /** The players as the Dungeon Master's Party tab lists them. */
  private partyRows(): PartyRow[] {
    const { arena } = this;
    return [...arena.remotes.values()]
      .filter((p) => !p.dm)
      .map((p) => ({
        slot: p.slot,
        name: playerName(p.slot),
        color: PLAYER_COLORS[p.slot] ?? 0xffffff,
        level: p.hero.stats.level,
        hp: p.hero.stats.hp,
        maxHp: p.hero.stats.maxHp,
        where: zoneName(p.zone),
        quest: currentQuest(p.hero.quests)?.title ?? '',
        here: p.zone === arena.local.zone,
      }));
  }

  /** The Dungeon Master steps to a player's side, through the iris, wherever in the world they are. */
  private dmGoTo(slot: number) {
    const { arena } = this;
    const p = arena.remotes.get(slot);
    if (!arena.local.dm || !p || this.zones.transition.busy) return;
    this.ui.menu.close();
    const dest = arena.zoneOf(p);
    this.zones.travel(arena.local, dest, { col: Math.floor(p.body.x / CELL), row: Math.floor(p.body.y / CELL) });
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
    this.combos.tick(dt, this.ui.touch.active ? COMBO_WINDOW_TOUCH : COMBO_WINDOW);
    const pressed = COMBO_PRESSES.filter(([, action]) => actionPressed(action));
    // A thumb that lands on a diagonal of the pad presses two directions at once: that is a slip, not two taps, so ignore it.
    if (pressed.length > 1 && pressed.every(([, action]) => actionTouchedOnly(action))) return undefined;
    let done: number | undefined;
    for (const [key] of pressed) {
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
    const folk = arena.zone.folk.find((f) => near(f.body));
    if (dialog.active) {
      dialog.advance();
    } else if (arena.local.dm && !lectern && !sign) {
      // The Dungeon Master reads the world (signs, the lectern) but takes no part in it: no shops, quests or swings.
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
    } else if (folk) {
      folk.body.face(directionToward(this.player.x - folk.body.x, this.player.y - folk.body.y));
      dialog.say(folk.lines);
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
    if (p.dm) return; // the Dungeon Master opens, picks and strikes nothing
    const chest = this.arena.chests.find(
      (c) => !c.opened && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CHEST_REACH,
    );
    if (chest) return this.openChest(p, chest);
    const farming = enabled('farming', this.arena.zone.name); // without it, crop plots are scenery
    const crop = farming && this.arena.crops.find((c) => c.ripe && this.inReach(p, c));
    if (crop) return this.pickCrop(p, crop);
    const dry =
      farming &&
      this.arena.crops.find((c) => c.thirsty && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CROP_REACH);
    if (dry) return this.waterCrop(p, dry);
    const site = this.arena.sites.find(
      (s) =>
        Math.hypot(p.body.x - s.x, p.body.y - s.y) < SITE_REACH &&
        (siteOpen(p.hero, s.kind, this.arena.zone.name, s.index) || this.questWants(this.arena.zone.name, s)),
    );
    if (site) return this.touchSite(p, site);
    if (this.sim.pondAction(p)) return; // A by a pond drinks (or stops drinking) instead of swinging
    const loose = this.ground.nearest(p);
    if (loose) this.ground.pickUp(p, loose);
    else this.sim.attack(p);
  }

  /** A player touches a quest site that their quest wants: it counts once for them, and the world sees the sparkle. */
  private touchSite(p: Player, site: QuestSite) {
    if (this.questWants(this.arena.zone.name, site) && this.tasks.touchSite(p, site.kind, site.index)) {
      this.sim.fx('levelUp', site.x, site.y - 6); // the DM's quest counts it for the whole party
      return;
    }
    const progress = recordSite(p.hero, site.kind, this.arena.zone.name, site.index);
    if (!progress) return;
    this.sim.fx('levelUp', site.x, site.y - 6);
    this.sim.questNote(p, progress);
  }

  /** The quest markers for the local player: "!" over the giver with a task to hand out, "?" when one can be handed in; sites show only while wanted. */
  private updateQuests(z: ZoneState, dt: number) {
    const hero = this.hero;
    for (const g of z.givers) {
      const mark = giverMark(hero, g.giver); // "!" or "?" over whoever the current quest is about
      const text = mark ? `${mark} ${GIVERS[g.giver]?.tag ?? ''}` : (GIVERS[g.giver]?.tag ?? '');
      if (this.marked.get(g.body) === text) continue;
      this.marked.set(g.body, text);
      g.body.setTag(text, mark ? 0xffd34d : 0xffffff);
    }
    for (const s of z.sites) {
      s.setOpen(siteOpen(hero, s.kind, z.name, s.index) || this.questWants(z.name, s));
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

  /**
   * Tell the story at the right moments (from the local hero's quest log, so it is the same for solo, host and guest): the
   * narration when a task is finished out in the world, a title card when a chapter begins, and the end of part one. Each
   * waits until no dialog or menu is open, so it never talks over a conversation.
   */
  private tellStory() {
    const { dialog, menu } = this.ui;
    const log = this.hero.quests;
    const q = currentQuest(log);
    const ready = questStatus(this.hero) === 'ready';
    const s = this.story;
    if (s.stage === -1) {
      // The first look (or a guest's first word from the host): remember where things stand, announce nothing.
      this.story = { stage: log.stage, ready, chapter: q && log.taken ? q.chapter : -1 };
      return;
    }
    if (q && q.fieldNote.length && s.stage === log.stage && !s.ready && ready) this.fieldNote = q.fieldNote;
    if (q && log.taken && startsChapter(q) && s.chapter !== q.chapter) {
      s.chapter = q.chapter;
      this.titleCard = { title: CHAPTERS[q.chapter]?.title ?? '', sub: `Chapter ${q.chapter + 1}` };
    }
    if (s.stage < QUESTS.length && log.stage === QUESTS.length) {
      this.titleCard = { title: 'To be continued...', sub: 'End of part one' };
    }
    s.stage = log.stage;
    s.ready = ready;

    if (dialog.active || menu.open || this.zones.transition.busy) return;
    if (this.fieldNote) {
      dialog.say(this.fieldNote);
      this.fieldNote = null;
    } else if (this.titleCard) {
      this.banner.show(this.titleCard.title, this.titleCard.sub);
      this.titleCard = null;
    }
  }

  /** The task the DM called, as the tracker line ('' when there is none). */
  private taskLine(): string {
    return this.arena.task ? taskText(this.arena.task) : '';
  }

  /** The quest arrow: points from the hero at where the quest leads (a thing in this zone, or the door towards it). */
  private pointTheWay(z: ZoneState, dt: number) {
    const hide = this.zones.transition.busy || !this.player.visible || !enabled('guide', z.name) || this.arena.local.dm; // the DM has no quest
    const world = {
      zone: z.name,
      doors: z.data.doors,
      sites: z.sites.map((s) => ({ kind: s.kind, index: s.index, x: s.x, y: s.y })),
      mobs: z.mobs.flatMap((m) => {
        const key = m.alive ? mobKey(m.kind) : undefined;
        return key ? [{ key, x: m.body.x, y: m.body.y }] : [];
      }),
      givers: z.givers.map((g) => ({ id: g.giver, x: g.body.x, y: g.body.y })),
      places: z.data.places.map((p) => ({ name: p.name, x: (p.col + 0.5) * CELL, y: (p.row + 0.5) * CELL })),
    };
    const guide = hide ? null : guideFor(this.hero, world, this.player);
    const { camera } = z;
    const at = (x: number, y: number) => ({ x: z.world.x + x * camera.zoom, y: z.world.y + y * camera.zoom });
    // A person or a door gets the arrow; something to be found is only an area on the map (M).
    const known = guide && guide.radius === undefined ? guide : null;
    // The DM's quest: a search area on the map (the party works out the rest), and an arrow only once the DM points the way.
    const task = this.arena.task;
    const open = !!task && task.state === 'active' && task.zone === z.name;
    const calling =
      open && task.hint && !this.arena.local.dm && !this.zones.transition.busy
        ? { x: task.x, y: task.y, label: 'The way' }
        : null;
    const target = calling ?? known;
    this.arrow.update(
      dt,
      at(this.player.x, this.player.y - 20),
      target && at(target.x, target.y - 12),
      target?.label ?? '',
    );
    const questGuide: Guide | null = open
      ? task.hint
        ? { x: task.x, y: task.y, label: task.title }
        : { ...searchMiddle(task.x, task.y), label: task.title, radius: SEARCH_RADIUS }
      : null;
    this.overlay.setGuide(questGuide ?? guide);
  }

  /** Does the DM's quest want this site (a plant or stone to gather that is not yet touched, or the hidden relic)? */
  private questWants(zone: string, site: QuestSite): boolean {
    const t = this.arena.task;
    if (!t || t.state !== 'active' || t.zone !== zone) return false;
    if (t.kind === 'find') return site.kind === RELIC_KIND;
    return t.kind === 'gather' && site.kind === t.what && !(t.bits & (1 << site.index));
  }

  /** The relic of a "find" quest is a site that appears where the DM hid it (on every page) and goes when it is found. */
  private syncRelic() {
    const t = this.arena.task;
    const want = t && t.state === 'active' && t.kind === 'find' ? t : null;
    for (const z of this.arena.zones.values()) {
      const have = z.sites.find((x) => x.kind === RELIC_KIND);
      if (want && z.name === want.zone && !have)
        z.addSite({ kind: RELIC_KIND, col: Math.floor(want.x / CELL), row: Math.floor(want.y / CELL) });
      else if (have && !(want && z.name === want.zone)) z.removeSite(have);
    }
  }

  /**
   * The Harvest button of every ripe plot the local player can reach, drawn by the plant, and a Drink button at the edge
   * of a pond the player stands beside while they are thirsty and it is not empty (none while a menu or door is up).
   */
  private updateHarvestButtons(z: ZoneState, hidden: boolean) {
    const { arena } = this;
    if (hidden) return this.harvestButtons.clear();
    const { world } = arena.view;
    const scale = world.scale.x;
    const spots: HarvestSpot[] = z.crops.flatMap((c, key) =>
      c.ripe && enabled('farming', z.name) && this.inReach(arena.local, c)
        ? [{ key, x: world.x + c.x * scale, y: world.y + (c.y - CELL * 1.6) * scale }]
        : [],
    );
    const drinking = this.drinking();
    // An empty pond has nothing to give: no button (a guest knows the levels from the host's snapshot).
    const water = (drinking || canDrink(z, arena.local)) && drinkableNear(z.data, this.player.x, this.player.y);
    if (water) {
      const label = drinking ? 'Stop' : 'Drink';
      spots.push({ key: DRINK_KEY, label, x: world.x + water.x * scale, y: world.y + water.y * scale });
    }
    this.harvestButtons.update(spots);
  }

  private inReach(p: Player, crop: Crop) {
    return Math.hypot(p.body.x - crop.x, p.body.y - (crop.y - CELL / 2)) < CROP_REACH;
  }

  /** The player pressed a plot's Harvest button: pick it here, or, as a guest, ask the host (an action press picks the plot beside them). */
  private harvestPressed(key: number) {
    if (key === DRINK_KEY) return this.drinkPressed();
    const crop = this.arena.crops[key];
    if (!crop?.ripe || !this.inReach(this.arena.local, crop)) return;
    if (this.arena.role === 'client') this.guest.pressAction();
    else this.pickCrop(this.arena.local, crop);
  }

  /**
   * Is the local player drinking? Solo and the host know; a guest only knows it asked, and assumes it stopped once it
   * walks, is full, or asks to stop (the host stops it for the same reasons).
   */
  private drinking(): boolean {
    const { arena } = this;
    if (arena.role !== 'client') return arena.local.drinking !== null;
    if (!thirsty(this.hero.needs)) this.guestDrinking = false;
    return this.guestDrinking;
  }

  /** The player pressed Drink (or Stop) by a pond: start or stop here, or, as a guest, ask the host (who keeps the meters). */
  private drinkPressed() {
    const { arena } = this;
    const on = !this.drinking();
    if (on && !drinkableNear(arena.zone.data, this.player.x, this.player.y)) return;
    if (arena.role === 'client') {
      this.guestDrinking = on;
      this.pack.askDrink(on);
    } else if (on) this.sim.startDrinking(arena.local);
    else this.sim.stopDrinking(arena.local);
  }

  /** A player picks a ripe crop plot: the produce goes to their pack and the plot starts again as a sprout. */
  private pickCrop(p: Player, crop: Crop) {
    const { sim } = this;
    const got = harvest(p.hero, crop.kind);
    const [x, y] = [crop.x, crop.y - CELL];
    if (!got.ok) {
      sim.text(x, y - 14, got.text, 0xff8a7a);
      return;
    }
    crop.pick();
    sim.fx('levelUp', x, y + 6);
    sim.text(x, y - 14, got.text, 0xa8e868);
  }

  /** A player waters a dry plot with a Waterskin from their pack. */
  private waterCrop(p: Player, crop: Crop) {
    const { sim } = this;
    const [x, y] = [crop.x, crop.y - CELL];
    const result = waterWith(p.hero);
    if (!result.ok) {
      sim.text(x, y - 14, result.text, 0xff8a7a);
      return;
    }
    crop.water();
    sim.fx('levelUp', x, y + 6);
    sim.text(x, y - 14, result.text, 0x8fc8ff);
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
