import type { Player } from '../../entities/Player';
import { CELL } from '../../map/types';
import { canNeedsWater, drink, fillCan, isThirsty, waterNear } from '../../systems/water';
import type { Arena } from './Arena';
import { WELL_REACH } from './constants';
import type { Simulation } from './Simulation';

/**
 * What the action key does beside water (host and solo; a guest's press is the host's, for that friend's own hero, so
 * the water bar they refill arrives in their next snapshot and nothing here goes on the wire). A well always answers,
 * like a chest. Open water (a pond, a lake) is drunk from only while the hero is thirsty, so a swing beside a pond is
 * still a swing.
 */
export class Drinking {
  constructor(
    private arena: Arena,
    private sim: Pick<Simulation, 'text'>,
  ) {}

  private wellNear(p: Player) {
    return this.arena.wells.some((w) => Math.hypot(p.body.x - w.x, p.body.y - (w.y - CELL / 2)) < WELL_REACH);
  }

  /**
   * The label of the button to show beside water the hero can use, or null: "Drink" when thirsty (at a well or clear open
   * water), "Fill can" when only the can is short, both when both are.
   */
  prompt(p: Player): string | null {
    const [thirsty, fill] = [isThirsty(p.hero), canNeedsWater(p.hero)];
    if (!thirsty && !fill) return null;
    if (!this.wellNear(p) && !waterNear(this.arena.zone.data, p.body.x, p.body.y - 2)) return null;
    return thirsty ? (fill ? 'Drink & fill can' : 'Drink') : 'Fill can';
  }

  /** A well within reach: drink and fill the can (or say there is no need). Returns true when a well took the press. */
  well(p: Player): boolean {
    if (!this.wellNear(p)) return false;
    this.take(p, true);
    return true;
  }

  /** Clear open water within reach and something to fill (a thirsty hero or a can that is not full): take it. Returns true when it did, so the hero does not swing. */
  water(p: Player): boolean {
    if (!(isThirsty(p.hero) || canNeedsWater(p.hero)) || !waterNear(this.arena.zone.data, p.body.x, p.body.y - 2))
      return false;
    this.take(p, false);
    return true;
  }

  /** Drink what is needed and fill the can, in one press. At a well something is always said. */
  private take(p: Player, well: boolean) {
    const filled = fillCan(p.hero);
    const drank = drink(p.hero);
    const parts = [drank.ok ? drank.text : '', filled.ok ? filled.text : ''].filter(Boolean);
    if (parts.length) this.sim.text(p.body.x, p.body.y - 62, parts.join(', '), 0x7ec8ff);
    else if (well) this.sim.text(p.body.x, p.body.y - 62, drank.text, 0xcfd8e0);
  }
}
