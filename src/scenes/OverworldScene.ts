import type { Container } from 'pixi.js';
import type { Sprites, Zone } from '../assets';
import { Camera } from '../core/camera';
import { actionDown, actionPressed, mapPressed, menuPressed } from '../core/controls';
import type { Scene } from '../core/Scene';
import type { TouchControls } from '../core/touch';
import { Chest } from '../entities/Chest';
import { GroundItem } from '../entities/GroundItem';
import { Character, DIR_VEC, directionToward, type Direction } from '../entities/Character';
import { Ambient } from '../entities/ambient';
import { WeatherLayer } from '../entities/WeatherLayer';
import { sampleBiome, Weather, type WeatherKind } from '../systems/weather';
import { arrowEffect, boltEffect, Effects, floatText, slashEffect } from '../entities/effects';
import { Mob, type MobWorld } from '../entities/Mob';
import { particleEffect } from '../entities/ParticleEffect';
import { NO_COMMAND, Player, type Command } from '../entities/Player';
import type { Dialog } from '../hud/Dialog';
import type { Hud } from '../hud/Hud';
import type { ShopCounter } from '../hud/ShopCounter';
import { MapOverlay } from '../hud/MapOverlay';
import type { Menu } from '../hud/Menu';
import { MapView } from '../map/MapView';
import { sheetGrid } from '../core/textures';
import { CELL, type CellPoint, type MapData } from '../map/types';
import { DEFAULT_VIEW, MobFeed } from '../net/feed';
import { glide } from '../net/interp';
import {
  DIRS,
  dirIndex,
  FLAG,
  MAX_VIEW,
  packKeys,
  round1,
  unpackKeys,
  type PlayerSnap,
  type SnapMsg,
  type FxName,
  type StatsSnap,
  type WorldEvent,
} from '../net/protocol';
import type { Role, Session } from '../net/session';
import {
  attackPower,
  defensePower,
  gainXp,
  MOB_KINDS,
  newHero,
  rollDamage,
  rollGold,
  spellPower,
  type Hero,
  type Ranged,
  type Stats,
} from '../systems/combat';
import { CHEST_LOOTS, collect } from '../systems/chests';
import { Collision } from '../systems/collision';
import { isIce, stepVelocity } from '../systems/ice';
import { equip } from '../systems/items';
import { addToPack } from '../systems/inventory';
import {
  heroOutfit,
  npcLook,
  OVERWORLD_NPC,
  PLAYER_COLORS,
  playerName,
  playerOutfit,
  playerTag,
} from '../systems/looks';
import { SHOPS } from '../systems/shops';
import { SHOOT_RELEASE_MS } from '../sprites/doll';
import type { Wardrobe } from '../sprites/Wardrobe';
import type { Item } from '../systems/combat';

const SPEED = 120; // pixels per second
const NPC_LINES = [
  'Greetings, traveler. This world is still being drawn.',
  'Soon there will be a story here. Come back later!',
];
const DEFEAT_LINES = ['You were struck down...', 'Time folds back, and you wake where you began.'];

const ATTACK_COOLDOWN = 0.35;
const CAST_COOLDOWN = 0.45;
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
const EVENT_KEEP = 0.6; // seconds a one-shot world event keeps riding in snapshots, to survive packet loss
const MAX_EVENTS_SENT = 48;

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
 * The overworld: one zone with the hero, an NPC and mobs. Runs in one of three roles (`Session.role`):
 *  - solo: the plain single-player game.
 *  - host: the same simulation, plus up to three more players driven by their friends' controls; it sends each
 *    friend a snapshot of the world.
 *  - client: no simulation; it sends the local controls to the host and draws what the host's snapshots say.
 * `local` is the player at this keyboard in every role; `remotes` are the others by player number (none when solo).
 * Player 0 is the host; friends are 1 to 3.
 */
