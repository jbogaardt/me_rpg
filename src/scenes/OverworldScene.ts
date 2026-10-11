import { Container, type Renderer } from 'pixi.js';
import type { Sprites, Zone } from '../assets';
import { actionDown, actionPressed, mapPressed, menuPressed } from '../core/controls';
import type { Scene } from '../core/Scene';
import type { TouchControls } from '../core/touch';
import type { Chest } from '../entities/Chest';
import { GroundItem } from '../entities/GroundItem';
import { DIR_VEC, DIRS, dirIndex, directionToward, type Direction } from '../core/direction';
import { glide } from '../core/interp';
import { Character } from '../entities/Character';
import { Weather, type WeatherKind } from '../systems/weather';
import { arrowEffect, boltEffect, floatText, slashEffect } from '../entities/effects';
import type { Mob, MobWorld } from '../entities/Mob';
import { particleEffect } from '../entities/ParticleEffect';
import { ZoneTransition } from '../entities/ZoneTransition';
import { NO_COMMAND, Player, type Command } from '../entities/Player';
import type { Dialog } from '../hud/Dialog';
import type { Hud } from '../hud/Hud';
import type { ShopCounter } from '../hud/ShopCounter';
import type { TradeUi } from '../hud/Trade';
import { MapOverlay } from '../hud/MapOverlay';
import type { Menu } from '../hud/Menu';
import { arrivalFacing, cellFeet, doorAt, doorsNear } from '../map/doors';
import { pickTransition } from '../map/transition';
import { CELL, type CellPoint } from '../map/types';
import { ZoneState, type Keeper } from './ZoneState';
import { DEFAULT_VIEW, MobFeed } from '../net/feed';
import { decodeMob, encodeMob } from '../net/mobWire';
import {
  FLAG,
  type MobFields,
  MAX_VIEW,
  packKeys,
  round1,
  unpackKeys,
  type GroundSnap,
  type PlayerSnap,
  type SnapMsg,
  type FxName,
  type StatsSnap,
  type WorldEvent,
} from '../net/protocol';
import type { Role, Session } from '../net/session';
import type { DoMsg, LooksMsg, PackMsg, TradeMsg, TrMsg } from '../net/protocol';
import {
  attackPower,
  defensePower,
  gainXp,
  newHero,
  rollDamage,
  rollGold,
  spellPower,
  type Hero,
  type Ranged,
  type Stats,
} from '../systems/combat';
import { CHEST_LOOTS, collect } from '../systems/chests';
import { isIce, stepVelocity } from '../systems/ice';
import { equip } from '../systems/items';
import { heroOutfit, PLAYER_COLORS, playerName, playerOutfit, playerTag } from '../systems/looks';
import { SHOPS } from '../systems/shops';
import {
  addToPack,
  applyInvOp,
  decodeOp,
  encodeOp,
  gearCodes,
  GROUND_LIFETIME,
  itemCode,
  itemFromCode,
  MAX_GROUND,
  packCodes,
  setGear,
  setPack,
  type InvOp,
  type InvOpWire,
  type Result,
} from '../systems/inventory';
import { TRADE_START, TradeBook, viewFromWire, viewToWire, type TradeCommand, type TradeView } from '../systems/trade';
import { localTrader, remoteTrader, type Outcome, type Trader } from '../systems/trader';
import { SHOOT_RELEASE_MS } from '../sprites/doll';
import type { Wardrobe } from '../sprites/Wardrobe';
import type { Item } from '../systems/combat';
import type { Note } from '../systems/trade';

const SPEED = 120; // pixels per second
const NPC_LINES = [
  'Greetings, traveler. This world is still being drawn.',
  'Soon there will be a story here. Come back later!',
];
const DEFEAT_LINES = ['You were struck down...', 'Time folds back, and you wake where you began.'];

const ATTACK_COOLDOWN = 0.35;
const CAST_COOLDOWN = 0.45;
const KEEPER_REACH = CELL * 2.3; // how close the action key must be to talk to a shopkeeper (across a counter)
const PREFETCH_REACH = 5 * CELL; // a door this close starts loading the zone behind it
const PREFETCH_EVERY = 0.5; // seconds between looking for doors to prefetch
const ARRIVE_INVULN = 2; // seconds of blinking immunity on arriving in a zone (the transition takes ~1), so nothing waiting at the door ambushes you
const PICKUP_REACH = 26; // how close the action key must be to an item on the ground
const CHEST_REACH = CELL * 1.4; // how close the action key must be to a chest (feet to the chest's cell centre)
const MELEE_REACH = 22; // radius of the sword's hit circle, centred just in front of the hero
const INVULN_TIME = 0.8; // after being hit
const BOLT_SPEED = 260;
const BOLT_RANGE = 7 * CELL;
const BOLT_HEIGHT = 14; // the bolt flies at chest height, this far above the ground it tests against
const MP_REGEN = 1.5; // per second
const HP_REGEN = 1; // per second, once HP_REGEN_DELAY seconds pass without a hit
const HP_REGEN_DELAY = 5;

// Co-op networking (see src/net/protocol.ts)
const SNAPSHOT_HZ = 25; // host -> guest world state
const INPUT_HZ = 30; // guest -> host controls (also sent at once when they change)
const LIGHTNING_RADIUS = 28; // px from where a bolt lands that still burns
const LIGHTNING_DAMAGE = 0.35; // fraction of a player's max HP a direct hit takes (armour doesn't help)
const EVENT_KEEP = 0.6; // seconds a one-shot world event keeps riding in snapshots, to survive packet loss
const MAX_EVENTS_SENT = 48;
const GROUND_RESEND = 1; // seconds between full lists of the items on the ground, when nothing changed
const TRADE_RESEND = 0.25; // seconds between a friend's repeats of trade commands the host has not yet acknowledged
const MAX_TRADE_QUEUE = 60;
const PACK_RESEND = 1; // seconds between repeats of a friend's pack and everyone's gear (a lost packet is not resent)

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

type MobHeroes = MobWorld['heroes'];

/** Loads a zone by name (assets.ts `loadZone`). The scene asks for the zones behind doors before the player gets there. */
export type ZoneLoader = (name: string) => Promise<Zone>;

/**
 * The overworld: one zone with the hero, an NPC and mobs. Runs in one of three roles (`Session.role`):
 *  - solo: the plain single-player game.
 *  - host: the same simulation, plus up to three more players driven by their friends' controls; it sends each
 *    friend a snapshot of the world.
 *  - client: no simulation; it sends the local controls to the host and draws what the host's snapshots say.
 * `local` is the player at this keyboard in every role; `remotes` are the others by player number (none when solo).
 * Player 0 is the host; friends are 1 to 3.
 */
export class OverworldScene implements Scene {
  private top = new Container(); // the scene's root: the stage, and the door transition over it
  private stage = new Container(); // holds the local player's zone, which is the only one drawn
  private transition: ZoneTransition; // the iris or slide when the local player goes through a door
  private zones = new Map<string, ZoneState>(); // every loaded zone
  private loading = new Map<string, Promise<void>>(); // zones being loaded, so each is asked for once
  private home: ZoneState; // where the game starts and where a defeated player wakes
  /**
   * The zone the code below is working in right now. Outside the per-zone loops it is the local player's zone; a loop that
   * handles another zone (`inZone`) points it there for a moment, so one set of rules serves every zone.
   */
  private zone: ZoneState;
  private view: ZoneState; // the local player's zone: what is drawn, and what `zone` goes back to
  private depth = 0; // how many `inZone` calls are open
  private local: Player;
  private remotes = new Map<number, Player>(); // everyone else in a co-op game, by player number
  private wardrobe: Wardrobe;
  private weather = new Weather(); // the host's weather is sent to every friend (SnapMsg.w)
  private overlay: MapOverlay;
  private screen = { width: 0, height: 0 };
  private prefetchTimer = 0;

  // Co-op
  private role: Role = 'solo';
  private clock = 0; // seconds; drives the guest's invulnerability blink and event ages
  private snapTimer = 0;
  private snapSeq = 0;
  private events: { id: number; at: number; zone: string; e: WorldEvent }[] = []; // host: recent one-shot events
  private feeds = new Map<number, { zone: string; feed: MobFeed; ground: { sig: string; at: number } | null }>(); // host: what each friend has been told about the mobs
  private eventId = 0;
  private lastEvent = -1; // guest: newest event already shown
  private inputTimer = 0;
  private inputSeq = 0;
  private actCount = 0; // guest: action / magic presses so far, sent as counters
  private magCount = 0;
  private sent = { keys: -1, act: -1, mag: -1, ack: -1, vr: -1, inv: 0 };
  private groundId = 0; // host and solo: numbers the items on the ground (guests are told the numbers)
  private pendingOps: { seq: number; op: InvOp }[] = []; // guest: Inventory actions the host has not confirmed yet
  private invSeq = 0;
  private soloGround = new Map<string, { item: Item; x: number; y: number; age: number }[]>(); // a guest's solo items
  private solo: Hero | null = null; // guest: the solo hero (stats, gold, pack, gear), put back on disconnect
  private doSeq = 0; // guest: numbers its requests to the host
  private packSeq = 0; // host: numbers the pack and looks messages
  private packTimer = 0;
  private sentPack = new Map<number, string>(); // host: what each friend was last told about their pack
  private sentLooks = '';
  private lastPackSig = ''; // guest: the last pack the host sent, to redraw the menu only when it changed
  private lastSay = -1; // guest: the newest answer from the host already shown

