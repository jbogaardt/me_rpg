import { Container } from 'pixi.js';
import type { Sprites, Zone } from '../../assets';
import type { Player } from '../../entities/Player';
import type { Fade } from '../../hud/Fade';
import type { ShopCounter } from '../../hud/ShopCounter';
import type { MobWorld } from '../../entities/Mob';
import { arrivalFacing, cellFeet, doorAt, doorsNear } from '../../map/doors';
import { CELL, type CellPoint } from '../../map/types';
import { ZoneState } from '../ZoneState';
import type { Arena } from './Arena';

const PREFETCH_REACH = 5 * CELL; // a door this close starts loading the zone behind it
const PREFETCH_EVERY = 0.5; // seconds between looking for doors to prefetch
const ARRIVE_INVULN = 1.2; // seconds of blinking immunity on arriving in a zone, so nothing waiting at the door ambushes you

/** Loads a zone by name (assets.ts `loadZone`). The scene asks for the zones behind doors before the player gets there. */
export type ZoneLoader = (name: string) => Promise<Zone>;

/**
 * The zones of the world: loading them (the ones behind doors are fetched before the player gets there), taking players
 * through doors, and showing the local player's zone on the stage. The map data and what lives in a zone is `ZoneState`;
 * who is where is the `Arena`'s.
 */
export class Zones {
  /** Holds the local player's zone, which is the only one drawn. */
  readonly stage = new Container();
  /** Set by the scene: the rules a zone's mobs call back into (it is the simulation's). */
  makeMobWorld!: (z: ZoneState) => MobWorld;
  private loading = new Map<string, Promise<void>>(); // zones being loaded, so each is asked for once
  private prefetchTimer = 0;

  constructor(
    private arena: Arena,
    private sprites: Sprites,
    private loadZone: ZoneLoader,
    private ui: { shop: ShopCounter; fade: Fade },
  ) {}

  /** Build the running state of a loaded zone and keep it. */
  add(zone: Zone): ZoneState {
    const z = new ZoneState(zone, this.sprites);
    z.mobWorld = this.makeMobWorld(z);
    this.arena.zones.set(zone.name, z);
    return z;
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

  /** Move a player through a door into `dest`, which is loaded. The local player's view follows them. */
  travel(p: Player, dest: ZoneState, to: CellPoint) {
    const { arena } = this;
    const from = arena.zoneOf(p);
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
    arena.syncHeroBodies();
    if (p === arena.local) this.show(dest);
  }

  /** Draw `dest` as the world the local player is in: swap it onto the stage and cut through black. */
  show(dest: ZoneState) {
    const { arena } = this;
    if (dest === arena.view && dest.world.parent === this.stage) return;
    this.stage.removeChildren();
    this.stage.addChild(dest.world);
    arena.setView(dest);
    dest.camera.resize(arena.screen.width, arena.screen.height);
    dest.camera.follow(arena.screen.width, arena.screen.height, arena.player.x, arena.player.y);
    this.ui.shop.close();
    this.ui.fade.flash();
  }

  // --- A co-op guest follows what the host says ---

  /** Guest: the host moved this player to `dest`; show it. Everyone else is placed again by the snapshot's list. */
  follow(dest: ZoneState) {
    const { arena } = this;
    arena.zoneOf(arena.local).world.layer.removeChild(arena.player);
    arena.zoneOf(arena.local).ambient?.forget(arena.player);
    dest.world.layer.addChild(arena.player);
    arena.local.zone = dest.name;
    arena.local.target = null; // appear where the host says, not gliding from the old zone
    this.show(dest);
    this.ui.fade.hold(false);
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
