import type { Container, Renderer } from 'pixi.js';
import { enabled, flag, setting } from '../systems/capabilities';
import { sayTime } from '../systems/dmPowers';
import { ReadingPause } from '../systems/readingPause';
import type { Sprites, Zone } from '../assets';
import type {} from '../core/aim';
import { actionPressed, clickedAt, mapPressed, menuPressed, stopPressed } from '../core/controls';
import {} from '../core/direction';
import type {} from './ZoneState';
import type { Scene } from '../core/Scene';
import type { TouchControls } from '../core/touch';
import type { Character } from '../entities/Character';
import type {} from '../entities/Chest';
import type {} from '../entities/Crop';
import type { Mob } from '../entities/Mob';
import type { Player } from '../entities/Player';
import { NO_COMMAND } from '../entities/Player';
import type { Dialog } from '../hud/Dialog';
import type { Choices } from '../hud/Choices';
import type { ContentManager } from '../content/ContentManager';
import { STOCK_EPICS } from '../content/epics';
import type { EpicTemplate } from '../systems/dmEpics';
import type { Hud } from '../hud/Hud';
import { Atlas } from '../map/explored';
import { DarknessLayer } from '../entities/DarknessLayer';
import { LightGlow } from '../entities/LightGlow';
import { glowStrength } from '../systems/lights';
import { MapOverlay } from '../hud/MapOverlay';
import { PartnerArrows, partnersIn } from '../hud/PartnerArrows';
import { ThreatPulses } from '../hud/ThreatPulses';
import { AreaBanner } from '../hud/AreaBanner';
import { LevelSplash } from '../hud/LevelSplash';
import { ScreenFx } from '../hud/ScreenFx';
import { Pacing } from './overworld/Pacing';
import {} from '../systems/places';
import type { Menu } from '../hud/Menu';
import type {} from '../hud/Party';
import type { ShopCounter } from '../hud/ShopCounter';
import type { TradeUi } from '../hud/Trade';
import {} from '../map/types';
import { packKeys } from '../net/protocol';
import type { Role, Session } from '../net/session';
import type { Hero, Item } from '../systems/combat';
import type {} from '../entities/QuestSite';
import { equip } from '../systems/items';
import {} from '../systems/pets';
import {} from '../systems/shops';
import type {} from '../systems/spells';
import type { Precip } from '../systems/weather';
import { DayClock } from '../systems/daynight';
import { NightLayer } from '../entities/NightLayer';
import { Arena } from './overworld/Arena';
import { PICKUP_REACH } from './overworld/constants';
import { Barrels } from './overworld/Barrels';
import { Ground } from './overworld/Ground';
import { GuestLink } from './overworld/GuestLink';
import { HostLink } from './overworld/HostLink';
import { PackSync } from './overworld/PackSync';
import { foeNear, Simulation } from './overworld/Simulation';
import { PickupToasts } from '../hud/PickupToasts';
import { playPing } from '../hud/sfx';
import { Trading } from './overworld/Trading';
import { Training } from './overworld/Training';
import { Visuals } from './overworld/Visuals';
import { Zones, type ZoneLoader, type ZoneUnloader } from './overworld/Zones';
import { Persistence } from './overworld/Persistence';
import { Scenario } from './overworld/Scenario';
import { StoryUi } from './overworld/StoryUi';
import { LocalInput } from './overworld/LocalInput';
import { Interactions } from './overworld/Interactions';
import { PartyUi } from './overworld/PartyUi';
import { Story, signPages } from './overworld/Story';
import { createDmBot, type DmBotApi } from './overworld/DmBot';
import { DmDesk } from './overworld/DmDesk';
import { DmPowers } from './overworld/DmPowers';
import { DmBar } from '../hud/DmBar';
import { ItemButton } from '../hud/ItemButton';
import { DmCard } from '../hud/DmCard';
import { DmPrompts } from './overworld/DmPrompts';
import { DmTasks } from './overworld/DmTasks';
import { DmEpics } from './overworld/DmEpics';
import { DmRevive } from './overworld/DmRevive';
import { DmPossession } from './overworld/DmPossession';
import { CueDirector } from './overworld/Cues';
import { DmNarration } from './overworld/DmNarration';
import { VotePanel } from '../hud/VotePanel';
import { RequestPanel } from '../hud/RequestPanel';
import type { World } from '../content/world';
import { particleEffect } from '../entities/ParticleEffect';
import { floatText } from '../entities/effects';

