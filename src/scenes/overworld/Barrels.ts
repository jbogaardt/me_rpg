import type { Player } from '../../entities/Player';
import { dropSpot, nearestBarrel } from '../../systems/barrels';
import type { Arena } from './Arena';
import { foeNear, type Simulation } from './Simulation';

/**
 * Barrels you can carry (systems/barrels.ts; solo and host decide, a guest's action press reaches `act` like a chest's
 * and the barrels ride in the snapshot). The action key picks up the nearest loose barrel within reach (not in a fight:
 * there it swings) and, while carrying one, sets it down in front of the player, where it blocks players and foes.
 */
export class Barrels {
  constructor(
    private arena: Arena,
    private sim: Pick<Simulation, 'text'>,
  ) {}

  /** The action key while `p` carries a barrel (in the zone being worked in): set it down in front of them. True if they carry one. */
  setDown(p: Player): boolean {
    const { arena } = this;
    const held = arena.barrels.find((b) => b.carrier === p.slot);
    if (!held) return false;
    const spot = dropSpot(arena.collision, p.body.x, p.body.y, p.body.facing, arena.bodies());
    if (spot) held.setDown(spot.x, spot.y);
    else this.sim.text(p.body.x, p.body.y - 40, 'No room here', 0xff8a7a);
    return true;
  }

  /** The action key beside a loose barrel: pick it up, unless a foe is near (then the key swings). True if one was picked up. */
  pickUp(p: Player): boolean {
    const { arena } = this;
    if (foeNear(arena.zone, p)) return false;
    const loose = nearestBarrel(
      arena.barrels.filter((b) => !b.carried),
      p.body.x,
      p.body.y,
    );
    if (!loose) return false;
    loose.carrier = p.slot;
    loose.carryAt(p.body.x, p.body.y);
    return true;
  }

  /** Every tick, in every zone: a carried barrel rides with its carrier, and is set down if its carrier is gone. */
  update() {
    const { arena } = this;
    const everyone = arena.everyone();
    for (const z of arena.zones.values()) {
      for (const b of z.barrels) {
        if (b.carrier === null) continue;
        const who = everyone.find((p) => p.slot === b.carrier && p.zone === z.name);
        if (who) b.carryAt(who.body.x, who.body.y);
        else b.setDown(b.x, b.y); // they left the zone (or the game): it stays where it was
      }
    }
  }
}
