import { Container, type Renderer } from 'pixi.js';
import type { Sprites, Zone } from '../../assets';
import type { Player } from '../../entities/Player';
import { ZoneTransition } from '../../entities/ZoneTransition';
import type { ShopCounter } from '../../hud/ShopCounter';
import type { MobWorld } from '../../entities/Mob';
import { arrivalFacing, cellFeet, doorAt, doorsNear } from '../../map/doors';
import { CELL, type CellPoint } from '../../map/types';
import { pickTransition } from '../../map/transition';
import { GroundItem } from '../../entities/GroundItem';
import { ZoneState } from '../ZoneState';
import { TRAINER_ROOM } from '../../systems/skills';
import type { Arena } from './Arena';

const PREFETCH_REACH = 14 * CELL; // a door this close starts loading the zone behind it (the camera stops at a gap's border, so the player walks the last stretch to the screen's edge)
const PREFETCH_EVERY = 0.5; // seconds between looking for doors to prefetch
const RETIRE_EVERY = 2; // seconds between looking for zones to unload
const RETIRE_AFTER = 20; // seconds a zone must have been out of everyone's way before it is unloaded
const RETIRE_REACH = 12 * CELL; // a door to a zone this close to a player keeps that zone loaded
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
  /** Holds the local player's zone, which is the only one drawn. */
  readonly stage = new Container();
  /** The iris or slide when the local player goes through a door. */
  readonly transition: ZoneTransition;
  /** Set by the scene: the rules a zone's mobs call back into (it is the simulation's). */
  makeMobWorld!: (z: ZoneState) => MobWorld;
  private loading = new Map<string, Promise<void>>(); // zones being loaded, so each is asked for once
  private prefetchTimer = 0;
  private retireTimer = RETIRE_EVERY;
  private unused = new Map<string, number>(); // seconds each loaded zone has been out of everyone's way

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
    }
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
      for (const door of doorsNear(arena.zoneOf(p).data, p.body.x, p.body.y, PREFETCH_REACH)) {
        void this.ensure(door.to.zone);
      }
    }
  }

  /** Take a player through a door they are standing on, if there is one (and its zone is loaded). */
  checkDoors(p: Player) {
    const door = doorAt(this.arena.zoneOf(p).data, p.body.x, p.body.y);
    if (!door) return;
    const dest = this.arena.zones.get(door.to.zone);
    if (dest) this.travel(p, dest, door.to);
    else void this.ensure(door.to.zone); // not loaded yet: the player waits in the doorway and the next frame tries again
  }

  /**
   * Move a player through a door into `dest`, which is loaded. The local player's view follows them, through an iris or a
   * slide (`door` false: not through a door, e.g. waking after a defeat, which always irises).
   */
  travel(p: Player, dest: ZoneState, to: CellPoint, door = true) {
    const { arena } = this;
    const from = arena.zoneOf(p);
    if (p === arena.local) this.beginTrip(from, dest, door);
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
    p.grace = Math.max(p.grace, ARRIVE_GRACE);
    arena.syncHeroBodies();
    if (p === arena.local) this.show(dest);
  }

  /**
   * The local player is about to leave `from` for `dest`: picture the view they are leaving and start the transition
   * (map/transition.ts picks an iris for rooms, a slide for walking off a map edge into more open air).
   */
  private beginTrip(from: ZoneState, dest: ZoneState, door = true) {
    const { arena } = this;
    // The door being taken (a guest's view of its own body may lag the host's by a step, so look a little around).
    const { x, y } = arena.player;
    const through = doorsNear(from.data, x, y - 1, CELL).find((d) => d.to.zone === dest.name && d.dir)?.dir;
    const pick = pickTransition(from.data, dest.data, x, y, through);
    const kind = door ? pick.kind : 'iris';
    this.transition.begin(
      kind,
      pick.dir,
      this.stage,
      arena.screen,
      this.heroOnScreen(),
      kind === 'slide' ? [arena.player] : [],
    );
  }

  /** Where the local player is on screen (CSS px): the middle of their body, which the door iris closes and opens on. */
  heroOnScreen(): { x: number; y: number } {
    const { arena } = this;
    const { world, camera } = arena.view;
    return { x: world.x + arena.player.x * camera.zoom, y: world.y + (arena.player.y - 20) * camera.zoom };
  }

  /** Guest: the host moved this player to a zone that is not loaded yet: close on the one they are leaving and stay shut. */
  holdForLoad() {
    if (!this.transition.busy) this.transition.begin('iris', 'down', null, this.arena.screen, this.heroOnScreen());
    this.transition.hold(true);
  }

  /** Draw `dest` as the world the local player is in: swap it onto the stage (the transition covers the cut). */
  show(dest: ZoneState) {
    const { arena } = this;
    if (dest === arena.view && dest.world.parent === this.stage) return;
    // The zone left behind is no longer drawn: free its map's sprites (they are built again around the view if it is).
    if (arena.view !== dest) arena.view.world.release();
    this.stage.removeChildren();
    this.stage.addChild(dest.world);
    arena.setView(dest);
    dest.camera.resize(arena.screen.width, arena.screen.height);
    dest.follow(arena.screen.width, arena.screen.height, arena.player.x, arena.player.y);
    dest.world.update(dest.camera.view(arena.screen.width, arena.screen.height));
    this.ui.shop.close();
  }

  // --- A co-op guest follows what the host says ---

  /** Guest: the host moved this player to `dest`; show it. Everyone else is placed again by the snapshot's list. */
  follow(dest: ZoneState) {
    const { arena } = this;
    // Already shut while the zone loaded: just open on it. Otherwise picture the zone being left and go.
    if (this.transition.holding) this.transition.hold(false);
    else this.beginTrip(arena.zoneOf(arena.local), dest);
    arena.zoneOf(arena.local).world.layer.removeChild(arena.player);
    arena.zoneOf(arena.local).ambient?.forget(arena.player);
    dest.world.layer.addChild(arena.player);
    arena.local.zone = dest.name;
    arena.local.target = null; // appear where the host says, not gliding from the old zone
    this.show(dest);
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

  /** The scene is ending: free the zones it holds (the scene manager destroys the one on the stage). */
  dispose() {
    for (const z of this.arena.zones.values()) if (z.world.parent !== this.stage) z.dispose();
  }
}
