import { CELL } from '../../map/types';
import type { Arena } from './Arena';
import type { Simulation } from './Simulation';
import type { Zones } from './Zones';

/** Seconds a fallen player can be raised before the moment has passed. */
export const REVIVE_WINDOW = 90;

export interface Fallen {
  slot: number;
  name: string;
  /** Where they fell. */
  zone: string;
  x: number;
  y: number;
  left: number;
  /** The DM has been offered the choice. */
  offered: boolean;
}

/**
 * The Dungeon Master can raise a fallen player. A defeat still wakes the player at the start of the world, whole (the
 * game's rule, solo or online); for a little while the DM may instead raise them where they fell, or bring them to where
 * the DM stands: they are moved there through the usual door travel, so a friend's page follows by itself. Host only.
 */
export class DmRevive {
  readonly fallen: Fallen[] = [];

  constructor(
    private arena: Arena,
    private sim: Simulation,
    private zones: Zones,
  ) {
    const before = sim.onDefeat;
    sim.onDefeat = (p, zone, x, y) => {
      before(p, zone, x, y);
      if (this.arena.role !== 'host') return;
      this.fallen.splice(0, this.fallen.length, ...this.fallen.filter((f) => f.slot !== p.slot));
      this.fallen.push({ slot: p.slot, name: p.hero.name, zone, x, y, left: REVIVE_WINDOW, offered: false });
    };
  }

  /** The first fallen player the DM has not been asked about. */
  get unoffered(): Fallen | undefined {
    return this.fallen.find((f) => !f.offered);
  }

  update(dt: number) {
    for (const f of this.fallen) f.left -= dt;
    for (let i = this.fallen.length - 1; i >= 0; i--) if (this.fallen[i]!.left <= 0) this.fallen.splice(i, 1);
  }

  /** Raise `slot` where they fell (or, if that land is no longer loaded, where the DM stands). False if the moment passed. */
  raiseWhere(slot: number): boolean {
    const f = this.take(slot);
    const dest = f && this.arena.zones.get(f.zone);
    return f && dest ? this.move(slot, dest, f.x, f.y) : f ? this.bringHere(slot, f) : false;
  }

  /** Bring `slot` to where the DM stands. */
  bringHere(slot: number, taken = this.take(slot)): boolean {
    if (!taken) return false;
    const dm = this.arena.local;
    return this.move(slot, this.arena.view, dm.body.x, dm.body.y);
  }

  /** The DM lets them wake at the start, as the game would have it. */
  leave(slot: number) {
    this.take(slot);
  }

  private take(slot: number): Fallen | undefined {
    const i = this.fallen.findIndex((f) => f.slot === slot);
    return i < 0 ? undefined : this.fallen.splice(i, 1)[0];
  }

  private move(slot: number, dest: Arena['view'], x: number, y: number): boolean {
    // Anywhere in the world: a fallen player wakes at the start, which is not the zone the DM is in (`party()` is only the zone's).
    const p = this.arena.everyone().find((q) => q.slot === slot && !q.dm);
    if (!p) return false;
    this.zones.travel(p, dest, { col: Math.floor(x / CELL), row: Math.floor(y / CELL) });
    this.arena.inZone(dest, () => {
      this.sim.fx('heal', p.body.x, p.body.y - 14);
      this.sim.text(p.body.x, p.body.y - 54, 'Raised!', 0x9fe8ff);
    });
    return true;
  }

  reset() {
    this.fallen.length = 0;
  }
}
