import type { Player } from '../../entities/Player';
import { CELL } from '../../map/types';
import { drink, isThirsty, waterNear } from '../../systems/water';
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

  /** A well within reach: drink (or say there is no need). Returns true when a well took the press. */
  well(p: Player): boolean {
    const well = this.arena.wells.find((w) => Math.hypot(p.body.x - w.x, p.body.y - (w.y - CELL / 2)) < WELL_REACH);
    if (!well) return false;
    this.say(p, drink(p.hero));
    return true;
  }

  /** Clear open water within reach and a thirsty hero: drink. Returns true when it did, so the hero does not swing. */
  water(p: Player): boolean {
    if (!isThirsty(p.hero) || !waterNear(this.arena.zone.data, p.body.x, p.body.y - 2)) return false;
    this.say(p, drink(p.hero));
    return true;
  }

  private say(p: Player, result: ReturnType<typeof drink>) {
    this.sim.text(p.body.x, p.body.y - 62, result.text, result.ok ? 0x7ec8ff : 0xcfd8e0);
  }
}
