import { Container, type Renderer } from 'pixi.js';
import type { Sprites, Zone } from '../../assets';
import type { Player } from '../../entities/Player';
import { ZoneTransition } from '../../entities/ZoneTransition';
import type { ShopCounter } from '../../hud/ShopCounter';
import type { MobWorld } from '../../entities/Mob';
import { DIR_VEC } from '../../core/direction';
import { nearBorder } from '../../map/bounds';
import { ARRIVE_CELLS, arrivalFacing, cellFeet, doorAt, doorsNear, neighbourLinks, type Link } from '../../map/doors';
import { CELL, type CellPoint, type DoorSpawn } from '../../map/types';
import { zoneTint } from '../../systems/places';
import { GroundItem } from '../../entities/GroundItem';
import { ZoneState } from '../ZoneState';
import { TRAINER_ROOM } from '../../systems/skills';
import type { Arena } from './Arena';

const PREFETCH_REACH = 14 * CELL; // a door this close starts loading the zone behind it, so stepping through is instant
const PREFETCH_EVERY = 0.5; // seconds between looking for doors to prefetch
const RETIRE_EVERY = 2; // seconds between looking for zones to unload
const RETIRE_AFTER = 20; // seconds a zone must have been out of everyone's way before it is unloaded
const RETIRE_REACH = 12 * CELL; // a door to a zone this close to a player keeps that zone loaded
const BORDER_REACH = 30 * CELL; // this near the margin of the next zone over, the zones joined by a gap are loaded: they are about to be in view
const SLIP_RATE = 12; // per second: how fast the hero's drawing catches up with them after the jump across a border
const WEATHER_FADE = 1.6; // seconds the last zone's weather takes to give way to the new one's
const ARRIVE_GRACE = 1.8; // seconds of silent immunity on arriving in a zone (the transition takes up to 1 s, and the world runs behind it), so nothing waiting at the door ambushes you

/** Loads a zone by name (assets.ts `loadZone`). The scene asks for the zones behind doors before the player gets there. */
export type ZoneLoader = (name: string) => Promise<Zone>;
/** Frees what `ZoneLoader` loaded (assets.ts `unloadZone`). */
export type ZoneUnloader = (zone: Zone) => Promise<void>;

/**
 * The zones of the world: loading them (the ones behind doors are fetched before the player gets there), taking players
 * through doors, and showing the local player's zone on the stage. The map data and what lives in a zone is `ZoneState`;
 * who is where is the `Arena`'s.
 */
export class Zones {
  /** The scene's root: the stage, and the door transition over it. */
  readonly root = new Container();
  /** Holds the local player's zone and, beside it, the open-air zones joined to it by a gap in the border. */
  readonly stage = new Container();
  /** The iris when the local player goes through a door into or out of a room. */
  readonly transition: ZoneTransition;
  /** Set by the scene: the rules a zone's mobs call back into (it is the simulation's). */
  makeMobWorld!: (z: ZoneState) => MobWorld;
  private loading = new Map<string, Promise<void>>(); // zones being loaded, so each is asked for once
  private prefetchTimer = 0;
  private retireTimer = RETIRE_EVERY;
  private unused = new Map<string, number>(); // seconds each loaded zone has been out of everyone's way
  /** The zones laid beside the one the local player is in, each with where its map sits against that one (map/doors.ts). */
  private shown = new Map<ZoneState, Link>();
  /** The zone the local player just walked out of, whose weather gives way to the new one's. */
  private weatherFade: { from: ZoneState; t: number } | null = null;

  constructor(
    private arena: Arena,
    private sprites: Sprites,
    private loadZone: ZoneLoader,
    private unloadZone: ZoneUnloader,
    private ui: { shop: ShopCounter },
    renderer: Renderer,
  ) {
    this.transition = new ZoneTransition(renderer);
    this.root.addChild(this.stage, this.transition.view);
  }

  /** Build the running state of a loaded zone and keep it (with what it remembers from before it was unloaded). */
  add(zone: Zone): ZoneState {
    const z = new ZoneState(zone, this.sprites);
    z.mobWorld = this.makeMobWorld(z);
    this.arena.zones.set(zone.name, z);
    const memory = this.arena.memory.get(zone.name);
    if (memory) {
      for (const i of memory.opened) z.chests[i]?.setOpen(true);
      for (const { item, x, y, id, age } of memory.ground) {
        const g = new GroundItem(item, x, y, id, age);
        z.ground.push(g);
        z.world.layer.addChild(g);
      }
      this.arena.memory.delete(zone.name);
    }
    return z;
  }

