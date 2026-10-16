import type { Player } from '../../entities/Player';
import { enabled } from '../../systems/capabilities';
import { dropSpot, heldSpot, nearestBarrel } from '../../systems/barrels';
import { recordHaul } from '../../systems/quests';
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
    private sim: Pick<Simulation, 'text' | 'onSetDown' | 'questNote'>,
  ) {}

  /** The action key while `p` carries a barrel (in the zone being worked in): set it down in front of them. True if they carry one. */
  setDown(p: Player): boolean {
    const { arena } = this;
    const held = arena.barrels.find((b) => b.carrier === p.slot);
    if (!held) return false;
    const spot = dropSpot(arena.collision, p.body.x, p.body.y, p.body.facing, arena.bodies());
    if (spot) {
      held.setDown(spot.x, spot.y);
      const zone = arena.zone.name;
      const index = arena.barrels.indexOf(held);
      this.sim.onSetDown(p, zone, index, spot.x, spot.y);
      this.sim.questNote(p, recordHaul(p.hero, zone, arena.data.places, index, spot.x, spot.y)); // a quest of barrels counts it
    } else this.sim.text(p.body.x, p.body.y - 40, 'No room here', 0xff8a7a);
    return true;
  }

  /** The action key beside a loose barrel: pick it up, unless a foe is near (then the key swings). True if one was picked up. */
  pickUp(p: Player): boolean {
    const { arena } = this;
    if (!enabled('carrying', arena.zone.name) || foeNear(arena.zone, p)) return false;
    const loose = nearestBarrel(
      arena.barrels.filter((b) => !b.carried),
      p.body.x,
      p.body.y,
    );
    if (!loose) return false;
    loose.carrier = p.slot;
    const spot = heldSpot(p.body.x, p.body.y, p.body.facing);
    loose.hold(spot.x, spot.y, p.body.facing);
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
        if (who) {
          const spot = heldSpot(who.body.x, who.body.y, who.body.facing);
          b.hold(spot.x, spot.y, who.body.facing);
        } else b.setDown(b.x, b.y); // they left the zone (or the game): it stays where it was
      }
    }
  }
}