export class OverworldScene implements Scene {
  private world: MapView;
  private camera: Camera;
  private collision: Collision;
  private local: Player;
  private remotes = new Map<number, Player>(); // everyone else in a co-op game, by player number
  private npc: Character;
  private keepers: { shop: string; body: Character }[]; // shopkeepers, by the shop they run (systems/shops.ts)
  private mobs: Mob[];
  private chests: Chest[];
  private ground: GroundItem[] = []; // items dropped from the pack (solo and host only: guests do not see them)
  private mobWorld: MobWorld;
  private wardrobe: Wardrobe;
  private heroBodies: [Character, ...Character[]]; // everything mobs may attack
  private effects: Effects;
  private ambient: Ambient;
  private weather = new Weather(); // local atmosphere only: not synced in co-op
  private weatherLayer: WeatherLayer;
  private data: MapData;
  private overlay: MapOverlay;
  private spawn: CellPoint;
  private screen = { width: 0, height: 0 };
  private bodyList: Character[] = [];

  // Co-op
  private role: Role = 'solo';
  private clock = 0; // seconds; drives the guest's invulnerability blink and event ages
  private snapTimer = 0;
  private snapSeq = 0;
  private events: { id: number; at: number; e: WorldEvent }[] = []; // host: recent one-shot events
  private feeds = new Map<number, MobFeed>(); // host: what each friend has been told about the mobs
  private eventId = 0;
  private lastEvent = -1; // guest: newest event already shown
  private inputTimer = 0;
  private inputSeq = 0;
  private actCount = 0; // guest: action / magic presses so far, sent as counters
  private magCount = 0;
  private sent = { keys: -1, act: -1, mag: -1, ack: -1, vr: -1 };
  private solo: { stats: Stats; name: string } | null = null; // guest: the solo hero, restored on disconnect

  constructor(
    zone: Zone,
    sprites: Sprites,
    private ui: Ui,
  ) {
    const { data } = zone;
    this.world = new MapView(data, zone.textures);
    this.camera = new Camera(this.world, data.width * CELL, data.height * CELL);
    this.collision = new Collision(data.width, data.height, data.collision);
    this.spawn = data.spawn;
    this.effects = new Effects(this.world.layer);
    this.ambient = new Ambient(this.world.layer, data);
    this.weatherLayer = new WeatherLayer(this.world.layer);
    this.data = data;
    this.overlay = new MapOverlay(data);
    this.wardrobe = sprites.wardrobe;
    const hero = newHero();
    this.local = new Player(this.wardrobe.sheet(heroOutfit(hero)), hero);
    this.heroBodies = [this.local.body];
    this.npc = new Character(this.wardrobe.sheet(npcLook(OVERWORLD_NPC)));

    // Entities are positioned by their feet so they y-sort with map objects.
    this.player.position.set(...this.cellToFeet(data.spawn));
    if (data.npc) this.npc.position.set(...this.cellToFeet(data.npc));
    else this.npc.visible = false;
    this.keepers = data.shops.map((spawn) => {
      const shop = SHOPS[spawn.shop];
      if (!shop) throw new Error(`Zone "${zone.name}" has a shopkeeper for unknown shop "${spawn.shop}"`);
      const body = new Character(sprites.wardrobe.sheet(npcLook(shop.keeper)));
      body.position.set(...this.cellToFeet(spawn));
      body.setTag(shop.tag, 0xffd34d);
      return { shop: spawn.shop, body };
    });
    this.ui.shop.onGearChange = () => this.refreshLook();
    this.mobs = data.mobs.map((m) => {
      const kind = MOB_KINDS[m.kind];
      if (!kind) throw new Error(`Zone "${zone.name}" spawns unknown mob kind "${m.kind}"`);
      return new Mob(kind, sprites.wardrobe.sheet(kind.look), ...this.cellToFeet(m));
    });
    const chestFrames = sheetGrid(sprites.chests, 2, 4, CELL, CELL);
    this.chests = data.chests.map((c) => {
      if (!CHEST_LOOTS[c.loot]) throw new Error(`Zone "${zone.name}" has a chest with unknown loot "${c.loot}"`);
      return new Chest(c, chestFrames);
    });
    this.mobWorld = {
      heroes: this.heroBodies,
      slide: (body, mx, my) => this.collision.slide(body, mx, my, this.bodies()),
      strike: (mob, target) => this.hurtHero(mob, target),
      shoot: (mob, ux, uy) => this.mobShoot(mob, ux, uy),
    };
    this.world.layer.addChild(
      this.npc,
      ...this.keepers.map((k) => k.body),
      this.player,
      ...this.chests,
      ...this.mobs.map((m) => m.body),
    );
  }