  /**
   * Unload the zones nobody needs, so memory stays bounded however much of the world has been visited: a zone with no
   * player in it, that is not the start (a defeat wakes you there), and that no player has been near a door into for
   * RETIRE_AFTER seconds. What must last (opened chests, items on the ground) is remembered; its mobs start afresh.
   * A guest only counts itself (it is shown the host's world one zone at a time).
   */
  retire(dt: number) {
    this.retireTimer -= dt;
    if (this.retireTimer > 0) return;
    const { arena } = this;
    const players = arena.role === 'client' ? [arena.local] : arena.everyone();
    const wanted = new Set<string>([arena.home.name, arena.view.name]);
    for (const p of players) {
      const here = arena.zones.get(p.zone);
      if (!here) continue;
      wanted.add(here.name);
      if (p.trial) wanted.add(TRAINER_ROOM); // a trial ends back in the trainer's room
      for (const door of doorsNear(here.data, p.body.x, p.body.y, RETIRE_REACH)) wanted.add(door.to.zone);
      if (nearBorder(here.data, p.body.x, p.body.y, BORDER_REACH))
        for (const l of neighbourLinks(here.data)) wanted.add(l.zone);
    }
    for (const z of this.shown.keys()) wanted.add(z.name);
    for (const z of [...arena.zones.values()]) {
      const idle = wanted.has(z.name) ? 0 : (this.unused.get(z.name) ?? 0) + RETIRE_EVERY;
      if (idle < RETIRE_AFTER) {
        this.unused.set(z.name, idle);
        continue;
      }
      this.unused.delete(z.name);
      arena.memory.set(z.name, z.remember());
      arena.zones.delete(z.name);
      z.dispose();
      void this.unloadZone(z.source).catch((err: unknown) => console.error(`Could not unload zone "${z.name}"`, err));
    }
    this.retireTimer = RETIRE_EVERY;
  }

  /** The first zone: where the game starts. The local player is put in it. */
  addHome(zone: Zone): ZoneState {
    const { arena } = this;
    const home = this.add(zone);
    arena.home = home;
    arena.setView(home);
    arena.local.zone = home.name;
    home.world.layer.addChild(arena.player);
    this.stage.addChild(home.world);
    arena.player.position.set(...cellFeet(zone.data.spawn));
    arena.syncHeroBodies();
    return home;
  }

  /** Start loading a zone if it is not loaded or loading yet. Resolves when it is ready (and does nothing if it already is). */
  ensure(name: string): Promise<void> {
    if (this.arena.zones.has(name)) return Promise.resolve();
    let pending = this.loading.get(name);
    if (!pending) {
      pending = this.loadZone(name)
        .then((zone) => {
          if (!this.arena.zones.has(name)) this.add(zone);
        })
        .finally(() => this.loading.delete(name));
      this.loading.set(name, pending);
      pending.catch((err: unknown) => console.error(`Could not load zone "${name}"`, err));
    }
    return pending;
  }

  /** Load the zones behind doors a player is walking up to, so stepping through is instant. */
  prefetch(dt: number) {
    this.prefetchTimer -= dt;
    if (this.prefetchTimer > 0) return;
    this.prefetchTimer = PREFETCH_EVERY;
    const { arena } = this;
    for (const p of arena.role === 'client' ? [arena.local] : arena.everyone()) {
      const { data } = arena.zoneOf(p);
      for (const door of doorsNear(data, p.body.x, p.body.y, PREFETCH_REACH)) void this.ensure(door.to.zone);
      if (nearBorder(data, p.body.x, p.body.y, BORDER_REACH))
        for (const l of neighbourLinks(data)) void this.ensure(l.zone);
    }
  }

  /** Take a player through a door they are standing on, if there is one (and its zone is loaded). */
  checkDoors(p: Player) {
    const door = doorAt(this.arena.zoneOf(p).data, p.body.x, p.body.y);
    if (!door) return;
    const dest = this.arena.zones.get(door.to.zone);
    if (dest) this.travel(p, dest, door.to, door);
    else void this.ensure(door.to.zone); // not loaded yet: the player waits in the doorway and the next frame tries again
  }