export type { ZoneLoader, ZoneUnloader };

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
 * loop and the HTML overlays (menu, dialog, shop counter, trade window, map). The rest lives in `scenes/overworld/`, one
 * concern per file:
 *  - `Arena`: who is in the game (the local player and the friends), the loaded zones, the role, the clock, the weather,
 *    and the "current zone" the rules work in.
 *  - `Zones`: loading zones, taking players through doors, showing the local player's zone.
 *  - `Simulation`: the rules (moving, attacking, damage, lightning, XP, gold, defeat). Solo and host only.
 *  - `Visuals`: drawing what happens (also what a guest is told).
 *  - `Ground`: items lying on the ground. `PackSync`: gold, pack and gear, and a guest's requests to the host.
 *    `Trading`: player-to-player trades.
 *  - `HostLink` / `GuestLink`: the two sides of a co-op game (see net/protocol.ts).
 *  - `Interactions`: what the action key does (talk, open, pick, drink, attack). `LocalInput`: this keyboard's controls as a
 *    `Command`. `StoryUi`: what the local player is told and shown about their quests. `PartyUi`: the DM's Party tab.
 * It runs in one of three roles (`Session.role`): solo, host (the simulation plus up to three friends' players), or client
 * (no simulation: it sends the local controls to the host and draws the host's snapshots). `arena.local` is the player at
 * this keyboard in every role; `arena.remotes` are the others by player number. Player 0 is the host.
 */
export class OverworldScene implements Scene {
  private arena: Arena;
  /** Who is reading a quest conversation: while anyone is, foes and the weather stand still (host and solo). */
  private readers = new ReadingPause();
  private zones: Zones;
  private sim: Simulation;
  private ground: Ground;
  private pickups = new PickupToasts();
  private barrels: Barrels;
  private pack: PackSync;
  private trading: Trading;
  private training: Training;
  private scenario: Scenario;
  /** A live world's story, steered by its Dungeon Master (inert for every other world). */
  private liveStory: Story;
  private epicsOnOffer!: () => EpicTemplate[];
  /** The Dungeon Master's controls: weather, time of day, capabilities for everyone, votes. */
  private desk!: DmDesk;
  private votePanel = new VotePanel();
  private dmBar = new DmBar();
  private itemButton = new ItemButton(
    () => this.hero,
    (op) => this.pack.localOp(op),
  );
  private dmCard = new DmCard();
  private requests = new RequestPanel();
  private powers!: DmPowers;
  private prompts!: DmPrompts;
  private tasks!: DmTasks;
  private epics!: DmEpics;
  private narration!: DmNarration;
  private cues!: CueDirector;
  private revive!: DmRevive;
  private possession!: DmPossession;
  private host: HostLink;
  private guest: GuestLink;
  private overlay = new MapOverlay();
  private partnerArrows = new PartnerArrows();
  private threatPulses = new ThreatPulses();
  private banner = new AreaBanner();
  private levelSplash = new LevelSplash();
  private screenFx = new ScreenFx();
  private storyUi!: StoryUi; // what the local player is told and shown about their quests
  private interact!: Interactions; // what the action key does
  private input!: LocalInput; // this keyboard's controls as a Command
  private partyUi!: PartyUi; // the DM's Party tab
  private atlas = new Atlas(); // what the players have seen of each zone, for the map
  private dayClock = new DayClock(); // the hour comes from the wall clock, so co-op players agree with nothing sent
  private night = new NightLayer();
  private dark = new DarknessLayer();
  private glow = new LightGlow();
  /** The solo game's save in the browser. */
  readonly persistence: Persistence;
  /** The "level up" splash (watches the hero's level). */
  get splash() {
    return this.levelSplash;
  }

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
    /** The tag of the world to save the solo game under (`CampaignChoice.tag`); empty: this world is not saved. */
    saveTag = '',
  ) {
    this.epicsOnOffer = () => [...STOCK_EPICS, ...content.content.epics];
    const arena = (this.arena = new Arena(sprites.wardrobe));
    this.zones = new Zones(arena, sprites, loadZone, unloadZone, ui, renderer, content);
    const visuals = new Visuals(arena);
    const say = (lines: string[]) => ui.dialog.note(lines); // a defeat or a trial's result: passive text, not a popup
    // The simulation reports what a friend should see through the host link (which only records it while hosting).
    this.sim = new Simulation(arena, visuals, this.zones, (e) => this.host.emit(e), say);
    this.zones.makeMobWorld = (z) => this.sim.mobWorldFor(z);
    this.zones.say = (p, text) => this.sim.text(p.body.x, p.body.y - 66, text, 0xffd27a); // a door turning a hero away
    this.ground = new Ground(arena, this.sim);
    this.ground.onPicked = (p, name) => {
      if (p !== arena.local) return; // a friend's pickup is theirs to see
      this.pickups.add(name, foeNear(arena.zone, p));
      playPing();
    };
    this.barrels = new Barrels(arena, this.sim);
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
    this.persistence = new Persistence(arena, this.zones, this.scenario, saveTag, this.atlas);
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
    this.requests.onAsk = (i, text) => this.desk.ask(i, text);
    this.powers = new DmPowers(arena, this.sim);
    this.tasks = new DmTasks(arena, this.sim, this.desk);
    this.pack.onFuse = (_p, made) => this.tasks.forged(made);
    this.epics = new DmEpics(
      arena,
      this.zones,
      content,
      this.tasks,
      this.desk,
      this.sim,
      this.liveStory,
      this.epicsOnOffer,
    );
    this.narration = new DmNarration(arena, ui.session, this.desk);
    this.cues = new CueDirector(arena);
    this.revive = new DmRevive(arena, this.sim, this.zones);
    this.possession = new DmPossession(arena, this.sim);
    this.prompts = new DmPrompts(
      arena,
      this.liveStory,
      this.desk,
      this.powers,
      this.dmCard,
      this.tasks,
      this.revive,
      this.epics,
    );
    this.epics.onDone = () => this.prompts.suggest('story'); // a saga is done: the story may have a next road
    // The DM's words show on every screen (never over a DM who is busy being a foe).
    this.desk.onSay = (text) => !this.possession.active && ui.dialog.tell(text, sayTime(text));
    ui.dialog.onCue = (cue) => this.cues.play(cue); // the cues written into those words, as the reading reaches them
    this.input = new LocalInput(arena, this.zones, () => ui.touch.active);
    this.partyUi = new PartyUi(arena, this.zones, ui.menu, () => this.possession.release());
    this.storyUi = new StoryUi(arena, ui, this.zones, this.banner, this.overlay, () => this.possession.active);
    this.storyUi.pacing = new Pacing(arena, this.sim, this.prompts, this.desk);
    this.interact = new Interactions(
      arena,
      ui,
      this.sim,
      this.pack,
      this.training,
      this.tasks,
      this.barrels,
      this.ground,
      this.storyUi,
      () => this.guest.pressAction(),
      (zone, col, row) => this.liveStory.signOverride(zone, col, row),
    );
    this.interact.onTalk = (entity) => this.epics.talked(entity); // a saga's person has been spoken to
    this.zones.root.addChildAt(this.storyUi.arrow, 1);
    this.zones.root.addChildAt(this.night, 1); // over the world, under the quest arrow and the door transition
    this.zones.root.addChildAt(this.dark, 2); // the underground's fog of war, over the night shade
    this.zones.root.addChildAt(this.glow, 3); // the warm light of fires, over both
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
    this.dayClock.settle();
  }

  enter() {
    this.ui.menu.inventory.attach({ apply: (op) => this.pack.localOp(op) });
    this.ui.menu.magic.attach({ equip: (wanted) => this.pack.setLoadout(wanted), zone: () => this.arena.zone.name });
    this.ui.menu.party.attach({ rows: () => this.partyUi.rows(), go: (slot) => this.partyUi.goTo(slot) });
    this.dmBar.attach({
      say: (text) => this.desk.say(text),
      note: (text) => this.tasks.setNote(text),
      cancelQuest: () => {
        const saga = this.epics.active; // a saga says its own ending
        this.tasks.cancel();
        if (!saga) this.desk.say('That task is cancelled. A new one is coming.');
      },
      questing: () => this.tasks.active,
      waiting: () => this.prompts.waiting,
      openInbox: () => this.prompts.openInbox(),
      smite: () => this.powers.smite(),
      freeze: () => this.powers.freeze(),
      stop: () => this.powers.toggleStop(),
      reset: () => this.powers.resetZone(),
      card: (kind) => this.prompts.open(kind),
      story: () => this.prompts.hasStory,
      fallen: () => this.revive.fallen.length,
      release: () => this.possession.release(),
      waits: () => this.powers.view(),
      reply: (text) => this.prompts.reply(text),
      sign: (text) => this.liveStory.writeNear(signPages(text)).note,
      canSign: () => this.liveStory.canChoose,
      canReply: () => this.prompts.canReply,
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
    this.overlay.close(); // the button stays; only an open map goes
    this.interact.clear();
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
    const { menu, shop, hud, session, trade } = this.ui;
    const { arena } = this;
    this.syncRole(session.role);
    arena.clock += dt;
    this.persistence.update(dt);
    if (arena.local.dm) this.levelSplash.reset();
    else this.levelSplash.sync(this.hero.stats);
    const { stats } = this.hero;
    this.screenFx.sync(arena.local.dm ? 1 : stats.hp, stats.maxHp, arena.local.down, dt);
    this.pickups.update(dt, foeNear(arena.zone, arena.local));
    this.updateDm(dt);
    const online = arena.role !== 'solo';
    this.updateMap();
    menu.setOnline(online, arena.local.dm);
    if (menu.open && online) menu.dmQuest = arena.task && { view: arena.task, pages: this.storyUi.briefOf(arena.task) };
    this.trading.sync(dt, online);
    this.handleKeys();
    if (menu.open || shop.open || trade.open) {
      if (menu.open) menu.update();
      else if (shop.open) shop.update();
      hud.update(this.hero, '', arena.zone.name, arena.local.dm, this.storyUi.taskLine(), arena.role === 'solo'); // gold changes at the counter
      if (!online) return; // solo: the world is paused. Online it keeps running behind the menu (the other player can't be paused).
    }

    if (arena.role === 'client') this.updateClient(dt);
    else this.updateSimulation(dt);
    this.zones.prefetch(dt);
    this.zones.retire(dt);
    this.updateView(dt);
    this.followCamera(dt);
  }

  /** The Dungeon Master's side of the frame: the live story, dials, powers, quests, narration, the bar and its cards. */
  private updateDm(dt: number) {
    const { arena } = this;
    this.liveStory.update(dt); // a live world: the host sends its log, a guest grows its own from it
    this.desk.update(dt); // the DM's dials, time of day and vote: the host tells its friends, a friend is told
    this.votePanel.sync(this.desk.openVoteForGuest);
    this.powers.update(dt); // the DM's storm in flight and cooldowns
    this.tasks.update(dt);
    this.epics.update(dt);
    this.storyUi.syncRelic();
    this.storyUi.syncBoss();
    this.storyUi.syncLandmark();
    this.revive.update(dt);
    this.narration.update(dt);
    if (arena.local.dm && !this.ui.dialog.active && !this.ui.menu.open && stopPressed()) this.powers.toggleStop();
    document.body.classList.toggle('touch-ui', this.ui.touch.active); // the DM's bar and cards lay out for a phone
    document.body.classList.toggle('dm-ui', arena.local.dm); // the DM's hot buttons take the place of Inventory and Attack
    document.body.classList.toggle('dm-possessing', this.possession.active); // no pop-ups while a foe is held
    if (this.possession.active && this.dmCard.open) this.dmCard.hide();
    this.dmBar.update(arena.local.dm, arena.timeStopped, this.possession.name, this.ui.touch.active);
    this.ui.dialog.update();
    this.requests.update(arena.role === 'client', dt);
    this.prompts.update(
      dt,
      this.ui.dialog.active || this.ui.menu.open || this.zones.transition.busy || this.possession.active,
    );
  }

  /**
   * The map overlay: core engine, always available (host, guest, DM, touch), filled in as the players in view explore.
   * A room has no overview, so there it opens on a note saying so instead of the button going missing.
   */
  private updateMap() {
    const { arena } = this;
    const outdoors = !arena.zone.data.indoor;
    const here = arena.zone.name;
    this.overlay.setRoom(outdoors ? null : here);
    if (outdoors) {
      const seen = this.atlas.of(arena.zone.name, arena.zone.data);
      if (!flag('guide', 'fog', here)) seen.revealAll(); // a map without fog shows the whole zone at once
      // Everyone in this zone uncovers the map around them (a guest only knows the players in its own zone).
      for (const p of arena.players()) if (p.body.visible) seen.reveal(p.body.x, p.body.y);
      this.overlay.setZone(arena.zone.data, seen, arena.zone.name);
    }
  }

  /** Keys that act on the screens: the map, Esc (cards, words, held foe, menu), the inventory, and the DM's click on a foe. */
  private handleKeys() {
    const { menu, shop, dialog, trade } = this.ui;
    if (!menu.open && !dialog.active && mapPressed()) this.overlay.toggle();
    this.possession.update();
    const click = clickedAt();
    const free = !menu.open && !shop.open && !trade.open && !dialog.active && !this.zones.transition.busy;
    if (click && free && !this.possession.active) this.possession.clickAt(click, this.ui.touch.active); // the DM clicks or taps a foe to possess it
    if (this.dmCard.open && menuPressed())
      this.dmCard.dismiss(); // Esc sends a card away first
    else if (this.requests.open && menuPressed()) this.requests.close();
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
    // The quick-item button's keys (1-3, Q/E, F) and wheel: the same Inventory action as the menu, so a guest asks the host.
    this.itemButton.poll(free && !this.arena.local.dm);
  }

  /** What the local player sees: the zone they are in (a door above may just have changed it). */
  private updateView(dt: number) {
    const { menu, shop, dialog, hud, trade } = this.ui;
    const { arena } = this;
    const z = arena.zone;
    z.effects.update(dt);
    const dusk = !z.data.indoor && enabled('dayNight', z.name);
    this.night.update(this.dayClock.sky(), dusk, arena.screen.width, arena.screen.height);
    const view = z.camera.view(arena.screen.width, arena.screen.height);
    z.hearth.update(view, dusk && this.dayClock.sky() !== 0xffffff);
    const underground = z.data.dark && enabled('darkness', z.name);
    const lights = z.hearth.lights(view, arena.clock);
    this.glow.update(
      lights,
      view,
      underground ? 1 : dusk ? glowStrength(this.dayClock.sky()) : 0,
      arena.screen.width,
      arena.screen.height,
    );
    this.dark.update(
      underground
        ? {
            zone: z.name,
            data: z.data,
            view,
            heroes: arena
              .players()
              .filter((p) => !p.dm && p.body.visible)
              .map((p) => p.body),
            radius: setting('darkness', 'radius', z.name),
            lights,
            dim: setting('darkness', 'dim', z.name),
            memory: flag('darkness', 'memory', z.name),
          }
        : null,
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

    z.syncBeds(); // a guest's own copy of the same rule
    z.pondBeds.show(z.ponds.levels()); // the ponds drained by drinking, until rain fills them
    z.npc?.animate(dt * 1000, false);
    for (const f of z.folk) f.body.animate(dt * 1000, f.moving);
    this.scenario.update(menu.open || shop.open || trade.open || dialog.active || this.zones.transition.busy);
    this.storyUi.update(z, dt);
    for (const k of z.keepers) k.body.animate(dt * 1000, false);
    for (const pet of z.pets) {
      pet.update(dt);
      pet.zIndex = pet.y;
    }
    for (const item of z.ground) {
      item.update(dt, Math.hypot(this.player.x - item.x, this.player.y - item.y) < PICKUP_REACH);
    }
    for (const body of arena.bodies()) body.zIndex = body.y;
    this.interact.updateHarvestButtons(
      z,
      menu.open || shop.open || trade.open || dialog.active || this.zones.transition.busy || arena.local.dm,
    );
    hud.update(
      this.hero,
      this.input.typed,
      this.arena.zone.name,
      this.arena.local.dm,
      this.storyUi.taskLine(),
      arena.role === 'solo',
    );
    // Arrows toward partners out of view, and a chip for one in another zone (online only, not during a door transition).
    this.partnerArrows.update(
      arena.role !== 'solo' && !this.zones.transition.busy,
      view,
      arena.screen.width,
      arena.screen.height,
      partnersIn(arena.players(), arena.local, z.name),
    );
    // Edge pulses toward off-screen shooters winding up: from the mobs' own state, so solo, host and guest all draw them.
    this.threatPulses.update(!arena.local.dm && !this.zones.transition.busy, view, arena.screen, arena.mobs);
    this.itemButton.update(!arena.local.dm, dt, arena.local.body, view, z.camera.zoom);
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
  }

  /** The camera follows the hero, the door transition's punch, and the map and neighbouring zones are built round the view. */
  private followCamera(dt: number) {
    const { arena } = this;
    const z = arena.zone;
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
    const raw = this.input.command(dt, reading);
    this.possession.drive(raw, reading); // a possessed foe takes the DM's keys; the DM's own body stands still
    const down = arena.local.down !== null; // a hero on the ground does nothing (systems/downfall.ts)
    const cmd = this.possession.active || down ? NO_COMMAND : reading ? { ...raw, dx: 0, dy: 0 } : raw;
    const guests = [...arena.remotes.values()].map((p) => ({ p, cmd: this.host.command(p) }));
    const commandOf = (p: Player) => (p === arena.local ? cmd : (guests.find((g) => g.p === p)?.cmd ?? NO_COMMAND));
    const here = arena.zone;

    // The Dungeon Master stopped time: the players can still walk (and take doors), but foes, plots, weather, the clock on the ground and what players do besides move stand still.
    const stopped = host && arena.timeStopped;
    // Someone is reading a quest conversation (the host, or a friend whose input says so): the world stands still for them, as when time is stopped, but the others may still act.
    const waiting = host && this.readers.update(this.readingSlots(), dt);
    const frozen = stopped || waiting;
    if (host || !dialog.active) {
      for (const z of arena.occupiedZones()) {
        arena.inZone(z, () => {
          const present = arena.players();
          for (const p of present) sim.updatePlayer(p, commandOf(p), dt); // time stopped or not, the party can walk
          if (!frozen) {
            for (const mob of z.mobs) mob.update(dt, z.mobWorld);
            if (enabled('roaming', z.name)) z.updateFolk(dt, arena.bodies()); // people stroll about their posts
            for (const crop of z.crops) crop.grow(dt);
            this.ground.age(dt);
            sim.weather(dt);
            for (const p of present) {
              const combo = commandOf(p).combo;
              if (combo !== undefined && p.down === null) sim.combo(p, combo);
            }
          }
          if (z !== here) z.effects.update(dt); // the local zone's effects are updated with the rest of what is drawn
        });
      }
      this.barrels.update(); // carried barrels ride with whoever carries them
      // The zones drawn beside this one keep their mobs wandering, so nothing looks frozen across the border.
      const occupied = new Set(arena.occupiedZones());
      if (!frozen)
        for (const z of this.zones.lookouts()) {
          if (occupied.has(z)) continue;
          arena.inZone(z, () => {
            for (const mob of z.mobs) mob.update(dt, z.mobWorld);
          });
        }
      if (!frozen) this.training.update(dt);
    } else {
      this.player.animate(dt * 1000, false); // the world is frozen while talking
    }
    if (!menu.open && !shop.open && !trade.open && !busy)
      this.interact.handleAction(cmd.act, () => this.interact.act(arena.local));
    this.interact.holdAttack(cmd.held, reading); // a held button keeps swinging in a fight; a dialog forgets a pending press
    if (!stopped)
      for (const g of guests)
        if (g.cmd.act && g.p.down === null) arena.inZone(arena.zoneOf(g.p), () => this.interact.act(g.p));
    if (!reading) this.zones.checkDoors(arena.local);
    for (const g of guests) this.zones.checkDoors(g.p);
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
    const fallen = this.arena.local.down !== null; // told by the host (`FLAG.down`): nothing to send while on the ground
    const cmd = fallen ? NO_COMMAND : this.input.command(dt, reading);
    this.interact.trackGuest(cmd, reading, dt, () => this.guest.pressAction()); // its own idea of drinking; a held A in a fight repeats
    if (!menu.open && !shop.open && !trade.open && !busy)
      this.interact.handleAction(cmd.act, () => this.guest.pressAction());
    if (cmd.combo !== undefined) this.guest.castCombo(cmd.combo);
    this.guest.sendInput(
      dt,
      reading || fallen ? 0 : packKeys(cmd.dx, cmd.dy),
      cmd.aim,
      this.desk.voteInput,
      this.desk.requestInput,
      dialog.pausing,
    );
  }

  /** The players reading a quest conversation now: this one if its box pauses, and each friend whose input says they are. */
  private readingSlots(): number[] {
    const { arena } = this;
    const slots = this.ui.dialog.pausing ? [arena.local.slot] : [];
    for (const slot of arena.remotes.keys()) {
      const peer = this.ui.session.peerInput(slot);
      if (peer?.fresh && peer.rd) slots.push(slot);
    }
    return slots;
  }

  /** Switch to `role` (a friend connected or everyone dropped), setting the world up for it. */
  private syncRole(role: Role) {
    const { arena } = this;
    if (role === arena.role) return;
    if (arena.role === 'host') this.host.leave();
    else if (arena.role === 'client') this.guest.leave();
    arena.role = 'solo'; // so nothing from here on is recorded for friends until the new role is set
    this.desk.reset(); // what a DM set lasts for their game only
    this.levelSplash.reset(); // another game's hero is not a level gained
    this.readers.clear();
    arena.pressure = role === 'host' ? this.ui.session.hostPressure : 'steady'; // what the host chose in the lobby
    this.powers.reset();
    this.tasks.reset();
    this.epics.reset();
    this.revive.reset();
    this.possession.reset();
    this.narration.reset();
    this.prompts.reset();
    this.storyUi.pacing?.reset();
    if (role === 'host') this.host.enter();
    else if (role === 'client') this.guest.enter();
    arena.role = role;
  }

  /** Put gear on the hero: stats follow the item and the sprite is recomposed with its parts. */
  /** The handle an outside Dungeon Master drives this host through (`?dmbot`, see overworld/DmBot.ts). */
  dmBot(): DmBotApi {
    return createDmBot({
      session: this.ui.session,
      arena: this.arena,
      story: this.liveStory,
      desk: this.desk,
      prompts: this.prompts,
      card: this.dmCard,
      tasks: this.tasks,
      epics: this.epics,
      stock: this.epicsOnOffer,
      reports: () => this.storyUi.pacing?.report.log.drain() ?? [],
      goTo: (slot) => this.partyUi.goTo(slot),
      walk: (dx, dy, seconds) => this.input.walk(dx, dy, seconds),
    });
  }

  equip(item: Item) {
    equip(this.hero, item);
    this.arena.refreshLook();
  }
}