  // Player-to-player trading (systems/trade.ts): the host runs the book; a guest sends commands and shows the host's view.
  private tradeBook: TradeBook;
  private tradeSeq = 0; // guest: numbers its trade commands (1, 2, 3...)
  private tradeQueue: TrMsg[] = []; // guest: commands the host has not acknowledged yet (repeated until it does)
  private tradeTimer = 0;
  private tradeView: TradeView | null = null; // guest: the host's word on this player's trade
  private tradeNote: Note | null = null; // guest: the newest note the host sent
  private lastNote = -1; // the newest trade note already shown
  private tradeMsgSeq = 0; // host: numbers trade messages
  private sentTrade = new Map<number, string>(); // host: what each friend was last told about their trade
  private tradeWasOpen = false;

  constructor(
    zone: Zone,
    private sprites: Sprites,
    private ui: Ui,
    private loadZone: ZoneLoader,
    renderer: Renderer,
  ) {
    this.wardrobe = sprites.wardrobe;
    this.transition = new ZoneTransition(renderer);
    this.top.addChild(this.stage, this.transition.view);
    this.home = this.zone = this.view = this.addZone(zone);
    this.overlay = new MapOverlay(zone.data);
    const hero = newHero();
    this.local = new Player(this.wardrobe.sheet(heroOutfit(hero)), hero);
    this.local.zone = this.home.name;
    this.home.world.layer.addChild(this.player);
    this.stage.addChild(this.home.world);

    // Entities are positioned by their feet so they y-sort with map objects.
    this.player.position.set(...cellFeet(zone.data.spawn));
    this.syncHeroBodies();
    this.ui.shop.onGearChange = () => this.refreshLook();
    this.ui.shop.trader = () => this.trader();
    this.ui.trade.send = (cmd) => this.tradeCommand(cmd);
    this.ui.trade.onAsked = () => this.ui.menu.close();
    this.tradeBook = new TradeBook({
      hero: (slot) => this.players().find((p) => p.slot === slot)?.hero,
      distance: (a, b) => {
        const [pa, pb] = [a, b].map((slot) => this.players().find((p) => p.slot === slot));
        return pa && pb ? Math.hypot(pa.body.x - pb.body.x, pa.body.y - pb.body.y) : null;
      },
      name: playerName,
    });
  }

  /** Build the running state of a loaded zone and keep it. */
  private addZone(zone: Zone): ZoneState {
    const z = new ZoneState(zone, this.sprites);
    z.mobWorld = {
      heroes: z.heroBodies as unknown as MobHeroes,
      slide: (body, mx, my) =>
        z.collision.slide(
          body,
          mx,
          my,
          this.inZone(z, () => this.bodies()),
        ),
      strike: (mob, target) => this.inZone(z, () => this.hurtHero(mob, target)),
      shoot: (mob, ux, uy) => this.inZone(z, () => this.mobShoot(mob, ux, uy)),
    };
    this.zones.set(zone.name, z);
    return z;
  }

  /** Run `fn` with `z` as the zone the scene is working in. */
  private inZone<T>(z: ZoneState, fn: () => T): T {
    const before = this.zone;
    this.zone = z;
    this.depth++;
    try {
      return fn();
    } finally {
      this.depth--;
      // If the local player changed zones meanwhile (a door, a defeat), the outermost call ends in their new zone.
      this.zone = this.depth === 0 ? this.view : before;
    }
  }

  // The zone being worked in, under the names the rules below use.
  private get world() {
    return this.zone.world;
  }
  private get camera() {
    return this.zone.camera;
  }
  private get collision() {
    return this.zone.collision;
  }
  private get effects() {
    return this.zone.effects;
  }
  private get data() {
    return this.zone.data;
  }
  private get npc(): Character | null {
    return this.zone.npc;
  }
  private get keepers(): Keeper[] {
    return this.zone.keepers;
  }
  private get mobs(): Mob[] {
    return this.zone.mobs;
  }
  private get chests(): Chest[] {
    return this.zone.chests;
  }
  private get ground(): GroundItem[] {
    return this.zone.ground;
  }

  get root(): Container {
    return this.top;
  }

  /** The local player's body and hero (also what playtest scripts poke; see .claude/skills/playtest). */
  private get player(): Character {
    return this.local.body;
  }

  private get hero(): Hero {
    return this.local.hero;
  }

  /** Start a kind of weather right now (playtest scripts); otherwise it changes at random. */
  setWeather(kind: WeatherKind) {
    this.weather.force(kind);
  }

  enter() {
    this.ui.menu.inventory.attach({ apply: (op) => this.doInvOp(op) });
    // Opened from a join link (#join=...): show the Online tab with the game code already filled in.
    if (this.ui.session.urlCode) this.ui.menu.toggle(this.hero, 'online');
  }

  exit() {
    this.ui.menu.inventory.attach(null);
    this.overlay.setAvailable(false);
    this.ui.dialog.close();
    this.ui.shop.close();
    if (this.ui.menu.open) this.ui.menu.toggle(this.hero);
    // The scene manager destroys the zone on the stage; the others are ours to free.
    for (const z of this.zones.values()) if (z.world.parent !== this.stage) z.dispose();
  }

  resize(width: number, height: number) {
    this.screen = { width, height };
    this.camera.resize(width, height);
    this.ui.dialog.layout(this.screen, this.ui.touch.rects());
    this.camera.follow(width, height, this.player.x, this.player.y);
  }

