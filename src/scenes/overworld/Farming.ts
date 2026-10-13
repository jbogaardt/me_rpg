import type { Player } from '../../entities/Player';
import { CELL } from '../../map/types';
import { harvest, isRipe, needsWater, plant, rain as waterFromRain, seedInPack, water } from '../../systems/crops';
import { hasCan } from '../../systems/water';
import type { Arena } from './Arena';
import { PLOT_REACH } from './constants';
import type { Simulation } from './Simulation';

/**
 * Plots of crops (systems/crops.ts has the rules, entities/Plot.ts draws one). Host and solo: `update` keeps every plot of
 * the zone being worked in showing what it holds now, and `tend` is what the action key does beside one: pick a ripe
 * plant or plant a seed in bare soil. A guest does neither: the host's snapshot lists every plot (`SnapMsg.plots`) and
 * the guest's action press is the host's `tend` for that friend's own hero, so the harvest lands in their pack.
 */
export class Farming {
  constructor(
    private arena: Arena,
    private sim: Pick<Simulation, 'text' | 'fx'>,
  ) {}

  /** Tend the plots of the zone being worked in: rain waters them, and each one catches up on the time it was wet. */
  update() {
    const { clock, zone } = this.arena;
    const rain =
      zone.weather !== null &&
      (zone.weather.precip === 'rain' || zone.weather.precip === 'storm') &&
      zone.weather.intensity > 0.3;
    for (const plot of this.arena.plots) {
      if (rain) waterFromRain(plot.state, clock);
      plot.tend(clock);
    }
  }

  /**
   * The action key beside a plot (host and solo): pick a ripe plant, plant a seed in bare soil, or water a dry plant from the
   * can. Returns true when it did something, so the hero does not swing.
   */
  tend(p: Player): boolean {
    const { clock } = this.arena;
    const plot = this.arena.plots.find(
      (c) =>
        Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < PLOT_REACH &&
        (isRipe(c.state) || (!c.state.crop && seedInPack(p.hero)) || (needsWater(c.state, clock) && hasCan(p.hero))),
    );
    if (!plot) return false;
    const [x, y] = [plot.x, plot.y - CELL];
    const picking = isRipe(plot.state);
    const done = !plot.state.crop
      ? plant(p.hero, plot.state, clock)
      : picking
        ? harvest(p.hero, plot.state, clock)
        : water(p.hero, plot.state, clock);
    plot.tend(clock);
    if (!done.text) return true;
    if (picking && done.ok) this.sim.fx('levelUp', x, y + 10); // a little sparkle for the harvest
    this.sim.text(x, y - 6, done.text, done.ok ? (picking || !plot.state.crop ? 0xa8e05a : 0x7ec8ff) : 0xff8a7a);
    return true;
  }
}