  /**
   * Move a player through a door into `dest`, which is loaded. Between two open-air zones through a gap the local
   * player's view does not change at all (the zones are drawn side by side, so this is only the player changing which
   * map they are in); through any other door it closes and opens as an iris.
   */
  travel(p: Player, dest: ZoneState, to: CellPoint, door?: DoorSpawn) {
    const { arena } = this;
    const from = arena.zoneOf(p);
    const link = p === arena.local ? this.seam(from, dest, door) : undefined;
    if (p === arena.local && !link) this.beginTrip(dest);
    from.world.layer.removeChild(p.body);
    from.ambient?.forget(p.body);
    dest.world.layer.addChild(p.body);
    p.zone = dest.name;
    p.body.position.set(...cellFeet(to));
    p.body.face(arrivalFacing(dest.data, from.name, to));
    p.body.setOffset(0, 0);
    p.body.pivot.set(0, 0);
    p.vel = { x: 0, y: 0 };
    p.knock = { x: 0, y: 0 };
    p.pendingShot = null;
    p.grace = Math.max(p.grace, ARRIVE_GRACE);
    if (link && door?.dir) {
      // The map's coordinates jump ahead of the player here; their drawing eases up to them (`update`), so they walk on.
      const [vx, vy] = DIR_VEC[door.dir];
      const step = (1 + ARRIVE_CELLS) * CELL;
      p.body.pivot.set(vx * step, vy * step);
    }
    arena.syncHeroBodies();
    if (p === arena.local) this.show(dest, link);
  }

  /** The link from `from` to `dest` when going through `door` joins them without a seam (two open-air zones, a gap), else nothing. */
  private seam(from: ZoneState, dest: ZoneState, door?: DoorSpawn): Link | undefined {
    if (!door?.dir || from.data.indoor || dest.data.indoor) return undefined;
    return neighbourLinks(from.data).find((l) => l.zone === dest.name);
  }

  /**
   * The local player is about to leave for `dest`: picture the view they are leaving and start the transition
   * (map/transition.ts: the one iris, for every door).
   */
  private beginTrip(dest: ZoneState) {
    const { arena } = this;
    this.transition.begin(this.stage, arena.screen, this.heroOnScreen(), zoneTint(dest.name));
  }

  /** Where the local player is on screen (CSS px): the middle of their body, which the door iris closes and opens on. */
  heroOnScreen(): { x: number; y: number } {
    const { arena } = this;
    const { world, camera } = arena.view;
    return { x: world.x + arena.player.x * camera.zoom, y: world.y + (arena.player.y - 20) * camera.zoom };
  }

  /** Guest: the host moved this player to a zone that is not loaded yet: close on the one they are leaving and stay shut. */
  holdForLoad() {
    if (!this.transition.busy) this.transition.begin(null, this.arena.screen, this.heroOnScreen());
    this.transition.hold(true);
  }

  /**
   * Draw `dest` as the world the local player is in. With `link` (the zone they walked out of is joined to it by a gap)
   * the picture is left exactly as it was: `dest`'s map takes the place the neighbour's had on screen and the zone left
   * behind stays drawn beside it. Without, `dest` replaces everything (the iris covers the cut).
   */
  show(dest: ZoneState, link?: Link) {
    const { arena } = this;
    if (dest === arena.view && dest.world.parent === this.stage) return;
    const from = arena.view;
    const base = from.camera.base;
    const zoom = from.camera.zoom;
    if (!link) {
      // Nothing of the old view stays: free the map sprites of every zone that was drawn (they are built again if shown).
      for (const z of [from, ...this.shown.keys()]) if (z !== dest) z.world.release();
      for (const z of this.shown.keys()) z.setLookout(false);
      this.shown.clear();
      this.weatherFade = null;
      this.stage.removeChildren();
      arena.player.pivot.set(0, 0);
    }
    this.shown.delete(dest); // it is the player's own zone now, not one beside it
    dest.setLookout(false);
    this.stage.addChild(dest.world);
    arena.setView(dest);
    dest.camera.resize(arena.screen.width, arena.screen.height);
    if (link) {
      dest.camera.adopt(base.x - zoom * link.dx, base.y - zoom * link.dy);
      this.weatherFade = { from, t: 0 };
      if (dest.weatherLayer) dest.weatherLayer.view.alpha = 0;
    } else {
      dest.follow(arena.screen.width, arena.screen.height, arena.player.x, arena.player.y, 0, true);
    }
    dest.world.update(dest.camera.view(arena.screen.width, arena.screen.height));
    this.syncNeighbours();
    this.ui.shop.close();
  }