  update(dt: number) {
    const { menu, shop, dialog, hud, session, trade } = this.ui;
    this.syncRole(session.role);
    this.clock += dt;
    const online = this.role !== 'solo';
    this.overlay.setAvailable(online && this.zone === this.home);
    menu.setOnline(online);
    this.syncTrade(dt, online);
    if (online && !menu.open && !dialog.active && mapPressed()) this.overlay.toggle();
    if (!dialog.active && menuPressed()) {
      if (trade.open) this.tradeCommand({ c: 'cancel' });
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

    if (this.role === 'client') this.updateClient(dt);
    else this.updateSimulation(dt);
    this.prefetchDoors(dt);

    // What the local player sees: the zone they are in (a door above may just have changed it).
    const z = this.zone;
    z.effects.update(dt);
    if (z.weatherLayer && z.ambient) {
      if (this.role !== 'client') this.weather.update(dt); // a guest shows the host's weather (see applySnapshot)
      z.ambient.wind = this.weather.wind;
      // Solo and host roll the lightning (anywhere around a player in this zone); a guest only draws the host's.
      const strike = z.weatherLayer.update(
        dt,
        this.weather,
        z.camera.view(this.screen.width, this.screen.height),
        this.role === 'client' ? undefined : () => this.strikeTarget(),
      );
      if (strike) {
        this.emit({ type: 'lightning', ...strike });
        this.lightningHits(strike);
      }
      z.ambient.update(dt, this.player, [
        ...this.players().map((p) => p.body),
        ...z.mobs.filter((m) => m.alive).map((m) => m.body),
      ]);
    }

    z.npc?.animate(dt * 1000, false);
    for (const k of z.keepers) k.body.animate(dt * 1000, false);
    for (const item of z.ground) {
      item.update(dt, Math.hypot(this.player.x - item.x, this.player.y - item.y) < PICKUP_REACH);
    }
    for (const body of this.bodies()) body.zIndex = body.y;
    hud.update(this.hero);
    if (this.overlay.open) {
      const pin = (p: Player) => ({ slot: p.slot, x: p.body.x, y: p.body.y });
      // A player the host has not yet placed (their body is still hidden) has no position to show.
      this.overlay.update(
        pin(this.local),
        this.players()
          .filter((p) => p !== this.local && p.body.visible)
          .map(pin),
      );
    }
    z.camera.follow(this.screen.width, this.screen.height, this.player.x, this.player.y);
    // A slide shifts the whole new zone in; the weather is the sky over the screen, so it stays put.
    const shift = this.transition.update(dt, this.screen, this.heroOnScreen());
    z.world.position.x += shift.x;
    z.world.position.y += shift.y;
    z.weatherLayer?.view.position.set(-shift.x / z.camera.zoom, -shift.y / z.camera.zoom);
  }

  /** Where the local player is on screen (CSS px): the middle of their body, which the door iris closes and opens on. */
  private heroOnScreen(): { x: number; y: number } {
    const { world, camera } = this.view;
    return { x: world.x + this.player.x * camera.zoom, y: world.y + (this.player.y - 20) * camera.zoom };
  }

  /**
   * Solo and host: the authoritative game. The host additionally runs its friends' players and sends them snapshots.
   * Only zones with a player in them are simulated; the rest stand still until someone walks in.
   */
  private updateSimulation(dt: number) {
    const { menu, shop, dialog, trade } = this.ui;
    const host = this.role === 'host';
    if (host) {
      this.reconcileGuests();
      this.handleTrades();
      this.handleTradeSteps(dt);
    }
    const raw = this.readCommand();
    // Reading a dialog or the menu: the player stands still (a solo dialog freezes the whole world instead). So do
    // they while a door transition plays, and only take the next door once it is over.
    const reading = menu.open || shop.open || trade.open || dialog.active || this.transition.busy;
    const cmd = reading ? { ...raw, dx: 0, dy: 0, mag: false } : raw;
    const guests = [...this.remotes.values()].map((p) => ({ p, cmd: this.remoteCommand(p) }));
    const commandOf = (p: Player) => (p === this.local ? cmd : (guests.find((g) => g.p === p)?.cmd ?? NO_COMMAND));
    const here = this.zone;

    if (host || !dialog.active) {
      for (const z of this.occupiedZones()) {
        this.inZone(z, () => {
          const present = this.players();
          for (const p of present) this.updatePlayer(p, commandOf(p), dt);
          for (const mob of z.mobs) mob.update(dt, z.mobWorld);
          this.ageGround(dt);
          for (const p of present) if (commandOf(p).mag) this.cast(p);
          if (z !== here) z.effects.update(dt); // the local zone's effects are updated with the rest of what is drawn
        });
      }
    } else {
      this.player.animate(dt * 1000, false); // the world is frozen while talking
    }
    if (!menu.open && !shop.open && !trade.open && !this.transition.busy) {
      this.handleAction(cmd.act, () => this.act(this.local));
    }
    for (const g of guests) if (g.cmd.act) this.inZone(this.zoneOf(g.p), () => this.act(g.p));
    if (!reading) this.checkDoors();
    for (const g of guests) this.checkDoorsFor(g.p);
    if (host) {
      this.broadcast(dt);
      this.sendPacks(dt);
    }
  }

  /** Guest: no simulation. Show what the host last said, and tell it what this player is doing. */
  private updateClient(dt: number) {
    const { menu, shop, dialog, session, trade } = this.ui;
    const snap = session.takeSnapshot();
    if (snap) this.applySnapshot(snap);
    const pack = session.takePack();
    if (pack) this.applyPack(pack);
    const looks = session.takeLooks();
    if (looks) this.applyLooks(looks);
    const tradeState = session.takeTrade();
    if (tradeState) this.applyTrade(tradeState);
    for (const p of this.players()) this.drawRemotePlayer(p, dt);
    for (const mob of this.mobs) mob.updateRemote(dt);

    const cmd = this.readCommand();
    const reading = menu.open || shop.open || trade.open || dialog.active || this.transition.busy;
    if (!menu.open && !shop.open && !trade.open && !this.transition.busy) {
      this.handleAction(cmd.act, () => this.actCount++);
    }
    if (!reading && cmd.mag) this.magCount++;
    this.sendInput(dt, reading ? 0 : packKeys(cmd.dx, cmd.dy));
  }

  // --- Zones ---

  /** Every player in the game, wherever they are: the local one, then the rest. */
  private everyone(): Player[] {
    return [this.local, ...this.remotes.values()];
  }

  /** The zone a player is in (the start zone for one that is somewhere unknown). */
  private zoneOf(p: Player): ZoneState {
    return this.zones.get(p.zone) ?? this.home;
  }

  /** The zones that have a player in them: the only ones worth simulating. The local player's comes first. */
  private occupiedZones(): ZoneState[] {
    return [...new Set(this.everyone().map((p) => this.zoneOf(p)))];
  }

  /** Start loading a zone if it is not loaded or loading yet. Resolves when it is ready (and does nothing if it already is). */
  private ensureZone(name: string): Promise<void> {
    if (this.zones.has(name)) return Promise.resolve();
    let pending = this.loading.get(name);
    if (!pending) {
      pending = this.loadZone(name)
        .then((zone) => {
          if (!this.zones.has(name)) this.addZone(zone);
        })
        .finally(() => this.loading.delete(name));
      this.loading.set(name, pending);
      pending.catch((err: unknown) => console.error(`Could not load zone "${name}"`, err));
    }
    return pending;
  }

  /** Load the zones behind doors a player is walking up to, so stepping through is instant. */
  private prefetchDoors(dt: number) {
    this.prefetchTimer -= dt;
    if (this.prefetchTimer > 0) return;
    this.prefetchTimer = PREFETCH_EVERY;
    for (const p of this.role === 'client' ? [this.local] : this.everyone()) {
      for (const door of doorsNear(this.zoneOf(p).data, p.body.x, p.body.y, PREFETCH_REACH)) {
        void this.ensureZone(door.to.zone);
      }
    }
  }

  /** Solo and host: take the local player through a door they are standing on. */
  private checkDoors() {
    this.checkDoorsFor(this.local);
  }

  private checkDoorsFor(p: Player) {
    const door = doorAt(this.zoneOf(p).data, p.body.x, p.body.y);
    if (!door) return;
    const dest = this.zones.get(door.to.zone);
    if (dest) this.travel(p, dest, door.to);
    else void this.ensureZone(door.to.zone); // not loaded yet: the player waits in the doorway and the next frame tries again
  }

  /**
   * Move a player through a door into `dest`, which is loaded. The local player's view follows them, through an iris
   * or a slide (`door` false: not through a door, e.g. waking after a defeat, which always irises).
   */
  private travel(p: Player, dest: ZoneState, to: CellPoint, door = true) {
    const from = this.zoneOf(p);
    if (p === this.local) this.beginTrip(from, dest, door);
    from.world.layer.removeChild(p.body);
    from.ambient?.forget(p.body);
    dest.world.layer.addChild(p.body);
    p.zone = dest.name;
    p.body.position.set(...cellFeet(to));
    p.body.face(arrivalFacing(dest.data, from.name, to));
    p.body.setOffset(0, 0);
    p.vel = { x: 0, y: 0 };
    p.knock = { x: 0, y: 0 };
    p.pendingShot = null;
    p.invuln = Math.max(p.invuln, ARRIVE_INVULN);
    this.syncHeroBodies();
    if (p === this.local) this.showZone(dest);
  }

  /**
   * The local player is about to leave `from` for `dest`: picture the view they are leaving and start the transition
   * (map/transition.ts picks an iris for rooms, a slide for walking off a map edge into more open air).
   */
  private beginTrip(from: ZoneState, dest: ZoneState, door = true) {
    const pick = pickTransition(from.data, dest.data, this.player.x, this.player.y);
    const kind = door ? pick.kind : 'iris';
    this.transition.begin(
      kind,
      pick.dir,
      this.stage,
      this.screen,
      this.heroOnScreen(),
      kind === 'slide' ? [this.player, ...(from.weatherLayer ? [from.weatherLayer.view] : [])] : [],
    );
  }

  /** Draw `dest` as the world the local player is in: swap it onto the stage (the transition covers the cut). */
  private showZone(dest: ZoneState) {
    if (dest === this.view && dest.world.parent === this.stage) return;
    this.stage.removeChildren();
    this.stage.addChild(dest.world);
    this.view = dest;
    if (this.depth === 0) this.zone = dest;
    dest.camera.resize(this.screen.width, this.screen.height);
    dest.camera.follow(this.screen.width, this.screen.height, this.player.x, this.player.y);
    this.ui.shop.close();
  }

  // --- Roles ---

  /** Switch to `role` (a friend connected or everyone dropped), setting the world up for it. */
  private syncRole(role: Role) {
    if (role === this.role) return;
    if (this.role !== 'solo') this.leaveCoop();
    if (role === 'host') this.enterHost();
    else if (role === 'client') this.enterClient();
    this.role = role;
  }

  /** In every zone, the bodies of the players there: everyone mobs may attack, and everyone who blocks others. */
  private syncHeroBodies() {
    for (const z of this.zones.values()) {
      z.heroBodies.splice(
        0,
        z.heroBodies.length,
        ...this.everyone()
          .filter((p) => p.zone === z.name)
          .map((p) => p.body),
      );
    }
  }

  /** In a co-op game every player wears a coloured tag ("P2") over their head, so friends can tell each other apart. */
  private applyTags() {
    for (const p of this.everyone()) p.body.setTag(playerTag(p.slot), PLAYER_COLORS[p.slot]);
  }

  /** Put another player in the world. Their stats are theirs alone: they start as a fresh hero. */
  private addRemote(slot: number, where: ZoneState = this.zone): Player {
    const hero = newHero();
    hero.name = playerName(slot);
    const remote = new Player(this.wardrobe.sheet(playerOutfit(slot, hero)), hero, slot);
    remote.zone = where.name;
    where.world.layer.addChild(remote.body);
    this.remotes.set(slot, remote);
    this.syncHeroBodies();
    this.applyTags();
    return remote;
  }

  /** Take a player out of the world, with a notice floating where they stood. */
  private removeRemote(slot: number, notice: (p: Player) => void) {
    const remote = this.remotes.get(slot);
    if (!remote) return;
    const where = this.zoneOf(remote);
    this.inZone(where, () => notice(remote));
    this.remotes.delete(slot);
    this.sentPack.delete(slot);
    this.sentTrade.delete(slot);
    this.feeds.delete(slot);
    this.tradeBook.drop(slot);
    remote.body.parent?.removeChild(remote.body);
    where.ambient?.forget(remote.body);
    remote.body.destroy({ children: true });
    this.syncHeroBodies();
  }

  private enterHost() {
    this.events = [];
    this.feeds.clear();
    this.snapTimer = 0;
    this.reconcileGuests();
  }

  private enterClient() {
    // This machine's hero becomes the player the host seated it as. The solo hero is put back on disconnect.
    const slot = this.ui.session.slot;
    // The host owns this player's character from now on: a fresh hero whose stats, gold, pack and gear it keeps and sends.
    this.solo = this.local.hero;
    this.local.hero = newHero();
    this.stashGround(); // the host's world has its own items on the ground
    this.pendingOps = [];
    this.invSeq = 0;
    this.local.setSlot(slot);
    this.hero.name = playerName(slot);
    this.lastSay = -1;
    this.resetTrade();
    this.ui.shop.close();
    this.player.setSheet(this.wardrobe.sheet(playerOutfit(slot, this.hero)));
    this.local.target = null;
    this.lastEvent = -1;
    this.actCount = this.magCount = this.inputSeq = 0;
    this.sent = { keys: -1, act: -1, mag: -1, ack: -1, vr: -1, inv: 0 };
    this.inputTimer = 0;
    this.applyTags();
  }

  /** Guest: set this machine's own items on the ground aside, and clear every zone for the host's. */
  private stashGround() {
    this.soloGround.clear();
    for (const z of this.zones.values()) {
      this.soloGround.set(
        z.name,
        z.ground.map((g) => ({ item: g.item, x: g.x, y: g.y, age: g.age })),
      );
      for (const g of [...z.ground]) {
        z.ground.splice(z.ground.indexOf(g), 1);
        g.destroy({ children: true });
      }
    }
  }

  /** Back to solo: the host's items go, and this machine's own come back (with the time they had left). */
  private restoreGround() {
    for (const z of this.zones.values()) {
      for (const g of [...z.ground]) {
        z.ground.splice(z.ground.indexOf(g), 1);
        g.destroy({ children: true });
      }
      for (const { item, x, y, age } of this.soloGround.get(z.name) ?? []) {
        const g = new GroundItem(item, x, y, ++this.groundId, age);
        z.ground.push(g);
        z.world.layer.addChild(g);
      }
    }
    this.soloGround.clear();
  }

  private leaveCoop() {
    const left = this.role === 'host' ? undefined : 'Disconnected';
    for (const slot of [...this.remotes.keys()]) {
      this.removeRemote(slot, (p) => {
        if (this.role === 'host') this.text(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff);
      });
    }
    this.local.body.setTag(null);
    this.resetTrade();

    if (this.role === 'client') {
      // Back to the solo hero, standing where it ended up, with the mobs carrying on on their own.
      if (this.solo) this.local.hero = this.solo;
      this.solo = null;
      this.restoreGround();
      this.pendingOps = [];
      this.ui.shop.close();
      this.ui.menu.refresh(this.hero);
      this.local.setSlot(0);
      this.player.setSheet(this.wardrobe.sheet(heroOutfit(this.hero)));
      this.local.target = null;
      this.local.flags = 0;
      this.local.invuln = 0;
      this.local.knock = { x: 0, y: 0 };
      this.local.vel = { x: 0, y: 0 };
      this.player.alpha = 1;
      this.player.setOffset(0, 0);
      for (const z of this.zones.values()) for (const mob of z.mobs) mob.release();
    }
    this.role = 'solo'; // so nothing below is broadcast
    if (left) this.effects.add(floatText(this.player.x, this.player.y - 54, left, 0xffffff));
  }

  // --- Co-op: host side ---

  /** Host: players follow the session's connected seats. A friend who connected appears at the spawn; one who left goes. */
  private reconcileGuests() {
    const connected = this.ui.session.connectedSlots();
    for (const slot of connected) {
      if (this.remotes.has(slot)) continue;
      const remote = this.addRemote(slot, this.home); // newcomers arrive at the start of the world
      // Spread newcomers along the spawn cell so they don't stand exactly on top of each other.
      const [x, y] = cellFeet(this.home.data.spawn);
      remote.body.position.set(x + (slot - 2) * 8, y);
      this.inZone(this.home, () =>
        this.text(remote.body.x, remote.body.y - 54, `${playerName(slot)} joined`, PLAYER_COLORS[slot] ?? 0xffffff),
      );
    }
    for (const slot of [...this.remotes.keys()]) {
      if (connected.includes(slot)) continue;
      this.removeRemote(slot, (p) => this.text(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff));
    }
  }

  /** A friend's controls for this tick. Action presses arrive as a running count, so none is lost or doubled. */
  private remoteCommand(p: Player): Command {
    const peer = this.ui.session.peerInput(p.slot);
    if (!peer) return NO_COMMAND;
    const { dx, dy } = peer.fresh ? unpackKeys(peer.keys) : { dx: 0, dy: 0 };
    const act = peer.act > p.seenAct;
    const mag = peer.mag > p.seenMag;
    p.seenAct = peer.act;
    p.seenMag = peer.mag;
    return { dx, dy, act, mag };
  }

  /** Something every friend should also see (it is shown there, never simulated). Only a host records these. */
  private emit(e: WorldEvent) {
    if (this.role === 'host') this.events.push({ id: ++this.eventId, at: this.clock, zone: this.zone.name, e });
  }

  private broadcast(dt: number) {
    this.snapTimer += dt;
    if (this.remotes.size === 0 || this.snapTimer < 1 / SNAPSHOT_HZ) return;
    this.snapTimer = 0;
    this.events = this.events.filter((ev) => this.clock - ev.at < EVENT_KEEP);
    // Each friend is sent the zone they are standing in. Friends in the same zone share one picture of it (the players,
    // the chests); what differs per friend is their own stats, which mobs are near them, and which events they have not
    // yet confirmed. A zone nobody is in costs nothing.
    const everyone = this.everyone();
    const shared = new Map<
      string,
      { base: Omit<SnapMsg, 'me' | 'mobs' | 'events' | 'ground'>; states: MobFields[]; ground: GroundSnap[] }
    >();
    const worldOf = (z: ZoneState) => {
      let world = shared.get(z.name);
      if (!world) {
        world = {
          base: {
            k: 'snap',
            n: ++this.snapSeq,
            zone: z.name,
            away: everyone.filter((p) => p.zone !== z.name).map((p) => p.slot),
            players: everyone.filter((p) => p.zone === z.name).map((p) => this.snapPlayer(p)),
            chests: z.chests.reduce((mask, c, i) => (c.opened ? mask | (1 << i) : mask), 0),
            w: this.weather.snapshot(),
          },
          states: z.mobs.map((m) => encodeMob(m.view())),
          ground: z.ground.map((g): GroundSnap => [
            g.id,
            round1(g.x),
            round1(g.y),
            itemCode(g.item),
            Math.ceil(g.remaining),
          ]),
        };
        shared.set(z.name, world);
      }
      return world;
    };
    for (const [slot, remote] of this.remotes) {
      const z = this.zoneOf(remote);
      const { base, states, ground } = worldOf(z);
      const peer = this.ui.session.peerInput(slot);
      let entry = this.feeds.get(slot);
      if (!entry || entry.zone !== z.name)
        this.feeds.set(slot, (entry = { zone: z.name, feed: new MobFeed(), ground: null }));
      const mobs = entry.feed.select(states, remote.body, peer?.vr || DEFAULT_VIEW, this.clock);
      const events = this.events
        .filter((ev) => ev.zone === z.name && ev.id > (peer?.ack ?? 0))
        .slice(-MAX_EVENTS_SENT)
        .map(({ id, e }) => ({ id, e }));
      // The ground changes rarely (an item dropped, picked up or gone): list it when it does, and once a second anyway
      // (the countdown to crumbling, and a lost packet).
      const sig = ground.map((g) => g.slice(0, 4).join()).join(';');
      const listGround = !entry.ground || entry.ground.sig !== sig || this.clock - entry.ground.at >= GROUND_RESEND;
      if (listGround) entry.ground = { sig, at: this.clock };
      this.ui.session.sendTo(slot, {
        ...base,
        mobs,
        events,
        ...(listGround ? { ground } : {}),
        me: this.snapStats(remote.hero.stats),
      });
    }
  }

  private snapPlayer(p: Player): PlayerSnap {
    const swinging = this.isSwinging(p);
    const flags = (p.moving ? FLAG.moving : 0) | (p.invuln > 0 ? FLAG.invuln : 0) | (swinging ? FLAG.swing : 0);
    return [p.slot, Math.round(p.body.x), Math.round(p.body.y), dirIndex(p.body.facing), flags];
  }

  private snapStats(s: Stats): StatsSnap {
    return [s.level, s.xp, round1(s.hp), s.maxHp, round1(s.mp), s.maxMp, s.attack, s.defense, s.magic];
  }

  /** Host: carry out what each friend asked to do with their own gold and pack. The guest only sends wishes; these checks are the rules. */
  private handleTrades() {
    for (const p of this.remotes.values()) {
      for (const request of this.ui.session.takeTrades(p.slot)) {
        const out = this.tradeFor(p, request);
        p.reply = { id: request.n, text: out.text, ok: out.ok };
        if (out.gear) p.body.setSheet(this.wardrobe.sheet(playerOutfit(p.slot, p.hero)));
      }
      this.inZone(this.zoneOf(p), () => this.applyPeerInv(p));
    }
  }

  private tradeFor(p: Player, { op, item: code, shop: shopId }: DoMsg): Outcome {
    const item = itemFromCode(code);
    if (!item) return { ok: false, text: 'Unknown item' };
    const trader = localTrader(p.hero);
    if (op === 'wear') return trader.wear(item) ?? { ok: false, text: '' };
    if (op === 'use') return trader.use(item) ?? { ok: false, text: '' };
    // Buying and selling happen at a counter: the player has to be standing at that shop's keeper.
    const shop = SHOPS[shopId];
    const keeper = this.zoneOf(p).keepers.find((k) => k.shop === shopId);
    if (!shop || !keeper) return { ok: false, text: 'Unknown shop' };
    if (Math.hypot(p.body.x - keeper.body.x, p.body.y - keeper.body.y) > KEEPER_REACH + CELL) {
      return { ok: false, text: 'Too far from the counter' };
    }
    return (op === 'buy' ? trader.buy(shop, item) : trader.sell(shop, item)) ?? { ok: false, text: '' };
  }

  /** Host: tell each friend about their gold and pack when they change, and now and then in case a packet was lost. */
  private sendPacks(dt: number) {
    if (this.remotes.size === 0) return;
    this.packTimer += dt;
    const periodic = this.packTimer >= PACK_RESEND;
    if (periodic) this.packTimer = 0;
    const looks = this.everyone().map((p) => [p.slot, ...gearCodes(p.hero)]);
    const looksSig = JSON.stringify(looks);
    const looksChanged = looksSig !== this.sentLooks;
    this.sentLooks = looksSig;
    for (const [slot, p] of this.remotes) {
      const body = {
        gold: p.hero.gold,
        worn: gearCodes(p.hero),
        items: packCodes(p.hero),
        ack: p.seenInv,
        ...(p.reply ? { say: p.reply } : {}),
      };
      const sig = JSON.stringify(body);
      if (periodic || sig !== this.sentPack.get(slot)) {
        this.sentPack.set(slot, sig);
        this.ui.session.sendTo(slot, { k: 'pack', n: ++this.packSeq, ...body });
      }
      if (periodic || looksChanged) this.ui.session.sendTo(slot, { k: 'looks', n: ++this.packSeq, players: looks });
      this.sendTrade(slot, periodic);
    }
  }

  /** Host: tell a friend about their trade (and which of their commands it has taken) when it changes, and now and then. */
  private sendTrade(slot: number, periodic: boolean) {
    const view = this.tradeBook.viewFor(slot);
    const note = this.tradeBook.noteFor(slot);
    const body = {
      ack: this.ui.session.tradeAck(slot),
      view: view ? viewToWire(view) : null,
      ...(note ? { note } : {}),
    };
    const sig = JSON.stringify(body);
    if (!periodic && sig === this.sentTrade.get(slot)) return;
    this.sentTrade.set(slot, sig);
    this.ui.session.sendTo(slot, { k: 'trade', n: ++this.tradeMsgSeq, ...body });
  }

  // --- Trading between players ---

  /** Host: do what the friends asked of the trade book, then let it end trades whose players walked apart. */
  private handleTradeSteps(dt: number) {
    for (const p of this.remotes.values()) {
      for (const step of this.ui.session.takeTradeSteps(p.slot)) this.tradeBook.apply(p.slot, step.cmd);
    }
    this.tradeBook.update(dt);
  }

  /** A command from this player's trade UI: the host's book takes it directly; a friend sends it to the host. */
  private tradeCommand(cmd: TradeCommand) {
    if (this.role === 'host') {
      this.tradeBook.apply(0, cmd);
    } else if (this.role === 'client' && this.tradeQueue.length < MAX_TRADE_QUEUE) {
      const msg: TrMsg = { k: 'tr', n: ++this.tradeSeq, cmd };
      this.tradeQueue.push(msg);
      this.ui.session.send(msg);
    }
  }

  /** Guest: the host's word on this player's trade; whatever it has taken in order no longer needs repeating. */
  private applyTrade(msg: TradeMsg) {
    this.tradeView = msg.view ? viewFromWire(msg.view) : null;
    this.tradeNote = msg.note ?? null;
    this.tradeQueue = this.tradeQueue.filter((m) => m.n > msg.ack);
  }

  /** Every frame online: feed the trade screens, show notes, and (guest) repeat commands the host has not acknowledged. */
  private syncTrade(dt: number, online: boolean) {
    const { trade, menu, shop } = this.ui;
    if (!online) return;
    const guest = this.role === 'client';
    if (guest) {
      this.tradeTimer += dt;
      if (this.tradeTimer >= TRADE_RESEND && this.tradeQueue.length) {
        this.tradeTimer = 0;
        for (const msg of this.tradeQueue) this.ui.session.send(msg);
      }
    }
    const view = guest ? this.tradeView : this.tradeBook.viewFor(0);
    const note = guest ? this.tradeNote : this.tradeBook.noteFor(0);
    if (note && note.id > this.lastNote) {
      this.lastNote = note.id;
      trade.toast(note.text, note.ok);
    }
    const contacts = [...this.remotes.values()]
      .filter((p) => p.body.visible)
      .map((p) => ({
        slot: p.slot,
        color: PLAYER_COLORS[p.slot] ?? 0xffffff,
        near: Math.hypot(p.body.x - this.player.x, p.body.y - this.player.y) <= TRADE_START,
      }));
    trade.sync({ hero: this.hero, view, pending: guest && this.tradeQueue.length > 0, contacts });
    if (trade.open) {
      menu.close(); // the window takes over
      shop.close();
    }
    if (this.tradeWasOpen && !trade.open) {
      // A trade ended: gold and pack may have changed under the other screens.
      menu.refresh(this.hero);
      shop.refresh(this.hero);
    }
    this.tradeWasOpen = trade.open;
  }

  /** Forget all trade state (a co-op game starts or ends). */
  private resetTrade() {
    this.tradeBook.clear();
    this.tradeSeq = 0;
    this.tradeQueue = [];
    this.tradeView = null;
    this.tradeNote = null;
    this.lastNote = -1;
    this.tradeTimer = 0;
    this.sentTrade.clear();
    this.tradeWasOpen = false;
    this.ui.trade.reset();
  }

  // --- Co-op: guest side ---

  /** Guest: the host's word on this player's gold, pack and gear. */
  private applyPack(pack: PackMsg) {
    const hero = this.hero;
    const sig = JSON.stringify([pack.gold, pack.worn, pack.items]);
    const worn = gearCodes(hero).join();
    hero.gold = pack.gold;
    this.pendingOps = this.pendingOps.filter((o) => o.seq > pack.ack);
    if (this.pendingOps.length === 0) {
      // Take the host's word for the gear and pack, once it has done every action sent (until then ours is ahead of it).
      setGear(hero, pack.worn);
      setPack(hero, pack.items);
    }
    if (gearCodes(hero).join() !== worn) this.refreshLook();
    if (pack.say && pack.say.id > this.lastSay) {
      this.lastSay = pack.say.id;
      this.ui.shop.report({ ok: pack.say.ok, text: pack.say.text });
    }
    if (sig === this.lastPackSig) return;
    this.lastPackSig = sig;
    this.ui.shop.refresh(hero); // the answer to a click, or a drop from a chest
    this.ui.menu.refresh(hero);
  }

  /** Guest: what the other players wear. */
  private applyLooks({ players }: LooksMsg) {
    for (const [slot = -1, ...codes] of players) {
      const remote = this.remotes.get(slot);
      if (!remote) continue;
      const before = gearCodes(remote.hero).join();
      setGear(remote.hero, codes);
      if (gearCodes(remote.hero).join() !== before) {
        remote.body.setSheet(this.wardrobe.sheet(playerOutfit(slot, remote.hero)));
      }
    }
  }

  /** Send the controls: when they change, and otherwise at INPUT_HZ so a lost packet is soon corrected. */
  private sendInput(dt: number, keys: number) {
    this.inputTimer += dt;
    const ack = Math.max(0, this.lastEvent);
    const view = this.camera.view(this.screen.width, this.screen.height);
    const vr = Math.min(MAX_VIEW, Math.ceil(Math.hypot(view.w, view.h) / 2));
    const pending = this.pendingOps[0]; // the oldest action the host has not confirmed, repeated until it does
    const changed =
      keys !== this.sent.keys ||
      this.actCount !== this.sent.act ||
      this.magCount !== this.sent.mag ||
      ack !== this.sent.ack ||
      vr !== this.sent.vr ||
      (pending?.seq ?? 0) !== this.sent.inv;
    if (!changed && this.inputTimer < 1 / INPUT_HZ) return;
    this.inputTimer = 0;
    const msg = {
      k: 'in',
      n: ++this.inputSeq,
      keys,
      act: this.actCount,
      mag: this.magCount,
      ack,
      vr,
      ...(pending ? { inv: [pending.seq, ...encodeOp(pending.op)] as [number, ...InvOpWire] } : {}),
    } as const;
    if (this.ui.session.send(msg)) {
      this.sent = { keys, act: this.actCount, mag: this.magCount, ack, vr, inv: pending?.seq ?? 0 };
    }
  }

  private applySnapshot(snap: SnapMsg) {
    // The host says which zone this player is in. If it is a new one, swap the view to it (once it is loaded).
    if (snap.zone !== this.local.zone) {
      const dest = this.zones.get(snap.zone);
      if (!dest) {
        // Close on the zone they are leaving and stay shut until the next one has loaded.
        if (!this.transition.busy) this.transition.begin('iris', 'down', null, this.screen, this.heroOnScreen());
        this.transition.hold(true);
        void this.ensureZone(snap.zone);
        return; // nothing to draw it into yet: the next snapshot will find the zone loaded
      }
      this.followToZone(dest);
    }

    // Everyone the host lists is in the game: here (listed) or in another zone (`away`); anyone else has left.
    const present = new Set<number>(snap.away);
    for (const state of snap.players) {
      const slot = state[0];
      present.add(slot);
      if (slot === this.local.slot) this.setPlayerState(this.local, state);
      else {
        const remote = this.remotes.get(slot) ?? this.addHiddenRemote(slot);
        this.placeRemote(remote, this.zone);
        this.setPlayerState(remote, state);
      }
    }
    for (const slot of snap.away) this.placeRemote(this.remotes.get(slot), null);
    for (const slot of [...this.remotes.keys()]) {
      if (!present.has(slot)) {
        this.removeRemote(slot, (p) =>
          this.effects.add(floatText(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff)),
        );
      }
    }

    this.weather.setRemote(snap.w);
    this.chests.forEach((c, i) => c.setOpen((snap.chests & (1 << i)) !== 0));
    if (snap.ground) this.syncGround(snap.ground); // absent: the same items as before
    for (const [index, ...state] of snap.mobs) this.mobs[index]?.setRemote(decodeMob(state)); // only the mobs the host listed: the rest are out of sight

    const [level, xp, hp, maxHp, mp, maxMp, attack, defense, magic] = snap.me;
    if (maxHp > 0 && maxMp > 0)
      Object.assign(this.hero.stats, { level, xp, hp, maxHp, mp, maxMp, attack, defense, magic });

    let newest = this.lastEvent;
    for (const { id, e } of snap.events) {
      if (id <= this.lastEvent) continue; // already shown (events repeat across snapshots)
      newest = Math.max(newest, id);
      this.showEvent(e);
    }
    this.lastEvent = newest;
  }

  /** Guest: the host moved this player to `dest`; show it. Everyone else is placed again by the snapshot's list. */
  private followToZone(dest: ZoneState) {
    // Already shut while the zone loaded: just open on it. Otherwise picture the zone being left and go.
    if (this.transition.holding) this.transition.hold(false);
    else this.beginTrip(this.zoneOf(this.local), dest);
    this.zoneOf(this.local).world.layer.removeChild(this.player);
    this.zoneOf(this.local).ambient?.forget(this.player);
    dest.world.layer.addChild(this.player);
    this.local.zone = dest.name;
    this.local.target = null; // appear where the host says, not gliding from the old zone
    this.showZone(dest);
    this.syncHeroBodies();
  }

  /** Guest: put a friend in zone `where` (they are drawn there), or take them out of sight (`null`: in another zone). */
  private placeRemote(remote: Player | undefined, where: ZoneState | null) {
    if (!remote) return;
    const from = remote.body.parent;
    if (where === null) {
      if (from) from.removeChild(remote.body);
      remote.zone = '';
      remote.target = null;
    } else if (remote.zone !== where.name || from !== where.world.layer) {
      from?.removeChild(remote.body);
      where.world.layer.addChild(remote.body);
      remote.zone = where.name;
      remote.target = null; // first word from the host in this zone: appear there
    }
    this.syncHeroBodies();
  }

  /** A player the host just told us about: made now, shown once the state arrives (setPlayerState). */
  private addHiddenRemote(slot: number): Player {
    const remote = this.addRemote(slot);
    remote.body.visible = false;
    return remote;
  }

  private setPlayerState(p: Player, [, x, y, dir, flags]: PlayerSnap) {
    p.body.face(DIRS[dir] ?? 'down');
    p.flags = flags;
    if (!p.target) p.body.position.set(x, y); // first word from the host: appear there
    p.body.visible = true;
    p.target = { x, y };
  }

  /** Guest: draw a player from what the host last said (position glides; the rest comes from the flags). */
  private drawRemotePlayer(p: Player, dt: number) {
    if (p.target) glide(p.body, p.target.x, p.target.y, dt);
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = (p.flags & FLAG.swing) !== 0;
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.alpha = p.flags & FLAG.invuln && Math.floor(this.clock * 16) % 2 === 0 ? 0.35 : 1;
    p.body.animate(dt * 1000, (p.flags & FLAG.moving) !== 0);
  }

  /** Where the next lightning bolt lands: anywhere in a wide area around a random player, so it is unpredictable. */
  private strikeTarget() {
    const all = this.players().filter((q) => q.zone === this.zone.name); // the zone the weather is drawn in
    const p = all[Math.floor(Math.random() * all.length)] ?? this.local;
    return { x: p.body.x + (Math.random() - 0.5) * 840, y: p.body.y + (Math.random() - 0.5) * 600 };
  }

  /** A bolt burns whoever stands where it lands (only the host or a solo game decides this). */
  private lightningHits({ x, y }: { x: number; y: number }) {
    this.fx('hitSpark', x, y);
    for (const p of this.players()) {
      if (p.zone !== this.zone.name || p.invuln > 0 || Math.hypot(p.body.x - x, p.body.y - y) > LIGHTNING_RADIUS)
        continue;
      this.harm(p, Math.max(1, Math.round(p.hero.stats.maxHp * LIGHTNING_DAMAGE)), x, y);
    }
  }

  private showEvent(e: WorldEvent) {
    switch (e.type) {
      case 'lightning':
        this.view.weatherLayer?.strike(e);
        break;
      case 'slash':
        this.swing(e.x, e.y, DIRS[e.dir] ?? 'down');
        this.playerNumbered(e.p)?.body.play('slash');
        break;
      case 'draw':
        this.playerNumbered(e.p)?.body.play('shoot');
        break;
      case 'arrow':
        this.flyArrow(e.x, e.y, e.vx, e.vy, e.range);
        break;
      case 'bolt':
        if (e.color === undefined) {
          this.shoot(e.x, e.y, e.vx, e.vy);
          this.playerNumbered(e.p)?.body.play('cast');
        } else {
          this.foeBolt(e.x, e.y, e.vx, e.vy, e.color); // an enemy's shot: only drawn here, the host decides what it hits
        }
        break;
      case 'text':
        this.effects.add(floatText(e.x, e.y, e.text, e.color));
        break;
      case 'fx':
        this.effects.add(particleEffect(e.name, e.x, e.y, { dir: e.dir }));
        if (e.name === 'heroHurt') this.playerNumbered(e.p)?.body.play('hurt');
        break;
      case 'defeat':
        if (e.player === this.local.slot) this.ui.dialog.say(DEFEAT_LINES); // that's this machine's player
        break;
    }
  }

  // --- Players ---

  private readCommand(): Command {
    return {
      dx: (actionDown('right') ? 1 : 0) - (actionDown('left') ? 1 : 0),
      dy: (actionDown('down') ? 1 : 0) - (actionDown('up') ? 1 : 0),
      act: actionPressed('attack'),
      mag: actionPressed('magic'),
    };
  }

  private updatePlayer(p: Player, cmd: Command, dt: number) {
    const s = p.hero.stats;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.castCooldown = Math.max(0, p.castCooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.sinceHit += dt;
    if (p.pendingShot && (p.pendingShot.timer -= dt) <= 0) this.release(p);
    s.mp = Math.min(s.maxMp, s.mp + MP_REGEN * dt);
    if (p.sinceHit > HP_REGEN_DELAY) s.hp = Math.min(s.maxHp, s.hp + HP_REGEN * dt);

    if (p.knock.x || p.knock.y) {
      this.collision.slide(p.body, p.knock.x * dt, p.knock.y * dt, this.bodies());
      const decay = Math.exp(-12 * dt);
      p.knock.x *= decay;
      p.knock.y *= decay;
      if (Math.hypot(p.knock.x, p.knock.y) < 5) p.knock = { x: 0, y: 0 };
    }

    p.moving = this.move(p, cmd, dt);
    // Lunge into a swing; blink while invulnerable.
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = this.isSwinging(p);
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.alpha = p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0 ? 0.35 : 1;
    p.body.animate(dt * 1000, p.moving);
  }

  /** Returns true if the player is trying to move. On ice the velocity lags behind the keys, so they slide. */
  private move(p: Player, { dx, dy }: Command, dt: number): boolean {
    const len = Math.hypot(dx, dy);
    const wish = len ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
    if (len) {
      if (dx) p.body.face(dx > 0 ? 'right' : 'left');
      else p.body.face(dy > 0 ? 'down' : 'up');
      p.aim = wish;
    }
    p.vel = stepVelocity(p.vel, wish, SPEED, dt, isIce(this.data, p.body.x, p.body.y - 1));
    if (p.vel.x || p.vel.y) {
      const [x, y] = [p.body.x, p.body.y];
      this.collision.slide(p.body, p.vel.x * dt, p.vel.y * dt, this.bodies());
      // Running into something stops the slide on that axis.
      if (p.body.x === x) p.vel.x = 0;
      if (p.body.y === y) p.vel.y = 0;
    }
    return len > 0;
  }

  /** The local player's action button: advance the dialog, talk when next to the NPC or a shopkeeper, otherwise `attack`. */
  private handleAction(pressed: boolean, attack: () => void) {
    if (!pressed) return;
    const { dialog } = this.ui;
    const near = (body: Character, reach = CELL * 1.5) =>
      Math.hypot(this.player.x - body.x, this.player.y - body.y) < reach;
    const keeper = this.keepers.find((k) => near(k.body, KEEPER_REACH));
    const npc = this.npc;
    if (dialog.active) {
      dialog.advance();
    } else if (keeper) {
      this.talkToKeeper(keeper);
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

  /** Who carries out trades for the local player: this machine, or the host (a guest's gold and pack are the host's). */
  private trader(): Trader {
    if (this.role !== 'client') return localTrader(this.hero);
    return remoteTrader(({ op, item, shop }) => {
      this.ui.session.send({ k: 'do', n: ++this.doSeq, op, item, shop });
    });
  }

  /** Redraw the local hero for what it now wears (after the menu or a shop changed it). */
  private refreshLook(p: Player = this.local) {
    p.body.setSheet(this.wardrobe.sheet(playerOutfit(p.slot, p.hero)));
  }

  /** A player's action button (host and solo): open a chest within reach, otherwise swing. */
  private act(p: Player) {
    const chest = this.chests.find(
      (c) => !c.opened && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CHEST_REACH,
    );
    if (chest) return this.openChest(p, chest);
    const loose = this.nearestGround(p);
    if (loose) this.pickUp(p, loose);
    else this.attack(p);
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

  /** Pick an item up off the ground into the player's pack (it stays put if the pack is full). */
  private pickUp(p: Player, g: GroundItem) {
    const [x, y, name] = [g.x, g.y, g.item.name];
    if (!addToPack(p.hero, g.item)) return this.text(x, y - 22, 'Pack full', 0xff8a7a);
    this.removeGround(g);
    this.text(x, y - 22, name, 0xffd34d);
  }

  private addGround(item: Item, x: number, y: number, id = ++this.groundId, age = 0) {
    const g = new GroundItem(item, x, y, id, age);
    this.ground.push(g);
    this.world.layer.addChild(g);
  }

  private removeGround(g: GroundItem) {
    this.ground.splice(this.ground.indexOf(g), 1);
    g.destroy({ children: true }); // also takes it off the world layer
  }

  /** Host and solo: let time pass for the items on the ground here; one that has lain too long puffs away. */
  private ageGround(dt: number) {
    for (const g of [...this.ground]) {
      g.tick(dt);
      if (g.remaining > 0) continue;
      this.fx('mobPoof', g.x, g.y - 8);
      this.removeGround(g);
    }
  }

  /** Put an item on the ground a step ahead of a player (or at their feet if something is in the way). */
  private dropItem(p: Player, item: Item) {
    const { x, y, facing } = p.body;
    const [vx, vy] = DIR_VEC[facing];
    const fits = this.collision.fitsMap(x + vx * 20, y + vy * 20);
    this.addGround(item, fits ? x + vx * 20 : x, fits ? y + vy * 20 : y);
  }

  /** An Inventory action by the local player: done here, or (a co-op guest) done here at once and also sent to the host. */
  private doInvOp(op: InvOp): Result {
    const dropping = op.t === 'dropPack' || op.t === 'dropWorn';
    if (dropping && this.ground.length >= MAX_GROUND) return { ok: false, reason: 'Too many items are lying around.' };
    const result = applyInvOp(this.hero, op);
    if (!result.ok) return result;
    this.refreshLook();
    if (this.role === 'client') {
      this.pendingOps.push({ seq: ++this.invSeq, op });
      this.inputTimer = 1; // send it now
    } else if (result.dropped) {
      this.dropItem(this.local, result.dropped);
    }
    return result;
  }

  /** Host: do the Inventory action a friend is asking for (each is numbered, and done once and in order). */
  private applyPeerInv(p: Player) {
    const msg = this.ui.session.peerInput(p.slot)?.inv;
    if (!msg || msg[0] !== p.seenInv + 1) return;
    p.seenInv = msg[0];
    const op = decodeOp([msg[1], msg[2], msg[3]]);
    if (!op) return;
    if ((op.t === 'dropPack' || op.t === 'dropWorn') && this.ground.length >= MAX_GROUND) return;
    const result = applyInvOp(p.hero, op);
    if (!result.ok) return;
    this.refreshLook(p);
    if (result.dropped) this.dropItem(p, result.dropped);
  }

  /** Guest: show the items the host says are on the ground in this zone (and no others). */
  private syncGround(list: GroundSnap[]) {
    const ids = new Set(list.map((g) => g[0]));
    for (const g of [...this.ground]) if (!ids.has(g.id)) this.removeGround(g);
    for (const [id, x, y, code, left] of list) {
      const known = this.ground.find((g) => g.id === id);
      const item = itemFromCode(code);
      if (known) known.setRemaining(left);
      else if (item) this.addGround(item, x, y, id, GROUND_LIFETIME - left);
    }
  }

  private openChest(p: Player, chest: Chest) {
    const loot = CHEST_LOOTS[chest.loot];
    if (!loot) return;
    const found = collect(p.hero, loot);
    const [x, y] = [chest.x, chest.y - CELL];
    if (found.refused) {
      this.text(x, y - 14, found.text, 0xff8a7a);
      return;
    }
    chest.setOpen(true);
    this.fx('levelUp', x, y + 6);
    this.text(x, y - 14, found.text, 0xffd34d);
    if (found.gear) p.body.setSheet(this.wardrobe.sheet(playerOutfit(p.slot, p.hero)));
    if (found.levels) {
      this.text(p.body.x, p.body.y - 62, 'LEVEL UP!', 0xffb13f);
      this.fx('levelUp', p.body.x, p.body.y - 14);
    }
  }

  /** In the first moments of a sword swing, which lunges the body forward (a bow does not). */
  private isSwinging(p: Player): boolean {
    return !p.hero.weapon.ranged && p.attackCooldown > ATTACK_COOLDOWN - 0.1;
  }

  private attack(p: Player) {
    if (p.attackCooldown > 0) return;
    const bow = p.hero.weapon.ranged;
    if (bow) {
      this.draw(p, bow);
      return;
    }
    p.attackCooldown = ATTACK_COOLDOWN;
    p.body.play('slash');
    const dir = p.body.facing;
    const [vx, vy] = DIR_VEC[dir];
    this.swing(p.body.x, p.body.y, dir);
    this.emit({ type: 'slash', x: round1(p.body.x), y: round1(p.body.y), dir: dirIndex(dir), p: p.slot });
    const cx = p.body.x + vx * 16;
    const cy = p.body.y + vy * 16;
    for (const mob of this.mobs) {
      if (mob.alive && Math.hypot(mob.body.x - cx, mob.body.y - cy) < MELEE_REACH) {
        this.hitMob(mob, rollDamage(attackPower(p.hero), mob.kind.defense), vx, vy);
      }
    }
  }

  /** Start drawing a bow: the arrow flies when the string is let go (`release`), a moment into the animation. */
  private draw(p: Player, bow: Ranged) {
    if (p.pendingShot) return;
    p.attackCooldown = bow.cooldown;
    p.pendingShot = { timer: SHOOT_RELEASE_MS / 1000, bow, damage: attackPower(p.hero) };
    p.body.play('shoot');
    this.emit({ type: 'draw', x: round1(p.body.x), y: round1(p.body.y), p: p.slot });
  }

  /** The bow's string is let go: the arrow leaves along the player's aim, at chest height. */
  private release(p: Player) {
    const shot = p.pendingShot;
    p.pendingShot = null;
    if (!shot) return;
    const { x: ux, y: uy } = p.aim;
    const x = p.body.x + ux * 10;
    const y = p.body.y - BOLT_HEIGHT + uy * 8;
    const [vx, vy] = [ux * shot.bow.speed, uy * shot.bow.speed];
    this.flyArrow(x, y, vx, vy, shot.bow.range, (mob) => {
      this.hitMob(mob, rollDamage(shot.damage, mob.kind.defense), ux, uy);
    });
    this.emit({ type: 'arrow', x: round1(x), y: round1(y), vx: round1(vx), vy: round1(vy), range: shot.bow.range });
  }

  /** An arrow in flight. `onHit` applies the damage (the host); without it the arrow is only for show (the guest). */
  private flyArrow(x: number, y: number, vx: number, vy: number, range: number, onHit?: (mob: Mob) => void) {
    this.effects.add(arrowEffect(x, y, vx, vy, range, (ax, ay) => this.projectileStep(ax, ay, onHit)));
  }

  /** Did a player's projectile at (x, y) run into a wall or an enemy? An enemy it hits is handed to `onHit`. */
  private projectileStep(x: number, y: number, onHit?: (mob: Mob) => void): boolean {
    if (this.collision.isBlocked(Math.floor(x / CELL), Math.floor((y + BOLT_HEIGHT) / CELL))) return true;
    const mob = this.mobs.find(
      (m) => m.alive && Math.abs(x - m.body.x) < 12 && Math.abs(y + BOLT_HEIGHT - m.body.y) < 16,
    );
    if (!mob) return false;
    onHit?.(mob);
    return true;
  }

  /** A sword swing by a player standing at (x, y) facing `dir`: the arc, and leaves shaken from any canopy it reaches. */
  private swing(x: number, y: number, dir: Direction) {
    const [vx, vy] = DIR_VEC[dir];
    this.effects.add(slashEffect(x + vx * 6, y - 12 + vy * 6, dir));
    this.zone.ambient?.shake(x + vx * 16, y + vy * 16 - 6, MELEE_REACH);
  }

  private cast(p: Player) {
    if (p.castCooldown > 0) return;
    p.castCooldown = CAST_COOLDOWN;
    const { spell, stats } = p.hero;
    const { x, y } = p.body;
    if (stats.mp < spell.cost) {
      this.text(x, y - 54, 'No MP', 0x8fb3ff);
      return;
    }
    stats.mp -= spell.cost;
    p.body.play('cast');
    const { x: vx, y: vy } = p.aim;
    this.shoot(
      x + vx * 10,
      y - BOLT_HEIGHT + vy * 8,
      vx * BOLT_SPEED,
      vy * BOLT_SPEED,
      (mob) => this.hitMob(mob, rollDamage(spellPower(p.hero), mob.kind.defense), vx, vy, true),
      p.slot,
    );
  }

  /** Launch a bolt cast by player `p`. `onHit` applies the damage (the host); without it the bolt is only for show (the guest). */
  private shoot(x: number, y: number, vx: number, vy: number, onHit?: (mob: Mob) => void, p?: number) {
    const trail = particleEffect('boltTrail', x, y);
    this.effects.add(trail);
    this.effects.add(
      boltEffect(
        x,
        y,
        vx,
        vy,
        BOLT_RANGE,
        (bx, by) => {
          trail.moveTo(bx, by);
          return this.projectileStep(bx, by, onHit);
        },
        (bx, by, hit) => {
          trail.stop();
          if (hit) this.effects.add(particleEffect('boltImpact', bx, by));
        },
      ),
    );
    this.emit({ type: 'bolt', x: round1(x), y: round1(y), vx, vy, ...(p === undefined ? {} : { p }) });
  }

  /** A ranged mob lets go of a shot along (ux, uy), from its hands at chest height. */
  private mobShoot(mob: Mob, ux: number, uy: number) {
    const { shot } = mob.kind;
    if (!shot) return;
    const x = mob.body.x + ux * 10;
    const y = mob.body.y - BOLT_HEIGHT + uy * 8;
    this.foeBolt(x, y, ux * shot.speed, uy * shot.speed, shot.color, (bx, by) => {
      // Hits the first player it touches (one blinking with invulnerability lets it pass), stops at walls. The players
      // are looked up each step: someone may have joined or left while it flies.
      const hit = this.players().find(
        (p) => p.invuln <= 0 && Math.abs(bx - p.body.x) < 11 && Math.abs(by + BOLT_HEIGHT - p.body.y) < 14,
      );
      if (hit) this.hurtHero(mob, hit.body);
      return hit !== undefined;
    });
    this.emit({
      type: 'bolt',
      x: round1(x),
      y: round1(y),
      vx: round1(ux * shot.speed),
      vy: round1(uy * shot.speed),
      color: shot.color,
    });
  }

  /**
   * An enemy projectile. `onStep` decides whether it hit a player (the host); without it the bolt is only for show
   * (the guest, which draws what the host reports). It always stops at walls.
   */
  private foeBolt(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
    onStep?: (x: number, y: number) => boolean,
  ) {
    this.effects.add(
      boltEffect(
        x,
        y,
        vx,
        vy,
        BOLT_RANGE,
        (bx, by) =>
          this.collision.isBlocked(Math.floor(bx / CELL), Math.floor((by + BOLT_HEIGHT) / CELL)) ||
          (onStep?.(bx, by) ?? false),
        (bx, by, hit) => hit && this.effects.add(particleEffect('hitSpark', bx, by)),
        color,
      ),
    );
  }

  /** A one-shot particle effect, also shown to the guest. `dir` is an angle in radians. */
  private fx(name: FxName, x: number, y: number, dir?: number, p?: number) {
    this.effects.add(particleEffect(name, x, y, { dir }));
    this.emit({
      type: 'fx',
      name,
      x: round1(x),
      y: round1(y),
      ...(dir === undefined ? {} : { dir: round1(dir) }),
      ...(p === undefined ? {} : { p }),
    });
  }

  /** A floating number or word, also shown to the guest. */
  private text(x: number, y: number, text: string, color: number) {
    this.effects.add(floatText(x, y, text, color));
    this.emit({ type: 'text', x: round1(x), y: round1(y), text, color });
  }

  /** Every player takes the kill's XP (in solo, just the one). */
  private hitMob(mob: Mob, damage: number, vx: number, vy: number, bolt = false) {
    const killed = mob.hit(damage, vx, vy);
    // Sparks fly on from the blow (the bolt has its own impact burst), at chest height.
    if (!bolt) this.fx('hitSpark', mob.body.x, mob.body.y - 14, Math.atan2(vy, vx));
    this.text(mob.body.x, mob.body.y - 54, String(damage), 0xffffff);
    if (!killed) return;
    this.fx('mobPoof', mob.body.x, mob.body.y - 12);
    this.text(mob.body.x, mob.body.y - 66, `+${mob.kind.xp} XP`, 0xffb13f);
    const gold = rollGold(mob.kind); // everyone gets the same purse, like the XP
    this.text(mob.body.x, mob.body.y - 78, `+${gold}g`, 0xffd34d);
    for (const p of this.players()) {
      p.hero.gold += gold;
      if (!gainXp(p.hero.stats, mob.kind.xp)) continue;
      this.text(p.body.x, p.body.y - 62, 'LEVEL UP!', 0xffb13f);
      this.fx('levelUp', p.body.x, p.body.y - 14);
    }
  }

  private hurtHero(mob: Mob, victim: Character) {
    const p = this.players().find((q) => q.body === victim);
    if (!p || p.invuln > 0) return;
    this.harm(p, rollDamage(mob.kind.attack, defensePower(p.hero)), mob.body.x, mob.body.y);
  }

  /** Damage a player and knock them away from (fromX, fromY): the shared tail of a mob's hit and a lightning strike. */
  private harm(p: Player, damage: number, fromX: number, fromY: number) {
    const s = p.hero.stats;
    s.hp -= damage;
    p.invuln = INVULN_TIME;
    p.sinceHit = 0;
    p.pendingShot = null; // a hit spoils the shot
    p.body.play('hurt');
    this.text(p.body.x, p.body.y - 54, String(damage), 0xff5a5a);
    this.fx('heroHurt', p.body.x, p.body.y - 14, undefined, p.slot);
    const dx = p.body.x - fromX;
    const dy = p.body.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    p.knock = { x: (dx / len) * 220, y: (dy / len) * 220 };
    if (s.hp <= 0) this.defeat(p);
  }

  /** Out of HP: back to the spawn point, fully restored (XP and levels are kept). */
  private defeat(p: Player) {
    const s = p.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    if (p.zone === this.home.name) {
      p.body.position.set(...cellFeet(this.home.data.spawn));
      p.body.face('down');
    } else {
      this.travel(p, this.home, this.home.data.spawn, false); // wake at the start of the world, whatever zone it was in
    }
    p.aim = { x: 0, y: 1 };
    p.knock = { x: 0, y: 0 };
    p.vel = { x: 0, y: 0 };
    p.invuln = 0;
    p.pendingShot = null;
    if (this.role === 'solo') for (const z of this.zones.values()) z.mobs.forEach((m) => m.reset()); // in co-op the other player is still fighting them
    if (p === this.local) this.ui.dialog.say(DEFEAT_LINES);
    else this.emit({ type: 'defeat', player: p.slot });
  }

  /** The player with this number, if they are in the game. */
  private playerNumbered(slot: number | undefined): Player | undefined {
    return this.players().find((p) => p.slot === slot);
  }

  /** The players in the zone being worked in: the local one first if it is here, then the rest. */
  private players(): Player[] {
    return this.everyone().filter((p) => p.zone === this.zone.name);
  }

  /** Put gear on the hero: stats follow the item and the sprite is recomposed with its parts. */
  equip(item: Item) {
    equip(this.hero, item);
    this.refreshLook();
  }

  /** Every character that blocks others. */
  private bodies(): Character[] {
    return [
      ...this.players().map((p) => p.body),
      ...(this.npc ? [this.npc] : []),
      ...this.keepers.map((k) => k.body),
      ...this.mobs.filter((m) => m.alive).map((m) => m.body),
    ];
  }
}