  get root(): Container {
    return this.world;
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
    this.ui.menu.inventory.attach({
      locked: () => (this.role === 'client' ? 'In a co-op game your gear is kept by the host.' : null),
      noDrop: () => (this.role === 'solo' ? null : 'Items cannot be dropped in a co-op game yet.'),
      gearChanged: () => this.refreshLook(),
      used: (text) => this.text(this.player.x, this.player.y - 54, text, 0x7be07b),
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

  private cellToFeet(p: CellPoint): [number, number] {
    return [(p.col + 0.5) * CELL, (p.row + 0.9) * CELL];
  }

  update(dt: number) {
    const { menu, shop, dialog, hud, session } = this.ui;
    this.syncRole(session.role);
    this.clock += dt;
    const online = this.role !== 'solo';
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
      hud.update(this.hero, this.role !== 'client'); // gold changes at the counter
      if (!online) return; // solo: the world is paused. Online it keeps running behind the menu (the other player can't be paused).
    }

    if (this.role === 'client') this.updateClient(dt);
    else this.updateSimulation(dt);

    this.effects.update(dt);
    this.weather.update(dt, sampleBiome(this.data, this.player.x, this.player.y - 1));
    this.ambient.wind = this.weather.wind;
    this.weatherLayer.update(dt, this.weather, this.camera.view(this.screen.width, this.screen.height));
    this.ambient.update(dt, this.player, [
      ...this.players().map((p) => p.body),
      ...this.mobs.filter((m) => m.alive).map((m) => m.body),
    ]);

    this.npc.animate(dt * 1000, false);
    for (const k of this.keepers) k.body.animate(dt * 1000, false);
    for (const item of this.ground) {
      item.update(dt, Math.hypot(this.player.x - item.x, this.player.y - item.y) < PICKUP_REACH);
    }
    this.refreshBodies(); // after this frame's joins, leaves and deaths
    for (const body of this.bodies()) body.zIndex = body.y;
    hud.update(this.hero, this.role !== 'client');
    if (this.overlay.open) {
      const pin = (p: Player) => ({ slot: p.slot, x: p.body.x, y: p.body.y });
      // A player the host has not yet placed (their body is still hidden) has no position to show.
      this.overlay.update(pin(this.local), [...this.remotes.values()].filter((p) => p.body.visible).map(pin));
    }
    this.camera.follow(this.screen.width, this.screen.height, this.player.x, this.player.y);
  }

  /** Solo and host: the authoritative game. The host additionally runs its friends' players and sends them snapshots. */
  private updateSimulation(dt: number) {
    const { menu, shop, dialog } = this.ui;
    const host = this.role === 'host';
    if (host) this.reconcileGuests();
    this.refreshBodies();
    const raw = this.readCommand();
    // Reading a dialog or the menu: the player stands still (a solo dialog freezes the whole world instead).
    const reading = menu.open || shop.open || dialog.active;
    const cmd = reading ? { ...raw, dx: 0, dy: 0, mag: false } : raw;
    const guests = [...this.remotes.values()].map((p) => ({ p, cmd: this.remoteCommand(p) }));

    if (host || !dialog.active) {
      this.updatePlayer(this.local, cmd, dt);
      for (const g of guests) this.updatePlayer(g.p, g.cmd, dt);
      for (const mob of this.mobs) mob.update(dt, this.mobWorld);
      if (cmd.mag) this.cast(this.local);
      for (const g of guests) if (g.cmd.mag) this.cast(g.p);
    } else {
      this.player.animate(dt * 1000, false); // the world is frozen while talking
    }
    if (!menu.open && !shop.open) this.handleAction(cmd.act, () => this.act(this.local));
    for (const g of guests) if (g.cmd.act) this.act(g.p);
    if (host) this.broadcast(dt);
  }

  /** Guest: no simulation. Show what the host last said, and tell it what this player is doing. */
  private updateClient(dt: number) {
    const { menu, shop, dialog, session } = this.ui;
    const snap = session.takeSnapshot();
    if (snap) this.applySnapshot(snap);
    for (const p of this.players()) this.drawRemotePlayer(p, dt);
    for (const mob of this.mobs) mob.updateRemote(dt);

    const cmd = this.readCommand();
    const reading = menu.open || shop.open || dialog.active;
    if (!menu.open && !shop.open) this.handleAction(cmd.act, () => this.actCount++);
    if (!reading && cmd.mag) this.magCount++;
    this.sendInput(dt, reading ? 0 : packKeys(cmd.dx, cmd.dy));
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

  /** Everyone mobs may attack, and everyone who blocks others: the local player, then the rest. */
  private syncHeroBodies() {
    this.heroBodies.splice(
      0,
      this.heroBodies.length,
      this.local.body,
      ...[...this.remotes.values()].map((p) => p.body),
    );
  }

  /** In a co-op game every player wears a coloured tag ("P2") over their head, so friends can tell each other apart. */
  private applyTags() {
    for (const p of this.players()) p.body.setTag(playerTag(p.slot), PLAYER_COLORS[p.slot]);
  }

  /** Put another player in the world. Their stats are theirs alone: they start as a fresh hero. */
  private addRemote(slot: number): Player {
    const hero = newHero();
    hero.name = playerName(slot);
    const remote = new Player(this.wardrobe.sheet(playerOutfit(slot, hero)), hero, slot);
    this.world.layer.addChild(remote.body);
    this.remotes.set(slot, remote);
    this.syncHeroBodies();
    this.applyTags();
    return remote;
  }

  /** Take a player out of the world, with a notice floating where they stood. */
  private removeRemote(slot: number, notice: (p: Player) => void) {
    const remote = this.remotes.get(slot);
    if (!remote) return;
    notice(remote);
    this.remotes.delete(slot);
    this.feeds.delete(slot);
    this.world.layer.removeChild(remote.body);
    this.ambient.forget(remote.body);
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
    this.solo = { stats: { ...this.hero.stats }, name: this.hero.name };
    this.local.setSlot(slot);
    this.hero.name = playerName(slot);
    this.player.setSheet(this.wardrobe.sheet(playerOutfit(slot, this.hero)));
    this.local.target = null;
    this.lastEvent = -1;
    this.actCount = this.magCount = this.inputSeq = 0;
    this.sent = { keys: -1, act: -1, mag: -1, ack: -1, vr: -1 };
    this.inputTimer = 0;
    this.applyTags();
  }

  private leaveCoop() {
    const left = this.role === 'host' ? undefined : 'Disconnected';
    for (const slot of [...this.remotes.keys()]) {
      this.removeRemote(slot, (p) => {
        if (this.role === 'host')
          this.effects.add(floatText(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff));
      });
    }
    this.local.body.setTag(null);

    if (this.role === 'client') {
      // Back to the solo hero, standing where it ended up, with the mobs carrying on on their own.
      if (this.solo) Object.assign(this.hero.stats, this.solo.stats);
      this.hero.name = this.solo?.name ?? 'Hero';
      this.solo = null;
      this.local.setSlot(0);
      this.player.setSheet(this.wardrobe.sheet(heroOutfit(this.hero)));
      this.local.target = null;
      this.local.flags = 0;
      this.local.invuln = 0;
      this.local.knock = { x: 0, y: 0 };
      this.local.vel = { x: 0, y: 0 };
      this.player.alpha = 1;
      this.player.setOffset(0, 0);
      for (const mob of this.mobs) mob.release();
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
      const remote = this.addRemote(slot);
      // Spread newcomers along the spawn cell so they don't stand exactly on top of each other.
      const [x, y] = this.cellToFeet(this.spawn);
      remote.body.position.set(x + (slot - 2) * 8, y);
      this.text(remote.body.x, remote.body.y - 54, `${playerName(slot)} joined`, PLAYER_COLORS[slot] ?? 0xffffff);
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
    if (this.role === 'host') this.events.push({ id: ++this.eventId, at: this.clock, e });
  }

  private broadcast(dt: number) {
    this.snapTimer += dt;
    if (this.remotes.size === 0 || this.snapTimer < 1 / SNAPSHOT_HZ) return;
    this.snapTimer = 0;
    this.events = this.events.filter((ev) => this.clock - ev.at < EVENT_KEEP);
    // The world is the same for everyone; what differs per friend is their own stats, which mobs are near them, and
    // which events they have not yet confirmed.
    const n = ++this.snapSeq;
    const players = this.players().map((p) => this.snapPlayer(p));
    const states = this.mobs.map((m) => m.snapshot());
    const chests = this.chests.reduce((mask, c, i) => (c.opened ? mask | (1 << i) : mask), 0);
    for (const [slot, remote] of this.remotes) {
      const peer = this.ui.session.peerInput(slot);
      let feed = this.feeds.get(slot);
      if (!feed) this.feeds.set(slot, (feed = new MobFeed()));
      const mobs = feed.select(states, remote.body, peer?.vr || DEFAULT_VIEW, this.clock);
      const events = this.events
        .filter((ev) => ev.id > (peer?.ack ?? 0))
        .slice(-MAX_EVENTS_SENT)
        .map(({ id, e }) => ({ id, e }));
      this.ui.session.sendTo(slot, {
        k: 'snap',
        n,
        players,
        mobs,
        chests,
        events,
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

  // --- Co-op: guest side ---

  /** Send the controls: when they change, and otherwise at INPUT_HZ so a lost packet is soon corrected. */
  private sendInput(dt: number, keys: number) {
    this.inputTimer += dt;
    const ack = Math.max(0, this.lastEvent);
    const view = this.camera.view(this.screen.width, this.screen.height);
    const vr = Math.min(MAX_VIEW, Math.ceil(Math.hypot(view.w, view.h) / 2));
    const changed =
      keys !== this.sent.keys ||
      this.actCount !== this.sent.act ||
      this.magCount !== this.sent.mag ||
      ack !== this.sent.ack ||
      vr !== this.sent.vr;
    if (!changed && this.inputTimer < 1 / INPUT_HZ) return;
    this.inputTimer = 0;
    const msg = { k: 'in', n: ++this.inputSeq, keys, act: this.actCount, mag: this.magCount, ack, vr } as const;
    if (this.ui.session.send(msg)) this.sent = { keys, act: this.actCount, mag: this.magCount, ack, vr };
  }

  private applySnapshot(snap: SnapMsg) {
    // Everyone the host lists is in the game; anyone it no longer lists has left.
    const present = new Set<number>();
    for (const state of snap.players) {
      const slot = state[0];
      present.add(slot);
      if (slot === this.local.slot) this.setPlayerState(this.local, state);
      else this.setPlayerState(this.remotes.get(slot) ?? this.addHiddenRemote(slot), state);
    }
    for (const slot of [...this.remotes.keys()]) {
      if (!present.has(slot)) {
        this.removeRemote(slot, (p) =>
          this.effects.add(floatText(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff)),
        );
      }
    }

    this.chests.forEach((c, i) => c.setOpen((snap.chests & (1 << i)) !== 0));
    for (const [index, ...state] of snap.mobs) this.mobs[index]?.setRemote(state); // only the mobs the host listed: the rest are out of sight

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

  private showEvent(e: WorldEvent) {
    switch (e.type) {
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

  /** Redraw the local hero for what it now wears (after the pack or a shop changed it). */
  private refreshLook() {
    this.player.setSheet(this.wardrobe.sheet(playerOutfit(this.local.slot, this.hero)));
  }

  /** A player's action button (host and solo): open a chest within reach, otherwise swing. */
  private act(p: Player) {
    const chest = this.chests.find(
      (c) => !c.opened && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CHEST_REACH,
    );
    if (chest) return this.openChest(p, chest);
    const loose = p === this.local && this.nearestGround(p);
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

  /** Pick an item up off the ground into the pack (it stays put if the pack is full). */
  private pickUp(p: Player, g: GroundItem) {
    if (!addToPack(p.hero, g.item)) return this.effects.add(floatText(g.x, g.y - 22, 'Pack full', 0xff8a7a));
    const [x, y, name] = [g.x, g.y, g.item.name];
    this.ground.splice(this.ground.indexOf(g), 1);
    g.destroy({ children: true }); // also takes it off the world layer
    this.effects.add(floatText(x, y - 22, name, 0xffd34d));
  }

  /** Put an item on the ground a step ahead of the local hero (or at their feet if something is in the way). */
  private dropItem(item: Item) {
    const { x, y, facing } = this.player;
    const [vx, vy] = DIR_VEC[facing];
    const fits = this.collision.fitsMap(x + vx * 20, y + vy * 20);
    const g = new GroundItem(item, fits ? x + vx * 20 : x, fits ? y + vy * 20 : y);
    this.ground.push(g);
    this.world.layer.addChild(g);
  }

  private openChest(p: Player, chest: Chest) {
    const loot = CHEST_LOOTS[chest.loot];
    if (!loot) return;
    const found = collect(p.hero, loot, p === this.local); // only the local player has a pack screen
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
    this.ambient.shake(x + vx * 16, y + vy * 16 - 6, MELEE_REACH);
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
    const damage = rollDamage(mob.kind.attack, defensePower(p.hero));
    const s = p.hero.stats;
    s.hp -= damage;
    p.invuln = INVULN_TIME;
    p.sinceHit = 0;
    p.pendingShot = null; // a hit spoils the shot
    p.body.play('hurt');
    this.text(p.body.x, p.body.y - 54, String(damage), 0xff5a5a);
    this.fx('heroHurt', p.body.x, p.body.y - 14, undefined, p.slot);
    const dx = p.body.x - mob.body.x;
    const dy = p.body.y - mob.body.y;
    const len = Math.hypot(dx, dy) || 1;
    p.knock = { x: (dx / len) * 220, y: (dy / len) * 220 };
    if (s.hp <= 0) this.defeat(p);
  }

  /** Out of HP: back to the spawn point, fully restored (XP and levels are kept). */
  private defeat(p: Player) {
    const s = p.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    p.body.position.set(...this.cellToFeet(this.spawn));
    p.body.face('down');
    p.aim = { x: 0, y: 1 };
    p.knock = { x: 0, y: 0 };
    p.vel = { x: 0, y: 0 };
    p.invuln = 0;
    p.pendingShot = null;
    if (this.role === 'solo') this.mobs.forEach((m) => m.reset()); // in co-op the other player is still fighting them
    if (p === this.local) this.ui.dialog.say(DEFEAT_LINES);
    else this.emit({ type: 'defeat', player: p.slot });
  }

  /** The player with this number, if they are in the game. */
  private playerNumbered(slot: number | undefined): Player | undefined {
    return this.players().find((p) => p.slot === slot);
  }

  /** The local player, then everyone else in the game. */
  private players(): Player[] {
    return [this.local, ...this.remotes.values()];
  }

  /** Put gear on the hero: stats follow the item and the sprite is recomposed with its parts. */
  equip(item: Item) {
    equip(this.hero, item);
    this.refreshLook();
  }

  /**
   * Every character that blocks others. Built once per frame (`refreshBodies`): every mob step asks for it, and a mob that
   * dies mid-frame simply stops blocking from the next one.
   */
  private bodies(): Character[] {
    return this.bodyList;
  }

  private refreshBodies() {
    this.bodyList = [
      ...this.players().map((p) => p.body),
      this.npc,
      ...this.keepers.map((k) => k.body),
      ...this.mobs.filter((m) => m.alive).map((m) => m.body),
    ];
  }
}