  /** The zones drawn beside the local player's (their mobs wander on, so the next zone is alive before you reach it). */
  lookouts(): ZoneState[] {
    return [...this.shown.keys()];
  }

  /** Lay the zones joined to the local player's by a gap beside it, and take away those no longer joined. */
  private syncNeighbours() {
    const { arena } = this;
    const want = new Map<ZoneState, Link>();
    for (const l of neighbourLinks(arena.view.data)) {
      const z = arena.zones.get(l.zone);
      if (z && !z.data.indoor && z !== arena.view) want.set(z, l);
    }
    for (const z of this.shown.keys()) {
      if (want.has(z)) continue;
      if (z.world.parent === this.stage) this.stage.removeChild(z.world);
      z.world.release();
      z.setLookout(false);
    }
    for (const z of want.keys()) {
      if (this.shown.has(z) && z.world.parent === this.stage) continue;
      this.stage.addChildAt(z.world, 0);
      z.setLookout(true, arena.role === 'client');
    }
    this.shown = want;
  }

  /**
   * Every frame, after the camera: keep the zones laid beside the local player's where they belong (the same scale and
   * the same place on screen as the player's own map, shifted by the gap between the two maps' coordinates), build
   * what is in view of them, ease the player's drawing up to them after a jump across a border, and let the weather
   * of the zone behind give way to the new one's.
   */
  update(dt: number) {
    const { arena } = this;
    const view = arena.view;
    this.syncNeighbours();
    const { world } = view;
    const rect = view.camera.view(arena.screen.width, arena.screen.height);
    const rectOf = (l: Link) => ({ x: rect.x + l.dx, y: rect.y + l.dy, w: rect.w, h: rect.h });
    for (const [z, l] of this.shown) {
      z.world.scale.set(world.scale.x, world.scale.y);
      z.world.position.set(world.x - world.scale.x * l.dx, world.y - world.scale.y * l.dy);
      z.world.update(rectOf(l));
    }
    const fade = this.weatherFade;
    if (fade) {
      fade.t += dt;
      const k = Math.min(1, fade.t / WEATHER_FADE);
      const link = this.shown.get(fade.from);
      const old = fade.from.weatherLayer;
      if (view.weatherLayer) view.weatherLayer.view.alpha = k;
      if (old && link && fade.from.weather && k < 1) {
        old.view.visible = true;
        old.view.alpha = 1 - k;
        old.update(dt, fade.from.weather, rectOf(link));
      }
      if (k >= 1 || !link) {
        if (view.weatherLayer) view.weatherLayer.view.alpha = 1;
        if (old) old.view.visible = false;
        this.weatherFade = null;
      }
    }
    const lag = arena.player.pivot;
    if (lag.x !== 0 || lag.y !== 0) {
      const k = Math.exp(-SLIP_RATE * dt);
      if (Math.hypot(lag.x, lag.y) < 0.5) lag.set(0, 0);
      else lag.set(lag.x * k, lag.y * k);
    }
  }

  // --- A co-op guest follows what the host says ---

  /** Guest: the host moved this player to `dest`; show it. Everyone else is placed again by the snapshot's list. */
  follow(dest: ZoneState) {
    const { arena } = this;
    // Already shut while the zone loaded: just open on it. Otherwise, through a gap in the border the view just carries
    // on; through any other door picture the zone being left and iris.
    const from = arena.zoneOf(arena.local);
    const link =
      from.data.indoor || dest.data.indoor ? undefined : neighbourLinks(from.data).find((l) => l.zone === dest.name);
    if (this.transition.holding) this.transition.hold(false);
    else if (!link) this.beginTrip(dest);
    arena.zoneOf(arena.local).world.layer.removeChild(arena.player);
    arena.zoneOf(arena.local).ambient?.forget(arena.player);
    dest.world.layer.addChild(arena.player);
    arena.local.zone = dest.name;
    arena.local.target = null; // appear where the host says, not gliding from the old zone
    this.show(dest, link);
    arena.syncHeroBodies();
  }

  /** Guest: put a friend in zone `where` (they are drawn there), or take them out of sight (`null`: in another zone). */
  place(remote: Player | undefined, where: ZoneState | null) {
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
    this.arena.syncHeroBodies();
  }

  /** The scene is ending: free the zones it holds (the scene manager destroys the ones on the stage). */
  dispose() {
    for (const z of this.arena.zones.values()) if (z.world.parent !== this.stage) z.dispose();
  }
}
